import "server-only";
import type {
  ConsumerSubscription,
  PaymentStatus,
  Prisma,
  SaasSubscription,
  SubscriptionStatus,
} from "@prisma/client";
import { SAAS } from "@/app/_lib/config";
import { db } from "@/app/_lib/prisma";
import type { PaymentInfo, RecurringInfo } from "@/app/_lib/payments/types";

type Tx = Prisma.TransactionClient | typeof db;
const DAY = 24 * 60 * 60 * 1000;
/** Dias de tolerância para o cliente final quando a renovação do plano atrasa. */
export const CONSUMER_GRACE_DAYS = 2;

export function addMonths(date: Date, months: number) {
  const result = new Date(date);
  const day = result.getDate();
  result.setMonth(result.getMonth() + months);
  if (result.getDate() < day) result.setDate(0);
  return result;
}

const later = (a: Date | null | undefined, b: Date) => (a && a > b ? a : b);

/* ------------------------------------------------------------------ */
/* Mensalidade da plataforma (SaaS)                                    */
/* ------------------------------------------------------------------ */

export type PlatformState = "trial" | "active" | "grace" | "suspended";

export function computePlatformState(
  sub: Pick<SaasSubscription, "status" | "currentPeriodEnd">,
  now = new Date(),
): PlatformState {
  const end = sub.currentPeriodEnd;
  if (sub.status === "SUSPENDED" || !end) return "suspended";
  if (end >= now) return sub.status === "PENDING" ? "trial" : "active";
  if (
    sub.status !== "CANCELLED" &&
    now.getTime() <= end.getTime() + SAAS.graceDays * DAY
  )
    return "grace";
  return "suspended";
}

async function saasPlanId(tx: Tx) {
  const plan = await tx.saasPlan.upsert({
    where: { name: SAAS.planName },
    create: {
      name: SAAS.planName,
      price: SAAS.price,
      cycle: "MONTHLY",
      features: { all: true },
    },
    update: {},
    select: { id: true },
  });
  return plan.id;
}

/** Cria o período de teste grátis da barbearia, se ainda não existir. */
export async function ensureSaasSubscription(
  barbershopId: string,
  tx: Tx = db,
) {
  const existing = await tx.saasSubscription.findUnique({
    where: { barbershopId },
  });
  if (existing) return existing;
  const now = new Date();
  return tx.saasSubscription.create({
    data: {
      barbershopId,
      planId: await saasPlanId(tx),
      status: "PENDING",
      amount: SAAS.price,
      cycle: "MONTHLY",
      currentPeriodStart: now,
      currentPeriodEnd: new Date(now.getTime() + SAAS.trialDays * DAY),
    },
  });
}

export async function getPlatformAccess(barbershopId: string) {
  const subscription = await ensureSaasSubscription(barbershopId);
  const state = computePlatformState(subscription);
  const graceEndsAt = subscription.currentPeriodEnd
    ? new Date(subscription.currentPeriodEnd.getTime() + SAAS.graceDays * DAY)
    : null;
  return { state, subscription, graceEndsAt };
}

/** Barbearias visíveis ao público: com teste, mensalidade em dia ou dentro da tolerância. */
export async function publiclyAvailableBarbershopIds(ids?: string[]) {
  const subs = await db.saasSubscription.findMany({
    where: ids ? { barbershopId: { in: ids } } : undefined,
    select: { barbershopId: true, status: true, currentPeriodEnd: true },
  });
  const known = new Map(
    subs.map((sub) => [
      sub.barbershopId,
      computePlatformState(sub) !== "suspended",
    ]),
  );
  return (barbershopId: string) => known.get(barbershopId) ?? true; // sem registro = recém-criada (teste será criado no 1º acesso)
}

/* ------------------------------------------------------------------ */
/* Planos do cliente final                                             */
/* ------------------------------------------------------------------ */

export function consumerSubscriptionIsUsable(
  sub: Pick<ConsumerSubscription, "status" | "currentPeriodEnd">,
  now = new Date(),
) {
  if (!sub.currentPeriodEnd) return false;
  if (!["ACTIVE", "PAST_DUE", "CANCELLED"].includes(sub.status)) return false;
  if (sub.currentPeriodEnd >= now) return true;
  return (
    sub.status !== "CANCELLED" &&
    now.getTime() <= sub.currentPeriodEnd.getTime() + CONSUMER_GRACE_DAYS * DAY
  );
}

export async function findUsableConsumerSubscription(
  userId: string,
  barbershopId: string,
  tx: Tx = db,
) {
  const subs = await tx.consumerSubscription.findMany({
    where: {
      userId,
      barbershopId,
      status: { in: ["ACTIVE", "PAST_DUE", "CANCELLED"] },
    },
    include: {
      plan: { include: { services: { select: { serviceId: true } } } },
    },
    orderBy: { currentPeriodEnd: "desc" },
  });
  return subs.find((sub) => consumerSubscriptionIsUsable(sub)) ?? null;
}

/** Diz se um serviço está incluso no plano e quantos atendimentos ainda restam no ciclo. */
export async function planCoverage(
  tx: Tx,
  sub: NonNullable<Awaited<ReturnType<typeof findUsableConsumerSubscription>>>,
  serviceId: string,
) {
  const included = sub.plan.services.some(
    (service) => service.serviceId === serviceId,
  );
  if (!included) return { covered: false, remaining: null as number | null };
  if (sub.plan.bookingsPerCycle == null)
    return { covered: true, remaining: null };
  const used = await tx.booking.count({
    where: {
      consumerSubscriptionId: sub.id,
      coveredByPlan: true,
      status: { notIn: ["CANCELLED"] },
      ...(sub.currentPeriodStart
        ? { date: { gte: sub.currentPeriodStart } }
        : {}),
    },
  });
  const remaining = Math.max(0, sub.plan.bookingsPerCycle - used);
  return { covered: remaining > 0, remaining };
}

/** Assinatura registrada pela própria barbearia (cliente pagou no balcão). */
export async function activateManualConsumerSubscription(input: {
  barbershopId: string;
  userId: string;
  planId: string;
  months: number;
}) {
  return db.$transaction(async (tx) => {
    const plan = await tx.consumerPlan.findFirst({
      where: { id: input.planId, barbershopId: input.barbershopId },
    });
    if (!plan) throw new Error("Plano não encontrado.");
    const now = new Date();
    const current = await tx.consumerSubscription.findFirst({
      where: {
        userId: input.userId,
        barbershopId: input.barbershopId,
        planId: plan.id,
        gateway: "manual",
        status: { in: ["ACTIVE", "PAST_DUE"] },
      },
      orderBy: { currentPeriodEnd: "desc" },
    });
    const start =
      current && current.currentPeriodEnd && current.currentPeriodEnd > now
        ? current.currentPeriodEnd
        : now;
    const end = addMonths(start, input.months);
    const sub = current
      ? await tx.consumerSubscription.update({
          where: { id: current.id },
          data: { status: "ACTIVE", currentPeriodEnd: end },
        })
      : await tx.consumerSubscription.create({
          data: {
            userId: input.userId,
            barbershopId: input.barbershopId,
            planId: plan.id,
            status: "ACTIVE",
            amount: plan.price,
            gateway: "manual",
            currentPeriodStart: now,
            currentPeriodEnd: end,
          },
        });
    await tx.billingPayment.create({
      data: {
        purpose: "CONSUMER_PLAN",
        status: "CONFIRMED",
        amount: Number(plan.price) * input.months,
        method: "presencial",
        description: `${plan.name} · ${input.months} ${input.months === 1 ? "mês" : "meses"} (registro manual)`,
        gateway: "manual",
        consumerSubscriptionId: sub.id,
        barbershopId: input.barbershopId,
        userId: input.userId,
        paidAt: now,
      },
    });
    return sub;
  });
}

/* ------------------------------------------------------------------ */
/* Sincronização com o gateway (idempotente)                           */
/* ------------------------------------------------------------------ */

export type ExternalRef =
  | { kind: "saas"; id: string }
  | { kind: "plan"; id: string }
  | { kind: "pay"; id: string };

export function parseExternalReference(
  ref: string | null | undefined,
): ExternalRef | null {
  const match = ref?.match(/^(saas|plan|pay):([0-9a-f-]{36})$/i);
  return match
    ? ({ kind: match[1].toLowerCase(), id: match[2] } as ExternalRef)
    : null;
}

type PeriodState = {
  status: SubscriptionStatus;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
};

/**
 * Regra de sincronização, igual para mensalidade SaaS e plano do cliente:
 * - "active" com próxima cobrança no futuro => período pago até essa data;
 * - "active" com cobrança vencida => o gateway está tentando cobrar de novo (atrasado);
 * - "paused" => atrasado; "cancelled" => cancelado (o acesso vai até o fim do período pago).
 */
export function nextPeriodState(
  current: PeriodState,
  info: RecurringInfo,
  now = new Date(),
): PeriodState {
  const result = { ...current };
  if (info.status === "pending") return result;
  if (info.status === "cancelled") return { ...result, status: "CANCELLED" };
  if (info.status === "paused")
    return {
      ...result,
      status: result.status === "PENDING" ? "PENDING" : "PAST_DUE",
    };

  const next = info.nextPaymentDate;
  if (next && next > now) {
    const trialCovers =
      current.status === "PENDING" &&
      current.currentPeriodEnd &&
      current.currentPeriodEnd >= next;
    if (trialCovers) return result; // cartão cadastrado durante o teste grátis: 1ª cobrança no fim do teste
    result.status = "ACTIVE";
    if (!current.currentPeriodEnd || current.currentPeriodEnd < next) {
      result.currentPeriodEnd = next;
      if (current.status === "PENDING" || !current.currentPeriodStart)
        result.currentPeriodStart = now;
    }
    return result;
  }
  if (current.status === "PENDING" && !next) {
    return {
      status: "ACTIVE",
      currentPeriodStart: now,
      currentPeriodEnd: addMonths(now, 1),
    };
  }
  if (current.currentPeriodEnd && current.currentPeriodEnd < now)
    return { ...result, status: "PAST_DUE" };
  return current.status === "PENDING"
    ? result
    : { ...result, status: "ACTIVE" };
}

/** Atualiza a assinatura local a partir do estado da assinatura recorrente no gateway. */
export async function syncRecurring(ref: ExternalRef, info: RecurringInfo) {
  const now = new Date();
  if (ref.kind === "saas") {
    const sub = await db.saasSubscription.findUnique({ where: { id: ref.id } });
    if (!sub) return;
    const next = nextPeriodState(sub, info, now);
    await db.saasSubscription.update({
      where: { id: sub.id },
      data: {
        ...next,
        gatewaySubscriptionId: info.id,
        cancelAtPeriodEnd: info.status === "cancelled",
      },
    });
    return;
  }
  if (ref.kind === "plan") {
    const sub = await db.consumerSubscription.findUnique({
      where: { id: ref.id },
    });
    if (!sub) return;
    const next = nextPeriodState(sub, info, now);
    await db.consumerSubscription.update({
      where: { id: sub.id },
      data: {
        ...next,
        gatewaySubscriptionId: info.id,
        ...(next.status === "CANCELLED" && !sub.cancelledAt
          ? { cancelledAt: now }
          : {}),
      },
    });
  }
}

function toPaymentStatus(status: PaymentInfo["status"]): PaymentStatus {
  const map: Record<PaymentInfo["status"], PaymentStatus> = {
    approved: "CONFIRMED",
    rejected: "FAILED",
    refunded: "REFUNDED",
    cancelled: "CANCELLED",
    pending: "PENDING",
  };
  return map[status];
}

/** Registra a cobrança de um ciclo e estende o período pago. Idempotente pelo id do pagamento. */
export async function applyRecurringPayment(
  ref: ExternalRef,
  payment: PaymentInfo,
) {
  if (ref.kind === "pay") return applyOneTimePayment(ref.id, payment);
  const now = new Date();
  await db.$transaction(async (tx) => {
    const existing = await tx.billingPayment.findUnique({
      where: { gatewayPaymentId: payment.id },
    });
    const wasConfirmed = existing?.status === "CONFIRMED";
    const status = toPaymentStatus(payment.status);

    if (ref.kind === "saas") {
      const sub = await tx.saasSubscription.findUnique({
        where: { id: ref.id },
      });
      if (!sub) return;
      if (
        status === "CONFIRMED" &&
        payment.amount + 0.01 < Number(sub.amount)
      ) {
        console.error(
          "Mensalidade paga com valor menor que o devido",
          sub.id,
          payment.amount,
        );
        return;
      }
      const data = {
        purpose: "SAAS_SUBSCRIPTION" as const,
        status,
        amount: payment.amount,
        method: payment.method,
        gateway: "mercadopago",
        gatewayPaymentId: payment.id,
        saasSubscriptionId: sub.id,
        barbershopId: sub.barbershopId,
        description: "Mensalidade da plataforma",
        paidAt: payment.paidAt,
      };
      if (existing)
        await tx.billingPayment.update({ where: { id: existing.id }, data });
      else await tx.billingPayment.create({ data });
      if (status === "CONFIRMED" && !wasConfirmed) {
        const paidAt = payment.paidAt ?? now;
        await tx.saasSubscription.update({
          where: { id: sub.id },
          data: {
            status: "ACTIVE",
            currentPeriodStart: paidAt,
            currentPeriodEnd: later(
              sub.status === "PENDING" ? null : sub.currentPeriodEnd,
              addMonths(paidAt, 1),
            ),
            gateway: "mercadopago",
          },
        });
      } else if (
        status === "FAILED" &&
        sub.status === "ACTIVE" &&
        sub.currentPeriodEnd &&
        sub.currentPeriodEnd < now
      ) {
        await tx.saasSubscription.update({
          where: { id: sub.id },
          data: { status: "PAST_DUE" },
        });
      }
      return;
    }

    const sub = await tx.consumerSubscription.findUnique({
      where: { id: ref.id },
      include: { plan: { select: { name: true } } },
    });
    if (!sub) return;
    const data = {
      purpose: "CONSUMER_PLAN" as const,
      status,
      amount: payment.amount,
      method: payment.method,
      gateway: "mercadopago",
      gatewayPaymentId: payment.id,
      consumerSubscriptionId: sub.id,
      barbershopId: sub.barbershopId,
      userId: sub.userId,
      description: `Plano ${sub.plan.name}`,
      paidAt: payment.paidAt,
    };
    if (existing)
      await tx.billingPayment.update({ where: { id: existing.id }, data });
    else await tx.billingPayment.create({ data });
    if (status === "CONFIRMED" && !wasConfirmed) {
      const paidAt = payment.paidAt ?? now;
      await tx.consumerSubscription.update({
        where: { id: sub.id },
        data: {
          status: sub.status === "CANCELLED" ? "CANCELLED" : "ACTIVE",
          currentPeriodStart: paidAt,
          currentPeriodEnd: later(sub.currentPeriodEnd, addMonths(paidAt, 1)),
        },
      });
    } else if (
      status === "FAILED" &&
      sub.status === "ACTIVE" &&
      sub.currentPeriodEnd &&
      sub.currentPeriodEnd < now
    ) {
      await tx.consumerSubscription.update({
        where: { id: sub.id },
        data: { status: "PAST_DUE" },
      });
    }
  });
}

/** Pagamento avulso: serviço fora do plano ou mensalidade da plataforma via Pix. */
export async function applyOneTimePayment(
  billingPaymentId: string,
  payment: PaymentInfo,
) {
  const now = new Date();
  await db.$transaction(async (tx) => {
    const local = await tx.billingPayment.findUnique({
      where: { id: billingPaymentId },
    });
    if (!local) return;
    const wasConfirmed = local.status === "CONFIRMED";
    let status = toPaymentStatus(payment.status);
    if (
      status === "CONFIRMED" &&
      payment.amount + 0.01 < Number(local.amount)
    ) {
      console.error(
        "Pagamento com valor menor que o devido",
        billingPaymentId,
        payment.amount,
        Number(local.amount),
      );
      status = "FAILED";
    }
    await tx.billingPayment.update({
      where: { id: local.id },
      data: {
        status,
        method: payment.method ?? local.method,
        gatewayPaymentId: payment.id,
        paidAt: payment.paidAt ?? (status === "CONFIRMED" ? now : null),
      },
    });
    if (
      status === "CONFIRMED" &&
      !wasConfirmed &&
      local.purpose === "SAAS_SUBSCRIPTION" &&
      local.saasSubscriptionId
    ) {
      const sub = await tx.saasSubscription.findUnique({
        where: { id: local.saasSubscriptionId },
      });
      if (!sub) return;
      const base =
        sub.status !== "PENDING" &&
        sub.currentPeriodEnd &&
        sub.currentPeriodEnd > now
          ? sub.currentPeriodEnd
          : now;
      await tx.saasSubscription.update({
        where: { id: sub.id },
        data: {
          status: "ACTIVE",
          currentPeriodStart: now,
          currentPeriodEnd: addMonths(base, 1),
        },
      });
    }
  });
}

/** Rotina diária: marca atrasos e suspende contas fora da tolerância. */
export async function runBillingMaintenance(now = new Date()) {
  const graceLimit = new Date(now.getTime() - SAAS.graceDays * DAY);
  const consumerGraceLimit = new Date(
    now.getTime() - CONSUMER_GRACE_DAYS * DAY,
  );
  const [saasPastDue, saasSuspended, consumerPastDue, consumerExpired] =
    await db.$transaction([
      db.saasSubscription.updateMany({
        where: { status: "ACTIVE", currentPeriodEnd: { lt: now } },
        data: { status: "PAST_DUE" },
      }),
      db.saasSubscription.updateMany({
        where: {
          status: { in: ["PAST_DUE", "PENDING", "CANCELLED"] },
          currentPeriodEnd: { lt: graceLimit },
        },
        data: { status: "SUSPENDED" },
      }),
      db.consumerSubscription.updateMany({
        where: { status: "ACTIVE", currentPeriodEnd: { lt: now } },
        data: { status: "PAST_DUE" },
      }),
      db.consumerSubscription.updateMany({
        where: {
          status: { in: ["PAST_DUE", "CANCELLED"] },
          currentPeriodEnd: { lt: consumerGraceLimit },
        },
        data: { status: "EXPIRED" },
      }),
    ]);
  return {
    saasPastDue: saasPastDue.count,
    saasSuspended: saasSuspended.count,
    consumerPastDue: consumerPastDue.count,
    consumerExpired: consumerExpired.count,
  };
}
