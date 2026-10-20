import React, { useCallback, useEffect, useState } from "react";
import { ChevronLeft } from "lucide-react";
import { Link, Navigate, NavLink, Outlet, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { money } from "../components/Shared";

// One page per site: header with the budget picture, then tabs (Entries,
// Summary, Notes, Team) rendered through nested routes.
export default function SitePage({
  token,
  sites,
  sitesLoading,
  siteId,
  setSiteId,
  isBuilder,
  features,
}) {
  const { siteId: routeSiteId } = useParams();
  const [summary, setSummary] = useState(null);
  const site = sites.find((item) => item.id === routeSiteId) || null;
  const archived = site?.status === "archived";

  useEffect(() => {
    if (routeSiteId && routeSiteId !== siteId) setSiteId(routeSiteId);
  }, [routeSiteId, siteId, setSiteId]);

  const refreshSummary = useCallback(() => {
    if (!routeSiteId || !isBuilder) return;
    api
      .summary(routeSiteId, token)
      .then(setSummary)
      .catch(() => setSummary(null));
  }, [routeSiteId, token, isBuilder]);

  useEffect(() => {
    setSummary(null);
    refreshSummary();
  }, [refreshSummary]);

  if (sitesLoading) return <div className="auth-loading">Loading site…</div>;
  if (!site) return <Navigate to="/" replace />;

  const budget = Number(site.budget || 0);
  const spent = Number(summary?.expenses || 0);
  const received = Number(summary?.income || 0);
  const pct = budget ? Math.round((spent / budget) * 100) : null;
  const tone =
    pct == null ? "ok" : pct > 100 ? "over" : pct >= 90 ? "near" : "ok";
  const showBack = isBuilder || sites.length > 1;
  const tabs = [
    { to: "", label: "Entries", end: true },
    isBuilder && { to: "summary", label: "Summary" },
    features?.notes !== false && { to: "notes", label: "Notes" },
    isBuilder && { to: "team", label: "Team" },
  ].filter(Boolean);

  return (
    <>
      <div className="site-head">
        {showBack && (
          <Link to="/" className="site-back">
            <ChevronLeft size={18} /> Sites
          </Link>
        )}
        <h1>{site.name}</h1>
        <p>
          {[site.location, site.client_name && `Client: ${site.client_name}`]
            .filter(Boolean)
            .join(" · ") || "Location not added"}
        </p>
        {archived && (
          <p className="site-archived-note">
            This site is finished and read-only. Reactivate it from All sites to
            make changes.
          </p>
        )}
      </div>

      {isBuilder && summary && (
        <section className="site-budget card" aria-label="Budget">
          <div className="site-budget-top">
            <div>
              <span>Spent</span>
              <strong>{money(spent)}</strong>
            </div>
            {budget > 0 && (
              <span className={`budget-badge ${tone}`}>
                {pct}% of {money(budget)}
              </span>
            )}
          </div>
          {budget > 0 && (
            <div className="budget-bar">
              <i className={tone} style={{ width: `${Math.min(100, pct)}%` }} />
            </div>
          )}
          <div className="site-budget-stats">
            <div>
              <span>Received from client</span>
              <strong className="positive">{money(received)}</strong>
            </div>
            <div>
              <span>Cash in hand</span>
              <strong>{money(received - spent)}</strong>
            </div>
          </div>
        </section>
      )}

      <nav className="site-tabs" aria-label="Site sections">
        {tabs.map((tab) => (
          <NavLink
            key={tab.label}
            to={tab.to}
            end={tab.end}
            className={({ isActive }) => (isActive ? "active" : "")}
          >
            {tab.label}
          </NavLink>
        ))}
      </nav>

      {siteId === routeSiteId ? (
        <Outlet context={{ refreshSummary }} />
      ) : (
        <div className="auth-loading">Loading…</div>
      )}
    </>
  );
}
