# Biking Commander Product and Technical Plan

## Product Goal

Biking Commander is a no-account route-generation web app for cyclists in France and Switzerland. The MVP focuses on generating and comparing three road-bike or trail / mountain-bike routes with distance, elevation, shape, safety, scenery, traffic exposure, climb difficulty, scoring, GPX export, local favorites, and local history.

## MVP Scope

- Generate three route options for each request.
- Support road and mountain-bike modes.
- Support loop, point-to-point, current-location loop, and current-location-to-destination shapes.
- Keep generated options inside a 10% target-distance tolerance.
- Optionally enforce the selected elevation-gain range when the user enables the D+ constraint.
- Treat avoid-main-roads as a soft preference that can be relaxed if no route is available.
- Treat avoid-out-and-back as a validation heuristic.
- Store favorites and route history in browser local storage.
- Export GPX now; keep FIT and TCX behind the same export surface for later.
- Add placeholders for weather, wind, offline support, Garmin, Wahoo, Komoot, and Strava.

## Stack Choice

- Vite + React + TypeScript: fast local development, component-based UI, strong type safety, and a low-friction path to future routing/state libraries.
- Leaflet + React Leaflet: proven OSM-compatible map rendering with simple tile, polyline, polygon, and click interactions.
- TypeScript + Node test runner: quick unit tests for route validation and soft-preference behavior without a browser runtime.
- Browser localStorage: local-first MVP storage with clear upgrade paths to IndexedDB or server sync.
- BRouter adapter: OSM-based routing, cycling profiles, GeoJSON route geometry, and no API key. The UI depends on a generic routing provider contract so other no-key or proxied routing engines can be added later.

## Architecture

```text
src/
  components/       UI components for forms, map, cards, charts, storage
  domain/           RouteRequest, RouteOption, validation, scoring
  routing/          Provider contract, mock provider, BRouter adapter, OSRM fallback
  services/         GPX export and local storage
```

## Route Generation Flow

1. User configures route type, location shape, distance, elevation, preferences, waypoints, and avoid zones.
2. UI builds a `RouteRequest`.
3. The active routing provider generates three `RouteOption` values.
4. Real providers validate that returned geometry is dense routed geometry, not request control points or suspicious long straight segments.
5. Validation checks distance tolerance, optional elevation range, loop closure, and out-and-back heuristics.
6. If the D+ constraint is enabled and no route fits the range, closest alternatives can be returned with a D+ mismatch notice.
7. If no options pass and only soft constraints are blocking, the provider may relax avoid-main-roads and report that relaxation.
8. The user compares routes, saves favorites, and exports GPX.

## Data Strategy

- Map tiles: OpenStreetMap raster tiles through Leaflet for the MVP.
- Real routing: BRouter public server without an API key, using `fastbike` for road rides and `mtb` for trail / MTB rides.
- Fallback routing: OSRM public demo server is tried when BRouter cannot return a candidate route.
- Mock routing: deterministic, API-key-free, France / Switzerland-centered geometry generation, enabled only with `VITE_ROUTING_PROVIDER=mock` and labeled visibly in the UI.
- Geocoding: mock deterministic resolver by default, with a swappable service boundary for a production geocoder.

## Future Scale Points

- Replace localStorage with IndexedDB for larger route libraries.
- Add a backend broker for caching, quotas, and observability if public routing volume grows.
- Add provider adapters for GraphHopper, Valhalla, or self-hosted BRouter/OSRM.
- Add weather and wind overlays as map layer providers.
- Add offline route packs with service worker and cached tiles where licensing permits.
- Add Garmin, Wahoo, Komoot, and Strava exporters as integration services.
