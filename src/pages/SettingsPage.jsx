import React, { useEffect, useState } from "react";
import { CheckCircle2, ShieldCheck } from "lucide-react";
import { PageHeading } from "../components/Shared";
import { api } from "../lib/api";

export default function SettingsPage({ profile, setProfile, token, flash }) {
  const [name, setName] = useState(profile.full_name || "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setName(profile.full_name || "");
  }, [profile.full_name]);

  async function saveName(event) {
    event.preventDefault();
    const value = name.trim();
    if (!value || value === profile.full_name) return;
    setSaving(true);
    try {
      const updated = await api.updateMe({ full_name: value }, token);
      setProfile((current) => ({ ...current, full_name: updated.full_name }));
      setName(updated.full_name);
      flash("Name updated");
    } catch (error) {
      flash(error.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeading
        title="Settings"
        subtitle="Your account and workspace security."
      />
      <div className="settings-grid">
        <div className="card form-card">
          <p className="eyebrow">PROFILE</p>
          <h2>Account settings</h2>
          <form onSubmit={saveName}>
            <div className="field">
              <label>Full name</label>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
                maxLength={120}
              />
            </div>
            <div className="field">
              <label>Role</label>
              <input value={profile.role} disabled title="Role cannot be changed" />
              <p className="field-hint">
                Your role is fixed and cannot be edited.
              </p>
            </div>
            <button
              type="submit"
              className="primary-button"
              disabled={saving || !name.trim() || name.trim() === profile.full_name}
            >
              <CheckCircle2 size={16} /> {saving ? "Saving…" : "Save name"}
            </button>
          </form>
          <div className="connected-label">
            <ShieldCheck size={15} /> Supabase Auth connected
          </div>
        </div>
        <div className="card form-card">
          <p className="eyebrow">DATA & PRIVACY</p>
          <h2>Protected workspace</h2>
          <p className="settings-copy">
            Site access and audit history are protected by Supabase Row Level
            Security.
          </p>
        </div>
      </div>
    </>
  );
}