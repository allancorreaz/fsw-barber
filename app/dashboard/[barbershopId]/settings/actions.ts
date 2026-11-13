"use server";

import { OWNER_ONLY, assertBarbershopRole } from "@/app/_lib/access";
import { runAction, text } from "@/app/_lib/actions";
import { db } from "@/app/_lib/prisma";

function coordinate(value: string, min: number, max: number) {
  if (!value) return null;
  const number = Number(value.replace(",", "."));
  if (!Number.isFinite(number) || number < min || number > max)
    throw new Error("Coordenadas inválidas.");
  return number;
}

/** Converte endereço em coordenadas usando o Nominatim (OpenStreetMap). */
async function geocode(address: string) {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", address);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "1");
  url.searchParams.set("countrycodes", "br");
  const response = await fetch(url, {
    headers: {
      "User-Agent": "BarberPlatform/1.0 (cadastro de barbearias)",
      "Accept-Language": "pt-BR",
    },
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  });
  if (!response.ok)
    throw new Error(
      "O serviço de mapas não respondeu. Tente usar a localização do celular.",
    );
  const [first] = (await response.json()) as Array<{
    lat: string;
    lon: string;
  }>;
  if (!first)
    throw new Error(
      "Endereço não encontrado no mapa. Confira o endereço ou use a localização do celular estando na barbearia.",
    );
  return { latitude: Number(first.lat), longitude: Number(first.lon) };
}

export async function updateBarbershopSettings(
  barbershopId: string,
  form: FormData,
) {
  await runAction(`/dashboard/${barbershopId}/settings`, async () => {
    await assertBarbershopRole(barbershopId, OWNER_ONLY, {
      allowSuspended: true,
    });
    const name = text(form, "name", 120);
    const address = text(form, "address", 240);
    if (name.length < 2) throw new Error("Informe o nome da barbearia.");
    if (address.length < 5) throw new Error("Informe o endereço completo.");
    const phones = text(form, "phones", 200)
      .split(/[,;\n]/)
      .map((phone) => phone.trim())
      .filter(Boolean)
      .slice(0, 3);
    const imageUrl = text(form, "imageUrl", 500);
    if (imageUrl && !/^https:\/\//.test(imageUrl))
      throw new Error("A imagem precisa ser um link https://.");

    let latitude = coordinate(text(form, "latitude", 30), -90, 90);
    let longitude = coordinate(text(form, "longitude", 30), -180, 180);
    if (form.get("intent") === "geocode")
      ({ latitude, longitude } = await geocode(address));

    await db.barbershop.update({
      where: { id: barbershopId },
      data: {
        name,
        address,
        phones,
        description: text(form, "description", 1000),
        imageUrl,
        latitude,
        longitude,
      },
    });
    return form.get("intent") === "geocode"
      ? "Localização encontrada pelo endereço e salva."
      : "Dados da barbearia salvos.";
  });
}

export async function disconnectMercadoPago(barbershopId: string) {
  await runAction(`/dashboard/${barbershopId}/settings`, async () => {
    await assertBarbershopRole(barbershopId, OWNER_ONLY, {
      allowSuspended: true,
    });
    await db.mercadoPagoAccount.deleteMany({ where: { barbershopId } });
    return "Mercado Pago desconectado. Novas assinaturas e pagamentos online ficam indisponíveis até conectar de novo.";
  });
}
