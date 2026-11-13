import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { requireBarbershopRole } from "@/app/_lib/auth";
import { appUrl, isMercadoPagoConfigured } from "@/app/_lib/config";
import { signPayload } from "@/app/_lib/crypto";
import { getPaymentProvider } from "@/app/_lib/payments";

/** Inicia a conexão da conta Mercado Pago da barbearia (OAuth). Somente o proprietário. */
export async function GET(request: Request) {
  const barbershopId =
    new URL(request.url).searchParams.get("barbershopId") ?? "";
  const { user, membership } = await requireBarbershopRole(barbershopId, [
    "OWNER",
  ]);
  if (!user)
    return NextResponse.redirect(
      new URL(`/login?next=/dashboard/${barbershopId}/settings`, appUrl()),
    );
  if (!membership)
    return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
  if (!isMercadoPagoConfigured()) {
    return NextResponse.redirect(
      new URL(
        `/dashboard/${barbershopId}/settings?error=${encodeURIComponent("Integração não configurada.")}`,
        appUrl(),
      ),
    );
  }
  const state = signPayload(
    { b: barbershopId, u: user.id, n: randomBytes(8).toString("hex") },
    15 * 60,
  );
  return NextResponse.redirect(
    getPaymentProvider().getConnectUrl(
      state,
      `${appUrl()}/api/payments/callback`,
    ),
  );
}
