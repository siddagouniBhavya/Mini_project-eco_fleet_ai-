"use client";

import { useState } from "react";
import {
  Bell,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Menu,
  Search,
  Settings,
  Ship,
  Wind,
} from "lucide-react";

type TopbarProps = {
  active: string;
  query: string;
  onQueryChange: (value: string) => void;
  onAction: (message: string) => void;
  onOpenMenu: () => void;
};

export default function Topbar({
  active,
  query,
  onQueryChange,
  onAction,
  onOpenMenu,
}: TopbarProps) {
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  return (
    <header className="topbar">
      <div className="topbar-left">
        <button
          className="icon-button mobile-menu"
          aria-label="Open navigation"
          onClick={onOpenMenu}
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
            onChange={(event) => onQueryChange(event.target.value)}
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
                  onAction("Profile settings are coming soon.");
                }}
              >
                <Settings size={16} />
                Profile settings
              </button>

              <button
                onClick={() => {
                  setProfileOpen(false);
                  onAction("Help center is coming soon.");
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
  );
}


