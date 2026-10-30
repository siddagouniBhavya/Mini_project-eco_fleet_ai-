
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/layout/Sidebar";
import Topbar from "@/components/layout/Topbar";
import {
  Anchor,
  ChevronRight,
  Compass,
  Leaf,
  LoaderCircle,
  MapPin,
  Package,
  RefreshCw,
  Route,
  Ship,
  Sparkles,
  Waves,
  X,
  Zap,
} from "lucide-react";

const API_BASE = (
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000"
).replace(/\/$/, "");

const ROUTES = {
  plan: "/voyage-planning",
  shipments: "/shipments",
  fleet: "/fleet",
  optimize: "/optimization",
};

const ROUTE_COLORS = [
  "#32d8d0",
  "#a78bfa",
  "#fbbf24",
  "#60a5fa",
  "#fb7185",
  "#4ade80",
  "#f97316",
  "#e879f9",
];

type DataRecord = Record<string, unknown>;

type Vessel = DataRecord & {
  vessel_id?: string;
  id?: string;
  vessel_name?: string;
  name?: string;
  status?: string;
};

type RoutePoint = {
  lat: number;
  lng: number;
};

type MapVoyage = {
  id: string;
  name: string;
  vessel: string;
  origin: string;
  destination: string;
  color: string;
  start: RoutePoint;
  end: RoutePoint;
  status: string;
};

function recordList(data: unknown): DataRecord[] {
  if (Array.isArray(data)) {
    return data.filter(
      (item): item is DataRecord =>
        Boolean(item) && typeof item === "object",
    );
  }

  if (data && typeof data === "object") {
    const record = data as DataRecord;

    for (const key of [
      "vessels",
      "shipments",
      "voyages",
      "routes",
      "results",
      "data",
    ]) {
      if (Array.isArray(record[key])) {
        return (record[key] as unknown[]).filter(
          (item): item is DataRecord =>
            Boolean(item) && typeof item === "object",
        );
      }
    }
  }

  return [];
}

function firstValue(
  record: DataRecord,
  keys: string[],
): unknown {
  for (const key of keys) {
    const value = record[key];

    if (value !== undefined && value !== null && value !== "") {
      return value;
    }
  }

  return undefined;
}

function textValue(
  record: DataRecord,
  keys: string[],
  fallback = "",
): string {
  const value = firstValue(record, keys);
  return value === undefined ? fallback : String(value);
}

function numericValue(
  record: DataRecord,
  keys: string[],
): number | null {
  const value = firstValue(record, keys);

  if (value === undefined || value === null || value === "") {
    return null;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function getCoordinates(
  record: DataRecord,
  prefix: "origin" | "destination",
): RoutePoint | null {
  const nested = record[prefix];

  if (nested && typeof nested === "object") {
    const point = nested as DataRecord;
    const lat = numericValue(point, ["lat", "latitude"]);
    const lng = numericValue(point, [
      "lng",
      "lon",
      "long",
      "longitude",
    ]);

    if (
      lat !== null &&
      lng !== null &&
      Math.abs(lat) <= 90 &&
      Math.abs(lng) <= 180
    ) {
      return { lat, lng };
    }
  }

  const lat = numericValue(record, [
    `${prefix}_lat`,
    `${prefix}_latitude`,
    `${prefix}_lat_deg`,
  ]);

  const lng = numericValue(record, [
    `${prefix}_lng`,
    `${prefix}_lon`,
    `${prefix}_long`,
    `${prefix}_longitude`,
  ]);

  if (
    lat === null ||
    lng === null ||
    Math.abs(lat) > 90 ||
    Math.abs(lng) > 180
  ) {
    return null;
  }

  return { lat, lng };
}

function getStatus(record: DataRecord): string {
  return textValue(record, ["status", "state"], "UNKNOWN")
    .replaceAll("_", " ")
    .toUpperCase();
}

function extractMapVoyages(
  records: DataRecord[],
): MapVoyage[] {
  return records.flatMap((record, index) => {
    const origin = textValue(record, [
      "origin_name",
      "origin_port_name",
      "origin_port",
      "origin",
      "source_port",
      "source",
      "from_port",
      "from",
    ]);

    const destination = textValue(record, [
      "destination_name",
      "destination_port_name",
      "destination_port",
      "destination",
      "target_port",
      "to_port",
      "to",
    ]);

    const start = getCoordinates(record, "origin");
    const end = getCoordinates(record, "destination");

    // Display only routes with actual coordinates and named endpoints.
    if (
      !origin ||
      !destination ||
      typeof origin !== "string" ||
      typeof destination !== "string" ||
      !start ||
      !end
    ) {
      return [];
    }

    const id = textValue(
      record,
      ["voyage_id", "shipment_id", "route_id", "id"],
      `Voyage ${index + 1}`,
    );

    return [
      {
        id,
        name: `${origin} → ${destination}`,
        vessel: textValue(
          record,
          ["vessel_name", "ship_name", "vessel_id"],
          "Vessel not assigned",
        ),
        origin,
        destination,
        color: ROUTE_COLORS[index % ROUTE_COLORS.length],
        start,
        end,
        status: getStatus(record),
      },
    ];
  });
}

function VoyageMap({
  voyages,
}: {
  voyages: MapVoyage[];
}) {
  const [selectedId, setSelectedId] = useState("");

  const selected = voyages.find(
    (voyage) => voyage.id === selectedId,
  );

  const bounds = useMemo(() => {
    const points = voyages.flatMap((voyage) => [
      voyage.start,
      voyage.end,
    ]);

    if (!points.length) return null;

    const minLat = Math.min(...points.map((point) => point.lat));
    const maxLat = Math.max(...points.map((point) => point.lat));
    const minLng = Math.min(...points.map((point) => point.lng));
    const maxLng = Math.max(...points.map((point) => point.lng));

    return {
      minLat,
      minLng,
      latSpan: Math.max(maxLat - minLat, 1),
      lngSpan: Math.max(maxLng - minLng, 1),
    };
  }, [voyages]);

  function project(point: RoutePoint) {
    if (!bounds) return { x: 50, y: 50 };

    return {
      x:
        55 +
        ((point.lng - bounds.minLng) / bounds.lngSpan) * 890,
      y:
        35 +
        ((bounds.minLat + bounds.latSpan - point.lat) /
          bounds.latSpan) *
          390,
    };
  }

  return (
    <article className="panel voyage-map-panel h-full">
      {/* Updated: more padding around the Company voyages heading */}
      <div className="panel-heading px-5 py-5 sm:px-6 sm:py-6">
        <div>
          <span className="panel-kicker">VOYAGE INTELLIGENCE</span>
          <h3>Company voyages</h3>
        </div>

        <span className="panel-icon">
          <Compass size={18} />
        </span>
      </div>

      {voyages.length === 0 ? (
        <div className="flex min-h-64 flex-col items-center justify-center px-6 py-10 text-center">
          <span className="grid size-14 place-items-center rounded-2xl bg-sky-50 text-sky-700">
            <Route size={26} />
          </span>

          <h4 className="mt-4 font-semibold text-slate-800">
            No mappable voyages available
          </h4>

          <p className="mt-2 max-w-lg text-sm leading-6 text-slate-500">
            The backend must return voyage or shipment records
            containing origin and destination names and coordinates.
            No sample routes or vessel positions are displayed.
          </p>
        </div>
      ) : (
        <>
          <div className="relative overflow-hidden rounded-xl border border-sky-100 bg-[#082b40]">
            <svg
              viewBox="0 0 1000 460"
              className="block w-full"
              role="img"
              aria-label="Voyage routes from backend data"
            >
              <defs>
                <pattern
                  id="ocean-grid"
                  width="45"
                  height="45"
                  patternUnits="userSpaceOnUse"
                >
                  <path
                    d="M 45 0 L 0 0 0 45"
                    fill="none"
                    stroke="#6ba5b8"
                    strokeOpacity=".12"
                    strokeWidth="1"
                  />
                </pattern>
              </defs>

              <rect width="1000" height="460" fill="#082b40" />
              <rect
                width="1000"
                height="460"
                fill="url(#ocean-grid)"
              />

              {Array.from({ length: 8 }, (_, index) => (
                <ellipse
                  key={index}
                  cx="500"
                  cy="230"
                  rx={100 + index * 65}
                  ry={45 + index * 34}
                  fill="none"
                  stroke="#3d8499"
                  strokeOpacity=".14"
                />
              ))}

              {voyages.map((voyage) => {
                const start = project(voyage.start);
                const end = project(voyage.end);
                const isSelected = selectedId === voyage.id;
                const midX = (start.x + end.x) / 2;
                const midY = (start.y + end.y) / 2 - 25;

                return (
                  <g
                    key={voyage.id}
                    onClick={() => setSelectedId(voyage.id)}
                    className="cursor-pointer"
                  >
                    <path
                      d={`M ${start.x} ${start.y} Q ${midX} ${midY} ${end.x} ${end.y}`}
                      fill="none"
                      stroke={voyage.color}
                      strokeWidth={isSelected ? 4 : 2.5}
                      strokeDasharray="5 8"
                      strokeLinecap="round"
                      opacity={isSelected ? 1 : 0.8}
                    />

                    <g
                      transform={`translate(${midX} ${(start.y + end.y) / 2 - 8}) rotate(${Math.atan2(end.y - start.y, end.x - start.x) * (180 / Math.PI)})`}
                    >
                      <path
                        d="M -12 -7 L 9 0 L -12 7 L -7 0 Z"
                        fill={voyage.color}
                        stroke="#e5fbff"
                        strokeWidth="1"
                      />
                    </g>

                    <g transform={`translate(${start.x} ${start.y})`}>
                      <circle
                        r="11"
                        fill={voyage.color}
                        fillOpacity=".15"
                      />
                      <circle
                        r="6"
                        fill={voyage.color}
                        stroke="#ffffff"
                        strokeWidth="2"
                      />
                      <path
                        d="M -3 0 L 0 -4 L 3 0 L 0 4 Z"
                        fill="#082b40"
                      />
                    </g>

                    <g transform={`translate(${end.x} ${end.y})`}>
                      <circle
                        r="11"
                        fill={voyage.color}
                        fillOpacity=".15"
                      />
                      <path
                        d="M 0 -7 L 7 0 L 0 7 L -7 0 Z"
                        fill={voyage.color}
                        stroke="#ffffff"
                        strokeWidth="2"
                      />
                    </g>

                    <g transform={`translate(${midX} ${midY})`}>
                      <circle
                        r="15"
                        fill="#0d3c50"
                        stroke={voyage.color}
                        strokeOpacity=".5"
                      />
                      <g transform="translate(-9 -9) scale(.75)">
                        <path
                          d="M 2 13 L 22 13 L 18 20 L 7 20 Z"
                          fill={voyage.color}
                        />
                        <rect
                          x="7"
                          y="5"
                          width="9"
                          height="8"
                          rx="1"
                          fill={voyage.color}
                        />
                        <path
                          d="M 4 22 L 20 22"
                          stroke={voyage.color}
                          strokeWidth="2"
                        />
                      </g>
                    </g>

                    <text
                      x={start.x}
                      y={start.y - 17}
                      textAnchor="middle"
                      fill="#e5f8ff"
                      fontSize="12"
                      fontWeight="600"
                    >
                      {voyage.origin.length > 23
                        ? `${voyage.origin.slice(0, 21)}…`
                        : voyage.origin}
                    </text>

                    <text
                      x={end.x}
                      y={end.y + 25}
                      textAnchor="middle"
                      fill="#e5f8ff"
                      fontSize="12"
                      fontWeight="600"
                    >
                      {voyage.destination.length > 23
                        ? `${voyage.destination.slice(0, 21)}…`
                        : voyage.destination}
                    </text>
                  </g>
                );
              })}
            </svg>

            <div className="absolute left-3 top-3 rounded-lg border border-white/15 bg-[#082b40]/90 px-3 py-2 text-xs text-cyan-100">
              <span className="online-dot mr-2 inline-block" />
              {voyages.length} mapped{" "}
              {voyages.length === 1 ? "voyage" : "voyages"}
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-2 px-4 pb-4 sm:grid-cols-2 sm:px-5">
            {voyages.map((voyage) => (
              <button
                type="button"
                key={voyage.id}
                onClick={() => setSelectedId(voyage.id)}
                className={`flex min-w-0 items-start gap-3 rounded-xl border p-3 text-left transition ${
                  selectedId === voyage.id
                    ? "border-cyan-300 bg-cyan-50"
                    : "border-slate-100 hover:bg-slate-50"
                }`}
              >
                <span
                  className="mt-1 size-3 shrink-0 rounded-full"
                  style={{ backgroundColor: voyage.color }}
                />

                <span className="min-w-0 flex-1">
                  <strong className="block break-words text-sm text-slate-800">
                    {voyage.origin} → {voyage.destination}
                  </strong>
                  <span className="mt-1 block text-xs text-slate-500">
                    {voyage.vessel} · {voyage.status}
                  </span>
                </span>

                <ChevronRight
                  size={15}
                  className="mt-1 shrink-0 text-slate-400"
                />
              </button>
            ))}
          </div>

          {selected && (
            <div className="mx-4 mb-4 mt-3 flex flex-wrap items-center gap-3 rounded-xl bg-sky-50 p-3 text-sm sm:mx-5">
              <MapPin size={17} className="text-sky-700" />
              <span className="min-w-0 flex-1 text-slate-700">
                <strong>{selected.origin}</strong> to{" "}
                <strong>{selected.destination}</strong>
                <span className="block text-xs text-slate-500">
                  {selected.id} · {selected.vessel}
                </span>
              </span>

              <button
                type="button"
                onClick={() => setSelectedId("")}
                className="rounded-lg p-1 text-slate-500 hover:bg-white"
                aria-label="Clear selected voyage"
              >
                <X size={16} />
              </button>
            </div>
          )}
        </>
      )}
    </article>
  );
}

export default function Dashboard() {
  const router = useRouter();

  const [active, setActive] = useState("Dashboard");
  const [query, setQuery] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [vessels, setVessels] = useState<Vessel[]>([]);
  const [voyageRecords, setVoyageRecords] = useState<DataRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadErrors, setLoadErrors] = useState<string[]>([]);

  const action = useCallback((message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 3500);
  }, []);

  const navigateTo = useCallback(
    (path: string) => {
      router.push(path);
    },
    [router],
  );

  const loadDashboard = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      const errors: string[] = [];

      const fetchEndpoint = async (path: string) => {
        try {
          const response = await fetch(`${API_BASE}${path}`, {
            cache: "no-store",
          });

          const data = await response.json().catch(() => null);

          if (!response.ok) {
            throw new Error(`${path}: HTTP ${response.status}`);
          }

          return data;
        } catch (error) {
          errors.push(
            error instanceof Error
              ? error.message
              : `${path}: request failed`,
          );
          return null;
        }
      };

      try {
        const [vesselData, shipmentData] = await Promise.all([
          fetchEndpoint("/vessels"),
          fetchEndpoint("/shipments"),
        ]);

        setVessels(recordList(vesselData) as Vessel[]);
        setVoyageRecords(recordList(shipmentData));
        setLoadErrors(errors);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [],
  );

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const counts = useMemo(() => {
    const available = vessels.filter(
      (vessel) => getStatus(vessel) === "AVAILABLE",
    ).length;

    const activeVoyages = vessels.filter((vessel) =>
      ["ON VOYAGE", "IN TRANSIT", "IN VOYAGE", "UNDERWAY"].includes(
        getStatus(vessel),
      ),
    ).length;

    const greenScores = vessels
      .map((vessel) =>
        numericValue(vessel, [
          "green_score",
          "sustainability_score",
          "greenScore",
        ]),
      )
      .filter((value): value is number => value !== null);

    const greenScore =
      greenScores.length > 0
        ? greenScores.reduce((sum, score) => sum + score, 0) /
          greenScores.length
        : null;

    return {
      total: vessels.length,
      available,
      activeVoyages,
      greenScore,
    };
  }, [vessels]);

  const mapVoyages = useMemo(
    () => extractMapVoyages(voyageRecords),
    [voyageRecords],
  );

  return (
    <main className="app-shell">
      <Sidebar
        active={active}
        mobileOpen={mobileOpen}
        onClose={() => setMobileOpen(false)}
        onNavigate={(label, href) => {
          setActive(label);
          setMobileOpen(false);
          if (href) router.push(href);
        }}
        onSettings={() => {
          setMobileOpen(false);
          router.push("/settings");
        }}
      />

      <section className="main-column">
        <Topbar
          active={active}
          query={query}
          onQueryChange={setQuery}
          onAction={action}
          onOpenMenu={() => setMobileOpen(true)}
        />

        <div className="dashboard-content">
          <section className="hero">
            <div className="hero-grid" />
            <div className="hero-glow" />

            <div className="hero-content">
              <div className="eyebrow">
                <span className="eyebrow-dot" />
                FLEET INTELLIGENCE
                <span className="eyebrow-line" />
              </div>

              {/* Updated: brighter, more readable hero heading */}
              <h1 className="!text-white">
                Navigate smarter.
                <br />
                <span className="!text-[#65e9e0]">Move greener.</span>
              </h1>

              <p>
                Your fleet, your voyages, your impact — all in one place.
              </p>

              <div className="hero-actions">
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => navigateTo(ROUTES.plan)}
                >
                  <Compass size={16} />
                  Plan a voyage
                  <ChevronRight size={15} />
                </button>

                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => navigateTo(ROUTES.optimize)}
                >
                  <Leaf size={16} />
                  Explore optimization
                </button>
              </div>
            </div>

            <div className="hero-visual" aria-hidden="true">
              <div className="radar-ring ring-a" />
              <div className="radar-ring ring-b" />
              <div className="radar-ring ring-c" />
              <div className="route-path route-a" />
              <div className="route-path route-b" />

              <span className="map-point point-a" />
              <span className="map-point point-b" />
              <span className="map-point point-c" />
              <span className="map-point point-d" />

              <Ship className="hero-ship ship-a" size={31} />
              <Ship className="hero-ship ship-b" size={22} />
              <Ship className="hero-ship ship-c" size={26} />

              <div className="live-chip">
                <span className="online-dot" />
                FLEET MONITOR
              </div>
            </div>

            <div className="hero-bottom">
              <span>
                <Waves size={14} /> INTELLIGENCE AT SEA
              </span>
              <span>
                BUILT FOR A BLUER FUTURE <Leaf size={13} />
              </span>
            </div>
          </section>

          <div className="section-heading">
            <div>
              <span className="section-kicker">AT A GLANCE</span>
              <h2>
                Fleet overview{" "}
                <span className="heading-period">/ Today</span>
              </h2>
            </div>

            <button
              type="button"
              className="updated-label"
              onClick={() => void loadDashboard(true)}
              disabled={loading || refreshing}
              title="Refresh dashboard data"
            >
              {refreshing ? (
                <LoaderCircle size={14} className="animate-spin" />
              ) : (
                <RefreshCw size={13} />
              )}
              {loading ? "Loading data" : "Live backend data"}
            </button>
          </div>

          {loadErrors.length > 0 && (
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <div>
                <p>
                  Some dashboard data could not be loaded. Values may be
                  unavailable until the relevant backend endpoints respond.
                </p>
                <ul className="mt-1 list-inside list-disc text-xs">
                  {loadErrors.map((error) => (
                    <li key={error}>{error}</li>
                  ))}
                </ul>
              </div>

              <button
                type="button"
                onClick={() => void loadDashboard(true)}
                className="inline-flex items-center gap-2 rounded-lg border border-amber-300 px-3 py-2 font-semibold"
              >
                <RefreshCw size={14} />
                Retry
              </button>
            </div>
          )}

          <section className="metrics-grid">
            <article className="metric-card metric-blue">
              <div className="metric-top">
                <span className="metric-icon">
                  <Ship size={19} />
                </span>
                <span className="metric-label">Total vessels</span>
              </div>

              <div className="metric-value">
                {loading ? "—" : counts.total}
                <span className="metric-unit">vessels</span>
              </div>

              <div className="metric-bottom">
                <span className="metric-watermark">
                  <Ship size={45} />
                </span>
              </div>

              <div className="metric-progress">
                <span
                  style={{
                    width:
                      counts.total > 0
                        ? `${(counts.available / counts.total) * 100}%`
                        : "0%",
                  }}
                />
              </div>
            </article>

            <article className="metric-card metric-teal">
              <div className="metric-top">
                <span className="metric-icon">
                  <Anchor size={19} />
                </span>
                <span className="metric-label">Available</span>
              </div>

              <div className="metric-value">
                {loading
                  ? "—"
                  : counts.available.toString().padStart(2, "0")}
                <span className="metric-unit">ready</span>
              </div>

              <div className="metric-bottom">
                <span className="metric-watermark">
                  <Anchor size={43} />
                </span>
              </div>

              <div className="metric-progress">
                <span
                  style={{
                    width:
                      counts.total > 0
                        ? `${(counts.available / counts.total) * 100}%`
                        : "0%",
                  }}
                />
              </div>
            </article>

            <article className="metric-card metric-violet">
              <div className="metric-top">
                <span className="metric-icon">
                  <Route size={19} />
                </span>
                <span className="metric-label">Active voyages</span>
              </div>

              <div className="metric-value">
                {loading
                  ? "—"
                  : counts.activeVoyages.toString().padStart(2, "0")}
                <span className="metric-unit">voyages</span>
              </div>

              <div className="metric-bottom">
                <span className="metric-watermark">
                  <Compass size={44} />
                </span>
              </div>

              <div className="metric-progress">
                <span
                  style={{
                    width:
                      counts.total > 0
                        ? `${(counts.activeVoyages / counts.total) * 100}%`
                        : "0%",
                  }}
                />
              </div>
            </article>

            <article className="metric-card metric-green">
              <div className="metric-top">
                <span className="metric-icon">
                  <Leaf size={19} />
                </span>
                <span className="metric-label">Green score</span>
              </div>

              <div className="metric-value">
                {loading
                  ? "—"
                  : counts.greenScore === null
                    ? "—"
                    : Math.round(counts.greenScore)}
                <span className="metric-unit">/100</span>
              </div>

              <div className="metric-bottom">
                <span className="metric-watermark">
                  <Waves size={47} />
                </span>
              </div>

              <div className="metric-progress">
                <span
                  style={{
                    width: `${Math.max(
                      0,
                      Math.min(100, counts.greenScore ?? 0),
                    )}%`,
                  }}
                />
              </div>
            </article>
          </section>

          {/* Updated: map and Quick actions now share a responsive layout */}
          <section className="mt-5 grid grid-cols-1 items-stretch gap-5 xl:grid-cols-[minmax(0,1.7fr)_minmax(280px,0.8fr)]">
            <div className="min-w-0">
              <VoyageMap voyages={mapVoyages} />
            </div>

            <article className="panel quick-panel flex min-w-0 flex-col self-stretch p-5 sm:p-6">
              <div className="panel-heading mb-3">
                <div>
                  <span className="panel-kicker">WORKSPACE</span>
                  <h3>Quick actions</h3>
                </div>

                <span className="panel-icon">
                  <Zap size={18} />
                </span>
              </div>

              <button
                type="button"
                className="quick-action"
                onClick={() => navigateTo(ROUTES.plan)}
              >
                <span className="quick-icon blue-icon">
                  <Compass size={19} />
                </span>
                <span className="quick-copy">
                  <strong>Plan a new voyage</strong>
                  <small>Explore routes and vessel options</small>
                </span>
                <ChevronRight size={17} />
              </button>

              <button
                type="button"
                className="quick-action"
                onClick={() => navigateTo(ROUTES.shipments)}
              >
                <span className="quick-icon teal-icon">
                  <Package size={19} />
                </span>
                <span className="quick-copy">
                  <strong>Create a shipment</strong>
                  <small>Open shipment management</small>
                </span>
                <ChevronRight size={17} />
              </button>

              <button
                type="button"
                className="quick-action"
                onClick={() => navigateTo(ROUTES.fleet)}
              >
                <span className="quick-icon violet-icon">
                  <Ship size={19} />
                </span>
                <span className="quick-copy">
                  <strong>Manage fleet</strong>
                  <small>Review vessels and availability</small>
                </span>
                <ChevronRight size={17} />
              </button>

              <button
                type="button"
                className="quick-action"
                onClick={() => navigateTo(ROUTES.optimize)}
              >
                <span className="quick-icon green-icon">
                  <Sparkles size={19} />
                </span>
                <span className="quick-copy">
                  <strong>Optimize greener</strong>
                  <small>Open fleet optimization</small>
                </span>
                <ChevronRight size={17} />
              </button>

              <div className="quick-footer mt-auto pt-4">
                <span className="quick-footer-mark">
                  <Leaf size={15} />
                </span>
                <span>
                  <strong>Every voyage matters.</strong>
                  <small>
                    Make efficiency part of every decision.
                  </small>
                </span>
              </div>
            </article>
          </section>

          <footer className="page-footer">
            <span>
              © 2026 EcoFleet AI{" "}
              <span className="footer-separator">·</span>{" "}
              Intelligent maritime operations
            </span>
            <span>
              <span className="footer-wave">
                <Waves size={15} />
              </span>
              Designed for a bluer future
            </span>
          </footer>
        </div>
      </section>

      {notice && (
        <div className="toast-message" role="status">
          <span className="toast-check">
            <Zap size={16} />
          </span>
          <span>{notice}</span>
          <button
            type="button"
            aria-label="Dismiss message"
            onClick={() => setNotice("")}
          >
            <X size={16} />
          </button>
        </div>
      )}
    </main>
  );
}
