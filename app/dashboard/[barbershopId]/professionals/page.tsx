import { DashboardShell } from "@/app/_components/dashboard-shell";
import { OperationsManager } from "@/app/_components/operations-manager";
import { MANAGEMENT, requireDashboard } from "@/app/_lib/access";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ barbershopId: string }> };

export default async function Page({ params }: Props) {
  const { barbershopId } = await params;
  const ctx = await requireDashboard(barbershopId, MANAGEMENT);
  return (
    <DashboardShell
      barbershop={ctx.barbershop}
      roles={ctx.roles}
      userName={ctx.user.name}
      access={ctx.access}
      active="professionals"
      title="Profissionais"
      description="Cadastre a equipe, vincule cada profissional aos serviços que realiza e configure a jornada de cada um."
    >
      <OperationsManager barbershopId={barbershopId} mode="professionals" />
    </DashboardShell>
  );
}
