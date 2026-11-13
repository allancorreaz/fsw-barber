import { DashboardShell, inputClass } from "@/app/_components/dashboard-shell";
import { Flash } from "@/app/_components/flash";
import { MANAGEMENT, ROLE_LABEL, requireDashboard } from "@/app/_lib/access";
import { db } from "@/app/_lib/prisma";
import { addTeamMember, removeTeamMember } from "./actions";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ barbershopId: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
};

export default async function TeamPage({ params, searchParams }: Props) {
  const { barbershopId } = await params;
  const query = await searchParams;
  const ctx = await requireDashboard(barbershopId, MANAGEMENT);
  const isOwner = ctx.roles.includes("OWNER");

  const [members, professionals] = await Promise.all([
    db.barbershopMember.findMany({
      where: { barbershopId },
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: [{ role: "asc" }, { createdAt: "asc" }],
    }),
    db.professional.findMany({
      where: { barbershopId },
      select: { id: true, name: true, userId: true },
      orderBy: { name: "asc" },
    }),
  ]);
  const professionalByUser = new Map(
    professionals
      .filter((item) => item.userId)
      .map((item) => [item.userId as string, item.name]),
  );

  return (
    <DashboardShell
      barbershop={ctx.barbershop}
      roles={ctx.roles}
      userName={ctx.user.name}
      access={ctx.access}
      active="team"
      title="Acessos da equipe"
      description="Barbeiros veem e controlam só a própria agenda. Recepção vê a agenda de todos e os assinantes. Financeiro e configurações ficam com proprietário e gerente."
    >
      <Flash ok={query.ok} error={query.error} />

      <form
        action={addTeamMember.bind(null, barbershopId)}
        className="surface mb-6 grid gap-3 rounded-2xl p-6 sm:grid-cols-[1fr_180px_1fr_auto] sm:items-end"
      >
        <label className="text-sm">
          E-mail da pessoa
          <input
            name="email"
            type="email"
            required
            placeholder="Ela precisa ter conta na plataforma"
            className={`${inputClass} mt-1`}
          />
        </label>
        <label className="text-sm">
          Perfil
          <select
            name="role"
            className={`${inputClass} mt-1`}
            defaultValue="BARBER"
          >
            <option value="BARBER">Barbeiro</option>
            <option value="RECEPTIONIST">Recepção</option>
            {isOwner && <option value="MANAGER">Gerente</option>}
          </select>
        </label>
        <label className="text-sm">
          Agenda do barbeiro
          <select
            name="professionalId"
            className={`${inputClass} mt-1`}
            defaultValue="new"
          >
            <option value="new">Criar profissional novo</option>
            {professionals
              .filter((item) => !item.userId)
              .map((item) => (
                <option key={item.id} value={item.id}>
                  Vincular a {item.name}
                </option>
              ))}
          </select>
        </label>
        <button className="accent-button rounded-xl px-4 py-2.5 text-sm font-bold">
          Dar acesso
        </button>
      </form>

      <div className="surface overflow-x-auto rounded-2xl">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead className="text-xs text-neutral-500">
            <tr className="border-b border-white/[0.07]">
              <th className="p-4">Pessoa</th>
              <th className="p-4">Perfil</th>
              <th className="p-4">Agenda</th>
              <th className="p-4" />
            </tr>
          </thead>
          <tbody>
            {members.map((member) => (
              <tr
                key={member.id}
                className="border-b border-white/[0.05] last:border-0"
              >
                <td className="p-4">
                  <p className="font-semibold">{member.user.name}</p>
                  <p className="text-xs text-neutral-500">
                    {member.user.email}
                  </p>
                </td>
                <td className="p-4">
                  {ROLE_LABEL[member.role]}
                  {member.status !== "ACTIVE" && (
                    <span className="ml-2 text-xs text-neutral-500">
                      ({member.status.toLowerCase()})
                    </span>
                  )}
                </td>
                <td className="p-4 text-neutral-400">
                  {professionalByUser.get(member.userId) ?? "—"}
                </td>
                <td className="p-4 text-right">
                  {member.role !== "OWNER" &&
                    member.userId !== ctx.user.id &&
                    (isOwner || member.role !== "MANAGER") && (
                      <form action={removeTeamMember.bind(null, barbershopId)}>
                        <input
                          type="hidden"
                          name="memberId"
                          value={member.id}
                        />
                        <button className="rounded-lg border border-red-400/20 px-2.5 py-1.5 text-xs text-red-200 hover:bg-red-400/10">
                          Remover
                        </button>
                      </form>
                    )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </DashboardShell>
  );
}
