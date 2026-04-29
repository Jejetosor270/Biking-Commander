import type {
  RelaxedConstraint,
  RouteOption,
  RouteRequest,
  RouteValidationResult,
} from "./types";
import {
  haversineDistanceKm,
  loopClosureDistanceM,
  routeDistanceKm,
} from "./geo";

const LOOP_SHAPES = new Set(["loop", "current-location-loop"]);

export function isDistanceWithinTolerance(
  distanceKm: number,
  targetDistanceKm: number,
  tolerance = 0.1,
): boolean {
  const lowerBound = targetDistanceKm * (1 - tolerance);
  const upperBound = targetDistanceKm * (1 + tolerance);
  return distanceKm >= lowerBound && distanceKm <= upperBound;
}

export function isElevationGainWithinRange(
  elevationGainM: number,
  elevationGainMin: number,
  elevationGainMax: number,
): boolean {
  return (
    elevationGainM >= elevationGainMin && elevationGainM <= elevationGainMax
  );
}

export function validateElevationConstraintInput(
  request: Pick<
    RouteRequest,
    "useElevationConstraint" | "elevationGainMin" | "elevationGainMax"
  >,
): { valid: boolean; message?: string } {
  if (!request.useElevationConstraint) {
    return { valid: true };
  }

  if (
    request.elevationGainMin === undefined ||
    request.elevationGainMax === undefined
  ) {
    return {
      valid: false,
      message: "Min and max D+ are required when D+ constraint is on.",
    };
  }

  if (request.elevationGainMin < 0) {
    return {
      valid: false,
      message: "Min D+ must be 0 or higher.",
    };
  }

  if (request.elevationGainMax <= request.elevationGainMin) {
    return {
      valid: false,
      message: "Max D+ must be greater than min D+.",
    };
  }

  return { valid: true };
}

export function isLoopRoute(
  geometry: RouteOption["geometry"],
  thresholdMeters = 125,
): boolean {
  return loopClosureDistanceM(geometry) <= thresholdMeters;
}

export function calculateOutAndBackRatio(
  geometry: RouteOption["geometry"],
  thresholdMeters = 90,
): number {
  if (geometry.length < 5) {
    return 0;
  }

  const firstHalfEnd = Math.max(2, Math.floor(geometry.length * 0.45));
  const secondHalfStart = Math.min(
    geometry.length - 2,
    Math.ceil(geometry.length * 0.55),
  );
  const outbound = geometry.slice(1, firstHalfEnd);
  const inbound = geometry.slice(secondHalfStart, geometry.length - 1);

  if (outbound.length === 0 || inbound.length === 0) {
    return 0;
  }

  const matchedPoints = outbound.filter((point) =>
    inbound.some(
      (candidate) => haversineDistanceKm(point, candidate) * 1000 <= thresholdMeters,
    ),
  );

  return matchedPoints.length / outbound.length;
}

export function hasOutAndBackHeuristic(
  geometry: RouteOption["geometry"],
  thresholdMeters = 90,
  maxMatchedRatio = 0.35,
): boolean {
  return calculateOutAndBackRatio(geometry, thresholdMeters) > maxMatchedRatio;
}

export function validateRouteOption(
  request: RouteRequest,
  option: RouteOption,
): RouteValidationResult {
  const distanceWithinTolerance = isDistanceWithinTolerance(
    option.distanceKm,
    request.targetDistanceKm,
  );
  const elevationWithinRange = request.useElevationConstraint
    ? isElevationGainWithinRange(
        option.elevationGainM,
        request.elevationGainMin ?? Number.NaN,
        request.elevationGainMax ?? Number.NaN,
      )
    : true;
  const loopValid = LOOP_SHAPES.has(request.preferences.shape)
    ? isLoopRoute(option.geometry)
    : true;
  const avoidsOutAndBack = request.preferences.avoidOutAndBack
    ? !hasOutAndBackHeuristic(option.geometry)
    : true;
  const avoidsFerries = request.preferences.allowFerries
    ? true
    : !routeUsesUnsafeTransport(option);

  const violations: string[] = [];

  if (!distanceWithinTolerance) {
    violations.push("Distance is outside the 10% target range.");
  }

  if (request.useElevationConstraint && !elevationWithinRange) {
    violations.push("Elevation gain is outside the selected range.");
  }

  if (!loopValid) {
    violations.push("Loop route does not finish near its start.");
  }

  if (!avoidsOutAndBack) {
    violations.push("Route appears to reuse too much of the same path.");
  }

  if (!avoidsFerries) {
    violations.push("ferry_detected: Route uses a ferry or non-road transport link.");
  }

  return {
    accepted: violations.length === 0,
    checks: {
      distanceWithinTolerance,
      elevationWithinRange,
      loopValid,
      avoidsOutAndBack,
      avoidsFerries,
    },
    violations,
  };
}

export function routeUsesUnsafeTransport(option: RouteOption): boolean {
  return (
    option.transportSegments?.some(
      (segment) =>
        segment.kind === "ferry" || segment.kind === "unsafe_transport",
    ) ?? false
  );
}

export function relaxSoftPreferences(
  request: RouteRequest,
  unavailableReasons: string[],
): { request: RouteRequest; relaxedConstraints: RelaxedConstraint[] } {
  const relaxedConstraints: RelaxedConstraint[] = [];
  let nextRequest = request;

  if (
    request.preferences.avoidMainRoads &&
    unavailableReasons.includes("avoidMainRoads")
  ) {
    nextRequest = {
      ...nextRequest,
      preferences: {
        ...nextRequest.preferences,
        avoidMainRoads: false,
      },
    };
    relaxedConstraints.push({
      constraint: "avoidMainRoads",
      reason:
        "Avoid main roads was relaxed because no route options were found with that soft preference.",
    });
  }

  return {
    request: nextRequest,
    relaxedConstraints,
  };
}

export function measuredRouteDistanceKm(option: RouteOption): number {
  return routeDistanceKm(option.geometry);
}

export function selectClosestElevationAlternatives(
  request: RouteRequest,
  options: RouteOption[],
  baseRelaxedConstraints: RelaxedConstraint[] = [],
): RouteOption[] {
  if (!request.useElevationConstraint) {
    return [];
  }

  const elevationConstraint = createElevationMismatchConstraint(request);

  return options
    .filter((option) => {
      const validation = validateRouteOption(request, option);
      return (
        !validation.accepted &&
        validation.checks.distanceWithinTolerance &&
        !validation.checks.elevationWithinRange &&
        validation.checks.loopValid &&
        validation.checks.avoidsOutAndBack &&
        validation.checks.avoidsFerries
      );
    })
    .sort(
      (left, right) =>
        elevationRangeMissDistanceM(request, left.elevationGainM) -
        elevationRangeMissDistanceM(request, right.elevationGainM),
    )
    .map((option) => ({
      ...option,
      relaxedConstraints: mergeRelaxedConstraints(
        option.relaxedConstraints,
        baseRelaxedConstraints,
        [elevationConstraint],
      ),
    }));
}

export function collectResultRelaxedConstraints(
  options: RouteOption[],
  baseRelaxedConstraints: RelaxedConstraint[] = [],
): RelaxedConstraint[] {
  return mergeRelaxedConstraints(
    baseRelaxedConstraints,
    options.flatMap((option) => option.relaxedConstraints),
  );
}

function createElevationMismatchConstraint(
  request: RouteRequest,
): RelaxedConstraint {
  const min = request.elevationGainMin ?? 0;
  const max = request.elevationGainMax ?? 0;

  return {
    constraint: "elevationRange",
    reason: `D+ constraint was not matched; showing closest alternatives to ${min}-${max} m.`,
  };
}

function elevationRangeMissDistanceM(
  request: RouteRequest,
  elevationGainM: number,
): number {
  const min = request.elevationGainMin ?? Number.NEGATIVE_INFINITY;
  const max = request.elevationGainMax ?? Number.POSITIVE_INFINITY;

  if (elevationGainM < min) {
    return min - elevationGainM;
  }

  if (elevationGainM > max) {
    return elevationGainM - max;
  }

  return 0;
}

function mergeRelaxedConstraints(
  ...constraintGroups: RelaxedConstraint[][]
): RelaxedConstraint[] {
  const merged = new Map<string, RelaxedConstraint>();

  for (const constraint of constraintGroups.flat()) {
    merged.set(constraint.constraint, constraint);
  }

  return [...merged.values()];
}
