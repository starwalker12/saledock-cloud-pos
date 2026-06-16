import { validateGoogleMapsUrl } from "@/lib/security/sanitize";

function isValidCoordinate(latitude: string, longitude: string): { lat: number; lng: number } | null {
  const lat = Number.parseFloat(latitude);
  const lng = Number.parseFloat(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

export function buildMapEmbedUrl(
  googleMapsUrl: string,
  latitude: string,
  longitude: string,
): string | null {
  const mapsUrl = validateGoogleMapsUrl(googleMapsUrl);
  if (mapsUrl && mapsUrl.startsWith("http")) {
    // Embed Google Maps links directly is not possible without an API key.
    // Return null so callers can fall back to a clickable link.
    return null;
  }

  const coords = isValidCoordinate(latitude, longitude);
  if (!coords) return null;

  // OpenStreetMap embed is free and requires no API key.
  const delta = 0.02;
  const bbox = `${coords.lng - delta},${coords.lat - delta},${coords.lng + delta},${coords.lat + delta}`;
  return `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${coords.lat},${coords.lng}`;
}

export function buildMapLinkUrl(
  googleMapsUrl: string,
  latitude: string,
  longitude: string,
): string | null {
  const mapsUrl = validateGoogleMapsUrl(googleMapsUrl);
  if (mapsUrl && mapsUrl.startsWith("http")) return mapsUrl;

  const coords = isValidCoordinate(latitude, longitude);
  if (!coords) return null;

  return `https://www.openstreetmap.org/?mlat=${coords.lat}&mlon=${coords.lng}#map=16/${coords.lat}/${coords.lng}`;
}

export function hasMapData(googleMapsUrl: string, latitude: string, longitude: string): boolean {
  return buildMapLinkUrl(googleMapsUrl, latitude, longitude) !== null;
}
