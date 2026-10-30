
"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import Sidebar from "@/components/layout/Sidebar";
import PortAutocomplete from "@/components/voyages/PortAutocomplete";
import Topbar from "@/components/layout/Topbar";
import {
  Activity, AlertTriangle, Anchor, ArrowRight, CheckCircle2,
  CircleHelp, Clock3, LoaderCircle, MapPin, Plus, RefreshCw,
  Route, Ship, Trash2, Waves, X,
} from "lucide-react";

const RouteMap = dynamic(() => import("@/components/maps/RouteMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[360px] items-center justify-center rounded-2xl bg-sky-50 text-sm text-sky-700">
      Loading route mapâ€¦
    </div>
  ),
});

const API_BASE =
  (process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000").replace(/\/$/, "");

type ShipmentDraft = {
  id: string;
  shipment_ref: string;
  origin_locode: string;
  destination_locode: string;
  cargo_demand_tons: string;
  deadline_hours: string;
};

type Port = { code?: string; locode?: string; name?: string };

type RouteGeometry = {
  type?: string;
  coordinates?: number[][];
};

type ShipmentResult = {
  success?: boolean;
  message?: string;
  shipment?: {
    shipment_ref?: string;
    origin?: { code?: string; name?: string; latitude?: number; longitude?: number };
    destination?: { code?: string; name?: string; latitude?: number; longitude?: number };
    distance_km?: number;
    route_geometry?: RouteGeometry;
    cargo_demand_tons?: number;
    deadline_hours?: number;
  };
  best_plan?: Record<string, unknown> | null;
  candidate_count?: number;
  runtime_seconds?: number;
  [key: string]: unknown;
};

type OptimizationResponse = {
  success?: boolean;
  algorithm?: string;
  requested_algorithm?: string;
  message?: string;
  shipment_count?: number;
  batch_runtime_seconds?: number;
  shipments?: ShipmentResult[];
  [key: string]: unknown;
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

function isLocode(value: string) {
  return /^[A-Z0-9]{5}$/.test(value.trim().toUpperCase());
}

function displayValue(value: unknown, suffix = "") {
  if (typeof value === "number" && Number.isFinite(value)) {
    return `${Number(value.toFixed(2)).toLocaleString()}${suffix}`;
  }
  if (typeof value === "string" && value.trim()) return `${value}${suffix}`;
  return "â€”";
}

export default function VoyagePlanningPage() {
  const [active, setActive] = useState("Voyage Planning");
  const [query, setQuery] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [ports, setPorts] = useState<Port[]>([]);
  const [portsLoading, setPortsLoading] = useState(true);
  const [portsError, setPortsError] = useState("");
  const [shipments, setShipments] = useState<ShipmentDraft[]>([newShipment(1)]);
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState("");
  const [result, setResult] = useState<OptimizationResponse | null>(null);

  function action(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 3500);
  }

  async function loadPorts() {
    setPortsLoading(true);
    setPortsError("");
    try {
      const response = await fetch(`${API_BASE}/ports`, { cache: "no-store" });
      if (!response.ok) throw new Error(`Ports request failed (${response.status})`);
      const data = await response.json();
      const list = Array.isArray(data) ? data : data.ports;
      setPorts(Array.isArray(list) ? list : []);
    } catch (error) {
      setPortsError(error instanceof Error ? error.message : "Could not load ports.");
      setPorts([]);
    } finally {
      setPortsLoading(false);
    }
  }

  useEffect(() => {
    void loadPorts();
  }, []);

  const filteredPorts = useMemo(() => {
    const byCode = new Map<string, Port>();
    for (const port of ports) {
      const code = String(port.code || port.locode || "").toUpperCase();
      if (code) byCode.set(code, port);
    }
    return [...byCode.values()];
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
                field === "origin_locode" || field === "destination_locode"
                  ? value.toUpperCase().slice(0, 5)
                  : value,
            }
          : item,
      ),
    );
  }

  async function planVoyages(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setApiError("");
    setNotice("");
    setResult(null);

    if (shipments.some((s) => !isLocode(s.origin_locode) || !isLocode(s.destination_locode))) {
      setApiError("Enter a valid five-character origin and destination LOCODE for every shipment.");
      return;
    }

    if (shipments.some((s) => s.origin_locode.trim() === s.destination_locode.trim())) {
      setApiError("A shipment's origin and destination must be different.");
      return;
    }

    if (
      shipments.some(
        (s) =>
          !s.cargo_demand_tons.trim() ||
          !Number.isFinite(Number(s.cargo_demand_tons)) ||
          Number(s.cargo_demand_tons) <= 0 ||
          !s.deadline_hours.trim() ||
          !Number.isFinite(Number(s.deadline_hours)) ||
          Number(s.deadline_hours) <= 0,
      )
    ) {
      setApiError("Cargo demand and deadline must both be positive numbers.");
      return;
    }

    const body = {
      algorithm: "QIGA",
      shipments: shipments.map((s) => ({
        shipment_ref: s.shipment_ref.trim() || undefined,
        origin_locode: s.origin_locode.trim().toUpperCase(),
        destination_locode: s.destination_locode.trim().toUpperCase(),
        cargo_demand_tons: Number(s.cargo_demand_tons),
        deadline_hours: Number(s.deadline_hours),
      })),
    };

    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/shipments/optimize-multi`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          typeof data.detail === "string"
            ? data.detail
            : `Optimization request failed (${response.status}).`,
        );
      }
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

  const results = Array.isArray(result?.shipments) ? result.shipments : [];
  const routeResult = results.find(
    (item) => Array.isArray(item.shipment?.route_geometry?.coordinates)
      && item.shipment!.route_geometry!.coordinates!.length >= 2,
  );
  const geometry = routeResult?.shipment?.route_geometry;
  const routeSuccess = routeResult?.success === true;
  const successCount = results.filter((item) => item.success === true).length;

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
          <section className="mb-6 overflow-hidden rounded-2xl border border-sky-100 bg-gradient-to-br from-[#103f59] via-[#0c3049] to-[#07566b] p-6 text-white shadow-sm md:p-8">
            <div className="flex flex-wrap items-start justify-between gap-5">
              <div className="max-w-2xl">
                <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200">
                  <Waves size={16} /> Voyage intelligence
                </div>
                <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
                  Plan a smarter <span className="text-teal-300">voyage.</span>
                </h1>
                <p className="mt-3 max-w-xl text-sm leading-6 text-sky-100">
                  Enter your shipment requirements. EcoFleet AI will evaluate feasibility and plan your voyage.
                </p>
              </div>
              <div className="rounded-xl border border-white/15 bg-white/10 px-4 py-3 text-sm">
                <div className="flex items-center gap-2 text-cyan-100">
                  <Activity size={16} /> API connection
                </div>
                <div className="mt-1 font-semibold">
                  {portsLoading ? "Checkingâ€¦" : portsError ? "Needs attention" : "Ports endpoint responded"}
                </div>
                <div className="mt-1 max-w-[240px] break-all text-xs text-sky-100/80">
                  {API_BASE}
                </div>
              </div>
            </div>
          </section>

          <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.8fr)]">
            <form onSubmit={planVoyages} className="min-w-0 rounded-2xl border border-sky-100 bg-white p-5 shadow-sm md:p-6">
              <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-cyan-700">Configuration</p>
                  <h2 className="mt-1 text-xl font-bold text-slate-800">Shipment manifest</h2>
                  <p className="mt-1 text-sm text-slate-500">Add one or more shipments. EcoFleet AI handles the optimization.</p>
                </div>
              </div>

              <div className="mb-4 rounded-xl border border-sky-100 bg-sky-50/70 p-3 text-sm text-slate-600">
                <div className="flex items-start gap-2">
                  <CircleHelp size={17} className="mt-0.5 shrink-0 text-sky-700" />
                  <div>
                    <strong className="text-slate-800">Port lookup</strong>
                    <p className="mt-1">
                      {portsLoading
                        ? "Preparing the port lookup…"
                        : portsError
                          ? `Port lookup unavailable: ${portsError}`
                          : filteredPorts.length === 0
                            ? "Search the verified port list by name and select a suggestion. The LOCODE is stored automatically."
                            : `${filteredPorts.length} ports available from the backend.`}
                    </p>
                    <button type="button" onClick={() => void loadPorts()} className="mt-2 inline-flex items-center gap-1 font-semibold text-sky-800 hover:text-cyan-700">
                      <RefreshCw size={13} /> Refresh ports
                    </button>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                {shipments.map((shipment, index) => (
                  <section key={shipment.id} className="rounded-xl border border-slate-200 p-4">
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span className="grid size-8 place-items-center rounded-lg bg-sky-100 text-sky-800">
                          <Ship size={17} />
                        </span>
                        <div>
                          <h3 className="font-semibold text-slate-800">Shipment {index + 1}</h3>
                          <p className="text-xs text-slate-500">Reference and route constraints</p>
                        </div>
                      </div>
                      {shipments.length > 1 && (
                        <button type="button" aria-label={`Remove shipment ${index + 1}`} onClick={() => setShipments((items) => items.filter((s) => s.id !== shipment.id))} className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600">
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>

                    <label className="mb-4 block text-sm font-medium text-slate-600">
                      Shipment reference
                      <input value={shipment.shipment_ref} onChange={(e) => updateShipment(shipment.id, "shipment_ref", e.target.value)} maxLength={80} placeholder="e.g. VOY-001" className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-slate-800 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100" />
                    </label>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <PortAutocomplete
                        label="Origin port"
                        placeholder="Search port name, e.g. Mumbai"
                        selectedCode={shipment.origin_locode}
                        onSelect={(code) => updateShipment(shipment.id, "origin_locode", code)}
                      />
                      <PortAutocomplete
                        label="Destination port"
                        placeholder="Search port name, e.g. Singapore"
                        selectedCode={shipment.destination_locode}
                        onSelect={(code) => updateShipment(shipment.id, "destination_locode", code)}
                      />
                      <label className="text-sm font-medium text-slate-600">
                        Cargo demand (tons)
                        <input
                          type="number"
                          min="0.01"
                          step="any"
                          required
                          value={shipment.cargo_demand_tons}
                          onChange={(e) => updateShipment(shipment.id, "cargo_demand_tons", e.target.value)}
                          placeholder="e.g. 100"
                          className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-slate-800 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
                        />
                      </label>
                      <label className="text-sm font-medium text-slate-600">
                        Deadline (hours)
                        <input
                          type="number"
                          min="0.01"
                          step="any"
                          required
                          value={shipment.deadline_hours}
                          onChange={(e) => updateShipment(shipment.id, "deadline_hours", e.target.value)}
                          placeholder="e.g. 60"
                          className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-slate-800 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
                        />
                      </label>
                    </div>
                  </section>
                ))}
              </div>

              <button type="button" onClick={() => setShipments((items) => [...items, newShipment(items.length + 1)])} disabled={shipments.length >= 100 || loading} className="mt-4 inline-flex items-center gap-2 rounded-lg border border-dashed border-sky-300 px-4 py-2.5 text-sm font-semibold text-sky-800 hover:bg-sky-50 disabled:opacity-50">
                <Plus size={16} /> Add shipment
              </button>

              {apiError && (
                <div role="alert" className="mt-4 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
                  <AlertTriangle size={18} className="mt-0.5 shrink-0" /> {apiError}
                </div>
              )}

              <button type="submit" disabled={loading} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-800 to-cyan-700 px-5 py-3.5 font-semibold text-white shadow-sm transition hover:brightness-110 disabled:cursor-wait disabled:opacity-70">
                {loading ? <LoaderCircle size={18} className="animate-spin" /> : <Route size={18} />}
                {loading ? "Optimizing voyageâ€¦" : `Plan my voyage`}
                {!loading && <ArrowRight size={17} />}
              </button>
              <p className="mt-3 text-center text-xs text-slate-400">Results and metrics are shown only when returned by your API.</p>
            </form>

            <div className="min-w-0 space-y-5">
              <section className="overflow-hidden rounded-2xl border border-sky-100 bg-white p-5 shadow-sm">
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-cyan-700">Route intelligence</p>
                    <h2 className="mt-1 text-xl font-bold text-slate-800">Voyage route</h2>
                  </div>
                  {routeResult && (
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${routeSuccess ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
                      {routeSuccess ? "Feasible" : "Reference only"}
                    </span>
                  )}
                </div>

                {geometry?.coordinates && geometry.coordinates.length >= 2 ? (
                  <>
                    <RouteMap
                      coordinates={geometry.coordinates}
                      origin={routeResult?.shipment?.origin}
                      destination={routeResult?.shipment?.destination}
                    />
                    {!routeSuccess && (
                      <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                        <div className="flex items-center gap-2 font-semibold"><AlertTriangle size={16} /> Optimization infeasible</div>
                        <p className="mt-1">{routeResult?.message || "The backend returned route geometry, but did not confirm a feasible plan."} The map shows route reference geometry only, not an approved voyage or live vessel position.</p>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="flex min-h-[300px] flex-col items-center justify-center rounded-xl border border-dashed border-sky-200 bg-sky-50/60 px-6 text-center">
                    <span className="grid size-14 place-items-center rounded-2xl bg-white text-sky-700 shadow-sm"><Anchor size={25} /></span>
                    <h3 className="mt-4 font-semibold text-slate-800">Route will appear here</h3>
                    <p className="mt-2 max-w-xs text-sm leading-6 text-slate-500">Submit a voyage request. The map uses route coordinates returned by the backend.</p>
                  </div>
                )}

                {routeResult?.shipment && (
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <div className="rounded-xl bg-sky-50 p-3">
                      <p className="text-xs text-slate-500">Origin</p>
                      <p className="mt-1 font-semibold text-slate-800">{routeResult.shipment.origin?.code || "â€”"}</p>
                      <p className="mt-1 text-xs text-slate-500">{routeResult.shipment.origin?.name || "Name not supplied"}</p>
                    </div>
                    <div className="rounded-xl bg-sky-50 p-3">
                      <p className="text-xs text-slate-500">Destination</p>
                      <p className="mt-1 font-semibold text-slate-800">{routeResult.shipment.destination?.code || "â€”"}</p>
                      <p className="mt-1 text-xs text-slate-500">{routeResult.shipment.destination?.name || "Name not supplied"}</p>
                    </div>
                  </div>
                )}
              </section>

              <section className="rounded-2xl border border-sky-100 bg-white p-5 shadow-sm">
                <div className="mb-4 flex items-center gap-2">
                  <Activity size={18} className="text-cyan-700" />
                  <h2 className="text-lg font-bold text-slate-800">Optimization result</h2>
                </div>
                {!result ? (
                  <p className="rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-500">No optimization result yet. Configure the manifest and submit it to see the actual backend response.</p>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-xl bg-sky-50 p-3">
                        <p className="text-xs text-slate-500">Shipments served</p>
                        <p className="mt-1 text-2xl font-bold text-slate-800">{successCount} <span className="text-sm font-medium text-slate-400">/ {results.length}</span></p>
                      </div>
                      <div className="rounded-xl bg-sky-50 p-3">
                        <p className="text-xs text-slate-500">Batch runtime</p>
                        <p className="mt-1 text-2xl font-bold text-slate-800">{displayValue(result.batch_runtime_seconds, " s")}</p>
                      </div>
                    </div>
                    <div className="mt-3 rounded-xl border border-slate-200 p-3 text-sm">
                      <p className="text-slate-500">Algorithm reported by backend</p>
                      <p className="mt-1 font-semibold text-slate-800">{String(result.algorithm || "Not supplied")}</p>
                      <p className="mt-2 text-slate-500">Requested algorithm: <span className="font-semibold text-slate-700">{String(result.requested_algorithm || "QIGA")}</span></p>
                    </div>
                    <div className="mt-4 space-y-3">
                      {results.map((item, i) => (
                        <div key={`${item.shipment?.shipment_ref || "shipment"}-${i}`} className="rounded-xl border border-slate-200 p-3">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="font-semibold text-slate-800">{item.shipment?.shipment_ref || shipments[i]?.shipment_ref || `Shipment ${i + 1}`}</p>
                              <p className="mt-1 text-xs text-slate-500">{item.shipment?.origin?.code || shipments[i]?.origin_locode || "â€”"} <ArrowRight size={12} className="mx-1 inline" /> {item.shipment?.destination?.code || shipments[i]?.destination_locode || "â€”"}</p>
                            </div>
                            <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${item.success ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"}`}>
                              {item.success ? "Feasible" : "Infeasible"}
                            </span>
                          </div>
                          {item.message && <p className="mt-2 text-sm leading-5 text-slate-600">{item.message}</p>}
                          <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-500">
                            <span>{displayValue(item.candidate_count)} candidates</span>
                            <span>{displayValue(item.runtime_seconds, " s")} runtime</span>
                            {item.shipment?.distance_km != null && <span>{displayValue(item.shipment.distance_km, " km")}</span>}
                          </div>
                          {item.success && item.best_plan && (
                            <details className="mt-3">
                              <summary className="cursor-pointer text-xs font-semibold text-sky-800">Inspect returned plan details</summary>
                              <pre className="mt-2 overflow-x-auto rounded-lg bg-slate-50 p-3 text-xs text-slate-700">{JSON.stringify(item.best_plan, null, 2)}</pre>
                            </details>
                          )}
                        </div>
                      ))}
                    </div>
                    <details className="mt-4">
                      <summary className="cursor-pointer text-xs font-semibold text-slate-500">Inspect full API response</summary>
                      <pre className="mt-2 max-h-72 overflow-auto rounded-xl bg-slate-900 p-3 text-xs text-slate-100">{JSON.stringify(result, null, 2)}</pre>
                    </details>
                  </>
                )}
              </section>
            </div>
          </div>

          <footer className="flex flex-wrap justify-between gap-2 py-6 text-xs text-slate-400">
            <span>EcoFleet AI Â· Voyage Planning</span>
            <span className="inline-flex items-center gap-1"><Clock3 size={13} /> Data shown from the connected API response</span>
          </footer>
        </div>
      </section>

      {notice && (
        <div role="status" className="fixed bottom-5 right-5 z-[1000] flex max-w-sm items-center gap-3 rounded-xl border border-sky-100 bg-white px-4 py-3 text-sm text-slate-700 shadow-xl">
          <CheckCircle2 size={18} className="shrink-0 text-cyan-700" /> {notice}
          <button type="button" aria-label="Dismiss notice" onClick={() => setNotice("")}><X size={15} /></button>
        </div>
      )}
    </main>
  );
}



