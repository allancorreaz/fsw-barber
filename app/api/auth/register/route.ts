import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/app/_lib/prisma";
import { createUserSession, hashPassword } from "@/app/_lib/auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let payload: unknown;
  try { payload = await request.json(); } catch {
    return NextResponse.json({ error: "Corpo da solicitação inválido." }, { status: 400 });
  }
  const data = payload as { name?: unknown; email?: unknown; password?: unknown };
  const name = typeof data.name === "string" ? data.name.trim() : "";
  const email = typeof data.email === "string" ? data.email.trim().toLowerCase() : "";
  const password = typeof data.password === "string" ? data.password : "";

  if (name.length < 2 || name.length > 100 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return NextResponse.json({ error: "Informe nome e e-mail válidos." }, { status: 400 });
  }
  if (password.length < 10 || password.length > 128 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) {
    return NextResponse.json({ error: "A senha deve ter de 10 a 128 caracteres, incluindo letras maiúsculas, minúsculas e números." }, { status: 400 });
  }

  try {
    const existing = await db.user.findUnique({ where: { email }, select: { id: true } });
    if (existing) return NextResponse.json({ error: "Este e-mail já possui cadastro. Entre na sua conta." }, { status: 409 });
    const user = await db.user.create({
      data: { name, email, passwordHash: await hashPassword(password) },
      select: { id: true, name: true, email: true },
    });
    await createUserSession(user.id);
    return NextResponse.json({ user }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "Este e-mail já possui cadastro." }, { status: 409 });
    }
    console.error("Registration failed:", error);
    return NextResponse.json({ error: "Não foi possível criar sua conta agora." }, { status: 500 });
  }
}
