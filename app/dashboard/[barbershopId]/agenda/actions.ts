"use server";

import type { BookingStatus } from "@prisma/client";
import { ALL_STAFF, assertBarbershopRole } from "@/app/_lib/access";
import { runAction, text } from "@/app/_lib/actions";
import { db } from "@/app/_lib/prisma";

const TRANSITIONS: Record<
  string,
  { to: BookingStatus; from: BookingStatus[]; message: string }
> = {
  confirm: {
    to: "CONFIRMED",
    from: ["REQUESTED"],
    message: "Agendamento confirmado.",
  },
  start: {
    to: "IN_PROGRESS",
    from: ["REQUESTED", "CONFIRMED"],
    message: "Atendimento iniciado.",
  },
  complete: {
    to: "COMPLETED",
    from: ["REQUESTED", "CONFIRMED", "IN_PROGRESS"],
    message: "Atendimento concluído.",
  },
  no_show: {
    to: "NO_SHOW",
    from: ["REQUESTED", "CONFIRMED"],
    message: "Marcado como não compareceu.",
  },
  cancel: {
    to: "CANCELLED",
    from: ["REQUESTED", "CONFIRMED"],
    message: "Agendamento cancelado.",
  },
};

/** Carrega o agendamento garantindo que pertence à barbearia e que o barbeiro só mexe nos seus. */
async function loadScopedBooking(barbershopId: string, bookingId: string) {
  const { user, membership } = await assertBarbershopRole(
    barbershopId,
    ALL_STAFF,
  );
  const booking = await db.booking.findFirst({
    where: { id: bookingId, barbershopId },
    include: {
      professional: { select: { userId: true } },
      service: { select: { name: true } },
      payments: true,
    },
  });
  if (!booking) throw new Error("Agendamento não encontrado.");
  const isFrontDesk = user.memberships.some(
    (item) => item.barbershopId === barbershopId && item.role !== "BARBER",
  );
  if (
    !isFrontDesk &&
    membership.role === "BARBER" &&
    booking.professional?.userId !== user.id
  ) {
    throw new Error("Você só pode alterar os seus próprios atendimentos.");
  }
  return booking;
}

export async function updateBookingStatus(
  barbershopId: string,
  returnTo: string,
  form: FormData,
) {
  await runAction(returnTo, async () => {
    const transition = TRANSITIONS[text(form, "transition", 20)];
    if (!transition) throw new Error("Ação inválida.");
    const booking = await loadScopedBooking(
      barbershopId,
      text(form, "bookingId", 60),
    );
    if (!transition.from.includes(booking.status))
      throw new Error(
        "Esse agendamento não pode mudar para esse status agora.",
      );
    await db.booking.update({
      where: { id: booking.id },
      data: { status: transition.to },
    });
    return transition.message;
  });
}

/** Registra que o serviço avulso foi pago no balcão (dinheiro, maquininha, Pix direto). */
export async function markServicePaid(
  barbershopId: string,
  returnTo: string,
  form: FormData,
) {
  await runAction(returnTo, async () => {
    const booking = await loadScopedBooking(
      barbershopId,
      text(form, "bookingId", 60),
    );
    if (booking.coveredByPlan)
      throw new Error("Este atendimento já está incluso no plano.");
    if (booking.payments.some((payment) => payment.status === "CONFIRMED"))
      throw new Error("Este atendimento já está pago.");
    const method = ["dinheiro", "cartao", "pix"].includes(
      text(form, "method", 20),
    )
      ? text(form, "method", 20)
      : "presencial";
    const pending = booking.payments.find(
      (payment) => payment.status === "PENDING",
    );
    const data = {
      status: "CONFIRMED" as const,
      method,
      gateway: "manual",
      paidAt: new Date(),
    };
    if (pending)
      await db.billingPayment.update({ where: { id: pending.id }, data });
    else
      await db.billingPayment.create({
        data: {
          ...data,
          purpose: "SERVICE",
          amount: booking.priceAtBooking ?? 0,
          description: booking.service.name,
          bookingId: booking.id,
          barbershopId,
          userId: booking.userId,
        },
      });
    return "Pagamento registrado.";
  });
}
