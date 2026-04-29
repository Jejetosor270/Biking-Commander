import assert from "node:assert/strict";
import { buildReliableRoute, reorderWaypoints } from "./reliableRouteBuilder";
import type { LatLng, RouteOption, RouteRequest } from "./domain/types";
import type { RoutingProvider } from "./routing/RoutingProvider";

let testsRun = 0;
let testsFailed = 0;

async function it(name: string, run: () => void | Promise<void>): Promise<void> {
  testsRun += 1;

  try {
    await run();
    console.log(`ok - ${name}`);
  } catch (error) {
    testsFailed += 1;
    console.error(`fail - ${name}`);
    console.error(error);
  }
}

async function main(): Promise<void> {
  console.log("reliable route builder");

  await it("routes through all manual waypoints", async () => {
    const provider = createProvider();
    const request = createReliableRequest();
    const result = await buildReliableRoute(provider, request);

    assert.equal(provider.calls.length, 3);
    assert.deepEqual(provider.calls[2], [
      request.startLocation?.coordinate,
      request.preferences.waypoints[0].coordinate,
      request.preferences.waypoints[1].coordinate,
    ]);
    assert.equal(result.route.geometry.length > 3, true);
  });

  await it("reordering waypoints changes the routed waypoint order", async () => {
    const provider = createProvider();
    const request = createReliableRequest();
    const reordered = reorderWaypoints(request.preferences.waypoints, 1, 0);

    await buildReliableRoute(provider, {
      ...request,
      preferences: {
        ...request.preferences,
        waypoints: reordered,
      },
    });

    assert.deepEqual(provider.calls[2], [
      request.startLocation?.coordinate,
      request.preferences.waypoints[1].coordinate,
      request.preferences.waypoints[0].coordinate,
    ]);
  });

  await it("dragging a waypoint and rebuilding uses the new coordinate", async () => {
    const provider = createProvider();
    const request = createReliableRequest();
    const dragged = { lat: 45.93, lng: 6.2 };

    await buildReliableRoute(provider, {
      ...request,
      preferences: {
        ...request.preferences,
        waypoints: request.preferences.waypoints.map((waypoint, index) =>
          index === 0 ? { ...waypoint, coordinate: dragged } : waypoint,
        ),
      },
    });

    assert.deepEqual(provider.calls[2][1], dragged);
  });

  await it("reports the manual segment that contains a ferry", async () => {
    const provider = createProvider();
    const request = createReliableRequest();
    provider.failSegmentIndex = 0;

    await assert.rejects(
      () => buildReliableRoute(provider, request),
      /Start to A contains a ferry.*add an intermediate waypoint/i,
    );
  });
}

void main().finally(() => {
  if (testsFailed > 0) {
    process.exitCode = 1;
    console.error(`${testsFailed} of ${testsRun} tests failed`);
    return;
  }

  console.log(`${testsRun} tests passed`);
});

function createProvider(): RoutingProvider & {
  calls: LatLng[][];
  failSegmentIndex?: number;
} {
  const calls: LatLng[][] = [];

  return {
    id: "test",
    label: "Test",
    mode: "real",
    calls,
    failSegmentIndex: undefined,
    async generateRoutes() {
      return { options: [], relaxedConstraints: [], diagnostics: [] };
    },
    async routeWaypoints(request, waypoints, variantIndex = 0) {
      calls.push(waypoints);
      if (variantIndex === this.failSegmentIndex) {
        throw new Error(
          "ferry_detected: Route uses a ferry or non-road transport link.",
        );
      }
      return createRouteOption(request, waypoints, variantIndex);
    },
  };
}

function createReliableRequest(): RouteRequest {
  return {
    id: "request-test",
    createdAt: "2026-04-29T00:00:00.000Z",
    planningMode: "reliable",
    routeType: "road",
    targetDistanceKm: 30,
    useElevationConstraint: false,
    startLocation: {
      source: "coordinates",
      label: "Start",
      coordinate: { lat: 45.9, lng: 6.12 },
    },
    preferences: {
      shape: "point-to-point",
      avoidOutAndBack: false,
      avoidMainRoads: false,
      allowFerries: false,
      difficulty: "endurance",
      avoidZones: [],
      waypoints: [
        {
          id: "waypoint-a",
          type: "custom",
          label: "A",
          coordinate: { lat: 45.91, lng: 6.15 },
        },
        {
          id: "waypoint-b",
          type: "custom",
          label: "B",
          coordinate: { lat: 45.92, lng: 6.18 },
        },
      ],
    },
  };
}

function createRouteOption(
  request: RouteRequest,
  waypoints: LatLng[],
  variantIndex: number,
): RouteOption {
  return {
    id: `route-${variantIndex}`,
    requestId: request.id,
    name: "Reliable route",
    provider: "test",
    generatedAt: request.createdAt,
    routeType: request.routeType,
    shape: request.preferences.shape,
    distanceKm: 30,
    elevationGainM: 300,
    estimatedDurationMinutes: 80,
    geometry: densify(waypoints),
    surfaceBreakdown: [],
    elevationProfile: {
      points: [],
      minElevationM: 400,
      maxElevationM: 700,
      ascentM: 300,
      descentM: 280,
    },
    score: {
      safety: 80,
      scenery: 75,
      trafficExposure: 20,
      climbDifficulty: 70,
      overall: 78,
    },
    waypoints: request.preferences.waypoints,
    relaxedConstraints: [],
    summary: "Test",
  };
}

function densify(waypoints: LatLng[]): LatLng[] {
  return waypoints.flatMap((point, index) => {
    if (index === 0) {
      return [point];
    }

    const previous = waypoints[index - 1];

    return [0.33, 0.66, 1].map((progress) => ({
      lat: previous.lat + (point.lat - previous.lat) * progress,
      lng: previous.lng + (point.lng - previous.lng) * progress,
    }));
  });
}
