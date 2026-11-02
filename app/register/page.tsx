import Link from "next/link";
import { AuthForm } from "@/app/_components/auth-form";
export default function RegisterPage() {
 return <main className="grid min-h-screen place-items-center px-5"><section className="surface w-full max-w-md rounded-3xl p-8"><Link href="/" className="text-xl font-black">barber.</Link><h1 className="mt-8 text-3xl font-black">Criar sua conta</h1><p className="mt-2 text-sm text-neutral-400">Cadastre-se para acompanhar seus agendamentos e planos.</p><AuthForm mode="register" /><p className="mt-5 text-sm text-neutral-400">Já possui conta? <Link href="/login" className="text-[#c8f169]">Entrar</Link></p></section></main>;
}
