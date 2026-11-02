import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ArrowLeft, Clock3, MapPin, Phone, Scissors } from "lucide-react";
import { db } from "@/app/_lib/prisma";

type BarbershopDetailsPageProps = {
  params: Promise<{ id: string }>;
};

const currency = (value: number) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);

export default async function BarbershopDetailsPage({ params }: BarbershopDetailsPageProps) {
  await connection();
  const { id } = await params;

  const barbershop = await db.barbershop.findUnique({
    where: { id },
    include: {
      services: {
        orderBy: { name: "asc" },
      },
    },
  });

  if (!barbershop) notFound();

  return (
    <main className="min-h-screen">
      <header className="border-b border-white/[0.07]">
        <div className="container-shell flex h-[76px] items-center justify-between">
          <Link href="/" className="text-xl font-black tracking-[-0.06em]">
            barber<span className="accent-text">.</span>
          </Link>
          <Link href="/barbershops" className="inline-flex items-center gap-2 text-sm text-neutral-400 transition hover:text-white">
            <ArrowLeft size={16} /> Todas as barbearias
          </Link>
        </div>
      </header>

      <section className="container-shell py-8 md:py-12">
        <div
          className="relative flex min-h-[260px] items-end overflow-hidden rounded-[2rem] border border-white/10 bg-[radial-gradient(ellipse_at_75%_20%,rgba(200,241,105,.2),transparent_38%),linear-gradient(135deg,#30352a,#171717_60%,#0c0c0c)] bg-cover bg-center p-7 sm:min-h-[340px] sm:p-10"
          style={barbershop.imageUrl ? { backgroundImage: `linear-gradient(0deg,rgba(0,0,0,.82),rgba(0,0,0,.05)),url("${barbershop.imageUrl}")` } : undefined}
        >
          <div className="relative max-w-2xl">
            <p className="text-xs font-bold tracking-[0.2em] text-[#d8f69c] uppercase">Barbearia</p>
            <h1 className="mt-3 text-4xl font-black tracking-[-0.06em] sm:text-5xl">{barbershop.name}</h1>
            <p className="mt-4 flex items-center gap-2 text-sm text-white/75">
              <MapPin size={16} /> {barbershop.address}
            </p>
          </div>
        </div>

        <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_320px]">
          <section>
            <div>
              <p className="text-xs font-bold tracking-[0.2em] text-[#c8f169] uppercase">Conheça o espaço</p>
              <h2 className="mt-2 text-2xl font-black tracking-tight">Sobre a barbearia</h2>
              <p className="mt-3 whitespace-pre-line text-sm leading-7 text-neutral-400">
                {barbershop.description || "Entre em contato para saber mais sobre esta barbearia."}
              </p>
            </div>

            <div className="mt-10">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <p className="text-xs font-bold tracking-[0.2em] text-[#c8f169] uppercase">Cuide do seu visual</p>
                  <h2 className="mt-2 text-2xl font-black tracking-tight">Serviços disponíveis</h2>
                </div>
                <span className="text-xs text-neutral-500">{barbershop.services.length} opções</span>
              </div>

              {barbershop.services.length ? (
                <div className="mt-5 space-y-3">
                  {barbershop.services.map((service) => (
                    <article key={service.id} className="surface flex flex-col gap-4 rounded-2xl p-5 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-start gap-4">
                        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#c8f169]/10 text-[#c8f169]">
                          <Scissors size={19} />
                        </span>
                        <div>
                          <h3 className="font-bold">{service.name}</h3>
                          <p className="mt-1 max-w-xl text-sm leading-6 text-neutral-400">{service.description}</p>
                        </div>
                      </div>
                      <p className="shrink-0 text-lg font-black text-[#c8f169]">{currency(Number(service.price))}</p>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="surface mt-5 rounded-2xl p-6 text-sm text-neutral-400">
                  Esta barbearia ainda não cadastrou serviços.
                </div>
              )}
            </div>
          </section>

          <aside className="h-fit space-y-4">
            <div className="surface rounded-2xl p-5">
              <h2 className="font-bold">Informações</h2>
              <p className="mt-4 flex items-start gap-3 text-sm leading-6 text-neutral-400">
                <MapPin size={17} className="mt-0.5 shrink-0 text-[#c8f169]" />
                {barbershop.address}
              </p>
              {barbershop.phones.map((phone) => (
                <a key={phone} href={`tel:${phone.replace(/[^+\d]/g, "")}`} className="mt-3 flex items-center gap-3 text-sm text-neutral-400 transition hover:text-[#c8f169]">
                  <Phone size={16} className="text-[#c8f169]" /> {phone}
                </a>
              ))}
              <div className="mt-5 flex items-center gap-2 border-t border-white/[0.07] pt-4 text-xs leading-5 text-neutral-500">
                <Clock3 size={15} className="shrink-0" />
                Consulte diretamente a barbearia para confirmar horários e disponibilidade.
              </div>
            </div>
            <div className="rounded-2xl border border-[#c8f169]/20 bg-[#c8f169]/[0.06] p-5">
              <h3 className="font-bold">Quer marcar um horário?</h3>
              <p className="mt-2 text-sm leading-6 text-neutral-400">
                Entre em contato pelos telefones informados para consultar a disponibilidade.
              </p>
              {barbershop.phones[0] && (
                <a href={`tel:${barbershop.phones[0].replace(/[^+\d]/g, "")}`} className="accent-button mt-4 inline-flex w-full items-center justify-center rounded-xl px-4 py-3 text-sm font-bold">
                  Entrar em contato
                </a>
              )}
            </div>
          </aside>
        </div>
      </section>
    </main>
  );
}
