/**
 * Contrato que qualquer provedor de pagamento precisa cumprir.
 *
 * O resto do sistema (billing, webhooks, telas) só conversa com esta interface.
 * Para trocar o Mercado Pago pela Celcoin, basta criar `celcoin.ts` implementando
 * `PaymentProvider` e trocar o retorno de `getPaymentProvider()` em `index.ts`.
 */

/** Credencial opaca de quem recebe o dinheiro: a plataforma ou uma barbearia conectada. */
export type MerchantCredentials = { accessToken: string };

export type RecurringStatus = "pending" | "active" | "paused" | "cancelled";
export type OneTimeStatus =
  "approved" | "pending" | "rejected" | "refunded" | "cancelled";

export type RecurringCheckoutInput = {
  reason: string;
  externalReference: string;
  payerEmail: string;
  amount: number;
  backUrl: string;
  /** Data da primeira cobrança (ex.: fim do período de teste). Padrão: imediata. */
  startDate?: Date;
};

export type OneTimeCheckoutInput = {
  title: string;
  externalReference: string;
  payerEmail?: string;
  amount: number;
  backUrl: string;
  notificationUrl: string;
};

export type RecurringInfo = {
  id: string;
  status: RecurringStatus;
  externalReference: string | null;
  nextPaymentDate: Date | null;
  amount: number | null;
};

export type PaymentInfo = {
  id: string;
  status: OneTimeStatus;
  amount: number;
  externalReference: string | null;
  method: string | null;
  paidAt: Date | null;
  /** Assinatura recorrente que gerou a cobrança, quando houver. */
  recurringId: string | null;
};

/** Evento normalizado extraído de um webhook já validado. */
export type WebhookEvent = {
  eventId: string;
  kind: "recurring" | "recurring_payment" | "payment" | "unknown";
  resourceId: string;
  /** Identificador do vendedor (conta conectada) que originou o evento. */
  merchantUserId: string | null;
  raw: unknown;
};

export type OAuthTokens = {
  accessToken: string;
  refreshToken: string | null;
  merchantUserId: string;
  publicKey: string | null;
  liveMode: boolean;
  expiresAt: Date | null;
};

export interface PaymentProvider {
  readonly id: string;
  readonly displayName: string;

  /** URL para a barbearia autorizar a plataforma a cobrar em nome dela. */
  getConnectUrl(state: string, redirectUri: string): string;
  exchangeConnectCode(code: string, redirectUri: string): Promise<OAuthTokens>;
  refreshConnection(refreshToken: string): Promise<OAuthTokens>;

  /** Assinatura recorrente no cartão. O cliente digita o cartão na página do provedor. */
  createRecurringCheckout(
    merchant: MerchantCredentials,
    input: RecurringCheckoutInput,
  ): Promise<{ id: string; checkoutUrl: string }>;
  getRecurring(
    merchant: MerchantCredentials,
    id: string,
  ): Promise<RecurringInfo>;
  cancelRecurring(merchant: MerchantCredentials, id: string): Promise<void>;
  /** Busca a cobrança de um ciclo de assinatura (quando o provedor separa esse recurso). */
  getRecurringPayment(
    merchant: MerchantCredentials,
    id: string,
  ): Promise<PaymentInfo | null>;

  /** Cobrança avulsa (Pix ou cartão) em página do provedor. */
  createOneTimeCheckout(
    merchant: MerchantCredentials,
    input: OneTimeCheckoutInput,
  ): Promise<{ id: string; checkoutUrl: string }>;
  getPayment(merchant: MerchantCredentials, id: string): Promise<PaymentInfo>;

  /** Valida a assinatura do webhook e normaliza o evento. Retorna null se for inválido. */
  parseWebhook(request: Request, rawBody: string): Promise<WebhookEvent | null>;
}

export class PaymentProviderError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "PaymentProviderError";
  }
}
