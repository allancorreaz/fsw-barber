import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import {
  ArrowLeft,
  CheckCircle2,
  Clock3,
  Lock,
  MapPin,
  Phone,
  Scissors,
  Star,
} from "lucide-react";
import { BookingForm } from "@/app/_components/booking-form";
import { Notice } from "@/app/_components/dashboard-shell";
import { getCurrentUser } from "@/app/_lib/auth";
import {
  computePlatformState,
  findUsableConsumerSubscription,
  planCoverage,
} from "@/app/_lib/billing";
import { syncConsumerSubscription } from "@/app/_lib/checkout";
import { SUBSCRIPTION_STATUS_LABEL, brl, formatDate } from "@/app/_lib/format";
import { db } from "@/app/_lib/prisma";
import { subscribeToPlan } from "./actions";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ assinatura?: string; error?: string }>;
};

export default async function BarbershopDetailsPage({
  params,
  searchParams,
}: Props) {
  await connection();
  const { id } = await params;
  const query = await searchParams;
  const user = await getCurrentUser();

  const barbershop = await db.barbershop.findUnique({
    where: { id },
    include: {
      services: { where: { active: true }, orderBy: { name: "asc" } },
      consumerPlans: {
        where: { active: true },
        include: {
          services: {
            select: { serviceId: true, service: { select: { name: true } } },
          },
        },
        orderBy: { price: "asc" },
      },
      saasSubscription: { select: { status: true, currentPeriodEnd: true } },
      mercadoPagoAccount: { select: { id: true } },
      reviews: {
        orderBy: { createdAt: "desc" },
        take: 6,
        include: { user: { select: { name: true } } },
      },
      _count: { select: { reviews: true } },
    },
  });
  if (!barbershop) notFound();

  if (
    barbershop.saasSubscription &&
    computePlatformState(barbershop.saasSubscription) === "suspended"
  ) {
    return (
      <main className="container-shell grid min-h-screen place-items-center py-16 text-center">
        <div className="max-w-md">
          <Lock className="mx-auto text-neutral-500" />
          <h1 className="mt-4 text-2xl font-black">{barbershop.name}</h1>
          <p className="mt-3 text-sm text-neutral-400">
            Esta barbearia está temporariamente indisponível na plataforma.
            Entre em contato diretamente com ela.
          </p>
          <Link
            href="/barbershops"
            className="mt-6 inline-block text-sm font-bold text-[#c8f169]"
          >
            Ver outras barbearias
          </Link>
        </div>
      </main>
    );
  }

  // Volta do checkout do Mercado Pago: confere o status na hora.
  let returnNotice: { tone: "success" | "warning"; text: string } | null = null;
  if (user && query.assinatura) {
    const sub = await db.consumerSubscription.findFirst({
      where: { id: query.assinatura, userId: user.id, barbershopId: id },
    });
    if (sub) {
      const synced = await syncConsumerSubscription(sub.id).catch(() => sub);
      returnNotice =
        synced?.status === "ACTIVE"
          ? {
              tone: "success",
              text: "Assinatura confirmada! Agora você já pode agendar.",
            }
          : {
              tone: "warning",
              text: `Status da assinatura: ${SUBSCRIPTION_STATUS_LABEL[synced?.status ?? sub.status]}. Se você concluiu o pagamento, a confirmação pode levar alguns minutos.`,
            };
    }
  }

  const subscription = user
    ? await findUsableConsumerSubscription(user.id, id)
    : null;
  const ratingAgg = await db.review.aggregate({
    where: { barbershopId: id },
    _avg: { rating: true },
  });
  const avgRating = ratingAgg._avg.rating;
  const canPayOnline = Boolean(barbershop.mercadoPagoAccount);

  let remainingLabel = "";
  if (subscription) {
    const firstIncluded = subscription.plan.services[0]?.serviceId;
    const coverage = firstIncluded
      ? await planCoverage(db, subscription, firstIncluded)
      : null;
    remainingLabel =
      subscription.plan.bookingsPerCycle == null
        ? "Atendimentos ilimitados no plano"
        : `${coverage?.remaining ?? 0} de ${subscription.plan.bookingsPerCycle} atendimentos restantes neste ciclo`;
  }
  const includedIds = new Set(
    subscription?.plan.services.map((service) => service.serviceId) ?? [],
  );

  return (
    <main className="min-h-screen">
      <header className="border-b border-white/[0.07]">
        <div className="container-shell flex h-[76px] items-center justify-between">
          <Link href="/" className="text-xl font-black tracking-[-0.06em]">
            barber<span className="accent-text">.</span>
          </Link>
          <Link
            href="/barbershops"
            className="inline-flex items-center gap-2 text-sm text-neutral-400 transition hover:text-white"
          >
            <ArrowLeft size={16} /> Todas as barbearias
          </Link>
        </div>
      </header>

      <section className="container-shell py-8 md:py-12">
        <div
          className="relative flex min-h-[260px] items-end overflow-hidden rounded-[2rem] border border-white/10 bg-[radial-gradient(ellipse_at_75%_20%,rgba(200,241,105,.2),transparent_38%),linear-gradient(135deg,#30352a,#171717_60%,#0c0c0c)] bg-cover bg-center p-7 sm:min-h-[340px] sm:p-10"
          style={
            barbershop.imageUrl
              ? {
                  backgroundImage: `linear-gradient(0deg,rgba(0,0,0,.82),rgba(0,0,0,.05)),url("${barbershop.imageUrl}")`,
                }
              : undefined
          }
        >
          <div className="relative max-w-2xl">
            <p className="text-xs font-bold tracking-[0.2em] text-[#d8f69c] uppercase">
              Barbearia
            </p>
            <h1 className="mt-3 text-4xl font-black tracking-[-0.06em] sm:text-5xl">
              {barbershop.name}
            </h1>
            <p className="mt-4 flex items-center gap-2 text-sm text-white/75">
              <MapPin size={16} /> {barbershop.address}
            </p>
            {avgRating != null && (
              <p className="mt-2 flex items-center gap-2 text-sm text-white/80">
                <Star size={16} className="fill-[#c8f169] text-[#c8f169]" />{" "}
                {avgRating.toFixed(1)} · {barbershop._count.reviews}{" "}
                {barbershop._count.reviews === 1 ? "avaliação" : "avaliações"}
              </p>
            )}
          </div>
        </div>

        {returnNotice && (
          <div className="mt-6">
            <Notice tone={returnNotice.tone}>{returnNotice.text}</Notice>
          </div>
        )}
        {query.error && (
          <div className="mt-6">
            <Notice tone="error">{query.error}</Notice>
          </div>
        )}

        <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_340px]">
          <section className="space-y-12">
            <div>
              <h2 className="text-2xl font-black tracking-tight">
                Sobre a barbearia
              </h2>
              <p className="mt-3 text-sm leading-7 whitespace-pre-line text-neutral-400">
                {barbershop.description ||
                  "Entre em contato para saber mais sobre esta barbearia."}
              </p>
            </div>

            <div id="planos" className="scroll-mt-6">
              <p className="text-xs font-bold tracking-[0.2em] text-[#c8f169] uppercase">
                Assinatura
              </p>
              <h2 className="mt-2 text-2xl font-black tracking-tight">
                Planos
              </h2>
              <p className="mt-2 text-sm text-neutral-400">
                O agendamento online é exclusivo para assinantes. A mensalidade
                é cobrada no cartão de crédito, pelo Mercado Pago.
              </p>
              {barbershop.consumerPlans.length === 0 ? (
                <div className="surface mt-5 rounded-2xl p-6 text-sm text-neutral-400">
                  Esta barbearia ainda não publicou planos.
                </div>
              ) : (
                <div className="mt-5 grid gap-4 md:grid-cols-2">
                  {barbershop.consumerPlans.map((plan) => {
                    const current = subscription?.planId === plan.id;
                    return (
                      <article
                        key={plan.id}
                        className={`surface flex flex-col rounded-2xl p-6 ${current ? "border-[#c8f169]/40" : ""}`}
                      >
                        <h3 className="text-lg font-bold">{plan.name}</h3>
                        <p className="mt-1 text-3xl font-black text-[#c8f169]">
                          {brl(plan.price)}
                          <span className="text-sm font-normal text-neutral-500">
                            /mês
                          </span>
                        </p>
                        {plan.description && (
                          <p className="mt-2 text-sm text-neutral-400">
                            {plan.description}
                          </p>
                        )}
                        <ul className="mt-4 space-y-1.5 text-sm text-neutral-300">
                          <li className="flex gap-2">
                            <CheckCircle2
                              size={16}
                              className="mt-0.5 shrink-0 text-[#c8f169]"
                            />
                            {plan.bookingsPerCycle
                              ? `${plan.bookingsPerCycle} atendimentos por mês`
                              : "Atendimentos ilimitados"}
                          </li>
                          {plan.services.map((item) => (
                            <li key={item.serviceId} className="flex gap-2">
                              <CheckCircle2
                                size={16}
                                className="mt-0.5 shrink-0 text-[#c8f169]"
                              />
                              {item.service.name}
                            </li>
                          ))}
                        </ul>
                        <div className="mt-auto pt-5">
                          {current ? (
                            <p className="text-sm font-semibold text-[#d8f69c]">
                              Seu plano atual
                            </p>
                          ) : subscription &&
                            subscription.status !==
                              "CANCELLED" ? null : !canPayOnline ? (
                            <p className="text-xs text-neutral-500">
                              Assine diretamente na barbearia.
                            </p>
                          ) : user ? (
                            <form action={subscribeToPlan.bind(null, id)}>
                              <input
                                type="hidden"
                                name="planId"
                                value={plan.id}
                              />
                              <button className="accent-button w-full rounded-xl px-4 py-3 text-sm font-bold">
                                Assinar
                              </button>
                            </form>
                          ) : (
                            <Link
                              href={`/login?next=${encodeURIComponent(`/barbershops/${id}#planos`)}`}
                              className="accent-button block rounded-xl px-4 py-3 text-center text-sm font-bold"
                            >
                              Entrar para assinar
                            </Link>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </div>

            <div>
              <h2 className="text-2xl font-black tracking-tight">Serviços</h2>
              {barbershop.services.length ? (
                <div className="mt-5 space-y-3">
                  {barbershop.services.map((service) => (
                    <article
                      key={service.id}
                      className="surface flex flex-col gap-4 rounded-2xl p-5 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="flex items-start gap-4">
                        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#c8f169]/10 text-[#c8f169]">
                          <Scissors size={19} />
                        </span>
                        <div>
                          <h3 className="font-bold">{service.name}</h3>
                          <p className="mt-1 max-w-xl text-sm leading-6 text-neutral-400">
                            {service.description}
                          </p>
                          <p className="mt-1 text-xs text-neutral-500">
                            {service.durationMinutes} min
                          </p>
                        </div>
                      </div>
                      <p className="shrink-0 text-right text-lg font-black text-[#c8f169]">
                        {includedIds.has(service.id) ? (
                          <span className="text-sm">Incluso no seu plano</span>
                        ) : (
                          brl(service.price)
                        )}
                      </p>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="surface mt-5 rounded-2xl p-6 text-sm text-neutral-400">
                  Esta barbearia ainda não cadastrou serviços.
                </div>
              )}
            </div>

            <div>
              <h2 className="text-2xl font-black tracking-tight">
                Avaliações de clientes
              </h2>
              {barbershop.reviews.length === 0 ? (
                <p className="mt-3 text-sm text-neutral-500">
                  Ainda sem avaliações. Clientes avaliam depois de um
                  atendimento concluído.
                </p>
              ) : (
                <div className="mt-5 grid gap-3 md:grid-cols-2">
                  {barbershop.reviews.map((review) => (
                    <article
                      key={review.id}
                      className="surface rounded-2xl p-5"
                    >
                      <p
                        className="flex items-center gap-1 text-[#c8f169]"
                        aria-label={`${review.rating} de 5 estrelas`}
                      >
                        {Array.from({ length: 5 }, (_, index) => (
                          <Star
                            key={index}
                            size={14}
                            className={
                              index < review.rating
                                ? "fill-current"
                                : "opacity-25"
                            }
                          />
                        ))}
                      </p>
                      {review.comment && (
                        <p className="mt-3 text-sm leading-6 text-neutral-300">
                          “{review.comment}”
                        </p>
                      )}
                      <p className="mt-3 text-xs text-neutral-500">
                        {review.user.name.split(" ")[0]} ·{" "}
                        {formatDate(review.createdAt)}
                      </p>
                    </article>
                  ))}
                </div>
              )}
            </div>
          </section>

          <aside className="h-fit space-y-4 lg:sticky lg:top-6">
            <div id="agendar" className="surface scroll-mt-6 rounded-2xl p-5">
              <p className="text-xs font-bold tracking-[0.18em] text-[#c8f169] uppercase">
                Reserve seu horário
              </p>
              <h2 className="mt-2 text-xl font-black">Agendar atendimento</h2>
              {!user ? (
                <div className="mt-4 space-y-3 text-sm text-neutral-400">
                  <p>
                    Entre na sua conta e assine um plano para ver os barbeiros e
                    horários livres.
                  </p>
                  <Link
                    href={`/login?next=${encodeURIComponent(`/barbershops/${id}`)}`}
                    className="accent-button block rounded-xl px-4 py-3 text-center text-sm font-bold"
                  >
                    Entrar
                  </Link>
                </div>
              ) : !subscription ? (
                <div className="mt-4 space-y-3 text-sm text-neutral-400">
                  <p className="flex gap-2">
                    <Lock size={16} className="mt-0.5 shrink-0" /> O agendamento
                    é exclusivo para assinantes desta barbearia.
                  </p>
                  <a
                    href="#planos"
                    className="accent-button block rounded-xl px-4 py-3 text-center text-sm font-bold"
                  >
                    Ver planos
                  </a>
                </div>
              ) : (
                <>
                  <div className="mt-3 mb-5 rounded-xl border border-[#c8f169]/20 bg-[#c8f169]/[0.06] p-3 text-xs text-[#d8f69c]">
                    <p className="font-bold">{subscription.plan.name}</p>
                    <p className="mt-1">
                      {remainingLabel} · válido até{" "}
                      {formatDate(subscription.currentPeriodEnd)}
                    </p>
                    <p className="mt-1 text-neutral-400">
                      Serviços fora do plano são cobrados à parte.
                    </p>
                  </div>
                  <BookingForm
                    canPayOnline={canPayOnline}
                    services={barbershop.services.map((service) => ({
                      id: service.id,
                      name: includedIds.has(service.id)
                        ? `${service.name} (plano)`
                        : service.name,
                      price: Number(service.price),
                    }))}
                  />
                </>
              )}
            </div>

            <div className="surface rounded-2xl p-5">
              <h2 className="font-bold">Informações</h2>
              <p className="mt-4 flex items-start gap-3 text-sm leading-6 text-neutral-400">
                <MapPin size={17} className="mt-0.5 shrink-0 text-[#c8f169]" />
                {barbershop.address}
              </p>
              {barbershop.phones.map((phone) => (
                <a
                  key={phone}
                  href={`tel:${phone.replace(/[^+\d]/g, "")}`}
                  className="mt-3 flex items-center gap-3 text-sm text-neutral-400 transition hover:text-[#c8f169]"
                >
                  <Phone size={16} className="text-[#c8f169]" /> {phone}
                </a>
              ))}
              <div className="mt-5 flex items-center gap-2 border-t border-white/[0.07] pt-4 text-xs leading-5 text-neutral-500">
                <Clock3 size={15} className="shrink-0" /> A barbearia confirma o
                horário após a solicitação.
              </div>
            </div>
          </aside>
        </div>
      </section>
    </main>
  );
}
