/* Server-verified trial badge and expiry hand-off for the web workspace. */
(function () {
  'use strict';
  var KEY = 'notely-trial-device';
  var ACTIVE = 'notely-trial-active';
  var EXPIRY = 'notely-trial-expires';

  function getToken() { try { return localStorage.getItem(KEY) || ''; } catch (_) { return ''; } }
  function idbToken() {
    return new Promise(function (resolve) {
      if (!window.indexedDB) return resolve('');
      var request;
      try { request = indexedDB.open('notely-trial-db', 1); } catch (_) { return resolve(''); }
      request.onupgradeneeded = function () { if (!request.result.objectStoreNames.contains('identity')) request.result.createObjectStore('identity'); };
      request.onerror = function () { resolve(''); };
      request.onsuccess = function () {
        var database = request.result;
        try {
          var get = database.transaction('identity', 'readonly').objectStore('identity').get('device-token');
          get.onsuccess = function () { var value = get.result || ''; database.close(); resolve(value); };
          get.onerror = function () { database.close(); resolve(''); };
        } catch (_) { database.close(); resolve(''); }
      };
    });
  }
  async function saveToken(token) {
    if (!token) return;
    try { localStorage.setItem(KEY, token); } catch (_) {}
    if (!window.indexedDB) return;
    try {
      await new Promise(function (resolve) {
        var open = indexedDB.open('notely-trial-db', 1);
        open.onupgradeneeded = function () { if (!open.result.objectStoreNames.contains('identity')) open.result.createObjectStore('identity'); };
        open.onerror = function () { resolve(); };
        open.onsuccess = function () {
          var db = open.result;
          var tx = db.transaction('identity', 'readwrite');
          tx.objectStore('identity').put(token, 'device-token');
          tx.oncomplete = function () { db.close(); resolve(); };
          tx.onerror = function () { db.close(); resolve(); };
        };
      });
    } catch (_) {}
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

  async function run() {
    if (!window.SS || typeof SS.getToken !== 'function' || SS.getToken()) return;
    var token = getToken() || await idbToken();
    var headers = { 'Content-Type': 'application/json' };
    if (token) headers['X-Notely-Device'] = token;
    var response, data = {};
    try {
      response = await fetch(apiUrl('/api/trial/status'), {
        method: 'POST', headers: headers, credentials: 'include', cache: 'no-store',
        body: JSON.stringify({ device_token: token || undefined, fingerprint: '' })
      });
      data = await response.json();
    } catch (_) { return; }
    if (data.device_token) token = data.device_token;
    await saveToken(token);
    var badge = document.getElementById('nwTrialBadge');
    if (data.status === 'active') {
      try {
        localStorage.setItem(ACTIVE, '1');
        if (data.expires_at) localStorage.setItem(EXPIRY, data.expires_at);
      } catch (_) {}
      if (badge) {
        var days = Math.max(1, Number(data.days_left) || 1);
        badge.textContent = days + (days === 1 ? ' day left' : ' days left');
        badge.title = 'Your trial expires ' + (data.expires_at || 'in seven days');
        badge.hidden = false;
      }
      var name = document.getElementById('nwUserName');
      if (name) name.textContent = 'Your trial';
      var avatar = document.querySelector('.nw-avatar');
      if (avatar) avatar.textContent = '✦';
    } else if (data.status === 'expired' && !SS.getToken()) {
      try { localStorage.removeItem(ACTIVE); } catch (_) {}
      window.location.replace('/signup?trial=expired');
    } else if (data.status === 'converted') {
      try { localStorage.removeItem(ACTIVE); } catch (_) {}
      window.location.replace('/login');
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, { once: true });
  else run();
})();
