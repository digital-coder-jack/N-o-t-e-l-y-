/* Shared Notely theme control for the landing page and workspace. */
(function () {
  'use strict';
  var root = document.documentElement;
  var storageKey = 'notely-theme';
  var legacyKey = 'ss_theme';
  var media = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

  function readPreference() {
    try {
      var saved = localStorage.getItem(storageKey);
      if (saved === 'light' || saved === 'dark' || saved === 'system') return saved;
      var legacy = localStorage.getItem(legacyKey);
      if (legacy === 'light' || legacy === 'dark') return legacy;
    } catch (error) {}
    return 'system';
  }

  function resolveTheme(preference) {
    return preference === 'system' ? (media && media.matches ? 'dark' : 'light') : preference;
  }

  function applyTheme(theme) {
    root.setAttribute('data-theme', theme);
    root.style.colorScheme = theme;
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#060c1c' : '#f5f7ff');
    document.querySelectorAll('[data-notely-theme-toggle]').forEach(function (button) {
      var next = theme === 'dark' ? 'light' : 'dark';
      button.setAttribute('aria-label', 'Switch to ' + next + ' theme');
      button.setAttribute('title', 'Switch to ' + next + ' theme (Shift+T)');
      button.setAttribute('aria-pressed', theme === 'dark' ? 'true' : 'false');
    });
  }

  var preference = readPreference();
  var current = resolveTheme(preference);
  // Respect the pre-paint script's choice while ensuring older pages are initialized.
  if (root.getAttribute('data-theme') !== 'light' && root.getAttribute('data-theme') !== 'dark') applyTheme(current);
  else current = root.getAttribute('data-theme');

  function pointFor(button) {
    if (!button || !button.getBoundingClientRect) return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    var rect = button.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }

  function persist(theme) {
    preference = theme;
    current = theme;
    try { localStorage.setItem(storageKey, theme); localStorage.setItem(legacyKey, theme); } catch (error) {}
  }

  function toggle(button) {
    var next = current === 'dark' ? 'light' : 'dark';
    var point = pointFor(button);
    root.style.setProperty('--notely-theme-x', point.x + 'px');
    root.style.setProperty('--notely-theme-y', point.y + 'px');
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      applyTheme(next);
      persist(next);
      return;
    }
    if (typeof document.startViewTransition === 'function') {
      var transition = document.startViewTransition(function () { applyTheme(next); });
      persist(next);
      transition.finished.catch(function () {});
      return;
    }
    var oldTheme = current;
    var reveal = document.createElement('div');
    reveal.className = 'notely-theme-fallback';
    reveal.style.setProperty('--notely-theme-x', point.x + 'px');
    reveal.style.setProperty('--notely-theme-y', point.y + 'px');
    reveal.style.setProperty('--notely-reveal-color', next === 'dark' ? '#060c1c' : '#f5f7ff');
    document.body.appendChild(reveal);
    reveal.addEventListener('animationend', function () {
      applyTheme(next);
      persist(next);
      reveal.remove();
    }, { once: true });
    // If animations are disabled between checks, do not leave an overlay behind.
    window.setTimeout(function () {
      if (reveal.isConnected) {
        applyTheme(next);
        persist(next);
        reveal.remove();
      }
    }, 750);
  }

  function bind() {
    applyTheme(current);
  }

  document.addEventListener('click', function (event) {
    var button = event.target && event.target.closest ? event.target.closest('[data-notely-theme-toggle]') : null;
    if (button) toggle(button);
  });

  function setPreference(value) {
    preference = value === 'light' || value === 'dark' || value === 'system' ? value : 'system';
    try {
      localStorage.setItem(storageKey, preference);
      if (preference === 'system') localStorage.removeItem(legacyKey);
      else localStorage.setItem(legacyKey, preference);
    } catch (error) {}
    current = resolveTheme(preference);
    applyTheme(current);
  }

  window.NotelyTheme = {
    bind: bind,
    getPreference: function () { return preference; },
    hasPreference: function () {
      try { return localStorage.getItem(storageKey) !== null || localStorage.getItem(legacyKey) !== null; }
      catch (error) { return false; }
    },
    setPreference: setPreference
  };

  document.addEventListener('keydown', function (event) {
    if (event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey && event.key.toLowerCase() === 't') {
      var active = document.activeElement;
      if (active && /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName)) return;
      event.preventDefault();
      toggle(document.querySelector('[data-notely-theme-toggle]'));
    }
  });

  if (media && media.addEventListener) {
    media.addEventListener('change', function (event) {
      if (preference === 'system') { current = event.matches ? 'dark' : 'light'; applyTheme(current); }
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();
})();