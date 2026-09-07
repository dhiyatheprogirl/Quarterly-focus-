/* =========================================================================
   FOCUS//MODE — APPLICATION LOGIC
   Vanilla JS, no dependencies. Everything persists to localStorage.

   TABLE OF CONTENTS
   1.  Storage keys & persistence helpers
   2.  Default state / seed data
   3.  Small utilities (dates, ids, formatting)
   4.  State accessors & derived calculations (prep %, streak, stats)
   5.  Router
   6.  Toast + Modal helpers
   7.  Page renderers: Home
   8.  Page renderers: Planner
   9.  Page renderers: Subjects (list + detail)
   10. Page renderers: Analytics
   11. Page renderers: Settings
   12. Focus Timer engine
   13. Init
   ========================================================================= */

(function () {
  "use strict";

  /* ======================================================================
     1. STORAGE KEYS & PERSISTENCE HELPERS
     Everything lives under one namespaced object so a single localStorage
     key holds the whole app; simpler to version/reset than many keys.
     ====================================================================== */
  const STORAGE_KEY = "focusmode_state_v1";

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      console.error("FOCUS//MODE: failed to read saved data", e);
      return null;
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(STATE));
    } catch (e) {
      console.error("FOCUS//MODE: failed to save data", e);
      showToast("Could not save — storage may be full.");
    }
  }

  /* ======================================================================
     2. DEFAULT STATE / SEED DATA
     No syllabus content is invented here — every subject starts with an
     empty topic list. The user adds their own chapters/topics/units.
     Only structural defaults required by the brief (subject priority
     tiers) are pre-set, and those remain fully editable.
     ====================================================================== */
  const SUBJECT_DEFS = [
    { id: "acc", name: "Accountancy", group: "major", priority: "high" },
    { id: "bst", name: "Business Studies", group: "major", priority: "high" },
    { id: "eco", name: "Economics", group: "major", priority: "high" },
    { id: "ai", name: "Artificial Intelligence", group: "other", priority: "medium" },
    { id: "eng", name: "English", group: "other", priority: "normal" },
    { id: "cs", name: "Computer Science", group: "other", priority: "medium" },
  ];

  function defaultState() {
    return {
      version: 1,
      examDate: null, // ISO date string, set by user in Settings
      dailyGoalMinutes: 180,
      defaultTimerMinutes: 50,
      accentColor: "#e3b341",
      subjects: SUBJECT_DEFS.map((s) => ({
        id: s.id,
        name: s.name,
        group: s.group,
        priority: s.priority, // 'high' | 'medium' | 'normal'
        targetMark: null,
        topics: [], // { id, name, completion, revision, weakness }
      })),
      planner: [], // { id, subjectId, topic, duration, priority, status, date }
      sessions: [], // { id, subjectId, topic, duration, date, time }
      streak: { current: 0, longest: 0, lastStudyDate: null },
      manualFocus: null, // { subjectId, topic, duration } | null — user override
      motivationIndex: 0,
    };
  }

  function migrateState(saved) {
    // Merge saved data over defaults so new fields introduced later never
    // crash on old saved data, and so subjects added to SUBJECT_DEFS in
    // future updates still appear.
    const base = defaultState();
    if (!saved) return base;
    const merged = Object.assign({}, base, saved);
    merged.subjects = base.subjects.map((defSubj) => {
      const savedSubj = (saved.subjects || []).find((s) => s.id === defSubj.id);
      return savedSubj ? Object.assign({}, defSubj, savedSubj) : defSubj;
    });
    merged.streak = Object.assign({}, base.streak, saved.streak || {});
    return merged;
  }

  let STATE = migrateState(loadState());

  /* ======================================================================
     3. SMALL UTILITIES
     ====================================================================== */
  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function todayISO() {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 10);
  }

  function addDaysISO(iso, days) {
    const d = new Date(iso + "T00:00:00");
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  }

  function isoToDisplay(iso, opts) {
    if (!iso) return "—";
    const d = new Date(iso + "T00:00:00");
    const options = opts || { weekday: "short", month: "short", day: "numeric" };
    return d.toLocaleDateString(undefined, options);
  }

  function daysBetween(fromISO, toISO) {
    const a = new Date(fromISO + "T00:00:00");
    const b = new Date(toISO + "T00:00:00");
    return Math.round((b - a) / 86400000);
  }

  function formatMinutes(mins) {
    mins = Math.round(mins);
    if (mins < 60) return mins + "m";
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m === 0 ? h + "h" : h + "h " + m + "m";
  }

  function formatClock(totalSeconds) {
    const s = Math.max(0, Math.round(totalSeconds));
    const mm = Math.floor(s / 60).toString().padStart(2, "0");
    const ss = (s % 60).toString().padStart(2, "0");
    return mm + ":" + ss;
  }

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  function escapeHTML(str) {
    const div = document.createElement("div");
    div.textContent = str == null ? "" : String(str);
    return div.innerHTML;
  }

  function priorityWeight(p) {
    return p === "high" ? 3 : p === "medium" ? 2 : 1;
  }
  function priorityLabel(p) {
    return p === "high" ? "HIGH" : p === "medium" ? "MEDIUM" : p === "low" ? "LOW" : "NORMAL";
  }
  const REVISION_STAGES = ["not-studied", "first-study", "revision-1", "revision-2", "final-revision"];
  const REVISION_LABELS = {
    "not-studied": "Not studied",
    "first-study": "First study",
    "revision-1": "Revision 1",
    "revision-2": "Revision 2",
    "final-revision": "Final revision",
  };
  const REVISION_SCORE = {
    "not-studied": 0, "first-study": 0.25, "revision-1": 0.5, "revision-2": 0.75, "final-revision": 1,
  };
  const COMPLETION_LABELS = { "not-started": "Not started", "in-progress": "In progress", "completed": "Completed" };
  const WEAKNESS_LABELS = { none: "—", weak: "Weak", "needs-revision": "Needs revision", strong: "Strong" };

  /* ======================================================================
     4. STATE ACCESSORS & DERIVED CALCULATIONS
     ====================================================================== */
  function getSubject(id) {
    return STATE.subjects.find((s) => s.id === id);
  }

  function sessionsOn(dateISO) {
    return STATE.sessions.filter((s) => s.date === dateISO);
  }

  function plannerFor(dateISO) {
    return STATE.planner.filter((t) => t.date === dateISO);
  }

  // Preparation % for one subject: chapter completion, revision depth,
  // weak-topic load, and planner follow-through all feed the number, so it
  // moves only when real progress is recorded — never randomly.
  function subjectPrep(subject) {
    const topics = subject.topics;
    let completionRatio = 0, revisionRatio = 0, weaknessPenalty = 0;
    if (topics.length > 0) {
      completionRatio = topics.filter((t) => t.completion === "completed").length / topics.length;
      revisionRatio = topics.reduce((sum, t) => sum + REVISION_SCORE[t.revision || "not-studied"], 0) / topics.length;
      const weakCount = topics.reduce((sum, t) => {
        if (t.weakness === "weak") return sum + 1;
        if (t.weakness === "needs-revision") return sum + 0.5;
        return sum;
      }, 0);
      weaknessPenalty = weakCount / topics.length;
    }
    const subjTasks = STATE.planner.filter((t) => t.subjectId === subject.id);
    const plannerRatio = subjTasks.length ? subjTasks.filter((t) => t.status === "completed").length / subjTasks.length : 0;

    if (topics.length === 0 && subjTasks.length === 0) return 0;

    const score = 0.4 * completionRatio + 0.3 * revisionRatio + 0.2 * (1 - weaknessPenalty) + 0.1 * plannerRatio;
    return Math.round(clamp(score, 0, 1) * 100);
  }

  function overallPrep() {
    const weights = STATE.subjects.map((s) => priorityWeight(s.priority));
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    const weighted = STATE.subjects.reduce((sum, s, i) => sum + subjectPrep(s) * weights[i], 0);
    return totalWeight ? Math.round(weighted / totalWeight) : 0;
  }

  function totalStudyMinutes(subjectId) {
    return STATE.sessions
      .filter((s) => !subjectId || s.subjectId === subjectId)
      .reduce((sum, s) => sum + s.duration, 0);
  }

  function recordSessionEffects(session) {
    STATE.sessions.push(session);
    updateStreakForToday();
  }

  function updateStreakForToday() {
    const today = todayISO();
    const last = STATE.streak.lastStudyDate;
    if (last === today) {
      // already counted today
    } else if (last === addDaysISO(today, -1)) {
      STATE.streak.current += 1;
    } else {
      STATE.streak.current = 1;
    }
    STATE.streak.longest = Math.max(STATE.streak.longest, STATE.streak.current);
    STATE.streak.lastStudyDate = today;
  }

  // Recommend today's focus: pending high-priority planner tasks first
  // (weak topics bump priority), otherwise the highest-priority unresolved
  // weak topic across all subjects, otherwise nothing to suggest.
  function computeRecommendation() {
    if (STATE.manualFocus) return { source: "manual", ...STATE.manualFocus };

    const today = todayISO();
    const pending = STATE.planner.filter((t) => t.date === today && t.status !== "completed");
    if (pending.length) {
      const scored = pending.map((t) => {
        const subj = getSubject(t.subjectId);
        const topicObj = subj ? subj.topics.find((tp) => tp.name === t.topic) : null;
        const isWeak = topicObj && (topicObj.weakness === "weak" || topicObj.weakness === "needs-revision");
        let score = priorityWeight(t.priority) * 10 + (subj ? priorityWeight(subj.priority) : 0);
        if (isWeak) score += 5;
        if (t.status === "in-progress") score += 2;
        return { task: t, score };
      });
      scored.sort((a, b) => b.score - a.score);
      const top = scored[0].task;
      const subj = getSubject(top.subjectId);
      return {
        source: "planner",
        taskId: top.id,
        subjectId: top.subjectId,
        subjectName: subj ? subj.name : "Subject",
        topic: top.topic,
        duration: top.duration,
        reason: (subj && subj.priority === "high" ? "High priority" : priorityLabel(top.priority) + " priority") +
          (scored[0].score >= 15 ? " • needs practice" : ""),
      };
    }

    // Fallback: weakest untouched topic, prioritising higher-priority subjects
    let best = null;
    STATE.subjects.forEach((subj) => {
      subj.topics.forEach((t) => {
        if (t.completion === "completed" && t.weakness !== "weak" && t.weakness !== "needs-revision") return;
        if (t.weakness !== "weak" && t.weakness !== "needs-revision") return;
        const score = priorityWeight(subj.priority) * 10 + (t.weakness === "weak" ? 5 : 2);
        if (!best || score > best.score) {
          best = { score, subjectId: subj.id, subjectName: subj.name, topic: t.name };
        }
      });
    });
    if (best) {
      return {
        source: "weak-topic",
        subjectId: best.subjectId,
        subjectName: best.subjectName,
        topic: best.topic,
        duration: STATE.defaultTimerMinutes,
        reason: "Marked as weak • needs attention",
      };
    }

    return null;
  }

  const MOTIVATION_LINES = [
    "One focused session at a time.",
    "Progress > perfection.",
    "Today's work becomes tomorrow's confidence.",
    "Small consistent sessions beat last-minute cramming.",
    "You don't need a perfect plan — just the next session.",
  ];

  /* ======================================================================
     5. ROUTER
     ====================================================================== */
  const viewRoot = document.getElementById("view-root");
  const routes = {
    home: renderHome,
    planner: renderPlanner,
    subjects: renderSubjectsList,
    analytics: renderAnalytics,
    settings: renderSettings,
  };

  function currentRoute() {
    const hash = location.hash.replace("#", "") || "home";
    return hash;
  }

  function navigate(route) {
    location.hash = route;
  }

  function renderRoute() {
    const hash = currentRoute();
    const [base, param] = hash.split("/");

    document.querySelectorAll(".nav-item, .bottom-nav-item").forEach((el) => {
      el.classList.toggle("active", el.dataset.route === base);
    });

    viewRoot.innerHTML = "";
    if (base === "subjects" && param) {
      renderSubjectDetail(param);
    } else if (routes[base]) {
      routes[base]();
    } else {
      renderHome();
    }
    viewRoot.focus();
  }

  window.addEventListener("hashchange", renderRoute);

  document.querySelectorAll(".nav-item, .bottom-nav-item").forEach((btn) => {
    btn.addEventListener("click", () => navigate(btn.dataset.route));
  });

  /* ======================================================================
     6. TOAST + MODAL HELPERS
     ====================================================================== */
  const toastContainer = document.getElementById("toast-container");
  function showToast(message) {
    const el = document.createElement("div");
    el.className = "toast";
    el.textContent = message;
    toastContainer.appendChild(el);
    setTimeout(() => el.remove(), 2600);
  }

  const modalRoot = document.getElementById("modal-root");
  const modalBox = document.getElementById("modal-box");
  const modalBackdrop = document.getElementById("modal-backdrop");

  function openModal(html, onMount) {
    modalBox.innerHTML = html;
    modalRoot.hidden = false;
    if (onMount) onMount(modalBox);
  }
  function closeModal() {
    modalRoot.hidden = true;
    modalBox.innerHTML = "";
  }
  modalBackdrop.addEventListener("click", closeModal);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !modalRoot.hidden) closeModal();
  });

  function confirmDialog(title, message, confirmLabel, onConfirm, danger) {
    openModal(
      `<h3 class="modal-title">${escapeHTML(title)}</h3>
       <p class="modal-subtitle">${escapeHTML(message)}</p>
       <div class="modal-actions">
         <button class="btn btn-secondary" data-act="cancel">Cancel</button>
         <button class="btn ${danger ? "btn-danger" : "btn-primary"}" data-act="confirm">${escapeHTML(confirmLabel)}</button>
       </div>`,
      (box) => {
        box.querySelector('[data-act="cancel"]').addEventListener("click", closeModal);
        box.querySelector('[data-act="confirm"]').addEventListener("click", () => {
          onConfirm();
          closeModal();
        });
      }
    );
  }

  /* ======================================================================
     7. HOME PAGE
     ====================================================================== */
  function renderHome() {
    const today = todayISO();
    const daysLeft = STATE.examDate ? daysBetween(today, STATE.examDate) : null;
    const prep = overallPrep();
    const reco = computeRecommendation();
    const todaysSessions = sessionsOn(today);
    const studiedToday = todaysSessions.reduce((s, x) => s + x.duration, 0);
    const tasksLeft = plannerFor(today).filter((t) => t.status !== "completed").length;

    const motivation = MOTIVATION_LINES[STATE.motivationIndex % MOTIVATION_LINES.length];

    const el = document.createElement("div");
    el.innerHTML = `
      <div class="hero-top">
        <div>
          <p class="hero-brand-eyebrow">Quarterly exam comeback</p>
          <h1 class="hero-brand-title"><span class="brand-slash">FOCUS//MODE</span></h1>
          <p class="hero-sub">${escapeHTML(motivation)}</p>
        </div>
        <div class="hero-metrics">
          <div class="hero-metric">
            <div class="hero-metric-value mono">${daysLeft === null ? "—" : daysLeft}</div>
            <div class="hero-metric-label">${daysLeft === null ? "Set exam date" : (daysLeft === 1 ? "Day left" : "Days left")}</div>
          </div>
          <div class="hero-metric is-accent">
            <div class="hero-metric-value mono">${prep}<span class="unit">%</span></div>
            <div class="hero-metric-label">Prepared</div>
            <div class="progress-track slim hero-metric-prep-bar"><div class="progress-fill" style="width:${prep}%"></div></div>
          </div>
        </div>
      </div>

      ${daysLeft === null ? `
        <div class="empty-state" style="margin-bottom:32px;">
          <p>No exam date set yet — set it in Settings so your countdown means something.</p>
          <button class="btn btn-primary btn-sm" id="goto-settings-btn">Go to Settings</button>
        </div>` : ""}

      <div class="focus-panel">
        <div class="focus-eyebrow-row">
          <span class="focus-eyebrow">Today's Focus</span>
          ${reco ? `<button class="focus-change-link" id="change-focus-btn">Change focus</button>` : ""}
        </div>
        ${reco ? `
          <h2 class="focus-subject">${escapeHTML((reco.subjectName || "").toUpperCase())}</h2>
          <p class="focus-topic">${escapeHTML(reco.topic)}</p>
          ${reco.reason ? `<p class="focus-reco"><span class="dot"></span>${escapeHTML(reco.reason)}</p>` : ""}
          <div class="focus-footer">
            <span class="focus-duration mono">${reco.duration} minutes</span>
            <button class="btn btn-primary" id="start-focus-btn">Start Focus</button>
          </div>
        ` : `
          <p class="focus-empty">Nothing queued yet. Add a planner task or mark a weak topic to get a recommendation.</p>
          <div class="focus-footer">
            <button class="btn btn-secondary" id="add-task-shortcut-btn">Add a task</button>
            <button class="btn btn-primary" id="start-focus-btn">Start Focus Anyway</button>
          </div>
        `}
      </div>

      <div class="stat-row">
        <div class="stat-item">
          <div class="stat-value mono">${formatMinutes(studiedToday)}</div>
          <div class="stat-label">Studied today</div>
        </div>
        <div class="stat-item">
          <div class="stat-value mono">${todaysSessions.length}</div>
          <div class="stat-label">Sessions</div>
        </div>
        <div class="stat-item">
          <div class="stat-value mono">${tasksLeft}</div>
          <div class="stat-label">Tasks left</div>
        </div>
        <div class="stat-item">
          <div class="stat-value mono">🔥 ${STATE.streak.current}</div>
          <div class="stat-label">Day streak</div>
        </div>
      </div>

      <p class="overview-section-title">Subject overview</p>
      <div class="overview-grid" id="home-overview-grid"></div>
    `;
    viewRoot.appendChild(el);

    const grid = el.querySelector("#home-overview-grid");
    STATE.subjects.forEach((s) => {
      const row = document.createElement("div");
      row.className = "overview-row";
      row.innerHTML = `<span class="overview-name">${escapeHTML(s.name)}</span><span class="overview-pct mono">${subjectPrep(s)}%</span>`;
      row.addEventListener("click", () => navigate("subjects/" + s.id));
      grid.appendChild(row);
    });

    const settingsBtn = el.querySelector("#goto-settings-btn");
    if (settingsBtn) settingsBtn.addEventListener("click", () => navigate("settings"));

    const startBtn = el.querySelector("#start-focus-btn");
    if (startBtn) {
      startBtn.addEventListener("click", () => {
        if (reco) {
          openTimerSetup({ subjectId: reco.subjectId, subjectName: reco.subjectName, topic: reco.topic, duration: reco.duration, taskId: reco.taskId });
        } else {
          openTimerSetup({ subjectId: STATE.subjects[0].id, subjectName: STATE.subjects[0].name, topic: "Study session", duration: STATE.defaultTimerMinutes });
        }
      });
    }
    const changeBtn = el.querySelector("#change-focus-btn");
    if (changeBtn) changeBtn.addEventListener("click", openChangeFocusModal);
    const addTaskBtn = el.querySelector("#add-task-shortcut-btn");
    if (addTaskBtn) addTaskBtn.addEventListener("click", () => openTaskModal(null));
  }

  function openChangeFocusModal() {
    const subjOptions = STATE.subjects.map((s) => `<option value="${s.id}">${escapeHTML(s.name)}</option>`).join("");
    openModal(
      `<h3 class="modal-title">Change today's focus</h3>
       <p class="modal-subtitle">Pick what you want to work on right now.</p>
       <div class="field">
         <label for="cf-subject">Subject</label>
         <select id="cf-subject">${subjOptions}</select>
       </div>
       <div class="field">
         <label for="cf-topic">Topic</label>
         <input type="text" id="cf-topic" placeholder="e.g. Journal — Practice">
       </div>
       <div class="field">
         <label for="cf-duration">Duration (minutes)</label>
         <input type="number" id="cf-duration" value="${STATE.defaultTimerMinutes}" min="5" max="240">
       </div>
       <div class="modal-actions">
         <button class="btn btn-secondary" id="cf-clear">Clear override</button>
         <button class="btn btn-primary" id="cf-save">Set focus</button>
       </div>`,
      (box) => {
        box.querySelector("#cf-save").addEventListener("click", () => {
          const subjectId = box.querySelector("#cf-subject").value;
          const subject = getSubject(subjectId);
          const topic = box.querySelector("#cf-topic").value.trim() || "Study session";
          const duration = clamp(parseInt(box.querySelector("#cf-duration").value, 10) || STATE.defaultTimerMinutes, 5, 240);
          STATE.manualFocus = { subjectId, subjectName: subject.name, topic, duration };
          saveState();
          closeModal();
          renderRoute();
        });
        box.querySelector("#cf-clear").addEventListener("click", () => {
          STATE.manualFocus = null;
          saveState();
          closeModal();
          renderRoute();
        });
      }
    );
  }

  /* ======================================================================
     8. PLANNER PAGE
     ====================================================================== */
  let plannerViewDate = todayISO();

  function renderPlanner() {
    const el = document.createElement("div");
    const tasks = plannerFor(plannerViewDate).sort((a, b) => priorityWeight(b.priority) - priorityWeight(a.priority));

    el.innerHTML = `
      <div class="page-header">
        <p class="page-eyebrow">Daily planner</p>
        <h1 class="page-title">Planner</h1>
      </div>
      <div class="planner-toolbar">
        <div class="date-nav">
          <button class="icon-btn" id="date-prev">‹</button>
          <span class="date-nav-label">${plannerViewDate === todayISO() ? "Today" : isoToDisplay(plannerViewDate)}</span>
          <button class="icon-btn" id="date-next">›</button>
        </div>
        <button class="btn btn-primary btn-sm" id="add-task-btn">+ Add Task</button>
      </div>
      <div class="task-list" id="task-list"></div>
    `;
    viewRoot.appendChild(el);

    const list = el.querySelector("#task-list");
    if (!tasks.length) {
      list.innerHTML = `<div class="empty-state"><p>No tasks for this day yet.</p><button class="btn btn-secondary btn-sm" id="empty-add-task">+ Add your first task</button></div>`;
      list.querySelector("#empty-add-task").addEventListener("click", () => openTaskModal(null));
    } else {
      tasks.forEach((t) => list.appendChild(renderTaskRow(t)));
    }

    el.querySelector("#date-prev").addEventListener("click", () => { plannerViewDate = addDaysISO(plannerViewDate, -1); renderRoute(); });
    el.querySelector("#date-next").addEventListener("click", () => { plannerViewDate = addDaysISO(plannerViewDate, 1); renderRoute(); });
    el.querySelector("#add-task-btn").addEventListener("click", () => openTaskModal(null));
  }

  function renderTaskRow(t) {
    const subject = getSubject(t.subjectId);
    const row = document.createElement("div");
    row.className = "task-row" + (t.status === "completed" ? " is-complete" : "");
    row.innerHTML = `
      <button class="task-check" data-act="toggle">✓</button>
      <div class="task-main">
        <div class="task-title">${escapeHTML(subject ? subject.name : "—")} — ${escapeHTML(t.topic)}</div>
        <div class="task-meta">${priorityLabel(t.priority)} · ${COMPLETION_LABELS[t.status]}</div>
      </div>
      <span class="task-duration mono">${t.duration}m</span>
      <div class="task-actions">
        <button class="icon-btn" data-act="edit" title="Edit">✎</button>
        <button class="icon-btn" data-act="delete" title="Delete">✕</button>
      </div>
    `;
    row.querySelector('[data-act="toggle"]').addEventListener("click", () => {
      t.status = t.status === "completed" ? "not-started" : "completed";
      saveState();
      renderRoute();
    });
    row.querySelector('[data-act="edit"]').addEventListener("click", () => openTaskModal(t));
    row.querySelector('[data-act="delete"]').addEventListener("click", () => {
      confirmDialog("Delete task?", `Remove "${t.topic}" from your planner.`, "Delete", () => {
        STATE.planner = STATE.planner.filter((x) => x.id !== t.id);
        saveState();
        renderRoute();
      }, true);
    });
    return row;
  }

  function openTaskModal(existing) {
    const isEdit = !!existing;
    const subjOptions = STATE.subjects.map((s) => `<option value="${s.id}" ${existing && existing.subjectId === s.id ? "selected" : ""}>${escapeHTML(s.name)}</option>`).join("");
    openModal(
      `<h3 class="modal-title">${isEdit ? "Edit task" : "Add task"}</h3>
       <div class="field">
         <label for="tk-subject">Subject</label>
         <select id="tk-subject">${subjOptions}</select>
       </div>
       <div class="field">
         <label for="tk-topic">Chapter / topic</label>
         <input type="text" id="tk-topic" value="${existing ? escapeHTML(existing.topic) : ""}" placeholder="e.g. Journal">
       </div>
       <div class="field-row">
         <div class="field">
           <label for="tk-duration">Duration (min)</label>
           <input type="number" id="tk-duration" min="5" max="240" value="${existing ? existing.duration : STATE.defaultTimerMinutes}">
         </div>
         <div class="field">
           <label>Priority</label>
           <div class="segmented" id="tk-priority">
             <button type="button" data-val="high" class="${(!existing || existing.priority === 'high') ? 'active' : ''}">High</button>
             <button type="button" data-val="medium" class="${existing && existing.priority === 'medium' ? 'active' : ''}">Medium</button>
             <button type="button" data-val="low" class="${existing && existing.priority === 'low' ? 'active' : ''}">Low</button>
           </div>
         </div>
       </div>
       <div class="field">
         <label for="tk-date">Date</label>
         <input type="date" id="tk-date" value="${existing ? existing.date : plannerViewDate}">
       </div>
       <div class="modal-actions">
         <button class="btn btn-secondary" data-act="cancel">Cancel</button>
         <button class="btn btn-primary" data-act="save">${isEdit ? "Save changes" : "Add task"}</button>
       </div>`,
      (box) => {
        let priority = existing ? existing.priority : "high";
        box.querySelectorAll("#tk-priority button").forEach((b) => {
          b.addEventListener("click", () => {
            priority = b.dataset.val;
            box.querySelectorAll("#tk-priority button").forEach((x) => x.classList.remove("active"));
            b.classList.add("active");
          });
        });
        box.querySelector('[data-act="cancel"]').addEventListener("click", closeModal);
        box.querySelector('[data-act="save"]').addEventListener("click", () => {
          const subjectId = box.querySelector("#tk-subject").value;
          const topic = box.querySelector("#tk-topic").value.trim();
          const duration = clamp(parseInt(box.querySelector("#tk-duration").value, 10) || 30, 5, 240);
          const date = box.querySelector("#tk-date").value || plannerViewDate;
          if (!topic) { showToast("Add a topic name first."); return; }
          if (isEdit) {
            existing.subjectId = subjectId; existing.topic = topic; existing.duration = duration;
            existing.priority = priority; existing.date = date;
          } else {
            STATE.planner.push({ id: uid(), subjectId, topic, duration, priority, status: "not-started", date });
          }
          saveState();
          closeModal();
          renderRoute();
        });
      }
    );
  }

  /* ======================================================================
     9. SUBJECTS — LIST + DETAIL
     ====================================================================== */
  function renderSubjectsList() {
    const el = document.createElement("div");
    el.innerHTML = `
      <div class="page-header">
        <p class="page-eyebrow">Six-subject tracker</p>
        <h1 class="page-title">Subjects</h1>
      </div>
      <div class="subject-list" id="subject-list"></div>
    `;
    viewRoot.appendChild(el);
    const list = el.querySelector("#subject-list");
    STATE.subjects.forEach((s) => {
      const pct = subjectPrep(s);
      const row = document.createElement("div");
      row.className = "subject-row";
      row.innerHTML = `
        <span class="subject-row-name">${escapeHTML(s.name)}</span>
        <span class="subject-row-priority"><span class="pill pill-${s.priority}">${priorityLabel(s.priority)}</span></span>
        <span class="subject-row-pct mono">${pct}%</span>
        <span class="subject-row-bar"><div class="progress-track slim"><div class="progress-fill" style="width:${pct}%"></div></div></span>
      `;
      row.addEventListener("click", () => navigate("subjects/" + s.id));
      list.appendChild(row);
    });
  }

  function renderSubjectDetail(subjectId) {
    const subject = getSubject(subjectId);
    if (!subject) { renderSubjectsList(); return; }
    const pct = subjectPrep(subject);
    const minutes = totalStudyMinutes(subject.id);
    const completedCount = subject.topics.filter((t) => t.completion === "completed").length;
    const remainingCount = subject.topics.length - completedCount;
    const weakTopics = subject.topics.filter((t) => t.weakness === "weak" || t.weakness === "needs-revision");

    const el = document.createElement("div");
    el.innerHTML = `
      <button class="detail-back" id="detail-back">← All subjects</button>
      <div class="detail-hero">
        <div>
          <p class="page-eyebrow">${priorityLabel(subject.priority)} PRIORITY</p>
          <h1 class="page-title">${escapeHTML(subject.name)}</h1>
        </div>
        <div class="detail-metrics">
          <div>
            <div class="detail-metric-value mono">${pct}%</div>
            <div class="detail-metric-label">Preparation</div>
          </div>
          <div>
            <div class="detail-metric-value mono">${formatMinutes(minutes)}</div>
            <div class="detail-metric-label">Study time</div>
          </div>
          <div>
            <div class="detail-metric-value mono">${completedCount}/${subject.topics.length}</div>
            <div class="detail-metric-label">Chapters done</div>
          </div>
        </div>
      </div>
      <div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div>

      <div class="section-head">
        <h3>Chapters &amp; topics</h3>
        <button class="btn btn-secondary btn-sm" id="add-topic-btn">+ Add topic</button>
      </div>
      <div id="topic-list"></div>

      <div class="section-head"><h3>Weak areas</h3></div>
      <div id="weak-list">${weakTopics.length ? "" : `<p class="empty-state" style="padding:20px;">No weak topics marked yet. Mark a topic's status below.</p>`}</div>

      <div class="section-head"><h3>Target mark</h3></div>
      <div class="target-row">
        <span>Target for ${escapeHTML(subject.name)}</span>
        <input type="number" id="target-input" min="0" max="100" value="${subject.targetMark == null ? "" : subject.targetMark}" placeholder="e.g. 90">
      </div>
    `;
    viewRoot.appendChild(el);

    el.querySelector("#detail-back").addEventListener("click", () => navigate("subjects"));
    el.querySelector("#add-topic-btn").addEventListener("click", () => openTopicModal(subject, null));

    const topicList = el.querySelector("#topic-list");
    if (!subject.topics.length) {
      topicList.innerHTML = `<div class="empty-state"><p>No chapters added yet for ${escapeHTML(subject.name)}. Add your own syllabus — chapters, units, or topics.</p><button class="btn btn-secondary btn-sm" id="empty-add-topic">+ Add your first topic</button></div>`;
      topicList.querySelector("#empty-add-topic").addEventListener("click", () => openTopicModal(subject, null));
    } else {
      subject.topics.forEach((t) => topicList.appendChild(renderTopicRow(subject, t)));
    }

    const weakList = el.querySelector("#weak-list");
    weakTopics.forEach((t) => {
      const row = document.createElement("div");
      row.className = "task-row";
      row.innerHTML = `<span class="pill pill-weak">${t.weakness === "weak" ? "WEAK" : "NEEDS REVISION"}</span>
        <div class="task-main"><div class="task-title">${escapeHTML(t.name)}</div></div>`;
      weakList.appendChild(row);
    });

    const targetInput = el.querySelector("#target-input");
    targetInput.addEventListener("change", () => {
      const v = targetInput.value === "" ? null : clamp(parseInt(targetInput.value, 10), 0, 100);
      subject.targetMark = v;
      saveState();
      showToast("Target updated.");
    });
  }

  function renderTopicRow(subject, t) {
    const row = document.createElement("div");
    row.className = "topic-row";
    const statusIcon = t.completion === "completed" ? "✓" : t.completion === "in-progress" ? "◐" : "○";
    row.innerHTML = `
      <button class="topic-status-btn" data-status="${t.completion}" title="Cycle status">${statusIcon}</button>
      <span class="topic-name">${escapeHTML(t.name)}</span>
      <select class="topic-select" data-field="revision">
        ${REVISION_STAGES.map((r) => `<option value="${r}" ${t.revision === r ? "selected" : ""}>${REVISION_LABELS[r]}</option>`).join("")}
      </select>
      <select class="topic-select" data-field="weakness">
        ${Object.keys(WEAKNESS_LABELS).map((w) => `<option value="${w}" ${t.weakness === w ? "selected" : ""}>${WEAKNESS_LABELS[w]}</option>`).join("")}
      </select>
      <div class="task-actions">
        <button class="icon-btn" data-act="edit" title="Rename">✎</button>
        <button class="icon-btn" data-act="delete" title="Delete">✕</button>
      </div>
    `;
    row.querySelector('[data-status]').addEventListener("click", (e) => {
      const order = ["not-started", "in-progress", "completed"];
      const idx = order.indexOf(t.completion);
      t.completion = order[(idx + 1) % order.length];
      saveState();
      renderRoute();
    });
    row.querySelector('[data-field="revision"]').addEventListener("change", (e) => {
      t.revision = e.target.value; saveState();
    });
    row.querySelector('[data-field="weakness"]').addEventListener("change", (e) => {
      t.weakness = e.target.value; saveState(); renderRoute();
    });
    row.querySelector('[data-act="edit"]').addEventListener("click", () => openTopicModal(subject, t));
    row.querySelector('[data-act="delete"]').addEventListener("click", () => {
      confirmDialog("Delete topic?", `Remove "${t.name}" from ${subject.name}.`, "Delete", () => {
        subject.topics = subject.topics.filter((x) => x.id !== t.id);
        saveState();
        renderRoute();
      }, true);
    });
    return row;
  }

  function openTopicModal(subject, existing) {
    const isEdit = !!existing;
    openModal(
      `<h3 class="modal-title">${isEdit ? "Rename topic" : "Add topic"}</h3>
       <p class="modal-subtitle">${escapeHTML(subject.name)}</p>
       <div class="field">
         <label for="tp-name">Chapter / topic / unit name</label>
         <input type="text" id="tp-name" value="${existing ? escapeHTML(existing.name) : ""}" placeholder="Type your own syllabus item">
       </div>
       <div class="modal-actions">
         <button class="btn btn-secondary" data-act="cancel">Cancel</button>
         <button class="btn btn-primary" data-act="save">${isEdit ? "Save" : "Add topic"}</button>
       </div>`,
      (box) => {
        box.querySelector("#tp-name").focus();
        box.querySelector('[data-act="cancel"]').addEventListener("click", closeModal);
        box.querySelector('[data-act="save"]').addEventListener("click", () => {
          const name = box.querySelector("#tp-name").value.trim();
          if (!name) { showToast("Give the topic a name."); return; }
          if (isEdit) {
            existing.name = name;
          } else {
            subject.topics.push({ id: uid(), name, completion: "not-started", revision: "not-studied", weakness: "none" });
          }
          saveState();
          closeModal();
          renderRoute();
        });
      }
    );
  }

  /* ======================================================================
     10. ANALYTICS PAGE
     ====================================================================== */
  function renderAnalytics() {
    const el = document.createElement("div");
    el.innerHTML = `
      <div class="page-header">
        <p class="page-eyebrow">Progress overview</p>
        <h1 class="page-title">Analytics</h1>
      </div>

      <div class="analytics-block">
        <h3 style="font-size:13px;color:var(--text-faint);text-transform:uppercase;letter-spacing:.05em;margin-bottom:14px;">Study time — last 7 days</h3>
        <div class="bars-row" id="week-study-bars"></div>
      </div>

      <div class="analytics-block">
        <h3 style="font-size:13px;color:var(--text-faint);text-transform:uppercase;letter-spacing:.05em;margin-bottom:14px;">Subject distribution</h3>
        <div class="hbar-list" id="subject-distribution"></div>
      </div>

      <div class="analytics-block">
        <h3 style="font-size:13px;color:var(--text-faint);text-transform:uppercase;letter-spacing:.05em;margin-bottom:14px;">Preparation by subject</h3>
        <div class="hbar-list" id="prep-distribution"></div>
      </div>

      <div class="analytics-block">
        <h3 style="font-size:13px;color:var(--text-faint);text-transform:uppercase;letter-spacing:.05em;margin-bottom:14px;">Tasks completed — last 7 days</h3>
        <div class="bars-row" id="week-tasks-bars"></div>
      </div>
    `;
    viewRoot.appendChild(el);

    // Last 7 days, oldest to newest
    const days = [];
    for (let i = 6; i >= 0; i--) days.push(addDaysISO(todayISO(), -i));

    const studyBars = el.querySelector("#week-study-bars");
    const dayMinutes = days.map((d) => sessionsOn(d).reduce((s, x) => s + x.duration, 0));
    const maxMinutes = Math.max(1, ...dayMinutes);
    days.forEach((d, i) => {
      const h = Math.max(3, Math.round((dayMinutes[i] / maxMinutes) * 100));
      const col = document.createElement("div");
      col.className = "bar-col";
      col.innerHTML = `<div class="bar ${dayMinutes[i] > 0 ? "filled" : ""}" style="height:${h}%">${dayMinutes[i] > 0 ? `<span class="bar-value">${formatMinutes(dayMinutes[i])}</span>` : ""}</div><span class="bar-label">${isoToDisplay(d, { weekday: "narrow" })}</span>`;
      studyBars.appendChild(col);
    });

    const dist = el.querySelector("#subject-distribution");
    const totalAll = Math.max(1, totalStudyMinutes());
    STATE.subjects.forEach((s) => {
      const mins = totalStudyMinutes(s.id);
      const pct = Math.round((mins / totalAll) * 100);
      const row = document.createElement("div");
      row.className = "hbar-row";
      row.innerHTML = `<span class="hbar-name">${escapeHTML(s.name)}</span>
        <div class="hbar-track"><div class="hbar-fill" style="width:${pct}%"></div></div>
        <span class="hbar-value mono">${formatMinutes(mins)}</span>`;
      dist.appendChild(row);
    });

    const prepDist = el.querySelector("#prep-distribution");
    STATE.subjects.forEach((s) => {
      const pct = subjectPrep(s);
      const row = document.createElement("div");
      row.className = "hbar-row";
      row.innerHTML = `<span class="hbar-name">${escapeHTML(s.name)}</span>
        <div class="hbar-track"><div class="hbar-fill" style="width:${pct}%"></div></div>
        <span class="hbar-value mono">${pct}%</span>`;
      prepDist.appendChild(row);
    });

    const taskBars = el.querySelector("#week-tasks-bars");
    const dayTasks = days.map((d) => plannerFor(d).filter((t) => t.status === "completed").length);
    const maxTasks = Math.max(1, ...dayTasks);
    days.forEach((d, i) => {
      const h = Math.max(3, Math.round((dayTasks[i] / maxTasks) * 100));
      const col = document.createElement("div");
      col.className = "bar-col";
      col.innerHTML = `<div class="bar ${dayTasks[i] > 0 ? "filled" : ""}" style="height:${h}%">${dayTasks[i] > 0 ? `<span class="bar-value">${dayTasks[i]}</span>` : ""}</div><span class="bar-label">${isoToDisplay(d, { weekday: "narrow" })}</span>`;
      taskBars.appendChild(col);
    });
  }

  /* ======================================================================
     11. SETTINGS PAGE
     ====================================================================== */
  const ACCENT_SWATCHES = ["#e3b341", "#7fb2e5", "#8fbf8a", "#c98fd1", "#e5876b", "#eeeeee"];

  function renderSettings() {
    const el = document.createElement("div");
    el.innerHTML = `
      <div class="page-header">
        <p class="page-eyebrow">Configuration</p>
        <h1 class="page-title">Settings</h1>
      </div>

      <div class="settings-section">
        <h3>Exam</h3>
        <div class="setting-row">
          <div>
            <div class="setting-row-label">Exam date</div>
            <div class="setting-row-hint">Drives the countdown on your homepage.</div>
          </div>
          <div class="setting-row-control"><input type="date" id="set-exam-date" value="${STATE.examDate || ""}"></div>
        </div>
      </div>

      <div class="settings-section">
        <h3>Study</h3>
        <div class="setting-row">
          <div>
            <div class="setting-row-label">Daily study goal</div>
            <div class="setting-row-hint">Used as a reference target — not enforced.</div>
          </div>
          <div class="setting-row-control"><input type="number" id="set-daily-goal" min="10" max="960" value="${STATE.dailyGoalMinutes}"> min</div>
        </div>
        <div class="setting-row">
          <div>
            <div class="setting-row-label">Default timer duration</div>
            <div class="setting-row-hint">Used when a topic has no set duration.</div>
          </div>
          <div class="setting-row-control"><input type="number" id="set-default-timer" min="5" max="240" value="${STATE.defaultTimerMinutes}"> min</div>
        </div>
      </div>

      <div class="settings-section">
        <h3>Subject priorities &amp; targets</h3>
        <div id="priority-settings"></div>
      </div>

      <div class="settings-section">
        <h3>Appearance</h3>
        <div class="setting-row">
          <div>
            <div class="setting-row-label">Accent color</div>
            <div class="setting-row-hint">One accent, used everywhere.</div>
          </div>
          <div class="color-swatches" id="accent-swatches"></div>
        </div>
      </div>

      <div class="settings-section">
        <h3>Comeback</h3>
        <div class="comeback-panel">
          <p class="comeback-msg" id="comeback-msg"></p>
        </div>
      </div>

      <div class="settings-section">
        <h3>Data</h3>
        <div class="setting-row">
          <div>
            <div class="setting-row-label">Reset progress</div>
            <div class="setting-row-hint">Clears everything stored on this device.</div>
          </div>
          <button class="btn btn-danger btn-sm" id="reset-btn">Reset</button>
        </div>
      </div>
    `;
    viewRoot.appendChild(el);

    el.querySelector("#comeback-msg").textContent = MOTIVATION_LINES[STATE.motivationIndex % MOTIVATION_LINES.length];

    el.querySelector("#set-exam-date").addEventListener("change", (e) => {
      STATE.examDate = e.target.value || null; saveState(); showToast("Exam date updated.");
    });
    el.querySelector("#set-daily-goal").addEventListener("change", (e) => {
      STATE.dailyGoalMinutes = clamp(parseInt(e.target.value, 10) || 180, 10, 960); saveState();
    });
    el.querySelector("#set-default-timer").addEventListener("change", (e) => {
      STATE.defaultTimerMinutes = clamp(parseInt(e.target.value, 10) || 50, 5, 240); saveState();
    });

    const prioBox = el.querySelector("#priority-settings");
    STATE.subjects.forEach((s) => {
      const row = document.createElement("div");
      row.className = "setting-row";
      row.innerHTML = `
        <div>
          <div class="setting-row-label">${escapeHTML(s.name)}</div>
        </div>
        <div style="display:flex;gap:10px;align-items:center;">
          <select data-field="priority" style="background:var(--bg-surface);border:1px solid var(--border);border-radius:6px;padding:7px 9px;">
            <option value="high" ${s.priority === "high" ? "selected" : ""}>High</option>
            <option value="medium" ${s.priority === "medium" ? "selected" : ""}>Medium</option>
            <option value="normal" ${s.priority === "normal" ? "selected" : ""}>Normal</option>
          </select>
          <input type="number" data-field="target" min="0" max="100" placeholder="Target" value="${s.targetMark == null ? "" : s.targetMark}" style="width:80px;background:var(--bg-surface);border:1px solid var(--border);border-radius:6px;padding:7px 9px;">
        </div>
      `;
      row.querySelector('[data-field="priority"]').addEventListener("change", (e) => { s.priority = e.target.value; saveState(); });
      row.querySelector('[data-field="target"]').addEventListener("change", (e) => {
        s.targetMark = e.target.value === "" ? null : clamp(parseInt(e.target.value, 10), 0, 100); saveState();
      });
      prioBox.appendChild(row);
    });

    const swatchBox = el.querySelector("#accent-swatches");
    ACCENT_SWATCHES.forEach((c) => {
      const sw = document.createElement("button");
      sw.className = "color-swatch" + (STATE.accentColor === c ? " active" : "");
      sw.style.background = c;
      sw.addEventListener("click", () => {
        STATE.accentColor = c;
        applyAccentColor();
        saveState();
        renderRoute();
      });
      swatchBox.appendChild(sw);
    });

    el.querySelector("#reset-btn").addEventListener("click", () => {
      confirmDialog(
        "Reset all progress?",
        "This will permanently clear your saved study data.",
        "Reset",
        () => {
          localStorage.removeItem(STORAGE_KEY);
          STATE = defaultState();
          applyAccentColor();
          saveState();
          navigate("home");
          renderRoute();
          showToast("Progress reset.");
        },
        true
      );
    });
  }

  function applyAccentColor() {
    document.documentElement.style.setProperty("--accent", STATE.accentColor);
  }

  /* ======================================================================
     12. FOCUS TIMER ENGINE
     A real countdown driven by timestamps (not just a decrementing
     counter), so it stays accurate even if the tab is backgrounded.
     ====================================================================== */
  const timerOverlay = document.getElementById("timer-overlay");
  const idleState = document.getElementById("timer-idle-state");
  const runState = document.getElementById("timer-run-state");
  const completeState = document.getElementById("timer-complete-state");

  const timer = {
    subjectId: null,
    subjectName: "",
    topic: "",
    taskId: null,
    durationMinutes: 50,
    totalSeconds: 0,
    remainingSeconds: 0,
    endAt: null, // timestamp when timer should hit zero
    intervalId: null,
    paused: false,
    pausedRemaining: 0,
  };

  function openTimerSetup(cfg) {
    timer.subjectId = cfg.subjectId;
    timer.subjectName = cfg.subjectName;
    timer.topic = cfg.topic;
    timer.taskId = cfg.taskId || null;
    timer.durationMinutes = cfg.duration || STATE.defaultTimerMinutes;

    document.getElementById("timer-setup-subject").textContent = (cfg.subjectName || "").toUpperCase();
    document.getElementById("timer-setup-topic").textContent = cfg.topic;

    document.querySelectorAll(".duration-chip").forEach((chip) => {
      chip.classList.toggle("active", parseInt(chip.dataset.duration, 10) === timer.durationMinutes);
    });
    document.getElementById("custom-duration-input").value = "";

    idleState.hidden = false;
    runState.hidden = true;
    completeState.hidden = true;
    timerOverlay.hidden = false;
  }

  document.querySelectorAll(".duration-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      timer.durationMinutes = parseInt(chip.dataset.duration, 10);
      document.querySelectorAll(".duration-chip").forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
      document.getElementById("custom-duration-input").value = "";
    });
  });
  document.getElementById("custom-duration-input").addEventListener("input", (e) => {
    const v = parseInt(e.target.value, 10);
    if (v > 0) {
      timer.durationMinutes = clamp(v, 1, 240);
      document.querySelectorAll(".duration-chip").forEach((c) => c.classList.remove("active"));
    }
  });

  document.getElementById("timer-cancel-setup-btn").addEventListener("click", () => {
    timerOverlay.hidden = true;
  });

  document.getElementById("timer-begin-btn").addEventListener("click", startTimer);

  function startTimer() {
    timer.totalSeconds = timer.durationMinutes * 60;
    timer.remainingSeconds = timer.totalSeconds;
    timer.endAt = Date.now() + timer.totalSeconds * 1000;
    timer.paused = false;

    document.getElementById("timer-run-subject").textContent = (timer.subjectName || "").toUpperCase();
    document.getElementById("timer-run-topic").textContent = timer.topic;
    document.getElementById("timer-run-eyebrow").textContent = "In focus";
    document.getElementById("timer-pause-btn").textContent = "Pause";
    document.getElementById("timer-ring-fill").style.width = "100%";

    idleState.hidden = true;
    completeState.hidden = true;
    runState.hidden = false;

    // Mark linked planner task as in-progress once work actually starts.
    if (timer.taskId) {
      const task = STATE.planner.find((t) => t.id === timer.taskId);
      if (task && task.status === "not-started") { task.status = "in-progress"; saveState(); }
    }

    tickTimer();
    timer.intervalId = setInterval(tickTimer, 250);
  }

  function tickTimer() {
    if (timer.paused) return;
    const msLeft = timer.endAt - Date.now();
    timer.remainingSeconds = Math.max(0, Math.round(msLeft / 1000));
    document.getElementById("timer-display").textContent = formatClock(timer.remainingSeconds);
    const pct = clamp((timer.remainingSeconds / timer.totalSeconds) * 100, 0, 100);
    document.getElementById("timer-ring-fill").style.width = pct + "%";

    if (timer.remainingSeconds <= 0) {
      clearInterval(timer.intervalId);
      finishTimer(true);
    }
  }

  document.getElementById("timer-pause-btn").addEventListener("click", () => {
    if (!timer.paused) {
      timer.paused = true;
      timer.pausedRemaining = timer.remainingSeconds;
      document.getElementById("timer-pause-btn").textContent = "Resume";
      document.getElementById("timer-run-eyebrow").textContent = "Paused";
    } else {
      timer.paused = false;
      timer.endAt = Date.now() + timer.pausedRemaining * 1000;
      document.getElementById("timer-pause-btn").textContent = "Pause";
      document.getElementById("timer-run-eyebrow").textContent = "In focus";
    }
  });

  document.getElementById("timer-end-btn").addEventListener("click", () => {
    confirmDialog("End session early?", "The time you've focused so far will still be logged.", "End Session", () => {
      clearInterval(timer.intervalId);
      finishTimer(false);
    });
  });

  function finishTimer(completedNaturally) {
    const elapsedSeconds = timer.totalSeconds - timer.remainingSeconds;
    const elapsedMinutes = Math.max(1, Math.round(elapsedSeconds / 60));
    const now = new Date();

    recordSessionEffects({
      id: uid(),
      subjectId: timer.subjectId,
      topic: timer.topic,
      duration: elapsedMinutes,
      date: todayISO(),
      time: now.toTimeString().slice(0, 5),
    });

    if (completedNaturally && timer.taskId) {
      const task = STATE.planner.find((t) => t.id === timer.taskId);
      if (task) task.status = "completed";
    }
    if (STATE.manualFocus && STATE.manualFocus.subjectId === timer.subjectId && STATE.manualFocus.topic === timer.topic) {
      STATE.manualFocus = null;
    }
    STATE.motivationIndex += 1;
    saveState();

    if (completedNaturally) {
      document.getElementById("complete-headline").textContent = `${elapsedMinutes} minutes added`;
      document.getElementById("complete-subline").textContent = `to ${timer.subjectName}`;
      runState.hidden = true;
      completeState.hidden = false;
    } else {
      timerOverlay.hidden = true;
      showToast(`${elapsedMinutes} minutes logged to ${timer.subjectName}.`);
      renderRoute();
    }
  }

  document.getElementById("timer-done-btn").addEventListener("click", () => {
    timerOverlay.hidden = true;
    renderRoute();
  });

  /* ======================================================================
     13. INIT
     ====================================================================== */
  function init() {
    applyAccentColor();
    if (!location.hash) location.hash = "home";
    renderRoute();
  }

  init();
})();
