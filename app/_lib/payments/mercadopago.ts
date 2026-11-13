import "server-only";
import { createHmac, randomUUID } from "node:crypto";
import { mercadoPagoConfig } from "@/app/_lib/config";
import { safeEqualHex } from "@/app/_lib/crypto";
import {
  PaymentProviderError,
  type MerchantCredentials,
  type OAuthTokens,
  type OneTimeStatus,
  type PaymentInfo,
  type PaymentProvider,
  type RecurringInfo,
  type RecurringStatus,
  type WebhookEvent,
} from "@/app/_lib/payments/types";

const API = "https://api.mercadopago.com";

async function mpFetch<T>(
  token: string,
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  const method = init.method ?? "GET";
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(method === "POST" ? { "X-Idempotency-Key": randomUUID() } : {}),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  const text = await response.text();
  const data = text ? (JSON.parse(text) as unknown) : null;
  if (!response.ok) {
    const message =
      (data as { message?: string } | null)?.message ??
      `HTTP ${response.status}`;
    throw new PaymentProviderError(
      `Mercado Pago: ${message}`,
      response.status,
      data,
    );
  }
  return data as T;
}

function mapRecurringStatus(status: string | undefined): RecurringStatus {
  if (status === "authorized") return "active";
  if (status === "paused") return "paused";
  if (status === "cancelled" || status === "finished") return "cancelled";
  return "pending";
}

function mapPaymentStatus(status: string | undefined): OneTimeStatus {
  switch (status) {
    case "approved":
      return "approved";
    case "rejected":
      return "rejected";
    case "refunded":
    case "charged_back":
      return "refunded";
    case "cancelled":
      return "cancelled";
    default:
      return "pending";
  }
}

function pickCheckoutUrl(
  token: string,
  data: { init_point?: string; sandbox_init_point?: string },
) {
  const url = token.startsWith("TEST-")
    ? (data.sandbox_init_point ?? data.init_point)
    : data.init_point;
  if (!url)
    throw new PaymentProviderError(
      "Mercado Pago não retornou o link de pagamento.",
    );
  return url;
}

type MpTokenResponse = {
  access_token: string;
  refresh_token?: string;
  user_id: number | string;
  public_key?: string;
  live_mode?: boolean;
  expires_in?: number;
};

async function requestToken(
  body: Record<string, string>,
): Promise<OAuthTokens> {
  const config = mercadoPagoConfig();
  const response = await fetch(`${API}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      ...(config.testMode ? { test_token: "true" } : {}),
      ...body,
    }),
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  const data = (await response.json().catch(() => null)) as
    (MpTokenResponse & { message?: string }) | null;
  if (!response.ok || !data?.access_token) {
    throw new PaymentProviderError(
      `Falha na autorização do Mercado Pago: ${data?.message ?? response.status}`,
      response.status,
      data,
    );
  }
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? null,
    merchantUserId: String(data.user_id),
    publicKey: data.public_key ?? null,
    liveMode: Boolean(data.live_mode),
    expiresAt: data.expires_in
      ? new Date(Date.now() + data.expires_in * 1000)
      : null,
  };
}

type MpPayment = {
  id: number;
  status?: string;
  transaction_amount?: number;
  external_reference?: string | null;
  payment_method_id?: string;
  payment_type_id?: string;
  date_approved?: string | null;
  metadata?: { preapproval_id?: string } | null;
  point_of_interaction?: {
    transaction_data?: { subscription_id?: string };
  } | null;
};

function toPaymentInfo(payment: MpPayment): PaymentInfo {
  return {
    id: String(payment.id),
    status: mapPaymentStatus(payment.status),
    amount: Number(payment.transaction_amount ?? 0),
    externalReference: payment.external_reference ?? null,
    method:
      payment.payment_method_id === "pix"
        ? "pix"
        : (payment.payment_type_id ?? payment.payment_method_id ?? null),
    paidAt: payment.date_approved ? new Date(payment.date_approved) : null,
    recurringId:
      payment.metadata?.preapproval_id ??
      payment.point_of_interaction?.transaction_data?.subscription_id ??
      null,
  };
}

/** Valida o cabeçalho x-signature conforme a documentação de webhooks do Mercado Pago. */
export function verifyMercadoPagoSignature(params: {
  secret: string;
  signatureHeader: string | null;
  requestId: string | null;
  dataId: string | null;
}) {
  if (!params.signatureHeader) return false;
  const parts = Object.fromEntries(
    params.signatureHeader.split(",").map((part) => {
      const [key, ...value] = part.split("=");
      return [key.trim(), value.join("=").trim()];
    }),
  );
  const ts = parts.ts;
  const v1 = parts.v1;
  if (!ts || !v1) return false;

  const id =
    params.dataId && /^[a-z0-9]+$/i.test(params.dataId)
      ? params.dataId.toLowerCase()
      : params.dataId;
  let manifest = "";
  if (id) manifest += `id:${id};`;
  if (params.requestId) manifest += `request-id:${params.requestId};`;
  manifest += `ts:${ts};`;

  const expected = createHmac("sha256", params.secret)
    .update(manifest)
    .digest("hex");
  return safeEqualHex(expected, v1);
}

export const mercadoPagoProvider: PaymentProvider = {
  id: "mercadopago",
  displayName: "Mercado Pago",

  getConnectUrl(state, redirectUri) {
    const url = new URL("https://auth.mercadopago.com/authorization");
    url.searchParams.set("client_id", mercadoPagoConfig().clientId);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("platform_id", "mp");
    url.searchParams.set("state", state);
    url.searchParams.set("redirect_uri", redirectUri);
    return url.toString();
  },

  exchangeConnectCode(code, redirectUri) {
    return requestToken({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    });
  },

  refreshConnection(refreshToken) {
    return requestToken({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    });
  },

  async createRecurringCheckout(merchant: MerchantCredentials, input) {
    const data = await mpFetch<{
      id: string;
      init_point?: string;
      sandbox_init_point?: string;
    }>(merchant.accessToken, "/preapproval", {
      method: "POST",
      body: {
        reason: input.reason.slice(0, 250),
        external_reference: input.externalReference,
        payer_email: input.payerEmail,
        back_url: input.backUrl,
        status: "pending",
        auto_recurring: {
          frequency: 1,
          frequency_type: "months",
          ...(input.startDate && input.startDate > new Date()
            ? { start_date: input.startDate.toISOString() }
            : {}),
          transaction_amount: Number(input.amount.toFixed(2)),
          currency_id: "BRL",
        },
      },
    });
    return {
      id: data.id,
      checkoutUrl: pickCheckoutUrl(merchant.accessToken, data),
    };
  },

  async getRecurring(merchant, id): Promise<RecurringInfo> {
    const data = await mpFetch<{
      id: string;
      status?: string;
      external_reference?: string | null;
      next_payment_date?: string | null;
      auto_recurring?: { transaction_amount?: number };
    }>(merchant.accessToken, `/preapproval/${encodeURIComponent(id)}`);
    return {
      id: data.id,
      status: mapRecurringStatus(data.status),
      externalReference: data.external_reference ?? null,
      nextPaymentDate: data.next_payment_date
        ? new Date(data.next_payment_date)
        : null,
      amount: data.auto_recurring?.transaction_amount ?? null,
    };
  },

  async cancelRecurring(merchant, id) {
    await mpFetch(
      merchant.accessToken,
      `/preapproval/${encodeURIComponent(id)}`,
      { method: "PUT", body: { status: "cancelled" } },
    );
  },

  async getRecurringPayment(merchant, id) {
    const data = await mpFetch<{
      id: number;
      preapproval_id?: string;
      transaction_amount?: number;
      external_reference?: string | null;
      payment?: { id?: number; status?: string } | null;
      date_created?: string;
    }>(merchant.accessToken, `/authorized_payments/${encodeURIComponent(id)}`);
    if (!data.payment?.id) return null;
    return {
      id: String(data.payment.id),
      status: mapPaymentStatus(data.payment.status),
      amount: Number(data.transaction_amount ?? 0),
      externalReference: data.external_reference ?? null,
      method: "credit_card",
      paidAt:
        data.payment.status === "approved"
          ? new Date(data.date_created ?? Date.now())
          : null,
      recurringId: data.preapproval_id ?? null,
    };
  },

  async createOneTimeCheckout(merchant, input) {
    const data = await mpFetch<{
      id: string;
      init_point?: string;
      sandbox_init_point?: string;
    }>(merchant.accessToken, "/checkout/preferences", {
      method: "POST",
      body: {
        items: [
          {
            id: input.externalReference,
            title: input.title.slice(0, 250),
            quantity: 1,
            unit_price: Number(input.amount.toFixed(2)),
            currency_id: "BRL",
          },
        ],
        ...(input.payerEmail ? { payer: { email: input.payerEmail } } : {}),
        external_reference: input.externalReference,
        notification_url: input.notificationUrl,
        back_urls: {
          success: input.backUrl,
          pending: input.backUrl,
          failure: input.backUrl,
        },
        auto_return: "approved",
      },
    });
    return {
      id: data.id,
      checkoutUrl: pickCheckoutUrl(merchant.accessToken, data),
    };
  },

  async getPayment(merchant, id) {
    return toPaymentInfo(
      await mpFetch<MpPayment>(
        merchant.accessToken,
        `/v1/payments/${encodeURIComponent(id)}`,
      ),
    );
  },

  async parseWebhook(request, rawBody): Promise<WebhookEvent | null> {
    const url = new URL(request.url);
    let body: {
      id?: string | number;
      type?: string;
      action?: string;
      user_id?: string | number;
      data?: { id?: string | number };
    } = {};
    try {
      body = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      return null;
    }

    const type = body.type ?? url.searchParams.get("type") ?? "";
    const resourceId = String(
      body.data?.id ?? url.searchParams.get("data.id") ?? "",
    );
    if (!type || !resourceId) return null;

    const secret = mercadoPagoConfig().webhookSecret;
    if (secret) {
      const valid = verifyMercadoPagoSignature({
        secret,
        signatureHeader: request.headers.get("x-signature"),
        requestId: request.headers.get("x-request-id"),
        dataId: url.searchParams.get("data.id") ?? resourceId,
      });
      if (!valid) return null;
    } else if (process.env.NODE_ENV === "production") {
      // Em produção, sem segredo configurado, não aceitamos eventos.
      return null;
    }

    const kind: WebhookEvent["kind"] =
      type === "payment"
        ? "payment"
        : type === "subscription_preapproval" || type === "preapproval"
          ? "recurring"
          : type === "subscription_authorized_payment" ||
              type === "authorized_payment"
            ? "recurring_payment"
            : "unknown";

    return {
      eventId: String(
        body.id ??
          `${type}:${resourceId}:${body.action ?? ""}:${request.headers.get("x-request-id") ?? ""}`,
      ),
      kind,
      resourceId,
      merchantUserId: body.user_id ? String(body.user_id) : null,
      raw: body,
    };
  },
};
