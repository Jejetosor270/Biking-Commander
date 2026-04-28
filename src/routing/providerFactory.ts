import { createRoutingProviderFromEnv } from "./routingProviderConfig";
import type { RoutingProvider } from "./RoutingProvider";

export function createRoutingProvider(): RoutingProvider {
  return createRoutingProviderFromEnv(import.meta.env);
}
