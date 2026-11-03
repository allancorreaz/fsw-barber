import Link from "next/link";
import { AuthForm } from "@/app/_components/auth-form";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
 const { next } = await searchParams;
 const redirectTo = next?.startsWith("/") && !next.startsWith("//") ? next : "/account";
 return <main className="grid min-h-screen place-items-center px-5 py-10"><section className="surface w-full max-w-md rounded-3xl p-6 sm:p-8"><Link href="/" className="text-xl font-black">barber<span className="accent-text">.</span></Link><p className="mt-8 text-xs font-bold tracking-[0.2em] text-[#c8f169] uppercase">Bem-vindo de volta</p><h1 className="mt-3 text-3xl font-black">Entrar na sua conta</h1><p className="mt-2 text-sm text-neutral-400">Acesse sua conta para consultar barbearias e agendar com profissionais disponíveis.</p><AuthForm mode="login" redirectTo={redirectTo} /><p className="mt-5 text-sm text-neutral-400">Ainda não possui conta? <Link href={next ? `/register?next=${encodeURIComponent(redirectTo)}` : "/register"} className="font-semibold text-[#c8f169]">Criar conta</Link></p><Link href="/" className="mt-6 inline-block text-xs text-neutral-500 hover:text-white">Voltar ao início</Link></section></main>;
}
