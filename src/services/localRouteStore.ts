import type { RouteOption } from "../domain/types";

const FAVORITES_KEY = "biking-commander:favorites:v1";
const HISTORY_KEY = "biking-commander:history:v1";
const HISTORY_LIMIT = 24;

export function loadFavoriteRoutes(): RouteOption[] {
  return readRoutes(FAVORITES_KEY);
}

export function saveFavoriteRoute(route: RouteOption): RouteOption[] {
  const existing = loadFavoriteRoutes();
  const next = [route, ...existing.filter((item) => item.id !== route.id)].slice(
    0,
    50,
  );
  writeRoutes(FAVORITES_KEY, next);
  return next;
}

export function removeFavoriteRoute(routeId: string): RouteOption[] {
  const next = loadFavoriteRoutes().filter((route) => route.id !== routeId);
  writeRoutes(FAVORITES_KEY, next);
  return next;
}

export function loadRouteHistory(): RouteOption[] {
  return readRoutes(HISTORY_KEY);
}

export function addRouteHistory(routes: RouteOption[]): RouteOption[] {
  const existing = loadRouteHistory();
  const next = [
    ...routes,
    ...existing.filter(
      (item) => !routes.some((route) => route.id === item.id),
    ),
  ].slice(0, HISTORY_LIMIT);
  writeRoutes(HISTORY_KEY, next);
  return next;
}

export function clearRouteHistory(): RouteOption[] {
  writeRoutes(HISTORY_KEY, []);
  return [];
}

function readRoutes(key: string): RouteOption[] {
  try {
    const raw = window.localStorage.getItem(key);

    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as RouteOption[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeRoutes(key: string, routes: RouteOption[]): void {
  window.localStorage.setItem(key, JSON.stringify(routes));
}
