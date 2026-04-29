import assert from "node:assert/strict";
import {
  distanceToleranceScore,
  scoreRouteCandidate,
  selectTopRouteCandidates,
} from "./routeScoring";
import type { LatLng, RouteOption, RouteRequest } from "./domain/types";

let testsRun = 0;
let testsFailed = 0;

function it(name: string, run: () => void): void {
  testsRun += 1;

  try {
    run();
    console.log(`ok - ${name}`);
  } catch (error) {
    testsFailed += 1;
    console.error(`fail - ${name}`);
    console.error(error);
  }
}

console.log("route scoring");

it("distance tolerance scoring favors routes close to target", () => {
  assert.equal(distanceToleranceScore(30, 30), 100);
  assert.equal(distanceToleranceScore(45, 30) < distanceToleranceScore(34, 30), true);
});

it("ignores D+ scoring when the D+ constraint is disabled", () => {
  const request = createRequest({ useElevationConstraint: false });
  const low = scoreRouteCandidate(createRoute({ elevationGainM: 100 }), request, []);
  const high = scoreRouteCandidate(createRoute({ elevationGainM: 4000 }), request, []);

  assert.equal(low.elevationCloseness, 100);
  assert.equal(high.elevationCloseness, 100);
});

it("applies D+ scoring when the D+ constraint is enabled", () => {
  const request = createRequest({
    useElevationConstraint: true,
    elevationGainMin: 500,
    elevationGainMax: 900,
  });
  const inside = scoreRouteCandidate(createRoute({ elevationGainM: 700 }), request, []);
  const outside = scoreRouteCandidate(createRoute({ elevationGainM: 2000 }), request, []);

  assert.equal(inside.elevationCloseness, 100);
  assert.equal(outside.elevationCloseness < inside.elevationCloseness, true);
});

it("out-and-back overlap lowers the candidate score", () => {
  const request = createRequest();
  const loop = scoreRouteCandidate(createRoute({ geometry: loopGeometry() }), request, []);
  const outAndBack = scoreRouteCandidate(
    createRoute({ geometry: outAndBackGeometry() }),
    request,
    [],
  );

  assert.equal(outAndBack.outAndBackPenalty > loop.outAndBackPenalty, true);
});

it("selects the top 3 candidates by score", () => {
  const request = createRequest();
  const routes = [
    createRoute({ id: "far", distanceKm: 50 }),
    createRoute({ id: "best", distanceKm: 30 }),
    createRoute({ id: "near", distanceKm: 33 }),
    createRoute({ id: "bad", distanceKm: 70 }),
  ].map((route) => ({
    route,
    score: scoreRouteCandidate(route, request, []),
  }));

  const selected = selectTopRouteCandidates(routes, request, 3);

  assert.deepEqual(selected.map((route) => route.id), ["best", "near", "far"]);
});

process.on("beforeExit", () => {
  if (testsFailed > 0) {
    process.exitCode = 1;
    console.error(`${testsFailed} of ${testsRun} tests failed`);
    return;
  }

  console.log(`${testsRun} tests passed`);
});

function createRequest(patch: Partial<RouteRequest> = {}): RouteRequest {
  return {
    id: "request-test",
    createdAt: "2026-04-29T00:00:00.000Z",
    planningMode: "experimental_auto_loop",
    routeType: "road",
    targetDistanceKm: 30,
    useElevationConstraint: false,
    preferences: {
      shape: "loop",
      avoidOutAndBack: true,
      avoidMainRoads: true,
      allowFerries: false,
      difficulty: "endurance",
      waypoints: [],
      avoidZones: [],
    },
    ...patch,
  };
}

function createRoute(patch: Partial<RouteOption> = {}): RouteOption {
  return {
    id: "route",
    requestId: "request-test",
    name: "Route",
    provider: "test",
    generatedAt: "2026-04-29T00:00:00.000Z",
    routeType: "road",
    shape: "loop",
    distanceKm: 30,
    elevationGainM: 700,
    estimatedDurationMinutes: 90,
    geometry: loopGeometry(),
    surfaceBreakdown: [{ label: "Paved road", percentage: 80 }],
    elevationProfile: {
      points: [],
      minElevationM: 400,
      maxElevationM: 700,
      ascentM: 700,
      descentM: 680,
    },
    score: {
      safety: 80,
      scenery: 80,
      trafficExposure: 20,
      climbDifficulty: 75,
      overall: 80,
    },
    waypoints: [],
    relaxedConstraints: [],
    summary: "Test",
    ...patch,
  };
}

function loopGeometry(): LatLng[] {
  return [
    { lat: 45.9, lng: 6.12 },
    { lat: 45.91, lng: 6.13 },
    { lat: 45.92, lng: 6.12 },
    { lat: 45.91, lng: 6.11 },
    { lat: 45.9, lng: 6.12 },
  ];
}

function outAndBackGeometry(): LatLng[] {
  return [
    { lat: 45.9, lng: 6.12 },
    { lat: 45.91, lng: 6.13 },
    { lat: 45.92, lng: 6.14 },
    { lat: 45.91, lng: 6.13 },
    { lat: 45.9, lng: 6.12 },
  ];
}
