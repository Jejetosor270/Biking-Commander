import assert from "node:assert/strict";
import type { LatLng } from "./types";
import {
  resolveRoutedDistanceKm,
  validateRoutedGeometry,
} from "./routeGeometry";

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

describe("routed geometry validation", () => {
  it("accepts dense provider geometry", () => {
    const result = validateRoutedGeometry(denseGeometry(), {
      distanceKm: 60,
      controlPointCount: 3,
    });

    assert.equal(result.accepted, true);
    assert.equal(result.violations.length, 0);
  });

  it("rejects geometry made only from request control points", () => {
    const result = validateRoutedGeometry(controlPointGeometry(), {
      distanceKm: 60,
      controlPointCount: 3,
    });

    assert.equal(result.accepted, false);
    assert.equal(
      result.violations.some((violation) => violation.includes("control points")),
      true,
    );
  });

  it("rejects suspicious long straight route segments", () => {
    const result = validateRoutedGeometry(longSegmentGeometry(), {
      distanceKm: 35,
      controlPointCount: 2,
    });

    assert.equal(result.accepted, false);
    assert.equal(
      result.violations.some((violation) => violation.includes("suspiciously long")),
      true,
    );
  });

  it("uses provider distance before measured fallback distance", () => {
    const providerDistanceKm = resolveRoutedDistanceKm(denseGeometry(), 62432);
    const measuredDistanceKm = resolveRoutedDistanceKm(denseGeometry());

    assert.equal(providerDistanceKm, 62.4);
    assert.notEqual(providerDistanceKm, measuredDistanceKm);
  });
});

function denseGeometry(): LatLng[] {
  return Array.from({ length: 40 }, (_, index) => {
    const progress = index / 39;

    return {
      lat: 45.9 + progress * 0.16 + Math.sin(progress * Math.PI * 6) * 0.004,
      lng: 6.12 + progress * 0.2 + Math.cos(progress * Math.PI * 5) * 0.004,
      elevationM: 420 + Math.round(Math.sin(progress * Math.PI) * 250),
    };
  });
}

function controlPointGeometry(): LatLng[] {
  return [
    { lat: 45.9, lng: 6.12 },
    { lat: 46.1, lng: 6.32 },
    { lat: 46.3, lng: 6.52 },
  ];
}

function longSegmentGeometry(): LatLng[] {
  const shortRun = Array.from({ length: 12 }, (_, index) => ({
    lat: 45.9 + index * 0.001,
    lng: 6.12 + index * 0.001,
  }));

  return [...shortRun, { lat: 46.3, lng: 6.7 }];
}
