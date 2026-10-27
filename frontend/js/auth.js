/* Notely authentication: OTP-gated signup, account sessions and premium loading. */
var verificationPendingEmail = '';
document.addEventListener('DOMContentLoaded', function () {
  if (window.SS && SS.getToken() && (location.pathname.includes('login') || location.pathname.includes('signup'))) {
    if (window.NotelyShutter) window.NotelyShutter.navigate('/dashboard'); else window.location.replace('/dashboard'); return;
  }
  setupPasswordToggles(); setupStrengthMeter(); setupAuthTabs(); setupCinematicIntro(); setupSpotlight(); setupResetLink();
  document.querySelectorAll('[data-google-signin]').forEach(function (button) { button.addEventListener('click', function () { msg("Google sign-in isn't connected yet. Use email for now."); }); });
  var loginForm=document.getElementById('loginForm'), signupForm=document.getElementById('signupForm'), forgotForm=document.getElementById('forgotForm'), resetForm=document.getElementById('resetForm');
  if(loginForm)loginForm.addEventListener('submit',handleLogin); if(signupForm)signupForm.addEventListener('submit',handleSignup);
  if(forgotForm)forgotForm.addEventListener('submit',handleForgot); if(resetForm)resetForm.addEventListener('submit',handleReset);
});
function setAuthMode(mode,updateUrl){
  var root=document.querySelector('.auth-segment');if(!root)return;root.dataset.active=mode;
  document.querySelectorAll('[data-auth-tab]').forEach(function(tab){if(tab.getAttribute('role')==='tab')tab.setAttribute('aria-selected',tab.dataset.authTab===mode?'true':'false');});
  document.querySelectorAll('[data-auth-panel]').forEach(function(panel){panel.hidden=panel.dataset.authPanel!==mode;});
  var copy=document.querySelector('[data-auth-switch-copy]'),link=document.querySelector('[data-auth-switch-link]');
  if(copy)copy.textContent=mode==='signup'?'Already have an account?':'New to Notely?';
  if(link){link.dataset.authTab=mode==='signup'?'login':'signup';link.textContent=mode==='signup'?'Log in':'Start your trial';}
  clearMsg();if(updateUrl&&history.replaceState)history.replaceState(null,'',mode==='signup'?'/signup':'/login');
}
function setupAuthTabs(){var mode=document.body.dataset.authInitial||(location.pathname.indexOf('signup')>=0?'signup':'login');document.querySelectorAll('[data-auth-tab]').forEach(function(tab){tab.addEventListener('click',function(){setAuthMode(tab.dataset.authTab,true);});});setAuthMode(mode,false);}
function setupCinematicIntro(){
  var reduce=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  try{if(!reduce&&!sessionStorage.getItem('notely-auth-intro-seen')){document.body.classList.add('auth-intro');sessionStorage.setItem('notely-auth-intro-seen','1');
  var skip=function(){document.body.classList.add('auth-intro-skipped');document.body.classList.remove('auth-intro');window.removeEventListener('pointerdown',skip,true);window.removeEventListener('keydown',skip,true);};
  window.addEventListener('pointerdown',skip,true);window.addEventListener('keydown',skip,true);}}catch(_){}
}
function setupSpotlight(){if(!window.matchMedia||!window.matchMedia('(hover: hover) and (pointer: fine)').matches)return;var pending=false,x=0,y=0;
 window.addEventListener('pointermove',function(e){x=e.clientX;y=e.clientY;if(pending)return;pending=true;requestAnimationFrame(function(){pending=false;document.documentElement.style.setProperty('--spot-x',x+'px');document.documentElement.style.setProperty('--spot-y',y+'px');var c=document.querySelector('.study-cards');if(c){var r=c.getBoundingClientRect(),dx=(x-(r.left+r.width/2))/Math.max(1,r.width),dy=(y-(r.top+r.height/2))/Math.max(1,r.height);c.style.setProperty('--parallax-x',(dx*9).toFixed(1)+'px');c.style.setProperty('--parallax-y',(dy*7).toFixed(1)+'px');}});},{passive:true});}
function msg(text,type){var box=document.getElementById('formMsg');if(!box)return;box.textContent=text;box.className='form-msg show '+(type||'error');}
function clearMsg(){var box=document.getElementById('formMsg');if(box)box.className='form-msg';}
function busy(button,on,label){if(!button)return;if(on){button.dataset.html=button.innerHTML;button.disabled=true;button.innerHTML='<span class="spinner" aria-hidden="true"></span> '+label;}else{button.disabled=false;button.innerHTML=button.dataset.html||button.innerHTML;}}
function setupPasswordToggles(){document.querySelectorAll('.auth-show-password,.toggle-pw').forEach(function(button){button.addEventListener('click',function(){var input=document.getElementById(button.dataset.target);if(!input)return;var show=input.type==='password';input.type=show?'text':'password';button.textContent=show?'Hide':'Show';button.setAttribute('aria-label',show?'Hide password':'Show password');});});}
function setupStrengthMeter(){var input=document.getElementById('signupPassword')||document.getElementById('password'),bar=document.getElementById('pwBar'),hint=document.getElementById('pwHint');if(!input||!bar)return;
 input.addEventListener('input',function(){var v=input.value,s=0;if(v.length>=8)s++;if(v.length>=12)s++;if(/[a-z]/.test(v)&&/[A-Z]/.test(v))s++;if(/\d/.test(v))s++;if(/[^A-Za-z0-9]/.test(v))s++;bar.style.width=(s*20)+'%';bar.style.background=['#e45b79','#f0a34a','#e3c45a','#4aa8d8','#43bd99'][Math.max(0,s-1)]||'#e45b79';if(hint)hint.textContent=v.length<8?'Use at least 8 characters.':s<3?'Good start. Add a number or symbol to strengthen it.':s<5?'Strong password.':'Excellent password strength.';});}
function markInvalid(id){var f=document.getElementById(id);if(!f)return;f.setAttribute('aria-invalid','true');f.focus();f.addEventListener('input',function clear(){f.removeAttribute('aria-invalid');f.removeEventListener('input',clear);},{once:true});}
function showPostAuthLoading(title, greeting, complete){
 var reduced=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
 var overlay=document.createElement('section');overlay.className='notely-loading-screen';overlay.setAttribute('role','status');overlay.setAttribute('aria-live','polite');
 var card=document.createElement('div');card.className='notely-loading-card';
 var logoWrap=document.createElement('div');logoWrap.className='notely-loading-logo';
 var logo=document.createElement('img');logo.src='/assets/logo.png';logo.alt='Notely';logoWrap.appendChild(logo);
 var orbit=document.createElement('span');orbit.className='notely-loading-orbit';logoWrap.appendChild(orbit);
 var h=document.createElement('h1');h.textContent=title;
 var greet=document.createElement('p');greet.className='notely-loading-greeting';greet.textContent=greeting||'Your study space is almost ready.';
 var ring=document.createElement('div');ring.className='notely-loading-ring';ring.innerHTML='<svg viewBox="0 0 72 72" aria-hidden="true"><circle class="ring-track" cx="36" cy="36" r="30"></circle><circle class="ring-progress" cx="36" cy="36" r="30"></circle></svg><span class="ring-spark">✦</span>';
 var bar=document.createElement('div');bar.className='notely-loading-progress';var barFill=document.createElement('span');bar.appendChild(barFill);
 var tip=document.createElement('p');tip.className='notely-loading-tip';
 var tips=['Gathering your notes and study tools…','Preparing a focused workspace…','Keeping your progress together…','Almost there — your next session starts here.'];
 tip.textContent=tips[0];
 var particles=document.createElement('div');particles.className='notely-loading-particles';for(var i=0;i<18;i++){var p=document.createElement('i');p.style.setProperty('--particle-index',String(i));particles.appendChild(p);}
 card.appendChild(particles);card.appendChild(logoWrap);card.appendChild(h);card.appendChild(greet);card.appendChild(ring);card.appendChild(bar);card.appendChild(tip);overlay.appendChild(card);document.body.appendChild(overlay);
 requestAnimationFrame(function(){overlay.classList.add('is-visible');});
 var index=0, timer=null;
 if(!reduced)timer=window.setInterval(function(){index=(index+1)%tips.length;tip.textContent=tips[index];},680);
 window.setTimeout(function(){if(timer)window.clearInterval(timer);overlay.classList.add('is-burst');window.setTimeout(function(){overlay.remove();complete();},reduced?50:320);},reduced?900:2350);
}
function navigateWorkspace(){
 if(window.NotelyShutter)window.NotelyShutter.navigate('/dashboard');
 else{try{sessionStorage.setItem('notely-shutter-next','1');}catch(_){}window.location.href='/dashboard';}
}
function goToWorkspace(data,message){
 SS.setSession(data.token,data.user);try{sessionStorage.setItem('ss_show_welcome','true');}catch(_){}
 var name=(data.user&&data.user.name)||'there';
 showPostAuthLoading('Loading your workspace...','Welcome back, '+name+'.',navigateWorkspace);
}
function goToTrialWorkspace(data){
 SS.setTrialSession(data);try{sessionStorage.setItem('ss_show_welcome','true');}catch(_){}
 showPostAuthLoading('Loading your trial workspace...','Your seven-day study space is ready.',navigateWorkspace);
}
async function handleLogin(e){e.preventDefault();clearMsg();var identifier=document.getElementById('identifier').value.trim(),password=document.getElementById('password').value;if(!identifier){msg('Enter your email or username.');markInvalid('identifier');return;}if(!password){msg('Enter your password.');markInvalid('password');return;}
 var btn=document.getElementById('submitBtn');busy(btn,true,'Signing in…');try{var data=await SS.api('/api/auth/login',{method:'POST',auth:false,body:{identifier:identifier,password:password}});goToWorkspace(data,'Welcome back. Opening your workspace…');}catch(err){msg(err.message||'Could not sign in. Check your details.');busy(btn,false);}}
async function handleSignup(e){
 e.preventDefault();clearMsg();
 var btn=document.getElementById('signupSubmit');
 if(verificationPendingEmail){
  var otp=(document.getElementById('emailOtp')||{}).value||'';
  if(!/^\\d{6}$/.test(otp.trim())){msg('Enter the six-digit code sent to your email.');markInvalid('emailOtp');return;}
  busy(btn,true,'Verifying email…');
  try{
   var verified=await SS.api('/api/auth/verify-email',{method:'POST',auth:false,body:{email:verificationPendingEmail,otp:otp.trim(),device_token:localStorage.getItem('notely-trial-device')||''}});
   verificationPendingEmail='';goToWorkspace(verified,'Email verified. Preparing your workspace…');
  }catch(err){msg(err.message||'The code is invalid or expired.');busy(btn,false);}
  return;
 }
 var name=document.getElementById('name').value.trim(),email=document.getElementById('email').value.trim(),password=document.getElementById('signupPassword').value;
 if(!name){msg('Add your name to get started.');markInvalid('name');return;}
 if(!/^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$/.test(email)){msg('Enter a valid email address.');markInvalid('email');return;}
 if(password.length<8){msg('Use at least 8 characters for your password.');markInvalid('signupPassword');return;}
 var confirm=password;
 busy(btn,true,'Sending verification code…');
 try{
  var data=await SS.api('/api/auth/signup',{method:'POST',auth:false,body:{name:name,username:'',email:email,password:password,confirm_password:confirm}});
  verificationPendingEmail=data.email||email;
  var form=document.getElementById('signupForm');
  var fields=form.querySelectorAll('.auth-field');fields.forEach(function(field){field.hidden=true;});
  var otpField=document.getElementById('otpField');
  if(!otpField){
   otpField=document.createElement('div');otpField.className='auth-field auth-otp-field';otpField.id='otpField';
   otpField.innerHTML='<label for="emailOtp">Six-digit email code</label><input id="emailOtp" name="otp" type="text" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" placeholder="000000" required><small class="auth-hint">The code expires in 10 minutes.</small><button type="button" class="auth-resend-code" id="resendCode">Resend code</button>';
   form.insertBefore(otpField,btn);
   document.getElementById('resendCode').addEventListener('click',async function(){
    var resend=this;resend.disabled=true;resend.textContent='Sending…';
    try{var result=await SS.api('/api/auth/resend-verification',{method:'POST',auth:false,body:{email:verificationPendingEmail}});msg(result.message||'A new code has been sent.','success');}
    catch(err){msg(err.message||'Could not resend the code.');}
    finally{resend.disabled=false;resend.textContent='Resend code';}
   });
  }else{otpField.hidden=false;}
  btn.innerHTML='Verify email <span aria-hidden="true">↗</span>';btn.dataset.html=btn.innerHTML;
  var title=document.querySelector('[data-auth-panel="signup"] h2');if(title)title.textContent='Check your inbox.';
  var copy=document.querySelector('[data-auth-panel="signup"] .auth-panel-copy');if(copy)copy.textContent='Enter the six-digit code we sent to '+verificationPendingEmail+'.';
  var terms=document.querySelector('[data-auth-panel="signup"] .auth-terms');if(terms)terms.textContent='No workspace access is granted until your email is verified.';
  msg(data.message||'Check your email for a six-digit verification code.','success');
  btn.disabled=false;
 }catch(err){msg(err.message||'Could not start verification. Please try again.');busy(btn,false);}
}
function setupResetLink(){
 var params=new URLSearchParams(window.location.search),token=params.get('token');
 if(!token)return;
 var tokenField=document.getElementById('token'),resetForm=document.getElementById('resetForm'),forgotForm=document.getElementById('forgotForm');
 if(tokenField&&resetForm){tokenField.value=token;resetForm.style.display='block';if(forgotForm)forgotForm.style.display='none';msg('Choose a new password to finish resetting your account.','success');}
}
async function handleForgot(e){
 e.preventDefault();clearMsg();
 var btn=document.getElementById('requestBtn'),email=document.getElementById('email').value.trim();
 if(!email)return msg('Enter your email.');
 busy(btn,true,'Sending reset link…');
 try{var data=await SS.api('/api/auth/forgot-password',{method:'POST',auth:false,body:{email:email}});msg(data.message||'If an account matches that address, a reset link will be sent shortly.','success');}
 catch(err){msg('If an account matches that address, a reset link will be sent shortly.','success');}
 finally{busy(btn,false);}
}
async function handleReset(e){e.preventDefault();clearMsg();var btn=document.getElementById('resetBtn'),token=document.getElementById('token').value.trim(),password=document.getElementById('newPassword').value;if(!token||!password)return msg('Enter the reset token and a new password.');if(password.length<8)return msg('Use at least 8 characters for your password.');busy(btn,true,'Updating…');try{var data=await SS.api('/api/auth/reset-password',{method:'POST',auth:false,body:{token:token,password:password}});msg(data.message+' Redirecting to login…','success');setTimeout(function(){window.location.href='/login';},1500);}catch(err){msg(err.message||'Could not reset your password.');busy(btn,false);}}
