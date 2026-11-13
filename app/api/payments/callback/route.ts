import { NextResponse } from "next/server";
import { getCurrentUser } from "@/app/_lib/auth";
import { appUrl } from "@/app/_lib/config";
import { verifySignedPayload } from "@/app/_lib/crypto";
import { getPaymentProvider } from "@/app/_lib/payments";
import { saveBarbershopConnection } from "@/app/_lib/payments/merchants";
import { db } from "@/app/_lib/prisma";

/** Retorno do OAuth: troca o código pelo token e guarda cifrado. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const state = verifySignedPayload<{ b: string; u: string }>(
    url.searchParams.get("state") ?? "",
  );
  const back = (barbershopId: string, key: "ok" | "error", message: string) =>
    NextResponse.redirect(
      new URL(
        `/dashboard/${barbershopId}/settings?${key}=${encodeURIComponent(message)}`,
        appUrl(),
      ),
    );

  if (!state) return NextResponse.redirect(new URL("/account", appUrl()));
  const user = await getCurrentUser();
  const owner =
    user?.id === state.u &&
    user.memberships.some(
      (item) => item.barbershopId === state.b && item.role === "OWNER",
    );
  if (!owner)
    return back(
      state.b,
      "error",
      "Entre com a conta do proprietário para concluir a conexão.",
    );

  const code = url.searchParams.get("code");
  if (!code)
    return back(
      state.b,
      "error",
      "A conexão com o Mercado Pago foi cancelada.",
    );

  try {
    const tokens = await getPaymentProvider().exchangeConnectCode(
      code,
      `${appUrl()}/api/payments/callback`,
    );
    const usedElsewhere = await db.mercadoPagoAccount.findFirst({
      where: {
        mpUserId: tokens.merchantUserId,
        barbershopId: { not: state.b },
      },
    });
    if (usedElsewhere)
      return back(
        state.b,
        "error",
        "Essa conta Mercado Pago já está conectada a outra barbearia.",
      );
    await saveBarbershopConnection(state.b, tokens);
    return back(
      state.b,
      "ok",
      "Mercado Pago conectado. Os clientes já podem assinar os planos.",
    );
  } catch (error) {
    console.error("OAuth Mercado Pago falhou", error);
    return back(
      state.b,
      "error",
      "Não foi possível conectar ao Mercado Pago. Tente novamente.",
    );
  }
}
