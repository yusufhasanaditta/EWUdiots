/* Club Workspace (#/club/workspace?c=…) and one task (#/club/task?id=…), from the "Task Workspace" board: task numbers,
   workspace tabs, search and filters, a To do / In progress / Review / Completed board; the task page has a cover,
   due date, priority, project, description, attachments, assignee, labels, subtasks and comments.
   The database decides who may change a task (tasks.manage or the assignee); the page only hides what you can't do. */
import { COLUMNS, PRIORITY, column } from "../kanban.js";

/** @param {Record<string, any>} pages @param {any} kit */
export function register(pages, kit) {
  const { ui, icon, esc, api, store, ctx } = kit;
  const today = () => new Date().toISOString().slice(0, 10);
  const lateCls = (t) => (t.due && t.status !== "done" && t.due <= today() ? "due-late" : "");
  const dueText = (t) => (!t.due ? "No date" : t.due === today() ? "Today" : ui.dateShort(t.due));
  const filters = { who: "all", project: "all", member: "all" };

  pages["club/workspace"] = () => {
    const c = kit.param("c") || kit.myClubs()[0]?.club_id || "";
    const gate = kit.memberGate(c, "the workspace"); if (gate) return gate;
    const te = store.use(`club:tasks:${c}`, () => api.tasks(c), { ttl: 20e3 });
    const pe = store.use(`club:projects:${c}`, () => api.projects(c), { ttl: 60e3 });
    const me = store.use(`club:members:${c}`, () => api.members(c), { ttl: 120e3 });
    const can = kit.can(c, "tasks.manage"), uid = kit.me()?.id;
    return ui.ph("Club Workspace", "Organize tasks, manage projects, and track progress with your executive team.", can ? `<button class="btn primary" id="ws-new">${icon("plus")} Create Task</button>` : "")
      + ui.view(te, (all) => {
        const projects = pe.value || [], people = me.value || [], pname = Object.fromEntries(projects.map((p) => [p.id, p.title]));
        const late = all.filter((t) => t.status !== "done" && t.due && t.due < today()).length;
        const rows = all.filter((t) => (filters.who === "mine" ? t.assignee === uid : true) && (filters.project === "all" || t.project_id === filters.project) && (filters.member === "all" || t.assignee === filters.member));
        const tabs = [["tasks", "Tasks", "#/club/workspace?c=" + c], ["projects", "Projects", `#/club/projects?c=${c}`], ["meetings", "Meetings", `#/club/meetings?c=${c}`], ["team", "Team", `#/club/members?c=${c}`], ["files", "Files", `#/club/resources?c=${c}`],
          kit.can(c, "audit.view") && ["activity", "Activity", `#/club/manage?c=${c}&tab=audit`]].filter(Boolean);
        const card = (t) => { const who = people.find((p) => p.user_id === t.assignee);
          return `<a class="cl-kcard" href="#/club/task?id=${t.id}" data-q="${esc(`${t.title} ${t.assignee_name || ""} ${(t.labels || []).join(" ")} ${pname[t.project_id] || ""}`.toLowerCase())}"><b>${esc(t.title)}</b>
            ${t.project_id && pname[t.project_id] ? `<span><span class="cl-lbl">${esc(pname[t.project_id])}</span></span>` : (t.labels || [])[0] ? `<span><span class="cl-lbl amber">${esc(t.labels[0])}</span></span>` : ""}
            <span class="meta"><span class="${lateCls(t)}">${icon(t.due === today() ? "clock" : "calendar", "sm")} ${dueText(t)}</span>${t.priority === "high" ? ui.st(PRIORITY.high) : ""}${who || t.assignee_name ? `<span class="cl-stack">${ui.ava(who?.display_name || t.assignee_name, who?.photo_url, "sm")}</span>` : ""}</span></a>`; };
        return `<div class="cards4">${ui.stat("checksq", "purple", all.length, "Total Tasks")}${ui.stat("checkc", "green", all.filter((t) => t.status === "done").length, "Completed")}
            ${ui.stat("clock", "orange", all.filter((t) => t.status === "doing").length, "In Progress")}${ui.stat("alert", "red", late, "Overdue")}</div>
          <nav class="cl-seg sm mt" role="tablist">${tabs.map(([v, l, h]) => `<a role="tab" href="${h}" aria-selected="${v === "tasks"}">${l}</a>`).join("")}</nav>
          <label class="searchbar cl-search mt-s"><span class="sr-only">Search tasks</span>${icon("search")}<input class="input" id="ws-q" type="search" placeholder="Search tasks by title, assignee or label…" autocomplete="off"></label>
          <div class="row nowrap mt-s" style="gap:8px">
            ${ui.select("who", [["all", "All Tasks"], ["mine", "My Tasks"]], filters.who, 'data-f aria-label="Whose tasks"')}
            ${ui.select("project", [["all", "All Projects"], ...projects.map((p) => [p.id, p.title])], filters.project, 'data-f aria-label="Project"')}
            ${ui.select("member", [["all", "All Members"], ...people.map((p) => [p.user_id, p.display_name])], filters.member, 'data-f aria-label="Member"')}</div>
          <div class="cl-kb mt">${COLUMNS.map(([st, label]) => { const list = column(rows, st);
            return `<section class="${st}"><h3>${label} <span class="n">${list.length}</span></h3>${list.map(card).join("") || `<p class="xs muted" style="padding:6px">Nothing here.</p>`}</section>`; }).join("")}</div>`;
      }, { n: 3, h: 90 });
  };
  pages["club/workspace"].mount = (el) => {
    kit.bindRetry(el);
    const c = kit.param("c") || kit.myClubs()[0]?.club_id || "";
    kit.$("#ws-new", el)?.addEventListener("click", () => taskSheet(c));
    kit.$("#ws-q", el)?.addEventListener("input", (e) => { const q = e.target.value.trim().toLowerCase(); kit.$$(".cl-kcard", el).forEach((a) => { a.hidden = !!q && !a.dataset.q.includes(q); }); });
    kit.$$("[data-f]", el).forEach((s) => s.addEventListener("change", () => { filters[s.name] = s.value; ctx.rerender(); }));
  };

  /** New task (title, project, assignee, due, priority, column, labels). */
  function taskSheet(c, done = null) {
    const projects = store.peek(`club:projects:${c}`) || [], people = store.peek(`club:members:${c}`) || [];
    ui.sheet("Create Task", `<form class="stack" id="ts-f">${ui.field("Title", ui.input("title", "", 'required minlength="2" maxlength="160" placeholder="Design event poster"'))}
      ${ui.field("Description", ui.area("notes", "", 'rows="3" maxlength="2000"'))}
      <div class="row" style="gap:8px">${ui.field("Project", ui.select("project_id", [["", "No project"], ...projects.map((p) => [p.id, p.title])], ""))}${ui.field("Assignee", ui.select("assignee", [["", "Anyone"], ...people.map((p) => [p.user_id, p.display_name])], ""))}</div>
      <div class="row" style="gap:8px">${ui.field("Due date", `<input class="input" type="date" name="due">`)}${ui.field("Priority", ui.select("priority", { medium: "Medium", high: "High", low: "Low" }, "medium"))}${ui.field("Column", ui.select("status", Object.fromEntries(COLUMNS.map(([v, l]) => [v, l])), "todo"))}</div>
      ${ui.field("Labels", ui.input("labels", "", 'maxlength="200" placeholder="Design, Marketing"'), "Separate with commas.")}
      <div id="cl-err"></div><button class="btn primary block">Create Task</button></form>`, (m) => kit.$("#ts-f", m).addEventListener("submit", async (e) => {
      e.preventDefault(); const f = ui.values(e.target), btn = e.submitter; ctx.busy(btn, true);
      const who = people.find((p) => p.user_id === f.assignee);
      try {
        const row = await api.addTask({ club_id: c, title: f.title.trim(), notes: f.notes.trim(), project_id: f.project_id || null, assignee: f.assignee || null, assignee_name: who?.display_name || "", due: f.due || null, priority: f.priority, status: f.status,
          labels: f.labels.split(",").map((x) => x.trim()).filter(Boolean).slice(0, 8) });
        ctx.closeModal(); store.invalidate(`club:tasks:${c}`, "me:tasks"); kit.toast("Task created", "success"); done?.(row);
      } catch (err) { ui.fail(m, err.message); } finally { ctx.busy(btn, false); }
    }));
  }

  /* ── One task ── */
  pages["club/task"] = () => {
    const g = kit.gate("this task"); if (g) return g;
    const id = kit.param("id");
    return ui.view(store.use(`task:${id}`, () => api.task(id), { ttl: 20e3 }), (t) => {
      if (!t) return ui.emptyBox("search", "Task not found", "It may have been deleted, or it's in a club you're not in.", `<a class="btn" href="#/club/home">Back to Club home</a>`);
      const edit = kit.can(t.club_id, "tasks.manage") || t.assignee === kit.me()?.id, boss = kit.can(t.club_id, "tasks.manage");
      const cl = Array.isArray(t.checklist) ? t.checklist : [], doneN = cl.filter((x) => x.done).length, pct = cl.length ? Math.round((doneN / cl.length) * 100) : 0;
      const ce = store.use(`task:comments:${id}`, () => api.taskComments(id), { ttl: 15e3 });
      const ST = { todo: ["To do", "gray"], doing: ["In Progress", "purple"], review: ["Review", "amber"], done: ["Completed", "green"] };
      return `${kit.back(`#/club/workspace?c=${t.club_id}`, "Club Workspace")}
        <section class="tk-cover">${t.club_projects?.cover_url ? `<img src="${esc(t.club_projects.cover_url)}" alt="" referrerpolicy="no-referrer">` : ""}
          <div class="top">${ui.st(ST[t.status] || ST.todo)}${edit ? (t.status === "done" ? `<button class="btn sm" data-status="doing">${icon("reset", "sm")} Reopen</button>` : `<button class="btn sm" data-status="done">${icon("check", "sm")} Mark Complete</button>`) : ""}</div>
          <h1>${esc(t.title)}</h1>${t.club_projects ? `<p style="margin:2px 0 0">${esc(t.club_projects.title)}</p>` : ""}</section>
        <div class="cl-tfacts"><div>${icon("calendar")}<span><span class="xs">Due Date</span><b class="${lateCls(t)}">${t.due ? ui.dateLong(t.due) : "No date"}</b></span></div>
          <div>${icon("flag")}<span><span class="xs">Priority</span><b class="pr-${t.priority}">${esc(PRIORITY[t.priority]?.[0] || "Medium")}</b></span></div>
          <div>${icon("kanban")}<span><span class="xs">Project</span><b>${t.club_projects ? `<a href="#/club/project?id=${t.club_projects.id}">${esc(t.club_projects.title)}</a>` : "None"}</b></span></div></div>
        ${edit ? `<label class="field mt-s" style="max-width:220px">Column${ui.select("status", Object.fromEntries(COLUMNS.map(([v, l]) => [v, l])), t.status, 'id="tk-col"')}</label>` : ""}

        ${ui.sec("Description", boss ? `<button class="btn sm soft" id="tk-edit">Edit</button>` : "")}<p class="small" style="color:var(--text-2)">${t.notes ? ui.rich(t.notes) : "No description yet."}</p>

        ${ui.sec("Attachments")}<div class="cl-fgrid">${edit ? `<button class="cl-fcard" id="tk-file" style="border-style:dashed;place-items:center;min-height:110px;cursor:pointer">${icon("plus")}<span class="xs">Add File</span></button>` : ""}
          ${(t.attachments || []).map((a, i) => `<div class="cl-fcard"><button class="th" data-open="${i}" aria-label="Open ${esc(a.name)}" style="border:0;cursor:pointer">${ui.ftype(a.name)}</button><b class="ellipsis">${esc(a.name)}</b><span class="xs">${ui.size(a.size)}${edit ? ` · <button class="linkbtn xs" data-rmfile="${i}">Remove</button>` : ""}</span></div>`).join("")}</div>
        ${!edit && !(t.attachments || []).length ? `<p class="small muted">No files.</p>` : ""}

        <div class="cl-row2 keep mt"><section>${ui.sec("Assignees")}<div class="row nowrap" style="gap:10px">${ui.ava(t.assignee_name || "Anyone")}<span class="grow min0"><b>${esc(t.assignee_name || "Anyone")}</b></span>${boss ? `<button class="btn sm outline" id="tk-who">Change</button>` : ""}</div></section>
          <section>${ui.sec("Labels")}<div class="cl-chips">${(t.labels || []).map((l, i) => `<span class="cl-lbl ${i % 2 ? "amber" : ""}">${esc(l)}${edit ? ` <button class="linkbtn" data-rmlabel="${i}" aria-label="Remove label ${esc(l)}">×</button>` : ""}</span>`).join("")}
            ${edit ? `<button class="btn sm outline" id="tk-label">${icon("plus", "sm")} Add Label</button>` : ""}</div></section></div>

        ${ui.sec(`Subtasks <span class="xs muted">(${doneN}/${cl.length} completed)</span>`, edit ? `<button class="btn sm outline" id="tk-sub">${icon("plus", "sm")} Add Subtask</button>` : "")}
        ${cl.length ? `<div class="row nowrap" style="gap:8px"><div class="cl-bar grow"><i style="width:${pct}%"></i></div><span class="xs" style="color:var(--success-t)">${pct}%</span></div>
          <div class="stack mt-s" style="gap:2px">${cl.map((x, i) => `<label class="cl-set" style="padding:8px 0"><input type="checkbox" data-sub="${i}" ${x.done ? "checked" : ""} ${edit ? "" : "disabled"}><span class="body">${esc(x.t)}</span>${x.d ? `<span class="xs muted">${ui.dateShort(x.d)}</span>` : ""}${edit ? `<button class="icon-btn" data-rmsub="${i}" aria-label="Remove subtask">${icon("x", "sm")}</button>` : ""}</label>`).join("")}</div>`
          : `<p class="small muted">No subtasks.</p>`}

        ${ui.sec("Comments")}${ui.view(ce, (rows) => `<div class="stack" style="gap:10px">${rows.map((r) => `<div class="row nowrap" style="gap:10px;align-items:flex-start">${ui.ava(r.author_name)}<div class="grow min0"><b class="small">${esc(r.author_name || "Member")}</b> <span class="xs muted">${ui.ago(r.created_at)}</span><p class="small" style="margin:2px 0 0">${ui.rich(r.body)}</p></div>
            ${r.user_id === kit.me()?.id || boss ? `<button class="icon-btn" data-rmc="${r.id}" aria-label="Delete comment">${icon("trash", "sm")}</button>` : ""}</div>`).join("") || ""}</div>`, { n: 1, h: 50 })}
        <form class="row nowrap mt-s" id="tk-c" style="gap:8px">${ctx.myAvatar("sm")}<label class="grow"><span class="sr-only">Add a comment</span>${ui.input("body", "", 'placeholder="Add a comment…" maxlength="1000" required')}</label><button class="btn primary" aria-label="Send comment">${icon("send")}</button></form>`;
    }, { n: 3, h: 120 });
  };
  pages["club/task"].mount = (el) => {
    kit.bindRetry(el);
    const id = kit.param("id"), t = store.peek(`task:${id}`); if (!t) return;
    const save = async (patch, btn, msg) => { if (btn) ctx.busy(btn, true);
      try { await api.updateTask(id, patch); store.invalidate(`task:${id}`, `club:tasks:${t.club_id}`, "me:tasks"); if (msg) kit.toast(msg, "success"); }
      catch (err) { kit.toast(err.message, "error"); } finally { if (btn) ctx.busy(btn, false); } };
    kit.$$("[data-status]", el).forEach((b) => b.addEventListener("click", () => save({ status: b.dataset.status, done_at: b.dataset.status === "done" ? new Date().toISOString() : null }, b, b.dataset.status === "done" ? "Marked complete" : "Task reopened")));
    kit.$("#tk-col", el)?.addEventListener("change", (e) => save({ status: e.target.value }, null, "Moved"));
    const cl = () => (Array.isArray(t.checklist) ? t.checklist.map((x) => ({ ...x })) : []);
    kit.$$("[data-sub]", el).forEach((c) => c.addEventListener("change", () => { const l = cl(); l[c.dataset.sub].done = c.checked; save({ checklist: l }); }));
    kit.$$("[data-rmsub]", el).forEach((b) => b.addEventListener("click", (e) => { e.preventDefault(); const l = cl(); l.splice(Number(b.dataset.rmsub), 1); save({ checklist: l }); }));
    kit.$("#tk-sub", el)?.addEventListener("click", () => ui.sheet("Add Subtask", `<form class="stack" id="sb-f">${ui.field("Subtask", ui.input("t", "", 'required maxlength="120" placeholder="Get feedback from team"'))}${ui.field("Date (optional)", `<input class="input" type="date" name="d">`)}<button class="btn primary block">Add Subtask</button></form>`,
      (m) => kit.$("#sb-f", m).addEventListener("submit", (e) => { e.preventDefault(); const f = ui.values(e.target); if (cl().length >= 30) return kit.toast("A task can have up to 30 subtasks", "error"); ctx.closeModal(); save({ checklist: [...cl(), { t: f.t.trim(), done: false, ...(f.d ? { d: f.d } : {}) }] }, null, "Subtask added"); })));
    kit.$("#tk-edit", el)?.addEventListener("click", () => ui.sheet("Edit task", `<form class="stack" id="ed-f">${ui.field("Title", ui.input("title", t.title, 'required minlength="2" maxlength="160"'))}${ui.field("Description", ui.area("notes", t.notes || "", 'rows="5" maxlength="2000"'))}
      <div class="row" style="gap:8px">${ui.field("Due date", `<input class="input" type="date" name="due" value="${esc(t.due || "")}">`)}${ui.field("Priority", ui.select("priority", { high: "High", medium: "Medium", low: "Low" }, t.priority || "medium"))}</div><div id="cl-err"></div><button class="btn primary block">Save changes</button></form>`,
      (m) => kit.$("#ed-f", m).addEventListener("submit", async (e) => { e.preventDefault(); const f = ui.values(e.target), b = e.submitter; ctx.busy(b, true);
        try { await api.updateTask(id, { title: f.title.trim(), notes: f.notes.trim(), due: f.due || null, priority: f.priority }); ctx.closeModal(); store.invalidate(`task:${id}`, `club:tasks:${t.club_id}`); kit.toast("Task saved", "success"); } catch (err) { ui.fail(m, err.message); } finally { ctx.busy(b, false); } })));
    kit.$("#tk-label", el)?.addEventListener("click", () => ui.sheet("Add Label", `<form class="stack" id="lb-f">${ui.field("Label", ui.input("l", "", 'required maxlength="30" placeholder="Design"'))}<button class="btn primary block">Add Label</button></form>`,
      (m) => kit.$("#lb-f", m).addEventListener("submit", (e) => { e.preventDefault(); const l = ui.values(e.target).l.trim(); const labels = [...new Set([...(t.labels || []), l])].slice(0, 8); ctx.closeModal(); save({ labels }); })));
    kit.$$("[data-rmlabel]", el).forEach((b) => b.addEventListener("click", () => save({ labels: (t.labels || []).filter((_, i) => i !== Number(b.dataset.rmlabel)) })));
    kit.$("#tk-who", el)?.addEventListener("click", async () => {
      const people = await store.fetch(`club:members:${t.club_id}`, () => api.members(t.club_id)).catch(() => []);
      ui.sheet("Change assignee", `<form class="stack" id="wh-f">${ui.field("Assignee", ui.select("u", [["", "Anyone"], ...people.map((p) => [p.user_id, p.display_name])], t.assignee || ""))}<button class="btn primary block">Save</button></form>`,
        (m) => kit.$("#wh-f", m).addEventListener("submit", (e) => { e.preventDefault(); const u = ui.values(e.target).u, p = people.find((x) => x.user_id === u); ctx.closeModal(); save({ assignee: u || null, assignee_name: p?.display_name || "" }, null, "Assignee changed"); }));
    });
    kit.$("#tk-file", el)?.addEventListener("click", async (e) => {
      const f = await ui.pickFile("image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.txt"); if (!f) return;
      if (f.size > 20e6) return kit.toast("Files up to 20 MB", "error", "Shrink the file or share a link in a comment.");
      if ((t.attachments || []).length >= 12) return kit.toast("A task can have up to 12 files", "error");
      const btn = e.currentTarget; ctx.busy(btn, true);
      try { const path = await api.uploadTaskFile(t.club_id, await ui.shrink(f)); await save({ attachments: [...(t.attachments || []), { name: f.name.slice(0, 120), path, size: f.size }] }, null, "File added"); }
      catch (err) { kit.toast(err.message, "error"); } finally { ctx.busy(btn, false); }
    });
    kit.$$("[data-rmfile]", el).forEach((b) => b.addEventListener("click", () => save({ attachments: (t.attachments || []).filter((_, i) => i !== Number(b.dataset.rmfile)) }, b, "File removed")));
    kit.$$("[data-open]", el).forEach((b) => b.addEventListener("click", async () => { try { window.open(await api.signedUrl(t.attachments[b.dataset.open].path), "_blank", "noopener"); } catch (err) { kit.toast(err.message, "error"); } }));
    kit.$("#tk-c", el)?.addEventListener("submit", async (e) => {
      e.preventDefault(); const f = e.target, body = String(new FormData(f).get("body") || "").trim(), btn = e.submitter; if (!body) return;
      ctx.busy(btn, true); try { await api.addTaskComment(t, body); f.reset(); store.invalidate(`task:comments:${id}`); } catch (err) { kit.toast(err.message, "error"); } finally { ctx.busy(btn, false); }
    });
    kit.$$("[data-rmc]", el).forEach((b) => b.addEventListener("click", async () => { try { await api.deleteTaskComment(b.dataset.rmc); store.invalidate(`task:comments:${id}`); } catch (err) { kit.toast(err.message, "error"); } }));
  };
}
