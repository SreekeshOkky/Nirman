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
import { DEFAULT_FEATURES } from "../lib/features";
import BrandMark from "./BrandMark";

const nav = [
  { label: "Overview", to: "/", icon: LayoutDashboard },
  { label: "Sites", to: "/sites", icon: Building2 },
  { label: "Ledger", to: "/ledger", icon: ClipboardList },
  { label: "Reports", to: "/reports", icon: BarChart3 },
  { label: "Notes", to: "/notes", icon: FileText },
];

const pageLabels = [
  { to: "/", label: "Overview" },
  { to: "/sites", label: "Sites" },
  { to: "/ledger", label: "Ledger" },
  { to: "/reports", label: "Reports" },
  { to: "/notes", label: "Notes" },
  { to: "/team", label: "Team & access" },
  { to: "/categories", label: "Categories" },
  { to: "/activity", label: "Activity log" },
  { to: "/settings", label: "Settings" },
];

export default function AppLayout({
  site,
  sites,
  siteId,
  setSiteId,
  isBuilder,
  profile,
  token,
  features = DEFAULT_FEATURES,
  ...context
}) {
  const [mobileNav, setMobileNav] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const enabled = (flag) => features?.[flag] !== false;
  const items = [
    ...nav.filter((item) => item.to !== "/notes" || enabled("notes")),
    ...(isBuilder
      ? [
          { label: "Team & access", to: "/team", icon: Users },
          ...(enabled("categories")
            ? [{ label: "Categories", to: "/categories", icon: Settings2 }]
            : []),
          ...(enabled("audit_log")
            ? [{ label: "Activity log", to: "/activity", icon: ClipboardList }]
            : []),
        ]
      : []),
  ];
  const signOut = async () => {
    await supabase?.auth.signOut();
    navigate("/");
  };
  const activeSites = sites.filter((item) => item.status !== "archived");
  const selectedSiteId =
    activeSites.find((item) => item.id === siteId)?.id ||
    activeSites[0]?.id ||
    "";
  const currentPage =
    pageLabels.find(({ to }) =>
      to === "/" ? location.pathname === "/" : location.pathname.startsWith(to),
    )?.label || "Overview";
  const noSiteContextPages = ["/", "/sites", "/activity", "/categories"];
  const hasSiteContext = !noSiteContextPages.includes(location.pathname);
  const breadcrumbRoot = hasSiteContext
    ? site?.name || (sites.length ? sites[0].name : "No sites yet")
    : "Workspace";

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
                <span className="nav-count">{activeSites.length}</span>
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
            <span>{breadcrumbRoot}</span>
            <span className="slash">/</span>
            <strong>{currentPage}</strong>
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
          {hasSiteContext && (
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
                  disabled={!activeSites.length}
                >
                  {!activeSites.length && (
                    <option value="">No active sites</option>
                  )}
                  {activeSites.map((item) => (
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
          <Outlet
            context={{
              site,
              sites,
              siteId: selectedSiteId,
              setSiteId,
              isBuilder,
              token,
              ...context,
            }}
          />
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
