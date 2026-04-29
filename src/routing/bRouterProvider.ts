import {
  buildElevationProfile,
  buildRouteScore,
  buildSurfaceBreakdown,
  estimateDurationMinutes,
} from "../domain/scoring";
import { routeDistanceKm } from "../domain/geo";
import { generateAutoLoopRoutes } from "../autoLoopGenerator";
import {
  resolveRoutedDistanceKm,
  validateRoutedGeometry,
  type RoutedGeometryValidationResult,
} from "../domain/routeGeometry";
import type {
  LatLng,
  RelaxedConstraint,
  RouteGenerationResult,
  RouteOption,
  RouteRequest,
  RouteTransportSegment,
} from "../domain/types";
import type { RoutingProvider } from "./RoutingProvider";
import { RoutingProviderError } from "./RoutingProvider";

interface GeoJsonFeatureCollection {
  type?: string;
  features?: GeoJsonFeature[];
}

interface GeoJsonFeature {
  type?: string;
  geometry?: {
    type?: string;
    coordinates?: Array<[number, number, number?]>;
  };
  properties?: Record<string, unknown>;
}

interface OsrmResponse {
  code?: string;
  message?: string;
  routes?: Array<{
    distance?: number;
    duration?: number;
    geometry?: {
      type?: string;
      coordinates?: Array<[number, number]>;
    };
  }>;
}

interface RouteCandidate {
  controlPoints: LatLng[];
  variantIndex: number;
}

interface ProviderRoute {
  provider: "brouter" | "osrm";
  geometry: LatLng[];
  distanceKm: number;
  durationMinutes?: number;
  properties?: Record<string, unknown>;
  transportSegments?: RouteTransportSegment[];
}

const BROUTER_ENDPOINT = "https://brouter.de/brouter";
const OSRM_ENDPOINT = "https://router.project-osrm.org/route/v1/driving";
const PROFILE_BY_TYPE = {
  road: "fastbike",
  trail: "mtb",
} as const;

export class BRouterProvider implements RoutingProvider {
  id = "brouter";
  label = "BRouter";
  mode = "real" as const;

  constructor(private readonly debugGeometry = false) {}

  async generateRoutes(request: RouteRequest): Promise<RouteGenerationResult> {
    return generateAutoLoopRoutes(this, request);
  }

  async routeWaypoints(
    request: RouteRequest,
    waypoints: LatLng[],
    variantIndex = 0,
  ): Promise<RouteOption> {
    const candidate: RouteCandidate = {
      controlPoints: waypoints,
      variantIndex,
    };
    const route = await fetchBRouterRoute(request, candidate).catch(
      async (brouterError: unknown) => {
        const osrmRoute = await fetchOsrmRoute(candidate).catch((osrmError: unknown) => {
          throw new RoutingProviderError(
            "Routing providers are unavailable right now.",
            [
              `BRouter: ${errorMessage(brouterError)}`,
              `OSRM: ${errorMessage(osrmError)}`,
            ],
          );
        });

        return osrmRoute;
      },
    );
    const option = mapProviderRouteToOption(
      request,
      route,
      candidate.variantIndex,
      [],
    );
    const geometryValidation = validateRoutedGeometry(option.geometry, {
      distanceKm: option.distanceKm,
      controlPointCount: candidate.controlPoints.length,
      maxSegmentKm: 8,
    });

    this.logGeometryDiagnostics(option, geometryValidation);

    if (!geometryValidation.accepted) {
      throw new Error(
        `Routing provider returned suspicious route geometry: ${geometryValidation.violations.join(" ")}`,
      );
    }

    if (!request.preferences.allowFerries && option.transportSegments?.length) {
      if (this.debugGeometry) {
        console.debug("[routing:brouter]", {
          routeId: option.id,
          reason: "ferry_detected",
          transportSegments: option.transportSegments,
        });
      }
      throw new Error(
        "ferry_detected: Route uses a ferry or non-road transport link.",
      );
    }

    return option;
  }

  private logGeometryDiagnostics(
    option: RouteOption,
    validation: RoutedGeometryValidationResult,
  ): void {
    if (!this.debugGeometry) {
      return;
    }

    console.debug("[routing:brouter]", {
      routeId: option.id,
      provider: option.provider,
      accepted: validation.accepted,
      violations: validation.violations,
      ...validation.debug,
    });
  }
}

async function fetchBRouterRoute(
  request: RouteRequest,
  candidate: RouteCandidate,
): Promise<ProviderRoute> {
  const url = new URL(BROUTER_ENDPOINT);
  url.searchParams.set("lonlats", formatPipeDelimitedLonLats(candidate.controlPoints));
  url.searchParams.set("profile", PROFILE_BY_TYPE[request.routeType] ?? "trekking");
  url.searchParams.set("format", "geojson");

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`BRouter returned HTTP ${response.status}`);
  }

  const payload = (await response.json()) as GeoJsonFeatureCollection;
  const feature = payload.features?.find(
    (candidateFeature) => candidateFeature.geometry?.type === "LineString",
  );
  const coordinates = feature?.geometry?.coordinates;

  if (!coordinates?.length) {
    throw new Error("BRouter returned no LineString route geometry.");
  }

  const geometry = coordinates.map(([lng, lat, elevationM]) => ({
    lat,
    lng,
    elevationM,
  }));
  const distanceMeters = readNumericProperty(feature?.properties, [
    "distance",
    "track-length",
    "trackLength",
  ]);

  return {
    provider: "brouter",
    geometry,
    distanceKm: resolveRoutedDistanceKm(geometry, distanceMeters),
    durationMinutes: readDurationMinutes(feature?.properties),
    properties: feature?.properties,
    transportSegments: detectTransportSegments(feature?.properties),
  };
}

async function fetchOsrmRoute(candidate: RouteCandidate): Promise<ProviderRoute> {
  const coordinatePath = formatSemicolonDelimitedLonLats(candidate.controlPoints);
  const url = new URL(`${OSRM_ENDPOINT}/${coordinatePath}`);
  url.searchParams.set("overview", "full");
  url.searchParams.set("geometries", "geojson");
  url.searchParams.set("steps", "false");

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`OSRM returned HTTP ${response.status}`);
  }

  const payload = (await response.json()) as OsrmResponse;
  const route = payload.routes?.[0];

  if (payload.code && payload.code !== "Ok") {
    throw new Error(payload.message ?? `OSRM returned ${payload.code}`);
  }

  if (!route?.geometry?.coordinates?.length) {
    throw new Error("OSRM returned no route geometry.");
  }

  const geometry = route.geometry.coordinates.map(([lng, lat]) => ({ lat, lng }));

  return {
    provider: "osrm",
    geometry,
    distanceKm: resolveRoutedDistanceKm(geometry, route.distance),
    durationMinutes:
      route.duration !== undefined ? Math.round(route.duration / 60) : undefined,
    transportSegments: detectTransportSegments(route),
  };
}

function mapProviderRouteToOption(
  request: RouteRequest,
  route: ProviderRoute,
  variantIndex: number,
  relaxedConstraints: RelaxedConstraint[],
): RouteOption {
  const elevationGainM = resolveElevationGain(route, request, variantIndex);
  const elevationProfile = buildElevationProfileFromProviderRoute(
    route.geometry,
    route.distanceKm,
    elevationGainM,
    variantIndex,
  );
  const durationMinutes =
    route.durationMinutes ??
    estimateDurationMinutes(route.distanceKm, elevationGainM, request.routeType);
  const score = buildRouteScore({
    routeType: request.routeType,
    distanceKm: route.distanceKm,
    elevationGainM,
    avoidMainRoads: request.preferences.avoidMainRoads,
    difficulty: request.preferences.difficulty,
    variantIndex,
  });
  const providerLabel = route.provider === "brouter" ? "BRouter" : "OSRM fallback";

  return {
    id: `${route.provider}-${request.id}-${variantIndex + 1}`,
    requestId: request.id,
    name: `${providerLabel} option ${variantIndex + 1}`,
    provider: route.provider,
    generatedAt: new Date().toISOString(),
    routeType: request.routeType,
    shape: request.preferences.shape,
    distanceKm: route.distanceKm,
    elevationGainM,
    estimatedDurationMinutes: durationMinutes,
    geometry: route.geometry,
    surfaceBreakdown: buildSurfaceBreakdown(request.routeType, variantIndex),
    elevationProfile,
    score,
    waypoints: request.preferences.waypoints,
    transportSegments: route.transportSegments,
    allowsFerries: request.preferences.allowFerries,
    relaxedConstraints,
    summary:
      route.provider === "brouter"
        ? "Generated from OpenStreetMap data through BRouter."
        : "Generated through OSRM after BRouter was unavailable.",
  };
}

function detectTransportSegments(
  metadata: unknown,
): RouteTransportSegment[] | undefined {
  const tags = collectTagObjects(metadata);
  const segments: RouteTransportSegment[] = [];

  for (const tag of tags) {
    const route = normalizedTagValue(tag.route);
    const ferry = normalizedTagValue(tag.ferry);
    const highway = normalizedTagValue(tag.highway);
    const publicTransport = normalizedTagValue(tag.public_transport);
    const railway = normalizedTagValue(tag.railway);

    if (route === "ferry" || ferry !== undefined) {
      segments.push({
        kind: "ferry",
        description: "Ferry crossing detected in routing metadata.",
        tags: stringifyTags(tag),
      });
      continue;
    }

    if (
      highway === "services" &&
      (publicTransport !== undefined || railway !== undefined || route !== undefined)
    ) {
      segments.push({
        kind: "unsafe_transport",
        description: "Non-road transport service link detected in routing metadata.",
        tags: stringifyTags(tag),
      });
    }
  }

  return segments.length > 0 ? segments : undefined;
}

function collectTagObjects(value: unknown): Array<Record<string, unknown>> {
  if (!value || typeof value !== "object") {
    return [];
  }

  if (Array.isArray(value)) {
    return value.flatMap(collectTagObjects);
  }

  const record = value as Record<string, unknown>;
  const directTags =
    record.tags && typeof record.tags === "object" && !Array.isArray(record.tags)
      ? [record.tags as Record<string, unknown>]
      : [];
  const ownTags = hasTransportTagShape(record) ? [record] : [];
  const nestedTags = Object.values(record).flatMap(collectTagObjects);

  return [...ownTags, ...directTags, ...nestedTags];
}

function hasTransportTagShape(record: Record<string, unknown>): boolean {
  return ["route", "ferry", "highway", "public_transport", "railway"].some(
    (key) => key in record,
  );
}

function normalizedTagValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim()
    ? value.trim().toLowerCase()
    : undefined;
}

function stringifyTags(
  tags: Record<string, unknown>,
): Record<string, string> | undefined {
  const entries = Object.entries(tags)
    .filter(([, value]) => typeof value === "string" || typeof value === "number")
    .map(([key, value]) => [key, String(value)] as const);

  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function buildElevationProfileFromProviderRoute(
  geometry: LatLng[],
  distanceKm: number,
  elevationGainM: number,
  variantIndex: number,
) {
  const withElevation = geometry.filter((point) => point.elevationM !== undefined);

  if (withElevation.length < 3) {
    return buildElevationProfile(distanceKm, elevationGainM, variantIndex);
  }

  const cumulativeDistanceKm = cumulativeGeometryDistanceKm(geometry);
  const sampleSize = Math.min(32, withElevation.length);
  const measuredDistanceKm =
    cumulativeDistanceKm[cumulativeDistanceKm.length - 1] ?? distanceKm;
  const distanceScale =
    measuredDistanceKm > 0 ? distanceKm / measuredDistanceKm : 1;
  const elevatedGeometry = geometry
    .map((point, index) => ({
      point,
      distanceKm: cumulativeDistanceKm[index] ?? 0,
    }))
    .filter(({ point }) => point.elevationM !== undefined);
  const points = Array.from({ length: sampleSize }, (_, index) => {
    const sampleDistanceKm =
      (index / (sampleSize - 1)) * Math.max(measuredDistanceKm, 0);
    const source =
      elevatedGeometry.find((candidate) => candidate.distanceKm >= sampleDistanceKm) ??
      elevatedGeometry[elevatedGeometry.length - 1];

    return {
      distanceKm: Number((source.distanceKm * distanceScale).toFixed(1)),
      elevationM: Math.round(source.point.elevationM ?? 0),
    };
  });
  const elevations = points.map((point) => point.elevationM);

  return {
    points,
    minElevationM: Math.min(...elevations),
    maxElevationM: Math.max(...elevations),
    ascentM: elevationGainM,
    descentM: estimateDescentFromGeometry(geometry),
  };
}

function resolveElevationGain(
  route: ProviderRoute,
  request: RouteRequest,
  variantIndex: number,
): number {
  const propertyGain = readNumericProperty(route.properties, [
    "total-ascend",
    "totalAscend",
    "filtered ascend",
    "plain-ascend",
    "ascent",
  ]);

  if (propertyGain !== undefined) {
    return Math.round(propertyGain);
  }

  const geometryGain = estimateAscentFromGeometry(route.geometry);

  if (geometryGain > 0) {
    return Math.round(geometryGain);
  }

  return estimateElevationGain(route.distanceKm, request, variantIndex);
}

function estimateElevationGain(
  distanceKm: number,
  request: RouteRequest,
  variantIndex: number,
): number {
  const climbPerKm = {
    beginner: request.routeType === "road" ? 7 : 13,
    endurance: request.routeType === "road" ? 16 : 24,
    training: request.routeType === "road" ? 23 : 32,
    adventure: request.routeType === "road" ? 30 : 42,
  }[request.preferences.difficulty];
  const variantMultiplier = [0.82, 1, 1.18][variantIndex] ?? 1;

  return Math.round(distanceKm * climbPerKm * variantMultiplier);
}

function cumulativeGeometryDistanceKm(geometry: LatLng[]): number[] {
  let totalDistanceKm = 0;

  return geometry.map((point, index) => {
    if (index > 0) {
      totalDistanceKm += routeDistanceKm([geometry[index - 1], point]);
    }

    return totalDistanceKm;
  });
}

function estimateAscentFromGeometry(geometry: LatLng[]): number {
  return geometry.reduce((total, point, index) => {
    if (index === 0) {
      return total;
    }

    const previous = geometry[index - 1].elevationM;
    const current = point.elevationM;

    if (previous === undefined || current === undefined || current <= previous) {
      return total;
    }

    return total + current - previous;
  }, 0);
}

function estimateDescentFromGeometry(geometry: LatLng[]): number {
  return Math.round(
    geometry.reduce((total, point, index) => {
      if (index === 0) {
        return total;
      }

      const previous = geometry[index - 1].elevationM;
      const current = point.elevationM;

      if (previous === undefined || current === undefined || current >= previous) {
        return total;
      }

      return total + previous - current;
    }, 0),
  );
}

function readDurationMinutes(properties?: Record<string, unknown>): number | undefined {
  const seconds = readNumericProperty(properties, [
    "duration",
    "total-time",
    "totalTime",
  ]);

  return seconds === undefined ? undefined : Math.round(seconds / 60);
}

function readNumericProperty(
  properties: Record<string, unknown> | undefined,
  keys: string[],
): number | undefined {
  if (!properties) {
    return undefined;
  }

  for (const key of keys) {
    const value = properties[key];

    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === "string") {
      const parsed = Number(value);

      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return undefined;
}

function formatPipeDelimitedLonLats(points: LatLng[]): string {
  return points.map(formatLonLat).join("|");
}

function formatSemicolonDelimitedLonLats(points: LatLng[]): string {
  return points.map(formatLonLat).join(";");
}

function formatLonLat(point: LatLng): string {
  return `${point.lng.toFixed(6)},${point.lat.toFixed(6)}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
