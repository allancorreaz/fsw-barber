"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { LocationFields } from "@/app/_components/location-fields";

export function BarbershopOnboardingForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);
    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(form.entries());

    try {
      const response = await fetch("/api/barbershops", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = (await response.json()) as {
        error?: string;
        barbershop?: { id: string };
      };
      if (!response.ok || !result.barbershop) {
        setError(result.error ?? "Não foi possível cadastrar a barbearia.");
        return;
      }
      router.replace(`/dashboard/${result.barbershop.id}`);
      router.refresh();
    } catch {
      setError("Falha de conexão. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-8 space-y-5">
      <label className="block text-sm">
        Nome da barbearia
        <input
          name="name"
          required
          minLength={2}
          maxLength={120}
          placeholder="Ex.: FSW Barber"
          className="mt-2 w-full rounded-xl border border-white/10 bg-[#171717] px-4 py-3 outline-none focus:border-[#c8f169]"
        />
      </label>
      <label className="block text-sm">
        Endereço completo
        <input
          name="address"
          required
          minLength={5}
          maxLength={240}
          placeholder="Rua, número, bairro, cidade - UF"
          className="mt-2 w-full rounded-xl border border-white/10 bg-[#171717] px-4 py-3 outline-none focus:border-[#c8f169]"
        />
      </label>
      <label className="block text-sm">
        Telefone / WhatsApp <span className="text-neutral-500">(opcional)</span>
        <input
          name="phone"
          maxLength={30}
          autoComplete="tel"
          placeholder="(21) 99999-9999"
          className="mt-2 w-full rounded-xl border border-white/10 bg-[#171717] px-4 py-3 outline-none focus:border-[#c8f169]"
        />
      </label>
      <label className="block text-sm">
        Descrição <span className="text-neutral-500">(opcional)</span>
        <textarea
          name="description"
          maxLength={1000}
          rows={4}
          placeholder="Conte um pouco sobre sua barbearia..."
          className="mt-2 w-full resize-y rounded-xl border border-white/10 bg-[#171717] px-4 py-3 outline-none focus:border-[#c8f169]"
        />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <p className="text-sm sm:col-span-2">
          Localização no mapa{" "}
          <span className="text-neutral-500">
            (opcional agora; dá para ajustar depois em Configurações)
          </span>
        </p>
        <LocationFields latitude={null} longitude={null} />
      </div>
      {error && (
        <p
          role="alert"
          className="rounded-xl border border-red-400/20 bg-red-400/10 p-3 text-sm text-red-200"
        >
          {error}
        </p>
      )}
      <button
        disabled={loading}
        className="accent-button w-full rounded-xl px-5 py-3.5 text-sm font-bold disabled:opacity-60"
      >
        {loading ? "Cadastrando..." : "Cadastrar barbearia"}
      </button>
      <p className="text-xs leading-5 text-neutral-500">
        Ao cadastrar, sua conta vira proprietária da barbearia e começa o
        período de teste grátis. Nenhuma cobrança é feita nesta etapa.
      </p>
    </form>
  );
}
