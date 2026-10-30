
"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import Sidebar from "@/components/layout/Sidebar";
import PortAutocomplete from "@/components/voyages/PortAutocomplete";
import Topbar from "@/components/layout/Topbar";
import {
  Activity,
  AlertTriangle,
  Anchor,
  ArrowRight,
  CheckCircle2,
  Clock3,
  LoaderCircle,
  Plus,
  RefreshCw,
  Route,
  Ship,
  Trash2,
  Waves,
} from "lucide-react";
import type { ShipmentRoute } from "@/components/maps/RouteMap";

const RouteMap = dynamic(() => import("@/components/maps/RouteMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[340px] items-center justify-center rounded-xl bg-sky-50 text-sm text-sky-700">
      Loading route map...
    </div>
  ),
});

const API_BASE = (
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000"
).replace(/\/$/, "");

type ShipmentDraft = {
  id: string;
  shipment_ref: string;
  origin_locode: string;
  destination_locode: string;
  cargo_demand_tons: string;
  deadline_hours: string;
};

type Port = {
  code?: string;
  locode?: string;
  name?: string;
  country?: string;
};

type PortInfo = {
  code?: string;
  locode?: string;
  name?: string;
  latitude?: number;
  longitude?: number;
};

type Coordinate = [number, number];

type RouteGeometry = {
  type?: string;
  coordinates?: unknown;
  geometry?: {
    type?: string;
    coordinates?: unknown;
  } | null;
};

type PlanMetrics = {
  travel_time_hours?: number;
  total_fuel_kg?: number;
  total_ghg_kg?: number;
  total_cost?: number;
  feasible?: boolean;
};

type BestPlan = {
  vessel_ids?: string[];
  vessels?: { vessel_id?: string; vessel_name?: string }[];
  speed_strategy?: string;
  metrics?: PlanMetrics;
};

type ShipmentResult = {
  success?: boolean;
  message?: string;
  shipment?: {
    shipment_ref?: string;
    origin?: PortInfo;
    destination?: PortInfo;
    distance_km?: number;
    route_geometry?: RouteGeometry | null;
    geometry?: RouteGeometry | null;
  };
  best_plan?: BestPlan | null;
  route_geometry?: RouteGeometry | null;
  geometry?: RouteGeometry | null;
  route?: unknown;
  coordinates?: unknown;
};

type AllocationAlternative = {
  rank?: number;
  shipments?: ShipmentResult[];
};

type OptimizationResponse = {
  success?: boolean;
  algorithm?: string;
  message?: string;
  batch_runtime_seconds?: number;
  allocation_alternatives?: AllocationAlternative[];
  shipments?: ShipmentResult[];
};

function newShipment(index: number): ShipmentDraft {
  return {
    id: `shipment-${index}`,
    shipment_ref: `VOY-${String(index).padStart(3, "0")}`,
    origin_locode: "",
    destination_locode: "",
    cargo_demand_tons: "",
    deadline_hours: "",
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isLocode(value: string) {
  return /^[A-Z0-9]{5}$/.test(value.trim().toUpperCase());
}

function displayValue(value: unknown, suffix = "") {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `${Number(value.toFixed(2)).toLocaleString("en-IN")}${suffix}`;
}

function formatINR(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `₹${value.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

function isCoordinate(value: unknown): value is Coordinate {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    typeof value[0] === "number" &&
    Number.isFinite(value[0]) &&
    typeof value[1] === "number" &&
    Number.isFinite(value[1]) &&
    Math.abs(value[0]) <= 180 &&
    Math.abs(value[1]) <= 90
  );
}

function normalizeCoordinates(value: unknown): Coordinate[] {
  if (!Array.isArray(value)) return [];

  const coordinates = value.filter(isCoordinate);
  return coordinates.length >= 2 ? coordinates : [];
}

function getGeometryCoordinates(value: unknown): Coordinate[] {
  if (!isRecord(value)) return [];

  const direct = normalizeCoordinates(value.coordinates);
  if (direct.length >= 2) return direct;

  if (isRecord(value.geometry)) {
    const nested = normalizeCoordinates(value.geometry.coordinates);
    if (nested.length >= 2) return nested;
  }

  // Support a GeoJSON FeatureCollection containing LineString features.
  if (value.type === "FeatureCollection" && Array.isArray(value.features)) {
    for (const feature of value.features) {
      const coordinates = getGeometryCoordinates(feature);
      if (coordinates.length >= 2) return coordinates;
    }
  }

  return [];
}

function getShipment(item: ShipmentResult): Record<string, unknown> {
  return isRecord(item.shipment) ? item.shipment : {};
}

function getPortInfo(value: unknown): PortInfo | undefined {
  if (!isRecord(value)) return undefined;

  return {
    code:
      typeof value.code === "string"
        ? value.code
        : typeof value.locode === "string"
          ? value.locode
          : undefined,
    locode: typeof value.locode === "string" ? value.locode : undefined,
    name: typeof value.name === "string" ? value.name : undefined,
    latitude:
      typeof value.latitude === "number" ? value.latitude : undefined,
    longitude:
      typeof value.longitude === "number" ? value.longitude : undefined,
  };
}

/**
 * Read route geometry from all supported response locations.
 */
function getRouteCoordinates(item: ShipmentResult): Coordinate[] {
  const shipment = getShipment(item);

  const candidates = [
    shipment.route_geometry,
    shipment.geometry,
    item.route_geometry,
    item.geometry,
    item.route,
  ];

  for (const candidate of candidates) {
    const coordinates = getGeometryCoordinates(candidate);
    if (coordinates.length >= 2) return coordinates;
  }

  const directCandidates = [
    shipment.coordinates,
    item.coordinates,
  ];

  for (const candidate of directCandidates) {
    const coordinates = normalizeCoordinates(candidate);
    if (coordinates.length >= 2) return coordinates;
  }

  return [];
}

function MetricCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 break-words text-sm font-bold text-slate-800">
        {value}
      </p>
    </div>
  );
}

export default function VoyagePlanningPage() {
  const [active, setActive] = useState("Voyage Planning");
  const [query, setQuery] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notice, setNotice] = useState("");

  const [ports, setPorts] = useState<Port[]>([]);
  const [portsLoading, setPortsLoading] = useState(true);
  const [portsError, setPortsError] = useState("");

  const [shipments, setShipments] = useState<ShipmentDraft[]>([
    newShipment(1),
  ]);

  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState("");
  const [result, setResult] = useState<OptimizationResponse | null>(null);
  const [selectedAlternative, setSelectedAlternative] = useState(0);

  function action(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 3500);
  }

  async function loadPorts() {
    setPortsLoading(true);
    setPortsError("");

    try {
      const response = await fetch(`${API_BASE}/ports`, {
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(`Ports request failed (${response.status})`);
      }

      const data: unknown = await response.json();

      const list = Array.isArray(data)
        ? data
        : isRecord(data) && Array.isArray(data.ports)
          ? data.ports
          : [];

      setPorts(list as Port[]);
    } catch (error) {
      setPortsError(
        error instanceof Error ? error.message : "Could not load ports.",
      );
      setPorts([]);
    } finally {
      setPortsLoading(false);
    }
  }

  useEffect(() => {
    void loadPorts();
  }, []);

  const autocompletePorts = useMemo(() => {
    const byCode = new Map<string, Port>();

    for (const port of ports) {
      const code = String(port.code || port.locode || "").toUpperCase();
      if (code) byCode.set(code, port);
    }

    return [...byCode.values()].map((port) => ({
      code: String(port.code || port.locode || "").toUpperCase(),
      name: String(port.name || ""),
      country: String(port.country || ""),
    }));
  }, [ports]);

  function updateShipment(
    id: string,
    field: keyof Omit<ShipmentDraft, "id">,
    value: string,
  ) {
    setShipments((current) =>
      current.map((item) =>
        item.id === id
          ? {
              ...item,
              [field]:
                field === "origin_locode" ||
                field === "destination_locode"
                  ? value.toUpperCase().slice(0, 5)
                  : value,
            }
          : item,
      ),
    );
  }

  async function planVoyages(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setApiError("");
    setNotice("");
    setResult(null);
    setSelectedAlternative(0);

    if (
      shipments.some(
        (shipment) =>
          !isLocode(shipment.origin_locode) ||
          !isLocode(shipment.destination_locode),
      )
    ) {
      setApiError("Enter a valid five-character origin and destination LOCODE for every shipment.");
      return;
    }

    if (
      shipments.some(
        (shipment) =>
          shipment.origin_locode.trim().toUpperCase() ===
          shipment.destination_locode.trim().toUpperCase(),
      )
    ) {
      setApiError("A shipment's origin and destination must be different.");
      return;
    }

    if (
      shipments.some(
        (shipment) =>
          !shipment.cargo_demand_tons.trim() ||
          !Number.isFinite(Number(shipment.cargo_demand_tons)) ||
          Number(shipment.cargo_demand_tons) <= 0 ||
          !shipment.deadline_hours.trim() ||
          !Number.isFinite(Number(shipment.deadline_hours)) ||
          Number(shipment.deadline_hours) <= 0,
      )
    ) {
      setApiError("Cargo demand and deadline must both be positive numbers.");
      return;
    }

    const body = {
      algorithm: "QIGA",
      shipments: shipments.map((shipment) => ({
        shipment_ref: shipment.shipment_ref.trim() || undefined,
        origin_locode: shipment.origin_locode.trim().toUpperCase(),
        destination_locode: shipment.destination_locode.trim().toUpperCase(),
        cargo_demand_tons: Number(shipment.cargo_demand_tons),
        deadline_hours: Number(shipment.deadline_hours),
      })),
    };

    setLoading(true);

    try {
      const response = await fetch(`${API_BASE}/shipments/optimize-multi`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data: unknown = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          isRecord(data) && typeof data.detail === "string"
            ? data.detail
            : `Optimization request failed (${response.status}).`,
        );
      }

      if (!isRecord(data)) {
        throw new Error("The optimization API returned an invalid response.");
      }

      console.log("Optimization API response:", data);
      setResult(data as OptimizationResponse);
    } catch (error) {
      setApiError(
        error instanceof Error
          ? `${error.message}. Check that the backend is running and the API URL is correct.`
          : "Could not connect to the optimization API.",
      );
    } finally {
      setLoading(false);
    }
  }

  const alternatives = useMemo<AllocationAlternative[]>(() => {
    const raw = result?.allocation_alternatives;

    if (Array.isArray(raw) && raw.length > 0) {
      return raw.filter(
        (item): item is AllocationAlternative =>
          isRecord(item) && Array.isArray(item.shipments),
      );
    }

    if (Array.isArray(result?.shipments) && result.shipments.length > 0) {
      return [{ rank: 1, shipments: result.shipments }];
    }

    return [];
  }, [result]);

  const activeAlternative =
    alternatives[selectedAlternative] || alternatives[0];

  const results = Array.isArray(activeAlternative?.shipments)
    ? activeAlternative.shipments
    : [];

  /**
   * FIX: alternative shipments may not contain geometry.
   * Fall back to the top-level result.shipments array and match by shipment_ref.
   */
  const mapRoutes = useMemo<ShipmentRoute[]>(() => {
    return results.flatMap((item, index) => {
      const shipment = getShipment(item);

      const requestedRef =
        typeof shipment.shipment_ref === "string"
          ? shipment.shipment_ref
          : shipments[index]?.shipment_ref;

      let sourceItem = item;
      let coordinates = getRouteCoordinates(item);

      if (
        coordinates.length < 2 &&
        Array.isArray(result?.shipments)
      ) {
        const matchingShipment = result.shipments.find((candidate) => {
          const candidateShipment = getShipment(candidate);
          return (
            requestedRef &&
            candidateShipment.shipment_ref === requestedRef
          );
        });

        const fallbackItem =
          matchingShipment ?? result.shipments[index];

        if (fallbackItem) {
          const fallbackCoordinates = getRouteCoordinates(fallbackItem);

          if (fallbackCoordinates.length >= 2) {
            sourceItem = fallbackItem;
            coordinates = fallbackCoordinates;
          }
        }
      }

      if (coordinates.length < 2) return [];

      const sourceShipment = getShipment(sourceItem);

      const origin =
        getPortInfo(shipment.origin) ??
        getPortInfo(sourceShipment.origin);

      const destination =
        getPortInfo(shipment.destination) ??
        getPortInfo(sourceShipment.destination);

      return [
        {
          id: `${requestedRef || "shipment"}-${index}`,
          label: requestedRef || `Shipment ${index + 1}`,
          coordinates,
          origin,
          destination,
        },
      ];
    });
  }, [results, shipments, result]);

  const combined = useMemo(() => {
    return results.reduce(
      (sum, item) => {
        const metrics = item.best_plan?.metrics;

        return {
          cost: sum.cost + (metrics?.total_cost ?? 0),
          fuel: sum.fuel + (metrics?.total_fuel_kg ?? 0),
          ghg: sum.ghg + (metrics?.total_ghg_kg ?? 0),
          time: sum.time + (metrics?.travel_time_hours ?? 0),
        };
      },
      { cost: 0, fuel: 0, ghg: 0, time: 0 },
    );
  }, [results]);

  return (
    <main className="app-shell">
      <Sidebar
        active={active}
        mobileOpen={mobileOpen}
        onClose={() => setMobileOpen(false)}
        onNavigate={(label, href) => {
          setActive(label);
          setMobileOpen(false);
          if (href !== "/voyages") action(`${label} selected.`);
        }}
        onSettings={() => {
          setActive("Settings");
          setMobileOpen(false);
          action("Settings will be implemented in a later step.");
        }}
      />

      <section className="main-column min-h-screen">
        <Topbar
          active={active}
          query={query}
          onQueryChange={setQuery}
          onAction={action}
          onOpenMenu={() => setMobileOpen(true)}
        />

        <div className="dashboard-content">
          <section className="mb-5 rounded-2xl bg-gradient-to-br from-[#103f59] via-[#0c3049] to-[#07566b] p-5 text-white shadow-sm md:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200">
                  <Waves size={15} />
                  Voyage intelligence
                </div>
                <h1 className="text-2xl font-bold md:text-3xl">
                  Plan a smarter <span className="text-teal-300">voyage.</span>
                </h1>
                <p className="mt-2 text-sm text-sky-100">
                  Compare vessel allocations and visualize shipment routes.
                </p>
              </div>

              <div className="rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-xs">
                <div className="flex items-center gap-2 text-cyan-100">
                  <Activity size={14} /> API connection
                </div>
                <div className="mt-1 font-semibold">
                  {portsLoading
                    ? "Checking..."
                    : portsError
                      ? "Needs attention"
                      : "Ports endpoint responded"}
                </div>
                <div className="mt-1 break-all text-sky-100/80">{API_BASE}</div>
              </div>
            </div>
          </section>

          <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-2">
            <form
              onSubmit={planVoyages}
              className="min-w-0 rounded-2xl border border-sky-100 bg-white p-4 shadow-sm md:p-5"
            >
              <h2 className="text-lg font-bold text-slate-800">
                Shipment manifest
              </h2>
              <p className="mb-4 mt-1 text-sm text-slate-600">
                Define ports, cargo demand, and deadlines.
              </p>

              <div className="mb-3 rounded-xl border border-sky-100 bg-sky-50 p-3 text-sm text-slate-700">
                {portsLoading
                  ? "Loading ports..."
                  : portsError
                    ? `Port lookup error: ${portsError}`
                    : `${autocompletePorts.length} ports loaded.`}

                <button
                  type="button"
                  onClick={() => void loadPorts()}
                  disabled={portsLoading}
                  className="ml-3 inline-flex items-center gap-1 font-semibold text-sky-800 disabled:opacity-50"
                >
                  <RefreshCw size={12} /> Refresh
                </button>
              </div>

              <div className="space-y-3">
                {shipments.map((shipment, index) => (
                  <section
                    key={shipment.id}
                    className="rounded-xl border border-slate-200 p-3"
                  >
                    <div className="mb-3 flex items-center justify-between">
                      <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                        <Ship size={16} /> Shipment {index + 1}
                      </h3>

                      {shipments.length > 1 && (
                        <button
                          type="button"
                          aria-label={`Remove shipment ${index + 1}`}
                          onClick={() =>
                            setShipments((items) =>
                              items.filter((item) => item.id !== shipment.id),
                            )
                          }
                          className="rounded-lg p-2 text-slate-500 hover:bg-rose-50 hover:text-rose-600"
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>

                    <label className="mb-3 block text-xs font-medium text-slate-700">
                      Shipment reference
                      <input
                        value={shipment.shipment_ref}
                        onChange={(event) =>
                          updateShipment(
                            shipment.id,
                            "shipment_ref",
                            event.target.value,
                          )
                        }
                        className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-cyan-500"
                      />
                    </label>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <PortAutocomplete
                        ports={autocompletePorts}
                        label="Origin port"
                        placeholder="Search port"
                        selectedCode={shipment.origin_locode}
                        onSelect={(code) =>
                          updateShipment(shipment.id, "origin_locode", code)
                        }
                      />

                      <PortAutocomplete
                        ports={autocompletePorts}
                        label="Destination port"
                        placeholder="Search port"
                        selectedCode={shipment.destination_locode}
                        onSelect={(code) =>
                          updateShipment(
                            shipment.id,
                            "destination_locode",
                            code,
                          )
                        }
                      />

                      <label className="text-xs font-medium text-slate-700">
                        Cargo demand (tons)
                        <input
                          type="number"
                          min="0.01"
                          step="any"
                          required
                          value={shipment.cargo_demand_tons}
                          onChange={(event) =>
                            updateShipment(
                              shipment.id,
                              "cargo_demand_tons",
                              event.target.value,
                            )
                          }
                          className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-cyan-500"
                          placeholder="e.g. 4000"
                        />
                      </label>

                      <label className="text-xs font-medium text-slate-700">
                        Deadline (hours)
                        <input
                          type="number"
                          min="0.01"
                          step="any"
                          required
                          value={shipment.deadline_hours}
                          onChange={(event) =>
                            updateShipment(
                              shipment.id,
                              "deadline_hours",
                              event.target.value,
                            )
                          }
                          className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-cyan-500"
                          placeholder="e.g. 90"
                        />
                      </label>
                    </div>
                  </section>
                ))}
              </div>

              <button
                type="button"
                disabled={shipments.length >= 100 || loading}
                onClick={() =>
                  setShipments((items) => [
                    ...items,
                    newShipment(items.length + 1),
                  ])
                }
                className="mt-3 inline-flex items-center gap-2 rounded-lg border border-dashed border-sky-300 px-3 py-2 text-sm font-semibold text-sky-800 hover:bg-sky-50 disabled:opacity-50"
              >
                <Plus size={15} /> Add shipment
              </button>

              {apiError && (
                <div
                  role="alert"
                  className="mt-3 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800"
                >
                  <AlertTriangle size={17} className="mt-0.5 shrink-0" />
                  {apiError}
                </div>
              )}

              <button
                type="submit"
                disabled={loading || portsLoading}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-800 to-cyan-700 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
              >
                {loading ? (
                  <LoaderCircle size={17} className="animate-spin" />
                ) : (
                  <Route size={17} />
                )}
                {loading ? "Optimizing voyages..." : "Plan my voyages"}
                {!loading && <ArrowRight size={16} />}
              </button>
            </form>

            <section className="min-w-0 rounded-2xl border border-sky-100 bg-white p-4 shadow-sm md:p-5">
              <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="text-lg font-bold text-slate-800">
                    Shipment route map
                  </h2>
                  <p className="mt-1 text-sm text-slate-600">
                    Route geometry returned by your backend.
                  </p>
                </div>

                {mapRoutes.length > 0 && (
                  <span className="rounded-full bg-sky-100 px-2.5 py-1 text-xs font-semibold text-sky-800">
                    {mapRoutes.length} route{mapRoutes.length === 1 ? "" : "s"}
                  </span>
                )}
              </div>

              {mapRoutes.length > 0 ? (
                <RouteMap routes={mapRoutes} />
              ) : (
                <div className="flex min-h-[300px] flex-col items-center justify-center rounded-xl border border-dashed border-sky-200 bg-sky-50/60 px-5 py-8 text-center">
                  <Anchor size={30} className="text-sky-700" />
                  <h3 className="mt-3 font-semibold text-slate-800">
                    Routes will appear here
                  </h3>
                  <p className="mt-1 text-sm text-slate-600">
                    Submit your manifest to display the generated routes.
                  </p>

                  {results.length > 0 && (
                    <p className="mt-3 max-w-sm text-xs leading-5 text-amber-800">
                      Shipment results were returned, but no valid route
                      coordinates were found in either response location.
                      Inspect the debug output below.
                    </p>
                  )}
                </div>
              )}

              {mapRoutes.length > 0 && (
                <div className="mt-3 space-y-2">
                  {mapRoutes.map((route) => (
                    <div
                      key={route.id}
                      className="rounded-lg bg-slate-50 p-3 text-xs text-slate-700"
                    >
                      <p className="font-semibold">{route.label}</p>
                      <p className="mt-1">
                        {route.origin?.name || route.origin?.code || "Origin"}
                        {" → "}
                        {route.destination?.name ||
                          route.destination?.code ||
                          "Destination"}
                      </p>
                      <p className="mt-1 text-slate-500">
                        {route.coordinates.length} route points
                      </p>
                    </div>
                  ))}
                </div>
              )}

              <p className="mt-3 text-xs text-slate-500">
                GeoJSON coordinates must be [longitude, latitude]. The map
                displays the returned geometry and does not independently
                verify navigability.
              </p>
            </section>
          </div>

          {result && (
            <section className="mt-5 rounded-2xl border border-sky-100 bg-white p-4 shadow-sm md:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-xl font-bold text-slate-800">
                    Compare voyage plans
                  </h2>
                  <p className="mt-1 text-sm text-black">
                    Choose an allocation alternative to update the map.
                  </p>
                </div>

                <span className="rounded-full bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-800">
                  {alternatives.length} alternative
                  {alternatives.length === 1 ? "" : "s"}
                </span>
              </div>

              {alternatives.length === 0 ? (
                <p className="mt-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
                  No allocation alternatives were returned.
                </p>
              ) : (
                <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
                  {alternatives.slice(0, 2).map((alternative, index) => {
                    const planShipments = alternative.shipments || [];
                    const totals = planShipments.reduce(
                      (sum, item) => {
                        const metrics = item.best_plan?.metrics;
                        return {
                          cost: sum.cost + (metrics?.total_cost ?? 0),
                          fuel: sum.fuel + (metrics?.total_fuel_kg ?? 0),
                          ghg: sum.ghg + (metrics?.total_ghg_kg ?? 0),
                          time:
                            sum.time + (metrics?.travel_time_hours ?? 0),
                        };
                      },
                      { cost: 0, fuel: 0, ghg: 0, time: 0 },
                    );

                    const selected = selectedAlternative === index;

                    return (
                      <article
                        key={`allocation-${alternative.rank ?? index}`}
                        className={`rounded-xl border p-4 ${
                          selected
                            ? "border-cyan-500 bg-cyan-50/40 ring-2 ring-cyan-100"
                            : "border-slate-200"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <h3 className="font-bold text-slate-800">
                              Plan {index === 0 ? "A" : "B"}
                            </h3>
                            <p className="text-xs text-slate-500">
                              Rank {alternative.rank ?? index + 1}
                            </p>
                          </div>
                          {index === 0 && (
                            <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800">
                              Recommended
                            </span>
                          )}
                        </div>

                        <div className="mt-3 grid grid-cols-2 gap-2">
                          <MetricCard
                            label="Combined cost"
                            value={formatINR(totals.cost)}
                          />
                          <MetricCard
                            label="Travel time*"
                            value={displayValue(totals.time, " h")}
                          />
                          <MetricCard
                            label="Fuel"
                            value={displayValue(totals.fuel, " kg")}
                          />
                          <MetricCard
                            label="GHG emissions"
                            value={displayValue(totals.ghg, " kg")}
                          />
                        </div>

                        <div className="mt-3 space-y-2">
                          {planShipments.map((item, shipmentIndex) => {
                            const shipment = getShipment(item);
                            const plan = item.best_plan;
                            const metrics = plan?.metrics;
                            const origin = getPortInfo(shipment.origin);
                            const destination = getPortInfo(
                              shipment.destination,
                            );

                            const vessels = (plan?.vessels || [])
                              .map(
                                (vessel) =>
                                  vessel.vessel_name || vessel.vessel_id,
                              )
                              .filter(Boolean);

                            return (
                              <div
                                key={`${String(shipment.shipment_ref || shipmentIndex)}-${index}`}
                                className="rounded-lg border border-slate-100 bg-white p-3"
                              >
                                <p className="text-sm font-semibold text-slate-800">
                                  {String(
                                    shipment.shipment_ref ||
                                      `Shipment ${shipmentIndex + 1}`,
                                  )}
                                </p>
                                <p className="mt-1 text-xs text-slate-600">
                                  {origin?.name || origin?.code || "Origin"}
                                  {" → "}
                                  {destination?.name ||
                                    destination?.code ||
                                    "Destination"}
                                </p>
                                <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-600">
                                  <p>
                                    Time:{" "}
                                    <strong className="text-slate-800">
                                      {displayValue(
                                        metrics?.travel_time_hours,
                                        " h",
                                      )}
                                    </strong>
                                  </p>
                                  <p>
                                    Cost:{" "}
                                    <strong className="text-slate-800">
                                      {formatINR(metrics?.total_cost)}
                                    </strong>
                                  </p>
                                  <p className="col-span-2">
                                    Vessels:{" "}
                                    <strong className="text-slate-800">
                                      {vessels.join(", ") || "Not assigned"}
                                    </strong>
                                  </p>
                                </div>
                                {item.message && (
                                  <p className="mt-2 text-xs text-slate-600">
                                    {item.message}
                                  </p>
                                )}
                              </div>
                            );
                          })}
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            setSelectedAlternative(index);
                            window.scrollTo({ top: 0, behavior: "smooth" });
                            action(
                              `Plan ${index === 0 ? "A" : "B"} selected.`,
                            );
                          }}
                          className={`mt-4 flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white ${
                            selected
                              ? "bg-emerald-600"
                              : "bg-sky-800 hover:bg-sky-700"
                          }`}
                        >
                          {selected ? (
                            <CheckCircle2 size={16} />
                          ) : (
                            <Route size={16} />
                          )}
                          {selected
                            ? "Currently selected"
                            : `Use Plan ${index === 0 ? "A" : "B"}`}
                        </button>
                      </article>
                    );
                  })}
                </div>
              )}

              <p className="mt-3 text-xs text-slate-500">
                *Travel hours are summed across shipments and may not equal
                elapsed batch completion time.
              </p>

              {typeof result.batch_runtime_seconds === "number" && (
                <p className="mt-2 text-xs text-slate-600">
                  Optimization runtime:{" "}
                  {displayValue(result.batch_runtime_seconds, " seconds")}
                </p>
              )}

              <details className="mt-3 rounded-lg border border-slate-200 p-3">
                <summary className="cursor-pointer text-xs font-semibold text-slate-700">
                  Debug API response
                </summary>
                <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-words text-xs text-slate-700">
                  {JSON.stringify(
                    {
                      alternatives_count: alternatives.length,
                      top_level_shipments: result.shipments?.length ?? 0,
                      selected_alternative: selectedAlternative,
                      map_routes_found: mapRoutes.length,
                      first_selected_shipment: results[0] ?? null,
                      first_top_level_shipment: result.shipments?.[0] ?? null,
                    },
                    null,
                    2,
                  )}
                </pre>
              </details>
            </section>
          )}

          <footer className="flex flex-wrap justify-between gap-2 py-5 text-xs text-slate-500">
            <span>EcoFleet AI · Voyage Planning</span>
            <span className="inline-flex items-center gap-1">
              <Clock3 size={13} />
              Connected API data
            </span>
          </footer>
        </div>
      </section>

      {notice && (
        <div
          role="status"
          className="fixed bottom-5 right-5 z-[1000] flex max-w-sm items-center gap-3 rounded-xl border border-sky-100 bg-white px-4 py-3 text-sm text-slate-700 shadow-xl"
        >
          <CheckCircle2 size={18} className="shrink-0 text-cyan-700" />
          <span>{notice}</span>
          <button
            type="button"
            onClick={() => setNotice("")}
            className="shrink-0 rounded p-1 hover:bg-slate-100"
            aria-label="Dismiss notification"
          >
            ×
          </button>
        </div>
      )}
    </main>
  );
}
