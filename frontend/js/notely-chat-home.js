/* Notely chat-first workspace home. Uses the existing workspace API and assistant. */
(function () {
  'use strict';
  var root = document.getElementById('nwContent');
  var sidebar = document.getElementById('nwSidebar');
  if (!root || !sidebar) return;

  var activity = [];
  var activityUnavailable = false;
  var activityLoaded = false;
  var activityLoading = false;
  var profile = {};
  var activityKey = 'notely-home-activity-v1';
  var homeRendered = false;
  var menuOpen = false;
  var shell = document.querySelector('.nw-shell');
  if (shell) shell.classList.add('nch-shell');
  document.body.classList.add('nch-shell-active');

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c];
    });
  }
  function readProfile() {
    try {
      profile = typeof SS !== 'undefined' && SS.getUser ? SS.getUser() : JSON.parse(localStorage.getItem('ss_user') || '{}');
    } catch (_) { profile = {}; }
    return profile || {};
  }
  function accountId() {
    var user = readProfile();
    return String(user.id || user.user_id || user.email || 'trial-device');
  }
  function activityMap() {
    try { return JSON.parse(localStorage.getItem(activityKey + ':' + accountId()) || '{}'); }
    catch (_) { return {}; }
  }
  function recordActivity(kind, id) {
    var map = activityMap();
    map[kind + ':' + id] = Date.now();
    try { localStorage.setItem(activityKey + ':' + accountId(), JSON.stringify(map)); } catch (_) {}
  }
  function timeLabel(value) {
    if (!value) return 'Recently opened';
    var date = new Date(value);
    if (isNaN(date.getTime())) return 'Recently opened';
    var diff = Math.max(0, Date.now() - date.getTime());
    var mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return mins + 'm ago';
    var hours = Math.floor(mins / 60);
    if (hours < 24) return hours + 'h ago';
    var days = Math.floor(hours / 24);
    return days < 7 ? days + 'd ago' : date.toLocaleDateString();
  }
  function greeting() {
    var h = new Date().getHours();
    return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  }
  function orb() {
    return '<div class="nch-orb" aria-hidden="true"><svg viewBox="0 0 48 48" fill="none"><path d="M24 5.5l4.4 13.1L41.5 23l-13.1 4.4L24 40.5l-4.4-13.1L6.5 23l13.1-4.4L24 5.5Z" fill="white" fill-opacity=".96"/><circle cx="24" cy="23" r="2.2" fill="#47A8DE"/></svg></div>';
  }
  function getName() {
    var p = readProfile();
    return String(p.name || p.full_name || (p.email ? p.email.split('@')[0] : '') || 'there').trim().split(/\s+/)[0];
  }
  function icon(kind) {
    return ({ note:'▤', topic:'⌂', chat:'✦', file:'▧', task:'✓' })[kind] || '✧';
  }
  function sortActivities(items) {
    var local = activityMap();
    return items.map(function (item) {
      var key = item.kind + ':' + item.id;
      var touched = Number(local[key] || 0);
      var fallback = item.timestamp ? new Date(item.timestamp).getTime() : 0;
      item.sortAt = touched || (isFinite(fallback) ? fallback : 0);
      return item;
    }).sort(function (a, b) { return b.sortAt - a.sortAt; }).slice(0, 3);
  }
  function card(item) {
    var attrs = item.kind === 'note'
      ? 'data-note-id="' + esc(item.id) + '"'
      : item.kind === 'topic'
        ? 'data-topic-open="' + esc(item.id) + '"'
        : item.kind === 'chat'
          ? 'data-home-chat="' + esc(item.id) + '"'
          : 'data-file-open="' + esc(item.id) + '"';
    return '<button type="button" class="nch-activity" ' + attrs + ' data-home-kind="' + esc(item.kind) + '" data-home-id="' + esc(item.id) + '">' +
      '<span class="nch-activity-icon" aria-hidden="true">' + icon(item.kind) + '</span>' +
      '<strong>' + esc(item.title || 'Untitled') + '</strong>' +
      '<small>' + esc(item.description || item.subtitle || 'Continue your work') + '</small>' +
      '<time>' + esc(timeLabel(item.sortAt || item.timestamp)) + '</time></button>';
  }
  function starterCards() {
    return [
      { title:'Create your first note', description:'Capture a lesson or an idea.', view:'notes', kind:'starter', id:'note' },
      { title:'Make flashcards', description:'Turn what you know into practice.', view:'flashcards', kind:'starter', id:'flashcards' },
      { title:'Generate a quiz', description:'Check your understanding.', view:'quizzes', kind:'starter', id:'quiz' }
    ].map(function (item) {
      return '<button type="button" class="nch-activity nch-starter" data-view="' + item.view + '">' +
        '<span class="nch-activity-icon">' + (item.id === 'note' ? '▤' : item.id === 'flashcards' ? '▣' : '?') + '</span>' +
        '<strong>' + item.title + '</strong><small>' + item.description + '</small><time>Get started</time></button>';
    }).join('');
  }
  function listFrom(value, keys) {
    if (Array.isArray(value)) return value;
    if (!value || typeof value !== 'object') return [];
    for (var i = 0; i < keys.length; i++) if (Array.isArray(value[keys[i]])) return value[keys[i]];
    return [];
  }
  async function fetchActivity() {
    if (typeof SS === 'undefined' || !SS.api) return [];
    var results = await Promise.allSettled([
      SS.api('/api/tools/notes'),
      SS.api('/api/topics'),
      SS.api('/api/chats'),
      SS.api('/api/files')
    ]);
    var items = [];
    if (results[0].status === 'fulfilled') {
      listFrom(results[0].value, ['notes', 'items']).filter(function (n) { return !n.deleted && !n.archived; }).forEach(function (n) {
        items.push({ kind:'note', id:n.id, title:n.topic || n.title || 'Untitled note', description:'Your saved study note', timestamp:n.updated_at || n.created_at });
      });
    }
    if (results[1].status === 'fulfilled') {
      listFrom(results[1].value, ['topics', 'items']).forEach(function (t) {
        items.push({ kind:'topic', id:t.id, title:t.title || 'Notebook', description:(t.sections || []).length + ' saved sections', timestamp:t.updated_at || t.created_at });
      });
    }
    if (results[2].status === 'fulfilled') {
      listFrom(results[2].value, ['chats', 'items']).forEach(function (c) {
        items.push({ kind:'chat', id:c.id, title:c.title || 'New chat', description:'Notely Assistant conversation', timestamp:c.updated_at || c.created_at });
      });
    }
    if (results[3].status === 'fulfilled') {
      listFrom(results[3].value, ['files', 'uploads', 'items']).forEach(function (f) {
        items.push({ kind:'file', id:f.id, title:f.filename || f.name || 'Study document', description:'Course material', timestamp:f.updated_at || f.created_at, view:'documents' });
      });
    }
    activityUnavailable = items.length === 0 && results.some(function (result) { return result.status === 'rejected'; });
    return sortActivities(items);
  }
  function renderRecentChats() {
    var holder = document.getElementById('nchRecent');
    if (!holder || typeof SS === 'undefined' || !SS.api) return;
    SS.api('/api/chats').then(function (data) {
      var chats = listFrom(data, ['chats', 'items']).slice(0, 5);
      var chatMarkup = chats.map(function (chat) {
        return '<button class="nch-recent-item" type="button" data-home-chat="' + esc(chat.id) + '" title="' + esc(chat.title || 'New chat') + '">' + esc(chat.title || 'New chat') + '</button>';
      }).join('');
      var workMarkup = activity.filter(function (item) { return item.kind !== 'chat'; }).slice(0, 3).map(function (item) {
        var attr = item.kind === 'note' ? 'data-sidebar-note="' + esc(item.id) + '"' : item.kind === 'topic' ? 'data-sidebar-topic="' + esc(item.id) + '"' : 'data-sidebar-file="' + esc(item.id) + '"';
        return '<button class="nch-recent-item" type="button" ' + attr + ' title="' + esc(item.title) + '">' + esc(item.title) + '</button>';
      }).join('');
      holder.innerHTML = (chatMarkup ? '<small class="nch-recent-label">CHATS</small>' + chatMarkup : '') +
        (workMarkup ? '<small class="nch-recent-label">RECENT WORK</small>' + workMarkup : '');
    }).catch(function () { holder.innerHTML = ''; });
  }
  function homeMarkup() {
    var user = readProfile();
    var name = getName();
    var isTrial = !!user.is_trial;
    var cards = activity.length ? activity.map(card).join('') : activityUnavailable ? '<div class="nch-activity-error">Recent work could not be loaded. Your saved data has not been changed.</div>' : starterCards();
    var trialText = isTrial && !user.trial_expired ? '<small class="nch-trial-note">Trial workspace</small>' : '';
    return '<div class="nch-home">' +
      '<div class="nch-hero">' + orb() +
      '<h1 class="nch-greeting">' + esc(greeting()) + ', ' + esc(name) + '<span>How can I <em>assist you</em> today?</span></h1>' +
      '<p class="nch-subtitle">Your study space is ready. Ask a question or jump straight into a tool.</p>' +
      '<form class="nch-composer" id="nchComposer"><label class="nch-sr-only" for="nchPrompt">Ask Notely</label>' +
      '<textarea id="nchPrompt" rows="2" maxlength="8000" placeholder="Ask Notely anything about your studies…" required></textarea>' +
      '<div class="nch-composer-foot"><div class="nch-tool-chips">' +
      '<button class="nch-chip" type="button" data-view="tools">✦ Summarize</button>' +
      '<button class="nch-chip" type="button" data-view="flashcards">▣ Flashcards</button>' +
      '<button class="nch-chip" type="button" data-view="quizzes">? Quiz</button>' +
      '<button class="nch-chip" type="button" data-view="mindmaps">◎ Mind map</button>' +
      '</div><div class="nch-composer-actions">' +
      '<button class="nch-round-tool" type="button" id="nchAttach" aria-label="Attach a file" title="Attach a file">＋</button>' +
      '<button class="nch-round-tool" type="button" id="nchMic" aria-label="Dictate" title="Dictate">♩</button>' +
      '<button class="nch-send" type="submit" aria-label="Send message">↑</button>' +
      '</div></div></form></div>' +
      '<section class="nch-continue"><div class="nch-section-head"><div><h2>Continue where you left off</h2><p>Your latest notes, notebooks and conversations.</p></div><a href="/dashboard#notes" data-view="notes">View all work →</a></div>' +
      '<div class="nch-cards">' + cards + '</div></section>' +
      trialText + '</div>';
  }
  function renderHome() {
    if (!root || !root.isConnected) return;
    document.body.classList.add('nch-home-active');
    root.innerHTML = homeMarkup();
    homeRendered = true;
    renderRecentChats();
    var composer = document.getElementById('nchComposer');
    var input = document.getElementById('nchPrompt');
    if (input) {
      input.addEventListener('input', function () {
        input.style.height = 'auto';
        input.style.height = Math.min(180, input.scrollHeight) + 'px';
      });
      input.addEventListener('keydown', function (event) {
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault();
          if (composer) composer.requestSubmit();
        }
      });
    }
    if (composer) composer.addEventListener('submit', function (event) {
      event.preventDefault();
      sendPrompt(input ? input.value.trim() : '');
    });
    var attach = document.getElementById('nchAttach');
    if (attach) attach.addEventListener('click', function () {
      openAssistantPanel().then(function () {
        var button = document.getElementById('nwAssistantAttach');
        if (button) button.click();
      });
    });
    var mic = document.getElementById('nchMic');
    if (mic) mic.addEventListener('click', function () {
      openAssistantPanel().then(function () {
        var button = document.getElementById('nwAssistantMic');
        if (button) button.click();
      });
    });
    root.querySelectorAll('[data-home-kind][data-home-id]').forEach(function (button) {
      button.addEventListener('click', function () { recordActivity(button.dataset.homeKind, button.dataset.homeId); });
    });
  }
  function openAssistantPanel() {
    if (!window.NotelyAssistant) return Promise.reject(new Error('Assistant is not ready yet.'));
    return window.NotelyAssistant.open('');
  }
  async function sendPrompt(prompt) {
    if (!prompt) return;
    var page = document.querySelector('.nch-home');
    if (page) page.classList.add('is-leaving');
    document.body.classList.remove('nch-home-active');
    if (!window.NotelyAssistant) {
      if (page) page.classList.remove('is-leaving');
      return;
    }
    try {
      await window.NotelyAssistant.open(prompt);
      await window.NotelyAssistant.newChat();
      var input = document.getElementById('nwAssistantInput');
      if (input) input.value = prompt;
      window.NotelyAssistant.setMode('maximized', true);
      await window.NotelyAssistant.send();
    } catch (error) {
      document.body.classList.add('nch-home-active');
      if (page) page.classList.remove('is-leaving');
      if (typeof SS !== 'undefined' && SS.toast) SS.toast(error.message || 'Could not open Notely Assistant.', 'error');
    }
  }
  function openChat(id) {
    if (!window.NotelyAssistant) return;
    document.body.classList.remove('nch-home-active');
    window.NotelyAssistant.open('').then(function () {
      return window.NotelyAssistant.selectChat(Number(id));
    }).then(function () {
      window.NotelyAssistant.setMode('maximized', true);
    });
  }
  function installProfileMenu() {
    if (document.getElementById('nchProfileMenu')) return;
    var menu = document.createElement('div');
    menu.id = 'nchProfileMenu';
    menu.className = 'nch-profile-menu';
    menu.setAttribute('role', 'menu');
    document.body.appendChild(menu);
    var userButton = document.querySelector('.nw-user');
    var profile = readProfile();
    var avatar = document.getElementById('nwUserAvatar');
    var name = document.getElementById('nwUserName');
    if (avatar) avatar.textContent = String(profile.name || profile.email || 'N').trim().charAt(0).toUpperCase();
    if (name) name.textContent = profile.name || profile.email || 'Student';
    if (userButton) {
      userButton.setAttribute('aria-haspopup', 'menu');
      userButton.setAttribute('aria-expanded', 'false');
      userButton.addEventListener('click', function (event) {
        event.preventDefault();
        event.stopPropagation();
        var p = readProfile();
        var accounts = typeof SS !== 'undefined' && SS.getAccounts ? SS.getAccounts() : [];
        menu.innerHTML = '<button type="button" class="nch-menu-name" id="nchAccountToggle">' + esc(p.name || p.email || 'Your account') + '　⌄</button>' +
          '<button type="button" data-profile-action="settings">Settings</button>' +
          '<button type="button" data-profile-action="help">Help</button>' +
          '<button type="button" data-profile-action="logout">Logout</button>' +
          '<div class="nch-account-list" id="nchAccountList" hidden>' +
          accounts.map(function (a) {
            return '<button type="button" data-switch-account="' + esc(a.id) + '" aria-current="' + (String(a.id) === accountId() ? 'true' : 'false') + '">' + esc(a.name || a.email || 'Account') + '</button>';
          }).join('') +
          '<button type="button" data-add-account="1">＋ Add account</button></div>';
        menu.classList.add('is-open');
        menuOpen = true;
        userButton.setAttribute('aria-expanded', 'true');
      });
    }
    menu.addEventListener('click', function (event) {
      var target = event.target.closest('button');
      if (!target) return;
      if (target.id === 'nchAccountToggle') {
        var list = document.getElementById('nchAccountList');
        if (list) list.hidden = !list.hidden;
        return;
      }
      if (target.dataset.switchAccount && typeof SS !== 'undefined' && SS.switchAccount) {
        SS.switchAccount(target.dataset.switchAccount);
        return;
      }
      if (target.dataset.addAccount) {
        if (typeof SS !== 'undefined' && SS.beginAddAccount) SS.beginAddAccount(); else window.location.href = '/login?addAccount=1&return=%2Fdashboard';
        return;
      }
      if (target.dataset.profileAction === 'settings') {
        closeProfileMenu();
        var settings = document.querySelector('[data-view="settings"]');
        if (settings) settings.click();
      } else if (target.dataset.profileAction === 'help') {
        closeProfileMenu();
        window.alert('Notely Help: choose a tool from Workspace, or ask Notely Assistant from the home screen.');
      } else if (target.dataset.profileAction === 'logout') {
        if (typeof SS !== 'undefined' && SS.logout) SS.logout();
      }
    });
    document.addEventListener('click', function (event) {
      if (!menu.contains(event.target) && !event.target.closest('.nw-user')) closeProfileMenu();
    });
  }
  function closeProfileMenu() {
    var menu = document.getElementById('nchProfileMenu');
    if (menu) menu.classList.remove('is-open');
    var userButton = document.querySelector('.nw-user');
    if (userButton) userButton.setAttribute('aria-expanded', 'false');
    menuOpen = false;
  }
  function syncHomeState() {
    var homeButton = sidebar.querySelector('[data-view="overview"]');
    var isHome = !!(homeButton && homeButton.classList.contains('active'));
    if (shell) shell.classList.toggle('nch-on-home', isHome);
    if (isHome) {
      if (!homeRendered || !root.querySelector('.nch-home')) renderHome();
      document.body.classList.add('nch-home-active');
      if (!activityLoaded && !activityLoading) refreshActivity();
    } else {
      document.body.classList.remove('nch-home-active');
      homeRendered = false;
      activityLoaded = false;
    }
    var launcher = document.getElementById('nwAssistantLauncher');
    if (launcher) launcher.hidden = isHome;
    var panel = document.getElementById('nwAssistantPanel');
    if (panel && isHome) panel.hidden = true;
  }

  document.addEventListener('click', function (event) {
    var chat = event.target.closest('[data-home-chat]');
    if (chat) {
      event.preventDefault();
      recordActivity('chat', chat.dataset.homeChat);
      openChat(chat.dataset.homeChat);
      return;
    }
    var note = event.target.closest('.nch-home [data-note-id]');
    if (note && window.NotelyWorkspace) {
      event.preventDefault();
      recordActivity('note', note.dataset.noteId);
      window.NotelyWorkspace.openNote(note.dataset.noteId);
      return;
    }
    var topic = event.target.closest('.nch-home [data-topic-open]');
    if (topic && window.NotelyWorkspace) {
      event.preventDefault();
      recordActivity('topic', topic.dataset.topicOpen);
      window.NotelyWorkspace.openTopic(topic.dataset.topicOpen);
      return;
    }
    var file = event.target.closest('.nch-home [data-file-open]');
    if (file && window.NotelyWorkspace) {
      event.preventDefault();
      recordActivity('file', file.dataset.fileOpen);
      window.NotelyWorkspace.openDocument(file.dataset.fileOpen);
      return;
    }
    var sidebarNote = event.target.closest('[data-sidebar-note]');
    if (sidebarNote && window.NotelyWorkspace) {
      event.preventDefault();
      recordActivity('note', sidebarNote.dataset.sidebarNote);
      window.NotelyWorkspace.openNote(sidebarNote.dataset.sidebarNote);
      return;
    }
    var sidebarTopic = event.target.closest('[data-sidebar-topic]');
    if (sidebarTopic && window.NotelyWorkspace) {
      event.preventDefault();
      recordActivity('topic', sidebarTopic.dataset.sidebarTopic);
      window.NotelyWorkspace.openTopic(sidebarTopic.dataset.sidebarTopic);
      return;
    }
    var sidebarFile = event.target.closest('[data-sidebar-file]');
    if (sidebarFile && window.NotelyWorkspace) {
      event.preventDefault();
      recordActivity('file', sidebarFile.dataset.sidebarFile);
      window.NotelyWorkspace.openDocument(sidebarFile.dataset.sidebarFile);
      return;
    }
    var homeNav = event.target.closest('.nch-home [data-view]');
    if (homeNav && window.NotelyWorkspace) {
      event.preventDefault();
      document.body.classList.remove('nch-home-active');
      window.NotelyWorkspace.navigate(homeNav.dataset.view);
      return;
    }
    var nav = event.target.closest('[data-view]');
    if (nav && nav.dataset.view !== 'overview') {
      document.body.classList.remove('nch-home-active');
      var launcher = document.getElementById('nwAssistantLauncher');
      if (launcher) launcher.hidden = false;
    }
  });
  var newChatButton = document.getElementById('nchNewChat');
  if (newChatButton) newChatButton.addEventListener('click', function () {
    document.body.classList.remove('nch-home-active');
    if (!window.NotelyAssistant) return;
    window.NotelyAssistant.open('').then(function () {
      return window.NotelyAssistant.newChat();
    }).then(function () { window.NotelyAssistant.setMode('maximized', true); });
  });
  window.addEventListener('pageshow', function () {
    homeRendered = false;
    readProfile();
    syncHomeState();
    refreshGreeting();
  });
  window.addEventListener('focus', refreshGreeting);
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) refreshGreeting();
  });
  function refreshGreeting() {
    var greetingEl = document.querySelector('.nch-greeting');
    if (!greetingEl) return;
    var span = greetingEl.querySelector('span');
    if (span) greetingEl.firstChild.textContent = greeting() + ', ' + getName();
  }
  var observer = new MutationObserver(function () {
    window.requestAnimationFrame(syncHomeState);
  });
  observer.observe(root, { childList:true, subtree:false });
  function refreshActivity() {
    activityLoading = true;
    fetchActivity().then(function (items) {
      activity = items;
      activityLoaded = true;
      activityLoading = false;
      if (sidebar.querySelector('[data-view="overview"].active')) {
        homeRendered = false;
        renderHome();
      }
    }).catch(function () {
      activityUnavailable = true;
      activityLoaded = true;
      activityLoading = false;
      if (sidebar.querySelector('[data-view="overview"].active')) {
        homeRendered = false;
        renderHome();
      }
    });
  }
  installProfileMenu();
  readProfile();
  setTimeout(syncHomeState, 0);
})();