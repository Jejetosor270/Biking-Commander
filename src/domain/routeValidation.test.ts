import assert from "node:assert/strict";
import type { RouteOption, RouteRequest } from "./types";
import {
  hasOutAndBackHeuristic,
  isDistanceWithinTolerance,
  isElevationGainWithinRange,
  isLoopRoute,
  relaxSoftPreferences,
  selectClosestElevationAlternatives,
  validateElevationConstraintInput,
  validateRouteOption,
} from "./routeValidation";

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

describe("route validation", () => {
  it("accepts distance inside the 10 percent tolerance", () => {
    assert.equal(isDistanceWithinTolerance(54, 60), true);
    assert.equal(isDistanceWithinTolerance(66, 60), true);
    assert.equal(isDistanceWithinTolerance(67, 60), false);
  });

  it("validates elevation gain inside the selected range", () => {
    assert.equal(isElevationGainWithinRange(900, 500, 1200), true);
    assert.equal(isElevationGainWithinRange(450, 500, 1200), false);
    assert.equal(isElevationGainWithinRange(1250, 500, 1200), false);
  });

  it("validates D+ constraint input only when enabled", () => {
    assert.equal(
      validateElevationConstraintInput({
        useElevationConstraint: false,
      }).valid,
      true,
    );
    assert.equal(
      validateElevationConstraintInput({
        useElevationConstraint: true,
      }).valid,
      false,
    );
    assert.equal(
      validateElevationConstraintInput({
        useElevationConstraint: true,
        elevationGainMin: -1,
        elevationGainMax: 1000,
      }).message,
      "Min D+ must be 0 or higher.",
    );
    assert.equal(
      validateElevationConstraintInput({
        useElevationConstraint: true,
        elevationGainMin: 1000,
        elevationGainMax: 1000,
      }).message,
      "Max D+ must be greater than min D+.",
    );
  });

  it("validates loop closure", () => {
    assert.equal(isLoopRoute(loopGeometry()), true);
    assert.equal(isLoopRoute(pointToPointGeometry()), false);
  });

  it("detects obvious out-and-back geometry", () => {
    assert.equal(hasOutAndBackHeuristic(outAndBackGeometry()), true);
    assert.equal(hasOutAndBackHeuristic(loopGeometry()), false);
  });

  it("validates a full route option against hard constraints", () => {
    const request = createRequest();
    const validOption = createRouteOption({
      distanceKm: 60,
      elevationGainM: 900,
      geometry: loopGeometry(),
    });
    const invalidOption = createRouteOption({
      distanceKm: 74,
      elevationGainM: 1300,
      geometry: pointToPointGeometry(),
    });

    assert.equal(validateRouteOption(request, validOption).accepted, true);
    assert.equal(validateRouteOption(request, invalidOption).accepted, false);
    assert.deepEqual(validateRouteOption(request, invalidOption).violations, [
      "Distance is outside the 10% target range.",
      "Elevation gain is outside the selected range.",
      "Loop route does not finish near its start.",
    ]);
  });

  it("skips D+ validation when the D+ constraint is off", () => {
    const request = createRequest({ useElevationConstraint: false });
    const option = createRouteOption({
      distanceKm: 60,
      elevationGainM: 5000,
      geometry: loopGeometry(),
    });
    const validation = validateRouteOption(request, option);

    assert.equal(validation.accepted, true);
    assert.equal(validation.checks.elevationWithinRange, true);
    assert.deepEqual(validation.violations, []);
  });

  it("flags D+ mismatch when the D+ constraint is on", () => {
    const request = createRequest({ useElevationConstraint: true });
    const option = createRouteOption({
      distanceKm: 60,
      elevationGainM: 5000,
      geometry: loopGeometry(),
    });
    const validation = validateRouteOption(request, option);

    assert.equal(validation.accepted, false);
    assert.deepEqual(validation.violations, [
      "Elevation gain is outside the selected range.",
    ]);
  });

  it("returns closest alternatives when only the D+ constraint misses", () => {
    const request = createRequest({
      useElevationConstraint: true,
      elevationGainMin: 700,
      elevationGainMax: 900,
    });
    const alternatives = selectClosestElevationAlternatives(request, [
      createRouteOption({
        distanceKm: 60,
        elevationGainM: 1200,
        geometry: loopGeometry(),
      }),
      createRouteOption({
        distanceKm: 60,
        elevationGainM: 650,
        geometry: loopGeometry(),
      }),
    ]);

    assert.equal(alternatives.length, 2);
    assert.equal(alternatives[0].elevationGainM, 650);
    assert.equal(alternatives[0].relaxedConstraints[0].constraint, "elevationRange");
  });

  it("rejects ferry routes when ferries are not allowed", () => {
    const request = createRequest({
      preferences: {
        ...createRequest().preferences,
        allowFerries: false,
      },
    });
    const validation = validateRouteOption(
      request,
      createRouteOption({
        distanceKm: 60,
        elevationGainM: 900,
        geometry: loopGeometry(),
        transportSegments: [
          {
            kind: "ferry",
            description: "Ferry crossing detected in routing metadata.",
            tags: { route: "ferry" },
          },
        ],
      }),
    );

    assert.equal(validation.accepted, false);
    assert.equal(validation.checks.avoidsFerries, false);
    assert.match(validation.violations.join(" "), /ferry_detected/);
  });

  it("permits ferry routes when ferries are explicitly allowed", () => {
    const request = createRequest({
      preferences: {
        ...createRequest().preferences,
        allowFerries: true,
      },
    });
    const validation = validateRouteOption(
      request,
      createRouteOption({
        distanceKm: 60,
        elevationGainM: 900,
        geometry: loopGeometry(),
        transportSegments: [
          {
            kind: "ferry",
            description: "Ferry crossing detected in routing metadata.",
            tags: { route: "ferry" },
          },
        ],
      }),
    );

    assert.equal(validation.accepted, true);
    assert.equal(validation.checks.avoidsFerries, true);
  });

  it("relaxes avoid-main-roads as a soft preference only", () => {
    const request = createRequest();
    const result = relaxSoftPreferences(request, ["avoidMainRoads"]);

    assert.equal(result.request.preferences.avoidMainRoads, false);
    assert.equal(result.request.targetDistanceKm, request.targetDistanceKm);
    assert.equal(result.request.elevationGainMin, request.elevationGainMin);
    assert.equal(result.relaxedConstraints.length, 1);
    assert.equal(result.relaxedConstraints[0].constraint, "avoidMainRoads");
  });
});

function createRequest(patch: Partial<RouteRequest> = {}): RouteRequest {
  return {
    id: "request-test",
    createdAt: "2026-04-28T00:00:00.000Z",
    planningMode: "experimental_auto_loop",
    routeType: "road",
    targetDistanceKm: 60,
    useElevationConstraint: true,
    elevationGainMin: 500,
    elevationGainMax: 1200,
    startLocation: {
      source: "address",
      label: "Annecy, France",
    },
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

function createRouteOption(
  patch: Pick<RouteOption, "distanceKm" | "elevationGainM" | "geometry"> &
    Partial<RouteOption>,
): RouteOption {
  return {
    id: "route-test",
    requestId: "request-test",
    name: "Validation route",
    provider: "test",
    generatedAt: "2026-04-28T00:00:00.000Z",
    routeType: "road",
    shape: "loop",
    estimatedDurationMinutes: 180,
    surfaceBreakdown: [],
    elevationProfile: {
      points: [],
      minElevationM: 300,
      maxElevationM: 900,
      ascentM: patch.elevationGainM,
      descentM: patch.elevationGainM,
    },
    score: {
      safety: 80,
      scenery: 80,
      trafficExposure: 20,
      climbDifficulty: 80,
      overall: 82,
    },
    waypoints: [],
    relaxedConstraints: [],
    summary: "Test route",
    ...patch,
  };
}

function loopGeometry() {
  return [
    { lat: 46, lng: 6 },
    { lat: 46.01, lng: 6 },
    { lat: 46.01, lng: 6.01 },
    { lat: 46, lng: 6.01 },
    { lat: 46, lng: 6 },
  ];
}

function pointToPointGeometry() {
  return [
    { lat: 46, lng: 6 },
    { lat: 46.02, lng: 6.02 },
    { lat: 46.04, lng: 6.04 },
  ];
}

function outAndBackGeometry() {
  return [
    { lat: 46, lng: 6 },
    { lat: 46.01, lng: 6 },
    { lat: 46.02, lng: 6 },
    { lat: 46.01, lng: 6 },
    { lat: 46, lng: 6 },
  ];
}
