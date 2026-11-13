/**
 * Testes da lógica de cobrança (sem chamar o Mercado Pago).
 * Rodar: npm run test:billing   (precisa de DATABASE_URL apontando para um banco de TESTE)
 */
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import {
  addMonths,
  applyOneTimePayment,
  ensureSaasSubscription,
  applyRecurringPayment,
  computePlatformState,
  consumerSubscriptionIsUsable,
  nextPeriodState,
  parseExternalReference,
} from "../app/_lib/billing";
import { verifyMercadoPagoSignature } from "../app/_lib/payments/mercadopago";
import { db } from "../app/_lib/prisma";

const DAY = 86_400_000;

test("assinatura do webhook: aceita válida e recusa adulterada", () => {
  const secret = "segredo-de-teste";
  const manifest = "id:123456;request-id:req-1;ts:1700000000;";
  const v1 = createHmac("sha256", secret).update(manifest).digest("hex");
  assert.equal(
    verifyMercadoPagoSignature({
      secret,
      signatureHeader: `ts=1700000000,v1=${v1}`,
      requestId: "req-1",
      dataId: "123456",
    }),
    true,
  );
  assert.equal(
    verifyMercadoPagoSignature({
      secret,
      signatureHeader: `ts=1700000000,v1=${v1}`,
      requestId: "req-1",
      dataId: "999",
    }),
    false,
  );
  assert.equal(
    verifyMercadoPagoSignature({
      secret: "outro",
      signatureHeader: `ts=1700000000,v1=${v1}`,
      requestId: "req-1",
      dataId: "123456",
    }),
    false,
  );
  assert.equal(
    verifyMercadoPagoSignature({
      secret,
      signatureHeader: null,
      requestId: "req-1",
      dataId: "123456",
    }),
    false,
  );
});

test("referência externa só aceita formatos conhecidos", () => {
  assert.deepEqual(
    parseExternalReference("plan:0b5e8c1e-1111-4a4a-9b9b-123456789abc"),
    { kind: "plan", id: "0b5e8c1e-1111-4a4a-9b9b-123456789abc" },
  );
  assert.equal(parseExternalReference("plan:'; DROP TABLE"), null);
  assert.equal(parseExternalReference(null), null);
});

test("estado da plataforma: teste, em dia, tolerância e suspensa", () => {
  const now = new Date();
  assert.equal(
    computePlatformState(
      { status: "PENDING", currentPeriodEnd: new Date(now.getTime() + DAY) },
      now,
    ),
    "trial",
  );
  assert.equal(
    computePlatformState(
      { status: "ACTIVE", currentPeriodEnd: new Date(now.getTime() + DAY) },
      now,
    ),
    "active",
  );
  assert.equal(
    computePlatformState(
      {
        status: "PAST_DUE",
        currentPeriodEnd: new Date(now.getTime() - 2 * DAY),
      },
      now,
    ),
    "grace",
  );
  assert.equal(
    computePlatformState(
      {
        status: "PAST_DUE",
        currentPeriodEnd: new Date(now.getTime() - 30 * DAY),
      },
      now,
    ),
    "suspended",
  );
  assert.equal(
    computePlatformState(
      { status: "SUSPENDED", currentPeriodEnd: new Date(now.getTime() + DAY) },
      now,
    ),
    "suspended",
  );
  assert.equal(
    computePlatformState(
      { status: "CANCELLED", currentPeriodEnd: new Date(now.getTime() - DAY) },
      now,
    ),
    "suspended",
  );
});

test("plano do cliente: cancelado vale até o fim do período pago", () => {
  const now = new Date();
  assert.equal(
    consumerSubscriptionIsUsable(
      { status: "CANCELLED", currentPeriodEnd: new Date(now.getTime() + DAY) },
      now,
    ),
    true,
  );
  assert.equal(
    consumerSubscriptionIsUsable(
      { status: "CANCELLED", currentPeriodEnd: new Date(now.getTime() - 1000) },
      now,
    ),
    false,
  );
  assert.equal(
    consumerSubscriptionIsUsable(
      { status: "PENDING", currentPeriodEnd: new Date(now.getTime() + DAY) },
      now,
    ),
    false,
  );
});

test("sincronização: usa a próxima cobrança do gateway", () => {
  const now = new Date();
  const next = new Date(now.getTime() + 30 * DAY);
  const base = {
    status: "PENDING" as const,
    currentPeriodStart: null,
    currentPeriodEnd: null,
  };
  const active = nextPeriodState(
    base,
    {
      id: "x",
      status: "active",
      externalReference: null,
      nextPaymentDate: next,
      amount: 10,
    },
    now,
  );
  assert.equal(active.status, "ACTIVE");
  assert.equal(active.currentPeriodEnd?.getTime(), next.getTime());

  // Cartão cadastrado durante o teste grátis: continua em teste até a 1ª cobrança.
  const trial = {
    status: "PENDING" as const,
    currentPeriodStart: now,
    currentPeriodEnd: new Date(now.getTime() + 10 * DAY),
  };
  const trialNext = nextPeriodState(
    trial,
    {
      id: "x",
      status: "active",
      externalReference: null,
      nextPaymentDate: new Date(now.getTime() + 10 * DAY),
      amount: 10,
    },
    now,
  );
  assert.equal(trialNext.status, "PENDING");

  const cancelled = nextPeriodState(
    { ...base, status: "ACTIVE", currentPeriodEnd: next },
    {
      id: "x",
      status: "cancelled",
      externalReference: null,
      nextPaymentDate: null,
      amount: 10,
    },
    now,
  );
  assert.equal(cancelled.status, "CANCELLED");
  assert.equal(cancelled.currentPeriodEnd?.getTime(), next.getTime());
});

test("pagamento recorrente é idempotente (mesmo id não estende duas vezes)", async () => {
  const stamp = Date.now();
  const user = await db.user.create({
    data: { name: "Teste Billing", email: `billing${stamp}@teste.com` },
  });
  const shop = await db.barbershop.create({
    data: {
      name: `Billing ${stamp}`,
      address: "Rua X",
      phones: [],
      description: "",
      imageUrl: "",
    },
  });
  const plan = await db.consumerPlan.create({
    data: { barbershopId: shop.id, name: "Plano", price: 50 },
  });
  const sub = await db.consumerSubscription.create({
    data: {
      userId: user.id,
      barbershopId: shop.id,
      planId: plan.id,
      status: "PENDING",
      amount: 50,
    },
  });
  try {
    const paidAt = new Date();
    const payment = {
      id: `pay-${stamp}`,
      status: "approved" as const,
      amount: 50,
      externalReference: `plan:${sub.id}`,
      method: "credit_card",
      paidAt,
      recurringId: null,
    };
    await applyRecurringPayment({ kind: "plan", id: sub.id }, payment);
    const first = await db.consumerSubscription.findUniqueOrThrow({
      where: { id: sub.id },
    });
    assert.equal(first.status, "ACTIVE");
    assert.equal(
      first.currentPeriodEnd?.getTime(),
      addMonths(paidAt, 1).getTime(),
    );

    await applyRecurringPayment({ kind: "plan", id: sub.id }, payment); // webhook repetido
    const second = await db.consumerSubscription.findUniqueOrThrow({
      where: { id: sub.id },
    });
    assert.equal(
      second.currentPeriodEnd?.getTime(),
      first.currentPeriodEnd?.getTime(),
    );
    assert.equal(
      await db.billingPayment.count({
        where: { consumerSubscriptionId: sub.id },
      }),
      1,
    );

    // Pagamento avulso: confirmação repetida também não duplica.
    const local = await db.billingPayment.create({
      data: {
        purpose: "SERVICE",
        amount: 30,
        barbershopId: shop.id,
        userId: user.id,
      },
    });
    const oneTime = {
      ...payment,
      id: `pix-${stamp}`,
      amount: 30,
      method: "pix",
      externalReference: `pay:${local.id}`,
    };
    await applyOneTimePayment(local.id, oneTime);
    await applyOneTimePayment(local.id, oneTime);
    const confirmed = await db.billingPayment.findUniqueOrThrow({
      where: { id: local.id },
    });
    assert.equal(confirmed.status, "CONFIRMED");
    assert.equal(confirmed.method, "pix");

    // Mensalidade da plataforma paga com valor menor não libera a conta.
    const saas = await ensureSaasSubscription(shop.id);
    await applyRecurringPayment(
      { kind: "saas", id: saas.id },
      {
        ...payment,
        id: `fraude-${stamp}`,
        amount: 1,
        externalReference: `saas:${saas.id}`,
      },
    );
    const after = await db.saasSubscription.findUniqueOrThrow({
      where: { id: saas.id },
    });
    assert.equal(after.status, "PENDING");
    assert.equal(
      after.currentPeriodEnd?.getTime(),
      saas.currentPeriodEnd?.getTime(),
    );
  } finally {
    await db.barbershop.delete({ where: { id: shop.id } });
    await db.user.delete({ where: { id: user.id } });
    await db.$disconnect();
  }
});
