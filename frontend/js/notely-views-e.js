/* Notely views part 5 — Recorded lectures, Search, Settings (from Notely app) */
(function () {
  'use strict';
  var I = window.NotelyIcons.icon;
  var V = window.Views;

  V.recordedLectures = function (toast) {
    var lectures = ['Lecture 08 — Photosynthesis', 'Lecture 06 — Energy & enzymes', 'Lecture 05 — Cell membranes', 'Substitution reactions', 'The factory system'];
    var rows = lectures.map(function (l, i) {
      var meta = i < 3 ? 'Biology 101 · Oct ' + (16 - i * 3) + ' · ' + (46 - i * 4) + ' min · Transcript ready' : i === 3 ? 'Organic Chemistry · Oct 13 · 51 min' : 'World History · Oct 12 · 48 min';
      return '<button class="lecture-row" data-toast="' + l + ' selected">' + I('Mic2', 17) + '<span><strong>' + l + '</strong><small>' + meta + '</small></span>' + I('ArrowUpRight', 14) + '</button>';
    }).join('');
    var bars = '';
    for (var i = 0; i < 39; i++) {
      bars += V.el('i', i < 9 ? 'played' : '');
    }
    return V.pageHeading({ title: 'Recorded lectures', subtitle: 'Listen again. Find the moment an idea clicks.', action: '<button class="button primary" data-toast="Recording setup opened">' + I('Plus', 16) + ' Add recording</button>' }) +
      '<div class="library-tabs"><button class="selected">Biology 101</button><button>All courses</button><button>Transcript ready</button></div>' +
      '<div class="lecture-library-layout"><div>' +
      '<section class="lecture-feature"><h2>Lecture 07 — Energy & metabolism</h2><p class="eyebrow">Biology 101 · October 14, 2026</p>' +
      '<div class="waveform">' + bars + '</div><p>42 minutes · Prof. Elena Martinez</p><strong>Transcript ready</strong>' +
      '<p>Resume at 12:34 · The proton gradient and ATP synthase</p>' +
      '<button class="button primary" data-toast="Lecture playback started">' + I('Play', 14) + ' Continue listening</button></section>' +
      '<div class="lecture-list">' + rows + '</div></div>' +
      '<aside class="lecture-library-side"><div class="side-card"><h3>Keep the lecture, not the rush</h3>' +
      '<p>Upload a recording or start a new one. Notely turns it into a searchable transcript linked to your course.</p>' +
      '<button class="button primary" data-toast="Recording permission requested">' + I('Mic2', 14) + ' Record lecture</button>' +
      '<button class="button light" data-toast="Audio picker opened">' + I('UploadCloud', 14) + ' Upload audio</button>' +
      '<small>Always get permission before recording a class.</small></div>' +
      '<div class="side-card"><h3>Connected learning</h3>' + V.sourceMini('Cellular respiration', 'Linked to Lecture 07 · 3 timestamps') +
      '<p>Jump from a note to the exact moment it was explained.</p></div></aside></div>';
  };

  V.search = function (toast) {
    var results = [
      { type: 'Note', title: 'Cellular respiration', meta: 'Biology 101 · Lecture 07 · October 14, 2026', excerpt: '“Cellular respiration is a catabolic pathway: glucose is oxidized and oxygen is reduced.”', icon: 'PenLine' },
      { type: 'Material', title: 'Ch. 9 — Cellular respiration', meta: 'Biology 101 · PDF · 18 pages · 6 annotations', excerpt: 'Page 7: Oxygen is the final electron acceptor in the electron transport chain.', icon: 'FileText' },
      { type: 'Lecture', title: 'Lecture 07 — Energy & metabolism', meta: 'Biology 101 · 42 min · Transcript ready', excerpt: '12:34: “The ETC builds that gradient; ATP synthase lets protons flow back...”', icon: 'Mic2' },
      { type: 'Flashcard', title: 'What is the final electron acceptor?', meta: 'Biology 101 · Energy & metabolism · Card 7 of 24', excerpt: 'Oxygen (O₂). It accepts electrons and combines with H⁺ to form water.', icon: 'Layers3' },
      { type: 'Task', title: 'Lab report: yeast respiration', meta: 'Biology 101 · Due October 17, 2026', excerpt: 'Compare aerobic and anaerobic respiration. Explain the relationship to ATP yield.', icon: 'Check' },
      { type: 'Note', title: 'Lab: yeast respiration', meta: 'Biology 101 · Lab notes · October 15, 2026', excerpt: 'Measure CO₂ production to compare rates of cellular respiration.', icon: 'PenLine' }
    ];
    var rows = results.map(function (r) {
      return '<button class="search-result" data-toast="Opening ' + r.title + '"><span class="result-icon">' + I(r.icon, 16) + '</span>' +
        '<span><em>' + r.type + '</em><h2>' + r.title + '</h2><small>' + r.meta + '</small><p>' + r.excerpt + '</p></span></button>';
    }).join('');
    var filters = '<p class="eyebrow">Course</p>' + ['Biology 101', 'Organic Chemistry', 'World History'].map(function (f, i) {
      return '<label class="filter-check"><input type="checkbox"' + (i === 0 ? ' checked' : '') + '>' + f + '</label>';
    }).join('') + '<p class="eyebrow filter-label">Updated</p>' + ['Any time', 'This week', 'This month'].map(function (f, i) {
      return '<label class="filter-check"><input type="radio" name="updated"' + (i === 0 ? ' checked' : '') + '>' + f + '</label>';
    }).join('');
    return V.pageHeading({ title: 'Search your workspace', subtitle: 'Follow an idea across everything you’re learning.' }) +
      '<div class="search-input">' + I('Search', 18) + '<input value="respiration" aria-label="Search query">' + I('X', 16) + '</div>' +
      '<div class="search-tabs"><strong>All · 6</strong><span>Notes · 2</span><span>Materials · 1</span><span>Lectures · 1</span><span>Flashcards · 1</span><span>Tasks · 1</span></div>' +
      '<div class="search-layout"><div><p class="eyebrow">6 results · Sorted by relevance</p><div class="search-results">' + rows + '</div></div>' +
      '<aside class="search-side"><div class="side-card"><h3>Narrow your search</h3>' + filters + '</div>' +
      '<div class="side-card connect-card"><h3>Connect these sources</h3>' +
      '<p>Use the floating Notely Assistant from the main workspace when you need help, without opening a separate chat page.</p></div></aside></div>';
  };

  V.settings = function (toast) {
    function field(label, value, wide) { return '<label class="field' + (wide ? ' wide' : '') + '"><span>' + label + '</span><input value="' + value + '"></label>'; }
    function toggle(label, detail, on) { return '<div class="toggle-row"><div><strong>' + label + '</strong><span>' + detail + '</span></div><button class="toggle' + (on ? ' on' : '') + '" aria-label="Toggle ' + label + '"><i /></button></div>'; }
    function panel(title, body) { return '<section class="settings-panel"><h2>' + title + '</h2>' + body + '</section>'; }
    var nav = ['Profile', 'Study preferences', 'Notifications', 'Privacy & AI', 'Connected accounts']
      .map(function (item, i) { return '<button' + (i === 0 ? ' class="active"' : '') + '>' + item + '</button>'; }).join('');
    return V.pageHeading({ title: 'Account & settings', subtitle: 'A workspace that fits the way you study.' }) +
      '<div class="settings-layout"><div class="settings-nav">' + nav +
      '<button class="button light" data-settings-action="logout">Sign out</button></div>' +
      '<div class="settings-panels">' +
      panel('Student profile', '<div class="profile-heading"><div class="avatar">JL</div><div><h3>Jamie Lee</h3><p>Student workspace · Fall semester 2026</p></div></div>' +
        '<div class="form-grid">' + field('Full name', 'Jamie Lee') + field('Student email', 'jamie.lee@university.edu') + field('Semester', 'Fall semester 2026', true) + '</div>' +
        '<button class="button primary" data-settings-action="save-profile">Save profile</button>') +
      panel('Study preferences', '<div class="form-grid">' + field('Daily study goal', '30 minutes') + field('Week starts on', 'Monday') + field('Default notebook', 'Biology 101', true) + '</div>' +
        toggle('Spaced repetition', 'Show due cards first in study sessions.', true) +
        toggle('Gentle study reminders', 'Weekdays at 6:00 PM', true)) +
      panel('Notifications', toggle('Coursework deadlines', 'Remind me 1 day before a task is due.', true) +
        toggle('Calendar events', 'Notify me 15 minutes before study sessions.', true) +
        toggle('Weekly study summary', 'Email a short reflection every Sunday.', false)) +
      panel('Privacy & AI', toggle('Use course sources for AI answers', 'Cite your notes, materials, and lecture transcripts.', true) +
        '<p class="privacy-note">Your notes are private and aren’t used to train AI models. Review generated study materials before saving them.</p>' +
        '<button class="button light" data-settings-action="export">Export my workspace</button>') +
      '</div></div>';
  };
})();
