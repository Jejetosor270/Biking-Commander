import type {
  DifficultyPreset,
  ElevationProfile,
  RouteScore,
  RouteType,
  SurfaceBreakdownItem,
} from "./types";
import { clamp } from "./geo";

export function estimateDurationMinutes(
  distanceKm: number,
  elevationGainM: number,
  routeType: RouteType,
): number {
  const baseSpeedKmh = routeType === "road" ? 24 : 15;
  const movingMinutes = (distanceKm / baseSpeedKmh) * 60;
  const climbPenaltyMinutes = elevationGainM / (routeType === "road" ? 140 : 105);
  return Math.round(movingMinutes + climbPenaltyMinutes);
}

export function buildElevationProfile(
  distanceKm: number,
  elevationGainM: number,
  variantIndex: number,
): ElevationProfile {
  const pointCount = 28;
  const baseElevation = 310 + variantIndex * 45;
  const peakLift = Math.max(90, elevationGainM * 0.34);
  const points = Array.from({ length: pointCount }, (_, index) => {
    const progress = index / (pointCount - 1);
    const wave =
      Math.sin(progress * Math.PI * 2 + variantIndex) * 0.35 +
      Math.sin(progress * Math.PI * 5) * 0.18 +
      progress * 0.25;
    return {
      distanceKm: Number((progress * distanceKm).toFixed(1)),
      elevationM: Math.round(baseElevation + peakLift * (0.75 + wave)),
    };
  });
  const elevations = points.map((point) => point.elevationM);

  return {
    points,
    minElevationM: Math.min(...elevations),
    maxElevationM: Math.max(...elevations),
    ascentM: Math.round(elevationGainM),
    descentM: Math.round(elevationGainM * 0.92),
  };
}

export function buildSurfaceBreakdown(
  routeType: RouteType,
  variantIndex: number,
): SurfaceBreakdownItem[] {
  if (routeType === "road") {
    const paved = clamp(82 - variantIndex * 4, 68, 92);
    const cycleway = clamp(10 + variantIndex * 3, 6, 22);
    return [
      { label: "Paved road", percentage: paved },
      { label: "Cycleway", percentage: cycleway },
      { label: "Compact gravel", percentage: 100 - paved - cycleway },
    ];
  }

  const singletrack = clamp(28 + variantIndex * 6, 24, 46);
  const gravel = clamp(42 - variantIndex * 3, 30, 52);
  return [
    { label: "Singletrack", percentage: singletrack },
    { label: "Gravel track", percentage: gravel },
    { label: "Quiet paved link", percentage: 100 - singletrack - gravel },
  ];
}

export function buildRouteScore(input: {
  routeType: RouteType;
  distanceKm: number;
  elevationGainM: number;
  avoidMainRoads: boolean;
  difficulty: DifficultyPreset;
  variantIndex: number;
}): RouteScore {
  const climbPerKm = input.elevationGainM / Math.max(input.distanceKm, 1);
  const trafficExposure = clamp(
    input.routeType === "road" ? 35 - input.variantIndex * 4 : 18 + input.variantIndex * 2,
    8,
    70,
  );
  const safety = clamp(
    100 - trafficExposure + (input.avoidMainRoads ? 6 : -4),
    40,
    98,
  );
  const scenery = clamp(
    68 + climbPerKm * 0.18 + (input.routeType === "trail" ? 10 : 3),
    45,
    98,
  );
  const difficultyTarget =
    input.difficulty === "beginner"
      ? 18
      : input.difficulty === "endurance"
        ? 25
        : input.difficulty === "training"
          ? 35
          : 45;
  const climbDifficulty = clamp(100 - Math.abs(climbPerKm - difficultyTarget) * 1.8, 35, 99);
  const overall = Math.round(
    safety * 0.32 +
      scenery * 0.28 +
      (100 - trafficExposure) * 0.18 +
      climbDifficulty * 0.22,
  );

  return {
    safety: Math.round(safety),
    scenery: Math.round(scenery),
    trafficExposure: Math.round(trafficExposure),
    climbDifficulty: Math.round(climbDifficulty),
    overall,
  };
}
