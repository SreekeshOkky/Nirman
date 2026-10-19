import React from "react";
import { Building2, History, Plus, Tag, UserRound } from "lucide-react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { DEFAULT_FEATURES } from "../lib/features";
import { brand } from "../lib/brand";
import { getInitials } from "./Shared";
import BrandMark from "./BrandMark";

// Site-first shell: a sidebar on wide screens and a bottom bar on phones.
// Everything about one site lives on its own page (/sites/:id), so there is
// no global site picker.
export default function AppLayout({
  activeSites,
  isBuilder,
  profile,
  features = DEFAULT_FEATURES,
}) {
  const location = useLocation();
  const enabled = (flag) => features?.[flag] !== false;
  const path = location.pathname;

  // "Add" records against the open site, otherwise asks which site.
  const openSite = path.match(/^\/sites\/([^/]+)/)?.[1];
  const addHref = openSite ? `/sites/${openSite}?add=1` : "/add";

  // A supervisor on a single site has no list of sites to go back to.
  const singleSite =
    !isBuilder && activeSites.length === 1 ? activeSites[0] : null;
  const sitesHref = singleSite ? `/sites/${singleSite.id}` : "/";
  const sitesLabel = singleSite ? "Site" : "Sites";
  const onSites = path === "/" || path.startsWith("/sites") || path === "/add";
  const onMe = ["/me", "/settings", "/categories", "/activity"].some((p) =>
    path.startsWith(p),
  );
  const navClass = (active) => `nav-item ${active ? "active" : ""}`;

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="Main">
        <Link to={sitesHref} className="brand">
          <BrandMark />
          <span>{brand.name}</span>
        </Link>
        <Link to={addHref} className="primary-button sidebar-add">
          <Plus size={18} /> Add entry
        </Link>
        <nav className="main-nav">
          <Link to={sitesHref} className={navClass(onSites)}>
            <Building2 size={19} strokeWidth={1.9} />
            <span>{sitesLabel}</span>
          </Link>
          {isBuilder && enabled("audit_log") && (
            <NavLink
              to="/activity"
              className={({ isActive }) => navClass(isActive)}
            >
              <History size={19} strokeWidth={1.9} />
              <span>Activity log</span>
            </NavLink>
          )}
          {isBuilder && enabled("categories") && (
            <NavLink
              to="/categories"
              className={({ isActive }) => navClass(isActive)}
            >
              <Tag size={19} strokeWidth={1.9} />
              <span>Categories</span>
            </NavLink>
          )}
        </nav>
        <Link
          to="/me"
          className={`sidebar-user ${/^\/(me|settings)/.test(path) ? "active" : ""}`}
        >
          <div className="avatar avatar-dark">
            {getInitials(profile?.full_name) || "?"}
          </div>
          <span>
            <strong>{profile?.full_name || "Account"}</strong>
            <span>{isBuilder ? "Builder" : "Supervisor"} · settings</span>
          </span>
        </Link>
      </aside>

      <main className="main-content">
        <div className="page-wrap">
          <Outlet />
        </div>
      </main>

      <nav className="bottom-nav" aria-label="Main">
        <Link
          to={sitesHref}
          className={onSites ? "active" : ""}
          aria-current={onSites ? "page" : undefined}
        >
          <span className="bottom-nav-icon">
            <Building2 size={22} strokeWidth={1.9} />
          </span>
          {sitesLabel}
        </Link>
        <Link to={addHref} className="bottom-nav-add" aria-label="Add entry">
          <span>
            <Plus size={26} strokeWidth={2.4} />
          </span>
          Add
        </Link>
        <Link
          to="/me"
          className={onMe ? "active" : ""}
          aria-current={onMe ? "page" : undefined}
        >
          <span className="bottom-nav-icon">
            <UserRound size={22} strokeWidth={1.9} />
          </span>
          Me
        </Link>
      </nav>
    </div>
  );
}
