import { BRouterProvider } from "./bRouterProvider";
import { MockRoutingProvider } from "./mockRoutingProvider";
import {
  resolveRoutingConfig,
  type RoutingConfigEnv,
  type RoutingRuntimeConfig,
} from "./routingConfig";
import type { RoutingProvider } from "./RoutingProvider";

export function createRoutingProviderFromEnv(
  env: RoutingConfigEnv,
): RoutingProvider {
  return createRoutingProviderFromConfig(resolveRoutingConfig(env));
}

export function createRoutingProviderFromConfig(
  config: RoutingRuntimeConfig,
): RoutingProvider {
  if (config.provider === "mock") {
    return new MockRoutingProvider();
  }

  return new BRouterProvider(config.isDevelopment);
}
