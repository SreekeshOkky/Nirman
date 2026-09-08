import React, { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { PageHeading, money, EntryRow } from "../components/Shared";
import EntryDetailModal from "../components/EntryDetailModal";
import { api } from "../lib/api";
export default function ReportsPage({ site, siteId, token }) {
  const [entries, setEntries] = useState([]);
  const [summary, setSummary] = useState({
    income: 0,
    expenses: 0,
    balance: 0,
  });
  const [monthly, setMonthly] = useState([]);
  const [selectedMonth, setSelectedMonth] = useState("");
  const [monthEntries, setMonthEntries] = useState([]);
  const [monthLoading, setMonthLoading] = useState(false);
  const [viewing, setViewing] = useState(null);
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
        if (months.length) setSelectedMonth(months[months.length - 1].month);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [siteId, token]);
  useEffect(() => {
    if (!siteId || !selectedMonth) {
      setMonthEntries([]);
      return;
    }
    let cancelled = false;
    setMonthLoading(true);
    const year = Number(selectedMonth.slice(0, 4));
    const month = Number(selectedMonth.slice(5, 7));
    const lastDay = new Date(year, month, 0).getDate();
    api
      .ledger(
        siteId,
        {
          from_date: `${selectedMonth}-01`,
          to_date: `${selectedMonth}-${String(lastDay).padStart(2, "0")}`,
          page_size: 100,
        },
        token,
      )
      .then((result) => {
        if (!cancelled) setMonthEntries(result.items);
      })
      .catch(() => {
        if (!cancelled) setMonthEntries([]);
      })
      .finally(() => {
        if (!cancelled) setMonthLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [siteId, selectedMonth, token]);
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
  async function download(url, filename) {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(objectUrl);
  }
  function exportAll() {
    download(api.reportExportUrl(siteId), `${site.name}-ledger.csv`);
  }
  function exportSelectedMonth() {
    if (!selectedMonth) return;
    download(
      `${api.reportExportUrl(siteId)}?month=${selectedMonth}`,
      `${site.name}-${selectedMonth}-ledger.csv`,
    );
  }
  const selectedMonthData = monthly.find((row) => row.month === selectedMonth);
  return (
    <>
      <PageHeading
        title="Reports"
        subtitle="Understand the financial health of this construction site."
      >
        <button className="secondary-button" onClick={exportAll}>
          <Download size={15} /> Export all entries
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
            <div className="monthly-actions">
              {monthly.length > 0 && (
                <select
                  className="monthly-select"
                  value={selectedMonth}
                  onChange={(event) => setSelectedMonth(event.target.value)}
                >
                  {monthly.map((row) => (
                    <option key={row.month} value={row.month}>
                      {row.month}
                    </option>
                  ))}
                </select>
              )}
              <button
                className="secondary-button card-export"
                onClick={exportSelectedMonth}
                disabled={!selectedMonth}
              >
                <Download size={14} /> Export
              </button>
            </div>
          </div>
          {!monthly.length ? (
            <div className="empty-state">No monthly data yet.</div>
          ) : (
            <>
              {selectedMonthData && (
                <div className="monthly-row month-head">
                  <span>{selectedMonthData.month}</span>
                  <strong className="positive">
                    {money(selectedMonthData.income)}
                  </strong>
                  <strong>{money(selectedMonthData.expenses)}</strong>
                  <b>{money(selectedMonthData.balance)}</b>
                </div>
              )}
              <div className="entries-list month-entries">
                {monthLoading ? (
                  <div className="empty-state">Loading entries…</div>
                ) : !monthEntries.length ? (
                  <div className="empty-state">
                    No entries in {selectedMonth}.
                  </div>
                ) : (
                  monthEntries.map((entry) => (
                    <EntryRow
                      key={entry.id}
                      entry={entry}
                      onView={setViewing}
                    />
                  ))
                )}
              </div>
            </>
          )}
        </div>
      </section>
      {viewing && (
        <EntryDetailModal
          entryId={viewing.id}
          siteId={siteId}
          token={token}
          onClose={() => setViewing(null)}
        />
      )}
    </>
  );
}
