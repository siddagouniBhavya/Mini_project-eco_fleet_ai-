
"use client";

import { Fragment, useEffect, useMemo } from "react";
import {
  CircleMarker,
  MapContainer,
  Polyline,
  TileLayer,
  Tooltip,
  useMap,
} from "react-leaflet";
import L from "leaflet";

type PortInfo = {
  code?: string;
  name?: string;
  latitude?: number;
  longitude?: number;
};

export type ShipmentRoute = {
  id: string;
  label: string;
  coordinates: number[][];
  origin?: PortInfo;
  destination?: PortInfo;
};

type RouteMapProps = {
  coordinates?: number[][];
  origin?: PortInfo;
  destination?: PortInfo;
  routes?: ShipmentRoute[];
};

const ROUTE_COLORS = [
  "#087eaa",
  "#e87932",
  "#7c3aed",
  "#16a34a",
  "#db2777",
  "#ca8a04",
  "#0891b2",
  "#dc2626",
];

function FitRoute({
  positions,
}: {
  positions: L.LatLngExpression[];
}) {
  const map = useMap();

  useEffect(() => {
    if (!positions.length) return;

    const bounds = L.latLngBounds(positions);

    if (bounds.isValid()) {
      map.fitBounds(bounds, {
        padding: [32, 32],
        maxZoom: 6,
      });
    }
  }, [map, positions]);

  return null;
}

function validPositions(
  coordinates: number[][],
): L.LatLngExpression[] {
  return coordinates
    .filter(
      (point) =>
        Array.isArray(point) &&
        point.length >= 2 &&
        Number.isFinite(point[0]) &&
        Number.isFinite(point[1]) &&
        Math.abs(point[0]) <= 180 &&
        Math.abs(point[1]) <= 90,
    )
    .map(([longitude, latitude]) => [latitude, longitude]);
}

export default function RouteMap({
  coordinates = [],
  origin,
  destination,
  routes = [],
}: RouteMapProps) {
  const displayRoutes = useMemo<ShipmentRoute[]>(() => {
    if (routes.length > 0) return routes;

    if (coordinates.length > 0) {
      return [
        {
          id: "route-1",
          label: "Shipment 1",
          coordinates,
          origin,
          destination,
        },
      ];
    }

    return [];
  }, [routes, coordinates, origin, destination]);

  const preparedRoutes = useMemo(
    () =>
      displayRoutes
        .map((route, index) => ({
          ...route,
          color: ROUTE_COLORS[index % ROUTE_COLORS.length],
          positions: validPositions(route.coordinates || []),
        }))
        .filter((route) => route.positions.length >= 2),
    [displayRoutes],
  );

  const allPositions = useMemo(
    () => preparedRoutes.flatMap((route) => route.positions),
    [preparedRoutes],
  );

  const mapKey = useMemo(
    () => preparedRoutes.map((route) => route.id).join("|") || "empty",
    [preparedRoutes],
  );

  if (preparedRoutes.length === 0) {
    return (
      <div className="flex h-[360px] items-center justify-center rounded-xl border border-dashed border-sky-200 bg-sky-50 p-6 text-center text-sm text-slate-500">
        The API did not return enough route coordinates to draw a map.
      </div>
    );
  }

  return (
    <div className="relative z-0 h-[360px] overflow-hidden rounded-xl border border-sky-100">
      <MapContainer
        key={mapKey}
        center={allPositions[0]}
        zoom={4}
        scrollWheelZoom
        style={{
          height: "100%",
          width: "100%",
          background: "#eaf5fb",
        }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {preparedRoutes.map((route) => {
          const start: [number, number] =
            route.origin?.latitude != null &&
            route.origin?.longitude != null
              ? [route.origin.latitude, route.origin.longitude]
              : (route.positions[0] as [number, number]);

          const end: [number, number] =
            route.destination?.latitude != null &&
            route.destination?.longitude != null
              ? [route.destination.latitude, route.destination.longitude]
              : (route.positions[
                  route.positions.length - 1
                ] as [number, number]);

          return (
            <Fragment key={route.id}>
              <Polyline
                positions={route.positions}
                pathOptions={{
                  color: route.color,
                  weight: 4,
                  opacity: 0.9,
                }}
              >
                <Tooltip sticky>
                  <strong>{route.label}</strong>
                  <br />
                  {route.origin?.code || "Origin"} →{" "}
                  {route.destination?.code || "Destination"}
                </Tooltip>
              </Polyline>

              <CircleMarker
                center={start}
                radius={6}
                pathOptions={{
                  color: "#ffffff",
                  weight: 2,
                  fillColor: route.color,
                  fillOpacity: 1,
                }}
              >
                <Tooltip direction="top">
                  <strong>{route.label} · Origin</strong>
                  <br />
                  {route.origin?.code || "Route start"}
                  {route.origin?.name
                    ? ` · ${route.origin.name}`
                    : ""}
                </Tooltip>
              </CircleMarker>

              <CircleMarker
                center={end}
                radius={6}
                pathOptions={{
                  color: "#ffffff",
                  weight: 2,
                  fillColor: route.color,
                  fillOpacity: 1,
                }}
              >
                <Tooltip direction="top">
                  <strong>{route.label} · Destination</strong>
                  <br />
                  {route.destination?.code || "Route end"}
                  {route.destination?.name
                    ? ` · ${route.destination.name}`
                    : ""}
                </Tooltip>
              </CircleMarker>
            </Fragment>
          );
        })}

        <FitRoute positions={allPositions} />
      </MapContainer>

      {preparedRoutes.length > 1 && (
        <div className="absolute bottom-3 left-3 z-[1000] max-h-32 max-w-[85%] overflow-y-auto rounded-lg border border-slate-200 bg-white/95 p-2.5 shadow-md">
          <p className="mb-1.5 text-xs font-semibold text-slate-700">
            Shipment routes
          </p>

          <div className="space-y-1.5">
            {preparedRoutes.map((route) => (
              <div
                key={route.id}
                className="flex items-center gap-2 text-xs text-slate-700"
              >
                <span
                  className="h-1 w-5 shrink-0 rounded-full"
                  style={{ backgroundColor: route.color }}
                />
                <span className="truncate">
                  {route.label}: {route.origin?.code || "Origin"} →{" "}
                  {route.destination?.code || "Destination"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
