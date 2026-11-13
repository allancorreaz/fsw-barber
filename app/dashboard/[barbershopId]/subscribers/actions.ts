"use server";

import {
  FRONT_DESK,
  MANAGEMENT,
  assertBarbershopRole,
} from "@/app/_lib/access";
import { runAction, text } from "@/app/_lib/actions";
import { activateManualConsumerSubscription } from "@/app/_lib/billing";
import {
  cancelConsumerSubscription,
  syncConsumerSubscription,
} from "@/app/_lib/checkout";
import { db } from "@/app/_lib/prisma";

export async function addManualSubscriber(
  barbershopId: string,
  form: FormData,
) {
  await runAction(`/dashboard/${barbershopId}/subscribers`, async () => {
    await assertBarbershopRole(barbershopId, FRONT_DESK);
    const email = text(form, "email", 200).toLowerCase();
    const months = Number(text(form, "months", 2));
    if (!Number.isInteger(months) || months < 1 || months > 12)
      throw new Error("Escolha de 1 a 12 meses.");
    const user = await db.user.findUnique({
      where: { email },
      select: { id: true, name: true },
    });
    if (!user)
      throw new Error(
        "Nenhum cliente com esse e-mail. Peça para ele criar a conta na plataforma primeiro.",
      );
    await activateManualConsumerSubscription({
      barbershopId,
      userId: user.id,
      planId: text(form, "planId", 60),
      months,
    });
    return `Plano ativado para ${user.name}.`;
  });
}

export async function cancelSubscriber(barbershopId: string, form: FormData) {
  await runAction(`/dashboard/${barbershopId}/subscribers`, async () => {
    await assertBarbershopRole(barbershopId, MANAGEMENT);
    const sub = await db.consumerSubscription.findFirst({
      where: { id: text(form, "subscriptionId", 60), barbershopId },
    });
    if (!sub) throw new Error("Assinatura não encontrada.");
    await cancelConsumerSubscription(sub.id);
    return "Renovação cancelada. O cliente mantém o acesso até o fim do período já pago.";
  });
}

export async function refreshSubscriber(barbershopId: string, form: FormData) {
  await runAction(`/dashboard/${barbershopId}/subscribers`, async () => {
    await assertBarbershopRole(barbershopId, FRONT_DESK);
    const sub = await db.consumerSubscription.findFirst({
      where: { id: text(form, "subscriptionId", 60), barbershopId },
    });
    if (!sub) throw new Error("Assinatura não encontrada.");
    await syncConsumerSubscription(sub.id);
    return "Status atualizado com o Mercado Pago.";
  });
}
