import Link from "next/link";
import { AuthForm } from "@/app/_components/auth-form";
export default function LoginPage() {
 return <main className="grid min-h-screen place-items-center px-5"><section className="surface w-full max-w-md rounded-3xl p-8"><Link href="/" className="text-xl font-black">barber.</Link><h1 className="mt-8 text-3xl font-black">Entrar na sua conta</h1><AuthForm mode="login" /><p className="mt-5 text-sm text-neutral-400">Ainda não possui conta? <Link href="/register" className="text-[#c8f169]">Criar conta</Link></p></section></main>;
}
