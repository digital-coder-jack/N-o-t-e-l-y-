"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Archive, ArrowRight, BarChart3, Bell, BookOpen, CalendarDays, Check, CheckCircle2,
  ChevronDown, ChevronRight, CircleHelp, Cloud, FileText, FolderOpen, Grid2X2, Home,
  LayoutList, Menu, MessageCircle, MoreHorizontal, PanelLeftClose, PanelLeftOpen,
  Paperclip, PenLine, Plus, Search, Settings, ShieldCheck, Sparkles, Star, Trash2,
  Upload, Zap, Clock3,
} from "lucide-react";

type Route = "overview" | "notes" | "documents" | "favorites" | "archive" | "trash" | "tools" | "quiz" | "flashcards" | "roadmap" | "mindmap" | "planner" | "summarizer" | "homework" | "search" | "settings";
type Note = { id?: number; title: string; course: string; time: string; tag: string; content?: string; pinned?: boolean; favorite?: boolean; archived?: boolean; deleted?: boolean; state?: "active" | "archived" | "deleted" };
const NOTES: Note[] = [];

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL || "https://study-sphere-ai-mwlq.vercel.app").replace(/\/+$/, "");

async function workspaceToken(): Promise<string> {
  if (typeof window === "undefined") throw new Error("Workspace requests require a browser.");
  const saved = window.localStorage.getItem("ss_token");
  if (saved) return saved;
  const response = await fetch(API_BASE + "/api/auth/guest", { method: "POST" });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.token) throw new Error(payload.detail || "Could not start a workspace session.");
  window.localStorage.setItem("ss_token", payload.token);
  if (payload.user) window.localStorage.setItem("ss_user", JSON.stringify(payload.user));
  return payload.token as string;
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
    id: Number(raw.id), title: String(raw.topic || "Untitled note"), course: "My workspace",
    time: date && !Number.isNaN(date.getTime()) ? "Created " + date.toLocaleDateString() : "Saved note",
    tag: raw.pinned ? "Pinned" : raw.favorite ? "Favorite" : "Note", content: String(raw.content || ""),
    pinned: Boolean(raw.pinned), favorite: Boolean(raw.favorite), archived: Boolean(raw.archived),
    deleted: Boolean(raw.deleted), state: raw.deleted ? "deleted" : raw.archived ? "archived" : "active",
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
function routeFromPath(path: string): Route { const hash = typeof window !== "undefined" ? window.location.hash.replace(/^#\/?/, "") : ""; const key = hash || path.replace(/^\/+/, "").replace(/^app\/?/, "") || "overview"; const allowed = ["overview","notes","documents","favorites","archive","trash","tools","quiz","flashcards","roadmap","mindmap","planner","summarizer","homework","search","settings"]; return allowed.includes(key) ? key as Route : "overview"; }
function pathFor(route: Route) { return route === "overview" ? "/" : "/#/" + route; }
function AppLogo({ compact = false }: { compact?: boolean }) { return <div className="app-logo"><img src={compact ? "/logo-symbol.svg" : "/logo-wordmark.svg"} alt="Notely" /></div>; }

function Sidebar({ route, setRoute, collapsed, setCollapsed, mobileOpen, setMobileOpen }: { route: Route; setRoute: (r: Route) => void; collapsed: boolean; setCollapsed: (v: boolean) => void; mobileOpen: boolean; setMobileOpen: (v: boolean) => void }) {
  const go = (r: Route) => { setRoute(r); setMobileOpen(false); };
  const primary = [["overview", "Overview", Home], ["notes", "My Notes", FileText], ["assistant", "AI Assistant", Sparkles], ["documents", "Documents", FolderOpen]] as const;
  const library = [["favorites", "Favorites", Star], ["archive", "Archive", Archive], ["trash", "Trash", Trash2]] as const;
  return <><div className={`sidebar-scrim ${mobileOpen ? "show" : ""}`} onClick={() => setMobileOpen(false)} /><aside className={`sidebar ${collapsed ? "collapsed" : ""} ${mobileOpen ? "mobile-open" : ""}`}>
    <div className="sidebar-top"><AppLogo compact={collapsed} /> {!collapsed && <div className="brand-copy"><strong>Notely</strong><span>My workspace</span></div>}<button className="icon-button collapse-button" onClick={() => setCollapsed(!collapsed)} aria-label="Toggle sidebar">{collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}</button></div>
    <button className="new-note" onClick={() => go("notes")}><PenLine /><span>New note</span><kbd>⌘ N</kbd></button>
    <button className="sidebar-search" onClick={() => go("search")}><Search /><span>Search anything</span><kbd>⌘ K</kbd></button>
    <nav className="side-nav" aria-label="Workspace navigation"><span className="nav-label">Workspace</span>{primary.map(([id, label, Icon]) => <NavButton key={id} active={route === id} icon={<Icon />} label={label} collapsed={collapsed} onClick={() => go(id)} />)}<span className="nav-label">Library</span>{library.map(([id, label, Icon]) => <NavButton key={id} active={route === id} icon={<Icon />} label={label} collapsed={collapsed} onClick={() => go(id)} />)}<span className="nav-label">Study tools</span><NavButton active={route === "tools" || ["quiz","flashcards","roadmap","mindmap","planner","summarizer","homework"].includes(route)} icon={<Zap />} label="Tools hub" collapsed={collapsed} onClick={() => go("tools")} badge="5" /><NavButton active={route === "settings"} icon={<Settings />} label="Settings" collapsed={collapsed} onClick={() => go("settings")} /></nav>
    <div className="sidebar-bottom">{!collapsed && <div className="sync-card"><div><Cloud /><span>Cloud sync on</span></div><small>All changes saved</small></div>}<button className="profile-card" onClick={() => go("settings")}><span className="avatar">JL</span>{!collapsed && <span><strong>Jamie Lee</strong><small>Student workspace</small></span>}<MoreHorizontal /></button></div>
  </aside></>;
}
function NavButton({ active, icon, label, collapsed, onClick, badge }: { active: boolean; icon: ReactNode; label: string; collapsed: boolean; onClick: () => void; badge?: string }) { return <button className={`nav-button ${active ? "active" : ""} ${collapsed ? "icon-only" : ""}`} onClick={onClick} aria-current={active ? "page" : undefined} title={collapsed ? label : undefined}><span>{icon}</span>{!collapsed && <><strong>{label}</strong>{badge && <small>{badge}</small>}</>}</button>; }
function Header({ title, subtitle, setRoute, onMenu }: { title: string; subtitle?: string; setRoute: (r: Route) => void; onMenu: () => void }) { return <header className="topbar"><button className="mobile-menu icon-button" onClick={onMenu} aria-label="Open navigation"><Menu /></button><div className="breadcrumb"><span>Workspace</span><ChevronRight /><strong>{title}</strong>{subtitle && <><ChevronRight /><span>{subtitle}</span></>}</div><div className="topbar-actions"><button className="top-search" onClick={() => setRoute("search")}><Search /><span>Search</span><kbd>⌘ K</kbd></button><button className="notification icon-button" aria-label="Notifications"><Bell /><i /></button><button className="top-avatar" onClick={() => setRoute("settings")}>JL</button></div></header>; }
function PageTitle({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: ReactNode }) { return <div className="page-title">{eyebrow && <span className="eyebrow">{eyebrow}</span>}<div className="title-row"><div><h1>{title}</h1>{description && <p>{description}</p>}</div>{action}</div></div>; }
function ActionButton({ children, secondary = false, onClick }: { children: ReactNode; secondary?: boolean; onClick?: () => void }) { return <button className={`action-button ${secondary ? "secondary" : ""}`} onClick={onClick}>{children}</button>; }
function NoteCard({ note, onClick }: { note: Note; onClick: () => void }) { return <button className="note-card" onClick={onClick}><div className="note-card-top"><span className="course-dot" /><small>{note.course}</small>{note.pinned && <Star className="star-fill" />}</div><h3>{note.title}</h3><p>{note.time}</p><div className="note-tag">{note.tag}</div></button>; }

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
        setNotes((saved.notes || []).map(normalizeNote).filter(n => !n.deleted && !n.archived).slice(0, 3));
      })
      .catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : "Could not load your workspace."); });
    return () => { cancelled = true; };
  }, []);
  return <div className="screen overview-screen">
    <PageTitle eyebrow="YOUR WORKSPACE" title="Welcome to Notely" description="Your notes, AI conversations and study tools in one place." action={<div className="title-actions"><ActionButton secondary onClick={() => setRoute("documents")}><Upload /> Import</ActionButton><ActionButton onClick={() => setRoute("notes")}><Plus /> New note</ActionButton></div>} />
    {error && <div role="alert" className="surface-panel" style={{ marginBottom: 16, color: "#bd5f62" }}>{error}</div>}
    <section className="hero-grid">
      <div className="continue-panel"><div className="panel-kicker"><span className="sparkle-dot"><Sparkles /></span><span>YOUR STUDY WORKSPACE</span></div><h2>Pick up where you left off</h2><p>Open a saved note, ask Notely a question, or generate study material from a topic.</p><div className="continue-meta"><span>{stats ? stats.notes + " saved notes" : "Loading notes…"}</span><span>{stats ? stats.total_chats + " chats" : "Loading chats…"}</span><span>{stats ? stats.quizzes + " quizzes" : "Loading quizzes…"}</span></div><ActionButton onClick={() => openNotelyAssistant()}><Sparkles /> Ask Notely <ArrowRight /></ActionButton></div>
      <div className="focus-panel"><div className="panel-kicker"><Clock3 /> WORKSPACE ACTIVITY</div><div className="focus-time">{stats ? stats.total_messages : "—"} <small>messages</small></div><div className="progress"><i style={{ width: stats ? Math.min(100, Number(stats.ai_generations || 0) * 5) + "%" : "0%" }} /></div><p>{stats ? stats.ai_generations + " AI generations and study artifacts" : "Activity appears here when the backend is connected."}</p><button onClick={() => setRoute("tools")}>Open study tools <ArrowRight /></button></div>
    </section>
    <section className="section-block"><div className="section-heading"><div><span className="eyebrow">YOUR SPACE</span><h2>Recent notes</h2></div><button onClick={() => setRoute("notes")}>View all <ArrowRight /></button></div>
      {notes.length ? <div className="note-grid">{notes.map(note => <NoteCard key={note.id} note={note} onClick={() => setRoute("notes")} />)}</div> : <EmptyState icon={<FileText />} title="No saved notes yet" copy="Create a note or generate notes from one of the study tools." action={<ActionButton onClick={() => setRoute("notes")}><Plus /> Create a note</ActionButton>} />}
    </section>
    <section className="dashboard-grid">
      <div className="surface-panel"><div className="section-heading"><div><span className="eyebrow">STUDY TOOLS</span><h2>Make it stick</h2></div><button onClick={() => setRoute("tools")}>See all <ArrowRight /></button></div><div className="tool-list">{tools.slice(0, 3).map(([id, label, copy, Icon]) => <button key={id} onClick={() => setRoute(id)}><span className="tool-icon"><Icon /></span><span><strong>{label}</strong><small>{copy}</small></span><ChevronRight /></button>)}</div></div>
      <div className="surface-panel upcoming"><div className="section-heading"><div><span className="eyebrow">NEXT STEP</span><h2>Keep learning</h2></div><CalendarDays /></div><div className="upcoming-item"><span className="date-box"><BookOpen /></span><span><strong>Review your saved notes</strong><small>Use search, favorites and archive to stay organized.</small></span></div><div className="upcoming-item"><span className="check-box"><Sparkles /></span><span><strong>Generate practice material</strong><small>Create quizzes, flashcards or a study roadmap.</small></span></div><button className="full-link" onClick={() => setRoute("planner")}>Create a revision plan <ArrowRight /></button></div>
    </section>
  </div>;
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
    } catch (e) { setError(e instanceof Error ? e.message : "Could not load notes."); }
    finally { setLoading(false); }
  };
  useEffect(() => { void reload(); }, []);

  useEffect(() => {
    if (!dirty || selectedId === null) return;
    const editVersion = version.current;
    const timer = window.setTimeout(async () => {
      setSaving(true);
      try {
        await apiRequest("/api/notes/" + selectedId, { method: "PUT", body: JSON.stringify({ topic: title.trim() || "Untitled note", content: body }) });
        if (editVersion === version.current) { setDirty(false); setError(""); setNotes(current => current.map(n => n.id === selectedId ? { ...n, title: title.trim() || "Untitled note", content: body } : n)); }
      } catch (e) { setError(e instanceof Error ? e.message : "Autosave failed."); }
      finally { setSaving(false); }
    }, 800);
    return () => window.clearTimeout(timer);
  }, [selectedId, title, body, dirty]);

  const choose = (note: Note) => {
    if (dirty && selectedId !== null) void apiRequest("/api/notes/" + selectedId, { method: "PUT", body: JSON.stringify({ topic: title.trim() || "Untitled note", content: body }) }).catch(e => setError(e instanceof Error ? e.message : "Could not save the previous note."));
    setSelectedId(note.id || null); setTitle(note.title); setBody(note.content || "");
    setDirty(false); setError("");
  };
  const create = async () => {
    try {
      if (dirty && selectedId !== null) {
        await apiRequest("/api/notes/" + selectedId, { method: "PUT", body: JSON.stringify({ topic: title.trim() || "Untitled note", content: body }) });
      }
      const data = await apiRequest<{ note: any }>("/api/notes", { method: "POST", body: JSON.stringify({ topic: "Untitled note", content: "" }) });
      const note = normalizeNote(data.note);
      setNotes(current => [note, ...current]); choose(note);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not create a note."); }
  };
  const flag = async (note: Note, patch: Record<string, boolean>) => {
    if (!note.id) return;
    try {
      if (dirty && selectedId === note.id) {
        await apiRequest("/api/notes/" + note.id, { method: "PUT", body: JSON.stringify({ topic: title.trim() || "Untitled note", content: body }) });
      }
      await apiRequest("/api/tools/notes/" + note.id, { method: "PATCH", body: JSON.stringify(patch) });
      setNotes(current => current.map(n => n.id === note.id ? { ...n, ...patch, state: patch.deleted ? "deleted" : patch.archived ? "archived" : "active" } : n));
      if (selectedId === note.id && (patch.deleted || patch.archived)) setSelectedId(null);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not update note."); }
  };
  const remove = async (note: Note) => {
    if (!note.id) return;
    try { await apiRequest("/api/tools/notes/" + note.id, { method: "DELETE" }); setNotes(current => current.filter(n => n.id !== note.id)); if (selectedId === note.id) setSelectedId(null); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not delete note."); }
  };
  const visible = notes.filter(n => filter === "favorites" ? n.favorite && !n.archived && !n.deleted : filter === "archive" ? n.archived && !n.deleted : filter === "trash" ? n.deleted : !n.archived && !n.deleted).filter(n => (n.title + " " + (n.content || "")).toLowerCase().includes(query.toLowerCase()));
  const selected = notes.find(n => n.id === selectedId);
  const heading = filter === "favorites" ? "Favorites" : filter === "archive" ? "Archive" : filter === "trash" ? "Trash" : "My notes";

  return <div className="screen">
    <PageTitle eyebrow="YOUR KNOWLEDGE" title={heading} description="Create, edit and organize your notes. Edits autosave to your workspace." action={<ActionButton onClick={create}><Plus /> New note</ActionButton>} />
    <div className="toolbar"><label className="inline-search"><Search /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search notes and content" /></label></div>
    {error && <div role="alert" className="surface-panel" style={{ marginBottom: 16, color: "#bd5f62" }}>{error}</div>}
    {loading ? <div className="surface-panel">Loading notes…</div> : visible.length ? <div className="note-grid">{visible.map(note => <div key={note.id} className="note-entry">
      <NoteCard note={note} onClick={() => choose(note)} />
      <div className="note-entry-actions">
        <button onClick={() => void flag(note, { favorite: !note.favorite })}>{note.favorite ? "★ Favorite" : "☆ Favorite"}</button>
        {filter === "trash" ? <><button onClick={() => void flag(note, { deleted: false, archived: false })}>Restore</button><button onClick={() => void remove(note)}>Delete permanently</button></> : <><button onClick={() => void flag(note, { archived: !note.archived })}>{note.archived ? "Unarchive" : "Archive"}</button><button onClick={() => void flag(note, { deleted: true, archived: false })}>Move to trash</button></>}
      </div>
    </div>)}</div> : <EmptyState icon={<FileText />} title={heading === "Trash" ? "Trash is empty" : heading === "Archive" ? "No archived notes" : heading === "Favorites" ? "No favorites yet" : "No notes yet"} copy="Your notes will appear here when you create or generate them." action={filter === "all" ? <ActionButton onClick={create}><Plus /> Create a note</ActionButton> : undefined} />}
    {selected && <section className="surface-panel" style={{ marginTop: 20 }}>
      <div className="section-heading"><div><span className="eyebrow">NOTE EDITOR</span><h2>{title || "Untitled note"}</h2></div><span role="status">{saving ? "Saving…" : dirty ? "Unsaved changes" : "Saved"}</span></div>
      <label style={{ display: "grid", gap: 8, marginBottom: 14 }}>Title<input value={title} maxLength={200} onChange={e => { version.current++; setTitle(e.target.value); setDirty(true); }} /></label>
      <label style={{ display: "grid", gap: 8 }}>Content<textarea value={body} rows={12} placeholder="Start writing…" onChange={e => { version.current++; setBody(e.target.value); setDirty(true); }} /></label>
      <div className="title-actions" style={{ marginTop: 14 }}><ActionButton secondary onClick={() => openNotelyAssistant()}><Sparkles /> Ask AI</ActionButton><ActionButton onClick={() => setSelectedId(null)}>Close editor</ActionButton></div>
    </section>}
  </div>;
}

function openNotelyAssistant(prompt = "") { if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("notely:assistant-open", { detail: { prompt } })); }

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
          setMessages((detail.messages || []).map(m => ({ role: m.role === "assistant" ? "assistant" : "user", content: String(m.content || ""), created_at: m.created_at })));
          setPrompt(window.localStorage.getItem("notely-assistant-draft-" + desiredId) || "");
        }
      } catch (e) { if (!cancelled) setError(e instanceof Error ? e.message : "Could not load chat history."); }
      finally { if (!cancelled) setPersistReady(true); }
    })();
    const onOpen = (event: Event) => {
      const detail = (event as CustomEvent<{ prompt?: string }>).detail;
      setMode("small"); setUnread(false);
      if (detail?.prompt) setPrompt(detail.prompt);
      window.setTimeout(() => composerRef.current?.focus({ preventScroll: true }), 50);
    };
    const onKeys = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "j") {
        event.preventDefault(); setMode(current => current === "closed" ? "small" : "closed");
      } else if (event.key === "Escape") {
        setMode(current => { const next = current === "maximized" ? "small" : current === "small" ? "closed" : "closed"; if (next === "closed") window.setTimeout(() => launcherRef.current?.focus(), 0); return next; });
      }
    };
    window.addEventListener("notely:assistant-open", onOpen);
    window.addEventListener("keydown", onKeys);
    return () => {
      cancelled = true;
      window.removeEventListener("notely:assistant-open", onOpen);
      window.removeEventListener("keydown", onKeys);
      Object.values(deleteTimersRef.current).forEach(window.clearTimeout);
      controllerRef.current?.abort();
    };
  }, []);

  useEffect(() => { modeRef.current = mode; }, [mode]);
  useEffect(() => {
    if (!persistReady) return;
    try { window.localStorage.setItem("notely-assistant-widget-state", JSON.stringify({ mode, chatId, contextEnabled })); } catch { /* storage may be disabled */ }
  }, [mode, chatId, contextEnabled, persistReady]);
  useEffect(() => {
    try { window.localStorage.setItem("notely-assistant-draft-" + (chatId || "new"), prompt); } catch { /* storage may be disabled */ }
  }, [prompt, chatId]);
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

  const open = () => { setMode("small"); setUnread(false); window.setTimeout(() => composerRef.current?.focus({ preventScroll: true }), 50); };
  const newChat = () => { setChatId(null); setMessages([]); setPrompt(""); setError(""); setHistoryOpen(false); setMode("small"); window.setTimeout(() => composerRef.current?.focus({ preventScroll: true }), 50); };
  const selectChat = async (id: number) => {
    try {
      const detail = await apiRequest<{ messages: any[] }>("/api/chats/" + id);
      setChatId(id); setMessages((detail.messages || []).map(m => ({ role: m.role === "assistant" ? "assistant" : "user", content: String(m.content || ""), created_at: m.created_at })));
      setPrompt(window.localStorage.getItem("notely-assistant-draft-" + id) || ""); setHistoryOpen(false); setError("");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not open this chat."); }
  };
  const renameChat = async (id: number) => {
    const title = renameValue.trim();
    if (!title) { setError("Chat title cannot be empty."); return; }
    try {
      const result = await apiRequest<{ chat?: any }>("/api/chats/" + id, { method: "PUT", body: JSON.stringify({ title: title.slice(0, 120) }) });
      setChats(current => current.map(chat => Number(chat.id) === id ? { ...chat, ...(result.chat || {}), title } : chat));
      setRenamingId(null); setError("");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not rename chat."); }
  };
  const deleteChat = (chat: any) => {
    const id = Number(chat.id);
    setChats(current => current.filter(item => Number(item.id) !== id));
    setUndoChat(chat);
    deleteTimersRef.current[id] = window.setTimeout(async () => {
      try {
        await apiRequest("/api/chats/" + id, { method: "DELETE" });
        if (chatId === id) { setChatId(null); setMessages([]); }
      } catch (e) {
        setChats(current => [chat, ...current.filter(item => Number(item.id) !== id)]);
        setError(e instanceof Error ? e.message : "Delete failed; chat restored.");
      } finally { delete deleteTimersRef.current[id]; setUndoChat(current => current && Number(current.id) === id ? null : current); }
    }, 7000);
  };
  const undoDelete = () => {
    if (!undoChat) return;
    const id = Number(undoChat.id); window.clearTimeout(deleteTimersRef.current[id]); delete deleteTimersRef.current[id];
    setChats(current => [undoChat, ...current.filter(item => Number(item.id) !== id)]); setUndoChat(null);
  };
  const send = async (value = prompt) => {
    if (loading) { controllerRef.current?.abort(); return; }
    const question = value.trim();
    if (!question) return;
    setPrompt(""); setError(""); setLoading(true); setUnread(false);
    setMessages(current => [...current, { role: "user", content: question }, { role: "assistant", content: "" }]);
    let id = chatId;
    const controller = new AbortController(); controllerRef.current = controller;
    try {
      if (!id) {
        const created = await apiRequest<{ chat: { id: number; title?: string } }>("/api/chats", { method: "POST", body: JSON.stringify({ title: question.slice(0, 60) }) });
        id = Number(created.chat.id); setChatId(id); setChats(current => [{ ...created.chat, id }, ...current]);
      }
      const token = await workspaceToken();
      const content = contextEnabled ? "Workspace context: " + context + ". Use this as navigation context only; do not assume access to source files. Student question: " + question : question;
      const response = await fetch(API_BASE + "/api/chats/" + id + "/stream", {
        method: "POST", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify({ content, model: "auto" }), signal: controller.signal,
      });
      if (!response.ok || !response.body) { const payload = await response.json().catch(() => ({})); throw new Error(payload.detail || "AI request failed (" + response.status + ")."); }
      const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = ""; let answer = "";
      while (true) {
        const chunk = await reader.read(); if (chunk.done) break;
        buffer += decoder.decode(chunk.value, { stream: true });
        const frames = buffer.split("\n\n"); buffer = frames.pop() || "";
        for (const frame of frames) {
          const line = frame.split("\n").find(row => row.startsWith("data:")); if (!line) continue;
          let event: any; try { event = JSON.parse(line.slice(5).trim()); } catch { continue; }
          if (event.event === "token") {
            answer += String(event.token || "");
            setMessages(current => current.map((message, index) => index === current.length - 1 ? { ...message, content: answer } : message));
          } else if (event.event === "error") throw new Error(event.error?.message || "AI response failed.");
        }
      }
      if (!answer.trim()) {
        const detail = await apiRequest<{ messages: any[] }>("/api/chats/" + id);
        const last = (detail.messages || []).filter(m => m.role === "assistant").slice(-1)[0];
        if (last) setMessages(current => current.map((message, index) => index === current.length - 1 ? { ...message, content: String(last.content || "") } : message));
      }
      if (modeRef.current === "closed") setUnread(true);
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") setError("Generation stopped.");
      else setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally { setLoading(false); controllerRef.current = null; }
  };
  const act = async (action: string, message: AssistantMessage) => {
    if (action === "copy") { try { await navigator.clipboard.writeText(message.content); } catch { setError("Could not copy answer."); } }
    else if (action === "regenerate") { const prior = [...messages].reverse().find(item => item.role === "user"); if (prior) { setPrompt(prior.content); window.setTimeout(() => composerRef.current?.focus(), 0); } }
    else if (action === "good" || action === "bad") { try { localStorage.setItem("notely-assistant-feedback-" + chatId + "-" + messages.indexOf(message), action); } catch { /* ignore */ } }
    else if (action === "insert") { try { localStorage.setItem("notely-insert-note-draft", message.content); window.dispatchEvent(new CustomEvent("notely:assistant-insert-note", { detail: { content: message.content } })); } catch { /* ignore */ } }
    else if (action === "cards") { try { await apiRequest("/api/tools/flashcards", { method: "POST", body: JSON.stringify({ topic: message.content, num_cards: 8 }) }); } catch (e) { setError(e instanceof Error ? e.message : "Could not create flashcards."); } }
  };

  return <>
    <button ref={launcherRef} type="button" className={`na-launcher ${mode !== "closed" ? "is-hidden" : ""} ${loading ? "is-generating" : ""}`} aria-label={mode === "closed" ? "Open Notely Assistant" : "Minimize Notely Assistant"} aria-expanded={mode !== "closed"} onClick={() => mode === "closed" ? open() : setMode("closed")} title="Ask Notely"><span className="na-launcher-ring" aria-hidden="true" /><Sparkles aria-hidden="true" /><span className="na-unread-dot" hidden={!unread} /></button>
    {mode !== "closed" && <section className={`na-window ${mode === "maximized" ? "is-maximized" : "is-small"}`} role="dialog" aria-modal="false" aria-label="Notely Assistant" aria-live="polite">
      <header className="na-header"><div className="na-brand"><span><Sparkles /></span><div><strong>Notely Assistant</strong><small>Stay in your study flow</small></div></div><div className="na-head-actions"><span className="na-context-chip" hidden={!contextEnabled}>Context: {context}</span><button type="button" aria-label={contextEnabled ? "Remove context" : "Add context"} onClick={() => setContextEnabled(value => !value)}>{contextEnabled ? "×" : "＋"}</button><button type="button" onClick={() => setHistoryOpen(value => !value)} aria-label="Chat history">☷</button><button type="button" onClick={newChat} aria-label="New chat">＋</button>{mode === "small" ? <button type="button" onClick={() => setMode("maximized")} aria-label="Maximize assistant">□</button> : <button type="button" onClick={() => setMode("small")} aria-label="Restore assistant">↙</button>}<button type="button" onClick={() => { setMode("closed"); window.setTimeout(() => launcherRef.current?.focus(), 0); }} aria-label="Minimize assistant">−</button></div></header>
      <div className="na-body">
        <aside className={`na-history ${mode === "maximized" || historyOpen ? "is-visible" : ""}`} aria-label="Chat history"><div className="na-history-title">RECENT CHATS</div>{chats.map(chat => <div className="na-history-item" key={chat.id}>{renamingId === Number(chat.id) ? <form onSubmit={e => { e.preventDefault(); void renameChat(Number(chat.id)); }}><input aria-label="Chat title" value={renameValue} onChange={e => setRenameValue(e.target.value)} autoFocus /><button type="submit">Save</button></form> : <button className={Number(chat.id) === chatId ? "is-current" : ""} onClick={() => void selectChat(Number(chat.id))}>{chat.title || "New chat"}</button>}<button aria-label="Rename chat" onClick={() => { setRenamingId(Number(chat.id)); setRenameValue(String(chat.title || "New chat")); }}>✎</button><button aria-label="Delete chat" onClick={() => deleteChat(chat)}>×</button></div>)}</aside>
        <div className="na-chat-area">
          <div className="na-messages" ref={scrollRef} onScroll={e => { const el = e.currentTarget; setShowJump(el.scrollHeight - el.scrollTop - el.clientHeight > 120); }} aria-live="polite">
            {!messages.length && <div className="na-empty"><Sparkles /><h3>What are you working on?</h3><p>Choose a prompt to get started. Uploaded materials are not automatically retrieved by this API.</p><div className="na-suggestions"><button onClick={() => setPrompt("Summarize the current topic")}>Summarize this topic</button><button onClick={() => setPrompt("Quiz me on this topic")}>Quiz me</button><button onClick={() => setPrompt("Explain this simply")}>Explain simply</button></div></div>}
            {messages.map((message, index) => <article key={index} className={`na-message ${message.role === "user" ? "is-user" : "is-assistant"}`}>{message.role === "assistant" && <span className="na-avatar"><Sparkles /></span>}<div className="na-bubble"><div className="na-prose">{message.content || (loading && index === messages.length - 1 ? <span className="na-thinking"><i /><i /><i /></span> : "")}</div>{message.role === "assistant" && message.content && <div className="na-message-actions"><button onClick={() => void act("copy", message)}>Copy</button><button onClick={() => void act("regenerate", message)}>Regenerate</button><button aria-label="Good response" onClick={() => void act("good", message)}>👍</button><button aria-label="Bad response" onClick={() => void act("bad", message)}>👎</button><button onClick={() => void act("insert", message)}>Insert into note</button><button onClick={() => void act("cards", message)}>Make flashcards</button></div>}</div></article>)}
            <div />
          </div>
          {showJump && <button className="na-jump" onClick={() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; setShowJump(false); }}>Jump to latest ↓</button>}
          {error && <p className="na-error" role="alert">{error}</p>}
          {undoChat && <div className="na-undo"><span>Chat queued for deletion.</span><button onClick={undoDelete}>Undo</button></div>}
          <form className="na-composer" onSubmit={e => { e.preventDefault(); void send(); }}><textarea ref={composerRef} value={prompt} maxLength={8000} onChange={e => setPrompt(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }} placeholder="Ask Notely anything…" rows={1} aria-label="Message Notely Assistant" /><div><small>{prompt.length.toLocaleString()} / 8,000 · Enter to send</small><button type="submit" disabled={!prompt.trim() && !loading} aria-label={loading ? "Stop generating" : "Send message"}>{loading ? "Stop ■" : "Send ↑"}</button></div></form>
        </div>
      </div>
    </section>}
  </>;
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
    try { const data = await apiRequest<{ files: any[] }>("/api/files"); setFiles(data.files || []); setError(""); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not load documents."); }
    finally { setLoading(false); }
  };
  useEffect(() => { void reload(); }, []);

  const uploadFiles = async (incoming: File[]) => {
    if (!incoming.length) return;
    setUploading(true); setError("");
    try {
      for (const file of incoming) {
        const form = new FormData();
        form.append("file", file);
        await apiRequest("/api/files/upload", { method: "POST", body: form });
      }
      await reload();
    } catch (e) { setError(e instanceof Error ? e.message : "Upload failed."); }
    finally { setUploading(false); }
  };

  const summarize = async (file: any) => {
    setError("");
    try {
      const data = await apiRequest<{ summary: string }>("/api/files/" + file.id + "/summarize", { method: "POST" });
      setSummaries(current => ({ ...current, [Number(file.id)]: data.summary }));
    } catch (e) { setError(e instanceof Error ? e.message : "Could not summarize this file."); }
  };

  const removeFile = async (file: any) => {
    setError("");
    try {
      await apiRequest("/api/files/" + file.id, { method: "DELETE" });
      setFiles(current => current.filter(item => item.id !== file.id));
      setSummaries(current => { const next = { ...current }; delete next[Number(file.id)]; return next; });
    } catch (e) { setError(e instanceof Error ? e.message : "Could not remove this file."); }
  };

  const visible = files.filter(file => filter !== "PDFs" || String(file.content_type || "").includes("pdf") || String(file.filename || "").toLowerCase().endsWith(".pdf"));
  return <div className="screen">
    <PageTitle eyebrow="YOUR MATERIALS" title="Documents" description="Upload files to your account, extract supported text and ask Notely to summarize it." action={<ActionButton onClick={browse}><Upload /> Import document</ActionButton>} />
    <input id="notely-document-input" type="file" accept=".pdf,.docx,.txt,.png,.jpg,.jpeg,.webp" multiple hidden onChange={e => { void uploadFiles(Array.from(e.target.files || [])); e.target.value = ""; }} />
    <div className="dropzone" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); void uploadFiles(Array.from(e.dataTransfer.files || [])); }}>
      <Upload /><div><strong>{uploading ? "Uploading documents…" : "Drop files here, or browse your device"}</strong><p>PDF, DOCX, TXT and image files · up to 8 MB per file</p></div>
      <ActionButton secondary onClick={browse}>{uploading ? "Uploading…" : "Browse files"}</ActionButton>
    </div>
    {error && <div role="alert" className="surface-panel" style={{ marginTop: 16, color: "#bd5f62" }}>{error}</div>}
    <div className="toolbar"><div className="filter-pills">{["All materials", "PDFs"].map(item => <button type="button" key={item} className={"pill " + (filter === item ? "active" : "")} onClick={() => setFilter(item)}>{item}{item === "All materials" && <small>{files.length}</small>}</button>)}</div><button type="button" className="select-button" onClick={() => openNotelyAssistant()}>Ask AI about a file <ArrowRight /></button></div>
    {loading ? <div className="surface-panel">Loading your documents…</div> : visible.length ? <div className="document-grid">{visible.map(file => <div className="document-card" key={file.id}>
      <div className="doc-icon"><FileText /></div><div><strong>{file.filename}</strong><small>{String(file.kind || file.content_type || "File").toUpperCase()} · {Math.max(1, Math.round(Number(file.size_bytes || 0) / 1024))} KB</small></div>
      <span className="ready"><CheckCircle2 /> {file.has_text === false ? "Stored" : "Uploaded"}</span>
      <div className="title-actions"><button type="button" className="select-button" onClick={() => void summarize(file)}>Summarize</button><button type="button" className="select-button" onClick={() => void removeFile(file)}>Remove</button></div>
      {summaries[Number(file.id)] && <div className="document-summary"><strong>Summary</strong><p style={{ whiteSpace: "pre-wrap" }}>{summaries[Number(file.id)]}</p></div>}
    </div>)}</div> : <EmptyState icon={<FolderOpen />} title="No documents uploaded" copy="Upload a PDF, DOCX, TXT or image file. Supported text is stored with your account." action={<ActionButton onClick={browse}><Upload /> Upload a document</ActionButton>} />}
  </div>;
}
function Tools({ setRoute }: { setRoute: (r: Route) => void }) { return <div className="screen"><PageTitle eyebrow="LEARN BY DOING" title="Study tools" description="Small tools that turn understanding into momentum." /><div className="tools-grid">{tools.map(([id, label, copy, Icon], index) => <button className="big-tool-card" key={id} onClick={() => setRoute(id)}><span className="big-tool-icon"><Icon /></span><span className="eyebrow">0{index + 1} / STUDY</span><h2>{label}</h2><p>{copy}</p><span className="tool-link">Open tool <ArrowRight /></span></button>)}</div></div>; }
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
    if (!topic.trim()) { setError("Enter a topic or goal first."); return; }
    setLoading(true); setError(""); setResult(null);
    try {
      let data: any;
      if (route === "quiz") data = await apiRequest("/api/tools/quiz", { method: "POST", body: JSON.stringify({ topic: topic.trim(), num_questions: Number(amount) }) });
      else if (route === "summarizer") data = await apiRequest("/api/tools/summarize", { method: "POST", body: JSON.stringify({ text: topic.trim() }) });
      else if (route === "homework") data = await apiRequest("/api/tools/homework", { method: "POST", body: JSON.stringify({ question: topic.trim() }) });
      else if (route === "flashcards") data = await apiRequest("/api/tools/flashcards", { method: "POST", body: JSON.stringify({ topic: topic.trim(), num_cards: Number(amount) }) });
      else if (route === "planner") data = await apiRequest("/api/tools/plan", { method: "POST", body: JSON.stringify({ goal: topic.trim(), days: Number(days) }) });
      else {
        const created = await apiRequest<{ topic: { id: number } }>("/api/topics", { method: "POST", body: JSON.stringify({ title: topic.trim() }) });
        data = await apiRequest("/api/topics/" + created.topic.id + "/generate/" + (route === "mindmap" ? "mindmap" : "roadmap"), { method: "POST", body: JSON.stringify({}) });
      }
      setResult(data);
    } catch (e) { setError(e instanceof Error ? e.message : "The tool could not complete the request."); }
    finally { setLoading(false); }
  };

  return <div className="screen detail-screen">
    <button className="back-link" onClick={() => setRoute("tools")}>← Back to study tools</button>
    <div className="detail-hero"><span className="big-tool-icon">{iconNode}</span><span className="eyebrow">STUDY TOOL</span><h1>{heading}</h1><p>{copy}</p></div>
    <div className="detail-workspace">
      <div className="surface-panel">
        <div className="section-heading"><div><span className="eyebrow">GENERATE WITH AI</span><h2>Choose your topic</h2></div><Sparkles /></div>
        <label style={{ display: "grid", gap: 8, marginBottom: 14 }}>{route === "planner" ? "Study goal" : route === "summarizer" ? "Text to summarize" : route === "homework" ? "Your question" : "Topic"}{route === "summarizer" ? <textarea value={topic} onChange={e => setTopic(e.target.value)} rows={7} placeholder="Paste text here…" maxLength={20000} /> : <input value={topic} onChange={e => setTopic(e.target.value)} placeholder={route === "planner" ? "e.g. Prepare for my biology exam" : route === "homework" ? "e.g. Explain Newton’s second law" : "e.g. Cellular respiration"} maxLength={route === "homework" ? 4000 : 300} />}</label>
        {route === "quiz" && <label style={{ display: "grid", gap: 8, marginBottom: 14 }}>Number of questions<select value={amount} onChange={e => setAmount(e.target.value)}>{["5","10","15"].map(n => <option key={n}>{n}</option>)}</select></label>}
        {route === "flashcards" && <label style={{ display: "grid", gap: 8, marginBottom: 14 }}>Number of cards<select value={amount} onChange={e => setAmount(e.target.value)}>{["5","8","10","15","20"].map(n => <option key={n}>{n}</option>)}</select></label>}
        {route === "planner" && <label style={{ display: "grid", gap: 8, marginBottom: 14 }}>Plan length (days)<select value={days} onChange={e => setDays(e.target.value)}>{["3","7","14","21","30","60"].map(n => <option key={n}>{n}</option>)}</select></label>}
        <ActionButton onClick={() => void run()}>{loading ? <><Clock3 /> Generating…</> : <><Sparkles /> Generate {heading.toLowerCase()}</>}</ActionButton>
        {error && <p role="alert" style={{ color: "#bd5f62", marginTop: 12 }}>{error}</p>}
        {result && <div className="tool-result" style={{ marginTop: 20, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}><h3>Generated result</h3><pre style={{ whiteSpace: "pre-wrap", font: "inherit" }}>{typeof result.content === "string" ? result.content : JSON.stringify(result.content ?? result, null, 2)}</pre><button type="button" className="select-button" onClick={() => { const text = typeof result.content === "string" ? result.content : JSON.stringify(result.content ?? result, null, 2); void navigator.clipboard.writeText(text); }}>Copy result</button></div>}
      </div>
      <div className="surface-panel tool-side-note"><Sparkles /><h3>Built from your prompt</h3><p>Generated content comes from the configured Notely backend and can be copied for your notes.</p></div>
    </div>
  </div>;
}

function SearchScreen({ setRoute }: { setRoute: (r: Route) => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<{ topics: any[]; notes: any[]; chats: any[]; quizzes: any[] }>({ topics: [], notes: [], chats: [], quizzes: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!q.trim()) { setResults({ topics: [], notes: [], chats: [], quizzes: [] }); return; }
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try { const data = await apiRequest<typeof results>("/api/search?q=" + encodeURIComponent(q.trim())); setResults(data); setError(""); }
      catch (e) { setError(e instanceof Error ? e.message : "Search failed."); }
      finally { setLoading(false); }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [q]);
  const groups = [
    { key: "notes", label: "Notes", rows: results.notes || [], route: "notes" as Route, icon: <FileText /> },
    { key: "topics", label: "Topics", rows: results.topics || [], route: "roadmap" as Route, icon: <BookOpen /> },
    { key: "quizzes", label: "Quizzes", rows: results.quizzes || [], route: "quiz" as Route, icon: <CircleHelp /> },
  ];
  const count = groups.reduce((total, group) => total + group.rows.length, 0);
  return <div className="screen"><PageTitle eyebrow="FIND YOUR THREAD" title="Search" description="Search your saved notes, topics, chats and quizzes." />
    <label className="large-search"><Search /><input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Search your workspace…" /><kbd>⌘ K</kbd></label>
    {error && <p role="alert" style={{ color: "#bd5f62" }}>{error}</p>}
    {loading && <p>Searching…</p>}
    {!q.trim() ? <EmptyState icon={<Search />} title="Search your workspace" copy="Enter a topic, note title, or phrase to find saved content." /> : !loading && count === 0 ? <EmptyState icon={<Search />} title="No results found" copy="Try another keyword or a shorter phrase." /> :
      <div className="search-results">{groups.filter(group => group.rows.length).map(group => <section key={group.key}><span className="eyebrow">{group.label.toUpperCase()}</span>{group.rows.map(row => <button className="result-row" key={row.id} onClick={() => setRoute(group.route)}><span className="result-icon">{group.icon}</span><span><strong>{row.title || row.topic || "Untitled"}</strong><small>{group.label.slice(0, -1)} · Open in workspace</small></span><ArrowRight /></button>)}</section>)}</div>}
  </div>;
}

function SettingsScreen() {
  const sections = [["Profile", Home], ["Appearance", Grid2X2], ["Editor preferences", PenLine], ["Security & sessions", ShieldCheck], ["Privacy & data", Cloud], ["AI providers", Sparkles], ["Notifications", Bell]] as const;
  const [section, setSection] = useState("Profile");
  const [profile, setProfile] = useState<any>({});
  const [settings, setSettings] = useState<any>({ appearance: { theme: "system", accentColor: "#3b82f6" }, dashboard: { compactSidebar: false, showWelcome: true, showStreak: true, defaultPage: "dashboard" }, notifications: { email: true, reminders: true, dailyGoal: true }, ai_settings: { model: "auto", length: "medium", difficulty: "intermediate" } });
  const [models, setModels] = useState<any>(null);
  const [displayName, setDisplayName] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [authMode, setAuthMode] = useState<"login" | "signup" | null>(null);
  const [identifier, setIdentifier] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authName, setAuthName] = useState("");
  const [authUsername, setAuthUsername] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [authConfirm, setAuthConfirm] = useState("");

  useEffect(() => {
    let cancelled = false;
    Promise.all([apiRequest<{ user: any }>("/api/auth/me"), apiRequest<any>("/api/settings"), apiRequest<any>("/api/ai/models")])
      .then(([me, prefs, available]) => {
        if (cancelled) return;
        setProfile(me.user || {}); setDisplayName(String(me.user?.name || ""));
        setSettings((current: any) => ({ ...current, ...prefs })); setModels(available);
      })
      .catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : "Could not load settings."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const saveCategory = async (category: string, data: any) => {
    setSaving(true); setError(""); setMessage("");
    try {
      await apiRequest("/api/settings", { method: "PUT", body: JSON.stringify({ category, data }) });
      setSettings((current: any) => ({ ...current, [category]: data }));
      setMessage("Settings saved to your account.");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save settings."); }
    finally { setSaving(false); }
  };

  const updateProfile = async () => {
    if (!displayName.trim()) { setError("Enter a display name."); return; }
    setSaving(true); setError(""); setMessage("");
    try {
      const data = await apiRequest<{ user: any }>("/api/auth/profile", { method: "PUT", body: JSON.stringify({ name: displayName.trim() }) });
      setProfile(data.user || { ...profile, name: displayName.trim() });
      if (typeof window !== "undefined") window.localStorage.setItem("ss_user", JSON.stringify(data.user || { ...profile, name: displayName.trim() }));
      setMessage("Profile saved to your account.");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not update your profile."); }
    finally { setSaving(false); }
  };

  const changePassword = async () => {
    if (!currentPassword || newPassword.length < 8) { setError("Enter your current password and a new password of at least 8 characters."); return; }
    setSaving(true); setError(""); setMessage("");
    try {
      const data = await apiRequest<{ message: string }>("/api/auth/change-password", { method: "PUT", body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }) });
      setMessage(data.message || "Password changed."); setCurrentPassword(""); setNewPassword("");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not change password."); }
    finally { setSaving(false); }
  };

  const exportWorkspace = async () => {
    setError("");
    try {
      const [notes, chats, files] = await Promise.all([apiRequest<any>("/api/tools/notes"), apiRequest<any>("/api/chats"), apiRequest<any>("/api/files")]);
      const blob = new Blob([JSON.stringify({ exported_at: new Date().toISOString(), profile, settings, notes: notes.notes || [], chats: chats.chats || [], files: files.files || [] }, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = "notely-workspace-export.json"; a.click(); URL.revokeObjectURL(url);
      setMessage("Workspace export downloaded.");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not export workspace data."); }
  };

  const submitAuth = async () => {
    setSaving(true); setError(""); setMessage("");
    try {
      const path = authMode === "signup" ? "/api/auth/signup" : "/api/auth/login";
      const payload = authMode === "signup"
        ? { name: authName.trim(), username: authUsername.trim(), email: authEmail.trim(), password: authPassword, confirm_password: authConfirm }
        : { identifier: identifier.trim(), password: authPassword };
      const response = await fetch(API_BASE + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.token) throw new Error(data.detail || "Authentication failed.");
      window.localStorage.setItem("ss_token", data.token);
      window.localStorage.setItem("ss_user", JSON.stringify(data.user || {}));
      window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not sign in.");
    } finally { setSaving(false); }
  };

  const toggle = (category: string, key: string) => {
    const current = settings[category] || {};
    void saveCategory(category, { ...current, [key]: !current[key] });
  };

  return <div className="screen settings-screen">
    <PageTitle eyebrow="YOUR WORKSPACE" title="Settings" description="These preferences are saved to your Notely account." />
    {loading && <div className="surface-panel">Loading account settings…</div>}
    {error && <div role="alert" className="surface-panel" style={{ marginBottom: 12, color: "#bd5f62" }}>{error}</div>}
    {message && <p role="status" className="settings-saved">{message}</p>}
    <div className="settings-layout">
      <aside className="settings-nav">{sections.map(([name, Icon]) => <button type="button" className={section === name ? "active" : ""} key={name} onClick={() => setSection(name)}><Icon />{name}</button>)}<div className="settings-danger"><button type="button" onClick={() => void exportWorkspace()}><Upload /> Export workspace data</button></div></aside>
      <div className="settings-content"><span className="eyebrow">{section.toUpperCase()}</span><h2>{section}</h2>
        {section === "Profile" && <><div className="profile-large"><span className="avatar big">{(displayName.trim()[0] || "N").toUpperCase()}</span><div><h3>{displayName || "Your profile"}</h3><p>{profile.email || "No email on account"}</p></div><ActionButton onClick={() => void updateProfile()}>{saving ? "Saving…" : "Save profile"}</ActionButton></div><div className="settings-fields"><label>Display name<input value={displayName} onChange={e => setDisplayName(e.target.value)} maxLength={80} /></label><label>Email address<input type="email" value={profile.email || ""} readOnly /></label></div><p className="settings-note">Email changes are managed through account verification and are not editable here.</p>
          {(profile.is_guest || String(profile.email || "").endsWith("@guest.ainotebook")) ? <div className="surface-panel" style={{ marginTop: 18 }}><h3>Save your workspace to an account</h3><p>Your current session is a guest account. Sign in or create an account to access that account's notes on other devices. Export guest data before switching if you need a copy.</p><div className="title-actions"><ActionButton secondary onClick={() => setAuthMode(authMode === "login" ? null : "login")}>Sign in</ActionButton><ActionButton onClick={() => setAuthMode(authMode === "signup" ? null : "signup")}>Create account</ActionButton></div>
          {authMode && <form onSubmit={e => { e.preventDefault(); void submitAuth(); }} className="settings-fields" style={{ marginTop: 14 }}>
            {authMode === "signup" ? <><label>Full name<input required value={authName} onChange={e => setAuthName(e.target.value)} /></label><label>Username<input required value={authUsername} onChange={e => setAuthUsername(e.target.value)} /></label><label>Email<input required type="email" value={authEmail} onChange={e => setAuthEmail(e.target.value)} /></label></> : <label>Email or username<input required value={identifier} onChange={e => setIdentifier(e.target.value)} /></label>}
            <label>Password<input required type="password" minLength={8} value={authPassword} onChange={e => setAuthPassword(e.target.value)} /></label>
            {authMode === "signup" && <label>Confirm password<input required type="password" minLength={8} value={authConfirm} onChange={e => setAuthConfirm(e.target.value)} /></label>}
            <ActionButton>{saving ? "Please wait…" : authMode === "signup" ? "Create account" : "Sign in"}</ActionButton>
          </form>}</div> : <p className="settings-note">Your account is connected. Notes and chat history are saved to this account.</p>}
        </>}
        {section === "Appearance" && <div className="preference-list"><div><span><strong>Theme</strong><small>Choose light, dark or system appearance.</small></span><select value={settings.appearance?.theme || "system"} onChange={e => void saveCategory("appearance", { ...settings.appearance, theme: e.target.value })}><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></select></div><div><span><strong>Accent color</strong><small>Set the preferred workspace accent.</small></span><input type="color" value={settings.appearance?.accentColor || "#3b82f6"} onChange={e => void saveCategory("appearance", { ...settings.appearance, accentColor: e.target.value })} /></div></div>}
        {section === "Editor preferences" && <div className="preference-list">{[["compactSidebar","Compact sidebar"],["showWelcome","Show welcome panel"],["showStreak","Show study activity"]].map(([key,label]) => <div key={key}><span><strong>{label}</strong><small>Save this preference to your account.</small></span><button type="button" role="switch" aria-checked={Boolean(settings.dashboard?.[key])} className={"toggle " + (settings.dashboard?.[key] ? "on" : "")} onClick={() => toggle("dashboard", key)}><i /></button></div>)}</div>}
        {section === "Security & sessions" && <div className="settings-fields"><label>Current password<input type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} autoComplete="current-password" /></label><label>New password<input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} autoComplete="new-password" /></label><ActionButton onClick={() => void changePassword()}>{saving ? "Updating…" : "Change password"}</ActionButton><p className="settings-note">Guest accounts do not have a password. Create an account to use password management.</p></div>}
        {section === "Privacy & data" && <div className="preference-list"><div><span><strong>Export workspace data</strong><small>Download your notes, chat list, documents metadata and settings as JSON.</small></span><ActionButton secondary onClick={() => void exportWorkspace()}>Export</ActionButton></div><p className="settings-note">The export contains saved text and metadata returned by the API. Uploaded file binaries are not included.</p></div>}
        {section === "AI providers" && <div className="preference-list"><div><span><strong>Default AI tier</strong><small>Provider availability depends on the server configuration.</small></span><select value={settings.ai_settings?.model || models?.selected || "auto"} onChange={async e => { const model = e.target.value; try { await apiRequest("/api/ai/model", { method: "PUT", body: JSON.stringify({ model }) }); await saveCategory("ai_settings", { ...settings.ai_settings, model }); } catch (err) { setError(err instanceof Error ? err.message : "Could not update AI provider."); } }}><option value="auto">Auto</option><option value="default">Default</option><option value="pro">Pro</option><option value="pro_max">Pro Max</option></select></div>{models?.providers?.map((provider: any) => <div key={provider.id}><span><strong>{provider.label || provider.name || provider.id}</strong><small>{provider.configured ? "Configured on server" : "Not configured on server"}</small></span><span>{provider.configured ? "Available" : "Unavailable"}</span></div>)}</div>}
        {section === "Notifications" && <div className="preference-list">{[["email","Email notifications"],["reminders","Study reminders"],["dailyGoal","Daily goal reminders"]].map(([key,label]) => <div key={key}><span><strong>{label}</strong><small>Manage this notification preference.</small></span><button type="button" role="switch" aria-checked={Boolean(settings.notifications?.[key])} className={"toggle " + (settings.notifications?.[key] ? "on" : "")} onClick={() => toggle("notifications", key)}><i /></button></div>)}</div>}
      </div>
    </div>
  </div>;
}
function EmptyState({ icon, title, copy, action }: { icon: ReactNode; title: string; copy: string; action?: ReactNode }) { return <div className="empty-state"><span>{icon}</span><h2>{title}</h2><p>{copy}</p>{action}</div>; }

export default function Page() {
  const [route, setRouteState] = useState<Route>("overview"); const [collapsed, setCollapsed] = useState(false); const [mobileOpen, setMobileOpen] = useState(false);
  useEffect(() => { setRouteState(routeFromPath(window.location.pathname)); const onPop = () => setRouteState(routeFromPath(window.location.pathname)); window.addEventListener("popstate", onPop); return () => window.removeEventListener("popstate", onPop); }, []);
  const setRoute = (next: Route) => { window.history.pushState({}, "", pathFor(next)); setRouteState(next); window.scrollTo({ top: 0, behavior: "smooth" }); };
  useEffect(() => {
    try { setCollapsed(localStorage.getItem("notely-sidebar-collapsed") === "true"); } catch { /* Storage can be unavailable in private contexts. */ }
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = !!target && (target.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(target.tagName));
      if (event.key === "Escape") { setMobileOpen(false); return; }
      if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === "k") { event.preventDefault(); setRoute("search"); }
      if (key === "n" && !typing) { event.preventDefault(); setRoute("notes"); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
  useEffect(() => {
    try { localStorage.setItem("notely-sidebar-collapsed", String(collapsed)); } catch { /* Keep the control usable without storage. */ }
  }, [collapsed]);
  const titles: Partial<Record<Route, string>> = { overview: "Overview", notes: "My Notes", documents: "Documents", favorites: "Favorites", archive: "Archive", trash: "Trash", tools: "Study Tools", quiz: "Quiz Generator", flashcards: "Flashcards", roadmap: "Study Roadmap", mindmap: "Mind Maps", planner: "Revision Planner", summarizer: "Text Summarizer", homework: "Homework Helper", search: "Search", settings: "Settings" };
  let content: ReactNode = <Overview setRoute={setRoute} />;
  if (route === "notes") content = <Notes setRoute={setRoute} />; else if (["favorites","archive","trash"].includes(route)) content = <Notes setRoute={setRoute} filter={route as "favorites" | "archive" | "trash"} />; else if (route === "documents") content = <Documents setRoute={setRoute} />; else if (route === "tools") content = <Tools setRoute={setRoute} />; else if (["quiz","flashcards","roadmap","mindmap","planner"].includes(route)) content = <ToolDetail route={route} setRoute={setRoute} />; else if (route === "search") content = <SearchScreen setRoute={setRoute} />; else if (route === "settings") content = <SettingsScreen />;
  return <div className="workspace"><Sidebar route={route} setRoute={setRoute} collapsed={collapsed} setCollapsed={setCollapsed} mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} /><main className="workspace-main"><Header title={titles[route] || "Workspace"} setRoute={setRoute} onMenu={() => setMobileOpen(true)} />{content}</main><FloatingAssistant context={titles[route] || "Workspace"} /></div>;
}
