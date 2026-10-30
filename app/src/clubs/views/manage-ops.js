/* Console sections for running the club: attendance (rotating code + QR on screen), polls and elections, tasks,
   documents, certificates and the finance log (record keeping only; no money moves through EWUdiots). */
import qrcode from "qrcode-generator";
import { codeFor, windowOf, secondsLeft, qrText } from "../checkin.js";
import { has } from "../perms.js";

/** @param {any} kit */
export function opsSections(kit) {
  const { ui, icon, esc, api, store } = kit;
  const members = (club) => store.use(`club:members:${club.id}`, () => api.members(club.id), { ttl: 60e3 });

  /* ═════════ Attendance ═════════ */
  let live = null; // { id, secret, timer }
  const attendance = { label: "Attendance", icon: "checkc", group: "Activities", perm: "attendance.take",
    render(club) {
      const se = store.use(`club:sessions:${club.id}`, () => api.sessions(club.id), { ttl: 15e3 });
      const ae = store.use(`club:att:${club.id}`, () => api.attendance(club.id), { ttl: 10e3 });
      const sid = kit.param("s");
      return kit.head("Attendance", "Start a meeting, show the code on a screen, and members check in from their phones.")
        + `<form id="at-new" class="card row nowrap" style="gap:8px">${ui.input("title", "", 'placeholder="Meeting name, e.g. Weekly meeting · 14 Nov" maxlength="120" required class="input grow"')}<button class="btn primary">${icon("play")} Start</button></form>`
        + ui.view(se, (ses) => {
          const att = ae.value || [], count = (id) => att.filter((a) => a.session_id === id).length, s = ses.find((x) => x.id === sid);
          if (s) return liveView(club, s, att.filter((a) => a.session_id === s.id));
          return ses.length ? `<section class="card tight mt">${ses.map((x) => `<a class="lrow" href="#/club/manage?c=${club.id}&tab=attendance&s=${x.id}"><span class="itile sm ${x.open ? "green" : "gray"}">${icon(x.open ? "play" : "checkc")}</span><span class="body"><b>${esc(x.title)}</b><span>${ui.dateTime(x.starts_at)} · ${ui.plural(count(x.id), "person", "people")}</span></span>${x.open ? ui.pill("Open", "green") : ""}${icon("chevR", "chev")}</a>`).join("")}</section>`
            : `<p class="small muted mt">No meetings yet.</p>`;
        });
    },
    mount(el, club) {
      kit.$("#at-new", el)?.addEventListener("submit", async (e) => {
        e.preventDefault(); const t = e.target.title.value.trim(); if (t.length < 2) return;
        try { const s = await api.createSession(club.id, t); store.invalidate(`club:sessions:${club.id}`); kit.go(`#/club/manage?c=${club.id}&tab=attendance&s=${s.id}`); } catch (err) { kit.toast(err.message, "error"); }
      });
      const sid = kit.param("s"), s = (store.peek(`club:sessions:${club.id}`) || []).find((x) => x.id === sid);
      if (s) mountLive(el, club, s); else stopLive();
    } };
  function liveView(club, s, present) {
    const ms = members(club).value || [], here = new Set(present.map((a) => a.user_id));
    return `<div class="grid g2 mt"><section class="card cl-live ${s.open ? "" : "closed"}"><div class="row between"><b>${esc(s.title)}</b>${s.open ? ui.pill("Check-in open", "green") : ui.pill("Closed")}</div>
        ${s.open ? `<div class="cl-live-qr" id="at-qr" aria-hidden="true"></div><p class="cl-live-code num" id="at-code" aria-live="polite">······</p><p class="xs" id="at-left">Changes every 30 seconds</p>
          <p class="small muted">Members open EWUdiots Club → their club → Attendance → Check in.</p>` : `<p class="small muted mt">Check-in is closed.</p>`}
        <div class="row mt" style="gap:8px">${s.open ? `<button class="btn neutral" id="at-close">${icon("lock")} Close check-in</button>` : `<button class="btn outline" id="at-reopen">${icon("play")} Reopen</button>`}<button class="btn ghost" id="at-full">${icon("external")} Full screen</button><a class="btn ghost" href="#/club/manage?c=${club.id}&tab=attendance">All meetings</a></div></section>
      <section class="card"><div class="card-h"><h2>Present</h2><span class="pill green">${here.size} of ${ms.filter((m) => m.status === "active").length}</span></div>
        <div class="stack" style="gap:2px">${ms.filter((m) => m.status === "active").sort((a, b) => here.has(b.user_id) - here.has(a.user_id) || a.display_name.localeCompare(b.display_name)).map((m) => `<label class="lrow cl-att-row"><span class="avatar sm">${esc(ui.initials(m.display_name))}</span><span class="body"><b>${esc(m.display_name)}</b><span>${esc(m.wing || m.role_name)}${here.has(m.user_id) && present.find((a) => a.user_id === m.user_id)?.by_hand ? " · marked by hand" : ""}</span></span><input type="checkbox" class="check" data-mark="${m.user_id}" ${here.has(m.user_id) ? "checked" : ""} aria-label="Present"></label>`).join("")}</div></section></div>`;
  }
  function stopLive() { if (live?.timer) clearInterval(live.timer); live = null; }
  async function mountLive(el, club, s) {
    kit.$("#at-close", el)?.addEventListener("click", async () => { await api.setSessionOpen(s.id, false).catch((e) => kit.toast(e.message, "error")); store.invalidate(`club:sessions:${club.id}`); });
    kit.$("#at-reopen", el)?.addEventListener("click", async () => { await api.setSessionOpen(s.id, true).catch((e) => kit.toast(e.message, "error")); store.invalidate(`club:sessions:${club.id}`); });
    kit.$("#at-full", el)?.addEventListener("click", () => kit.$(".cl-live", el)?.requestFullscreen?.().catch(() => {}));
    kit.$$("[data-mark]", el).forEach((c) => c.addEventListener("change", async () => { try { await api.markPresent(s.id, c.dataset.mark, c.checked); store.invalidate(`club:att:${club.id}`); } catch (err) { c.checked = !c.checked; kit.toast(err.message, "error"); } }));
    if (!s.open) return stopLive();
    if (!live || live.id !== s.id) { stopLive(); try { live = { id: s.id, secret: await api.sessionSecret(s.id) }; } catch (err) { return kit.toast(err.message, "error"); } }
    let shown = -1;
    const paint = async () => {
      const box = kit.$("#at-code"); if (!box) return stopLive();
      const w = windowOf(); kit.$("#at-left").textContent = `New code in ${secondsLeft()} s`;
      if (w === shown) return; shown = w;
      const code = await codeFor(live.secret, w);
      box.textContent = `${code.slice(0, 3)} ${code.slice(3)}`;
      const q = qrcode(0, "M"); q.addData(qrText(s.id, code)); q.make(); kit.$("#at-qr").innerHTML = q.createSvgTag({ cellSize: 6, margin: 1, scalable: true });
      store.refresh(`club:att:${club.id}`, () => api.attendance(club.id)); // new check-ins, about every 30 s (redraws only if changed)
    };
    if (live.timer) clearInterval(live.timer);
    live.timer = setInterval(paint, 1000); paint();
  }

  /* ═════════ Polls & elections ═════════ */
  const polls = { label: "Polls & elections", icon: "bars", group: "Activities", perm: "polls.create",
    render(club, m) {
      const pe = store.use(`club:polls:${club.id}`, () => api.polls(club.id), { ttl: 15e3 });
      return kit.head("Polls & elections", "Members vote from the members' space. Anonymous polls never store who chose what.")
        + `<form id="pl-form" class="card stack">${ui.field("Question", ui.input("title", "", 'required maxlength="160" placeholder="e.g. Which date works for the workshop?"'))}
          ${ui.field("Options", ui.area("options", "", 'rows="4" required placeholder="One option per line (candidates, for an election)"'))}
          <div class="grid g2">${ui.field("Type", ui.select("kind", m.rank <= 2 ? { poll: "Poll", election: "Election" } : { poll: "Poll" }))}${ui.field("Who votes", ui.select("audience", { members: "All members", exec: "Executives only" }))}</div>
          <div class="grid g2">${ui.field("Closes (optional)", ui.input("closes_at", "", 'type="datetime-local"'))}${ui.field("Results", ui.select("results", { after_close: "After voting closes", live: "Live" }))}</div>
          ${ui.toggle("anonymous", true, "Anonymous", "Nobody, including admins, can see who voted for what.")}${ui.toggle("multi", false, "Allow more than one choice")}
          <div id="cl-err"></div><button class="btn primary" style="justify-self:start">${icon("bars")} Start</button></form>`
        + ui.view(pe, (rows) => (rows.length ? `<h2 class="cl-h2">Polls</h2><div class="stack">${rows.map((p) => {
          const re = store.use(`poll:res:${p.id}`, () => api.results(p.id), { ttl: 15e3 }).value || [], total = re[0]?.voters || 0, closed = p.closed || (p.closes_at && new Date(p.closes_at) < Date.now());
          return `<article class="card"><div class="row nowrap" style="gap:8px">${ui.pill(p.kind === "election" ? "Election" : "Poll", p.kind === "election" ? "amber" : "purple")}${p.anonymous ? ui.pill("Anonymous") : ""}<span class="xs push">${ui.plural(total, "vote")}${closed ? " · closed" : ""}</span></div><h3 class="mt-s">${esc(p.title)}</h3>
            <div class="stack mt-s">${p.options.map((o, i) => { const v = re.find((x) => x.choice === i)?.votes || 0; return `<div class="cl-bar"><div class="row between"><span class="small">${esc(o)}</span><b class="small num">${v}</b></div><i style="width:${total ? (100 * v) / Math.max(1, ...re.map((x) => x.votes)) : 0}%"></i></div>`; }).join("")}</div>
            <div class="row mt-s" style="gap:8px">${!closed ? `<button class="btn sm neutral" data-pc="${p.id}">${icon("lock", "sm")} Close voting</button>` : ""}<button class="btn sm ghost" data-pd="${p.id}">${icon("trash", "sm")} Delete</button></div></article>`;
        }).join("")}</div>` : ""));
    },
    mount(el, club) {
      kit.$("#pl-form", el)?.addEventListener("submit", async (e) => {
        e.preventDefault(); const v = ui.values(e.target), options = [...new Set(String(v.options).split("\n").map((o) => o.trim()).filter(Boolean))].slice(0, 30);
        if (String(v.title).trim().length < 3 || options.length < 2) return ui.fail(e.target, "Add a question and at least 2 options.");
        try { await api.createPoll({ club_id: club.id, kind: v.kind, title: v.title.trim(), options, audience: v.audience, results: v.results, anonymous: !!v.anonymous, multi: !!v.multi, closes_at: v.closes_at ? new Date(v.closes_at).toISOString() : null }); e.target.reset(); store.invalidate(`club:polls:${club.id}`); kit.toast("Poll started", "success", "Members see it in the members' space."); }
        catch (err) { ui.fail(e.target, err.message); }
      });
      kit.$$("[data-pc]", el).forEach((b) => b.addEventListener("click", async () => { try { await api.closePoll(b.dataset.pc); store.invalidate(`club:polls:${club.id}`, `poll:res:${b.dataset.pc}`); } catch (err) { kit.toast(err.message, "error"); } }));
      kit.$$("[data-pd]", el).forEach((b) => b.addEventListener("click", () => kit.ctx.confirmModal("Delete this poll?", "Its votes are deleted too.", "Delete", async () => { await api.deletePoll(b.dataset.pd); store.invalidate(`club:polls:${club.id}`); }, true)));
    } };

  /* ═════════ Tasks ═════════ */
  const tasks = { label: "Tasks", icon: "clipboard", group: "Activities", perm: "tasks.manage",
    render(club) {
      const te = store.use(`club:tasks:${club.id}`, () => api.tasks(club.id), { ttl: 15e3 }), ms = (members(club).value || []).filter((m) => m.status === "active");
      return kit.head("Tasks", "Give work to members or a wing. They see it in the members' space and get a message.")
        + `<form id="tk-form" class="card stack">${ui.field("Task", ui.input("title", "", 'required maxlength="160" placeholder="e.g. Design the workshop poster"'))}
          <div class="grid g2">${ui.field("Assign to", ui.select("assignee", [["", "Anyone in the wing"], ...ms.map((m) => [m.user_id, m.display_name])]))}${ui.field("Wing", club.wings?.length ? ui.select("wing", [["", "No wing"], ...club.wings.map((w) => [w, w])]) : ui.input("wing", "", 'maxlength="40"'))}</div>
          <div class="grid g2">${ui.field("Due", ui.input("due", "", 'type="date"'))}${ui.field("Notes", ui.input("notes", "", 'maxlength="2000"'))}</div><div id="cl-err"></div><button class="btn primary" style="justify-self:start">${icon("plus")} Add task</button></form>`
        + ui.view(te, (rows) => (rows.length ? `<section class="card tight mt">${rows.map((t) => `<div class="lrow cl-task ${t.status}"><span class="itile sm ${t.status === "done" ? "green" : t.status === "doing" ? "blue" : "orange"}">${icon("clipboard")}</span><span class="body"><b>${esc(t.title)}</b><span>${esc(t.assignee_name || "Anyone")}${t.wing ? ` · ${esc(t.wing)}` : ""}${t.due ? ` · due ${ui.dateShort(t.due)}` : ""}</span></span>
            ${ui.select(`st-${t.id}`, { todo: "To do", doing: "Doing", done: "Done" }, t.status, `data-task="${t.id}" aria-label="Status"`)}<button class="btn sm ghost icon-only" data-td="${t.id}" aria-label="Delete">${icon("trash", "sm")}</button></div>`).join("")}</section>` : ""));
    },
    mount(el, club) {
      kit.$("#tk-form", el)?.addEventListener("submit", async (e) => {
        e.preventDefault(); const v = ui.values(e.target);
        try { await api.addTask({ club_id: club.id, title: v.title.trim(), assignee: v.assignee || null, wing: v.wing || "", due: v.due || null, notes: String(v.notes || "").trim() }); e.target.reset(); store.invalidate(`club:tasks:${club.id}`); } catch (err) { ui.fail(e.target, err.message); }
      });
      kit.$$("[data-task]", el).forEach((s) => s.addEventListener("change", async () => { try { await api.updateTask(s.dataset.task, { status: s.value }); store.invalidate(`club:tasks:${club.id}`); } catch (err) { kit.toast(err.message, "error"); } }));
      kit.$$("[data-td]", el).forEach((b) => b.addEventListener("click", async () => { try { await api.deleteTask(b.dataset.td); store.invalidate(`club:tasks:${club.id}`); } catch (err) { kit.toast(err.message, "error"); } }));
    } };

  /* ═════════ Documents ═════════ */
  const docs = { label: "Documents", icon: "file", group: "Activities", perm: "docs.manage",
    render(club) {
      const de = store.use(`club:docs:${club.id}`, () => api.docs(club.id), { ttl: 30e3 });
      return kit.head("Documents", "Constitution, minutes, templates. Add a Google Drive link or upload a file (PDF, Word, PowerPoint, Excel, images, up to 10 MB).")
        + `<form id="dc-form" class="card stack"><div class="grid g2">${ui.field("Title", ui.input("title", "", 'required maxlength="140"'))}${ui.field("Who can see it", ui.select("audience", { members: "All members", exec: "Executives only" }))}</div>
          ${ui.field("Link (optional)", ui.input("url", "", 'type="url" placeholder="https://drive.google.com/…"'))}<div class="row" style="gap:8px"><button class="btn primary">${icon("link")} Add link</button><button type="button" class="btn outline" id="dc-up">${icon("upload")} Upload a file</button></div><div id="cl-err"></div></form>`
        + ui.view(de, (rows) => (rows.length ? `<section class="card tight mt">${rows.map((d) => `<div class="lrow"><span class="itile sm blue">${icon(d.path ? "file" : "link")}</span><span class="body"><b>${esc(d.title)}</b><span>${d.audience === "exec" ? "Executives" : "Members"} · ${ui.ago(d.created_at)}</span></span><button class="btn sm ghost icon-only" data-dd="${d.id}" aria-label="Delete">${icon("trash", "sm")}</button></div>`).join("")}</section>` : ""));
    },
    mount(el, club) {
      const f = kit.$("#dc-form", el); if (!f) return;
      const add = async (row) => { try { await api.addDoc({ club_id: club.id, ...row }); f.reset(); store.invalidate(`club:docs:${club.id}`); kit.toast("Added", "success"); } catch (err) { ui.fail(f, err.message); } };
      f.addEventListener("submit", (e) => { e.preventDefault(); const v = ui.values(f); if (String(v.title).trim().length < 2 || !/^https:\/\//.test(v.url)) return ui.fail(f, "Add a title and an https:// link."); add({ title: v.title.trim(), url: v.url.trim(), audience: v.audience }); });
      kit.$("#dc-up", el).addEventListener("click", async (e) => {
        const v = ui.values(f); if (String(v.title).trim().length < 2) return ui.fail(f, "Add a title first.");
        const file = await ui.pickFile(".pdf,.docx,.pptx,.xlsx,image/*"); if (!file) return;
        if (file.size > 10 * 1024 * 1024) return ui.fail(f, "Files up to 10 MB.");
        kit.ctx.busy(e.currentTarget || kit.$("#dc-up", el), true, "Uploading…");
        try { await add({ title: v.title.trim(), path: await api.uploadPrivate(club.id, "docs", file), audience: v.audience }); } catch (err) { ui.fail(f, err.message); }
        kit.ctx.busy(kit.$("#dc-up", el), false);
      });
      kit.$$("[data-dd]", el).forEach((b) => b.addEventListener("click", async () => { try { await api.deleteDoc(b.dataset.dd); store.invalidate(`club:docs:${club.id}`); } catch (err) { kit.toast(err.message, "error"); } }));
    } };

  /* ═════════ Certificates ═════════ */
  const certs = { label: "Certificates", icon: "award", group: "Activities", perm: "certs.issue",
    render(club) {
      const ce = store.use(`club:certs:${club.id}`, () => api.certs(club.id), { ttl: 30e3 }), forms = store.use(`club:forms:${club.id}`, () => api.forms(club.id), { ttl: 60e3 }).value || [];
      const ses = store.use(`club:sessions:${club.id}`, () => api.sessions(club.id), { ttl: 60e3 }).value || [];
      return kit.head("Certificates", "Issue participation or volunteer certificates. Each person gets a message and can save theirs from Me → Certificates. Each has an ID anyone can check.")
        + `<form id="ce-form" class="card stack"><div class="grid g2">${ui.field("Certificate", ui.select("title", ["Certificate of Participation", "Certificate of Appreciation", "Certificate of Achievement", "Certificate of Volunteering", "Certificate of Completion"]))}${ui.field("For (event)", ui.input("event", "", 'maxlength="140" placeholder="e.g. Robotics Workshop 2026"'))}</div>
          ${ui.field("Who gets it", ui.select("source", [["", "Choose…"], ...ses.map((s) => [`s:${s.id}`, `Everyone present at: ${s.title}`]), ...forms.map((f) => [`f:${f.id}`, `Accepted / checked in on: ${f.title}`]), ["members", "All active members"]]))}
          ${ui.field("Signed by", ui.input("signer", "", 'maxlength="120" placeholder="e.g. Ayesha Rahman, President"'))}<div id="cl-err"></div><button class="btn primary" style="justify-self:start">${icon("award")} Issue certificates</button></form>`
        + ui.view(ce, (rows) => (rows.length ? `<h2 class="cl-h2">Issued (${rows.length})</h2><section class="card tight">${rows.slice(0, 200).map((c) => `<div class="lrow"><span class="itile sm purple">${icon("award")}</span><span class="body"><b>${esc(c.recipient)}</b><span>${esc(c.title)}${c.event ? ` · ${esc(c.event)}` : ""} · ${esc(c.code)}</span></span><button class="btn sm ghost icon-only" data-cr="${c.id}" aria-label="Withdraw">${icon("trash", "sm")}</button></div>`).join("")}</section>` : ""));
    },
    mount(el, club) {
      kit.$("#ce-form", el)?.addEventListener("submit", async (e) => {
        e.preventDefault(); const v = ui.values(e.target), btn = e.target.querySelector("button.primary");
        if (!v.source) return ui.fail(e.target, "Choose who gets a certificate.");
        kit.ctx.busy(btn, true, "Issuing…");
        try {
          let people = [];
          if (v.source === "members") people = (await store.fetch(`club:members:${club.id}`, () => api.members(club.id))).filter((m) => m.status === "active").map((m) => ({ user_id: m.user_id, recipient: m.display_name }));
          else if (v.source.startsWith("s:")) { const att = await api.attendance(club.id), ms = await store.fetch(`club:members:${club.id}`, () => api.members(club.id)); people = att.filter((a) => a.session_id === v.source.slice(2)).map((a) => ({ user_id: a.user_id, recipient: ms.find((m) => m.user_id === a.user_id)?.display_name || "Member" })); }
          else people = (await api.responses(v.source.slice(2))).filter((r) => r.status === "accepted" || r.checked_in_at).map((r) => ({ user_id: r.user_id, recipient: r.name }));
          const already = new Set((store.peek(`club:certs:${club.id}`) || []).filter((c) => c.title === v.title && c.event === v.event.trim()).map((c) => c.user_id));
          people = people.filter((p) => p.recipient && !already.has(p.user_id));
          if (!people.length) { kit.ctx.busy(btn, false); return ui.fail(e.target, "Nobody new to give it to."); }
          await api.issueCerts(people.map((p) => ({ ...p, club_id: club.id, title: v.title, event: v.event.trim(), signer: v.signer.trim() })));
          kit.ctx.busy(btn, false); store.invalidate(`club:certs:${club.id}`); kit.toast(`${ui.plural(people.length, "certificate")} issued`, "success", "Each person got a message in the app.");
        } catch (err) { kit.ctx.busy(btn, false); ui.fail(e.target, err.message); }
      });
      kit.$$("[data-cr]", el).forEach((b) => b.addEventListener("click", () => kit.ctx.confirmModal("Withdraw this certificate?", "Its ID will no longer check out as real.", "Withdraw", async () => { await api.revokeCert(b.dataset.cr); store.invalidate(`club:certs:${club.id}`); }, true)));
    } };

  /* ═════════ Finance log ═════════ */
  const finance = { label: "Finance log", icon: "wallet", group: "Admin", perm: "finance.view",
    render(club, m) {
      const fe = store.use(`club:finance:${club.id}`, () => api.finance(club.id), { ttl: 30e3 }), edit = has(m, "finance.edit");
      return kit.head("Finance log", "Keep track of income and expenses with receipts. Record keeping only: no money moves through EWUdiots.")
        + (edit ? `<form id="fn-form" class="card stack"><div class="grid g2">${ui.field("Kind", ui.select("kind", { expense: "Expense", income: "Income" }))}${ui.field("Amount (৳)", ui.input("amount", "", 'type="number" min="1" step="0.01" required'))}</div>
            <div class="grid g2">${ui.field("Category", ui.input("category", "", 'maxlength="40" list="fn-cats" placeholder="Printing, Food, Sponsorship…"'))}${ui.field("Date", ui.input("on_date", new Date().toLocaleDateString("en-CA"), 'type="date"'))}</div><datalist id="fn-cats">${["Sponsorship", "Registration fees", "Printing", "Food", "Venue", "Prizes", "Transport", "Decoration", "Other"].map((c) => `<option value="${c}">`).join("")}</datalist>
            ${ui.field("Note", ui.input("note", "", 'maxlength="300"'))}<div class="row" style="gap:8px"><button class="btn primary">${icon("plus")} Add</button><button type="button" class="btn outline" id="fn-receipt">${icon("image")} Add with receipt</button></div><div id="cl-err"></div></form>` : "")
        + ui.view(fe, (rows) => {
          const sum = (k) => rows.filter((r) => r.kind === k).reduce((a, r) => a + Number(r.amount), 0), money = (n) => `৳${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
          return `<div class="cl-kpis mt">${[["up", "green", money(sum("income")), "Income"], ["download", "red", money(sum("expense")), "Expenses"], ["wallet", "purple", money(sum("income") - sum("expense")), "Balance"]].map(([ic, t, n, l]) => `<div class="cl-kpi"><span class="itile ${t}">${icon(ic)}</span><b class="num">${n}</b><span>${l}</span></div>`).join("")}</div>
            ${rows.length ? `<section class="card tight mt">${rows.map((r) => `<div class="lrow"><span class="itile sm ${r.kind === "income" ? "green" : "red"}">${icon(r.kind === "income" ? "up" : "download")}</span><span class="body"><b>${r.kind === "income" ? "+" : "−"}${money(Number(r.amount))} · ${esc(r.category)}</b><span>${ui.dateShort(r.on_date)}${r.note ? ` · ${esc(r.note)}` : ""}</span></span>${r.receipt_path ? `<button class="btn sm ghost icon-only" data-rc="${esc(r.receipt_path)}" aria-label="Receipt">${icon("receipt", "sm")}</button>` : ""}${edit ? `<button class="btn sm ghost icon-only" data-fd="${r.id}" aria-label="Delete">${icon("trash", "sm")}</button>` : ""}</div>`).join("")}</section>` : ""}`;
        });
    },
    mount(el, club) {
      const f = kit.$("#fn-form", el);
      const add = async (receipt) => {
        const v = ui.values(f); if (!(Number(v.amount) > 0)) return ui.fail(f, "Enter an amount.");
        try { await api.addFinance({ club_id: club.id, kind: v.kind, amount: Number(v.amount), category: String(v.category || "Other").trim() || "Other", note: String(v.note || "").trim(), on_date: v.on_date || undefined, receipt_path: receipt || "" }); f.reset(); store.invalidate(`club:finance:${club.id}`); } catch (err) { ui.fail(f, err.message); }
      };
      f?.addEventListener("submit", (e) => { e.preventDefault(); add(""); });
      kit.$("#fn-receipt", el)?.addEventListener("click", async () => { const file = await ui.pickFile("image/*,.pdf"); if (!file) return; try { add(await api.uploadPrivate(club.id, "receipts", file.type.startsWith("image/") ? await ui.shrink(file) : file)); } catch (err) { ui.fail(f, err.message); } });
      kit.$$("[data-rc]", el).forEach((b) => b.addEventListener("click", async () => { try { window.open(await api.signedUrl(b.dataset.rc), "_blank", "noopener"); } catch (err) { kit.toast(err.message, "error"); } }));
      kit.$$("[data-fd]", el).forEach((b) => b.addEventListener("click", async () => { try { await api.deleteFinance(b.dataset.fd); store.invalidate(`club:finance:${club.id}`); } catch (err) { kit.toast(err.message, "error"); } }));
    } };

  return { attendance, polls, tasks, docs, certs, finance };
}
