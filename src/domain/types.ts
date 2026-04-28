export type RouteType = "road" | "trail";

export type RouteShape =
  | "loop"
  | "point-to-point"
  | "current-location-loop"
  | "current-location-to-destination";

export type DifficultyPreset =
  | "beginner"
  | "endurance"
  | "training"
  | "adventure";

export type WaypointType =
  | "cafe"
  | "water"
  | "viewpoint"
  | "climb"
  | "custom";

export interface LatLng {
  lat: number;
  lng: number;
  elevationM?: number;
}

export interface LocationInput {
  source: "address" | "coordinates" | "current";
  label: string;
  coordinate?: LatLng;
}

export interface Waypoint {
  id: string;
  type: WaypointType;
  label: string;
  coordinate?: LatLng;
}

export interface AvoidZone {
  id: string;
  label: string;
  polygon: LatLng[];
}

export interface RoutePreference {
  shape: RouteShape;
  avoidOutAndBack: boolean;
  avoidMainRoads: boolean;
  difficulty: DifficultyPreset;
  waypoints: Waypoint[];
  avoidZones: AvoidZone[];
}

export interface RouteRequest {
  id: string;
  createdAt: string;
  routeType: RouteType;
  targetDistanceKm: number;
  useElevationConstraint: boolean;
  elevationGainMin?: number;
  elevationGainMax?: number;
  startLocation?: LocationInput;
  finishLocation?: LocationInput;
  currentLocation?: LatLng;
  preferences: RoutePreference;
}

export interface ElevationPoint {
  distanceKm: number;
  elevationM: number;
}

export interface ElevationProfile {
  points: ElevationPoint[];
  minElevationM: number;
  maxElevationM: number;
  ascentM: number;
  descentM: number;
}

export interface SurfaceBreakdownItem {
  label: string;
  percentage: number;
}

export interface RouteScore {
  safety: number;
  scenery: number;
  trafficExposure: number;
  climbDifficulty: number;
  overall: number;
}

export type RelaxedConstraintType =
  | "avoidMainRoads"
  | "elevationRange"
  | "targetDistance"
  | "avoidOutAndBack";

export interface RelaxedConstraint {
  constraint: RelaxedConstraintType;
  reason: string;
}

export interface RouteOption {
  id: string;
  requestId: string;
  name: string;
  provider: string;
  generatedAt: string;
  routeType: RouteType;
  shape: RouteShape;
  distanceKm: number;
  elevationGainM: number;
  estimatedDurationMinutes: number;
  geometry: LatLng[];
  surfaceBreakdown: SurfaceBreakdownItem[];
  elevationProfile: ElevationProfile;
  score: RouteScore;
  waypoints: Waypoint[];
  relaxedConstraints: RelaxedConstraint[];
  summary: string;
}

export interface RouteGenerationResult {
  options: RouteOption[];
  relaxedConstraints: RelaxedConstraint[];
  diagnostics: string[];
}

export interface RouteValidationResult {
  accepted: boolean;
  checks: {
    distanceWithinTolerance: boolean;
    elevationWithinRange: boolean;
    loopValid: boolean;
    avoidsOutAndBack: boolean;
  };
  violations: string[];
}
