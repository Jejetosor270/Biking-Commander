import assert from "node:assert/strict";
import {
  getRenderableRouteGeometry,
  routeModeBadgeLabel,
} from "../domain/routeGeometry";
import type { RouteOption } from "../domain/types";
import { routeToGpx } from "./gpx";

let testsRun = 0;
let testsFailed = 0;

function describe(name: string, run: () => void): void {
  console.log(name);
  run();
}

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

process.on("beforeExit", () => {
  if (testsFailed > 0) {
    process.exitCode = 1;
    console.error(`${testsFailed} of ${testsRun} tests failed`);
    return;
  }

  console.log(`${testsRun} tests passed`);
});

describe("route geometry rendering and export", () => {
  it("renders provider geometry instead of request waypoints", () => {
    const route = createRouteOption("brouter");

    assert.strictEqual(getRenderableRouteGeometry(route), route.geometry);
    assert.notDeepEqual(getRenderableRouteGeometry(route), [
      route.waypoints[0].coordinate,
    ]);
  });

  it("exports GPX from the same geometry used by the map", () => {
    const route = createRouteOption("brouter");
    const gpx = routeToGpx(route);

    for (const point of getRenderableRouteGeometry(route)) {
      assert.match(gpx, new RegExp(`lat="${point.lat.toFixed(7)}"`));
      assert.match(gpx, new RegExp(`lon="${point.lng.toFixed(7)}"`));
    }

    assert.doesNotMatch(gpx, /lat="47\.0000000"/);
    assert.doesNotMatch(gpx, /lon="7\.0000000"/);
  });

  it("labels mock routes explicitly", () => {
    assert.equal(routeModeBadgeLabel(createRouteOption("mock")), "Mock route");
    assert.equal(routeModeBadgeLabel(createRouteOption("brouter")), null);
  });
});

function createRouteOption(provider: string): RouteOption {
  return {
    id: "route-test",
    requestId: "request-test",
    name: "Provider route",
    provider,
    generatedAt: "2026-04-28T00:00:00.000Z",
    routeType: "road",
    shape: "point-to-point",
    distanceKm: 62.4,
    elevationGainM: 930,
    estimatedDurationMinutes: 210,
    geometry: [
      { lat: 45.8992, lng: 6.1294, elevationM: 450 },
      { lat: 45.9392, lng: 6.2194, elevationM: 620 },
      { lat: 46.2044, lng: 6.1432, elevationM: 410 },
    ],
    surfaceBreakdown: [],
    elevationProfile: {
      points: [
        { distanceKm: 0, elevationM: 450 },
        { distanceKm: 31.2, elevationM: 620 },
        { distanceKm: 62.4, elevationM: 410 },
      ],
      minElevationM: 410,
      maxElevationM: 620,
      ascentM: 930,
      descentM: 900,
    },
    score: {
      safety: 80,
      scenery: 82,
      trafficExposure: 20,
      climbDifficulty: 74,
      overall: 81,
    },
    waypoints: [
      {
        id: "waypoint-test",
        type: "viewpoint",
        label: "Not route geometry",
        coordinate: { lat: 47, lng: 7 },
      },
    ],
    relaxedConstraints: [],
    summary: "Generated from provider geometry.",
  };
}
