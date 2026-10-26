/* =====================================================================
   Notely  -  auth.js  (login / signup / forgot)
   ===================================================================== */

document.addEventListener('DOMContentLoaded', () => {
  // Already logged in? skip auth pages.
  if (SS.isAuthed() && (location.pathname.includes('login') || location.pathname.includes('signup'))) {
    if (window.NotelyShutter) window.NotelyShutter.navigate('/dashboard'); else { try { sessionStorage.setItem('notely-shutter-next', '1'); } catch (_) {} window.location.href = '/dashboard'; }
    return;
  }

  setupPasswordToggles();
  setupStrengthMeter();

  const loginForm = document.getElementById('loginForm');
  const signupForm = document.getElementById('signupForm');
  const forgotForm = document.getElementById('forgotForm');
  const resetForm = document.getElementById('resetForm');

  if (loginForm) loginForm.addEventListener('submit', handleLogin);
  if (signupForm) signupForm.addEventListener('submit', handleSignup);
  if (forgotForm) forgotForm.addEventListener('submit', handleForgot);
  if (resetForm) resetForm.addEventListener('submit', handleReset);

  document.querySelectorAll('[data-guest]').forEach((btn) => btn.addEventListener('click', handleGuest));
});

async function handleGuest(e) {
  if (e) e.preventDefault();
  clearMsg();
  const btn = e ? e.currentTarget : document.querySelector('[data-guest]');
  busy(btn, true, 'Starting…');
  try {
    const data = await SS.api('/api/auth/guest', { method: 'POST', auth: false });
    SS.setSession(data.token, data.user);
    sessionStorage.setItem('ss_show_welcome', 'true');
    localStorage.removeItem('ainb_onboarded');
    SS.toast('Exploring as guest. Sign up anytime to save your work!');
    setTimeout(() => { if (window.NotelyShutter) window.NotelyShutter.navigate('/dashboard'); else { try { sessionStorage.setItem('notely-shutter-next', '1'); } catch (_) {} window.location.href = '/dashboard'; } }, 100);
  } catch (err) {
    msg(err.message);
    busy(btn, false);
  }
}

function msg(text, type = 'error') {
  const box = document.getElementById('formMsg');
  if (!box) return;
  box.textContent = text;
  box.className = `form-msg show ${type}`;
}
function clearMsg() {
  const box = document.getElementById('formMsg');
  if (box) box.className = 'form-msg';
}

function busy(btn, on, label) {
  if (!btn) return;
  if (on) {
    btn.dataset.html = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner"></span> ${label || 'Please wait…'}`;
  } else {
    btn.disabled = false;
    btn.innerHTML = btn.dataset.html || btn.innerHTML;
  }
}

function setupPasswordToggles() {
  document.querySelectorAll('.toggle-pw').forEach((btn) => {
    btn.addEventListener('click', () => {
      const input = document.getElementById(btn.dataset.target);
      if (!input) return;
      const isPw = input.type === 'password';
      input.type = isPw ? 'text' : 'password';
      btn.innerHTML = `<i class="fas fa-eye${isPw ? '-slash' : ''}"></i>`;
    });
  });
}

function setupStrengthMeter() {
  const pw = document.getElementById('password');
  const bar = document.getElementById('pwBar');
  if (!pw || !bar) return;
  pw.addEventListener('input', () => {
    const v = pw.value;
    let score = 0;
    if (v.length >= 6) score++;
    if (v.length >= 10) score++;
    if (/[A-Z]/.test(v) && /[a-z]/.test(v)) score++;
    if (/\d/.test(v)) score++;
    if (/[^A-Za-z0-9]/.test(v)) score++;
    const pct = (score / 5) * 100;
    const colors = ['#fb7185', '#fb923c', '#fbbf24', '#34d399', '#22d3ee'];
    bar.style.width = pct + '%';
    bar.style.background = colors[Math.max(0, Math.min(score - 1, 4))] || '#fb7185';
  });
}

async function handleLogin(e) {
  e.preventDefault();
  clearMsg();
  const btn = document.getElementById('submitBtn');
  const identifier = document.getElementById('identifier').value.trim();
  const password = document.getElementById('password').value;
  if (!identifier || !password) return msg('Please enter your email/username and password.');

  busy(btn, true, 'Logging in…');
  try {
    const data = await SS.api('/api/auth/login', { method: 'POST', auth: false, body: { identifier, password } });
    SS.setSession(data.token, data.user);
    sessionStorage.setItem('ss_show_welcome', 'true');
    localStorage.removeItem('ainb_onboarded');
    SS.toast('Welcome back, ' + ((data.user && data.user.name) || 'friend') + '!');
    setTimeout(() => (window.location.href = '/dashboard'), 500);
  } catch (err) {
    msg(err.message);
    busy(btn, false);
  }
}

async function handleSignup(e) {
  e.preventDefault();
  clearMsg();
  const btn = document.getElementById('submitBtn');
  const name = document.getElementById('name').value.trim();
  const username = document.getElementById('username').value.trim();
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  const confirm_password = document.getElementById('confirm_password').value;

  if (!name || !username || !email || !password || !confirm_password) return msg('Please fill in all fields.');
  if (password.length < 6) return msg('Password must be at least 6 characters.');
  if (password !== confirm_password) return msg('Passwords do not match.');

  busy(btn, true, 'Creating account…');
  try {
    const data = await SS.api('/api/auth/signup', { method: 'POST', auth: false, body: { name, username, email, password, confirm_password } });
    SS.setSession(data.token, data.user);
    sessionStorage.setItem('ss_show_welcome', 'true');
    localStorage.removeItem('ainb_onboarded');
    SS.toast('Account created! Welcome, ' + ((data.user && data.user.name) || 'friend') + '.');
    setTimeout(() => { if (window.NotelyShutter) window.NotelyShutter.navigate('/dashboard'); else { try { sessionStorage.setItem('notely-shutter-next', '1'); } catch (_) {} window.location.href = '/dashboard'; } }, 100);
  } catch (err) {
    msg(err.message);
    busy(btn, false);
  }
}

async function handleForgot(e) {
  e.preventDefault();
  clearMsg();
  const btn = document.getElementById('requestBtn');
  const email = document.getElementById('email').value.trim();
  if (!email) return msg('Please enter your email.');

  busy(btn, true, 'Requesting…');
  try {
    const data = await SS.api('/api/auth/forgot-password', { method: 'POST', auth: false, body: { email } });
    msg(data.message, 'success');
    // Reveal step 2 and prefill token if the demo backend returned one.
    document.getElementById('resetForm').style.display = 'block';
    if (data.reset_token) {
      document.getElementById('token').value = data.reset_token;
      SS.toast('Reset token generated and filled in for you.');
    }
  } catch (err) {
    msg(err.message);
  } finally {
    busy(btn, false);
  }
}

async function handleReset(e) {
  e.preventDefault();
  clearMsg();
  const btn = document.getElementById('resetBtn');
  const token = document.getElementById('token').value.trim();
  const password = document.getElementById('newPassword').value;
  if (!token || !password) return msg('Please enter the token and your new password.');
  if (password.length < 6) return msg('Password must be at least 6 characters.');

  busy(btn, true, 'Updating…');
  try {
    const data = await SS.api('/api/auth/reset-password', { method: 'POST', auth: false, body: { token, password } });
    msg(data.message + ' Redirecting to login…', 'success');
    setTimeout(() => (window.location.href = '/login'), 1500);
  } catch (err) {
    msg(err.message);
    busy(btn, false);
  }
}
