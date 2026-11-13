import "server-only";
import { appUrl, SAAS } from "@/app/_lib/config";
import {
  applyOneTimePayment,
  ensureSaasSubscription,
  findUsableConsumerSubscription,
  parseExternalReference,
  syncRecurring,
} from "@/app/_lib/billing";
import { db } from "@/app/_lib/prisma";
import { getPaymentProvider } from "@/app/_lib/payments";
import {
  barbershopMerchant,
  platformMerchant,
} from "@/app/_lib/payments/merchants";

const webhookUrl = () => `${appUrl()}/api/webhooks/payments`;

/* ---------------------------- Plano do cliente ---------------------------- */

export async function startConsumerCheckout(
  user: { id: string; email: string },
  planId: string,
) {
  const plan = await db.consumerPlan.findFirst({
    where: { id: planId, active: true },
    select: {
      id: true,
      name: true,
      price: true,
      barbershopId: true,
      barbershop: { select: { name: true } },
    },
  });
  if (!plan) throw new Error("Plano indisponível.");
  const merchant = await barbershopMerchant(plan.barbershopId);
  if (!merchant)
    throw new Error(
      "Esta barbearia ainda não ativou o recebimento online. Fale com a barbearia.",
    );

  const usable = await findUsableConsumerSubscription(
    user.id,
    plan.barbershopId,
  );
  if (usable && usable.status !== "CANCELLED")
    throw new Error("Você já tem um plano ativo nesta barbearia.");

  // Reaproveita uma tentativa pendente do mesmo plano para não criar registros duplicados.
  const pending = await db.consumerSubscription.findFirst({
    where: { userId: user.id, planId: plan.id, status: "PENDING" },
  });
  const sub =
    pending ??
    (await db.consumerSubscription.create({
      data: {
        userId: user.id,
        barbershopId: plan.barbershopId,
        planId: plan.id,
        status: "PENDING",
        amount: plan.price,
        gateway: getPaymentProvider().id,
      },
    }));

  const checkout = await getPaymentProvider().createRecurringCheckout(
    merchant,
    {
      reason: `${plan.barbershop.name} · ${plan.name}`,
      externalReference: `plan:${sub.id}`,
      payerEmail: user.email,
      amount: Number(plan.price),
      backUrl: `${appUrl()}/barbershops/${plan.barbershopId}?assinatura=${sub.id}`,
    },
  );
  await db.consumerSubscription.update({
    where: { id: sub.id },
    data: { gatewaySubscriptionId: checkout.id, amount: plan.price },
  });
  return checkout.checkoutUrl;
}

export async function syncConsumerSubscription(subscriptionId: string) {
  const sub = await db.consumerSubscription.findUnique({
    where: { id: subscriptionId },
  });
  if (!sub?.gatewaySubscriptionId || sub.gateway === "manual") return sub;
  const merchant = await barbershopMerchant(sub.barbershopId);
  if (!merchant) return sub;
  const info = await getPaymentProvider().getRecurring(
    merchant,
    sub.gatewaySubscriptionId,
  );
  await syncRecurring({ kind: "plan", id: sub.id }, info);
  return db.consumerSubscription.findUnique({ where: { id: sub.id } });
}

/** Cancela a renovação. O cliente mantém o acesso até o fim do período já pago. */
export async function cancelConsumerSubscription(subscriptionId: string) {
  const sub = await db.consumerSubscription.findUnique({
    where: { id: subscriptionId },
  });
  if (!sub) throw new Error("Assinatura não encontrada.");
  if (sub.status === "CANCELLED" || sub.status === "EXPIRED") return;
  if (sub.gatewaySubscriptionId && sub.gateway !== "manual") {
    const merchant = await barbershopMerchant(sub.barbershopId);
    if (!merchant)
      throw new Error(
        "Não foi possível falar com o Mercado Pago da barbearia. Tente novamente.",
      );
    await getPaymentProvider().cancelRecurring(
      merchant,
      sub.gatewaySubscriptionId,
    );
  }
  await db.consumerSubscription.update({
    where: { id: sub.id },
    data: {
      status: sub.status === "PENDING" ? "EXPIRED" : "CANCELLED",
      cancelledAt: new Date(),
    },
  });
}

/* ---------------------------- Serviço avulso ---------------------------- */

export async function startServiceCheckout(userId: string, bookingId: string) {
  const booking = await db.booking.findFirst({
    where: { id: bookingId, userId },
    include: {
      service: { select: { name: true } },
      barbershop: { select: { name: true } },
      user: { select: { email: true } },
      payments: true,
    },
  });
  if (!booking) throw new Error("Agendamento não encontrado.");
  if (
    booking.coveredByPlan ||
    !booking.priceAtBooking ||
    Number(booking.priceAtBooking) <= 0
  )
    throw new Error("Este atendimento não tem valor a pagar.");
  if (booking.payments.some((payment) => payment.status === "CONFIRMED"))
    throw new Error("Este atendimento já está pago.");
  if (booking.status === "CANCELLED")
    throw new Error("Este agendamento foi cancelado.");
  const merchant = await barbershopMerchant(booking.barbershopId);
  if (!merchant) throw new Error("Esta barbearia recebe apenas no local.");

  const payment =
    booking.payments.find((item) => item.status === "PENDING") ??
    (await db.billingPayment.create({
      data: {
        purpose: "SERVICE",
        status: "PENDING",
        amount: booking.priceAtBooking,
        description: booking.service.name,
        gateway: getPaymentProvider().id,
        bookingId: booking.id,
        barbershopId: booking.barbershopId,
        userId,
      },
    }));

  const checkout = await getPaymentProvider().createOneTimeCheckout(merchant, {
    title: `${booking.barbershop.name} · ${booking.service.name}`,
    externalReference: `pay:${payment.id}`,
    payerEmail: booking.user.email,
    amount: Number(booking.priceAtBooking),
    backUrl: `${appUrl()}/account?pagamento=${payment.id}`,
    notificationUrl: webhookUrl(),
  });
  return checkout.checkoutUrl;
}

/** Confere um pagamento avulso quando o cliente volta do checkout (complementa o webhook). */
export async function confirmReturnedPayment(
  billingPaymentId: string,
  gatewayPaymentId: string,
) {
  const local = await db.billingPayment.findUnique({
    where: { id: billingPaymentId },
  });
  if (!local || local.status === "CONFIRMED") return;
  const merchant =
    local.purpose === "SAAS_SUBSCRIPTION"
      ? platformMerchant()
      : local.barbershopId
        ? await barbershopMerchant(local.barbershopId)
        : null;
  if (!merchant) return;
  const payment = await getPaymentProvider().getPayment(
    merchant,
    gatewayPaymentId,
  );
  const ref = parseExternalReference(payment.externalReference);
  if (ref?.kind === "pay" && ref.id === local.id)
    await applyOneTimePayment(local.id, payment);
}

/* ---------------------------- Mensalidade da plataforma ---------------------------- */

export async function startSaasRecurringCheckout(
  barbershopId: string,
  ownerEmail: string,
) {
  const sub = await ensureSaasSubscription(barbershopId);
  const barbershop = await db.barbershop.findUnique({
    where: { id: barbershopId },
    select: { name: true },
  });
  const trialEnd =
    sub.status === "PENDING" &&
    sub.currentPeriodEnd &&
    sub.currentPeriodEnd > new Date()
      ? sub.currentPeriodEnd
      : undefined;
  const checkout = await getPaymentProvider().createRecurringCheckout(
    platformMerchant(),
    {
      reason: `${SAAS.planName} · ${barbershop?.name ?? "Barbearia"}`,
      externalReference: `saas:${sub.id}`,
      payerEmail: ownerEmail,
      amount: Number(sub.amount),
      backUrl: `${appUrl()}/dashboard/${barbershopId}/billing?retorno=1`,
      startDate: trialEnd,
    },
  );
  await db.saasSubscription.update({
    where: { id: sub.id },
    data: {
      gatewaySubscriptionId: checkout.id,
      gateway: getPaymentProvider().id,
    },
  });
  return checkout.checkoutUrl;
}

export async function startSaasPixCheckout(
  barbershopId: string,
  ownerEmail: string,
) {
  const sub = await ensureSaasSubscription(barbershopId);
  const payment = await db.billingPayment.create({
    data: {
      purpose: "SAAS_SUBSCRIPTION",
      status: "PENDING",
      amount: sub.amount,
      description: "Mensalidade da plataforma (1 mês)",
      gateway: getPaymentProvider().id,
      saasSubscriptionId: sub.id,
      barbershopId,
    },
  });
  const checkout = await getPaymentProvider().createOneTimeCheckout(
    platformMerchant(),
    {
      title: `${SAAS.planName} · 1 mês`,
      externalReference: `pay:${payment.id}`,
      payerEmail: ownerEmail,
      amount: Number(sub.amount),
      backUrl: `${appUrl()}/dashboard/${barbershopId}/billing?pagamento=${payment.id}`,
      notificationUrl: webhookUrl(),
    },
  );
  return checkout.checkoutUrl;
}

export async function syncSaasSubscription(barbershopId: string) {
  const sub = await db.saasSubscription.findUnique({ where: { barbershopId } });
  if (!sub?.gatewaySubscriptionId || sub.gateway === "manual") return;
  const info = await getPaymentProvider().getRecurring(
    platformMerchant(),
    sub.gatewaySubscriptionId,
  );
  await syncRecurring({ kind: "saas", id: sub.id }, info);
}
