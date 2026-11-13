import { DashboardShell, Notice } from "@/app/_components/dashboard-shell";
import { Flash } from "@/app/_components/flash";
import { ALL_STAFF, requireDashboard } from "@/app/_lib/access";
import { getPlatformAccess } from "@/app/_lib/billing";
import {
  confirmReturnedPayment,
  syncSaasSubscription,
} from "@/app/_lib/checkout";
import { SAAS } from "@/app/_lib/config";
import { PAYMENT_STATUS_LABEL, brl, formatDate } from "@/app/_lib/format";
import { isPlatformBillingConfigured } from "@/app/_lib/payments/merchants";
import { db } from "@/app/_lib/prisma";
import {
  paySaasWithPix,
  refreshSaasStatus,
  subscribeSaasWithCard,
} from "./actions";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ barbershopId: string }>;
  searchParams: Promise<{
    ok?: string;
    error?: string;
    retorno?: string;
    pagamento?: string;
    payment_id?: string;
  }>;
};

const STATE_TEXT = {
  trial: { tone: "success" as const, title: "Período de teste grátis" },
  active: { tone: "success" as const, title: "Mensalidade em dia" },
  grace: { tone: "warning" as const, title: "Mensalidade em atraso" },
  suspended: { tone: "error" as const, title: "Conta suspensa" },
};

export default async function BillingPage({ params, searchParams }: Props) {
  const { barbershopId } = await params;
  const query = await searchParams;
  let ctx = await requireDashboard(barbershopId, ALL_STAFF, {
    allowSuspended: true,
  });
  const isOwner = ctx.roles.includes("OWNER");

  // Volta do checkout: confere o status direto no gateway (complementa o webhook).
  if (isOwner && (query.retorno || (query.pagamento && query.payment_id))) {
    try {
      if (query.retorno) await syncSaasSubscription(barbershopId);
      if (query.pagamento && query.payment_id)
        await confirmReturnedPayment(query.pagamento, query.payment_id);
      ctx = { ...ctx, access: await getPlatformAccess(barbershopId) };
    } catch (error) {
      console.error("Falha ao conferir retorno do checkout", error);
    }
  }

  const { access } = ctx;
  const sub = access.subscription;
  const payments = await db.billingPayment.findMany({
    where: { saasSubscriptionId: sub.id, status: { not: "PENDING" } },
    orderBy: { createdAt: "desc" },
    take: 24,
  });
  const configured = isPlatformBillingConfigured();
  const cardRegistered =
    Boolean(sub.gatewaySubscriptionId) && sub.status !== "CANCELLED";
  const info = STATE_TEXT[access.state];

  return (
    <DashboardShell
      barbershop={ctx.barbershop}
      roles={ctx.roles}
      userName={ctx.user.name}
      access={access}
      active="billing"
      title="Mensalidade da plataforma"
      description={`${SAAS.planName}: ${brl(sub.amount)}/mês. Inclui painel, agenda, planos, cobrança online e financeiro.`}
    >
      <Flash ok={query.ok} error={query.error} />

      <section className="surface rounded-2xl p-6">
        <Notice tone={info.tone}>
          <strong>{info.title}.</strong>{" "}
          {access.state === "trial" &&
            `Grátis até ${formatDate(sub.currentPeriodEnd)}.`}
          {access.state === "active" &&
            `Pago até ${formatDate(sub.currentPeriodEnd)}.`}
          {access.state === "grace" &&
            `Venceu em ${formatDate(sub.currentPeriodEnd)}. A conta será suspensa em ${formatDate(access.graceEndsAt)}.`}
          {access.state === "suspended" &&
            "O painel, a agenda e a página pública da barbearia estão bloqueados até o pagamento. Nenhum dado foi apagado."}
        </Notice>

        {!isOwner ? (
          <p className="mt-5 text-sm text-neutral-400">
            Somente o proprietário pode gerenciar a mensalidade.
          </p>
        ) : !configured ? (
          <div className="mt-5">
            <Notice tone="warning">
              A cobrança da plataforma ainda não foi configurada pelo
              administrador.
            </Notice>
          </div>
        ) : (
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-white/10 p-5">
              <h2 className="font-bold">Cartão de crédito recorrente</h2>
              <p className="mt-2 text-sm text-neutral-400">
                Cobrança automática todo mês.{" "}
                {access.state === "trial" &&
                  "A primeira cobrança acontece só no fim do teste grátis."}
              </p>
              {cardRegistered ? (
                <div className="mt-4 space-y-3">
                  <p className="text-sm text-[#d8f69c]">
                    Cartão cadastrado. A renovação é automática.
                  </p>
                  <form action={refreshSaasStatus.bind(null, barbershopId)}>
                    <button className="rounded-xl border border-white/10 px-4 py-2.5 text-sm font-semibold">
                      Atualizar status
                    </button>
                  </form>
                </div>
              ) : (
                <form
                  action={subscribeSaasWithCard.bind(null, barbershopId)}
                  className="mt-4"
                >
                  <button className="accent-button rounded-xl px-5 py-3 text-sm font-bold">
                    Assinar com cartão
                  </button>
                </form>
              )}
            </div>
            <div className="rounded-2xl border border-white/10 p-5">
              <h2 className="font-bold">Pix (1 mês)</h2>
              <p className="mt-2 text-sm text-neutral-400">
                Pague um mês por vez via Pix. A liberação é automática após a
                confirmação.
              </p>
              <form
                action={paySaasWithPix.bind(null, barbershopId)}
                className="mt-4"
              >
                <button className="rounded-xl border border-[#c8f169]/30 px-5 py-3 text-sm font-bold text-[#d8f69c] hover:bg-[#c8f169]/10">
                  Pagar {brl(sub.amount)} com Pix
                </button>
              </form>
            </div>
          </div>
        )}
      </section>

      <section className="surface mt-6 rounded-2xl p-6">
        <h2 className="font-bold">Histórico de pagamentos</h2>
        {payments.length === 0 ? (
          <p className="mt-3 text-sm text-neutral-500">
            Nenhum pagamento ainda.
          </p>
        ) : (
          <ul className="mt-4 space-y-2 text-sm">
            {payments.map((payment) => (
              <li
                key={payment.id}
                className="flex justify-between gap-3 border-b border-white/[0.05] pb-2 last:border-0"
              >
                <span>
                  {formatDate(payment.paidAt ?? payment.createdAt)} ·{" "}
                  {payment.description ?? "Mensalidade"}
                </span>
                <span className="tabular-nums">
                  {brl(payment.amount)} · {PAYMENT_STATUS_LABEL[payment.status]}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </DashboardShell>
  );
}
