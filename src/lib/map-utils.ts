import { validateGoogleMapsUrl } from "@/lib/security/sanitize";

export type MapCoordinates = { lat: number; lng: number };

const GOOGLE_MAPS_SEARCH_URL = "https://www.google.com/maps/search/?api=1&query=";

export function isValidCoordinate(latitude: string | number, longitude: string | number): MapCoordinates | null {
  const lat = typeof latitude === "number" ? latitude : Number.parseFloat(latitude);
  const lng = typeof longitude === "number" ? longitude : Number.parseFloat(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

export function buildGoogleMapsSearchUrl(latitude: string | number, longitude: string | number): string | null {
  const coords = isValidCoordinate(latitude, longitude);
  if (!coords) return null;
  return `${GOOGLE_MAPS_SEARCH_URL}${coords.lat},${coords.lng}`;
}

export function isGoogleMapsSearchUrl(value: string): boolean {
  return value.trim().startsWith(GOOGLE_MAPS_SEARCH_URL);
}

/**
 * Try to extract latitude/longitude from a Google Maps URL or raw coordinate string.
 * Supports:
 * - plain "31.3720,74.2419"
 * - https://www.google.com/maps/@31.3720,74.2419,17z
 * - https://www.google.com/maps/place/.../@31.3720,74.2419,17z
 * - https://www.google.com/maps/search/?api=1&query=31.3720,74.2419
 * - ?q=31.3720,74.2419
 * - ?ll=31.3720,74.2419
 *
 * Short links (maps.app.goo.gl, goo.gl/maps) cannot be expanded without a
 * paid API or unsafe server fetch, so they return null.
 */
export function parseCoordinatesFromMapInput(input: string): MapCoordinates | null {
  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Short links don't contain coordinates directly and can't be expanded safely.
  if (/^(https?:\/\/)?(maps\.app\.goo\.gl|goo\.gl\/maps)/i.test(trimmed)) {
    return null;
  }

  // URL query parameters: query=, q=, ll=
  const queryMatch = trimmed.match(/[?&](?:query|q|ll)=(-?\d+\.?\d*),(-?\d+\.?\d*)/i);
  if (queryMatch) {
    return isValidCoordinate(queryMatch[1], queryMatch[2]);
  }

  // Google Maps path segment like /@31.3720,74.2419,17z or /place/.../@31.3720,74.2419,17z
  const pathMatch = trimmed.match(/@(-?\d+\.?\d*),(-?\d+\.?\d*)(?:,\d+\.?\d*z?)?/i);
  if (pathMatch) {
    return isValidCoordinate(pathMatch[1], pathMatch[2]);
  }

  // Plain lat,lng
  const plainMatch = trimmed.match(/^(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)$/);
  if (plainMatch) {
    return isValidCoordinate(plainMatch[1], plainMatch[2]);
  }

  return null;
}

export function buildMapEmbedUrl(
  googleMapsUrl: string,
  latitude: string,
  longitude: string,
): string | null {
  // Coordinates take priority for embeds because OpenStreetMap is free and
  // requires no API key. A Google Maps link alone cannot be embedded directly.
  const coords = isValidCoordinate(latitude, longitude);
  if (coords) {
    const delta = 0.02;
    const bbox = `${coords.lng - delta},${coords.lat - delta},${coords.lng + delta},${coords.lat + delta}`;
    return `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${coords.lat},${coords.lng}`;
  }

  const mapsUrl = validateGoogleMapsUrl(googleMapsUrl);
  if (mapsUrl && mapsUrl.startsWith("http")) {
    // No coordinates and only a Google Maps link: embedding is not possible
    // without a paid API key.
    return null;
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

  const generated = buildGoogleMapsSearchUrl(latitude, longitude);
  if (generated) return generated;

  const coords = isValidCoordinate(latitude, longitude);
  if (coords) {
    return `https://www.openstreetmap.org/?mlat=${coords.lat}&mlon=${coords.lng}#map=16/${coords.lat}/${coords.lng}`;
  }

  return null;
}

export function hasMapData(googleMapsUrl: string, latitude: string, longitude: string): boolean {
  return buildMapLinkUrl(googleMapsUrl, latitude, longitude) !== null;
}

export function hasMapEmbedData(latitude: string, longitude: string): boolean {
  return isValidCoordinate(latitude, longitude) !== null;
}
