/* =====================================================================
   Notely  -  chat.js  (AI chat interface with streaming)
   ===================================================================== */



const state = {
  chats: [],
  currentId: null,
  streaming: false,
  model: 'auto',
  providers: [],
  // --- Streaming control (prevents overlapping streams + safe cancel) ---
  controller: null,      // AbortController for the in-flight fetch
  activeBody: null,      // DOM node of the LATEST assistant message body
  streamChatId: null,    // chat id the current stream belongs to
};

const el = {
  list: document.getElementById('chatList'),
  messages: document.getElementById('messages'),
  input: document.getElementById('input'),
  send: document.getElementById('sendBtn'),
  title: document.getElementById('chatTitle'),
  newBtn: document.getElementById('newChatBtn'),
  delBtn: document.getElementById('deleteBtn'),
  dlBtn: document.getElementById('downloadBtn'),
  side: document.getElementById('chatSide'),
  burger: document.getElementById('chatBurger'),
  overlay: document.getElementById('chatOverlay'),
  modelSelect: document.getElementById('modelSelect'),
  modelDot: document.getElementById('modelDot'),
};

/* ---------- Model selector ---------- */
async function loadModels() {
  if (!el.modelSelect) return;
  try {
    const data = await SS.api('/api/ai/models');
    const selected = ['default', 'pro', 'pro_max'].includes(data.selected) ? data.selected : 'default';
    state.model = selected;
    state.providers = data.providers || [];
    el.modelSelect.value = selected;
    updateModelDot();
    // Disable unavailable product tiers without exposing implementation details.
    state.providers.forEach((p) => {
      const opt = el.modelSelect.querySelector(`option[value="${p.id}"]`);
      if (opt && !p.configured) { opt.disabled = true; opt.textContent += ' (off)'; }
    });
  } catch { /* non-critical */ }
}

function updateModelDot() {
  if (!el.modelDot) return;
  const anyOn = state.providers.some((p) => p.id === state.model && p.configured);
  el.modelDot.classList.toggle('off', !anyOn);
}

async function saveModel(model) {
  state.model = model;
  updateModelDot();
  try {
    await SS.api('/api/ai/model', { method: 'PUT', body: { model } });
    const label = ({ default: 'Notely', pro: 'Notely Pro', pro_max: 'Notely Pro Max' })[model] || 'Notely';
    SS.toast(`${label} is ready.`);
  } catch (err) { SS.toast(err.message, 'error'); }
}

/* ---------- Markdown ---------- */
marked.setOptions({
  breaks: true,
  gfm: true,
  highlight(code, lang) {
    try {
      if (lang && hljs.getLanguage(lang)) return hljs.highlight(code, { language: lang }).value;
      return hljs.highlightAuto(code).value;
    } catch { return code; }
  },
});

function renderMarkdown(text) {
  const html = DOMPurify.sanitize(marked.parse(text || ''));
  const wrap = document.createElement('div');
  wrap.innerHTML = html;
  // Enhance code blocks with a header + copy button.
  wrap.querySelectorAll('pre').forEach((pre) => {
    const codeEl = pre.querySelector('code');
    const lang = (codeEl && [...codeEl.classList].find((c) => c.startsWith('language-')) || '').replace('language-', '') || 'code';
    const block = document.createElement('div');
    block.className = 'code-block';
    const head = document.createElement('div');
    head.className = 'code-head';
    head.innerHTML = `<span>${lang}</span><button class="copy-btn"><i class="fas fa-copy"></i> Copy</button>`;
    pre.parentNode.insertBefore(block, pre);
    block.appendChild(head);
    block.appendChild(pre);
    head.querySelector('.copy-btn').addEventListener('click', () => {
      navigator.clipboard.writeText(codeEl ? codeEl.textContent : pre.textContent);
      head.querySelector('.copy-btn').innerHTML = '<i class="fas fa-check"></i> Copied';
      setTimeout(() => (head.querySelector('.copy-btn').innerHTML = '<i class="fas fa-copy"></i> Copy'), 1600);
    });
  });
  return wrap;
}

/* ---------- Render helpers ---------- */
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function userInitial() {
  try {
    const user = (window.SS && typeof SS.getUser === 'function')
      ? SS.getUser()
      : JSON.parse(localStorage.getItem('ss_user') || '{}');
    const name = (user && user.name) || 'U';
    return String(name).trim().charAt(0).toUpperCase() || 'U';
  } catch {
    return 'U';
  }
}

function showEmptyState() {
  if (!el.messages) return;
  if (el.title) el.title.textContent = 'Notely';
  el.messages.innerHTML = `
    <div class="chat-empty">
      <div>
        <div class="big"><img src="/assets/logo.png" alt="Notely Logo" class="logo-img" /></div>
        <h2>How can I help you study today?</h2>
        <p>Ask a question, request an explanation, or pick a starter below.</p>
        <div class="suggest-grid">
          <button class="suggest" data-q="Explain photosynthesis in simple terms with an analogy."><b>📘 Explain a concept</b><span>Photosynthesis</span></button>
          <button class="suggest" data-q="Give me 5 practice questions on the Pythagorean theorem with answers."><b>✍️ Practice questions</b><span>Pythagorean theorem</span></button>
          <button class="suggest" data-q="Write a Python function that checks if a string is a palindrome, with comments."><b>💻 Help me code</b><span>Palindrome checker in Python</span></button>
          <button class="suggest" data-q="Summarise the causes of World War 1 in bullet points."><b>📝 Summarise</b><span>Causes of World War 1</span></button>
        </div>
      </div>
    </div>`;
  el.messages.querySelectorAll('.suggest').forEach((b) => {
    b.addEventListener('click', () => {
      el.input.value = b.dataset.q;
      sendMessage();
    });
  });
}

function ensureStream() {
  let stream = el.messages.querySelector('.msg-stream');
  if (!stream) {
    el.messages.innerHTML = '<div class="msg-stream"></div>';
    stream = el.messages.querySelector('.msg-stream');
  }
  return stream;
}

function appendMessage(role, content) {
  const stream = ensureStream();
  const msg = document.createElement('div');
  msg.className = `msg ${role}`;
  const avatar = role === 'user'
    ? escapeHtml(userInitial())
    : '<img src="/assets/logo.png" alt="Notely Logo" class="logo-img" />';
  msg.innerHTML = `
    <div class="avatar">${avatar}</div>
    <div class="bubble"><div class="role">${role === 'user' ? 'You' : 'Notely'}</div><div class="body"></div></div>`;
  const body = msg.querySelector('.body');
  if (role === 'assistant') body.appendChild(renderMarkdown(content));
  else body.textContent = content;
  stream.appendChild(msg);
  scrollToBottom();
  return body;
}

function scrollToBottom() {
  if (el.messages) el.messages.scrollTop = el.messages.scrollHeight;
}

/* ---------- Chat list ---------- */
async function loadChats() {
  try {
    const data = await SS.api('/api/chats');
    state.chats = data.chats || [];
    renderChatList();
  } catch (err) {
    SS.toast(err.message, 'error');
  }
}

function renderChatList() {
  if (!el.list) return;
  if (!state.chats.length) {
    el.list.innerHTML = '<div class="empty" style="padding:1.5rem 1rem;color:var(--text-dim);font-size:.88rem;text-align:center;">No chats yet.<br>Start a new one above.</div>';
    return;
  }
  el.list.innerHTML = state.chats.map((c) => `
    <div class="chat-list-item ${c.id === state.currentId ? 'active' : ''}" data-id="${c.id}">
      <i class="fas fa-comment ci"></i>
      <span class="t">${escapeHtml(c.title)}</span>
      <button class="del" data-del="${c.id}" title="Delete"><i class="fas fa-trash"></i></button>
    </div>`).join('');

  el.list.querySelectorAll('.chat-list-item').forEach((item) => {
    item.addEventListener('click', (e) => {
      if (e.target.closest('[data-del]')) return;
      openChat(parseInt(item.dataset.id, 10));
      closeMobileSidebar();
    });
  });
  el.list.querySelectorAll('[data-del]').forEach((b) => {
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteChat(parseInt(b.dataset.del, 10));
    });
  });
}

/* ---------- Open / create / delete ---------- */
async function openChat(id) {
  // Switching chats while a stream is running would orphan the stream; stop it.
  if (state.streaming && state.streamChatId !== id) {
    await cancelActiveStream('navigated-away');
  }
  try {
    const data = await SS.api(`/api/chats/${id}`);
    state.currentId = id;
    if (el.title) el.title.textContent = data.chat.title;
    renderChatList();
    if (!data.messages || !data.messages.length) { showEmptyState(); return; }
    if (el.messages) el.messages.innerHTML = '<div class="msg-stream"></div>';
    data.messages.forEach((m) => appendMessage(m.role, m.content));
    scrollToBottom();
    history.replaceState(null, '', `/chat?id=${id}`);
  } catch (err) {
    SS.toast(err.message, 'error');
  }
}

async function newChat() {
  try {
    const data = await SS.api('/api/chats', { method: 'POST', body: {} });
    state.chats.unshift(data.chat);
    state.currentId = data.chat.id;
    if (el.title) el.title.textContent = data.chat.title;
    showEmptyState();
    renderChatList();
    history.replaceState(null, '', `/chat?id=${data.chat.id}`);
    if (el.input) el.input.focus();
  } catch (err) {
    SS.toast(err.message, 'error');
  }
}

async function deleteChat(id) {
  if (!confirm('Delete this chat permanently?')) return;
  try {
    await SS.api(`/api/chats/${id}`, { method: 'DELETE' });
    state.chats = state.chats.filter((c) => c.id !== id);
    if (state.currentId === id) {
      state.currentId = null;
      if (state.chats.length) openChat(state.chats[0].id);
      else { showEmptyState(); history.replaceState(null, '', '/chat.html'); }
    }
    renderChatList();
    SS.toast('Chat deleted.');
  } catch (err) {
    SS.toast(err.message, 'error');
  }
}

/* ---------- Stop / cancel the active stream ----------
   Guarantees only one active stream client-side too: we abort the in-flight
   fetch AND tell the server to cancel the job, so partial output is kept and
   no zombie stream keeps writing to the latest assistant message. */
async function cancelActiveStream(reason = 'user') {
  const chatId = state.streamChatId;
  if (state.controller) {
    try { state.controller.abort(); } catch { /* noop */ }
  }
  // Reflect the stopped state immediately so the Stop button feels responsive
  // (the stream's own `finally` performs the full cleanup once it unwinds).
  if (reason === 'user') setStreamingUI(false);
  if (chatId != null) {
    // Best-effort server-side cancel (idempotent).
    try { await SS.api(`/api/chats/${chatId}/cancel`, { method: 'POST', body: {} }); }
    catch { /* non-critical */ }
  }
}

/* Toggle the composer button between "send" and "stop" states. */
function setStreamingUI(on) {
  state.streaming = on;
  if (!el.send) return;
  if (on) {
    el.send.classList.add('streaming');
    el.send.title = 'Stop generating';
    el.send.innerHTML = '<i class="fas fa-stop"></i>';
  } else {
    el.send.classList.remove('streaming');
    el.send.title = 'Send';
    el.send.innerHTML = '<i class="fas fa-paper-plane"></i>';
  }
  el.send.disabled = false;
}

/* ---------- Send + stream ----------
   Single, audited implementation:
     - Guarantees only ONE active stream (cancels any prior stream first).
     - Uses one AbortController and cleans it up in `finally`, even on errors,
       so there are no leaked readers/controllers (no memory leaks).
     - Parses SSE frames with a single buffer (handles partial frames split
       across network chunks) and flushes a trailing partial frame at EOF.
     - Handles every backend event: start, provider, token, cancelled, error,
       done — plus empty-response and network-failure cases.
     - Never freezes the UI: rendering happens incrementally and the Stop
       button toggles immediately via setStreamingUI(). */
async function sendMessage() {
  // If a stream is already running, the Send button acts as a Stop button.
  if (state.streaming) {
    await cancelActiveStream('user');
    return;
  }

  const text = (el.input && el.input.value || '').trim();
  if (!text) return;

  // Make sure we have a chat to post into.
  if (!state.currentId) {
    await newChat();
    if (!state.currentId) return;
  }

  // Defensive: abort any lingering stream before starting a new one.
  await cancelActiveStream('superseded');

  el.input.value = '';
  autoGrow();
  appendMessage('user', text);

  const body = appendMessage('assistant', '');
  body.innerHTML = '<div class="typing"><span></span><span></span><span></span></div>';

  const controller = new AbortController();
  state.controller = controller;
  state.activeBody = body;
  state.streamChatId = state.currentId;
  setStreamingUI(true);

  let full = '';
  let firstToken = true;
  let cancelled = false;
  let hadError = false;
  let reader = null;

  /* Apply a single decoded SSE frame to the UI. */
  const handleFrame = (frame) => {
    for (const line of frame.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const payload = trimmed.slice(5).trim();
      if (!payload) continue;

      let obj;
      try { obj = JSON.parse(payload); } catch { continue; }

      switch (obj.event) {
        case 'provider':
          // Provider/model routing is intentionally invisible to users.
          break;
        case 'token': {
          if (firstToken) { body.innerHTML = ''; firstToken = false; }
          full += obj.token || '';
          body.innerHTML = '';
          body.appendChild(renderMarkdown(full));
          scrollToBottom();
          break;
        }
        case 'cancelled':
          cancelled = true;
          break;
        case 'error': {
          hadError = true;
          const msg = friendlyError(obj.error || {});
          body.innerHTML = '';
          body.appendChild(renderMarkdown((full ? full + '\n\n' : '') + msg));
          break;
        }
        case 'start':
        case 'done':
        default:
          break;
      }
    }
  };

  try {
    // Route streaming through the shared API client so deployments where the
    // static frontend and backend live on different origins still work. The
    // wrapper attaches the JWT, applies the configured API base, and performs
    // its one-time session refresh on 401 responses.
    const res = await SS.api(`/api/chats/${state.currentId}/stream`, {
      method: 'POST',
      auth: true,
      raw: true,
      body: { content: text, model: state.model },
      signal: controller.signal,
    });

    if (!res.ok || !res.body) throw new Error('Streaming failed. Please try again.');

    reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Split on SSE frame boundary; keep the trailing partial in `buffer`.
      const frames = buffer.split('\n\n');
      buffer = frames.pop() || '';
      for (const frame of frames) handleFrame(frame);
    }

    // Flush any final frame that wasn't terminated by a blank line.
    buffer += decoder.decode();
    if (buffer.trim()) handleFrame(buffer);

    // Empty-response / cancellation messaging.
    if (cancelled && !full.trim()) {
      body.innerHTML = '';
      body.appendChild(renderMarkdown('⏹️ Generation stopped.'));
    } else if (!cancelled && !hadError && !full.trim()) {
      body.innerHTML = '';
      body.appendChild(renderMarkdown('Notely isn\'t responding right now.\n\nPlease try again in a moment.'));
    }

    refreshTitle();
  } catch (err) {
    if (err && err.name === 'AbortError') {
      // Intentional abort (Stop button / superseded). Preserve partial output.
      if (!full.trim()) {
        body.innerHTML = '';
        body.appendChild(renderMarkdown('⏹️ Generation stopped.'));
      }
    } else {
      body.innerHTML = '';
      body.appendChild(renderMarkdown('Notely isn\'t responding right now.\n\nPlease try again in a moment.'));
    }
  } finally {
    // Release the reader to avoid leaking the underlying stream.
    if (reader) { try { reader.cancel(); } catch { /* noop */ } }
    // Only reset UI/state if THIS stream is still the active one
    // (a superseding stream may already have taken over).
    if (state.controller === controller) {
      state.controller = null;
      state.activeBody = null;
      state.streamChatId = null;
      setStreamingUI(false);
      if (el.input) el.input.focus();
    }
  }
}

/* Map a structured backend error to a user-friendly sentence. */
function friendlyError(e) {
  const type = (e && e.type) || 'error';
  switch (type) {
    case 'timeout':
    case 'network':
    case 'http':
    case 'auth':
    case 'provider_error':
    case 'invalid_response':
    case 'unavailable':
      return 'Notely isn\'t responding right now.\n\nPlease try again in a moment.';
    case 'not_configured':
      return 'Notely is getting ready. Please try again in a moment.';
    default:
      return 'Notely isn\'t responding right now.\n\nPlease try again in a moment.';
  }
}

async function refreshTitle() {
  try {
    const data = await SS.api('/api/chats');
    state.chats = data.chats || [];
    const cur = state.chats.find((c) => c.id === state.currentId);
    if (cur) el.title.textContent = cur.title;
    renderChatList();
  } catch { /* non-critical */ }
}

/* ---------- Download chat ---------- */
async function downloadChat() {
  if (!state.currentId) return SS.toast('Open a chat first.', 'error');
  try {
    const data = await SS.api(`/api/chats/${state.currentId}`);
    let md = `# ${data.chat.title}\n\n_Exported from Notely_\n\n`;
    data.messages.forEach((m) => {
      md += `## ${m.role === 'user' ? '🧑 You' : '<img src="/assets/logo.png" alt="Notely Logo" class="logo-img" /> Notely'}\n\n${m.content}\n\n---\n\n`;
    });
    const blob = new Blob([md], { type: 'text/markdown' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${data.chat.title.replace(/[^a-z0-9]+/gi, '_').slice(0, 40) || 'chat'}.md`;
    a.click();
    URL.revokeObjectURL(a.href);
    SS.toast('Chat downloaded.');
  } catch (err) {
    SS.toast(err.message, 'error');
  }
}

/* ---------- textarea auto-grow ---------- */
function autoGrow() {
  if (!el.input) return;
  el.input.style.height = 'auto';
  el.input.style.height = Math.min(el.input.scrollHeight, 180) + 'px';
}

function openMobileSidebar() {
  if (el.side) el.side.classList.add('open');
  if (el.overlay) el.overlay.classList.add('show');
}
function closeMobileSidebar() {
  if (el.side) el.side.classList.remove('open');
  if (el.overlay) el.overlay.classList.remove('show');
}
function toggleMobileSidebar() {
  if (el.side && el.side.classList.contains('open')) closeMobileSidebar();
  else openMobileSidebar();
}

/* ---------- Events ----------
   Every binding is null-guarded so a single missing DOM node can never throw
   and break the whole chat script. */
if (el.send) el.send.addEventListener('click', sendMessage);

if (el.input) {
  el.input.addEventListener('input', autoGrow);
  el.input.addEventListener('keydown', (e) => {
    // Enter sends; Shift+Enter inserts a newline (default behaviour).
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      sendMessage();
    }
  });
}

if (el.newBtn) el.newBtn.addEventListener('click', newChat);
if (el.delBtn) el.delBtn.addEventListener('click', () => { if (state.currentId) deleteChat(state.currentId); });
if (el.dlBtn) el.dlBtn.addEventListener('click', downloadChat);
if (el.burger) el.burger.addEventListener('click', toggleMobileSidebar);
if (el.overlay) el.overlay.addEventListener('click', closeMobileSidebar);
// ESC closes the mobile conversation drawer.
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && el.side && el.side.classList.contains('open')) closeMobileSidebar();
});
if (el.modelSelect) el.modelSelect.addEventListener('change', (e) => saveModel(e.target.value));

/* ---------- Boot ---------- */
(async function boot() {
  // The chat UI needs at least the messages container to function.
  if (!el.messages) return;
  try {
    await loadModels();
    await loadChats();
    const params = new URLSearchParams(location.search);
    const prompt = (params.get('prompt') || '').trim().slice(0, 2000);
    const id = parseInt(params.get('id'), 10);
    if (prompt) {
      await newChat();
      if (el.input) { el.input.value = prompt; autoGrow(); await sendMessage(); }
    } else if (id && state.chats.some((c) => c.id === id)) openChat(id);
    else if (state.chats.length) openChat(state.chats[0].id);
    else showEmptyState();
  } catch (err) {
    console.error('Chat boot failed:', err);
    showEmptyState();
  }
})();
