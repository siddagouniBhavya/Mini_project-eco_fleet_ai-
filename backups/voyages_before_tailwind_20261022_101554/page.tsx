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
import styles from "./VoyagePlanning.module.css";

const RouteMap = dynamic(() => import("@/components/maps/RouteMap"), {
  ssr: false,
  loading: () => (
    <div className={styles.mapLoading}>
      <Waves size={28} />
      <span>Preparing interactive ocean map...</span>
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
    action("Port selections swapped. The illustrative map is unchanged.");
  }

  return (
    <div className="app-shell">
      <Sidebar
        active="Voyage Planning"
        mobileOpen={mobileOpen}
        onClose={() => setMobileOpen(false)}
        onNavigate={(label, href) => {
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

        <main className={styles.page}>
          <div className={styles.heading}>
            <div>
              <div className={styles.eyebrow}>
                <Compass size={14} />
                VOYAGE OPERATIONS
              </div>
              <h1>Voyage Planning</h1>
              <p>Plan routes, review vessel assignments and prepare greener voyages.</p>
            </div>
            <div className={styles.demoBadge}>
              <span />
              DEMO ENVIRONMENT
            </div>
          </div>

          <section className={styles.planner}>
            <div className={styles.sectionHeading}>
              <div className={styles.sectionIcon}>
                <Navigation size={18} />
              </div>
              <div>
                <h2>Plan a voyage</h2>
                <p>Choose your departure, destination and vessel.</p>
              </div>
            </div>

            <div className={styles.formGrid}>
              <label className={styles.field}>
                <span>ORIGIN PORT</span>
                <div className={styles.inputWrap}>
                  <span className={styles.portDot} />
                  <select value={origin} onChange={(e) => setOrigin(e.target.value)}>
                    <option>Mumbai, India</option>
                    <option>Chennai, India</option>
                    <option>Kochi, India</option>
                    <option>Colombo, Sri Lanka</option>
                    <option>Singapore</option>
                  </select>
                </div>
              </label>

              <button
                className={styles.swapButton}
                onClick={swapPorts}
                aria-label="Swap origin and destination"
                title="Swap ports"
              >
                <ArrowDownUp size={17} />
              </button>

              <label className={styles.field}>
                <span>DESTINATION PORT</span>
                <div className={styles.inputWrap}>
                  <span className={styles.destinationDot} />
                  <select
                    value={destination}
                    onChange={(e) => setDestination(e.target.value)}
                  >
                    <option>Singapore</option>
                    <option>Mumbai, India</option>
                    <option>Chennai, India</option>
                    <option>Kochi, India</option>
                    <option>Colombo, Sri Lanka</option>
                  </select>
                </div>
              </label>

              <label className={styles.field}>
                <span>VESSEL</span>
                <div className={styles.inputWrap}>
                  <Ship size={16} />
                  <select value={vessel} onChange={(e) => setVessel(e.target.value)}>
                    <option>MV Eco Voyager</option>
                    <option>MV Ocean Guardian</option>
                    <option>MV Blue Horizon</option>
                  </select>
                </div>
              </label>
            </div>

            <div className={styles.plannerFooter}>
              <span>
                <Sparkles size={15} />
                Route preview uses illustrative sample coordinates.
              </span>
              <button
                className={styles.planButton}
                onClick={() =>
                  action(
                    "Selections saved in this page session. A real route requires maritime routing data."
                  )
                }
              >
                <Compass size={16} />
                Preview voyage
              </button>
            </div>
          </section>

          <div className={styles.mapHeading}>
            <div>
              <h2>Route visualization</h2>
              <p>
                {origin} <span>→</span> {destination}
              </p>
            </div>
            <span className={styles.mapStatus}>
              <span />
              INTERACTIVE MAP
            </span>
          </div>

          <section className={styles.mapCard}>
            <RouteMap />
          </section>

          <section className={styles.metrics}>
            <article className={styles.metricCard}>
              <div className={styles.metricTop}>
                <span className={styles.metricIcon}><Anchor size={18} /></span>
                <span className={styles.sampleTag}>SAMPLE</span>
              </div>
              <p>Illustrative route distance</p>
              <strong>~3,900 <small>NM</small></strong>
              <span className={styles.metricNote}>Not calculated from navigable sea lanes</span>
            </article>

            <article className={styles.metricCard}>
              <div className={styles.metricTop}>
                <span className={styles.metricIcon}><Clock3 size={18} /></span>
                <span className={styles.sampleTag}>SAMPLE</span>
              </div>
              <p>Estimated transit time</p>
              <strong>~8.1 <small>days</small></strong>
              <span className={styles.metricNote}>Illustrative only; vessel speed not validated</span>
            </article>

            <article className={styles.metricCard}>
              <div className={styles.metricTop}>
                <span className={styles.metricIcon}><Fuel size={18} /></span>
                <span className={styles.sampleTag}>PENDING</span>
              </div>
              <p>Fuel consumption</p>
              <strong>— <small>tonnes</small></strong>
              <span className={styles.metricNote}>Requires vessel and fuel-consumption data</span>
            </article>
          </section>

          <section className={styles.notice}>
            <Waves size={18} />
            <div>
              <strong>Route data transparency</strong>
              <p>
                The map uses sample coordinates and the distance and time figures
                are illustrative placeholders. They are not suitable for navigation
                or operational decisions. Real maritime routing, weather, vessel
                tracking and fuel estimates will be connected in later stages.
              </p>
            </div>
          </section>

          <footer className={styles.pageFooter}>
            <span><Ship size={14} /> ECOFLEET AI</span>
            <span>Voyage planning workspace</span>
          </footer>

          {notice && (
            <div className={styles.toast} role="status">
              {notice}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
