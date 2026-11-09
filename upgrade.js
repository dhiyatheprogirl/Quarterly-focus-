/* FOCUS//MODE — additional local-first features */
(function () {
  "use strict";
  const TASK_KEY = "focusmode_tasks_v1";
  const MUSIC_KEY = "focusmode_music_v1";
  const root = document.getElementById("view-root");
  const extraRoutes = ["tasks","music","rooms"];
  const icon = {
    tasks:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5h14v14H5zM8 9h8M8 13h8M8 17h5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
    music:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18V5l12-2v13M9 18a3 3 0 1 1-3-3c1.7 0 3 1.3 3 3Zm12-2a3 3 0 1 1-3-3c1.7 0 3 1.3 3 3Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    rooms:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M3 19c0-3 2.5-5 6-5s6 2 6 5M16 5a3 3 0 0 1 0 6m2 3c2 .7 3 2.3 3 5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>'
  };
  function read(key,fallback){try{const v=JSON.parse(localStorage.getItem(key));return Array.isArray(v)?v:fallback;}catch(_){return fallback;}}
  function write(key,value){try{localStorage.setItem(key,JSON.stringify(value));}catch(_){notify("Could not save. Check your browser storage.");}}
  function safe(value){return String(value==null?"":value).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
  function notify(message){const box=document.getElementById("toast-container");if(!box)return;const item=document.createElement("div");item.className="toast";item.textContent=message;box.appendChild(item);setTimeout(()=>item.remove(),2600);}
  function getTasks(){return read(TASK_KEY,[]);}
  function getMusic(){return read(MUSIC_KEY,[]);}
  function addNavigation(){
    const side=document.getElementById("sidebar-nav"),bottom=document.getElementById("bottom-nav");
    if(side){const label=document.createElement("div");label.className="upgrade-nav-label";label.textContent="Workspace";side.appendChild(label);}
    extraRoutes.forEach(route=>{
      const name=route==="rooms"?"Study rooms":route[0].toUpperCase()+route.slice(1);
      [side,bottom].forEach((nav,index)=>{
        if(!nav)return;
        const button=document.createElement("button");button.className=index===0?"nav-item":"bottom-nav-item";button.dataset.route=route;
        button.innerHTML='<span class="nav-icon upgrade-icon">'+icon[route]+'</span><span class="'+(index===0?"nav-label":"bottom-nav-label")+'">'+name+'</span>';
        button.addEventListener("click",()=>{location.hash=route;});nav.appendChild(button);
      });
    });
  }
  function setActive(route){document.querySelectorAll(".nav-item,.bottom-nav-item").forEach(el=>el.classList.toggle("active",el.dataset.route===route));}
  function heading(eyebrow,title,sub){return '<header class="upgrade-heading"><p class="page-eyebrow">'+eyebrow+'</p><h1>'+title+'</h1><p>'+sub+'</p></header>';}
  function renderTasks(){
    const tasks=getTasks(),pending=tasks.filter(t=>!t.done).length;
    root.innerHTML='<section class="upgrade-page">'+heading("PERSONAL WORKSPACE","Your tasks","A clear list. One thing at a time.")+
      '<div class="upgrade-grid"><div class="upgrade-card"><h2>Add a task</h2><p class="upgrade-muted">Tasks are saved in this browser.</p>'+
      '<form class="upgrade-form" id="task-form"><input class="upgrade-input" id="task-title" maxlength="100" required placeholder="e.g. Revise journal entries">'+
      '<select class="upgrade-select" id="task-subject"><option>General</option><option>Accountancy</option><option>Business Studies</option><option>Economics</option><option>English</option><option>Computer Science</option><option>Artificial Intelligence</option></select>'+
      '<input class="upgrade-input" id="task-date" type="date" aria-label="Due date"><button class="btn btn-primary" type="submit">Add task</button></form><span class="upgrade-chip">'+pending+' remaining</span></div>'+
      '<div class="upgrade-card"><h2>Task list</h2><p class="upgrade-muted">Tick items off as you finish them.</p><div id="task-list">'+
      (tasks.length?tasks.slice().sort((a,b)=>Number(a.done)-Number(b.done)).map(t=>'<div class="upgrade-task '+(t.done?'done':'')+'"><input type="checkbox" data-task-check="'+safe(t.id)+'" '+(t.done?'checked':'')+' aria-label="Complete task"><div class="upgrade-task-main"><div class="upgrade-task-title">'+safe(t.title)+'</div><div class="upgrade-task-meta">'+safe(t.subject)+' · '+(t.date?'Due '+safe(t.date):'No due date')+'</div></div><button class="upgrade-delete" data-task-delete="'+safe(t.id)+'" aria-label="Delete task">✕</button></div>').join(""):'<p class="upgrade-muted" style="padding:24px 0">No tasks yet. Add the first one above.</p>')+'</div></div></div></section>';
    document.getElementById("task-form").addEventListener("submit",e=>{e.preventDefault();const title=document.getElementById("task-title").value.trim();if(!title)return;const list=getTasks();list.unshift({id:Date.now().toString(36)+Math.random().toString(36).slice(2,6),title,subject:document.getElementById("task-subject").value,date:document.getElementById("task-date").value,done:false});write(TASK_KEY,list);renderTasks();notify("Task added.");});
    document.querySelectorAll("[data-task-check]").forEach(el=>el.addEventListener("change",()=>{const list=getTasks(),task=list.find(t=>t.id===el.dataset.taskCheck);if(task)task.done=el.checked;write(TASK_KEY,list);renderTasks();}));
    document.querySelectorAll("[data-task-delete]").forEach(el=>el.addEventListener("click",()=>{write(TASK_KEY,getTasks().filter(t=>t.id!==el.dataset.taskDelete));renderTasks();notify("Task deleted.");}));
  }
  function spotifyEmbed(raw){
    try{const url=new URL(raw);if(url.hostname!=="open.spotify.com")return null;const p=url.pathname.split("/").filter(Boolean);if(!["playlist","album","track","artist","show","episode"].includes(p[0])||!p[1])return null;return "https://open.spotify.com/embed/"+p[0]+"/"+encodeURIComponent(p[1]);}catch(_){return null;}
  }
  function renderMusic(){
    const items=getMusic();
    root.innerHTML='<section class="upgrade-page">'+heading("LISTEN WHILE YOU WORK","Study music","Your playlists, right inside your workspace.")+
      '<div class="upgrade-card" style="margin-bottom:18px"><h2>Add a Spotify playlist</h2><p class="upgrade-muted">Paste a Spotify playlist, album or track link. Spotify may ask you to sign in or open its app.</p>'+
      '<form class="upgrade-form" id="music-form"><input class="upgrade-input" id="music-name" maxlength="60" required placeholder="Playlist name"><input class="upgrade-input" id="music-url" type="url" required placeholder="https://open.spotify.com/playlist/..."><button class="btn btn-primary" type="submit">Add music</button></form></div>'+
      '<div class="music-list" id="music-list">'+(items.length?items.map(item=>'<article class="music-item"><iframe title="'+safe(item.name)+'" src="'+safe(item.embed)+'" height="152" loading="lazy" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" allowfullscreen></iframe><div class="music-item-info"><strong>'+safe(item.name)+'</strong><button class="upgrade-delete" data-music-delete="'+safe(item.id)+'" aria-label="Remove playlist">Remove</button></div></article>').join(""):'<div class="upgrade-card"><h2>Your music library is empty</h2><p class="upgrade-muted">Add a Spotify playlist link above to start building it.</p></div>')+'</div></section>';
    document.getElementById("music-form").addEventListener("submit",e=>{e.preventDefault();const name=document.getElementById("music-name").value.trim(),embed=spotifyEmbed(document.getElementById("music-url").value.trim());if(!embed){notify("Use a valid open.spotify.com playlist, album or track link.");return;}const list=getMusic();list.unshift({id:Date.now().toString(36),name,embed});write(MUSIC_KEY,list);renderMusic();notify("Added to your music library.");});
    document.querySelectorAll("[data-music-delete]").forEach(el=>el.addEventListener("click",()=>{write(MUSIC_KEY,getMusic().filter(m=>m.id!==el.dataset.musicDelete));renderMusic();notify("Removed from your music library.");}));
  }
  function renderRooms(){
    root.innerHTML='<section class="upgrade-page">'+heading("STUDY TOGETHER","Global study rooms","A shared space for focused work, wherever students are.")+
      '<div class="room-banner"><span class="upgrade-chip">COMMUNITY · IN DEVELOPMENT</span><h2>Study alongside people around the world.</h2><p class="upgrade-muted">Live rooms, accounts and synchronized timers need a secure shared backend before they can work across different devices.</p></div>'+
      '<div class="upgrade-grid" style="margin-top:18px"><div class="upgrade-card"><div class="room-feature"><div class="room-feature-icon">◷</div><div><h2>Shared focus sessions</h2><p class="upgrade-muted">Start a Pomodoro with other members and stay in sync.</p></div></div><div class="room-feature"><div class="room-feature-icon">◎</div><div><h2>Public and private rooms</h2><p class="upgrade-muted">Join open study spaces or create invite-only rooms.</p></div></div><div class="room-feature"><div class="room-feature-icon">✦</div><div><h2>Community safeguards</h2><p class="upgrade-muted">Profiles, reporting, moderation and privacy controls will be part of the launch design.</p></div></div></div>'+
      '<div class="upgrade-card"><h2>What comes next</h2><p class="upgrade-muted" style="margin:10px 0 16px">Next phase: connect Supabase for authentication, room presence and realtime updates. This section stays marked as a preview until those features are connected and tested.</p><span class="upgrade-chip">No fake online users</span></div></div></section>';
  }
  function renderRoute(){
    const route=(location.hash.replace(/^#/,"").split("/")[0]||"home");if(!extraRoutes.includes(route))return;
    setActive(route);if(route==="tasks")renderTasks();if(route==="music")renderMusic();if(route==="rooms")renderRooms();
  }
  window.addEventListener("hashchange",renderRoute);
  addNavigation();
  if(extraRoutes.includes(location.hash.replace(/^#/,"").split("/")[0]))renderRoute();
})();