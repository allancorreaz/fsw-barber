import "server-only";
import type { MemberRole } from "@prisma/client";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser, requireBarbershopRole } from "@/app/_lib/auth";
import { getPlatformAccess } from "@/app/_lib/billing";
import { platformAdminEmails } from "@/app/_lib/config";
import { db } from "@/app/_lib/prisma";

export const ALL_STAFF: MemberRole[] = [
  "OWNER",
  "MANAGER",
  "RECEPTIONIST",
  "BARBER",
];
export const FRONT_DESK: MemberRole[] = ["OWNER", "MANAGER", "RECEPTIONIST"];
export const MANAGEMENT: MemberRole[] = ["OWNER", "MANAGER"];
export const OWNER_ONLY: MemberRole[] = ["OWNER"];

export const ROLE_LABEL: Record<MemberRole, string> = {
  OWNER: "Proprietário",
  MANAGER: "Gerente",
  RECEPTIONIST: "Recepção",
  BARBER: "Barbeiro",
};

/**
 * Proteção das páginas do painel: exige login, vínculo ativo com a barbearia, o papel certo
 * e mensalidade da plataforma em dia (exceto na página de mensalidade).
 */
export async function requireDashboard(
  barbershopId: string,
  roles: MemberRole[],
  options: { allowSuspended?: boolean } = {},
) {
  const { user, membership } = await requireBarbershopRole(barbershopId, roles);
  if (!user)
    redirect(`/login?next=${encodeURIComponent(`/dashboard/${barbershopId}`)}`);
  if (!membership) notFound();

  const barbershop = await db.barbershop.findUnique({
    where: { id: barbershopId },
  });
  if (!barbershop) notFound();

  const access = await getPlatformAccess(barbershopId);
  if (access.state === "suspended" && !options.allowSuspended)
    redirect(`/dashboard/${barbershopId}/billing`);

  const allRoles = user.memberships
    .filter((item) => item.barbershopId === barbershopId)
    .map((item) => item.role);
  return {
    user,
    membership,
    role: membership.role,
    roles: allRoles,
    barbershop,
    access,
  };
}

/** Para Server Actions e rotas de API: lança erro em vez de redirecionar. */
export async function assertBarbershopRole(
  barbershopId: string,
  roles: MemberRole[],
  options: { allowSuspended?: boolean } = {},
) {
  const { user, membership } = await requireBarbershopRole(barbershopId, roles);
  if (!user) throw new Error("Sua sessão expirou. Entre novamente.");
  if (!membership) throw new Error("Você não tem permissão para esta ação.");
  if (!options.allowSuspended) {
    const access = await getPlatformAccess(barbershopId);
    if (access.state === "suspended")
      throw new Error(
        "A conta desta barbearia está suspensa por falta de pagamento.",
      );
  }
  return { user, membership };
}

export function isPlatformAdmin(email: string | null | undefined) {
  return Boolean(email && platformAdminEmails().includes(email.toLowerCase()));
}

export async function requirePlatformAdmin() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/admin");
  if (!isPlatformAdmin(user.email)) notFound();
  return user;
}

/** Profissional vinculado ao usuário logado (para o barbeiro ver só a própria agenda). */
export async function professionalForUser(
  barbershopId: string,
  userId: string,
) {
  return db.professional.findFirst({
    where: { barbershopId, userId },
    select: { id: true, name: true },
  });
}
