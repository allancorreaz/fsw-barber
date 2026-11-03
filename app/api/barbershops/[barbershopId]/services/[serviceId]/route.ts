import { NextResponse } from "next/server";
import { requireBarbershopRole } from "@/app/_lib/auth";
import { db } from "@/app/_lib/prisma";

type Context = { params: Promise<{ barbershopId: string; serviceId: string }> };

export async function PATCH(request: Request, context: Context) {
  const { barbershopId, serviceId } = await context.params;
  const { user, membership } = await requireBarbershopRole(barbershopId, ["OWNER", "MANAGER"]);
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!membership) return NextResponse.json({ error: "Acesso não autorizado." }, { status: 404 });
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; } catch { return NextResponse.json({ error: "JSON inválido." }, { status: 400 }); }
  const current = await db.barbershopService.findFirst({ where: { id: serviceId, barbershopId }, select: { id: true } });
  if (!current) return NextResponse.json({ error: "Serviço não encontrado." }, { status: 404 });
  const data: { name?: string; description?: string; imageUrl?: string; price?: number; durationMinutes?: number; active?: boolean } = {};
  if (body.name !== undefined) {
    if (typeof body.name !== "string" || !body.name.trim() || body.name.trim().length > 100) return NextResponse.json({ error: "Nome inválido." }, { status: 400 });
    data.name = body.name.trim();
  }
  if (body.description !== undefined) {
    if (typeof body.description !== "string" || body.description.length > 1000) return NextResponse.json({ error: "Descrição inválida." }, { status: 400 });
    data.description = body.description.trim();
  }
  if (body.imageUrl !== undefined) {
    if (typeof body.imageUrl !== "string" || (body.imageUrl && !/^https:\/\//i.test(body.imageUrl)) || body.imageUrl.length > 2048) return NextResponse.json({ error: "URL de imagem inválida." }, { status: 400 });
    data.imageUrl = body.imageUrl.trim();
  }
  if (body.price !== undefined) {
    const price = Number(body.price);
    if (!Number.isFinite(price) || price < 0 || price > 99999999) return NextResponse.json({ error: "Preço inválido." }, { status: 400 });
    data.price = price;
  }
  if (body.durationMinutes !== undefined) {
    const duration = Number(body.durationMinutes);
    if (!Number.isInteger(duration) || duration < 5 || duration > 480) return NextResponse.json({ error: "Duração inválida." }, { status: 400 });
    data.durationMinutes = duration;
  }
  if (body.active !== undefined) {
    if (typeof body.active !== "boolean") return NextResponse.json({ error: "Status inválido." }, { status: 400 });
    data.active = body.active;
  }
  if (!Object.keys(data).length) return NextResponse.json({ error: "Nenhuma alteração informada." }, { status: 400 });
  const service = await db.barbershopService.update({ where: { id: serviceId }, data });
  return NextResponse.json({ service });
}

export async function DELETE(_: Request, context: Context) {
  const { barbershopId, serviceId } = await context.params;
  const { user, membership } = await requireBarbershopRole(barbershopId, ["OWNER", "MANAGER"]);
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!membership) return NextResponse.json({ error: "Acesso não autorizado." }, { status: 404 });
  const service = await db.barbershopService.findFirst({ where: { id: serviceId, barbershopId }, select: { id: true } });
  if (!service) return NextResponse.json({ error: "Serviço não encontrado." }, { status: 404 });
  const updated = await db.barbershopService.update({ where: { id: serviceId }, data: { active: false } });
  return NextResponse.json({ service: updated, message: "Serviço desativado; histórico preservado." });
}
