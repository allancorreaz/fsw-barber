"use server";

import type { MemberRole } from "@prisma/client";
import { MANAGEMENT, assertBarbershopRole } from "@/app/_lib/access";
import { runAction, text } from "@/app/_lib/actions";
import { db } from "@/app/_lib/prisma";

const ROLES: MemberRole[] = ["MANAGER", "RECEPTIONIST", "BARBER"];

export async function addTeamMember(barbershopId: string, form: FormData) {
  await runAction(`/dashboard/${barbershopId}/team`, async () => {
    const { membership } = await assertBarbershopRole(barbershopId, MANAGEMENT);
    const role = text(form, "role", 20) as MemberRole;
    if (!ROLES.includes(role)) throw new Error("Escolha um perfil válido.");
    if (role === "MANAGER" && membership.role !== "OWNER")
      throw new Error("Só o proprietário pode adicionar gerentes.");

    const email = text(form, "email", 200).toLowerCase();
    const user = await db.user.findUnique({
      where: { email },
      select: { id: true, name: true },
    });
    if (!user)
      throw new Error(
        "Nenhuma conta com esse e-mail. A pessoa precisa se cadastrar na plataforma primeiro.",
      );

    await db.$transaction(async (tx) => {
      await tx.barbershopMember.upsert({
        where: { userId_barbershopId: { userId: user.id, barbershopId } },
        create: { userId: user.id, barbershopId, role, status: "ACTIVE" },
        update: { role, status: "ACTIVE" },
      });
      if (role === "BARBER") {
        const professionalId = text(form, "professionalId", 60);
        if (professionalId === "new" || !professionalId) {
          const existing = await tx.professional.findFirst({
            where: { barbershopId, userId: user.id },
          });
          if (!existing)
            await tx.professional.create({
              data: { barbershopId, userId: user.id, name: user.name, email },
            });
        } else {
          const professional = await tx.professional.findFirst({
            where: { id: professionalId, barbershopId },
          });
          if (!professional) throw new Error("Profissional não encontrado.");
          if (professional.userId && professional.userId !== user.id)
            throw new Error(
              "Esse profissional já está vinculado a outra pessoa.",
            );
          await tx.professional.updateMany({
            where: { barbershopId, userId: user.id },
            data: { userId: null },
          });
          await tx.professional.update({
            where: { id: professional.id },
            data: { userId: user.id },
          });
        }
      }
    });
    return `${user.name} agora tem acesso ao painel.`;
  });
}

export async function removeTeamMember(barbershopId: string, form: FormData) {
  await runAction(`/dashboard/${barbershopId}/team`, async () => {
    const { user, membership } = await assertBarbershopRole(
      barbershopId,
      MANAGEMENT,
    );
    const target = await db.barbershopMember.findFirst({
      where: { id: text(form, "memberId", 60), barbershopId },
    });
    if (!target) throw new Error("Acesso não encontrado.");
    if (target.role === "OWNER")
      throw new Error(
        "O acesso do proprietário não pode ser removido por aqui.",
      );
    if (target.role === "MANAGER" && membership.role !== "OWNER")
      throw new Error("Só o proprietário pode remover gerentes.");
    if (target.userId === user.id)
      throw new Error("Você não pode remover o seu próprio acesso.");
    await db.$transaction([
      db.barbershopMember.delete({ where: { id: target.id } }),
      db.professional.updateMany({
        where: { barbershopId, userId: target.userId },
        data: { userId: null },
      }),
    ]);
    return "Acesso removido. O histórico de atendimentos foi mantido.";
  });
}
