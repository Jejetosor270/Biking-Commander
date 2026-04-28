import {
  buildElevationProfile,
  buildRouteScore,
  buildSurfaceBreakdown,
  estimateDurationMinutes,
} from "../domain/scoring";
import { offsetCoordinate, routeDistanceKm } from "../domain/geo";
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
} from "../domain/types";
import {
  collectResultRelaxedConstraints,
  relaxSoftPreferences,
  selectClosestElevationAlternatives,
  validateRouteOption,
} from "../domain/routeValidation";
import {
  resolveFinishCoordinate,
  resolveStartCoordinate,
} from "./locationResolver";
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
}

const BROUTER_ENDPOINT = "https://brouter.de/brouter";
const OSRM_ENDPOINT = "https://router.project-osrm.org/route/v1/driving";
const DISTANCE_VARIANTS = [0.94, 1.01, 1.07];

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
    const diagnostics: string[] = [];
    const strictOptions = await this.generateValidatedOptions(
      request,
      [],
      diagnostics,
    );

    if (strictOptions.length > 0) {
      return {
        options: rankRoutes(request, strictOptions).slice(0, 3),
        relaxedConstraints: collectResultRelaxedConstraints(strictOptions),
        diagnostics,
      };
    }

    const relaxed = relaxSoftPreferences(request, ["avoidMainRoads"]);

    if (relaxed.relaxedConstraints.length === 0) {
      throw new RoutingProviderError(
        "No BRouter or OSRM route matched the selected hard constraints.",
        diagnostics,
      );
    }

    const relaxedOptions = await this.generateValidatedOptions(
      relaxed.request,
      relaxed.relaxedConstraints,
      diagnostics,
    );

    if (relaxedOptions.length === 0) {
      throw new RoutingProviderError(
        "No BRouter or OSRM route matched after soft preferences were relaxed.",
        diagnostics,
      );
    }

    return {
      options: rankRoutes(relaxed.request, relaxedOptions).slice(0, 3),
      relaxedConstraints: collectResultRelaxedConstraints(
        relaxedOptions,
        relaxed.relaxedConstraints,
      ),
      diagnostics,
    };
  }

  private async generateValidatedOptions(
    request: RouteRequest,
    relaxedConstraints: RelaxedConstraint[],
    diagnostics: string[],
  ): Promise<RouteOption[]> {
    const start = await resolveStartCoordinate(request, true);
    const finish = await resolveFinishCoordinate(request, start, true);
    const candidates = buildRouteCandidates(request, start, finish);
    const attempts = await Promise.allSettled(
      candidates.map((candidate) =>
        this.fetchCandidateRoute(request, candidate, relaxedConstraints),
      ),
    );
    const acceptedOptions: RouteOption[] = [];
    const rejectedOptions: RouteOption[] = [];

    attempts.forEach((attempt, index) => {
      if (attempt.status === "rejected") {
        diagnostics.push(`Alternative ${index + 1}: ${errorMessage(attempt.reason)}`);
        return;
      }

      const validation = validateRouteOption(request, attempt.value);

      if (validation.accepted) {
        acceptedOptions.push(attempt.value);
      } else {
        rejectedOptions.push(attempt.value);
        diagnostics.push(
          `Alternative ${index + 1}: ${validation.violations.join(" ")}`,
        );
      }
    });

    if (acceptedOptions.length > 0) {
      return acceptedOptions;
    }

    const closestElevationAlternatives = selectClosestElevationAlternatives(
      request,
      rejectedOptions,
      relaxedConstraints,
    );

    if (closestElevationAlternatives.length > 0) {
      diagnostics.push(
        "No routed options matched the D+ range; showing closest alternatives.",
      );
    }

    return closestElevationAlternatives;
  }

  private async fetchCandidateRoute(
    request: RouteRequest,
    candidate: RouteCandidate,
    relaxedConstraints: RelaxedConstraint[],
  ): Promise<RouteOption> {
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
      relaxedConstraints,
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

function buildRouteCandidates(
  request: RouteRequest,
  start: LatLng,
  finish: LatLng,
): RouteCandidate[] {
  const isLoop =
    request.preferences.shape === "loop" ||
    request.preferences.shape === "current-location-loop";

  return DISTANCE_VARIANTS.map((distanceMultiplier, variantIndex) => ({
    variantIndex,
    controlPoints: isLoop
      ? buildLoopControlPoints(request, start, distanceMultiplier, variantIndex)
      : buildPointToPointControlPoints(
          request,
          start,
          finish,
          distanceMultiplier,
          variantIndex,
        ),
  }));
}

function buildLoopControlPoints(
  request: RouteRequest,
  start: LatLng,
  distanceMultiplier: number,
  variantIndex: number,
): LatLng[] {
  const targetDistanceKm = request.targetDistanceKm * distanceMultiplier;
  const radiusKm = Math.max(targetDistanceKm / (2 * Math.PI), 1.5);
  const seedBearing = seededBearing(request.id, variantIndex);
  const bearings = [seedBearing, seedBearing + 120, seedBearing + 240];
  const radiusModifiers = [
    1 + variantIndex * 0.08,
    0.82 + variantIndex * 0.06,
    1.12 - variantIndex * 0.05,
  ];
  const viaPoints = bearings.map((bearing, index) =>
    offsetByBearing(start, bearing, radiusKm * radiusModifiers[index]),
  );

  return [start, ...viaPoints, start];
}

function buildPointToPointControlPoints(
  request: RouteRequest,
  start: LatLng,
  finish: LatLng,
  distanceMultiplier: number,
  variantIndex: number,
): LatLng[] {
  const directDistanceKm = Math.max(routeDistanceKm([start, finish]), 1);
  const targetDistanceKm = Math.max(
    request.targetDistanceKm * distanceMultiplier,
    directDistanceKm,
  );
  const detourDistanceKm = Math.max((targetDistanceKm - directDistanceKm) * 0.35, 2);
  const bearing = bearingBetween(start, finish);
  const side = variantIndex % 2 === 0 ? 1 : -1;
  const middle = offsetByBearing(
    midpoint(start, finish),
    bearing + 90 * side,
    detourDistanceKm * (1 + variantIndex * 0.35),
  );

  if (variantIndex === 2) {
    const secondMiddle = offsetByBearing(
      midpoint(middle, finish),
      bearing - 70,
      detourDistanceKm * 0.65,
    );

    return [start, middle, secondMiddle, finish];
  }

  return [start, middle, finish];
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
    relaxedConstraints,
    summary:
      route.provider === "brouter"
        ? "Generated from OpenStreetMap data through BRouter."
        : "Generated through OSRM after BRouter was unavailable.",
  };
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

function rankRoutes(request: RouteRequest, routes: RouteOption[]): RouteOption[] {
  return [...routes].sort((left, right) => {
    const leftTargetMiss = Math.abs(left.distanceKm - request.targetDistanceKm);
    const rightTargetMiss = Math.abs(right.distanceKm - request.targetDistanceKm);

    if (leftTargetMiss !== rightTargetMiss) {
      return leftTargetMiss - rightTargetMiss;
    }

    return right.score.overall - left.score.overall;
  });
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

function midpoint(a: LatLng, b: LatLng): LatLng {
  return {
    lat: (a.lat + b.lat) / 2,
    lng: (a.lng + b.lng) / 2,
  };
}

function offsetByBearing(point: LatLng, bearingDegrees: number, distanceKm: number): LatLng {
  const radians = (bearingDegrees * Math.PI) / 180;

  return offsetCoordinate(
    point,
    Math.cos(radians) * distanceKm,
    Math.sin(radians) * distanceKm,
  );
}

function bearingBetween(start: LatLng, finish: LatLng): number {
  const lat1 = toRadians(start.lat);
  const lat2 = toRadians(finish.lat);
  const dLng = toRadians(finish.lng - start.lng);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);

  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function seededBearing(seed: string, variantIndex: number): number {
  const hash = seed.split("").reduce((total, char) => {
    return (total * 31 + char.charCodeAt(0)) % 360;
  }, 43);

  return (hash + variantIndex * 47) % 360;
}

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
