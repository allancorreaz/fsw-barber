import "server-only";

/** Raio da busca de barbearias próximas. Fonte única da verdade. */
export const NEARBY_RADIUS_KM = 10;

/** Regras comerciais da mensalidade da plataforma (SaaS) cobrada das barbearias. */
export const SAAS = {
  planName: "Plano Barbearia",
  price: Number(process.env.SAAS_MONTHLY_PRICE ?? "79.90"),
  trialDays: Number(process.env.SAAS_TRIAL_DAYS ?? "14"),
  /** Dias de tolerância após o vencimento antes de suspender a conta. */
  graceDays: Number(process.env.SAAS_GRACE_DAYS ?? "5"),
};

export function appUrl() {
  const raw =
    process.env.APP_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "http://localhost:3000");
  return raw.replace(/\/$/, "");
}

export function platformAdminEmails() {
  return (process.env.PLATFORM_ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function mercadoPagoConfig() {
  return {
    clientId: process.env.MP_CLIENT_ID ?? "",
    clientSecret: process.env.MP_CLIENT_SECRET ?? "",
    /** Access token da conta Mercado Pago da plataforma (recebe as mensalidades SaaS). */
    platformAccessToken: process.env.MP_PLATFORM_ACCESS_TOKEN ?? "",
    webhookSecret: process.env.MP_WEBHOOK_SECRET ?? "",
    /** "true" para obter tokens de teste no OAuth (ambiente sandbox). */
    testMode: process.env.MP_TEST_MODE === "true",
  };
}

export function isMercadoPagoConfigured() {
  const config = mercadoPagoConfig();
  return Boolean(config.clientId && config.clientSecret);
}
