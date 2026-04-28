export type RoutingProviderId = "brouter" | "mock";

export interface RoutingConfigEnv {
  VITE_ROUTING_PROVIDER?: RoutingProviderId;
  DEV?: boolean;
}

export interface RoutingRuntimeConfig {
  provider: RoutingProviderId;
  isDevelopment: boolean;
}

export function resolveRoutingConfig(env: RoutingConfigEnv): RoutingRuntimeConfig {
  return {
    provider: env.VITE_ROUTING_PROVIDER ?? "brouter",
    isDevelopment: Boolean(env.DEV),
  };
}
