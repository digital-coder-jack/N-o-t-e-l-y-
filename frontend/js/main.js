/* =====================================================================
   Notely  -  main.js  (landing page only)
   Loads app.js first via a dynamic injection so SS is available.
   ===================================================================== */

// Inject shared app.js if it hasn't loaded yet (index.html only includes main.js).
(function loadShared() {
  if (window.SS) return init();
  const s = document.createElement('script');
  s.src = '/js/app.js';
  s.onload = init;
  document.head.appendChild(s);
})();

function init() {
  // AOS scroll animations.
  // The inline <script> in index.html already calls AOS.init() with the
  // premium config (duration:600, ease-out-cubic, once:true). We only need
  // to refresh here in case content/layout changed before main.js ran.
  if (window.AOS) {
    if (typeof AOS.refreshHard === 'function') AOS.refreshHard();
    else AOS.init({ duration: 400, easing: 'ease-out-cubic', once: true, offset: 60 });
  }

  // If already logged in, swap "Get started" CTA to Dashboard
  if (window.SS && SS.isAuthed()) {
    document.querySelectorAll('a[href="/signup.html"], a[href="/login.html"]').forEach((a) => {
      a.setAttribute('href', '/dashboard.html');
    });
  }

  // Start Learning now leads to account creation; trial starts server-side on signup.
  document.getElementById('startLearning')?.addEventListener('click', startTrial);
  document.getElementById('ctaButton')?.addEventListener('click', startTrial);

  typingEffect();
  countUp();
  faqAccordion();
  gsapHero();
}

/* ---------- Start a trial ---------- */
function startTrial(event) {
  if (event) event.preventDefault();
  if (window.SS && SS.isAuthed()) window.location.href = '/dashboard.html';
  else window.location.href = '/signup';
}

/* ---------- Typing text effect ---------- */
function typingEffect() {
  const el = document.getElementById('typed');
  if (!el) return;
  const phrases = [
    'Ask anything. Learn everything.',
    'Generate notes in seconds.',
    'Build quizzes & flashcards instantly.',
    'Summarise PDFs with one click.',
    'Plan your study weeks with AI.',
  ];
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
    el.textContent = phrases[0];
    return;
  }
  let p = 0, c = 0, deleting = false;

  function tick() {
    const full = phrases[p];
    el.textContent = deleting ? full.slice(0, c--) : full.slice(0, c++);
    let delay = deleting ? 40 : 75;
    if (!deleting && c > full.length) { deleting = true; delay = 1600; }
    else if (deleting && c < 0) { deleting = false; c = 0; p = (p + 1) % phrases.length; delay = 350; }
    setTimeout(tick, delay);
  }
  tick();
}

/* ---------- Animated counters ---------- */
function countUp() {
  const els = document.querySelectorAll('[data-count]');
  if (!els.length) return;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
    els.forEach((el) => { el.textContent = el.dataset.count; });
    return;
  }
  const obs = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      const el = e.target;
      const target = parseInt(el.dataset.count, 10);
      let cur = 0;
      const step = Math.max(1, Math.ceil(target / 45));
      const t = setInterval(() => {
        cur += step;
        if (cur >= target) { cur = target; clearInterval(t); }
        el.textContent = cur;
      }, 28);
      obs.unobserve(el);
    });
  }, { threshold: 0.5 });
  els.forEach((el) => obs.observe(el));
}

/* ---------- FAQ accordion ---------- */
function faqAccordion() {
  document.querySelectorAll('.faq-q').forEach((q) => {
    q.addEventListener('click', () => {
      const item = q.closest('.faq-item');
      const wasOpen = item.classList.contains('open');
      document.querySelectorAll('.faq-item').forEach((i) => {
        i.classList.remove('open');
        const question = i.querySelector('.faq-q');
        question?.setAttribute('aria-expanded', 'false');
        const answerId = question?.getAttribute('aria-controls');
        if (answerId) document.getElementById(answerId)?.setAttribute('aria-hidden', 'true');
      });
      if (!wasOpen) {
        item.classList.add('open');
        q.setAttribute('aria-expanded', 'true');
        const answerId = q.getAttribute('aria-controls');
        if (answerId) document.getElementById(answerId)?.setAttribute('aria-hidden', 'false');
      }
    });
  });
}

/* ---------- GSAP hero entrance + scroll parallax ---------- */
function gsapHero() {
  if (!window.gsap || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  gsap.from('.hero .badge', { y: -20, opacity: 0, duration: 0.7 });
  gsap.from('.hero h1', { y: 30, opacity: 0, duration: 0.9, delay: 0.1 });
  gsap.from('.hero .lead', { y: 24, opacity: 0, duration: 0.9, delay: 0.25 });

  if (window.ScrollTrigger) {
    gsap.registerPlugin(ScrollTrigger);
    gsap.utils.toArray('.feature').forEach((card) => {
      gsap.to(card, {
        scrollTrigger: { trigger: card, start: 'top 90%' },
        duration: 0.6,
      });
    });
  }
}
