import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  Check,
  Clock3,
  MapPin,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
} from "lucide-react";

const benefits = [
  {
    icon: CalendarDays,
    title: "Agendamento sem complicação",
    description: "Encontre horários e organize seus próximos cortes em poucos passos.",
  },
  {
    icon: ShieldCheck,
    title: "Informações em um só lugar",
    description: "Consulte serviços, valores e detalhes antes de escolher sua barbearia.",
  },
  {
    icon: Clock3,
    title: "Mais tempo para você",
    description: "Menos troca de mensagens. Mais praticidade para cuidar do visual.",
  },
];

const steps = [
  "Encontre uma barbearia perto de você",
  "Compare serviços e escolha o que deseja",
  "Selecione um horário e solicite seu agendamento",
];

export default function Home() {
  return (
    <main className="min-h-screen overflow-hidden">
      <header className="border-b border-white/[0.07]">
        <div className="container-shell flex h-[76px] items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5" aria-label="Barber início">
            <span className="grid size-9 place-items-center rounded-xl bg-[#c8f169] text-black">
              <Sparkles size={19} strokeWidth={2.4} />
            </span>
            <span className="text-xl font-black tracking-[-0.06em]">
              barber<span className="accent-text">.</span>
            </span>
          </Link>

          <nav className="hidden items-center gap-8 text-sm text-neutral-400 md:flex">
            <a href="#como-funciona" className="transition hover:text-white">Como funciona</a>
            <a href="#vantagens" className="transition hover:text-white">Vantagens</a>
          </nav>

          <Link
            href="/barbershops"
            className="rounded-full border border-white/15 px-4 py-2.5 text-sm font-semibold transition hover:border-[#c8f169]/60 hover:text-[#c8f169]"
          >
            Explorar barbearias
          </Link>
        </div>
      </header>

      <section className="container-shell grid gap-12 pb-20 pt-16 md:grid-cols-[1.08fr_.92fr] md:items-center md:pb-28 md:pt-24">
        <div>
          <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-[#c8f169]/20 bg-[#c8f169]/[0.07] px-3.5 py-2 text-xs font-semibold tracking-wide text-[#d8f69c]">
            <span className="size-1.5 rounded-full bg-[#c8f169]" />
            SEU PRÓXIMO CORTE COMEÇA AQUI
          </div>

          <h1 className="max-w-[700px] text-5xl leading-[1.04] font-black tracking-[-0.065em] sm:text-6xl lg:text-[4.65rem]">
            Seu estilo.
            <br />
            Seu horário.
            <br />
            <span className="accent-text">Sua barbearia.</span>
          </h1>

          <p className="mt-7 max-w-[510px] text-base leading-7 text-neutral-400 sm:text-lg">
            Descubra barbearias, conheça os serviços e encontre o melhor momento
            para renovar o visual. Tudo em uma experiência simples.
          </p>

          <form action="/barbershops" method="GET" className="surface mt-9 flex max-w-[550px] items-center gap-3 rounded-2xl p-2">
            <Search className="ml-3 shrink-0 text-neutral-500" size={20} />
            <input
              type="search"
              name="search"
              placeholder="Buscar por nome da barbearia..."
              aria-label="Buscar por nome da barbearia"
              className="min-w-0 flex-1 bg-transparent py-3 text-sm text-white outline-none placeholder:text-neutral-600"
            />
            <button type="submit" className="accent-button rounded-xl px-5 py-3 text-sm font-bold">
              Buscar
            </button>
          </form>

          <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-neutral-500">
            <span className="inline-flex items-center gap-1.5"><Check size={14} className="accent-text" /> Busca simples</span>
            <span className="inline-flex items-center gap-1.5"><Check size={14} className="accent-text" /> Serviços e valores</span>
            <span className="inline-flex items-center gap-1.5"><Check size={14} className="accent-text" /> Agendamento organizado</span>
          </div>
        </div>

        <div className="relative mx-auto w-full max-w-[490px]">
          <div className="absolute -inset-8 rounded-full bg-[#c8f169]/[0.07] blur-3xl" />
          <div className="surface relative overflow-hidden rounded-[2rem] p-5 sm:p-7">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold tracking-[0.18em] text-neutral-500 uppercase">Experiência Barber</p>
                <p className="mt-2 text-xl font-bold tracking-tight">Cuidado nos detalhes.</p>
              </div>
              <span className="grid size-11 place-items-center rounded-2xl bg-[#c8f169]/10 text-[#c8f169]">
                <Star size={20} />
              </span>
            </div>

            <div className="mt-7 overflow-hidden rounded-2xl border border-white/10 bg-[#171717]">
              <div className="relative flex h-[230px] items-end overflow-hidden bg-[radial-gradient(ellipse_at_70%_20%,rgba(200,241,105,.25),transparent_35%),linear-gradient(135deg,#343a2a,#171717_55%,#090909)] p-6">
                <div className="absolute right-8 top-8 size-36 rounded-full border border-white/10" />
                <div className="absolute right-16 top-16 size-20 rounded-full border border-[#c8f169]/30" />
                <div className="relative">
                  <p className="text-xs font-semibold tracking-[0.2em] text-[#d8f69c] uppercase">Encontre seu lugar</p>
                  <p className="mt-2 max-w-[240px] text-3xl leading-tight font-black tracking-[-0.05em]">Um bom corte muda o dia.</p>
                </div>
              </div>
              <div className="flex items-center justify-between p-5">
                <div>
                  <p className="font-semibold">Sua próxima barbearia</p>
                  <p className="mt-1 text-xs text-neutral-500">Descubra opções e serviços</p>
                </div>
                <span className="grid size-10 place-items-center rounded-full bg-white/5 text-[#c8f169]">
                  <ArrowRight size={18} />
                </span>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-white/[0.04] p-4">
                <MapPin size={17} className="accent-text" />
                <p className="mt-3 text-sm font-semibold">Perto de você</p>
                <p className="mt-1 text-xs text-neutral-500">Encontre novas opções</p>
              </div>
              <div className="rounded-2xl bg-white/[0.04] p-4">
                <CalendarDays size={17} className="accent-text" />
                <p className="mt-3 text-sm font-semibold">No seu tempo</p>
                <p className="mt-1 text-xs text-neutral-500">Organize seus horários</p>
              </div>
            </div>
          </div>
          <div className="absolute -bottom-5 -left-4 hidden items-center gap-3 rounded-2xl border border-white/10 bg-[#171717] px-4 py-3 shadow-2xl sm:flex">
            <span className="grid size-9 place-items-center rounded-xl bg-[#c8f169] text-black"><Check size={18} /></span>
            <div>
              <p className="text-xs font-bold">Praticidade de ponta a ponta</p>
              <p className="mt-0.5 text-[11px] text-neutral-500">Da busca ao agendamento</p>
            </div>
          </div>
        </div>
      </section>

      <section id="vantagens" className="border-y border-white/[0.07] bg-white/[0.015] py-16 md:py-20">
        <div className="container-shell">
          <div className="max-w-xl">
            <p className="text-xs font-bold tracking-[0.2em] text-[#c8f169] uppercase">Uma experiência melhor</p>
            <h2 className="mt-4 text-3xl font-black tracking-[-0.05em] sm:text-4xl">Tudo para escolher bem e agendar melhor.</h2>
            <p className="mt-4 leading-7 text-neutral-400">Uma jornada direta para você encontrar o serviço certo sem perder tempo.</p>
          </div>

          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {benefits.map(({ icon: Icon, title, description }, index) => (
              <article key={title} className="surface rounded-2xl p-6">
                <div className="grid size-11 place-items-center rounded-xl bg-[#c8f169]/10 text-[#c8f169]">
                  <Icon size={21} />
                </div>
                <p className="mt-7 text-xs font-bold tracking-widest text-neutral-600">0{index + 1}</p>
                <h3 className="mt-2 text-lg font-bold">{title}</h3>
                <p className="mt-3 text-sm leading-6 text-neutral-400">{description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="como-funciona" className="container-shell py-16 md:py-20">
        <div className="grid gap-10 md:grid-cols-[.8fr_1.2fr] md:items-center">
          <div>
            <p className="text-xs font-bold tracking-[0.2em] text-[#c8f169] uppercase">Simples assim</p>
            <h2 className="mt-4 text-3xl font-black tracking-[-0.05em] sm:text-4xl">Três passos para cuidar do visual.</h2>
            <Link href="/barbershops" className="mt-7 inline-flex items-center gap-2 text-sm font-bold text-[#c8f169] hover:gap-3">
              Começar agora <ArrowRight size={17} />
            </Link>
          </div>
          <ol className="space-y-3">
            {steps.map((step, index) => (
              <li key={step} className="surface flex items-center gap-4 rounded-2xl p-5">
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[#c8f169] text-sm font-black text-black">0{index + 1}</span>
                <span className="text-sm font-semibold text-neutral-200 sm:text-base">{step}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <footer className="border-t border-white/[0.07] py-8">
        <div className="container-shell flex flex-col gap-4 text-xs text-neutral-500 sm:flex-row sm:items-center sm:justify-between">
          <p className="font-bold tracking-tight text-neutral-300">barber<span className="accent-text">.</span></p>
          <p>Uma experiência mais simples para cuidar do seu estilo.</p>
          <p>© Barber. Todos os direitos reservados.</p>
        </div>
      </footer>
    </main>
  );
}
