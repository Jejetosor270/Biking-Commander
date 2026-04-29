import { calculateOutAndBackRatio } from "./domain/routeValidation";
import type {
  RouteCandidateScore,
  RouteOption,
  RouteRequest,
} from "./domain/types";

export interface ScoredRouteCandidate {
  route: RouteOption;
  score: RouteCandidateScore;
}

export function scoreRouteCandidate(
  route: RouteOption,
  request: RouteRequest,
  alreadySelected: RouteOption[],
): RouteCandidateScore {
  const distanceCloseness = closenessScore(
    Math.abs(route.distanceKm - request.targetDistanceKm),
    Math.max(request.targetDistanceKm * 0.35, 1),
  );
  const elevationCloseness = request.useElevationConstraint
    ? elevationConstraintScore(route, request)
    : 100;
  const outAndBackPenalty = calculateOutAndBackRatio(route.geometry) * 100;
  const mainRoadPenalty = request.preferences.avoidMainRoads
    ? mainRoadExposureScore(route)
    : 0;
  const routeTypeSuitability = routeTypeSuitabilityScore(route);
  const surfaceQuality = surfaceQualityScore(route);
  const diversity = diversityScore(route, alreadySelected);
  const overall = Math.round(
    distanceCloseness * 0.28 +
      elevationCloseness * 0.14 +
      (100 - outAndBackPenalty) * 0.14 +
      (100 - mainRoadPenalty) * 0.1 +
      routeTypeSuitability * 0.12 +
      surfaceQuality * 0.1 +
      diversity * 0.12,
  );

  return {
    routeId: route.id,
    distanceCloseness: Math.round(distanceCloseness),
    elevationCloseness: Math.round(elevationCloseness),
    outAndBackPenalty: Math.round(outAndBackPenalty),
    mainRoadPenalty: Math.round(mainRoadPenalty),
    routeTypeSuitability: Math.round(routeTypeSuitability),
    surfaceQuality: Math.round(surfaceQuality),
    diversity: Math.round(diversity),
    overall,
  };
}

export function selectTopRouteCandidates(
  scoredRoutes: ScoredRouteCandidate[],
  request: RouteRequest,
  limit: number,
): RouteOption[] {
  const selected: RouteOption[] = [];
  const remaining = [...scoredRoutes];

  while (selected.length < limit && remaining.length > 0) {
    remaining.forEach((candidate) => {
      candidate.score = scoreRouteCandidate(candidate.route, request, selected);
    });
    remaining.sort((left, right) => right.score.overall - left.score.overall);
    const next = remaining.shift();

    if (next) {
      selected.push(next.route);
    }
  }

  return selected;
}

export function distanceToleranceScore(
  actualDistanceKm: number,
  targetDistanceKm: number,
): number {
  return closenessScore(
    Math.abs(actualDistanceKm - targetDistanceKm),
    Math.max(targetDistanceKm * 0.35, 1),
  );
}

function elevationConstraintScore(route: RouteOption, request: RouteRequest): number {
  const min = request.elevationGainMin ?? 0;
  const max = request.elevationGainMax ?? min;

  if (route.elevationGainM >= min && route.elevationGainM <= max) {
    return 100;
  }

  const miss =
    route.elevationGainM < min
      ? min - route.elevationGainM
      : route.elevationGainM - max;

  return closenessScore(miss, Math.max((max - min) * 1.5, 250));
}

function mainRoadExposureScore(route: RouteOption): number {
  const mainRoad = route.surfaceBreakdown.find((surface) =>
    /road|asphalt|paved/i.test(surface.label),
  );

  return mainRoad?.percentage ?? 18;
}

function routeTypeSuitabilityScore(route: RouteOption): number {
  if (route.routeType === "road") {
    const paved = route.surfaceBreakdown
      .filter((surface) => /paved|asphalt|cycleway/i.test(surface.label))
      .reduce((total, surface) => total + surface.percentage, 0);

    return clamp(paved || 78, 35, 100);
  }

  const trail = route.surfaceBreakdown
    .filter((surface) => /singletrack|gravel|track|dirt|ground/i.test(surface.label))
    .reduce((total, surface) => total + surface.percentage, 0);

  return clamp(trail || 72, 35, 100);
}

function surfaceQualityScore(route: RouteOption): number {
  return route.surfaceBreakdown.reduce((total, surface) => {
    const quality = /unknown|sand|ice/i.test(surface.label)
      ? 0.35
      : /paved|asphalt|cycleway|gravel|track|ground|dirt/i.test(surface.label)
        ? 0.95
        : 0.72;

    return total + surface.percentage * quality;
  }, 0);
}

function diversityScore(route: RouteOption, selected: RouteOption[]): number {
  if (selected.length === 0) {
    return 100;
  }

  const sharedStartCount = selected.filter(
    (candidate) =>
      Math.abs((candidate.geometry[1]?.lat ?? 0) - (route.geometry[1]?.lat ?? 0)) <
        0.004 &&
      Math.abs((candidate.geometry[1]?.lng ?? 0) - (route.geometry[1]?.lng ?? 0)) <
        0.004,
  ).length;

  return clamp(100 - sharedStartCount * 30, 40, 100);
}

function closenessScore(miss: number, missAtZero: number): number {
  return clamp(100 - (miss / Math.max(missAtZero, 1)) * 100, 0, 100);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
