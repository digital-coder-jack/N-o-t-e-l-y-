/* =====================================================================
   Notely - dashboard.js
   Same backend (/api/stats, /api/topics, /api/ai/status). Client-side only.
   ===================================================================== */

const WEEKLY_GOAL = 50;          // messages per week = 100%
let pendingTab = null;           // tool chosen before a topic was typed
let chartRef = null;

document.addEventListener('DOMContentLoaded', () => {
  const user = (window.SS && SS.getUser && SS.getUser()) || {};
  const nameEl = document.getElementById('userName');
  if (nameEl) nameEl.textContent = (user.name || 'Welcome back').split(' ')[0] || 'Welcome back';

  setSubtitle();
  if (user.is_guest) showGuestBanner();

  initTopicLauncher();
  renderWorkspaceCards();
  renderTrending();
  initShortcuts();

  loadDashboard();
  loadMyTopics();
  loadProvidersMini();
});

/* Reset the "Building…" button when returning via the back button */
window.addEventListener('pageshow', () => {
  const btn = document.getElementById('topicGo');
  if (btn) btn.innerHTML = 'Start learning <i class="fas fa-arrow-right" aria-hidden="true"></i>';
});

function setSubtitle() {
  const el = document.getElementById('dashSubtitle');
  if (!el) return;
  const h = new Date().getHours();
  const part = h < 12 ? 'morning' : h < 18 ? 'afternoon' : 'evening';
  let ob = null;
  try { ob = JSON.parse(localStorage.getItem('ainb_onboarding') || 'null'); } catch (e) {}
  el.textContent = ob && ob.goal
    ? `Good ${part}. Let's make progress on “${ob.goal}” today.`
    : `Good ${part}. Here's your learning activity at a glance.`;
}

async function loadDashboard() {
  try {
    const s = await SS.api('/api/stats');
    renderStats(s);
    renderContinue(s);
    renderFirstRun(s);
    renderRecent(s.recent_chats || []);
    renderRecentNotes(s.recent_notes || []);
    renderChart(s.daily_activity || []);
    renderProgress(s);
    renderAiUsage(s);
    renderAchievements(s);
  } catch (err) {
    showLoadError(err);
  }
}

function renderContinue(s) {
  const card = document.getElementById('continueCard');
  const action = document.getElementById('continueAction');
  const description = document.getElementById('continueDescription');
  if (!card || !action || !description) return;
  const chat = (s.recent_chats || [])[0];
  const note = (s.recent_notes || [])[0];
  if (!chat && !note) { card.hidden = true; return; }
  const item = chat || note;
  const isChat = !!chat;
  card.hidden = false;
  action.href = isChat ? '/dashboard?openAssistant=1' : '/tools#notes';
  action.innerHTML = 'Continue <i class="fas fa-arrow-right" aria-hidden="true"></i>';
  description.textContent = isChat ? ((item.title || 'Your latest chat') + ' · Open Notely Assistant') : ('Note on ' + (item.topic || 'your latest topic'));
}

function renderFirstRun(s) {
  const firstRun = document.getElementById('firstRun');
  if (!firstRun) return;
  const hasData = (s.total_chats || 0) + (s.total_messages || 0) + (s.notes || 0) + (s.quizzes || 0) + (s.topics || 0) > 0;
  firstRun.hidden = hasData;
  document.querySelectorAll('.first-run-steps li').forEach((step) => {
    const complete = step.dataset.step === 'chat' ? (s.total_chats || 0) > 0 : step.dataset.step === 'note' ? (s.notes || 0) > 0 : (s.quizzes || 0) > 0;
    step.classList.toggle('complete', complete);
    step.setAttribute('aria-label', complete ? step.textContent.trim() + ', complete' : step.textContent.trim());
  });
  ['statsGrid', 'trending-topics'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('first-run-secondary', !hasData);
  });
}

/* Replace endless skeletons with a clear message and a retry button */
function showLoadError(err) {
  const msg = (err && err.message) || 'Something went wrong.';
  ['statsGrid', 'recentNotes', 'recentChats', 'achievements'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.setAttribute('aria-busy', 'false');
  });
  const grid = document.getElementById('statsGrid');
  if (grid) {
    grid.innerHTML = `
      <div class="load-error glass" role="alert">
        <i class="fas fa-triangle-exclamation" aria-hidden="true"></i>
        <div><b>Couldn't load your dashboard</b><p>${escapeHtml(msg)} Check your connection and try again.</p></div>
        <button type="button" class="btn small" id="retryLoad"><i class="fas fa-rotate-right" aria-hidden="true"></i> Try again</button>
      </div>`;
    document.getElementById('retryLoad').addEventListener('click', () => {
      grid.setAttribute('aria-busy', 'true');
      grid.innerHTML = '<div class="stat-card glass"><div class="ic skeleton"></div><b class="skeleton">&nbsp;</b><span class="skeleton">&nbsp;</span></div>'.repeat(4);
      loadDashboard();
    });
  }
  ['recentNotes', 'recentChats', 'achievements'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = '';
  });
}

/* =====================================================================
   Topic launcher, workspace tools, popular topics, continue learning
   ===================================================================== */
function openTopic(title, tab) {
  window.location.href = '/topic?t=' + encodeURIComponent(title) + (tab ? '#' + tab : '');
}

function setLaunchHint(text) {
  const hint = document.getElementById('launchHint');
  if (!hint) return;
  if (!text) { hint.hidden = true; hint.textContent = ''; return; }
  hint.hidden = false;
  hint.innerHTML = `<span>${escapeHtml(text)}</span> <button type="button" class="ll-clear">Clear</button>`;
  hint.querySelector('.ll-clear').addEventListener('click', () => { pendingTab = null; setLaunchHint(''); });
}

function initTopicLauncher() {
  const form = document.getElementById('topicForm');
  const input = document.getElementById('topicInput');
  if (!form || !input) return;
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const t = input.value.trim();
    if (!t) { SS.toast('Type a topic to start learning', 'error'); input.focus(); return; }
    const btn = document.getElementById('topicGo');
    if (btn) btn.innerHTML = '<i class="fas fa-spinner fa-spin" aria-hidden="true"></i> Opening…';
    openTopic(t, pendingTab);
  });
}

function initShortcuts() {
  document.addEventListener('keydown', (e) => {
    if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
    const tag = (document.activeElement && document.activeElement.tagName) || '';
    if (/INPUT|TEXTAREA|SELECT/.test(tag) || (document.activeElement && document.activeElement.isContentEditable)) return;
    e.preventDefault();
    const input = document.getElementById('topicInput');
    if (input) input.focus();
  });
}

function renderWorkspaceCards() {
  const grid = document.getElementById('workspaceGrid');
  if (!grid) return;
  const tools = [
    { tab: 'notes',      h: 190, ic: 'fa-note-sticky',       t: 'AI Notes',      d: 'Study notes with definitions, examples and a revision summary.' },
    { tab: 'summary',    h: 215, ic: 'fa-align-left',         t: 'AI Summary',    d: 'Structured summary: history, how it works, pros and cons, FAQ.' },
    { tab: 'mindmap',    h: 260, ic: 'fa-diagram-project',    t: 'AI Mind Map',   d: 'Zoom, pan and expand nodes to explore the topic.' },
    { tab: 'roadmap',    h: 150, ic: 'fa-route',              t: 'AI Roadmap',    d: 'Beginner to expert path with projects and progress tracking.' },
    { tab: 'quiz',       h: 25,  ic: 'fa-clipboard-question', t: 'AI Quiz',       d: 'Multiple choice, true/false and fill-in-the-blank at 4 levels.' },
    { tab: 'flashcards', h: 45,  ic: 'fa-layer-group',        t: 'AI Flashcards', d: 'Flip cards with bookmarks, built for fast revision.' },
    { tab: 'chat',       h: 290, ic: 'fa-comments',           t: 'AI Chat',       d: 'A tutor that knows the topic you are studying.' },
    { tab: 'practice',   h: 350, ic: 'fa-dumbbell',           t: 'AI Practice',   d: 'Exercises, assignments, mini projects and coding challenges.' },
    { tab: 'compare',    h: 175, ic: 'fa-scale-balanced',     t: 'AI Compare',    d: 'Side-by-side comparison with any other topic.' },
    { tab: 'timeline',   h: 10,  ic: 'fa-timeline',           t: 'AI Timeline',   d: 'Key events and how the topic evolved over time.' },
  ];
  grid.innerHTML = tools.map((c) => `
    <button type="button" class="ws-card" data-tab="${c.tab}" style="--ws-h:${c.h}">
      <span class="ws-ic"><i class="fas ${c.ic}" aria-hidden="true"></i></span>
      <b>${c.t}</b><p>${c.d}</p>
      <span class="ws-launch">Open <i class="fas fa-arrow-right" aria-hidden="true"></i></span>
    </button>`).join('');
  grid.classList.add('in-view');

  grid.querySelectorAll('.ws-card').forEach((card) => {
    card.addEventListener('click', () => {
      const input = document.getElementById('topicInput');
      const t = (input && input.value.trim()) || '';
      if (t) { openTopic(t, card.dataset.tab); return; }
      // No topic yet: remember the tool, ask for a topic, and launch it on submit.
      pendingTab = card.dataset.tab;
      setLaunchHint(`${card.querySelector('b').textContent} selected. Enter a topic and press Enter to open it.`);
      if (input) {
        input.focus({ preventScroll: true });
        document.getElementById('learn-launcher').scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });
  });
  if (window.SSMotion) SSMotion.refresh();
}

function renderTrending() {
  const grid = document.getElementById('trendingGrid');
  if (!grid) return;
  const topics = [
    { t: 'Artificial Intelligence', e: '🤖', g: ['#6366f1', '#8b5cf6'], s: 'Tech' },
    { t: 'Machine Learning',        e: '🧠', g: ['#8b5cf6', '#d946ef'], s: 'Tech' },
    { t: 'Quantum Computing',       e: '⚛️', g: ['#06b6d4', '#3b82f6'], s: 'Science' },
    { t: 'Blockchain',              e: '⛓️', g: ['#f59e0b', '#f97316'], s: 'Tech' },
    { t: 'Cybersecurity',           e: '🔐', g: ['#10b981', '#059669'], s: 'Tech' },
    { t: 'Physics',                 e: '🌌', g: ['#3b82f6', '#6366f1'], s: 'Science' },
    { t: 'Mathematics',             e: '➗', g: ['#ec4899', '#f43f5e'], s: 'Science' },
    { t: 'Biology',                 e: '🧬', g: ['#22c55e', '#84cc16'], s: 'Science' },
    { t: 'History',                 e: '🏛️', g: ['#a16207', '#ca8a04'], s: 'Humanities' },
  ];
  grid.innerHTML = topics.map((x) => `
    <button type="button" class="trend-card" data-topic="${escapeHtml(x.t)}"
      style="background:linear-gradient(135deg, ${x.g[0]}, ${x.g[1]})">
      <span class="tr-emoji" aria-hidden="true">${x.e}</span><b>${escapeHtml(x.t)}</b><span>${x.s}</span>
    </button>`).join('');
  grid.classList.add('in-view');
  grid.querySelectorAll('.trend-card').forEach((c) =>
    c.addEventListener('click', () => openTopic(c.dataset.topic, pendingTab)));
  if (window.SSMotion) SSMotion.refresh();
}

async function loadMyTopics() {
  const section = document.getElementById('myTopicsSection');
  const grid = document.getElementById('myTopics');
  if (!section || !grid) return;
  try {
    const res = await SS.api('/api/topics');
    const topics = (res.topics || []).slice().sort((a, b) => (b.pinned || 0) - (a.pinned || 0)).slice(0, 8);
    if (!topics.length) return;
    section.hidden = false;
    grid.innerHTML = topics.map((t) => {
      const n = (t.sections || []).length;
      return `
      <a class="topic-card" href="/topic?id=${encodeURIComponent(t.id)}">
        <span class="tc-emoji" aria-hidden="true">${escapeHtml(t.emoji || '📚')}</span>
        <span class="tc-meta"><b>${escapeHtml(t.title)}</b>
          <span>${n} section${n === 1 ? '' : 's'} · ${formatDate(t.updated_at)}</span>
        </span>
        <span class="tc-flags">${t.pinned ? '<i class="fas fa-thumbtack tc-pin" title="Pinned"></i>' : ''}${t.favorite ? '<i class="fas fa-star" title="Favorite"></i>' : ''}</span>
      </a>`;
    }).join('');
    grid.classList.add('in-view');
    if (window.SSMotion) SSMotion.refresh();
  } catch { /* topics are optional on first load */ }
}

/* =====================================================================
   Recent notes (pin / favorite / duplicate / share / delete)
   ===================================================================== */
function renderRecentNotes(notes) {
  const box = document.getElementById('recentNotes');
  if (!box) return;
  box.setAttribute('aria-busy', 'false');
  if (!notes.length) {
    box.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon"><i class="fas fa-note-sticky" aria-hidden="true"></i></div>
        <h4>No notes yet</h4>
        <p>Open a topic and generate AI notes to see them here.</p>
        <a href="/tools#notes" class="btn small"><i class="fas fa-plus" aria-hidden="true"></i> Create a note</a>
      </div>`;
    return;
  }
  notes = notes.slice().sort((a, b) => (b.pinned || 0) - (a.pinned || 0));
  box.innerHTML = notes.map((n) => `
    <div class="note-item" data-id="${escapeHtml(n.id)}">
      <a class="ni-main" href="/tools#notes"><b>${escapeHtml(n.topic)}</b><small>${formatDate(n.created_at)}</small></a>
      <span class="ni-flags">${n.pinned ? '<i class="fas fa-thumbtack" title="Pinned"></i>' : ''}${n.favorite ? '<i class="fas fa-star" title="Favorite"></i>' : ''}</span>
      <div class="note-actions">
        <button type="button" data-act="pin" title="${n.pinned ? 'Unpin' : 'Pin'}" aria-label="${n.pinned ? 'Unpin' : 'Pin'} note" aria-pressed="${!!n.pinned}"><i class="fas fa-thumbtack" aria-hidden="true"></i></button>
        <button type="button" data-act="fav" title="${n.favorite ? 'Remove favorite' : 'Favorite'}" aria-label="${n.favorite ? 'Remove favorite' : 'Favorite'} note" aria-pressed="${!!n.favorite}"><i class="${n.favorite ? 'fas' : 'far'} fa-star" aria-hidden="true"></i></button>
        <button type="button" data-act="dup" title="Duplicate" aria-label="Duplicate note"><i class="fas fa-copy" aria-hidden="true"></i></button>
        <button type="button" data-act="share" title="Share" aria-label="Share note"><i class="fas fa-share-nodes" aria-hidden="true"></i></button>
        <button type="button" data-act="del" class="danger" title="Delete" aria-label="Delete note"><i class="fas fa-trash" aria-hidden="true"></i></button>
      </div>
    </div>`).join('');

  box.querySelectorAll('.note-item').forEach((item) => {
    const id = item.dataset.id;
    const note = notes.find((n) => String(n.id) === id);
    item.querySelectorAll('.note-actions button').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const act = btn.dataset.act;
        try {
          if (act === 'pin') {
            await SS.api('/api/tools/notes/' + id, { method: 'PATCH', body: { pinned: !note.pinned } });
            note.pinned = note.pinned ? 0 : 1;
            SS.toast(note.pinned ? 'Note pinned' : 'Note unpinned');
            renderRecentNotes(notes);
          } else if (act === 'fav') {
            await SS.api('/api/tools/notes/' + id, { method: 'PATCH', body: { favorite: !note.favorite } });
            note.favorite = note.favorite ? 0 : 1;
            SS.toast(note.favorite ? 'Added to favorites' : 'Removed from favorites');
            renderRecentNotes(notes);
          } else if (act === 'dup') {
            await SS.api('/api/tools/notes/' + id + '/duplicate', { method: 'POST' });
            SS.toast('Note duplicated');
            refreshNotes();
          } else if (act === 'share') {
            const text = '📝 ' + note.topic + ' — study note from Notely';
            if (navigator.share) await navigator.share({ title: note.topic, text });
            else { await navigator.clipboard.writeText(text + '\n' + location.origin); SS.toast('Share text copied'); }
          } else if (act === 'del') {
            if (!confirm('Delete “' + note.topic + '”? This can\'t be undone.')) return;
            await SS.api('/api/tools/notes/' + id, { method: 'DELETE' });
            SS.toast('Note deleted');
            const idx = notes.indexOf(note);
            if (idx > -1) notes.splice(idx, 1);
            item.classList.add('removing');
            setTimeout(() => renderRecentNotes(notes), 220);
          }
        } catch (err) {
          if (err && err.name === 'AbortError') return; // share sheet dismissed
          SS.toast(err.message || 'Action failed', 'error');
        }
      });
    });
  });
}

async function refreshNotes() {
  try {
    const s = await SS.api('/api/stats');
    renderRecentNotes(s.recent_notes || []);
  } catch { /* ignore */ }
}

/* =====================================================================
   Stats, recent chats, progress, AI usage, achievements
   ===================================================================== */
function renderStats(s) {
  const grid = document.getElementById('statsGrid');
  if (!grid) return;
  const cards = [
    { ic: 'fa-book-open-reader',    n: s.topics || 0,                      label: 'Topics started',  href: '#myTopicsSection' },
    { ic: 'fa-note-sticky',         n: (s.notes || 0) + (s.quizzes || 0),  label: 'Notes & quizzes', href: '/tools#notes' },
    { ic: 'fa-wand-magic-sparkles', n: s.ai_generations || s.ai_responses || 0, label: 'AI generations', href: '#aiUsage' },
    { ic: 'fa-comments',            n: s.total_chats || 0,                 label: 'Total chats',     href: '/dashboard?openAssistant=1' },
  ];
  grid.innerHTML = cards.map((c) => `
    <a class="stat-card glass" href="${c.href}">
      <div class="ic"><i class="fas ${c.ic}" aria-hidden="true"></i></div>
      <b data-count="${c.n}">${c.n}</b>
      <span>${c.label}</span>
    </a>`).join('');
  grid.setAttribute('aria-busy', 'false');
  grid.classList.add('in-view');
  if (window.SSMotion) SSMotion.refresh();
}

function renderRecent(chats) {
  const box = document.getElementById('recentChats');
  if (!box) return;
  box.setAttribute('aria-busy', 'false');
  if (!chats.length) {
    box.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon"><i class="fas fa-comment-dots" aria-hidden="true"></i></div>
        <h4>No chats yet</h4>
        <p>Ask the AI tutor your first question.</p>
        <a href="/dashboard?openAssistant=1" class="btn small"><i class="fas fa-plus" aria-hidden="true"></i> New chat</a>
      </div>`;
    return;
  }
  box.innerHTML = chats.map((c) => `
    <a class="recent-item" href="/dashboard?openAssistant=1&chatId=${encodeURIComponent(c.id)}">
      <span class="ttl"><i class="fas fa-comment" aria-hidden="true"></i> <b>${escapeHtml(c.title)}</b></span>
      <small>${formatDate(c.updated_at)}</small>
    </a>`).join('');
}

/* Last 7 days keys (today first), matching the server's date keys */
function lastDays(n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    out.push({ d, key: d.toISOString().slice(0, 10) });
  }
  return out;
}

function renderProgress(s) {
  const map = {};
  (s.daily_activity || []).forEach((a) => (map[a.day] = a.count));
  let weekMsgs = 0, streak = 0, broken = false;
  lastDays(7).forEach(({ key }, i) => {
    const cnt = map[key] || 0;
    weekMsgs += cnt;
    if (cnt > 0 && !broken) streak++;
    else if (cnt === 0 && i > 0) broken = true;   // today with 0 doesn't break the streak
  });

  const pct = Math.min(100, Math.round((weekMsgs / WEEKLY_GOAL) * 100));
  const ring = document.getElementById('progressRing');
  const pctEl = document.getElementById('progressPct');
  if (ring) {
    ring.setAttribute('aria-valuenow', pct);
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setTimeout(() => ring.style.setProperty('--p', pct), reduce ? 0 : 300);
  }
  if (pctEl) { pctEl.dataset.count = pct; pctEl.textContent = pct + '%'; }

  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set('streakVal', streak + (streak === 1 ? ' day' : ' days'));
  set('weekMsgs', weekMsgs + (weekMsgs === 1 ? ' msg' : ' msgs'));
  const left = Math.max(0, WEEKLY_GOAL - weekMsgs);
  set('goalLeft', left === 0 ? 'Goal reached 🎉' : left + (left === 1 ? ' msg' : ' msgs'));
  if (window.SSMotion) SSMotion.refresh();
}

function renderAiUsage(s) {
  const responses = s.ai_generations || s.ai_responses || 0;
  const total = Math.max(responses, s.total_messages || 0, 1);
  const pct = Math.min(100, Math.round((responses / total) * 100));
  const bar = document.getElementById('aiResponsesBar');
  const num = document.getElementById('aiResponses');
  if (num) { num.dataset.count = responses; num.textContent = responses; }
  if (bar) setTimeout(() => { bar.style.width = pct + '%'; }, 250);
  if (window.SSMotion) SSMotion.refresh();
}

async function loadProvidersMini() {
  const box = document.getElementById('aiProvidersMini');
  if (!box) return;
  try {
    const data = await SS.api('/api/ai/status', { auth: false });
    box.innerHTML = (data.providers || []).map((p) => {
      const label = escapeHtml(p.label || 'Notely');
      return `<span class="model-badge" title="${label}"><span class="model-dot ${p.configured ? '' : 'off'}"></span>${label}${p.configured ? '' : ' (temporarily unavailable)'}</span>`;
    }).join(' ');
    if (!box.innerHTML) box.innerHTML = '<span class="model-badge">Notely</span>';
  } catch {
    box.innerHTML = '<span class="model-badge"><span class="model-dot off"></span> AI status unavailable</span> <button type="button" class="text-button" id="retryProviders">Retry</button>';
    const retry = document.getElementById('retryProviders');
    if (retry) retry.addEventListener('click', loadProvidersMini, { once: true });
  }
}

function renderAchievements(s) {
  const box = document.getElementById('achievements');
  if (!box) return;
  const chats = s.total_chats || 0;
  const msgs = s.total_messages || 0;
  const notes = (s.notes || 0) + (s.quizzes || 0);
  const ach = [
    { ic: 'fa-rocket',     title: 'First steps',      desc: 'Start your first chat',    cur: chats, max: 1 },
    { ic: 'fa-comments',   title: 'Conversationalist', desc: 'Send 25 messages',         cur: msgs,  max: 25 },
    { ic: 'fa-note-sticky', title: 'Note taker',      desc: 'Create 5 notes or quizzes', cur: notes, max: 5 },
    { ic: 'fa-fire',       title: 'On a roll',        desc: 'Reach 100 messages',       cur: msgs,  max: 100 },
  ];
  box.innerHTML = ach.map((a) => {
    const done = a.cur >= a.max;
    const pct = Math.min(100, Math.round((a.cur / a.max) * 100));
    return `
    <div class="ach-card glass ${done ? 'unlocked' : 'locked'}">
      <span class="ach-ic"><i class="fas ${done ? a.ic : 'fa-lock'}" aria-hidden="true"></i></span>
      <div class="ach-body">
        <b>${a.title}</b><span>${a.desc}</span>
        <div class="ach-bar" role="progressbar" aria-label="${a.title} progress" aria-valuemin="0" aria-valuemax="${a.max}" aria-valuenow="${Math.min(a.cur, a.max)}"><span style="width:${pct}%"></span></div>
        <small>${done ? 'Unlocked' : Math.min(a.cur, a.max) + ' / ' + a.max}</small>
      </div>
    </div>`;
  }).join('');
  box.setAttribute('aria-busy', 'false');
  box.classList.add('in-view');
  if (window.SSMotion) SSMotion.refresh();
}

/* =====================================================================
   Chart
   ===================================================================== */
function renderChart(activity) {
  const canvas = document.getElementById('activityChart');
  if (!canvas || typeof Chart === 'undefined') return;

  const map = {};
  activity.forEach((a) => (map[a.day] = a.count));
  const days = [], counts = [];
  lastDays(7).reverse().forEach(({ d, key }) => {
    days.push(d.toLocaleDateString(undefined, { weekday: 'short' }));
    counts.push(map[key] || 0);
  });
  const total = counts.reduce((a, b) => a + b, 0);

  const chip = document.getElementById('activityTotal');
  if (chip) chip.textContent = total ? `${total} msg${total === 1 ? '' : 's'} · 7 days` : 'Last 7 days';
  const empty = document.getElementById('chartEmpty');
  if (empty) empty.hidden = total > 0;

  const styles = getComputedStyle(document.documentElement);
  const accent = (styles.getPropertyValue('--accent') || '#7c83ff').trim();
  const textDim = (styles.getPropertyValue('--text-dim') || '#9aa3c7').trim();
  const gridCol = (styles.getPropertyValue('--border') || 'rgba(255,255,255,0.08)').trim();

  const ctx = canvas.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, 240);
  grad.addColorStop(0, withAlpha(accent, 0.4));
  grad.addColorStop(1, withAlpha(accent, 0.01));

  if (chartRef) chartRef.destroy();
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  chartRef = new Chart(ctx, {
    type: 'line',
    data: {
      labels: days,
      datasets: [{
        label: 'Messages', data: counts, fill: true, backgroundColor: grad,
        borderColor: accent, borderWidth: 3, tension: 0.4,
        pointBackgroundColor: accent, pointBorderColor: 'transparent',
        pointRadius: 4, pointHoverRadius: 7,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: reduce ? false : { duration: 700, easing: 'easeOutQuart' },
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(14,16,32,0.92)', borderColor: 'rgba(255,255,255,0.1)',
          borderWidth: 1, padding: 10, cornerRadius: 10, displayColors: false,
        },
      },
      scales: {
        x: { grid: { color: gridCol }, ticks: { color: textDim } },
        y: { beginAtZero: true, suggestedMax: 5, grid: { color: gridCol }, ticks: { color: textDim, precision: 0 } },
      },
    },
  });
}

function withAlpha(color, alpha) {
  if (color.startsWith('hsl')) return color.replace(')', ` / ${alpha})`);
  const c = color.replace('#', '');
  if (c.length === 6) {
    return `rgba(${parseInt(c.slice(0, 2), 16)},${parseInt(c.slice(2, 4), 16)},${parseInt(c.slice(4, 6), 16)},${alpha})`;
  }
  return color;
}

/* =====================================================================
   Guest banner + utils
   ===================================================================== */
function showGuestBanner() {
  const content = document.querySelector('.content');
  const topbar = content && content.querySelector('.topbar');
  if (!content || !topbar) return;
  const banner = document.createElement('div');
  banner.className = 'guest-banner glass';
  banner.innerHTML = `
    <div class="guest-banner-content">
      <div class="guest-banner-text">
        <i class="fas fa-user-secret" aria-hidden="true"></i>
        <div>
          <strong>You're using guest mode</strong>
          <p>Your chats and notes are temporary. Create a free account to keep them.</p>
        </div>
      </div>
      <a href="/signup" class="btn small primary"><i class="fas fa-user-plus" aria-hidden="true"></i> Create account</a>
    </div>`;
  content.insertBefore(banner, topbar.nextSibling);
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* "Today", "Yesterday", "3 days ago", then "Oct 12" */
function formatDate(s) {
  if (!s) return '';
  const d = new Date(String(s).replace(' ', 'T') + (/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? '' : 'Z'));
  if (isNaN(d)) return s;
  const start = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((start(new Date()) - start(d)) / 86400000);
  if (diff <= 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff < 7) return diff + ' days ago';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
