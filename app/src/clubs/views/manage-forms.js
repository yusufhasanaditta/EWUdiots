/* Console sections for forms: the builder (templates, questions, deadline, limit + waitlist, phone, fee, tickets)
   and the responses dashboard (counts, sign-ups per day, departments, filters, bulk review, interview times,
   payment checks, door check-in by ticket code and a CSV export that is written to the audit log). */
import { FIELD_TYPES, FORM_KINDS, STATUSES, template, cleanFields, newField, summarize, toCSV, openState, deptFromId } from "../forms.js";
import { has } from "../perms.js";

const toLocal = (iso) => { if (!iso) return ""; const d = new Date(iso); return new Date(d.getTime() - d.getTimezoneOffset() * 60e3).toISOString().slice(0, 16); };

/** @param {any} kit */
export function formSections(kit) {
  const { ui, icon, esc, api, store } = kit;

  /* ═════════ Forms list + builder ═════════ */
  const forms = { label: "Forms", icon: "edit", group: "Content", perm: "forms.create",
    render(club) {
      const edit = kit.param("edit"), isNew = kit.param("new") === "1";
      if (edit || isNew) return builder(club, edit);
      const fe = store.use(`club:forms:${club.id}`, () => api.forms(club.id), { ttl: 20e3 });
      return kit.head("Forms", "Recruitment, event registration, competitions, volunteers and surveys.", `<a class="btn primary" href="#/club/manage?c=${club.id}&tab=forms&new=1">${icon("plus")} New form</a>`)
        + ui.view(fe, (rows) => (rows.length ? `<div class="stack">${rows.map((f) => { const st = openState(f); return `<article class="card cl-formrow"><div class="row nowrap" style="gap:10px"><span class="itile ${f.status === "open" && st.open ? "green" : f.status === "draft" ? "orange" : "gray"}">${icon("edit")}</span>
            <div class="grow min0"><b class="ellipsis" style="display:block">${esc(f.title)}</b><span class="xs">${esc(FORM_KINDS[f.kind])} · ${f.status === "draft" ? "Draft" : st.open ? "Open" : esc(st.why)}${f.settings?.deadline ? ` · until ${ui.dateShort(f.settings.deadline)}` : ""}${f.settings?.limit ? ` · ${f.settings.limit} places` : ""}</span></div></div>
            <div class="row mt-s" style="gap:6px">${has(kit.membership(club.id), "forms.view_responses") ? `<a class="btn sm primary" href="#/club/manage?c=${club.id}&tab=responses&form=${f.id}">${icon("users", "sm")} Responses</a>` : ""}
              <a class="btn sm outline" href="#/club/manage?c=${club.id}&tab=forms&edit=${f.id}">${icon("edit", "sm")} Edit</a>
              ${f.status !== "open" ? `<button class="btn sm ghost" data-fs="${f.id}" data-to="open">${icon("play", "sm")} Open</button>` : `<button class="btn sm ghost" data-fs="${f.id}" data-to="closed">${icon("lock", "sm")} Close</button>`}
              <button class="btn sm ghost" data-fl="${f.id}">${icon("link", "sm")} Copy link</button><button class="btn sm ghost icon-only" data-fd="${f.id}" aria-label="Delete">${icon("trash", "sm")}</button></div></article>`; }).join("")}</div>`
          : ui.emptyBox("edit", "No forms yet", "Start from a template: membership recruitment, event registration, competition, volunteers or a survey.", `<a class="btn primary" href="#/club/manage?c=${club.id}&tab=forms&new=1">${icon("plus")} New form</a>`)));
    },
    mount(el, club) {
      if (kit.param("edit") || kit.param("new") === "1") return mountBuilder(el, club);
      kit.$$("[data-fs]", el).forEach((b) => b.addEventListener("click", async () => { try { await api.updateForm(b.dataset.fs, { status: b.dataset.to }); store.invalidate(`club:forms:${club.id}`, "forms:open", `form:${b.dataset.fs}`); kit.toast(b.dataset.to === "open" ? "Form is open" : "Form closed", "success"); } catch (err) { kit.toast(err.message, "error"); } }));
      kit.$$("[data-fl]", el).forEach((b) => b.addEventListener("click", () => { const url = `${kit.ctx.SITE}/app.html#/club/form?id=${b.dataset.fl}`; navigator.clipboard?.writeText(url).then(() => kit.toast("Link copied", "success", "Share it in your Facebook group or WhatsApp."), () => kit.toast(url, "info")); }));
      kit.$$("[data-fd]", el).forEach((b) => b.addEventListener("click", () => kit.ctx.confirmModal("Delete this form?", "All its responses are deleted too. This can't be undone.", "Delete", async () => { await api.deleteForm(b.dataset.fd); store.invalidate(`club:forms:${club.id}`, "forms:open"); }, true)));
    } };

  /* The builder keeps a working copy; structural changes redraw only the question list. */
  let draft = null;
  function builder(club, id) {
    if (id) {
      const fe = store.use(`form:${id}`, () => api.form(id), { ttl: 5 * 60e3 });
      if (fe.loading && !fe.value) return ui.skeleton(2, 160);
      if (!fe.value) return ui.emptyBox("search", "Form not found", "");
      if (!draft || draft.id !== id) draft = structuredClone({ ...fe.value, clubs: undefined, fields: cleanFields(fe.value.fields) });
    } else if (!draft || draft.id) draft = { kind: "membership", title: "", description: "", audience: "everyone", status: "draft", fields: template("membership", club.wings), settings: { collectPhone: true, waitlist: false } };
    const s = draft.settings || {};
    return `${kit.back(`#/club/manage?c=${club.id}&tab=forms`, "All forms")}${kit.head(id ? "Edit form" : "New form", "Name, student ID and email are added from each person's account. You only ask for the rest.")}
      <form id="fb-form" class="stack" novalidate>
        <section class="card stack">${!id ? ui.field("Start from", ui.select("kind", FORM_KINDS, draft.kind), "Changing it replaces the questions with that template.") : ui.field("Kind", ui.select("kind", FORM_KINDS, draft.kind))}
          ${ui.field("Title", ui.input("title", draft.title, 'required maxlength="140" placeholder="e.g. Robotics Club Recruitment, Fall 2026"'))}
          ${ui.field("Description", ui.area("description", draft.description, 'rows="3" maxlength="3000" placeholder="What it\'s for, important dates, what happens next"'))}
          ${ui.field("Who can fill it in", ui.select("audience", { everyone: "Every EWUdiots user", members: "Club members only" }, draft.audience))}</section>
        <section class="card stack"><h2>Settings</h2>
          <div class="grid g2">${ui.field("Deadline (optional)", ui.input("deadline", toLocal(s.deadline), 'type="datetime-local"'))}${ui.field("Limit (optional)", ui.input("limit", s.limit || "", 'type="number" min="1" max="20000" placeholder="e.g. 50"'))}</div>
          ${ui.toggle("waitlist", s.waitlist, "Waitlist when full", "Extra people are waitlisted instead of turned away.")}
          ${ui.toggle("collectPhone", s.collectPhone, "Ask for a mobile number", "Only people with the responses permission can see numbers.")}
          ${ui.toggle("allowEdit", s.allowEdit, "Let people edit their answers", "While their response is pending.")}
          ${ui.toggle("ticket", s.ticket ?? ["event", "competition"].includes(draft.kind), "Give each person a QR ticket", "Check people in at the door from Responses.")}
          <div class="grid g2">${ui.field("Fee in taka (optional)", ui.input("fee", s.fee || "", 'type="number" min="0" placeholder="0"'))}${ui.field("How to pay", ui.input("feeNote", s.feeNote, 'maxlength="200" placeholder="bKash 01XXXXXXXXX (Personal), reference: your ID"'))}</div>
          ${ui.field("Message after sending (optional)", ui.area("confirmMsg", s.confirmMsg, 'rows="2" maxlength="600" placeholder="e.g. Interviews are on 12–14 Nov. We\'ll message you a time."'))}</section>
        <section class="card stack"><div class="card-h"><h2>Questions</h2><span class="xs" id="fb-count"></span></div><div id="fb-fields" class="stack"></div>
          <div class="cl-addq">${Object.entries(FIELD_TYPES).map(([t, x]) => `<button type="button" class="chip" data-addq="${t}">${icon(x.icon, "sm")} ${x.label}</button>`).join("")}</div></section>
        <div id="cl-err"></div>
        <div class="row cl-sticky" style="gap:8px"><button class="btn primary grow" data-save="open">${icon("play")} Save &amp; open</button><button class="btn neutral" data-save="draft">${id && draft.status !== "draft" ? "Save" : "Save draft"}</button></div></form>`;
  }

  const fieldCard = (x, i, n) => `<div class="cl-q" data-q="${i}"><div class="row nowrap" style="gap:8px"><span class="cl-q-n">${i + 1}</span>${ui.select(`type_${i}`, Object.fromEntries(Object.entries(FIELD_TYPES).map(([k, t]) => [k, t.label])), x.type, 'data-qtype aria-label="Question type"')}
      <span class="push row nowrap" style="gap:4px"><button type="button" class="btn sm ghost icon-only" data-mv="${i}" data-d="-1" ${i === 0 ? "disabled" : ""} aria-label="Move up">${icon("up", "sm")}</button><button type="button" class="btn sm ghost icon-only" data-mv="${i}" data-d="1" ${i === n - 1 ? "disabled" : ""} aria-label="Move down"><span class="flip">${icon("up", "sm")}</span></button><button type="button" class="btn sm ghost icon-only" data-rmq="${i}" aria-label="Delete question">${icon("trash", "sm")}</button></span></div>
    ${ui.input(`label_${i}`, x.label, `maxlength="200" placeholder="${x.type === "note" ? "Text to show" : "Question"}" aria-label="Question"`)}
    ${FIELD_TYPES[x.type].options ? `${ui.area(`opts_${i}`, (x.options || []).join("\n"), 'rows="3" placeholder="One option per line" aria-label="Options"')}` : ""}
    ${x.type !== "note" ? `<div class="row" style="gap:12px">${ui.toggle(`req_${i}`, x.required, "Required")}${["text", "long"].includes(x.type) ? ui.input(`max_${i}`, x.max || "", 'type="number" min="1" max="4000" placeholder="Max length" style="max-width:140px" aria-label="Max length"') : ""}</div>` : ""}</div>`;

  const readSettings = (v) => ({ deadline: v.deadline ? new Date(v.deadline).toISOString() : "", limit: v.limit ? Number(v.limit) : null, waitlist: !!v.waitlist, collectPhone: !!v.collectPhone, allowEdit: !!v.allowEdit, ticket: !!v.ticket,
    fee: v.fee ? Number(v.fee) : null, feeNote: String(v.feeNote || "").trim(), confirmMsg: String(v.confirmMsg || "").trim() });
  function mountBuilder(el, club) {
    const f = kit.$("#fb-form", el); if (!f || !draft) return;
    const box = kit.$("#fb-fields", el);
    const sync = () => {
      draft.fields = draft.fields.map((x, i) => ({ ...x, type: f[`type_${i}`]?.value || x.type, label: f[`label_${i}`]?.value ?? x.label, required: f[`req_${i}`]?.checked ?? x.required,
        options: f[`opts_${i}`] ? f[`opts_${i}`].value.split("\n").map((o) => o.trim()).filter(Boolean) : x.options, max: f[`max_${i}`]?.value ? Number(f[`max_${i}`].value) : undefined }));
    };
    const draw = () => {
      box.innerHTML = draft.fields.map((x, i) => fieldCard(x, i, draft.fields.length)).join("") || `<p class="small muted">No questions: people will only send their name, ID and email.</p>`;
      kit.$("#fb-count", el).textContent = ui.plural(draft.fields.length, "question");
      kit.$$("[data-qtype]", box).forEach((s) => s.addEventListener("change", () => { sync(); const i = Number(s.closest("[data-q]").dataset.q); if (FIELD_TYPES[draft.fields[i].type].options && !draft.fields[i].options?.length) draft.fields[i].options = ["Option 1", "Option 2"]; draw(); }));
      kit.$$("[data-mv]", box).forEach((b) => b.addEventListener("click", () => { sync(); const i = Number(b.dataset.mv), j = i + Number(b.dataset.d); [draft.fields[i], draft.fields[j]] = [draft.fields[j], draft.fields[i]]; draw(); }));
      kit.$$("[data-rmq]", box).forEach((b) => b.addEventListener("click", () => { sync(); draft.fields.splice(Number(b.dataset.rmq), 1); draw(); }));
    };
    draw();
    f.addEventListener("input", () => { sync(); const v = ui.values(f); Object.assign(draft, { title: v.title, description: v.description, audience: v.audience, settings: readSettings(v) }); });
    kit.$$("[data-addq]", el).forEach((b) => b.addEventListener("click", () => { sync(); if (draft.fields.length >= 40) return kit.toast("Up to 40 questions", "warn"); draft.fields.push(newField(b.dataset.addq)); draw(); box.lastElementChild?.querySelector("input")?.select(); }));
    if (!draft.id) f.kind.addEventListener("change", () => { sync(); draft.kind = f.kind.value; draft.fields = template(draft.kind, club.wings); if (f.ticket) f.ticket.checked = ["event", "competition"].includes(draft.kind); draw(); });
    kit.$$("[data-save]", el).forEach((b) => b.addEventListener("click", async (e) => {
      e.preventDefault(); sync(); const v = ui.values(f);
      if (String(v.title).trim().length < 3) return ui.fail(f, "Give the form a title.");
      const fields = cleanFields(draft.fields);
      if (fields.length < draft.fields.filter((x) => x.label?.trim()).length) return ui.fail(f, "Choice questions need at least 2 options.");
      const settings = readSettings(v);
      const row = { kind: v.kind, title: v.title.trim(), description: String(v.description || "").trim(), audience: v.audience, fields, settings, status: b.dataset.save === "open" ? "open" : draft.id ? draft.status : "draft" };
      kit.ctx.busy(b, true, "Saving…");
      try {
        const saved = await (draft.id ? api.updateForm(draft.id, row) : api.createForm({ ...row, club_id: club.id }));
        draft = null; store.invalidate(`club:forms:${club.id}`, "forms:open", `form:${saved.id}`);
        kit.toast(row.status === "open" ? "Form is open" : "Saved", "success", row.status === "open" ? "Copy its link from the list to share it." : "");
        kit.go(`#/club/manage?c=${club.id}&tab=forms`);
      } catch (err) { kit.ctx.busy(b, false); ui.fail(f, err.message); }
    }));
  }

  /* ═════════ Responses dashboard ═════════ */
  let filter = "all", q = "", picked = new Set();
  const responses = { label: "Responses", icon: "users", group: "Content", perm: "forms.view_responses",
    render(club, m) {
      const fl = store.use(`club:forms:${club.id}`, () => api.forms(club.id), { ttl: 30e3 });
      return ui.view(fl, (list) => {
        if (!list.length) return kit.head("Responses", "") + ui.emptyBox("users", "No forms yet", "Create a form first, then responses arrive here.", `<a class="btn primary" href="#/club/manage?c=${club.id}&tab=forms&new=1">New form</a>`);
        const fid = list.some((f) => f.id === kit.param("form")) ? kit.param("form") : list[0].id, raw = list.find((f) => f.id === fid), form = { ...raw, fields: cleanFields(raw.fields) };
        const re = store.use(`club:responses:${fid}`, () => api.responses(fid), { ttl: 15e3 });
        return `${kit.head("Responses", "Everyone who filled in your form, with their phone numbers. Review them one by one or in bulk.", `${has(m, "forms.export") ? `<button class="btn outline sm" id="rs-csv">${icon("download", "sm")} Export CSV</button>` : ""}`)}
          ${ui.field("Form", ui.select("form", list.map((f) => [f.id, `${f.title} (${FORM_KINDS[f.kind]})`]), fid, 'id="rs-form"'))}
          ${ui.view(re, (rows) => dashboard(club, form, rows, m), { n: 3, h: 80 })}`;
      });
    },
    mount(el, club) {
      kit.$("#rs-form", el)?.addEventListener("change", (e) => { picked = new Set(); kit.go(`#/club/manage?c=${club.id}&tab=responses&form=${e.target.value}`); });
      const fid = kit.$("#rs-form", el)?.value, raw = (store.peek(`club:forms:${club.id}`) || []).find((f) => f.id === fid), rows = store.peek(`club:responses:${fid}`) || [];
      if (!raw) return;
      const form = { ...raw, fields: cleanFields(raw.fields) };
      const refresh = () => store.invalidate(`club:responses:${fid}`, `form:count:${fid}`);
      kit.$$("[data-rf]", el).forEach((b) => b.addEventListener("click", () => { filter = b.dataset.rf; picked = new Set(); kit.ctx.rerender(); }));
      const input = kit.$("#rs-q", el); input?.addEventListener("input", () => { q = input.value; kit.ctx.rerender(); const i = kit.$("#rs-q"); i?.focus(); i?.setSelectionRange(q.length, q.length); });
      kit.$$("[data-pick]", el).forEach((c) => c.addEventListener("change", () => { c.checked ? picked.add(c.dataset.pick) : picked.delete(c.dataset.pick); kit.ctx.rerender(); }));
      kit.$("#rs-all", el)?.addEventListener("change", (e) => { kit.$$("[data-pick]", el).forEach((c) => { c.checked = e.target.checked; e.target.checked ? picked.add(c.dataset.pick) : picked.delete(c.dataset.pick); }); kit.ctx.rerender(); });
      kit.$$("[data-bulk]", el).forEach((b) => b.addEventListener("click", async () => {
        const ids = [...picked]; if (!ids.length) return;
        kit.ctx.busy(b, true, "Saving…");
        try { await api.review(ids, { status: b.dataset.bulk }); picked = new Set(); refresh(); kit.toast(`${ui.plural(ids.length, "response")} → ${STATUSES[b.dataset.bulk][0]}`, "success", "Each person gets a message in the app."); } catch (err) { kit.ctx.busy(b, false); kit.toast(err.message, "error"); }
      }));
      kit.$$("[data-open]", el).forEach((b) => b.addEventListener("click", () => detail(club, form, rows.find((r) => r.id === b.dataset.open), refresh)));
      kit.$("#rs-csv", el)?.addEventListener("click", async () => {
        const shown = visible(rows);
        try { await api.logExport(club.id, form.title, shown.length); } catch (err) { return kit.toast(err.message, "error"); }
        ui.download(`${club.slug}-${form.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}.csv`, toCSV(form, shown), "text/csv");
        kit.toast("Exported", "success", "The export is recorded in the club's audit log.");
      });
      kit.$("#rs-door", el)?.addEventListener("submit", async (e) => {
        e.preventDefault(); const code = e.target.code.value.trim(); if (!code) return;
        try { const r = await api.checkInTicket(form.id, code); e.target.reset(); refresh(); kit.toast(`${r.name} checked in`, "success", r.checked_in_at ? `at ${ui.dateTime(r.checked_in_at)}` : ""); } catch (err) { kit.toast(err.message, "error"); }
      });
    } };

  const visible = (rows) => rows.filter((r) => (filter === "all" || r.status === filter || (filter === "in" && r.checked_in_at)) && (!q || `${r.name} ${r.student_id} ${r.email} ${r.phone} ${r.department} ${r.ticket}`.toLowerCase().includes(q.toLowerCase())));

  function dashboard(club, form, rows, m) {
    const s = summarize(rows), list = visible(rows), maxDay = Math.max(1, ...s.perDay.map((d) => d.n));
    const depts = Object.entries(s.department).sort((a, b) => b[1] - a[1]).slice(0, 6), ticketed = form.settings?.ticket || ["event", "competition"].includes(form.kind);
    return `<div class="cl-kpis mt">${[["users", "purple", s.total, "Responses"], ["clock", "orange", s.status.pending || 0, "Pending"], ["checkc", "green", s.status.accepted || 0, "Accepted"], ...(form.settings?.limit ? [["layers", "blue", `${(s.status.pending || 0) + (s.status.accepted || 0) + (s.status.shortlisted || 0)}/${form.settings.limit}`, "Places"]] : []), ...(ticketed ? [["scan", "teal", s.checkedIn, "Checked in"]] : []), ...(form.settings?.fee ? [["wallet", "pink", s.paid, "Paid (checked)"]] : [])]
        .map(([ic, tone, n, l]) => `<div class="cl-kpi"><span class="itile ${tone}">${icon(ic)}</span><b class="num">${n}</b><span>${l}</span></div>`).join("")}</div>
      ${s.total ? `<div class="grid g2 mt"><section class="card"><h3>Sign-ups per day</h3><div class="cl-spark mt-s" role="img" aria-label="Responses per day">${s.perDay.slice(-21).map((d) => `<i style="height:${Math.max(6, (100 * d.n) / maxDay)}%" title="${d.day}: ${d.n}"></i>`).join("")}</div><p class="xs mt-s">${s.perDay.length ? `${s.perDay[0].day} → ${s.perDay[s.perDay.length - 1].day}` : ""}</p></section>
        <section class="card"><h3>Departments</h3><div class="stack mt-s" style="gap:6px">${depts.map(([k, n]) => `<div class="cl-bar"><div class="row between"><span class="small">${esc(k)}</span><b class="small num">${n}</b></div><i style="width:${(100 * n) / s.total}%"></i></div>`).join("")}</div></section></div>` : ""}
      ${ticketed && has(m, "attendance.take") ? `<form id="rs-door" class="card mt row nowrap" style="gap:8px"><span class="itile teal">${icon("scan")}</span><input class="input grow" name="code" placeholder="Ticket code at the door, e.g. 7F3A9C21" maxlength="12" autocomplete="off" style="text-transform:uppercase"><button class="btn primary">Check in</button></form>` : ""}
      <div class="row mt" style="gap:8px;flex-wrap:wrap"><div class="chips">${[["all", "All"], ...Object.entries(STATUSES).map(([k, [l]]) => [k, l]), ...(ticketed ? [["in", "Checked in"]] : [])].map(([v, l]) => `<button class="chip" data-rf="${v}" aria-pressed="${filter === v}">${l}${v !== "all" && v !== "in" && s.status[v] ? ` · ${s.status[v]}` : ""}</button>`).join("")}</div>
        <div class="searchbar grow" style="min-width:200px">${icon("search")}<input class="input" id="rs-q" type="search" placeholder="Name, ID, phone, ticket…" value="${esc(q)}"></div></div>
      ${picked.size ? `<div class="cl-bulk card mt row nowrap"><b>${picked.size} selected</b><span class="push row" style="gap:6px">${["shortlisted", "accepted", "waitlisted", "rejected"].map((k) => `<button class="btn sm ${k === "accepted" ? "primary" : k === "rejected" ? "danger-soft" : "neutral"}" data-bulk="${k}">${STATUSES[k][0]}</button>`).join("")}</span></div>` : ""}
      ${list.length ? `<section class="card pad0 mt"><div class="cl-table" role="table"><div class="cl-tr cl-th" role="row"><label class="cl-td chk"><input type="checkbox" id="rs-all" aria-label="Select all"></label><span class="cl-td">Name</span><span class="cl-td hide-s">ID · Dept</span><span class="cl-td hide-s">Phone</span><span class="cl-td">Status</span><span class="cl-td hide-s">Sent</span></div>
        ${list.map((r) => { const [l, tone] = STATUSES[r.status]; return `<div class="cl-tr" role="row"><label class="cl-td chk"><input type="checkbox" data-pick="${r.id}" ${picked.has(r.id) ? "checked" : ""} aria-label="Select ${esc(r.name)}"></label>
          <button class="cl-td cl-name-btn" data-open="${r.id}"><b class="ellipsis">${esc(r.name)}</b><span class="xs show-s">${esc(r.student_id)}${r.phone ? ` · ${esc(r.phone)}` : ""}</span></button>
          <span class="cl-td hide-s xs">${esc(r.student_id)}<br>${esc(r.department || deptFromId(r.student_id) || "—")}</span><span class="cl-td hide-s">${r.phone ? `<a href="tel:${esc(r.phone)}">${esc(r.phone)}</a>` : "—"}</span>
          <span class="cl-td">${ui.pill(l, tone)}${r.checked_in_at ? ` ${icon("checkc", "sm")}` : ""}${r.payment_verified ? ` ${icon("wallet", "sm")}` : ""}</span><span class="cl-td hide-s xs">${ui.ago(r.created_at)}</span></div>`; }).join("")}</div></section>`
        : ui.emptyBox("users", rows.length ? "Nobody matches" : "No responses yet", rows.length ? "Try another filter." : "Share the form's link to start getting sign-ups.")}`;
  }

  function detail(club, form, r, refresh) {
    if (!r) return;
    const qs = form.fields.filter((x) => x.type !== "note");
    ui.sheet(r.name, `<div class="stack">
      <div class="lrow"><span class="avatar sm">${esc(ui.initials(r.name))}</span><span class="body"><b>${esc(r.name)}</b><span>${esc(r.student_id)} · ${esc(r.email)}</span></span>${ui.pill(...STATUSES[r.status])}</div>
      <div class="row" style="gap:8px">${r.phone ? `<a class="btn sm outline" href="tel:${esc(r.phone)}">${icon("phone", "sm")} ${esc(r.phone)}</a><a class="btn sm ghost" href="https://wa.me/${esc(r.phone.replace(/^\+?(88)?0/, "880"))}" target="_blank" rel="noopener noreferrer">WhatsApp</a>` : ""}<a class="btn sm ghost" href="mailto:${esc(r.email)}">${icon("mail", "sm")} Email</a></div>
      <section class="card soft stack" style="gap:10px">${qs.map((x) => `<div><span class="xs">${esc(x.label)}</span><p>${r.answers?.[x.id] == null || r.answers[x.id] === "" ? '<span class="muted">—</span>' : ui.rich(Array.isArray(r.answers[x.id]) ? r.answers[x.id].join(", ") : String(r.answers[x.id]))}</p></div>`).join("") || '<p class="small muted">No questions on this form.</p>'}
        ${r.department ? `<div><span class="xs">Department</span><p>${esc(r.department)}</p></div>` : ""}${r.payment_ref ? `<div><span class="xs">Payment reference</span><p><b>${esc(r.payment_ref)}</b></p></div>` : ""}${r.ticket ? `<div><span class="xs">Ticket</span><p><b>${esc(r.ticket)}</b>${r.checked_in_at ? ` · checked in ${ui.dateTime(r.checked_in_at)}` : ""}</p></div>` : ""}
        <p class="xs">Sent ${ui.dateTime(r.created_at)}</p></section>
      <form id="rv-form" class="stack">${ui.field("Private note (only the club sees it)", ui.area("note", r.note, 'rows="2" maxlength="500"'))}
        ${form.kind === "membership" ? ui.field("Interview time (optional)", ui.input("interview", toLocal(r.interview_at), 'type="datetime-local"'), "They get a message with the time when you shortlist them.") : ""}
        ${r.payment_ref ? ui.toggle("paid", r.payment_verified, "Payment checked", "You found this transaction in the club's bKash/Nagad.") : ""}
        <div id="cl-err"></div><div class="cl-status-btns">${Object.entries(STATUSES).map(([k, [l]]) => `<button class="btn sm ${k === r.status ? "primary" : "neutral"}" data-rs="${k}">${l}</button>`).join("")}</div>
        <p class="xs">${form.kind === "membership" ? "Accepting makes them a General Member right away. " : ""}They get a message in the app when the status changes.</p></form></div>`, (sh) => {
      kit.$$("[data-rs]", sh).forEach((b) => b.addEventListener("click", async (e) => {
        e.preventDefault(); const v = ui.values(kit.$("#rv-form", sh));
        kit.ctx.busy(b, true, "");
        try { await api.review([r.id], { status: b.dataset.rs, note: String(v.note || ""), paid: r.payment_ref ? !!v.paid : null, interview: v.interview ? new Date(v.interview).toISOString() : null }); kit.ctx.closeModal(); refresh(); kit.toast("Saved", "success"); }
        catch (err) { kit.ctx.busy(b, false); ui.fail(sh, err.message); }
      }));
    });
  }

  return { forms, responses };
}
