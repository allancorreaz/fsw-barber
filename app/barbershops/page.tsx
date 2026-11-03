import Link from "next/link";
import { NearbyBarbershops } from "@/app/_components/nearby-barbershops";
import { connection } from "next/server";
import { ArrowLeft, ArrowRight, MapPin, Scissors, Search } from "lucide-react";
import { db } from "@/app/_lib/prisma";
import type { Prisma } from "@prisma/client";
import { getCurrentUser } from "@/app/_lib/auth";

type BarbershopsPageProps = {
  searchParams: Promise<{ search?: string }>;
};

const currency = (value: number) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);

export default async function BarbershopsPage({ searchParams }: BarbershopsPageProps) {
  await connection();
  const { search = "" } = await searchParams;
  const term = search.trim();
  const user = await getCurrentUser();

  type BarbershopWithServices = Prisma.BarbershopGetPayload<{
    include: { services: { select: { price: true } } };
  }>;

  let barbershops: BarbershopWithServices[] = [];
  let loadError = false;

  try {
    barbershops = await db.barbershop.findMany({
      where: term
        ? {
            name: {
              contains: term,
              mode: "insensitive",
            },
          }
        : undefined,
      include: {
        services: {
          select: {
            price: true,
          },
        },
      },
      orderBy: {
        name: "asc",
      },
    });
  } catch {
    loadError = true;
  }

  return (
    <main className="min-h-screen">
      <header className="border-b border-white/[0.07]">
        <div className="container-shell flex h-[76px] items-center justify-between">
          <Link href="/" className="text-xl font-black tracking-[-0.06em]">
            barber<span className="accent-text">.</span>
          </Link>
          <Link href="/" className="inline-flex items-center gap-2 text-sm text-neutral-400 transition hover:text-white">
            <ArrowLeft size={16} /> Voltar ao início
          </Link>
        </div>
      </header>

      <section className="container-shell py-12 md:py-16">
        <p className="text-xs font-bold tracking-[0.2em] text-[#c8f169] uppercase">Descubra seu próximo lugar</p>
        <h1 className="mt-3 text-4xl font-black tracking-[-0.06em] sm:text-5xl">Barbearias</h1>
        <p className="mt-4 max-w-xl leading-7 text-neutral-400">
          Explore as opções disponíveis, conheça os serviços e encontre a experiência certa para você.
        </p>

        <form action="/barbershops" method="GET" className="surface mt-8 flex max-w-2xl items-center gap-3 rounded-2xl p-2">
          <Search className="ml-3 shrink-0 text-neutral-500" size={19} />
          <input
            type="search"
            name="search"
            defaultValue={term}
            placeholder="Digite o nome de uma barbearia..."
            aria-label="Buscar barbearia"
            className="min-w-0 flex-1 bg-transparent py-3 text-sm outline-none placeholder:text-neutral-600"
          />
          <button type="submit" className="accent-button rounded-xl px-5 py-3 text-sm font-bold">Buscar</button>
        </form>

        <NearbyBarbershops />

        <div className="mt-10 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold">{term ? `Resultados para “${term}”` : "Barbearias cadastradas na plataforma"}</h2>
            {!loadError && <p className="mt-1 text-sm text-neutral-500">{barbershops.length} {barbershops.length === 1 ? "barbearia encontrada" : "barbearias encontradas"}</p>}
          </div>
        </div>

        {loadError ? (
          <div className="surface mt-6 rounded-2xl p-8">
            <h2 className="text-lg font-bold">Não foi possível carregar as barbearias.</h2>
            <p className="mt-2 text-sm leading-6 text-neutral-400">
              Verifique a conexão com o banco de dados e a variável DATABASE_URL. Tente novamente depois de corrigir a configuração.
            </p>
          </div>
        ) : barbershops.length > 0 ? (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {barbershops.map((barbershop) => {
              const lowestPrice = barbershop.services.length
                ? Math.min(...barbershop.services.map((service) => Number(service.price)))
                : null;

              return (
                <article
                  key={barbershop.id}
                  className="surface overflow-hidden rounded-2xl"
                >
                  <div
                    className="relative flex h-44 items-end bg-[radial-gradient(ellipse_at_75%_20%,rgba(200,241,105,.2),transparent_38%),linear-gradient(135deg,#30352a,#171717_60%,#0c0c0c)] p-5"
                    style={barbershop.imageUrl ? { backgroundImage: `linear-gradient(0deg,rgba(0,0,0,.72),transparent 75%),url("${barbershop.imageUrl}")`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}
                  >
                    <span className="rounded-full border border-white/15 bg-black/35 px-3 py-1.5 text-[11px] font-semibold text-white/80 backdrop-blur">
                      {barbershop.services.length} {barbershop.services.length === 1 ? "serviço" : "serviços"}
                    </span>
                  </div>
                  <div className="p-5">
                    <h3 className="text-lg font-bold">{barbershop.name}</h3>
                    <p className="mt-2 flex items-start gap-2 text-sm leading-5 text-neutral-400">
                      <MapPin size={15} className="mt-0.5 shrink-0" /> {barbershop.address}
                    </p>
                    <div className="mt-5 flex items-center justify-between border-t border-white/[0.07] pt-4">
                      <span className="text-xs text-neutral-500">
                        {lowestPrice === null ? "Consulte os serviços" : `A partir de ${currency(lowestPrice)}`}
                      </span>
                      {user ? <Link href={`/barbershops/${barbershop.id}`} className="inline-flex items-center gap-1 text-xs font-bold text-[#c8f169]">Ver detalhes <ArrowRight size={14} /></Link> : <Link href={`/login?next=${encodeURIComponent(`/barbershops/${barbershop.id}`)}`} className="inline-flex items-center gap-1 text-xs font-bold text-[#c8f169]">Entre para ver detalhes <ArrowRight size={14} /></Link>}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="surface mt-6 rounded-2xl px-6 py-14 text-center">
            <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-[#c8f169]/10 text-[#c8f169]">
              <Scissors size={23} />
            </span>
            <h2 className="mt-5 text-xl font-bold">{term ? "Nenhuma barbearia encontrada" : "O catálogo está começando"}</h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-neutral-400">
              {term
                ? "Tente buscar por outro nome ou remova o termo para visualizar todas as opções."
                : "Assim que as barbearias forem cadastradas, elas aparecerão aqui para você explorar."}
            </p>
            {term && <Link href="/barbershops" className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-[#c8f169]">Limpar busca <ArrowRight size={15} /></Link>}
          </div>
        )}
      </section>
    </main>
  );
}
