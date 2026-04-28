import assert from "node:assert/strict";
import { BRouterProvider } from "./bRouterProvider";
import type { LatLng, RouteRequest } from "../domain/types";

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
  console.log("BRouter provider");

  await it("requests BRouter without an API key and returns 3 routed alternatives", async () => {
    const originalFetch = globalThis.fetch;
    const requestedUrls: string[] = [];
    globalThis.fetch = ((input) => {
      const url = String(input);
      requestedUrls.push(url);

      assert.match(url, /^https:\/\/brouter\.de\/brouter/);
      assert.match(url, /profile=fastbike/);
      assert.match(url, /format=geojson/);
      assert.doesNotMatch(url, /key=/i);

      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => createBRouterGeoJson(),
      } as Response);
    }) as typeof fetch;

    try {
      const result = await new BRouterProvider().generateRoutes(createRequest());

      assert.equal(result.options.length, 3);
      assert.equal(result.options.every((option) => option.provider === "brouter"), true);
      assert.equal(requestedUrls.length, 3);
      assert.equal(result.options.every((option) => option.geometry.length > 12), true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  await it("falls back to OSRM when BRouter fails", async () => {
    const originalFetch = globalThis.fetch;
    let osrmCalls = 0;
    globalThis.fetch = ((input) => {
      const url = String(input);

      if (url.startsWith("https://brouter.de/brouter")) {
        return Promise.resolve({
          ok: false,
          status: 503,
          json: async () => ({}),
        } as Response);
      }

      assert.match(url, /^https:\/\/router\.project-osrm\.org\/route\/v1\/driving/);
      osrmCalls += 1;

      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => createOsrmResponse(),
      } as Response);
    }) as typeof fetch;

    try {
      const result = await new BRouterProvider().generateRoutes(createRequest());

      assert.equal(result.options.length, 3);
      assert.equal(result.options.every((option) => option.provider === "osrm"), true);
      assert.equal(osrmCalls, 3);
    } finally {
      globalThis.fetch = originalFetch;
    }
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

function createRequest(): RouteRequest {
  return {
    id: "request-test",
    createdAt: "2026-04-28T00:00:00.000Z",
    routeType: "road",
    targetDistanceKm: 10,
    useElevationConstraint: false,
    elevationGainMin: 100,
    elevationGainMax: 700,
    startLocation: {
      source: "coordinates",
      label: "Annecy, France",
      coordinate: { lat: 45.8992, lng: 6.1294 },
    },
    preferences: {
      shape: "loop",
      avoidOutAndBack: false,
      avoidMainRoads: false,
      difficulty: "endurance",
      waypoints: [],
      avoidZones: [],
    },
  };
}

function createBRouterGeoJson() {
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        geometry: {
          type: "LineString",
          coordinates: createLoopGeometry().map((point, index) => [
            point.lng,
            point.lat,
            430 + Math.round(Math.sin((index / 40) * Math.PI * 2) * 90),
          ]),
        },
        properties: {
          "track-length": 10000,
          "total-time": 1800,
          "plain-ascend": 420,
        },
      },
    ],
  };
}

function createOsrmResponse() {
  return {
    code: "Ok",
    routes: [
      {
        distance: 10000,
        duration: 1800,
        geometry: {
          type: "LineString",
          coordinates: createLoopGeometry().map((point) => [point.lng, point.lat]),
        },
      },
    ],
  };
}

function createLoopGeometry(): LatLng[] {
  const center = { lat: 45.8992, lng: 6.1294 };
  const radius = 0.015;
  const points = Array.from({ length: 40 }, (_, index) => {
    const angle = (index / 40) * Math.PI * 2;

    return {
      lat: center.lat + Math.sin(angle) * radius,
      lng: center.lng + Math.cos(angle) * radius,
    };
  });

  return [...points, points[0]];
}
