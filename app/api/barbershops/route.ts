import { NextResponse } from "next/server";
import { getCurrentUser } from "@/app/_lib/auth";
import { db } from "@/app/_lib/prisma";

type CreateBarbershopPayload = {
  name?: unknown;
  address?: unknown;
  phone?: unknown;
  description?: unknown;
};

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Faça login para cadastrar sua barbearia." }, { status: 401 });
  }

  let payload: CreateBarbershopPayload;
  try {
    payload = (await request.json()) as CreateBarbershopPayload;
  } catch {
    return NextResponse.json({ error: "Solicitação inválida." }, { status: 400 });
  }

  const name = typeof payload.name === "string" ? payload.name.trim() : "";
  const address = typeof payload.address === "string" ? payload.address.trim() : "";
  const phone = typeof payload.phone === "string" ? payload.phone.trim() : "";
  const description = typeof payload.description === "string" ? payload.description.trim() : "";

  if (name.length < 2 || name.length > 120) {
    return NextResponse.json({ error: "O nome deve ter entre 2 e 120 caracteres." }, { status: 400 });
  }
  if (address.length < 5 || address.length > 240) {
    return NextResponse.json({ error: "Informe um endereço válido (5 a 240 caracteres)." }, { status: 400 });
  }
  if (phone.length > 30 || description.length > 1000) {
    return NextResponse.json({ error: "Confira o tamanho do telefone e da descrição." }, { status: 400 });
  }

  try {
    const barbershop = await db.$transaction(async (transaction) => {
      const created = await transaction.barbershop.create({
        data: {
          name,
          address,
          phones: phone ? [phone] : [],
          description,
          imageUrl: "",
          members: {
            create: {
              userId: user.id,
              role: "OWNER",
              status: "ACTIVE",
            },
          },
        },
        select: { id: true, name: true },
      });
      return created;
    });

    return NextResponse.json(
      { barbershop, message: "Barbearia cadastrada. Seu acesso de proprietário está ativo." },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Barbershop creation failed:", error);
    return NextResponse.json({ error: "Não foi possível cadastrar a barbearia agora." }, { status: 500 });
  }
}
