import assert from "node:assert/strict";
import { createRoutingProviderFromEnv } from "./routingProviderConfig";

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
  console.log("routing provider configuration");

  await it("uses BRouter by default without an API key", () => {
    const provider = createRoutingProviderFromEnv({});

    assert.equal(provider.id, "brouter");
    assert.equal(provider.mode, "real");
    assert.equal(provider.label, "BRouter");
  });

  await it("keeps mock routing only when explicitly selected", () => {
    const provider = createRoutingProviderFromEnv({
      VITE_ROUTING_PROVIDER: "mock",
    });

    assert.equal(provider.id, "mock");
    assert.equal(provider.mode, "mock");
    assert.equal(provider.label, "Mock route engine");
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
