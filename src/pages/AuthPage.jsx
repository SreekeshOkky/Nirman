import React, { useState } from "react";
import { supabase } from "../lib/supabase";
import { brand } from "../lib/brand";
import BrandMark from "../components/BrandMark";

export default function AuthPage({ configurationMissing = false }) {
  const [mode, setMode] = useState("signin");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  async function submit(event) {
    event.preventDefault();
    if (!supabase) return;
    setLoading(true);
    setMessage("");
    const form = new FormData(event.currentTarget);
    const result =
      mode === "signin"
        ? await supabase.auth.signInWithPassword({
            email: form.get("email"),
            password: form.get("password"),
          })
        : await supabase.auth.signUp({
            email: form.get("email"),
            password: form.get("password"),
            options: { data: { full_name: form.get("name") } },
          });
    setLoading(false);
    setMessage(
      result.error?.message ||
        (mode === "signup"
          ? "Check your email to confirm your account."
          : "Signed in."),
    );
  }
  return (
    <div className="auth-shell">
      <div className="auth-art">
        <div className="brand">
          <BrandMark />
          <span>{brand.name}</span>
        </div>
        <div>
          <p className="eyebrow">A CLEARER BUILD</p>
          <h1>
            Every rupee.
            <br />
            <em>Accounted for.</em>
          </h1>
          <p>
            One calm place for the work, money, and people behind every site.
          </p>
        </div>
        <div className="auth-art-footer">
          <span>Construction ledger</span>
          <span>Est. 2024</span>
        </div>
      </div>
      <div className="auth-panel">
        <div className="auth-form">
          {configurationMissing ? (
            <>
              <p className="eyebrow">SETUP REQUIRED</p>
              <h2>Connect {brand.name}</h2>
              <p className="auth-subtitle">
                Supabase environment variables are missing. Add
                `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to
                `.env.local`, then restart Vite.
              </p>
              <pre className="env-hint">
                VITE_SUPABASE_URL=https://your-project.supabase.co{`\n`}
                VITE_SUPABASE_ANON_KEY=your-publishable-key
              </pre>
            </>
          ) : (
            <>
              <p className="eyebrow">
                {mode === "signin" ? "WELCOME BACK" : "GET STARTED"}
              </p>
              <h2>
                {mode === "signin"
                  ? `Sign in to ${brand.name}`
                  : "Create your account"}
              </h2>
              <p className="auth-subtitle">Track your sites with confidence.</p>
              <form onSubmit={submit}>
                {mode === "signup" && (
                  <div className="field">
                    <label>Full name</label>
                    <input name="name" placeholder="Ravi Kumar" required />
                  </div>
                )}
                <div className="field">
                  <label>Email address</label>
                  <input
                    name="email"
                    type="email"
                    placeholder="you@company.com"
                    required
                  />
                </div>
                <div className="field">
                  <label>Password</label>
                  <input
                    name="password"
                    type="password"
                    placeholder="At least 6 characters"
                    minLength="6"
                    required
                  />
                </div>
                <button
                  className="primary-button auth-submit"
                  disabled={loading}
                >
                  {loading
                    ? "Please wait..."
                    : mode === "signin"
                      ? "Sign in"
                      : "Create account"}
                </button>
              </form>
              {message && <p className="auth-message">{message}</p>}
              {/* <p className="auth-switch">{mode === 'signin' ? 'New to Nirmanam?' : 'Already have an account?'} <button onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}>{mode === 'signin' ? 'Create an account' : 'Sign in'}</button></p> */}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
