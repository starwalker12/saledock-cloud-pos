import { validateGoogleMapsUrl } from "@/lib/security/sanitize";

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

  const lat = Number.parseFloat(latitude);
  const lng = Number.parseFloat(longitude);
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    // OpenStreetMap embed is free and requires no API key.
    const delta = 0.02;
    const bbox = `${lng - delta},${lat - delta},${lng + delta},${lat + delta}`;
    return `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${lat},${lng}`;
  }

  return null;
}

export function buildMapLinkUrl(
  googleMapsUrl: string,
  latitude: string,
  longitude: string,
): string | null {
  const mapsUrl = validateGoogleMapsUrl(googleMapsUrl);
  if (mapsUrl && mapsUrl.startsWith("http")) return mapsUrl;

  const lat = Number.parseFloat(latitude);
  const lng = Number.parseFloat(longitude);
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=16/${lat}/${lng}`;
  }

  return null;
}

export function hasMapData(googleMapsUrl: string, latitude: string, longitude: string): boolean {
  return buildMapLinkUrl(googleMapsUrl, latitude, longitude) !== null;
}
