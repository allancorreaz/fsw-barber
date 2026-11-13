import "server-only";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

/**
 * Chave de 32 bytes derivada de APP_SECRET. Usada para cifrar tokens de gateways no banco
 * e assinar valores temporários (ex.: o "state" do OAuth).
 */
function secretKey() {
  const secret = process.env.APP_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "APP_SECRET ausente ou curto demais (mínimo 32 caracteres).",
    );
  }
  return createHash("sha256").update(secret).digest();
}

export function encrypt(plain: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", secretKey(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [
    "v1",
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    data.toString("base64url"),
  ].join(".");
}

export function decrypt(encoded: string) {
  const [version, iv, tag, data] = encoded.split(".");
  if (version !== "v1" || !iv || !tag || !data)
    throw new Error("Valor cifrado inválido.");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    secretKey(),
    Buffer.from(iv, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(data, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

/** Assina um objeto JSON com validade. Retorna "payload.assinatura". */
export function signPayload(
  payload: Record<string, unknown>,
  ttlSeconds: number,
) {
  const body = Buffer.from(
    JSON.stringify({ ...payload, exp: Date.now() + ttlSeconds * 1000 }),
  ).toString("base64url");
  const signature = createHmac("sha256", secretKey())
    .update(body)
    .digest("base64url");
  return `${body}.${signature}`;
}

export function verifySignedPayload<T extends Record<string, unknown>>(
  token: string,
): T | null {
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;
  const expected = createHmac("sha256", secretKey()).update(body).digest();
  const received = Buffer.from(signature, "base64url");
  if (
    expected.length !== received.length ||
    !timingSafeEqual(expected, received)
  )
    return null;
  try {
    const payload = JSON.parse(
      Buffer.from(body, "base64url").toString("utf8"),
    ) as T & { exp: number };
    return payload.exp > Date.now() ? payload : null;
  } catch {
    return null;
  }
}

export function safeEqualHex(a: string, b: string) {
  const left = Buffer.from(a, "hex");
  const right = Buffer.from(b, "hex");
  return (
    left.length > 0 &&
    left.length === right.length &&
    timingSafeEqual(left, right)
  );
}
