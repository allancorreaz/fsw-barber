"use client";

import { useState } from "react";
import {
  AlertCircle,
  Clock3,
  ExternalLink,
  LocateFixed,
  MapPin,
  Navigation,
  Phone,
  RefreshCw,
  Scissors,
} from "lucide-react";

type NearbyBarbershop = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  distanceKm: number;
  address: string | null;
  phone: string | null;
  website: string | null;
  openingHours: string | null;
  osmUrl: string;
  mapsUrl: string;
  platform: {
    id: string;
    services: Array<{ name: string; price: number }>;
  } | null;
};

type SearchResponse = {
  barbershops: NearbyBarbershop[];
  count: number;
  radiusKm: number;
  source: string;
};

type SearchStatus = "idle" | "loading" | "success" | "error";

const distanceLabel = (distance: number) =>
  distance < 1
    ? `${Math.round(distance * 1000)} m`
    : `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(distance)} km`;

const currency = (value: number) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);

export function NearbyBarbershops() {
  const [status, setStatus] = useState<SearchStatus>("idle");
  const [barbershops, setBarbershops] = useState<NearbyBarbershop[]>([]);
  const [message, setMessage] = useState("");
  const [hasSearched, setHasSearched] = useState(false);

  const searchNearby = () => {
    if (!navigator.geolocation) {
      setStatus("error");
      setMessage("Seu navegador não oferece suporte à localização. Você ainda pode explorar as barbearias cadastradas na plataforma.");
      return;
    }

    setStatus("loading");
    setMessage("");
    setHasSearched(true);

    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        try {
          const params = new URLSearchParams({
            lat: String(coords.latitude),
            lon: String(coords.longitude),
          });
          const response = await fetch(`/api/nearby-barbershops?${params.toString()}`, {
            cache: "no-store",
          });
          const data = (await response.json()) as SearchResponse & { error?: string };

          if (!response.ok) {
            throw new Error(data.error || "Não foi possível consultar as barbearias próximas.");
          }

          setBarbershops(data.barbershops);
          setStatus("success");
          if (data.barbershops.length === 0) {
            setMessage("Não encontramos barbearias mapeadas nessa região. Isso não significa que não existam estabelecimentos próximos.");
          }
        } catch (error) {
          setStatus("error");
          setMessage(
            error instanceof Error
              ? error.message
              : "O serviço de busca está indisponível. Tente novamente em instantes.",
          );
        }
      },
      (error) => {
        setStatus("error");
        const messages: Record<number, string> = {
          1: "A localização não foi autorizada. Permita o acesso à localização no navegador para encontrar barbearias próximas.",
          2: "Não conseguimos identificar sua localização. Confira o GPS ou a conexão e tente novamente.",
          3: "A localização demorou para responder. Tente novamente.",
        };
        setMessage(messages[error.code] || "Não foi possível acessar sua localização.");
      },
      {
        enableHighAccuracy: false,
        timeout: 15_000,
        maximumAge: 5 * 60 * 1000,
      },
    );
  };

  return (
    <section className="py-14 md:py-16" aria-labelledby="nearby-barbershops-title">
      <div className="container-shell surface overflow-hidden rounded-[2rem] p-6 sm:p-8">
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div className="max-w-2xl">
            <p className="text-xs font-bold tracking-[0.2em] text-[#c8f169] uppercase">
              Descoberta por localização
            </p>
            <h2 id="nearby-barbershops-title" className="mt-3 text-2xl font-black tracking-[-0.05em] sm:text-3xl">
              Barbearias a até 20 km de você.
            </h2>
            <p className="mt-3 text-sm leading-6 text-neutral-400 sm:text-base">
              Encontre estabelecimentos próximos usando sua localização. Você decide quando compartilhar essa informação.
            </p>
          </div>

          <button
            type="button"
            onClick={searchNearby}
            disabled={status === "loading"}
            className="accent-button inline-flex shrink-0 items-center justify-center gap-2 rounded-xl px-5 py-3.5 text-sm font-bold disabled:cursor-wait disabled:opacity-60"
          >
            {status === "loading" ? (
              <RefreshCw size={17} className="animate-spin" />
            ) : (
              <LocateFixed size={17} />
            )}
            {status === "loading"
              ? "Buscando por perto..."
              : hasSearched
                ? "Atualizar minha localização"
                : "Encontrar barbearias perto de mim"}
          </button>
        </div>

        {status === "idle" && (
          <div className="mt-7 flex items-start gap-3 rounded-2xl border border-white/[0.07] bg-black/20 p-4">
            <MapPin size={18} className="mt-0.5 shrink-0 text-[#c8f169]" />
            <p className="text-xs leading-5 text-neutral-400">
              Ao clicar, o navegador solicitará sua autorização. As coordenadas serão enviadas ao serviço OpenStreetMap/Overpass para realizar a busca e não serão salvas no seu cadastro.
            </p>
          </div>
        )}

        {status === "error" && (
          <div role="alert" className="mt-7 flex items-start gap-3 rounded-2xl border border-red-400/20 bg-red-400/[0.06] p-4">
            <AlertCircle size={18} className="mt-0.5 shrink-0 text-red-300" />
            <p className="text-sm leading-6 text-neutral-300">{message}</p>
          </div>
        )}

        {status === "success" && (
          <div className="mt-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-lg font-bold">
                  {barbershops.length} {barbershops.length === 1 ? "estabelecimento encontrado" : "estabelecimentos encontrados"}
                </p>
                <p className="mt-1 text-xs text-neutral-500">Ordenados pela distância da sua localização · raio de 20 km</p>
              </div>
              <span className="rounded-full border border-[#c8f169]/20 bg-[#c8f169]/[0.07] px-3 py-1.5 text-xs font-semibold text-[#d8f69c]">
                <span className="inline-flex items-center gap-1.5"><Navigation size={13} /> Perto de você</span>
              </span>
            </div>

            {barbershops.length > 0 ? (
              <div className="mt-5 grid gap-3 md:grid-cols-2">
                {barbershops.map((barbershop) => (
                  <article key={barbershop.id} className="rounded-2xl border border-white/[0.08] bg-black/20 p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="text-base font-bold leading-6">{barbershop.name}</h3>
                        <p className="mt-1 flex items-start gap-2 text-xs leading-5 text-neutral-400">
                          <MapPin size={14} className="mt-0.5 shrink-0" />
                          {barbershop.address || "Endereço não informado no mapa"}
                        </p>
                      </div>
                      <span className="shrink-0 rounded-full bg-white/[0.06] px-2.5 py-1 text-xs font-semibold text-[#d8f69c]">
                        {distanceLabel(barbershop.distanceKm)}
                      </span>
                    </div>

                    {barbershop.platform ? (
                      <div className="mt-4 rounded-xl border border-[#c8f169]/20 bg-[#c8f169]/[0.06] p-3">
                        <p className="text-xs font-semibold text-[#d8f69c]">Barbearia cadastrada na Barber</p>
                        {barbershop.platform.services.length > 0 ? (
                          <ul className="mt-2 space-y-1.5">
                            {barbershop.platform.services.slice(0, 3).map((service) => (
                              <li key={service.name} className="flex items-center justify-between gap-3 text-xs">
                                <span className="text-neutral-300">{service.name}</span>
                                <span className="font-semibold text-white">{currency(service.price)}</span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="mt-2 text-xs text-neutral-400">Consulte os serviços disponíveis.</p>
                        )}
                        <a
                          href={`/barbershops/${barbershop.platform.id}`}
                          className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-[#c8f169] hover:underline"
                        >
                          Ver barbearia e agendar <ExternalLink size={13} />
                        </a>
                      </div>
                    ) : (
                      <div className="mt-4 rounded-xl border border-white/[0.07] bg-white/[0.025] p-3">
                        <div className="flex items-center gap-2 text-xs font-semibold text-neutral-200">
                          <Scissors size={14} className="text-[#c8f169]" />
                          Valores não disponíveis na Barber
                        </div>
                        <p className="mt-2 text-xs leading-5 text-neutral-400">
                          Ainda não temos acesso aos serviços e valores deste estabelecimento. Entre em contato diretamente com a barbearia para consultar os preços.
                        </p>
                      </div>
                    )}

                    <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-white/[0.07] pt-3 text-xs">
                      {barbershop.phone && (
                        <a
                          href={`tel:${barbershop.phone.replace(/[^\d+]/g, "")}`}
                          className="inline-flex items-center gap-1.5 text-neutral-300 hover:text-[#c8f169]"
                        >
                          <Phone size={13} /> Ligar
                        </a>
                      )}
                      {barbershop.website && (
                        <a
                          href={barbershop.website}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 text-neutral-300 hover:text-[#c8f169]"
                        >
                          <ExternalLink size={13} /> Site
                        </a>
                      )}
                      {barbershop.openingHours && (
                        <span className="inline-flex items-center gap-1.5 text-neutral-500">
                          <Clock3 size={13} /> {barbershop.openingHours}
                        </span>
                      )}
                      <a
                        href={barbershop.mapsUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 font-semibold text-[#c8f169] hover:underline"
                      >
                        <Navigation size={13} /> Como chegar
                      </a>
                      <a
                        href={barbershop.osmUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 text-neutral-500 hover:text-neutral-300"
                      >
                        <ExternalLink size={13} /> Fonte do mapa
                      </a>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="mt-5 rounded-2xl border border-white/[0.07] bg-black/20 px-5 py-8 text-center">
                <Scissors size={23} className="mx-auto text-neutral-500" />
                <p className="mt-3 text-sm font-semibold text-neutral-200">Nenhuma barbearia encontrada nesta busca.</p>
                <p className="mt-2 text-xs leading-5 text-neutral-500">{message}</p>
              </div>
            )}
          </div>
        )}

        <p className="mt-6 text-[11px] leading-5 text-neutral-600">
          Os estabelecimentos próximos são identificados a partir de dados colaborativos do OpenStreetMap. A cobertura e os contatos dependem das informações mapeadas pela comunidade.{" "}
          <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" className="underline hover:text-neutral-400">
            © OpenStreetMap contributors
          </a>
          .
        </p>
      </div>
    </section>
  );
}
