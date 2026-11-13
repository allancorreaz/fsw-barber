"use server";

import { requirePlatformAdmin } from "@/app/_lib/access";
import { runAction, text } from "@/app/_lib/actions";
import { addMonths, ensureSaasSubscription } from "@/app/_lib/billing";
import { db } from "@/app/_lib/prisma";

/** Libera meses de uso manualmente (ex.: cliente pagou por fora, ou cortesia de lançamento). */
export async function grantMonths(form: FormData) {
  await requirePlatformAdmin();
  await runAction("/admin", async () => {
    const barbershopId = text(form, "barbershopId", 60);
    const months = Number(text(form, "months", 2));
    if (!Number.isInteger(months) || months < 1 || months > 24)
      throw new Error("Informe de 1 a 24 meses.");
    const sub = await ensureSaasSubscription(barbershopId);
    const now = new Date();
    const base =
      sub.currentPeriodEnd && sub.currentPeriodEnd > now
        ? sub.currentPeriodEnd
        : now;
    await db.$transaction([
      db.saasSubscription.update({
        where: { id: sub.id },
        data: {
          status: "ACTIVE",
          currentPeriodStart: now,
          currentPeriodEnd: addMonths(base, months),
        },
      }),
      ...(form.get("paid") === "on"
        ? [
            db.billingPayment.create({
              data: {
                purpose: "SAAS_SUBSCRIPTION",
                status: "CONFIRMED",
                amount: Number(sub.amount) * months,
                method: "manual",
                gateway: "manual",
                description: `Mensalidade registrada manualmente (${months} ${months === 1 ? "mês" : "meses"})`,
                saasSubscriptionId: sub.id,
                barbershopId,
                paidAt: now,
              },
            }),
          ]
        : []),
    ]);
    return `Liberado por ${months} ${months === 1 ? "mês" : "meses"}.`;
  });
}

export async function suspendNow(form: FormData) {
  await requirePlatformAdmin();
  await runAction("/admin", async () => {
    const sub = await ensureSaasSubscription(text(form, "barbershopId", 60));
    await db.saasSubscription.update({
      where: { id: sub.id },
      data: { status: "SUSPENDED" },
    });
    return "Barbearia suspensa.";
  });
}
