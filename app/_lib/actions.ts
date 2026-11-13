import "server-only";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export type ActionOutcome =
  string | { message?: string; redirectTo?: string } | void;

function withParam(path: string, key: string, value: string) {
  const url = new URL(path, "http://local");
  url.searchParams.delete("ok");
  url.searchParams.delete("error");
  url.searchParams.set(key, value.slice(0, 300));
  return `${url.pathname}${url.search}`;
}

/**
 * Executa uma Server Action e volta para a página com uma mensagem (?ok= ou ?error=).
 * Erros de regra de negócio viram mensagem amigável; o redirect fica fora do try/catch
 * porque o Next implementa redirect lançando uma exceção especial.
 */
export async function runAction(
  path: string,
  fn: () => Promise<ActionOutcome>,
) {
  let target: string;
  try {
    const outcome = await fn();
    if (outcome && typeof outcome === "object" && outcome.redirectTo) {
      target = outcome.redirectTo;
    } else {
      const message =
        typeof outcome === "string"
          ? outcome
          : (outcome?.message ?? "Alterações salvas.");
      target = withParam(path, "ok", message);
    }
  } catch (error) {
    console.error("Server action failed:", error);
    const message =
      error instanceof Error && error.message
        ? error.message
        : "Não foi possível concluir a operação.";
    target = withParam(path, "error", message);
  }
  revalidatePath(path.split("?")[0]);
  redirect(target);
}

export function text(form: FormData, key: string, max = 500) {
  const value = form.get(key);
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export function money(form: FormData, key: string) {
  const raw = text(form, key, 20).replace(/\./g, "").replace(",", ".");
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0 || value > 100_000)
    throw new Error("Informe um valor válido.");
  return Math.round(value * 100) / 100;
}

export class UserError extends Error {}
