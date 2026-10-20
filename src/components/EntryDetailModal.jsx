import React, { useEffect, useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Camera,
  ExternalLink,
  Paperclip,
} from "lucide-react";
import Modal from "./Modal";
import { api } from "../lib/api";
import { formatDate, money } from "./Shared";

function Detail({ label, children, full }) {
  return (
    <div className={`detail-item${full ? " full" : ""}`}>
      <span className="detail-label">{label}</span>
      <div className="detail-value">{children || "—"}</div>
    </div>
  );
}

const formatTime = (iso) =>
  iso
    ? new Date(iso).toLocaleString("en-IN", {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "";

export default function EntryDetailModal({
  entryId,
  siteId,
  token,
  onClose,
  canAddReceipt = false,
  onReceiptAdded,
}) {
  const [entry, setEntry] = useState(null);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");

  useEffect(() => {
    let cancelled = false;
    api
      .ledgerEntry(siteId, entryId, token)
      .then((data) => {
        if (!cancelled) setEntry(data);
      })
      .catch((reason) => {
        if (!cancelled) setError(reason.message);
      });
    return () => {
      cancelled = true;
    };
  }, [siteId, entryId, token]);

  async function addReceipt(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setUploading(true);
    setUploadError("");
    try {
      await api.uploadAttachment(siteId, file, token, entryId);
      setEntry(await api.ledgerEntry(siteId, entryId, token));
      onReceiptAdded?.();
    } catch (reason) {
      setUploadError(reason.message);
    } finally {
      setUploading(false);
    }
  }

  if (error) {
    return (
      <Modal
        title="Ledger entry"
        subtitle="Details could not be loaded."
        onClose={onClose}
      >
        <div className="empty-state">{error}</div>
        <div className="modal-actions">
          <button className="secondary-button" onClick={onClose}>
            Close
          </button>
        </div>
      </Modal>
    );
  }
  if (!entry) {
    return (
      <Modal
        title="Ledger entry"
        subtitle="Loading details..."
        onClose={onClose}
      >
        <div className="empty-state">Loading…</div>
      </Modal>
    );
  }

  const type = entry.entry_type;
  const note = entry.notes?.[0]?.content;
  const attachment = entry.attachments?.[0];
  const createdBy = entry.profiles?.full_name || "You";
  const isIncome = type === "income";

  return (
    <Modal
      title={isIncome ? "Money received" : "Payment"}
      subtitle={entry.paid_to || entry.categories?.name || "Entry"}
      onClose={onClose}
    >
      <div className={`detail-banner ${type}`}>
        <span className={`detail-type-icon ${type}`}>
          {isIncome ? <ArrowDownLeft size={18} /> : <ArrowUpRight size={18} />}
        </span>
        <div>
          <span className="detail-banner-type">
            {isIncome ? "Received" : "Paid out"}
          </span>
          <strong className={`detail-amount ${type}`}>
            {isIncome ? "+" : "-"}
            {money(entry.amount)}
          </strong>
        </div>
      </div>
      <div className="detail-grid">
        <Detail label={isIncome ? "Received from" : "Paid to"}>
          {entry.paid_to}
        </Detail>
        <Detail label="Category">{entry.categories?.name}</Detail>
        <Detail label="Date">{formatDate(entry.entry_date)}</Detail>
        <Detail label="How">{entry.payment_method}</Detail>
        {entry.reference && (
          <Detail label="UPI / bank reference">{entry.reference}</Detail>
        )}
        <Detail label="Added by">{createdBy}</Detail>
        <Detail label="Recorded">{formatTime(entry.created_at)}</Detail>
        {entry.updated_at !== entry.created_at && (
          <Detail label="Last updated">{formatTime(entry.updated_at)}</Detail>
        )}
        <Detail label="What for" full>
          {entry.description}
        </Detail>
        {note && (
          <Detail label="Note" full>
            {note}
          </Detail>
        )}
        {!attachment && canAddReceipt && (
          <Detail label="Receipt" full>
            <label className="receipt-tile">
              <input
                type="file"
                accept="image/jpeg,image/png,application/pdf"
                onChange={addReceipt}
                disabled={uploading}
              />
              <Camera size={18} />
              <span>{uploading ? "Uploading…" : "Add receipt photo"}</span>
            </label>
            {uploadError && <p className="field-hint">{uploadError}</p>}
          </Detail>
        )}
        {attachment && (
          <Detail label="Receipt" full>
            <a
              className="receipt-link"
              href={attachment.signed_url}
              target="_blank"
              rel="noreferrer"
            >
              <Paperclip size={15} />
              {attachment.file_name}
              <ExternalLink size={13} />
            </a>
          </Detail>
        )}
      </div>
      <div className="modal-actions">
        <button className="secondary-button" onClick={onClose}>
          Close
        </button>
      </div>
    </Modal>
  );
}
