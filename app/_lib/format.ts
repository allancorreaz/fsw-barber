export const TIMEZONE = "America/Sao_Paulo";

export function brl(
  value: number | string | { toString(): string } | null | undefined,
) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(value ?? 0));
}

export function formatDate(date: Date | null | undefined) {
  if (!date) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: TIMEZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

export function formatDateTime(date: Date | null | undefined) {
  if (!date) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: TIMEZONE,
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatTime(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

/** "AAAA-MM-DD" no fuso de São Paulo. */
export function localDateKey(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** Início do dia local (São Paulo, UTC-3 sem horário de verão). */
export function startOfLocalDay(key: string) {
  return new Date(`${key}T00:00:00.000-03:00`);
}

export const BOOKING_STATUS_LABEL: Record<string, string> = {
  REQUESTED: "Aguardando confirmação",
  CONFIRMED: "Confirmado",
  IN_PROGRESS: "Em atendimento",
  COMPLETED: "Concluído",
  CANCELLED: "Cancelado",
  NO_SHOW: "Não compareceu",
};

export const SUBSCRIPTION_STATUS_LABEL: Record<string, string> = {
  PENDING: "Aguardando pagamento",
  ACTIVE: "Ativa",
  PAST_DUE: "Pagamento atrasado",
  CANCELLED: "Cancelada",
  EXPIRED: "Expirada",
  SUSPENDED: "Suspensa",
};

export const PAYMENT_STATUS_LABEL: Record<string, string> = {
  PENDING: "Pendente",
  CONFIRMED: "Pago",
  FAILED: "Recusado",
  REFUNDED: "Estornado",
  CANCELLED: "Cancelado",
};
