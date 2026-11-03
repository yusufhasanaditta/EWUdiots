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
  const formE = (fid) => store.use(`club:form:${fid}`, () => api.form(fid), { ttl: 60e3 });
  const respE = (fid) => store.use(`club:resp:${fid}`, () => api.responses(fid), { ttl: 20e3 });
  const rubricOf = (form) => (Array.isArray(form?.settings?.rubric) && form.settings.rubric.length ? form.settings.rubric : DEFAULT_RUBRIC);
  const maxOf = (form) => rubricOf(form).reduce((s, r) => s + Number(r.max || 0), 0) || 100;
  const positions = (form) => (form.fields || []).filter((f) => /wing|team|position|role/i.test(f.label) && ["choice", "multi", "dropdown"].includes(f.type)).reduce((n, f) => n + (f.options?.length || 0), 0);
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
      return `${kit.back(`#/club/manage?c=${form.club_id}&tab=forms`, "Forms")}
        <section class="rv-head"><span class="rv-cover">${club.cover_url ? `<img src="${esc(club.cover_url)}" alt="" loading="lazy">` : ui.logo(club, "lg")}</span>
          <div class="min0"><h1>${esc(form.title)} ${ui.st(form.status === "open" ? ["Active", "green"] : form.status === "closed" ? ["Closed", "gray"] : ["Draft", "amber"])}</h1>
            <p>${icon("calendar", "sm")} ${ui.dateShort(form.created_at)}${form.settings?.deadline ? ` – ${ui.dateShort(form.settings.deadline)}` : ""}</p>
            <p>${icon("users", "sm")} ${ui.plural(rows.length, "Application")} ${positions(form) ? `· ${icon("file", "sm")} ${ui.plural(positions(form), "Position")}` : ""}</p></div></section>
        <nav class="rp-tabs" role="tablist">${[["applications", "Applications"], ["shortlist", "Shortlisting"], ["interviews", "Interviews"], ["analytics", "Analytics"]].map(([v, l]) => `<a role="tab" href="#/club/recruit?form=${fid}&t=${v}" aria-selected="${tab === v}">${l}</a>`).join("")}<a role="tab" href="#/club/manage?c=${form.club_id}&tab=forms" aria-selected="false">Settings</a></nav>
        <div class="rv-kpis">${[["users", "purple", rows.length, "Applications"], ["clock", "green", n("pending"), "Reviewing"], ["star", "orange", n("shortlisted") + n("interview"), "Shortlisted"], ["file", "blue", n("accepted"), "Selected"], ["xc", "red", n("rejected"), "Rejected"]]
          .map(([ic, tone, v, l]) => `<div class="rv-kpi"><span class="itile ${tone}">${icon(ic)}</span><span class="min0"><b>${v}</b><span>${l}</span></span></div>`).join("")}</div>
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
    const statusFor = tab === "shortlist" ? "shortlisted" : st;
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    const all = rows.filter((r) => (statusFor === "all" || r.status === statusFor) && (!words.length || words.every((w) => `${r.name} ${r.department} ${r.student_id} ${prefOf(form, r)}`.toLowerCase().includes(w))))
      .sort((a, b) => (b.score_total ?? -1) - (a.score_total ?? -1) || new Date(b.created_at) - new Date(a.created_at));
    const pages_ = Math.max(1, Math.ceil(all.length / PAGE)); page = Math.min(page, pages_);
    const shown = all.slice((page - 1) * PAGE, page * PAGE);
    const n = (s) => rows.filter((r) => r.status === s).length;
    return `<div class="rv-search"><div class="searchbar cl-search">${icon("search")}<input class="input" id="rc-q" type="search" placeholder="Search by name, department, or position…" value="${esc(q)}" autocomplete="off"></div>
        <a class="btn outline" href="#/club/recruit?form=${form.id}&t=analytics">${icon("filter", "sm")} Insights</a></div>
      ${tab === "applications" ? `<div class="rv-chips">${[["all", `All (${rows.length})`], ["pending", `Under Review (${n("pending")})`], ["shortlisted", `Shortlisted (${n("shortlisted")})`], ["interview", `Interview (${n("interview")})`], ["accepted", `Selected (${n("accepted")})`], ["rejected", `Rejected (${n("rejected")})`]].map(([v, l]) => `<button data-st="${v}" aria-pressed="${st === v}">${l}</button>`).join("")}</div>` : ""}
      ${shown.length ? `<div class="rv-list">${shown.map((r) => `<div class="rv-row"><input type="checkbox" data-sel="${r.id}" ${sel.has(r.id) ? "checked" : ""} aria-label="Select ${esc(r.name)}">
          <span class="rv-face" aria-hidden="true">${esc(ui.initials(r.name))}</span>
          <a class="rv-main" href="#/club/applicant?id=${r.id}"><b>${esc(r.name)}</b><span>${esc([r.department || deptFromId(r.student_id), r.student_id && `Batch ${r.student_id.slice(0, 4)}`].filter(Boolean).join(" · "))}</span>${prefOf(form, r) ? `<span>Applied: ${esc(prefOf(form, r))}</span>` : ""}</a>
          <span class="rv-side"><span class="xs">${ui.dateShort(r.created_at)}</span>${ui.st(PIPE[r.status])}<span class="rv-score">${r.score_total != null ? `${Math.round(r.score_total)}<i>/${max}</i>` : "<i>Not scored</i>"}</span></span>
          <a class="rv-more" href="#/club/applicant?id=${r.id}" aria-label="Open ${esc(r.name)}">${icon("more")}</a></div>`).join("")}</div>${ui.pager(page, pages_)}`
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
    kit.$$("[data-st]", el).forEach((b) => b.addEventListener("click", () => { st = b.dataset.st; page = 1; sel.clear(); ctx.rerender(); }));
    kit.$$("[data-pg]", el).forEach((b) => b.addEventListener("click", () => { page = Number(b.dataset.pg); ctx.rerender(); }));
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
      const links = (form.fields || []).filter((f) => f.type === "link" && r.answers?.[f.id]).map((f) => [f.label, r.answers[f.id]]);
      return `${kit.back(`#/club/recruit?form=${r.form_id}`, form.title)}
        <section class="ap-head"><span class="ap-photo" aria-hidden="true">${esc(ui.initials(r.name))}</span><div class="min0"><h1>${esc(r.name)} ${ui.st(PIPE[r.status])}</h1>
          <p>${esc([r.department || deptFromId(r.student_id), r.student_id && `Batch ${r.student_id.slice(0, 4)}`].filter(Boolean).join(" · "))}</p>
          ${r.email ? `<p>${icon("mail", "sm")} <a href="mailto:${esc(r.email)}">${esc(r.email)}</a></p>` : ""}${r.phone ? `<p>${icon("phone", "sm")} <a href="tel:${esc(r.phone)}">${esc(r.phone)}</a></p>` : ""}
          <div class="ap-acts"><button class="btn primary" id="ap-iv">${icon("calendar")} Schedule Interview</button>${r.email ? `<a class="btn outline" href="mailto:${esc(r.email)}?subject=${encodeURIComponent(form.title)}">${icon("mail")} Send Message</a>` : ""}
            <select class="select" id="ap-st" style="width:auto" aria-label="Change status"><option value="">More…</option>${Object.entries(PIPE).map(([k, v]) => `<option value="${k}">${v[0]}</option>`).join("")}</select></div></div></section>
        <nav class="rp-tabs" role="tablist">${[["overview", "Overview"], ["application", "Application"], ["evaluation", "Evaluation"], ["interview", "Interview"], ["notes", "Notes"]].map(([v, l]) => `<button type="button" class="${atab === v ? "on" : ""}" data-at="${v}" role="tab" aria-selected="${atab === v}">${l}</button>`).join("")}</nav>
        ${atab === "application" ? `<section class="card">${(form.fields || []).filter((f) => f.type !== "note").map((f) => `<div style="margin-bottom:12px"><b class="xs" style="display:block">${esc(f.label)}</b><p>${ui.rich([].concat(r.answers?.[f.id] ?? "—").join(", "))}</p></div>`).join("")}</section>`
          : atab === "evaluation" ? evaluation(r, rub, max)
          : atab === "interview" ? `<section class="card"><h2>Interview Schedule</h2>${r.interview_at ? `<div class="cl-li" style="padding:10px 0">${ui.dchip(r.interview_at)}<span class="body"><b>${ui.dateLong(r.interview_at)}</b><span>${ui.time(r.interview_at)}${r.interview_place ? ` · ${esc(r.interview_place)}` : ""}</span></span></div>` : `<p class="small muted">Not scheduled yet.</p>`}<button class="btn outline mt-s" id="ap-iv2">${icon("plus", "sm")} ${r.interview_at ? "Reschedule" : "Schedule Interview"}</button></section>`
          : atab === "notes" ? `<form id="ap-note" class="stack">${ui.area("note", r.note, 'rows="5" maxlength="500" placeholder="Private notes for the recruitment team"')}<button class="btn primary">Save notes</button></form>`
          : `<div class="ap-grid"><section class="card rp-card"><div class="rp-ch"><h3>Application Information</h3></div><div class="ap-info">${[["calendar", "Applied On", ui.dateLong(r.created_at)], ["briefcase", "Preferred Positions", prefOf(form, r) ? prefOf(form, r).split(/,\s*/).map((p, i) => `${i + 1}. ${p}`).join("\n") : "—"], ["clock", "Interview", r.interview_at ? `${ui.dateTime(r.interview_at)}${r.interview_place ? `\n${r.interview_place}` : ""}` : "Not scheduled"]]
              .map(([ic, l, v]) => `<div><span class="itile sm purple">${icon(ic)}</span><span class="min0"><b>${l}</b><span>${esc(v)}</span></span></div>`).join("")}</div></section>
            <section class="card rp-card"><div class="rp-ch"><h3>Quick Actions</h3></div><div class="ap-quick">${[["shortlisted", "checkc", "Shortlist"], ["interview", "calendar", "Move to Interview"], ["accepted", "trophy", "Select"], ["rejected", "xc", "Reject"]].map(([s, ic, l]) => `<button type="button" data-q="${s}">${icon(ic)}<span>${l}</span></button>`).join("")}</div></section></div>
            ${links.some(([, u]) => /^https?:\/\//i.test(u)) ? `<section class="card rp-card mt"><div class="rp-ch"><h3>Documents &amp; Links</h3></div><div class="cl-list">${links.filter(([, u]) => /^https?:\/\//i.test(u)).map(([l, u]) => `<a class="cl-li" href="${esc(u)}" target="_blank" rel="noopener noreferrer"><span class="itile sm blue">${icon("link")}</span><span class="body"><b>${esc(l)}</b><span class="ellipsis">${esc(u)}</span></span>${icon("external", "sm")}</a>`).join("")}</div></section>` : ""}
            <section class="card rp-card mt"><div class="rp-ch"><h3>Application Answers</h3><button type="button" class="rp-more" data-at="application" style="border:0;background:none;cursor:pointer;font:inherit">View Full Application ${icon("arrow", "sm")}</button></div>
              <div class="ap-qa">${(form.fields || []).filter((f) => f.type !== "note" && r.answers?.[f.id] != null && r.answers[f.id] !== "").slice(0, 4).map((f, i) => `<div><b>${i + 1}. ${esc(f.label)}</b><p>${f.type === "link" ? `<a href="${esc(r.answers[f.id])}" target="_blank" rel="noopener noreferrer">${icon("link", "sm")} ${esc(r.answers[f.id])}</a>` : ui.rich([].concat(r.answers[f.id]).join(", "))}</p></div>`).join("") || `<p class="small muted">No answers.</p>`}</div></section>
            <section class="card rp-card mt"><div class="rp-ch"><h3>Evaluation &amp; Scoring</h3><span class="ap-total">Total Score: <b>${r.score_total != null ? `${Math.round(r.score_total)}/${max}` : "–"}</b></span></div>
              <div class="ap-scores">${rub.map((x, i) => `<div class="ap-score">${icon(["target", "clipboard", "image", "users"][i % 4])}<span>${esc(x.label)}</span><b>${r.score?.[x.key] ?? "–"}/${x.max}</b></div>`).join("")}</div>
              <button type="button" class="btn outline sm mt" data-at="evaluation">${icon("edit", "sm")} Score this application</button></section>`}`;
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
