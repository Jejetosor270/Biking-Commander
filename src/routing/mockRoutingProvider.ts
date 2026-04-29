import {
  buildElevationProfile,
  buildRouteScore,
  buildSurfaceBreakdown,
  estimateDurationMinutes,
} from "../domain/scoring";
import {
  midpoint,
  offsetCoordinate,
  routeDistanceKm,
  toRadians,
} from "../domain/geo";
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
import type { RoutingProvider } from "./RoutingProvider";
import {
  resolveFinishCoordinate,
  resolveStartCoordinate,
} from "./locationResolver";

const DISTANCE_VARIANTS = [0.94, 1.01, 1.07];
const ROUTE_NAMES = [
  "Quiet ridge commander",
  "Borderland flow",
  "Lake and climb circuit",
];

export class MockRoutingProvider implements RoutingProvider {
  id = "mock";
  label = "Mock route engine";
  mode = "mock" as const;

  async generateRoutes(request: RouteRequest): Promise<RouteGenerationResult> {
    const shouldRelaxMainRoads =
      request.preferences.avoidMainRoads &&
      request.targetDistanceKm >= 100 &&
      request.preferences.difficulty === "adventure";
    const relaxation = shouldRelaxMainRoads
      ? relaxSoftPreferences(request, ["avoidMainRoads"])
      : { request, relaxedConstraints: [] as RelaxedConstraint[] };
    const activeRequest = relaxation.request;
    const start = await resolveStartCoordinate(activeRequest);
    const finish = await resolveFinishCoordinate(activeRequest, start);

    const candidates = DISTANCE_VARIANTS.map((multiplier, index) =>
      this.buildOption(activeRequest, start, finish, multiplier, index, relaxation.relaxedConstraints),
    );
    const options = candidates.filter((option) =>
      validateRouteOption(activeRequest, option).accepted,
    );
    const closestElevationAlternatives =
      options.length === 0
        ? selectClosestElevationAlternatives(
            activeRequest,
            candidates,
            relaxation.relaxedConstraints,
          )
        : [];
    const resultOptions =
      options.length > 0 ? options : closestElevationAlternatives.slice(0, 3);

    return {
      options: resultOptions,
      relaxedConstraints: collectResultRelaxedConstraints(
        resultOptions,
        relaxation.relaxedConstraints,
      ),
      diagnostics:
        resultOptions.length === 0
          ? ["No mock options matched the hard constraints."]
          : closestElevationAlternatives.length > 0
            ? ["No mock options matched the D+ range; showing closest alternatives."]
          : [],
    };
  }

  async routeWaypoints(
    request: RouteRequest,
    waypoints: LatLng[],
    variantIndex = 0,
  ): Promise<RouteOption> {
    if (waypoints.length < 2) {
      throw new Error("Mock routing needs at least two waypoints.");
    }

    const geometry = densifyWaypointGeometry(waypoints);
    const distanceKm = Number(routeDistanceKm(geometry).toFixed(1));
    const elevationGainM = chooseElevationGain(request, variantIndex);
    const elevationProfile = buildElevationProfile(
      distanceKm,
      elevationGainM,
      variantIndex,
    );
    const score = buildRouteScore({
      routeType: request.routeType,
      distanceKm,
      elevationGainM,
      avoidMainRoads: request.preferences.avoidMainRoads,
      difficulty: request.preferences.difficulty,
      variantIndex,
    });

    return {
      id: `mock-waypoints-${request.id}-${variantIndex + 1}`,
      requestId: request.id,
      name: `Mock waypoint route ${variantIndex + 1}`,
      provider: this.id,
      generatedAt: new Date().toISOString(),
      routeType: request.routeType,
      shape: request.preferences.shape,
      distanceKm,
      elevationGainM,
      estimatedDurationMinutes: estimateDurationMinutes(
        distanceKm,
        elevationGainM,
        request.routeType,
      ),
      geometry,
      surfaceBreakdown: buildSurfaceBreakdown(request.routeType, variantIndex),
      elevationProfile,
      score,
      waypoints: request.preferences.waypoints,
      allowsFerries: request.preferences.allowFerries,
      relaxedConstraints: [],
      summary: "Mock route snapped through manual waypoints.",
    };
  }

  private buildOption(
    request: RouteRequest,
    start: LatLng,
    finish: LatLng,
    distanceMultiplier: number,
    variantIndex: number,
    relaxedConstraints: RelaxedConstraint[],
  ): RouteOption {
    const distanceKm = Number(
      (request.targetDistanceKm * distanceMultiplier).toFixed(1),
    );
    const elevationGainM = chooseElevationGain(request, variantIndex);
    const loop =
      request.preferences.shape === "loop" ||
      request.preferences.shape === "current-location-loop";
    const geometry = loop
      ? buildLoopGeometry(start, distanceKm, variantIndex)
      : buildPointToPointGeometry(start, finish, distanceKm, variantIndex);
    const elevationProfile = buildElevationProfile(
      distanceKm,
      elevationGainM,
      variantIndex,
    );
    const score = buildRouteScore({
      routeType: request.routeType,
      distanceKm,
      elevationGainM,
      avoidMainRoads: request.preferences.avoidMainRoads,
      difficulty: request.preferences.difficulty,
      variantIndex,
    });

    return {
      id: `route-${request.id}-${variantIndex + 1}`,
      requestId: request.id,
      name: ROUTE_NAMES[variantIndex] ?? `Route option ${variantIndex + 1}`,
      provider: this.id,
      generatedAt: new Date().toISOString(),
      routeType: request.routeType,
      shape: request.preferences.shape,
      distanceKm,
      elevationGainM,
      estimatedDurationMinutes: estimateDurationMinutes(
        distanceKm,
        elevationGainM,
        request.routeType,
      ),
      geometry,
      surfaceBreakdown: buildSurfaceBreakdown(request.routeType, variantIndex),
      elevationProfile,
      score,
      waypoints: request.preferences.waypoints,
      allowsFerries: request.preferences.allowFerries,
      relaxedConstraints,
      summary: buildRouteSummary(request, geometry),
    };
  }
}

function chooseElevationGain(
  request: RouteRequest,
  variantIndex: number,
): number {
  if (!request.useElevationConstraint) {
    const climbPerKm = {
      beginner: request.routeType === "road" ? 7 : 13,
      endurance: request.routeType === "road" ? 16 : 24,
      training: request.routeType === "road" ? 23 : 32,
      adventure: request.routeType === "road" ? 30 : 42,
    }[request.preferences.difficulty];
    const variantMultiplier = [0.82, 1, 1.18][variantIndex] ?? 1;

    return Math.round(request.targetDistanceKm * climbPerKm * variantMultiplier);
  }

  const min = Math.min(
    request.elevationGainMin ?? 0,
    request.elevationGainMax ?? 0,
  );
  const max = Math.max(
    request.elevationGainMin ?? 0,
    request.elevationGainMax ?? 0,
  );
  const ratios = [0.22, 0.56, 0.84];

  if (max === min) {
    return min;
  }

  return Math.round(min + (max - min) * (ratios[variantIndex] ?? 0.5));
}

function buildLoopGeometry(
  start: LatLng,
  targetDistanceKm: number,
  variantIndex: number,
): LatLng[] {
  const pointCount = 18;
  const radiusKm = Math.max(targetDistanceKm / (2 * Math.PI), 1.8);
  const center = offsetCoordinate(start, -radiusKm, 0);
  const rotation = Math.PI / 2 + variantIndex * 0.45;
  const points = Array.from({ length: pointCount + 1 }, (_, index) => {
    if (index === 0 || index === pointCount) {
      return start;
    }

    const progress = index / pointCount;
    const angle = rotation + progress * Math.PI * 2;
    const radiusMod = 1 + Math.sin(progress * Math.PI * 4 + variantIndex) * 0.12;
    return offsetCoordinate(
      center,
      Math.sin(angle) * radiusKm * radiusMod,
      Math.cos(angle) * radiusKm * radiusMod,
    );
  });

  return points;
}

function buildPointToPointGeometry(
  start: LatLng,
  finish: LatLng,
  targetDistanceKm: number,
  variantIndex: number,
): LatLng[] {
  const pointCount = 14;
  const directDistance = routeDistanceKm([start, finish]);
  const middle = midpoint(start, finish);
  const detourKm = Math.max((targetDistanceKm - directDistance) * 0.35, 3);
  const direction = variantIndex % 2 === 0 ? 1 : -1;
  const latitudeScale = Math.cos(toRadians(middle.lat));

  return Array.from({ length: pointCount }, (_, index) => {
    const progress = index / (pointCount - 1);
    const lat = start.lat + (finish.lat - start.lat) * progress;
    const lng = start.lng + (finish.lng - start.lng) * progress;
    const bend = Math.sin(progress * Math.PI) * detourKm * direction;
    const wobble = Math.sin(progress * Math.PI * 3 + variantIndex) * 1.2;

    return {
      lat: lat + (bend + wobble) / 111,
      lng:
        lng +
        ((variantIndex + 1) * Math.sin(progress * Math.PI * 2) * 0.8) /
          (111 * latitudeScale),
    };
  });
}

function buildRouteSummary(request: RouteRequest, geometry: LatLng[]): string {
  const regionHint =
    geometry[0]?.lat && geometry[0].lat > 46.2
      ? "Swiss-side"
      : "French-side";
  const bikeLabel = request.routeType === "road" ? "road" : "trail";
  return `${regionHint} ${bikeLabel} option tuned for ${request.preferences.difficulty} riding.`;
}

function densifyWaypointGeometry(waypoints: LatLng[]): LatLng[] {
  return waypoints.flatMap((point, index) => {
    if (index === 0) {
      return [point];
    }

    const previous = waypoints[index - 1];
    const steps = 8;

    return Array.from({ length: steps }, (_, stepIndex) => {
      const progress = (stepIndex + 1) / steps;

      return {
        lat: previous.lat + (point.lat - previous.lat) * progress,
        lng: previous.lng + (point.lng - previous.lng) * progress,
      };
    });
  });
}
