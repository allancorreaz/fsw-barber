"use server";

import { MANAGEMENT, assertBarbershopRole } from "@/app/_lib/access";
import { money, runAction, text } from "@/app/_lib/actions";
import { db } from "@/app/_lib/prisma";

async function parsePlan(barbershopId: string, form: FormData) {
  const name = text(form, "name", 80);
  if (name.length < 2) throw new Error("Dê um nome ao plano.");
  const price = money(form, "price");
  if (price < 1) throw new Error("O valor mínimo do plano é R$ 1,00.");
  const limitRaw = text(form, "bookingsPerCycle", 4);
  const bookingsPerCycle = limitRaw ? Number(limitRaw) : null;
  if (
    bookingsPerCycle !== null &&
    (!Number.isInteger(bookingsPerCycle) ||
      bookingsPerCycle < 1 ||
      bookingsPerCycle > 100)
  ) {
    throw new Error(
      "A quantidade de atendimentos deve ser entre 1 e 100 (ou vazio para ilimitado).",
    );
  }
  const serviceIds = form
    .getAll("serviceIds")
    .filter((value): value is string => typeof value === "string");
  const validServices = await db.barbershopService.findMany({
    where: { barbershopId, id: { in: serviceIds } },
    select: { id: true },
  });
  if (validServices.length === 0)
    throw new Error("Selecione pelo menos um serviço incluso no plano.");
  return {
    name,
    price,
    bookingsPerCycle,
    description: text(form, "description", 500) || null,
    active: form.get("active") === "on",
    serviceIds: validServices.map((service) => service.id),
  };
}

export async function createPlan(barbershopId: string, form: FormData) {
  const path = `/dashboard/${barbershopId}/plans`;
  await runAction(path, async () => {
    await assertBarbershopRole(barbershopId, MANAGEMENT);
    const plan = await parsePlan(barbershopId, form);
    const duplicate = await db.consumerPlan.findFirst({
      where: { barbershopId, name: plan.name },
    });
    if (duplicate) throw new Error("Já existe um plano com esse nome.");
    await db.consumerPlan.create({
      data: {
        barbershopId,
        name: plan.name,
        price: plan.price,
        description: plan.description,
        bookingsPerCycle: plan.bookingsPerCycle,
        active: true,
        services: {
          create: plan.serviceIds.map((serviceId) => ({ serviceId })),
        },
      },
    });
    return "Plano criado.";
  });
}

export async function updatePlan(
  barbershopId: string,
  planId: string,
  form: FormData,
) {
  const path = `/dashboard/${barbershopId}/plans`;
  await runAction(path, async () => {
    await assertBarbershopRole(barbershopId, MANAGEMENT);
    const current = await db.consumerPlan.findFirst({
      where: { id: planId, barbershopId },
    });
    if (!current) throw new Error("Plano não encontrado.");
    const plan = await parsePlan(barbershopId, form);
    const duplicate = await db.consumerPlan.findFirst({
      where: { barbershopId, name: plan.name, id: { not: planId } },
    });
    if (duplicate) throw new Error("Já existe um plano com esse nome.");
    await db.$transaction([
      db.consumerPlanService.deleteMany({ where: { planId } }),
      db.consumerPlan.update({
        where: { id: planId },
        data: {
          name: plan.name,
          price: plan.price,
          description: plan.description,
          bookingsPerCycle: plan.bookingsPerCycle,
          active: plan.active,
          services: {
            create: plan.serviceIds.map((serviceId) => ({ serviceId })),
          },
        },
      }),
    ]);
    return Number(current.price) !== plan.price
      ? "Plano atualizado. O novo valor vale para novas assinaturas; quem já assina continua no valor contratado."
      : "Plano atualizado.";
  });
}
