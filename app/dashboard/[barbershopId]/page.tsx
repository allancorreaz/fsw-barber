import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireBarbershopRole } from "@/app/_lib/auth";
import { db } from "@/app/_lib/prisma";

export const dynamic = "force-dynamic";

type DashboardPageProps = {
  params: Promise<{ barbershopId: string }>;
};

export default async function BarbershopDashboardPage({ params }: DashboardPageProps) {
  const { barbershopId } = await params;
  const { user, membership } = await requireBarbershopRole(
    barbershopId,
    ["OWNER", "MANAGER", "RECEPTIONIST", "BARBER"],
  );

  if (!user) redirect("/login?next=/dashboard/" + encodeURIComponent(barbershopId));
  if (!membership) notFound();

  const barbershop = await db.barbershop.findUnique({
    where: { id: barbershopId },
    select: {
      id: true,
      name: true,
      address: true,
      phones: true,
      description: true,
      _count: { select: { services: true, professionals: true, members: true } },
    },
  });

  if (!barbershop) notFound();

  const [upcomingBookings, requestedBookings] = await Promise.all([
    db.booking.count({
      where: {
        service: { barbershopId },
        date: { gte: new Date() },
        status: { in: ["REQUESTED", "CONFIRMED"] },
      },
    }),
    db.booking.count({
      where: { service: { barbershopId }, status: "REQUESTED" },
    }),
  ]);

  const cards = [
    { label: "Serviços cadastrados", value: barbershop._count.services, hint: "Catálogo da barbearia" },
    { label: "Profissionais", value: barbershop._count.professionals, hint: "Equipe e agenda" },
    { label: "Agendamentos futuros", value: upcomingBookings, hint: "Solicitados ou confirmados" },
    { label: "Aguardando confirmação", value: requestedBookings, hint: "Solicitações pendentes" },
  ];

  return (
    <main className="container-shell min-h-screen py-10 sm:py-14">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-6">
        <Link href="/" className="text-xl font-black tracking-tight">barber<span className="accent-text">.</span></Link>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-neutral-400">{user.name}</span>
          <form action="/api/auth/logout" method="post"><button className="text-neutral-400 transition hover:text-white">Sair</button></form>
        </div>
      </header>

      <section className="py-10">
        <p className="text-xs font-bold tracking-[0.2em] text-[#c8f169] uppercase">Painel da barbearia · {membership.role}</p>
        <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">{barbershop.name}</h1>
        <p className="mt-2 text-sm text-neutral-400">{barbershop.address}</p>
        {barbershop.description && <p className="mt-4 max-w-2xl text-sm leading-6 text-neutral-400">{barbershop.description}</p>}
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <article key={card.label} className="surface rounded-2xl p-5">
            <p className="text-sm text-neutral-400">{card.label}</p>
            <p className="mt-3 text-3xl font-black tabular-nums">{card.value}</p>
            <p className="mt-2 text-xs text-neutral-500">{card.hint}</p>
          </article>
        ))}
      </section>

      <section className="mt-8 grid gap-4 lg:grid-cols-[1.2fr_.8fr]">
        <article className="surface rounded-2xl p-6">
          <h2 className="text-lg font-bold">Próximas configurações</h2>
          <p className="mt-2 text-sm leading-6 text-neutral-400">O espaço da sua barbearia está criado. Estamos preparando os módulos de operação para você gerenciar o negócio em um só lugar.</p>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-white/10 bg-white/[0.025] p-4"><p className="font-semibold">Serviços</p><p className="mt-1 text-xs text-neutral-500">Cadastro, preço e duração</p><span className="mt-3 inline-block text-xs text-amber-200">Próxima etapa</span></div>
            <div className="rounded-xl border border-white/10 bg-white/[0.025] p-4"><p className="font-semibold">Profissionais</p><p className="mt-1 text-xs text-neutral-500">Equipe e especialidades</p><span className="mt-3 inline-block text-xs text-amber-200">Próxima etapa</span></div>
            <div className="rounded-xl border border-white/10 bg-white/[0.025] p-4"><p className="font-semibold">Agenda</p><p className="mt-1 text-xs text-neutral-500">Horários e disponibilidade</p><span className="mt-3 inline-block text-xs text-amber-200">Em planejamento</span></div>
            <div className="rounded-xl border border-white/10 bg-white/[0.025] p-4"><p className="font-semibold">Assinatura da plataforma</p><p className="mt-1 text-xs text-neutral-500">Plano SaaS da barbearia</p><span className="mt-3 inline-block text-xs text-neutral-500">Não configurada · sem cobrança</span></div>
          </div>
        </article>
        <aside className="surface rounded-2xl p-6">
          <h2 className="font-bold">Acesso e segurança</h2>
          <p className="mt-2 text-sm leading-6 text-neutral-400">Seu acesso é validado pelo vínculo ativo com esta barbearia. Os dados exibidos neste painel são consultados usando o identificador do estabelecimento autorizado.</p>
          <p className="mt-5 text-xs text-neutral-500">Seu perfil: <span className="font-semibold text-neutral-300">{membership.role}</span></p>
          <p className="mt-2 text-xs text-neutral-500">Equipe vinculada: {barbershop._count.members}</p>
        </aside>
      </section>
    </main>
  );
}
