import Link from "next/link";
import { CheckCircle2, Circle } from "lucide-react";
import { DashboardShell } from "@/app/_components/dashboard-shell";
import {
  ALL_STAFF,
  professionalForUser,
  requireDashboard,
} from "@/app/_lib/access";
import { localDateKey, startOfLocalDay } from "@/app/_lib/format";
import { db } from "@/app/_lib/prisma";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ barbershopId: string }> };

export default async function BarbershopDashboardPage({ params }: Props) {
  const { barbershopId } = await params;
  const ctx = await requireDashboard(barbershopId, ALL_STAFF);
  const isManagement = ctx.roles.some(
    (role) => role === "OWNER" || role === "MANAGER",
  );
  const isFrontDesk = isManagement || ctx.roles.includes("RECEPTIONIST");
  const ownProfessional = isFrontDesk
    ? null
    : await professionalForUser(barbershopId, ctx.user.id);

  const todayStart = startOfLocalDay(localDateKey());
  const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
  const scope = isFrontDesk
    ? { barbershopId }
    : { barbershopId, professionalId: ownProfessional?.id ?? "__none__" };

  const [todayBookings, pending, activeSubscribers, counts, mpAccount] =
    await Promise.all([
      db.booking.count({
        where: {
          ...scope,
          date: { gte: todayStart, lt: todayEnd },
          status: { notIn: ["CANCELLED"] },
        },
      }),
      db.booking.count({
        where: { ...scope, status: "REQUESTED", date: { gte: new Date() } },
      }),
      db.consumerSubscription.count({
        where: {
          barbershopId,
          status: { in: ["ACTIVE", "PAST_DUE"] },
          currentPeriodEnd: { gte: new Date() },
        },
      }),
      db.barbershop.findUnique({
        where: { id: barbershopId },
        select: {
          _count: {
            select: {
              services: true,
              professionals: true,
              consumerPlans: true,
            },
          },
        },
      }),
      db.mercadoPagoAccount.findUnique({
        where: { barbershopId },
        select: { id: true },
      }),
    ]);

  const base = `/dashboard/${barbershopId}`;
  const checklist = [
    {
      done: Boolean(ctx.barbershop.latitude && ctx.barbershop.longitude),
      label:
        "Marcar a localização da barbearia (para aparecer na busca próxima)",
      href: `${base}/settings`,
    },
    {
      done: (counts?._count.services ?? 0) > 0,
      label: "Cadastrar os serviços",
      href: `${base}/services`,
    },
    {
      done: (counts?._count.professionals ?? 0) > 0,
      label: "Cadastrar os profissionais e a jornada",
      href: `${base}/professionals`,
    },
    {
      done: (counts?._count.consumerPlans ?? 0) > 0,
      label: "Criar os planos de assinatura",
      href: `${base}/plans`,
    },
    {
      done: Boolean(mpAccount),
      label: "Conectar o Mercado Pago para receber dos clientes",
      href: `${base}/settings`,
    },
  ];

  const cards = [
    {
      label: isFrontDesk ? "Atendimentos hoje" : "Seus atendimentos hoje",
      value: todayBookings,
      href: `${base}/agenda`,
    },
    {
      label: "Aguardando confirmação",
      value: pending,
      href: `${base}/agenda?status=REQUESTED`,
    },
    ...(isFrontDesk
      ? [
          {
            label: "Assinantes ativos",
            value: activeSubscribers,
            href: `${base}/subscribers`,
          },
        ]
      : []),
  ];

  return (
    <DashboardShell
      barbershop={ctx.barbershop}
      roles={ctx.roles}
      userName={ctx.user.name}
      access={ctx.access}
      active="overview"
      title={ctx.barbershop.name}
      description={ctx.barbershop.address}
    >
      <div className="grid gap-4 sm:grid-cols-3">
        {cards.map((card) => (
          <Link
            key={card.label}
            href={card.href}
            className="surface rounded-2xl p-5 transition hover:border-[#c8f169]/40"
          >
            <p className="text-sm text-neutral-400">{card.label}</p>
            <p className="mt-3 text-3xl font-black tabular-nums">
              {card.value}
            </p>
          </Link>
        ))}
      </div>

      {!isFrontDesk && !ownProfessional && (
        <div className="surface mt-6 rounded-2xl p-5 text-sm text-neutral-400">
          Seu acesso ainda não está vinculado a um profissional da equipe. Peça
          ao proprietário para fazer o vínculo em “Acessos”.
        </div>
      )}
      {!isFrontDesk && ownProfessional && (
        <div className="surface mt-6 rounded-2xl p-5">
          <h2 className="font-bold">Sua agenda</h2>
          <p className="mt-1 text-sm text-neutral-400">
            Defina seus dias, horários e folgas. Os clientes só veem os horários
            livres.
          </p>
          <Link
            href={`${base}/professionals/${ownProfessional.id}/schedule`}
            className="mt-4 inline-block text-sm font-bold text-[#c8f169]"
          >
            Editar minha jornada →
          </Link>
        </div>
      )}

      {isManagement && (
        <div className="surface mt-6 rounded-2xl p-6">
          <h2 className="text-lg font-bold">Configuração da barbearia</h2>
          <p className="mt-1 text-sm text-neutral-400">
            Complete os passos para os clientes conseguirem assinar e agendar.
          </p>
          <ul className="mt-5 space-y-3">
            {checklist.map((item) => (
              <li key={item.label}>
                <Link
                  href={item.href}
                  className="flex items-center gap-3 text-sm hover:text-white"
                >
                  {item.done ? (
                    <CheckCircle2
                      size={18}
                      className="shrink-0 text-[#c8f169]"
                    />
                  ) : (
                    <Circle size={18} className="shrink-0 text-neutral-600" />
                  )}
                  <span
                    className={
                      item.done
                        ? "text-neutral-500 line-through"
                        : "text-neutral-200"
                    }
                  >
                    {item.label}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-5 text-xs text-neutral-500">
            Link público da barbearia:{" "}
            <Link
              href={`/barbershops/${barbershopId}`}
              className="text-[#c8f169] hover:underline"
            >
              /barbershops/{barbershopId}
            </Link>
          </p>
        </div>
      )}
    </DashboardShell>
  );
}
