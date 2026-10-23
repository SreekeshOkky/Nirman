import React, { useEffect, useState } from "react";
import { Building2, ChevronRight, MapPin, Plus } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { formatMonth, money } from "../components/Shared";
import SiteModal from "../components/SiteModal";
import { updateItems } from "../lib/updates";
import { UpdateRow } from "./UpdatesPage";

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
  updates,
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

  const attention = isBuilder ? updateItems(updates) : [];
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
            type="button"
            className="secondary-button"
            onClick={() => setCreating(true)}
          >
            <Plus size={17} /> New site
          </button>
        )}
      </div>

      {isBuilder && (
        <section className="home-hero tray" aria-label="This month">
          <div className="home-hero-main">
            <span>Spent in {formatMonth(thisMonth)}</span>
            <strong className="figure">{money(month.expenses)}</strong>
          </div>
          <dl className="home-hero-stats">
            <div>
              <dt>Received</dt>
              <dd className="figure positive">{money(month.income)}</dd>
            </div>
            <div>
              <dt>Active sites</dt>
              <dd className="figure">{overview.sites.length}</dd>
            </div>
          </dl>
        </section>
      )}

      {attention.length > 0 && (
        <section className="home-attention" aria-labelledby="attention-title">
          <div className="section-head">
            <h2 id="attention-title">Needs attention</h2>
            <Link to="/updates" className="text-link">
              See all
            </Link>
          </div>
          <div className="menu-card">
            {attention.slice(0, 3).map((item) => (
              <UpdateRow key={item.key} item={item} />
            ))}
          </div>
        </section>
      )}

      <section className="home-sites-section" aria-label="Active sites">
        {isBuilder && (
          <div className="section-head">
            <h2>Active sites</h2>
          </div>
        )}
        <div className="home-sites">
          {loading && !overview.sites.length ? (
            <div className="empty-state">Loading your sites…</div>
          ) : !overview.sites.length ? (
            <div className="empty-state">
              {isBuilder ? (
                <>
                  <p>Create your first site to start recording payments.</p>
                  <button
                    type="button"
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
                  className={`site-tile ${state ? state.tone : ""}`}
                  onClick={() => setSiteId(site.id)}
                >
                  <span className="site-tile-icon" aria-hidden="true">
                    <Building2 size={18} />
                  </span>
                  <span className="site-tile-name">
                    <strong>{site.name}</strong>
                    <span>
                      <MapPin size={13} aria-hidden="true" />
                      {site.location || "Location not added"}
                    </span>
                  </span>
                  {state && (
                    <span className="site-tile-budget">
                      <span className="site-tile-figures">
                        <span>
                          <strong className="figure">
                            {money(site.expenses)}
                          </strong>{" "}
                          of {money(site.budget)}
                        </span>
                        <span className={`budget-badge ${state.tone}`}>
                          {state.pct}%
                        </span>
                      </span>
                      <span className="budget-bar" aria-hidden="true">
                        <i
                          className={state.tone}
                          style={{
                            transform: `scaleX(${Math.min(100, state.pct) / 100})`,
                          }}
                        />
                      </span>
                      <span className="site-tile-left">
                        {state.left >= 0
                          ? `${money(state.left)} left`
                          : `${money(-state.left)} over`}
                      </span>
                    </span>
                  )}
                  {isBuilder && !state && (
                    <span className="site-tile-budget">
                      <span className="site-tile-figures">
                        <span>
                          <strong className="figure">
                            {money(site.expenses)}
                          </strong>{" "}
                          spent
                        </span>
                      </span>
                      <span className="site-tile-left">No budget set</span>
                    </span>
                  )}
                  <ChevronRight
                    size={18}
                    className="site-tile-chevron"
                    aria-hidden="true"
                  />
                </Link>
              );
            })
          )}
        </div>
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
