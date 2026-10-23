import React from "react";
import { Plus } from "lucide-react";
import Modal from "./Modal";

export default function SiteModal({ onClose, onSubmit, saving }) {
  return (
    <Modal
      title="Create a construction site"
      subtitle="Set up a new workspace for your project."
      onClose={onClose}
    >
      <form onSubmit={onSubmit}>
        <div className="field">
          <label htmlFor="site-name">Site name</label>
          <input
            id="site-name"
            name="name"
            placeholder="e.g. Palm Court Renovation"
            required
          />
        </div>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="site-location">Location</label>
            <input
              id="site-location"
              name="location"
              placeholder="City or address"
            />
          </div>
          <div className="field">
            <label htmlFor="site-budget">Budget</label>
            <input
              id="site-budget"
              name="budget"
              type="number"
              inputMode="numeric"
              placeholder="₹ 0"
            />
          </div>
        </div>
        <div className="field">
          <label htmlFor="site-client">
            Client name <span>Optional</span>
          </label>
          <input
            id="site-client"
            name="client_name"
            placeholder="Client or owner"
          />
        </div>
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary-button" disabled={saving}>
            <Plus size={17} /> {saving ? "Creating…" : "Create site"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
