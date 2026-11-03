import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/app/_lib/prisma";

type BookingPayload = { serviceId?: unknown; professionalId?: unknown; dateTime?: unknown; name?: unknown; email?: unknown; };
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const dateTimePattern = /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d$/;
const TZ = "America/Sao_Paulo";
const SLOT_STEP_MINUTES = 15;
const ACTIVE_BOOKING_STATUSES = ["REQUESTED", "CONFIRMED", "IN_PROGRESS"] as const;

function localDateRange(date: string) {
  const start = new Date(`${date}T00:00:00.000-03:00`);
  return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
}
function isValidDate(date: string) {
  if (!datePattern.test(date)) return false;
  const [year, month, day] = date.split("-").map(Number);
  const check = new Date(Date.UTC(year, month - 1, day));
  return check.getUTCFullYear() === year && check.getUTCMonth() === month - 1 && check.getUTCDate() === day;
}
function toMinutes(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}
function formatTime(date: Date) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(date);
}
function overlaps(start: Date, end: Date, otherStart: Date, otherEnd: Date) {
  return start < otherEnd && end > otherStart;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const serviceId = url.searchParams.get("serviceId") ?? "";
  const date = url.searchParams.get("date") ?? "";
  if (!serviceId || !isValidDate(date)) return NextResponse.json({ error: "Informe um serviço e uma data válidos." }, { status: 400 });

  const { start, end } = localDateRange(date);
  const weekday = new Date(`${date}T12:00:00-03:00`).getDay();
  try {
    const service = await db.barbershopService.findFirst({
      where: { id: serviceId, active: true },
      select: { id: true, barbershopId: true, durationMinutes: true },
    });
    if (!service) return NextResponse.json({ error: "O serviço selecionado não está disponível." }, { status: 404 });

    const professionals = await db.professional.findMany({
      where: { barbershopId: service.barbershopId, active: true, services: { some: { serviceId } } },
      include: {
        workingHours: { where: { weekDay: weekday, active: true } },
        timeOff: { where: { startsAt: { lt: end }, endsAt: { gt: start } } },
        bookings: {
          where: { date: { gte: start, lt: end }, status: { in: [...ACTIVE_BOOKING_STATUSES] } },
          include: { service: { select: { durationMinutes: true } } },
        },
      },
      orderBy: { name: "asc" },
    });

    const now = new Date();
    const result = professionals.map((professional) => {
      const availableSlots = new Set<string>();
      for (const hours of professional.workingHours) {
        const opening = toMinutes(hours.startTime);
        const closing = toMinutes(hours.endTime);
        for (let minute = opening; minute + service.durationMinutes <= closing; minute += SLOT_STEP_MINUTES) {
          const hh = String(Math.floor(minute / 60)).padStart(2, "0");
          const mm = String(minute % 60).padStart(2, "0");
          const slotStart = new Date(`${date}T${hh}:${mm}:00-03:00`);
          const slotEnd = new Date(slotStart.getTime() + service.durationMinutes * 60_000);
          if (slotStart <= now) continue;
          if (professional.timeOff.some((period) => overlaps(slotStart, slotEnd, period.startsAt, period.endsAt))) continue;
          if (professional.bookings.some((booking) => {
            const bookingEnd = new Date(booking.date.getTime() + (booking.durationMinutes ?? booking.service.durationMinutes) * 60_000);
            return overlaps(slotStart, slotEnd, booking.date, bookingEnd);
          })) continue;
          availableSlots.add(`${hh}:${mm}`);
        }
      }
      return { id: professional.id, name: professional.name, availableSlots: [...availableSlots].sort() };
    });
    return NextResponse.json({ professionals: result }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Booking availability lookup failed:", error);
    return NextResponse.json({ error: "Não foi possível consultar os horários." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  let payload: BookingPayload;
  try { payload = await request.json() as BookingPayload; }
  catch { return NextResponse.json({ error: "Corpo da solicitação inválido." }, { status: 400 }); }

  const serviceId = typeof payload.serviceId === "string" ? payload.serviceId : "";
  const professionalId = typeof payload.professionalId === "string" ? payload.professionalId : "";
  const dateTime = typeof payload.dateTime === "string" ? payload.dateTime : "";
  const name = typeof payload.name === "string" ? payload.name.trim() : "";
  const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
  if (!serviceId || !professionalId || !name || name.length > 100 || !emailPattern.test(email) || email.length > 254) {
    return NextResponse.json({ error: "Informe nome, e-mail, serviço e profissional válidos." }, { status: 400 });
  }
  if (!dateTimePattern.test(dateTime) || !isValidDate(dateTime.slice(0, 10))) {
    return NextResponse.json({ error: "Selecione uma data e horário válidos." }, { status: 400 });
  }
  const bookingDate = new Date(`${dateTime}:00-03:00`);
  if (Number.isNaN(bookingDate.getTime()) || bookingDate <= new Date()) return NextResponse.json({ error: "Escolha uma data e horário futuros." }, { status: 400 });

  try {
    const booking = await db.$transaction(async (transaction) => {
      const service = await transaction.barbershopService.findFirst({
        where: { id: serviceId, active: true },
        select: { id: true, barbershopId: true, price: true, durationMinutes: true },
      });
      if (!service) return { error: "SERVICE_NOT_FOUND" as const };
      const professional = await transaction.professional.findFirst({
        where: { id: professionalId, barbershopId: service.barbershopId, active: true, services: { some: { serviceId } } },
        select: { id: true },
      });
      if (!professional) return { error: "PROFESSIONAL_NOT_AVAILABLE" as const };

      const weekday = bookingDate.getDay();
      const localTime = formatTime(bookingDate);
      const hours = await transaction.professionalWorkingHour.findMany({
        where: { professionalId, weekDay: weekday, active: true },
      });
      const startMinutes = toMinutes(localTime);
      const endMinutes = startMinutes + service.durationMinutes;
      const insideHours = hours.some((row) => startMinutes >= toMinutes(row.startTime) && endMinutes <= toMinutes(row.endTime));
      if (!insideHours) return { error: "OUTSIDE_WORKING_HOURS" as const };

      const bookingEnd = new Date(bookingDate.getTime() + service.durationMinutes * 60_000);
      const timeOff = await transaction.professionalTimeOff.findFirst({
        where: { professionalId, startsAt: { lt: bookingEnd }, endsAt: { gt: bookingDate } },
        select: { id: true },
      });
      if (timeOff) return { error: "TIME_OFF" as const };

      const sameDayBookings = await transaction.booking.findMany({
        where: { professionalId, date: { lt: bookingEnd }, status: { in: [...ACTIVE_BOOKING_STATUSES] } },
        include: { service: { select: { durationMinutes: true } } },
        select: { id: true, date: true, durationMinutes: true, service: { select: { durationMinutes: true } } },
      });
      const conflict = sameDayBookings.some((existing) => {
        const existingEnd = new Date(existing.date.getTime() + (existing.durationMinutes ?? existing.service.durationMinutes) * 60_000);
        return overlaps(bookingDate, bookingEnd, existing.date, existingEnd);
      });
      if (conflict) return { error: "SLOT_TAKEN" as const };

      const user = await transaction.user.upsert({
        where: { email },
        update: { name },
        create: { name, email },
        select: { id: true },
      });
      const created = await transaction.booking.create({
        data: {
          userId: user.id, serviceId, professionalId, date: bookingDate,
          status: "REQUESTED", priceAtBooking: service.price, durationMinutes: service.durationMinutes,
        },
        select: { id: true, date: true },
      });
      return { booking: created };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    if ("error" in booking) {
      const errors = {
        SERVICE_NOT_FOUND: [404, "Serviço não encontrado ou inativo."],
        PROFESSIONAL_NOT_AVAILABLE: [400, "Esse profissional não realiza o serviço selecionado."],
        OUTSIDE_WORKING_HOURS: [400, "O horário escolhido está fora da jornada do profissional."],
        TIME_OFF: [409, "O profissional não está disponível nesse período."],
        SLOT_TAKEN: [409, "Esse horário já foi ocupado. Escolha outro."],
      } as const;
      const [status, message] = errors[booking.error];
      return NextResponse.json({ error: message }, { status });
    }
    return NextResponse.json({ message: "Agendamento solicitado! A barbearia poderá confirmar pelo contato informado.", bookingId: booking.booking.id }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return NextResponse.json({ error: "Houve uma disputa por esse horário. Atualize a disponibilidade e tente novamente." }, { status: 409 });
    }
    console.error("Booking creation failed:", error);
    return NextResponse.json({ error: "Não foi possível concluir o agendamento. Tente novamente mais tarde." }, { status: 500 });
  }
}
