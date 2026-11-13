import "server-only";
import { mercadoPagoConfig } from "@/app/_lib/config";
import { decrypt, encrypt } from "@/app/_lib/crypto";
import { db } from "@/app/_lib/prisma";
import {
  getPaymentProvider,
  PaymentProviderError,
  type MerchantCredentials,
  type OAuthTokens,
} from "@/app/_lib/payments";

/** Renova o token quando faltar menos que isso para expirar. */
const REFRESH_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/** Conta da plataforma: recebe a mensalidade das barbearias. */
export function platformMerchant(): MerchantCredentials {
  const token = mercadoPagoConfig().platformAccessToken;
  if (!token)
    throw new PaymentProviderError(
      "Cobrança da plataforma não configurada (MP_PLATFORM_ACCESS_TOKEN).",
    );
  return { accessToken: token };
}

export function isPlatformBillingConfigured() {
  return Boolean(mercadoPagoConfig().platformAccessToken);
}

export async function saveBarbershopConnection(
  barbershopId: string,
  tokens: OAuthTokens,
) {
  const data = {
    mpUserId: tokens.merchantUserId,
    accessTokenEnc: encrypt(tokens.accessToken),
    refreshTokenEnc: tokens.refreshToken ? encrypt(tokens.refreshToken) : null,
    publicKey: tokens.publicKey,
    liveMode: tokens.liveMode,
    expiresAt: tokens.expiresAt,
  };
  await db.mercadoPagoAccount.upsert({
    where: { barbershopId },
    create: { barbershopId, ...data },
    update: data,
  });
}

/** Credencial da barbearia conectada (renova o token automaticamente quando perto de vencer). */
export async function barbershopMerchant(
  barbershopId: string,
): Promise<MerchantCredentials | null> {
  const account = await db.mercadoPagoAccount.findUnique({
    where: { barbershopId },
  });
  if (!account) return null;

  const nearExpiry =
    account.expiresAt &&
    account.expiresAt.getTime() - Date.now() < REFRESH_WINDOW_MS;
  if (nearExpiry && account.refreshTokenEnc) {
    try {
      const tokens = await getPaymentProvider().refreshConnection(
        decrypt(account.refreshTokenEnc),
      );
      await saveBarbershopConnection(barbershopId, tokens);
      return { accessToken: tokens.accessToken };
    } catch (error) {
      console.error(
        "Falha ao renovar token do Mercado Pago",
        barbershopId,
        error,
      );
      if (account.expiresAt && account.expiresAt < new Date()) return null;
    }
  }
  return { accessToken: decrypt(account.accessTokenEnc) };
}

/** Descobre de quem é um evento de webhook: de uma barbearia conectada ou da plataforma. */
export async function merchantForWebhook(merchantUserId: string | null) {
  if (merchantUserId) {
    const account = await db.mercadoPagoAccount.findFirst({
      where: { mpUserId: merchantUserId },
      select: { barbershopId: true },
    });
    if (account) {
      const credentials = await barbershopMerchant(account.barbershopId);
      if (credentials)
        return {
          credentials,
          barbershopId: account.barbershopId as string | null,
        };
    }
  }
  if (!isPlatformBillingConfigured()) return null;
  return { credentials: platformMerchant(), barbershopId: null };
}
