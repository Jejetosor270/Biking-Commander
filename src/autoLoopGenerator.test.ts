import assert from "node:assert/strict";
import {
  generateAutoLoopCandidates,
  generateAutoLoopRoutes,
} from "./autoLoopGenerator";
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
  console.log("auto-loop generator");

  await it("generates at least 20 candidate loop shapes before ranking", () => {
    const candidates = generateAutoLoopCandidates(createRequest(), {
      lat: 45.9,
      lng: 6.12,
    });

    assert.equal(candidates.length >= 20, true);
    assert.equal(new Set(candidates.map((candidate) => candidate.shape)).size, 3);
  });

  await it("uses provider geometry for candidate routes and keeps the top 3", async () => {
    const provider = createProvider();
    const result = await generateAutoLoopRoutes(provider, createRequest());

    assert.equal(provider.calls.length >= 20, true);
    assert.equal(result.options.length, 3);
    assert.equal(result.options.every((option) => option.geometry.length > 12), true);
    assert.equal(result.options[0].distanceKm, 30);
  });

  await it("zero candidates recommends Reliable Mode", async () => {
    const provider: RoutingProvider = {
      id: "failing",
      label: "Failing",
      mode: "real",
      async generateRoutes() {
        return { options: [], relaxedConstraints: [], diagnostics: [] };
      },
      async routeWaypoints() {
        throw new Error("no route");
      },
    };
    const result = await generateAutoLoopRoutes(provider, createRequest());

    assert.equal(result.options.length, 0);
    assert.match(result.diagnostics.at(-1) ?? "", /Try Reliable Mode/);
  });

  await it("filters ferry candidates and explains ferry-only failures", async () => {
    const provider = createProvider((route) => ({
      ...route,
      transportSegments: [
        {
          kind: "ferry",
          description: "Ferry crossing detected in routing metadata.",
          tags: { route: "ferry" },
        },
      ],
    }));
    const result = await generateAutoLoopRoutes(provider, createRequest());

    assert.equal(result.options.length, 0);
    assert.match(result.diagnostics.join(" "), /ferry_detected/);
    assert.equal(
      result.diagnostics.at(-1),
      "Only ferry-based routes were found. Try changing your start/finish or enable ferries.",
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

function createProvider(
  decorateRoute: (route: RouteOption) => RouteOption = (route) => route,
): RoutingProvider & { calls: LatLng[][] } {
  const calls: LatLng[][] = [];

  return {
    id: "test",
    label: "Test",
    mode: "real",
    calls,
    async generateRoutes() {
      return { options: [], relaxedConstraints: [], diagnostics: [] };
    },
    async routeWaypoints(request, waypoints, variantIndex = 0) {
      calls.push(waypoints);
      return decorateRoute(createRouteOption(request, waypoints, variantIndex));
    },
  };
}

function createRequest(): RouteRequest {
  return {
    id: "request-test",
    createdAt: "2026-04-29T00:00:00.000Z",
    planningMode: "experimental_auto_loop",
    routeType: "road",
    targetDistanceKm: 30,
    useElevationConstraint: false,
    startLocation: {
      source: "coordinates",
      label: "Start",
      coordinate: { lat: 45.9, lng: 6.12 },
    },
    preferences: {
      shape: "loop",
      avoidOutAndBack: false,
      avoidMainRoads: false,
      allowFerries: false,
      difficulty: "endurance",
      waypoints: [],
      avoidZones: [],
    },
  };
}

function createRouteOption(
  request: RouteRequest,
  anchors: LatLng[],
  variantIndex: number,
): RouteOption {
  return {
    id: `route-${variantIndex}`,
    requestId: request.id,
    name: `Candidate ${variantIndex}`,
    provider: "test",
    generatedAt: request.createdAt,
    routeType: request.routeType,
    shape: "loop",
    distanceKm: [30, 32, 35, 40][variantIndex % 4] ?? 40,
    elevationGainM: 300 + variantIndex * 20,
    estimatedDurationMinutes: 90,
    geometry: densify(anchors),
    surfaceBreakdown: [{ label: "Paved road", percentage: 80 }],
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
    waypoints: [],
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

    return [0.2, 0.4, 0.6, 0.8, 1].map((progress) => ({
      lat: previous.lat + (point.lat - previous.lat) * progress,
      lng: previous.lng + (point.lng - previous.lng) * progress,
    }));
  });
}
