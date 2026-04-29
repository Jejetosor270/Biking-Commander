# Biking Commander Product and Technical Plan

## Product Goal

Biking Commander is a no-account route-generation web app for cyclists in France and Switzerland. The MVP focuses on reliable manual waypoint route building plus experimental automatic loop generation for road-bike or trail / mountain-bike routes, with distance, elevation, safety, scenery, traffic exposure, climb difficulty, scoring, GPX export, local favorites, and local history.

## MVP Scope

- Reliable Mode: manually build one snapped route through user-selected waypoints.
- Experimental Auto-Loop Mode: generate many loop candidates and keep the best three route options.
- Support road and mountain-bike modes.
- Support map click, current location, and address-based starts.
- Keep generated options inside a 10% target-distance tolerance.
- Optionally enforce the selected elevation-gain range when the user enables the D+ constraint.
- Treat avoid-main-roads as a soft preference that can be relaxed if no route is available.
- Treat avoid-out-and-back as a validation heuristic.
- Avoid ferries and non-road transport links by default; allow them only when the user explicitly enables ferries.
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
  reliableRouteBuilder.ts
                    Manual waypoint planning and segment failure reporting
  autoLoopGenerator.ts
                    Candidate loop generation and provider routing
  routeScoring.ts   Experimental candidate ranking
  services/         GPX export and local storage
```

## Reliable Route Flow

1. User selects Reliable Mode, route type, start location, and manual map waypoints.
2. UI builds a `RouteRequest`.
3. `reliableRouteBuilder` routes each segment so the UI can report which segment failed.
4. The full waypoint list is routed through the provider and rendered from provider geometry only.
5. If a segment uses a ferry while ferries are disabled, the route is rejected and the UI suggests adding an intermediate waypoint or enabling ferries.
6. The user reviews live stats, saves locally, and exports GPX.

## Experimental Auto-Loop Flow

1. User selects Experimental Auto-Loop, start, route type, distance, optional D+ constraint, and preferences.
2. `autoLoopGenerator` creates at least 20 candidate triangle, diamond, and lollipop loop shapes.
3. The routing provider snaps each candidate to real mapped roads/trails.
4. Route validation rejects straight-line geometry, distance misses, D+ misses when active, out-and-back misses, and ferry routes when ferries are disabled.
5. `routeScoring` ranks successful candidates by distance closeness, optional D+ closeness, out-and-back overlap, main-road exposure, route type suitability, surface quality, and diversity.
6. The best three successful routes are returned. If exact constraints fail, closest non-ferry alternatives are shown with relaxed-constraint notices.
7. If only ferry-based routes are found, the UI says: "Only ferry-based routes were found. Try changing your start/finish or enable ferries."

## Data Strategy

- Map tiles: OpenStreetMap raster tiles through Leaflet for the MVP.
- Real routing: BRouter public server without an API key, using `fastbike` for road rides and `mtb` for trail / MTB rides.
- Fallback routing: OSRM public demo server is tried when BRouter cannot return a candidate route.
- Ferry detection: provider metadata is scanned for OSM-style `route=ferry`, `ferry=*`, and transport-like service tags. OSRM is treated conservatively because ferry avoidance is not assumed.
- Mock routing: deterministic, API-key-free, France / Switzerland-centered geometry generation, enabled only with `VITE_ROUTING_PROVIDER=mock` and labeled visibly in the UI.
- Geocoding: mock deterministic resolver by default, with a swappable service boundary for a production geocoder.

## Future Scale Points

- Replace localStorage with IndexedDB for larger route libraries.
- Add a backend broker for caching, quotas, and observability if public routing volume grows.
- Add provider adapters for GraphHopper, Valhalla, or self-hosted BRouter/OSRM.
- Add weather and wind overlays as map layer providers.
- Add offline route packs with service worker and cached tiles where licensing permits.
- Add Garmin, Wahoo, Komoot, and Strava exporters as integration services.
