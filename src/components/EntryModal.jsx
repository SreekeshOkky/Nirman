import React, { useState } from "react";
import { Check, ChevronDown, Paperclip, ScanLine } from "lucide-react";
import Modal from "./Modal";

const PAYMENT_METHODS = ["UPI", "Bank Transfer", "Cash"];
const DEFAULTS_KEY = "entry-form-defaults";

const forType = (categories, type) =>
  categories.filter((c) => c.type === type || c.type === "both");

// Last-used category per type and payment method, remembered per device.
function readDefaults() {
  try {
    return JSON.parse(window.localStorage.getItem(DEFAULTS_KEY)) || {};
  } catch {
    return {};
  }
}
function rememberEntryDefaults(values) {
  try {
    window.localStorage.setItem(
      DEFAULTS_KEY,
      JSON.stringify({ ...readDefaults(), ...values }),
    );
  } catch {
    // Storage unavailable (private mode): defaults just aren't remembered.
  }
}

export default function EntryModal({
  categories,
  usage = {},
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
  const defaults = isEdit ? {} : readDefaults();
  const [entryType, setEntryType] = useState(
    e.entry_type === "income" ? "income" : "expense",
  );
  // Most-used categories first, so the usual choice is one tap away.
  const sorted = (type) =>
    forType(categories, type)
      .map((category, index) => ({ category, index }))
      .sort(
        (a, b) =>
          (usage[b.category.id] || 0) - (usage[a.category.id] || 0) ||
          a.index - b.index,
      )
      .map(({ category }) => category);
  const pickCategory = (type) => {
    const options = sorted(type);
    const remembered = options.find((c) => c.id === defaults[type]);
    return (remembered || options[0])?.id || "";
  };
  const [categoryId, setCategoryId] = useState(
    isEdit
      ? e.category_id || e.categories?.id
      : (prefill?.category_id &&
          forType(categories, entryType).some(
            (c) => c.id === prefill.category_id,
          ) &&
          prefill.category_id) ||
          pickCategory(entryType),
  );
  const [payment, setPayment] = useState(
    e.payment_method || (isEdit ? "" : defaults.payment_method || ""),
  );
  const [receipt, setReceipt] = useState(receiptFile || null);
  const visibleCategories = sorted(entryType);
  const hasExtras = Boolean(e.note || receiptFile);
  function handleTypeChange(value) {
    setEntryType(value);
    setCategoryId(pickCategory(value));
  }
  return (
    <Modal
      title={
        isEdit ? "Edit entry" : isScanned ? "Review scanned entry" : "Add entry"
      }
      subtitle={
        isEdit
          ? "Update the details for this entry."
          : isScanned
            ? "We read these details from your screenshot — check them before saving."
            : "Record money paid out or received for this site."
      }
      onClose={onClose}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!isEdit)
            rememberEntryDefaults({
              [entryType]: categoryId,
              payment_method: payment,
            });
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
            An expense can't be changed to income (or the other way round).
            Delete this entry and add a new one instead.
          </p>
        )}
        <div className="field">
          <label>Amount</label>
          <input
            name="amount"
            type="number"
            inputMode="decimal"
            min="0.01"
            step="0.01"
            placeholder="₹ 0"
            defaultValue={e.amount || ""}
            required
            autoFocus
          />
        </div>
        <div className="field">
          <label>Category</label>
          {visibleCategories.length ? (
            <div className="chip-group" role="radiogroup" aria-label="Category">
              {visibleCategories.map((category) => (
                <label className="chip" key={category.id}>
                  <input
                    type="radio"
                    name="category_id"
                    value={category.id}
                    checked={categoryId === category.id}
                    onChange={() => setCategoryId(category.id)}
                    required
                  />
                  <span>{category.name}</span>
                </label>
              ))}
            </div>
          ) : (
            <p className="field-hint">
              No {entryType} categories yet. A builder can add them under
              Categories.
            </p>
          )}
        </div>
        <div className="form-grid">
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
          <div className="field">
            <label>
              Paid by <span>Optional</span>
            </label>
            <div className="chip-group" role="radiogroup" aria-label="Paid by">
              {PAYMENT_METHODS.map((method) => (
                <label className="chip" key={method}>
                  <input
                    type="radio"
                    name="payment_method"
                    value={method}
                    checked={payment === method}
                    // Tapping the selected method again clears it.
                    onClick={() =>
                      setPayment((current) =>
                        current === method ? "" : method,
                      )
                    }
                    onChange={() => {}}
                  />
                  <span>{method}</span>
                </label>
              ))}
            </div>
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
          <details className="more-details" open={hasExtras}>
            <summary>
              <ChevronDown size={15} />
              {notesEnabled ? "Add a note or receipt" : "Add a receipt"}
              {receipt && (
                <span className="more-details-badge">
                  <Paperclip size={12} /> 1
                </span>
              )}
            </summary>
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
                onChange={(event) =>
                  setReceipt(event.target.files?.[0] || null)
                }
              />
              {receipt && (
                <p className="scan-attach">
                  <Paperclip size={13} /> {receipt.name || "screenshot"}{" "}
                  attached
                </p>
              )}
            </div>
          </details>
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
