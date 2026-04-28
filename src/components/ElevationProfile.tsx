import type { ElevationProfile as ElevationProfileModel } from "../domain/types";

interface ElevationProfileProps {
  profile: ElevationProfileModel;
}

export function ElevationProfile({ profile }: ElevationProfileProps) {
  const width = 620;
  const height = 160;
  const padding = 18;
  const range = Math.max(profile.maxElevationM - profile.minElevationM, 1);
  const points = profile.points.map((point) => {
    const x =
      padding +
      (point.distanceKm / Math.max(lastDistance(profile), 1)) *
        (width - padding * 2);
    const y =
      height -
      padding -
      ((point.elevationM - profile.minElevationM) / range) *
        (height - padding * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  return (
    <div className="elevation-profile" aria-label="Elevation profile">
      <svg viewBox={`0 0 ${width} ${height}`} role="img">
        <defs>
          <linearGradient id="elevationFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#4f8f7b" stopOpacity="0.34" />
            <stop offset="100%" stopColor="#4f8f7b" stopOpacity="0.04" />
          </linearGradient>
        </defs>
        <polyline
          className="elevation-fill"
          points={`${padding},${height - padding} ${points.join(" ")} ${
            width - padding
          },${height - padding}`}
        />
        <polyline className="elevation-line" points={points.join(" ")} />
      </svg>
      <div className="elevation-meta">
        <span>{profile.minElevationM} m</span>
        <span>D+ {profile.ascentM} m</span>
        <span>{profile.maxElevationM} m</span>
      </div>
    </div>
  );
}

function lastDistance(profile: ElevationProfileModel): number {
  return profile.points[profile.points.length - 1]?.distanceKm ?? 1;
}
