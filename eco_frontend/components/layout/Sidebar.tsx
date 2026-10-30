"use client";

import Link from "next/link";
import {
  ChartNoAxesCombined,
  ChevronRight,
  CloudSun,
  LayoutDashboard,
  Leaf,
  Package,
  Route,
  Settings,
  Ship,
  Waves,
} from "lucide-react";

type SidebarProps = {
  active: string;
  mobileOpen: boolean;
  onNavigate: (label: string, href: string) => void;
  onClose: () => void;
  onSettings: () => void;
};

const navigation = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard },
  { label: "Fleet Management", href: "/fleet", icon: Ship },
  { label: "Voyage Planning", href: "/voyages", icon: Route },
  { label: "Shipments", href: "/shipments", icon: Package },
  { label: "Fuel Analytics", href: "/fuel", icon: Ship },
  { label: "Green Optimization", href: "/optimization", icon: Leaf },
  { label: "Weather & Ocean", href: "/weather", icon: CloudSun },
  { label: "Reports", href: "/reports", icon: ChartNoAxesCombined },
];

export default function Sidebar({
  active,
  mobileOpen,
  onNavigate,
  onClose,
  onSettings,
}: SidebarProps) {
  return (
    <>
      {mobileOpen && (
        <button
          className="mobile-scrim"
          aria-label="Close menu"
          onClick={onClose}
        />
      )}

      <aside className={`sidebar ${mobileOpen ? "sidebar-open" : ""}`}>
        <Link
          href="/"
          className="brand"
          onClick={() => onNavigate("Dashboard", "/")}
        >
          <span className="brand-mark">
            <Ship size={27} strokeWidth={1.8} />
            <Waves className="brand-wave" size={28} />
          </span>
          <span className="brand-copy">
            <strong>
              Eco<span>Fleet</span>
            </strong>
            <small>INTELLIGENT MARITIME</small>
          </span>
          <span className="brand-dot" />
        </Link>

        <div className="workspace-label">WORKSPACE</div>

        <nav className="side-nav" aria-label="Main navigation">
          {navigation.map((item) => {
            const Icon = item.icon;
            const selected = active === item.label;

            return (
              <Link
                key={item.label}
                href={item.href}
                onClick={() => onNavigate(item.label, item.href)}
                className={`nav-link ${selected ? "nav-active" : ""}`}
              >
                <Icon size={18} strokeWidth={1.8} />
                <span>{item.label}</span>
                {selected && <span className="active-indicator" />}
              </Link>
            );
          })}
        </nav>

        <div className="sidebar-bottom">
          <div className="ocean-art" aria-hidden="true">
            <div className="orbit orbit-one" />
            <div className="orbit orbit-two" />
            <Ship className="art-ship" size={43} />
            <Waves className="art-waves" size={105} />
            <span className="water-dot dot-one" />
            <span className="water-dot dot-two" />
            <span className="water-dot dot-three" />
          </div>

          <div className="mission-card">
            <span className="mission-icon">
              <Leaf size={17} />
            </span>
            <strong>Navigate greener.</strong>
            <p>Smarter voyages for a more sustainable tomorrow.</p>
            <span className="mission-line" />
          </div>

          <Link
            href="/settings"
            className={`nav-link settings-link ${
              active === "Settings" ? "nav-active" : ""
            }`}
            onClick={onSettings}
          >
            <Settings size={18} />
            <span>Settings</span>
            <ChevronRight size={15} className="nav-chevron" />
          </Link>

          <div className="sidebar-footer">
            <span className="online-dot" /> Fleet systems ready
            <span>v1.0</span>
          </div>
        </div>
      </aside>
    </>
  );
}
