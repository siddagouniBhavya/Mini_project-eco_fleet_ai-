
"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import {
  Anchor,
  ArrowDownUp,
  Clock3,
  Compass,
  Fuel,
  Navigation,
  Ship,
  Sparkles,
  Waves,
} from "lucide-react";
import Sidebar from "@/components/layout/Sidebar";
import Topbar from "@/components/layout/Topbar";

const RouteMap = dynamic(() => import("@/components/maps/RouteMap"), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-[440px] flex-col items-center justify-center gap-3 bg-slate-950 text-slate-400">
      <Waves size={30} className="animate-pulse text-cyan-400" />
      <span className="text-sm">Preparing interactive ocean map...</span>
    </div>
  ),
});

export default function VoyagePlanningPage() {
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [origin, setOrigin] = useState("Mumbai, India");
  const [destination, setDestination] = useState("Singapore");
  const [vessel, setVessel] = useState("MV Eco Voyager");
  const [notice, setNotice] = useState("");

  function action(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 3500);
  }

  function swapPorts() {
    setOrigin(destination);
    setDestination(origin);
    action("Port selections swapped. The displayed route remains illustrative.");
  }

  const fieldClass =
    "mt-2 h-12 w-full rounded-xl border border-slate-700 bg-slate-950/70 px-3 text-sm text-slate-100 outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/15";

  return (
    <div className="app-shell">
      <Sidebar
        active="Voyage Planning"
        mobileOpen={mobileOpen}
        onClose={() => setMobileOpen(false)}
        onNavigate={(_, href) => {
          setMobileOpen(false);
          router.push(href);
        }}
        onSettings={() => {
          setMobileOpen(false);
          router.push("/settings");
        }}
      />

      <div className="main-column">
        <Topbar
          active="Voyage Planning"
          query={query}
          onQueryChange={setQuery}
          onAction={action}
          onOpenMenu={() => setMobileOpen(true)}
        />

        <main className="min-h-screen px-4 pb-8 pt-[100px] text-slate-100 sm:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-[1600px]">
            <header className="mb-7 flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="mb-3 flex items-center gap-2 text-[11px] font-bold tracking-[0.2em] text-cyan-400">
                  <Compass size={15} />
                  VOYAGE OPERATIONS
                </div>
                <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
                  Voyage Planning
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
                  Plan vessel routes, review assignments, and prepare greener voyages.
                </p>
              </div>

              <span className="inline-flex items-center gap-2 rounded-full border border-amber-400/20 bg-amber-400/10 px-3 py-2 text-[10px] font-bold tracking-wider text-amber-300">
                <span className="h-2 w-2 rounded-full bg-amber-300" />
                DEMO ENVIRONMENT
              </span>
            </header>

            <section className="rounded-2xl border border-slate-700/80 bg-slate-900/80 p-5 shadow-xl shadow-black/10 sm:p-6">
              <div className="mb-6 flex items-center gap-3">
                <div className="grid h-11 w-11 place-items-center rounded-xl border border-cyan-400/20 bg-cyan-400/10 text-cyan-300">
                  <Navigation size={20} />
                </div>
                <div>
                  <h2 className="text-lg font-semibold">Plan a voyage</h2>
                  <p className="mt-1 text-xs text-slate-400">
                    Select the ports and vessel for your route preview.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 items-end gap-4 md:grid-cols-[minmax(0,1fr)_44px_minmax(0,1fr)] xl:grid-cols-[minmax(0,1fr)_44px_minmax(0,1fr)_minmax(0,1fr)]">
                <label className="block min-w-0">
                  <span className="text-[10px] font-bold tracking-widest text-slate-400">
                    ORIGIN PORT
                  </span>
                  <select
                    className={fieldClass}
                    value={origin}
                    onChange={(e) => setOrigin(e.target.value)}
                  >
                    <option>Mumbai, India</option>
                    <option>Chennai, India</option>
                    <option>Kochi, India</option>
                    <option>Colombo, Sri Lanka</option>
                    <option>Singapore</option>
                  </select>
                </label>

                <button
                  className="mx-auto grid h-11 w-11 place-items-center rounded-xl border border-slate-700 bg-slate-800 text-cyan-300 transition hover:border-cyan-400/50 hover:bg-cyan-400/10"
                  onClick={swapPorts}
                  aria-label="Swap origin and destination"
                  title="Swap ports"
                >
                  <ArrowDownUp size={18} />
                </button>

                <label className="block min-w-0">
                  <span className="text-[10px] font-bold tracking-widest text-slate-400">
                    DESTINATION PORT
                  </span>
                  <select
                    className={fieldClass}
                    value={destination}
                    onChange={(e) => setDestination(e.target.value)}
                  >
                    <option>Singapore</option>
                    <option>Mumbai, India</option>
                    <option>Chennai, India</option>
                    <option>Kochi, India</option>
                    <option>Colombo, Sri Lanka</option>
                  </select>
                </label>

                <label className="block min-w-0 md:col-span-3 xl:col-span-1">
                  <span className="text-[10px] font-bold tracking-widest text-slate-400">
                    VESSEL
                  </span>
                  <select
                    className={fieldClass}
                    value={vessel}
                    onChange={(e) => setVessel(e.target.value)}
                  >
                    <option>MV Eco Voyager</option>
                    <option>MV Ocean Guardian</option>
                    <option>MV Blue Horizon</option>
                  </select>
                </label>
              </div>

              <div className="mt-6 flex flex-col gap-4 border-t border-slate-700/70 pt-5 sm:flex-row sm:items-center sm:justify-between">
                <p className="flex items-start gap-2 text-xs leading-5 text-slate-400">
                  <Sparkles size={16} className="mt-0.5 shrink-0 text-teal-300" />
                  Route coordinates and voyage metrics are illustrative sample data.
                </p>
                <button
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-cyan-950/30 transition hover:brightness-110"
                  onClick={() =>
                    action(
                      `Preview selected: ${origin} to ${destination} using ${vessel}. Live maritime routing is not connected yet.`
                    )
                  }
                >
                  <Compass size={17} />
                  Preview voyage
                </button>
              </div>
            </section>

            <div className="mb-4 mt-8 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold">Route visualization</h2>
                <p className="mt-2 text-sm text-slate-400">
                  {origin} <span className="mx-2 text-cyan-400">→</span> {destination}
                </p>
              </div>
              <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-[10px] font-bold tracking-wider text-emerald-300">
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                INTERACTIVE MAP
              </span>
            </div>

            <section className="overflow-hidden rounded-2xl border border-slate-700/80 bg-slate-900 shadow-xl shadow-black/10">
              <RouteMap />
            </section>

            <section className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-3">
              <Metric
                icon={<Anchor size={19} />}
                label="Illustrative route distance"
                value="~3,900"
                unit="NM"
                tag="SAMPLE"
                note="Not calculated from navigable sea lanes"
              />
              <Metric
                icon={<Clock3 size={19} />}
                label="Estimated transit time"
                value="~8.1"
                unit="days"
                tag="SAMPLE"
                note="Illustrative only; vessel speed is not validated"
              />
              <Metric
                icon={<Fuel size={19} />}
                label="Fuel consumption"
                value="—"
                unit="tonnes"
                tag="PENDING"
                note="Requires vessel and fuel-consumption data"
              />
            </section>

            <section className="mt-5 flex items-start gap-3 rounded-2xl border border-amber-300/20 bg-amber-300/[0.05] p-5">
              <Waves size={20} className="mt-0.5 shrink-0 text-amber-300" />
              <div>
                <h3 className="text-sm font-semibold text-amber-200">
                  Route data transparency
                </h3>
                <p className="mt-2 text-xs leading-6 text-slate-400">
                  The map uses sample coordinates. Distance and transit time are
                  placeholders and must not be used for navigation or operational
                  decisions. Live maritime routing, weather, vessel tracking, and
                  fuel estimates are not connected yet.
                </p>
              </div>
            </section>

            <footer className="mt-7 flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 pt-5 text-[11px] text-slate-500">
              <span className="flex items-center gap-2 font-bold tracking-widest text-slate-400">
                <Ship size={15} /> ECOFLEET AI
              </span>
              <span>Voyage planning workspace · Demo data</span>
            </footer>
          </div>
        </main>
      </div>

      {notice && (
        <div
          role="status"
          className="fixed bottom-5 right-5 z-[1000] max-w-sm rounded-xl border border-cyan-400/25 bg-slate-900 px-5 py-4 text-sm text-slate-100 shadow-2xl"
        >
          {notice}
        </div>
      )}
    </div>
  );
}

function Metric({
  icon,
  label,
  value,
  unit,
  tag,
  note,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  unit: string;
  tag: string;
  note: string;
}) {
  return (
    <article className="min-w-0 rounded-2xl border border-slate-700/80 bg-slate-900/80 p-5 transition duration-200 hover:-translate-y-0.5 hover:border-cyan-400/30">
      <div className="flex items-center justify-between gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl border border-cyan-400/20 bg-cyan-400/10 text-cyan-300">
          {icon}
        </span>
        <span className="rounded-md border border-slate-700 px-2 py-1 text-[9px] font-bold tracking-wider text-amber-300">
          {tag}
        </span>
      </div>
      <p className="mt-5 text-sm text-slate-400">{label}</p>
      <p className="mt-2 text-3xl font-bold tracking-tight text-slate-100">
        {value} <span className="text-sm font-medium text-slate-400">{unit}</span>
      </p>
      <p className="mt-3 text-xs leading-5 text-slate-500">{note}</p>
    </article>
  );
}
