"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";

type Service = { id: string; name: string; description: string; price: string | number; durationMinutes: number; active: boolean };
type Professional = { id: string; name: string; email: string | null; phone: string | null; active: boolean; services: { serviceId: string }[] };

export function OperationsManager({ barbershopId, mode }: { barbershopId: string; mode: "services" | "professionals" }) {
  const [services, setServices] = useState<Service[]>([]);
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const base = `/api/barbershops/${encodeURIComponent(barbershopId)}`;

  async function refresh() {
    const response = await fetch(`${base}/${mode}`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Não foi possível carregar os dados.");
    if (mode === "services") setServices(data.services);
    else setProfessionals(data.professionals);
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const response = await fetch(`/api/barbershops/${encodeURIComponent(barbershopId)}/${mode}`, { cache: "no-store" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Não foi possível carregar os dados.");
        if (cancelled) return;
        if (mode === "services") setServices(data.services);
        else setProfessionals(data.professionals);
      } catch (reason) {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "Erro ao carregar os dados.");
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [barbershopId, mode]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(""); setMessage(""); setLoading(true);
    const form = new FormData(event.currentTarget);
    const payload = mode === "services"
      ? { name: String(form.get("name") || ""), description: String(form.get("description") || ""), price: Number(form.get("price")), durationMinutes: Number(form.get("durationMinutes")) }
      : { name: String(form.get("name") || ""), email: String(form.get("email") || ""), phone: String(form.get("phone") || ""), serviceIds: form.getAll("serviceIds").map(String) };
    try {
      const response = await fetch(`${base}/${mode}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Não foi possível salvar.");
      event.currentTarget.reset();
      setMessage(mode === "services" ? "Serviço cadastrado." : "Profissional cadastrado.");
      await refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Erro inesperado."); }
    finally { setLoading(false); }
  }

  async function deactivate(serviceId: string) {
    setError(""); setMessage("");
    const response = await fetch(`${base}/services/${encodeURIComponent(serviceId)}`, { method: "DELETE" });
    const data = await response.json();
    if (!response.ok) { setError(data.error || "Não foi possível desativar."); return; }
    setMessage("Serviço desativado; histórico preservado.");
    await refresh();
  }

  return <div className="grid gap-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
    <form onSubmit={submit} className="surface h-fit rounded-2xl p-6">
      <h2 className="text-lg font-bold">{mode === "services" ? "Novo serviço" : "Novo profissional"}</h2>
      <label className="mt-5 block text-sm text-neutral-300">Nome<input name="name" required maxLength={100} className="mt-2 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-3 text-white" /></label>
      {mode === "services" ? <>
        <label className="mt-4 block text-sm text-neutral-300">Descrição<textarea name="description" maxLength={1000} className="mt-2 min-h-24 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-3 text-white" /></label>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <label className="text-sm text-neutral-300">Preço (R$)<input name="price" type="number" min="0" max="99999999" step="0.01" required className="mt-2 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-3 text-white" /></label>
          <label className="text-sm text-neutral-300">Duração (min)<input name="durationMinutes" type="number" min="5" max="480" step="5" defaultValue="30" required className="mt-2 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-3 text-white" /></label>
        </div>
      </> : <>
        <label className="mt-4 block text-sm text-neutral-300">E-mail<input name="email" type="email" className="mt-2 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-3 text-white" /></label>
        <label className="mt-4 block text-sm text-neutral-300">Telefone<input name="phone" maxLength={30} className="mt-2 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-3 text-white" /></label>
        <fieldset className="mt-5"><legend className="text-sm text-neutral-300">Serviços realizados</legend>
          <div className="mt-2 grid gap-2">{services.filter((service) => service.active).map((service) => <label key={service.id} className="flex items-center gap-2 text-sm text-neutral-300"><input type="checkbox" name="serviceIds" value={service.id} />{service.name}</label>)}</div>
          {services.length === 0 && <p className="mt-2 text-xs text-neutral-500">Cadastre serviços antes de vincular especialidades.</p>}
        </fieldset>
      </>}
      {error && <p role="alert" className="mt-4 text-sm text-red-300">{error}</p>}
      {message && <p role="status" className="mt-4 text-sm text-emerald-300">{message}</p>}
      <button disabled={loading} className="mt-6 w-full rounded-lg bg-[#c8f169] px-4 py-3 font-bold text-black disabled:opacity-50">{loading ? "Salvando..." : "Salvar"}</button>
    </form>
    <section className="surface rounded-2xl p-6">
      <h2 className="text-lg font-bold">{mode === "services" ? "Catálogo de serviços" : "Equipe"}</h2>
      {mode === "services" ? <div className="mt-5 divide-y divide-white/10">{services.map((service) => <article key={service.id} className="flex items-center justify-between gap-4 py-4"><div><p className="font-semibold">{service.name}</p><p className="mt-1 text-xs text-neutral-400">{service.durationMinutes} min · R$ {Number(service.price).toFixed(2).replace(".", ",")} · {service.active ? "Ativo" : "Inativo"}</p></div>{service.active && <button onClick={() => deactivate(service.id)} className="text-xs text-amber-200">Desativar</button>}</article>)}{services.length === 0 && <p className="py-5 text-sm text-neutral-500">Nenhum serviço cadastrado.</p>}</div>
      : <div className="mt-5 divide-y divide-white/10">{professionals.map((professional) => <article key={professional.id} className="py-4"><p className="font-semibold">{professional.name}</p><p className="mt-1 text-xs text-neutral-400">{professional.email || "Sem e-mail"} · {professional.phone || "Sem telefone"}</p><p className="mt-2 text-xs text-neutral-500">{professional.services.map((item) => services.find((service) => service.id === item.serviceId)?.name).filter(Boolean).join(", ") || "Sem serviços vinculados"}</p><Link href={`/dashboard/${barbershopId}/professionals/${professional.id}/schedule`} className="mt-3 inline-block text-xs font-semibold text-[#c8f169]">Configurar jornada e folgas →</Link></article>)}{professionals.length === 0 && <p className="py-5 text-sm text-neutral-500">Nenhum profissional cadastrado.</p>}</div>}
    </section>
  </div>;
}
