"use client";

import { useEffect, useState, type FormEvent } from "react";
import { CalendarDays, CheckCircle2, LoaderCircle } from "lucide-react";

type BookingService = {
  id: string;
  name: string;
  price: number;
};

type BookingFormProps = {
  services: BookingService[];
};

const timeSlots = Array.from({ length: 18 }, (_, index) => {
  const minutes = 9 * 60 + index * 30;
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
});

export function BookingForm({ services }: BookingFormProps) {
  const [serviceId, setServiceId] = useState(services[0]?.id ?? "");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [unavailableSlots, setUnavailableSlots] = useState<string[]>([]);
  const [availabilityState, setAvailabilityState] = useState<"idle" | "loading" | "ready" | "error">("idle");

  const minimumDate = new Date().toLocaleDateString("en-CA");

  useEffect(() => {
    if (!date || !serviceId) return;

    let active = true;

    fetch(`/api/bookings?serviceId=${encodeURIComponent(serviceId)}&date=${encodeURIComponent(date)}`)
      .then(async (response) => {
        const result = (await response.json()) as { unavailableSlots?: string[] };
        if (!response.ok) throw new Error("Availability lookup failed");
        if (active) {
          setUnavailableSlots(result.unavailableSlots ?? []);
          setAvailabilityState("ready");
        }
      })
      .catch(() => {
        if (active) setAvailabilityState("error");
      });

    return () => {
      active = false;
    };
  }, [date, serviceId]);


  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");

    if (!serviceId || !date || !time || !name.trim() || !email.trim()) {
      setError("Preencha todos os campos para solicitar seu horário.");
      return;
    }

    setSubmitting(true);

    try {
      const response = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceId,
          dateTime: `${date}T${time}`,
          name: name.trim(),
          email: email.trim(),
        }),
      });
      const result = (await response.json()) as { error?: string; message?: string };

      if (!response.ok) {
        setError(result.error ?? "Não foi possível solicitar o agendamento.");
        return;
      }

      setMessage(result.message ?? "Agendamento solicitado com sucesso.");
      setName("");
      setEmail("");
      setDate("");
      setTime("");
      setAvailabilityState("idle");
      setUnavailableSlots([]);
    } catch {
      setError("Não foi possível conectar ao servidor. Tente novamente.");
    } finally {
      setSubmitting(false);
    }
  }

  if (services.length === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-neutral-400">
        Esta barbearia ainda não possui serviços disponíveis para agendamento.
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <label className="block space-y-2 text-sm">
        <span className="font-semibold text-neutral-200">Serviço</span>
        <select
          value={serviceId}
          onChange={(event) => { setServiceId(event.target.value); setAvailabilityState("loading"); setUnavailableSlots([]); }}
          className="w-full rounded-xl border border-white/10 bg-[#171717] px-3 py-3 text-white outline-none focus:border-[#c8f169]"
          required
        >
          {services.map((service) => (
            <option key={service.id} value={service.id}>
              {service.name} — {service.price.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
            </option>
          ))}
        </select>
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="block space-y-2 text-sm">
          <span className="font-semibold text-neutral-200">Data</span>
          <input
            type="date"
            min={minimumDate}
            value={date}
            onChange={(event) => { setDate(event.target.value); setTime(""); setAvailabilityState(event.target.value ? "loading" : "idle"); setUnavailableSlots([]); }}
            className="w-full min-w-0 rounded-xl border border-white/10 bg-[#171717] px-3 py-3 text-white outline-none focus:border-[#c8f169]"
            required
          />
        </label>
        <label className="block space-y-2 text-sm">
          <span className="font-semibold text-neutral-200">Horário</span>
          <select
            value={time}
            onChange={(event) => setTime(event.target.value)}
            className="w-full rounded-xl border border-white/10 bg-[#171717] px-3 py-3 text-white outline-none focus:border-[#c8f169]"
            required
          >
            <option value="">Selecione</option>
            {timeSlots.map((slot) => (
              <option key={slot} value={slot} disabled={unavailableSlots.includes(slot)}>
                {slot}{unavailableSlots.includes(slot) ? " — indisponível" : ""}
              </option>
            ))}
          </select>
        </label>
      </div>

      {date && availabilityState === "loading" && <p className="text-xs text-neutral-400">Consultando horários disponíveis...</p>}
      {date && availabilityState === "error" && <p role="alert" className="text-xs text-red-200">Não foi possível consultar a disponibilidade. Tente selecionar a data novamente.</p>}

      <label className="block space-y-2 text-sm">
        <span className="font-semibold text-neutral-200">Seu nome</span>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={100}
          autoComplete="name"
          placeholder="Como podemos chamar você?"
          className="w-full rounded-xl border border-white/10 bg-[#171717] px-3 py-3 text-white outline-none placeholder:text-neutral-600 focus:border-[#c8f169]"
          required
        />
      </label>

      <label className="block space-y-2 text-sm">
        <span className="font-semibold text-neutral-200">E-mail</span>
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          maxLength={254}
          autoComplete="email"
          placeholder="voce@email.com"
          className="w-full rounded-xl border border-white/10 bg-[#171717] px-3 py-3 text-white outline-none placeholder:text-neutral-600 focus:border-[#c8f169]"
          required
        />
      </label>

      {error && <p role="alert" className="rounded-xl border border-red-400/20 bg-red-400/10 p-3 text-sm text-red-200">{error}</p>}
      {message && (
        <p role="status" className="flex items-start gap-2 rounded-xl border border-[#c8f169]/20 bg-[#c8f169]/10 p-3 text-sm text-[#d8f69c]">
          <CheckCircle2 size={18} className="mt-0.5 shrink-0" /> {message}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting || availabilityState === "loading" || availabilityState === "error"}
        className="accent-button flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3.5 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? <LoaderCircle size={17} className="animate-spin" /> : <CalendarDays size={17} />}
        {submitting ? "Solicitando..." : "Solicitar agendamento"}
      </button>
      <p className="text-xs leading-5 text-neutral-500">
        Os horários são reservados em intervalos de 30 minutos. A solicitação depende da disponibilidade da barbearia.
      </p>
    </form>
  );
}
