/* Projects & tasks (#/club/projects?c=…) and one project (#/club/project?id=…&tab=…), from the "Project Dashboard"
   board: progress, a task board (To do · In progress · Completed) with drag and drop on desktop and a column picker on
   phones, deadlines, the team, files and discussion. projects.manage runs projects; the project team can manage its
   tasks (public.on_project_team); someone assigned a task may only move it. */
import { COLUMNS, PRIORITY, column, move, stats, checklist } from "../kanban.js";

const PSTATUS = { planning: ["Planning", "blue"], in_progress: ["In progress", "green"], completed: ["Completed", "green"], on_hold: ["On hold", "red"] };

/** @param {Record<string, any>} pages @param {any} kit */
export function register(pages, kit) {
  const { ui, icon, esc, api, store, ctx, charts } = kit;
  let filter = "all", q = "";

  /* ═════════ Project list ═════════ */
  pages["club/projects"] = () => {
    const c = kit.param("c") || kit.myClubs()[0]?.club_id || "";
    const g = kit.memberGate(c, "projects"); if (g) return g;
    if (!kit.feature(c, "projects")) return ui.emptyBox("kanban", "Projects are switched off", "The club admin can turn them on in Manage → Features.");
    const pe = store.use(`club:projects:${c}`, () => api.projects(c), { ttl: 45e3 });
    const ce = store.use(`club:ptc:${c}`, () => api.projectTaskCounts(c), { ttl: 45e3 }), counts = ce.value || {};
    const can = kit.can(c, "projects.manage");
    return `${kit.back(`#/club/space?c=${c}`, kit.membership(c)?.short_name || "Club")}
      ${ui.ph("Projects & Tasks", "Plan, collaborate, and turn ideas into impact", can ? `<button class="btn primary" id="pj-new">${icon("plus")} New Project</button>` : "")}
      <div class="searchbar cl-search">${icon("search")}<input class="input" id="pj-q" type="search" placeholder="Search projects…" value="${esc(q)}" autocomplete="off"></div>
      ${ui.view(pe, (rows) => {
        const n = (s) => rows.filter((p) => p.status === s).length;
        const list = rows.filter((p) => (filter === "all" || p.status === filter) && (!q || `${p.title} ${p.description}`.toLowerCase().includes(q.toLowerCase())));
        return `<div class="cl-stats mt-s">${ui.stat("folder", "purple", rows.length, "Total projects")}${ui.stat("clock", "green", n("in_progress") + n("planning"), "In progress")}${ui.stat("checkc", "green", n("completed"), "Completed")}${ui.stat("pause", "red", n("on_hold"), "On hold")}</div>
          <nav class="cl-seg">${[["all", "All Projects"], ["in_progress", "In Progress"], ["completed", "Completed"], ["on_hold", "On Hold"]].map(([v, l]) => `<button data-f="${v}" aria-pressed="${filter === v}">${l}</button>`).join("")}</nav>
          <div class="stack">${list.length ? list.map((p) => { const k = counts[p.id] || { total: 0, done: 0 }, pct = k.total ? Math.round((k.done / k.total) * 100) : p.status === "completed" ? 100 : 0;
            return `<a class="cl-ccard" href="#/club/project?id=${p.id}"><span class="art" style="background:linear-gradient(135deg, ${esc(p.color)}, #160d4a)">${ui.art(p.cover_url, p.title)}</span>
              <span class="min0"><span class="row between nowrap"><b class="ellipsis">${esc(p.title)}</b>${ui.st(PSTATUS[p.status])}</span>
                <span class="row nowrap mt-s" style="gap:8px"><span class="cl-prog grow ${pct === 100 ? "green" : ""}"><i style="width:${pct}%"></i></span><b class="xs">${pct}%</b></span>
                <span class="meta"><span>${icon("calendar")} ${p.status === "completed" ? "Completed" : p.due ? `Due ${ui.dateShort(p.due)}` : "No due date"}</span><span>${icon("users")} ${ui.plural(p.team.length, "member")}</span></span></span></a>`; }).join("")
            : ui.emptyBox("kanban", "No projects yet", can ? "Start one with New Project." : "Your club's projects will appear here.")}</div>`;
      }, { n: 4, h: 110 })}`;
  };
  pages["club/projects"].mount = (el) => {
    kit.bindRetry(el);
    const c = kit.param("c") || kit.myClubs()[0]?.club_id;
    const input = kit.$("#pj-q", el);
    input?.addEventListener("input", () => { q = input.value; const pos = input.selectionStart; ctx.rerender(); const i = kit.$("#pj-q"); if (i) { i.focus(); i.setSelectionRange(pos, pos); } });
    kit.$$("[data-f]", el).forEach((b) => b.addEventListener("click", () => { filter = b.dataset.f; ctx.rerender(); }));
    kit.$("#pj-new", el)?.addEventListener("click", () => editProject({ club_id: c, team: [kit.me().id] }));
    if (kit.param("new") && kit.can(c, "projects.manage")) { history.replaceState(null, "", `#/club/projects?c=${c}`); editProject({ club_id: c, team: [kit.me().id] }); }
  };

  function editProject(p) {
    const people = store.use(`club:members:${p.club_id}`, () => api.members(p.club_id), { ttl: 60e3 }).value || [];
    ui.sheet(p.id ? "Edit project" : "New project", `<form id="pj-form" class="stack">
      ${ui.field("Project name", ui.input("title", p.title || "", 'required maxlength="120" placeholder="Tech Talk 2026"'))}
      ${ui.field("What is it?", ui.area("description", p.description || "", 'maxlength="4000" rows="3"'))}
      <div class="row" style="gap:8px">${ui.field("Status", ui.select("status", Object.fromEntries(Object.entries(PSTATUS).map(([k, v]) => [k, v[0]])), p.status || "in_progress"))}${ui.field("Due", `<input class="input" type="date" name="due" value="${p.due || ""}">`)}</div>
      ${ui.field("Colour", `<input class="input" type="color" name="color" value="${esc(p.color || "#4F2BFF")}" style="height:44px">`)}
      <p class="cl-side-h">Team (they can manage this project's tasks)</p>
      <div class="cl-options" style="max-height:30vh;overflow:auto">${people.filter((x) => x.status === "active").map((x) => `<label class="cl-opt"><input type="checkbox" data-multi name="team" value="${x.user_id}" ${p.team?.includes(x.user_id) ? "checked" : ""}> ${esc(x.display_name)} <span class="xs push">${esc(x.title || x.role_name)}</span></label>`).join("") || `<p class="small muted">Loading members…</p>`}</div>
      <div id="cl-err"></div><button class="btn primary block">${icon("check")} ${p.id ? "Save" : "Create project"}</button>${p.id ? `<button type="button" class="btn ghost block" id="pj-del" style="color:var(--error)">Delete project</button>` : ""}</form>`, (s) => {
      kit.$("#pj-form", s).addEventListener("submit", async (e) => {
        e.preventDefault(); const f = new FormData(e.target), btn = e.target.querySelector("button.primary"); ctx.busy(btn, true, "Saving…");
        try {
          const row = await api.saveProject({ ...(p.id ? { id: p.id } : { club_id: p.club_id }), title: String(f.get("title")).trim(), description: String(f.get("description") || ""), status: f.get("status"), due: f.get("due") || null, color: f.get("color"), team: f.getAll("team") });
          ctx.closeModal(); store.invalidate(`club:projects:${p.club_id}`, `club:project:${row.id}`); if (!p.id) kit.go(`#/club/project?id=${row.id}`);
        } catch (err) { ctx.busy(btn, false); ui.fail(s, err.message); }
      });
      kit.$("#pj-del", s)?.addEventListener("click", () => { ctx.closeModal(); ui.confirm("Delete this project?", "Its tasks and files are deleted too.", "Delete", async () => { await api.deleteProject(p.id); store.invalidate(`club:projects:${p.club_id}`); kit.go(`#/club/projects?c=${p.club_id}`); }, true); });
    });
  }

  /* ═════════ One project ═════════ */
  pages["club/project"] = () => {
    const g = kit.gate("this project"); if (g) return g;
    const id = kit.param("id"), t = kit.param("tab") || "tasks";
    const pe = store.use(`club:project:${id}`, () => api.project(id), { ttl: 60e3 });
    return ui.view(pe, (p) => {
      if (!p) return ui.emptyBox("lock", "Project not found", "");
      const te = store.use(`club:ptasks:${id}`, () => api.projectTasks(id), { ttl: 30e3 }), tasks = te.value || [], s = stats(tasks);
      const people = store.use(`club:members:${p.club_id}`, () => api.members(p.club_id), { ttl: 60e3 }).value || [];
      const team = people.filter((x) => p.team.includes(x.user_id));
      const manage = kit.can(p.club_id, "projects.manage"), onTeam = p.team.includes(kit.me()?.id), edit = manage || onTeam || kit.can(p.club_id, "tasks.manage");
      return `${kit.back(`#/club/projects?c=${p.club_id}`, "Projects")}
        <section class="cl-cover-lg" style="background:linear-gradient(135deg, ${esc(p.color)}, #160d4a)">${p.cover_url ? `<img src="${esc(p.cover_url)}" alt="">` : ""}${manage ? `<div class="tools"><button class="btn sm white" id="pj-edit">${icon("edit", "sm")} Edit Project</button></div>` : ""}
          <h1>${esc(p.title)}</h1><p>${ui.st(PSTATUS[p.status])} Organized by ${esc(p.clubs?.name || "")}${p.due ? ` · Due ${ui.dateLong(p.due)}` : ""}</p></section>
        ${ui.seg([["overview", "Overview"], ["tasks", "Tasks"], ["team", "Team"], ["files", "Files"]], t, (v) => `#/club/project?id=${id}&tab=${v}`, "mt")}
        ${t === "overview" ? `<section class="card"><h2>About</h2><p style="color:var(--text-2)">${p.description ? ui.rich(p.description) : "<i>No description yet.</i>"}</p></section>${progressRow(tasks, s, team)}`
          : t === "team" ? `<div class="cl-list">${team.map((x) => `<a class="cl-li" href="#/club/member?c=${p.club_id}&u=${x.user_id}">${ui.ava(x.display_name, x.photo_url)}<span class="body"><b>${esc(x.display_name)}</b><span>${esc(x.title || x.role_name)}</span></span><span class="end">${tasks.filter((k) => k.assignee === x.user_id && k.status !== "done").length} open tasks</span></a>`).join("") || `<p class="small muted" style="padding:12px">No team yet.</p>`}</div>`
          : t === "files" ? files(p, edit)
          : `<div class="cl-stats">${ui.stat("list", "purple", s.total, "Total tasks")}${ui.stat("checkc", "green", s.done, "Completed")}${ui.stat("clock", "blue", s.doing, "In progress")}${ui.stat("minus", "amber", s.todo, "Not started")}</div>
            <div class="row between"><h2 style="font-size:18px">Task Board</h2></div>
            <div class="cl-board mt-s" id="pj-board">${COLUMNS.map(([st, label, tone]) => `<div class="cl-col t-${tone}" data-col="${st}"><h3><span>${label} (${column(tasks, st).length})</span>${edit ? `<button class="btn sm ghost" data-add="${st}" aria-label="Add task to ${label}">${icon("plus", "sm")}</button>` : ""}</h3>
              ${column(tasks, st).map((k) => card(k, people, edit)).join("")}${edit ? `<button class="btn sm ghost block" data-add="${st}">${icon("plus", "sm")} Add Task</button>` : ""}</div>`).join("")}</div>
            ${progressRow(tasks, s, team)}`}`;
    }, { n: 3, h: 140 });
  };
  function card(k, people, edit) {
    const who = people.find((x) => x.user_id === k.assignee), late = k.due && k.status !== "done" && new Date(`${k.due}T23:59:00+06:00`) < Date.now();
    const mine = k.assignee === kit.me()?.id;
    return `<article class="cl-kcard" draggable="${edit || mine}" data-task="${k.id}"><b>${esc(k.title)}</b>
      <div class="foot"><span>${k.due ? `<span class="st ${late ? "red" : "gray"}">${icon("clock")} ${ui.dateShort(k.due)}</span>` : checklist(k) ? `${icon("checksq", "sm")} ${checklist(k)}` : ""}</span>${ui.st(PRIORITY[k.priority])}${who ? ui.ava(who.display_name, who.photo_url, "sm") : ""}</div>
      ${edit || mine ? `<label class="sr-only" for="mv-${k.id}">Move</label><select class="select" id="mv-${k.id}" data-move="${k.id}">${COLUMNS.map(([v, l]) => `<option value="${v}" ${v === k.status ? "selected" : ""}>${l}</option>`).join("")}</select>` : ""}</article>`;
  }
  function progressRow(tasks, s, team) {
    const upcoming = tasks.filter((k) => k.status !== "done" && k.due).sort((a, b) => a.due.localeCompare(b.due)).slice(0, 4);
    return `<div class="cl-row2 mt"><section class="card cl-chart"><h3>Project Progress</h3><div class="row nowrap" style="gap:16px;align-items:center">${charts.ring({ value: s.total ? s.done / s.total : 0, label: `${s.pct}%`, sub: `${s.done} of ${s.total} tasks`, tone: "good" })}
        <div class="viz-legend col">${[["Completed", s.done, 3], ["In progress", s.doing, 1], ["Not started", s.todo, 4]].map(([l, n, slot]) => `<span><i style="background:var(--viz-${slot})"></i>${l} <b>${n} (${s.total ? Math.round((n / s.total) * 100) : 0}%)</b></span>`).join("")}</div></div></section>
      <section class="card"><h3 style="font-size:16px;margin-bottom:8px">Upcoming Deadlines</h3>${upcoming.length ? upcoming.map((k) => `<div class="row between" style="padding:6px 0"><span class="row nowrap" style="gap:6px">${icon("flag", "sm")} ${esc(k.title)}</span><span class="xs">${ui.dateShort(k.due)}</span></div>`).join("") : `<p class="small muted">No deadlines.</p>`}</section></div>
      <section class="card mt row between"><b>Team Members (${team.length})</b>${ui.avaStack(team, 7)}</section>`;
  }
  function files(p, edit) {
    const de = store.use(`club:pdocs:${p.id}`, () => api.projectDocs(p.id), { ttl: 60e3 });
    return `${edit ? `<button class="btn outline" id="pj-up">${icon("upload")} Upload file</button>` : ""}${ui.view(de, (rows) => (rows.length ? `<div class="cl-list mt">${rows.map((d) => `<button class="cl-li" data-doc="${d.id}">${ui.ftype(d.title, d.mime)}<span class="body"><b>${esc(d.title)}</b><span>${ui.size(d.size)} · ${ui.dateShort(d.created_at)}</span></span>${icon("download", "sm")}</button>`).join("")}</div>` : `<p class="small muted mt">No files yet.</p>`))}`;
  }
  pages["club/project"].mount = (el) => {
    kit.bindRetry(el);
    const id = kit.param("id"), p = store.peek(`club:project:${id}`); if (!p) return;
    const tasks = store.peek(`club:ptasks:${id}`) || [];
    const reload = () => store.invalidate(`club:ptasks:${id}`, `club:ptc:${p.club_id}`, "me:tasks");
    kit.$("#pj-edit", el)?.addEventListener("click", () => editProject(p));
    const apply = async (taskId, status, before = null) => { const ups = move(tasks, taskId, status, before); if (!ups.length) return; try { await api.moveTasks(ups); reload(); } catch (e) { kit.toast(e.message, "error"); reload(); } };
    kit.$$("[data-move]", el).forEach((s) => s.addEventListener("change", () => apply(s.dataset.move, s.value)));
    // Desktop drag and drop between columns.
    let dragging = null;
    kit.$$("[data-task]", el).forEach((c) => {
      c.addEventListener("dragstart", (e) => { dragging = c.dataset.task; c.classList.add("dragging"); e.dataTransfer.effectAllowed = "move"; });
      c.addEventListener("dragend", () => { c.classList.remove("dragging"); kit.$$(".cl-col", el).forEach((x) => x.classList.remove("drop")); });
      c.addEventListener("dblclick", () => editTask(p, tasks.find((k) => k.id === c.dataset.task)));
    });
    kit.$$("[data-col]", el).forEach((col) => {
      col.addEventListener("dragover", (e) => { if (!dragging) return; e.preventDefault(); col.classList.add("drop"); });
      col.addEventListener("dragleave", () => col.classList.remove("drop"));
      col.addEventListener("drop", (e) => { e.preventDefault(); const over = e.target.closest("[data-task]"); apply(dragging, col.dataset.col, over && over.dataset.task !== dragging ? over.dataset.task : null); dragging = null; });
    });
    kit.$$("[data-add]", el).forEach((b) => b.addEventListener("click", () => editTask(p, { status: b.dataset.add })));
    kit.$$("[data-task] b", el).forEach((b) => b.addEventListener("click", () => editTask(p, tasks.find((k) => k.id === b.closest("[data-task]").dataset.task))));
    kit.$("#pj-up", el)?.addEventListener("click", async () => {
      const f = await ui.pickFile("application/pdf,.docx,.xlsx,.pptx,image/*,.zip"); if (!f) return;
      if (f.size > 10e6) return kit.toast("Files can be up to 10 MB", "error");
      try { const path = await api.uploadDoc(p.club_id, f); await api.addDoc({ club_id: p.club_id, project_id: p.id, title: f.name.slice(0, 140), path, mime: f.type, size: f.size }); store.invalidate(`club:pdocs:${id}`); } catch (e) { kit.toast(e.message, "error"); }
    });
    kit.$$("[data-doc]", el).forEach((b) => b.addEventListener("click", async () => { const d = (store.peek(`club:pdocs:${id}`) || []).find((x) => x.id === b.dataset.doc); try { window.open(await api.signedUrl(d.path), "_blank", "noopener"); } catch (e) { kit.toast(e.message, "error"); } }));
  };

  /** Add or edit a task on the board (title, who, due, priority, checklist). */
  function editTask(p, k) {
    const people = (store.peek(`club:members:${p.club_id}`) || []).filter((x) => p.team.includes(x.user_id) || x.user_id === k.assignee);
    const list = (k.checklist || []).map((c) => `${c.done ? "[x] " : ""}${c.t}`).join("\n");
    ui.sheet(k.id ? "Task" : "New task", `<form id="tk" class="stack">${ui.field("Task", ui.input("title", k.title || "", 'required maxlength="160"'))}
      <div class="row" style="gap:8px">${ui.field("Who", ui.select("assignee", [["", "Unassigned"], ...people.map((x) => [x.user_id, x.display_name])], k.assignee || ""))}${ui.field("Priority", ui.select("priority", { high: "High", medium: "Medium", low: "Low" }, k.priority || "medium"))}</div>
      <div class="row" style="gap:8px">${ui.field("Due", `<input class="input" type="date" name="due" value="${k.due || ""}">`)}${ui.field("Column", ui.select("status", Object.fromEntries(COLUMNS.map(([v, l]) => [v, l])), k.status || "todo"))}</div>
      ${ui.field("Checklist (one per line, [x] when done)", ui.area("checklist", list, 'rows="4" placeholder="Book the hall\n[x] Confirm speaker"'))}
      ${ui.field("Notes", ui.area("notes", k.notes || "", 'rows="2" maxlength="2000"'))}
      <div id="cl-err"></div><button class="btn primary block">${icon("check")} Save</button>${k.id ? `<button type="button" class="btn ghost block" id="tk-del" style="color:var(--error)">Delete task</button>` : ""}</form>`, (s) => {
      kit.$("#tk", s).addEventListener("submit", async (e) => {
        e.preventDefault(); const f = ui.values(e.target), btn = e.target.querySelector("button.primary"); ctx.busy(btn, true, "Saving…");
        const checklistRows = String(f.checklist || "").split("\n").map((l) => l.trim()).filter(Boolean).slice(0, 30).map((l) => ({ t: l.replace(/^\[x\]\s*/i, "").slice(0, 120), done: /^\[x\]/i.test(l) }));
        const row = { title: f.title.trim(), assignee: f.assignee || null, priority: f.priority, due: f.due || null, status: f.status, checklist: checklistRows, notes: String(f.notes || "") };
        try { if (k.id) await api.updateTask(k.id, row); else await api.addTask({ ...row, club_id: p.club_id, project_id: p.id, position: 999 }); ctx.closeModal(); store.invalidate(`club:ptasks:${p.id}`, `club:ptc:${p.club_id}`, "me:tasks"); }
        catch (err) { ctx.busy(btn, false); ui.fail(s, err.message); }
      });
      kit.$("#tk-del", s)?.addEventListener("click", async () => { try { await api.deleteTask(k.id); ctx.closeModal(); store.invalidate(`club:ptasks:${p.id}`); } catch (err) { kit.toast(err.message, "error"); } });
    });
  }
}
