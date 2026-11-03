"use client";

import { useEffect, useState, type FormEvent } from "react";

type Hour = { id?: string; weekDay: number; startTime: string; endTime: string; active: boolean };
type TimeOff = { id: string; startsAt: string; endsAt: string; reason: string | null };
const days = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];
const emptyHours = (): Hour[] => Array.from({ length: 7 }, (_, weekDay) => ({ weekDay, startTime: "09:00", endTime: "18:00", active: false }));

export function ProfessionalScheduleManager({ barbershopId, professionalId }: { barbershopId: string; professionalId: string }) {
  const [hours, setHours] = useState<Hour[]>(emptyHours());
  const [timeOff, setTimeOff] = useState<TimeOff[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const base = `/api/barbershops/${encodeURIComponent(barbershopId)}/professionals/${encodeURIComponent(professionalId)}/schedule`;

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const response = await fetch(base, { cache: "no-store" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Não foi possível carregar a agenda.");
        if (cancelled) return;
        const next = emptyHours();
        for (const item of data.workingHours as Hour[]) {
          const index = next.findIndex((row) => row.weekDay === item.weekDay && !row.active);
          if (index >= 0) next[index] = item;
          else next.push(item);
        }
        setHours(next);
        setTimeOff((data.timeOff as TimeOff[]).map((item) => ({ ...item, startsAt: item.startsAt.slice(0, 16), endsAt: item.endsAt.slice(0, 16) })));
      } catch (reason) {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "Erro ao carregar a agenda.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [base]);

  function updateHour(index: number, patch: Partial<Hour>) {
    setHours((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  }

  async function saveHours(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setMessage(""); setSaving(true);
    try {
      const response = await fetch(base, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workingHours: hours.filter((item) => item.active) }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Não foi possível salvar a jornada.");
      setMessage("Jornada semanal salva.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Erro ao salvar."); }
    finally { setSaving(false); }
  }

  async function addTimeOff(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setMessage("");
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      const response = await fetch(base, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ startsAt: form.get("startsAt"), endsAt: form.get("endsAt"), reason: form.get("reason") }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Não foi possível registrar a folga.");
      setTimeOff((current) => [...current, { id: data.timeOff.id, startsAt: String(form.get("startsAt")), endsAt: String(form.get("endsAt")), reason: String(form.get("reason") || "") }]);
      formElement.reset();
      setMessage("Folga registrada.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Erro ao registrar folga."); }
  }

  if (loading) return <p className="text-sm text-neutral-400">Carregando agenda...</p>;
  return <div className="grid gap-8 lg:grid-cols-2">
    <form onSubmit={saveHours} className="surface rounded-2xl p-6">
      <h2 className="text-lg font-bold">Jornada semanal</h2>
      <p className="mt-1 text-sm text-neutral-400">Ative os dias de trabalho e configure até dois períodos por dia.</p>
      <div className="mt-5 space-y-3">
        {hours.map((hour, index) => <div key={hour.id || `${hour.weekDay}-${index}`} className="rounded-xl border border-white/10 p-3">
          <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={hour.active} onChange={(event) => updateHour(index, { active: event.target.checked })} />{days[hour.weekDay]}{hours.filter((item) => item.weekDay === hour.weekDay).length > 1 ? ` · Período ${index + 1}` : ""}</label>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <label className="text-xs text-neutral-400">Início<input type="time" value={hour.startTime} disabled={!hour.active} onChange={(event) => updateHour(index, { startTime: event.target.value })} className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-2 py-2 text-white disabled:opacity-40" /></label>
            <label className="text-xs text-neutral-400">Fim<input type="time" value={hour.endTime} disabled={!hour.active} onChange={(event) => updateHour(index, { endTime: event.target.value })} className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-2 py-2 text-white disabled:opacity-40" /></label>
          </div>
          <button type="button" onClick={() => setHours((current) => [...current, { weekDay: hour.weekDay, startTime: "13:00", endTime: "18:00", active: false }])} className="mt-2 text-xs text-[#c8f169]">+ Adicionar intervalo</button>
        </div>)}
      </div>
      {error && <p role="alert" className="mt-4 text-sm text-red-300">{error}</p>}
      {message && <p role="status" className="mt-4 text-sm text-emerald-300">{message}</p>}
      <button disabled={saving} className="mt-5 w-full rounded-lg bg-[#c8f169] px-4 py-3 font-bold text-black disabled:opacity-50">{saving ? "Salvando..." : "Salvar jornada"}</button>
    </form>
    <section className="space-y-6">
      <form onSubmit={addTimeOff} className="surface rounded-2xl p-6">
        <h2 className="text-lg font-bold">Registrar folga ou bloqueio</h2>
        <label className="mt-4 block text-sm text-neutral-300">Início<input type="datetime-local" name="startsAt" required className="mt-2 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-3 text-white" /></label>
        <label className="mt-4 block text-sm text-neutral-300">Fim<input type="datetime-local" name="endsAt" required className="mt-2 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-3 text-white" /></label>
        <label className="mt-4 block text-sm text-neutral-300">Motivo (opcional)<input name="reason" maxLength={200} className="mt-2 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-3 text-white" /></label>
        <button className="mt-5 w-full rounded-lg border border-white/15 px-4 py-3 font-semibold">Registrar período</button>
      </form>
      <div className="surface rounded-2xl p-6">
        <h2 className="text-lg font-bold">Folgas registradas</h2>
        <div className="mt-4 space-y-3">{timeOff.map((item) => <article key={item.id} className="rounded-xl border border-white/10 p-3"><p className="text-sm font-semibold">{new Date(item.startsAt).toLocaleString("pt-BR")} até {new Date(item.endsAt).toLocaleString("pt-BR")}</p>{item.reason && <p className="mt-1 text-xs text-neutral-400">{item.reason}</p>}</article>)}{timeOff.length === 0 && <p className="text-sm text-neutral-500">Nenhuma folga futura registrada.</p>}</div>
      </div>
    </section>
  </div>;
}
