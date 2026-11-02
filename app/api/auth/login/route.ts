import { NextResponse } from "next/server";
import { db } from "@/app/_lib/prisma";
import { createUserSession, verifyPassword } from "@/app/_lib/auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let payload: unknown;
  try { payload = await request.json(); } catch {
    return NextResponse.json({ error: "Corpo da solicitação inválido." }, { status: 400 });
  }
  const data = payload as { email?: unknown; password?: unknown };
  const email = typeof data.email === "string" ? data.email.trim().toLowerCase() : "";
  const password = typeof data.password === "string" ? data.password : "";
  if (!email || !password || email.length > 254 || password.length > 128) {
    return NextResponse.json({ error: "Informe e-mail e senha." }, { status: 400 });
  }

  try {
    const user = await db.user.findUnique({
      where: { email },
      select: { id: true, name: true, email: true, passwordHash: true },
    });
    if (!user?.passwordHash || !(await verifyPassword(password, user.passwordHash))) {
      return NextResponse.json({ error: "E-mail ou senha incorretos." }, { status: 401 });
    }
    await createUserSession(user.id);
    return NextResponse.json({ user: { id: user.id, name: user.name, email: user.email } });
  } catch (error) {
    console.error("Login failed:", error);
    return NextResponse.json({ error: "Não foi possível entrar agora." }, { status: 500 });
  }
}
