import { offsetCoordinate, routeDistanceKm } from "./domain/geo";
import type {
  LatLng,
  RelaxedConstraint,
  RouteCandidate,
  RouteGenerationResult,
  RouteOption,
  RouteRequest,
} from "./domain/types";
import {
  collectResultRelaxedConstraints,
  selectClosestElevationAlternatives,
  validateRouteOption,
} from "./domain/routeValidation";
import { resolveStartCoordinate } from "./routing/locationResolver";
import type { RoutingProvider } from "./routing/RoutingProvider";
import {
  scoreRouteCandidate,
  selectTopRouteCandidates,
} from "./routeScoring";

const MIN_CANDIDATE_COUNT = 24;
const BEARING_STEP_DEGREES = 37;

export async function generateAutoLoopRoutes(
  provider: RoutingProvider,
  request: RouteRequest,
): Promise<RouteGenerationResult> {
  const start = await resolveStartCoordinate(request, provider.mode === "real");
  const candidates = generateAutoLoopCandidates(request, start);
  const diagnostics: string[] = [];
  let ferryRejectedCount = 0;
  const routeAttempts = await Promise.allSettled(
    candidates.map((candidate) =>
      provider.routeWaypoints(request, candidate.anchors, candidate.variantIndex),
    ),
  );
  const successfulRoutes: RouteOption[] = [];
  const rejectedRoutes: RouteOption[] = [];

  routeAttempts.forEach((attempt, index) => {
    if (attempt.status === "rejected") {
      const message = errorMessage(attempt.reason);
      if (message.includes("ferry_detected")) {
        ferryRejectedCount += 1;
      }
      diagnostics.push(`Candidate ${index + 1}: ${message}`);
      return;
    }

    const validation = validateRouteOption(request, attempt.value);

    if (validation.accepted) {
      successfulRoutes.push(attempt.value);
    } else {
      if (!validation.checks.avoidsFerries) {
        ferryRejectedCount += 1;
      } else {
        rejectedRoutes.push(attempt.value);
      }
      diagnostics.push(
        `Candidate ${index + 1}: ${validation.violations.join(" ")}`,
      );
    }
  });

  const scoredRoutes = successfulRoutes.map((route) => ({
    route,
    score: scoreRouteCandidate(route, request, []),
  }));
  const selectedRoutes = selectTopRouteCandidates(scoredRoutes, request, 3);

  if (selectedRoutes.length > 0) {
    return {
      options: selectedRoutes,
      relaxedConstraints: collectResultRelaxedConstraints(selectedRoutes),
      diagnostics,
    };
  }

  const closestAlternatives = selectClosestAlternatives(request, rejectedRoutes);

  if (closestAlternatives.length > 0) {
    return {
      options: closestAlternatives.slice(0, 3),
      relaxedConstraints: collectResultRelaxedConstraints(closestAlternatives),
      diagnostics: [
        ...diagnostics,
        "No route fit every auto-loop constraint; showing closest alternatives.",
      ],
    };
  }

  if (ferryRejectedCount > 0) {
    return {
      options: [],
      relaxedConstraints: [],
      diagnostics: [
        ...diagnostics,
        "Only ferry-based routes were found. Try changing your start/finish or enable ferries.",
      ],
    };
  }

  return {
    options: [],
    relaxedConstraints: [],
    diagnostics: [
      ...diagnostics,
      "No automatic loop candidates could be routed. Try Reliable Mode with manual waypoints.",
    ],
  };
}

export function generateAutoLoopCandidates(
  request: RouteRequest,
  start: LatLng,
  count = MIN_CANDIDATE_COUNT,
): RouteCandidate[] {
  const candidates: RouteCandidate[] = [];
  const shapes: RouteCandidate["shape"][] = ["triangle", "diamond", "lollipop"];

  for (let index = 0; index < count; index += 1) {
    const shape = shapes[index % shapes.length];
    const bearing = seededBearing(request.id, index);
    const distanceMultiplier = 0.72 + (index % 7) * 0.08;
    const targetDistanceKm = request.targetDistanceKm * distanceMultiplier;
    const anchorCount = shape === "diamond" ? 4 : 3;
    const radiusKm = Math.max(
      targetDistanceKm / (shape === "diamond" ? 5.6 : 4.6),
      1.2,
    );
    const spread = shape === "lollipop" ? 74 : 360 / anchorCount;
    const anchors = Array.from({ length: anchorCount }, (_, anchorIndex) => {
      const distanceMod =
        shape === "lollipop"
          ? 0.72 + anchorIndex * 0.28
          : 0.88 + ((index + anchorIndex) % 4) * 0.08;

      return offsetByBearing(
        start,
        bearing + anchorIndex * spread,
        radiusKm * distanceMod,
      );
    });

    candidates.push({
      id: `candidate-${request.id}-${index + 1}`,
      anchors: [start, ...anchors, start],
      shape,
      targetDistanceKm,
      variantIndex: index,
    });
  }

  return candidates;
}

function selectClosestAlternatives(
  request: RouteRequest,
  rejectedRoutes: RouteOption[],
): RouteOption[] {
  const elevationAlternatives = selectClosestElevationAlternatives(
    request,
    rejectedRoutes,
  );

  if (elevationAlternatives.length > 0) {
    return elevationAlternatives;
  }

  return [...rejectedRoutes]
    .sort(
      (left, right) =>
        Math.abs(left.distanceKm - request.targetDistanceKm) -
        Math.abs(right.distanceKm - request.targetDistanceKm),
    )
    .slice(0, 3)
    .map((route) => ({
      ...route,
      relaxedConstraints: mergeRelaxedConstraints(route.relaxedConstraints, [
        {
          constraint: "distanceMismatch",
          reason: "Target distance was not matched; showing closest alternatives.",
        },
      ]),
    }));
}

function mergeRelaxedConstraints(
  left: RelaxedConstraint[],
  right: RelaxedConstraint[],
): RelaxedConstraint[] {
  const merged = new Map<string, RelaxedConstraint>();

  for (const constraint of [...left, ...right]) {
    merged.set(constraint.constraint, constraint);
  }

  return [...merged.values()];
}

function offsetByBearing(point: LatLng, bearingDegrees: number, distanceKm: number): LatLng {
  const radians = (bearingDegrees * Math.PI) / 180;

  return offsetCoordinate(
    point,
    Math.cos(radians) * distanceKm,
    Math.sin(radians) * distanceKm,
  );
}

function seededBearing(seed: string, variantIndex: number): number {
  const hash = seed.split("").reduce((total, char) => {
    return (total * 31 + char.charCodeAt(0)) % 360;
  }, 71);

  return (hash + variantIndex * BEARING_STEP_DEGREES) % 360;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function routeCandidateControlDistanceKm(candidate: RouteCandidate): number {
  return routeDistanceKm(candidate.anchors);
}
