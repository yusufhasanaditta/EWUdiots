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
        <section class="cl-banner" style="grid-template-columns:auto 1fr;align-items:center;gap:14px;min-height:0">${ui.logo(club, "lg")}<div class="min0"><h2 style="font-size:22px">${esc(form.title)}</h2>
          <p style="opacity:.9">${icon("calendar", "sm")} ${ui.dateShort(form.created_at)}${form.settings?.deadline ? ` – ${ui.dateShort(form.settings.deadline)}` : ""} · ${icon("users", "sm")} ${ui.plural(rows.length, "application")}</p>${ui.st(form.status === "open" ? ["Active", "green"] : form.status === "closed" ? ["Closed", "gray"] : ["Draft", "amber"])}</div></section>
        ${ui.seg([["applications", "Applications"], ["shortlist", "Shortlisting"], ["interviews", "Interviews"], ["analytics", "Analytics"]], tab, (v) => `#/club/recruit?form=${fid}&t=${v}`, "mt")}
        <div class="cl-stats c5">${ui.stat("users", "purple", rows.length, "Total")}${ui.stat("clock", "blue", n("pending"), "Under review")}${ui.stat("star", "amber", n("shortlisted"), "Shortlisted")}${ui.stat("calendar", "purple", n("interview"), "Interview")}${ui.stat("xc", "red", n("rejected"), "Rejected")}</div>
        ${re.loading && !re.value ? ui.skeleton(5, 70) : tab === "analytics" ? analytics(form, rows) : tab === "interviews" ? interviews(form, rows) : list(form, rows, max)}`;
    }, { n: 3, h: 120 });
  };
  function pickForm() {
    const clubs = kit.clubsWith("forms.view_responses");
    if (!clubs.length) return ui.emptyBox("lock", "For recruitment teams", "");
    const fe = store.use(`me:recforms:${clubs.map((c) => c.club_id).join(",")}`, async () => (await Promise.all(clubs.map((c) => api.forms(c.club_id)))).flat(), { ttl: 60e3 });
    return ui.ph("Recruitment", "Applications for your clubs") + ui.view(fe, (forms) => (forms.length ? `<div class="cl-list">${forms.map((f) => `<a class="cl-li" href="#/club/recruit?form=${f.id}"><span class="itile purple">${icon("userpen")}</span><span class="body"><b>${esc(f.title)}</b><span>${esc(f.kind)} · ${esc(f.status)}</span></span>${icon("chevR", "sm")}</a>`).join("")}</div>` : ui.emptyBox("edit", "No forms yet", "Create a recruitment form in Manage → Forms.")));
  }
  function list(form, rows, max) {
    const statusFor = tab === "shortlist" ? "shortlisted" : st;
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    const all = rows.filter((r) => (statusFor === "all" || r.status === statusFor) && (!words.length || words.every((w) => `${r.name} ${r.department} ${r.student_id} ${prefOf(form, r)}`.toLowerCase().includes(w))))
      .sort((a, b) => (b.score_total ?? -1) - (a.score_total ?? -1) || new Date(b.created_at) - new Date(a.created_at));
    const pages_ = Math.max(1, Math.ceil(all.length / PAGE)); page = Math.min(page, pages_);
    const shown = all.slice((page - 1) * PAGE, page * PAGE);
    const n = (s) => rows.filter((r) => r.status === s).length;
    return `<div class="row nowrap" style="gap:8px"><div class="searchbar cl-search grow">${icon("search")}<input class="input" id="rc-q" type="search" placeholder="Search by name, department, or position…" value="${esc(q)}" autocomplete="off"></div></div>
      ${tab === "applications" ? `<nav class="cl-seg sm mt-s">${[["all", `All (${rows.length})`], ["pending", `Under Review (${n("pending")})`], ["shortlisted", `Shortlisted (${n("shortlisted")})`], ["interview", `Interview (${n("interview")})`], ["accepted", `Selected (${n("accepted")})`], ["rejected", `Rejected (${n("rejected")})`]].map(([v, l]) => `<button data-st="${v}" aria-pressed="${st === v}">${l}</button>`).join("")}</nav>` : ""}
      ${shown.length ? `<div class="cl-list mt-s">${shown.map((r) => `<div class="cl-order"><input type="checkbox" data-sel="${r.id}" ${sel.has(r.id) ? "checked" : ""} aria-label="Select ${esc(r.name)}">
          <a class="min0" href="#/club/applicant?id=${r.id}" style="text-decoration:none;color:inherit"><span class="row nowrap" style="gap:10px">${ui.ava(r.name)}<span class="min0"><b class="ellipsis" style="display:block">${esc(r.name)}</b>
            <span class="xs">${esc([r.department || deptFromId(r.student_id), r.student_id && `Batch ${r.student_id.slice(0, 4)}`].filter(Boolean).join(" · "))}</span><span class="xs" style="display:block">Applied: ${ui.dateShort(r.created_at)}</span>
            ${prefOf(form, r) ? `<span class="xs" style="display:block">${esc(prefOf(form, r))}</span>` : ""}</span></span></a>
          <span class="right"><b class="amt">${r.score_total != null ? `${Math.round(r.score_total)}/${max}` : "—"}</b>${ui.st(PIPE[r.status])}</span></div>`).join("")}</div>${ui.pager(page, pages_)}`
        : ui.emptyBox("users", "No applications here", "Try another filter.")}
      <div class="${sel.size ? "cl-bulkbar" : "row"} mt" style="gap:6px;flex-wrap:wrap"><label class="row nowrap" style="gap:6px"><input type="checkbox" id="rc-all" ${shown.length && shown.every((r) => sel.has(r.id)) ? "checked" : ""}> Select All</label>
        <select class="select" id="rc-bulk" style="width:auto" ${sel.size ? "" : "disabled"} aria-label="Bulk action"><option value="">Bulk Actions (${sel.size})</option><option value="shortlisted">Shortlist</option><option value="interview">Move to Interview</option><option value="accepted">Select (accept)</option><option value="waitlisted">Waitlist</option><option value="rejected">Reject</option><option value="schedule">Schedule interviews…</option></select>
        ${kit.can(form.club_id, "forms.export") ? `<button class="btn primary push" id="rc-export">${icon("download")} Export</button>` : ""}</div>`;
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
        <section class="card row" style="gap:16px;align-items:flex-start;flex-wrap:wrap">${ui.ava(r.name, "", "xl")}<div class="min0 grow"><div class="row" style="gap:8px"><h1 style="font-size:24px">${esc(r.name)}</h1>${ui.st(PIPE[r.status])}</div>
          <p class="xs">${esc([r.department || deptFromId(r.student_id), r.student_id && `Batch ${r.student_id.slice(0, 4)}`].filter(Boolean).join(" · "))}</p>
          ${r.email ? `<p class="small">${icon("mail", "sm")} <a href="mailto:${esc(r.email)}">${esc(r.email)}</a></p>` : ""}${r.phone ? `<p class="small">${icon("phone", "sm")} <a href="tel:${esc(r.phone)}">${esc(r.phone)}</a></p>` : ""}</div></section>
        <div class="row mt" style="gap:8px;flex-wrap:wrap"><button class="btn primary" id="ap-iv">${icon("calendar")} Schedule Interview</button>${r.email ? `<a class="btn outline" href="mailto:${esc(r.email)}?subject=${encodeURIComponent(form.title)}">${icon("mail")} Send Message</a>` : ""}
          <select class="select" id="ap-st" style="width:auto" aria-label="Change status"><option value="">Change Status</option>${Object.entries(PIPE).map(([k, v]) => `<option value="${k}">${v[0]}</option>`).join("")}</select></div>
        <nav class="cl-seg sm mt">${[["overview", "Overview"], ["application", "Application"], ["evaluation", "Evaluation"], ["interview", "Interview"], ["notes", "Notes"]].map(([v, l]) => `<button data-at="${v}" aria-pressed="${atab === v}">${l}</button>`).join("")}</nav>
        ${atab === "application" ? `<section class="card">${(form.fields || []).filter((f) => f.type !== "note").map((f) => `<div style="margin-bottom:12px"><b class="xs" style="display:block">${esc(f.label)}</b><p>${ui.rich([].concat(r.answers?.[f.id] ?? "—").join(", "))}</p></div>`).join("")}</section>`
          : atab === "evaluation" ? evaluation(r, rub, max)
          : atab === "interview" ? `<section class="card"><h2>Interview Schedule</h2>${r.interview_at ? `<div class="cl-li" style="padding:10px 0">${ui.dchip(r.interview_at)}<span class="body"><b>${ui.dateLong(r.interview_at)}</b><span>${ui.time(r.interview_at)}${r.interview_place ? ` · ${esc(r.interview_place)}` : ""}</span></span></div>` : `<p class="small muted">Not scheduled yet.</p>`}<button class="btn outline mt-s" id="ap-iv2">${icon("plus", "sm")} ${r.interview_at ? "Reschedule" : "Schedule Interview"}</button></section>`
          : atab === "notes" ? `<form id="ap-note" class="stack">${ui.area("note", r.note, 'rows="5" maxlength="500" placeholder="Private notes for the recruitment team"')}<button class="btn primary">Save notes</button></form>`
          : `<div class="cl-row2"><section class="card"><h2>Basic Information</h2><div class="cl-facts" style="grid-template-columns:1fr">${[["calendar", "Applied on", ui.dateLong(r.created_at)], ["briefcase", "Preferred positions", prefOf(form, r) || "—"], ["clock", "Interview", r.interview_at ? ui.dateTime(r.interview_at) : "Not scheduled"]].map(([ic, l, v]) => `<div class="cl-fact">${icon(ic)}<div><span>${l}</span><b>${esc(v)}</b></div></div>`).join("")}</div></section>
            <section class="card"><h2>Evaluation Summary</h2><div class="cl-stat t-purple mt-s"><span class="lbl">Total Score</span><b class="num">${r.score_total != null ? `${Math.round(r.score_total)}/${max}` : "Not scored"}</b></div>
              ${rub.map((x) => `<div class="row between" style="padding:6px 0"><span class="small">${esc(x.label)}</span><b class="small" style="color:var(--success-t)">${r.score?.[x.key] ?? "–"}/${x.max}</b></div>`).join("")}</section></div>
            ${links.length ? `<section class="card mt"><h2>Documents & Links</h2>${links.map(([l, u]) => `<a class="cl-li" href="${esc(u)}" target="_blank" rel="noopener noreferrer">${icon("link")}<span class="body"><b>${esc(l)}</b><span class="ellipsis">${esc(u)}</span></span>${icon("external", "sm")}</a>`).join("")}</section>` : ""}`}
        ${ui.sec("Quick Actions")}<div class="cl-quick">${[["shortlisted", "checkc", "Shortlist"], ["interview", "calendar", "Move to Interview"], ["accepted", "trophy", "Select"], ["rejected", "xc", "Reject"]].map(([s, ic, l]) => `<button class="cl-quick-btn" data-q="${s}" style="border:0;cursor:pointer;font:inherit">${icon(ic)}<span>${l}</span></button>`).join("")}</div>`;
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
