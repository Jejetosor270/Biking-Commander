import type { DifficultyPreset } from "./types";

export interface DifficultyPresetConfig {
  label: string;
  distanceKm: number;
  minElevationGainM: number;
  maxElevationGainM: number;
  description: string;
}

export const DIFFICULTY_PRESETS: Record<
  DifficultyPreset,
  DifficultyPresetConfig
> = {
  beginner: {
    label: "Beginner",
    distanceKm: 28,
    minElevationGainM: 100,
    maxElevationGainM: 450,
    description: "Shorter rides with gentler climbing.",
  },
  endurance: {
    label: "Endurance",
    distanceKm: 65,
    minElevationGainM: 500,
    maxElevationGainM: 1200,
    description: "Steady rides for aerobic days.",
  },
  training: {
    label: "Training",
    distanceKm: 85,
    minElevationGainM: 900,
    maxElevationGainM: 1800,
    description: "Purposeful routes with stronger climbing.",
  },
  adventure: {
    label: "Adventure",
    distanceKm: 120,
    minElevationGainM: 1400,
    maxElevationGainM: 2800,
    description: "Big days and exploratory terrain.",
  },
};
