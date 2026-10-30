"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Sidebar from "@/components/layout/Sidebar";
import Topbar from "@/components/layout/Topbar";
import {
  Activity,
  AlertTriangle,
  Anchor,
  CheckCircle2,
  Clock3,
  FileSpreadsheet,
  LoaderCircle,
  Plus,
  RefreshCw,
  Search,
  Ship,
  Trash2,
  Upload,
  X,
  Wrench,
} from "lucide-react";

const API_BASE = (
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000"
).replace(/\/$/, "");

const STATUS_OPTIONS = [
  "AVAILABLE",
  "ON_VOYAGE",
  "MAINTENANCE",
  "UNAVAILABLE",
] as const;

const IMPORT_FIELDS = [
  "vessel_id",
  "vessel_name",
  "vessel_type",
  "capacity_tons",
  "deadweight_tonnes",
  "engine_power_kw",
  "min_speed",
  "max_speed",
  "fuel_type",
  "fuel_consumption",
  "operating_cost_per_hour",
  "propulsion_type",
  "status",
];

type Vessel = Record<string, unknown> & {
  vessel_id?: string;
  vessel_name?: string;
  status?: string;
  name?: string;
  id?: string;
};

type Port = Record<string, unknown>;

type Mapping = {
  source_column: string;
  suggested_field: string | null;
  [key: string]: unknown;
};

type VesselForm = {
  vessel_id: string;
  vessel_name: string;
  vessel_type: string;
  current_port_locode: string;
  capacity_tons: string;
  deadweight_tonnes: string;
  engine_power_kw: string;
  min_speed_mps: string;
  max_speed_mps: string;
  fuel_type: string;
  fuel_consumption: string;
  operating_cost_per_hour: string;
  propulsion_type: string;
  status: string;
};

const EMPTY_FORM: VesselForm = {
  vessel_id: "",
  vessel_name: "",
  vessel_type: "Unknown",
  current_port_locode: "",
  capacity_tons: "",
  deadweight_tonnes: "",
  engine_power_kw: "",
  min_speed_mps: "",
  max_speed_mps: "",
  fuel_type: "",
  fuel_consumption: "",
  operating_cost_per_hour: "",
  propulsion_type: "",
  status: "AVAILABLE",
};

function vesselId(v: Vessel) {
  const value = v.vessel_id ?? v.id;
  return value == null ? "" : String(value);
}

function vesselName(v: Vessel) {
  return String(v.vessel_name ?? v.name ?? vesselId(v) ?? "Unnamed vessel");
}

function vesselStatus(v: Vessel) {
  return String(v.status ?? "UNKNOWN").toUpperCase();
}

function displayValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/* Supports common port API field names. */
function portName(port: Port) {
  return String(
    port.port_name ??
      port.name ??
      port.port ??
      port.portName ??
      port.port_name_en ??
      port.city ??
      ""
  ).trim();
}

function portLocode(port: Port) {
  return String(
    port.locode ??
      port.port_locode ??
      port.port_code ??
      port.code ??
      port.unlocode ??
      port.portCode ??
      port.port_id ??
      ""
  ).trim();
}

function statusStyle(status: string) {
  switch (status) {
    case "AVAILABLE":
      return "bg-emerald-50 text-emerald-800 border-emerald-100";
    case "ON_VOYAGE":
      return "bg-sky-50 text-sky-800 border-sky-100";
    case "MAINTENANCE":
      return "bg-amber-50 text-amber-900 border-amber-100";
    case "UNAVAILABLE":
      return "bg-rose-50 text-rose-800 border-rose-100";
    default:
      return "bg-slate-100 text-slate-700 border-slate-200";
  }
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${statusStyle(status)}`}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {status.replaceAll("_", " ")}
    </span>
  );
}

/* Original metric-card design preserved */
function MetricCard({
  label,
  value,
  icon,
  tone,
  accent,
}: {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  tone: "blue" | "mint" | "violet" | "green";
  accent: string;
}) {
  const tones = {
    blue: {
      icon: "bg-sky-100/80 text-sky-500",
      glow: "bg-sky-100/40",
      watermark: "text-sky-100",
    },
    mint: {
      icon: "bg-teal-50 text-teal-400",
      glow: "bg-teal-100/40",
      watermark: "text-teal-100",
    },
    violet: {
      icon: "bg-violet-100/80 text-violet-500",
      glow: "bg-violet-100/40",
      watermark: "text-violet-100",
    },
    green: {
      icon: "bg-emerald-50 text-emerald-400",
      glow: "bg-emerald-100/40",
      watermark: "text-emerald-100",
    },
  };

  const style = tones[tone];

  return (
    <article className="group relative isolate flex min-h-[142px] flex-col justify-between overflow-hidden rounded-2xl border border-sky-100/90 bg-gradient-to-br from-white via-white to-sky-50/50 p-4 shadow-[0_2px_8px_rgba(15,65,95,0.045)] transition-all duration-300 hover:-translate-y-1 hover:border-sky-200 hover:shadow-[0_12px_28px_rgba(15,65,95,0.10)] sm:p-5">
      <div
        className={`pointer-events-none absolute -right-7 -top-8 -z-10 size-28 rounded-full blur-2xl ${style.glow}`}
      />
      <div className="flex items-center gap-2.5">
        <span
          className={`grid size-9 shrink-0 place-items-center rounded-xl ${style.icon}`}
        >
          {icon}
        </span>
        <p className="min-w-0 text-xs font-semibold tracking-wide text-slate-500 sm:text-sm">
          {label}
        </p>
      </div>
      <div className="relative mt-4 flex items-end gap-2">
        <p className="text-3xl font-bold leading-none tracking-tight text-[#174e79] sm:text-[2rem]">
          {value}
        </p>
        <span className="mb-0.5 text-[10px] font-medium text-slate-400">
          {label === "Total vessels"
            ? "vessels"
            : label === "Available"
              ? "ready"
              : label === "On voyage"
                ? "voyages"
                : "vessels"}
        </span>
        <span
          className={`pointer-events-none absolute -bottom-1 right-0 -z-10 opacity-80 ${style.watermark}`}
        >
          {icon}
        </span>
      </div>
      <div className="mt-5 h-[3px] overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-full rounded-full ${accent} transition-all duration-500 group-hover:w-full`}
          style={{
            width:
              typeof value === "number"
                ? `${Math.min(100, Math.max(12, value * 10))}%`
                : "35%",
          }}
        />
      </div>
    </article>
  );
}

function Field({
  label,
  name,
  value,
  onChange,
  required = false,
  type = "text",
  placeholder,
  step,
  min,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (name: string, value: string) => void;
  required?: boolean;
  type?: string;
  placeholder?: string;
  step?: string;
  min?: string;
}) {
  return (
    <label className="block min-w-0">
      <span className="mb-1.5 block text-sm font-medium text-slate-700">
        {label}
        {required && <span className="text-rose-600"> *</span>}
      </span>
      <input
        name={name}
        type={type}
        value={value}
        onChange={(e) => onChange(name, e.target.value)}
        required={required}
        placeholder={placeholder}
        step={step}
        min={min}
        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-cyan-600 focus:ring-2 focus:ring-cyan-100"
      />
    </label>
  );
}

export default function FleetManagementPage() {
  const [active, setActive] = useState("Fleet Management");
  const [query, setQuery] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [vessels, setVessels] = useState<Vessel[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [selectedVessel, setSelectedVessel] = useState<Vessel | null>(null);
  const [details, setDetails] = useState<Vessel | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [changingStatus, setChangingStatus] = useState("");

  const [manualOpen, setManualOpen] = useState(false);
  const [form, setForm] = useState<VesselForm>({ ...EMPTY_FORM });
  const [savingVessel, setSavingVessel] = useState(false);
  const [formError, setFormError] = useState("");

  /* Port autocomplete state */
  const [ports, setPorts] = useState<Port[]>([]);
  const [portsLoading, setPortsLoading] = useState(false);
  const [portsError, setPortsError] = useState("");
  const [portQuery, setPortQuery] = useState("");
  const [showPortSuggestions, setShowPortSuggestions] = useState(false);

  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [confirmingImport, setConfirmingImport] = useState(false);
  const [importError, setImportError] = useState("");
  const [importMessage, setImportMessage] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [importReport, setImportReport] =
    useState<Record<string, unknown> | null>(null);

  const action = useCallback((message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 3500);
  }, []);

  const request = useCallback(
    async (endpoint: string, options?: RequestInit) => {
      const isFormData = options?.body instanceof FormData;

      const response = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        headers: {
          ...(isFormData ? {} : { "Content-Type": "application/json" }),
          ...options?.headers,
        },
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        const detail = data.detail ?? data.message;
        const message =
          typeof detail === "string"
            ? detail
            : Array.isArray(detail)
              ? detail
                  .map((item: { msg?: string }) => item.msg ?? "")
                  .join("; ")
              : `Request failed (${response.status})`;

        throw new Error(message);
      }

      return data;
    },
    [],
  );

  const loadVessels = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    setError("");

    try {
      const response = await fetch(`${API_BASE}/vessels`, {
        cache: "no-store",
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          typeof data.detail === "string"
            ? data.detail
            : `Vessel request failed (${response.status})`,
        );
      }

      const list = Array.isArray(data)
        ? data
        : Array.isArray(data.vessels)
          ? data.vessels
          : null;

      if (!list) {
        throw new Error("The API response did not contain a vessel list.");
      }

      setVessels(list as Vessel[]);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not load vessels.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadVessels();
  }, [loadVessels]);

  /* Load ports for autocomplete */
  useEffect(() => {
    let cancelled = false;

    async function loadPorts() {
      setPortsLoading(true);
      setPortsError("");

      try {
        const response = await fetch(`${API_BASE}/ports`, {
          cache: "no-store",
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(
            typeof data.detail === "string"
              ? data.detail
              : `Port request failed (${response.status})`,
          );
        }

        const list = Array.isArray(data)
          ? data
          : Array.isArray(data.ports)
            ? data.ports
            : Array.isArray(data.items)
              ? data.items
              : Array.isArray(data.data)
                ? data.data
                : null;

        if (!list) {
          throw new Error("The API response did not contain a port list.");
        }

        if (!cancelled) {
          setPorts(list as Port[]);
        }
      } catch (err) {
        if (!cancelled) {
          setPortsError(
            err instanceof Error
              ? err.message
              : "Could not load ports.",
          );
        }
      } finally {
        if (!cancelled) setPortsLoading(false);
      }
    }

    void loadPorts();

    return () => {
      cancelled = true;
    };
  }, []);

  /* Generate the first unused V001-style ID */
  const generatedVesselId = useMemo(() => {
    const usedIds = new Set(
      vessels.map((vessel) => vesselId(vessel).trim().toUpperCase()),
    );

    let number = 1;

    while (usedIds.has(`V${String(number).padStart(3, "0")}`)) {
      number += 1;
    }

    return `V${String(number).padStart(3, "0")}`;
  }, [vessels]);

  /* Match suggestions by port name or LOCODE */
  const filteredPorts = useMemo(() => {
    const search = portQuery.trim().toLowerCase();

    if (!search) return [];

    return ports
      .filter((port) => {
        const name = portName(port).toLowerCase();
        const code = portLocode(port).toLowerCase();

        return (
          (name || code) &&
          (name.includes(search) || code.includes(search))
        );
      })
      .slice(0, 8);
  }, [ports, portQuery]);

  const counts = useMemo(() => {
    const count = (status: string) =>
      vessels.filter((v) => vesselStatus(v) === status).length;

    return {
      total: vessels.length,
      available: count("AVAILABLE"),
      onVoyage: count("ON_VOYAGE"),
      maintenance: count("MAINTENANCE"),
      unavailable: count("UNAVAILABLE"),
    };
  }, [vessels]);

  const filteredVessels = useMemo(() => {
    const normalized = query.trim().toLowerCase();

    return vessels.filter((v) => {
      if (statusFilter !== "ALL" && vesselStatus(v) !== statusFilter) {
        return false;
      }

      if (!normalized) return true;

      return Object.entries(v).some(([key, value]) => {
        if (value == null) return false;

        const text =
          typeof value === "object"
            ? JSON.stringify(value)
            : String(value);

        return (
          key.toLowerCase().includes(normalized) ||
          text.toLowerCase().includes(normalized)
        );
      });
    });
  }, [vessels, query, statusFilter]);

  function updateForm(name: string, value: string) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  function selectPort(port: Port) {
    const code = portLocode(port);
    const name = portName(port);

    if (!code) {
      setFormError(
        "This port has no LOCODE/code in the API response. Please check the port data.",
      );
      return;
    }

    updateForm("current_port_locode", code);
    setPortQuery(name ? `${name} (${code})` : code);
    setShowPortSuggestions(false);
    setFormError("");
  }

  function openManualForm() {
    setForm({ ...EMPTY_FORM });
    setFormError("");
    setPortQuery("");
    setShowPortSuggestions(false);
    setManualOpen(true);
  }

  async function addVessel(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");

    const capacity = Number(form.capacity_tons);
    const minSpeed = Number(form.min_speed_mps);
    const maxSpeed = Number(form.max_speed_mps);

    if (!form.vessel_name.trim()) {
      setFormError("Vessel name is required.");
      return;
    }

    if (!Number.isFinite(capacity) || capacity <= 0) {
      setFormError("Capacity must be greater than zero.");
      return;
    }

    if (!Number.isFinite(minSpeed) || minSpeed <= 0) {
      setFormError("Minimum speed must be greater than zero.");
      return;
    }

    if (!Number.isFinite(maxSpeed) || maxSpeed <= minSpeed) {
      setFormError(
        "Maximum speed must be greater than minimum speed.",
      );
      return;
    }

    /* Use the generated ID instead of asking the user to type one */
    const payload: Record<string, unknown> = {
      vessel_id: generatedVesselId,
      vessel_name: form.vessel_name.trim(),
      vessel_type: form.vessel_type.trim() || "Unknown",
      capacity_tons: capacity,
      min_speed_mps: minSpeed,
      max_speed_mps: maxSpeed,
      status: form.status,
    };

    if (form.current_port_locode.trim()) {
      payload.current_port_locode = form.current_port_locode.trim();
    }

    if (form.fuel_type.trim()) {
      payload.fuel_type = form.fuel_type.trim();
    }

    if (form.propulsion_type.trim()) {
      payload.propulsion_type = form.propulsion_type.trim();
    }

    const optionalNumbers = [
      "deadweight_tonnes",
      "engine_power_kw",
      "fuel_consumption",
      "operating_cost_per_hour",
    ] as const;

    for (const key of optionalNumbers) {
      if (!form[key].trim()) continue;

      const value = Number(form[key]);

      if (!Number.isFinite(value) || value <= 0) {
        setFormError(
          `${key.replaceAll("_", " ")} must be greater than zero.`,
        );
        return;
      }

      payload[key] = value;
    }

    setSavingVessel(true);

    try {
      await request("/vessels", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      setForm({ ...EMPTY_FORM });
      setPortQuery("");
      setShowPortSuggestions(false);
      setManualOpen(false);

      action(`Vessel ${generatedVesselId} added successfully.`);
      await loadVessels(true);
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : "Could not add vessel.",
      );
    } finally {
      setSavingVessel(false);
    }
  }

  async function uploadFile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setImportError("");
    setImportMessage("");
    setImportReport(null);
    setSessionId("");
    setMappings([]);

    if (!file) {
      return setImportError("Choose a CSV or XLSX file first.");
    }

    const extension = file.name.split(".").pop()?.toLowerCase();

    if (!["csv", "xlsx"].includes(extension ?? "")) {
      return setImportError("Only .csv and .xlsx files are supported.");
    }

    if (!file.size) {
      return setImportError("The selected file is empty.");
    }

    if (file.size > 10 * 1024 * 1024) {
      return setImportError("File size must be 10 MB or less.");
    }

    const body = new FormData();
    body.append("file", file);
    setUploading(true);

    try {
      const result = await request("/fleet/upload", {
        method: "POST",
        body,
      });

      if (!result.session_id || !Array.isArray(result.mappings)) {
        throw new Error(
          "The upload response is missing import session data.",
        );
      }

      setSessionId(String(result.session_id));
      setMappings(result.mappings as Mapping[]);
      setImportMessage(
        `File analyzed: ${result.record_count ?? "?"} rows found. Review the mappings before importing.`,
      );
    } catch (err) {
      setImportError(
        err instanceof Error ? err.message : "File upload failed.",
      );
    } finally {
      setUploading(false);
    }
  }

  async function confirmImport() {
    if (!sessionId) {
      return setImportError("Upload a file before confirming.");
    }

    setImportError("");
    setImportMessage("");
    setConfirmingImport(true);

    try {
      const result = await request("/fleet/mapping/confirm", {
        method: "POST",
        body: JSON.stringify({ session_id: sessionId, mappings }),
      });

      setImportReport(result);

      if (result.success === false) {
        const errors = Array.isArray(result.errors)
          ? result.errors.length
          : 0;

        const duplicates = Array.isArray(result.duplicates)
          ? result.duplicates.length
          : 0;

        setImportError(
          `Import needs correction: ${errors} validation issue(s), ${duplicates} duplicate ID issue(s). Review the report below.`,
        );
        return;
      }

      setImportMessage(
        String(result.message ?? "Import completed successfully."),
      );

      setSessionId("");
      setMappings([]);
      setFile(null);

      await loadVessels(true);
    } catch (err) {
      setImportError(
        err instanceof Error
          ? err.message
          : "Could not confirm import.",
      );
    } finally {
      setConfirmingImport(false);
    }
  }

  async function openDetails(vessel: Vessel) {
    setSelectedVessel(vessel);
    setDetails(vessel);

    const id = vesselId(vessel);
    if (!id) return;

    setDetailsLoading(true);

    try {
      const data = await request(`/vessels/${encodeURIComponent(id)}`);
      const item = (data.vessel ?? data) as Vessel;

      setDetails(item);
      setSelectedVessel(item);
    } catch (err) {
      action(
        err instanceof Error
          ? `Showing list data: ${err.message}`
          : "Showing available vessel information.",
      );
    } finally {
      setDetailsLoading(false);
    }
  }

  async function updateStatus(vessel: Vessel, status: string) {
    const id = vesselId(vessel);

    if (!id) return action("Vessel ID is missing.");

    setBusyId(id);

    try {
      await request(`/vessels/${encodeURIComponent(id)}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });

      setVessels((current) =>
        current.map((v) =>
          vesselId(v) === id ? { ...v, status } : v,
        ),
      );

      setDetails((current) =>
        current && vesselId(current) === id
          ? { ...current, status }
          : current,
      );

      setSelectedVessel((current) =>
        current && vesselId(current) === id
          ? { ...current, status }
          : current,
      );

      action(`Vessel status updated to ${status.replaceAll("_", " ")}.`);
      await loadVessels(true);
    } catch (err) {
      action(
        err instanceof Error ? err.message : "Status update failed.",
      );
    } finally {
      setBusyId("");
      setChangingStatus("");
    }
  }

  async function deleteVessel(vessel: Vessel) {
    const id = vesselId(vessel);

    if (!id) return action("Vessel ID is missing.");

    if (
      !window.confirm(
        `Delete ${vesselName(vessel)} (${id})? This action cannot be undone.`,
      )
    ) {
      return;
    }

    setBusyId(id);

    try {
      await request(`/vessels/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });

      setVessels((current) =>
        current.filter((v) => vesselId(v) !== id),
      );

      if (vesselId(selectedVessel ?? {}) === id) {
        setSelectedVessel(null);
        setDetails(null);
      }

      action(`${vesselName(vessel)} was deleted.`);
    } catch (err) {
      action(
        err instanceof Error ? err.message : "Could not delete vessel.",
      );
    } finally {
      setBusyId("");
    }
  }

  const inputClass =
    "rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-cyan-600 focus:ring-2 focus:ring-cyan-100";

  const primaryButton =
    "inline-flex items-center justify-center gap-2 rounded-xl bg-sky-800 px-4 py-2.5 text-sm font-semibold !text-white transition hover:bg-sky-900 disabled:cursor-not-allowed disabled:opacity-50";

  const secondaryButton =
    "inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50";

  return (
    <main className="app-shell">
      <Sidebar
        active={active}
        mobileOpen={mobileOpen}
        onClose={() => setMobileOpen(false)}
        onNavigate={(label, href) => {
          setActive(label);
          setMobileOpen(false);

          if (href !== "/fleet") action(`${label} selected.`);
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
                  <Anchor size={16} /> Fleet intelligence
                </div>

                <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
                  Manage your <span className="text-teal-300">fleet.</span>
                </h1>

                <p className="mt-3 max-w-xl text-sm leading-6 text-sky-100">
                  Monitor vessel availability and status using live data from
                  your EcoFleet AI backend.
                </p>
              </div>

              <div className="min-w-0 rounded-xl border border-white/15 bg-white/10 px-4 py-3 text-sm">
                <div className="flex items-center gap-2 text-cyan-100">
                  <Activity size={16} /> Backend connection
                </div>

                <div className="mt-1 font-semibold">
                  {loading
                    ? "Connecting..."
                    : error
                      ? "Needs attention"
                      : "Vessels endpoint responded"}
                </div>

                <div className="mt-1 max-w-[240px] break-all text-xs text-sky-100/80">
                  {API_BASE}/vessels
                </div>
              </div>
            </div>
          </section>

          {error && (
            <div
              role="alert"
              className="mb-5 flex flex-wrap items-start justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"
            >
              <div className="flex items-start gap-2">
                <AlertTriangle size={18} className="mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>

              <button
                onClick={() => void loadVessels(true)}
                className={secondaryButton}
              >
                <RefreshCw size={15} /> Retry
              </button>
            </div>
          )}

          <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label="Total vessels"
              value={loading ? "—" : counts.total}
              tone="blue"
              accent="bg-gradient-to-r from-sky-400 to-cyan-300"
              icon={<Ship size={19} />}
            />

            <MetricCard
              label="Available"
              value={loading ? "—" : counts.available}
              tone="mint"
              accent="bg-gradient-to-r from-teal-400 to-emerald-300"
              icon={<CheckCircle2 size={19} />}
            />

            <MetricCard
              label="On voyage"
              value={loading ? "—" : counts.onVoyage}
              tone="violet"
              accent="bg-gradient-to-r from-violet-400 to-purple-300"
              icon={<Activity size={19} />}
            />

            <MetricCard
              label="Maintenance / unavailable"
              value={loading ? "—" : counts.maintenance + counts.unavailable}
              tone="green"
              accent="bg-gradient-to-r from-emerald-400 to-teal-300"
              icon={<Wrench size={19} />}
            />
          </section>

          <section className="mt-5 rounded-2xl border border-sky-100 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => {
                  setManualOpen(false);
                  setImportError("");
                }}
                className={`${primaryButton} !text-white`}
              >
                <span className="grid size-5 place-items-center text-white">
                  <Ship size={16} />
                </span>
                View vessels
              </button>

              <button
                onClick={openManualForm}
                className={`${secondaryButton} hover:border-sky-300 hover:bg-sky-50`}
              >
                <Plus size={16} /> Add vessel manually
              </button>

              <button
                onClick={() => {
                  setManualOpen(false);
                  setImportError("");
                }}
                className={`${secondaryButton} hover:border-sky-300 hover:bg-sky-50`}
              >
                <FileSpreadsheet size={16} /> Import Excel / CSV
              </button>
            </div>

            <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50/70 p-4">
              <form
                onSubmit={uploadFile}
                className="flex flex-col gap-3 sm:flex-row sm:items-end"
              >
                <label className="block min-w-0 flex-1">
                  <span className="mb-1.5 block text-sm font-medium text-slate-700">
                    Excel / CSV file (.xlsx, .csv; max 10 MB)
                  </span>

                  <input
                    type="file"
                    accept=".csv,.xlsx"
                    onChange={(e) => {
                      setFile(e.target.files?.[0] ?? null);
                      setSessionId("");
                      setMappings([]);
                      setImportReport(null);
                      setImportError("");
                      setImportMessage("");
                    }}
                    className="block w-full rounded-xl border border-slate-200 bg-white p-2 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-sky-50 file:px-3 file:py-2 file:font-semibold file:text-sky-800"
                  />
                </label>

                <button
                  type="submit"
                  disabled={uploading || !file}
                  className={`${primaryButton} !bg-violet-700 !text-white hover:!bg-violet-800`}
                >
                  {uploading ? (
                    <LoaderCircle size={16} className="animate-spin" />
                  ) : (
                    <Upload size={16} />
                  )}
                  {uploading ? "Analyzing..." : "Upload and analyze"}
                </button>
              </form>

              {importError && (
                <p
                  role="alert"
                  className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800"
                >
                  {importError}
                </p>
              )}

              {importMessage && (
                <p
                  role="status"
                  className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"
                >
                  {importMessage}
                </p>
              )}

              {mappings.length > 0 && sessionId && (
                <div className="mt-4">
                  <h3 className="font-semibold text-slate-800">
                    Review column mappings
                  </h3>

                  <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200 bg-white">
                    <table className="w-full min-w-[500px] text-left text-sm">
                      <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                        <tr>
                          <th className="px-4 py-2.5">File column</th>
                          <th className="px-4 py-2.5">Vessel field</th>
                        </tr>
                      </thead>

                      <tbody className="divide-y divide-slate-100">
                        {mappings.map((mapping, index) => (
                          <tr key={`${mapping.source_column}-${index}`}>
                            <td className="break-words px-4 py-2.5 font-medium text-slate-700">
                              {mapping.source_column}
                            </td>

                            <td className="px-4 py-2.5">
                              <select
                                value={mapping.suggested_field ?? ""}
                                onChange={(e) =>
                                  setMappings((current) =>
                                    current.map((m, i) =>
                                      i === index
                                        ? {
                                            ...m,
                                            suggested_field:
                                              e.target.value || null,
                                          }
                                        : m,
                                    ),
                                  )
                                }
                                className={`${inputClass} w-full`}
                              >
                                <option value="">Do not import</option>
                                {IMPORT_FIELDS.map((field) => (
                                  <option key={field} value={field}>
                                    {field.replaceAll("_", " ")}
                                  </option>
                                ))}
                              </select>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <button
                    onClick={() => void confirmImport()}
                    disabled={confirmingImport}
                    className={`${primaryButton} mt-3`}
                  >
                    {confirmingImport && (
                      <LoaderCircle size={16} className="animate-spin" />
                    )}
                    {confirmingImport
                      ? "Importing..."
                      : "Confirm mappings and import"}
                  </button>
                </div>
              )}

              {importReport && (
                <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
                  <h3 className="font-semibold text-slate-800">
                    Import report
                  </h3>
                  <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words text-xs leading-5 text-slate-700">
                    {JSON.stringify(importReport, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </section>

          {/* Fleet directory */}
          <section className="mt-4 overflow-hidden rounded-2xl border border-sky-100 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 md:px-5">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-cyan-700">
                  Fleet directory
                </p>
                <h2 className="mt-0.5 text-lg font-bold text-slate-800">
                  Vessel inventory
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  Search, inspect, and manage vessel status.
                </p>
              </div>

              <button
                onClick={() => void loadVessels(true)}
                disabled={loading || refreshing}
                className={secondaryButton}
              >
                {refreshing ? (
                  <LoaderCircle size={15} className="animate-spin" />
                ) : (
                  <RefreshCw size={15} />
                )}
                Refresh
              </button>
            </div>

            <div className="flex flex-col gap-2 border-b border-slate-100 px-4 py-3 md:flex-row md:items-center md:justify-between md:px-5">
              <div className="relative min-w-0 flex-1 md:max-w-md">
                <Search
                  size={16}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search vessels or fields..."
                  className={`${inputClass} w-full py-2 pl-9`}
                />
              </div>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className={`${inputClass} py-2`}
                aria-label="Filter by vessel status"
              >
                <option value="ALL">All statuses</option>
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s.replaceAll("_", " ")}
                  </option>
                ))}
                <option value="UNKNOWN">Unknown status</option>
              </select>
            </div>

            <div className="px-5 py-2 text-[11px] text-slate-500">
              Showing {filteredVessels.length} of {vessels.length} vessels
            </div>

            {loading ? (
              <div className="flex min-h-48 flex-col items-center justify-center p-6 text-center">
                <LoaderCircle
                  size={26}
                  className="animate-spin text-cyan-700"
                />
                <p className="mt-2 text-sm font-semibold text-slate-700">
                  Loading fleet inventory...
                </p>
              </div>
            ) : filteredVessels.length === 0 ? (
              <div className="flex min-h-44 flex-col items-center justify-center p-6 text-center">
                <Ship size={27} className="text-sky-700" />
                <h3 className="mt-2 text-sm font-semibold text-slate-800">
                  {vessels.length === 0
                    ? "No vessels returned"
                    : "No matching vessels"}
                </h3>
                <p className="mt-1 text-xs text-slate-500">
                  {vessels.length === 0
                    ? "Add a vessel or import a spreadsheet."
                    : "Try another search or status filter."}
                </p>
              </div>
            ) : (
              <>
                <div className="hidden max-h-[360px] overflow-auto md:block">
                  <table className="w-full min-w-[720px] text-left text-xs">
                    <thead className="sticky top-0 z-10 bg-slate-50 uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-4 py-2.5 font-semibold">Vessel</th>
                        <th className="px-4 py-2.5 font-semibold">
                          Vessel ID
                        </th>
                        <th className="px-4 py-2.5 font-semibold">Status</th>
                        <th className="px-4 py-2.5 font-semibold">
                          Other details
                        </th>
                        <th className="px-4 py-2.5 text-right font-semibold">
                          Actions
                        </th>
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-slate-100">
                      {filteredVessels.map((vessel, index) => {
                        const id = vesselId(vessel);
                        const status = vesselStatus(vessel);
                        const busy = busyId === id;

                        const extra = Object.entries(vessel).filter(
                          ([key]) =>
                            ![
                              "vessel_id",
                              "id",
                              "vessel_name",
                              "name",
                              "status",
                            ].includes(key),
                        );

                        return (
                          <tr
                            key={id || index}
                            className="transition hover:bg-sky-50/40"
                          >
                            <td className="px-4 py-2.5">
                              <div className="flex items-center gap-2.5">
                                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-sky-50 text-sky-800">
                                  <Ship size={16} />
                                </span>
                                <span className="font-semibold text-slate-800">
                                  {vesselName(vessel)}
                                </span>
                              </div>
                            </td>

                            <td className="px-4 py-2.5 font-mono text-[11px] text-slate-600">
                              {id || "—"}
                            </td>

                            <td className="px-4 py-2.5">
                              <StatusBadge status={status} />
                            </td>

                            <td className="max-w-xs px-4 py-2.5 leading-4 text-slate-500">
                              {extra.length
                                ? extra
                                    .slice(0, 2)
                                    .map(
                                      ([k, v]) =>
                                        `${k.replaceAll("_", " ")}: ${displayValue(v)}`,
                                    )
                                    .join(" · ")
                                : "—"}
                            </td>

                            <td className="px-4 py-2.5">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  onClick={() => void openDetails(vessel)}
                                  className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                                >
                                  Details
                                </button>

                                <button
                                  onClick={() => setChangingStatus(id)}
                                  disabled={!id || busy}
                                  title="Change status"
                                  className="rounded-lg border border-sky-200 p-1.5 text-sky-800 hover:bg-sky-50 disabled:opacity-40"
                                >
                                  <RefreshCw size={13} />
                                </button>

                                <button
                                  onClick={() => void deleteVessel(vessel)}
                                  disabled={!id || busy}
                                  title="Delete vessel"
                                  className="rounded-lg border border-rose-200 p-1.5 text-rose-700 hover:bg-rose-50 disabled:opacity-40"
                                >
                                  {busy ? (
                                    <LoaderCircle
                                      size={13}
                                      className="animate-spin"
                                    />
                                  ) : (
                                    <Trash2 size={13} />
                                  )}
                                </button>
                              </div>

                              {changingStatus === id && (
                                <div className="mt-2 flex justify-end gap-1.5">
                                  <select
                                    id={`status-${id}`}
                                    defaultValue={status}
                                    className="max-w-36 rounded-lg border border-slate-200 px-2 py-1.5 text-[11px]"
                                    aria-label={`New status for ${vesselName(vessel)}`}
                                  >
                                    {STATUS_OPTIONS.map((s) => (
                                      <option key={s} value={s}>
                                        {s.replaceAll("_", " ")}
                                      </option>
                                    ))}
                                  </select>

                                  <button
                                    disabled={busy}
                                    onClick={() => {
                                      const el = document.getElementById(
                                        `status-${id}`,
                                      ) as HTMLSelectElement | null;

                                      if (el) {
                                        void updateStatus(vessel, el.value);
                                      }
                                    }}
                                    className="rounded-lg bg-sky-800 px-2 py-1.5 text-[11px] font-semibold text-white disabled:opacity-50"
                                  >
                                    Save
                                  </button>

                                  <button
                                    onClick={() => setChangingStatus("")}
                                    className="rounded-lg border border-slate-200 px-2 py-1.5 text-[11px]"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="space-y-3 p-3 md:hidden">
                  {filteredVessels.map((vessel, index) => {
                    const id = vesselId(vessel);
                    const status = vesselStatus(vessel);

                    return (
                      <article
                        key={id || index}
                        className="rounded-xl border border-slate-200 p-3"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex min-w-0 items-center gap-2.5">
                            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-sky-50 text-sky-800">
                              <Ship size={16} />
                            </span>

                            <div className="min-w-0">
                              <h3 className="break-words text-sm font-semibold text-slate-800">
                                {vesselName(vessel)}
                              </h3>
                              <p className="mt-1 font-mono text-[11px] text-slate-500">
                                {id || "No ID returned"}
                              </p>
                            </div>
                          </div>

                          <StatusBadge status={status} />
                        </div>

                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            onClick={() => void openDetails(vessel)}
                            className={secondaryButton}
                          >
                            Details
                          </button>

                          <button
                            onClick={() => setChangingStatus(id)}
                            disabled={!id || busyId === id}
                            className={secondaryButton}
                          >
                            Change status
                          </button>

                          <button
                            onClick={() => void deleteVessel(vessel)}
                            disabled={!id || busyId === id}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-700 disabled:opacity-40"
                          >
                            <Trash2 size={13} /> Delete
                          </button>
                        </div>

                        {changingStatus === id && (
                          <div className="mt-3 flex flex-wrap gap-2">
                            <select
                              id={`mobile-status-${id}`}
                              defaultValue={status}
                              className={`${inputClass} min-w-0 flex-1`}
                              aria-label={`New status for ${vesselName(vessel)}`}
                            >
                              {STATUS_OPTIONS.map((s) => (
                                <option key={s} value={s}>
                                  {s.replaceAll("_", " ")}
                                </option>
                              ))}
                            </select>

                            <button
                              disabled={busyId === id}
                              onClick={() => {
                                const el = document.getElementById(
                                  `mobile-status-${id}`,
                                ) as HTMLSelectElement | null;

                                if (el) {
                                  void updateStatus(vessel, el.value);
                                }
                              }}
                              className={primaryButton}
                            >
                              Save
                            </button>

                            <button
                              onClick={() => setChangingStatus("")}
                              className={secondaryButton}
                            >
                              Cancel
                            </button>
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              </>
            )}
          </section>

          <footer className="flex flex-wrap justify-between gap-2 py-6 text-xs text-slate-400">
            <span>EcoFleet AI · Fleet Management</span>
            <span className="inline-flex items-center gap-1">
              <Clock3 size={13} /> Data supplied by your backend
            </span>
          </footer>
        </div>
      </section>

      {/* Add vessel modal */}
      {manualOpen && (
        <div
          className="fixed inset-0 z-[1200] flex items-center justify-center overflow-y-auto bg-slate-950/60 p-3 backdrop-blur-sm sm:p-5"
          onMouseDown={(e) => {
            if (
              e.target === e.currentTarget &&
              !savingVessel
            ) {
              setManualOpen(false);
              setShowPortSuggestions(false);
            }
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-vessel-title"
            className="my-auto max-h-[94vh] w-full max-w-3xl overflow-hidden rounded-2xl border border-sky-100 bg-white shadow-2xl"
          >
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 bg-gradient-to-r from-sky-50 to-white px-5 py-4 sm:px-6">
              <div className="flex items-center gap-3">
                <span className="grid size-10 place-items-center rounded-xl bg-sky-100 text-sky-800">
                  <Ship size={20} />
                </span>

                <div>
                  <h2
                    id="add-vessel-title"
                    className="text-xl font-bold text-slate-800"
                  >
                    Add new vessel
                  </h2>
                  <p className="mt-1 text-xs text-slate-500">
                    Enter the vessel details to add it to your fleet.
                  </p>
                </div>
              </div>

              <button
                type="button"
                disabled={savingVessel}
                onClick={() => {
                  setManualOpen(false);
                  setShowPortSuggestions(false);
                }}
                aria-label="Close form"
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-50"
              >
                <X size={18} />
              </button>
            </div>

            <div className="max-h-[calc(94vh-80px)] overflow-y-auto p-5 sm:p-6">
              {formError && (
                <p
                  role="alert"
                  className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800"
                >
                  {formError}
                </p>
              )}

              <form onSubmit={addVessel}>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {/* Automatically generated vessel ID */}
                  <label className="block min-w-0">
                    <span className="mb-1.5 block text-sm font-medium text-slate-700">
                      Vessel ID
                    </span>
                    <input
                      name="vessel_id"
                      type="text"
                      value={generatedVesselId}
                      readOnly
                      aria-readonly="true"
                      className="w-full cursor-not-allowed rounded-xl border border-sky-200 bg-sky-50 px-3 py-2.5 text-sm font-semibold text-sky-900 outline-none"
                    />
                    <span className="mt-1 block text-[11px] text-slate-500">
                      Generated automatically from existing vessel IDs.
                    </span>
                  </label>

                  <Field
                    label="Vessel name"
                    name="vessel_name"
                    value={form.vessel_name}
                    onChange={updateForm}
                    required
                    placeholder="Enter vessel name"
                  />

                  <Field
                    label="Vessel type"
                    name="vessel_type"
                    value={form.vessel_type}
                    onChange={updateForm}
                    placeholder="Cargo, tanker..."
                  />

                  <Field
                    label="Capacity (tons)"
                    name="capacity_tons"
                    type="number"
                    min="0.000001"
                    step="any"
                    value={form.capacity_tons}
                    onChange={updateForm}
                    required
                  />

                  <Field
                    label="Minimum speed (m/s)"
                    name="min_speed_mps"
                    type="number"
                    min="0.000001"
                    step="any"
                    value={form.min_speed_mps}
                    onChange={updateForm}
                    required
                  />

                  <Field
                    label="Maximum speed (m/s)"
                    name="max_speed_mps"
                    type="number"
                    min="0.000001"
                    step="any"
                    value={form.max_speed_mps}
                    onChange={updateForm}
                    required
                  />

                  <Field
                    label="Deadweight (tonnes)"
                    name="deadweight_tonnes"
                    type="number"
                    min="0.000001"
                    step="any"
                    value={form.deadweight_tonnes}
                    onChange={updateForm}
                  />

                  <Field
                    label="Engine power (kW)"
                    name="engine_power_kw"
                    type="number"
                    min="0.000001"
                    step="any"
                    value={form.engine_power_kw}
                    onChange={updateForm}
                  />

                  {/* Port name autocomplete; selected LOCODE is submitted */}
                  <div className="relative min-w-0">
                    <label className="block">
                      <span className="mb-1.5 block text-sm font-medium text-slate-700">
                        Current port
                      </span>

                      <input
                        type="text"
                        value={portQuery}
                        onChange={(e) => {
                          setPortQuery(e.target.value);
                          setShowPortSuggestions(true);
                          setFormError("");

                          /* Do not keep a previous LOCODE after changing the text */
                          updateForm("current_port_locode", "");
                        }}
                        onFocus={() => setShowPortSuggestions(true)}
                        onKeyDown={(e) => {
                          if (e.key === "Escape") {
                            setShowPortSuggestions(false);
                          }

                          if (
                            e.key === "Enter" &&
                            showPortSuggestions &&
                            filteredPorts.length > 0
                          ) {
                            e.preventDefault();
                            selectPort(filteredPorts[0]);
                          }
                        }}
                        placeholder="Type a port name, e.g. Chennai"
                        autoComplete="off"
                        aria-autocomplete="list"
                        aria-expanded={
                          showPortSuggestions && filteredPorts.length > 0
                        }
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-cyan-600 focus:ring-2 focus:ring-cyan-100"
                      />

                      <span className="mt-1 block text-[11px] text-slate-500">
                        {form.current_port_locode
                          ? `Selected LOCODE: ${form.current_port_locode}`
                          : "Select a port suggestion to save its LOCODE."}
                      </span>
                    </label>

                    {showPortSuggestions && portQuery.trim() && (
                      <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-56 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl">
                        {portsLoading ? (
                          <div className="flex items-center gap-2 px-3 py-3 text-sm text-slate-500">
                            <LoaderCircle
                              size={15}
                              className="animate-spin"
                            />
                            Loading ports...
                          </div>
                        ) : filteredPorts.length > 0 ? (
                          filteredPorts.map((port, index) => {
                            const name = portName(port);
                            const code = portLocode(port);

                            return (
                              <button
                                key={`${code || name}-${index}`}
                                type="button"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => selectPort(port)}
                                className="flex w-full flex-col items-start gap-1 border-b border-slate-100 px-3 py-2.5 text-left last:border-b-0 hover:bg-sky-50"
                              >
                                <span className="text-sm font-semibold text-slate-800">
                                  {name || "Unnamed port"}
                                </span>
                                <span className="text-xs font-medium text-sky-800">
                                  {code || "LOCODE unavailable"}
                                </span>
                              </button>
                            );
                          })
                        ) : (
                          <div className="px-3 py-3 text-sm text-slate-500">
                            {portsError
                              ? `Could not load port suggestions: ${portsError}`
                              : ports.length === 0
                                ? "No ports are available from the backend."
                                : "No matching ports. Try another port name or LOCODE."}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <Field
                    label="Fuel type"
                    name="fuel_type"
                    value={form.fuel_type}
                    onChange={updateForm}
                    placeholder="Diesel, LNG..."
                  />

                  <Field
                    label="Fuel consumption"
                    name="fuel_consumption"
                    type="number"
                    min="0.000001"
                    step="any"
                    value={form.fuel_consumption}
                    onChange={updateForm}
                  />

                  <Field
                    label="Operating cost per hour"
                    name="operating_cost_per_hour"
                    type="number"
                    min="0.000001"
                    step="any"
                    value={form.operating_cost_per_hour}
                    onChange={updateForm}
                  />

                  <Field
                    label="Propulsion type"
                    name="propulsion_type"
                    value={form.propulsion_type}
                    onChange={updateForm}
                    placeholder="Diesel, electric..."
                  />

                  <label className="block">
                    <span className="mb-1.5 block text-sm font-medium text-slate-700">
                      Status
                    </span>
                    <select
                      value={form.status}
                      onChange={(e) =>
                        updateForm("status", e.target.value)
                      }
                      className={`${inputClass} w-full`}
                    >
                      {STATUS_OPTIONS.map((s) => (
                        <option key={s} value={s}>
                          {s.replaceAll("_", " ")}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <p className="mt-4 text-xs leading-5 text-slate-500">
                  * Required fields. Capacity and speeds must be positive;
                  maximum speed must exceed minimum speed.
                </p>

                <div className="mt-5 flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
                  <button
                    type="button"
                    disabled={savingVessel}
                    onClick={() => {
                      setForm({ ...EMPTY_FORM });
                      setFormError("");
                      setPortQuery("");
                      setShowPortSuggestions(false);
                    }}
                    className={secondaryButton}
                  >
                    Clear form
                  </button>

                  <button
                    type="button"
                    disabled={savingVessel}
                    onClick={() => {
                      setManualOpen(false);
                      setShowPortSuggestions(false);
                    }}
                    className={secondaryButton}
                  >
                    Cancel
                  </button>

                  {/* Explicit white text and icon for button contrast */}
                  <button
                    type="submit"
                    disabled={savingVessel}
                    className={`${primaryButton} !bg-sky-800 !text-white hover:!bg-sky-900`}
                    style={{ color: "#ffffff" }}
                  >
                    {savingVessel ? (
                      <LoaderCircle
                        size={16}
                        className="animate-spin"
                        color="#ffffff"
                      />
                    ) : (
                      <Plus size={16} color="#ffffff" />
                    )}
                    <span className="text-white">
                      {savingVessel ? "Saving vessel..." : "Save vessel"}
                    </span>
                  </button>
                </div>
              </form>
            </div>
          </section>
        </div>
      )}

      {/* Vessel details */}
      {selectedVessel && (
        <div
          className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-950/40 p-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) {
              setSelectedVessel(null);
              setDetails(null);
            }
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="vessel-details-title"
            className="max-h-[85vh] w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl"
          >
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-5">
              <div className="flex min-w-0 items-center gap-3">
                <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-sky-50 text-sky-800">
                  <Ship size={21} />
                </span>

                <div className="min-w-0">
                  <h2
                    id="vessel-details-title"
                    className="break-words text-xl font-bold text-slate-800"
                  >
                    {vesselName(details ?? selectedVessel)}
                  </h2>

                  <p className="mt-1 text-xs text-slate-500">
                    ID: {vesselId(details ?? selectedVessel) || "—"}
                  </p>
                </div>
              </div>

              <button
                onClick={() => {
                  setSelectedVessel(null);
                  setDetails(null);
                }}
                aria-label="Close vessel details"
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
              >
                <X size={18} />
              </button>
            </div>

            <div className="max-h-[65vh] overflow-y-auto p-5">
              {detailsLoading && (
                <p className="mb-3 flex items-center gap-2 text-sm text-slate-500">
                  <LoaderCircle size={16} className="animate-spin" />
                  Fetching vessel details...
                </p>
              )}

              <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-sky-50 p-4">
                <div>
                  <p className="text-xs text-slate-500">Current status</p>
                  <div className="mt-2">
                    <StatusBadge
                      status={vesselStatus(details ?? selectedVessel)}
                    />
                  </div>
                </div>

                <span className="text-xs text-slate-500">
                  Fields shown as returned by the API
                </span>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {Object.entries(details ?? selectedVessel).map(
                  ([key, value]) => (
                    <div
                      key={key}
                      className="min-w-0 rounded-xl border border-slate-100 p-3"
                    >
                      <p className="text-xs font-medium capitalize text-slate-500">
                        {key.replaceAll("_", " ")}
                      </p>
                      <p className="mt-1 break-words text-sm font-semibold text-slate-800">
                        {displayValue(value)}
                      </p>
                    </div>
                  ),
                )}
              </div>
            </div>
          </section>
        </div>
      )}

      {notice && (
        <div
          role="status"
          className="fixed bottom-5 right-5 z-[1300] flex max-w-sm items-center gap-3 rounded-xl border border-sky-100 bg-white px-4 py-3 text-sm text-slate-700 shadow-xl"
        >
          <CheckCircle2 size={18} className="shrink-0 text-cyan-700" />
          <span>{notice}</span>
          <button
            type="button"
            aria-label="Dismiss notice"
            onClick={() => setNotice("")}
            className="shrink-0 rounded p-1 hover:bg-slate-100"
          >
            <X size={15} />
          </button>
        </div>
      )}
    </main>
  );
}