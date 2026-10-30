"use client";

import { useMemo, useState } from "react";
import Sidebar from "@/components/layout/Sidebar";
import Link from "next/link";
import {
  Anchor,
  Bell,
  Boxes,
  ChartNoAxesCombined,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  CloudSun,
  Compass,
  Fuel,
  Gauge,
  Leaf,
  Menu,
  MoreHorizontal,
  Package,
  Route,
  Search,
  Settings,
  ShieldCheck,
  Ship,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Waves,
  Wind,
  X,
  Zap,
} from "lucide-react";

const initialShipments = [
  {
    id: "EF-2048",
    name: "Chennai → Singapore",
    vessel: "MV Ocean Star",
    status: "In Transit",
    eta: "Oct 24",
    color: "green",
  },
  {
    id: "EF-2047",
    name: "Singapore → Mumbai",
    vessel: "MV Green Wave",
    status: "Planning",
    eta: "Oct 26",
    color: "blue",
  },
  {
    id: "EF-2046",
    name: "Dubai → Rotterdam",
    vessel: "MV Coral Crest",
    status: "On Schedule",
    eta: "Oct 28",
    color: "green",
  },
  {
    id: "EF-2045",
    name: "Busan → Los Angeles",
    vessel: "MV Blue Horizon",
    status: "Review Needed",
    eta: "Oct 29",
    color: "orange",
  },
];

export default function Dashboard() {
  const [active, setActive] = useState("Dashboard");
  const [query, setQuery] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [showAll, setShowAll] = useState(false);

  const shipments = useMemo(
    () =>
      initialShipments.filter((shipment) =>
        `${shipment.id} ${shipment.name} ${shipment.vessel} ${shipment.status}`
          .toLowerCase()
          .includes(query.toLowerCase()),
      ),
    [query],
  );

  function action(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 3500);
  }

  return (
    <main className="app-shell">
      <Sidebar
        active={active}
        mobileOpen={mobileOpen}
        onClose={() => setMobileOpen(false)}
        onNavigate={(label, href) => {
          setActive(label);
          setMobileOpen(false);

          if (href !== "/") {
            action(`${label} is next in our build plan.`);
          }
        }}
        onSettings={() => {
          setActive("Settings");
          setMobileOpen(false);
          action("Settings will be implemented in a later step.");
        }}
      />

      <section className="main-column">
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="icon-button mobile-menu"
              aria-label="Open navigation"
              onClick={() => setMobileOpen(true)}
            >
              <Menu size={20} />
            </button>

            <div className="breadcrumb">
              <span>Workspace</span>
              <ChevronRight size={14} />
              <strong>{active}</strong>
            </div>
          </div>

          <div className="topbar-actions">
            <label className="search-box">
              <Search size={17} />
              <input
                aria-label="Search shipments"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search vessels, shipments..."
              />
              <kbd>⌘ K</kbd>
            </label>

            <div className="dropdown-wrap">
              <button
                className={`icon-button notification-button ${
                  notificationsOpen ? "button-selected" : ""
                }`}
                aria-label="Notifications"
                aria-expanded={notificationsOpen}
                onClick={() => {
                  setNotificationsOpen(!notificationsOpen);
                  setProfileOpen(false);
                }}
              >
                <Bell size={19} />
                <span className="notification-dot" />
              </button>

              {notificationsOpen && (
                <div className="dropdown notification-menu">
                  <div className="dropdown-heading">
                    Notifications <span className="unread-pill">2 new</span>
                  </div>

                  <div className="notification-item">
                    <span className="notice-icon amber">
                      <Wind size={16} />
                    </span>
                    <div>
                      <strong>Weather advisory</strong>
                      <p>Review conditions before your next voyage.</p>
                      <small>Just now · Demo notification</small>
                    </div>
                  </div>

                  <div className="notification-item">
                    <span className="notice-icon teal">
                      <Ship size={16} />
                    </span>
                    <div>
                      <strong>Fleet overview</strong>
                      <p>Your dashboard is ready to review.</p>
                      <small>Today</small>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="topbar-divider" />

            <div className="dropdown-wrap">
              <button
                className="profile-button"
                onClick={() => {
                  setProfileOpen(!profileOpen);
                  setNotificationsOpen(false);
                }}
                aria-expanded={profileOpen}
              >
                <span className="avatar">M</span>
                <span className="profile-copy">
                  <strong>Fleet Manager</strong>
                  <small>Administrator</small>
                </span>
                <ChevronDown size={15} />
              </button>

              {profileOpen && (
                <div className="dropdown profile-menu">
                  <div className="profile-menu-head">
                    <span className="avatar">M</span>
                    <div>
                      <strong>Fleet Manager</strong>
                      <small>manager@ecofleet.demo</small>
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      setProfileOpen(false);
                      action("Profile settings are coming soon.");
                    }}
                  >
                    <Settings size={16} />
                    Profile settings
                  </button>

                  <button
                    onClick={() => {
                      setProfileOpen(false);
                      action("Help center is coming soon.");
                    }}
                  >
                    <CircleHelp size={16} />
                    Help &amp; support
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

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

              <h1>
                Navigate smarter.
                <br />
                <span>Move greener.</span>
              </h1>

              <p>
                Your fleet, your voyages, your impact — all in one place.
              </p>

              <div className="hero-actions">
                <button
                  className="primary-button"
                  onClick={() =>
                    action(
                      "Voyage Planning is next. Your existing optimization API will be connected there.",
                    )
                  }
                >
                  <Compass size={16} />
                  Plan a voyage
                  <ChevronRight size={15} />
                </button>

                <button
                  className="ghost-button"
                  onClick={() =>
                    action("Green Optimization is next in our build plan.")
                  }
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

              <span className="coordinate coord-a">13.08° N</span>
              <span className="coordinate coord-b">103.82° E</span>

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
                Fleet overview <span className="heading-period">/ Today</span>
              </h2>
            </div>

            <span className="updated-label">
              <span className="online-dot" />
              Demo overview
            </span>
          </div>

          <section className="metrics-grid">
            <article className="metric-card metric-blue">
              <div className="metric-top">
                <span className="metric-icon">
                  <Ship size={19} />
                </span>
                <span className="metric-label">Total vessels</span>
                <MoreHorizontal size={18} className="metric-more" />
              </div>

              <div className="metric-value">
                12 <span className="metric-unit">vessels</span>
              </div>

              <div className="metric-bottom">
                <span className="metric-note">
                  <TrendingUp size={14} /> Fleet capacity
                </span>
                <span className="metric-watermark">
                  <Ship size={45} />
                </span>
              </div>

              <div className="metric-progress">
                <span style={{ width: "76%" }} />
              </div>
            </article>

            <article className="metric-card metric-teal">
              <div className="metric-top">
                <span className="metric-icon">
                  <Anchor size={19} />
                </span>
                <span className="metric-label">Available</span>
                <MoreHorizontal size={18} className="metric-more" />
              </div>

              <div className="metric-value">
                08 <span className="metric-unit">ready</span>
              </div>

              <div className="metric-bottom">
                <span className="metric-note">
                  <span className="online-dot" /> Ready for allocation
                </span>
                <span className="metric-watermark">
                  <Anchor size={43} />
                </span>
              </div>

              <div className="metric-progress">
                <span style={{ width: "66%" }} />
              </div>
            </article>

            <article className="metric-card metric-violet">
              <div className="metric-top">
                <span className="metric-icon">
                  <Route size={19} />
                </span>
                <span className="metric-label">Active voyages</span>
                <MoreHorizontal size={18} className="metric-more" />
              </div>

              <div className="metric-value">
                09 <span className="metric-unit">voyages</span>
              </div>

              <div className="metric-bottom">
                <span className="metric-note">
                  <TrendingUp size={14} /> In operation
                </span>
                <span className="metric-watermark">
                  <Compass size={44} />
                </span>
              </div>

              <div className="metric-progress">
                <span style={{ width: "58%" }} />
              </div>
            </article>

            <article className="metric-card metric-green">
              <div className="metric-top">
                <span className="metric-icon">
                  <Leaf size={19} />
                </span>
                <span className="metric-label">Green score</span>
                <MoreHorizontal size={18} className="metric-more" />
              </div>

              <div className="metric-value">
                82<span className="metric-unit">/100</span>
              </div>

              <div className="metric-bottom">
                <span className="metric-note">
                  <TrendingDown size={14} /> Sustainability index
                </span>
                <span className="metric-watermark">
                  <Waves size={47} />
                </span>
              </div>

              <div className="metric-progress">
                <span style={{ width: "82%" }} />
              </div>
            </article>
          </section>

          <section className="insight-grid">
            <article className="panel fuel-panel">
              <div className="panel-heading">
                <div>
                  <span className="panel-kicker">SUSTAINABILITY</span>
                  <h3>Fuel &amp; emissions</h3>
                </div>
                <span className="panel-icon">
                  <Leaf size={18} />
                </span>
              </div>

              <div className="insight-stats">
                <div>
                  <span className="small-label">Estimated fuel use</span>
                  <strong>
                    — <small>kg</small>
                  </strong>
                  <span className="pending-label">
                    <span /> Awaiting live data
                  </span>
                </div>

                <div className="stat-divider" />

                <div>
                  <span className="small-label">Estimated emissions</span>
                  <strong>
                    — <small>kg CO₂e</small>
                  </strong>
                  <span className="pending-label">
                    <span /> Awaiting live data
                  </span>
                </div>
              </div>

              <div className="chart-placeholder">
                <div className="chart-y-labels">
                  <span>100</span>
                  <span>75</span>
                  <span>50</span>
                  <span>25</span>
                  <span>0</span>
                </div>

                <div className="chart-area">
                  {[0, 1, 2, 3].map((number) => (
                    <div className="chart-gridline" key={number} />
                  ))}

                  <svg
                    className="chart-svg"
                    viewBox="0 0 480 110"
                    preserveAspectRatio="none"
                    role="img"
                    aria-label="Illustrative chart awaiting backend data"
                  >
                    <defs>
                      <linearGradient
                        id="chartFill"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="0%"
                          stopColor="#32d8d0"
                          stopOpacity=".25"
                        />
                        <stop
                          offset="100%"
                          stopColor="#32d8d0"
                          stopOpacity="0"
                        />
                      </linearGradient>
                    </defs>

                    <path
                      d="M0 86 C35 78, 40 55, 75 62 S125 85, 155 51 S205 65, 240 38 S295 61, 330 32 S390 46, 420 20 S455 29, 480 12 L480 110 L0 110 Z"
                      fill="url(#chartFill)"
                    />

                    <path
                      d="M0 86 C35 78, 40 55, 75 62 S125 85, 155 51 S205 65, 240 38 S295 61, 330 32 S390 46, 420 20 S455 29, 480 12"
                      fill="none"
                      stroke="#32d8d0"
                      strokeWidth="2"
                      strokeDasharray="5 5"
                      opacity=".75"
                    />
                  </svg>

                  <div className="chart-empty-label">
                    <Waves size={16} />
                    Live analytics will appear here
                  </div>

                  <div className="chart-x-labels">
                    <span>Mon</span>
                    <span>Tue</span>
                    <span>Wed</span>
                    <span>Thu</span>
                    <span>Fri</span>
                    <span>Sat</span>
                    <span>Sun</span>
                  </div>
                </div>
              </div>

              <div className="panel-footnote">
                <ShieldCheck size={14} />
                Actual metrics will be shown after backend integration.
              </div>
            </article>

            <article className="panel quick-panel">
              <div className="panel-heading">
                <div>
                  <span className="panel-kicker">WORKSPACE</span>
                  <h3>Quick actions</h3>
                </div>
                <span className="panel-icon">
                  <Zap size={18} />
                </span>
              </div>

              <button
                className="quick-action"
                onClick={() =>
                  action(
                    "Voyage Planning will use the existing route and optimization endpoints.",
                  )
                }
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
                className="quick-action"
                onClick={() =>
                  action("Shipment creation will connect to POST /shipments.")
                }
              >
                <span className="quick-icon teal-icon">
                  <Package size={19} />
                </span>
                <span className="quick-copy">
                  <strong>Create a shipment</strong>
                  <small>Set cargo, route and deadline</small>
                </span>
                <ChevronRight size={17} />
              </button>

              <button
                className="quick-action"
                onClick={() =>
                  action(
                    "Fleet Management is next. We'll connect it to the vessels API.",
                  )
                }
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
                className="quick-action"
                onClick={() =>
                  action("Green Optimization will compare GA and QIGA results.")
                }
              >
                <span className="quick-icon green-icon">
                  <Sparkles size={19} />
                </span>
                <span className="quick-copy">
                  <strong>Optimize greener</strong>
                  <small>Compare GA and QIGA strategies</small>
                </span>
                <ChevronRight size={17} />
              </button>

              <div className="quick-footer">
                <span className="quick-footer-mark">
                  <Leaf size={15} />
                </span>
                <span>
                  <strong>Every voyage matters.</strong>
                  <small>Make efficiency part of every decision.</small>
                </span>
              </div>
            </article>
          </section>

          <section className="panel shipments-panel">
            <div className="panel-heading shipment-heading">
              <div>
                <span className="panel-kicker">OPERATIONS</span>
                <h3>
                  Recent shipments{" "}
                  <span className="count-badge">{shipments.length}</span>
                </h3>
              </div>

              <button
                className="text-link"
                onClick={() => setShowAll(!showAll)}
              >
                {showAll ? "Show less" : "View all"}
                <ChevronRight size={15} />
              </button>
            </div>

            <div className="shipment-table-wrap">
              <table className="shipment-table">
                <thead>
                  <tr>
                    <th>SHIPMENT</th>
                    <th>VESSEL</th>
                    <th>STATUS</th>
                    <th>ETA</th>
                    <th aria-label="Actions" />
                  </tr>
                </thead>

                <tbody>
                  {(showAll ? shipments : shipments.slice(0, 3)).map(
                    (shipment) => (
                      <tr key={shipment.id}>
                        <td>
                          <div className="shipment-name">
                            <span className="shipment-symbol">
                              <Ship size={17} />
                            </span>
                            <span>
                              <strong>{shipment.name}</strong>
                              <small>{shipment.id}</small>
                            </span>
                          </div>
                        </td>

                        <td className="vessel-name">{shipment.vessel}</td>

                        <td>
                          <span
                            className={`status-pill status-${shipment.color}`}
                          >
                            <span />
                            {shipment.status}
                          </span>
                        </td>

                        <td className="eta-cell">{shipment.eta}, 2026</td>

                        <td>
                          <button
                            className="row-more"
                            aria-label={`Details for ${shipment.id}`}
                            onClick={() =>
                              action(
                                `${shipment.id}: ${shipment.name}. Shipment API connection is next.`,
                              )
                            }
                          >
                            <MoreHorizontal size={18} />
                          </button>
                        </td>
                      </tr>
                    ),
                  )}

                  {shipments.length === 0 && (
                    <tr>
                      <td colSpan={5} className="no-results">
                        No demo shipments match “{query}”.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="table-foot">
              <span>Illustrative preview · Not live shipment records</span>
              <span>
                <span className="online-dot" /> Ready for API connection
              </span>
            </div>
          </section>

          <footer className="page-footer">
            <span>
              © 2026 EcoFleet AI{" "}
              <span className="footer-separator">·</span> Intelligent maritime
              operations
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