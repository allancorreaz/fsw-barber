"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { CalendarDays, CheckCircle2, LoaderCircle } from "lucide-react";

type BookingService = { id: string; name: string; price: number };
type ProfessionalAvailability = {
  id: string;
  name: string;
  availableSlots: string[];
};
type BookingFormProps = { services: BookingService[]; canPayOnline?: boolean };

export function BookingForm({
  services,
  canPayOnline = false,
}: BookingFormProps) {
  const [serviceId, setServiceId] = useState(services[0]?.id ?? "");
  const [date, setDate] = useState("");
  const [professionalId, setProfessionalId] = useState("");
  const [time, setTime] = useState("");
  const [professionals, setProfessionals] = useState<
    ProfessionalAvailability[]
  >([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [pendingPayment, setPendingPayment] = useState<{
    bookingId: string;
    amount: number;
  } | null>(null);
  const [paying, setPaying] = useState(false);
  const [availabilityState, setAvailabilityState] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  const minimumDate = new Date().toLocaleDateString("en-CA");
  const selectedProfessional = professionals.find(
    (professional) => professional.id === professionalId,
  );
  const availableSlots = useMemo(
    () => selectedProfessional?.availableSlots ?? [],
    [selectedProfessional],
  );

  useEffect(() => {
    if (!date || !serviceId) return;
    let active = true;
    // O estado "loading" e a limpeza do erro são feitos nos handlers de mudança de serviço/data.
    fetch(
      `/api/bookings?serviceId=${encodeURIComponent(serviceId)}&date=${encodeURIComponent(date)}`,
      { cache: "no-store" },
    )
      .then(async (response) => {
        const result = (await response.json()) as {
          professionals?: ProfessionalAvailability[];
          error?: string;
        };
        if (!response.ok)
          throw new Error(
            result.error || "Não foi possível consultar a disponibilidade.",
          );
        if (active) {
          setProfessionals(result.professionals ?? []);
          setProfessionalId("");
          setTime("");
          setAvailabilityState("ready");
        }
      })
      .catch((reason: Error) => {
        if (active) {
          setError(reason.message);
          setAvailabilityState("error");
        }
      });
    return () => {
      active = false;
    };
  }, [date, serviceId]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    setPendingPayment(null);
    if (!serviceId || !professionalId || !date || !time) {
      setError(
        "Selecione o serviço, a data, o profissional e um horário disponível.",
      );
      return;
    }
    setSubmitting(true);
    try {
      const response = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceId,
          professionalId,
          dateTime: `${date}T${time}`,
        }),
      });
      const result = (await response.json()) as {
        error?: string;
        message?: string;
        bookingId?: string;
        amountDue?: number;
      };
      if (!response.ok) {
        setError(result.error ?? "Não foi possível solicitar o agendamento.");
        return;
      }
      setMessage(result.message ?? "Agendamento solicitado com sucesso.");
      setPendingPayment(
        result.bookingId && result.amountDue
          ? { bookingId: result.bookingId, amount: result.amountDue }
          : null,
      );
      setDate("");
      setTime("");
      setProfessionalId("");
      setProfessionals([]);
      setAvailabilityState("idle");
    } catch {
      setError("Não foi possível conectar ao servidor. Tente novamente.");
    } finally {
      setSubmitting(false);
    }
  }

  async function payNow() {
    if (!pendingPayment) return;
    setPaying(true);
    setError("");
    try {
      const response = await fetch(
        `/api/bookings/${pendingPayment.bookingId}/checkout`,
        { method: "POST" },
      );
      const result = (await response.json()) as {
        url?: string;
        error?: string;
      };
      if (!response.ok || !result.url) {
        setError(result.error ?? "Não foi possível gerar o pagamento.");
        return;
      }
      window.location.href = result.url;
    } catch {
      setError("Não foi possível conectar ao servidor.");
    } finally {
      setPaying(false);
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
          onChange={(event) => {
            setServiceId(event.target.value);
            setError("");
            setProfessionalId("");
            setTime("");
            setProfessionals([]);
            setAvailabilityState(date ? "loading" : "idle");
          }}
          className="w-full rounded-xl border border-white/10 bg-[#171717] px-3 py-3 text-white outline-none focus:border-[#c8f169]"
          required
        >
          {services.map((service) => (
            <option key={service.id} value={service.id}>
              {service.name} —{" "}
              {service.price.toLocaleString("pt-BR", {
                style: "currency",
                currency: "BRL",
              })}
            </option>
          ))}
        </select>
      </label>

      <label className="block space-y-2 text-sm">
        <span className="font-semibold text-neutral-200">Data</span>
        <input
          type="date"
          min={minimumDate}
          value={date}
          onChange={(event) => {
            setDate(event.target.value);
            setError("");
            setProfessionalId("");
            setTime("");
            setProfessionals([]);
            setAvailabilityState(event.target.value ? "loading" : "idle");
          }}
          className="w-full rounded-xl border border-white/10 bg-[#171717] px-3 py-3 text-white outline-none focus:border-[#c8f169]"
          required
        />
      </label>

      {date && availabilityState === "loading" && (
        <p className="text-xs text-neutral-400">
          Consultando a agenda da equipe...
        </p>
      )}
      {date && availabilityState === "error" && (
        <p role="alert" className="text-xs text-red-200">
          {error ||
            "Não foi possível consultar a disponibilidade. Tente novamente."}
        </p>
      )}

      {date && availabilityState === "ready" && (
        <>
          <label className="block space-y-2 text-sm">
            <span className="font-semibold text-neutral-200">
              Escolha seu barbeiro
            </span>
            <select
              value={professionalId}
              onChange={(event) => {
                setProfessionalId(event.target.value);
                setTime("");
              }}
              className="w-full rounded-xl border border-white/10 bg-[#171717] px-3 py-3 text-white outline-none focus:border-[#c8f169]"
              required
            >
              <option value="">Selecione um profissional</option>
              {professionals.map((professional) => (
                <option key={professional.id} value={professional.id}>
                  {professional.name} · {professional.availableSlots.length}{" "}
                  horários livres
                </option>
              ))}
            </select>
          </label>
          {professionals.length === 0 && (
            <p className="rounded-xl border border-amber-300/20 bg-amber-300/5 p-3 text-xs text-amber-100">
              Nenhum barbeiro possui horários disponíveis para esse serviço
              nesta data. Escolha outro dia.
            </p>
          )}
        </>
      )}

      {professionalId && (
        <label className="block space-y-2 text-sm">
          <span className="font-semibold text-neutral-200">
            Horários disponíveis
          </span>
          <select
            value={time}
            onChange={(event) => setTime(event.target.value)}
            className="w-full rounded-xl border border-white/10 bg-[#171717] px-3 py-3 text-white outline-none focus:border-[#c8f169]"
            required
          >
            <option value="">Selecione um horário</option>
            {availableSlots.map((slot) => (
              <option key={slot} value={slot}>
                {slot}
              </option>
            ))}
          </select>
          {availableSlots.length === 0 && (
            <span className="block text-xs text-neutral-500">
              Não há horários livres para esse profissional nesta data.
            </span>
          )}
        </label>
      )}

      {error && (
        <p
          role="alert"
          className="rounded-xl border border-red-400/20 bg-red-400/10 p-3 text-sm text-red-200"
        >
          {error}
        </p>
      )}
      {message && (
        <p
          role="status"
          className="flex items-start gap-2 rounded-xl border border-[#c8f169]/20 bg-[#c8f169]/10 p-3 text-sm text-[#d8f69c]"
        >
          <CheckCircle2 size={18} className="mt-0.5 shrink-0" /> {message}
        </p>
      )}
      {pendingPayment && (
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-sm text-neutral-300">
          {canPayOnline ? (
            <>
              <p>Quer pagar agora? Você também pode pagar na barbearia.</p>
              <button
                type="button"
                onClick={payNow}
                disabled={paying}
                className="mt-3 w-full rounded-xl border border-[#c8f169]/40 px-4 py-2.5 text-sm font-bold text-[#d8f69c] hover:bg-[#c8f169]/10 disabled:opacity-60"
              >
                {paying
                  ? "Gerando pagamento..."
                  : `Pagar ${pendingPayment.amount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} com Pix ou cartão`}
              </button>
            </>
          ) : (
            <p>O pagamento deste serviço é feito na barbearia.</p>
          )}
        </div>
      )}
      <button
        type="submit"
        disabled={
          submitting ||
          availabilityState === "loading" ||
          availabilityState === "error" ||
          !date ||
          professionals.length === 0 ||
          !professionalId ||
          !time
        }
        className="accent-button flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3.5 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? (
          <LoaderCircle size={17} className="animate-spin" />
        ) : (
          <CalendarDays size={17} />
        )}
        {submitting ? "Solicitando..." : "Solicitar agendamento"}
      </button>
      <p className="text-xs leading-5 text-neutral-500">
        Os horários consideram a duração do serviço, a jornada, as folgas e os
        agendamentos existentes do profissional. O agendamento será vinculado à
        sua conta.
      </p>
    </form>
  );
}
