/* =====================================================================
   Notely  -  onboarding.js
   ---------------------------------------------------------------------
   Beautiful multi-step onboarding wizard shown ONCE after a successful login or signup. Collects education level,
   study goal, interests, daily time, learning style, experience and
   lightweight account/security preferences. Answers are persisted to
   the backend (PUT /api/auth/settings, category "onboarding") and
   mirrored in localStorage so the wizard never re-appears.

   NOTE: no passwords / banking / IDs are ever asked here.
   ===================================================================== */

(function () {
  'use strict';

  var LS_KEY = 'ainb_onboarded';

  // Only run on the dashboard, for authed users who haven't onboarded.
  if (!/^\/dashboard/.test(location.pathname)) return;

  document.addEventListener('DOMContentLoaded', function () {
    if (localStorage.getItem(LS_KEY) === '1') return;

    if (!SS.isAuthed()) { window.location.replace('/login'); return; }
    checkServer();

    function checkServer() {
      SS.api('/api/auth/settings')
        .then(function (s) {
          if (s && s.onboarding && s.onboarding.completed) {
            localStorage.setItem(LS_KEY, '1');
            return;
          }
          open();
        })
        .catch(function () { open(); }); // older backend → still show once
    }
  });

  /* =====================================================================
     STEP DEFINITIONS
     ===================================================================== */
  var user = (typeof SS !== 'undefined' && SS.getUser) ? SS.getUser() : {};

  var steps = [
    {
      key: 'education',
      emoji: '🎓',
      title: 'What best describes you?',
      sub: 'We tailor explanations and difficulty to your level.',
      type: 'single',
      options: [
        ['🏫', 'School'], ['📖', 'High School'], ['🎒', 'College'],
        ['🏛️', 'University'], ['🚀', 'Self Learner'],
      ],
    },
    {
      key: 'goal',
      emoji: '🎯',
      title: 'What is your primary study goal?',
      sub: 'Pick the one that matters most right now.',
      type: 'single',
      options: [
        ['📝', 'Crack Exams'], ['💻', 'Learn Programming'], ['⚡', 'Improve Coding'],
        ['🤖', 'AI & Machine Learning'], ['🏛️', 'UPSC'], ['📐', 'JEE'],
        ['🩺', 'NEET'], ['🔧', 'GATE'], ['🔬', 'Research'],
        ['🗣️', 'Language Learning'], ['🛠️', 'Skill Development'], ['⏱️', 'Productivity'],
        ['🌍', 'General Knowledge'], ['📈', 'Career Growth'],
      ],
    },
    {
      key: 'interests',
      emoji: '💡',
      title: 'Pick your study interests',
      sub: 'Choose as many as you like — we use these for recommendations.',
      type: 'multi',
      chips: true,
      options: [
        'Programming', 'AI', 'Math', 'Physics', 'Chemistry', 'Biology',
        'History', 'Geography', 'Business', 'Finance', 'Cybersecurity',
        'Design', 'Writing', 'Languages', 'Engineering', 'Medical',
        'Data Science', 'Cloud Computing', 'DevOps', 'Web Development',
        'Mobile Development',
      ].map(function (t) { return ['', t]; }),
    },
    {
      key: 'daily_time',
      emoji: '⏰',
      title: 'How much time can you study daily?',
      sub: 'We will size study plans and goals accordingly.',
      type: 'single',
      cols1: true,
      options: [
        ['🌙', 'Less than 1 hour'], ['☕', '1–2 hours'], ['📚', '2–4 hours'],
        ['🔥', '4–6 hours'], ['🏆', '6+ hours'],
      ],
    },
    {
      key: 'learning_style',
      emoji: '🧠',
      title: 'How do you learn best?',
      sub: 'Select every style that works for you.',
      type: 'multi',
      options: [
        ['📖', 'Reading'], ['🎬', 'Videos'], ['💬', 'Interactive AI'],
        ['✍️', 'Practice Questions'], ['🗺️', 'Mind Maps'], ['🃏', 'Flashcards'],
        ['🧪', 'Projects'],
      ],
    },
    {
      key: 'experience',
      emoji: '📊',
      title: 'Your experience level?',
      sub: 'Be honest — we will meet you where you are.',
      type: 'single',
      cols1: true,
      options: [
        ['🌱', 'Beginner'], ['🌿', 'Intermediate'], ['🌳', 'Advanced'],
      ],
    },
    {
      key: 'account',
      emoji: '🔐',
      title: 'Personalize & secure your account',
      sub: 'All fields are optional. We never ask for passwords or sensitive IDs here.',
      type: 'account',
    },
  ];

  var answers = {};
  var stepIdx = 0;
  var overlay, lastDir = 'fwd';

  /* =====================================================================
     RENDERING
     ===================================================================== */
  function open() {
    overlay = document.createElement('div');
    overlay.className = 'ob-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Welcome to Notely — quick setup');
    overlay.innerHTML =
      '<section class="ob-modal" id="obModal">' +
        '<header class="ob-head">' +
          '<span class="ob-brand"><img src="/assets/logo-192.png" alt="" /> Notely</span>' +
          '<button class="ob-skip" id="obSkip" type="button">Skip for now</button>' +
        '</header>' +
        '<div class="ob-progress" id="obProgress" aria-hidden="true">' +
          steps.map(function () { return '<span></span>'; }).join('') +
        '</div>' +
        '<div class="ob-body" id="obBody"></div>' +
        '<footer class="ob-foot">' +
          '<button class="ob-back" id="obBack" type="button"><i class="fas fa-arrow-left" aria-hidden="true"></i> Back</button>' +
          '<button class="ob-next" id="obNext" type="button">Continue <i class="fas fa-arrow-right" aria-hidden="true"></i></button>' +
        '</footer>' +
      '</section>';
    document.body.appendChild(overlay);
    requestAnimationFrame(function () { overlay.classList.add('show'); });

    document.getElementById('obSkip').addEventListener('click', function () { finish(true); });
    document.getElementById('obBack').addEventListener('click', function () { go(-1); });
    document.getElementById('obNext').addEventListener('click', function () { next(); });
    overlay.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.target.matches('input, button')) next();
    });

    renderStep();
  }

  function renderStep() {
    var s = steps[stepIdx];
    var body = document.getElementById('obBody');
    var html = '<div class="ob-step' + (lastDir === 'back' ? ' back' : '') + '">' +
      '<span class="ob-emoji" aria-hidden="true">' + s.emoji + '</span>' +
      '<h2>' + s.title + '</h2>' +
      '<p class="ob-sub">' + s.sub + '</p>';

    if (s.type === 'single' || s.type === 'multi') {
      var cls = 'ob-options' + (s.cols1 ? ' cols-1' : '') + (s.chips ? ' chips' : '');
      html += '<div class="' + cls + '" role="' + (s.type === 'multi' ? 'group' : 'radiogroup') + '">';
      s.options.forEach(function (o) {
        var em = o[0], label = o[1];
        var sel = s.type === 'multi'
          ? (answers[s.key] || []).indexOf(label) > -1
          : answers[s.key] === label;
        html += '<button type="button" class="ob-opt' + (sel ? ' selected' : '') + '" data-val="' + esc(label) + '" ' +
          'role="' + (s.type === 'multi' ? 'checkbox' : 'radio') + '" aria-checked="' + sel + '">' +
          (em ? '<span class="oe" aria-hidden="true">' + em + '</span>' : '') +
          esc(label) + '</button>';
      });
      html += '</div>';
    } else if (s.type === 'account') {
      var a = answers.account || {};
      html +=
        '<div class="ob-fields">' +
          '<div class="ob-field"><label for="obName">Display name</label>' +
            '<input type="text" id="obName" maxlength="60" autocomplete="name" value="' + esc(a.display_name != null ? a.display_name : (user.name || '')) + '" /></div>' +
          '<div class="ob-field"><label for="obRecovery">Recovery email <span style="font-weight:400">(optional)</span></label>' +
            '<input type="email" id="obRecovery" autocomplete="email" placeholder="backup@example.com" value="' + esc(a.recovery_email || '') + '" /></div>' +
          '<div class="ob-field"><label for="obPhone">Phone number <span style="font-weight:400">(optional)</span></label>' +
            '<input type="tel" id="obPhone" autocomplete="tel" placeholder="+1 555 000 0000" value="' + esc(a.phone || '') + '" /></div>' +
        '</div>' +
        '<div class="ob-switches">' +
          sw('obTfa', '🛡️ Two-Factor Authentication', 'Get a code by email when logging in', a.two_factor) +
          sw('obSync', '☁️ Data sync', 'Keep notes & progress synced across devices', a.data_sync !== false) +
          sw('obNotif', '🔔 Study reminders', 'Gentle nudges to keep your streak alive', a.notifications !== false) +
          sw('obPriv', '🕶️ Private analytics only', 'Never share usage data beyond anonymous stats', a.privacy !== false) +
        '</div>';
    }

    html += '</div>';
    body.innerHTML = html;
    body.scrollTop = 0;

    // progress
    var dots = document.querySelectorAll('#obProgress span');
    dots.forEach(function (d, i) {
      d.className = i < stepIdx ? 'done' : i === stepIdx ? 'current' : '';
    });

    // footer
    document.getElementById('obBack').disabled = stepIdx === 0;
    var nextBtn = document.getElementById('obNext');
    nextBtn.innerHTML = stepIdx === steps.length - 1
      ? 'Finish setup <i class="fas fa-check" aria-hidden="true"></i>'
      : 'Continue <i class="fas fa-arrow-right" aria-hidden="true"></i>';
    nextBtn.disabled = !isStepComplete(s);
    nextBtn.setAttribute('aria-disabled', String(nextBtn.disabled));

    // option handlers
    var s2 = steps[stepIdx];
    body.querySelectorAll('.ob-opt').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var val = btn.dataset.val;
        if (s2.type === 'multi') {
          var arr = answers[s2.key] || (answers[s2.key] = []);
          var i = arr.indexOf(val);
          if (i > -1) arr.splice(i, 1); else arr.push(val);
          btn.classList.toggle('selected');
          btn.setAttribute('aria-checked', btn.classList.contains('selected'));
        } else {
          answers[s2.key] = val;
          body.querySelectorAll('.ob-opt').forEach(function (b) {
            b.classList.toggle('selected', b === btn);
            b.setAttribute('aria-checked', b === btn);
          });
        }
        var nextBtn = document.getElementById('obNext');
        nextBtn.disabled = !isStepComplete(s2);
        nextBtn.setAttribute('aria-disabled', String(nextBtn.disabled));
      });
    });
  }

  function isStepComplete(step) {
    if (!step || step.type === 'account') return true;
    var answer = answers[step.key];
    return step.type === 'multi'
      ? Array.isArray(answer) && answer.length > 0
      : typeof answer === 'string' && answer.trim().length > 0;
  }

  function sw(id, title, sub, on) {
    return '<label class="ob-switch" for="' + id + '">' +
      '<span class="st"><b>' + title + '</b><span>' + sub + '</span></span>' +
      '<input type="checkbox" id="' + id + '"' + (on ? ' checked' : '') + ' />' +
      '<span class="track" aria-hidden="true"></span>' +
    '</label>';
  }

  function collectAccount() {
    answers.account = {
      display_name: (document.getElementById('obName') || {}).value || '',
      recovery_email: (document.getElementById('obRecovery') || {}).value || '',
      phone: (document.getElementById('obPhone') || {}).value || '',
      two_factor: !!(document.getElementById('obTfa') || {}).checked,
      data_sync: !!(document.getElementById('obSync') || {}).checked,
      notifications: !!(document.getElementById('obNotif') || {}).checked,
      privacy: !!(document.getElementById('obPriv') || {}).checked,
    };
  }

  function go(dir) {
    if (steps[stepIdx].type === 'account') collectAccount();
    lastDir = dir > 0 ? 'fwd' : 'back';
    stepIdx = Math.max(0, Math.min(steps.length - 1, stepIdx + dir));
    renderStep();
  }

  function next() {
    var s = steps[stepIdx];
    if (!isStepComplete(s)) {
      var body = document.getElementById('obBody');
      if (body) body.classList.remove('ob-needs-selection');
      requestAnimationFrame(function () {
        if (body) body.classList.add('ob-needs-selection');
      });
      return;
    }
    if (s.type === 'account') collectAccount();
    if (stepIdx === steps.length - 1) return finish(false);
    go(1);
  }

  /* =====================================================================
     FINISH — save + show summary + close
     ===================================================================== */
  function finish(skipped) {
    localStorage.setItem(LS_KEY, '1');

    var payload = {
      completed: true,
      skipped: !!skipped,
      completed_at: new Date().toISOString(),
      education: answers.education || null,
      goal: answers.goal || null,
      interests: answers.interests || [],
      daily_time: answers.daily_time || null,
      learning_style: answers.learning_style || [],
      experience: answers.experience || null,
      account: answers.account || {},
    };
    try { localStorage.setItem('ainb_onboarding', JSON.stringify(payload)); } catch (e) {}

    // Persist to backend (best effort).
    SS.api('/api/auth/settings', {
      method: 'PUT',
      body: { category: 'onboarding', data: payload },
    }).catch(function () {});

    // Update display name if changed.
    var newName = payload.account && payload.account.display_name;
    if (!skipped && newName && newName.trim() && newName.trim() !== (user.name || '')) {
      SS.api('/api/auth/profile', { method: 'PUT', body: { name: newName.trim() } })
        .then(function (d) {
          if (d && d.user) SS.setSession(SS.getToken(), d.user);
          var el = document.getElementById('userName');
          if (el) el.textContent = newName.trim().split(' ')[0];
        })
        .catch(function () {});
    }

    if (skipped) return close();

    // Done screen
    var body = document.getElementById('obBody');
    var chips = []
      .concat(payload.education ? [payload.education] : [])
      .concat(payload.goal ? [payload.goal] : [])
      .concat((payload.interests || []).slice(0, 4))
      .concat(payload.daily_time ? [payload.daily_time] : []);
    body.innerHTML =
      '<div class="ob-step"><div class="ob-done">' +
        '<div class="ob-check"><i class="fas fa-check" aria-hidden="true"></i></div>' +
        '<h2>You\u2019re all set! 🎉</h2>' +
        '<p class="ob-sub">Notely is now personalized for you.</p>' +
        (chips.length ? '<div class="ob-summary">' + chips.map(function (c) { return '<span>' + esc(c) + '</span>'; }).join('') + '</div>' : '') +
      '</div></div>';
    document.querySelectorAll('#obProgress span').forEach(function (d) { d.className = 'done'; });
    document.getElementById('obBack').disabled = true;
    var nextBtn = document.getElementById('obNext');
    nextBtn.innerHTML = 'Start learning <i class="fas fa-rocket" aria-hidden="true"></i>';
    nextBtn.onclick = close;
    document.getElementById('obSkip').style.display = 'none';
    if (window.launchConfetti) { try { window.launchConfetti(); } catch (e) {} }
  }

  function close() {
    if (!overlay) return;
    overlay.classList.add('hide');
    setTimeout(function () { overlay.remove(); }, 380);
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
})();
