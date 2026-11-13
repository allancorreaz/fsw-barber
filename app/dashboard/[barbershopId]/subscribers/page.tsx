import type { SubscriptionStatus } from "@prisma/client";
import { DashboardShell, inputClass } from "@/app/_components/dashboard-shell";
import { Flash } from "@/app/_components/flash";
import { FRONT_DESK, requireDashboard } from "@/app/_lib/access";
import { consumerSubscriptionIsUsable } from "@/app/_lib/billing";
import { SUBSCRIPTION_STATUS_LABEL, brl, formatDate } from "@/app/_lib/format";
import { db } from "@/app/_lib/prisma";
import {
  addManualSubscriber,
  cancelSubscriber,
  refreshSubscriber,
} from "./actions";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ barbershopId: string }>;
  searchParams: Promise<{ status?: string; ok?: string; error?: string }>;
};

const FILTERS: Array<{
  key: string;
  label: string;
  statuses: SubscriptionStatus[];
}> = [
  {
    key: "active",
    label: "Ativos",
    statuses: ["ACTIVE", "PAST_DUE", "CANCELLED"],
  },
  { key: "pending", label: "Aguardando pagamento", statuses: ["PENDING"] },
  { key: "ended", label: "Encerrados", statuses: ["EXPIRED", "SUSPENDED"] },
];

export default async function SubscribersPage({ params, searchParams }: Props) {
  const { barbershopId } = await params;
  const query = await searchParams;
  const ctx = await requireDashboard(barbershopId, FRONT_DESK);
  const canCancel = ctx.roles.some(
    (role) => role === "OWNER" || role === "MANAGER",
  );
  const filter =
    FILTERS.find((item) => item.key === query.status) ?? FILTERS[0];

  const [subs, plans] = await Promise.all([
    db.consumerSubscription.findMany({
      where: { barbershopId, status: { in: filter.statuses } },
      include: {
        user: { select: { name: true, email: true } },
        plan: { select: { name: true } },
      },
      orderBy: { currentPeriodEnd: "desc" },
      take: 300,
    }),
    db.consumerPlan.findMany({
      where: { barbershopId, active: true },
      select: { id: true, name: true, price: true },
      orderBy: { price: "asc" },
    }),
  ]);
  const visible =
    filter.key === "active"
      ? subs.filter((sub) => consumerSubscriptionIsUsable(sub))
      : subs;

  return (
    <DashboardShell
      barbershop={ctx.barbershop}
      roles={ctx.roles}
      userName={ctx.user.name}
      access={ctx.access}
      active="subscribers"
      title="Assinantes"
      description="Clientes com plano. Só eles conseguem agendar."
    >
      <Flash ok={query.ok} error={query.error} />

      {plans.length > 0 && (
        <details className="surface mb-6 rounded-2xl p-6">
          <summary className="cursor-pointer font-bold">
            + Registrar assinatura paga no balcão
          </summary>
          <p className="mt-2 text-sm text-neutral-400">
            Use quando o cliente pagou em dinheiro, maquininha ou Pix direto. O
            cliente precisa ter conta na plataforma.
          </p>
          <form
            action={addManualSubscriber.bind(null, barbershopId)}
            className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_120px_auto] sm:items-end"
          >
            <label className="text-sm">
              E-mail do cliente
              <input
                name="email"
                type="email"
                required
                className={`${inputClass} mt-1`}
              />
            </label>
            <label className="text-sm">
              Plano
              <select name="planId" required className={`${inputClass} mt-1`}>
                {plans.map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.name} · {brl(plan.price)}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              Meses
              <input
                name="months"
                type="number"
                min={1}
                max={12}
                defaultValue={1}
                required
                className={`${inputClass} mt-1`}
              />
            </label>
            <button className="accent-button rounded-xl px-4 py-2.5 text-sm font-bold">
              Ativar
            </button>
          </form>
        </details>
      )}

      <div className="mb-4 flex gap-2">
        {FILTERS.map((item) => (
          <a
            key={item.key}
            href={`?status=${item.key}`}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold ${item.key === filter.key ? "bg-[#c8f169] text-black" : "border border-white/10 text-neutral-400"}`}
          >
            {item.label}
          </a>
        ))}
      </div>

      {visible.length === 0 ? (
        <div className="surface rounded-2xl p-8 text-center text-sm text-neutral-400">
          Nenhuma assinatura nesta lista.
        </div>
      ) : (
        <div className="surface overflow-x-auto rounded-2xl">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="text-xs text-neutral-500">
              <tr className="border-b border-white/[0.07]">
                <th className="p-4 font-semibold">Cliente</th>
                <th className="p-4 font-semibold">Plano</th>
                <th className="p-4 font-semibold">Situação</th>
                <th className="p-4 font-semibold">Pago até</th>
                <th className="p-4 font-semibold">Cobrança</th>
                <th className="p-4" />
              </tr>
            </thead>
            <tbody>
              {visible.map((sub) => (
                <tr
                  key={sub.id}
                  className="border-b border-white/[0.05] last:border-0"
                >
                  <td className="p-4">
                    <p className="font-semibold">{sub.user.name}</p>
                    <p className="text-xs text-neutral-500">{sub.user.email}</p>
                  </td>
                  <td className="p-4">
                    {sub.plan.name}
                    <p className="text-xs text-neutral-500">
                      {brl(sub.amount)}/mês
                    </p>
                  </td>
                  <td className="p-4">
                    {sub.status === "CANCELLED"
                      ? "Não renova"
                      : SUBSCRIPTION_STATUS_LABEL[sub.status]}
                  </td>
                  <td className="p-4 tabular-nums">
                    {formatDate(sub.currentPeriodEnd)}
                  </td>
                  <td className="p-4 text-xs text-neutral-400">
                    {sub.gateway === "manual"
                      ? "Balcão"
                      : "Cartão (recorrente)"}
                  </td>
                  <td className="p-4">
                    <div className="flex justify-end gap-2">
                      {sub.gateway !== "manual" &&
                        sub.gatewaySubscriptionId && (
                          <form
                            action={refreshSubscriber.bind(null, barbershopId)}
                          >
                            <input
                              type="hidden"
                              name="subscriptionId"
                              value={sub.id}
                            />
                            <button className="rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-neutral-300 hover:text-white">
                              Atualizar
                            </button>
                          </form>
                        )}
                      {canCancel &&
                        ["ACTIVE", "PAST_DUE", "PENDING"].includes(
                          sub.status,
                        ) && (
                          <form
                            action={cancelSubscriber.bind(null, barbershopId)}
                          >
                            <input
                              type="hidden"
                              name="subscriptionId"
                              value={sub.id}
                            />
                            <button className="rounded-lg border border-red-400/20 px-2.5 py-1.5 text-xs text-red-200 hover:bg-red-400/10">
                              Cancelar
                            </button>
                          </form>
                        )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </DashboardShell>
  );
}
