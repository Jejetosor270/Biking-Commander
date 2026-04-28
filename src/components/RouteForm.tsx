import {
  Bike,
  CloudSun,
  Coffee,
  Droplet,
  Eye,
  Flag,
  LocateFixed,
  MapPin,
  Mountain,
  Navigation,
  Plus,
  RefreshCcw,
  Shuffle,
  SlidersHorizontal,
  Trash2,
  Watch,
  WifiOff,
  Wind,
} from "lucide-react";
import { useState } from "react";
import { DIFFICULTY_PRESETS } from "../domain/presets";
import type {
  AvoidZone,
  DifficultyPreset,
  RouteRequest,
  RouteShape,
  RouteType,
  WaypointType,
} from "../domain/types";

interface RouteFormProps {
  request: RouteRequest;
  providerLabel?: string;
  isDevelopment: boolean;
  status: "idle" | "loading" | "success" | "error";
  drawAvoidZones: boolean;
  onRequestChange: (request: RouteRequest) => void;
  onGenerate: () => void;
  onSurprise: () => void;
  onDrawAvoidZonesChange: (enabled: boolean) => void;
  onRemoveAvoidZone: (zoneId: string) => void;
}

const ROUTE_TYPES: Array<{ value: RouteType; label: string; icon: typeof Bike }> = [
  { value: "road", label: "Road bike", icon: Bike },
  { value: "trail", label: "Trail / MTB", icon: Mountain },
];

const SHAPES: Array<{ value: RouteShape; label: string; icon: typeof MapPin }> = [
  { value: "loop", label: "Loop", icon: RefreshCcw },
  { value: "point-to-point", label: "Point to point", icon: Navigation },
  { value: "current-location-loop", label: "Current loop", icon: LocateFixed },
  { value: "current-location-to-destination", label: "Current to finish", icon: Flag },
];

const WAYPOINT_LABELS: Record<WaypointType, string> = {
  cafe: "Cafe",
  water: "Water point",
  viewpoint: "Viewpoint",
  climb: "Climb",
  custom: "Custom",
};

export function RouteForm({
  request,
  providerLabel,
  isDevelopment,
  status,
  drawAvoidZones,
  onRequestChange,
  onGenerate,
  onSurprise,
  onDrawAvoidZonesChange,
  onRemoveAvoidZone,
}: RouteFormProps) {
  const [waypointType, setWaypointType] = useState<WaypointType>("cafe");
  const [waypointLabel, setWaypointLabel] = useState("");
  const shape = request.preferences.shape;
  const needsStart = shape === "loop" || shape === "point-to-point";
  const needsFinish =
    shape === "point-to-point" || shape === "current-location-to-destination";

  function updateRequest(patch: Partial<RouteRequest>) {
    onRequestChange({ ...request, ...patch });
  }

  function updatePreferences(patch: Partial<RouteRequest["preferences"]>) {
    updateRequest({
      preferences: {
        ...request.preferences,
        ...patch,
      },
    });
  }

  function applyPreset(preset: DifficultyPreset) {
    const config = DIFFICULTY_PRESETS[preset];
    updateRequest({
      targetDistanceKm: config.distanceKm,
      elevationGainMin: config.minElevationGainM,
      elevationGainMax: config.maxElevationGainM,
      preferences: {
        ...request.preferences,
        difficulty: preset,
      },
    });
  }

  function addWaypoint() {
    const label = waypointLabel.trim() || WAYPOINT_LABELS[waypointType];
    updatePreferences({
      waypoints: [
        ...request.preferences.waypoints,
        {
          id: `waypoint-${Date.now()}`,
          type: waypointType,
          label,
        },
      ],
    });
    setWaypointLabel("");
  }

  function removeWaypoint(waypointId: string) {
    updatePreferences({
      waypoints: request.preferences.waypoints.filter(
        (waypoint) => waypoint.id !== waypointId,
      ),
    });
  }

  function updateOptionalNumber(
    key: "elevationGainMin" | "elevationGainMax",
    value: string,
  ) {
    const nextValue = value === "" ? undefined : Number(value);

    updateRequest(
      key === "elevationGainMin"
        ? { elevationGainMin: nextValue }
        : { elevationGainMax: nextValue },
    );
  }

  return (
    <aside className="planner-panel">
      <div className="brand-row">
        <div className="brand-mark">BC</div>
        <div>
          <h1>Biking Commander</h1>
          {isDevelopment && providerLabel ? <p>{providerLabel}</p> : null}
        </div>
      </div>

      <section className="form-section">
        <div className="section-heading">
          <Bike size={16} />
          <h2>Ride Type</h2>
        </div>
        <div className="segmented two">
          {ROUTE_TYPES.map(({ value, label, icon: Icon }) => (
            <button
              type="button"
              key={value}
              className={request.routeType === value ? "active" : ""}
              onClick={() => updateRequest({ routeType: value })}
            >
              <Icon size={17} />
              {label}
            </button>
          ))}
        </div>
      </section>

      <section className="form-section">
        <div className="section-heading">
          <MapPin size={16} />
          <h2>Shape</h2>
        </div>
        <div className="segmented shape-grid">
          {SHAPES.map(({ value, label, icon: Icon }) => (
            <button
              type="button"
              key={value}
              className={shape === value ? "active" : ""}
              onClick={() => updatePreferences({ shape: value })}
            >
              <Icon size={16} />
              {label}
            </button>
          ))}
        </div>
      </section>

      <section className="form-section location-fields">
        {needsStart ? (
          <label>
            <span>Start</span>
            <input
              value={request.startLocation?.label ?? ""}
              onChange={(event) =>
                updateRequest({
                  startLocation: {
                    source: "address",
                    label: event.target.value,
                  },
                })
              }
              placeholder="Annecy, France"
            />
          </label>
        ) : null}
        {needsFinish ? (
          <label>
            <span>Finish</span>
            <input
              value={request.finishLocation?.label ?? ""}
              onChange={(event) =>
                updateRequest({
                  finishLocation: {
                    source: "address",
                    label: event.target.value,
                  },
                })
              }
              placeholder="Geneva, Switzerland"
            />
          </label>
        ) : null}
      </section>

      <section className="form-section">
        <div className="section-heading">
          <SlidersHorizontal size={16} />
          <h2>Targets</h2>
        </div>
        <label className="range-label">
          <span>Distance</span>
          <strong>{request.targetDistanceKm} km</strong>
          <input
            type="range"
            min="15"
            max="180"
            step="1"
            value={request.targetDistanceKm}
            onChange={(event) =>
              updateRequest({ targetDistanceKm: Number(event.target.value) })
            }
          />
        </label>
        <label className="check-row">
          <input
            type="checkbox"
            checked={request.useElevationConstraint}
            onChange={(event) =>
              updateRequest({ useElevationConstraint: event.target.checked })
            }
          />
          <span>Use D+ constraint</span>
        </label>
        {request.useElevationConstraint ? (
          <div className="number-grid elevation-constraint-fields">
            <label>
              <span>Min D+</span>
              <input
                type="number"
                min="0"
                step="50"
                required
                value={request.elevationGainMin ?? ""}
                onChange={(event) =>
                  updateOptionalNumber("elevationGainMin", event.target.value)
                }
              />
            </label>
            <label>
              <span>Max D+</span>
              <input
                type="number"
                min="0"
                step="50"
                required
                value={request.elevationGainMax ?? ""}
                onChange={(event) =>
                  updateOptionalNumber("elevationGainMax", event.target.value)
                }
              />
            </label>
          </div>
        ) : null}
      </section>

      <section className="form-section">
        <div className="section-heading">
          <Mountain size={16} />
          <h2>Difficulty</h2>
        </div>
        <div className="preset-grid">
          {(Object.keys(DIFFICULTY_PRESETS) as DifficultyPreset[]).map((preset) => (
            <button
              type="button"
              key={preset}
              className={request.preferences.difficulty === preset ? "active" : ""}
              onClick={() => applyPreset(preset)}
              title={DIFFICULTY_PRESETS[preset].description}
            >
              {DIFFICULTY_PRESETS[preset].label}
            </button>
          ))}
        </div>
      </section>

      <section className="form-section">
        <div className="section-heading">
          <SlidersHorizontal size={16} />
          <h2>Preferences</h2>
        </div>
        <label className="check-row">
          <input
            type="checkbox"
            checked={request.preferences.avoidOutAndBack}
            onChange={(event) =>
              updatePreferences({ avoidOutAndBack: event.target.checked })
            }
          />
          <span>Avoid out-and-back</span>
        </label>
        <label className="check-row">
          <input
            type="checkbox"
            checked={request.preferences.avoidMainRoads}
            onChange={(event) =>
              updatePreferences({ avoidMainRoads: event.target.checked })
            }
          />
          <span>Avoid main roads</span>
        </label>
      </section>

      <section className="form-section">
        <div className="section-heading">
          <Coffee size={16} />
          <h2>Waypoints</h2>
        </div>
        <div className="waypoint-adder">
          <select
            value={waypointType}
            onChange={(event) => setWaypointType(event.target.value as WaypointType)}
          >
            <option value="cafe">Cafe</option>
            <option value="water">Water</option>
            <option value="viewpoint">Viewpoint</option>
            <option value="climb">Climb</option>
            <option value="custom">Custom</option>
          </select>
          <input
            value={waypointLabel}
            onChange={(event) => setWaypointLabel(event.target.value)}
            placeholder="Name"
          />
          <button type="button" className="icon-button" onClick={addWaypoint} title="Add waypoint">
            <Plus size={16} />
          </button>
        </div>
        <TokenList
          waypoints={request.preferences.waypoints}
          onRemoveWaypoint={removeWaypoint}
        />
      </section>

      <section className="form-section">
        <div className="section-heading">
          <Flag size={16} />
          <h2>Avoid Zones</h2>
        </div>
        <button
          type="button"
          className={`secondary-button full ${drawAvoidZones ? "active" : ""}`}
          onClick={() => onDrawAvoidZonesChange(!drawAvoidZones)}
        >
          <MapPin size={16} />
          Mark on map
        </button>
        <AvoidZoneList
          zones={request.preferences.avoidZones}
          onRemoveAvoidZone={onRemoveAvoidZone}
        />
      </section>

      <section className="form-section">
        <div className="section-heading">
          <CloudSun size={16} />
          <h2>Future Layers</h2>
        </div>
        <div className="future-grid">
          <FutureChip icon={<CloudSun size={15} />} label="Weather" />
          <FutureChip icon={<Wind size={15} />} label="Wind" />
          <FutureChip icon={<WifiOff size={15} />} label="Offline" />
          <FutureChip icon={<Watch size={15} />} label="Garmin" />
          <FutureChip icon={<Watch size={15} />} label="Wahoo" />
          <FutureChip icon={<Navigation size={15} />} label="Komoot" />
          <FutureChip icon={<Flag size={15} />} label="Strava" />
        </div>
      </section>

      <div className="planner-actions">
        <button
          type="button"
          className="secondary-button"
          onClick={onSurprise}
          disabled={status === "loading"}
        >
          <Shuffle size={16} />
          Surprise me
        </button>
        <button
          type="button"
          className="primary-button"
          onClick={onGenerate}
          disabled={status === "loading"}
        >
          <Navigation size={16} />
          {status === "loading" ? "Generating" : "Generate routes"}
        </button>
      </div>
    </aside>
  );
}

function TokenList({
  waypoints,
  onRemoveWaypoint,
}: {
  waypoints: RouteRequest["preferences"]["waypoints"];
  onRemoveWaypoint: (waypointId: string) => void;
}) {
  if (waypoints.length === 0) {
    return <p className="empty-copy">No optional waypoint selected.</p>;
  }

  return (
    <div className="token-list">
      {waypoints.map((waypoint) => (
        <span className="token" key={waypoint.id}>
          {iconForWaypoint(waypoint.type)}
          {waypoint.label}
          <button
            type="button"
            onClick={() => onRemoveWaypoint(waypoint.id)}
            title="Remove waypoint"
          >
            <Trash2 size={13} />
          </button>
        </span>
      ))}
    </div>
  );
}

function AvoidZoneList({
  zones,
  onRemoveAvoidZone,
}: {
  zones: AvoidZone[];
  onRemoveAvoidZone: (zoneId: string) => void;
}) {
  if (zones.length === 0) {
    return <p className="empty-copy">No avoid zone marked.</p>;
  }

  return (
    <div className="token-list">
      {zones.map((zone) => (
        <span className="token warning" key={zone.id}>
          <Flag size={13} />
          {zone.label}
          <button
            type="button"
            onClick={() => onRemoveAvoidZone(zone.id)}
            title="Remove avoid zone"
          >
            <Trash2 size={13} />
          </button>
        </span>
      ))}
    </div>
  );
}

function FutureChip({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <button type="button" className="future-chip" disabled>
      {icon}
      {label}
    </button>
  );
}

function iconForWaypoint(type: WaypointType) {
  if (type === "cafe") {
    return <Coffee size={13} />;
  }

  if (type === "water") {
    return <Droplet size={13} />;
  }

  if (type === "viewpoint") {
    return <Eye size={13} />;
  }

  if (type === "climb") {
    return <Mountain size={13} />;
  }

  return <Flag size={13} />;
}
