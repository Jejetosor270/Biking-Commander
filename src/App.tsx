import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { RouteCard } from "./components/RouteCard";
import { RouteForm } from "./components/RouteForm";
import { RouteMap } from "./components/RouteMap";
import { StoragePanel } from "./components/StoragePanel";
import type {
  AvoidZone,
  DifficultyPreset,
  LatLng,
  RelaxedConstraint,
  RouteOption,
  RouteRequest,
  RouteType,
} from "./domain/types";
import { resolveRoutingConfig } from "./routing/routingConfig";
import { createRoutingProviderFromConfig } from "./routing/routingProviderConfig";
import { validateElevationConstraintInput } from "./domain/routeValidation";
import { downloadRouteAsGpx } from "./services/gpx";
import {
  addRouteHistory,
  clearRouteHistory,
  loadFavoriteRoutes,
  loadRouteHistory,
  removeFavoriteRoute,
  saveFavoriteRoute,
} from "./services/localRouteStore";

type GenerationStatus = "idle" | "loading" | "success" | "error";

export function App() {
  const routingConfig = useMemo(
    () => resolveRoutingConfig(import.meta.env),
    [],
  );
  const provider = useMemo(
    () => createRoutingProviderFromConfig(routingConfig),
    [routingConfig],
  );
  const [request, setRequest] = useState<RouteRequest>(() => createDefaultRequest());
  const [routes, setRoutes] = useState<RouteOption[]>([]);
  const [selectedRouteId, setSelectedRouteId] = useState<string>();
  const [favorites, setFavorites] = useState<RouteOption[]>([]);
  const [history, setHistory] = useState<RouteOption[]>([]);
  const [status, setStatus] = useState<GenerationStatus>("idle");
  const [drawAvoidZones, setDrawAvoidZones] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>();
  const [diagnostics, setDiagnostics] = useState<string[]>([]);
  const [relaxedConstraints, setRelaxedConstraints] = useState<RelaxedConstraint[]>([]);

  useEffect(() => {
    setFavorites(loadFavoriteRoutes());
    setHistory(loadRouteHistory());
  }, []);

  const selectedRoute =
    routes.find((route) => route.id === selectedRouteId) ?? routes[0];

  async function runGeneration(baseRequest: RouteRequest = request) {
    const elevationConstraintValidation =
      validateElevationConstraintInput(baseRequest);

    if (!elevationConstraintValidation.valid) {
      setStatus("error");
      setErrorMessage(elevationConstraintValidation.message);
      return;
    }

    setStatus("loading");
    setErrorMessage(undefined);
    setDiagnostics([]);
    setRelaxedConstraints([]);

    try {
      const generationRequest = await withGenerationMetadata(baseRequest);
      setRequest(generationRequest);
      const result = await provider.generateRoutes(generationRequest);

      if (result.options.length === 0) {
        setRoutes([]);
        setSelectedRouteId(undefined);
        setStatus("error");
        setDiagnostics(result.diagnostics);
        setRelaxedConstraints(result.relaxedConstraints);
        setErrorMessage("No route matched the selected hard constraints.");
        return;
      }

      setRoutes(result.options);
      setSelectedRouteId(result.options[0].id);
      setHistory(addRouteHistory(result.options));
      setRelaxedConstraints(result.relaxedConstraints);
      setDiagnostics(result.diagnostics);
      setStatus("success");
    } catch (error) {
      setStatus("error");
      setRoutes([]);
      setSelectedRouteId(undefined);
      setErrorMessage(error instanceof Error ? error.message : "Route generation failed.");
    }
  }

  async function withGenerationMetadata(baseRequest: RouteRequest): Promise<RouteRequest> {
    const currentLocation = await maybeResolveCurrentLocation(baseRequest);
    return {
      ...baseRequest,
      id: createId("request"),
      createdAt: new Date().toISOString(),
      currentLocation,
    };
  }

  async function maybeResolveCurrentLocation(
    baseRequest: RouteRequest,
  ): Promise<LatLng | undefined> {
    const needsCurrent =
      baseRequest.preferences.shape === "current-location-loop" ||
      baseRequest.preferences.shape === "current-location-to-destination";

    if (!needsCurrent) {
      return baseRequest.currentLocation;
    }

    if (baseRequest.currentLocation) {
      return baseRequest.currentLocation;
    }

    if (!navigator.geolocation) {
      throw new Error("Current location is not available in this browser.");
    }

    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        (position) =>
          resolve({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          }),
        () => reject(new Error("Current location permission was not granted.")),
        { enableHighAccuracy: true, timeout: 9000, maximumAge: 120000 },
      );
    });
  }

  function surpriseMe() {
    const presets: DifficultyPreset[] = [
      "beginner",
      "endurance",
      "training",
      "adventure",
    ];
    const preset = presets[Math.floor(Math.random() * presets.length)];
    const routeType: RouteType = Math.random() > 0.55 ? "trail" : "road";
    const config = {
      beginner: [24, 120, 420],
      endurance: [58, 450, 1050],
      training: [82, 850, 1700],
      adventure: [118, 1200, 2600],
    }[preset];
    const nextRequest: RouteRequest = {
      ...request,
      routeType,
      targetDistanceKm: config[0] + Math.round(Math.random() * 10),
      elevationGainMin: config[1],
      elevationGainMax: config[2],
      preferences: {
        ...request.preferences,
        shape: "loop",
        difficulty: preset,
        avoidOutAndBack: true,
      },
    };
    setRequest(nextRequest);
    void runGeneration(nextRequest);
  }

  function selectStoredRoute(route: RouteOption) {
    setRoutes((currentRoutes) =>
      currentRoutes.some((item) => item.id === route.id)
        ? currentRoutes
        : [route, ...currentRoutes].slice(0, 3),
    );
    setSelectedRouteId(route.id);
  }

  function addAvoidZone(zone: AvoidZone) {
    setRequest((current) => ({
      ...current,
      preferences: {
        ...current.preferences,
        avoidZones: [...current.preferences.avoidZones, zone],
      },
    }));
  }

  function removeAvoidZone(zoneId: string) {
    setRequest((current) => ({
      ...current,
      preferences: {
        ...current.preferences,
        avoidZones: current.preferences.avoidZones.filter(
          (zone) => zone.id !== zoneId,
        ),
      },
    }));
  }

  function saveRoute(route: RouteOption) {
    setFavorites(saveFavoriteRoute(route));
  }

  return (
    <main className="app-shell">
      <RouteForm
        request={request}
        providerLabel={routingConfig.isDevelopment ? provider.label : undefined}
        isDevelopment={routingConfig.isDevelopment}
        status={status}
        drawAvoidZones={drawAvoidZones}
        onRequestChange={setRequest}
        onGenerate={() => void runGeneration()}
        onSurprise={surpriseMe}
        onDrawAvoidZonesChange={setDrawAvoidZones}
        onRemoveAvoidZone={removeAvoidZone}
      />

      <section className="map-and-results">
        <RouteMap
          routes={routes}
          selectedRoute={selectedRoute}
          avoidZones={request.preferences.avoidZones}
          drawAvoidZones={drawAvoidZones}
          onAddAvoidZone={addAvoidZone}
        />

        <div className="results-toolbar">
          <div>
            <p className="eyebrow">Route options</p>
            <h2>Compare three alternatives</h2>
          </div>
          <StatusPill status={status} />
        </div>

        {status === "loading" ? (
          <div className="state-panel">
            <Loader2 className="spin" size={22} />
            <strong>Generating route alternatives</strong>
            <span>Checking distance, shape, and preferences.</span>
          </div>
        ) : null}

        {status === "error" ? (
          <div className="state-panel error">
            <AlertTriangle size={22} />
            <strong>{errorMessage}</strong>
            {relaxedConstraints.length > 0 ? (
              <span>
                Relaxed:{" "}
                {relaxedConstraints
                  .map((constraint) => constraint.constraint)
                  .join(", ")}
              </span>
            ) : null}
            {diagnostics.length > 0 ? <span>{diagnostics[0]}</span> : null}
          </div>
        ) : null}

        {status === "success" && relaxedConstraints.length > 0 ? (
          <div className="state-panel notice">
            <CheckCircle2 size={22} />
            <strong>Routes generated with relaxed preferences</strong>
            <span>{relaxedConstraints.map((item) => item.reason).join(" ")}</span>
          </div>
        ) : null}

        {routes.length === 0 && status === "idle" ? (
          <div className="empty-state">
            <h2>Ready for a route brief.</h2>
            <p>
              Configure the ride, generate options, then compare the route cards
              and map preview.
            </p>
          </div>
        ) : null}

        {routes.length > 0 ? (
          <div className="routes-grid">
            {routes.map((route) => (
              <RouteCard
                key={route.id}
                route={route}
                isSelected={route.id === selectedRoute?.id}
                isFavorite={favorites.some((favorite) => favorite.id === route.id)}
                onSelect={(nextRoute) => setSelectedRouteId(nextRoute.id)}
                onSave={saveRoute}
                onExportGpx={downloadRouteAsGpx}
                showProvider={routingConfig.isDevelopment}
              />
            ))}
          </div>
        ) : null}
      </section>

      <StoragePanel
        favorites={favorites}
        history={history}
        selectedRouteId={selectedRoute?.id}
        onSelectRoute={selectStoredRoute}
        onRemoveFavorite={(routeId) => setFavorites(removeFavoriteRoute(routeId))}
        onClearHistory={() => setHistory(clearRouteHistory())}
      />
    </main>
  );
}

function StatusPill({ status }: { status: GenerationStatus }) {
  const label = {
    idle: "Idle",
    loading: "Working",
    success: "Ready",
    error: "Needs changes",
  }[status];

  return <span className={`status-pill ${status}`}>{label}</span>;
}

function createDefaultRequest(): RouteRequest {
  return {
    id: createId("request"),
    createdAt: new Date().toISOString(),
    routeType: "road",
    targetDistanceKm: 65,
    useElevationConstraint: false,
    elevationGainMin: 500,
    elevationGainMax: 1200,
    startLocation: {
      source: "address",
      label: "Annecy, France",
    },
    finishLocation: {
      source: "address",
      label: "Geneva, Switzerland",
    },
    preferences: {
      shape: "loop",
      avoidOutAndBack: true,
      avoidMainRoads: true,
      difficulty: "endurance",
      waypoints: [],
      avoidZones: [],
    },
  };
}

function createId(prefix: string): string {
  if ("crypto" in window && "randomUUID" in window.crypto) {
    return `${prefix}-${window.crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
