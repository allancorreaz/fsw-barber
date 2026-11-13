import { DashboardShell } from "@/app/_components/dashboard-shell";
import { MANAGEMENT, requireDashboard } from "@/app/_lib/access";
import { consumerSubscriptionIsUsable } from "@/app/_lib/billing";
import {
  brl,
  formatDate,
  localDateKey,
  startOfLocalDay,
} from "@/app/_lib/format";
import { db } from "@/app/_lib/prisma";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ barbershopId: string }>;
  searchParams: Promise<{ period?: string }>;
};

const PERIODS = [
  { key: "30d", label: "Últimos 30 dias" },
  { key: "month", label: "Este mês" },
  { key: "prev", label: "Mês passado" },
] as const;

function range(period: string) {
  const today = localDateKey();
  const [year, month] = today.split("-").map(Number);
  const monthKey = (y: number, m: number) =>
    `${y}-${String(m).padStart(2, "0")}-01`;
  if (period === "month") {
    const start = startOfLocalDay(monthKey(year, month));
    return { start, end: new Date() };
  }
  if (period === "prev") {
    const prevYear = month === 1 ? year - 1 : year;
    const prevMonth = month === 1 ? 12 : month - 1;
    return {
      start: startOfLocalDay(monthKey(prevYear, prevMonth)),
      end: startOfLocalDay(monthKey(year, month)),
    };
  }
  const end = new Date();
  return { start: new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000), end };
}

const METHOD_LABEL: Record<string, string> = {
  pix: "Pix",
  credit_card: "Cartão de crédito",
  debit_card: "Cartão de débito",
  cartao: "Cartão (balcão)",
  dinheiro: "Dinheiro",
  presencial: "Balcão",
  account_money: "Saldo Mercado Pago",
};

export default async function FinancePage({ params, searchParams }: Props) {
  const { barbershopId } = await params;
  const { period = "30d" } = await searchParams;
  const ctx = await requireDashboard(barbershopId, MANAGEMENT);
  const { start, end } = range(period);

  const [payments, subs, bookings] = await Promise.all([
    db.billingPayment.findMany({
      where: {
        barbershopId,
        purpose: { in: ["CONSUMER_PLAN", "SERVICE"] },
        status: "CONFIRMED",
        paidAt: { gte: start, lt: end },
      },
      select: {
        amount: true,
        purpose: true,
        method: true,
        paidAt: true,
        userId: true,
      },
    }),
    db.consumerSubscription.findMany({
      where: { barbershopId },
      select: {
        status: true,
        amount: true,
        currentPeriodEnd: true,
        currentPeriodStart: true,
        cancelledAt: true,
        createdAt: true,
        plan: { select: { name: true } },
      },
    }),
    db.booking.findMany({
      where: {
        barbershopId,
        OR: [
          { date: { gte: start, lt: end } },
          { createdAt: { gte: start, lt: end } },
        ],
      },
      select: {
        status: true,
        userId: true,
        coveredByPlan: true,
        date: true,
        createdAt: true,
        professional: { select: { name: true } },
      },
    }),
  ]);

  const sum = (rows: typeof payments) =>
    rows.reduce((total, row) => total + Number(row.amount), 0);
  const total = sum(payments);
  const planRevenue = sum(
    payments.filter((row) => row.purpose === "CONSUMER_PLAN"),
  );
  const serviceRevenue = sum(
    payments.filter((row) => row.purpose === "SERVICE"),
  );

  const activeSubs = subs.filter(
    (sub) => consumerSubscriptionIsUsable(sub) && sub.status !== "CANCELLED",
  );
  const mrr = activeSubs.reduce((acc, sub) => acc + Number(sub.amount ?? 0), 0);
  const newSubs = subs.filter(
    (sub) =>
      sub.currentPeriodStart &&
      sub.createdAt >= start &&
      sub.createdAt < end &&
      sub.status !== "PENDING",
  ).length;
  const cancellations = subs.filter(
    (sub) =>
      sub.cancelledAt && sub.cancelledAt >= start && sub.cancelledAt < end,
  ).length;

  // Atendimentos contam pela data em que acontecem; o ranking "mais agendam" conta pela data do pedido.
  const inPeriod = (date: Date) => date >= start && date < end;
  const completed = bookings.filter(
    (booking) => booking.status === "COMPLETED" && inPeriod(booking.date),
  );
  const noShows = bookings.filter(
    (booking) => booking.status === "NO_SHOW" && inPeriod(booking.date),
  ).length;

  const byMethod = new Map<string, number>();
  for (const row of payments) {
    const key = METHOD_LABEL[row.method ?? ""] ?? "Outros";
    byMethod.set(key, (byMethod.get(key) ?? 0) + Number(row.amount));
  }

  const byPlan = new Map<string, number>();
  for (const sub of activeSubs)
    byPlan.set(sub.plan.name, (byPlan.get(sub.plan.name) ?? 0) + 1);

  const byProfessional = new Map<string, number>();
  for (const booking of completed) {
    const key = booking.professional?.name ?? "Sem profissional";
    byProfessional.set(key, (byProfessional.get(key) ?? 0) + 1);
  }

  // Ranking de clientes
  const visits = new Map<string, number>();
  for (const booking of bookings)
    if (booking.status !== "CANCELLED" && inPeriod(booking.createdAt))
      visits.set(booking.userId, (visits.get(booking.userId) ?? 0) + 1);
  const extraSpend = new Map<string, number>();
  for (const row of payments)
    if (row.purpose === "SERVICE" && row.userId)
      extraSpend.set(
        row.userId,
        (extraSpend.get(row.userId) ?? 0) + Number(row.amount),
      );
  const topVisits = [...visits.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  const topSpend = [...extraSpend.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  const userIds = [...new Set([...topVisits, ...topSpend].map(([id]) => id))];
  const users = userIds.length
    ? await db.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true, email: true },
      })
    : [];
  const userName = new Map(users.map((user) => [user.id, user]));

  // Receita por dia
  const daily = new Map<string, number>();
  for (const row of payments)
    if (row.paidAt) {
      const key = localDateKey(row.paidAt);
      daily.set(key, (daily.get(key) ?? 0) + Number(row.amount));
    }
  const days: Array<{ key: string; value: number }> = [];
  for (
    let cursor = new Date(start.getTime() + 12 * 3600_000);
    cursor < end;
    cursor = new Date(cursor.getTime() + 86_400_000)
  ) {
    const key = localDateKey(cursor);
    if (!days.some((day) => day.key === key))
      days.push({ key, value: daily.get(key) ?? 0 });
  }
  const maxDay = Math.max(1, ...days.map((day) => day.value));

  const kpis = [
    {
      label: "Receita recebida",
      value: brl(total),
      hint: `${formatDate(start)} a ${formatDate(new Date(end.getTime() - 1))}`,
    },
    {
      label: "Receita de planos",
      value: brl(planRevenue),
      hint: "Mensalidades dos clientes",
    },
    {
      label: "Serviços avulsos",
      value: brl(serviceRevenue),
      hint: "Pagos à parte do plano",
    },
    {
      label: "Receita recorrente (MRR)",
      value: brl(mrr),
      hint: `${activeSubs.length} assinantes ativos`,
    },
    {
      label: "Novas assinaturas",
      value: String(newSubs),
      hint: `${cancellations} cancelamentos no período`,
    },
    {
      label: "Atendimentos concluídos",
      value: String(completed.length),
      hint: `${noShows} faltas · ${completed.filter((booking) => booking.coveredByPlan).length} pelo plano`,
    },
  ];

  return (
    <DashboardShell
      barbershop={ctx.barbershop}
      roles={ctx.roles}
      userName={ctx.user.name}
      access={ctx.access}
      active="finance"
      title="Financeiro"
      description="Visível apenas para proprietário e gerente."
      actions={
        <div className="flex gap-2">
          {PERIODS.map((item) => (
            <a
              key={item.key}
              href={`?period=${item.key}`}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold ${item.key === period ? "bg-[#c8f169] text-black" : "border border-white/10 text-neutral-400"}`}
            >
              {item.label}
            </a>
          ))}
        </div>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {kpis.map((kpi) => (
          <article key={kpi.label} className="surface rounded-2xl p-5">
            <p className="text-sm text-neutral-400">{kpi.label}</p>
            <p className="mt-2 text-2xl font-black tabular-nums">{kpi.value}</p>
            <p className="mt-1 text-xs text-neutral-500">{kpi.hint}</p>
          </article>
        ))}
      </div>

      <article className="surface mt-6 rounded-2xl p-6">
        <h2 className="font-bold">Receita por dia</h2>
        <div
          className="mt-5 flex h-40 items-end gap-[3px]"
          role="img"
          aria-label="Gráfico de receita diária"
        >
          {days.map((day) => (
            <div
              key={day.key}
              className="group relative flex h-full flex-1 items-end"
            >
              <div
                className="w-full rounded-t bg-[#c8f169]/80 transition group-hover:bg-[#c8f169]"
                style={{
                  height: `${Math.max(day.value > 0 ? 3 : 1, (day.value / maxDay) * 100)}%`,
                  opacity: day.value > 0 ? 1 : 0.15,
                }}
              />
              <span className="pointer-events-none absolute -top-8 left-1/2 hidden -translate-x-1/2 rounded bg-black px-2 py-1 text-[10px] whitespace-nowrap group-hover:block">
                {day.key.slice(8)}/{day.key.slice(5, 7)} · {brl(day.value)}
              </span>
            </div>
          ))}
        </div>
      </article>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Ranking
          title="Clientes que mais agendam"
          empty="Sem agendamentos no período."
          rows={topVisits.map(([id, count]) => ({
            id,
            name: userName.get(id)?.name ?? "—",
            detail: userName.get(id)?.email ?? "",
            value: `${count} ${count === 1 ? "visita" : "visitas"}`,
          }))}
        />
        <Ranking
          title="Clientes que mais gastam com avulsos"
          empty="Nenhum serviço avulso pago no período."
          rows={topSpend.map(([id, value]) => ({
            id,
            name: userName.get(id)?.name ?? "—",
            detail: userName.get(id)?.email ?? "",
            value: brl(value),
          }))}
        />
        <Breakdown
          title="Recebido por forma de pagamento"
          rows={[...byMethod.entries()].map(([label, value]) => ({
            label,
            value: brl(value),
          }))}
          empty="Nada recebido no período."
        />
        <Breakdown
          title="Assinantes ativos por plano"
          rows={[...byPlan.entries()].map(([label, value]) => ({
            label,
            value: String(value),
          }))}
          empty="Nenhum assinante ativo."
        />
        <Breakdown
          title="Atendimentos concluídos por profissional"
          rows={[...byProfessional.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([label, value]) => ({ label, value: String(value) }))}
          empty="Nenhum atendimento concluído."
        />
      </div>
    </DashboardShell>
  );
}

function Ranking({
  title,
  rows,
  empty,
}: {
  title: string;
  empty: string;
  rows: Array<{ id: string; name: string; detail: string; value: string }>;
}) {
  return (
    <article className="surface rounded-2xl p-6">
      <h2 className="font-bold">{title}</h2>
      {rows.length === 0 ? (
        <p className="mt-4 text-sm text-neutral-500">{empty}</p>
      ) : (
        <ol className="mt-4 space-y-3">
          {rows.map((row, index) => (
            <li key={row.id} className="flex items-center gap-3 text-sm">
              <span className="w-5 text-xs text-neutral-500 tabular-nums">
                {index + 1}.
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{row.name}</span>
                <span className="block truncate text-xs text-neutral-500">
                  {row.detail}
                </span>
              </span>
              <span className="font-bold tabular-nums">{row.value}</span>
            </li>
          ))}
        </ol>
      )}
    </article>
  );
}

function Breakdown({
  title,
  rows,
  empty,
}: {
  title: string;
  empty: string;
  rows: Array<{ label: string; value: string }>;
}) {
  return (
    <article className="surface rounded-2xl p-6">
      <h2 className="font-bold">{title}</h2>
      {rows.length === 0 ? (
        <p className="mt-4 text-sm text-neutral-500">{empty}</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {rows.map((row) => (
            <li
              key={row.label}
              className="flex justify-between gap-3 border-b border-white/[0.05] pb-2 text-sm last:border-0"
            >
              <span className="text-neutral-300">{row.label}</span>
              <span className="font-semibold tabular-nums">{row.value}</span>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
