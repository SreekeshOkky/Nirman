import React, { useEffect, useMemo, useRef, useState } from "react";
import { useOutletContext, useSearchParams } from "react-router-dom";
import { Filter, Plus, ScanLine, Search, Trash2 } from "lucide-react";
import { PageHeading, EntryRow } from "../components/Shared";
import EntryModal from "../components/EntryModal";
import EntryDetailModal from "../components/EntryDetailModal";
import Modal from "../components/Modal";
import { api } from "../lib/api";
import { scanUpiScreenshot } from "../lib/upiScan";
import { takePendingShare, takeSharedFile } from "../lib/shareTarget";
export default function LedgerPage({
  embedded = false,
  siteId,
  token,
  flash,
  features,
  isBuilder,
}) {
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
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [searchParams, setSearchParams] = useSearchParams();
  // Inside a site page: lets the header's budget figures follow our changes.
  const outlet = useOutletContext();
  const scanInputRef = useRef(null);
  const scanEnabled = features?.scan !== false;
  // How often each category is used, so the entry form can list them first.
  const usage = useMemo(() => {
    const counts = {};
    entries.forEach((entry) => {
      counts[entry.category_id] = (counts[entry.category_id] || 0) + 1;
    });
    return counts;
  }, [entries]);
  // The mobile "Add entry" button links here with ?add=1.
  useEffect(() => {
    if (loading || searchParams.get("add") !== "1") return;
    setSearchParams({}, { replace: true });
    setEditing(null);
    setPrefill(null);
    setPrefillReceipt(null);
    setShow(true);
  }, [loading, searchParams]);
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
    outlet?.refreshSummary?.();
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
            message.status.charAt(0).toUpperCase() +
              message.status.slice(1) +
              "…",
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
  function remove(entry) {
    setConfirmDelete(entry);
  }
  async function confirmRemove() {
    const entry = confirmDelete;
    setSaving(true);
    try {
      await api.deleteLedger(siteId, entry.id, token);
      setConfirmDelete(null);
      await refresh();
      flash("Entry deleted", {
        label: "Undo",
        onClick: async () => {
          try {
            await api.restoreLedger(siteId, entry.id, token);
            await refresh();
            flash("Entry restored");
          } catch (error) {
            flash(error.message);
          }
        },
      });
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
        embedded={embedded}
        title="Ledger"
        subtitle="Track every rupee moving through this site."
      >
        {scanEnabled && (
          <button className="secondary-button" onClick={openScan}>
            <ScanLine size={16} /> Scan UPI
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
        </div>
        <div className="table-header">
          <span>ENTRY</span>
          <span>DATE</span>
          <span>ADDED BY</span>
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
            <div className="empty-state">
              {entries.length
                ? "No entries match your search."
                : "No entries yet. Tap Add entry to record your first payment."}
            </div>
          ) : null}
        </div>
      </div>
      {show && (
        <EntryModal
          categories={categories}
          usage={usage}
          onClose={closeEntry}
          onSubmit={handleSubmit}
          saving={saving}
          editing={editing}
          prefill={editing ? null : prefill}
          receiptFile={editing ? null : prefillReceipt}
          notesEnabled={features?.notes !== false}
        />
      )}
      {confirmDelete && (
        <Modal
          title="Delete this entry?"
          subtitle={`${confirmDelete.categories?.name || "Entry"} · ₹${Number(
            confirmDelete.amount || 0,
          ).toLocaleString("en-IN")}`}
          onClose={() => setConfirmDelete(null)}
        >
          <p className="field-hint">
            It will be removed from the ledger and reports. You can undo this
            right after deleting.
          </p>
          <div className="modal-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={() => setConfirmDelete(null)}
            >
              Cancel
            </button>
            <button
              className="primary-button danger-button"
              disabled={saving}
              onClick={confirmRemove}
            >
              <Trash2 size={16} /> {saving ? "Deleting..." : "Delete entry"}
            </button>
          </div>
        </Modal>
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
              <i
                style={{ width: `${Math.round((scanProgress || 0) * 100)}%` }}
              />
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
