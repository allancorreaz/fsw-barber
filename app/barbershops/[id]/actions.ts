"use server";

import { redirect } from "next/navigation";
import { runAction, text } from "@/app/_lib/actions";
import { getCurrentUser } from "@/app/_lib/auth";
import { startConsumerCheckout } from "@/app/_lib/checkout";

export async function subscribeToPlan(barbershopId: string, form: FormData) {
  const path = `/barbershops/${barbershopId}`;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(path)}`);
  await runAction(`${path}#planos`, async () => ({
    redirectTo: await startConsumerCheckout(user, text(form, "planId", 60)),
  }));
}
