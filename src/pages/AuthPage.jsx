import React, { useState } from "react";
import { supabase } from "../lib/supabase";
import { brand } from "../lib/brand";
import { DEFAULT_FEATURES } from "../lib/features";
import BrandMark from "../components/BrandMark";

export default function AuthPage({
  configurationMissing = false,
  features = DEFAULT_FEATURES,
}) {
  const [mode, setMode] = useState("signin");
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [loading, setLoading] = useState(false);
  const signupEnabled = features.signup !== false;
  async function submit(event) {
    event.preventDefault();
    if (!supabase) return;
    setLoading(true);
    setMessage("");
    const form = new FormData(event.currentTarget);
    const email = form.get("email");
    let result;
    if (mode === "signin") {
      result = await supabase.auth.signInWithPassword({
        email,
        password: form.get("password"),
      });
    } else if (mode === "reset") {
      result = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/welcome`,
      });
    } else {
      result = await supabase.auth.signUp({
        email,
        password: form.get("password"),
        options: { data: { full_name: form.get("name") } },
      });
    }
    setLoading(false);
    setIsError(Boolean(result.error));
    setMessage(
      result.error?.message ||
        (mode === "signup"
          ? "Check your email to confirm your account."
          : mode === "reset"
            ? "If that email has an account, we've sent a link to set a new password."
            : "Signed in."),
    );
  }
  function switchMode(next) {
    setMode(next);
    setMessage("");
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
                {mode === "signin"
                  ? "WELCOME BACK"
                  : mode === "reset"
                    ? "FORGOT PASSWORD"
                    : "GET STARTED"}
              </p>
              <h2>
                {mode === "signin"
                  ? `Sign in to ${brand.name}`
                  : mode === "reset"
                    ? "Reset your password"
                    : "Create your account"}
              </h2>
              <p className="auth-subtitle">
                {mode === "reset"
                  ? "Enter your email and we'll send you a link to choose a new password."
                  : "Track your sites with confidence."}
              </p>
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
                {mode !== "reset" && (
                  <div className="field">
                    <label>Password</label>
                    <input
                      name="password"
                      type="password"
                      placeholder="At least 6 characters"
                      minLength="6"
                      required
                    />
                    {mode === "signin" && (
                      <button
                        type="button"
                        className="auth-forgot"
                        onClick={() => switchMode("reset")}
                      >
                        Forgot password?
                      </button>
                    )}
                  </div>
                )}
                <button
                  className="primary-button auth-submit"
                  disabled={loading}
                >
                  {loading
                    ? "Please wait..."
                    : mode === "signin"
                      ? "Sign in"
                      : mode === "reset"
                        ? "Send reset link"
                        : "Create account"}
                </button>
              </form>
              {message && (
                <p className={`auth-message ${isError ? "error" : ""}`}>
                  {message}
                </p>
              )}
              {mode === "reset" ? (
                <p className="auth-switch">
                  Remembered it?{" "}
                  <button onClick={() => switchMode("signin")}>Sign in</button>
                </p>
              ) : (
                signupEnabled && (
                  <p className="auth-switch">
                    {mode === "signin"
                      ? `New to ${brand.name}?`
                      : "Already have an account?"}{" "}
                    <button
                      onClick={() =>
                        switchMode(mode === "signin" ? "signup" : "signin")
                      }
                    >
                      {mode === "signin" ? "Create an account" : "Sign in"}
                    </button>
                  </p>
                )
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
