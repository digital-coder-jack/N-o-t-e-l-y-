(function () {
  'use strict';
  var KEY='notely-shutter-next', LOCK='notely-shutter-lock', active=false;
  var reduced=!!(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  function path(url){try{return new URL(url,location.href).pathname.replace(/\/+$/,'')||'/';}catch(e){return '';}}
  function isTarget(p){return p==='/'||p==='/signup'||p==='/login'||p==='/dashboard';}
  function ensureOverlay(){
    var el=document.getElementById('pre')||document.getElementById('notely-shutter');
    if(el){el.classList.add('notely-shutter');return el;}
    el=document.createElement('div');el.id='notely-shutter';el.className='notely-shutter-overlay';el.setAttribute('aria-hidden','true');
    el.innerHTML='<div class="notely-shutter-inner"><img src="/assets/logo.png" alt="Notely"></div>';
    document.body.insertBefore(el,document.body.firstChild);return el;
  }
  function wait(ms){return new Promise(function(resolve){setTimeout(resolve,ms);});}
  function cover(el){
    var ms=reduced?120:600;
    el.style.display='grid';el.style.willChange='transform,opacity';
    el.style.transition=reduced?'opacity 120ms ease':'transform 600ms cubic-bezier(.76,0,.24,1), opacity 600ms ease';
    el.style.transform='translateY(-100%)';el.style.opacity='1';el.classList.remove('is-lifting','is-covered');void el.offsetHeight;
    el.classList.add('is-covered');el.style.transform=reduced?'none':'translateY(0)';
    return wait(ms);
  }
  function navigate(url,replace){
    if(active)return Promise.resolve(false);
    active=true;try{sessionStorage.setItem(LOCK,'1');}catch(e){}
    var el=ensureOverlay();document.documentElement.classList.remove('notely-shutter-pending');
    cover(el).then(function(){try{sessionStorage.setItem(KEY,'1');}catch(e){}if(replace)location.replace(url);else location.href=url;});
    setTimeout(function(){if(active&&path(location.href)===path(url)){el.style.opacity='0';el.style.transform='translateY(-100%)';active=false;try{sessionStorage.removeItem(LOCK);sessionStorage.removeItem(KEY);}catch(e){}}},4500);
    return Promise.resolve(true);
  }
  function liftOnArrival(){
    var pending=false;try{pending=sessionStorage.getItem(KEY)==='1';}catch(e){}
    var el=ensureOverlay();
    if(!pending){
      if(el.id!=='pre')el.remove();
      return;
    }
    try{sessionStorage.removeItem(KEY);sessionStorage.removeItem(LOCK);}catch(e){}
    active=true;el.style.display='grid';el.style.transition='none';el.style.opacity='1';el.style.transform='translateY(0)';el.classList.add('is-covered');
    document.documentElement.classList.add('notely-shutter-pending');void el.offsetHeight;
    requestAnimationFrame(function(){requestAnimationFrame(function(){
      el.style.transition=reduced?'opacity 120ms ease':'transform 700ms cubic-bezier(.76,0,.24,1), opacity 700ms ease';
      el.classList.remove('is-covered');el.classList.add('is-lifting');el.style.transform=reduced?'none':'translateY(-100%)';el.style.opacity='0';
      setTimeout(function(){if(el.id!=='pre')el.remove();else el.style.display='none';document.documentElement.classList.remove('notely-shutter-pending');document.body.style.overflow='';active=false;window.dispatchEvent(new CustomEvent('notely-shutter:lifted'));},reduced?120:720);
    });});
    setTimeout(function(){document.documentElement.classList.remove('notely-shutter-pending');if(el.id!=='pre')el.remove();else el.style.display='none';document.body.style.overflow='';active=false;window.dispatchEvent(new CustomEvent('notely-shutter:lifted'));},3500);
  }
  document.addEventListener('click',function(e){
    var a=e.target.closest&&e.target.closest('a[href]');
    if(!a||e.defaultPrevented||e.button!==0||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey||a.target==='_blank'||a.hasAttribute('download'))return;
    var dest=new URL(a.href,location.href);
    if(dest.origin!==location.origin||!isTarget(path(dest.href))||path(dest.href)===path(location.href))return;
    e.preventDefault();navigate(dest.href,false);
  },true);
  window.NotelyShutter={navigate:navigate,liftOnArrival:liftOnArrival};
  window.addEventListener('pageshow',function(e){
    if(e.persisted){active=false;document.documentElement.classList.remove('notely-shutter-pending');var el=document.getElementById('pre')||document.getElementById('notely-shutter');if(el){if(el.id!=='pre')el.remove();else el.style.display='none';}document.body.style.overflow='';}
  });
  document.addEventListener('DOMContentLoaded',liftOnArrival,{once:true});
  if(/^\/(login|signup)$/.test(path(location.href))&&history&&history.pushState){
    try{if(!history.state||!history.state.notelyAuthGuard)history.pushState({notelyAuthGuard:true},'',location.href);
      window.addEventListener('popstate',function(){navigate('/',true);});
    }catch(e){}
  }
})();