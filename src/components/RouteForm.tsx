import {
  ArrowDown,
  ArrowUp,
  Bike,
  CloudSun,
  Flag,
  LocateFixed,
  MapPin,
  Mountain,
  Navigation,
  RefreshCcw,
  Shuffle,
  SlidersHorizontal,
  Trash2,
  Watch,
  WifiOff,
  Wind,
} from "lucide-react";
import { DIFFICULTY_PRESETS } from "../domain/presets";
import type {
  AvoidZone,
  DifficultyPreset,
  RouteRequest,
  RouteType,
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
  onUseCurrentLocation: () => void;
  onDrawAvoidZonesChange: (enabled: boolean) => void;
  onRemoveAvoidZone: (zoneId: string) => void;
  onReorderWaypoint: (waypointId: string, direction: -1 | 1) => void;
}

const ROUTE_TYPES: Array<{ value: RouteType; label: string; icon: typeof Bike }> = [
  { value: "road", label: "Road bike", icon: Bike },
  { value: "trail", label: "Trail / MTB", icon: Mountain },
];

export function RouteForm({
  request,
  providerLabel,
  isDevelopment,
  status,
  drawAvoidZones,
  onRequestChange,
  onGenerate,
  onSurprise,
  onUseCurrentLocation,
  onDrawAvoidZonesChange,
  onRemoveAvoidZone,
  onReorderWaypoint,
}: RouteFormProps) {
  const isReliableMode = request.planningMode === "reliable";

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
          <Navigation size={16} />
          <h2>Mode</h2>
        </div>
        <div className="segmented two">
          <button
            type="button"
            className={isReliableMode ? "active" : ""}
            onClick={() => updateRequest({ planningMode: "reliable" })}
          >
            <MapPin size={16} />
            Reliable Mode
          </button>
          <button
            type="button"
            className={!isReliableMode ? "active" : ""}
            onClick={() =>
              updateRequest({ planningMode: "experimental_auto_loop" })
            }
          >
            <RefreshCcw size={16} />
            Experimental Auto-Loop
          </button>
        </div>
        <p className="mode-helper">
          {isReliableMode
            ? "Build your route by adding waypoints. The app snaps the route to real roads/trails."
            : "Generate route ideas automatically. Results may vary."}
        </p>
      </section>

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
          <SlidersHorizontal size={16} />
          <h2>Routing Safety</h2>
        </div>
        <label className="check-row">
          <input
            type="checkbox"
            checked={request.preferences.allowFerries}
            onChange={(event) =>
              updatePreferences({ allowFerries: event.target.checked })
            }
          />
          <span>Allow ferries</span>
        </label>
        <p className="mode-helper">
          When off, routes avoid ferry crossings and non-road transport links.
        </p>
      </section>

      <section className="form-section location-fields">
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
        <button
          type="button"
          className="secondary-button full"
          onClick={onUseCurrentLocation}
        >
          <LocateFixed size={16} />
          Current location
        </button>
      </section>

      {!isReliableMode ? (
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
      ) : null}

      {!isReliableMode ? (
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
      ) : null}

      {!isReliableMode ? (
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
      ) : null}

      {isReliableMode ? (
        <section className="form-section">
        <div className="section-heading">
          <MapPin size={16} />
          <h2>Manual Waypoints</h2>
        </div>
        <p className="empty-copy">Click the map to set a start and add waypoints.</p>
        <WaypointOrderList
          waypoints={request.preferences.waypoints}
          onRemoveWaypoint={removeWaypoint}
          onReorderWaypoint={onReorderWaypoint}
        />
      </section>
      ) : null}

      {!isReliableMode ? (
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
      ) : null}

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
          disabled={status === "loading" || isReliableMode}
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
          {status === "loading"
            ? "Generating"
            : isReliableMode
              ? "Build route"
              : "Generate loops"}
        </button>
      </div>
    </aside>
  );
}

function WaypointOrderList({
  waypoints,
  onRemoveWaypoint,
  onReorderWaypoint,
}: {
  waypoints: RouteRequest["preferences"]["waypoints"];
  onRemoveWaypoint: (waypointId: string) => void;
  onReorderWaypoint: (waypointId: string, direction: -1 | 1) => void;
}) {
  if (waypoints.length === 0) {
    return <p className="empty-copy">No waypoints added yet.</p>;
  }

  return (
    <div className="waypoint-list">
      {waypoints.map((waypoint, index) => (
        <div className="waypoint-row" key={waypoint.id}>
          <span>
            <strong>{index + 1}</strong>
            {waypoint.label}
          </span>
          <button
            type="button"
            className="tiny-icon-button"
            onClick={() => onReorderWaypoint(waypoint.id, -1)}
            disabled={index === 0}
            title="Move waypoint up"
          >
            <ArrowUp size={13} />
          </button>
          <button
            type="button"
            className="tiny-icon-button"
            onClick={() => onReorderWaypoint(waypoint.id, 1)}
            disabled={index === waypoints.length - 1}
            title="Move waypoint down"
          >
            <ArrowDown size={13} />
          </button>
          <button
            type="button"
            className="tiny-icon-button"
            onClick={() => onRemoveWaypoint(waypoint.id)}
            title="Remove waypoint"
          >
            <Trash2 size={13} />
          </button>
        </div>
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
