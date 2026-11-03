/* Recruitment pipeline (#/club/recruit?form=…) and one applicant (#/club/applicant?id=…), from the "Recruitment
   Dashboard / Review" boards. Applications are a form's responses; organisers move them Pending → Shortlisted →
   Interview → Accepted (a membership form makes them a member) or Rejected, score them against a rubric
   (public.score_response, totals out of the rubric's maximum) and schedule interviews (public.set_interview).
   Phone numbers and emails are only here for people with forms.view_responses. */
import { STATUSES, toCSV, deptFromId } from "../forms.js";

const PIPE = { ...STATUSES, interview: ["Interview", "purple"] };
const DEFAULT_RUBRIC = [{ key: "motivation", label: "Motivation", max: 20 }, { key: "skills", label: "Relevant Skills", max: 20 }, { key: "portfolio", label: "Portfolio", max: 20 }, { key: "fit", label: "Overall Fit", max: 40 }];
const PAGE = 25;

/** @param {Record<string, any>} pages @param {any} kit */
export function register(pages, kit) {
  const { ui, icon, esc, api, store, ctx, charts } = kit;
  let tab = "applications", st = "all", q = "", page = 1, sel = new Set();
  const fl = { dept: "all", batch: "all", sort: "new" };
  /** Match = the rubric score as a share of the maximum; null until someone scores the application. */
  const matchOf = (r, max) => (r.score_total == null ? null : Math.round((Number(r.score_total) / (max || 100)) * 100));
  const formE = (fid) => store.use(`club:form:${fid}`, () => api.form(fid), { ttl: 60e3 });
  const respE = (fid) => store.use(`club:resp:${fid}`, () => api.responses(fid), { ttl: 20e3 });
  const rubricOf = (form) => (Array.isArray(form?.settings?.rubric) && form.settings.rubric.length ? form.settings.rubric : DEFAULT_RUBRIC);
  const maxOf = (form) => rubricOf(form).reduce((s, r) => s + Number(r.max || 0), 0) || 100;
  const prefOf = (form, r) => r.position_pref || (form.fields || []).filter((f) => /wing|team|position|role/i.test(f.label) && ["choice", "multi", "dropdown"].includes(f.type)).map((f) => r.answers?.[f.id]).flat().filter(Boolean).join(", ");

  pages["club/recruit"] = () => {
    const g = kit.gate("recruitment"); if (g) return g;
    const fid = kit.param("form");
    if (!fid) return pickForm();
    return ui.view(formE(fid), (form) => {
      if (!form || !kit.can(form.club_id, "forms.view_responses")) return ui.emptyBox("lock", "For the club's recruitment team", "Ask your club admin for the responses permission.");
      const re = respE(fid), rows = re.value || [], max = maxOf(form);
      const n = (s) => rows.filter((r) => r.status === s).length;
      const club = form.clubs || {};
      // "Recruitment Management" board: title, status chips with counts, the cycle card, tabs, then the tab's content.
      const create = kit.can(form.club_id, "forms.create") ? `<a class="btn primary" href="#/club/manage?c=${form.club_id}&tab=forms&new=1">${icon("plus")} Create New Recruitment</a>` : "";
      return `${kit.back("#/club/recruit", "All recruitment")}${ui.ph("Recruitment Management", "Manage applications for club recruitments, review candidates and select new members.", create)}
        <div class="rv-chips">${[["all", `All (${rows.length})`], ["pending", `Pending (${n("pending")})`], ["shortlisted", `Shortlisted (${n("shortlisted")})`], ["interview", `Interview (${n("interview")})`], ["accepted", `Selected (${n("accepted")})`], ["rejected", `Rejected (${n("rejected")})`]].map(([v, l]) => `<button data-st="${v}" aria-pressed="${st === v && tab === "applications"}">${l}</button>`).join("")}</div>
        <section class="rv-cycle card mt-s"><span class="rv-poster">${club.cover_url ? `<img src="${esc(club.cover_url)}" alt="" loading="lazy">` : `<b>${esc(form.title)}</b>`}</span>
          <div class="min0 grow"><b class="rv-title">${esc(form.title)}</b><span class="row nowrap" style="gap:6px">${ui.logo(club, "xs")} ${esc(club.name || "")}</span>
            <span class="xs">${icon("users", "sm")} ${ui.plural(rows.length, "Application")}</span>${form.settings?.deadline ? `<span class="xs">${icon("calendar", "sm")} Deadline: ${ui.dateShort(form.settings.deadline)}</span>` : ""}</div>
          <span class="rv-cside">${kit.can(form.club_id, "forms.create") ? `<a class="icon-btn" href="#/club/manage?c=${form.club_id}&tab=forms" aria-label="Edit this recruitment">${icon("more")}</a>` : ""}${ui.st(form.status === "open" ? ["Active", "green"] : form.status === "closed" ? ["Closed", "gray"] : ["Draft", "amber"])}</span></section>
        <nav class="cl-seg mt-s" role="tablist">${[["applications", "Applications"], ["interviews", "Interviews"], ["analytics", "Analytics"]].map(([v, l]) => `<a role="tab" href="#/club/recruit?form=${fid}&t=${v}" aria-selected="${tab === v}">${l}</a>`).join("")}
          ${kit.can(form.club_id, "forms.create") ? `<a role="tab" href="#/club/manage?c=${form.club_id}&tab=forms" aria-selected="false">Form &amp; Questions</a><a role="tab" href="#/club/manage?c=${form.club_id}&tab=forms" aria-selected="false">Settings</a>` : ""}</nav>
        ${re.loading && !re.value ? ui.skeleton(5, 70) : tab === "analytics" ? analytics(form, rows) : tab === "interviews" ? interviews(form, rows) : list(form, rows, max)}`;
    }, { n: 3, h: 120 });
  };
  // "Club Recruitment" board: totals across every cycle, a create button and the cycles as cards.
  let order = "new";
  function pickForm() {
    const clubs = kit.clubsWith("forms.view_responses");
    if (!clubs.length) return ui.emptyBox("lock", "For recruitment teams", "");
    const fe = store.use(`me:recforms:${clubs.map((c) => c.club_id).join(",")}`, async () => (await Promise.all(clubs.map((c) => api.recruitForms(c.club_id)))).flat(), { ttl: 60e3 });
    const maker = kit.clubsWith("forms.create")[0];
    const create = maker ? `#/club/manage?c=${maker.club_id}&tab=forms&new=1` : "";
    return ui.ph("Club Recruitment", "Create, manage, and track your recruitment cycles") + ui.view(fe, (forms) => {
      const all = forms.flatMap((f) => f.form_responses || []), n = (s) => all.filter((r) => r.status === s).length;
      const list = [...forms].sort((a, b) => (order === "new" ? 1 : -1) * (new Date(b.created_at) - new Date(a.created_at)) || 0);
      if (order === "most") list.sort((a, b) => (b.form_responses?.length || 0) - (a.form_responses?.length || 0));
      const ST = { open: ["Active", "blue"], closed: ["Closed", "gray"], draft: ["Draft", "amber"] };
      return `<div class="cl-stats">${ui.stat("users", "blue", all.length, "Total Applications")}${ui.stat("clock", "green", n("pending"), "Under Review")}${ui.stat("file", "red", n("shortlisted") + n("interview"), "Shortlisted")}${ui.stat("checkc", "green", n("accepted"), "Selected")}</div>
        ${create ? `<a class="btn primary block mt" href="${create}">${icon("plus")} Create New Recruitment</a>` : ""}
        <div class="row between mt" style="align-items:center"><h2 class="cl-gh" style="margin:0">Recruitment Cycles</h2>${ui.select("rc-order", [["new", "Latest First"], ["old", "Oldest First"], ["most", "Most Applications"]], order)}</div>
        ${list.length ? `<div class="rc-cycles">${list.map((f) => {
          const c = f.clubs || {}, q = (f.fields || []).filter((x) => x.type !== "section").length, secs = (f.fields || []).filter((x) => x.type === "section").length || 1;
          return `<a class="rc-cycle" href="#/club/recruit?form=${f.id}"><span class="rc-art">${c.cover_url ? `<img src="${esc(c.cover_url)}" alt="" loading="lazy">` : ui.logo(c, "lg")}</span>
            <span class="min0 rc-body"><b>${esc(f.title)} ${ui.st(f.status === "closed" && (f.form_responses || []).some((r) => r.status === "accepted") ? ["Completed", "green"] : ST[f.status] || ST.draft)}</b>
              <span>${icon("calendar", "sm")} ${ui.dateShort(f.created_at)}${f.settings?.deadline ? ` - ${ui.dateShort(f.settings.deadline)}` : ""}</span>
              <span>${icon("users", "sm")} ${esc(c.short_name || c.name || "")} · ${esc(f.kind[0].toUpperCase() + f.kind.slice(1))}</span>
              <span>${icon("file", "sm")} ${ui.plural(secs, "Section")} · ${ui.plural(q, "Question")}</span></span>
            <span class="rc-n"><b>${(f.form_responses || []).length}</b><span>Applications</span></span>${icon("chevR", "sm")}</a>`; }).join("")}</div>`
          : ui.emptyBox("edit", "No recruitment yet", create ? "Create one with the button above." : "Ask your club admin to create a recruitment form.")}`;
    });
  }
  function list(form, rows, max) {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    const dept = (r) => r.department || deptFromId(r.student_id) || "", batch = (r) => (r.student_id || "").slice(0, 4);
    const all = rows.filter((r) => (st === "all" || r.status === st) && (fl.dept === "all" || dept(r) === fl.dept) && (fl.batch === "all" || batch(r) === fl.batch) && (!words.length || words.every((w) => `${r.name} ${dept(r)} ${r.student_id} ${prefOf(form, r)}`.toLowerCase().includes(w))))
      .sort((a, b) => (fl.sort === "match" ? (b.score_total ?? -1) - (a.score_total ?? -1) : 0) || (fl.sort === "name" ? a.name.localeCompare(b.name) : 0) || (fl.sort === "old" ? 1 : -1) * (new Date(b.created_at) - new Date(a.created_at)));
    const pages_ = Math.max(1, Math.ceil(all.length / PAGE)); page = Math.min(page, pages_);
    const shown = all.slice((page - 1) * PAGE, page * PAGE);
    const opts = (list) => [...new Set(rows.map(list).filter(Boolean))].sort();
    return `<div class="rv-search"><div class="searchbar cl-search grow">${icon("search")}<input class="input" id="rc-q" type="search" placeholder="Search applicants by name, department…" value="${esc(q)}" autocomplete="off"></div>
        <a class="btn outline" href="#/club/recruit?form=${form.id}&t=analytics" aria-label="Insights">${icon("filter", "sm")}</a></div>
      <div class="rv-filters mt-s">${ui.select("dept", [["all", "Department"], ...opts(dept).map((d) => [d, d])], fl.dept, 'data-fl aria-label="Department"')}${ui.select("batch", [["all", "Batch"], ...opts(batch).map((b) => [b, `Batch ${b}`])], fl.batch, 'data-fl aria-label="Batch"')}
        ${ui.select("st", [["all", "Status"], ...Object.entries(PIPE).map(([k, v]) => [k, v[0]])], st, 'data-fl aria-label="Status"')}${ui.select("sort", [["new", "Sort by: Newest"], ["old", "Oldest"], ["match", "Best match"], ["name", "Name"]], fl.sort, 'data-fl aria-label="Sort"')}</div>
      ${shown.length ? `<div class="rv-list mt-s">${shown.map((r) => { const pct = matchOf(r, max);
        return `<div class="rv-row"><input type="checkbox" data-sel="${r.id}" ${sel.has(r.id) ? "checked" : ""} aria-label="Select ${esc(r.name)}">
          <span class="rv-face" aria-hidden="true">${esc(ui.initials(r.name))}</span>
          <a class="rv-main" href="#/club/applicant?id=${r.id}"><b>${esc(r.name)}</b><span>${esc([dept(r), batch(r) && `Batch ${batch(r)}`].filter(Boolean).join(" · "))}</span><span>Applied: ${ui.dateShort(r.created_at)}</span></a>
          <span class="rv-side">${ui.st(PIPE[r.status])}<span class="cl-match"><b>${pct == null ? "–" : `${pct}%`}</b><span>Match</span></span></span>
          <a class="rv-more" href="#/club/applicant?id=${r.id}" aria-label="Open ${esc(r.name)}">${icon("more")}</a></div>`; }).join("")}</div>${ui.pager(page, pages_)}`
        : ui.emptyBox("users", "No applications here", "Try another filter.")}
      <div class="rv-bar"><label><input type="checkbox" id="rc-all" ${shown.length && shown.every((r) => sel.has(r.id)) ? "checked" : ""}> Select All</label>
        <select class="select" id="rc-bulk" ${sel.size ? "" : "disabled"} aria-label="Bulk action"><option value="">Bulk Actions${sel.size ? ` (${sel.size})` : ""}</option><option value="shortlisted">Shortlist</option><option value="interview">Move to Interview</option><option value="accepted">Select (accept)</option><option value="rejected">Reject</option><option value="schedule">Schedule interviews…</option></select>
        ${kit.can(form.club_id, "forms.export") ? `<button class="btn primary" id="rc-export">${icon("download")} Export</button>` : ""}</div>`;
  }
  function interviews(form, rows) {
    const list = rows.filter((r) => r.interview_at).sort((a, b) => new Date(a.interview_at) - new Date(b.interview_at));
    return list.length ? `<div class="cl-list">${list.map((r) => `<a class="cl-li" href="#/club/applicant?id=${r.id}">${ui.dchip(r.interview_at)}<span class="body"><b>${esc(r.name)}</b><span>${ui.time(r.interview_at)}${r.interview_place ? ` · ${esc(r.interview_place)}` : ""}</span></span>${ui.st(PIPE[r.status])}</a>`).join("")}</div>`
      : ui.emptyBox("calendar", "No interviews scheduled", "Select applicants and choose “Schedule interviews…”.");
  }
  function analytics(form, rows) {
    const perDay = Object.entries(rows.reduce((m, r) => { const d = new Date(r.created_at).toLocaleDateString("en-CA", { timeZone: "Asia/Dhaka" }); m[d] = (m[d] || 0) + 1; return m; }, {})).sort();
    const dept = Object.entries(rows.reduce((m, r) => { const d = r.department || deptFromId(r.student_id) || "Other"; m[d] = (m[d] || 0) + 1; return m; }, {})).map(([label, value]) => ({ label, value }));
    const funnel = [["Applied", rows.length], ["Shortlisted+", rows.filter((r) => ["shortlisted", "interview", "accepted"].includes(r.status)).length], ["Interview+", rows.filter((r) => ["interview", "accepted"].includes(r.status)).length], ["Selected", rows.filter((r) => r.status === "accepted").length]];
    return `<div class="cl-row2"><section class="card cl-chart"><h3>Applications per day</h3>${charts.bars({ title: "Applications per day", labels: perDay.map(([d]) => d.slice(5)), series: [{ name: "Applications", values: perDay.map(([, n]) => n) }] })}</section>
      <section class="card cl-chart"><h3>By department</h3>${charts.donut({ title: "Applicants by department", items: dept, sub: "applicants" })}</section></div>
      <section class="card cl-chart mt"><h3>Funnel</h3>${charts.hbars({ title: "Recruitment funnel", items: funnel.map(([label, value]) => ({ label, value })), max: Math.max(1, rows.length) })}</section>`;
  }
  pages["club/recruit"].mount = (el) => {
    kit.bindRetry(el);
    const fid = kit.param("form"); tab = kit.param("t") || "applications";
    kit.$('select[name="rc-order"]', el)?.addEventListener("change", (e) => { order = e.target.value; ctx.rerender(); });
    const form = store.peek(`club:form:${fid}`), rows = store.peek(`club:resp:${fid}`) || []; if (!form) return;
    const reload = () => store.invalidate(`club:resp:${fid}`);
    const input = kit.$("#rc-q", el);
    input?.addEventListener("input", () => { q = input.value; page = 1; const pos = input.selectionStart; ctx.rerender(); const i = kit.$("#rc-q"); if (i) { i.focus(); i.setSelectionRange(pos, pos); } });
    kit.$$("[data-st]", el).forEach((b) => b.addEventListener("click", () => { st = b.dataset.st; page = 1; sel.clear(); if (tab !== "applications") kit.go(`#/club/recruit?form=${fid}&t=applications`); else ctx.rerender(); }));
    kit.$$("[data-pg]", el).forEach((b) => b.addEventListener("click", () => { page = Number(b.dataset.pg); ctx.rerender(); }));
    kit.$$("[data-fl]", el).forEach((x) => x.addEventListener("change", () => { if (x.name === "st") st = x.value; else fl[x.name] = x.value; page = 1; sel.clear(); ctx.rerender(); }));
    kit.$$("[data-sel]", el).forEach((c) => c.addEventListener("change", () => { if (c.checked) sel.add(c.dataset.sel); else sel.delete(c.dataset.sel); ctx.rerender(); }));
    kit.$("#rc-all", el)?.addEventListener("change", (e) => { kit.$$("[data-sel]", el).forEach((c) => (e.target.checked ? sel.add(c.dataset.sel) : sel.delete(c.dataset.sel))); ctx.rerender(); });
    kit.$("#rc-bulk", el)?.addEventListener("change", (e) => {
      const v = e.target.value; e.target.value = ""; if (!v || !sel.size) return;
      const ids = [...sel];
      if (v === "schedule") return schedule(ids, () => { sel.clear(); reload(); });
      ui.confirm(`${PIPE[v][0]}: ${ui.plural(ids.length, "applicant")}?`, v === "accepted" && form.kind === "membership" ? "They become General Members of the club and are told in the app." : "Each person is told in the app.", "Confirm", async () => { await api.review(ids, { status: v }); sel.clear(); reload(); }, v === "rejected");
    });
    kit.$("#rc-export", el)?.addEventListener("click", async () => { try { await api.logExport(form.club_id, form.title, rows.length); ui.download(`${form.title.replace(/[^\w]+/g, "-").slice(0, 40)}.csv`, toCSV(form, rows), "text/csv;charset=utf-8"); } catch (err) { kit.toast(err.message, "error"); } });
  };
  function schedule(ids, done) {
    const d = new Date(Date.now() + 2 * 864e5); d.setHours(17, 0, 0, 0);
    ui.sheet(`Interview: ${ui.plural(ids.length, "applicant")}`, `<form id="iv" class="stack">${ui.field("When", `<input class="input" type="datetime-local" name="at" required value="${new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 16)}">`)}
      ${ui.field("Where", ui.input("place", "", 'maxlength="120" placeholder="CSE Lab, EWU or a Meet link"'))}<p class="xs">Everyone selected gets the same slot; schedule people one by one for different times.</p><button class="btn primary block">${icon("calendar")} Schedule</button></form>`, (s) =>
      kit.$("#iv", s).addEventListener("submit", async (e) => { e.preventDefault(); const f = new FormData(e.target); try { await api.setInterview(ids, new Date(f.get("at")).toISOString(), String(f.get("place") || "")); ctx.closeModal(); kit.toast("Interview scheduled", "success", "They're notified in the app."); done(); } catch (err) { kit.toast(err.message, "error"); } }));
  }

  /* ═════════ One applicant ═════════ */
  let atab = "overview";
  pages["club/applicant"] = () => {
    const g = kit.gate("this application"); if (g) return g;
    const id = kit.param("id"), re = store.use(`club:app:${id}`, () => api.response(id), { ttl: 20e3 });
    return ui.view(re, (r) => {
      if (!r) return ui.emptyBox("lock", "Application not found", "");
      const form = r.club_forms, rub = rubricOf(form), max = maxOf(form);
      // "Applicant" board: dark hero with the overall match, tabs, the answers sorted into the board's sections, Admin Actions.
      const used = new Set(), pick = (re) => { const f = (form.fields || []).find((x) => !used.has(x.id) && re.test(x.label) && r.answers?.[x.id] != null && r.answers[x.id] !== ""); if (!f) return null; used.add(f.id); return [f, r.answers[f.id]]; };
      const txt = (v) => [].concat(v).join(", ");
      const cgpa = pick(/cgpa|gpa|result/i), skills = pick(/skill|interest|expertise/i), motiv = pick(/motivat|why.*(join|interest)|reason/i), why = pick(/why.*(select|choose|you)|strength/i);
      const docs = (form.fields || []).filter((f) => ["link", "file"].includes(f.type) && r.answers?.[f.id]).map((f) => { used.add(f.id); return [f.label, r.answers[f.id]]; });
      const extra = (form.fields || []).filter((f) => !used.has(f.id) && !["note", "section"].includes(f.type) && r.answers?.[f.id] != null && r.answers[f.id] !== "" && !/^(full )?name$|e-?mail|phone|mobile|student id/i.test(f.label)).slice(0, 6);
      const pct = matchOf(r, max), d = r.department || deptFromId(r.student_id), b = (r.student_id || "").slice(0, 4);
      return `${kit.back(`#/club/recruit?form=${r.form_id}`, form.title)}
        <section class="ap-hero"><div class="row between" style="gap:8px;flex-wrap:wrap">${ui.st(PIPE[r.status])}<span class="xs">Applied on ${ui.dateShort(r.created_at)}</span><span class="xs">Application #${esc(r.id.slice(0, 8).toUpperCase())}</span></div>
          <div class="row nowrap mt-s" style="gap:14px;align-items:flex-start"><span class="ap-photo" aria-hidden="true">${esc(ui.initials(r.name))}</span>
            <div class="min0 grow"><h1>${esc(r.name)}</h1><p>${esc([d, b && `Batch ${b}`].filter(Boolean).join(" · "))}</p>
              ${r.email ? `<p>${icon("mail", "sm")} <a href="mailto:${esc(r.email)}">${esc(r.email)}</a></p>` : ""}${r.phone ? `<p>${icon("phone", "sm")} <a href="tel:${esc(r.phone)}">${esc(r.phone)}</a></p>` : ""}</div>
            <div class="ap-match"><b>${pct == null ? "–" : `${pct}%`}</b><span>Overall Match</span><div class="cl-bar"><i style="width:${pct || 0}%"></i></div>${pct == null ? `<span class="xs">Score it in Evaluation</span>` : ""}</div></div></section>
        <nav class="cl-seg mt" role="tablist">${[["overview", "Application"], ["application", "Responses"], ["interview", "Interview"], ["evaluation", "Evaluation"], ["notes", "Notes"]].map(([v, l]) => `<button type="button" data-at="${v}" role="tab" aria-selected="${atab === v}">${l}</button>`).join("")}</nav>
        ${atab === "application" ? `<section class="card">${(form.fields || []).filter((f) => f.type !== "note").map((f) => `<div style="margin-bottom:12px"><b class="xs" style="display:block">${esc(f.label)}</b><p>${ui.rich(txt(r.answers?.[f.id] ?? "—"))}</p></div>`).join("")}</section>`
          : atab === "evaluation" ? evaluation(r, rub, max)
          : atab === "interview" ? `<section class="card"><h2>Interview Schedule</h2>${r.interview_at ? `<div class="cl-li" style="padding:10px 0">${ui.dchip(r.interview_at)}<span class="body"><b>${ui.dateLong(r.interview_at)}</b><span>${ui.time(r.interview_at)}${r.interview_place ? ` · ${esc(r.interview_place)}` : ""}</span></span></div>` : `<p class="small muted">Not scheduled yet.</p>`}<button class="btn outline mt-s" id="ap-iv2">${icon("plus", "sm")} ${r.interview_at ? "Reschedule" : "Schedule Interview"}</button></section>`
          : atab === "notes" ? `<form id="ap-note" class="stack">${ui.area("note", r.note, 'rows="5" maxlength="500" placeholder="Private notes for the recruitment team"')}<button class="btn primary">Save notes</button></form>`
          : `<div class="ap-cols"><div class="stack">
              <section class="card"><h2 class="cl-hd">Academic Information</h2><div class="ap-acad">${[["cap", "Department", d || "—"], ["calendar", "Batch", b || "—"], ["chart", "CGPA", cgpa ? txt(cgpa[1]) : "—"]].map(([ic, l, v]) => `<div>${icon(ic)}<span><span class="xs">${l}</span><b>${esc(v)}</b></span></div>`).join("")}</div></section>
              ${skills ? `<section class="card"><h2 class="cl-hd">Skills &amp; Interests</h2><div class="cl-chips">${[].concat(skills[1]).flatMap((x) => String(x).split(/,\s*/)).filter(Boolean).slice(0, 12).map((x) => `<span class="cl-lbl">${esc(x)}</span>`).join("")}</div></section>` : ""}
              ${motiv ? `<section class="card"><h2 class="cl-hd">Motivation Statement</h2><blockquote class="ap-quote">${ui.rich(txt(motiv[1]))}</blockquote></section>` : ""}
              ${why ? `<section class="card"><h2 class="cl-hd">${esc(why[0].label)}</h2><p class="small">${ui.rich(txt(why[1]))}</p></section>` : ""}</div>
            <div class="stack">
              <section class="card"><h2 class="cl-hd">Profile Documents</h2>${docs.some(([, u]) => /^https?:\/\//i.test(u)) ? `<div class="cl-list">${docs.filter(([, u]) => /^https?:\/\//i.test(u)).map(([l, u]) => `<a class="cl-li" href="${esc(u)}" target="_blank" rel="noopener noreferrer"><span class="itile sm red">${icon("file")}</span><span class="body"><b>${esc(l)}</b></span>${icon("external", "sm")}</a>`).join("")}</div>` : `<p class="small muted">No documents attached.</p>`}</section>
              ${extra.length ? `<section class="card"><h2 class="cl-hd">Additional Information</h2><div class="cl-list">${extra.map((f) => `<div class="cl-li"><span class="itile sm purple">${icon("info")}</span><span class="body"><span class="xs">${esc(f.label)}</span><b>${f.type === "link" ? esc(r.answers[f.id]) : esc(txt(r.answers[f.id]))}</b></span></div>`).join("")}</div></section>` : ""}</div></div>
            <section class="card mt"><h2 class="cl-hd">Admin Actions</h2><div class="ap-admin">
              <button type="button" class="btn ok" data-q="accepted">${icon("check")} Approve</button><button type="button" class="btn primary" data-q="interview">${icon("arrow")} Move to Interview</button><button type="button" class="btn danger" data-q="rejected">${icon("x")} Reject</button>
              ${r.email ? `<a class="btn outline" href="mailto:${esc(r.email)}?subject=${encodeURIComponent(form.title)}">${icon("mail")} Message</a>` : ""}<button type="button" class="btn outline" id="ap-iv">${icon("calendar")} Schedule Interview</button><button type="button" class="btn outline" data-at="notes">${icon("edit")} Add Note</button></div>
              <p class="xs mt-s">Approving ${form.kind === "membership" ? "makes them a General Member of the club. " : ""}Each change is sent to the applicant in the app.</p></section>`}`;
    }, { n: 3, h: 120 });
  };
  const evaluation = (r, rub, max) => `<form id="ap-eval" class="card stack"><h2>Evaluation (out of ${max})</h2>${rub.map((x) => `<label class="field">${esc(x.label)} <span class="xs">(0–${x.max})</span><input class="input" type="number" name="${esc(x.key)}" min="0" max="${x.max}" step="1" value="${r.score?.[x.key] ?? ""}"></label>`).join("")}
    <button class="btn primary">${icon("check")} Save score</button><p class="xs">The rubric comes from the form's settings; without one, Motivation 20 · Skills 20 · Portfolio 20 · Overall fit 40 is used.</p></form>`;
  pages["club/applicant"].mount = (el) => {
    kit.bindRetry(el);
    const id = kit.param("id"), r = store.peek(`club:app:${id}`); if (!r) return;
    const reload = () => store.invalidate(`club:app:${id}`, `club:resp:${r.form_id}`);
    kit.$$("[data-at]", el).forEach((b) => b.addEventListener("click", () => { atab = b.dataset.at; ctx.rerender(); }));
    const setStatus = (s) => ui.confirm(`${PIPE[s][0]}?`, `${esc(r.name)} is told in the app.`, "Confirm", async () => { await api.review([id], { status: s }); reload(); }, s === "rejected");
    kit.$("#ap-st", el)?.addEventListener("change", (e) => { if (e.target.value) setStatus(e.target.value); e.target.value = ""; });
    kit.$$("[data-q]", el).forEach((b) => b.addEventListener("click", () => setStatus(b.dataset.q)));
    [kit.$("#ap-iv", el), kit.$("#ap-iv2", el)].forEach((b) => b?.addEventListener("click", () => schedule([id], reload)));
    kit.$("#ap-note", el)?.addEventListener("submit", async (e) => { e.preventDefault(); try { await api.review([id], { note: String(new FormData(e.target).get("note") || "") }); reload(); kit.toast("Notes saved", "success"); } catch (err) { kit.toast(err.message, "error"); } });
    kit.$("#ap-eval", el)?.addEventListener("submit", async (e) => {
      e.preventDefault(); const f = new FormData(e.target), rub = rubricOf(r.club_forms);
      // Save the default rubric on the form the first time, so the database scores against the same criteria.
      if (!Array.isArray(r.club_forms.settings?.rubric) && kit.can(r.club_id, "forms.create")) { try { await api.updateForm(r.form_id, { settings: { ...r.club_forms.settings, rubric: DEFAULT_RUBRIC } }); } catch { /* scored without a stored rubric */ } }
      const score = Object.fromEntries(rub.map((x) => [x.key, Math.max(0, Math.min(x.max, Number(f.get(x.key)) || 0))]));
      try { await api.score(id, score); reload(); kit.toast("Score saved", "success"); } catch (err) { kit.toast(err.message, "error"); }
    });
  };
}
