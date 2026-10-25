/* Shared Notely theme controller: the root element is the only theme source of truth. */
(function () {
  'use strict';
  var root = document.documentElement;
  var storageKey = 'notely-theme';
  var legacyKey = 'ss_theme';
  var media = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  var reducedMotion = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;

  function readPreference() {
    try {
      var value = localStorage.getItem(storageKey);
      if (value === 'light' || value === 'dark' || value === 'system') return value;
      value = localStorage.getItem(legacyKey);
      if (value === 'light' || value === 'dark') return value;
    } catch (error) {}
    return 'system';
  }
  var preference = readPreference();
  function resolveTheme(value) {
    return value === 'system' ? (media && media.matches ? 'dark' : 'light') : value;
  }
  var current = root.getAttribute('data-theme');
  if (current !== 'light' && current !== 'dark') current = resolveTheme(preference);

  function updateMeta(theme) {
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#060c1c' : '#f5f7ff');
  }
  function applyTheme(theme) {
    root.setAttribute('data-theme', theme);
    root.style.colorScheme = theme;
    current = theme;
    updateMeta(theme);
    document.querySelectorAll('[data-notely-theme-toggle]').forEach(function (button) {
      var next = theme === 'dark' ? 'light' : 'dark';
      button.setAttribute('aria-label', 'Switch to ' + next + ' theme');
      button.setAttribute('title', 'Switch to ' + next + ' theme (Shift+T)');
      button.setAttribute('aria-pressed', theme === 'dark' ? 'true' : 'false');
    });
  }
  function persist(value) {
    preference = value;
    try {
      localStorage.setItem(storageKey, value);
      if (value === 'light' || value === 'dark') localStorage.setItem(legacyKey, value);
      else localStorage.removeItem(legacyKey);
    } catch (error) {}
  }
  function buttonPoint(button) {
    if (!button || !button.getBoundingClientRect) return { x: innerWidth / 2, y: innerHeight / 2 };
    var rect = button.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }
  function endRadius(point) {
    return Math.hypot(Math.max(point.x, innerWidth - point.x), Math.max(point.y, innerHeight - point.y));
  }
  function fallbackReveal(theme, point) {
    var overlay = document.createElement('div');
    overlay.className = 'notely-theme-fallback';
    overlay.style.setProperty('--notely-theme-x', point.x + 'px');
    overlay.style.setProperty('--notely-theme-y', point.y + 'px');
    overlay.style.setProperty('--notely-reveal-color', theme === 'dark' ? '#060c1c' : '#f5f7ff');
    overlay.style.setProperty('--notely-reveal-radius', endRadius(point) + 'px');
    document.body.appendChild(overlay);
    var animation;
    try {
      animation = overlay.animate([
        { clipPath: 'circle(0px at ' + point.x + 'px ' + point.y + 'px)' },
        { clipPath: 'circle(' + endRadius(point) + 'px at ' + point.x + 'px ' + point.y + 'px)' }
      ], { duration: 600, easing: 'ease-in-out', fill: 'forwards' });
    } catch (error) {}
    var finish = function () { applyTheme(theme); overlay.remove(); };
    if (animation) animation.finished.then(finish, finish);
    else { applyTheme(theme); overlay.remove(); }
  }
  function changeTheme(theme, button, animate) {
    var point = buttonPoint(button);
    var shouldAnimate = animate !== false && !(reducedMotion && reducedMotion.matches);
    root.style.setProperty('--notely-theme-x', point.x + 'px');
    root.style.setProperty('--notely-theme-y', point.y + 'px');
    if (!shouldAnimate) { applyTheme(theme); return Promise.resolve(); }
    if (typeof document.startViewTransition === 'function') {
      var transition;
      try {
        transition = document.startViewTransition(function () { applyTheme(theme); });
      } catch (error) {
        fallbackReveal(theme, point);
        return Promise.resolve();
      }
      return transition.ready.then(function () {
        var radius = endRadius(point);
        var newView = document.documentElement;
        return newView.animate(
          { clipPath: ['circle(0px at ' + point.x + 'px ' + point.y + 'px)', 'circle(' + radius + 'px at ' + point.x + 'px ' + point.y + 'px)'] },
          { duration: 600, easing: 'ease-in-out', pseudoElement: '::view-transition-new(root)' }
        ).finished.catch(function () {});
      }).catch(function () {
        // The theme callback still applies if the browser rejects a transition animation.
      });
    }
    fallbackReveal(theme, point);
    return Promise.resolve();
  }
  function toggle(button) {
    var next = current === 'dark' ? 'light' : 'dark';
    persist(next);
    changeTheme(next, button, true);
  }
  function bind() {
    applyTheme(current);
  }
  document.addEventListener('click', function (event) {
    var button = event.target && event.target.closest ? event.target.closest('[data-notely-theme-toggle]') : null;
    if (!button) return;
    event.preventDefault();
    toggle(button);
  });
  document.addEventListener('keydown', function (event) {
    if (event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey && event.key.toLowerCase() === 't') {
      var active = document.activeElement;
      if (active && /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName)) return;
      event.preventDefault();
      toggle(document.querySelector('[data-notely-theme-toggle]'));
    }
  });
  if (media && media.addEventListener) media.addEventListener('change', function (event) {
    if (preference === 'system') { applyTheme(event.matches ? 'dark' : 'light'); }
  });
  window.NotelyTheme = {
    getPreference: function () { return preference; },
    getTheme: function () { return current; },
    hasPreference: function () { return preference !== 'system'; },
    setPreference: function (value, button, animate) {
      if (['system', 'light', 'dark'].indexOf(value) < 0) return;
      persist(value);
      changeTheme(resolveTheme(value), button, animate !== false);
    },
    setTheme: function (theme, button, animate) {
      if (theme !== 'light' && theme !== 'dark') return;
      persist(theme);
      changeTheme(theme, button, animate !== false);
    },
    bind: bind
  };
  applyTheme(current);
})();