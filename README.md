# Biking Commander

A route-generation web app for road and mountain-bike routes in France and Switzerland. The MVP uses a swappable routing-provider abstraction with OpenStreetMap-based routing for real route generation and an explicit mock mode for UI development.

## Why This Stack

Biking Commander uses Vite, React, and TypeScript for a scalable component-based frontend with fast iteration. Leaflet renders OpenStreetMap-compatible maps. Routing logic is separated from the UI through a provider interface, with BRouter enabled by default and mock routing available only when explicitly selected.

## Setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open the local URL printed by Vite.

## Environment

```bash
VITE_ROUTING_PROVIDER=brouter
VITE_GEOCODING_PROVIDER=mock
```

## Route Planning Modes

Biking Commander now separates route planning into two modes:

- Reliable Mode is the default. Add a start point and manual waypoints on the map, then build a route that snaps through those waypoints on mapped roads/trails.
- Experimental Auto-Loop generates route ideas automatically. It creates many loop candidates, routes each one through the provider, scores successful routes, and keeps the best three. Results can vary, and if no candidates work the app recommends Reliable Mode.

Both modes use the same routed geometry for the map, route cards, elevation profile, local saves, and GPX export. Production routing does not fall back to straight-line geometry.

## Routing

Biking Commander uses the public BRouter server for real OSM-based routing. It does not require an API key. Road routes use BRouter's `fastbike` profile, trail / MTB routes use `mtb`, and the provider abstraction still allows swapping providers later.

Configure routing in `.env.local`:

```bash
VITE_ROUTING_PROVIDER=brouter
```

Use mock mode only for local UI development without public routing calls:

```bash
VITE_ROUTING_PROVIDER=mock
```

Troubleshooting:

- If you just changed `.env.local`, restart `npm run dev`.
- If BRouter is temporarily unavailable, the app tries OSRM automatically.
- If both public routing services are unavailable, the UI shows a routing-provider error instead of drawing fake straight lines.
- Ferries are avoided by default. Enable "Allow ferries" only when a ferry crossing is intentional.

## Scripts

```bash
npm run dev       # Start the app
npm run build     # Type-check and build
npm test          # Run unit tests
npm run preview   # Preview the production build
```

## Current MVP Features

- Reliable Mode for manual waypoint route building with snap-to-road/trail routing.
- Experimental Auto-Loop Mode with 20+ candidate loop shapes and best-three ranking.
- Road bike and trail / mountain-bike ride types.
- Distance target with 10% validation.
- Optional elevation-gain range validation with a default-off D+ constraint toggle.
- Avoid out-and-back heuristic.
- Soft avoid-main-roads relaxation reporting.
- Ferry and unsafe transport avoidance by default, with an explicit opt-in toggle.
- Three route alternatives.
- Interactive OSM map preview with route geometry and avoid-zone marking.
- Optional waypoints: cafe, water point, viewpoint, climb, and custom.
- Difficulty presets.
- Route scores, estimated D+, surface breakdown, elevation profile, GPX export.
- Local favorite routes and route history.
- Future placeholders for weather, wind, offline, Garmin, Wahoo, Komoot, and Strava.

## Notes

BRouter is implemented as the real provider adapter, with OSRM as a no-key fallback. Real mode never falls back to mock geometry if public routing fails.
