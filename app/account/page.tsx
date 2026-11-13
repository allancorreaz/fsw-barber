import Link from "next/link";
import { redirect } from "next/navigation";
import { Notice } from "@/app/_components/dashboard-shell";
import { Flash } from "@/app/_components/flash";
import { ROLE_LABEL, isPlatformAdmin } from "@/app/_lib/access";
import { getCurrentUser } from "@/app/_lib/auth";
import { consumerSubscriptionIsUsable } from "@/app/_lib/billing";
import { confirmReturnedPayment } from "@/app/_lib/checkout";
import {
  BOOKING_STATUS_LABEL,
  SUBSCRIPTION_STATUS_LABEL,
  brl,
  formatDate,
  formatDateTime,
} from "@/app/_lib/format";
import { db } from "@/app/_lib/prisma";
import {
  cancelMyBooking,
  cancelMySubscription,
  payMyBooking,
  reviewBooking,
} from "./actions";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{
    ok?: string;
    error?: string;
    pagamento?: string;
    payment_id?: string;
  }>;
};

export default async function AccountPage({ searchParams }: Props) {
  const query = await searchParams;
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/account");

  let paymentNotice = "";
  if (query.pagamento && query.payment_id) {
    const own = await db.billingPayment.findFirst({
      where: { id: query.pagamento, userId: user.id },
    });
    if (own) {
      await confirmReturnedPayment(own.id, query.payment_id).catch((error) =>
        console.error(error),
      );
      const updated = await db.billingPayment.findUnique({
        where: { id: own.id },
        select: { status: true },
      });
      paymentNotice =
        updated?.status === "CONFIRMED"
          ? "Pagamento confirmado!"
          : "Pagamento em processamento. A confirmação pode levar alguns minutos.";
    }
  }

  const [barbershops, subscriptions, bookings] = await Promise.all([
    user.memberships.length
      ? db.barbershop.findMany({
          where: {
            id: { in: user.memberships.map((item) => item.barbershopId) },
          },
          select: { id: true, name: true, address: true },
          orderBy: { createdAt: "desc" },
        })
      : Promise.resolve([]),
    db.consumerSubscription.findMany({
      where: { userId: user.id, status: { not: "PENDING" } },
      include: {
        plan: { select: { name: true } },
        barbershop: { select: { id: true, name: true } },
      },
      orderBy: { currentPeriodEnd: "desc" },
    }),
    db.booking.findMany({
      where: { userId: user.id },
      include: {
        service: { select: { name: true } },
        barbershop: {
          select: {
            id: true,
            name: true,
            mercadoPagoAccount: { select: { id: true } },
          },
        },
        professional: { select: { name: true } },
        payments: { select: { status: true } },
        review: { select: { rating: true } },
      },
      orderBy: { date: "desc" },
      take: 40,
    }),
  ]);
  const roleByShop = new Map(
    user.memberships.map((item) => [item.barbershopId, item.role]),
  );
  const now = new Date();
  const upcoming = bookings
    .filter(
      (booking) =>
        booking.date >= now &&
        ["REQUESTED", "CONFIRMED", "IN_PROGRESS"].includes(booking.status),
    )
    .reverse();
  const toReview = bookings
    .filter((booking) => booking.status === "COMPLETED" && !booking.review)
    .slice(0, 5);
  const history = bookings
    .filter((booking) => !upcoming.includes(booking))
    .slice(0, 15);
  const activeSubs = subscriptions.filter((sub) =>
    consumerSubscriptionIsUsable(sub),
  );

  return (
    <main className="container-shell min-h-screen py-12">
      <header className="flex items-center justify-between border-b border-white/10 pb-6">
        <Link href="/" className="text-xl font-black">
          barber<span className="accent-text">.</span>
        </Link>
        <div className="flex items-center gap-4 text-sm">
          {isPlatformAdmin(user.email) && (
            <Link href="/admin" className="text-[#c8f169]">
              Admin
            </Link>
          )}
          <Link
            href="/barbershops"
            className="text-neutral-400 hover:text-white"
          >
            Barbearias
          </Link>
          <form action="/api/auth/logout" method="post">
            <button className="text-neutral-400 hover:text-white">Sair</button>
          </form>
        </div>
      </header>

      <section className="py-10">
        <p className="text-xs font-bold tracking-[0.2em] text-[#c8f169] uppercase">
          Minha conta
        </p>
        <h1 className="mt-3 text-3xl font-black">Olá, {user.name}.</h1>
        <p className="mt-2 text-sm text-neutral-400">{user.email}</p>
        <div className="mt-6">
          <Flash ok={query.ok} error={query.error} />
          {paymentNotice && (
            <div className="mb-6">
              <Notice tone="success">{paymentNotice}</Notice>
            </div>
          )}
        </div>

        <h2 className="mt-4 text-xl font-bold">Próximos agendamentos</h2>
        {upcoming.length === 0 ? (
          <p className="mt-3 text-sm text-neutral-500">
            Nenhum agendamento futuro.{" "}
            <Link href="/barbershops" className="text-[#c8f169]">
              Encontrar barbearia
            </Link>
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {upcoming.map((booking) => {
              const paid = booking.payments.some(
                (payment) => payment.status === "CONFIRMED",
              );
              const due =
                !booking.coveredByPlan &&
                !paid &&
                Number(booking.priceAtBooking ?? 0) > 0;
              return (
                <li
                  key={booking.id}
                  className="surface flex flex-wrap items-center justify-between gap-4 rounded-2xl p-5"
                >
                  <div>
                    <p className="font-bold">
                      {formatDateTime(booking.date)} · {booking.service.name}
                    </p>
                    <p className="mt-1 text-sm text-neutral-400">
                      <Link
                        href={`/barbershops/${booking.barbershop.id}`}
                        className="hover:text-white"
                      >
                        {booking.barbershop.name}
                      </Link>
                      {booking.professional &&
                        ` · ${booking.professional.name}`}{" "}
                      · {BOOKING_STATUS_LABEL[booking.status]}
                    </p>
                    <p className="mt-1 text-xs">
                      {booking.coveredByPlan ? (
                        <span className="text-[#d8f69c]">Incluso no plano</span>
                      ) : (
                        <span
                          className={paid ? "text-[#d8f69c]" : "text-amber-100"}
                        >
                          {brl(booking.priceAtBooking)} ·{" "}
                          {paid ? "pago" : "a pagar"}
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {due && booking.barbershop.mercadoPagoAccount && (
                      <form action={payMyBooking}>
                        <input
                          type="hidden"
                          name="bookingId"
                          value={booking.id}
                        />
                        <button className="accent-button rounded-lg px-3 py-2 text-xs font-bold">
                          Pagar agora
                        </button>
                      </form>
                    )}
                    {["REQUESTED", "CONFIRMED"].includes(booking.status) && (
                      <form action={cancelMyBooking}>
                        <input
                          type="hidden"
                          name="bookingId"
                          value={booking.id}
                        />
                        <button className="rounded-lg border border-white/10 px-3 py-2 text-xs text-neutral-300 hover:text-white">
                          Cancelar
                        </button>
                      </form>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {toReview.length > 0 && (
          <>
            <h2 className="mt-10 text-xl font-bold">
              Avalie seus atendimentos
            </h2>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {toReview.map((booking) => (
                <form
                  key={booking.id}
                  action={reviewBooking}
                  className="surface space-y-3 rounded-2xl p-5"
                >
                  <input type="hidden" name="bookingId" value={booking.id} />
                  <p className="text-sm font-bold">
                    {booking.barbershop.name} · {booking.service.name}{" "}
                    <span className="font-normal text-neutral-500">
                      ({formatDate(booking.date)})
                    </span>
                  </p>
                  <fieldset className="flex gap-3 text-sm">
                    <legend className="sr-only">Nota</legend>
                    {[5, 4, 3, 2, 1].map((value) => (
                      <label key={value} className="flex items-center gap-1">
                        <input
                          type="radio"
                          name="rating"
                          value={value}
                          required
                          className="accent-[#c8f169]"
                        />
                        {value}★
                      </label>
                    ))}
                  </fieldset>
                  <textarea
                    name="comment"
                    rows={2}
                    maxLength={500}
                    placeholder="Comentário (opcional)"
                    className="w-full rounded-xl border border-white/10 bg-[#171717] px-3 py-2 text-sm outline-none focus:border-[#c8f169]"
                  />
                  <button className="accent-button rounded-lg px-4 py-2 text-xs font-bold">
                    Enviar avaliação
                  </button>
                </form>
              ))}
            </div>
          </>
        )}

        <h2 className="mt-10 text-xl font-bold">Meus planos</h2>
        {subscriptions.length === 0 ? (
          <p className="mt-3 text-sm text-neutral-500">
            Você ainda não assina nenhum plano. É preciso ter um plano para
            agendar.
          </p>
        ) : (
          <ul className="mt-4 grid gap-3 md:grid-cols-2">
            {subscriptions.slice(0, 8).map((sub) => (
              <li key={sub.id} className="surface rounded-2xl p-5">
                <p className="font-bold">{sub.plan.name}</p>
                <p className="text-sm text-neutral-400">
                  <Link
                    href={`/barbershops/${sub.barbershop.id}`}
                    className="hover:text-white"
                  >
                    {sub.barbershop.name}
                  </Link>{" "}
                  · {brl(sub.amount)}/mês
                </p>
                <p className="mt-2 text-xs text-neutral-500">
                  {sub.status === "CANCELLED"
                    ? `Não renova · acesso até ${formatDate(sub.currentPeriodEnd)}`
                    : `${SUBSCRIPTION_STATUS_LABEL[sub.status]} · pago até ${formatDate(sub.currentPeriodEnd)}`}
                </p>
                {activeSubs.includes(sub) && sub.status !== "CANCELLED" && (
                  <form action={cancelMySubscription} className="mt-3">
                    <input type="hidden" name="subscriptionId" value={sub.id} />
                    <button className="text-xs text-red-200 hover:underline">
                      Cancelar renovação
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}

        {history.length > 0 && (
          <>
            <h2 className="mt-10 text-xl font-bold">Histórico</h2>
            <ul className="mt-4 divide-y divide-white/[0.05] text-sm">
              {history.map((booking) => (
                <li
                  key={booking.id}
                  className="flex justify-between gap-3 py-2.5"
                >
                  <span>
                    {formatDate(booking.date)} · {booking.service.name} ·{" "}
                    {booking.barbershop.name}
                  </span>
                  <span className="text-neutral-500">
                    {BOOKING_STATUS_LABEL[booking.status]}
                    {booking.review ? ` · ${booking.review.rating}★` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}

        <div className="mt-12 flex flex-wrap items-end justify-between gap-4 border-t border-white/10 pt-10">
          <div>
            <h2 className="text-xl font-bold">Sou dono de barbearia</h2>
            <p className="mt-1 text-sm text-neutral-400">
              Painéis aos quais sua conta tem acesso.
            </p>
          </div>
          <Link
            href="/dashboard/onboarding"
            className="accent-button rounded-xl px-4 py-3 text-sm font-bold"
          >
            Cadastrar barbearia
          </Link>
        </div>
        {barbershops.length > 0 && (
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {barbershops.map((shop) => {
              const role = roleByShop.get(shop.id);
              return (
                <article key={shop.id} className="surface rounded-2xl p-5">
                  <p className="text-xs font-semibold tracking-wide text-[#c8f169] uppercase">
                    {role ? ROLE_LABEL[role] : ""}
                  </p>
                  <h3 className="mt-2 text-lg font-bold">{shop.name}</h3>
                  <p className="mt-1 text-sm text-neutral-400">
                    {shop.address}
                  </p>
                  <Link
                    href={`/dashboard/${shop.id}`}
                    className="mt-5 inline-flex text-sm font-bold text-[#c8f169] hover:underline"
                  >
                    Abrir painel →
                  </Link>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
