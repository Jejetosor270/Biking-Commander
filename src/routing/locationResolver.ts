import type { LatLng, LocationInput, RouteRequest } from "../domain/types";
import { FRANCE_SWITZERLAND_CENTER, offsetCoordinate } from "../domain/geo";

const KNOWN_PLACES: Record<string, LatLng> = {
  annecy: { lat: 45.8992, lng: 6.1294 },
  chamonix: { lat: 45.9237, lng: 6.8694 },
  grenoble: { lat: 45.1885, lng: 5.7245 },
  lyon: { lat: 45.764, lng: 4.8357 },
  nice: { lat: 43.7102, lng: 7.262 },
  geneva: { lat: 46.2044, lng: 6.1432 },
  genève: { lat: 46.2044, lng: 6.1432 },
  lausanne: { lat: 46.5197, lng: 6.6323 },
  sion: { lat: 46.2331, lng: 7.3606 },
  bern: { lat: 46.948, lng: 7.4474 },
  berne: { lat: 46.948, lng: 7.4474 },
};

export function parseCoordinateInput(value: string): LatLng | null {
  const match = value
    .trim()
    .match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);

  if (!match) {
    return null;
  }

  const lat = Number(match[1]);
  const lng = Number(match[2]);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  return { lat, lng };
}

export function deterministicCoordinateForLabel(label: string): LatLng {
  const normalized = label.trim().toLowerCase();
  const exactMatch = Object.entries(KNOWN_PLACES).find(([name]) =>
    normalized.includes(name),
  );

  if (exactMatch) {
    return exactMatch[1];
  }

  const hash = normalized.split("").reduce((total, char) => {
    return (total * 31 + char.charCodeAt(0)) % 100000;
  }, 17);

  const presets = Object.values(KNOWN_PLACES);
  const anchor = presets[hash % presets.length] ?? FRANCE_SWITZERLAND_CENTER;
  const northKm = ((hash % 9) - 4) * 1.7;
  const eastKm = (((hash / 9) % 9) - 4) * 1.7;
  return offsetCoordinate(anchor, northKm, eastKm);
}

export async function geocodeWithNominatim(
  label: string,
): Promise<LatLng | null> {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");
  url.searchParams.set("countrycodes", "fr,ch");
  url.searchParams.set("q", label);

  const response = await fetch(url);

  if (!response.ok) {
    return null;
  }

  const results = (await response.json()) as Array<{
    lat?: string;
    lon?: string;
  }>;
  const first = results[0];

  if (!first?.lat || !first.lon) {
    return null;
  }

  return {
    lat: Number(first.lat),
    lng: Number(first.lon),
  };
}

export async function resolveLocationInput(
  location: LocationInput | undefined,
  fallback: LatLng = FRANCE_SWITZERLAND_CENTER,
  useNetworkGeocoder = false,
): Promise<LatLng> {
  if (!location) {
    return fallback;
  }

  if (location.coordinate) {
    return location.coordinate;
  }

  const parsed = parseCoordinateInput(location.label);

  if (parsed) {
    return parsed;
  }

  if (useNetworkGeocoder && location.label.trim()) {
    const geocoded = await geocodeWithNominatim(location.label);

    if (geocoded) {
      return geocoded;
    }
  }

  if (location.label.trim()) {
    return deterministicCoordinateForLabel(location.label);
  }

  return fallback;
}

export async function resolveStartCoordinate(
  request: RouteRequest,
  useNetworkGeocoder = false,
): Promise<LatLng> {
  if (
    request.preferences.shape === "current-location-loop" ||
    request.preferences.shape === "current-location-to-destination"
  ) {
    return request.currentLocation ?? FRANCE_SWITZERLAND_CENTER;
  }

  return resolveLocationInput(
    request.startLocation,
    FRANCE_SWITZERLAND_CENTER,
    useNetworkGeocoder,
  );
}

export async function resolveFinishCoordinate(
  request: RouteRequest,
  start: LatLng,
  useNetworkGeocoder = false,
): Promise<LatLng> {
  if (
    request.preferences.shape === "loop" ||
    request.preferences.shape === "current-location-loop"
  ) {
    return start;
  }

  const fallbackFinish = offsetCoordinate(
    start,
    request.targetDistanceKm * 0.18,
    request.targetDistanceKm * 0.32,
  );

  return resolveLocationInput(
    request.finishLocation,
    fallbackFinish,
    useNetworkGeocoder,
  );
}
