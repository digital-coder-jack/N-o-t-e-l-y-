"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL || "https://study-sphere-ai-mwlq.vercel.app").replace(/\/+$/, "");

export default function AuthPage({ initialMode = "login" }: { initialMode?: "login" | "signup" }) {
  const [mode, setMode] = useState<"login" | "signup">(initialMode);
  const [name, setName] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [theme, setTheme] = useState<"light" | "dark">("dark");
  const [strength, setStrength] = useState(0);
  const router = useRouter();

  useEffect(() => {
    const saved = localStorage.getItem("notely-theme");
    const next = saved === "light" || saved === "dark" ? saved : (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    setTheme(next); document.documentElement.dataset.theme = next; document.documentElement.style.colorScheme = next;
    try { if (!sessionStorage.getItem("notely-auth-intro-seen") && !matchMedia("(prefers-reduced-motion: reduce)").matches) { document.body.classList.add("auth-intro"); sessionStorage.setItem("notely-auth-intro-seen", "1"); const skip=()=>{document.body.classList.add("auth-intro-skipped");document.body.classList.remove("auth-intro");window.removeEventListener("pointerdown",skip,true);window.removeEventListener("keydown",skip,true);};window.addEventListener("pointerdown",skip,true);window.addEventListener("keydown",skip,true); } } catch { /* storage or animation preferences may be unavailable */ }
    const pointer = (event: PointerEvent) => { document.documentElement.style.setProperty("--spot-x", event.clientX + "px"); document.documentElement.style.setProperty("--spot-y", event.clientY + "px"); };
    if (matchMedia("(hover: hover) and (pointer: fine)").matches) window.addEventListener("pointermove", pointer, { passive: true });
    return () => window.removeEventListener("pointermove", pointer);
  }, []);

  const switchMode = (next: "login" | "signup") => { setMode(next); setError(""); setPassword(""); window.history.replaceState(null, "", next === "signup" ? "/signup" : "/login"); };
  const onPassword = (value: string) => { setPassword(value); let s=0;if(value.length>=8)s++;if(value.length>=12)s++;if(/[a-z]/.test(value)&&/[A-Z]/.test(value))s++;if(/\d/.test(value))s++;if(/[^A-Za-z0-9]/.test(value))s++;setStrength(s); };
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError("");
    if (mode === "signup" && !name.trim()) { setError("Add your name to get started."); return; }
    if (mode === "signup" && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { setError("Enter a valid email address."); return; }
    if (mode === "signup" && password.length < 8) { setError("Use at least 8 characters for your password."); return; }
    if (mode === "login" && (!identifier.trim() || !password)) { setError("Enter your email or username and password."); return; }
    setLoading(true);
    try {
      const response = await fetch(API_BASE + (mode === "signup" ? "/api/auth/signup" : "/api/auth/login"), {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mode === "signup" ? { name: name.trim(), username: "", email: email.trim(), password, confirm_password: password } : { identifier: identifier.trim(), password })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.token) throw new Error(data.detail || "Could not authenticate. Check your details.");
      localStorage.setItem("ss_token", data.token); localStorage.setItem("ss_user", JSON.stringify(data.user || {}));
      document.body.classList.add("auth-success");
      setTimeout(() => router.replace("/"), 500);
    } catch (e) { setError(e instanceof Error ? e.message : "Something went wrong. Try again."); setLoading(false); }
  };

  return (
    <main className="auth-cinema next-auth-cinema">
      <div className="cinema-bar cinema-bar-top" aria-hidden="true" /><div className="cinema-bar cinema-bar-bottom" aria-hidden="true" />
      <div className="auth-ambient" aria-hidden="true"><span /><span /><span /></div>
      <button type="button" className="auth-theme-toggle" aria-label="Toggle theme" aria-pressed={theme === "dark"} onClick={() => { const next=theme==="dark"?"light":"dark";setTheme(next);document.documentElement.dataset.theme=next;document.documentElement.style.colorScheme=next;localStorage.setItem("notely-theme",next);document.querySelector('meta[name="theme-color"]')?.setAttribute("content",next==="dark"?"#060c1c":"#f3f6fd"); }}><span>{theme === "dark" ? "☼" : "☾"}</span></button>
      <section className="auth-story">
        <a className="auth-brand" href="/"><img src="/assets/logo.png" alt="" /><span>Notely</span></a><span className="auth-kicker">WELCOME TO NOTELY</span>
        <h1><span>Your study space</span><span>starts <em>here.</em></span></h1><p className="auth-lede">Seven days of full access to a calmer, more connected way to learn.</p><span className="trial-pill"><span />7-day free trial</span>
        <div className="study-cards" aria-hidden="true">{["01","02","03"].map((n,i)=><div key={n} className={"study-note "+["study-note-back","study-note-mid","study-note-front"][i]}><div className="study-note-top"><span>NOTELY</span><span>STUDY NOTE</span></div><i className="note-spark" /><b /><b /><b /><small>{n} / 03</small></div>)}</div><p className="auth-story-foot"><span />Notes, practice and planning in one place.</p>
      </section>
      <section className="auth-card">
        <div className="auth-card-top"><span className="auth-card-eyebrow">YOUR NEXT CHAPTER</span><span className="auth-mobile-trial">7 days free</span></div>
        <div className={"auth-segment "+(mode==="login"?"is-login":"")} role="tablist" aria-label="Account access"><button type="button" role="tab" aria-selected={mode==="signup"} onClick={()=>switchMode("signup")}>Sign up</button><button type="button" role="tab" aria-selected={mode==="login"} onClick={()=>switchMode("login")}>Log in</button><span className="auth-segment-highlight" /></div>
        <div key={mode} className="auth-panel auth-panel-in">
        <h2>{mode==="signup"?"Start your free trial":"Welcome back."}</h2><p className="auth-panel-copy">{mode==="signup"?"Seven days. Everything unlocked. Your work stays yours.":"Pick up where your ideas left off."}</p>
        <button type="button" className="auth-google" onClick={()=>setError("Google sign-in isn't connected yet. Use email for now.")}><span className="google-mark">G</span>Continue with Google</button><div className="auth-divider"><span>or use email</span></div>
        {error && <p className="form-msg show error" role="alert">{error}</p>}
        <form onSubmit={submit} noValidate>
          {mode==="signup" ? <><div className="auth-field"><label htmlFor="auth-name">Your name</label><input id="auth-name" autoComplete="name" value={name} onChange={e=>setName(e.target.value)} placeholder="Alex Morgan" /></div><div className="auth-field"><label htmlFor="auth-email">Email address</label><input id="auth-email" type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com" /></div></> : <div className="auth-field"><label htmlFor="auth-identifier">Email or username</label><input id="auth-identifier" autoComplete="username" value={identifier} onChange={e=>setIdentifier(e.target.value)} placeholder="you@example.com" /></div>}
          <div className="auth-field"><div className="auth-label-row"><label htmlFor="auth-password">Password</label>{mode==="login"&&<a href="/forgot">Forgot password?</a>}</div><div className="auth-password-wrap"><input id="auth-password" type={showPassword?"text":"password"} autoComplete={mode==="signup"?"new-password":"current-password"} value={password} onChange={e=>onPassword(e.target.value)} placeholder={mode==="signup"?"At least 8 characters":"Your password"} /><button type="button" className="auth-show-password" onClick={()=>setShowPassword(v=>!v)}>{showPassword?"Hide":"Show"}</button></div>{mode==="signup"&&<><div className="auth-strength"><span style={{width:(strength*20)+"%",background:["#e45b79","#f0a34a","#e3c45a","#4aa8d8","#43bd99"][Math.max(0,strength-1)]||"#e45b79"}} /></div><small className="auth-hint">{password.length<8?"Use at least 8 characters.":strength<3?"Add a number or symbol for a stronger password.":"Strong password."}</small></>}</div>
          <button type="submit" className="auth-submit" disabled={loading}>{loading?"Working…":mode==="signup"?"Start free trial":"Log in"} <span>↗</span></button>
        </form>
        <p className="auth-terms">{mode==="signup"?"Your trial starts when your account is created. No payment is taken.":"Your notes and materials stay connected to your account."}</p>
        <p className="auth-switch-copy">{mode==="signup"?"Already have an account?":"New to Notely?"} <button type="button" onClick={()=>switchMode(mode==="signup"?"login":"signup")}>{mode==="signup"?"Log in":"Start your trial"}</button></p>
        </div>
      </section>
      <div className="auth-cinematic-wipe" aria-hidden="true" />
    </main>
  );
}
