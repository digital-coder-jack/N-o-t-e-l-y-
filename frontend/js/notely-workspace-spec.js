/* Updated Notely workspace navigation and Chat/Workspace experience. */
(function () {
  'use strict';
  var shell = document.querySelector('.nw-shell');
  var sidebar = document.getElementById('nwSidebar');
  var root = document.getElementById('nwContent');
  var topbar = document.querySelector('.nw-topbar');
  if (!shell || !sidebar || !root || !topbar) return;

  var user = {};
  try { user = window.SS && SS.getUser ? SS.getUser() : JSON.parse(localStorage.getItem('ss_user') || '{}'); } catch (_) {}
  var accountKey = String(user.id || user.user_id || user.email || (user.is_test_user ? 'test-user' : 'local'));
  var pinKey = 'notely-pinned-chats:' + accountKey;
  var pinned = readPins();
  var currentChatId = null;
  var activeTab = 'chat';
  var cachedHome = '';
  var deleteTimers = new Map();
  var nav = sidebar.querySelector('.nw-nav');

  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]); }); }
  function readPins() { try { return JSON.parse(localStorage.getItem(pinKey) || '[]').map(String); } catch (_) { return []; } }
  function savePins() { try { localStorage.setItem(pinKey, JSON.stringify(pinned)); } catch (_) {} }
  function dateGroup(value) {
    var d = new Date(value || 0), now = new Date();
    if (!value || isNaN(d.getTime())) return 'Older';
    var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    var diff = Math.floor((today - day) / 86400000);
    return diff <= 0 ? 'Today' : diff === 1 ? 'Yesterday' : diff <= 7 ? 'Previous 7 days' : 'Older';
  }
  function renderSidebar() {
    var brand = sidebar.querySelector('.nw-brand');
    var legacySearch = sidebar.querySelector('.nw-search'); if (legacySearch) legacySearch.remove();
    if (!nav) return;
    nav.innerHTML =
      '<button class="nch-sidebar-new" id="nchSidebarNewChat" type="button"><span class="nch-plus" aria-hidden="true">＋</span><span>New chat</span></button>' +
      '<div class="nch-primary-nav" role="navigation" aria-label="Notely navigation">' +
        '<button type="button" data-spec-page="library"><span>▤</span>Library</button>' +
        '<button type="button" data-spec-page="schedule"><span>◷</span>Schedule</button>' +
      '</div>' +
      '<button type="button" data-view="overview" id="nchHiddenHome" hidden aria-hidden="true"></button>' +
      '<div class="nch-chat-history" id="nchChatHistory"><div class="nch-history-loading">Loading conversations…</div></div>';
    if (brand) brand.setAttribute('aria-label', 'Notely');
    var mobileNew = document.getElementById('nchSidebarNewChat');
    if (mobileNew) mobileNew.addEventListener('click', startNewChat);
    loadChats();
  }
  function startNewChat() {
    var button = document.getElementById('nchNewChat');
    if (button) button.click();
    else if (window.NotelyAssistant) window.NotelyAssistant.open('').then(function(){return window.NotelyAssistant.newChat();});
  }
  async function loadChats() {
    pinned = readPins();
    var holder = document.getElementById('nchChatHistory');
    if (!holder) return;
    if (!window.SS || !SS.api) {
      holder.innerHTML = '<div class="nch-history-empty"><strong>Conversations unavailable</strong><small>Chat history is not connected in this session.</small><button type="button" class="nch-history-retry" data-chat-history-retry>Retry</button></div>';
      return;
    }
    holder.setAttribute('aria-busy', 'true');
    try {
      var data = await Promise.race([
        SS.api('/api/chats'),
        new Promise(function (_, reject) {
          window.setTimeout(function () { reject(new Error('Chat history request timed out')); }, 10000);
        })
      ]);
      var chats = Array.isArray(data && data.chats) ? data.chats : [];
      var buckets = { 'Today': [], 'Yesterday': [], 'Previous 7 days': [], 'Older': [] };
      chats.forEach(function (c) {
        var id = String(c.id);
        (pinned.indexOf(id) >= 0 ? (buckets.Pinned = buckets.Pinned || [], buckets.Pinned) : buckets[dateGroup(c.updated_at || c.created_at)]).push(c);
      });
      var html = '';
      if (buckets.Pinned && buckets.Pinned.length) html += groupMarkup('Pinned', buckets.Pinned);
      ['Today','Yesterday','Previous 7 days','Older'].forEach(function (key) { if (buckets[key].length) html += groupMarkup(key, buckets[key]); });
      holder.innerHTML = html || '<div class="nch-history-empty"><span>✦</span><strong>No conversations yet</strong><small>Your chats will appear here.</small></div>';
      if (currentChatId) {
        var active = holder.querySelector('[data-spec-chat="' + CSS.escape(String(currentChatId)) + '"]');
        if (active) active.classList.add('is-active');
      }
      chats.filter(function(c){return !c.title || /^new chat$/i.test(c.title);}).slice(0,5).forEach(autoTitle);
    } catch (error) {
      var message = error && error.message === 'Chat history request timed out'
        ? 'The request took too long. Check your connection and retry.'
        : 'Your conversations could not be loaded. They have not been deleted.';
      holder.innerHTML = '<div class="nch-history-empty" role="status"><strong>Could not load chats</strong><small>' + esc(message) + '</small><button type="button" class="nch-history-retry" data-chat-history-retry>Retry</button></div>';
    } finally {
      holder.setAttribute('aria-busy', 'false');
    }
  }

  function groupMarkup(label, chats) {
    return '<section class="nch-history-group"><h3>' + label + '</h3>' + chats.map(function(c){
      return '<div class="nch-chat-row" data-spec-row="' + esc(c.id) + '">' +
        '<button class="nch-chat-open" type="button" data-spec-chat="' + esc(c.id) + '" title="' + esc(c.title || 'New chat') + '">' + esc(c.title || 'New chat') + '</button>' +
        '<button class="nch-chat-more" type="button" data-chat-menu="' + esc(c.id) + '" aria-label="Conversation options">⋯</button>' +
        '<div class="nch-chat-menu" data-chat-menu-panel="' + esc(c.id) + '" hidden>' +
          '<button data-chat-action="rename" data-id="' + esc(c.id) + '">Rename</button>' +
          '<button data-chat-action="share" data-id="' + esc(c.id) + '">Share</button>' +
          '<button data-chat-action="pin" data-id="' + esc(c.id) + '">' + (pinned.indexOf(String(c.id)) >= 0 ? 'Unpin' : 'Pin') + '</button>' +
          '<button data-chat-action="delete" data-id="' + esc(c.id) + '">Delete</button>' +
        '</div></div>';
    }).join('') + '</section>';
  }
  async function autoTitle(chat) {
    try {
      var full = await SS.api('/api/chats/' + encodeURIComponent(chat.id));
      var first = (full.messages || []).find(function(m){return m.role === 'user' && m.content;});
      if (first) await SS.api('/api/chats/' + encodeURIComponent(chat.id), {method:'PUT',body:{title:first.content.trim().replace(/\s+/g,' ').slice(0,56)}});
    } catch (_) {}
  }
  function showToast(message, undo) {
    var old = document.getElementById('nchActionToast'); if (old) old.remove();
    var toast = document.createElement('div'); toast.id = 'nchActionToast'; toast.className = 'nch-action-toast';
    toast.innerHTML = '<span>' + esc(message) + '</span>' + (undo ? '<button type="button" id="nchUndoDelete">Undo</button>' : '');
    document.body.appendChild(toast);
    if (undo) toast.querySelector('button').addEventListener('click', undo);
    window.setTimeout(function(){ if (toast.isConnected) toast.remove(); }, 5200);
  }
  async function chatAction(action, id) {
    var row = sidebar.querySelector('[data-spec-row="' + CSS.escape(String(id)) + '"]');
    if (action === 'rename') {
      var title = row && row.querySelector('.nch-chat-open');
      if (!title) return;
      var input = document.createElement('input'); input.className = 'nch-chat-rename'; input.value = title.textContent;
      title.replaceWith(input); input.focus(); input.select();
      var finish = async function(save) {
        if (!input.isConnected) return;
        if (save && input.value.trim()) {
          try { await SS.api('/api/chats/' + encodeURIComponent(id), {method:'PUT',body:{title:input.value.trim().slice(0,120)}}); }
          catch(e){showToast(e.message || 'Rename failed.');}
        }
        loadChats();
      };
      input.addEventListener('keydown',function(e){if(e.key==='Enter')finish(true);if(e.key==='Escape')finish(false);});
      input.addEventListener('blur',function(){finish(false);},{once:true});
    } else if (action === 'pin') {
      pinned = pinned.indexOf(String(id)) >= 0 ? pinned.filter(function(x){return x !== String(id);}) : [String(id)].concat(pinned);
      savePins(); loadChats();
    } else if (action === 'share') {
      try {
        var full = await SS.api('/api/chats/' + encodeURIComponent(id));
        var text = '# ' + (full.chat && full.chat.title || 'Notely conversation') + '\n\n' + (full.messages || []).map(function(m){return (m.role === 'user' ? 'You' : 'Notely') + ':\n' + m.content;}).join('\n\n');
        if (navigator.share) await navigator.share({title:full.chat && full.chat.title || 'Notely conversation',text:text});
        else if (navigator.clipboard) { await navigator.clipboard.writeText(text); showToast('Conversation copied to clipboard.'); }
        else showToast('Sharing is not available in this browser.');
      } catch(e) { if (e.name !== 'AbortError') showToast(e.message || 'Share failed.'); }
    } else if (action === 'delete') {
      var timer = window.setTimeout(async function(){
        try { await SS.api('/api/chats/' + encodeURIComponent(id), {method:'DELETE'}); pinned = pinned.filter(function(x){return x !== String(id);}); savePins(); loadChats(); }
        catch(e){showToast(e.message || 'Delete failed.');}
        deleteTimers.delete(String(id));
      }, 5000);
      deleteTimers.set(String(id), timer);
      showToast('Conversation will be deleted in 5 seconds.', function(){
        window.clearTimeout(timer); deleteTimers.delete(String(id)); showToast('Delete cancelled.');
      });
    }
  }
  function setTab(tab) {
    activeTab = tab;
    root.classList.remove('nch-view-in');
    root.dataset.transition = tab === 'workspace' ? 'forward' : 'back';
    void root.offsetWidth;
    root.classList.add('nch-view-in');
    var toggle = document.getElementById('nchTabToggle');
    if (toggle) {
      toggle.dataset.active = tab;
      toggle.querySelectorAll('[role="tab"]').forEach(function(t){t.setAttribute('aria-selected',String(t.dataset.tab===tab));});
    }
    if (tab === 'workspace') {
      var home = root.querySelector('.nch-home');
      if (home) cachedHome = home.outerHTML;
      document.body.classList.remove('nch-home-active');
      var hiddenHome = document.getElementById('nchHiddenHome');
      if (hiddenHome) hiddenHome.classList.remove('active');
      renderWorkspaceCards();
    } else {
      var hiddenHome2 = document.getElementById('nchHiddenHome');
      if (hiddenHome2) hiddenHome2.classList.add('active');
      if (cachedHome) { root.innerHTML = cachedHome; document.body.classList.add('nch-home-active'); }
      else root.innerHTML = '';
      var launcher = document.getElementById('nwAssistantLauncher');
      if (launcher) launcher.hidden = true;
    }
  }
  function renderWorkspaceCards() {
    var cards = [
      ['Notes','notes','▤','Write and organize study notes'],
      ['Slides','slides','▧','Build visual presentations'],
      ['Flashcards','flashcards','▣','Practice active recall'],
      ['Quiz','quiz','?','Test your understanding'],
      ['Video Overview','video','▷','Review a visual explanation'],
      ['Audio Overview','audio','♫','Listen to a study recap']
    ];
    root.innerHTML = '<section class="nch-workspace-page"><div class="nch-workspace-intro"><span>YOUR STUDY SPACE</span><h1>Workspace</h1><p>Choose a tool to continue learning.</p></div><div class="nch-tool-carousel-wrap"><button class="nch-carousel-arrow" id="nchCarouselPrev" aria-label="Previous tools">‹</button><div class="nch-tool-carousel" id="nchToolCarousel" tabindex="0">' +
      cards.map(function(c,i){return '<button class="nch-tool-card" type="button" data-workspace-tool="' + c[1] + '" data-card-index="' + i + '"><span class="nch-tool-icon">' + c[2] + '</span><strong>' + c[0] + '</strong><small>' + c[3] + '</small><span class="nch-tool-open">Open tool →</span></button>';}).join('') +
      '</div><button class="nch-carousel-arrow" id="nchCarouselNext" aria-label="Next tools">›</button></div><div class="nch-carousel-dots" id="nchCarouselDots"></div></section>';
    var track = document.getElementById('nchToolCarousel');
    var prev = document.getElementById('nchCarouselPrev'), next = document.getElementById('nchCarouselNext');
    var dots = document.getElementById('nchCarouselDots');
    function update() {
      var cardsEl = Array.from(track.querySelectorAll('.nch-tool-card'));
      var center = Math.round(track.scrollLeft / Math.max(1, cardsEl[0].offsetWidth + 18));
      cardsEl.forEach(function(el,i){el.classList.toggle('is-centered',i===center);});
      dots.innerHTML = cardsEl.map(function(_,i){return '<button type="button" aria-label="Go to tool ' + (i+1) + '" class="' + (i===center?'active':'') + '" data-dot="' + i + '"></button>';}).join('');
    }
    function move(delta) { var card=track.querySelector('.nch-tool-card'); if(card) track.scrollBy({left:delta*(card.offsetWidth+18),behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'}); }
    prev.onclick=function(){move(-1);}; next.onclick=function(){move(1);};
    track.addEventListener('scroll',function(){window.requestAnimationFrame(update);},{passive:true});
    dots.addEventListener('click',function(e){var b=e.target.closest('[data-dot]');if(!b)return;var card=track.querySelectorAll('.nch-tool-card')[Number(b.dataset.dot)];card.scrollIntoView({behavior:'smooth',inline:'center',block:'nearest'});});
    track.addEventListener('keydown',function(e){if(e.key==='ArrowRight'){e.preventDefault();move(1);}if(e.key==='ArrowLeft'){e.preventDefault();move(-1);}});
    update();
  }
  function renderSimplePage(kind) {
    activeTab = 'workspace';
    var toggle = document.getElementById('nchTabToggle');
    if (toggle) { toggle.dataset.active='workspace'; toggle.querySelectorAll('[role="tab"]').forEach(function(t){t.setAttribute('aria-selected',String(t.dataset.tab==='workspace'));}); }
    if (kind === 'library') {
      root.innerHTML = '<section class="nch-library-page"><div class="nch-workspace-intro"><span>YOUR FILES</span><h1>Library</h1><p>Find and organize your study materials.</p></div><div class="nch-library-toolbar"><input id="nchLibrarySearch" type="search" placeholder="Search Library files and folders…" aria-label="Search Library"><button id="nchLibraryUpload" type="button" disabled aria-disabled="true">＋ Upload files</button><button id="nchLibraryFolder" type="button" disabled aria-disabled="true">＋ Folder</button></div><p class="nch-library-notice">Original-file storage and folder APIs are not connected yet. Upload and folder actions are disabled to prevent files being accepted without durable storage.</p><div class="nch-library-filters"><button class="active" data-library-filter="all">All files</button><button data-library-filter="folders">Folders</button><button data-library-filter="files">Files</button><button data-library-filter="images">Images</button></div><div id="nchLibraryItems" class="nch-library-items"><p>Loading your files…</p></div><input id="nchLibraryInput" type="file" accept=".pdf,.docx,.txt,.png,.jpg,.jpeg,.gif,.webp" multiple hidden><div id="nchLibraryProgress" role="status"></div></section>';
      initLibrary();
    } else {
      root.innerHTML = '<section class="nch-schedule-page"><div class="nch-workspace-intro"><span>YOUR AUTOMATIONS</span><h1>Schedule</h1><p>Plan recurring study digests and research tasks.</p></div><div class="nch-schedule-empty"><span>◷</span><h2>Scheduled tasks are being connected</h2><p>Automatic digests will appear here once the secure scheduler and source verification endpoints are deployed.</p></div></section>';
    }
  }
  async function initLibrary() {
    var holder=document.getElementById('nchLibraryItems'), search=document.getElementById('nchLibrarySearch'), input=document.getElementById('nchLibraryInput');
    var foldersKey='notely-library-folders:'+accountKey, folders=[]; try{folders=JSON.parse(localStorage.getItem(foldersKey)||'[]');}catch(_){}
    var filter='all', files=[];
    async function refresh(){try{var data=await SS.api('/api/files');files=data.files||[];render();}catch(e){holder.textContent=e.message||'Could not load Library.';}}
    function render(){
      var q=(search.value||'').toLowerCase();
      var selected=files.filter(function(f){var image=(f.content_type||'').startsWith('image/');return (filter==='all'||(filter==='images'&&image)||(filter==='files'&&!image))&&(f.filename||'').toLowerCase().includes(q);});
      var folderRows=filter==='all'||filter==='folders'?folders.filter(function(f){return f.name.toLowerCase().includes(q);}):[];
      holder.innerHTML=(folderRows.map(function(f){return '<div class="nch-library-item folder"><span>📁</span><strong>'+esc(f.name)+'</strong><small>Folder (stored on this device)</small></div>';}).join(''))+
        (selected.map(function(f){return '<button class="nch-library-item file" type="button" data-library-file="'+esc(f.id)+'"><span>'+(String(f.content_type||'').startsWith('image/')?'▧':'▤')+'</span><strong>'+esc(f.filename)+'</strong><small>'+Math.max(1,Math.round((f.size_bytes||0)/1024))+' KB · '+esc(f.content_type||'File')+'</small></button>';}).join(''))+
        (!folderRows.length&&!selected.length?'<div class="nch-history-empty"><strong>No matching files</strong><small>Upload a file to start your Library.</small></div>':'');
    }
    search.addEventListener('input',render);
    document.querySelectorAll('[data-library-filter]').forEach(function(b){b.onclick=function(){filter=b.dataset.libraryFilter;document.querySelectorAll('[data-library-filter]').forEach(function(x){x.classList.toggle('active',x===b);});render();};});
    // Upload/folder controls stay disabled until private durable object storage and server-side folder APIs are deployed.
    input.addEventListener('change',async function(){
      var progress=document.getElementById('nchLibraryProgress'), chosen=Array.from(input.files||[]);
      for(var i=0;i<chosen.length;i++){
        var f=chosen[i], ext=f.name.toLowerCase().split('.').pop();
        if(!['pdf','docx','txt','png','jpg','jpeg','gif','webp'].includes(ext)){progress.textContent='Skipped unsupported file: '+f.name;continue;}
        if(f.size>8*1024*1024){progress.textContent='Skipped '+f.name+': maximum size is 8 MB.';continue;}
        progress.textContent='Uploading '+(i+1)+' of '+chosen.length+': '+f.name;
        var form=new FormData();form.append('file',f);
        try{await SS.api('/api/files/upload',{method:'POST',body:form});}catch(e){progress.textContent='Upload failed for '+f.name+': '+e.message;}
      }
      progress.textContent='Upload queue finished.';input.value='';await refresh();
    });
    holder.addEventListener('click',async function(e){
      var b=e.target.closest('[data-library-file]');if(!b)return;
      var id=b.dataset.libraryFile;
      try{
        var result=await SS.api('/api/files/'+encodeURIComponent(id));
        var modal=document.createElement('div');modal.className='nch-file-preview';modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');
        modal.innerHTML='<section><button type="button" class="nch-preview-close" aria-label="Close preview">×</button><span>LIBRARY PREVIEW</span><h2>'+esc(result.filename)+'</h2><p>'+esc(result.content_type||'File')+' · '+Math.max(1,Math.round((result.size_bytes||0)/1024))+' KB</p><pre>'+esc(result.preview||'No extracted text is available for this file.')+'</pre><small>'+(result.original_stored?'Original file is stored securely.':'The existing upload service currently retains extracted text and metadata only; original binary storage is not connected yet.')+'</small></section>';
        document.body.appendChild(modal);modal.querySelector('button').onclick=function(){modal.remove();};modal.addEventListener('click',function(ev){if(ev.target===modal)modal.remove();});
      } catch(err){showToast(err.message||'Preview unavailable.');}
    });
    await refresh();
  }
  function installToggle() {
    var crumb=topbar.querySelector('.nw-crumb');
    if (crumb) crumb.outerHTML='<div class="nch-tab-toggle" id="nchTabToggle" data-active="chat" role="tablist" aria-label="Workspace mode"><button type="button" role="tab" data-tab="chat" aria-selected="true">Chat</button><button type="button" role="tab" data-tab="workspace" aria-selected="false">Workspace</button></div>';
    var toggle=document.getElementById('nchTabToggle');
    if(toggle) {
      toggle.addEventListener('click',function(e){var b=e.target.closest('[data-tab]');if(b)setTab(b.dataset.tab);});
      toggle.addEventListener('keydown',function(e){
        if(e.key!=='ArrowLeft'&&e.key!=='ArrowRight')return;
        e.preventDefault();
        var next=e.key==='ArrowRight'?'workspace':'chat';
        setTab(next);
        var target=toggle.querySelector('[data-tab="'+next+'"]');if(target)target.focus();
      });
    }
    topbar.classList.add('nch-topbar-updated');
  }
  sidebar.addEventListener('click',function(e){
    var chat=e.target.closest('[data-spec-chat]');if(chat){currentChatId=chat.dataset.specChat;loadChats();if(window.NotelyAssistant)window.NotelyAssistant.open('').then(function(){return window.NotelyAssistant.selectChat(Number(currentChatId));}).then(function(){window.NotelyAssistant.setMode('maximized',true);});return;}
    var more=e.target.closest('[data-chat-menu]');if(more){e.stopPropagation();var panel=sidebar.querySelector('[data-chat-menu-panel="'+CSS.escape(more.dataset.chatMenu)+'"]');if(panel)panel.hidden=!panel.hidden;return;}
    var action=e.target.closest('[data-chat-action]');if(action){e.stopPropagation();chatAction(action.dataset.chatAction,action.dataset.id);return;}
    var page=e.target.closest('[data-spec-page]');if(page){sidebar.querySelectorAll('[data-spec-page]').forEach(function(x){x.classList.toggle('active',x===page);});renderSimplePage(page.dataset.specPage);}
  });
  document.addEventListener('click',function(e){if(!e.target.closest('.nch-chat-row'))sidebar.querySelectorAll('.nch-chat-menu').forEach(function(m){m.hidden=true;});});
  window.addEventListener('notely:chat-updated',loadChats);
  var topNewChat=document.getElementById('nchNewChat'); if(topNewChat) topNewChat.addEventListener('click',function(){window.setTimeout(loadChats,900);});
  installToggle();
  renderSidebar();
})();
