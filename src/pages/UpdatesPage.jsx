import React, { useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  ReceiptText,
  Users,
} from "lucide-react";
import { Link } from "react-router-dom";
import { markUpdatesSeen, updateItems } from "../lib/updates";

const ICONS = { budget: AlertTriangle, receipt: ReceiptText, new: Users };

export function UpdateRow({ item }) {
  const Icon = ICONS[item.kind];
  return (
    <Link to={item.to} className="update-row">
      <span className={`update-icon ${item.tone}`}>
        <Icon size={19} />
      </span>
      <span className="update-text">
        <strong>{item.title}</strong>
        <span>{item.detail}</span>
        {item.when && <em>{item.when}</em>}
      </span>
      <ChevronRight size={18} className="menu-row-chevron" />
    </Link>
  );
}

export default function UpdatesPage({ updates, refreshUpdates, isBuilder }) {
  const [filter, setFilter] = useState("all");

  // Fetch fresh on open; on leaving, mark new entries as seen so the badge
  // only counts what arrives afterwards.
  useEffect(() => {
    refreshUpdates();
    return () => {
      markUpdatesSeen();
      refreshUpdates();
    };
  }, [refreshUpdates]);

  const items = updateItems(updates, { mine: !isBuilder });
  const count = (kind) => items.filter((item) => item.kind === kind).length;
  const filters = [
    { id: "all", label: "All", n: items.length },
    { id: "receipt", label: "No receipt", n: count("receipt") },
    isBuilder && { id: "budget", label: "Budget", n: count("budget") },
    isBuilder && { id: "new", label: "New entries", n: count("new") },
  ].filter(Boolean);
  const shown = items.filter(
    (item) => filter === "all" || item.kind === filter,
  );

  return (
    <>
      <div className="home-heading">
        <div>
          <h1>Updates</h1>
          <p className="home-greeting">
            {isBuilder
              ? "What needs you across all your sites"
              : "Payments that still need a receipt"}
          </p>
        </div>
      </div>

      {items.length > 0 && filters.length > 2 && (
        <div className="filter-chips" role="group" aria-label="Filter updates">
          {filters.map((option) => (
            <button
              key={option.id}
              type="button"
              aria-pressed={filter === option.id}
              className={filter === option.id ? "active" : ""}
              onClick={() => setFilter(option.id)}
            >
              {option.label} · {option.n}
            </button>
          ))}
        </div>
      )}

      {!updates ? (
        <div className="card empty-state">Loading…</div>
      ) : !shown.length ? (
        <div className="card empty-state all-clear">
          <CheckCircle2 size={28} />
          <strong>All caught up</strong>
          <span>Nothing needs your attention right now.</span>
        </div>
      ) : (
        <div className="card menu-card">
          {shown.map((item) => (
            <UpdateRow key={item.key} item={item} />
          ))}
        </div>
      )}

      {items.length > 0 && (
        <p className="updates-footnote">
          A payment leaves this list once its receipt is added.
          {isBuilder &&
            " Budget alerts clear when the site is back under 90% of its budget."}
        </p>
      )}
    </>
  );
}
