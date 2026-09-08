import React, { useEffect } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Building2,
  ClipboardList,
  WalletCards,
} from "lucide-react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { money, PageHeading } from "../components/Shared";

function Metric({ label, value, icon, accent }) {
  return (
    <div className="metric-card">
      <div className={`metric-icon ${accent}`}>{icon}</div>
      <div className="metric-label">{label}</div>
      <strong className="metric-value">{value}</strong>
      <div className="metric-foot">
        <span>All accessible sites</span>
      </div>
    </div>
  );
}
export default function DashboardPage({
  overview,
  setOverview,
  token,
  isBuilder,
}) {
  const totals = overview.totals;
  useEffect(() => {
    let cancelled = false;
    api
      .overview(token)
      .then((data) => {
        if (!cancelled) setOverview(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [token, setOverview]);
  return (
    <>
      <PageHeading
        title="Good morning."
        subtitle="Here’s the overall picture across your construction sites."
      >
        <Link className="primary-button" to="/ledger">
          + Add entry
        </Link>
      </PageHeading>
      <section className="metrics-grid">
        <Metric
          label="Overall balance"
          value={money(totals.balance)}
          icon={<WalletCards size={19} />}
          accent="orange"
        />
        <Metric
          label="Total income"
          value={money(totals.income)}
          icon={<ArrowDownLeft size={19} />}
          accent="green"
        />
        <Metric
          label="Total expenses"
          value={money(totals.expenses)}
          icon={<ArrowUpRight size={19} />}
          accent="red"
        />
        <Metric
          label="Total budget"
          value={money(totals.budget)}
          icon={<ClipboardList size={19} />}
          accent="blue"
        />
      </section>
      <section className="card collection-card">
        <div className="collection-head">
          <div>
            <h2>Site overview</h2>
            <p>Compare financial status across all accessible sites.</p>
          </div>
          <span className="secure-label">
            <Building2 size={14} /> {overview.sites.length} sites
          </span>
        </div>
        {overview.sites.length ? (
          <div className="site-overview-list">
            {overview.sites.map((site) => (
              <Link className="site-overview-row" to={`/sites`} key={site.id}>
                <span className="site-icon">
                  <Building2 size={16} />
                </span>
                <div className="site-overview-name">
                  <strong>{site.name}</strong>
                  <small>{site.location || "Location not added"}</small>
                </div>
                <div className="site-overview-stats">
                  <span className="site-overview-stat">
                    <small>Income</small>
                    <b className="positive">{money(site.income)}</b>
                  </span>
                  <span className="site-overview-stat">
                    <small>Expenses</small>
                    <b>{money(site.expenses)}</b>
                  </span>
                  <span className="site-overview-stat">
                    <small>Balance</small>
                    <b>{money(site.balance)}</b>
                  </span>
                </div>
                <ArrowUpRight size={15} />
              </Link>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            No sites yet. Open Sites to create your first construction site.
          </div>
        )}
      </section>
      <section className="card collection-card">
        <div className="collection-head">
          <div>
            <h2>Workspace monthly status</h2>
            <p>Combined income and expenses across your sites.</p>
          </div>
        </div>
        <div className="monthly-list">
          {overview.monthly.map((row) => (
            <div className="monthly-row" key={row.month}>
              <span>{row.month}</span>
              <strong className="positive">{money(row.income)}</strong>
              <strong>{money(row.expenses)}</strong>
              <b>{money(row.balance)}</b>
            </div>
          ))}
          {!overview.monthly.length && (
            <div className="empty-state">No ledger activity yet.</div>
          )}
        </div>
      </section>
      {!isBuilder && (
        <div className="soft-callout">
          You are viewing sites assigned to your supervisor account. Add entries
          from a selected site through Ledger.
        </div>
      )}
    </>
  );
}
