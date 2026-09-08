import React, { useState } from "react";
import {
  BarChart3,
  Bell,
  Building2,
  ChevronDown,
  ClipboardList,
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  MoreHorizontal,
  Settings2,
  Users,
} from "lucide-react";
import {
  Link,
  NavLink,
  Outlet,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { supabase } from "../lib/supabase";
import PageSkeleton from "./PageSkeleton";
import BrandMark from "./BrandMark";

const nav = [
  { label: "Overview", to: "/", icon: LayoutDashboard },
  { label: "Sites", to: "/sites", icon: Building2 },
  { label: "Ledger", to: "/ledger", icon: ClipboardList },
  { label: "Reports", to: "/reports", icon: BarChart3 },
  { label: "Notes", to: "/notes", icon: FileText },
];

export default function AppLayout({
  site,
  sites,
  siteId,
  setSiteId,
  isBuilder,
  profile,
  token,
  siteLoading,
  ...context
}) {
  const [mobileNav, setMobileNav] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const items = isBuilder
    ? [
        ...nav,
        { label: "Team & access", to: "/team", icon: Users },
        { label: "Categories", to: "/categories", icon: Settings2 },
        { label: "Activity log", to: "/activity", icon: ClipboardList },
      ]
    : nav;
  const signOut = async () => {
    await supabase?.auth.signOut();
    navigate("/");
  };
  const selectedSiteId = siteId || sites[0]?.id || "";

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNav ? "sidebar-open" : ""}`}>
        <Link to="/" className="brand">
          <BrandMark />
          <span>Nirmanam</span>
        </Link>
        <div className="workspace-label">WORKSPACE</div>
        <nav className="main-nav">
          {items.map(({ label, to, icon: Icon }) => (
            <NavLink
              end={to === "/"}
              key={to}
              to={to}
              className={({ isActive }) =>
                `nav-item ${isActive ? "active" : ""}`
              }
              onClick={() => setMobileNav(false)}
            >
              <Icon size={18} strokeWidth={1.8} />
              <span>{label}</span>
              {label === "Sites" && (
                <span className="nav-count">{sites.length}</span>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="workspace-label">ACCOUNT</div>
          <NavLink
            to="/settings"
            className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
          >
            <Settings2 size={18} strokeWidth={1.8} />
            <span>Settings</span>
          </NavLink>
          <button className="nav-item" onClick={signOut}>
            <LogOut size={18} strokeWidth={1.8} />
            <span>Sign out</span>
          </button>
        </div>
        <div className="sidebar-user">
          <div className="avatar avatar-dark">RK</div>
          <div>
            <strong>{profile?.full_name || "Account"}</strong>
            <span>{profile?.role || "user"} account</span>
          </div>
          <MoreHorizontal size={18} className="muted-icon" />
        </div>
      </aside>
      <main className="main-content">
        <header className="topbar">
          <button className="mobile-menu" onClick={() => setMobileNav(true)}>
            <Menu size={22} />
          </button>
          <div className="breadcrumb">
            <span>Workspace</span>
            <span className="slash">/</span>
            <strong>Overview</strong>
          </div>
          <div className="top-actions">
            <button className="icon-button">
              <Bell size={18} />
              <span className="notification-dot" />
            </button>
            <div className="top-avatar">RK</div>
          </div>
        </header>
        <div className="page-wrap">
          {location.pathname !== "/" &&
            location.pathname !== "/sites" &&
            location.pathname !== "/activity" && (
              <div className="site-toolbar">
                <label className="site-selector">
                  <span className="site-icon">
                    <Building2 size={16} />
                  </span>
                  <span>
                    <small>VIEWING SITE</small>
                    <strong>
                      {site?.name ||
                        (sites.length ? sites[0].name : "No sites yet")}
                    </strong>
                  </span>
                  <ChevronDown size={16} />
                  <select
                    aria-label="Select site"
                    value={selectedSiteId}
                    onChange={(event) => setSiteId(event.target.value)}
                    disabled={!sites.length}
                  >
                    {!sites.length && <option value="">No sites yet</option>}
                    {sites.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="period-control">
                  <span>Site workspace</span>
                </div>
              </div>
            )}
          {siteLoading ? (
            <PageSkeleton pathname={location.pathname} />
          ) : (
            <Outlet
              context={{
                site,
                sites,
                siteId: selectedSiteId,
                setSiteId,
                siteLoading,
                isBuilder,
                token,
                ...context,
              }}
            />
          )}
        </div>
      </main>
      {mobileNav && (
        <button
          className="mobile-overlay"
          aria-label="Close navigation"
          onClick={() => setMobileNav(false)}
        />
      )}
    </div>
  );
}
