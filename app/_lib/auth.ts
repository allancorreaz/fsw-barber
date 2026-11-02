import "server-only";
import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import { db } from "@/app/_lib/prisma";

const scrypt = promisify(scryptCallback);
export const SESSION_COOKIE = "fsw_barber_session";
const SESSION_DAYS = 30;

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt:${salt}:${derived.toString("hex")}`;
}

export async function verifyPassword(password: string, encoded: string) {
  const [algorithm, salt, expectedHex] = encoded.split(":");
  if (algorithm !== "scrypt" || !salt || !expectedHex) return false;
  const expected = Buffer.from(expectedHex, "hex");
  const actual = (await scrypt(password, salt, expected.length)) as Buffer;
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function createUserSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await db.session.create({ data: { userId, sessionToken: token, expires } });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires,
  });
}

export async function getCurrentUser() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await db.session.findUnique({
    where: { sessionToken: token },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
          memberships: {
            where: { status: "ACTIVE" },
            select: { barbershopId: true, role: true },
          },
        },
      },
    },
  });

  if (!session) return null;
  if (session.expires <= new Date()) {
    await db.session.delete({ where: { sessionToken: token } }).catch(() => undefined);
    return null;
  }
  return session.user;
}

export async function destroyUserSession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db.session.deleteMany({ where: { sessionToken: token } });
  jar.delete(SESSION_COOKIE);
}

export async function requireBarbershopRole(
  barbershopId: string,
  allowedRoles: Array<"OWNER" | "MANAGER" | "RECEPTIONIST" | "BARBER">,
) {
  const user = await getCurrentUser();
  if (!user) return { user: null, membership: null };
  const membership = user.memberships.find(
    (item) => item.barbershopId === barbershopId && allowedRoles.includes(item.role),
  );
  return { user, membership: membership ?? null };
}

export function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
