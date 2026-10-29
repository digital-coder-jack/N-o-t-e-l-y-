/* =====================================================================
   Notely  -  app.js  (shared helpers, loaded on every page)
   - API client with JWT
   - auth/session helpers
   - toasts, ripple effects, particles config, mobile nav
   ===================================================================== */

const SS = (() => {
  const TOKEN_KEY = 'ss_token';
  const USER_KEY = 'ss_user';

  /* ---------- API base URL ----------
     The frontend (Vercel) and backend (Render/Railway) live on DIFFERENT
     origins, so API calls must be prefixed with the backend's URL.
     Resolution order (first match wins):
       1. window.SS_API_BASE   — set via an inline <script> (recommended)
       2. <meta name="api-base" content="https://api.example.com">
       3. '' (empty) — same-origin (works when frontend+backend share a host)
     A trailing slash is stripped so we never produce '//api/...'. */
  function resolveApiBase() {
    let base = '';
    if (typeof window !== 'undefined' && window.SS_API_BASE) {
      base = String(window.SS_API_BASE);
    } else {
      const meta = document.querySelector('meta[name="api-base"]');
      if (meta && meta.content) base = meta.content;
    }
    return base.replace(/\/+$/, '');
  }
  const API_BASE = resolveApiBase();
  // Prefix only absolute API paths ('/api/...'); leave full URLs untouched.
  function apiUrl(path) {
    if (/^https?:\/\//i.test(path)) return path;
    return API_BASE + path;
  }

  /* ---------- session ---------- */
  function getToken() { return localStorage.getItem(TOKEN_KEY) || ''; }
  let refreshPromise = null;
  function tokenExpiry(token) {
    try {
      const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      const decoded = atob(payload + '='.repeat((4 - payload.length % 4) % 4));
      const data = JSON.parse(decoded);
      return Number(data.exp) || 0;
    } catch { return 0; }
  }
  async function refreshSessionToken() {
    const token = getToken();
    if (!token) return false;
    const response = await fetch(apiUrl('/api/auth/refresh'), {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      credentials: 'include',
      cache: 'no-store',
      body: '{}',
    });
    let data = {};
    try { data = await response.json(); } catch {}
    if (!response.ok || !data.token) {
      if (response.status === 401) {
        clearSession();
        if (!/\/(login|signup|forgot)(\.html)?$/.test(window.location.pathname)) window.location.assign('/login');
        throw new Error('Your session expired. Sign in again.');
      }
      throw new Error((data && (data.detail || data.message)) || 'Could not refresh your session.');
    }
    setSession(data.token, data.user);
    return true;
  }
  async function refreshBeforeExpiry() {
    const token = getToken();
    if (!token) return false;
    const exp = tokenExpiry(token);
    // Refresh while the JWT is still valid; expired bearer tokens cannot be
    // refreshed by the server and must return to sign-in.
    if (!exp || exp * 1000 > Date.now() + 120000) return false;
    if (!refreshPromise) {
      refreshPromise = refreshSessionToken().finally(() => { refreshPromise = null; });
    }
    return refreshPromise;
  }
  function setSession(token, user) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user || {}));
    localStorage.removeItem('notely-trial-active');
    localStorage.removeItem('notely-trial-expires');
  }
  function setTrialSession(trial) {
    if (trial && trial.device_token) localStorage.setItem('notely-trial-device', trial.device_token);
    if (trial && trial.expires_at) localStorage.setItem('notely-trial-expires', trial.expires_at);
    localStorage.setItem('notely-trial-active', '1');
  }
  function clearTrialSession() {
    localStorage.removeItem('notely-trial-active');
    localStorage.removeItem('notely-trial-expires');
  }
  function getUser() {
    try { return JSON.parse(localStorage.getItem(USER_KEY) || '{}'); }
    catch { return {}; }
  }
  function clearSession() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    // Next account gets its own onboarding check (server-side state decides).
    localStorage.removeItem('ainb_onboarded');
    clearTrialSession();
  }
  function isAuthed() { return !!getToken() || localStorage.getItem('notely-trial-active') === '1'; }
  function logout() { clearSession(); window.location.href = '/'; }

  function requireAuth() {
    if (isAuthed()) return true;
    window.location.assign('/login');
    return false;
  }

  /* ---------- API ----------
     Attaches the authenticated session when required and surfaces clean errors.
     Trial limits are enforced by the server; expired sessions require sign-in. */
  async function api(path, opts = {}) {
    const { method = 'GET', body, auth = true, raw = false, signal } = opts;
    const isRefreshCall = String(path).endsWith('/api/auth/refresh') || String(path) === '/api/auth/refresh';
    if (auth && !isRefreshCall && getToken()) {
      try { await refreshBeforeExpiry(); }
      catch (err) {
        if (err && err.message === 'Your session expired. Sign in again.') throw err;
        // A transient refresh-server error should not throw away a still-valid
        // token; the original request will decide whether it remains usable.
      }
    }

    const headers = {};
    if (body && !(body instanceof FormData)) headers['Content-Type'] = 'application/json';
    if (auth && getToken()) headers['Authorization'] = 'Bearer ' + getToken();
    const trialDevice = localStorage.getItem('notely-trial-device');
    if (trialDevice) headers['X-Notely-Device'] = trialDevice;

    let res;
    try {
      res = await fetch(apiUrl(path), {
        method,
        headers,
        credentials: 'include',
        body: body instanceof FormData ? body : (body ? JSON.stringify(body) : undefined),
        // Pass through an AbortController signal so callers (e.g. chat streaming)
        // can cancel in-flight requests safely.
        signal,
      });
    } catch (err) {
      // Re-throw genuine aborts untouched so callers can detect them.
      if (err && err.name === 'AbortError') throw err;
      throw new Error('Network error. Please check your connection and try again.');
    }

    if (res.status === 402 && res.headers.get('X-Notely-Trial-Expired') === 'true') {
      clearSession();
      if (!/\/(login|signup|forgot)(\.html)?$/.test(window.location.pathname)) window.location.assign('/signup?trial=expired');
    }

    if (res.status === 401 && auth) {
      clearSession();
      if (!/\/(login|signup|forgot)(\.html)?$/.test(window.location.pathname)) window.location.assign('/login');
      throw new Error('Your session expired. Sign in again.');
    }

    // Streaming / binary callers want the raw Response object.
    if (raw) return res;

    let data = null;
    try { data = await res.json(); } catch { /* no/empty body */ }

    if (!res.ok) {
      const msg = (data && (data.detail || data.message)) || `Request failed (${res.status})`;
      throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
    }
    return data;
  }

  /* ---------- toast ---------- */
  function toast(message, type = 'success', ms = 3800) {
    let wrap = document.getElementById('toast-wrap');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.id = 'toast-wrap';
      document.body.appendChild(wrap);
    }
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.innerHTML = `<i class="fas fa-${type === 'error' ? 'circle-exclamation' : 'circle-check'}"></i> ${message}`;
    wrap.appendChild(el);
    setTimeout(() => {
      el.style.transition = 'opacity .3s, transform .3s';
      el.style.opacity = '0';
      el.style.transform = 'translateX(40px)';
      setTimeout(() => el.remove(), 320);
    }, ms);
  }

  /* ---------- ripple ---------- */
  function attachRipples(root = document) {
    root.querySelectorAll('.btn').forEach((btn) => {
      if (btn.dataset.ripple) return;
      btn.dataset.ripple = '1';
      btn.addEventListener('click', (e) => {
        const circle = document.createElement('span');
        const d = Math.max(btn.clientWidth, btn.clientHeight);
        const rect = btn.getBoundingClientRect();
        circle.style.width = circle.style.height = d + 'px';
        circle.style.left = e.clientX - rect.left - d / 2 + 'px';
        circle.style.top = e.clientY - rect.top - d / 2 + 'px';
        circle.className = 'ripple';
        btn.appendChild(circle);
        setTimeout(() => circle.remove(), 600);
      });
    });
  }

  /* ---------- particles ---------- */
  function initParticles(id = 'particles-js') {
    if (!document.getElementById(id) || typeof particlesJS === 'undefined') return;
    const light = document.documentElement.getAttribute('data-theme') === 'light';
    const lineOpacity = light ? 0.18 : 0.25;
    const dotOpacity = light ? 0.5 : 0.45;
    particlesJS(id, {
      particles: {
        number: { value: 60, density: { enable: true, value_area: 900 } },
        color: { value: ['#6d7bff', '#a855f7', '#22d3ee'] },
        shape: { type: 'circle' },
        opacity: { value: dotOpacity, random: true },
        size: { value: 3, random: true },
        line_linked: { enable: true, distance: 150, color: '#6d7bff', opacity: lineOpacity, width: 1 },
        move: { enable: true, speed: 1.6, out_mode: 'out' },
      },
      interactivity: {
        detect_on: 'window',
        events: { onhover: { enable: true, mode: 'grab' }, onclick: { enable: true, mode: 'push' }, resize: true },
        modes: { grab: { distance: 160, line_linked: { opacity: 0.5 } }, push: { particles_nb: 3 } },
      },
      retina_detect: true,
    });
  }

  /* ---------- theme compatibility layer ---------- */
  // The newer NotelyTheme controller owns the root theme, saved preference,
  // and animated reveal. Keep this legacy SS API as a bridge for older
  // workspace controls instead of forcing every page into light mode.
  const THEME_KEY = 'notely-theme';
  const LEGACY_THEME_KEY = 'ss_theme';
  function getTheme() {
    if (window.NotelyTheme && typeof window.NotelyTheme.getTheme === 'function') {
      return window.NotelyTheme.getTheme();
    }
    try {
      const saved = localStorage.getItem(THEME_KEY) || localStorage.getItem(LEGACY_THEME_KEY);
      if (saved === 'light' || saved === 'dark') return saved;
      if (saved === 'system') {
        return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      }
    } catch { /* use the root attribute fallback */ }
    const current = document.documentElement.getAttribute('data-theme');
    return current === 'dark' ? 'dark' : 'light';
  }
  function applyTheme(theme) {
    const next = theme === 'dark' ? 'dark' : 'light';
    if (window.NotelyTheme && typeof window.NotelyTheme.setTheme === 'function') {
      window.NotelyTheme.setTheme(next, null, false);
      return next;
    }
    document.documentElement.setAttribute('data-theme', next);
    document.documentElement.style.colorScheme = next;
    try {
      localStorage.setItem(THEME_KEY, next);
      localStorage.setItem(LEGACY_THEME_KEY, next);
    } catch { /* ignore */ }
    return next;
  }
  function toggleTheme() {
    const next = getTheme() === 'dark' ? 'light' : 'dark';
    return applyTheme(next);
  }
  function initTheme() {
    if (document.querySelector('.auth-cinema')) return; // auth pages use the shared controller directly
    // Do not overwrite NotelyTheme's resolved system/user preference during boot.
    if (!window.NotelyTheme) applyTheme(getTheme());
    document.querySelectorAll('#themeToggle, .theme-toggle').forEach((btn) => {
      if (btn.dataset.bound) return;
      btn.dataset.bound = '1';
      btn.addEventListener('click', toggleTheme);
    });
  }

  /* ---------- mobile nav (hamburger) ---------- */
  function initNav() {
    const toggle = document.getElementById('navToggle');
    const links = document.getElementById('navLinks');
    const backdrop = document.getElementById('navBackdrop');
    if (!toggle || !links) return;

    const open = () => {
      links.classList.add('open');
      toggle.classList.add('active');
      toggle.setAttribute('aria-expanded', 'true');
      document.body.style.overflow = 'hidden';
      if (backdrop) backdrop.classList.add('show');
    };
    const close = () => {
      links.classList.remove('open');
      toggle.classList.remove('active');
      toggle.setAttribute('aria-expanded', 'false');
      document.body.style.overflow = '';
      if (backdrop) backdrop.classList.remove('show');
    };
    const isOpen = () => links.classList.contains('open');

    toggle.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      isOpen() ? close() : open();
    });

    // Close when a menu link/button is tapped.
    links.querySelectorAll('a, .btn').forEach((el) => {
      el.addEventListener('click', () => {
        if (isOpen()) close();
      });
    });

    // Close when tapping the backdrop or pressing Escape.
    if (backdrop) {
      backdrop.addEventListener('click', close);
    }
    
    document.addEventListener('keydown', (e) => { 
      if (e.key === 'Escape' && isOpen()) close(); 
    });

    // Reset state if the viewport grows past the mobile breakpoint.
    window.addEventListener('resize', () => { 
      if (window.innerWidth > 880 && isOpen()) close(); 
    });
  }

  /* ---------- page transitions ---------- */
  function initPageTransitions() {
    const reduceMotion = window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Page-in: fade the .app-shell (or body) up into place on load.
    if (!reduceMotion) {
      const shell = document.querySelector('.app-shell') || document.body;
      shell.style.opacity = '0';
      shell.style.transform = 'translateY(10px)';
      requestAnimationFrame(() => {
        shell.style.transition = 'opacity 0.32s var(--ease-smooth, ease), transform 0.32s var(--ease-smooth, ease)';
        shell.style.opacity = '1';
        shell.style.transform = 'translateY(0)';
      });
      // Clean up inline styles once the entrance finishes so they don't
      // interfere with later layout / animations.
      setTimeout(() => {
        shell.style.transition = '';
        shell.style.transform = '';
      }, 420);
    }

    // Intercept same-origin link clicks for a quick fade-out before navigating.
    document.addEventListener('click', (e) => {
      if (reduceMotion) return;
      const link = e.target.closest('a');
      if (!link || !link.href) return;

      // Ignore modified clicks (open in new tab / download manager, etc.)
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;

      const url = new URL(link.href, window.location.href);
      if (url.origin !== window.location.origin) return;     // External link
      if (link.getAttribute('target') === '_blank') return;  // New tab
      if (link.hasAttribute('download')) return;             // Download
      if (link.getAttribute('href') && link.getAttribute('href').startsWith('#')) return; // Pure anchor
      if (url.pathname === window.location.pathname && url.hash) return; // In-page anchor

      e.preventDefault();
      document.body.style.transition = 'opacity 0.18s ease';
      document.body.style.opacity = '0';

      setTimeout(() => {
        window.location.href = link.href;
      }, 180);
    });

    // If the page is restored from the bfcache (back/forward), reset opacity
    // so the user never lands on a blank faded-out page.
    window.addEventListener('pageshow', () => {
      document.body.style.transition = '';
      document.body.style.opacity = '';
    });
  }

  /* ---------- boot common UI ---------- */
  function initBootTransition() {
    if (document.querySelector('.auth-cinema') || document.querySelector('.ainb-boot')) return;
    const overlay = document.createElement('div');
    overlay.className = 'ainb-boot';
    overlay.setAttribute('aria-label', 'Loading Notely');
    overlay.innerHTML = '<div class="ainb-boot-card"><img src="/assets/notely-symbol.svg" alt="" /><span>Notely<small>Preparing your workspace</small></span></div>';
    document.body.prepend(overlay);
    requestAnimationFrame(() => {
      window.setTimeout(() => overlay.classList.add('is-out'), 120);
      window.setTimeout(() => overlay.remove(), 460);
    });
  }
  function boot() {
    initBootTransition();
    initTheme();
    initParticles();
    attachRipples();
    initNav();
    initPageTransitions();
    const y = document.getElementById('year');
    if (y) y.textContent = new Date().getFullYear();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  return { api, getToken, setSession, getUser, clearSession, isAuthed, logout, refreshSession: refreshSessionToken,
           setTrialSession, clearTrialSession, requireAuth, toast, attachRipples, initParticles,
           toggleTheme, getTheme, applyTheme };
})();
