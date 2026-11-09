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
  let sb=null, currentUser=null, roomChannel=null;
  function supabaseClient(){if(sb)return sb;if(!window.supabase||!window.FOCUS_SUPABASE_CONFIG)return null;sb=window.supabase.createClient(window.FOCUS_SUPABASE_CONFIG.url,window.FOCUS_SUPABASE_CONFIG.key);return sb;}
  async function loadRooms(){
    const client=supabaseClient(),host=document.getElementById("room-list");if(!client||!host)return;
    const {data,error}=await client.from("study_rooms").select("id,name,subject,created_at").eq("is_public",true).order("created_at",{ascending:false}).limit(30);
    if(error){host.innerHTML='<p class="upgrade-muted">Could not load rooms. Check that the database setup SQL has been run.</p>';return;}
    host.innerHTML=data.length?data.map(r=>'<article class="upgrade-task"><div class="upgrade-task-main"><strong>'+safe(r.name)+'</strong><div class="upgrade-task-meta">'+safe(r.subject||"General")+'</div></div><button class="btn btn-secondary" data-join-room="'+safe(r.id)+'">Join</button></article>').join(""):'<p class="upgrade-muted">No public rooms yet. Create the first one.</p>';
    host.querySelectorAll("[data-join-room]").forEach(b=>b.addEventListener("click",()=>joinRoom(b.dataset.joinRoom)));
  }
  async function joinRoom(id){
    const client=supabaseClient();if(!client||!currentUser)return;
    const {error}=await client.from("room_members").upsert({room_id:id,user_id:currentUser.id},{onConflict:"room_id,user_id"});
    if(error){notify("Could not join this room. "+error.message);return;}
    if(roomChannel){await client.removeChannel(roomChannel);roomChannel=null;}
    roomChannel=client.channel("study-room-"+id,{config:{presence:{key:currentUser.id}}});
    roomChannel.on("presence",{event:"sync"},()=>{const node=document.getElementById("room-presence");if(node)node.textContent=Object.keys(roomChannel.presenceState()).length+" studying now";});
    roomChannel.subscribe(async status=>{if(status==="SUBSCRIBED")await roomChannel.track({online_at:new Date().toISOString()});});
    const {data}=await client.from("study_rooms").select("name").eq("id",id).single();
    const title=document.getElementById("active-room-title");if(title)title.textContent=data?data.name:"Study room";
    const presence=document.getElementById("room-presence");if(presence)presence.textContent="Connecting…";
    notify("Joined study room.");
  }
  function renderRooms(){
    const client=supabaseClient();
    root.innerHTML='<section class="upgrade-page">'+heading("STUDY TOGETHER","Global study rooms","Focused sessions with other students. Keep personal details private.")+
      '<div class="upgrade-card" style="margin-bottom:18px"><div id="auth-area"><h2>Sign in to join the community</h2><p class="upgrade-muted">Use an email you can access. Do not use your full name or share personal contact details in a room.</p><form class="upgrade-form" id="auth-form"><input class="upgrade-input" id="auth-email" type="email" autocomplete="email" required placeholder="Email address"><input class="upgrade-input" id="auth-password" type="password" autocomplete="current-password" minlength="8" required placeholder="Password (at least 8 characters)"><button class="btn btn-primary" type="submit">Sign in</button><button class="btn btn-secondary" type="button" id="signup-btn">Create account</button></form><p class="upgrade-muted" id="auth-message" aria-live="polite"></p></div></div>'+
      '<div class="upgrade-grid"><div class="upgrade-card"><h2>Create a public study room</h2><form class="upgrade-form" id="room-form"><input class="upgrade-input" id="room-name" maxlength="50" required placeholder="Room name"><select class="upgrade-select" id="room-subject"><option>General</option><option>Accountancy</option><option>Business Studies</option><option>Economics</option><option>Mathematics</option><option>Science</option><option>Languages</option><option>Computer Science</option></select><button class="btn btn-primary" type="submit">Create room</button></form><p class="upgrade-muted">Public room names only. No chat or direct messages in this first version.</p></div><div class="upgrade-card"><h2>Available rooms</h2><div id="room-list"><p class="upgrade-muted">Sign in to load public rooms.</p></div></div></div>'+
      '<div class="upgrade-card" style="margin-top:18px"><span class="upgrade-chip">LIVE PRESENCE</span><h2 id="active-room-title">No room joined</h2><p class="upgrade-muted" id="room-presence">Join a room to see its live study presence.</p></div></section>';
    if(!client){document.getElementById("auth-message").textContent="Supabase configuration is missing. Check supabase-config.js.";return;}
    function updateAuthArea(){
      const area=document.getElementById("auth-area");if(!area)return;
      if(currentUser){area.innerHTML='<h2>Signed in</h2><p class="upgrade-muted">Your account is active. Your email is not shown to other room members.</p><button class="btn btn-secondary" id="signout-btn" type="button">Sign out</button>';document.getElementById("signout-btn").onclick=async()=>{await client.auth.signOut();};loadRooms();}
      else{
        area.innerHTML='<h2>Sign in to join the community</h2><p class="upgrade-muted">Use an email you can access. Do not use your full name or share personal contact details in a room.</p><form class="upgrade-form" id="auth-form"><input class="upgrade-input" id="auth-email" type="email" autocomplete="email" required placeholder="Email address"><input class="upgrade-input" id="auth-password" type="password" autocomplete="current-password" minlength="8" required placeholder="Password (at least 8 characters)"><button class="btn btn-primary" type="submit">Sign in</button><button class="btn btn-secondary" type="button" id="signup-btn">Create account</button></form><p class="upgrade-muted" id="auth-message" aria-live="polite"></p>';
        document.getElementById("auth-form").onsubmit=async e=>{e.preventDefault();const email=document.getElementById("auth-email").value.trim(),password=document.getElementById("auth-password").value;const {error}=await client.auth.signInWithPassword({email,password});document.getElementById("auth-message").textContent=error?error.message:"Signed in.";};
        document.getElementById("signup-btn").onclick=async()=>{const email=document.getElementById("auth-email").value.trim(),password=document.getElementById("auth-password").value;if(!email||password.length<8){document.getElementById("auth-message").textContent="Enter an email and a password with at least 8 characters.";return;}const {error}=await client.auth.signUp({email,password});document.getElementById("auth-message").textContent=error?error.message:"Check your email for the confirmation link.";};
      }
    }
    client.auth.getSession().then(({data})=>{currentUser=data.session?.user||null;updateAuthArea();});
    client.auth.onAuthStateChange((_event,session)=>{currentUser=session?.user||null;updateAuthArea();});
    document.getElementById("room-form").onsubmit=async e=>{e.preventDefault();if(!currentUser){notify("Sign in first.");return;}const name=document.getElementById("room-name").value.trim(),subject=document.getElementById("room-subject").value;const {data,error}=await client.from("study_rooms").insert({name,subject,created_by:currentUser.id,is_public:true}).select("id").single();if(error){notify("Could not create room: "+error.message);return;}await loadRooms();await joinRoom(data.id);};
  }
  function renderRoute(){
    const route=(location.hash.replace(/^#/,"").split("/")[0]||"home");if(!extraRoutes.includes(route))return;
    setActive(route);if(route==="tasks")renderTasks();if(route==="music")renderMusic();if(route==="rooms")renderRooms();
  }
  // Expose the workspace renderer to the original app router.
  window.FOCUS_UPGRADE_RENDER_ROUTE = renderRoute;
  addNavigation();
  if(extraRoutes.includes(location.hash.replace(/^#/,"").split("/")[0]))renderRoute();
})();