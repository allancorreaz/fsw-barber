import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { OperationsManager } from "@/app/_components/operations-manager";
import { requireBarbershopRole } from "@/app/_lib/auth";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ barbershopId: string }> };

export default async function ServicesPage({ params }: Props) {
  const { barbershopId } = await params;
  const { user, membership } = await requireBarbershopRole(barbershopId, ["OWNER", "MANAGER"]);
  if (!user) redirect("/login");
  if (!membership) notFound();
  return <main className="container-shell min-h-screen py-10">
    <Link href={`/dashboard/${barbershopId}`} className="text-sm text-neutral-400 hover:text-white">← Voltar ao painel</Link>
    <p className="mt-8 text-xs font-bold uppercase tracking-[0.2em] text-[#c8f169]">Gestão da barbearia</p>
    <h1 className="mt-2 text-3xl font-black">Serviços</h1>
    <p className="mt-2 mb-8 text-sm text-neutral-400">Gerencie o catálogo, os preços e a duração usada como base para os agendamentos.</p>
    <OperationsManager barbershopId={barbershopId} mode="services" />
  </main>;
}
