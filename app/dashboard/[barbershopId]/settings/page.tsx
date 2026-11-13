import {
  DashboardShell,
  Notice,
  inputClass,
} from "@/app/_components/dashboard-shell";
import { Flash } from "@/app/_components/flash";
import { LocationFields } from "@/app/_components/location-fields";
import { OWNER_ONLY, requireDashboard } from "@/app/_lib/access";
import { isMercadoPagoConfigured } from "@/app/_lib/config";
import { formatDate } from "@/app/_lib/format";
import { db } from "@/app/_lib/prisma";
import { disconnectMercadoPago, updateBarbershopSettings } from "./actions";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ barbershopId: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
};

export default async function SettingsPage({ params, searchParams }: Props) {
  const { barbershopId } = await params;
  const query = await searchParams;
  const ctx = await requireDashboard(barbershopId, OWNER_ONLY, {
    allowSuspended: true,
  });
  const shop = ctx.barbershop;
  const mp = await db.mercadoPagoAccount.findUnique({
    where: { barbershopId },
    select: { mpUserId: true, liveMode: true, createdAt: true },
  });

  return (
    <DashboardShell
      barbershop={shop}
      roles={ctx.roles}
      userName={ctx.user.name}
      access={ctx.access}
      active="settings"
      title="Configurações"
    >
      <Flash ok={query.ok} error={query.error} />

      <section className="surface rounded-2xl p-6">
        <h2 className="text-lg font-bold">Recebimento pelo Mercado Pago</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-400">
          Os planos e os serviços pagos online caem direto na conta Mercado Pago
          da barbearia. O cliente digita o cartão na página do Mercado Pago: a
          plataforma nunca vê nem guarda os dados do cartão.
        </p>
        <div className="mt-5">
          {mp ? (
            <div className="flex flex-wrap items-center justify-between gap-4">
              <Notice tone="success">
                Conectado (conta {mp.mpUserId}
                {mp.liveMode ? "" : " · modo de teste"}) desde{" "}
                {formatDate(mp.createdAt)}.
              </Notice>
              <div className="flex gap-2">
                <a
                  href={`/api/payments/connect?barbershopId=${barbershopId}`}
                  className="rounded-xl border border-white/10 px-4 py-2.5 text-sm font-semibold text-neutral-200"
                >
                  Reconectar
                </a>
                <form action={disconnectMercadoPago.bind(null, barbershopId)}>
                  <button className="rounded-xl border border-red-400/20 px-4 py-2.5 text-sm font-semibold text-red-200 hover:bg-red-400/10">
                    Desconectar
                  </button>
                </form>
              </div>
            </div>
          ) : isMercadoPagoConfigured() ? (
            <a
              href={`/api/payments/connect?barbershopId=${barbershopId}`}
              className="accent-button inline-block rounded-xl px-5 py-3 text-sm font-bold"
            >
              Conectar minha conta Mercado Pago
            </a>
          ) : (
            <Notice tone="warning">
              A integração com o Mercado Pago ainda não foi configurada pelo
              administrador da plataforma.
            </Notice>
          )}
        </div>
      </section>

      <form
        action={updateBarbershopSettings.bind(null, barbershopId)}
        className="surface mt-6 grid gap-4 rounded-2xl p-6 sm:grid-cols-2"
      >
        <h2 className="text-lg font-bold sm:col-span-2">Dados da barbearia</h2>
        <label className="text-sm">
          Nome
          <input
            name="name"
            required
            maxLength={120}
            defaultValue={shop.name}
            className={`${inputClass} mt-1`}
          />
        </label>
        <label className="text-sm">
          Telefones{" "}
          <span className="text-neutral-500">(separe por vírgula)</span>
          <input
            name="phones"
            defaultValue={shop.phones.join(", ")}
            className={`${inputClass} mt-1`}
          />
        </label>
        <label className="text-sm sm:col-span-2">
          Endereço completo
          <input
            name="address"
            required
            maxLength={240}
            defaultValue={shop.address}
            className={`${inputClass} mt-1`}
          />
        </label>
        <label className="text-sm sm:col-span-2">
          Descrição
          <textarea
            name="description"
            rows={3}
            maxLength={1000}
            defaultValue={shop.description}
            className={`${inputClass} mt-1`}
          />
        </label>
        <label className="text-sm sm:col-span-2">
          Foto de capa{" "}
          <span className="text-neutral-500">(link https da imagem)</span>
          <input
            name="imageUrl"
            maxLength={500}
            defaultValue={shop.imageUrl}
            className={`${inputClass} mt-1`}
          />
        </label>
        <LocationFields latitude={shop.latitude} longitude={shop.longitude} />
        <div className="flex flex-wrap gap-3 sm:col-span-2">
          <button className="accent-button rounded-xl px-5 py-3 text-sm font-bold">
            Salvar
          </button>
          <button
            name="intent"
            value="geocode"
            className="rounded-xl border border-white/10 px-5 py-3 text-sm font-semibold text-neutral-200"
          >
            Salvar e localizar pelo endereço
          </button>
        </div>
      </form>
    </DashboardShell>
  );
}
