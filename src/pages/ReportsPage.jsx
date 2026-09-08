import React, { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { PageHeading, money } from "../components/Shared";
import { api } from "../lib/api";
export default function ReportsPage({ site, siteId, token }) {
  const [entries, setEntries] = useState([]);
  const [summary, setSummary] = useState({
    income: 0,
    expenses: 0,
    balance: 0,
  });
  const [monthly, setMonthly] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!siteId) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([
      api.ledger(siteId, {}, token),
      api.summary(siteId, token),
      api.monthly(siteId, token),
    ])
      .then(([ledger, totals, months]) => {
        if (cancelled) return;
        setEntries(ledger.items);
        setSummary(totals);
        setMonthly(months);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [siteId, token]);
  if (!site)
    return (
      <>
        <PageHeading
          title="Reports"
          subtitle="Select a construction site to view its report."
        />
        <div className="card empty-state">No site selected.</div>
      </>
    );
  if (loading) {
    return (
      <>
        <PageHeading
          title="Reports"
          subtitle="Understand the financial health of this construction site."
        />
        <div className="card empty-state">Loading report…</div>
      </>
    );
  }
  const expenseByCategory = entries
    .filter((e) => e.entry_type === "expense")
    .reduce((acc, entry) => {
      const key = entry.categories?.name || "Other";
      acc[key] = (acc[key] || 0) + Number(entry.amount);
      return acc;
    }, {});
  async function download() {
    const response = await fetch(api.reportExportUrl(siteId), {
      headers: { Authorization: `Bearer ${token}` },
    });
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${site.name}-ledger.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }
  return (
    <>
      <PageHeading
        title="Reports"
        subtitle="Understand the financial health of this construction site."
      >
        <button className="secondary-button" onClick={download}>
          <Download size={15} /> Export CSV
        </button>
      </PageHeading>
      <section className="report-summary">
        <div className="card report-hero">
          <p className="eyebrow">SITE PERFORMANCE</p>
          <h2>{site.name}</h2>
          <p>Complete financial picture for your selected site.</p>
          <div className="report-big-number">
            {money(summary.balance)} <span>net balance</span>
          </div>
        </div>
        <div className="card report-stat">
          <span>Total income</span>
          <strong className="positive">{money(summary.income)}</strong>
          <small>Money received</small>
        </div>
        <div className="card report-stat">
          <span>Total expenses</span>
          <strong>{money(summary.expenses)}</strong>
          <small>Money spent</small>
        </div>
      </section>
      <section className="report-grid">
        <div className="card report-card">
          <div className="card-head">
            <div>
              <h2>Expense by category</h2>
              <p>Where the site budget is going</p>
            </div>
          </div>
          <div className="category-bars">
            {Object.entries(expenseByCategory).map(([name, amount]) => (
              <div className="category-bar" key={name}>
                <div>
                  <span>{name}</span>
                  <strong>{money(amount)}</strong>
                </div>
                <div className="bar-line">
                  <i
                    style={{
                      width: `${Math.min(100, (amount / Math.max(summary.expenses, 1)) * 100)}%`,
                    }}
                  />
                </div>
              </div>
            ))}
            {!Object.keys(expenseByCategory).length && (
              <div className="empty-state">No expenses recorded yet.</div>
            )}
          </div>
        </div>
        <div className="card report-card">
          <div className="card-head">
            <div>
              <h2>Monthly status</h2>
              <p>Income, expenses, and balance</p>
            </div>
          </div>
          <div className="monthly-list">
            {monthly.map((row) => (
              <div className="monthly-row" key={row.month}>
                <span>{row.month}</span>
                <strong className="positive">{money(row.income)}</strong>
                <strong>{money(row.expenses)}</strong>
                <b>{money(row.balance)}</b>
              </div>
            ))}
            {!monthly.length && (
              <div className="empty-state">No monthly data yet.</div>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
