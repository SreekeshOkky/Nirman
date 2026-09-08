import React, { useState } from "react";
import { Filter, Plus, Search, SlidersHorizontal } from "lucide-react";
import { PageHeading, EntryRow } from "../components/Shared";
import EntryModal from "../components/EntryModal";
import EntryDetailModal from "../components/EntryDetailModal";
import { api } from "../lib/api";
export default function LedgerPage({
  entries,
  setEntries,
  categories,
  setSummary,
  siteId,
  token,
  flash,
}) {
  const [query, setQuery] = useState("");
  const [type, setType] = useState("all");
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(null);
  const [viewing, setViewing] = useState(null);
  const filtered = entries.filter(
    (entry) =>
      (!query ||
        `${entry.category || entry.categories?.name} ${entry.description || entry.detail}`
          .toLowerCase()
          .includes(query.toLowerCase())) &&
      (type === "all" || entry.entry_type === type),
  );
  const refresh = async () => {
    const [ledger, totals] = await Promise.all([
      api.ledger(siteId, {}, token),
      api.summary(siteId, token),
    ]);
    setEntries(ledger.items);
    setSummary(totals);
  };
  async function create(event) {
    event.preventDefault();
    setSaving(true);
    try {
      const form = new FormData(event.currentTarget);
      const payload = {
        entry_type: form.get("entry_type"),
        category_id: form.get("category_id"),
        amount: Number(form.get("amount")),
        entry_date: form.get("entry_date"),
        description: form.get("description") || "",
        note: form.get("note") || null,
      };
      const entry = await api.createLedger(siteId, payload, token);
      const receipt = form.get("receipt");
      if (receipt?.size)
        await api.uploadAttachment(siteId, receipt, token, entry.id);
      await refresh();
      setShow(false);
      flash("Ledger entry saved");
    } finally {
      setSaving(false);
    }
  }
  function startEdit(entry) {
    setEditing(entry);
    setShow(true);
  }
  async function saveEdit(event) {
    event.preventDefault();
    setSaving(true);
    try {
      const form = new FormData(event.currentTarget);
      const payload = {
        category_id: form.get("category_id"),
        amount: Number(form.get("amount")),
        entry_date: form.get("entry_date"),
        description: form.get("description") || "",
      };
      await api.updateLedger(siteId, editing.id, payload, token);
      await refresh();
      setShow(false);
      setEditing(null);
      flash("Ledger entry updated");
    } finally {
      setSaving(false);
    }
  }
  async function remove(entry) {
    if (!window.confirm("Delete this ledger entry? This cannot be undone."))
      return;
    setSaving(true);
    try {
      await api.deleteLedger(siteId, entry.id, token);
      await refresh();
      flash("Ledger entry deleted");
    } finally {
      setSaving(false);
    }
  }
  const handleSubmit = editing ? saveEdit : create;
  return (
    <>
      <PageHeading
        title="Ledger"
        subtitle="Track every rupee moving through this site."
      >
        <button
          className="primary-button"
          onClick={() => {
            setEditing(null);
            setShow(true);
          }}
        >
          <Plus size={17} /> Add entry
        </button>
      </PageHeading>
      <div className="card ledger-card full-card">
        <div className="ledger-controls">
          <div className="search-box">
            <Search size={16} />
            <input
              placeholder="Search entries"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <div className="filter-wrap">
            <Filter size={15} />
            <select
              value={type}
              onChange={(event) => setType(event.target.value)}
            >
              <option value="all">All entries</option>
              <option value="income">Income</option>
              <option value="expense">Expenses</option>
            </select>
          </div>
          <button className="filter-button">
            <SlidersHorizontal size={16} />
          </button>
        </div>
        <div className="table-header">
          <span>ENTRY</span>
          <span>DATE</span>
          <span>AMOUNT</span>
        </div>
        <div className="ledger-rows">
          {filtered.map((entry) => (
            <EntryRow
              key={entry.id}
              entry={entry}
              onView={setViewing}
              onEdit={startEdit}
              onDelete={remove}
            />
          ))}
          {!filtered.length && (
            <div className="empty-state">No entries found.</div>
          )}
        </div>
      </div>
      {show && (
        <EntryModal
          categories={categories}
          onClose={() => {
            setShow(false);
            setEditing(null);
          }}
          onSubmit={handleSubmit}
          saving={saving}
          editing={editing}
        />
      )}
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
