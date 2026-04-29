import {
  CircleMarker,
  MapContainer,
  Marker,
  Polygon,
  Polyline,
  TileLayer,
  Tooltip,
  useMap,
  useMapEvents,
} from "react-leaflet";
import { useEffect } from "react";
import type {
  AvoidZone,
  LatLng,
  RouteOption,
  RoutePlanningMode,
  Waypoint,
} from "../domain/types";
import { createSquareAvoidZone, FRANCE_SWITZERLAND_CENTER } from "../domain/geo";
import {
  getRenderableRouteGeometry,
  routeModeBadgeLabel,
} from "../domain/routeGeometry";

interface RouteMapProps {
  routes: RouteOption[];
  selectedRoute?: RouteOption;
  avoidZones: AvoidZone[];
  drawAvoidZones: boolean;
  onAddAvoidZone: (zone: AvoidZone) => void;
  planningMode: RoutePlanningMode;
  manualWaypoints: Waypoint[];
  onAddPlanningPoint: (point: LatLng) => void;
  onMovePlanningWaypoint: (waypointId: string, point: LatLng) => void;
}

export function RouteMap({
  routes,
  selectedRoute,
  avoidZones,
  drawAvoidZones,
  onAddAvoidZone,
  planningMode,
  manualWaypoints,
  onAddPlanningPoint,
  onMovePlanningWaypoint,
}: RouteMapProps) {
  const previewRoute = selectedRoute ?? routes[0];
  const routeBadge = previewRoute ? routeModeBadgeLabel(previewRoute) : null;
  const selectedGeometry = selectedRoute
    ? getRenderableRouteGeometry(selectedRoute)
    : [];

  return (
    <div className="map-shell">
      <MapContainer
        center={[FRANCE_SWITZERLAND_CENTER.lat, FRANCE_SWITZERLAND_CENTER.lng]}
        zoom={8}
        scrollWheelZoom
        className="route-map"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapClickHandler
          drawAvoidZones={drawAvoidZones}
          planningMode={planningMode}
          onAddAvoidZone={onAddAvoidZone}
          onAddPlanningPoint={onAddPlanningPoint}
        />
        <FitSelectedRoute selectedRoute={selectedRoute} />

        {routes.map((route) => (
          <Polyline
            key={route.id}
            positions={toLeafletPath(getRenderableRouteGeometry(route))}
            pathOptions={{
              color: route.id === selectedRoute?.id ? "#2f6f67" : "#718096",
              weight: route.id === selectedRoute?.id ? 6 : 3,
              opacity: route.id === selectedRoute?.id ? 0.95 : 0.5,
            }}
          >
            <Tooltip>{route.name}</Tooltip>
          </Polyline>
        ))}

        {selectedGeometry[0] ? (
          <CircleMarker
            center={toLeafletPoint(selectedGeometry[0])}
            radius={7}
            pathOptions={{ color: "#f2a541", fillColor: "#f2a541", fillOpacity: 1 }}
          >
            <Tooltip>Start</Tooltip>
          </CircleMarker>
        ) : null}

        {selectedGeometry[selectedGeometry.length - 1] ? (
          <CircleMarker
            center={toLeafletPoint(
              selectedGeometry[selectedGeometry.length - 1],
            )}
            radius={7}
            pathOptions={{ color: "#3158a6", fillColor: "#3158a6", fillOpacity: 1 }}
          >
            <Tooltip>Finish</Tooltip>
          </CircleMarker>
        ) : null}

        {avoidZones.map((zone) => (
          <Polygon
            key={zone.id}
            positions={toLeafletPath(zone.polygon)}
            pathOptions={{
              color: "#d95d39",
              fillColor: "#d95d39",
              fillOpacity: 0.18,
              weight: 2,
            }}
          >
            <Tooltip>{zone.label}</Tooltip>
          </Polygon>
        ))}

        {planningMode === "reliable"
          ? manualWaypoints.map((waypoint) =>
              waypoint.coordinate ? (
                <Marker
                  key={waypoint.id}
                  position={toLeafletPoint(waypoint.coordinate)}
                  draggable
                  eventHandlers={{
                    dragend(event) {
                      const marker = event.target;
                      const next = marker.getLatLng();
                      onMovePlanningWaypoint(waypoint.id, {
                        lat: next.lat,
                        lng: next.lng,
                      });
                    },
                  }}
                >
                  <Tooltip>{waypoint.label}</Tooltip>
                </Marker>
              ) : null,
            )
          : null}
      </MapContainer>
      <div className="map-status">
        <span>
          {routeBadge ??
            (drawAvoidZones ? "Avoid zone mode on" : "OSM cycling preview")}
        </span>
      </div>
    </div>
  );
}

function MapClickHandler({
  drawAvoidZones,
  planningMode,
  onAddAvoidZone,
  onAddPlanningPoint,
}: {
  drawAvoidZones: boolean;
  planningMode: RoutePlanningMode;
  onAddAvoidZone: (zone: AvoidZone) => void;
  onAddPlanningPoint: (point: LatLng) => void;
}) {
  useMapEvents({
    click(event) {
      if (drawAvoidZones) {
        onAddAvoidZone(
          createSquareAvoidZone(
            { lat: event.latlng.lat, lng: event.latlng.lng },
            `Avoid zone ${new Date().toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}`,
          ),
        );
        return;
      }

      if (planningMode === "reliable") {
        onAddPlanningPoint({
          lat: event.latlng.lat,
          lng: event.latlng.lng,
        });
      }
    },
  });

  return null;
}

function FitSelectedRoute({ selectedRoute }: { selectedRoute?: RouteOption }) {
  const map = useMap();

  useEffect(() => {
    const geometry = selectedRoute
      ? getRenderableRouteGeometry(selectedRoute)
      : [];

    if (!geometry.length) {
      return;
    }

    map.fitBounds(toLeafletPath(geometry), {
      padding: [28, 28],
      maxZoom: 13,
    });
  }, [map, selectedRoute]);

  return null;
}

function toLeafletPath(points: LatLng[]): [number, number][] {
  return points.map((point) => [point.lat, point.lng]);
}

function toLeafletPoint(point: LatLng): [number, number] {
  return [point.lat, point.lng];
}
