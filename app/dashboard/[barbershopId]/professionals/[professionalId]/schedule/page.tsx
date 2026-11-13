import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ProfessionalScheduleManager } from "@/app/_components/professional-schedule-manager";
import { requireBarbershopRole } from "@/app/_lib/auth";
import { db } from "@/app/_lib/prisma";

export const dynamic = "force-dynamic";
type Props = {
  params: Promise<{ barbershopId: string; professionalId: string }>;
};

export default async function ProfessionalSchedulePage({ params }: Props) {
  const { barbershopId, professionalId } = await params;
  const { user, membership } = await requireBarbershopRole(barbershopId, [
    "OWNER",
    "MANAGER",
    "BARBER",
  ]);
  if (!user) redirect("/login");
  if (!membership) notFound();
  const professional = await db.professional.findFirst({
    where: { id: professionalId, barbershopId },
    select: { id: true, name: true, userId: true },
  });
  if (!professional) notFound();
  const isManager = user.memberships.some(
    (item) =>
      item.barbershopId === barbershopId &&
      (item.role === "OWNER" || item.role === "MANAGER"),
  );
  if (!isManager && professional.userId !== user.id) notFound();
  return (
    <main className="container-shell min-h-screen py-10">
      <Link
        href={
          isManager
            ? `/dashboard/${barbershopId}/professionals`
            : `/dashboard/${barbershopId}/agenda`
        }
        className="text-sm text-neutral-400 hover:text-white"
      >
        ← Voltar
      </Link>
      <p className="mt-8 text-xs font-bold tracking-[0.2em] text-[#c8f169] uppercase">
        Agenda profissional
      </p>
      <h1 className="mt-2 text-3xl font-black">{professional.name}</h1>
      <p className="mt-2 mb-8 text-sm text-neutral-400">
        Configure os períodos de trabalho e bloqueios. A disponibilidade pública
        respeitará esta agenda.
      </p>
      <ProfessionalScheduleManager
        barbershopId={barbershopId}
        professionalId={professionalId}
      />
    </main>
  );
}
