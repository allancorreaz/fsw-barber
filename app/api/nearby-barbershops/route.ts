import { db } from "@/app/_lib/prisma";
import { NEARBY_RADIUS_KM } from "@/app/_lib/config";
import { publiclyAvailableBarbershopIds } from "@/app/_lib/billing";

export const maxDuration = 60;

// Barbearias quase não mudam de lugar: cache longo reduz a carga nos servidores gratuitos do mapa.
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const MAX_CACHE_ENTRIES = 100;

type OsmElement = {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

type CacheEntry = {
  expiresAt: number;
  elements: OsmElement[];
};

type RegisteredBarbershop = {
  id: string;
  name: string;
  address: string;
  phones: string[];
  latitude: number | null;
  longitude: number | null;
  services: Array<{ name: string; price: { toString(): string } }>;
  rating: { average: number; count: number } | null;
};

const cache = new Map<string, CacheEntry>();

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizePhone(value: string) {
  return value.replace(/\D/g, "").replace(/^55/, "");
}

function distanceInKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const latitudeDelta = toRadians(lat2 - lat1);
  const longitudeDelta = toRadians(lon2 - lon1);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(longitudeDelta / 2) ** 2;

  return 2 * earthRadiusKm * Math.asin(Math.sqrt(haversine));
}

function buildAddress(tags: Record<string, string>) {
  if (tags["addr:full"]) return tags["addr:full"];

  const street = [tags["addr:street"], tags["addr:housenumber"]]
    .filter(Boolean)
    .join(", ");
  const locality = [tags["addr:suburb"], tags["addr:city"]]
    .filter(Boolean)
    .join(" · ");

  return [street, locality].filter(Boolean).join(" — ") || null;
}

function safeWebsite(value?: string) {
  if (!value) return null;

  try {
    const url = new URL(
      value.match(/^https?:\/\//i) ? value : `https://${value}`,
    );
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

function getCoordinates(element: OsmElement) {
  if (typeof element.lat === "number" && typeof element.lon === "number") {
    return { latitude: element.lat, longitude: element.lon };
  }

  if (element.center) {
    return {
      latitude: element.center.lat,
      longitude: element.center.lon,
    };
  }

  return null;
}

function matchesRegisteredBarbershop(
  element: OsmElement,
  address: string | null,
  registered: RegisteredBarbershop[],
) {
  const tags = element.tags ?? {};
  const name = normalize(tags.name ?? "");
  if (!name) return null;

  const osmPhone = [tags.phone, tags["contact:phone"], tags.mobile]
    .filter(Boolean)
    .map((phone) => normalizePhone(phone as string))
    .filter(Boolean);
  const normalizedAddress = address ? normalize(address) : "";

  const matches = registered.filter((barbershop) => {
    if (normalize(barbershop.name) !== name) return false;

    const phoneMatches = barbershop.phones.some((phone) =>
      osmPhone.includes(normalizePhone(phone)),
    );
    const registeredAddress = normalize(barbershop.address);
    const addressMatches =
      normalizedAddress.length > 0 &&
      registeredAddress.length > 0 &&
      (normalizedAddress === registeredAddress ||
        normalizedAddress.includes(registeredAddress) ||
        registeredAddress.includes(normalizedAddress));

    return phoneMatches || addressMatches;
  });

  if (matches.length !== 1) return null;

  return platformInfo(matches[0]);
}

function platformInfo(match: RegisteredBarbershop) {
  return {
    id: match.id,
    rating: match.rating,
    services: match.services.map((service) => ({
      name: service.name,
      price: Number(service.price.toString()),
    })),
  };
}

async function loadOsmElements(latitude: number, longitude: number) {
  // Arredonda para ~1 km: buscas de pontos vizinhos reaproveitam o mesmo resultado.
  const gridLat = Math.round(latitude * 100) / 100;
  const gridLon = Math.round(longitude * 100) / 100;
  const cacheKey = `${gridLat.toFixed(2)}:${gridLon.toFixed(2)}`;
  const cached = cache.get(cacheKey);

  if (cached && cached.expiresAt > Date.now()) {
    return cached.elements;
  }

  // Área quadrada (bbox) que cobre o círculo do raio: o Overpass processa bbox muito mais rápido
  // que "around". A distância exata é filtrada depois, no nosso servidor.
  // +1 km de folga compensa o arredondamento da grade.
  const reachKm = NEARBY_RADIUS_KM + 1;
  const latDelta = reachKm / 111.32;
  const lonDelta = reachKm / (111.32 * Math.cos((gridLat * Math.PI) / 180));
  const bbox = [
    gridLat - latDelta,
    gridLon - lonDelta,
    gridLat + latDelta,
    gridLon + lonDelta,
  ]
    .map((value) => value.toFixed(5))
    .join(",");

  const query = `[out:json][timeout:25][bbox:${bbox}];
(
  nwr["shop"="barber"];
  nwr["shop"="hairdresser"]["male"="yes"];
  nwr["shop"="hairdresser"]["name"~"barb",i];
  nwr["craft"="hairdresser"]["name"~"barb",i];
);
out center tags qt;`;

  // Servidores públicos do Overpass, consultados ao mesmo tempo: vale a primeira resposta válida.
  const endpoints = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
  ];
  const controllers = endpoints.map(() => new AbortController());

  const attempt = async (endpoint: string, index: number) => {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        Accept: "application/json",
        "User-Agent":
          "FSWBarber/1.0 (+https://github.com/allancorreaz/fsw-barber)",
      },
      body: new URLSearchParams({ data: query }),
      signal: AbortSignal.any([
        controllers[index].signal,
        AbortSignal.timeout(28_000),
      ]),
      cache: "no-store",
    });
    if (!response.ok) {
      const detail = (await response.text().catch(() => ""))
        .slice(0, 120)
        .replace(/\s+/g, " ");
      throw new Error(
        `${endpoint} respondeu HTTP ${response.status}: ${detail}`,
      );
    }
    const payload = (await response.json()) as {
      elements?: OsmElement[];
      remark?: string;
    };
    if (payload.remark && /runtime error|timed out/i.test(payload.remark)) {
      throw new Error(
        `${endpoint} abortou a consulta: ${payload.remark.slice(0, 120)}`,
      );
    }
    return Array.isArray(payload.elements) ? payload.elements : [];
  };

  try {
    const elements = await Promise.any(
      endpoints.map((endpoint, index) => attempt(endpoint, index)),
    );
    controllers.forEach((controller) => controller.abort()); // cancela os que ainda estão rodando

    cache.set(cacheKey, { elements, expiresAt: Date.now() + CACHE_TTL_MS });
    while (cache.size > MAX_CACHE_ENTRIES) {
      const oldestKey = cache.keys().next().value;
      if (!oldestKey) break;
      cache.delete(oldestKey);
    }
    return elements;
  } catch (error) {
    const reasons = error instanceof AggregateError ? error.errors : [error];
    for (const reason of reasons) {
      console.error(
        "[nearby] Overpass erro:",
        reason instanceof Error ? `${reason.name}: ${reason.message}` : reason,
      );
    }
    throw new Error("O serviço de mapas está temporariamente indisponível.");
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const latitude = Number(searchParams.get("lat"));
  const longitude = Number(searchParams.get("lon"));

  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return Response.json(
      { error: "Informe coordenadas válidas para localizar as barbearias." },
      { status: 400 },
    );
  }

  try {
    // Se o mapa colaborativo falhar, ainda mostramos as barbearias cadastradas na plataforma.
    let elements: OsmElement[] = [];
    let mapUnavailable = false;
    try {
      elements = await loadOsmElements(latitude, longitude);
    } catch (error) {
      console.error(
        "[nearby] mapa indisponível:",
        error instanceof Error ? error.message : error,
      );
      mapUnavailable = true;
    }
    let registered: RegisteredBarbershop[] = [];

    try {
      const rows = await db.barbershop.findMany({
        select: {
          id: true,
          name: true,
          address: true,
          phones: true,
          latitude: true,
          longitude: true,
          services: {
            where: { active: true },
            select: { name: true, price: true },
          },
        },
      });
      const isAvailable = await publiclyAvailableBarbershopIds(
        rows.map((row) => row.id),
      );
      const ratings = await db.review.groupBy({
        by: ["barbershopId"],
        _avg: { rating: true },
        _count: { _all: true },
      });
      const ratingByShop = new Map(
        ratings.map((row) => [
          row.barbershopId,
          {
            average: Math.round((row._avg.rating ?? 0) * 10) / 10,
            count: row._count._all,
          },
        ]),
      );
      registered = rows
        .filter((row) => isAvailable(row.id))
        .map((row) => ({ ...row, rating: ratingByShop.get(row.id) ?? null }));
    } catch {
      // A descoberta pública continua funcionando mesmo se o catálogo interno estiver indisponível.
    }

    const barbershops = elements.flatMap((element) => {
      const tags = element.tags ?? {};
      const coordinates = getCoordinates(element);
      const name = tags.name?.trim();

      if (!coordinates || !name) return [];

      const distanceKm = distanceInKm(
        latitude,
        longitude,
        coordinates.latitude,
        coordinates.longitude,
      );

      if (distanceKm > NEARBY_RADIUS_KM) return [];

      const address = buildAddress(tags);
      const platform = matchesRegisteredBarbershop(
        element,
        address,
        registered,
      );
      const phone = tags.phone ?? tags["contact:phone"] ?? tags.mobile ?? null;
      const website = safeWebsite(tags.website ?? tags["contact:website"]);

      return [
        {
          id: `${element.type}-${element.id}`,
          name,
          latitude: coordinates.latitude,
          longitude: coordinates.longitude,
          distanceKm: Math.round(distanceKm * 10) / 10,
          address,
          phone,
          website,
          openingHours: (tags.opening_hours ?? null) as string | null,
          osmUrl:
            `https://www.openstreetmap.org/${element.type}/${element.id}` as
              string | null,
          mapsUrl: `https://www.google.com/maps/search/?api=1&query=${coordinates.latitude},${coordinates.longitude}`,
          platform,
        },
      ];
    });

    // Barbearias cadastradas com localização que não apareceram (ou não existem) no OpenStreetMap.
    const matchedIds = new Set(
      barbershops.map((item) => item.platform?.id).filter(Boolean),
    );
    for (const shop of registered) {
      if (
        matchedIds.has(shop.id) ||
        shop.latitude == null ||
        shop.longitude == null
      )
        continue;
      const distanceKm = distanceInKm(
        latitude,
        longitude,
        shop.latitude,
        shop.longitude,
      );
      if (distanceKm > NEARBY_RADIUS_KM) continue;
      barbershops.push({
        id: `platform-${shop.id}`,
        name: shop.name,
        latitude: shop.latitude,
        longitude: shop.longitude,
        distanceKm: Math.round(distanceKm * 10) / 10,
        address: shop.address,
        phone: shop.phones[0] ?? null,
        website: null,
        openingHours: null,
        osmUrl: null,
        mapsUrl: `https://www.google.com/maps/search/?api=1&query=${shop.latitude},${shop.longitude}`,
        platform: platformInfo(shop),
      });
    }
    barbershops.sort((a, b) => {
      if (
        Boolean(a.platform) !== Boolean(b.platform) &&
        Math.abs(a.distanceKm - b.distanceKm) < 1
      )
        return a.platform ? -1 : 1;
      return a.distanceKm - b.distanceKm;
    });

    const uniqueBarbershops = barbershops.filter((barbershop, index, all) => {
      const currentName = normalize(barbershop.name);
      const currentAddress = normalize(barbershop.address ?? "");
      return !all.slice(0, index).some((previous) => {
        if (normalize(previous.name) !== currentName) return false;
        const previousAddress = normalize(previous.address ?? "");
        if (currentAddress && previousAddress)
          return currentAddress === previousAddress;
        return (
          Math.abs(previous.latitude - barbershop.latitude) < 0.0002 &&
          Math.abs(previous.longitude - barbershop.longitude) < 0.0002
        );
      });
    });

    return Response.json(
      {
        barbershops: uniqueBarbershops,
        count: uniqueBarbershops.length,
        radiusKm: NEARBY_RADIUS_KM,
        source: "OpenStreetMap",
        mapUnavailable,
      },
      {
        headers: {
          "Cache-Control": "private, no-store",
        },
      },
    );
  } catch {
    return Response.json(
      {
        error:
          "A busca de estabelecimentos está temporariamente indisponível. Aguarde um pouco e tente novamente.",
      },
      { status: 503 },
    );
  }
}
