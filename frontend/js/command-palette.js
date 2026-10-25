/* =====================================================================
   Notely  -  command-palette.js
   ---------------------------------------------------------------------
   A Raycast-style global command palette + instant search.
     • Opens with  Ctrl/Cmd + K  (or "/" when not typing, or .search-trigger)
     • Fuzzy-ish instant filtering with highlighted matches
     • Category filter chips (All / Pages / Actions / Recent)
     • Recent searches (persisted to localStorage)
     • Full keyboard nav (↑ ↓ Enter Esc) + animated open/close
     • Recent chats pulled live from /api/stats (best-effort, optional)

   Self-contained: injects its own DOM, no markup needed on the page.
   Requires app.js (SS) to be loaded for optional chat lookups.
   ===================================================================== */

(function () {
  'use strict';

  if (window.__ssCmdkLoaded) return;
  window.__ssCmdkLoaded = true;

  var RECENT_KEY = 'ss_recent_searches';

  /* ---- Static command catalogue ---- */
  var PAGES = [
    { icon: 'fa-gauge-high', title: 'Dashboard', sub: 'Your learning overview', href: '/dashboard', cat: 'Pages', keys: 'home overview stats' },
    { icon: 'fa-pen-to-square', title: 'Notely Assistant', sub: 'Open the floating assistant', href: '/dashboard?openAssistant=1', cat: 'Pages', keys: 'ask ai message tutor assistant' },
    { icon: 'fa-screwdriver-wrench', title: 'Study Tools', sub: 'Notes, quizzes, flashcards', href: '/tools', cat: 'Pages', keys: 'notes quiz flashcards summarize planner' },
    { icon: 'fa-chart-pie', title: 'Analytics', sub: 'Track your progress', href: '/analytics', cat: 'Pages', keys: 'insights charts data' },
    { icon: 'fa-gear', title: 'Settings', sub: 'Preferences & account', href: '/settings', cat: 'Pages', keys: 'preferences profile account theme appearance' },
    { icon: 'fa-user', title: 'Profile', sub: 'Manage your account', href: '/profile', cat: 'Pages', keys: 'account me user' },
    { icon: 'fa-paper-plane', title: 'Telegram Bot', sub: 'Connect Telegram', href: '/telegram', cat: 'Pages', keys: 'bot integration' },
  ];

  var ACTIONS = [
    { icon: 'fa-plus', title: 'New chat', sub: 'Open Notely Assistant', cat: 'Actions', keys: 'ask ai message tutor', href: '/dashboard?openAssistant=1&newChat=1' },
    { icon: 'fa-circle-half-stroke', title: 'Toggle theme', sub: 'Switch light / dark mode', cat: 'Actions', keys: 'dark light mode appearance', run: function () { if (window.SS && SS.toggleTheme) SS.toggleTheme(); if (window.SSMotion) SSMotion.applyPreferences(); } },
    { icon: 'fa-note-sticky', title: 'New note', sub: 'Open the notes workspace', cat: 'Actions', keys: 'write notes', href: '/tools#notes' },
    { icon: 'fa-clipboard-question', title: 'Generate a quiz', sub: 'Open quiz generator', cat: 'Actions', keys: 'test exam questions', href: '/tools#quiz' },
    { icon: 'fa-layer-group', title: 'Create flashcards', sub: 'Open flashcards', cat: 'Actions', keys: 'memorize cards revise', href: '/tools#flashcards' },
    { icon: 'fa-right-from-bracket', title: 'Log out', sub: 'End your session', cat: 'Actions', keys: 'signout exit', run: function () { if (window.SS) { SS.clearSession(); location.href = '/'; } } },
  ];

  var FILTERS = ['All', 'Pages', 'Actions', 'Content', 'Recent'];
  var activeFilter = 'All';
  var activeIndex = 0;
  var currentResults = [];
  var recentChats = [];
  var serverResults = { topics: [], notes: [], chats: [], quizzes: [] };
  var searchTimer = null;
  var lastSearchQ = '';

  /* ---- Build DOM ---- */
  var overlay = document.createElement('div');
  overlay.className = 'cmdk-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Command palette');
  overlay.innerHTML =
    '<div class="cmdk" role="combobox" aria-expanded="true">' +
      '<div class="cmdk-search">' +
        '<i class="fas fa-magnifying-glass"></i>' +
        '<input type="text" id="cmdkInput" placeholder="Search topics, notes, quizzes, chats…" autocomplete="off" spellcheck="false" aria-label="Search" />' +
        '<span class="cmdk-esc">ESC</span>' +
      '</div>' +
      '<div class="cmdk-filters" id="cmdkFilters"></div>' +
      '<div class="cmdk-results" id="cmdkResults"></div>' +
      '<div class="cmdk-foot">' +
        '<span><span class="k">↑</span><span class="k">↓</span> navigate</span>' +
        '<span><span class="k">↵</span> open</span>' +
        '<span><span class="k">esc</span> close</span>' +
      '</div>' +
    '</div>';
  document.body.appendChild(overlay);

  var input = overlay.querySelector('#cmdkInput');
  var resultsBox = overlay.querySelector('#cmdkResults');
  var filtersBox = overlay.querySelector('#cmdkFilters');

  /* ---- Filter chips ---- */
  filtersBox.innerHTML = FILTERS.map(function (f) {
    return '<button class="chip clickable' + (f === 'All' ? ' active' : '') + '" data-filter="' + f + '">' + f + '</button>';
  }).join('');
  filtersBox.querySelectorAll('[data-filter]').forEach(function (chip) {
    chip.addEventListener('click', function () {
      activeFilter = chip.dataset.filter;
      filtersBox.querySelectorAll('.chip').forEach(function (c) { c.classList.toggle('active', c === chip); });
      render(input.value);
      input.focus();
    });
  });

  /* ---- Helpers ---- */
  function getRecent() {
    try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch (e) { return []; }
  }
  function pushRecent(term) {
    if (!term) return;
    var list = getRecent().filter(function (t) { return t.toLowerCase() !== term.toLowerCase(); });
    list.unshift(term);
    list = list.slice(0, 6);
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(list)); } catch (e) {}
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function highlight(text, q) {
    if (!q) return esc(text);
    var i = text.toLowerCase().indexOf(q.toLowerCase());
    if (i === -1) return esc(text);
    return esc(text.slice(0, i)) + '<mark>' + esc(text.slice(i, i + q.length)) + '</mark>' + esc(text.slice(i + q.length));
  }

  function matches(item, q) {
    if (!q) return true;
    var hay = (item.title + ' ' + (item.sub || '') + ' ' + (item.keys || '')).toLowerCase();
    return hay.indexOf(q.toLowerCase()) !== -1;
  }

  /* ---- Server-side content search ---- */
  function contentItems() {
    var items = [];
    (serverResults.topics || []).forEach(function (t) {
      items.push({ icon: 'fa-book-open-reader', emoji: t.emoji, title: t.title, sub: 'Topic workspace', href: '/topic?id=' + t.id, cat: 'Content', keys: 'topic learn workspace' });
    });
    (serverResults.notes || []).forEach(function (n) {
      items.push({ icon: 'fa-note-sticky', title: n.title || 'Untitled note', sub: 'Note', href: '/tools#notes', cat: 'Content', keys: 'note' });
    });
    (serverResults.chats || []).forEach(function (c) {
      items.push({ icon: 'fa-comment', title: c.title || 'Untitled chat', sub: 'Saved chat', href: '/dashboard?openAssistant=1&chatId=' + encodeURIComponent(c.id), cat: 'Content', keys: 'chat conversation' });
    });
    (serverResults.quizzes || []).forEach(function (qz) {
      items.push({ icon: 'fa-clipboard-question', title: qz.title || 'Quiz', sub: 'Quiz', href: '/tools#quiz', cat: 'Content', keys: 'quiz test' });
    });
    return items;
  }

  function scheduleSearch(q) {
    if (searchTimer) clearTimeout(searchTimer);
    q = (q || '').trim();
    if (q.length < 2) {
      serverResults = { topics: [], notes: [], chats: [], quizzes: [] };
      lastSearchQ = '';
      return;
    }
    if (q === lastSearchQ) return;
    searchTimer = setTimeout(function () {
      if (!window.SS || !SS.api) return;
      var mine = q;
      SS.api('/api/search?q=' + encodeURIComponent(mine)).then(function (res) {
        if (input.value.trim() !== mine) return; // stale
        lastSearchQ = mine;
        serverResults = res || { topics: [], notes: [], chats: [], quizzes: [] };
        render(input.value);
      }).catch(function () { /* ignore */ });
    }, 220);
  }

  /* ---- Render ---- */
  function render(q) {
    q = (q || '').trim();

    var chatItems = recentChats.map(function (c) {
      return { icon: 'fa-comment', title: c.title || 'Untitled chat', sub: 'Recent chat', href: '/dashboard?openAssistant=1&chatId=' + encodeURIComponent(c.id), cat: 'Recent', keys: 'history conversation' };
    });

    var pool = [];
    if (activeFilter === 'All' || activeFilter === 'Pages') pool = pool.concat(PAGES);
    if (activeFilter === 'All' || activeFilter === 'Actions') pool = pool.concat(ACTIONS);
    if (activeFilter === 'All' || activeFilter === 'Recent') pool = pool.concat(chatItems);

    var filtered = pool.filter(function (it) { return matches(it, q); });

    // Server content results (already query-matched server-side)
    if (q.length >= 2 && (activeFilter === 'All' || activeFilter === 'Content')) {
      filtered = filtered.concat(contentItems());
    }

    // "Learn with AI" fallback action for any query
    if (q.length >= 2) {
      filtered.push({
        icon: 'fa-wand-magic-sparkles',
        title: 'Learn “' + q + '” with AI',
        sub: 'Open a full AI workspace for this topic',
        href: '/topic?t=' + encodeURIComponent(q),
        cat: 'Learn',
        keys: ''
      });
    }

    currentResults = filtered;

    // Empty state
    if (!filtered.length) {
      var recents = getRecent();
      var rec = recents.length && !q
        ? '<div class="cmdk-group-label">Recent searches</div>' + recents.map(function (r) {
            return '<div class="cmdk-item" data-recent="' + esc(r) + '"><div class="cmdk-ic"><i class="fas fa-clock-rotate-left"></i></div><div class="cmdk-text"><b>' + esc(r) + '</b></div></div>';
          }).join('')
        : '';
      resultsBox.innerHTML = rec +
        '<div class="cmdk-empty"><div class="cmdk-empty-ic"><i class="fas fa-wind"></i></div>' +
        '<b>No results' + (q ? ' for “' + esc(q) + '”' : '') + '</b>' +
        '<span>Try a different search or browse the menu.</span></div>';
      bindRecentClicks();
      return;
    }

    // Group by category
    var byCat = {};
    filtered.forEach(function (it) { (byCat[it.cat] = byCat[it.cat] || []).push(it); });
    var order = ['Content', 'Pages', 'Actions', 'Recent', 'Learn'];
    var html = '';
    var idx = 0;
    var flat = [];
    order.forEach(function (cat) {
      if (!byCat[cat]) return;
      html += '<div class="cmdk-group-label">' + cat + '</div>';
      byCat[cat].forEach(function (it) {
        flat.push(it);
        html += '<div class="cmdk-item" data-idx="' + idx + '" role="option">' +
          '<div class="cmdk-ic">' + (it.emoji ? '<span style="font-size:15px">' + esc(it.emoji) + '</span>' : '<i class="fas ' + it.icon + '"></i>') + '</div>' +
          '<div class="cmdk-text"><b>' + highlight(it.title, q) + '</b>' +
          (it.sub ? '<span>' + esc(it.sub) + '</span>' : '') + '</div>' +
          '<span class="cmdk-hint"><i class="fas fa-arrow-turn-down" style="transform:rotate(90deg)"></i></span>' +
        '</div>';
        idx++;
      });
    });
    currentResults = flat;
    resultsBox.innerHTML = html;
    activeIndex = 0;
    paintActive();

    resultsBox.querySelectorAll('.cmdk-item[data-idx]').forEach(function (el) {
      el.addEventListener('mouseenter', function () { activeIndex = +el.dataset.idx; paintActive(); });
      el.addEventListener('click', function () { exec(currentResults[+el.dataset.idx], q); });
    });
  }

  function bindRecentClicks() {
    resultsBox.querySelectorAll('[data-recent]').forEach(function (el) {
      el.addEventListener('click', function () {
        input.value = el.dataset.recent;
        render(input.value);
        input.focus();
      });
    });
  }

  function paintActive() {
    var items = resultsBox.querySelectorAll('.cmdk-item[data-idx]');
    items.forEach(function (el) {
      var on = +el.dataset.idx === activeIndex;
      el.classList.toggle('active', on);
      if (on) el.scrollIntoView({ block: 'nearest' });
    });
  }

  function exec(item, q) {
    if (!item) return;
    pushRecent(q || item.title);
    close();
    if (item.run) { item.run(); return; }
    if (item.href) {
      if (item.href.charAt(0) === '#') { location.hash = item.href; }
      else { location.href = item.href; }
    }
  }

  /* ---- Open / close ---- */
  var lastFocused = null;
  function open() {
    lastFocused = document.activeElement;
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
    fetchRecentChats();
    render('');
    setTimeout(function () { input.focus(); input.select(); }, 40);
  }
  function close() {
    overlay.classList.remove('open');
    document.body.style.overflow = '';
    input.value = '';
    if (lastFocused && lastFocused.focus) lastFocused.focus();
  }
  function toggle() { overlay.classList.contains('open') ? close() : open(); }

  /* ---- Recent chats (best effort) ---- */
  var fetchedChats = false;
  function fetchRecentChats() {
    if (fetchedChats || !window.SS || !SS.api) return;
    fetchedChats = true;
    SS.api('/api/stats').then(function (s) {
      recentChats = (s && s.recent_chats ? s.recent_chats : []).slice(0, 5);
    }).catch(function () { /* ignore */ });
  }

  /* ---- Events ---- */
  input.addEventListener('input', function () {
    render(input.value);
    scheduleSearch(input.value);
  });

  overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
  overlay.querySelector('.cmdk-esc').addEventListener('click', close);

  document.addEventListener('keydown', function (e) {
    var openNow = overlay.classList.contains('open');

    // Open: Ctrl/Cmd+K
    if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
      e.preventDefault();
      toggle();
      return;
    }
    // Open with "/" when not typing in a field
    if (!openNow && e.key === '/' ) {
      var t = e.target;
      var typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
      if (!typing) { e.preventDefault(); open(); return; }
    }

    if (!openNow) return;

    if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); activeIndex = Math.min(activeIndex + 1, currentResults.length - 1); paintActive(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); activeIndex = Math.max(activeIndex - 1, 0); paintActive(); }
    else if (e.key === 'Enter') { e.preventDefault(); exec(currentResults[activeIndex], input.value.trim()); }
  });

  // Any .search-trigger / [data-cmdk] element opens the palette
  document.addEventListener('click', function (e) {
    if (e.target.closest('.search-trigger, [data-cmdk]')) { e.preventDefault(); open(); }
  });

  // Expose
  window.SSCommand = { open: open, close: close, toggle: toggle };
})();
