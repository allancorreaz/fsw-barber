import { NextResponse } from "next/server";
import { requireBarbershopRole } from "@/app/_lib/auth";
import { db } from "@/app/_lib/prisma";

type Context = { params: Promise<{ barbershopId: string }> };

export async function GET(_: Request, context: Context) {
  const { barbershopId } = await context.params;
  const { user, membership } = await requireBarbershopRole(barbershopId, ["OWNER", "MANAGER", "RECEPTIONIST", "BARBER"]);
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!membership) return NextResponse.json({ error: "Acesso não autorizado." }, { status: 404 });
  const professionals = await db.professional.findMany({
    where: { barbershopId },
    include: { services: { select: { serviceId: true } }, workingHours: { orderBy: [{ weekDay: "asc" }, { startTime: "asc" }] } },
    orderBy: { name: "asc" },
  });
  return NextResponse.json({ professionals });
}

export async function POST(request: Request, context: Context) {
  const { barbershopId } = await context.params;
  const { user, membership } = await requireBarbershopRole(barbershopId, ["OWNER", "MANAGER"]);
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!membership) return NextResponse.json({ error: "Acesso não autorizado." }, { status: 404 });
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; } catch { return NextResponse.json({ error: "JSON inválido." }, { status: 400 }); }
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const phone = typeof body.phone === "string" ? body.phone.trim() : "";
  const serviceIds = Array.isArray(body.serviceIds) ? [...new Set(body.serviceIds.filter((id): id is string => typeof id === "string"))] : [];
  if (!name || name.length > 100 || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) || email.length > 254 || phone.length > 30 || serviceIds.length > 100) {
    return NextResponse.json({ error: "Informe dados válidos para o profissional." }, { status: 400 });
  }
  const services = await db.barbershopService.findMany({ where: { id: { in: serviceIds }, barbershopId, active: true }, select: { id: true } });
  if (services.length !== serviceIds.length) return NextResponse.json({ error: "Um ou mais serviços não pertencem a esta barbearia ou estão inativos." }, { status: 400 });
  const professional = await db.professional.create({
    data: { barbershopId, name, email: email || null, phone: phone || null, services: { create: serviceIds.map((serviceId) => ({ serviceId })) } },
    include: { services: { select: { serviceId: true } } },
  });
  return NextResponse.json({ professional }, { status: 201 });
}
