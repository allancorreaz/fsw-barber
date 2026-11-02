"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
export function AuthForm({ mode }: { mode: "login" | "register" }) {
 const router = useRouter();
 const [error, setError] = useState("");
 const [loading, setLoading] = useState(false);
 async function submit(event: React.FormEvent<HTMLFormElement>) {
  event.preventDefault(); setError(""); setLoading(true);
  const form = new FormData(event.currentTarget);
  const payload = Object.fromEntries(form.entries());
  try {
   const response = await fetch("/api/auth/" + mode, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
   const result = await response.json();
   if (!response.ok) { setError(result.error || "Não foi possível continuar."); return; }
   router.replace("/account"); router.refresh();
  } catch { setError("Falha de conexão. Tente novamente."); }
  finally { setLoading(false); }
 }
 return <form onSubmit={submit} className="mt-6 space-y-4">
  {mode === "register" && <label className="block text-sm">Nome<input name="name" required minLength={2} maxLength={100} autoComplete="name" className="mt-2 w-full rounded-xl bg-[#171717] p-3" /></label>}
  <label className="block text-sm">E-mail<input name="email" type="email" required autoComplete="email" className="mt-2 w-full rounded-xl bg-[#171717] p-3" /></label>
  <label className="block text-sm">Senha<input name="password" type="password" required minLength={mode === "register" ? 10 : 1} maxLength={128} autoComplete={mode === "register" ? "new-password" : "current-password"} className="mt-2 w-full rounded-xl bg-[#171717] p-3" /></label>
  {mode === "register" && <p className="text-xs text-neutral-500">Use ao menos 10 caracteres, com maiúscula, minúscula e número.</p>}
  {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
  <button disabled={loading} className="accent-button w-full rounded-xl p-3 font-bold disabled:opacity-60">{loading ? "Aguarde..." : mode === "register" ? "Criar conta" : "Entrar"}</button>
 </form>;
}
