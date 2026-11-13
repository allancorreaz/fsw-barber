import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import {
  applyOneTimePayment,
  applyRecurringPayment,
  parseExternalReference,
  syncRecurring,
  type ExternalRef,
} from "@/app/_lib/billing";
import { getPaymentProvider } from "@/app/_lib/payments";
import { merchantForWebhook } from "@/app/_lib/payments/merchants";
import { db } from "@/app/_lib/prisma";

/**
 * Webhook do provedor de pagamento.
 * Segurança: valida a assinatura e NUNCA confia no conteúdo do evento — usa só o ID para
 * buscar o recurso na API do provedor com a credencial correta. Processar o mesmo evento
 * duas vezes é seguro (as funções de billing são idempotentes).
 */
export async function POST(request: Request) {
  const provider = getPaymentProvider();
  const rawBody = await request.text();
  const event = await provider.parseWebhook(request, rawBody);
  if (!event)
    return NextResponse.json(
      { error: "Assinatura inválida." },
      { status: 401 },
    );

  // Registro para auditoria. Evento repetido não gera erro e é processado de novo (as funções são idempotentes).
  await db.gatewayWebhookEvent.createMany({
    data: [
      {
        gateway: provider.id,
        eventId: event.eventId,
        eventType: event.kind,
        payload: event.raw as Prisma.InputJsonValue,
      },
    ],
    skipDuplicates: true,
  });

  try {
    const merchant = await merchantForWebhook(event.merchantUserId);
    if (!merchant) return NextResponse.json({ ignored: true });

    const owner = merchant.barbershopId;
    if (event.kind === "recurring") {
      const info = await provider.getRecurring(
        merchant.credentials,
        event.resourceId,
      );
      const ref = parseExternalReference(info.externalReference);
      if (ref && (await belongsToMerchant(ref, owner, info.id)))
        await syncRecurring(ref, info);
    } else if (event.kind === "recurring_payment") {
      const payment = await provider.getRecurringPayment(
        merchant.credentials,
        event.resourceId,
      );
      if (payment) {
        let ref = parseExternalReference(payment.externalReference);
        if (!ref && payment.recurringId)
          ref = await refFromRecurringId(payment.recurringId);
        if (ref && (await belongsToMerchant(ref, owner, payment.recurringId)))
          await applyRecurringPayment(ref, payment);
      }
    } else if (event.kind === "payment") {
      const payment = await provider.getPayment(
        merchant.credentials,
        event.resourceId,
      );
      let ref = parseExternalReference(payment.externalReference);
      if (!ref && payment.recurringId)
        ref = await refFromRecurringId(payment.recurringId);
      if (ref && (await belongsToMerchant(ref, owner, payment.recurringId))) {
        if (ref.kind === "pay") await applyOneTimePayment(ref.id, payment);
        else await applyRecurringPayment(ref, payment);
      }
    }

    await db.gatewayWebhookEvent.updateMany({
      where: { gateway: provider.id, eventId: event.eventId },
      data: { processedAt: new Date() },
    });
    return NextResponse.json({ received: true });
  } catch (error) {
    console.error(
      "Falha ao processar webhook",
      event.kind,
      event.resourceId,
      error,
    );
    // 500 faz o provedor reenviar o evento mais tarde.
    return NextResponse.json({ error: "Falha temporária." }, { status: 500 });
  }
}

/**
 * Defesa contra fraude entre contas: um evento só vale para registros do mesmo dono do dinheiro.
 * - mensalidade da plataforma (saas) só pode vir da conta da PLATAFORMA (owner === null);
 * - plano/serviço de uma barbearia só pode vir da conta Mercado Pago DAQUELA barbearia;
 * - a assinatura recorrente precisa ser a mesma que nós criamos e guardamos.
 * Sem isso, um dono poderia criar na própria conta uma cobrança com a referência da mensalidade dele.
 */
async function belongsToMerchant(
  ref: ExternalRef,
  owner: string | null,
  recurringId: string | null,
) {
  if (ref.kind === "saas") {
    if (owner !== null) return false;
    const sub = await db.saasSubscription.findUnique({
      where: { id: ref.id },
      select: { gatewaySubscriptionId: true },
    });
    return (
      Boolean(sub) &&
      (!recurringId || sub?.gatewaySubscriptionId === recurringId)
    );
  }
  if (ref.kind === "plan") {
    const sub = await db.consumerSubscription.findUnique({
      where: { id: ref.id },
      select: { barbershopId: true, gatewaySubscriptionId: true },
    });
    return (
      Boolean(sub) &&
      sub?.barbershopId === owner &&
      (!recurringId || sub?.gatewaySubscriptionId === recurringId)
    );
  }
  const local = await db.billingPayment.findUnique({
    where: { id: ref.id },
    select: { purpose: true, barbershopId: true },
  });
  if (!local) return false;
  return local.purpose === "SAAS_SUBSCRIPTION"
    ? owner === null
    : local.barbershopId === owner;
}

async function refFromRecurringId(recurringId: string) {
  const saas = await db.saasSubscription.findUnique({
    where: { gatewaySubscriptionId: recurringId },
    select: { id: true },
  });
  if (saas) return { kind: "saas" as const, id: saas.id };
  const plan = await db.consumerSubscription.findUnique({
    where: { gatewaySubscriptionId: recurringId },
    select: { id: true },
  });
  return plan ? { kind: "plan" as const, id: plan.id } : null;
}
