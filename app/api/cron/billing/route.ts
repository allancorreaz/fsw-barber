import { NextResponse } from "next/server";
import { runBillingMaintenance } from "@/app/_lib/billing";
import {
  syncConsumerSubscription,
  syncSaasSubscription,
} from "@/app/_lib/checkout";
import { db } from "@/app/_lib/prisma";

export const maxDuration = 60;

/**
 * Rotina diária (Vercel Cron): confere no gateway as assinaturas que vencem em breve,
 * depois marca atrasos e suspende quem passou da tolerância.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const soon = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
  const [saas, consumer] = await Promise.all([
    db.saasSubscription.findMany({
      where: {
        gatewaySubscriptionId: { not: null },
        gateway: { not: "manual" },
        status: { notIn: ["CANCELLED"] },
        currentPeriodEnd: { lt: soon },
      },
      select: { barbershopId: true },
      take: 200,
    }),
    db.consumerSubscription.findMany({
      where: {
        gatewaySubscriptionId: { not: null },
        gateway: { not: "manual" },
        status: { in: ["PENDING", "ACTIVE", "PAST_DUE"] },
        OR: [{ currentPeriodEnd: null }, { currentPeriodEnd: { lt: soon } }],
      },
      select: { id: true },
      take: 500,
    }),
  ]);

  let synced = 0;
  for (const item of saas)
    await syncSaasSubscription(item.barbershopId)
      .then(() => synced++)
      .catch((error) => console.error("cron saas", item.barbershopId, error));
  for (const item of consumer)
    await syncConsumerSubscription(item.id)
      .then(() => synced++)
      .catch((error) => console.error("cron plan", item.id, error));

  const result = await runBillingMaintenance();
  return NextResponse.json({ synced, ...result });
}
