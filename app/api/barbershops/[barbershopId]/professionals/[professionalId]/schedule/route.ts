import { NextResponse } from "next/server";
import { requireBarbershopRole } from "@/app/_lib/auth";
import { db } from "@/app/_lib/prisma";

type Context = { params: Promise<{ barbershopId: string; professionalId: string }> };

export async function GET(_: Request, context: Context) {
  const { barbershopId, professionalId } = await context.params;
  const { user, membership } = await requireBarbershopRole(barbershopId, ["OWNER", "MANAGER", "RECEPTIONIST", "BARBER"]);
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!membership) return NextResponse.json({ error: "Acesso não autorizado." }, { status: 404 });
  const professional = await db.professional.findFirst({
    where: { id: professionalId, barbershopId },
    include: { workingHours: { orderBy: [{ weekDay: "asc" }, { startTime: "asc" }] }, timeOff: { where: { endsAt: { gte: new Date() } }, orderBy: { startsAt: "asc" } } },
  });
  if (!professional) return NextResponse.json({ error: "Profissional não encontrado." }, { status: 404 });
  return NextResponse.json({ workingHours: professional.workingHours, timeOff: professional.timeOff });
}

export async function PUT(request: Request, context: Context) {
  const { barbershopId, professionalId } = await context.params;
  const { user, membership } = await requireBarbershopRole(barbershopId, ["OWNER", "MANAGER"]);
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!membership) return NextResponse.json({ error: "Acesso não autorizado." }, { status: 404 });
  let body: { workingHours?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "JSON inválido." }, { status: 400 }); }
  if (!Array.isArray(body.workingHours) || body.workingHours.length > 28) return NextResponse.json({ error: "Informe uma grade semanal válida." }, { status: 400 });
  const rows = body.workingHours as Array<Record<string, unknown>>;
  const parsed = rows.map((row) => ({
    weekDay: Number(row.weekDay),
    startTime: typeof row.startTime === "string" ? row.startTime : "",
    endTime: typeof row.endTime === "string" ? row.endTime : "",
    active: row.active !== false,
  }));
  const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
  if (parsed.some((row) => !Number.isInteger(row.weekDay) || row.weekDay < 0 || row.weekDay > 6 || !timePattern.test(row.startTime) || !timePattern.test(row.endTime) || row.startTime >= row.endTime)) {
    return NextResponse.json({ error: "Horários inválidos. Use dias de 0 a 6 e intervalos HH:mm crescentes." }, { status: 400 });
  }
  for (let day = 0; day <= 6; day++) {
    const intervals = parsed.filter((row) => row.weekDay === day && row.active).sort((a, b) => a.startTime.localeCompare(b.startTime));
    for (let i = 1; i < intervals.length; i++) if (intervals[i].startTime < intervals[i - 1].endTime) return NextResponse.json({ error: "Os intervalos do mesmo dia não podem se sobrepor." }, { status: 400 });
  }
  const professional = await db.professional.findFirst({ where: { id: professionalId, barbershopId }, select: { id: true } });
  if (!professional) return NextResponse.json({ error: "Profissional não encontrado." }, { status: 404 });
  await db.$transaction([
    db.professionalWorkingHour.deleteMany({ where: { professionalId } }),
    db.professionalWorkingHour.createMany({ data: parsed.map((row) => ({ ...row, professionalId })) }),
  ]);
  return NextResponse.json({ message: "Jornada semanal atualizada." });
}

export async function POST(request: Request, context: Context) {
  const { barbershopId, professionalId } = await context.params;
  const { user, membership } = await requireBarbershopRole(barbershopId, ["OWNER", "MANAGER"]);
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!membership) return NextResponse.json({ error: "Acesso não autorizado." }, { status: 404 });
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; } catch { return NextResponse.json({ error: "JSON inválido." }, { status: 400 }); }
  const startsAt = typeof body.startsAt === "string" && /^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}$/.test(body.startsAt) ? new Date(`${body.startsAt}:00-03:00`) : new Date(NaN);
  const endsAt = typeof body.endsAt === "string" && /^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}$/.test(body.endsAt) ? new Date(`${body.endsAt}:00-03:00`) : new Date(NaN);
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 200) : null;
  if (!Number.isFinite(startsAt.getTime()) || !Number.isFinite(endsAt.getTime()) || startsAt >= endsAt || startsAt < new Date()) return NextResponse.json({ error: "Informe um período futuro válido para a folga." }, { status: 400 });
  const professional = await db.professional.findFirst({ where: { id: professionalId, barbershopId }, select: { id: true } });
  if (!professional) return NextResponse.json({ error: "Profissional não encontrado." }, { status: 404 });
  const overlap = await db.professionalTimeOff.findFirst({ where: { professionalId, startsAt: { lt: endsAt }, endsAt: { gt: startsAt } }, select: { id: true } });
  if (overlap) return NextResponse.json({ error: "Já existe uma folga sobre esse período." }, { status: 409 });
  const timeOff = await db.professionalTimeOff.create({ data: { professionalId, startsAt, endsAt, reason } });
  return NextResponse.json({ timeOff }, { status: 201 });
}
