import React, { useEffect, useState } from "react";
import { TriangleAlert } from "lucide-react";
import Modal from "./Modal";
import { money } from "./Shared";
import { api } from "../lib/api";

export default function SiteStatusModal({
  site,
  action,
  token,
  busy,
  onClose,
  onConfirm,
}) {
  const [balance, setBalance] = useState(null);
  useEffect(() => {
    let cancelled = false;
    api
      .summary(site.id, token)
      .then((data) => {
        if (!cancelled) setBalance(data.balance);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [site.id, token]);
  const archiving = action === "archive";
  const notTally = balance !== null && Math.abs(Number(balance)) > 0.005;
  return (
    <Modal
      title={archiving ? "Mark site inactive?" : "Reactivate site?"}
      subtitle={
        archiving
          ? `${site.name} will be hidden and read-only until you reactivate it.`
          : `${site.name} will become active again for everyone on the site.`
      }
      onClose={onClose}
    >
      {notTally && (
        <div className="tally-warning">
          <TriangleAlert size={17} />
          <p>
            The ledger for this site is not tally. Income minus expenses is{" "}
            <strong>{money(balance)}</strong>.
          </p>
        </div>
      )}
      <div className="modal-actions">
        <button className="secondary-button" onClick={onClose} disabled={busy}>
          Cancel
        </button>
        <button className="primary-button" onClick={onConfirm} disabled={busy}>
          {busy
            ? "Working..."
            : archiving
              ? "Yes, mark inactive"
              : "Yes, reactivate"}
        </button>
      </div>
    </Modal>
  );
}
