import { DashboardShell, inputClass } from "@/app/_components/dashboard-shell";
import { Flash } from "@/app/_components/flash";
import { MANAGEMENT, requireDashboard } from "@/app/_lib/access";
import { brl } from "@/app/_lib/format";
import { db } from "@/app/_lib/prisma";
import { createPlan, updatePlan } from "./actions";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ barbershopId: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
};

type PlanFormValues = {
  name?: string;
  description?: string | null;
  price?: number;
  bookingsPerCycle?: number | null;
  active?: boolean;
  serviceIds?: string[];
};

function PlanFields({
  services,
  values = {},
  showActive,
}: {
  services: Array<{ id: string; name: string; price: number }>;
  values?: PlanFormValues;
  showActive?: boolean;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="text-sm">
        Nome do plano
        <input
          name="name"
          required
          maxLength={80}
          defaultValue={values.name}
          placeholder="Ex.: Corte ilimitado"
          className={`${inputClass} mt-1`}
        />
      </label>
      <label className="text-sm">
        Valor mensal (R$)
        <input
          name="price"
          required
          inputMode="decimal"
          defaultValue={values.price?.toFixed(2).replace(".", ",")}
          placeholder="89,90"
          className={`${inputClass} mt-1`}
        />
      </label>
      <label className="text-sm">
        Atendimentos inclusos por mês
        <input
          name="bookingsPerCycle"
          type="number"
          min={1}
          max={100}
          defaultValue={values.bookingsPerCycle ?? ""}
          placeholder="Vazio = ilimitado"
          className={`${inputClass} mt-1`}
        />
      </label>
      <label className="text-sm">
        Descrição <span className="text-neutral-500">(opcional)</span>
        <input
          name="description"
          maxLength={500}
          defaultValue={values.description ?? ""}
          placeholder="O que o cliente ganha"
          className={`${inputClass} mt-1`}
        />
      </label>
      <fieldset className="sm:col-span-2">
        <legend className="text-sm">Serviços inclusos no plano</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {services.map((service) => (
            <label
              key={service.id}
              className="flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm"
            >
              <input
                type="checkbox"
                name="serviceIds"
                value={service.id}
                defaultChecked={values.serviceIds?.includes(service.id)}
                className="accent-[#c8f169]"
              />
              {service.name}{" "}
              <span className="ml-auto text-xs text-neutral-500">
                {brl(service.price)}
              </span>
            </label>
          ))}
        </div>
        <p className="mt-2 text-xs text-neutral-500">
          Serviços fora do plano continuam disponíveis para o assinante, mas são
          cobrados à parte.
        </p>
      </fieldset>
      {showActive && (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="active"
            defaultChecked={values.active}
            className="accent-[#c8f169]"
          />{" "}
          Plano disponível para novas assinaturas
        </label>
      )}
    </div>
  );
}

export default async function PlansPage({ params, searchParams }: Props) {
  const { barbershopId } = await params;
  const query = await searchParams;
  const ctx = await requireDashboard(barbershopId, MANAGEMENT);

  const [plans, services] = await Promise.all([
    db.consumerPlan.findMany({
      where: { barbershopId },
      include: {
        services: {
          select: { serviceId: true, service: { select: { name: true } } },
        },
        _count: {
          select: {
            subscriptions: {
              where: { status: { in: ["ACTIVE", "PAST_DUE"] } },
            },
          },
        },
      },
      orderBy: [{ active: "desc" }, { price: "asc" }],
    }),
    db.barbershopService.findMany({
      where: { barbershopId, active: true },
      select: { id: true, name: true, price: true },
      orderBy: { name: "asc" },
    }),
  ]);
  const serviceOptions = services.map((service) => ({
    ...service,
    price: Number(service.price),
  }));

  return (
    <DashboardShell
      barbershop={ctx.barbershop}
      roles={ctx.roles}
      userName={ctx.user.name}
      access={ctx.access}
      active="plans"
      title="Planos de assinatura"
      description="Só quem assina um plano consegue agendar pela plataforma. A cobrança é mensal no cartão de crédito do cliente, direto na conta Mercado Pago da barbearia."
    >
      <Flash ok={query.ok} error={query.error} />

      {serviceOptions.length === 0 ? (
        <div className="surface rounded-2xl p-6 text-sm text-neutral-400">
          Cadastre os serviços antes de criar planos.
        </div>
      ) : (
        <details className="surface rounded-2xl p-6" open={plans.length === 0}>
          <summary className="cursor-pointer text-lg font-bold">
            + Novo plano
          </summary>
          <form
            action={createPlan.bind(null, barbershopId)}
            className="mt-5 space-y-5"
          >
            <PlanFields services={serviceOptions} />
            <button className="accent-button rounded-xl px-5 py-3 text-sm font-bold">
              Criar plano
            </button>
          </form>
        </details>
      )}

      <div className="mt-6 space-y-4">
        {plans.map((plan) => (
          <details key={plan.id} className="surface rounded-2xl p-6">
            <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-3">
              <span>
                <span className="text-lg font-bold">{plan.name}</span>
                {!plan.active && (
                  <span className="ml-2 rounded-full bg-white/5 px-2 py-0.5 text-xs text-neutral-500">
                    inativo
                  </span>
                )}
                <span className="mt-1 block text-xs text-neutral-500">
                  {plan.bookingsPerCycle
                    ? `${plan.bookingsPerCycle} atendimentos/mês`
                    : "Atendimentos ilimitados"}{" "}
                  · {plan.services.map((item) => item.service.name).join(", ")}
                </span>
              </span>
              <span className="text-right">
                <span className="block text-xl font-black text-[#c8f169]">
                  {brl(plan.price)}
                  <span className="text-xs font-normal text-neutral-500">
                    /mês
                  </span>
                </span>
                <span className="text-xs text-neutral-500">
                  {plan._count.subscriptions} assinantes
                </span>
              </span>
            </summary>
            <form
              action={updatePlan.bind(null, barbershopId, plan.id)}
              className="mt-5 space-y-5 border-t border-white/[0.07] pt-5"
            >
              <PlanFields
                services={serviceOptions}
                showActive
                values={{
                  name: plan.name,
                  description: plan.description,
                  price: Number(plan.price),
                  bookingsPerCycle: plan.bookingsPerCycle,
                  active: plan.active,
                  serviceIds: plan.services.map((item) => item.serviceId),
                }}
              />
              <button className="accent-button rounded-xl px-5 py-3 text-sm font-bold">
                Salvar alterações
              </button>
            </form>
          </details>
        ))}
      </div>
    </DashboardShell>
  );
}
