"use server";

import { redirect } from "next/navigation";
import { runAction, text } from "@/app/_lib/actions";
import { getCurrentUser } from "@/app/_lib/auth";
import {
  cancelConsumerSubscription,
  startServiceCheckout,
} from "@/app/_lib/checkout";
import { db } from "@/app/_lib/prisma";

const PATH = "/account";
const CANCEL_MIN_HOURS = 2;

async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/account");
  return user;
}

export async function cancelMySubscription(form: FormData) {
  const user = await requireUser();
  await runAction(PATH, async () => {
    const sub = await db.consumerSubscription.findFirst({
      where: { id: text(form, "subscriptionId", 60), userId: user.id },
    });
    if (!sub) throw new Error("Assinatura não encontrada.");
    await cancelConsumerSubscription(sub.id);
    return "Renovação cancelada. Você continua com acesso até o fim do período pago.";
  });
}

export async function cancelMyBooking(form: FormData) {
  const user = await requireUser();
  await runAction(PATH, async () => {
    const booking = await db.booking.findFirst({
      where: { id: text(form, "bookingId", 60), userId: user.id },
    });
    if (!booking) throw new Error("Agendamento não encontrado.");
    if (!["REQUESTED", "CONFIRMED"].includes(booking.status))
      throw new Error("Este agendamento não pode mais ser cancelado.");
    if (booking.date.getTime() - Date.now() < CANCEL_MIN_HOURS * 3600_000) {
      throw new Error(
        `Cancelamentos online só até ${CANCEL_MIN_HOURS} horas antes. Fale com a barbearia.`,
      );
    }
    await db.booking.update({
      where: { id: booking.id },
      data: { status: "CANCELLED" },
    });
    return "Agendamento cancelado.";
  });
}

export async function payMyBooking(form: FormData) {
  const user = await requireUser();
  await runAction(PATH, async () => ({
    redirectTo: await startServiceCheckout(
      user.id,
      text(form, "bookingId", 60),
    ),
  }));
}

export async function reviewBooking(form: FormData) {
  const user = await requireUser();
  await runAction(PATH, async () => {
    const booking = await db.booking.findFirst({
      where: {
        id: text(form, "bookingId", 60),
        userId: user.id,
        status: "COMPLETED",
      },
      include: { review: true },
    });
    if (!booking)
      throw new Error("Só é possível avaliar atendimentos concluídos.");
    if (booking.review) throw new Error("Você já avaliou este atendimento.");
    const rating = Number(text(form, "rating", 1));
    if (!Number.isInteger(rating) || rating < 1 || rating > 5)
      throw new Error("Escolha de 1 a 5 estrelas.");
    await db.review.create({
      data: {
        bookingId: booking.id,
        userId: user.id,
        barbershopId: booking.barbershopId,
        rating,
        comment: text(form, "comment", 500) || null,
      },
    });
    return "Obrigado pela avaliação!";
  });
}
