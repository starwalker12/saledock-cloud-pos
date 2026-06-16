"use client";

import { useEffect, useMemo, useRef } from "react";
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";
import type { MapCoordinates } from "@/lib/map-utils";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

function ChangeView({ coords }: { coords: MapCoordinates }) {
  const map = useMap();
  useEffect(() => {
    map.setView([coords.lat, coords.lng], map.getZoom() ?? 16);
  }, [coords, map]);
  return null;
}

function MapEvents({ onCoordsChange }: { onCoordsChange: (coords: MapCoordinates) => void }) {
  useMapEvents({
    click(e) {
      onCoordsChange({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
  });

  return null;
}

function DraggableMarker({
  coords,
  onCoordsChange,
}: {
  coords: MapCoordinates;
  onCoordsChange: (coords: MapCoordinates) => void;
}) {
  const markerRef = useRef<L.Marker | null>(null);

  const icon = useMemo(
    () =>
      L.divIcon({
        className: "custom-map-pin",
        html: `<div style="width:28px;height:28px;display:flex;align-items:center;justify-content:center;background:#2563eb;border-radius:50%;border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.35);">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
          </div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 28],
      }),
    [],
  );

  return (
    <Marker
      draggable
      position={[coords.lat, coords.lng]}
      icon={icon}
      ref={markerRef}
      eventHandlers={{
        dragend() {
          const marker = markerRef.current;
          if (!marker) return;
          const pos = marker.getLatLng();
          onCoordsChange({ lat: pos.lat, lng: pos.lng });
        },
      }}
    />
  );
}

export default function LocationMap({
  coords,
  onCoordsChange,
}: {
  coords: MapCoordinates;
  onCoordsChange: (coords: MapCoordinates) => void;
}) {
  return (
    <MapContainer
      center={[coords.lat, coords.lng]}
      zoom={16}
      scrollWheelZoom={false}
      className="h-80 w-full"
    >
      <TileLayer
        attribution='© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <ChangeView coords={coords} />
      <DraggableMarker coords={coords} onCoordsChange={onCoordsChange} />
      <MapEvents onCoordsChange={onCoordsChange} />
    </MapContainer>
  );
}
