"use client";

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Archive, ArrowRight, BarChart3, Bell, BookOpen, CalendarDays, Check, CheckCircle2,
  ChevronDown, ChevronLeft, ChevronRight, CircleHelp, Cloud, FileText, FolderOpen, Grid2X2, Home,
  LayoutList, Menu, MessageCircle, MoreHorizontal, PanelLeftClose, PanelLeftOpen,
  Paperclip, PenLine, Plus, Search, Settings, ShieldCheck, Sparkles, Star, Trash2,
  Upload, Zap, Clock3,
} from "lucide-react";

type Route =
  | "overview"
  | "notes"
  | "documents"
  | "favorites"
  | "archive"
  | "trash"
  | "tools"
  | "quiz"
  | "flashcards"
  | "roadmap"
  | "mindmap"
  | "planner"
  | "summarizer"
  | "homework"
  | "search"
  | "settings";

type Note = {
  id?: number;
  title: string;
  course: string;
  time: string;
  tag: string;
  content?: string;
  pinned?: boolean;
  favorite?: boolean;
  archived?: boolean;
  deleted?: boolean;
  state?: "active" | "archived" | "deleted";
};

const NOTES: Note[] = [];

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL || "https://notely-mwlq.vercel.app").replace(/\/+$/, "");

async function workspaceToken(): Promise<string> {
  if (typeof window === "undefined") throw new Error("Workspace requests require a browser.");
  const saved = window.localStorage.getItem("ss_token");
  if (saved) return saved;
  window.location.assign("/login");
  throw new Error("Sign in to continue.");
}

async function apiRequest<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await workspaceToken();
  const headers = new Headers(init.headers || {});
  headers.set("Authorization", "Bearer " + token);
  if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await fetch(API_BASE + path, { ...init, headers });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = payload && (payload.detail || payload.message);
    throw new Error(typeof detail === "string" ? detail : "Request failed (" + response.status + ").");
  }
  return payload as T;
}

function normalizeNote(raw: any): Note {
  const date = raw.created_at ? new Date(raw.created_at) : null;
  return {
    id: Number(raw.id),
    title: String(raw.topic || "Untitled note"),
    course: "My workspace",
    time: date && !Number.isNaN(date.getTime()) ? "Created " + date.toLocaleDateString() : "Saved note",
    tag: raw.pinned ? "Pinned" : raw.favorite ? "Favorite" : "Note",
    content: String(raw.content || ""),
    pinned: Boolean(raw.pinned),
    favorite: Boolean(raw.favorite),
    archived: Boolean(raw.archived),
    deleted: Boolean(raw.deleted),
    state: raw.deleted ? "deleted" : raw.archived ? "archived" : "active",
  };
}

const tools = [
  ["quiz", "Quiz Generator", "Turn notes into a focused practice set.", CircleHelp],
  ["flashcards", "Flashcards", "Recall what matters before the next lecture.", BookOpen],
  ["roadmap", "Study Roadmap", "Make a clear path from goal to mastery.", Zap],
  ["mindmap", "Mind Maps", "See the connections between your ideas.", BarChart3],
  ["planner", "Revision Planner", "Give every deadline a calm place.", CalendarDays],
  ["summarizer", "Text Summarizer", "Turn long material into clear key points.", FileText],
  ["homework", "Homework Helper", "Work through a question step by step.", CircleHelp],
] as const;

function routeFromPath(path: string): Route {
  const hash = typeof window !== "undefined" ? window.location.hash.replace(/^#\/?/, "") : "";
  const key = hash || path.replace(/^\/+/, "").replace(/^app\//, "");
  if (key === "notes") return "notes";
  if (key === "documents") return "documents";
  if (key === "favorites") return "favorites";
  if (key === "archive") return "archive";
  if (key === "trash") return "trash";
  if (key === "tools") return "tools";
  if (key === "quiz") return "quiz";
  if (key === "flashcards") return "flashcards";
  if (key === "roadmap") return "roadmap";
  if (key === "mindmap") return "mindmap";
  if (key === "planner") return "planner";
  if (key === "summarizer") return "summarizer";
  if (key === "homework") return "homework";
  if (key === "search") return "search";
  if (key === "settings") return "settings";
  return "overview";
}

function pathFor(route: Route) {
  if (route === "overview") return "/";
  if (route === "settings") return "/settings";
  return "/#/" + route;
}


function TrialStatusBanner() {
  const [user, setUser] = useState<any>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [endedDismissed, setEndedDismissed] = useState(false);
  const [reminderDismissed, setReminderDismissed] = useState(false);

  useEffect(() => {
    let live = true;
    apiRequest<{ user: any }>("/api/auth/me").then((result) => {
      if (!live) return;
      setUser(result.user || null);
      if (result.user?.trial_expired) document.body.classList.add("trial-readonly");
      if (result.user?.is_trial && (result.user.trial_days_left === 2 || result.user.trial_days_left === 1)) {
        const key = "notely-trial-reminder-" + result.user.id + "-" + result.user.trial_days_left;
        setReminderDismissed(Boolean(localStorage.getItem(key)));
      }
    }).catch(() => undefined);
    return () => { live = false; };
  }, []);

  if (!user?.is_trial) return null;
  const days = Number(user.trial_days_left || 0);
  const reminderKey = "notely-trial-reminder-" + user.id + "-" + days;
  const dismissReminder = () => { try { localStorage.setItem(reminderKey, "1"); } catch { /* continue if storage is unavailable */ } setReminderDismissed(true); };
  return (
    <>
      <div className="trial-status-anchor">
        <button type="button" className="trial-status-pill" aria-expanded={detailsOpen} onClick={() => setDetailsOpen((v) => !v)}>
          {user.trial_expired ? "Trial ended" : "Trial: " + days + (days === 1 ? " day left" : " days left")}
        </button>
        {detailsOpen && <section className="trial-status-popover" role="dialog" aria-label="Trial details">
          <strong>{user.trial_expired ? "Your trial has ended" : "Your seven-day trial"}</strong>
          <p>{user.trial_expired ? "Your notes and materials stay safe in read-only mode." : "Everything is unlocked while your trial is active."}</p>
          <button type="button" onClick={() => setDetailsOpen(false)}>Close</button>
          <small>Upgrade payments are not connected yet.</small>
        </section>}
      </div>
      {!user.trial_expired && (days === 2 || days === 1) && !reminderDismissed && (
        <aside className="trial-reminder-card" role="status">
          <div><strong>{days === 2 ? "Your trial ends in two days" : "Your trial ends today"}</strong><p>Your saved work stays yours. Review upgrade options before the trial ends.</p></div>
          <button type="button" aria-label="Dismiss trial reminder" onClick={dismissReminder}>×</button>
        </aside>
      )}
      {user.trial_expired && !endedDismissed && (
        <div className="trial-ended-backdrop" role="dialog" aria-modal="true" aria-labelledby="trial-ended-title">
          <section className="trial-ended-card">
            <span className="trial-ended-mark">N</span><span className="eyebrow">YOUR NEXT CHAPTER</span>
            <h1 id="trial-ended-title">Your trial has ended.</h1>
            <p>Your notes and materials are safe. You can still read your work; creating, editing and AI features are paused until you upgrade.</p>
            <button type="button" className="action-button" onClick={() => setEndedDismissed(true)}>Continue to read-only workspace</button>
            <button type="button" className="trial-ended-secondary" onClick={() => setDetailsOpen(true)}>View upgrade options</button>
            {detailsOpen && <p className="trial-upgrade-note">Payments are not connected yet. Your saved work remains available.</p>}
          </section>
        </div>
      )}
    </>
  );
}

function AuroraOrb({ size = 28 }: { size?: number }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg className="na-aurora-orb-svg" width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id={`na-sphere-${id}`} cx="27%" cy="17%" r="88%"><stop offset="0" stopColor="#263b5c"/><stop offset=".48" stopColor="#0b1428"/><stop offset="1" stopColor="#030611"/></radialGradient>
        <clipPath id={`na-clip-${id}`}><circle cx="32" cy="32" r="23"/></clipPath>
        <filter id={`na-glow-${id}`} x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="2.4"/></filter>
        <linearGradient id={`na-rim-${id}`} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#a5f3fc"/><stop offset=".52" stopColor="#22d3ee"/><stop offset="1" stopColor="#a855f7"/></linearGradient>
      </defs>
      <ellipse cx="32" cy="52" rx="20" ry="5" fill="#22d3ee" opacity=".24" filter={`url(#na-glow-${id})`}/>
      <ellipse cx="32" cy="32" rx="29" ry="13" fill="none" stroke="#22d3ee" strokeWidth="2.2" opacity=".2" transform="rotate(-18 32 32)"/>
      <ellipse cx="32" cy="32" rx="29" ry="13" fill="none" stroke={`url(#na-rim-${id})`} strokeWidth="1.6" transform="rotate(-18 32 32)"/>
      <circle cx="32" cy="32" r="24" fill={`url(#na-sphere-${id})`} stroke="#b7efff" strokeOpacity=".5" strokeWidth="1"/>
      <g clipPath={`url(#na-clip-${id})`}>
        <circle cx="22" cy="25" r="16" fill="#22d3ee" opacity=".86" filter={`url(#na-glow-${id})`}/>
        <circle cx="40" cy="26" r="16" fill="#a855f7" opacity=".8" filter={`url(#na-glow-${id})`}/>
        <circle cx="36" cy="43" r="15" fill="#ec4899" opacity=".7" filter={`url(#na-glow-${id})`}/>
        <path d="M14 24 Q25 10 39 19" fill="none" stroke="#fff" strokeOpacity=".42" strokeWidth="2.2" strokeLinecap="round"/>
        <ellipse cx="23" cy="18" rx="10" ry="4" fill="#fff" opacity=".2" transform="rotate(-30 23 18)"/>
      </g>
      <circle cx="32" cy="32" r="23.4" fill="none" stroke="#e4fbff" strokeOpacity=".5" strokeWidth=".8"/>
      <path d="M32 23 L35 29 L41 32 L35 35 L32 41 L29 35 L23 32 L29 29 Z" fill="#fff"/>
      <circle cx="32" cy="32" r="2" fill="#fff"/>
    </svg>
  );
}

function AppLogo({ compact = false }: { compact?: boolean }) {
  return <div className="app-logo"><img src="/assets/logo.png" alt="Notely" /></div>;
}

function Sidebar({
  route,
  setRoute,
  collapsed,
  setCollapsed,
  mobileOpen,
  setMobileOpen,
}: {
  route: Route;
  setRoute: (r: Route) => void;
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
  mobileOpen: boolean;
  setMobileOpen: (v: boolean) => void;
}) {
  const go = (r: Route) => {
    setRoute(r);
    setMobileOpen(false);
  };

  const primary = [
    ["overview", "Overview", Home],
    ["notes", "My Notes", FileText],
    ["documents", "Documents", FolderOpen],
  ] as const;

  const library = [
    ["favorites", "Favorites", Star],
    ["archive", "Archive", Archive],
    ["trash", "Trash", Trash2],
  ] as const;

  return (
    <>
      <div className={`sidebar-scrim ${mobileOpen ? "show" : ""}`} onClick={() => setMobileOpen(false)} />
      <aside className={`sidebar ${collapsed ? "collapsed" : ""} ${mobileOpen ? "mobile-open" : ""}`}>
        <div className="sidebar-top">
          <AppLogo compact={collapsed} />
          {!collapsed && (
            <div className="brand-copy">
              <strong>Notely</strong>
              <span>My workspace</span>
            </div>
          )}
          <button className="icon-button collapse-toggle" onClick={() => setCollapsed(!collapsed)}>
            {collapsed ? <ChevronRight /> : <ChevronLeft />}
          </button>
        </div>

        <button className="new-note" onClick={() => go("notes")}>
          <PenLine />
          <span>New note</span>
          <kbd>⌘ N</kbd>
        </button>

        <button className="sidebar-search" onClick={() => go("search")}>
          <Search />
          <span>Search anything</span>
          <kbd>⌘ K</kbd>
        </button>

        <nav className="side-nav" aria-label="Workspace navigation">
          <span className="nav-label">Workspace</span>
          {primary.map(([id, label, Icon]) => (
            <NavButton
              key={id}
              active={route === id}
              icon={<Icon />}
              label={label}
              collapsed={collapsed}
              onClick={() => go(id as Route)}
            />
          ))}
        </nav>

        <div className="sidebar-section">
          <span className="nav-label">Library</span>
          {library.map(([id, label, Icon]) => (
            <NavButton
              key={id}
              active={route === id}
              icon={<Icon />}
              label={label}
              collapsed={collapsed}
              onClick={() => go(id as Route)}
            />
          ))}
        </div>

        <div className="sidebar-bottom">
          {!collapsed && (
            <div className="sync-card">
              <div>
                <Cloud />
                <span>Cloud sync on</span>
              </div>
              <small>All changes saved</small>
            </div>
          )}
          <button className="profile-card" onClick={() => setRoute("settings")}>
            <span className="avatar">N</span>
            {!collapsed && <div><strong>My account</strong><small>Profile & settings</small></div>}
          </button>
        </div>
      </aside>
    </>
  );
}

function NavButton({
  active,
  icon,
  label,
  collapsed,
  onClick,
}: {
  active: boolean;
  icon: ReactNode;
  label: string;
  collapsed: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" className={`nav-button ${active ? "active" : ""} ${collapsed ? "collapsed" : ""}`} onClick={onClick}>
      {icon}
      {!collapsed && <span>{label}</span>}
    </button>
  );
}

function openNotelyAssistant(prompt = "") {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("notely:assistant-open", { detail: { prompt } }));
  }
}

type AssistantMessage = { role: "user" | "assistant"; content: string; created_at?: string };
type AssistantMode = "closed" | "small" | "maximized";

function FloatingAssistant({ context }: { context: string }) {
  const [mode, setMode] = useState<AssistantMode>("closed");
  const [persistReady, setPersistReady] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [chats, setChats] = useState<any[]>([]);
  const [chatId, setChatId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [contextEnabled, setContextEnabled] = useState(true);
  const [unread, setUnread] = useState(false);
  const [showJump, setShowJump] = useState(false);
  const [undoChat, setUndoChat] = useState<any | null>(null);
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const controllerRef = useRef<AbortController | null>(null);
  const modeRef = useRef<AssistantMode>(mode);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const launcherRef = useRef<HTMLButtonElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const deleteTimersRef = useRef<Record<number, number>>({});

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const saved = JSON.parse(window.localStorage.getItem("notely-assistant-widget-state") || "{}");
        if (saved.mode === "small" || saved.mode === "maximized") setMode(saved.mode);
        if (saved.contextEnabled === false) setContextEnabled(false);

        const list = await apiRequest<{ chats: any[] }>("/api/chats");
        if (cancelled) return;

        setChats(list.chats || []);

        const desiredId = Number(saved.chatId || (list.chats || [])[0]?.id || 0);
        if (desiredId) {
          const detail = await apiRequest<{ messages: any[] }>("/api/chats/" + desiredId);
          if (cancelled) return;
          setChatId(desiredId);
          setMessages((detail.messages || []).map((m) => ({
            role: m.role === "assistant" ? "assistant" : "user",
            content: String(m.content || ""),
            created_at: m.created_at,
          })));
          setPrompt(window.localStorage.getItem("notely-assistant-draft-" + desiredId) || "");
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not load chat history.");
      } finally {
        if (!cancelled) setPersistReady(true);
      }
    })();

    const onOpen = (event: Event) => {
      const detail = (event as CustomEvent<{ prompt?: string }>).detail;
      setMode("small");
      setUnread(false);
      if (detail?.prompt) setPrompt(detail.prompt);
      window.setTimeout(() => composerRef.current?.focus({ preventScroll: true }), 50);
    };

    const onPopState = () => {
      setMode((current) => current === "maximized" ? "small" : current === "small" ? "closed" : "closed");
    };

    const onKeys = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "j") {
        event.preventDefault();
        setMode((current) => (current === "closed" ? "small" : "closed"));
      } else if (event.key === "Escape") {
        setMode((current) => {
          const next = current === "maximized" ? "small" : current === "small" ? "closed" : "closed";
          if (next === "closed") {
            window.setTimeout(() => launcherRef.current?.focus({ preventScroll: true }), 30);
          }
          return next;
        });
      }
    };

    window.addEventListener("notely:assistant-open", onOpen);
    window.addEventListener("keydown", onKeys);
    window.addEventListener("popstate", onPopState);
    const deleteTimers = deleteTimersRef.current;

    return () => {
      cancelled = true;
      window.removeEventListener("notely:assistant-open", onOpen);
      window.removeEventListener("keydown", onKeys);
      window.removeEventListener("popstate", onPopState);
      Object.values(deleteTimers).forEach(window.clearTimeout);
      controllerRef.current?.abort();
    };
  }, []);

  useEffect(() => { modeRef.current = mode; }, [mode]);

  useEffect(() => {
    if (!persistReady) return;
    try {
      window.localStorage.setItem("notely-assistant-widget-state", JSON.stringify({ mode, chatId, contextEnabled }));
    } catch {
      // storage may be disabled
    }
  }, [mode, chatId, contextEnabled, persistReady]);

  useEffect(() => {
    try {
      window.localStorage.setItem("notely-assistant-draft-" + (chatId || "new"), prompt);
    } catch {
      // storage may be disabled
    }
  }, [prompt, chatId]);

  useEffect(() => {
    const onVisibility = () => document.documentElement.classList.toggle("na-paused", document.hidden);
    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  useEffect(() => {
    const updateViewport = () => {
      const vv = window.visualViewport;
      const keyboard = vv ? Math.max(0, window.innerHeight - vv.height - vv.offsetTop) : 0;
      document.documentElement.style.setProperty("--na-keyboard-offset", keyboard > 100 ? keyboard + "px" : "0px");
      document.documentElement.style.setProperty("--na-nav-offset", keyboard > 100 ? "0px" : "76px");
      document.documentElement.style.setProperty("--na-visual-height", (vv?.height || window.innerHeight) + "px");
    };
    updateViewport();
    window.visualViewport?.addEventListener("resize", updateViewport);
    window.visualViewport?.addEventListener("scroll", updateViewport);
    window.addEventListener("resize", updateViewport);
    return () => {
      window.visualViewport?.removeEventListener("resize", updateViewport);
      window.visualViewport?.removeEventListener("scroll", updateViewport);
      window.removeEventListener("resize", updateViewport);
    };
  }, []);

  useEffect(() => {
    const node = scrollRef.current;
    if (node && !showJump) node.scrollTop = node.scrollHeight;
  }, [messages, loading, showJump]);

  const open = () => {
    if (navigator.vibrate) navigator.vibrate(8);
    setMode("small");
    setUnread(false);
    window.setTimeout(() => composerRef.current?.focus({ preventScroll: true }), 50);
  };

  const newChat = () => {
    setChatId(null);
    setMessages([]);
    setPrompt("");
    setError("");
    setHistoryOpen(false);
    setMode("small");
    window.setTimeout(() => composerRef.current?.focus({ preventScroll: true }), 50);
  };

  const selectChat = async (id: number) => {
    try {
      const detail = await apiRequest<{ messages: any[] }>("/api/chats/" + id);
      setChatId(id);
      setMessages((detail.messages || []).map((m) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: String(m.content || ""),
        created_at: m.created_at,
      })));
      setPrompt(window.localStorage.getItem("notely-assistant-draft-" + id) || "");
      setHistoryOpen(false);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open this chat.");
    }
  };

  const renameChat = async (id: number) => {
    const title = renameValue.trim();
    if (!title) {
      setError("Chat title cannot be empty.");
      return;
    }
    try {
      const result = await apiRequest<{ chat?: any }>("/api/chats/" + id, { method: "PUT", body: JSON.stringify({ title: title.slice(0, 120) }) });
      setChats((current) => current.map((chat) => Number(chat.id) === id ? { ...chat, ...(result.chat || {}), title } : chat));
      setRenamingId(null);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not rename chat.");
    }
  };

  const deleteChat = (chat: any) => {
    const id = Number(chat.id);
    setChats((current) => current.filter((item) => Number(item.id) !== id));
    setUndoChat(chat);
    deleteTimersRef.current[id] = window.setTimeout(async () => {
      try {
        await apiRequest("/api/chats/" + id, { method: "DELETE" });
        if (chatId === id) {
          setChatId(null);
          setMessages([]);
        }
      } catch (e) {
        setChats((current) => [chat, ...current.filter((item) => Number(item.id) !== id)]);
        setError(e instanceof Error ? e.message : "Delete failed; chat restored.");
      } finally {
        delete deleteTimersRef.current[id];
        setUndoChat((current: any) => current && Number(current.id) === id ? null : current);
      }
    }, 7000);
  };

  const undoDelete = () => {
    if (!undoChat) return;
    const id = Number(undoChat.id);
    window.clearTimeout(deleteTimersRef.current[id]);
    delete deleteTimersRef.current[id];
    setChats((current) => [undoChat, ...current.filter((item) => Number(item.id) !== id)]);
    setUndoChat(null);
  };

  const send = async (value = prompt) => {
    if (loading) {
      controllerRef.current?.abort();
      return;
    }
    const question = value.trim();
    if (!question) return;

    setPrompt("");
    setError("");
    setLoading(true);
    setUnread(false);

    setMessages((current) => [
      ...current,
      { role: "user", content: question, created_at: new Date().toISOString() },
      { role: "assistant", content: "", created_at: new Date().toISOString() },
    ]);

    let id = chatId;
    const controller = new AbortController();
    controllerRef.current = controller;

    try {
      if (!id) {
        const created = await apiRequest<{ chat: { id: number; title?: string } }>("/api/chats", {
          method: "POST",
          body: JSON.stringify({ title: question.slice(0, 60) }),
        });
        id = Number(created.chat.id);
        setChatId(id);
        setChats((current) => [{ ...created.chat, id }, ...current]);
      }

      const token = await workspaceToken();
      const content = contextEnabled
        ? `Workspace context: ${context}. Use this as navigation context only; do not assume access to source files. Student question: ${question}`
        : question;

      const response = await fetch(API_BASE + "/api/chats/" + id + "/stream", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ content, model: "auto" }),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.detail || "AI request failed (" + response.status + ").");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let answer = "";

      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        buffer += decoder.decode(chunk.value, { stream: true });
        const frames = buffer.split("\n\n");
        buffer = frames.pop() || "";
        for (const frame of frames) {
          const line = frame.split("\n").find((row) => row.startsWith("data:"));
          if (!line) continue;
          let event: any;
          try {
            event = JSON.parse(line.slice(5).trim());
          } catch {
            continue;
          }
          if (event.event === "token") {
            answer += String(event.token || "");
            setMessages((current) =>
              current.map((message, index) =>
                index === current.length - 1 ? { ...message, content: answer } : message
              )
            );
          } else if (event.event === "error") {
            throw new Error(event.error?.message || "AI response failed.");
          }
        }
      }

      if (!answer.trim()) {
        const detail = await apiRequest<{ messages: any[] }>("/api/chats/" + id);
        const last = (detail.messages || []).filter((m) => m.role === "assistant").slice(-1)[0];
        if (last) {
          setMessages((current) =>
            current.map((message, index) =>
              index === current.length - 1 ? { ...message, content: String(last.content || "") } : message
            )
          );
        }
      }

      if (modeRef.current === "closed") setUnread(true);
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") setError("Generation stopped.");
      else setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setLoading(false);
      controllerRef.current = null;
    }
  };

  const suggestions = context.toLowerCase().includes("flash")
    ? [
        ["Quiz me on these cards", "Quiz me on these cards"],
        ["Explain a difficult card", "Explain a difficult card"],
        ["Help me remember key ideas", "Help me remember key ideas"],
      ]
    : [
        ["Summarize my work", "Summarize my work"],
        ["Turn this into a quiz", "Turn this into a quiz"],
        ["Help me revise", "Help me revise"],
      ];

  return (
    <>
      <button
        ref={launcherRef}
        type="button"
        className={`na-launcher ${mode !== "closed" ? "is-hidden" : ""} ${loading ? "is-generating" : ""}`}
        aria-label={mode === "closed" ? "Open Notely Assistant" : "Close Notely Assistant"}
        onClick={open}
      >
        <span className="na-launcher-ring" />
        <span className="na-launcher-icon"><AuroraOrb size={42} /></span>
        {unread && <span className="na-launcher-badge" />}
      </button>

      {mode !== "closed" && (
        <section
          className={`na-window ${mode === "maximized" ? "is-maximized" : "is-small"}`}
          role="dialog"
          aria-modal="false"
          aria-label="Notely Assistant"
          aria-live="polite"
        >
          <header className="na-header">
            <div className="na-brand">
              <span><AuroraOrb size={28} /></span>
              <div>
                <strong>Notely Assistant</strong>
                <small>Stay in your study flow</small>
              </div>
            </div>
            <div className="na-header-actions">
              <button type="button" className="na-icon-button" onClick={() => setContextEnabled((v) => !v)} title={contextEnabled ? "Disable workspace context" : "Enable workspace context"}>
                {contextEnabled ? "Context on" : "Context off"}
              </button>
              <button type="button" className="na-icon-button" onClick={() => setMode((current) => current === "maximized" ? "small" : "maximized")} title="Toggle size">
                {mode === "maximized" ? "Reduce" : "Expand"}
              </button>
              <button type="button" className="na-icon-button" onClick={() => setMode("closed")} title="Close">
                ✕
              </button>
            </div>
          </header>

          <div className="na-body">
            <aside className={`na-history ${mode === "maximized" || historyOpen ? "is-visible" : ""}`} aria-label="Chat history">
              <div className="na-history-header">
                <span>Recent chats</span>
                <button type="button" onClick={newChat}>New</button>
              </div>

              {chats.map((chat) => (
                <button
                  key={chat.id}
                  type="button"
                  className={`na-history-item ${Number(chat.id) === Number(chatId) ? "selected" : ""}`}
                  onClick={() => void selectChat(Number(chat.id))}
                >
                  {chat.title || "Untitled chat"}
                </button>
              ))}
            </aside>

            <div className="na-chat-area">
              <div className="na-messages" ref={scrollRef} onScroll={(e) => {
                const el = e.currentTarget;
                setShowJump(el.scrollHeight - el.scrollTop - el.clientHeight > 120);
              }} aria-live="polite">
                {!messages.length && (
                  <div className="na-empty">
                    <Sparkles />
                    <h3>What are you working on?</h3>
                    <p>Ask for revision help, summaries, flashcards, or a quick explanation.</p>
                    <div className="na-suggestions">
                      {suggestions.map(([label, value]) => (
                        <button key={label} type="button" onClick={() => setPrompt(value)}>{label}</button>
                      ))}
                    </div>
                  </div>
                )}

                {messages.map((message, index) => (
                  <article key={`${message.role}-${index}`} className={`na-message ${message.role === "user" ? "is-user" : "is-assistant"}`}>
                    <div className="na-message-bubble">
                      {message.content || (message.role === "assistant" ? "Thinking..." : "")}
                    </div>
                  </article>
                ))}

                {loading && <div className="na-typing">Thinking…</div>}
              </div>

              {showJump && (
                <button className="na-jump" onClick={() => {
                  if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
                  setShowJump(false);
                }}>
                  Jump to latest ↓
                </button>
              )}

              {error && <p className="na-error" role="alert">{error}</p>}
              {undoChat && (
                <div className="na-undo">
                  <span>Chat queued for deletion.</span>
                  <button type="button" onClick={undoDelete}>Undo</button>
                </div>
              )}

              <form
                className="na-composer"
                onSubmit={(e) => {
                  e.preventDefault();
                  void send();
                }}
              >
                <textarea
                  ref={composerRef}
                  value={prompt}
                  maxLength={8000}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Ask Notely anything..."
                  rows={2}
                />
                <div className="na-composer-actions">
                  <button type="button" className="na-secondary" onClick={newChat}>New chat</button>
                  <button type="submit" className="na-primary" disabled={loading || !prompt.trim()}>
                    {loading ? "Sending..." : "Send"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </section>
      )}
    </>
  );
}

function Overview({ setRoute }: { setRoute: (r: Route) => void }) {
  const [stats, setStats] = useState<any>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    Promise.all([apiRequest<any>("/api/stats"), apiRequest<{ notes: any[] }>("/api/tools/notes")])
      .then(([dashboard, saved]) => {
        if (cancelled) return;
        setStats(dashboard);
        setNotes((saved.notes || []).map(normalizeNote).filter((n) => !n.deleted && !n.archived).slice(0, 3));
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not load your workspace.");
      });

    return () => { cancelled = true; };
  }, []);

  return (
    <div className="screen overview-screen">
      <PageTitle
        eyebrow="YOUR WORKSPACE"
        title="Welcome to Notely"
        description="Your notes, AI conversations and study tools in one place."
        action={<ActionButton secondary onClick={() => openNotelyAssistant()}><Sparkles /> Ask AI</ActionButton>}
      />

      {error && <div role="alert" className="surface-panel" style={{ marginBottom: 16, color: "#bd5f62" }}>{error}</div>}

      <section className="hero-grid">
        <div className="continue-panel">
          <div className="panel-kicker"><span className="sparkle-dot"><Sparkles /></span><span>YOUR STUDY WORKSPACE</span></div>
          <h2>Pick up where you left off</h2>
          <p>Organize notes, track study tasks and keep questions moving with AI support.</p>
        </div>

        <div className="focus-panel">
          <div className="panel-kicker"><Clock3 /> WORKSPACE ACTIVITY</div>
          <div className="focus-time">{stats ? stats.total_messages : "—"} <small>messages</small></div>
          <div className="focus-meta">
            <span>AI help ready</span>
            <span>All synced</span>
          </div>
        </div>
      </section>

      <section className="section-block">
        <div className="section-heading">
          <div>
            <span className="eyebrow">YOUR SPACE</span>
            <h2>Recent notes</h2>
          </div>
          <button onClick={() => setRoute("notes")}>View all</button>
        </div>

        {notes.length ? (
          <div className="note-grid">
            {notes.map((note) => (
              <NoteCard key={note.id} note={note} onClick={() => setRoute("notes")} />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<FileText />}
            title="No saved notes yet"
            copy="Create a note to start building your study workspace."
            action={<ActionButton onClick={() => setRoute("notes")}><Plus /> New note</ActionButton>}
          />
        )}
      </section>

      <section className="dashboard-grid">
        <div className="surface-panel">
          <div className="section-heading">
            <div>
              <span className="eyebrow">STUDY TOOLS</span>
              <h2>Make it stick</h2>
            </div>
            <button onClick={() => setRoute("tools")}>See all</button>
          </div>
          <div className="tool-grid">
            {tools.map(([id, label, description, Icon]) => (
              <button key={id} type="button" className="tool-card" onClick={() => setRoute(id as Route)}>
                <Icon />
                <strong>{label}</strong>
                <span>{description}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="surface-panel upcoming">
          <div className="section-heading">
            <div>
              <span className="eyebrow">NEXT STEP</span>
              <h2>Keep learning</h2>
            </div>
            <CalendarDays />
          </div>
          <div className="upcoming-list">
            <div><span>Review</span><strong>Summarize yesterday's notes</strong></div>
            <div><span>Practice</span><strong>Take a 5-question quiz</strong></div>
            <div><span>Plan</span><strong>Book revision time this week</strong></div>
          </div>
        </div>
      </section>
    </div>
  );
}

function Notes({ setRoute, filter = "all" }: { setRoute: (r: Route) => void; filter?: "all" | "favorites" | "archive" | "trash" }) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const version = useRef(0);

  const reload = async () => {
    setLoading(true);
    try {
      const data = await apiRequest<{ notes: any[] }>("/api/tools/notes");
      setNotes((data.notes || []).map(normalizeNote));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load notes.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void reload(); }, []);

  useEffect(() => {
    if (!dirty || selectedId === null) return;
    const editVersion = version.current;
    const timer = window.setTimeout(async () => {
      setSaving(true);
      try {
        await apiRequest("/api/notes/" + selectedId, {
          method: "PUT",
          body: JSON.stringify({ topic: title.trim() || "Untitled note", content: body }),
        });
        if (editVersion === version.current) {
          setDirty(false);
          setError("");
          setNotes((current) => current.map((n) =>
            n.id === selectedId ? { ...n, title: title.trim() || "Untitled note", content: body } : n
          ));
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Autosave failed.");
      } finally {
        setSaving(false);
      }
    }, 800);

    return () => window.clearTimeout(timer);
  }, [selectedId, title, body, dirty]);

  const choose = (note: Note) => {
    if (dirty && selectedId !== null) {
      void apiRequest("/api/notes/" + selectedId, {
        method: "PUT",
        body: JSON.stringify({ topic: title.trim() || "Untitled note", content: body }),
      }).catch(() => {});
    }
    setSelectedId(note.id || null);
    setTitle(note.title);
    setBody(note.content || "");
    setDirty(false);
    setError("");
  };

  const create = async () => {
    try {
      if (dirty && selectedId !== null) {
        await apiRequest("/api/notes/" + selectedId, {
          method: "PUT",
          body: JSON.stringify({ topic: title.trim() || "Untitled note", content: body }),
        });
      }

      const data = await apiRequest<{ note: any }>("/api/notes", {
        method: "POST",
        body: JSON.stringify({ topic: "Untitled note", content: "" }),
      });

      const note = normalizeNote(data.note);
      setNotes((current) => [note, ...current]);
      choose(note);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create a note.");
    }
  };

  const flag = async (note: Note, patch: Record<string, boolean>) => {
    if (!note.id) return;
    try {
      if (dirty && selectedId === note.id) {
        await apiRequest("/api/notes/" + note.id, {
          method: "PUT",
          body: JSON.stringify({ topic: title.trim() || "Untitled note", content: body }),
        });
      }

      await apiRequest("/api/tools/notes/" + note.id, {
        method: "PATCH",
        body: JSON.stringify(patch),
      });

      setNotes((current) => current.map((n) =>
        n.id === note.id ? { ...n, ...patch, state: patch.deleted ? "deleted" : patch.archived ? "archived" : "active" } : n
      ));

      if (selectedId === note.id && (patch.deleted || patch.archived)) setSelectedId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update note.");
    }
  };

  const remove = async (note: Note) => {
    if (!note.id) return;
    try {
      await apiRequest("/api/tools/notes/" + note.id, { method: "DELETE" });
      setNotes((current) => current.filter((n) => n.id !== note.id));
      if (selectedId === note.id) setSelectedId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete note.");
    }
  };

  const visible = notes.filter((n) =>
    filter === "favorites"
      ? n.favorite && !n.archived && !n.deleted
      : filter === "archive"
        ? n.archived && !n.deleted
        : filter === "trash"
          ? n.deleted
          : !n.archived && !n.deleted
  );

  const selected = notes.find((n) => n.id === selectedId);
  const heading =
    filter === "favorites" ? "Favorites" :
    filter === "archive" ? "Archive" :
    filter === "trash" ? "Trash" :
    "My notes";

  return (
    <div className="screen">
      <PageTitle
        eyebrow="YOUR KNOWLEDGE"
        title={heading}
        description="Create, edit and organize your notes. Edits autosave to your workspace."
        action={<ActionButton onClick={create}><Plus /> New note</ActionButton>}
      />

      <div className="toolbar">
        <label className="inline-search">
          <Search />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search notes and content" />
        </label>
      </div>

      {error && <div role="alert" className="surface-panel" style={{ marginBottom: 16, color: "#bd5f62" }}>{error}</div>}

      {loading ? (
        <div className="surface-panel">Loading notes…</div>
      ) : visible.length ? (
        <div className="note-grid">
          {visible
            .filter((n) => (query ? `${n.title} ${n.content || ""}`.toLowerCase().includes(query.toLowerCase()) : true))
            .map((note) => (
              <div key={note.id} className="note-entry">
                <NoteCard note={note} onClick={() => choose(note)} />
                <div className="note-entry-actions">
                  <button onClick={() => void flag(note, { favorite: !note.favorite })}>
                    {note.favorite ? "★ Favorite" : "☆ Favorite"}
                  </button>
                  {filter === "trash" ? (
                    <>
                      <button onClick={() => void flag(note, { deleted: false, archived: false })}>Restore</button>
                      <button onClick={() => void remove(note)}>Delete permanently</button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => void flag(note, { archived: !note.archived, deleted: false })}>
                        {note.archived ? "Unarchive" : "Archive"}
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
        </div>
      ) : (
        <EmptyState
          icon={<FileText />}
          title={heading === "Trash" ? "Trash is empty" : heading === "Archive" ? "No archived notes" : heading === "Favorites" ? "No favorites yet" : "No notes yet"}
          copy="Start by creating your first note or use AI to generate one."
          action={<ActionButton onClick={create}><Plus /> New note</ActionButton>}
        />
      )}

      {selected && (
        <section className="surface-panel" style={{ marginTop: 20 }}>
          <div className="section-heading">
            <div>
              <span className="eyebrow">NOTE EDITOR</span>
              <h2>{title || "Untitled note"}</h2>
            </div>
            <span role="status">{saving ? "Saving…" : dirty ? "Unsaved changes" : "Saved"}</span>
          </div>

          <label style={{ display: "grid", gap: 8, marginBottom: 14 }}>
            Title
            <input value={title} maxLength={200} onChange={(e) => { version.current++; setTitle(e.target.value); setDirty(true); }} />
          </label>

          <label style={{ display: "grid", gap: 8 }}>
            Content
            <textarea value={body} rows={12} placeholder="Start writing…" onChange={(e) => { version.current++; setBody(e.target.value); setDirty(true); }} />
          </label>

          <div className="title-actions" style={{ marginTop: 14 }}>
            <ActionButton secondary onClick={() => openNotelyAssistant()}>
              <Sparkles /> Ask AI
            </ActionButton>
            <ActionButton onClick={() => setSelectedId(null)}>
              Close editor
            </ActionButton>
          </div>
        </section>
      )}
    </div>
  );
}

function Documents({ setRoute }: { setRoute: (r: Route) => void }) {
  const [files, setFiles] = useState<any[]>([]);
  const [filter, setFilter] = useState("All materials");
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [summaries, setSummaries] = useState<Record<number, string>>({});

  const browse = () => document.getElementById("notely-document-input")?.click();

  const reload = async () => {
    setLoading(true);
    try {
      const data = await apiRequest<{ files: any[] }>("/api/files");
      setFiles(data.files || []);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load documents.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void reload(); }, []);

  const uploadFiles = async (incoming: File[]) => {
    if (!incoming.length) return;
    setUploading(true);
    setError("");
    try {
      for (const file of incoming) {
        const form = new FormData();
        form.append("file", file);
        await apiRequest("/api/files/upload", { method: "POST", body: form });
      }
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  };

  const summarize = async (file: any) => {
    setError("");
    try {
      const data = await apiRequest<{ summary: string }>("/api/files/" + file.id + "/summarize", { method: "POST" });
      setSummaries((current) => ({ ...current, [Number(file.id)]: data.summary }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not summarize this file.");
    }
  };

  const removeFile = async (file: any) => {
    setError("");
    try {
      await apiRequest("/api/files/" + file.id, { method: "DELETE" });
      setFiles((current) => current.filter((item) => item.id !== file.id));
      setSummaries((current) => {
        const next = { ...current };
        delete next[Number(file.id)];
        return next;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not remove this file.");
    }
  };

  const visible = files.filter((file) =>
    filter !== "PDFs" || String(file.content_type || "").includes("pdf") || String(file.filename || "").toLowerCase().endsWith(".pdf")
  );

  return (
    <div className="screen">
      <PageTitle
        eyebrow="YOUR MATERIALS"
        title="Documents"
        description="Upload files to your account, extract supported text and ask Notely to summarize it."
        action={<ActionButton onClick={browse}><Upload /> Browse files</ActionButton>}
      />

      <input id="notely-document-input" type="file" accept=".pdf,.docx,.txt,.png,.jpg,.jpeg,.webp" multiple hidden onChange={(e) => {
        void uploadFiles(Array.from(e.target.files || []));
        e.target.value = "";
      }} />

      <div className="dropzone" onDragOver={(e) => e.preventDefault()} onDrop={(e) => {
        e.preventDefault();
        void uploadFiles(Array.from(e.dataTransfer.files || []));
      }}>
        <Upload />
        <div>
          <strong>{uploading ? "Uploading documents…" : "Drop files here, or browse your device"}</strong>
          <p>PDF, DOCX, TXT and image files · up to 8 MB per file</p>
        </div>
        <ActionButton secondary onClick={browse}>{uploading ? "Uploading…" : "Browse files"}</ActionButton>
      </div>

      {error && <div role="alert" className="surface-panel" style={{ marginTop: 16, color: "#bd5f62" }}>{error}</div>}

      <div className="toolbar">
        <div className="filter-pills">
          {["All materials", "PDFs"].map((item) => (
            <button type="button" key={item} className={"pill " + (filter === item ? "active" : "")} onClick={() => setFilter(item)}>
              {item}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="surface-panel">Loading your documents…</div>
      ) : visible.length ? (
        <div className="document-grid">
          {visible.map((file) => (
            <div className="document-card" key={file.id}>
              <div className="doc-icon"><FileText /></div>
              <div>
                <strong>{file.filename}</strong>
                <small>{String(file.kind || file.content_type || "File").toUpperCase()} · {Math.max(1, Math.round(Number(file.size || 0) / 1024))} KB</small>
              </div>
              <span className="ready"><CheckCircle2 /> {file.has_text === false ? "Stored" : "Uploaded"}</span>
              <div className="title-actions">
                <button type="button" className="select-button" onClick={() => void summarize(file)}>Summarize</button>
                <button type="button" className="select-button" onClick={() => void removeFile(file)}>Remove</button>
              </div>
              {summaries[Number(file.id)] && (
                <div className="document-summary">
                  <strong>Summary</strong>
                  <p style={{ whiteSpace: "pre-wrap" }}>{summaries[Number(file.id)]}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<FolderOpen />}
          title="No documents uploaded"
          copy="Upload a PDF, DOCX, TXT or image file. Supported text is stored with your account."
          action={<ActionButton onClick={browse}><Upload /> Upload file</ActionButton>}
        />
      )}
    </div>
  );
}

function Tools({ setRoute }: { setRoute: (r: Route) => void }) {
  return (
    <div className="screen">
      <PageTitle eyebrow="LEARN BY DOING" title="Study tools" description="Small tools that turn understanding into action." />
      <div className="tool-grid">
        {tools.map(([id, label, description, Icon]) => (
          <button key={id} type="button" className="tool-card" onClick={() => setRoute(id as Route)}>
            <Icon />
            <strong>{label}</strong>
            <span>{description}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function ToolDetail({ route, setRoute }: { route: Route; setRoute: (r: Route) => void }) {
  const details: Record<string, [string, string, ReactNode]> = {
    quiz: ["Quiz generator", "Generate practice questions from a topic.", <CircleHelp />],
    flashcards: ["Flashcards", "Generate recall cards for focused practice.", <BookOpen />],
    roadmap: ["Study roadmap", "Generate a sequence of milestones for a topic.", <Zap />],
    mindmap: ["Mind maps", "Generate a structured map of connected ideas.", <BarChart3 />],
    planner: ["Revision planner", "Create a day-by-day study plan.", <CalendarDays />],
    summarizer: ["Text summarizer", "Paste text and generate a concise summary.", <FileText />],
    homework: ["Homework helper", "Ask a question and get a worked explanation.", <CircleHelp />],
  };

  const [heading, copy, iconNode] = details[route] || details.quiz;
  const [topic, setTopic] = useState("");
  const [amount, setAmount] = useState("5");
  const [days, setDays] = useState("7");
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const run = async () => {
    if (!topic.trim()) {
      setError("Enter a topic or goal first.");
      return;
    }

    setLoading(true);
    setError("");
    setResult(null);

    try {
      let data: any;

      if (route === "quiz") {
        data = await apiRequest("/api/tools/quiz", { method: "POST", body: JSON.stringify({ topic: topic.trim(), num_questions: Number(amount) }) });
      } else if (route === "summarizer") {
        data = await apiRequest("/api/tools/summarize", { method: "POST", body: JSON.stringify({ text: topic.trim() }) });
      } else if (route === "homework") {
        data = await apiRequest("/api/tools/homework", { method: "POST", body: JSON.stringify({ question: topic.trim() }) });
      } else if (route === "flashcards") {
        data = await apiRequest("/api/tools/flashcards", { method: "POST", body: JSON.stringify({ topic: topic.trim(), num_cards: Number(amount) }) });
      } else if (route === "planner") {
        data = await apiRequest("/api/tools/plan", { method: "POST", body: JSON.stringify({ goal: topic.trim(), days: Number(days) }) });
      } else {
        const created = await apiRequest<{ topic: { id: number } }>("/api/topics", {
          method: "POST",
          body: JSON.stringify({ title: topic.trim() }),
        });
        data = await apiRequest("/api/topics/" + created.topic.id + "/generate/" + (route === "mindmap" ? "mindmap" : "roadmap"), {
          method: "POST",
          body: JSON.stringify({}),
        });
      }

      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The tool could not complete the request.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="screen detail-screen">
      <button className="back-link" onClick={() => setRoute("tools")}>← Back to study tools</button>
      <div className="detail-hero">
        <span className="big-tool-icon">{iconNode}</span>
        <span className="eyebrow">STUDY TOOL</span>
        <h1>{heading}</h1>
        <p>{copy}</p>
      </div>
      <div className="detail-workspace">
        <div className="surface-panel">
          <div className="section-heading">
            <div><span className="eyebrow">GENERATE WITH AI</span><h2>Choose your topic</h2></div>
            <Sparkles />
          </div>

          <label style={{ display: "grid", gap: 8, marginBottom: 14 }}>
            {route === "planner" ? "Study goal" : route === "summarizer" ? "Text to summarize" : route === "homework" ? "Your question" : "Topic or goal"}
            <textarea value={topic} rows={5} onChange={(e) => setTopic(e.target.value)} placeholder="Type your topic here..." />
          </label>

          {route === "quiz" && (
            <label style={{ display: "grid", gap: 8, marginBottom: 14 }}>
              Number of questions
              <select value={amount} onChange={(e) => setAmount(e.target.value)}>
                {["5", "10", "15"].map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>
          )}

          {route === "flashcards" && (
            <label style={{ display: "grid", gap: 8, marginBottom: 14 }}>
              Number of cards
              <select value={amount} onChange={(e) => setAmount(e.target.value)}>
                {["5", "8", "10", "15"].map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>
          )}

          {route === "planner" && (
            <label style={{ display: "grid", gap: 8, marginBottom: 14 }}>
              Plan length (days)
              <select value={days} onChange={(e) => setDays(e.target.value)}>
                {["3", "7", "14", "21", "30"].map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>
          )}

          <ActionButton onClick={() => void run()}>
            {loading ? <><Clock3 /> Generating…</> : <><Sparkles /> Generate {heading.toLowerCase()}</>}
          </ActionButton>

          {error && <p role="alert" style={{ color: "#bd5f62", marginTop: 12 }}>{error}</p>}
          {result && <div className="tool-result" style={{ marginTop: 20, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}><h3>Generated result</h3><pre>{JSON.stringify(result, null, 2)}</pre></div>}
        </div>

        <div className="surface-panel tool-side-note">
          <Sparkles />
          <h3>Built from your prompt</h3>
          <p>Generated content comes from the configured Notely backend and can be copied into your notes.</p>
        </div>
      </div>
    </div>
  );
}

function SearchScreen({ setRoute }: { setRoute: (r: Route) => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<{ topics: any[]; notes: any[]; chats: any[]; quizzes: any[] }>({ topics: [], notes: [], chats: [], quizzes: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!q.trim()) {
      setResults({ topics: [], notes: [], chats: [], quizzes: [] });
      return;
    }

    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const data = await apiRequest<typeof results>("/api/search?q=" + encodeURIComponent(q.trim()));
        setResults(data);
        setError("");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Search failed.");
      } finally {
        setLoading(false);
      }
    }, 250);

    return () => window.clearTimeout(timer);
  }, [q]);

  const groups = [
    { key: "notes", label: "Notes", rows: results.notes || [], route: "notes" as Route, icon: <FileText /> },
    { key: "topics", label: "Topics", rows: results.topics || [], route: "roadmap" as Route, icon: <BookOpen /> },
    { key: "chats", label: "Chats", rows: results.chats || [], route: "overview" as Route, icon: <MessageCircle /> },
    { key: "quizzes", label: "Quizzes", rows: results.quizzes || [], route: "quiz" as Route, icon: <CircleHelp /> },
  ];

  const count = groups.reduce((total, group) => total + group.rows.length, 0);

  return (
    <div className="screen">
      <PageTitle eyebrow="FIND YOUR THREAD" title="Search" description="Search your saved notes, topics, chats and quizzes." />
      <label className="large-search">
        <Search />
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search your workspace…" />
        <kbd>⌘ K</kbd>
      </label>
      {error && <p role="alert" style={{ color: "#bd5f62" }}>{error}</p>}
      {loading && <p>Searching…</p>}
      {!q.trim() ? (
        <EmptyState icon={<Search />} title="Search your workspace" copy="Enter a topic, note title, or phrase to find saved content." />
      ) : !loading && count === 0 ? (
        <EmptyState icon={<Search />} title="No results found" copy="Try a different phrase or keyword." />
      ) : (
        <div className="search-results">
          {groups.filter((group) => group.rows.length).map((group) => (
            <section key={group.key}>
              <span className="eyebrow">{group.label.toUpperCase()}</span>
              {group.rows.map((row: any, index: number) => (
                <button key={index} type="button" className="search-result" onClick={() => setRoute(group.route)}>
                  {row.title || row.topic || row.name || "Result"}
                </button>
              ))}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}


function SettingsScreen() {
  const [theme, setTheme] = useState<"light" | "dark">("dark");

  useEffect(() => {
    const saved = document.documentElement.dataset.theme || localStorage.getItem("notely-theme");
    if (saved === "light" || saved === "dark") setTheme(saved);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme;
    root.classList.toggle("dark", theme === "dark");
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#060c1c" : "#f4f7fc");
    try { localStorage.setItem("notely-theme", theme); } catch { /* Theme still works for this session. */ }
  }, [theme]);

  return (
    <div className="screen">
      <PageTitle eyebrow="MAKE IT YOURS" title="Settings" description="Tune your workspace without leaving your study flow." />
      <div className="settings-page-grid">
        <section className="settings-card" aria-labelledby="settings-appearance">
          <div className="settings-card-heading">
            <span className="settings-card-icon"><Settings size={18} /></span>
            <div><h2 id="settings-appearance">Appearance</h2><p>Choose the workspace theme that feels right for you.</p></div>
          </div>
          <div className="settings-theme-options" role="group" aria-label="Theme">
            <button type="button" className={`settings-theme-option ${theme === "light" ? "selected" : ""}`} aria-pressed={theme === "light"} onClick={() => setTheme("light")}>
              <span className="theme-preview theme-preview-light" aria-hidden="true"><i /><i /><i /></span>
              <span><strong>Light</strong><small>Bright, clear surfaces</small></span>
              {theme === "light" && <CheckCircle2 size={18} aria-hidden="true" />}
            </button>
            <button type="button" className={`settings-theme-option ${theme === "dark" ? "selected" : ""}`} aria-pressed={theme === "dark"} onClick={() => setTheme("dark")}>
              <span className="theme-preview theme-preview-dark" aria-hidden="true"><i /><i /><i /></span>
              <span><strong>Dark</strong><small>Deep navy, soft contrast</small></span>
              {theme === "dark" && <CheckCircle2 size={18} aria-hidden="true" />}
            </button>
          </div>
          <p className="settings-helper"><CheckCircle2 size={15} /> Theme changes apply instantly and are saved on this device.</p>
        </section>
        <section className="settings-card" aria-labelledby="settings-access">
          <div className="settings-card-heading">
            <span className="settings-card-icon"><ShieldCheck size={18} /></span>
            <div><h2 id="settings-access">Privacy & security</h2><p>Keep your workspace and account access in mind.</p></div>
          </div>
          <div className="settings-info-row"><span><strong>Session</strong><small>Your workspace uses its existing session.</small></span><span className="settings-status">Active workspace</span></div>
          <div className="settings-info-row"><span><strong>Saved preferences</strong><small>Theme and sidebar preferences stay on this device.</small></span><CheckCircle2 size={17} /></div>
        </section>
        <section className="settings-card" aria-labelledby="settings-about">
          <div className="settings-card-heading">
            <span className="settings-card-icon"><BookOpen size={18} /></span>
            <div><h2 id="settings-about">About Notely</h2><p>A focused workspace for notes, recall and study planning.</p></div>
          </div>
          <div className="settings-info-row"><span><strong>Product</strong><small>Notely Study Workspace</small></span><span className="settings-version">Web</span></div>
          <div className="settings-info-row"><span><strong>Open-source notices</strong><small>License information is available in the repository's LICENSE file.</small></span><a href="https://github.com/digital-coder-jack/N-o-t-e-l-y-/blob/main/LICENSE" target="_blank" rel="noreferrer">View license <ArrowRight size={14} /></a></div>
        </section>
      </div>
    </div>
  );
}

function PageTitle({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="page-title">
      {eyebrow && <span className="eyebrow">{eyebrow}</span>}
      <div className="title-row">
        <h1>{title}</h1>
        {action}
      </div>
      {description && <p>{description}</p>}
    </div>
  );
}

function ActionButton({ children, secondary = false, onClick }: { children: ReactNode; secondary?: boolean; onClick?: () => void }) {
  return (
    <button type="button" className={`action-button ${secondary ? "secondary" : ""}`} onClick={onClick}>
      {children}
    </button>
  );
}

function NoteCard({ note, onClick }: { note: Note; onClick: () => void }) {
  return (
    <button type="button" className="note-card" onClick={onClick}>
      <div className="note-card-top">
        <span className="course-dot" />
        <small>{note.course}</small>
        <span className="note-tag">{note.tag}</span>
      </div>
      <h3>{note.title}</h3>
      <p>{note.content ? note.content.slice(0, 120) : "No content yet"}</p>
      <div className="note-card-footer">
        <span>{note.time}</span>
      </div>
    </button>
  );
}

function EmptyState({ icon, title, copy, action }: { icon: ReactNode; title: string; copy: string; action?: ReactNode }) {
  return (
    <div className="empty-state">
      <span>{icon}</span>
      <h2>{title}</h2>
      <p>{copy}</p>
      {action}
    </div>
  );
}

export default function Page() {
  const [route, setRouteState] = useState<Route>("overview");
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  useEffect(() => {
    setRouteState(routeFromPath(window.location.pathname));
    const onPop = () => setRouteState(routeFromPath(window.location.pathname));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);


  useEffect(() => {
    const labels: Record<Route, string> = {
      overview: "Overview", notes: "My Notes", documents: "Documents", favorites: "Favorites",
      archive: "Archive", trash: "Trash", tools: "Study Tools", quiz: "Quiz Generator",
      flashcards: "Flashcards", roadmap: "Study Roadmap", mindmap: "Mind Maps",
      planner: "Revision Planner", summarizer: "Text Summarizer", homework: "Homework Helper",
      search: "Search", settings: "Settings"
    };
    document.title = labels[route] + " — Notely";
  }, [route]);

  const setRoute = (next: Route) => {
    window.history.pushState({}, "", pathFor(next));
    setRouteState(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem("notely-sidebar-collapsed") === "true");
    } catch {
      // Storage can be unavailable in private contexts.
    }

    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = !!target && (target.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(target.tagName));
      if (event.key === "Escape") {
        setMobileOpen(false);
        setShortcutsOpen(false);
        return;
      }
      if (event.key === "?" && !typing) {
        event.preventDefault();
        setShortcutsOpen(true);
        return;
      }
      if (!(event.metaKey || event.ctrlKey) || event.altKey) return;

      const key = event.key.toLowerCase();
      if (key === "k") {
        event.preventDefault();
        setRoute("search");
      }
      if (key === "n" && !typing) {
        event.preventDefault();
        setRoute("notes");
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("notely-sidebar-collapsed", String(collapsed));
    } catch {
      // Keep the control usable without storage.
    }
  }, [collapsed]);

  let content: ReactNode = <Overview setRoute={setRoute} />;

  if (route === "notes") content = <Notes setRoute={setRoute} />;
  else if (route === "documents") content = <Documents setRoute={setRoute} />;
  else if (["favorites", "archive", "trash"].includes(route)) content = <Notes setRoute={setRoute} filter={route as "favorites" | "archive" | "trash"} />;
  else if (route === "tools") content = <Tools setRoute={setRoute} />;
  else if (route === "quiz" || route === "flashcards" || route === "roadmap" || route === "mindmap" || route === "planner" || route === "summarizer" || route === "homework") content = <ToolDetail route={route} setRoute={setRoute} />;
  else if (route === "search") content = <SearchScreen setRoute={setRoute} />;
  else if (route === "settings") content = <SettingsScreen />;

  return (
    <div className="workspace">
      <TrialStatusBanner />
      <Sidebar
        route={route}
        setRoute={setRoute}
        collapsed={collapsed}
        setCollapsed={setCollapsed}
        mobileOpen={mobileOpen}
        setMobileOpen={setMobileOpen}
      />

      <main className="workspace-main">
        {content}
      </main>

      <button type="button" className="shortcuts-launcher" aria-label="Open keyboard shortcuts" title="Keyboard shortcuts (?)" onClick={() => setShortcutsOpen(true)}><CircleHelp size={18} /><span>Shortcuts</span><kbd>?</kbd></button>
      {shortcutsOpen && (
        <div className="shortcuts-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setShortcutsOpen(false); }}>
          <section className="shortcuts-dialog" role="dialog" aria-modal="true" aria-labelledby="shortcuts-title">
            <div className="shortcuts-dialog-head"><div><span className="eyebrow">WORKSPACE HELP</span><h2 id="shortcuts-title">Keyboard shortcuts</h2></div><button type="button" className="shortcuts-close" onClick={() => setShortcutsOpen(false)} aria-label="Close keyboard shortcuts">×</button></div>
            <div className="shortcut-row"><span>Search workspace</span><kbd>Ctrl / ⌘ K</kbd></div>
            <div className="shortcut-row"><span>Create a note</span><kbd>Ctrl / ⌘ N</kbd></div>
            <div className="shortcut-row"><span>Show this guide</span><kbd>?</kbd></div>
            <p>Shortcuts pause while you type in an input or editor.</p>
          </section>
        </div>
      )}
      <FloatingAssistant context={route === "documents" ? "Documents" : route === "notes" ? "Notes" : route === "tools" ? "Study tools" : "Overview"} />
    </div>
  );
}