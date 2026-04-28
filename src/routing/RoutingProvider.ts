import type { RouteGenerationResult, RouteRequest } from "../domain/types";

export type RoutingProviderMode = "mock" | "real";

export interface RoutingProvider {
  id: string;
  label: string;
  mode: RoutingProviderMode;
  generateRoutes(request: RouteRequest): Promise<RouteGenerationResult>;
}

export class RoutingProviderError extends Error {
  constructor(
    message: string,
    public readonly diagnostics: string[] = [],
  ) {
    super(message);
    this.name = "RoutingProviderError";
  }
}
