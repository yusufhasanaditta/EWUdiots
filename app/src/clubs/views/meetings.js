/* Meetings & documents (#/club/meetings?c=…) and one meeting (#/club/meeting?id=…), from the "Meeting Dashboard"
   boards: agenda, attendance (the club's rotating-code check-in, linked by session_id), online link, minutes, action
   items (club_tasks.meeting_id) and documents (club_docs.meeting_id). Without ?c= the list shows every meeting in
   my clubs. Planning needs meetings.manage; members see meetings for their audience (members / executives). */

const STATUS = { scheduled: ["Upcoming", "purple"], completed: ["Completed", "green"], cancelled: ["Cancelled", "red"] };

/** @param {Record<string, any>} pages @param {any} kit */
export function register(pages, kit) {
  const { ui, icon, esc, api, store, ctx } = kit;
  let filter = "all", q = "", tab = "overview";
  const status = (m) => (m.status === "scheduled" && new Date(m.ends_at || m.starts_at) < Date.now() - 36e5 ? "completed" : m.status);

  /* ═════════ List ═════════ */
  pages["club/meetings"] = () => {
    const g = kit.gate("meetings"); if (g) return g;
    const c = kit.param("c") || "", mine = kit.myClubs(), ids = c ? [c] : mine.map((m) => m.club_id);
    if (c) { const mg = kit.memberGate(c, "meetings"); if (mg) return mg; }
    if (!ids.length) return ui.emptyBox("clipboard", "No meetings", "Meetings of your clubs appear here.", `<a class="btn primary" href="#/club/explore">Find clubs</a>`);
    const me = store.use(`club:meetings:${ids.join(",")}`, async () => (await Promise.all(ids.map((id) => api.meetings(id)))).flat(), { ttl: 45e3 });
    const can = c && kit.can(c, "meetings.manage") && kit.feature(c, "meetings");
    return `${c ? kit.back(`#/club/space?c=${c}`, kit.membership(c)?.short_name || "Club") : ""}
      ${ui.ph("Meetings & Documents", "Plan meetings, manage minutes, track decisions and store important documents.", can ? `<button class="btn primary" id="mt-new">${icon("plus")} New Meeting</button>` : "")}
      ${ui.view(me, (rows) => {
        const st = rows.map((m) => ({ ...m, _s: status(m) }));
        const n = (s) => st.filter((m) => m._s === s).length;
        const words = q.toLowerCase().split(/\s+/).filter(Boolean);
        const list = st.filter((m) => (filter === "all" || (filter === "upcoming" ? m._s === "scheduled" : filter === "past" ? m._s === "completed" : filter === "minutes" ? !!m.minutes : m._s === filter))
          && (!words.length || words.every((w) => `${m.title} ${m.location} ${ui.dateLong(m.starts_at)}`.toLowerCase().includes(w))))
          .sort((a, b) => (a._s === "scheduled" && b._s !== "scheduled" ? -1 : b._s === "scheduled" && a._s !== "scheduled" ? 1 : a._s === "scheduled" ? new Date(a.starts_at) - new Date(b.starts_at) : new Date(b.starts_at) - new Date(a.starts_at)));
        return `<div class="cl-stats">${ui.stat("calendar", "purple", rows.length, "Total meetings")}${ui.stat("checkc", "green", n("completed"), "Completed")}${ui.stat("clock", "amber", n("scheduled"), "Upcoming")}${ui.stat("xc", "red", n("cancelled"), "Cancelled")}</div>
          <nav class="cl-seg">${[["all", "All"], ["upcoming", "Upcoming"], ["past", "Past"], ["minutes", "With minutes"], ["cancelled", "Cancelled"]].map(([v, l]) => `<button data-f="${v}" aria-pressed="${filter === v}">${l}</button>`).join("")}</nav>
          <div class="searchbar cl-search">${icon("search")}<input class="input" id="mt-q" type="search" placeholder="Search meetings by title, date or keyword…" value="${esc(q)}" autocomplete="off"></div>
          <div class="stack mt">${list.length ? list.map((m) => `<a class="cl-ccard" href="#/club/meeting?id=${m.id}"><span class="art">${ui.art(m.cover_url, m.title)}${ui.dchip(m.starts_at)}</span>
            <span class="min0">${ui.st(STATUS[m._s])}<b class="ellipsis" style="margin-top:4px">${esc(m.title)}</b><span class="meta"><span>${icon("clock")} ${ui.time(m.starts_at)}${m.ends_at ? ` – ${ui.time(m.ends_at)}` : ""}</span>
              <span>${icon(m.online_link ? "video" : "pin")} ${esc(m.location || (m.online_link ? "Online" : "Place to be decided"))}</span></span>
              ${m._s === "completed" && m.minutes ? `<span class="btn sm outline" style="margin-top:6px">View Minutes</span>` : ""}</span></a>`).join("") : ui.emptyBox("clipboard", "No meetings here", can ? "Plan the first one with New Meeting." : "Your club's meetings will appear here.")}</div>`;
      }, { n: 4, h: 110 })}`;
  };
  pages["club/meetings"].mount = (el) => {
    kit.bindRetry(el);
    const input = kit.$("#mt-q", el);
    input?.addEventListener("input", () => { q = input.value; const pos = input.selectionStart; ctx.rerender(); const i = kit.$("#mt-q"); if (i) { i.focus(); i.setSelectionRange(pos, pos); } });
    kit.$$("[data-f]", el).forEach((b) => b.addEventListener("click", () => { filter = b.dataset.f; ctx.rerender(); }));
    kit.$("#mt-new", el)?.addEventListener("click", () => edit({ club_id: kit.param("c") }));
    if (kit.param("new") && kit.can(kit.param("c"), "meetings.manage")) { history.replaceState(null, "", `#/club/meetings?c=${kit.param("c")}`); edit({ club_id: kit.param("c") }); }
  };

  /** Plan or edit a meeting. Agenda: one item per line, optionally "5:00 PM Item". */
  function edit(m) {
    const d = m.starts_at ? new Date(m.starts_at) : new Date(Date.now() + 864e5);
    const local = (x) => new Date(x.getTime() - x.getTimezoneOffset() * 6e4).toISOString().slice(0, 16);
    const agenda = (m.agenda || []).map((a) => `${a.at ? `${a.at} ` : ""}${a.title}`).join("\n");
    ui.sheet(m.id ? "Edit meeting" : "New meeting", `<form id="mt-form" class="stack">
      ${ui.field("Title", ui.input("title", m.title || "", 'required maxlength="140" placeholder="Executive Planning Meeting"'))}
      <div class="row" style="gap:8px">${ui.field("Starts", `<input class="input" type="datetime-local" name="starts" value="${local(d)}" required>`)}${ui.field("Ends", `<input class="input" type="datetime-local" name="ends" value="${m.ends_at ? local(new Date(m.ends_at)) : local(new Date(d.getTime() + 36e5))}">`)}</div>
      ${ui.field("Place", ui.input("location", m.location || "", 'maxlength="140" placeholder="Room 405, Main Building"'))}
      ${ui.field("Online link (Google Meet, Zoom…)", ui.input("online_link", m.online_link || "", 'type="url" placeholder="https://meet.google.com/…"'))}
      ${ui.field("Who's invited", ui.select("audience", [["members", "All members"], ["exec", "Executives only"]], m.audience || "members"))}
      ${ui.field("Agenda (one item per line)", ui.area("agenda", agenda, 'rows="5" placeholder="5:00 PM Review previous action items\n5:10 PM Upcoming events"'))}
      ${m.id ? ui.field("Status", ui.select("status", [["scheduled", "Scheduled"], ["completed", "Completed"], ["cancelled", "Cancelled"]], m.status)) : ""}
      <div id="cl-err"></div><button class="btn primary block">${icon("check")} ${m.id ? "Save" : "Create meeting"}</button>${m.id ? `<button type="button" class="btn ghost block" id="mt-del" style="color:var(--error)">Delete meeting</button>` : ""}</form>`, (s) => {
      kit.$("#mt-form", s).addEventListener("submit", async (e) => {
        e.preventDefault(); const f = ui.values(e.target), btn = e.target.querySelector("button.primary");
        const link = String(f.online_link || "").trim();
        if (link && !/^https:\/\//.test(link)) return ui.fail(s, "The meeting link must start with https://");
        const rows = String(f.agenda || "").split("\n").map((l) => l.trim()).filter(Boolean).slice(0, 30).map((l) => { const mm = l.match(/^(\d{1,2}(:\d{2})?\s*(AM|PM)?)\s+(.+)$/i); return mm ? { at: mm[1].toUpperCase(), title: mm[4] } : { at: "", title: l }; });
        ctx.busy(btn, true, "Saving…");
        try {
          const row = await api.saveMeeting({ ...(m.id ? { id: m.id } : { club_id: m.club_id }), title: f.title.trim(), starts_at: new Date(f.starts).toISOString(), ends_at: f.ends ? new Date(f.ends).toISOString() : null,
            location: String(f.location || "").trim(), online_link: link, audience: f.audience, agenda: rows, ...(f.status ? { status: f.status } : {}) });
          ctx.closeModal(); store.invalidate("club:meetings:", `club:meeting:${row.id}`, "me:meetings:"); if (!m.id) kit.go(`#/club/meeting?id=${row.id}`);
        } catch (err) { ctx.busy(btn, false); ui.fail(s, err.message); }
      });
      kit.$("#mt-del", s)?.addEventListener("click", () => { ctx.closeModal(); ui.confirm("Delete this meeting?", "Its agenda and minutes are removed. Action items stay as tasks.", "Delete", async () => { await api.deleteMeeting(m.id); store.invalidate("club:meetings:"); kit.go(`#/club/meetings?c=${m.club_id}`); }, true); });
    });
  }

  /* ═════════ One meeting ═════════ */
  pages["club/meeting"] = () => {
    const g = kit.gate("this meeting"); if (g) return g;
    const id = kit.param("id"), me = store.use(`club:meeting:${id}`, () => api.meeting(id), { ttl: 45e3 });
    return ui.view(me, (m) => {
      if (!m) return ui.emptyBox("lock", "Meeting not found", "It may be for executives only, or it was removed.");
      const can = kit.can(m.club_id, "meetings.manage"), s = status(m);
      const ae = store.use(`club:matt:${id}`, () => api.meetingAttendance(id), { ttl: 30e3 }), att = ae.value || [], present = att.filter((a) => a.present).length;
      const tabs = [["overview", "Overview"], ["agenda", "Agenda"], ["attendance", "Attendance"], ["minutes", "Minutes"], ["actions", "Action Items"], ["documents", "Documents"]];
      return `${kit.back(`#/club/meetings?c=${m.club_id}`, "Meetings")}
        <section class="cl-cover-lg">${m.cover_url ? `<img src="${esc(m.cover_url)}" alt="">` : ""}${can ? `<div class="tools"><button class="btn sm white" id="mt-edit">${icon("edit", "sm")} Edit Meeting</button></div>` : ""}
          <div class="row nowrap" style="gap:12px;align-items:center">${ui.dchip(m.starts_at)}<div class="min0"><h1>${esc(m.title)}</h1><p>Organized by ${esc(m.clubs?.name || "")}</p></div></div></section>
        <div class="cl-facts"><div class="cl-fact">${icon("clock")}<div><b>${ui.time(m.starts_at)}${m.ends_at ? ` – ${ui.time(m.ends_at)}` : ""}</b><span>${ui.dateLong(m.starts_at)}</span></div></div>
          <div class="cl-fact">${icon(m.online_link ? "video" : "pin")}<div><b>${esc(m.location || (m.online_link ? "Online" : "To be decided"))}</b><span>${m.online_link ? "Meeting link available" : ui.st(STATUS[s])}</span></div></div>
          <div class="cl-fact">${icon("users")}<div><b>${present} / ${att.length}</b><span>Attended</span><div class="cl-prog green" style="margin-top:4px"><i style="width:${att.length ? (present / att.length) * 100 : 0}%"></i></div></div></div></div>
        <nav class="cl-seg sm">${tabs.map(([v, l]) => `<button data-t="${v}" aria-pressed="${tab === v}">${l}</button>`).join("")}</nav>
        ${tab === "overview" ? `${agendaCard(m, can)}<div class="cl-row2">${attendanceCard(m, att, can, true)}${linkCard(m)}</div>${minutesCard(m, can)}${actionsCard(m, can)}${docsCard(m, can)}`
          : tab === "agenda" ? agendaCard(m, can) : tab === "attendance" ? attendanceCard(m, att, can, false) : tab === "minutes" ? minutesCard(m, can) : tab === "actions" ? actionsCard(m, can) : docsCard(m, can)}`;
    }, { n: 3, h: 120 });
  };
  const agendaCard = (m, can) => `<section class="card mt"><div class="card-h"><h2>Meeting Agenda</h2>${can ? `<button class="btn sm outline" data-edit-meeting>Edit</button>` : ""}</div>
    ${m.agenda?.length ? `<ol class="stack" style="gap:8px;padding:0;list-style:none">${m.agenda.map((a, i) => `<li class="row nowrap" style="gap:10px"><span class="cl-q-n">${i + 1}</span><span class="grow">${esc(a.title)}</span><span class="xs">${esc(a.at || "")}</span></li>`).join("")}</ol>` : `<p class="small muted">No agenda yet.</p>`}</section>`;
  function attendanceCard(m, att, can, short) {
    const present = att.filter((a) => a.present);
    return `<section class="card mt"><div class="card-h"><h2>Attendance (${present.length}/${att.length})</h2>${short ? `<button class="btn sm ghost" data-t="attendance">View all</button>` : ""}</div>
      ${short ? `${ui.avaStack(present, 6)}<div class="row mt-s" style="gap:16px"><span class="xs">● Present <b>${present.length}</b></span><span class="xs">● Not marked <b>${att.length - present.length}</b></span></div>`
        : `<div class="cl-list">${att.map((a) => `<div class="cl-li">${ui.ava(a.display_name, a.photo_url, "sm")}<span class="body"><b>${esc(a.display_name)}</b></span>${can && m.session_id ? `<label class="switch"><input type="checkbox" data-present="${a.user_id}" ${a.present ? "checked" : ""}><span></span></label>` : ui.st(a.present ? ["Present", "green"] : ["Not marked", "gray"])}</div>`).join("") || `<p class="small muted" style="padding:12px">No one invited yet.</p>`}</div>`}
      ${can ? (m.session_id ? `<a class="btn sm outline mt-s" href="#/club/manage?c=${m.club_id}&tab=attendance">${icon("qr", "sm")} Show check-in code</a>` : `<button class="btn sm primary mt-s" id="mt-att">${icon("qr", "sm")} Start attendance</button>`) : ""}</section>`;
  }
  const linkCard = (m) => `<section class="card mt"><h2>Meeting Link</h2>${m.online_link ? `<div class="cl-li" style="padding:10px 0">${icon("video")}<span class="body"><b>Online meeting</b><span class="ellipsis">${esc(m.online_link)}</span></span></div><a class="btn outline block" href="${esc(m.online_link)}" target="_blank" rel="noopener noreferrer">Join Meeting ${icon("external", "sm")}</a>` : `<p class="small muted">In person${m.location ? ` at ${esc(m.location)}` : ""}.</p>`}</section>`;
  const minutesCard = (m, can) => `<section class="card mt"><div class="card-h"><h2>Meeting Minutes</h2>${can ? `<button class="btn sm outline" id="mt-min">Edit</button>` : ""}</div><p style="color:var(--text-2);line-height:1.6">${m.minutes ? ui.rich(m.minutes) : "<i>No minutes yet.</i>"}</p></section>`;
  function actionsCard(m, can) {
    const te = store.use(`club:mtasks:${m.id}`, () => api.meetingTasks(m.id), { ttl: 30e3 });
    return `<section class="card mt"><div class="card-h"><h2>Action Items (${(te.value || []).length})</h2>${can ? `<button class="btn sm outline" id="mt-task">${icon("plus", "sm")} Add</button>` : ""}</div>
      ${ui.view(te, (rows) => (rows.length ? rows.map((t) => `<div class="cl-li" style="padding:10px 0"><button class="icon-btn" data-done="${t.id}" aria-label="${t.status === "done" ? "Mark not done" : "Mark done"}">${icon(t.status === "done" ? "checkc" : "clock")}</button>
          <span class="body"><b style="${t.status === "done" ? "text-decoration:line-through;color:var(--text-3)" : ""}">${esc(t.title)}</b><span>${esc(t.assignee_name || "Unassigned")}</span></span><span class="end">${t.due ? ui.dateShort(t.due) : ""}</span></div>`).join("") : `<p class="small muted">No action items.</p>`))}</section>`;
  }
  function docsCard(m, can) {
    const de = store.use(`club:mdocs:${m.id}`, () => api.meetingDocs(m.id), { ttl: 60e3 });
    return `<section class="card mt"><div class="card-h"><h2>Documents (${(de.value || []).length})</h2>${can ? `<button class="btn sm outline" id="mt-doc">${icon("upload", "sm")} Upload</button>` : ""}</div>
      ${ui.view(de, (rows) => (rows.length ? `<div class="cl-hscroll">${rows.map((d) => `<button class="cl-folder" data-doc="${d.id}" style="width:200px">${ui.ftype(d.title, d.mime)}<span class="min0"><b class="ellipsis">${esc(d.title)}</b><span>${ui.size(d.size)}</span></span></button>`).join("")}</div>` : `<p class="small muted">No documents.</p>`))}</section>`;
  }
  pages["club/meeting"].mount = (el) => {
    kit.bindRetry(el);
    const id = kit.param("id"), m = store.peek(`club:meeting:${id}`); if (!m) return;
    const reload = () => store.invalidate(`club:meeting:${id}`, `club:matt:${id}`, `club:mtasks:${id}`, `club:mdocs:${id}`);
    kit.$$("[data-t]", el).forEach((b) => b.addEventListener("click", () => { tab = b.dataset.t; ctx.rerender(); }));
    [kit.$("#mt-edit", el), ...kit.$$("[data-edit-meeting]", el)].forEach((b) => b?.addEventListener("click", () => edit(m)));
    kit.$("#mt-min", el)?.addEventListener("click", () => ui.sheet("Meeting minutes", `<form id="mn" class="stack">${ui.area("minutes", m.minutes, 'rows="10" maxlength="20000" placeholder="What was discussed and decided…"')}<button class="btn primary block">Save minutes</button></form>`, (s) =>
      kit.$("#mn", s).addEventListener("submit", async (e) => { e.preventDefault(); try { await api.saveMeeting({ id: m.id, minutes: String(new FormData(e.target).get("minutes") || ""), status: m.status === "scheduled" && new Date(m.starts_at) < Date.now() ? "completed" : m.status }); ctx.closeModal(); reload(); } catch (err) { kit.toast(err.message, "error"); } })));
    kit.$("#mt-att", el)?.addEventListener("click", async () => {
      try { const sess = await api.createSession(m.club_id, m.title.slice(0, 120)); await api.saveMeeting({ id: m.id, session_id: sess.id }); reload(); kit.toast("Attendance started", "success", "Show the check-in code from Manage → Attendance."); } catch (e) { kit.toast(e.message, "error"); }
    });
    kit.$$("[data-present]", el).forEach((c) => c.addEventListener("change", async () => { try { await api.markPresent(m.session_id, c.dataset.present, c.checked); store.invalidate(`club:matt:${id}`); } catch (e) { kit.toast(e.message, "error"); c.checked = !c.checked; } }));
    kit.$("#mt-task", el)?.addEventListener("click", () => {
      const people = store.peek(`club:members:${m.club_id}`) || [];
      if (!people.length) store.use(`club:members:${m.club_id}`, () => api.members(m.club_id));
      ui.sheet("Action item", `<form id="ai" class="stack">${ui.field("What needs doing", ui.input("title", "", 'required maxlength="160"'))}
        ${ui.field("Who", ui.select("assignee", [["", "Unassigned"], ...people.filter((p) => p.status === "active").map((p) => [p.user_id, p.display_name])], ""))}
        ${ui.field("Due", '<input class="input" type="date" name="due">')}<button class="btn primary block">Add</button></form>`, (s) => kit.$("#ai", s).addEventListener("submit", async (e) => {
        e.preventDefault(); const f = ui.values(e.target);
        try { await api.addTask({ club_id: m.club_id, meeting_id: m.id, title: f.title.trim(), assignee: f.assignee || null, due: f.due || null }); ctx.closeModal(); reload(); } catch (err) { kit.toast(err.message, "error"); }
      }));
    });
    kit.$$("[data-done]", el).forEach((b) => b.addEventListener("click", async () => {
      const t = (store.peek(`club:mtasks:${id}`) || []).find((x) => x.id === b.dataset.done);
      try { await api.updateTask(t.id, { status: t.status === "done" ? "todo" : "done" }); reload(); } catch (e) { kit.toast(e.message, "error"); }
    }));
    kit.$("#mt-doc", el)?.addEventListener("click", async () => {
      const f = await ui.pickFile("application/pdf,.docx,.xlsx,.pptx,image/*"); if (!f) return;
      if (f.size > 10e6) return kit.toast("Files can be up to 10 MB", "error");
      try { const path = await api.uploadDoc(m.club_id, f); await api.addDoc({ club_id: m.club_id, meeting_id: m.id, title: f.name.slice(0, 140), path, mime: f.type, size: f.size, audience: m.audience }); reload(); } catch (e) { kit.toast(e.message, "error"); }
    });
    kit.$$("[data-doc]", el).forEach((b) => b.addEventListener("click", async () => {
      const d = (store.peek(`club:mdocs:${id}`) || []).find((x) => x.id === b.dataset.doc);
      try { window.open(d.url || (await api.signedUrl(d.path)), "_blank", "noopener"); } catch (e) { kit.toast(e.message, "error"); }
    }));
  };
}
