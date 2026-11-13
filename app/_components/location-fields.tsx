"use client";

import { useRef, useState } from "react";
import { LocateFixed } from "lucide-react";

const inputClass =
  "w-full rounded-xl border border-white/10 bg-[#171717] px-3 py-2.5 text-sm text-white outline-none focus:border-[#c8f169]";

/** Campos de latitude/longitude com botão para usar o GPS do aparelho. */
export function LocationFields({
  latitude,
  longitude,
}: {
  latitude: number | null;
  longitude: number | null;
}) {
  const latRef = useRef<HTMLInputElement>(null);
  const lonRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState("");

  function useCurrentPosition() {
    if (!navigator.geolocation) {
      setMessage("Seu navegador não permite localização.");
      return;
    }
    setMessage("Obtendo localização...");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (latRef.current)
          latRef.current.value = position.coords.latitude.toFixed(6);
        if (lonRef.current)
          lonRef.current.value = position.coords.longitude.toFixed(6);
        setMessage("Localização preenchida. Clique em salvar.");
      },
      () =>
        setMessage(
          "Não foi possível obter a localização. Verifique a permissão do navegador.",
        ),
      { enableHighAccuracy: true, timeout: 15_000 },
    );
  }

  return (
    <div className="sm:col-span-2">
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <label className="text-sm">
          Latitude
          <input
            ref={latRef}
            name="latitude"
            inputMode="decimal"
            defaultValue={latitude ?? ""}
            className={`${inputClass} mt-1`}
          />
        </label>
        <label className="text-sm">
          Longitude
          <input
            ref={lonRef}
            name="longitude"
            inputMode="decimal"
            defaultValue={longitude ?? ""}
            className={`${inputClass} mt-1`}
          />
        </label>
        <button
          type="button"
          onClick={useCurrentPosition}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 px-4 py-2.5 text-sm font-semibold text-neutral-200 hover:border-[#c8f169]/40"
        >
          <LocateFixed size={16} /> Estou na barbearia
        </button>
      </div>
      <p className="mt-2 text-xs text-neutral-500" aria-live="polite">
        {message ||
          "A localização faz a barbearia aparecer para clientes num raio de 10 km."}
      </p>
    </div>
  );
}
