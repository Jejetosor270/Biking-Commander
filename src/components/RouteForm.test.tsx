import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import type { RouteRequest } from "../domain/types";
import { RouteForm } from "./RouteForm";

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

describe("RouteForm elevation constraint UI", () => {
  it("hides D+ range fields when the D+ constraint is off", () => {
    const markup = renderToStaticMarkup(
      <RouteForm {...createProps(createRequest({ useElevationConstraint: false }))} />,
    );

    assert.match(markup, /Use D\+ constraint/);
    assert.doesNotMatch(markup, /Min D\+/);
    assert.doesNotMatch(markup, /Max D\+/);
  });

  it("requires D+ range fields when the D+ constraint is on", () => {
    const markup = renderToStaticMarkup(
      <RouteForm
        {...createProps(
          createRequest({
            useElevationConstraint: true,
            elevationGainMin: undefined,
            elevationGainMax: undefined,
          }),
        )}
      />,
    );

    assert.match(markup, /Min D\+/);
    assert.match(markup, /Max D\+/);
    assert.equal(markup.match(/required=""/g)?.length, 2);
  });
});

function createProps(request: RouteRequest) {
  return {
    request,
    providerLabel: "BRouter",
    isDevelopment: false,
    status: "idle" as const,
    drawAvoidZones: false,
    onRequestChange: () => undefined,
    onGenerate: () => undefined,
    onSurprise: () => undefined,
    onDrawAvoidZonesChange: () => undefined,
    onRemoveAvoidZone: () => undefined,
  };
}

function createRequest(patch: Partial<RouteRequest> = {}): RouteRequest {
  return {
    id: "request-test",
    createdAt: "2026-04-28T00:00:00.000Z",
    routeType: "road",
    targetDistanceKm: 60,
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
    ...patch,
  };
}
