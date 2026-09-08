import React, { useEffect, useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  MoreHorizontal,
  Plus,
} from "lucide-react";
import { PageHeading } from "../components/Shared";
import Modal from "../components/Modal";
import { api } from "../lib/api";
export default function CategoriesPage({
  categories,
  setCategories,
  token,
  flash,
}) {
  const [items, setItems] = useState(categories);
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    api
      .myCategories(token)
      .then(setItems)
      .catch(() => {});
  }, [token]);
  async function add(event) {
    event.preventDefault();
    setSaving(true);
    try {
      const form = new FormData(event.currentTarget);
      const category = await api.createCategory(
        { name: form.get("name"), type: form.get("type") },
        token,
      );
      setItems((current) => [...current, category]);
      setCategories((current) => [...current, category]);
      setShow(false);
      flash("Category added");
    } finally {
      setSaving(false);
    }
  }
  async function disable(category) {
    await api.disableCategory(category.id, token);
    setItems((current) => current.filter((item) => item.id !== category.id));
    setCategories((current) =>
      current.filter((item) => item.id !== category.id),
    );
    flash("Category disabled");
  }
  return (
    <>
      <PageHeading
        title="Categories"
        subtitle="Your shared categories, used across all your sites."
      >
        <button className="primary-button" onClick={() => setShow(true)}>
          <Plus size={17} /> Add category
        </button>
      </PageHeading>
      <div className="card collection-card">
        <div className="collection-head">
          <div>
            <h2>Your categories</h2>
            <p>One common set applies to every site you own.</p>
          </div>
        </div>
        <div className="category-list">
          {items.map((category) => (
            <div className="category-item" key={category.id}>
              <span className={`category-badge ${category.type}`}>
                {category.type === "income" ? (
                  <ArrowDownLeft size={15} />
                ) : (
                  <ArrowUpRight size={15} />
                )}
              </span>
              <div>
                <strong>{category.name}</strong>
                <small>{category.type} category</small>
              </div>
              <span className="default-label">
                {category.is_default !== false ? "Default" : "Custom"}
              </span>
              <button
                className="row-more"
                title="Disable category"
                onClick={() => disable(category)}
              >
                <MoreHorizontal size={17} />
              </button>
            </div>
          ))}
        </div>
      </div>
      {show && (
        <Modal
          title="Add category"
          subtitle="This category will be available on all your sites."
          onClose={() => setShow(false)}
        >
          <form onSubmit={add}>
            <div className="field">
              <label>Category name</label>
              <input name="name" placeholder="e.g. Plumbing" required />
            </div>
            <div className="field">
              <label>Category type</label>
              <select name="type">
                <option value="expense">Expense</option>
                <option value="income">Income</option>
              </select>
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setShow(false)}
              >
                Cancel
              </button>
              <button className="primary-button" disabled={saving}>
                <Plus size={17} /> {saving ? "Adding..." : "Add category"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
