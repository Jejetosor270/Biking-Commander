import type { AvoidZone, LatLng } from "./types";

export const FRANCE_SWITZERLAND_CENTER: LatLng = {
  lat: 46.524,
  lng: 6.632,
};

const EARTH_RADIUS_KM = 6371.0088;

export function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

export function haversineDistanceKm(a: LatLng, b: LatLng): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h =
    sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

export function routeDistanceKm(points: LatLng[]): number {
  return points.reduce((total, point, index) => {
    if (index === 0) {
      return total;
    }

    return total + haversineDistanceKm(points[index - 1], point);
  }, 0);
}

export function loopClosureDistanceM(points: LatLng[]): number {
  if (points.length < 2) {
    return Number.POSITIVE_INFINITY;
  }

  return haversineDistanceKm(points[0], points[points.length - 1]) * 1000;
}

export function createSquareAvoidZone(
  center: LatLng,
  label: string,
  radiusKm = 1.25,
): AvoidZone {
  const latDelta = radiusKm / 111;
  const lngDelta = radiusKm / (111 * Math.cos(toRadians(center.lat)));

  return {
    id: `avoid-${Date.now()}-${Math.round(center.lat * 1000)}`,
    label,
    polygon: [
      { lat: center.lat - latDelta, lng: center.lng - lngDelta },
      { lat: center.lat - latDelta, lng: center.lng + lngDelta },
      { lat: center.lat + latDelta, lng: center.lng + lngDelta },
      { lat: center.lat + latDelta, lng: center.lng - lngDelta },
    ],
  };
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function midpoint(a: LatLng, b: LatLng): LatLng {
  return {
    lat: (a.lat + b.lat) / 2,
    lng: (a.lng + b.lng) / 2,
  };
}

export function offsetCoordinate(
  point: LatLng,
  northKm: number,
  eastKm: number,
): LatLng {
  return {
    lat: point.lat + northKm / 111,
    lng: point.lng + eastKm / (111 * Math.cos(toRadians(point.lat))),
  };
}
