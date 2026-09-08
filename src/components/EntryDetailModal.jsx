import React, { useEffect, useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  ExternalLink,
  Paperclip,
} from "lucide-react";
import Modal from "./Modal";
import { api } from "../lib/api";
import { money } from "./Shared";

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

export default function EntryDetailModal({ entryId, siteId, token, onClose }) {
  const [entry, setEntry] = useState(null);
  const [error, setError] = useState("");

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
      title={isIncome ? "Income entry" : "Expense entry"}
      subtitle={entry.description || entry.categories?.name || "Ledger entry"}
      onClose={onClose}
    >
      <div className={`detail-banner ${type}`}>
        <span className={`detail-type-icon ${type}`}>
          {isIncome ? <ArrowDownLeft size={18} /> : <ArrowUpRight size={18} />}
        </span>
        <div>
          <span className="detail-banner-type">
            {isIncome ? "Income" : "Expense"}
          </span>
          <strong className={`detail-amount ${type}`}>
            {isIncome ? "+" : "-"}
            {money(entry.amount)}
          </strong>
        </div>
      </div>
      <div className="detail-grid">
        <Detail label="Category">{entry.categories?.name}</Detail>
        <Detail label="Entry date">{entry.entry_date}</Detail>
        <Detail label="Payment method">{entry.payment_method}</Detail>
        <Detail label="Reference">{entry.reference}</Detail>
        <Detail label="Added by">{createdBy}</Detail>
        <Detail label="Recorded">{formatTime(entry.created_at)}</Detail>
        {entry.updated_at !== entry.created_at && (
          <Detail label="Last updated">{formatTime(entry.updated_at)}</Detail>
        )}
        <Detail label="Description" full>
          {entry.description}
        </Detail>
        {note && (
          <Detail label="Note" full>
            {note}
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
