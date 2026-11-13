import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { DashboardShell, inputClass } from "@/app/_components/dashboard-shell";
import { Flash } from "@/app/_components/flash";
import {
  ALL_STAFF,
  professionalForUser,
  requireDashboard,
} from "@/app/_lib/access";
import {
  BOOKING_STATUS_LABEL,
  brl,
  formatDate,
  formatTime,
  localDateKey,
  startOfLocalDay,
} from "@/app/_lib/format";
import { db } from "@/app/_lib/prisma";
import { markServicePaid, updateBookingStatus } from "./actions";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ barbershopId: string }>;
  searchParams: Promise<{
    date?: string;
    professional?: string;
    status?: string;
    ok?: string;
    error?: string;
  }>;
};

const STATUS_TONE: Record<string, string> = {
  REQUESTED: "bg-amber-300/10 text-amber-100",
  CONFIRMED: "bg-sky-300/10 text-sky-100",
  IN_PROGRESS: "bg-violet-300/10 text-violet-100",
  COMPLETED: "bg-[#c8f169]/10 text-[#d8f69c]",
  CANCELLED: "bg-white/5 text-neutral-500",
  NO_SHOW: "bg-red-400/10 text-red-200",
};

export default async function AgendaPage({ params, searchParams }: Props) {
  const { barbershopId } = await params;
  const query = await searchParams;
  const ctx = await requireDashboard(barbershopId, ALL_STAFF);
  const isFrontDesk = ctx.roles.some((role) => role !== "BARBER");
  const own = isFrontDesk
    ? null
    : await professionalForUser(barbershopId, ctx.user.id);

  const date =
    query.date && /^\d{4}-\d{2}-\d{2}$/.test(query.date)
      ? query.date
      : localDateKey();
  const pendingOnly = query.status === "REQUESTED";
  const dayStart = startOfLocalDay(date);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

  const professionals = isFrontDesk
    ? await db.professional.findMany({
        where: { barbershopId },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      })
    : [];
  const professionalFilter = isFrontDesk
    ? query.professional || undefined
    : (own?.id ?? "__none__");

  const where: Prisma.BookingWhereInput = {
    barbershopId,
    ...(professionalFilter ? { professionalId: professionalFilter } : {}),
    ...(pendingOnly
      ? { status: "REQUESTED", date: { gte: new Date() } }
      : { date: { gte: dayStart, lt: dayEnd } }),
  };
  const bookings = await db.booking.findMany({
    where,
    include: {
      user: { select: { name: true, email: true } },
      service: { select: { name: true } },
      professional: { select: { name: true } },
      payments: { select: { status: true, method: true } },
    },
    orderBy: { date: "asc" },
    take: 200,
  });

  const shift = (days: number) =>
    localDateKey(
      new Date(
        dayStart.getTime() + days * 24 * 60 * 60 * 1000 + 12 * 60 * 60 * 1000,
      ),
    );
  const base = `/dashboard/${barbershopId}/agenda`;
  const keep = (extra: Record<string, string>) => {
    const sp = new URLSearchParams({
      date,
      ...(query.professional ? { professional: query.professional } : {}),
      ...extra,
    });
    return `${base}?${sp.toString()}`;
  };
  const returnTo = pendingOnly ? `${base}?status=REQUESTED` : keep({});

  return (
    <DashboardShell
      barbershop={ctx.barbershop}
      roles={ctx.roles}
      userName={ctx.user.name}
      access={ctx.access}
      active="agenda"
      title={
        pendingOnly
          ? "Aguardando confirmação"
          : `Agenda · ${formatDate(dayStart)}`
      }
      description={
        isFrontDesk
          ? "Atendimentos de toda a equipe."
          : own
            ? `Seus atendimentos, ${own.name}.`
            : "Seu acesso não está vinculado a um profissional."
      }
      actions={
        own ? (
          <Link
            href={`/dashboard/${barbershopId}/professionals/${own.id}/schedule`}
            className="rounded-xl border border-white/10 px-4 py-2.5 text-sm font-semibold text-neutral-200 hover:border-[#c8f169]/40"
          >
            Minha jornada e folgas
          </Link>
        ) : undefined
      }
    >
      <Flash ok={query.ok} error={query.error} />

      <form className="mb-6 flex flex-wrap items-end gap-3" action={base}>
        <label className="text-xs text-neutral-400">
          Dia
          <input
            type="date"
            name="date"
            defaultValue={date}
            className={`${inputClass} mt-1 w-auto`}
          />
        </label>
        {isFrontDesk && (
          <label className="text-xs text-neutral-400">
            Profissional
            <select
              name="professional"
              defaultValue={query.professional ?? ""}
              className={`${inputClass} mt-1 w-auto`}
            >
              <option value="">Todos</option>
              {professionals.map((professional) => (
                <option key={professional.id} value={professional.id}>
                  {professional.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <button className="accent-button rounded-xl px-4 py-2.5 text-sm font-bold">
          Filtrar
        </button>
        <div className="ml-auto flex gap-2 text-sm">
          <Link
            href={keep({ date: shift(-1) })}
            className="rounded-lg border border-white/10 px-3 py-2 text-neutral-300 hover:text-white"
          >
            ← Anterior
          </Link>
          <Link
            href={keep({ date: localDateKey() })}
            className="rounded-lg border border-white/10 px-3 py-2 text-neutral-300 hover:text-white"
          >
            Hoje
          </Link>
          <Link
            href={keep({ date: shift(1) })}
            className="rounded-lg border border-white/10 px-3 py-2 text-neutral-300 hover:text-white"
          >
            Próximo →
          </Link>
        </div>
      </form>

      {bookings.length === 0 ? (
        <div className="surface rounded-2xl p-8 text-center text-sm text-neutral-400">
          Nenhum atendimento{" "}
          {pendingOnly ? "aguardando confirmação" : "neste dia"}.
        </div>
      ) : (
        <ul className="space-y-3">
          {bookings.map((booking) => {
            const paid = booking.payments.some(
              (payment) => payment.status === "CONFIRMED",
            );
            const open = ["REQUESTED", "CONFIRMED", "IN_PROGRESS"].includes(
              booking.status,
            );
            const statusAction = updateBookingStatus.bind(
              null,
              barbershopId,
              returnTo,
            );
            const payAction = markServicePaid.bind(
              null,
              barbershopId,
              returnTo,
            );
            return (
              <li key={booking.id} className="surface rounded-2xl p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-start gap-4">
                    <div className="w-16 shrink-0">
                      <p className="text-xl font-black tabular-nums">
                        {formatTime(booking.date)}
                      </p>
                      {pendingOnly && (
                        <p className="text-xs text-neutral-500">
                          {formatDate(booking.date)}
                        </p>
                      )}
                    </div>
                    <div>
                      <p className="font-bold">{booking.user.name}</p>
                      <p className="text-xs text-neutral-500">
                        {booking.user.email}
                      </p>
                      <p className="mt-2 text-sm text-neutral-300">
                        {booking.service.name}
                        {booking.professional && (
                          <span className="text-neutral-500">
                            {" "}
                            · com {booking.professional.name}
                          </span>
                        )}
                      </p>
                      <p className="mt-1 text-xs">
                        {booking.coveredByPlan ? (
                          <span className="text-[#d8f69c]">
                            Incluso no plano
                          </span>
                        ) : (
                          <span
                            className={
                              paid ? "text-[#d8f69c]" : "text-amber-100"
                            }
                          >
                            Avulso · {brl(booking.priceAtBooking)} ·{" "}
                            {paid ? "pago" : "a receber"}
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${STATUS_TONE[booking.status]}`}
                  >
                    {BOOKING_STATUS_LABEL[booking.status]}
                  </span>
                </div>

                {(open ||
                  (!booking.coveredByPlan &&
                    !paid &&
                    booking.status !== "CANCELLED")) && (
                  <div className="mt-4 flex flex-wrap gap-2 border-t border-white/[0.07] pt-4">
                    {booking.status === "REQUESTED" && (
                      <ActionButton
                        action={statusAction}
                        id={booking.id}
                        transition="confirm"
                        label="Confirmar"
                        primary
                      />
                    )}
                    {["REQUESTED", "CONFIRMED"].includes(booking.status) && (
                      <ActionButton
                        action={statusAction}
                        id={booking.id}
                        transition="start"
                        label="Iniciar"
                      />
                    )}
                    {open && (
                      <ActionButton
                        action={statusAction}
                        id={booking.id}
                        transition="complete"
                        label="Concluir"
                        primary={booking.status !== "REQUESTED"}
                      />
                    )}
                    {["REQUESTED", "CONFIRMED"].includes(booking.status) && (
                      <ActionButton
                        action={statusAction}
                        id={booking.id}
                        transition="no_show"
                        label="Não veio"
                      />
                    )}
                    {["REQUESTED", "CONFIRMED"].includes(booking.status) && (
                      <ActionButton
                        action={statusAction}
                        id={booking.id}
                        transition="cancel"
                        label="Cancelar"
                      />
                    )}
                    {!booking.coveredByPlan &&
                      !paid &&
                      booking.status !== "CANCELLED" && (
                        <form
                          action={payAction}
                          className="flex items-center gap-2"
                        >
                          <input
                            type="hidden"
                            name="bookingId"
                            value={booking.id}
                          />
                          <select
                            name="method"
                            className="rounded-lg border border-white/10 bg-[#171717] px-2 py-2 text-xs"
                            aria-label="Forma de pagamento"
                          >
                            <option value="pix">Pix</option>
                            <option value="cartao">Cartão</option>
                            <option value="dinheiro">Dinheiro</option>
                          </select>
                          <button className="rounded-lg border border-[#c8f169]/30 px-3 py-2 text-xs font-semibold text-[#d8f69c] hover:bg-[#c8f169]/10">
                            Registrar pagamento
                          </button>
                        </form>
                      )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </DashboardShell>
  );
}

function ActionButton({
  action,
  id,
  transition,
  label,
  primary,
}: {
  action: (form: FormData) => Promise<void>;
  id: string;
  transition: string;
  label: string;
  primary?: boolean;
}) {
  return (
    <form action={action}>
      <input type="hidden" name="bookingId" value={id} />
      <input type="hidden" name="transition" value={transition} />
      <button
        className={
          primary
            ? "accent-button rounded-lg px-3 py-2 text-xs font-bold"
            : "rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-neutral-300 hover:text-white"
        }
      >
        {label}
      </button>
    </form>
  );
}
