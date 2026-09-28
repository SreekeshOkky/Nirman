import React, { useState } from "react";
import { Check, Paperclip, Plus, ScanLine } from "lucide-react";
import Modal from "./Modal";

const forType = (categories, type) =>
  categories.filter((c) => c.type === type || c.type === "both");

export default function EntryModal({
  categories,
  onClose,
  onSubmit,
  saving,
  editing,
  prefill = null,
  receiptFile = null,
  notesEnabled = true,
}) {
  const e = editing || prefill || {};
  const isEdit = Boolean(editing);
  const isScanned = Boolean(prefill) && !isEdit;
  const [entryType, setEntryType] = useState(
    (editing || prefill)?.entry_type === "income" ? "income" : "expense",
  );
  const [categoryId, setCategoryId] = useState(
    isEdit
      ? e.category_id || e.categories?.id
      : prefill?.category_id ||
          forType(categories, prefill?.entry_type === "income" ? "income" : "expense")[0]?.id ||
          forType(categories, "expense")[0]?.id ||
          forType(categories, "income")[0]?.id ||
          categories[0]?.id,
  );
  const [receipt, setReceipt] = useState(receiptFile || null);
  const visibleCategories = forType(categories, entryType);
  function handleTypeChange(value) {
    setEntryType(value);
    const first = forType(categories, value)[0];
    setCategoryId(first?.id || (isEdit ? e.category_id : ""));
  }
  return (
    <Modal
      title={
        isEdit
          ? "Edit ledger entry"
          : isScanned
            ? "Review scanned entry"
            : "Add ledger entry"
      }
      subtitle={
        isEdit
          ? "Update the details for this ledger entry."
          : isScanned
            ? "We read these details from your screenshot — check them before saving."
            : "Record money moving in or out of this site."
      }
      onClose={onClose}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit(event, receipt);
        }}
      >
        {isScanned && (
          <div className="scan-banner">
            <ScanLine size={16} />
            <span>
              Scanned from screenshot
              {e.app ? ` (${e.app})` : ""}. Edit anything that looks wrong.
            </span>
          </div>
        )}
        <div className="type-toggle">
          <label>
            <input
              type="radio"
              name="entry_type"
              value="expense"
              checked={entryType === "expense"}
              onChange={(event) => handleTypeChange(event.target.value)}
              disabled={isEdit}
            />
            <span>Expense</span>
          </label>
          <label>
            <input
              type="radio"
              name="entry_type"
              value="income"
              checked={entryType === "income"}
              onChange={(event) => handleTypeChange(event.target.value)}
              disabled={isEdit}
            />
            <span>Income</span>
          </label>
        </div>
        {isEdit && (
          <p className="field-hint">
            The entry type cannot be changed. Disable and re-add an entry to
            flip income to expense or vice versa.
          </p>
        )}
        <div className="field">
          <label>Amount</label>
          <input
            name="amount"
            type="number"
            min="1"
            placeholder="₹ 0"
            defaultValue={e.amount || ""}
            required
            autoFocus
          />
        </div>
        <div className="form-grid">
          <div className="field">
            <label>Category</label>
            <select
              name="category_id"
              value={categoryId}
              onChange={(event) => setCategoryId(event.target.value)}
            >
              {visibleCategories.length ? (
                visibleCategories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))
              ) : (
                <option value="">No {entryType} categories</option>
              )}
            </select>
          </div>
          <div className="field">
            <label>Date</label>
            <input
              name="entry_date"
              type="date"
              defaultValue={
                e.entry_date || new Date().toISOString().slice(0, 10)
              }
              required
            />
          </div>
        </div>
        <div className="pay-field">
          <label className="pay-label">
            Payment method <span>Optional</span>
          </label>
          <div className="type-toggle">
            {["UPI", "Bank Transfer", "Cash"].map((method) => (
              <label key={method}>
                <input
                  type="radio"
                  name="payment_method"
                  value={method}
                  defaultChecked={e.payment_method === method}
                />
                <span>{method}</span>
              </label>
            ))}
          </div>
        </div>
        <div className="field">
          <label>
            Description <span>Optional</span>
          </label>
          <input
            name="description"
            placeholder="What was this for?"
            defaultValue={e.description || ""}
          />
        </div>
        {!isEdit && (
          <>
            {notesEnabled && (
              <div className="field">
                <label>
                  Note <span>Optional</span>
                </label>
                <textarea
                  name="note"
                  rows="2"
                  placeholder="Add context for your team..."
                  defaultValue={e.note || ""}
                />
              </div>
            )}
            <div className="field">
              <label>
                Receipt <span>JPG, PNG or PDF up to 10MB</span>
              </label>
              <input
                name="receipt"
                type="file"
                accept="image/jpeg,image/png,application/pdf"
                onChange={(event) => setReceipt(event.target.files?.[0] || null)}
              />
              {receipt && (
                <p className="scan-attach">
                  <Paperclip size={13} /> {receipt.name || "screenshot"} attached
                </p>
              )}
            </div>
          </>
        )}
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary-button" disabled={saving}>
            <Check size={17} />{" "}
            {saving ? "Saving..." : isEdit ? "Save changes" : "Save entry"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
