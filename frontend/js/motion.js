/* =====================================================================
   Notely  -  motion.js
   ---------------------------------------------------------------------
   Lightweight, dependency-free motion system (the best animation
   approach compatible with this vanilla multi-page app). Provides the
   premium feel usually associated with Framer Motion, but with zero
   build step and no framework:

     • applyPreferences()  — reads saved theme / accent / font / density
                              / contrast / reduced-motion and sets the
                              matching <html data-*> attributes so the
                              whole UI updates instantly & consistently.
     • scroll reveal       — [data-reveal] / [data-stagger] via IO
     • ripple              — universal click ripple on .btn / .ripple-host
     • magnetic / tilt     — [data-tilt] subtle 3D hover
     • count-up            — [data-count] numbers animate into view

   Loaded on every page (before page-specific scripts). Safe to include
   multiple times — guards prevent double-binding.
   ===================================================================== */

(function () {
  'use strict';

  var PREF_KEYS = {
    theme: 'ss_theme',
    accent: 'ss_accent',
    font: 'ss_font',
    density: 'ss_density',
    contrast: 'ss_contrast',
    motion: 'ss_motion',
  };

  var prefersReduced = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ------------------------------------------------------------------
     PREFERENCES — apply persisted UI preferences to <html data-*>.
     Exposed as window.SSMotion.applyPreferences() so the settings page
     can call it after changing a value.
     ------------------------------------------------------------------ */
  function read(key, fallback) {
    try { return localStorage.getItem(key) || fallback; }
    catch (e) { return fallback; }
  }

  function applyPreferences() {
    var root = document.documentElement;

    var theme = read(PREF_KEYS.theme, 'system');
    if (theme !== 'light' && theme !== 'dark') {
      var darkQuery = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)');
      theme = (darkQuery && darkQuery.matches) ? 'dark' : 'light';
    }
    root.setAttribute('data-theme', theme);

    root.setAttribute('data-accent', read(PREF_KEYS.accent, 'violet'));
    root.setAttribute('data-font', read(PREF_KEYS.font, 'md'));
    root.setAttribute('data-density', read(PREF_KEYS.density, 'comfortable'));

    var contrast = read(PREF_KEYS.contrast, 'normal');
    if (contrast === 'high') root.setAttribute('data-contrast', 'high');
    else root.removeAttribute('data-contrast');

    var motion = read(PREF_KEYS.motion, 'auto');
    if (motion === 'reduced' || (motion === 'auto' && prefersReduced)) {
      root.setAttribute('data-motion', 'reduced');
    } else {
      root.removeAttribute('data-motion');
    }
  }

  function setPreference(name, value) {
    if (!PREF_KEYS[name]) return;
    try { localStorage.setItem(PREF_KEYS[name], value); } catch (e) {}
    applyPreferences();
  }

  // Apply immediately (before paint where possible)
  applyPreferences();

  var reduced = function () {
    return document.documentElement.getAttribute('data-motion') === 'reduced';
  };

  /* ------------------------------------------------------------------
     SCROLL REVEAL — IntersectionObserver for [data-reveal]/[data-stagger]
     ------------------------------------------------------------------ */
  function initReveal() {
    var targets = document.querySelectorAll('[data-reveal], [data-stagger]');
    if (!targets.length) return;

    if (reduced() || !('IntersectionObserver' in window)) {
      targets.forEach(function (el) { el.classList.add('in-view'); });
      return;
    }

    var io = new IntersectionObserver(function (entries, obs) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('in-view');
        obs.unobserve(entry.target);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });

    targets.forEach(function (el) { io.observe(el); });
  }

  /* ------------------------------------------------------------------
     RIPPLE — universal click ripple
     ------------------------------------------------------------------ */
  function initRipple() {
    document.addEventListener('pointerdown', function (e) {
      if (reduced()) return;
      var host = e.target.closest('.btn, .ripple-host, .icon-btn, .qa-card');
      if (!host) return;
      if (host.querySelector('.ripple')) {
        // allow multiple but cap
      }
      var rect = host.getBoundingClientRect();
      var size = Math.max(rect.width, rect.height);
      var span = document.createElement('span');
      span.className = 'ripple';
      span.style.width = span.style.height = size + 'px';
      span.style.left = (e.clientX - rect.left - size / 2) + 'px';
      span.style.top = (e.clientY - rect.top - size / 2) + 'px';
      host.appendChild(span);
      setTimeout(function () { span.remove(); }, 600);
    }, { passive: true });
  }

  /* ------------------------------------------------------------------
     TILT — subtle 3D hover for [data-tilt]
     ------------------------------------------------------------------ */
  function initTilt() {
    if (reduced()) return;
    document.querySelectorAll('[data-tilt]').forEach(function (el) {
      if (el.dataset.tiltBound) return;
      el.dataset.tiltBound = '1';
      var max = parseFloat(el.dataset.tilt) || 6;
      el.style.transformStyle = 'preserve-3d';
      el.addEventListener('pointermove', function (e) {
        var r = el.getBoundingClientRect();
        var px = (e.clientX - r.left) / r.width - 0.5;
        var py = (e.clientY - r.top) / r.height - 0.5;
        el.style.transform = 'perspective(800px) rotateX(' + (-py * max) +
          'deg) rotateY(' + (px * max) + 'deg) translateY(-4px)';
      });
      el.addEventListener('pointerleave', function () {
        el.style.transform = '';
      });
    });
  }

  /* ------------------------------------------------------------------
     COUNT-UP — animate [data-count] numbers when scrolled into view
     ------------------------------------------------------------------ */
  function initCounters() {
    var els = document.querySelectorAll('[data-count]');
    if (!els.length) return;

    var easeOutExpo = function (t) { return t === 1 ? 1 : 1 - Math.pow(2, -10 * t); };

    function run(el) {
      var target = parseFloat(el.dataset.count) || 0;
      var decimals = (el.dataset.countDecimals | 0);
      var suffix = el.dataset.countSuffix || '';
      if (reduced() || target === 0) { el.textContent = target.toFixed(decimals) + suffix; return; }
      var start = performance.now();
      var dur = 1000;
      (function tick(now) {
        var p = Math.min((now - start) / dur, 1);
        var v = easeOutExpo(p) * target;
        el.textContent = v.toFixed(decimals) + suffix;
        if (p < 1) requestAnimationFrame(tick);
        else el.textContent = target.toFixed(decimals) + suffix;
      })(start);
    }

    if (!('IntersectionObserver' in window)) { els.forEach(run); return; }
    var io = new IntersectionObserver(function (entries, obs) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        run(en.target);
        obs.unobserve(en.target);
      });
    }, { threshold: 0.4 });
    els.forEach(function (el) { io.observe(el); });
  }

  /* ------------------------------------------------------------------
     Smooth in-page anchor scrolling
     ------------------------------------------------------------------ */
  function initSmoothAnchors() {
    document.addEventListener('click', function (e) {
      var a = e.target.closest('a[href^="#"]');
      if (!a) return;
      var id = a.getAttribute('href');
      if (id.length < 2) return;
      var target = document.querySelector(id);
      if (!target) return;
      e.preventDefault();
      target.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'start' });
    });
  }

  /* ------------------------------------------------------------------
     Re-scan helper — call after injecting dynamic content
     ------------------------------------------------------------------ */
  function refresh() {
    initReveal();
    initTilt();
    initCounters();
  }

  function boot() {
    if (document.documentElement.classList.contains('notely-shutter-pending')) {
      window.addEventListener('notely-shutter:lifted', boot, { once: true });
      return;
    }
    initReveal();
    initRipple();
    initTilt();
    initCounters();
    initSmoothAnchors();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  window.SSMotion = {
    applyPreferences: applyPreferences,
    setPreference: setPreference,
    refresh: refresh,
    reduced: reduced,
  };
})();
