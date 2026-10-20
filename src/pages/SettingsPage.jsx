import React, { useEffect, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { PageHeading } from "../components/Shared";
import { api } from "../lib/api";
import { getAppearance, setAppearance } from "../lib/theme";

const APPEARANCE_OPTIONS = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "Match my device" },
];

export default function SettingsPage({ profile, setProfile, token, flash }) {
  const [name, setName] = useState(profile.full_name || "");
  const [saving, setSaving] = useState(false);
  const [appearance, setAppearanceState] = useState(getAppearance);

  function changeAppearance(value) {
    setAppearance(value);
    setAppearanceState(value);
  }

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
        subtitle="Your account, appearance and workspace security."
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
              <input
                value={profile.role}
                disabled
                title="Role cannot be changed"
              />
              <p className="field-hint">
                Your role is fixed and cannot be edited.
              </p>
            </div>
            <button
              type="submit"
              className="primary-button"
              disabled={
                saving || !name.trim() || name.trim() === profile.full_name
              }
            >
              <CheckCircle2 size={16} /> {saving ? "Saving…" : "Save name"}
            </button>
          </form>
        </div>
        <div className="card form-card">
          <p className="eyebrow">APPEARANCE</p>
          <h2>Theme</h2>
          <div className="type-toggle" role="radiogroup" aria-label="Theme">
            {APPEARANCE_OPTIONS.map((option) => (
              <label key={option.value}>
                <input
                  type="radio"
                  name="appearance"
                  value={option.value}
                  checked={appearance === option.value}
                  onChange={() => changeAppearance(option.value)}
                />
                <span>{option.label}</span>
              </label>
            ))}
          </div>
          <p className="field-hint">
            Saved on this device. Dark is easier on the eyes at night; light
            reads best outdoors.
          </p>
        </div>
        <div className="card form-card">
          <p className="eyebrow">DATA & PRIVACY</p>
          <h2>Who can see your data</h2>
          <p className="settings-copy">
            Only you and the supervisors you invite can see a site. Supervisors
            can add entries and notes, but can’t change or delete past entries.
            Every change is recorded in the activity log.
          </p>
        </div>
      </div>
    </>
  );
}
