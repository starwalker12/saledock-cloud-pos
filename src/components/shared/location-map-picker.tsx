"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import type { MapCoordinates } from "@/lib/map-utils";
import { buildGoogleMapsSearchUrl, isValidCoordinate } from "@/lib/map-utils";
import { MapPin, X } from "lucide-react";

// Leaflet requires `window`, so load it only on the client.
const LocationMap = dynamic(() => import("./location-map"), {
  ssr: false,
  loading: () => (
    <div className="flex h-80 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800">
      <span className="text-sm font-semibold text-slate-500 dark:text-slate-400">Loading map…</span>
    </div>
  ),
});

type LocationMapPickerProps = {
  initialLat: string;
  initialLng: string;
  onConfirm: (coords: MapCoordinates) => void;
  onClose: () => void;
};

export function LocationMapPicker({ initialLat, initialLng, onConfirm, onClose }: LocationMapPickerProps) {
  const fallback = { lat: 31.372, lng: 74.242 };
  const parsed = isValidCoordinate(initialLat, initialLng);
  const [coords, setCoords] = useState<MapCoordinates>(parsed ?? fallback);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-[#020617]/75 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="location-map-title"
    >
      <div className="flex w-full max-w-2xl flex-col rounded-2xl border border-slate-200 bg-[#fff] p-4 shadow-2xl dark:border-slate-700 dark:bg-slate-900 sm:p-5">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MapPin className="size-5 text-[var(--primary-accent-bg)]" />
            <h2 id="location-map-title" className="text-base font-black text-slate-950 dark:text-white">
              Adjust shop location
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-300"
            aria-label="Close"
          >
            <X className="size-5" />
          </button>
        </div>

        <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
          Drag the pin or tap on the map to set the exact shop location.
        </p>

        <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
          <LocationMap coords={coords} onCoordsChange={setCoords} />
        </div>

        <div className="mt-3 flex items-center justify-between gap-3 text-xs text-slate-600 dark:text-slate-300">
          <span>
            Pin: {coords.lat.toFixed(6)}, {coords.lng.toFixed(6)}
          </span>
          <a
            href={buildGoogleMapsSearchUrl(coords.lat, coords.lng) ?? "#"}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-blue-600 hover:underline dark:text-blue-400"
          >
            Open in Google Maps
          </a>
        </div>

        <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirm(coords)}
            className="rounded-xl bg-[var(--primary-accent-bg)] px-4 py-2 text-sm font-bold text-[var(--primary-accent-text)] transition hover:bg-[var(--primary-accent-hover)]"
          >
            Use this location
          </button>
        </div>
      </div>
    </div>
  );
}
