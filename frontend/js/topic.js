/* =====================================================================
   Notely — topic.js
   The Topic Workspace (AI Learning OS).
   URL: /topic?id=123  or  /topic?t=Machine%20Learning (creates/reuses)
   Tabs: overview · summary · notes · mindmap · roadmap · timeline ·
         quiz · flashcards · compare · practice · chat · resources
   Every section is generated on demand, cached server-side, and
   rendered with premium interactive UI.
   ===================================================================== */

(function () {
  'use strict';

  /* ---------- markdown setup ---------- */
  marked.setOptions({
    breaks: true,
    highlight(code, lang) {
      try {
        if (lang && hljs.getLanguage(lang)) return hljs.highlight(code, { language: lang }).value;
        return hljs.highlightAuto(code).value;
      } catch { return code; }
    },
  });
  function md(text) { return DOMPurify.sanitize(marked.parse(text || '')); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  /* ---------- state ---------- */
  const params = new URLSearchParams(location.search);
  let topicId = parseInt(params.get('id') || '0', 10) || null;
  const topicQuery = (params.get('t') || '').trim();
  let topic = null;                 // {id,title,emoji,pinned,favorite,progress,sections}
  const cache = {};                 // kind -> rendered content payload
  const loading = {};               // kind -> bool

  const MD_KINDS = ['overview', 'summary', 'notes', 'practice', 'resources'];

  const TAB_META = {
    overview:  { icon: 'fa-eye',               title: 'AI Overview',   desc: 'Definition, key concepts and why this topic matters — a perfect starting point.' },
    summary:   { icon: 'fa-align-left',        title: 'Deep AI Summary', desc: 'History, how it works, pros & cons, applications, FAQ and more — the full picture.' },
    notes:     { icon: 'fa-note-sticky',       title: 'AI Notes',      desc: 'Professional study notes with definitions, examples and a revision summary.' },
    mindmap:   { icon: 'fa-diagram-project',   title: 'AI Mind Map',   desc: 'An interactive, expandable mind map. Zoom, pan and click nodes to explore.' },
    roadmap:   { icon: 'fa-route',             title: 'AI Roadmap',    desc: 'Beginner → Expert learning path with topics, projects and progress tracking.' },
    timeline:  { icon: 'fa-timeline',          title: 'AI Timeline',   desc: 'The chronological story: key events, discoveries and evolution over time.' },
    quiz:      { icon: 'fa-clipboard-question', title: 'AI Quiz',      desc: 'MCQ, true/false and fill-in-the-blank questions at your chosen difficulty.' },
    flashcards:{ icon: 'fa-layer-group',       title: 'AI Flashcards', desc: 'Flip-card revision deck generated from this topic. Bookmark the tricky ones.' },
    compare:   { icon: 'fa-scale-balanced',    title: 'AI Compare',    desc: 'Compare this topic side-by-side with anything else — table, pros/cons, verdict.' },
    practice:  { icon: 'fa-dumbbell',          title: 'AI Practice',   desc: 'Exercises, assignments, mini projects and real-world challenges.' },
    chat:      { icon: 'fa-comments',          title: 'AI Chat',       desc: 'A dedicated AI tutor that understands this topic.' },
    resources: { icon: 'fa-book-open',         title: 'AI Resources',  desc: 'Docs, books, courses, videos and repositories worth your time.' },
  };

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.prototype.slice.call((root || document).querySelectorAll(sel));
  const panel = (kind) => $('.topic-panel[data-panel="' + kind + '"]');

  /* ---------- boot ---------- */
  async function boot() {
    try {
      if (!SS.isAuthed()) { window.location.replace('/login'); return; }
      if (!topicId && topicQuery) {
        const res = await SS.api('/api/topics', { method: 'POST', body: { title: topicQuery } });
        topicId = res.topic.id;
        history.replaceState(null, '', '/topic?id=' + topicId);
      }
      if (!topicId) { location.href = '/dashboard'; return; }
      const res = await SS.api('/api/topics/' + topicId);
      topic = res.topic;
      renderHeader();
      markGeneratedTabs();
      bindTabs();
      bindHeaderActions();
      // Open tab from hash or default to overview.
      const hash = (location.hash || '').replace('#', '');
      openTab(TAB_META[hash] ? hash : 'overview');
    } catch (err) {
      SS.toast(err.message || 'Failed to load topic', 'error');
    }
  }

  function renderHeader() {
    $('#topicEmoji').textContent = topic.emoji || '📚';
    const h1 = $('#topicTitle');
    h1.classList.remove('skeleton');
    h1.textContent = topic.title;
    document.title = topic.title + ' · Notely';
    updateFlagButtons();
  }

  function updateFlagButtons() {
    const pinBtn = $('#pinTopicBtn'), favBtn = $('#favTopicBtn');
    pinBtn.classList.toggle('on-pin', !!topic.pinned);
    favBtn.classList.toggle('on', !!topic.favorite);
    favBtn.innerHTML = '<i class="' + (topic.favorite ? 'fas' : 'far') + ' fa-star"></i>';
  }

  function markGeneratedTabs() {
    (topic.sections || []).forEach((s) => {
      const tab = $('.topic-tab[data-tab="' + s.kind + '"]');
      if (tab) tab.classList.add('has-content');
    });
  }

  /* ---------- tabs ---------- */
  function bindTabs() {
    $$('.topic-tab').forEach((tab) => {
      tab.addEventListener('click', () => openTab(tab.dataset.tab));
    });
  }

  function openTab(kind) {
    $$('.topic-tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === kind));
    $$('.topic-panel').forEach((p) => p.classList.toggle('active', p.dataset.panel === kind));
    history.replaceState(null, '', '/topic?id=' + topicId + '#' + kind);
    initPanel(kind);
  }

  function initPanel(kind) {
    const p = panel(kind);
    if (!p || p.dataset.init) return;
    p.dataset.init = '1';
    if (MD_KINDS.indexOf(kind) !== -1) return initMdPanel(kind, true);
    if (kind === 'mindmap') return initGenPanel(kind, renderMindmap);
    if (kind === 'roadmap') return initGenPanel(kind, renderRoadmap);
    if (kind === 'timeline') return initGenPanel(kind, renderTimeline);
    if (kind === 'quiz') return initQuizPanel();
    if (kind === 'flashcards') return initGenPanel(kind, renderFlashcards);
    if (kind === 'compare') return initComparePanel();
    if (kind === 'chat') return initChatPanel();
  }

  function hasCachedSection(kind) {
    return (topic.sections || []).some((s) => s.kind === kind);
  }

  /* ---------- shared UI builders ---------- */
  function emptyStateHtml(kind, btnLabel) {
    const m = TAB_META[kind];
    return '<div class="gen-empty">' +
      '<span class="ge-ic"><i class="fas ' + m.icon + '"></i></span>' +
      '<h3>' + esc(m.title) + '</h3><p>' + esc(m.desc) + '</p>' +
      '<button class="btn gen-btn" data-kind="' + kind + '"><i class="fas fa-wand-magic-sparkles"></i> ' +
      esc(btnLabel || ('Generate ' + m.title)) + '</button></div>';
  }

  function loadingHtml(label) {
    let bars = '';
    for (let i = 0; i < 7; i++) bars += '<div class="gl-bar" style="width:' + (60 + Math.random() * 38) + '%"></div>';
    return '<div class="gen-loading">' +
      '<div class="gl-status"><i class="fas fa-wand-magic-sparkles fa-fade"></i> ' + esc(label || 'AI is generating…') + '</div>' +
      bars + '</div>';
  }

  function toolbarHtml(kind, extra) {
    return '<div class="panel-toolbar">' + (extra || '') +
      '<button class="btn-mini regen-btn" data-kind="' + kind + '"><i class="fas fa-rotate"></i> Regenerate</button></div>';
  }

  async function generate(kind, body, refresh) {
    const url = '/api/topics/' + topicId + '/generate/' + kind + (refresh ? '?refresh=1' : '');
    const res = await SS.api(url, { method: 'POST', body: body || {} });
    const tab = $('.topic-tab[data-tab="' + kind + '"]');
    if (tab) tab.classList.add('has-content');
    return res.content;
  }

  /* ---------- markdown panels (overview/summary/notes/practice/resources) ---------- */
  function initMdPanel(kind, autoIfCached) {
    const p = panel(kind);
    const load = async (refresh) => {
      if (loading[kind]) return;
      loading[kind] = true;
      p.innerHTML = loadingHtml('AI is writing your ' + TAB_META[kind].title.toLowerCase() + '…');
      try {
        const content = await generate(kind, {}, refresh);
        cache[kind] = content;
        p.innerHTML = toolbarHtml(kind,
          '<button class="btn-mini copy-btn" data-kind="' + kind + '"><i class="fas fa-copy"></i> Copy</button>') +
          '<article class="md-article">' + md(content) + '</article>';
        p.querySelectorAll('pre code').forEach((b) => { try { hljs.highlightElement(b); } catch {} });
        bindPanelButtons(p, kind, load);
      } catch (err) {
        p.innerHTML = emptyStateHtml(kind);
        bindPanelButtons(p, kind, load);
        SS.toast(err.message || 'Generation failed', 'error');
      } finally { loading[kind] = false; }
    };
    if (kind === 'overview' || (autoIfCached && hasCachedSection(kind))) {
      load(false); // auto-generate overview; auto-load cached others
    } else {
      p.innerHTML = emptyStateHtml(kind);
      bindPanelButtons(p, kind, load);
    }
  }

  function bindPanelButtons(p, kind, load) {
    const gen = p.querySelector('.gen-btn');
    if (gen) gen.addEventListener('click', () => load(false));
    const regen = p.querySelector('.regen-btn');
    if (regen) regen.addEventListener('click', () => load(true));
    const copy = p.querySelector('.copy-btn');
    if (copy) copy.addEventListener('click', () => {
      navigator.clipboard.writeText(cache[kind] || '').then(
        () => SS.toast('Copied to clipboard'),
        () => SS.toast('Copy failed', 'error'));
    });
  }

  /* ---------- generic JSON panels ---------- */
  function initGenPanel(kind, renderer) {
    const p = panel(kind);
    const load = async (refresh) => {
      if (loading[kind]) return;
      loading[kind] = true;
      p.innerHTML = loadingHtml('AI is building your ' + TAB_META[kind].title.toLowerCase() + '…');
      try {
        const data = await generate(kind, {}, refresh);
        cache[kind] = data;
        renderer(p, data, load);
      } catch (err) {
        p.innerHTML = emptyStateHtml(kind);
        bindPanelButtons(p, kind, load);
        SS.toast(err.message || 'Generation failed', 'error');
      } finally { loading[kind] = false; }
    };
    if (hasCachedSection(kind)) load(false);
    else {
      p.innerHTML = emptyStateHtml(kind);
      bindPanelButtons(p, kind, load);
    }
  }

  /* =====================================================================
     MIND MAP — pure SVG, zoom/pan/expand/collapse/click-to-explain
     ===================================================================== */
  function renderMindmap(p, tree, load) {
    p.innerHTML = toolbarHtml('mindmap') +
      '<div class="mindmap-shell" id="mmShell">' +
        '<svg class="mindmap-svg" id="mmSvg"></svg>' +
        '<div class="mindmap-controls">' +
          '<button id="mmZoomIn" aria-label="Zoom in"><i class="fas fa-plus"></i></button>' +
          '<button id="mmZoomOut" aria-label="Zoom out"><i class="fas fa-minus"></i></button>' +
          '<button id="mmReset" aria-label="Reset view"><i class="fas fa-expand"></i></button>' +
        '</div>' +
        '<div class="mm-detail" id="mmDetail"><b></b><p></p></div>' +
      '</div>';
    bindPanelButtons(p, 'mindmap', load);

    const svg = $('#mmSvg'), shell = $('#mmShell'), detail = $('#mmDetail');
    const NS = 'http://www.w3.org/2000/svg';
    let vb = { x: -100, y: -320, w: 1200, h: 680 };
    // assign ids + collapsed state
    let uid = 0;
    (function walk(n, depth) {
      n._id = uid++; n._open = depth < 1;
      (n.children || []).forEach((c) => walk(c, depth + 1));
    })(tree, 0);

    function layout() {
      // simple tidy tree: compute y positions by leaf count
      const NODE_H = 44, GAP_Y = 14, GAP_X = 210;
      function visLeaves(n) {
        if (!n._open || !(n.children || []).length) return 1;
        return n.children.reduce((s, c) => s + visLeaves(c), 0);
      }
      function place(n, depth, top) {
        const leaves = visLeaves(n);
        const height = leaves * (NODE_H + GAP_Y);
        n._x = depth * GAP_X;
        n._y = top + height / 2;
        if (n._open) {
          let y = top;
          (n.children || []).forEach((c) => {
            const cl = visLeaves(c) * (NODE_H + GAP_Y);
            place(c, depth + 1, y);
            y += cl;
          });
        }
      }
      place(tree, 0, 0);
    }

    function draw() {
      layout();
      svg.innerHTML = '';
      svg.setAttribute('viewBox', vb.x + ' ' + vb.y + ' ' + vb.w + ' ' + vb.h);
      const links = document.createElementNS(NS, 'g');
      const nodes = document.createElementNS(NS, 'g');
      svg.appendChild(links); svg.appendChild(nodes);

      (function drawNode(n, parent) {
        if (parent) {
          const path = document.createElementNS(NS, 'path');
          const x1 = parent._x + nodeW(parent), y1 = parent._y;
          const x2 = n._x, y2 = n._y;
          const mx = (x1 + x2) / 2;
          path.setAttribute('d', 'M' + x1 + ',' + y1 + ' C' + mx + ',' + y1 + ' ' + mx + ',' + y2 + ' ' + x2 + ',' + y2);
          path.setAttribute('class', 'mm-link');
          links.appendChild(path);
        }
        const g = document.createElementNS(NS, 'g');
        g.setAttribute('class', 'mm-node' + (n === tree ? ' mm-root' : ''));
        const w = nodeW(n);
        const rect = document.createElementNS(NS, 'rect');
        rect.setAttribute('class', 'mm-node-rect');
        rect.setAttribute('x', n._x); rect.setAttribute('y', n._y - 19);
        rect.setAttribute('width', w); rect.setAttribute('height', 38);
        rect.setAttribute('rx', 12);
        g.appendChild(rect);
        const t = document.createElementNS(NS, 'text');
        t.setAttribute('x', n._x + 14); t.setAttribute('y', n._y + 4.5);
        t.textContent = trunc(n.label, 26);
        g.appendChild(t);
        // expand/collapse toggle
        if ((n.children || []).length) {
          const tg = document.createElementNS(NS, 'g');
          tg.setAttribute('class', 'mm-toggle');
          const c = document.createElementNS(NS, 'circle');
          c.setAttribute('cx', n._x + w); c.setAttribute('cy', n._y); c.setAttribute('r', 9);
          tg.appendChild(c);
          const tt = document.createElementNS(NS, 'text');
          tt.setAttribute('x', n._x + w); tt.setAttribute('y', n._y + 3.6);
          tt.setAttribute('text-anchor', 'middle');
          tt.textContent = n._open ? '−' : '+';
          tg.appendChild(tt);
          tg.addEventListener('click', (e) => { e.stopPropagation(); n._open = !n._open; draw(); });
          g.appendChild(tg);
        }
        g.addEventListener('click', () => {
          detail.querySelector('b').textContent = n.label;
          detail.querySelector('p').textContent = n.note || 'No extra explanation for this node.';
          detail.classList.add('show');
        });
        nodes.appendChild(g);
        if (n._open) (n.children || []).forEach((c) => drawNode(c, n));
      })(tree, null);
    }
    function nodeW(n) { return Math.min(240, 34 + trunc(n.label, 26).length * 7.4); }
    function trunc(s, n) { s = String(s || ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; }

    /* pan + zoom */
    let drag = null;
    shell.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.mindmap-controls, .mm-detail')) return;
      drag = { x: e.clientX, y: e.clientY, vx: vb.x, vy: vb.y };
      shell.classList.add('dragging');
      shell.setPointerCapture(e.pointerId);
    });
    shell.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const scale = vb.w / shell.clientWidth;
      vb.x = drag.vx - (e.clientX - drag.x) * scale;
      vb.y = drag.vy - (e.clientY - drag.y) * scale;
      svg.setAttribute('viewBox', vb.x + ' ' + vb.y + ' ' + vb.w + ' ' + vb.h);
    });
    shell.addEventListener('pointerup', () => { drag = null; shell.classList.remove('dragging'); });
    shell.addEventListener('wheel', (e) => { e.preventDefault(); zoom(e.deltaY > 0 ? 1.12 : 0.9); }, { passive: false });
    function zoom(f) {
      const cx = vb.x + vb.w / 2, cy = vb.y + vb.h / 2;
      vb.w *= f; vb.h *= f;
      vb.x = cx - vb.w / 2; vb.y = cy - vb.h / 2;
      svg.setAttribute('viewBox', vb.x + ' ' + vb.y + ' ' + vb.w + ' ' + vb.h);
    }
    $('#mmZoomIn').addEventListener('click', () => zoom(0.85));
    $('#mmZoomOut').addEventListener('click', () => zoom(1.18));
    $('#mmReset').addEventListener('click', () => { vb = { x: -100, y: -320, w: 1200, h: 680 }; draw(); });
    draw();
  }

  /* =====================================================================
     ROADMAP — levels with progress tracking (persisted to server)
     ===================================================================== */
  function renderRoadmap(p, levels, load) {
    const icons = ['fa-seedling', 'fa-person-walking', 'fa-person-running', 'fa-crown'];
    const progress = (topic.progress && topic.progress.roadmap) || {};
    let html = toolbarHtml('roadmap') + '<div class="roadmap-wrap">';
    levels.forEach((lv, i) => {
      const groups = [
        ['Topics', 'topics', 'fa-list-check'], ['Projects', 'projects', 'fa-hammer'],
        ['Practice', 'practice', 'fa-dumbbell'], ['Resources', 'resources', 'fa-book'],
      ];
      let items = 0, done = 0, body = '';
      groups.forEach(([label, key]) => {
        const arr = lv[key] || [];
        if (!arr.length) return;
        body += '<div class="rm-group"><h4>' + label + '</h4>';
        arr.forEach((it, j) => {
          const id = i + '.' + key + '.' + j;
          const checked = !!progress[id];
          items++; if (checked) done++;
          body += '<div class="rm-item' + (checked ? ' done' : '') + '">' +
            '<input type="checkbox" id="rm-' + id + '" data-pid="' + id + '"' + (checked ? ' checked' : '') + '>' +
            '<label for="rm-' + id + '">' + esc(it) + '</label></div>';
        });
        body += '</div>';
      });
      const pct = items ? Math.round(done / items * 100) : 0;
      html += '<div class="rm-level' + (i === 0 ? ' open' : '') + '" data-idx="' + i + '">' +
        '<div class="rm-level-head">' +
          '<span class="rm-badge"><i class="fas ' + icons[i % 4] + '"></i></span>' +
          '<div class="rm-head-meta"><b>' + esc(lv.level || ('Level ' + (i + 1))) + '</b>' +
            '<span><i class="far fa-clock"></i> ' + esc(lv.duration || '') + '</span></div>' +
          '<div class="rm-progress-mini"><div class="bar"><span style="width:' + pct + '%"></span></div><em class="rm-pct">' + pct + '%</em></div>' +
          '<i class="fas fa-chevron-down rm-chev"></i>' +
        '</div><div class="rm-body">' + body + '</div></div>';
    });
    html += '</div>';
    p.innerHTML = html;
    bindPanelButtons(p, 'roadmap', load);

    $$('.rm-level-head', p).forEach((h) => h.addEventListener('click', () =>
      h.parentElement.classList.toggle('open')));

    let saveTimer = null;
    $$('.rm-item input', p).forEach((cb) => cb.addEventListener('change', () => {
      const id = cb.dataset.pid;
      progress[id] = cb.checked;
      cb.closest('.rm-item').classList.toggle('done', cb.checked);
      // update level pct
      const level = cb.closest('.rm-level');
      const all = $$('.rm-item input', level);
      const pct = Math.round(all.filter((x) => x.checked).length / all.length * 100);
      level.querySelector('.rm-progress-mini .bar span').style.width = pct + '%';
      level.querySelector('.rm-pct').textContent = pct + '%';
      // autosave (debounced)
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        topic.progress = topic.progress || {};
        topic.progress.roadmap = progress;
        SS.api('/api/topics/' + topicId + '/progress', {
          method: 'PUT', body: { progress: topic.progress },
        }).catch(() => {});
      }, 600);
    }));
  }

  /* =====================================================================
     TIMELINE
     ===================================================================== */
  function renderTimeline(p, events, load) {
    let html = toolbarHtml('timeline') + '<div class="timeline-wrap">';
    events.forEach((ev) => {
      html += '<div class="tl-item"><span class="tl-year">' + esc(ev.year) + '</span>' +
        '<b>' + esc(ev.title) + '</b><p>' + esc(ev.description) + '</p></div>';
    });
    html += '</div>';
    p.innerHTML = html;
    bindPanelButtons(p, 'timeline', load);
  }

  /* =====================================================================
     QUIZ — difficulty selector + mixed types + scoring
     ===================================================================== */
  function initQuizPanel() {
    const p = panel('quiz');
    let difficulty = 'medium';
    const diffRow = () =>
      '<div class="quiz-diff-row">' + ['easy', 'medium', 'hard', 'expert'].map((d) =>
        '<button class="quiz-diff' + (d === difficulty ? ' active' : '') + '" data-d="' + d + '">' +
        d.charAt(0).toUpperCase() + d.slice(1) + '</button>').join('') + '</div>';

    const load = async (refresh) => {
      if (loading.quiz) return;
      loading.quiz = true;
      p.innerHTML = diffRow() + loadingHtml('AI is preparing your ' + difficulty + ' quiz…');
      bindDiff();
      try {
        const qs = await generate('quiz', { difficulty }, refresh);
        renderQuiz(qs);
      } catch (err) {
        p.innerHTML = diffRow() + emptyStateHtml('quiz', 'Generate quiz');
        bindDiff(); bindPanelButtons(p, 'quiz', load);
        SS.toast(err.message || 'Generation failed', 'error');
      } finally { loading.quiz = false; }
    };

    function bindDiff() {
      $$('.quiz-diff', p).forEach((b) => b.addEventListener('click', () => {
        difficulty = b.dataset.d; load(false);
      }));
    }

    function renderQuiz(qs) {
      let html = diffRow() + toolbarHtml('quiz') + '<div class="quiz-list">';
      qs.forEach((q, i) => {
        html += '<div class="quiz-q" data-i="' + i + '" data-type="' + q.type + '">' +
          '<div class="qq-head"><span class="qq-num">Q' + (i + 1) + '</span>' +
          '<span class="qq-type">' + (q.type === 'mcq' ? 'Multiple choice' : q.type === 'tf' ? 'True / False' : 'Fill in the blank') + '</span></div>' +
          '<div class="qq-text">' + esc(q.question) + '</div><div style="height:12px"></div>';
        if (q.type === 'fill') {
          html += '<div class="qq-fill"><input type="text" placeholder="Type your answer…" data-i="' + i + '"></div>';
        } else {
          const opts = q.type === 'tf' && !(q.options || []).length ? ['True', 'False'] : q.options;
          html += '<div class="qq-opts">' + opts.map((o, j) =>
            '<div class="qq-opt" data-i="' + i + '" data-j="' + j + '">' + esc(o) + '</div>').join('') + '</div>';
        }
        html += '<div class="qq-explain" data-i="' + i + '"><i class="fas fa-lightbulb"></i> ' + esc(q.explanation || '') + '</div></div>';
      });
      html += '</div><div class="quiz-actions">' +
        '<button class="btn" id="quizCheck"><i class="fas fa-check"></i> Check answers</button>' +
        '<span class="quiz-score" id="quizScore"></span></div>';
      p.innerHTML = html;
      bindDiff(); bindPanelButtons(p, 'quiz', load);

      const picks = {};
      $$('.qq-opt', p).forEach((o) => o.addEventListener('click', () => {
        const i = o.dataset.i;
        $$('.qq-opt[data-i="' + i + '"]', p).forEach((x) => x.classList.remove('sel'));
        o.classList.add('sel');
        picks[i] = parseInt(o.dataset.j, 10);
      }));

      $('#quizCheck').addEventListener('click', () => {
        let score = 0;
        qs.forEach((q, i) => {
          const explain = p.querySelector('.qq-explain[data-i="' + i + '"]');
          if (q.type === 'fill') {
            const input = p.querySelector('.qq-fill input[data-i="' + i + '"]');
            const ok = input.value.trim().toLowerCase() === String(q.answer).trim().toLowerCase();
            input.style.borderColor = ok ? '#10b981' : '#ef4444';
            if (ok) score++;
            else if (explain) explain.innerHTML = '<i class="fas fa-lightbulb"></i> Answer: <b>' + esc(q.answer) + '</b>. ' + esc(q.explanation || '');
          } else {
            const correct = parseInt(q.answer, 10) || 0;
            $$('.qq-opt[data-i="' + i + '"]', p).forEach((o) => {
              const j = parseInt(o.dataset.j, 10);
              if (j === correct) o.classList.add('correct');
              else if (o.classList.contains('sel')) o.classList.add('wrong');
            });
            if (picks[i] === correct) score++;
          }
          if (explain && explain.textContent.trim()) explain.classList.add('show');
        });
        const scoreEl = $('#quizScore');
        scoreEl.textContent = '🎯 Score: ' + score + ' / ' + qs.length;
        scoreEl.classList.add('show');
      });
    }

    if (hasCachedSection('quiz')) load(false);
    else {
      p.innerHTML = diffRow() + emptyStateHtml('quiz', 'Generate quiz');
      bindDiff(); bindPanelButtons(p, 'quiz', load);
    }
  }

  /* =====================================================================
     FLASHCARDS — flip deck with bookmark + keyboard nav
     ===================================================================== */
  function renderFlashcards(p, cards, load) {
    let idx = 0;
    const marks = new Set(JSON.parse(localStorage.getItem('ss_fc_marks_' + topicId) || '[]'));
    p.innerHTML = toolbarHtml('flashcards') +
      '<div class="fc-shell">' +
        '<div class="fc-stage"><div class="fc-card" id="fcCard">' +
          '<div class="fc-face fc-front"><span class="fc-tag">Question</span><div class="fc-text" id="fcFront"></div></div>' +
          '<div class="fc-face fc-back"><span class="fc-tag">Answer</span><div class="fc-text" id="fcBack"></div></div>' +
        '</div></div>' +
        '<div class="fc-nav">' +
          '<button id="fcPrev" aria-label="Previous card"><i class="fas fa-chevron-left"></i></button>' +
          '<span class="fc-count" id="fcCount"></span>' +
          '<button id="fcMark" aria-label="Bookmark card"><i class="far fa-bookmark"></i></button>' +
          '<button id="fcNext" aria-label="Next card"><i class="fas fa-chevron-right"></i></button>' +
        '</div><span class="fc-hint">Click card or press Space to flip · ← → to navigate</span></div>';
    bindPanelButtons(p, 'flashcards', load);

    const card = $('#fcCard');
    function show() {
      card.classList.remove('flipped');
      setTimeout(() => {
        $('#fcFront').textContent = cards[idx].front;
        $('#fcBack').textContent = cards[idx].back;
      }, card.classList.contains('flipped') ? 250 : 0);
      $('#fcFront').textContent = cards[idx].front;
      $('#fcBack').textContent = cards[idx].back;
      $('#fcCount').textContent = (idx + 1) + ' / ' + cards.length;
      const mk = $('#fcMark i');
      const marked_ = marks.has(idx);
      mk.className = (marked_ ? 'fas' : 'far') + ' fa-bookmark';
      $('#fcMark').classList.toggle('fc-bookmark', marked_);
    }
    card.addEventListener('click', () => card.classList.toggle('flipped'));
    $('#fcPrev').addEventListener('click', () => { idx = (idx - 1 + cards.length) % cards.length; show(); });
    $('#fcNext').addEventListener('click', () => { idx = (idx + 1) % cards.length; show(); });
    $('#fcMark').addEventListener('click', () => {
      marks.has(idx) ? marks.delete(idx) : marks.add(idx);
      localStorage.setItem('ss_fc_marks_' + topicId, JSON.stringify([...marks]));
      show();
    });
    document.addEventListener('keydown', (e) => {
      if (!panel('flashcards').classList.contains('active')) return;
      if (e.target.closest('input, textarea')) return;
      if (e.key === ' ') { e.preventDefault(); card.classList.toggle('flipped'); }
      if (e.key === 'ArrowLeft') $('#fcPrev').click();
      if (e.key === 'ArrowRight') $('#fcNext').click();
    });
    show();
  }

  /* =====================================================================
     COMPARE
     ===================================================================== */
  function initComparePanel() {
    const p = panel('compare');
    const formHtml =
      '<div class="compare-form">' +
        '<input type="text" id="cmpInput" placeholder="Compare “' + esc(topic.title) + '” with… (e.g. a related topic)">' +
        '<button class="btn" id="cmpGo"><i class="fas fa-scale-balanced"></i> Compare</button>' +
      '</div><div id="cmpResult"></div>';
    p.innerHTML = formHtml;
    const result = $('#cmpResult');

    async function run(refresh) {
      const other = $('#cmpInput').value.trim();
      if (!other) { SS.toast('Enter a topic to compare with', 'error'); return; }
      result.innerHTML = loadingHtml('AI is comparing ' + topic.title + ' vs ' + other + '…');
      try {
        const content = await generate('compare', { other }, refresh);
        cache.compare = content;
        result.innerHTML =
          '<div class="panel-toolbar"><button class="btn-mini" id="cmpRegen"><i class="fas fa-rotate"></i> Regenerate</button></div>' +
          '<article class="md-article">' + md(content) + '</article>';
        $('#cmpRegen').addEventListener('click', () => run(true));
      } catch (err) {
        result.innerHTML = '';
        SS.toast(err.message || 'Comparison failed', 'error');
      }
    }
    $('#cmpGo').addEventListener('click', () => run(false));
    $('#cmpInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') run(false); });
  }

  /* =====================================================================
     TOPIC CHAT — SSE streaming, topic-aware, suggested prompts
     ===================================================================== */
  function initChatPanel() {
    const p = panel('chat');
    const SUGGESTIONS = [
      'Explain simply', 'Explain in detail', "Explain like I'm five", 'Give examples',
      'Generate code', 'Common interview questions', 'Summarize the key points',
      'What should I learn next?',
    ];
    p.innerHTML =
      '<div class="tchat-shell">' +
        '<div class="tchat-msgs" id="tcMsgs">' +
          '<div class="tchat-msg"><span class="tchat-av"><i class="fas fa-robot"></i></span>' +
          '<div class="tchat-bubble">Hi! I\'m your AI tutor for <b>' + esc(topic.title) + '</b>. Ask me anything about this topic — or tap a suggestion below. 👇</div></div>' +
        '</div>' +
        '<div class="tchat-suggest">' + SUGGESTIONS.map((s) =>
          '<button data-q="' + esc(s) + '">' + esc(s) + '</button>').join('') + '</div>' +
        '<div class="tchat-input">' +
          '<textarea id="tcInput" rows="1" placeholder="Ask about ' + esc(topic.title) + '…"></textarea>' +
          '<button class="tchat-send" id="tcSend" aria-label="Send"><i class="fas fa-paper-plane"></i></button>' +
        '</div>' +
      '</div>';

    const msgsEl = $('#tcMsgs'), input = $('#tcInput'), sendBtn = $('#tcSend');
    const history = [];
    let busy = false;

    function addMsg(role, html) {
      const div = document.createElement('div');
      div.className = 'tchat-msg' + (role === 'user' ? ' user' : '');
      div.innerHTML = '<span class="tchat-av"><i class="fas fa-' + (role === 'user' ? 'user' : 'robot') + '"></i></span>' +
        '<div class="tchat-bubble">' + html + '</div>';
      msgsEl.appendChild(div);
      msgsEl.scrollTop = msgsEl.scrollHeight;
      return div.querySelector('.tchat-bubble');
    }

    async function send(text) {
      text = (text || input.value).trim();
      if (!text || busy) return;
      busy = true; sendBtn.disabled = true; input.value = '';
      addMsg('user', esc(text));
      history.push({ role: 'user', content: text });
      const bubble = addMsg('assistant', '<span class="tchat-typing"><span></span><span></span><span></span></span>');
      let acc = '';
      try {
        const res = await SS.api('/api/topics/' + topicId + '/chat', {
          method: 'POST', body: { messages: history }, raw: true,
        });
        if (!res.ok) throw new Error('Chat request failed (' + res.status + ')');
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          const frames = buf.split('\n\n');
          buf = frames.pop();
          for (const f of frames) {
            const line = f.trim();
            if (!line.startsWith('data:')) continue;
            let ev;
            try { ev = JSON.parse(line.slice(5)); } catch { continue; }
            if (ev.event === 'token') {
              acc += ev.token;
              bubble.innerHTML = md(acc);
              msgsEl.scrollTop = msgsEl.scrollHeight;
            } else if (ev.event === 'error') {
              throw new Error((ev.error && ev.error.message) || 'AI error');
            }
          }
        }
        if (!acc) throw new Error('No response was generated.');
        bubble.innerHTML = md(acc);
        bubble.querySelectorAll('pre code').forEach((b) => { try { hljs.highlightElement(b); } catch {} });
        history.push({ role: 'assistant', content: acc });
      } catch (err) {
        bubble.innerHTML = '<i class="fas fa-triangle-exclamation"></i> ' + esc(err.message || 'Something went wrong.');
      } finally {
        busy = false; sendBtn.disabled = false;
        msgsEl.scrollTop = msgsEl.scrollHeight;
      }
    }

    sendBtn.addEventListener('click', () => send());
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
    });
    input.addEventListener('input', () => {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 130) + 'px';
    });
    $$('.tchat-suggest button', p).forEach((b) =>
      b.addEventListener('click', () => send(b.dataset.q)));
  }

  /* =====================================================================
     HEADER: pin / favorite / export
     ===================================================================== */
  function bindHeaderActions() {
    $('#pinTopicBtn').addEventListener('click', async () => {
      try {
        const res = await SS.api('/api/topics/' + topicId, { method: 'PATCH', body: { pinned: !topic.pinned } });
        topic.pinned = res.topic.pinned; updateFlagButtons();
        SS.toast(topic.pinned ? 'Topic pinned' : 'Topic unpinned');
      } catch (e) { SS.toast(e.message, 'error'); }
    });
    $('#favTopicBtn').addEventListener('click', async () => {
      try {
        const res = await SS.api('/api/topics/' + topicId, { method: 'PATCH', body: { favorite: !topic.favorite } });
        topic.favorite = res.topic.favorite; updateFlagButtons();
        SS.toast(topic.favorite ? 'Added to favorites ⭐' : 'Removed from favorites');
      } catch (e) { SS.toast(e.message, 'error'); }
    });

    const exportBtn = $('#exportBtn'), exportMenu = $('#exportMenu');
    exportBtn.addEventListener('click', (e) => { e.stopPropagation(); exportMenu.classList.toggle('open'); });
    document.addEventListener('click', () => exportMenu.classList.remove('open'));
    $$('#exportMenu [data-export]').forEach((b) => b.addEventListener('click', () => doExport(b.dataset.export)));
  }

  function collectMarkdown() {
    let out = '# ' + topic.title + '\n\n';
    MD_KINDS.concat(['compare']).forEach((k) => {
      if (cache[k]) out += '\n\n---\n\n## ' + TAB_META[k].title + '\n\n' + cache[k];
    });
    if (cache.timeline) {
      out += '\n\n---\n\n## Timeline\n\n' + cache.timeline.map((e) =>
        '- **' + e.year + ' — ' + e.title + '**: ' + e.description).join('\n');
    }
    if (cache.roadmap) {
      out += '\n\n---\n\n## Roadmap\n\n' + cache.roadmap.map((lv) =>
        '### ' + lv.level + ' (' + (lv.duration || '') + ')\n' +
        (lv.topics || []).map((t) => '- ' + t).join('\n')).join('\n\n');
    }
    if (cache.flashcards) {
      out += '\n\n---\n\n## Flashcards\n\n' + cache.flashcards.map((c, i) =>
        (i + 1) + '. **Q:** ' + c.front + '\n   **A:** ' + c.back).join('\n');
    }
    return out;
  }

  function doExport(fmt) {
    const name = topic.title.replace(/[^a-z0-9]+/gi, '_').toLowerCase();
    if (fmt === 'pdf') { window.print(); return; }
    const mdText = collectMarkdown();
    if (mdText.trim().split('\n').length < 3) {
      SS.toast('Generate some sections first, then export', 'error'); return;
    }
    let blob, filename;
    if (fmt === 'md') {
      blob = new Blob([mdText], { type: 'text/markdown' });
      filename = name + '.md';
    } else {
      const body = '<html><head><meta charset="utf-8"><title>' + esc(topic.title) + '</title>' +
        '<style>body{font-family:Segoe UI,Arial,sans-serif;max-width:820px;margin:40px auto;padding:0 20px;line-height:1.7;color:#1c1e2e}' +
        'h1,h2{color:#3b3f7a}pre{background:#f4f5fa;padding:14px;border-radius:8px;overflow-x:auto}' +
        'table{border-collapse:collapse}th,td{border:1px solid #ccc;padding:6px 12px}</style></head><body>' +
        DOMPurify.sanitize(marked.parse(mdText)) + '</body></html>';
      blob = new Blob([body], { type: fmt === 'doc' ? 'application/msword' : 'text/html' });
      filename = name + (fmt === 'doc' ? '.doc' : '.html');
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    SS.toast('Exported ' + filename);
  }

  boot();
})();
