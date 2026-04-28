import { haversineDistanceKm, routeDistanceKm } from "./geo";
import type { LatLng, RouteOption } from "./types";

const MIN_ROUTED_COORDINATES = 12;
const MIN_COORDINATES_PER_KM = 0.35;
const MAX_ROUTED_SEGMENT_KM = 5;

export interface RoutedGeometryDebugInfo {
  pointCount: number;
  uniquePointCount: number;
  measuredDistanceKm: number;
  averageSegmentKm: number;
  maxSegmentKm: number;
  minimumCoordinateCount: number;
  controlPointCount: number;
}

export interface RoutedGeometryValidationResult {
  accepted: boolean;
  violations: string[];
  debug: RoutedGeometryDebugInfo;
}

export interface RoutedGeometryValidationOptions {
  distanceKm?: number;
  controlPointCount?: number;
  maxSegmentKm?: number;
  minCoordinateCount?: number;
}

export function getRenderableRouteGeometry(route: RouteOption): LatLng[] {
  return route.geometry;
}

export function isMockRoute(route: Pick<RouteOption, "provider">): boolean {
  return route.provider.trim().toLowerCase() === "mock";
}

export function routeModeBadgeLabel(
  route: Pick<RouteOption, "provider">,
): string | null {
  return isMockRoute(route) ? "Mock route" : null;
}

export function resolveRoutedDistanceKm(
  geometry: LatLng[],
  providerDistanceMeters?: number,
): number {
  const distanceKm =
    providerDistanceMeters !== undefined && providerDistanceMeters > 0
      ? providerDistanceMeters / 1000
      : routeDistanceKm(geometry);

  return Number(distanceKm.toFixed(1));
}

export function validateRoutedGeometry(
  geometry: LatLng[],
  options: RoutedGeometryValidationOptions = {},
): RoutedGeometryValidationResult {
  const finitePoints = geometry.filter(isFiniteCoordinate);
  const segmentLengths = finitePoints.slice(1).map((point, index) =>
    haversineDistanceKm(finitePoints[index], point),
  );
  const measuredDistanceKm = routeDistanceKm(finitePoints);
  const distanceForDensity = options.distanceKm ?? measuredDistanceKm;
  const minimumCoordinateCount =
    options.minCoordinateCount ?? minimumRoutedCoordinateCount(distanceForDensity);
  const controlPointCount = options.controlPointCount ?? 0;
  const maxSegmentKm =
    segmentLengths.length > 0 ? Math.max(...segmentLengths) : Number.POSITIVE_INFINITY;
  const averageSegmentKm =
    segmentLengths.length > 0 ? measuredDistanceKm / segmentLengths.length : 0;
  const uniquePointCount = countUniqueCoordinates(finitePoints);
  const maxAllowedSegmentKm = options.maxSegmentKm ?? MAX_ROUTED_SEGMENT_KM;
  const violations: string[] = [];

  if (finitePoints.length !== geometry.length) {
    violations.push("Route geometry contains invalid coordinates.");
  }

  if (finitePoints.length < minimumCoordinateCount) {
    violations.push(
      `Route geometry is not dense enough (${finitePoints.length} coordinates, expected at least ${minimumCoordinateCount}).`,
    );
  }

  if (uniquePointCount <= controlPointCount + 2) {
    violations.push(
      "Route geometry appears to contain only request control points instead of routed path coordinates.",
    );
  }

  if (maxSegmentKm > maxAllowedSegmentKm) {
    violations.push(
      `Route geometry has a suspiciously long ${maxSegmentKm.toFixed(1)} km segment.`,
    );
  }

  return {
    accepted: violations.length === 0,
    violations,
    debug: {
      pointCount: finitePoints.length,
      uniquePointCount,
      measuredDistanceKm: Number(measuredDistanceKm.toFixed(2)),
      averageSegmentKm: Number(averageSegmentKm.toFixed(2)),
      maxSegmentKm: Number(maxSegmentKm.toFixed(2)),
      minimumCoordinateCount,
      controlPointCount,
    },
  };
}

export function minimumRoutedCoordinateCount(distanceKm: number): number {
  if (!Number.isFinite(distanceKm) || distanceKm <= 0) {
    return MIN_ROUTED_COORDINATES;
  }

  return Math.max(
    MIN_ROUTED_COORDINATES,
    Math.ceil(distanceKm * MIN_COORDINATES_PER_KM),
  );
}

function isFiniteCoordinate(point: LatLng): boolean {
  return (
    Number.isFinite(point.lat) &&
    Number.isFinite(point.lng) &&
    Math.abs(point.lat) <= 90 &&
    Math.abs(point.lng) <= 180
  );
}

function countUniqueCoordinates(points: LatLng[]): number {
  return new Set(
    points.map((point) => `${point.lat.toFixed(6)},${point.lng.toFixed(6)}`),
  ).size;
}
