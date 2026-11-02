import { db } from "@/app/_lib/prisma";


const RADIUS_METERS = 20_000;
const CACHE_TTL_MS = 5 * 60 * 1000;
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
  services: Array<{ name: string; price: { toString(): string } }>;
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
    const url = new URL(value.match(/^https?:\/\//i) ? value : `https://${value}`);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
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

  const match = matches[0];
  return {
    id: match.id,
    services: match.services.map((service) => ({
      name: service.name,
      price: Number(service.price.toString()),
    })),
  };
}

async function loadOsmElements(latitude: number, longitude: number) {
  const cacheKey = `${latitude.toFixed(4)}:${longitude.toFixed(4)}`;
  const cached = cache.get(cacheKey);

  if (cached && cached.expiresAt > Date.now()) {
    return cached.elements;
  }

  const query = `[out:json][timeout:25];
(
  nwr["shop"="barber"](around:${RADIUS_METERS},${latitude},${longitude});
  nwr["shop"="hairdresser"]["male"="yes"](around:${RADIUS_METERS},${latitude},${longitude});
  nwr["shop"="hairdresser"]["name"~"barber|barbearia",i](around:${RADIUS_METERS},${latitude},${longitude});
  nwr["craft"="hairdresser"]["name"~"barber|barbearia",i](around:${RADIUS_METERS},${latitude},${longitude});
);
out center tags;`;

  const endpoints = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
  ];
  let lastError: Error | null = null;

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
          "User-Agent": "FSWBarber/0.1 (nearby barbershop discovery)",
        },
        body: new URLSearchParams({ data: query }),
        signal: AbortSignal.timeout(25_000),
        cache: "no-store",
      });

      if (!response.ok) {
        lastError = new Error(`Overpass respondeu com HTTP ${response.status}.`);
        if (response.status === 429 || response.status >= 500) continue;
        break;
      }

      const payload = (await response.json()) as { elements?: OsmElement[] };
      const elements = Array.isArray(payload.elements) ? payload.elements : [];

      cache.set(cacheKey, {
        elements,
        expiresAt: Date.now() + CACHE_TTL_MS,
      });

      while (cache.size > MAX_CACHE_ENTRIES) {
        const oldestKey = cache.keys().next().value;
        if (!oldestKey) break;
        cache.delete(oldestKey);
      }

      return elements;
    } catch (error) {
      lastError =
        error instanceof Error
          ? error
          : new Error("Falha ao consultar a base colaborativa de mapas.");
    }
  }

  throw lastError ?? new Error("O serviço de mapas está temporariamente indisponível.");
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
    const elements = await loadOsmElements(latitude, longitude);
    let registered: RegisteredBarbershop[] = [];

    try {
      registered = await db.barbershop.findMany({
        select: {
          id: true,
          name: true,
          address: true,
          phones: true,
          services: {
            select: {
              name: true,
              price: true,
            },
          },
        },
      });
    } catch {
      // A descoberta pública continua funcionando mesmo se o catálogo interno estiver indisponível.
    }

    const barbershops = elements
      .flatMap((element) => {
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

        if (distanceKm > 20) return [];

        const address = buildAddress(tags);
        const platform = matchesRegisteredBarbershop(element, address, registered);
        const phone =
          tags.phone ?? tags["contact:phone"] ?? tags.mobile ?? null;
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
            openingHours: tags.opening_hours ?? null,
            osmUrl: `https://www.openstreetmap.org/${element.type}/${element.id}`,
            mapsUrl: `https://www.google.com/maps/search/?api=1&query=${coordinates.latitude},${coordinates.longitude}`,
            platform,
          },
        ];
      })
      .sort((a, b) => a.distanceKm - b.distanceKm);

    const uniqueBarbershops = barbershops.filter((barbershop, index, all) => {
      const currentName = normalize(barbershop.name);
      const currentAddress = normalize(barbershop.address ?? "");
      return !all.slice(0, index).some((previous) => {
        if (normalize(previous.name) !== currentName) return false;
        const previousAddress = normalize(previous.address ?? "");
        if (currentAddress && previousAddress) return currentAddress === previousAddress;
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
        radiusKm: 20,
        source: "OpenStreetMap",
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
