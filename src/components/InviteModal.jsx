import React from "react";
import { UserPlus } from "lucide-react";
import Modal from "./Modal";

export default function InviteModal({ onClose, onSubmit, saving }) {
  return (
    <Modal
      title="Invite a supervisor"
      subtitle="Give a teammate access to add entries for this site."
      onClose={onClose}
    >
      <form onSubmit={onSubmit}>
        <div className="field">
          <label>Email address</label>
          <input
            name="email"
            type="email"
            placeholder="supervisor@company.com"
            required
          />
        </div>
        <div className="soft-callout">
          <span>
            Supervisors can add ledger entries and notes, but cannot edit
            settings or view audit logs.
          </span>
        </div>
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary-button" disabled={saving}>
            <UserPlus size={16} /> {saving ? "Sending..." : "Send invitation"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
