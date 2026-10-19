import React, { useState } from "react";
import { Camera, Check, ChevronDown, Paperclip, ScanLine } from "lucide-react";
import Modal from "./Modal";

const PAYMENT_METHODS = ["Cash", "UPI", "Bank Transfer"];
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
  payees = { expense: [], income: [] },
  siteName = "",
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
  const [payee, setPayee] = useState(e.paid_to || prefill?.counterparty || "");
  const [receipt, setReceipt] = useState(receiptFile || null);
  const visibleCategories = sorted(entryType);
  const received = entryType === "income";
  const recent = (payees[entryType] || [])
    .filter((name) => name !== payee)
    .slice(0, 3);
  const hasDetails = Boolean(e.description || (e.note && !isEdit));

  function handleTypeChange(value) {
    setEntryType(value);
    setCategoryId(pickCategory(value));
  }

  function submit(event) {
    event.preventDefault();
    const again = event.nativeEvent.submitter?.value === "again";
    if (!isEdit)
      rememberEntryDefaults({
        [entryType]: categoryId,
        payment_method: payment,
      });
    onSubmit(event, receipt, { again });
  }

  return (
    <Modal
      variant="panel"
      title={
        isEdit
          ? "Edit entry"
          : isScanned
            ? "Check scanned payment"
            : "Add entry"
      }
      subtitle={siteName}
      onClose={onClose}
    >
      <form className="entry-form" onSubmit={submit}>
        <div className="entry-form-body">
          {isScanned && (
            <div className="scan-banner">
              <ScanLine size={16} />
              <span>
                Read from your {e.app || "UPI"} screenshot. Check the details;
                the screenshot is saved as the receipt.
              </span>
            </div>
          )}
          <div className="type-toggle" role="radiogroup" aria-label="Type">
            <label>
              <input
                type="radio"
                name="entry_type"
                value="expense"
                checked={!received}
                onChange={(event) => handleTypeChange(event.target.value)}
                disabled={isEdit}
              />
              <span>Paid out</span>
            </label>
            <label>
              <input
                type="radio"
                name="entry_type"
                value="income"
                checked={received}
                onChange={(event) => handleTypeChange(event.target.value)}
                disabled={isEdit}
              />
              <span>Received</span>
            </label>
          </div>
          {isEdit && (
            <p className="field-hint entry-type-hint">
              Paid out can’t be changed to received (or the other way round).
              Delete this entry and add a new one instead.
            </p>
          )}

          <label className="amount-tile">
            <span>Amount</span>
            <span className="amount-tile-input">
              <span aria-hidden="true">₹</span>
              <input
                name="amount"
                type="number"
                inputMode="decimal"
                min="0.01"
                step="0.01"
                placeholder="0"
                defaultValue={e.amount || ""}
                required
                autoFocus
              />
            </span>
          </label>

          <div className="field">
            <label htmlFor="entry-paid-to">
              {received ? "Received from" : "Paid to"}
            </label>
            <input
              id="entry-paid-to"
              name="paid_to"
              value={payee}
              onChange={(event) => setPayee(event.target.value)}
              placeholder="Name of person or shop"
              maxLength={120}
              autoComplete="off"
            />
            {recent.length > 0 && (
              <div className="recent-payees">
                <span>Recent:</span>
                {recent.map((name) => (
                  <button
                    type="button"
                    key={name}
                    onClick={() => setPayee(name)}
                  >
                    {name}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="field">
            <label>Category</label>
            {visibleCategories.length ? (
              <div
                className="chip-group"
                role="radiogroup"
                aria-label="Category"
              >
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
                    <span>
                      {categoryId === category.id && (
                        <Check size={16} strokeWidth={2.8} />
                      )}
                      {category.name}
                    </span>
                  </label>
                ))}
              </div>
            ) : (
              <p className="field-hint">
                No {received ? "money-received" : "payment"} categories yet. A
                builder can add them under Categories.
              </p>
            )}
          </div>

          <div className="field">
            <label>
              How <span>Optional</span>
            </label>
            <div className="chip-group" role="radiogroup" aria-label="How">
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
                  <span>
                    {payment === method && (
                      <Check size={16} strokeWidth={2.8} />
                    )}
                    {method}
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div className="entry-form-pair">
            <div className="field">
              <label htmlFor="entry-date">Date</label>
              <input
                id="entry-date"
                name="entry_date"
                type="date"
                defaultValue={
                  e.entry_date || new Date().toISOString().slice(0, 10)
                }
                required
              />
            </div>
            {!isEdit && (
              <div className="field">
                <label>
                  Receipt <span>Optional</span>
                </label>
                <label className={`receipt-tile ${receipt ? "attached" : ""}`}>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,application/pdf"
                    onChange={(event) =>
                      setReceipt(event.target.files?.[0] || null)
                    }
                  />
                  {receipt ? <Paperclip size={18} /> : <Camera size={18} />}
                  <span>
                    {receipt ? receipt.name || "Receipt attached" : "Add photo"}
                  </span>
                </label>
              </div>
            )}
          </div>

          <details className="more-details" open={hasDetails}>
            <summary>
              <ChevronDown size={15} />
              {notesEnabled && !isEdit
                ? "Add what it was for or a note"
                : "Add what it was for"}
            </summary>
            <div className="field">
              <label htmlFor="entry-description">
                What for <span>Optional</span>
              </label>
              <input
                id="entry-description"
                name="description"
                placeholder="e.g. Sand, 2 loads"
                defaultValue={e.description || ""}
                maxLength={500}
              />
            </div>
            {notesEnabled && !isEdit && (
              <div className="field">
                <label htmlFor="entry-note">
                  Note for the team <span>Optional</span>
                </label>
                <textarea
                  id="entry-note"
                  name="note"
                  rows="2"
                  placeholder="Anything the builder should know"
                  defaultValue={e.note || ""}
                />
              </div>
            )}
          </details>
          <input
            type="hidden"
            name="reference"
            defaultValue={e.reference || ""}
          />
        </div>

        <div className="entry-form-actions">
          {!isEdit && (
            <button
              type="submit"
              value="again"
              className="text-button save-again"
              disabled={saving}
            >
              Save and add another
            </button>
          )}
          <button type="button" className="secondary-button" onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            value="save"
            className="primary-button"
            disabled={saving}
          >
            <Check size={17} />{" "}
            {saving
              ? "Saving..."
              : isEdit
                ? "Save changes"
                : received
                  ? "Save money received"
                  : "Save payment"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
