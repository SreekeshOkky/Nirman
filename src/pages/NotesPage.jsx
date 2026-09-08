import React, { useState } from "react";
import { Check, FileText, Pencil, Plus, Trash2, X } from "lucide-react";
import { PageHeading } from "../components/Shared";
import { api } from "../lib/api";
const formatDate = (value) =>
  value
    ? new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(value))
    : "Recently";
export default function NotesPage({ notes, setNotes, siteId, token, flash }) {
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState("");
  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    try {
      const content = new FormData(event.currentTarget).get("content");
      const note = await api.createNote(siteId, { content }, token);
      setNotes((current) => [note, ...current]);
      event.currentTarget.reset();
      flash("Note added");
    } finally {
      setSaving(false);
    }
  }
  function startEdit(note) {
    setEditingId(note.id);
    setDraft(note.content);
  }
  function cancelEdit() {
    setEditingId(null);
    setDraft("");
  }
  async function saveEdit(event) {
    event.preventDefault();
    setSaving(true);
    try {
      const updated = await api.updateNote(
        siteId,
        editingId,
        { content: draft },
        token,
      );
      setNotes((current) =>
        current.map((note) => (note.id === editingId ? updated : note)),
      );
      setEditingId(null);
      setDraft("");
      flash("Note updated");
    } finally {
      setSaving(false);
    }
  }
  async function remove(note) {
    if (!window.confirm("Delete this note?")) return;
    try {
      await api.deleteNote(siteId, note.id, token);
      setNotes((current) => current.filter((item) => item.id !== note.id));
      flash("Note deleted");
    } catch (error) {
      flash(error.message);
    }
  }
  return (
    <>
      <PageHeading
        title="Notes"
        subtitle="Keep the context behind site decisions and interactions."
      />
      <div className="notes-layout">
        <div className="card form-card">
          <p className="eyebrow">SITE NOTES</p>
          <h2>Add a note</h2>
          <p className="settings-copy">
            Capture deliveries, payments, discussions, and decisions while they
            are fresh.
          </p>
          <form onSubmit={submit}>
            <div className="field">
              <label>Note</label>
              <textarea
                name="content"
                rows="5"
                placeholder="What happened on site today?"
                required
              />
            </div>
            <button className="primary-button" disabled={saving}>
              <Plus size={16} /> {saving ? "Saving..." : "Add note"}
            </button>
          </form>
        </div>
        <div className="card collection-card">
          <div className="collection-head">
            <div>
              <h2>Notes & context</h2>
              <p>
                {notes.length} note{notes.length === 1 ? "" : "s"} across this
                site
              </p>
            </div>
          </div>
          <div className="notes-list">
            {notes.map((note) => {
              const ledger = note.ledger_entries;
              const standalone = !ledger;
              const author =
                note.profiles?.full_name ||
                note.profiles?.email ||
                "Unknown user";
              const source = ledger
                ? `Ledger · ${ledger.description || ledger.entry_type}`
                : "Site note";
              const isEditing = editingId === note.id;
              return (
                <div className="note-item" key={note.id}>
                  <FileText size={17} />
                  <div className="note-body">
                    {isEditing ? (
                      <form className="note-edit" onSubmit={saveEdit}>
                        <textarea
                          value={draft}
                          onChange={(event) => setDraft(event.target.value)}
                          rows="3"
                          autoFocus
                          required
                        />
                        <div className="note-edit-actions">
                          <button
                            type="submit"
                            className="primary-button"
                            disabled={saving}
                          >
                            <Check size={14} /> Save
                          </button>
                          <button
                            type="button"
                            className="secondary-button"
                            onClick={cancelEdit}
                          >
                            <X size={14} /> Cancel
                          </button>
                        </div>
                      </form>
                    ) : (
                      <>
                        <p>{note.content}</p>
                        <small>
                          {source} · {formatDate(note.created_at)} · {author}
                        </small>
                      </>
                    )}
                  </div>
                  {standalone && !isEditing && (
                    <div className="note-actions">
                      <button
                        className="row-action"
                        title="Edit note"
                        onClick={() => startEdit(note)}
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        className="row-action danger"
                        title="Delete note"
                        onClick={() => remove(note)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
            {!notes.length && <div className="empty-state">No notes yet.</div>}
          </div>
        </div>
      </div>
    </>
  );
}
