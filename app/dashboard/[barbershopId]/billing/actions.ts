"use server";

import { OWNER_ONLY, assertBarbershopRole } from "@/app/_lib/access";
import { runAction } from "@/app/_lib/actions";
import {
  startSaasPixCheckout,
  startSaasRecurringCheckout,
  syncSaasSubscription,
} from "@/app/_lib/checkout";

const path = (id: string) => `/dashboard/${id}/billing`;

export async function subscribeSaasWithCard(barbershopId: string) {
  await runAction(path(barbershopId), async () => {
    const { user } = await assertBarbershopRole(barbershopId, OWNER_ONLY, {
      allowSuspended: true,
    });
    return {
      redirectTo: await startSaasRecurringCheckout(barbershopId, user.email),
    };
  });
}

export async function paySaasWithPix(barbershopId: string) {
  await runAction(path(barbershopId), async () => {
    const { user } = await assertBarbershopRole(barbershopId, OWNER_ONLY, {
      allowSuspended: true,
    });
    return { redirectTo: await startSaasPixCheckout(barbershopId, user.email) };
  });
}

export async function refreshSaasStatus(barbershopId: string) {
  await runAction(path(barbershopId), async () => {
    await assertBarbershopRole(barbershopId, OWNER_ONLY, {
      allowSuspended: true,
    });
    await syncSaasSubscription(barbershopId);
    return "Status atualizado.";
  });
}
