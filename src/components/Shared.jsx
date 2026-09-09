import React from "react";
import { ArrowDownLeft, ArrowUpRight, Eye, Pencil, Trash2 } from "lucide-react";
import { brand } from "../lib/brand";

export const getInitials = (name) => {
  if (!name) return "";
  const parts = name.trim().split(/\s+/);
  return parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : parts[0].substring(0, 2).toUpperCase();
};

export const money = (value) =>
  `₹${Number(value || 0).toLocaleString("en-IN")}`;
export function EntryRow({ entry, onView, onEdit, onDelete }) {
  const type = entry.entry_type || entry.type;
  return (
    <div className="entry-row">
      <div className={`entry-type ${type}`}>
        <span>
          {type === "income" ? (
            <ArrowDownLeft size={15} />
          ) : (
            <ArrowUpRight size={15} />
          )}
        </span>
      </div>
      <div className="entry-info">
        <strong>
          {entry.category || entry.categories?.name || "Ledger entry"}
        </strong>
        <span>
          {entry.description || entry.detail || "No description"}
          {entry.payment_method && (
            <em className="pay-badge">{entry.payment_method}</em>
          )}
        </span>
      </div>
      <div className="entry-date">{entry.entry_date}</div>
      <div className="entry-person">
        <div className={`avatar avatar-${entry.tone || "dark"}`}>
          {entry.initials || getInitials(entry.person) || "RK"}
        </div>
        <span>{entry.person || "You"}</span>
      </div>
      <strong className={`entry-amount ${type}`}>
        {type === "income" ? "+" : "-"}
        {money(entry.amount)}
      </strong>
      <div className="row-actions">
        {onView && (
          <button
            className="row-action"
            title="View details"
            onClick={() => onView(entry)}
          >
            <Eye size={14} />
          </button>
        )}
        {onEdit && (
          <button
            className="row-action"
            title="Edit entry"
            onClick={() => onEdit(entry)}
          >
            <Pencil size={14} />
          </button>
        )}
        {onDelete && (
          <button
            className="row-action danger"
            title="Delete entry"
            onClick={() => onDelete(entry)}
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>
    </div>
  );
}
export function PageHeading({
  eyebrow = `${brand.name.toUpperCase()} WORKSPACE`,
  title,
  subtitle,
  children,
}) {
  return (
    <div className="page-heading">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="subtitle">{subtitle}</p>
      </div>
      <div className="heading-actions">{children}</div>
    </div>
  );
}
