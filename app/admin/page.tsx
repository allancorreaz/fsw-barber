import Link from "next/link";
import { Flash } from "@/app/_components/flash";
import { requirePlatformAdmin } from "@/app/_lib/access";
import { computePlatformState } from "@/app/_lib/billing";
import { brl, formatDate } from "@/app/_lib/format";
import { db } from "@/app/_lib/prisma";
import { grantMonths, suspendNow } from "./actions";

export const dynamic = "force-dynamic";

const STATE_LABEL = {
  trial: "Teste",
  active: "Em dia",
  grace: "Atrasada (tolerância)",
  suspended: "Suspensa",
} as const;
const STATE_TONE = {
  trial: "text-sky-200",
  active: "text-[#d8f69c]",
  grace: "text-amber-100",
  suspended: "text-red-200",
} as const;

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  await requirePlatformAdmin();
  const query = await searchParams;
  const shops = await db.barbershop.findMany({
    include: {
      saasSubscription: true,
      members: {
        where: { role: "OWNER" },
        include: { user: { select: { name: true, email: true } } },
      },
      mercadoPagoAccount: { select: { id: true } },
      _count: {
        select: {
          consumerSubscriptions: {
            where: { status: { in: ["ACTIVE", "PAST_DUE"] } },
          },
          bookings: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
  const rows = shops.map((shop) => ({
    shop,
    state: shop.saasSubscription
      ? computePlatformState(shop.saasSubscription)
      : ("trial" as const),
  }));
  const paying = rows.filter((row) => row.state === "active").length;
  const mrr = rows
    .filter((row) => row.state === "active")
    .reduce(
      (acc, row) => acc + Number(row.shop.saasSubscription?.amount ?? 0),
      0,
    );

  return (
    <main className="container-shell min-h-screen py-10">
      <header className="flex items-center justify-between border-b border-white/10 pb-6">
        <Link href="/" className="text-xl font-black">
          barber<span className="accent-text">.</span>{" "}
          <span className="text-sm font-normal text-neutral-500">admin</span>
        </Link>
        <Link
          href="/account"
          className="text-sm text-neutral-400 hover:text-white"
        >
          Minha conta
        </Link>
      </header>
      <h1 className="mt-8 text-3xl font-black">Barbearias na plataforma</h1>
      <p className="mt-2 text-sm text-neutral-400">
        {shops.length} cadastradas · {paying} pagantes · {brl(mrr)}/mês
        recorrente
      </p>
      <div className="mt-6">
        <Flash ok={query.ok} error={query.error} />
      </div>

      <div className="space-y-3">
        {rows.map(({ shop, state }) => {
          const owner = shop.members[0]?.user;
          return (
            <article key={shop.id} className="surface rounded-2xl p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <Link
                    href={`/barbershops/${shop.id}`}
                    className="text-lg font-bold hover:underline"
                  >
                    {shop.name}
                  </Link>
                  <p className="text-xs text-neutral-500">
                    {owner
                      ? `${owner.name} · ${owner.email}`
                      : "Sem proprietário"}{" "}
                    · desde {formatDate(shop.createdAt)}
                  </p>
                  <p className="mt-2 text-xs text-neutral-400">
                    {shop._count.consumerSubscriptions} assinantes ·{" "}
                    {shop._count.bookings} agendamentos · Mercado Pago{" "}
                    {shop.mercadoPagoAccount ? "conectado" : "não conectado"} ·{" "}
                    {shop.latitude ? "no mapa" : "sem localização"}
                  </p>
                </div>
                <div className="text-right text-sm">
                  <p className={`font-bold ${STATE_TONE[state]}`}>
                    {STATE_LABEL[state]}
                  </p>
                  <p className="text-xs text-neutral-500">
                    até {formatDate(shop.saasSubscription?.currentPeriodEnd)}
                    {shop.saasSubscription?.gateway
                      ? ` · ${shop.saasSubscription.gateway}`
                      : ""}
                  </p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-white/[0.07] pt-4">
                <form
                  action={grantMonths}
                  className="flex items-center gap-2 text-xs"
                >
                  <input type="hidden" name="barbershopId" value={shop.id} />
                  <input
                    name="months"
                    type="number"
                    min={1}
                    max={24}
                    defaultValue={1}
                    className="w-16 rounded-lg border border-white/10 bg-[#171717] px-2 py-1.5"
                    aria-label="Meses"
                  />
                  <label className="flex items-center gap-1 text-neutral-400">
                    <input
                      type="checkbox"
                      name="paid"
                      className="accent-[#c8f169]"
                    />{" "}
                    recebi o pagamento
                  </label>
                  <button className="rounded-lg border border-[#c8f169]/30 px-3 py-1.5 font-semibold text-[#d8f69c]">
                    Liberar meses
                  </button>
                </form>
                {state !== "suspended" && (
                  <form action={suspendNow}>
                    <input type="hidden" name="barbershopId" value={shop.id} />
                    <button className="rounded-lg border border-red-400/20 px-3 py-1.5 text-xs text-red-200">
                      Suspender agora
                    </button>
                  </form>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </main>
  );
}
