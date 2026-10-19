import React, { useEffect, useRef, useState } from "react";
import { Filter, Plus, ScanLine, Search, SlidersHorizontal } from "lucide-react";
import { PageHeading, EntryRow } from "../components/Shared";
import EntryModal from "../components/EntryModal";
import EntryDetailModal from "../components/EntryDetailModal";
import Modal from "../components/Modal";
import { api } from "../lib/api";
import { scanUpiScreenshot } from "../lib/upiScan";
import { takePendingShare, takeSharedFile } from "../lib/shareTarget";
export default function LedgerPage({ siteId, token, flash, features, isBuilder }) {
  const [entries, setEntries] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [type, setType] = useState("all");
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [scanStatus, setScanStatus] = useState("");
  const [prefill, setPrefill] = useState(null);
  const [prefillReceipt, setPrefillReceipt] = useState(null);
  const scanInputRef = useRef(null);
  const scanEnabled = features?.scan !== false;
  useEffect(() => {
    if (!siteId) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([api.categories(siteId, token), api.ledger(siteId, {}, token)])
      .then(([cats, ledger]) => {
        if (cancelled) return;
        setCategories(cats);
        setEntries(ledger.items);
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
  }, [siteId, token]);
  // If a screenshot was shared to the app, scan it once the site data is ready.
  const shareHandled = useRef(false);
  useEffect(() => {
    if (shareHandled.current || loading) return;
    let active = true;
    (async () => {
      const file = takePendingShare() || (await takeSharedFile());
      if (!active || !file) return;
      shareHandled.current = true;
      await processScanFile(file);
    })();
    return () => {
      active = false;
    };
  }, [loading]);
  const filtered = entries.filter(
    (entry) =>
      (!query ||
        `${entry.category || entry.categories?.name} ${entry.description || entry.detail}`
          .toLowerCase()
          .includes(query.toLowerCase())) &&
      (type === "all" || entry.entry_type === type),
  );
  const refresh = async () => {
    const ledger = await api.ledger(siteId, {}, token);
    setEntries(ledger.items);
  };
  async function create(event, receiptFile) {
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
        payment_method: form.get("payment_method") || null,
        note: form.get("note") || null,
      };
      const entry = await api.createLedger(siteId, payload, token);
      const receipt = receiptFile || form.get("receipt");
      if (receipt?.size)
        await api.uploadAttachment(siteId, receipt, token, entry.id);
      await refresh();
      setShow(false);
      setPrefill(null);
      setPrefillReceipt(null);
      flash("Ledger entry saved");
    } catch (error) {
      flash(error.message);
    } finally {
      setSaving(false);
    }
  }
  function closeEntry() {
    setShow(false);
    setEditing(null);
    setPrefill(null);
    setPrefillReceipt(null);
  }
  function openScan() {
    scanInputRef.current?.click();
  }
  async function handleScanFile(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    await processScanFile(file);
  }
  async function processScanFile(file) {
    if (!file) return;
    setScanning(true);
    setScanProgress(0);
    setScanStatus("Preparing screenshot…");
    try {
      const result = await scanUpiScreenshot(file, categories, (message) => {
        if (message?.status === "recognizing text") {
          setScanStatus("Reading text…");
          setScanProgress(message.progress || 0);
        } else if (message?.status) {
          setScanStatus(
            message.status.charAt(0).toUpperCase() + message.status.slice(1) + "…",
          );
        }
      });
      if (!result.amount && !result.counterparty) {
        flash("Couldn't read that screenshot — please add the entry manually.");
      }
      setPrefill(result);
      setPrefillReceipt(file);
      setEditing(null);
      setShow(true);
    } catch (error) {
      flash(error.message || "Could not read that screenshot");
    } finally {
      setScanning(false);
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
        payment_method: form.get("payment_method") || null,
      };
      await api.updateLedger(siteId, editing.id, payload, token);
      await refresh();
      setShow(false);
      setEditing(null);
      flash("Ledger entry updated");
    } catch (error) {
      flash(error.message);
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
    } catch (error) {
      flash(error.message);
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
        {scanEnabled && (
          <button className="secondary-button" onClick={openScan}>
            <ScanLine size={16} /> Scan UPI screenshot
          </button>
        )}
        <button
          className="primary-button"
          onClick={() => {
            setEditing(null);
            setPrefill(null);
            setPrefillReceipt(null);
            setShow(true);
          }}
        >
          <Plus size={17} /> Add entry
        </button>
        <input
          id="upi-scan-input"
          ref={scanInputRef}
          type="file"
          accept="image/*"
          className="hidden-file-input"
          onChange={handleScanFile}
        />
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
              onEdit={isBuilder ? startEdit : null}
              onDelete={isBuilder ? remove : null}
            />
          ))}
          {loading ? (
            <div className="empty-state">Loading entries…</div>
          ) : !filtered.length ? (
            <div className="empty-state">No entries found.</div>
          ) : null}
        </div>
      </div>
      {show && (
        <EntryModal
          categories={categories}
          onClose={closeEntry}
          onSubmit={handleSubmit}
          saving={saving}
          editing={editing}
          prefill={editing ? null : prefill}
          receiptFile={editing ? null : prefillReceipt}
          notesEnabled={features?.notes !== false}
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
      {scanning && (
        <Modal
          title="Reading screenshot"
          subtitle="This runs on your device — the image is never uploaded."
          onClose={() => {}}
        >
          <div className="scan-progress">
            <div className="scan-progress-track">
              <i style={{ width: `${Math.round((scanProgress || 0) * 100)}%` }} />
            </div>
            <p className="scan-status">{scanStatus || "Working…"}</p>
            <p className="field-hint">
              The first scan downloads a small OCR model and can take a few
              seconds.
            </p>
          </div>
        </Modal>
      )}
    </>
  );
}
