import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/app/_lib/prisma";

export const runtime = "nodejs";

type BookingPayload = {
  serviceId?: unknown;
  dateTime?: unknown;
  name?: unknown;
  email?: unknown;
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const slotPattern = /^\d{4}-\d{2}-\d{2}T(?:0[9]|1[0-7]):(?:00|30)$/;

export async function POST(request: Request) {
  let payload: BookingPayload;

  try {
    payload = (await request.json()) as BookingPayload;
  } catch {
    return NextResponse.json({ error: "Corpo da solicitação inválido." }, { status: 400 });
  }

  const serviceId = typeof payload.serviceId === "string" ? payload.serviceId : "";
  const dateTime = typeof payload.dateTime === "string" ? payload.dateTime : "";
  const name = typeof payload.name === "string" ? payload.name.trim() : "";
  const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";

  if (!serviceId || !name || name.length > 100 || !emailPattern.test(email) || email.length > 254) {
    return NextResponse.json({ error: "Informe um nome, e-mail e serviço válidos." }, { status: 400 });
  }

  if (!slotPattern.test(dateTime)) {
    return NextResponse.json({ error: "Selecione um horário válido entre 09h e 18h, em intervalos de 30 minutos." }, { status: 400 });
  }

  // The product currently operates with Brazil's UTC-3 local time.
  const bookingDate = new Date(`${dateTime}:00-03:00`);
  if (Number.isNaN(bookingDate.getTime()) || bookingDate.getTime() <= Date.now()) {
    return NextResponse.json({ error: "Escolha uma data e horário futuros." }, { status: 400 });
  }

  try {
    const service = await db.barbershopService.findUnique({
      where: { id: serviceId },
      select: { id: true, barbershopId: true },
    });

    if (!service) {
      return NextResponse.json({ error: "O serviço selecionado não está disponível." }, { status: 404 });
    }

    const booking = await db.$transaction(
      async (transaction) => {
        const slotStart = new Date(bookingDate.getTime() - 30 * 60 * 1000);
        const slotEnd = new Date(bookingDate.getTime() + 30 * 60 * 1000);

        const conflict = await transaction.booking.findFirst({
          where: {
            date: { gt: slotStart, lt: slotEnd },
            service: { barbershopId: service.barbershopId },
          },
          select: { id: true },
        });

        if (conflict) return null;

        const user = await transaction.user.upsert({
          where: { email },
          update: { name },
          create: { name, email },
          select: { id: true },
        });

        return transaction.booking.create({
          data: { userId: user.id, serviceId: service.id, date: bookingDate },
          select: { id: true, date: true },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    if (!booking) {
      return NextResponse.json(
        { error: "Esse horário acabou de ser reservado. Escolha outro horário." },
        { status: 409 },
      );
    }

    return NextResponse.json(
      { message: "Agendamento solicitado! A barbearia poderá confirmar a disponibilidade pelo contato informado.", bookingId: booking.id },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return NextResponse.json(
        { error: "Houve uma disputa por esse horário. Atualize e escolha outro horário." },
        { status: 409 },
      );
    }

    console.error("Booking creation failed:", error);
    return NextResponse.json({ error: "Não foi possível concluir o agendamento. Tente novamente mais tarde." }, { status: 500 });
  }
}
