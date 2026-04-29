import type {
  LatLng,
  RouteOption,
  RouteRequest,
  RouteSegment,
  Waypoint,
} from "./domain/types";
import { resolveStartCoordinate } from "./routing/locationResolver";
import type { RoutingProvider } from "./routing/RoutingProvider";

export interface ReliableRouteBuildResult {
  route: RouteOption;
  segments: RouteSegment[];
}

export async function buildReliableRoute(
  provider: RoutingProvider,
  request: RouteRequest,
): Promise<ReliableRouteBuildResult> {
  const waypoints = await plannedWaypoints(request, provider.mode === "real");

  if (waypoints.length < 2) {
    throw new Error("Reliable Mode needs at least a start and one waypoint.");
  }

  const failedSegments: string[] = [];
  const routedSegments: RouteSegment[] = [];

  for (let index = 0; index < waypoints.length - 1; index += 1) {
    const from = waypoints[index];
    const to = waypoints[index + 1];

    if (!from.coordinate || !to.coordinate) {
      failedSegments.push(`${from.label} to ${to.label}`);
      continue;
    }

    try {
      const segmentRoute = await provider.routeWaypoints(
        request,
        [from.coordinate, to.coordinate],
        index,
      );
      routedSegments.push({
        id: `segment-${request.id}-${index + 1}`,
        from,
        to,
        geometry: segmentRoute.geometry,
        distanceKm: segmentRoute.distanceKm,
        elevationGainM: segmentRoute.elevationGainM,
        provider: segmentRoute.provider,
      });
    } catch (error) {
      failedSegments.push(formatSegmentFailure(from, to, error));
    }
  }

  if (failedSegments.length > 0) {
    throw new Error(`Routing failed for segment: ${failedSegments.join(", ")}.`);
  }

  const route = await provider.routeWaypoints(
    request,
    waypoints.map((waypoint) => waypoint.coordinate as LatLng),
    0,
  );

  return {
    route: {
      ...route,
      id: `reliable-${route.id}`,
      name: "Reliable waypoint route",
      summary: "Snapped through manual waypoints on mapped roads/trails.",
      waypoints,
    },
    segments: routedSegments,
  };
}

export async function plannedWaypoints(
  request: RouteRequest,
  useNetworkGeocoder = false,
): Promise<Waypoint[]> {
  const startCoordinate =
    request.startLocation?.coordinate ??
    (request.startLocation?.label.trim()
      ? await resolveStartCoordinate(request, useNetworkGeocoder)
      : undefined);
  const start = startCoordinate
    ? [
        {
          id: "start",
          type: "custom" as const,
          label: request.startLocation?.label || "Start",
          coordinate: startCoordinate,
        },
      ]
    : [];

  return [
    ...start,
    ...request.preferences.waypoints.filter((waypoint) => waypoint.coordinate),
  ];
}

export function reorderWaypoints(
  waypoints: Waypoint[],
  fromIndex: number,
  toIndex: number,
): Waypoint[] {
  const next = [...waypoints];
  const [moved] = next.splice(fromIndex, 1);

  if (!moved) {
    return waypoints;
  }

  next.splice(toIndex, 0, moved);
  return next;
}

function formatSegmentFailure(from: Waypoint, to: Waypoint, error: unknown): string {
  const label = `${from.label} to ${to.label}`;
  const message = error instanceof Error ? error.message : String(error);

  if (message.includes("ferry_detected")) {
    return `${label} contains a ferry or non-road transport link; add an intermediate waypoint to avoid the crossing or enable ferries.`;
  }

  return label;
}
