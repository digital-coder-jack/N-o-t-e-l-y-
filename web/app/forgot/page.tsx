"use client";

import { useState, type FormEvent } from "react";

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL || "https://study-sphere-ai-mwlq.vercel.app").replace(/\/+$/, "");

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [resetMode, setResetMode] = useState(false);

  async function requestReset(event: FormEvent) {
    event.preventDefault(); setLoading(true); setError(""); setMessage("");
    try {
      const response = await fetch(API_BASE + "/api/auth/forgot-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || "Could not request a reset.");
      setMessage(data.message || "If that email exists, a reset token has been issued.");
      if (data.reset_token) { setToken(data.reset_token); setResetMode(true); }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not request a reset."); }
    finally { setLoading(false); }
  }

  async function resetPassword(event: FormEvent) {
    event.preventDefault(); setLoading(true); setError(""); setMessage("");
    try {
      const response = await fetch(API_BASE + "/api/auth/reset-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, password }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || "Could not reset the password.");
      setMessage(data.message || "Password updated. You can now log in.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not reset the password."); }
    finally { setLoading(false); }
  }

  return (
    <main className="auth-cinema next-auth-cinema forgot-auth-cinema">
      <div className="cinema-bar cinema-bar-top" aria-hidden="true" /><div className="cinema-bar cinema-bar-bottom" aria-hidden="true" />
      <div className="auth-ambient" aria-hidden="true"><span /><span /><span /></div>
      <section className="auth-card">
        <a className="auth-brand" href="/login"><img src="/assets/logo.png" alt="" /><span>Notely</span></a>
        <span className="auth-card-eyebrow">ACCOUNT RECOVERY</span>
        <h2>Reset your password.</h2>
        <p className="auth-panel-copy">We’ll help you get back to your study space.</p>
        {error && <p className="form-msg show error" role="alert">{error}</p>}
        {message && <p className="form-msg show success" role="status">{message}</p>}
        {!resetMode ? (
          <form onSubmit={requestReset}>
            <div className="auth-field"><label htmlFor="forgot-email">Email address</label><input id="forgot-email" type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} required /></div>
            <button className="auth-submit" disabled={loading}>{loading ? "Working…" : "Request reset"} <span>↗</span></button>
          </form>
        ) : (
          <form onSubmit={resetPassword}>
            <div className="auth-field"><label htmlFor="reset-token">Reset token</label><input id="reset-token" value={token} onChange={event => setToken(event.target.value)} required /></div>
            <div className="auth-field"><label htmlFor="reset-password">New password</label><input id="reset-password" type="password" autoComplete="new-password" minLength={8} value={password} onChange={event => setPassword(event.target.value)} required /></div>
            <button className="auth-submit" disabled={loading}>{loading ? "Updating…" : "Update password"} <span>↗</span></button>
          </form>
        )}
        <p className="auth-switch-copy"><a href="/login">Back to log in</a></p>
      </section>
    </main>
  );
}
