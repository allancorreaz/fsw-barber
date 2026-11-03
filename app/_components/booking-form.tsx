"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { CalendarDays, CheckCircle2, LoaderCircle } from "lucide-react";

type BookingService = { id: string; name: string; price: number };
type ProfessionalAvailability = { id: string; name: string; availableSlots: string[] };
type BookingFormProps = { services: BookingService[] };

export function BookingForm({ services }: BookingFormProps) {
  const [serviceId, setServiceId] = useState(services[0]?.id ?? "");
  const [date, setDate] = useState("");
  const [professionalId, setProfessionalId] = useState("");
  const [time, setTime] = useState("");
  const [professionals, setProfessionals] = useState<ProfessionalAvailability[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [availabilityState, setAvailabilityState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const minimumDate = new Date().toLocaleDateString("en-CA");
  const selectedProfessional = professionals.find((professional) => professional.id === professionalId);
  const availableSlots = useMemo(() => selectedProfessional?.availableSlots ?? [], [selectedProfessional]);

  useEffect(() => {
    if (!date || !serviceId) {
      setProfessionals([]);
      setProfessionalId("");
      setTime("");
      setAvailabilityState("idle");
      return;
    }
    let active = true;
    setAvailabilityState("loading");
    setProfessionals([]);
    setProfessionalId("");
    setTime("");
    fetch(`/api/bookings?serviceId=${encodeURIComponent(serviceId)}&date=${encodeURIComponent(date)}`, { cache: "no-store" })
      .then(async (response) => {
        const result = await response.json() as { professionals?: ProfessionalAvailability[]; error?: string };
        if (!response.ok) throw new Error(result.error || "Não foi possível consultar a disponibilidade.");
        if (active) {
          setProfessionals(result.professionals ?? []);
          setAvailabilityState("ready");
        }
      })
      .catch((reason: Error) => {
        if (active) { setError(reason.message); setAvailabilityState("error"); }
      });
    return () => { active = false; };
  }, [date, serviceId]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    if (!serviceId || !professionalId || !date || !time || !name.trim() || !email.trim()) {
      setError("Preencha os campos e selecione um profissional e horário disponíveis.");
      return;
    }
    setSubmitting(true);
    try {
      const response = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serviceId, professionalId, dateTime: `${date}T${time}`, name: name.trim(), email: email.trim() }),
      });
      const result = await response.json() as { error?: string; message?: string };
      if (!response.ok) { setError(result.error ?? "Não foi possível solicitar o agendamento."); return; }
      setMessage(result.message ?? "Agendamento solicitado com sucesso.");
      setName(""); setEmail(""); setDate(""); setTime(""); setProfessionalId(""); setProfessionals([]); setAvailabilityState("idle");
    } catch { setError("Não foi possível conectar ao servidor. Tente novamente."); }
    finally { setSubmitting(false); }
  }

  if (services.length === 0) {
    return <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-neutral-400">Esta barbearia ainda não possui serviços disponíveis para agendamento.</div>;
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <label className="block space-y-2 text-sm">
        <span className="font-semibold text-neutral-200">Serviço</span>
        <select value={serviceId} onChange={(event) => setServiceId(event.target.value)} className="w-full rounded-xl border border-white/10 bg-[#171717] px-3 py-3 text-white outline-none focus:border-[#c8f169]" required>
          {services.map((service) => <option key={service.id} value={service.id}>{service.name} — {service.price.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</option>)}
        </select>
      </label>

      <label className="block space-y-2 text-sm">
        <span className="font-semibold text-neutral-200">Data</span>
        <input type="date" min={minimumDate} value={date} onChange={(event) => setDate(event.target.value)} className="w-full rounded-xl border border-white/10 bg-[#171717] px-3 py-3 text-white outline-none focus:border-[#c8f169]" required />
      </label>

      {date && availabilityState === "loading" && <p className="text-xs text-neutral-400">Consultando a agenda da equipe...</p>}
      {date && availabilityState === "error" && <p role="alert" className="text-xs text-red-200">Não foi possível consultar a disponibilidade. Tente novamente.</p>}

      {date && availabilityState === "ready" && <>
        <label className="block space-y-2 text-sm">
          <span className="font-semibold text-neutral-200">Profissional</span>
          <select value={professionalId} onChange={(event) => { setProfessionalId(event.target.value); setTime(""); }} className="w-full rounded-xl border border-white/10 bg-[#171717] px-3 py-3 text-white outline-none focus:border-[#c8f169]" required>
            <option value="">Selecione</option>
            {professionals.map((professional) => <option key={professional.id} value={professional.id}>{professional.name}</option>)}
          </select>
        </label>
        {professionals.length === 0 && <p className="rounded-xl border border-amber-300/20 bg-amber-300/5 p-3 text-xs text-amber-100">Ainda não há profissionais com jornada cadastrada para esse serviço e data.</p>}
      </>}

      {professionalId && <label className="block space-y-2 text-sm">
        <span className="font-semibold text-neutral-200">Horário disponível</span>
        <select value={time} onChange={(event) => setTime(event.target.value)} className="w-full rounded-xl border border-white/10 bg-[#171717] px-3 py-3 text-white outline-none focus:border-[#c8f169]" required>
          <option value="">Selecione</option>
          {availableSlots.map((slot) => <option key={slot} value={slot}>{slot}</option>)}
        </select>
        {availableSlots.length === 0 && <span className="block text-xs text-neutral-500">Não há horários livres para esse profissional nesta data.</span>}
      </label>}

      <label className="block space-y-2 text-sm">
        <span className="font-semibold text-neutral-200">Seu nome</span>
        <input value={name} onChange={(event) => setName(event.target.value)} maxLength={100} autoComplete="name" placeholder="Como podemos chamar você?" className="w-full rounded-xl border border-white/10 bg-[#171717] px-3 py-3 text-white outline-none placeholder:text-neutral-600 focus:border-[#c8f169]" required />
      </label>
      <label className="block space-y-2 text-sm">
        <span className="font-semibold text-neutral-200">E-mail</span>
        <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} maxLength={254} autoComplete="email" placeholder="voce@email.com" className="w-full rounded-xl border border-white/10 bg-[#171717] px-3 py-3 text-white outline-none placeholder:text-neutral-600 focus:border-[#c8f169]" required />
      </label>

      {error && <p role="alert" className="rounded-xl border border-red-400/20 bg-red-400/10 p-3 text-sm text-red-200">{error}</p>}
      {message && <p role="status" className="flex items-start gap-2 rounded-xl border border-[#c8f169]/20 bg-[#c8f169]/10 p-3 text-sm text-[#d8f69c]"><CheckCircle2 size={18} className="mt-0.5 shrink-0" /> {message}</p>}
      <button type="submit" disabled={submitting || availabilityState === "loading" || availabilityState === "error" || (date !== "" && professionals.length === 0)} className="accent-button flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3.5 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-60">
        {submitting ? <LoaderCircle size={17} className="animate-spin" /> : <CalendarDays size={17} />}
        {submitting ? "Solicitando..." : "Solicitar agendamento"}
      </button>
      <p className="text-xs leading-5 text-neutral-500">Os horários consideram a duração do serviço, a jornada, as folgas e os agendamentos existentes do profissional.</p>
    </form>
  );
}
