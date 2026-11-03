import { NextResponse } from "next/server";
import { requireBarbershopRole } from "@/app/_lib/auth";
import { db } from "@/app/_lib/prisma";

type Context = { params: Promise<{ barbershopId: string }> };

function parseService(body: unknown) {
  if (!body || typeof body !== "object") return null;
  const value = body as Record<string, unknown>;
  const name = typeof value.name === "string" ? value.name.trim() : "";
  const description = typeof value.description === "string" ? value.description.trim() : "";
  const imageUrl = typeof value.imageUrl === "string" ? value.imageUrl.trim() : "";
  const price = typeof value.price === "number" ? value.price : Number(value.price);
  const durationMinutes = Number(value.durationMinutes);
  if (!name || name.length > 100 || description.length > 1000 || !Number.isFinite(price) || price < 0 || price > 99999999 || !Number.isInteger(durationMinutes) || durationMinutes < 5 || durationMinutes > 480) return null;
  if (imageUrl && (!/^https:\/\//i.test(imageUrl) || imageUrl.length > 2048)) return null;
  return { name, description, imageUrl, price, durationMinutes, active: value.active !== false };
}

export async function GET(_: Request, context: Context) {
  const { barbershopId } = await context.params;
  const { user, membership } = await requireBarbershopRole(barbershopId, ["OWNER", "MANAGER", "RECEPTIONIST", "BARBER"]);
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!membership) return NextResponse.json({ error: "Acesso não autorizado." }, { status: 404 });
  const services = await db.barbershopService.findMany({ where: { barbershopId }, orderBy: { name: "asc" } });
  return NextResponse.json({ services });
}

export async function POST(request: Request, context: Context) {
  const { barbershopId } = await context.params;
  const { user, membership } = await requireBarbershopRole(barbershopId, ["OWNER", "MANAGER"]);
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!membership) return NextResponse.json({ error: "Acesso não autorizado." }, { status: 404 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "JSON inválido." }, { status: 400 }); }
  const data = parseService(body);
  if (!data) return NextResponse.json({ error: "Informe nome, preço e duração válidos (5 a 480 minutos)." }, { status: 400 });
  const service = await db.barbershopService.create({ data: { ...data, barbershopId } });
  return NextResponse.json({ service }, { status: 201 });
}
