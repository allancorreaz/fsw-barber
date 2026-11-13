import "server-only";
import { mercadoPagoProvider } from "@/app/_lib/payments/mercadopago";
import type { PaymentProvider } from "@/app/_lib/payments/types";

/**
 * Provedor de pagamento ativo. Para migrar para a Celcoin:
 * 1. crie `app/_lib/payments/celcoin.ts` implementando `PaymentProvider`;
 * 2. retorne-o aqui quando PAYMENT_PROVIDER=celcoin.
 */
export function getPaymentProvider(): PaymentProvider {
  switch (process.env.PAYMENT_PROVIDER ?? "mercadopago") {
    case "mercadopago":
      return mercadoPagoProvider;
    default:
      throw new Error(
        `Provedor de pagamento desconhecido: ${process.env.PAYMENT_PROVIDER}`,
      );
  }
}

export * from "@/app/_lib/payments/types";
