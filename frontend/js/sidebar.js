/* =====================================================================
   Notely  -  sidebar.js  (Premium Glass Redesign)
   ---------------------------------------------------------------------
   Single-source sidebar renderer powering every authenticated page.
   Inspired by ChatGPT · Perplexity · Vercel · Linear · macOS Dock.

   Layout (expanded)                    Layout (collapsed = floating dock)
     ┌──────────────────────────┐          ┌──────┐
     │        ◉ LOGO            │          │  ◉   │  ← circular glass logo
     │      Notely         │          │ ⇔   │  ← expand button BELOW logo
     │  [⇔ collapse button]     │          │ ──── │
     ├──────────────────────────┤          │  ✚   │  ← new chat
     │  ✚ New Chat              │          │  🏠  │
     │  ── WORKSPACE ──         │          │  📝  │  ← icons centered,
     │  🏠 Dashboard …          │          │  …   │     tooltips on hover
     │  ── STUDY ──             │          │ ──── │
     │  … groups …              │          │  🌙  │
     ├──────────────────────────┤          │  ◉   │  ← avatar
     │  🌙 theme  ◉ profile     │          └──────┘
     └──────────────────────────┘

   Behaviour preserved: authenticated session, mobile drawer, collapse
   persistence, keyboard nav, profile dropdown.
   ===================================================================== */

(function () {
  'use strict';

  var aside = document.getElementById('sidebar');
  if (!aside) return;

  if (!SS.isAuthed()) { window.location.replace('/login'); return; }

  var active = aside.dataset.active || '';
  var user = SS.getUser();

  /* ---- Navigation catalogue (grouped) ---- */
  var items = [
    { section: 'Workspace' },
    { id: 'dashboard',  href: '/dashboard',              icon: 'fa-house',             label: 'Home' },
    { id: 'notes',      href: '/tools#notes',            icon: 'fa-note-sticky',       label: 'Notes' },
    { id: 'summarizer', href: '/tools#summarizer',       icon: 'fa-file-lines',        label: 'Summarize' },
    { id: 'mindmap',    href: '/dashboard#ai-workspace', icon: 'fa-diagram-project',   label: 'AI Mind Map' },
    { id: 'roadmap',    href: '/dashboard#ai-workspace', icon: 'fa-route',             label: 'AI Roadmap' },

    { section: 'Study' },
    { id: 'flashcards', href: '/tools#flashcards',       icon: 'fa-layer-group',       label: 'Flashcards' },
    { id: 'quiz',       href: '/tools#quiz',             icon: 'fa-circle-check',      label: 'Practice Quiz' },
    { id: 'planner',    href: '/tools#planner',          icon: 'fa-calendar-days',     label: 'Study Planner' },
    { id: 'homework',   href: '/tools#homework',         icon: 'fa-graduation-cap',    label: 'Homework Help' },

    { section: 'Library' },
    { id: 'topics',     href: '/topics',                 icon: 'fa-folder-open',       label: 'Topics' },
    { id: 'history',    href: '/dashboard#history',      icon: 'fa-clock-rotate-left', label: 'History' },

    { section: 'Account' },
    { id: 'analytics',  href: '/analytics',              icon: 'fa-chart-line',        label: 'Progress' },
    { id: 'profile',    href: '/profile',                icon: 'fa-user',              label: 'Profile' },
    { id: 'settings',   href: '/settings',               icon: 'fa-gear',              label: 'Settings' },

    { section: 'Support' },
    { id: 'telegram',   href: '/telegram',               icon: 'fa-paper-plane',       label: 'Telegram Bot' },
    { id: 'help',       href: '/telegram#help',          icon: 'fa-circle-question',   label: 'Help & Feedback' },
  ];

  var navHtml = items.map(function (it) {
    if (it.section) {
      return '<div class="nav-section" role="presentation" aria-hidden="true"><span>' + escapeHtml(it.section) + '</span></div>';
    }
    var classes = [it.id === active ? 'active' : '', it.primary ? 'nav-primary' : ''].filter(Boolean).join(' ');
    return '' +
      '<a class="' + classes + '" href="' + escapeHtml(it.href) + '" title="' + escapeHtml(it.label) + '" ' +
      'aria-label="' + escapeHtml(it.label) + '"' + (it.id === active ? ' aria-current="page"' : '') + '>' +
        '<i class="fas ' + escapeHtml(it.icon) + '" aria-hidden="true"></i>' +
        '<span>' + escapeHtml(it.label) + '</span>' +
      '</a>';
  }).join('');

  /* ---- Restore collapsed state ---- */
  /* The new workspace opens as a quiet rail; expansion remains persisted. */
  var savedCollapse = localStorage.getItem('ainb_sidebar_collapsed');
  var isCollapsed = savedCollapse === null ? true : savedCollapse === 'true';
  if (isCollapsed) aside.classList.add('collapsed');

  /* ---- Render shell ---- */
  aside.setAttribute('role', 'complementary');
  aside.innerHTML =
    '<div class="side-head">' +
      '<a class="brand" href="/dashboard" aria-label="Notely home">' +
        '<span class="logo" aria-hidden="true">' +
          '<img src="/assets/logo.png" alt="" class="logo-img" />' +
        '</span>' +
        '<span class="brand-text">Notely</span>' +
      '</a>' +
      '<button id="sidebarMobileClose" class="mobile-close" type="button" aria-label="Close navigation" title="Close navigation">' +
        '<i class="fas fa-xmark" aria-hidden="true"></i>' +
      '</button>' +
      '<button id="sidebarCollapse" class="collapse-btn" type="button" aria-label="Toggle sidebar" ' +
        'aria-expanded="' + (!isCollapsed) + '" aria-controls="sidebar" title="' + (isCollapsed ? 'Expand sidebar' : 'Collapse sidebar') + '">' +
        '<i class="fas fa-angles-' + (isCollapsed ? 'right' : 'left') + '" aria-hidden="true"></i>' +
        '<span class="cb-label">' + (isCollapsed ? 'Expand' : 'Collapse') + '</span>' +
      '</button>' +
    '</div>' +
    '<nav class="side-nav" role="navigation" aria-label="Main navigation">' + navHtml + '</nav>' +
    '<div class="side-foot" id="sideFoot">' + footerHtml(user) + '</div>';

  /* ---- Collapse / expand ---- */
  var collBtn = document.getElementById('sidebarCollapse');
  if (collBtn) {
    collBtn.addEventListener('click', function () {
      var collapsed = aside.classList.toggle('collapsed');
      localStorage.setItem('ainb_sidebar_collapsed', collapsed);
      var icon = collBtn.querySelector('i');
      if (icon) icon.className = 'fas fa-angles-' + (collapsed ? 'right' : 'left');
      var lbl = collBtn.querySelector('.cb-label');
      if (lbl) lbl.textContent = collapsed ? 'Expand' : 'Collapse';
      collBtn.setAttribute('aria-expanded', String(!collapsed));
      collBtn.setAttribute('title', collapsed ? 'Expand sidebar' : 'Collapse sidebar');
      closeProfileMenu();
    });
  }

  /* ---- Footer markup ---- */
  function footerHtml(u) {
    return '' +
      '<button class="theme-toggle side-theme" id="sideThemeToggle" type="button" ' +
        'aria-label="Theme" title="Theme" hidden>' +
        '<i class="fas fa-sun" aria-hidden="true"></i>' +
        '<span>Light mode</span>' +
      '</button>' +
      userFooterHtml(u);
  }

  function userFooterHtml(u) {
    var name = u.name || 'User';
    var init = (name || 'G').trim().charAt(0).toUpperCase() || 'G';
    var sub = u.email || u.username || '';

    return '' +
      '<div class="side-user-card" id="sideUserCard">' +
        '<button class="side-user-trigger" id="sideUserTrigger" aria-haspopup="true" aria-expanded="false" aria-label="Account menu" title="Account">' +
          '<span class="avatar" aria-hidden="true"><span class="avatar-inner">' + escapeHtml(init) + '</span>' +
            '<span class="status-dot' + '' + '"></span>' +
          '</span>' +
          '<span class="meta">' +
            '<b>' + escapeHtml(name) + '</b>' +
            '<span>' + escapeHtml(sub) + '</span>' +
          '</span>' +
          '<i class="fas fa-ellipsis-vertical chev" aria-hidden="true"></i>' +
        '</button>' +
        '<div class="dropdown-menu side-user-menu" id="sideUserMenu" role="menu">' +
          '<a class="dropdown-item" href="/profile" role="menuitem"><i class="fas fa-user"></i> View profile</a>' +
          '<a class="dropdown-item" href="/settings" role="menuitem"><i class="fas fa-gear"></i> Settings</a>' +
          '<a class="dropdown-item" href="/analytics" role="menuitem"><i class="fas fa-chart-line"></i> Progress</a>' +
          '<div class="dropdown-sep"></div>' +
          '<button class="dropdown-item danger" id="logoutBtn" role="menuitem">' +
            '<i class="fas fa-right-from-bracket"></i> ' + (isGuest ? 'Exit guest mode' : 'Log out') +
          '</button>' +
        '</div>' +
      '</div>';
  }

  function renderUserFooter(u) {
    var foot = document.getElementById('sideFoot');
    if (!foot) return;
    foot.innerHTML = footerHtml(u);
    bindFooter();
  }

  /* ---- Profile dropdown ---- */
  function closeProfileMenu() {
    var menu = document.getElementById('sideUserMenu');
    var trigger = document.getElementById('sideUserTrigger');
    if (menu) menu.classList.remove('open');
    if (trigger) trigger.setAttribute('aria-expanded', 'false');
  }

  function bindFooter() {
    var trigger = document.getElementById('sideUserTrigger');
    var menu = document.getElementById('sideUserMenu');
    if (trigger && menu && !trigger.dataset.bound) {
      trigger.dataset.bound = '1';
      trigger.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        var open = menu.classList.toggle('open');
        trigger.setAttribute('aria-expanded', String(open));
      });
      document.addEventListener('click', function (e) {
        if (!e.target.closest('#sideUserCard')) closeProfileMenu();
      });
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') closeProfileMenu();
      });
    }

    var logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn && !logoutBtn.dataset.bound) {
      logoutBtn.dataset.bound = '1';
      logoutBtn.addEventListener('click', function () {
        SS.clearSession();
        window.location.href = '/';
      });
    }

    var themeBtn = document.getElementById('sideThemeToggle');
    if (themeBtn && !themeBtn.dataset.bound) {
      themeBtn.dataset.bound = '1';
      themeBtn.addEventListener('click', function () {
        var next = SS.toggleTheme ? SS.toggleTheme() : null;
        if (window.SSMotion) SSMotion.applyPreferences();
        var light = next ? next === 'light'
          : document.documentElement.getAttribute('data-theme') === 'light';
        var icon = themeBtn.querySelector('i');
        var label = themeBtn.querySelector('span');
        if (icon) icon.className = 'fas ' + (light ? 'fa-sun' : 'fa-moon');
        if (label) label.textContent = light ? 'Light mode' : 'Dark mode';
      });
    }
  }
  bindFooter();

  /* ---- Mobile drawer ---- */
  var toggle = document.getElementById('sidebarToggle');
  var overlay = document.getElementById('sideOverlay');
  var isMobile = function () { return window.innerWidth <= 880; };

  var bodyScrollState = { overflow: '', touchAction: '' };
  function openSidebar() {
    bodyScrollState.overflow = document.body.style.overflow;
    bodyScrollState.touchAction = document.body.style.touchAction;
    aside.classList.add('open');
    aside.setAttribute('aria-hidden', 'false');
    if (toggle) toggle.setAttribute('aria-expanded', 'true');
    if (overlay) overlay.classList.add('show');
    document.body.style.overflow = 'hidden';
    document.body.style.touchAction = 'none';
    var firstLink = aside.querySelector('.side-nav a');
    if (firstLink) setTimeout(function () { firstLink.focus(); }, 100);
  }

  function closeSidebar() {
    aside.classList.remove('open');
    aside.setAttribute('aria-hidden', isMobile() ? 'true' : 'false');
    if (toggle) toggle.setAttribute('aria-expanded', 'false');
    if (overlay) overlay.classList.remove('show');
    document.body.style.overflow = bodyScrollState.overflow;
    document.body.style.touchAction = bodyScrollState.touchAction;
    if (toggle && isMobile()) setTimeout(function () { toggle.focus(); }, 100);
  }

  var mobileClose = document.getElementById('sidebarMobileClose');
  if (mobileClose) mobileClose.addEventListener('click', function (e) {
    e.preventDefault();
    e.stopPropagation();
    closeSidebar();
  });
  if (toggle) {
    toggle.setAttribute('aria-controls', 'sidebar');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.addEventListener('click', function (e) {
      e.stopPropagation();
      aside.classList.contains('open') ? closeSidebar() : openSidebar();
    });
  }

  aside.setAttribute('aria-hidden', isMobile() ? 'true' : 'false');

  if (overlay) {
    overlay.addEventListener('click', function (e) { e.stopPropagation(); closeSidebar(); });
  }

  /* ---- Keyboard navigation ---- */
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && aside.classList.contains('open')) {
      e.preventDefault();
      closeSidebar();
      return;
    }
    if (aside.classList.contains('open')) {
      var navLinks = Array.prototype.slice.call(aside.querySelectorAll('.side-nav a'));
      var idx = navLinks.indexOf(document.activeElement);
      if (e.key === 'ArrowDown' && idx !== -1) {
        e.preventDefault();
        navLinks[(idx + 1) % navLinks.length].focus();
      } else if (e.key === 'ArrowUp' && idx !== -1) {
        e.preventDefault();
        navLinks[idx === 0 ? navLinks.length - 1 : idx - 1].focus();
      }
    }
  });

  /* ---- Same-page hash links ---- */
  aside.querySelectorAll('.side-nav a').forEach(function (link) {
    link.addEventListener('click', function (e) {
      var href = link.getAttribute('href') || '';
      var hashIdx = href.indexOf('#');
      if (hashIdx > -1) {
        var targetPath = href.slice(0, hashIdx) || window.location.pathname;
        var targetHash = href.slice(hashIdx);
        if (targetPath === window.location.pathname) {
          e.preventDefault();
          if (window.location.hash === targetHash) {
            window.dispatchEvent(new HashChangeEvent('hashchange'));
          } else {
            window.location.hash = targetHash;
          }
        }
      }
      if (isMobile()) closeSidebar();
    });
  });

  /* ---- Resize ---- */
  var resizeTimer;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      if (!isMobile()) {
        aside.classList.remove('open');
        if (overlay) overlay.classList.remove('show');
        document.body.style.overflow = '';
        document.body.style.touchAction = '';
        aside.setAttribute('aria-hidden', 'false');
      } else if (!aside.classList.contains('open')) {
        aside.setAttribute('aria-hidden', 'true');
      }
    }, 120);
  });

  document.addEventListener('touchmove', function (e) {
    if (aside.classList.contains('open') && !aside.contains(e.target)) {
      e.preventDefault();
    }
  }, { passive: false });

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
})();
