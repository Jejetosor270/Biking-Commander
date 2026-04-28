import {
  Clock,
  Download,
  FileJson,
  Heart,
  Mountain,
  Route as RouteIcon,
  ShieldCheck,
  Star,
} from "lucide-react";
import type { RouteOption } from "../domain/types";
import { routeModeBadgeLabel } from "../domain/routeGeometry";
import { ElevationProfile } from "./ElevationProfile";

interface RouteCardProps {
  route: RouteOption;
  isSelected: boolean;
  isFavorite: boolean;
  onSelect: (route: RouteOption) => void;
  onSave: (route: RouteOption) => void;
  onExportGpx: (route: RouteOption) => void;
  showProvider: boolean;
}

export function RouteCard({
  route,
  isSelected,
  isFavorite,
  onSelect,
  onSave,
  onExportGpx,
  showProvider,
}: RouteCardProps) {
  const routeBadge = showProvider ? routeModeBadgeLabel(route) : null;

  return (
    <article className={`route-card ${isSelected ? "selected" : ""}`}>
      <div className="route-card-header">
        <div>
          {showProvider ? (
            <div className="route-card-meta">
              <p className="eyebrow">{route.provider}</p>
              {routeBadge ? <span className="mock-badge">{routeBadge}</span> : null}
            </div>
          ) : null}
          <h3>{route.name}</h3>
          <p className="route-summary">{route.summary}</p>
        </div>
        <div className="overall-score" title="Overall route score">
          <Star size={18} />
          {route.score.overall}
        </div>
      </div>

      {route.relaxedConstraints.length > 0 ? (
        <div className="relaxed-banner">
          {route.relaxedConstraints.map((constraint) => (
            <span key={constraint.constraint}>{constraint.reason}</span>
          ))}
        </div>
      ) : null}

      <div className="metric-grid">
        <Metric icon={<RouteIcon size={16} />} label="Distance" value={`${route.distanceKm} km`} />
        <Metric icon={<Mountain size={16} />} label="D+" value={`${route.elevationGainM} m`} />
        <Metric
          icon={<Clock size={16} />}
          label="Duration"
          value={formatDuration(route.estimatedDurationMinutes)}
        />
        <Metric
          icon={<ShieldCheck size={16} />}
          label="Type"
          value={route.routeType === "road" ? "Road" : "Trail"}
        />
      </div>

      <div className="surface-list">
        {route.surfaceBreakdown.map((surface) => (
          <div className="surface-row" key={surface.label}>
            <span>{surface.label}</span>
            <div className="surface-track">
              <span style={{ width: `${surface.percentage}%` }} />
            </div>
            <strong>{surface.percentage}%</strong>
          </div>
        ))}
      </div>

      <div className="score-grid">
        <Score label="Safety" value={route.score.safety} />
        <Score label="Scenery" value={route.score.scenery} />
        <Score label="Traffic" value={route.score.trafficExposure} />
        <Score label="Climb" value={route.score.climbDifficulty} />
      </div>

      <ElevationProfile profile={route.elevationProfile} />

      <div className="route-actions">
        <button type="button" className="secondary-button" onClick={() => onSelect(route)}>
          <RouteIcon size={16} />
          Compare
        </button>
        <button
          type="button"
          className="secondary-button"
          onClick={() => onSave(route)}
          aria-pressed={isFavorite}
        >
          <Heart size={16} fill={isFavorite ? "currentColor" : "none"} />
          {isFavorite ? "Saved" : "Save"}
        </button>
        <button type="button" className="primary-button" onClick={() => onExportGpx(route)}>
          <Download size={16} />
          GPX
        </button>
        <button type="button" className="icon-text-button" disabled title="FIT export placeholder">
          <FileJson size={16} />
          FIT
        </button>
        <button type="button" className="icon-text-button" disabled title="TCX export placeholder">
          <FileJson size={16} />
          TCX
        </button>
      </div>
    </article>
  );
}

function Metric({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="metric">
      {icon}
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Score({ label, value }: { label: string; value: number }) {
  return (
    <div className="score-row">
      <span>{label}</span>
      <div className="score-track">
        <span style={{ width: `${value}%` }} />
      </div>
      <strong>{value}</strong>
    </div>
  );
}

function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (hours === 0) {
    return `${remainingMinutes} min`;
  }

  return `${hours}h ${String(remainingMinutes).padStart(2, "0")}`;
}
