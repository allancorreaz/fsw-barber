import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/app/_lib/auth";
import { db } from "@/app/_lib/prisma";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/account");

  const barbershops = user.memberships.length
    ? await db.barbershop.findMany({
        where: { id: { in: user.memberships.map((membership) => membership.barbershopId) } },
        select: { id: true, name: true, address: true },
        orderBy: { createdAt: "desc" },
      })
    : [];

  const roleByShop = new Map(user.memberships.map((membership) => [membership.barbershopId, membership.role]));

  return (
    <main className="container-shell min-h-screen py-12">
      <header className="flex items-center justify-between border-b border-white/10 pb-6">
        <Link href="/" className="text-xl font-black">barber<span className="accent-text">.</span></Link>
        <form action="/api/auth/logout" method="post"><button className="text-sm text-neutral-400 hover:text-white">Sair</button></form>
      </header>
      <section className="py-10">
        <p className="text-xs font-bold tracking-[0.2em] text-[#c8f169] uppercase">Minha conta</p>
        <h1 className="mt-3 text-3xl font-black">Olá, {user.name}.</h1>
        <p className="mt-2 text-sm text-neutral-400">{user.email}</p>

        <div className="mt-10 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold">Minhas barbearias</h2>
            <p className="mt-1 text-sm text-neutral-400">Estabelecimentos aos quais sua conta possui acesso.</p>
          </div>
          <Link href="/dashboard/onboarding" className="accent-button rounded-xl px-4 py-3 text-sm font-bold">Cadastrar barbearia</Link>
        </div>

        {barbershops.length ? (
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {barbershops.map((shop) => (
              <article key={shop.id} className="surface rounded-2xl p-5">
                <p className="text-xs font-semibold tracking-wide text-[#c8f169] uppercase">{roleByShop.get(shop.id)}</p>
                <h3 className="mt-2 text-lg font-bold">{shop.name}</h3>
                <p className="mt-1 text-sm text-neutral-400">{shop.address}</p>
                <Link href={`/dashboard/${shop.id}`} className="mt-5 inline-flex text-sm font-bold text-[#c8f169] hover:underline">Abrir painel →</Link>
              </article>
            ))}
          </div>
        ) : (
          <div className="surface mt-5 rounded-2xl p-6">
            <h3 className="font-bold">Sua conta está ativa</h3>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-400">Você ainda não possui uma barbearia vinculada. Cadastre seu estabelecimento para acessar o painel de gestão, ou explore os estabelecimentos disponíveis.</p>
            <div className="mt-5 flex flex-wrap gap-4">
              <Link href="/dashboard/onboarding" className="text-sm font-bold text-[#c8f169]">Cadastrar minha barbearia</Link>
              <Link href="/barbershops" className="text-sm text-neutral-400 hover:text-white">Explorar barbearias</Link>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
