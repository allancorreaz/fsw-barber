import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/app/_lib/auth";
export const dynamic = "force-dynamic";
export default async function AccountPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/account");
  return <main className="container-shell min-h-screen py-12"><header className="flex items-center justify-between border-b border-white/10 pb-6"><Link href="/" className="text-xl font-black">barber.</Link><form action="/api/auth/logout" method="post"><button className="text-sm text-neutral-400 hover:text-white">Sair</button></form></header><section className="py-10"><p className="text-xs font-bold tracking-[0.2em] text-[#c8f169] uppercase">Minha conta</p><h1 className="mt-3 text-3xl font-black">Olá, {user.name}.</h1><p className="mt-2 text-sm text-neutral-400">{user.email}</p><div className="surface mt-8 rounded-2xl p-6"><h2 className="font-bold">Sua conta está ativa</h2><p className="mt-2 text-sm leading-6 text-neutral-400">Em breve, seus agendamentos e planos aparecerão aqui.</p><Link href="/barbershops" className="mt-4 inline-flex text-sm font-bold text-[#c8f169]">Explorar barbearias</Link></div></section></main>;
}
