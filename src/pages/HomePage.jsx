import React, { useEffect, useState } from "react";
import { Building2, ChevronRight, MapPin, Plus } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { formatMonth, money } from "../components/Shared";
import SiteModal from "../components/SiteModal";

function greeting(name) {
  const hour = new Date().getHours();
  const part = hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
  const first = (name || "").trim().split(/\s+/)[0];
  return `Good ${part}${first ? `, ${first}` : ""}`;
}

// Budget health of a site: share of budget spent, and how to colour it.
function budgetState(site) {
  const budget = Number(site.budget || 0);
  const spent = Number(site.expenses || 0);
  if (!budget) return null;
  const pct = Math.round((spent / budget) * 100);
  return {
    pct,
    left: budget - spent,
    tone: pct > 100 ? "over" : pct >= 90 ? "near" : "ok",
  };
}

export default function HomePage({
  token,
  profile,
  isBuilder,
  overview,
  setOverview,
  setSites,
  setSiteId,
  flash,
}) {
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    api
      .overview(token)
      .then((data) => {
        if (!cancelled) setOverview(data);
      })
      .catch((error) => {
        if (!cancelled) flash(error.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, setOverview]);

  async function createSite(event) {
    event.preventDefault();
    setSaving(true);
    try {
      const form = new FormData(event.currentTarget);
      const site = await api.createSite(
        {
          name: form.get("name"),
          location: form.get("location"),
          client_name: form.get("client_name"),
          budget: Number(form.get("budget")) || null,
        },
        token,
      );
      setSites((current) => [...current, site]);
      setSiteId(site.id);
      setCreating(false);
      flash("Site created");
      navigate(`/sites/${site.id}`);
    } catch (error) {
      flash(error.message);
    } finally {
      setSaving(false);
    }
  }

  const thisMonth = new Date().toISOString().slice(0, 7);
  const month = overview.monthly.find((row) => row.month === thisMonth) || {
    income: 0,
    expenses: 0,
  };

  return (
    <>
      <div className="home-heading">
        <div>
          <p className="home-greeting">{greeting(profile?.full_name)}</p>
          <h1>Your sites</h1>
        </div>
        {isBuilder && (
          <button
            className="secondary-button"
            onClick={() => setCreating(true)}
          >
            <Plus size={17} /> New site
          </button>
        )}
      </div>

      {isBuilder && (
        <section className="home-hero" aria-label="This month">
          <div>
            <span>Spent in {formatMonth(thisMonth)}</span>
            <strong>{money(month.expenses)}</strong>
          </div>
          <div className="home-hero-stats">
            <div>
              <span>Received</span>
              <strong>{money(month.income)}</strong>
            </div>
            <div>
              <span>Active sites</span>
              <strong>{overview.sites.length}</strong>
            </div>
          </div>
        </section>
      )}

      <section className="home-sites" aria-label="Active sites">
        {loading && !overview.sites.length ? (
          <div className="card empty-state">Loading your sites…</div>
        ) : !overview.sites.length ? (
          <div className="card empty-state">
            {isBuilder ? (
              <>
                <p>Create your first site to start recording payments.</p>
                <button
                  className="primary-button"
                  onClick={() => setCreating(true)}
                >
                  <Plus size={17} /> Create a site
                </button>
              </>
            ) : (
              "You haven’t been added to a site yet. Ask your builder to invite you."
            )}
          </div>
        ) : (
          overview.sites.map((site) => {
            const state = isBuilder ? budgetState(site) : null;
            return (
              <Link
                key={site.id}
                to={`/sites/${site.id}`}
                className="site-tile"
                onClick={() => setSiteId(site.id)}
              >
                <div className="site-tile-head">
                  <span className="site-tile-icon">
                    <Building2 size={18} />
                  </span>
                  <div className="site-tile-name">
                    <strong>{site.name}</strong>
                    <span>
                      <MapPin size={13} />{" "}
                      {site.location || "Location not added"}
                    </span>
                  </div>
                  {state ? (
                    <span className={`budget-badge ${state.tone}`}>
                      {state.pct}%{state.tone === "over" ? " · over" : ""}
                    </span>
                  ) : (
                    <ChevronRight size={18} className="site-tile-chevron" />
                  )}
                </div>
                {state && (
                  <>
                    <div className="budget-bar">
                      <i
                        className={state.tone}
                        style={{ width: `${Math.min(100, state.pct)}%` }}
                      />
                    </div>
                    <div className="site-tile-foot">
                      <span>
                        <strong>{money(site.expenses)}</strong> of{" "}
                        {money(site.budget)}
                      </span>
                      <span className={state.tone === "over" ? "over" : ""}>
                        {state.left >= 0
                          ? `${money(state.left)} left`
                          : `${money(-state.left)} over`}
                      </span>
                    </div>
                  </>
                )}
                {isBuilder && !state && (
                  <div className="site-tile-foot">
                    <span>
                      <strong>{money(site.expenses)}</strong> spent · no budget
                      set
                    </span>
                  </div>
                )}
              </Link>
            );
          })
        )}
        <Link to="/sites" className="home-all-sites">
          All sites, including finished ones <ChevronRight size={16} />
        </Link>
      </section>

      {creating && (
        <SiteModal
          onClose={() => setCreating(false)}
          onSubmit={createSite}
          saving={saving}
        />
      )}
    </>
  );
}
