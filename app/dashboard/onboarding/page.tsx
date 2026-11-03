import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/app/_lib/auth";
import { BarbershopOnboardingForm } from "@/app/_components/barbershop-onboarding-form";

export const dynamic = "force-dynamic";

export default async function BarbershopOnboardingPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/dashboard/onboarding");

  return (
    <main className="container-shell min-h-screen max-w-3xl py-12">
      <Link href="/account" className="text-sm text-neutral-400 transition hover:text-white">← Voltar para minha conta</Link>
      <section className="surface mt-8 rounded-3xl p-6 sm:p-10">
        <p className="text-xs font-bold tracking-[0.2em] text-[#c8f169] uppercase">Área do proprietário</p>
        <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">Cadastre sua barbearia</h1>
        <p className="mt-3 max-w-xl text-sm leading-6 text-neutral-400">Vamos criar o espaço da sua empresa na plataforma. Depois, você poderá organizar serviços, profissionais e horários em um painel exclusivo.</p>
        <BarbershopOnboardingForm />
      </section>
    </main>
  );
}
