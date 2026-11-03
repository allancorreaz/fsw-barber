import Link from "next/link";
import { AuthForm } from "@/app/_components/auth-form";

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
 const { next } = await searchParams;
 const redirectTo = next?.startsWith("/") && !next.startsWith("//") ? next : "/account";
 return <main className="grid min-h-screen place-items-center px-5 py-10"><section className="surface w-full max-w-md rounded-3xl p-6 sm:p-8"><Link href="/" className="text-xl font-black">barber<span className="accent-text">.</span></Link><p className="mt-8 text-xs font-bold tracking-[0.2em] text-[#c8f169] uppercase">Sua experiência começa aqui</p><h1 className="mt-3 text-3xl font-black">Criar sua conta</h1><p className="mt-2 text-sm text-neutral-400">Cadastre-se para acompanhar seus agendamentos e planos.</p><AuthForm mode="register" redirectTo={redirectTo} /><p className="mt-5 text-sm text-neutral-400">Já possui conta? <Link href={next ? `/login?next=${encodeURIComponent(redirectTo)}` : "/login"} className="font-semibold text-[#c8f169]">Entrar</Link></p></section></main>;
}
