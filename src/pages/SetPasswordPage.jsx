import React, { useState } from "react";
import { supabase } from "../lib/supabase";
import { api } from "../lib/api";
import { brand } from "../lib/brand";
import BrandMark from "../components/BrandMark";

// Shown after an invite or password-reset link signs the user in, so they can
// choose a password (and a name, for brand-new supervisors) before continuing.
export default function SetPasswordPage({
  profile,
  setProfile,
  token,
  onDone,
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const needsName = !profile.full_name;
  async function submit(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const password = form.get("password");
    if (password !== form.get("confirm")) {
      setError("The two passwords don't match.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const { error: authError } = await supabase.auth.updateUser({ password });
      if (authError) throw authError;
      const name = (form.get("name") || "").trim();
      if (needsName && name) {
        const updated = await api.updateMe({ full_name: name }, token);
        setProfile((current) => ({ ...current, full_name: updated.full_name }));
      }
      onDone();
    } catch (err) {
      setError(err.message || "Could not save your password");
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="auth-shell">
      <div className="auth-art">
        <div className="brand">
          <BrandMark />
          <span>{brand.name}</span>
        </div>
      </div>
      <div className="auth-panel">
        <div className="auth-form">
          <p className="eyebrow">ONE LAST STEP</p>
          <h2>Choose your password</h2>
          <p className="auth-subtitle">
            You'll use this with your email to sign in to {brand.name} next
            time.
          </p>
          <form onSubmit={submit}>
            {needsName && (
              <div className="field">
                <label>Your name</label>
                <input name="name" placeholder="Ravi Kumar" required />
              </div>
            )}
            <div className="field">
              <label>New password</label>
              <input
                name="password"
                type="password"
                placeholder="At least 6 characters"
                minLength="6"
                autoComplete="new-password"
                required
              />
            </div>
            <div className="field">
              <label>Confirm password</label>
              <input
                name="confirm"
                type="password"
                minLength="6"
                autoComplete="new-password"
                required
              />
            </div>
            <button className="primary-button auth-submit" disabled={saving}>
              {saving ? "Saving..." : "Save and continue"}
            </button>
          </form>
          {error && <p className="auth-message error">{error}</p>}
        </div>
      </div>
    </div>
  );
}
