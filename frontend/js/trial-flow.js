/* Notely landing entry flow: server-authoritative trial status, no-account trial, and shutter hand-off. */
(function () {
  'use strict';
  var DEVICE_KEY = 'notely-trial-device';
  var EXPIRES_KEY = 'notely-trial-expires';
  var ACTIVE_KEY = 'notely-trial-active';
  var DB_NAME = 'notely-trial-db';
  var DB_STORE = 'identity';
  var DB_KEY = 'device-token';
  var fingerprint = '';
  var status = { status: 'unknown', available: false };
  var busy = false;
  var reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var $ = function (selector, root) { return (root || document).querySelector(selector); };
  var wait = function (ms) { return new Promise(function (resolve) { window.setTimeout(resolve, ms); }); };

  function idb(mode, value) {
    return new Promise(function (resolve) {
      if (!window.indexedDB) return resolve(null);
      var request;
      try { request = indexedDB.open(DB_NAME, 1); } catch (_) { return resolve(null); }
      request.onupgradeneeded = function () {
        if (!request.result.objectStoreNames.contains(DB_STORE)) request.result.createObjectStore(DB_STORE);
      };
      request.onerror = function () { resolve(null); };
      request.onsuccess = function () {
        var database = request.result;
        try {
          var tx = database.transaction(DB_STORE, mode === 'get' ? 'readonly' : 'readwrite');
          var store = tx.objectStore(DB_STORE);
          var operation = mode === 'get' ? store.get(DB_KEY) : store.put(value, DB_KEY);
          operation.onsuccess = function () { var result = operation.result || null; database.close(); resolve(result); };
          operation.onerror = function () { database.close(); resolve(null); };
          tx.onerror = function () { database.close(); resolve(null); };
        } catch (_) { database.close(); resolve(null); }
      };
    });
  }

  async function savedDeviceToken() {
    var token = '';
    try { token = localStorage.getItem(DEVICE_KEY) || ''; } catch (_) {}
    if (!token) token = (await idb('get')) || '';
    return token;
  }

  async function saveDeviceToken(token) {
    if (!token) return;
    try { localStorage.setItem(DEVICE_KEY, token); } catch (_) {}
    await idb('put', token);
  }

  function canvasSignal() {
    try {
      var canvas = document.createElement('canvas');
      canvas.width = 260; canvas.height = 60;
      var ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return 'canvas:none';
      ctx.textBaseline = 'top';
      ctx.font = '14px "Bricolage Grotesque", Arial';
      ctx.fillStyle = '#8fe8f8'; ctx.fillRect(2, 4, 37, 19);
      ctx.fillStyle = '#1f6fb5'; ctx.fillText('Notely trial · 7 days ✦', 4, 21);
      ctx.strokeStyle = 'rgba(31,111,181,.61)'; ctx.beginPath(); ctx.arc(120, 28, 17, .1, Math.PI * 1.83); ctx.stroke();
      var pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data, sample = [];
      for (var i = 0; i < pixels.length; i += 503) sample.push(pixels[i]);
      return sample.join(',');
    } catch (_) { return 'canvas:blocked'; }
  }

  function audioSignal() {
    return new Promise(function (resolve) {
      var finished = false;
      function done(value) { if (finished) return; finished = true; resolve(value); }
      try {
        var Ctx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
        if (!Ctx) return done('audio:none');
        var ctx = new Ctx(1, 2048, 44100);
        var oscillator = ctx.createOscillator(), gain = ctx.createGain();
        oscillator.type = 'triangle'; oscillator.frequency.value = 10000;
        gain.gain.value = 0.15; oscillator.connect(gain); gain.connect(ctx.destination);
        oscillator.start(0);
        ctx.startRendering().then(function (buffer) {
          var samples = buffer.getChannelData(0), sum = 0;
          for (var i = 0; i < samples.length; i += 17) sum += Math.abs(samples[i]);
          done([ctx.sampleRate, ctx.destination.maxChannelCount, sum.toFixed(5)].join(':'));
        }).catch(function () { done('audio:blocked'); });
        window.setTimeout(function () { done('audio:timeout:' + (ctx.sampleRate || 0)); }, 450);
      } catch (_) { done('audio:blocked'); }
    });
  }

  function fontSignal() {
    try {
      var canvas = document.createElement('canvas'), ctx = canvas.getContext('2d');
      var fonts = ['Arial', 'Helvetica', 'Times New Roman', 'Courier New', 'Verdana', 'Georgia', 'Roboto', 'Inter', 'DM Sans', 'Bricolage Grotesque', 'Noto Sans', 'Liberation Sans'];
      return fonts.map(function (font) { ctx.font = '15px "' + font + '"'; return font + ':' + ctx.measureText('Notely Wm 0123').width.toFixed(2); }).join('|');
    } catch (_) { return 'fonts:blocked'; }
  }

  async function makeFingerprint() {
    try {
      if (document.fonts && document.fonts.ready) {
        await Promise.race([document.fonts.ready, wait(450)]);
      }
    } catch (_) {}
    var screenInfo = window.screen || {};
    var zone = '';
    try { zone = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (_) {}
    var language = (navigator.languages || [navigator.language || '']).join(',');
    var audio = await audioSignal();
    var data = [
      'v3', canvasSignal(), audio, fontSignal(),
      screenInfo.width || 0, screenInfo.height || 0, screenInfo.availWidth || 0, screenInfo.availHeight || 0,
      screenInfo.colorDepth || 0, window.devicePixelRatio || 1,
      zone, new Date().getTimezoneOffset(), language, navigator.platform || '',
      navigator.hardwareConcurrency || 0, navigator.deviceMemory || 0,
      navigator.maxTouchPoints || 0, navigator.webdriver === true ? 'webdriver' : 'normal'
    ];
    return data.join('||').slice(0, 3900);
  }

  async function api(path, body) {
    var headers = { 'Content-Type': 'application/json' };
    var token = await savedDeviceToken();
    if (token) headers['X-Notely-Device'] = token;
    var response = await fetch(apiUrl(path), {
      method: 'POST', headers: headers, credentials: 'include',
      cache: 'no-store', body: JSON.stringify(Object.assign({}, body || {}, {
        device_token: token || undefined,
        fingerprint: fingerprint,
        automation: navigator.webdriver === true
      }))
    });
    var data = {};
    try { data = await response.json(); } catch (_) {}
    if (!response.ok) {
      var error = new Error(data.detail || 'Notely could not check your trial. Please try again.');
      error.status = response.status; error.payload = data; throw error;
    }
    if (data.device_token) await saveDeviceToken(data.device_token);
    return data;
  }

  function apiUrl(path) {
    var base = '';
    try { base = String(window.SS_API_BASE || '').trim(); } catch (_) {}
    if (!base) {
      try { var meta = document.querySelector('meta[name="api-base"]'); if (meta && meta.content) base = meta.content.trim(); } catch (_) {}
    }
    while (base.endsWith('/')) base = base.slice(0, -1);
    return path.indexOf('https://') === 0 || path.indexOf('http://') === 0 ? path : base + path;
  }

  function setStatus(message, type) {
    var box = $('#notely-choice-status');
    if (!box) return;
    box.textContent = message || '';
    if (type) box.dataset.type = type; else box.removeAttribute('data-type');
  }

  async function refreshStatus() {
    fingerprint = await makeFingerprint();
    try {
      status = await api('/api/trial/status', {});
    } catch (error) {
      status = { status: 'unknown', available: false, error: error.message };
    }
    try {
      if (status.status === 'active') {
        localStorage.setItem(ACTIVE_KEY, '1');
        if (status.expires_at) localStorage.setItem(EXPIRES_KEY, status.expires_at);
      } else if (status.status === 'expired' || status.status === 'converted') {
        localStorage.removeItem(ACTIVE_KEY);
      } else {
        localStorage.removeItem(ACTIVE_KEY);
      }
    } catch (_) {}
    return status;
  }

  function makeButton(mode, title, detail, symbol, primary) {
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'notely-choice-option' + (primary ? ' primary' : '');
    button.dataset.choice = mode;
    var icon = document.createElement('span'); icon.className = 'choice-symbol'; icon.setAttribute('aria-hidden', 'true'); icon.textContent = symbol;
    var copy = document.createElement('span'); copy.className = 'choice-copy';
    var heading = document.createElement('span'); heading.textContent = title; copy.appendChild(heading);
    if (detail) { var small = document.createElement('small'); small.textContent = detail; copy.appendChild(small); }
    button.appendChild(icon); button.appendChild(copy);
    return button;
  }

  function getChoiceLayer() {
    var layer = $('#notely-choice-layer');
    if (layer) return layer;
    layer = document.createElement('div');
    layer.id = 'notely-choice-layer';
    layer.className = 'notely-choice-layer';
    layer.setAttribute('role', 'dialog'); layer.setAttribute('aria-modal', 'true');
    layer.setAttribute('aria-labelledby', 'notely-choice-title'); layer.setAttribute('aria-describedby', 'notely-choice-description');
    layer.innerHTML = '<section class="notely-choice-card"><button type="button" class="notely-choice-close" aria-label="Close choices">×</button><div class="notely-choice-brand"><img src="/assets/logo.png" alt="">Notely</div><span class="notely-choice-eyebrow">YOUR NEXT CHAPTER</span><h2 id="notely-choice-title">Make room to learn.</h2><p id="notely-choice-description" class="notely-choice-description">Choose how you want to enter your study space.</p><div class="notely-choice-actions" id="notely-choice-actions"></div><p class="notely-choice-status" id="notely-choice-status" role="status" aria-live="polite"></p></section>';
    layer.hidden = true;
    document.body.appendChild(layer);
    $('.notely-choice-close', layer).addEventListener('click', closeChoice);
    layer.addEventListener('click', function (event) { if (event.target === layer) closeChoice(); });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && layer.classList.contains('is-open')) closeChoice();
    });
    $('#notely-choice-actions', layer).addEventListener('click', function (event) {
      var button = event.target.closest('[data-choice]');
      if (!button || button.disabled || busy) return;
      var choice = button.dataset.choice;
      if (choice === 'trial') startOrResumeTrial();
      else if (choice === 'signup') navigateAuth('/signup');
      else if (choice === 'signin') navigateAuth('/login');
    });
    return layer;
  }

  function renderChoice() {
    var layer = getChoiceLayer();
    var actions = $('#notely-choice-actions', layer);
    var heading = $('#notely-choice-title', layer);
    var description = $('#notely-choice-description', layer);
    actions.innerHTML = '';
    heading.textContent = status.status === 'expired' ? 'Your next chapter starts here.' : 'Make room to learn.';
    description.textContent = status.status === 'expired'
      ? 'This device has already used its seven-day trial. Sign up or sign in to continue.'
      : status.status === 'active'
        ? 'Your trial is already active. Resume with your saved work and remaining time.'
        : status.status === 'converted'
          ? 'This trial is connected to an account. Sign in to continue with your saved work.'
          : 'Start with seven days of workspace access, or use your Notely account.';
    var trial;
    if (status.status === 'active') {
      var days = Math.max(1, Number(status.days_left) || 1);
      trial = makeButton('trial', 'Resume your trial', days + (days === 1 ? ' day left' : ' days left'), '↗', true);
    } else {
      trial = makeButton('trial', 'Start 7-day free trial', 'No account needed to begin', '✦', true);
    }
    if (status.status === 'expired' || status.status === 'converted') {
      trial.disabled = true;
      var small = $('small', trial);
      if (small) small.textContent = status.status === 'converted' ? 'This trial is linked to an account. Sign in to continue.' : 'Your 7-day trial has ended';
      if (status.status === 'converted') trial.title = 'Sign in to the account linked to this trial';
    } else if (status.status === 'unknown') {
      trial.disabled = true;
      $('small', trial).textContent = 'Trial status is unavailable. Check your connection and try again.';
    }
    actions.appendChild(trial);
    actions.appendChild(makeButton('signup', 'Sign up', 'Create an account with email verification', '＋', false));
    actions.appendChild(makeButton('signin', 'Sign in', 'Continue with your existing account', '→', false));
    setStatus(status.error || (status.status === 'expired' ? 'Your 7-day trial has ended.' : ''), status.error ? 'error' : '');
  }

  function openChoice() {
    var layer = getChoiceLayer();
    layer.hidden = false;
    requestAnimationFrame(function () { layer.classList.add('is-open'); });
    var close = $('.notely-choice-close', layer);
    if (close) close.focus({ preventScroll: true });
  }

  function closeChoice() {
    var layer = $('#notely-choice-layer');
    if (!layer) return;
    layer.classList.remove('is-open');
    window.setTimeout(function () { layer.hidden = true; }, reduced ? 0 : 250);
    var button = $('#getStarted');
    if (button) button.focus({ preventScroll: true });
  }

  function getShutter() {
    var overlay = $('#pre') || $('#notely-shutter');
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.id = 'notely-choice-shutter';
    overlay.className = 'notely-shutter-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML = '<div class="notely-shutter-inner"><img src="/assets/logo.png" alt=""></div>';
    document.body.appendChild(overlay);
    return overlay;
  }

  async function shutterAction(action) {
    var overlay = getShutter();
    var duration = reduced ? 120 : 600;
    overlay.style.display = 'grid';
    overlay.style.opacity = '1';
    overlay.style.willChange = 'transform, opacity';
    overlay.style.transition = 'none';
    overlay.style.transform = 'translateY(-100%)';
    if (overlay.id === 'pre') {
      var counter = $('#cnt');
      if (counter) counter.style.display = 'none';
    }
    void overlay.offsetHeight;
    overlay.style.transition = reduced ? 'opacity 120ms ease' : 'transform 600ms cubic-bezier(.76,0,.24,1), opacity 600ms ease';
    overlay.style.transform = 'translateY(0)';
    overlay.classList.add('is-covered');
    await wait(duration);
    await action();
    overlay.classList.remove('is-covered');
    overlay.style.transform = reduced ? 'none' : 'translateY(100%)';
    overlay.style.opacity = '0';
    await wait(duration);
    overlay.style.display = 'none';
    overlay.style.transition = '';
    overlay.style.transform = 'translateY(-100%)';
    overlay.style.opacity = '1';
    overlay.style.willChange = '';
  }

  async function showChoicesWithShutter() {
    if (busy) return;
    busy = true;
    var start = $('#getStarted');
    if (start) start.disabled = true;
    await shutterAction(async function () {
      await refreshStatus();
      renderChoice();
      openChoice();
    });
    if (start) start.disabled = false;
    busy = false;
  }

  async function startOrResumeTrial() {
    if (busy) return;
    busy = true;
    setStatus('Checking this device and preparing your trial…');
    var buttons = document.querySelectorAll('[data-choice]');
    buttons.forEach(function (button) { button.disabled = true; });
    try {
      var data = await api('/api/trial/start', {});
      status = data;
      try {
        localStorage.setItem(ACTIVE_KEY, '1');
        if (data.expires_at) localStorage.setItem(EXPIRES_KEY, data.expires_at);
      } catch (_) {}
      closeChoice();
      showLoading(function () {
        if (window.NotelyShutter && typeof window.NotelyShutter.navigate === 'function') window.NotelyShutter.navigate('/dashboard');
        else {
          try { sessionStorage.setItem('notely-shutter-next', '1'); } catch (_) {}
          window.location.assign('/dashboard');
        }
      });
    } catch (error) {
      if (error.status === 402) {
        status = { status: 'expired', available: false, error: 'Your 7-day trial has ended. Sign up or sign in to continue.' };
        renderChoice();
      } else {
        setStatus(error.message || 'Could not start the trial. Please try again.', 'error');
      }
      buttons.forEach(function (button) { button.disabled = false; });
      var trialButton = $('[data-choice="trial"]');
      if (trialButton && (status.status === 'expired' || status.status === 'converted' || status.status === 'unknown')) trialButton.disabled = true;
    } finally {
      busy = false;
    }
  }

  async function navigateAuth(url) {
    if (busy) return;
    busy = true;
    closeChoice();
    if (window.NotelyShutter && typeof window.NotelyShutter.navigate === 'function') {
      window.NotelyShutter.navigate(url);
    } else {
      try { sessionStorage.setItem('notely-shutter-next', '1'); } catch (_) {}
      window.location.assign(url);
    }
  }

  function showLoading(done) {
    var layer = document.createElement('section');
    layer.className = 'notely-loading-screen';
    layer.setAttribute('role', 'status'); layer.setAttribute('aria-live', 'polite');
    var card = document.createElement('div'); card.className = 'notely-loading-card';
    var particles = document.createElement('div'); particles.className = 'notely-loading-particles';
    for (var i = 0; i < 18; i++) {
      var dot = document.createElement('i'); dot.style.left = (5 + i * 5.2) + '%'; dot.style.top = (12 + ((i * 23) % 72)) + '%'; particles.appendChild(dot);
    }
    var logoWrap = document.createElement('div'); logoWrap.className = 'notely-loading-logo';
    var logo = document.createElement('img'); logo.src = '/assets/logo.png'; logo.alt = 'Notely'; logoWrap.appendChild(logo);
    var orbit = document.createElement('span'); orbit.className = 'notely-loading-orbit'; logoWrap.appendChild(orbit);
    var title = document.createElement('h1'); title.textContent = 'Loading your trial workspace...';
    var subtitle = document.createElement('p'); subtitle.className = 'notely-loading-greeting'; subtitle.textContent = 'Your seven-day study space is ready.';
    var ring = document.createElement('div'); ring.className = 'notely-loading-ring';
    ring.innerHTML = '<svg viewBox="0 0 72 72" aria-hidden="true"><circle class="ring-track" cx="36" cy="36" r="30"></circle><circle class="ring-progress" cx="36" cy="36" r="30"></circle></svg><span class="ring-spark">✦</span>';
    var bar = document.createElement('div'); bar.className = 'notely-loading-progress'; var fill = document.createElement('span'); bar.appendChild(fill);
    var tip = document.createElement('p'); tip.className = 'notely-loading-tip';
    var tips = ['Setting up your notes and study tools…', 'Making space for focused work…', 'Preparing your study workspace…', 'Almost there — let’s begin.'];
    var index = 0; tip.textContent = tips[0];
    card.appendChild(particles); card.appendChild(logoWrap); card.appendChild(title); card.appendChild(subtitle); card.appendChild(ring); card.appendChild(bar); card.appendChild(tip);
    layer.appendChild(card); document.body.appendChild(layer);
    requestAnimationFrame(function () { layer.classList.add('is-visible'); });
    var ticker = reduced ? null : window.setInterval(function () { index = (index + 1) % tips.length; tip.textContent = tips[index]; }, 650);
    window.setTimeout(function () {
      if (ticker) window.clearInterval(ticker);
      layer.classList.add('is-burst');
      window.setTimeout(function () { layer.remove(); done(); }, reduced ? 40 : 320);
    }, reduced ? 950 : 2450);
  }

  function init() {
    var start = $('#getStarted');
    if (start) start.addEventListener('click', showChoicesWithShutter);
    // Rehydrate the server cookie after a storage clear where fingerprint matching
    // identifies the same trial. Viewing the landing page does not start a trial.
    refreshStatus();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
