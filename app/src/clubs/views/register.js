/* Club registration, from the "Club Registration Dashboard / Review" boards.
   #/club/register: a student applies to start (or bring) a club: basics, details, executive committee, documents and a
   statement (public.club_apply cleans and stores it); when the team asks for changes, the applicant edits and resends.
   #/club/registrations and #/club/registration?id=…: the EWUdiots team (clubs.verify) reviews: status tabs, search,
   quick checks, documents (private, signed links), Approve / Request Changes / Reject (review_claim, club_claim_step). */
import { CATEGORIES } from "../perms.js";

const ST = { pending: ["Pending Review", "amber"], review: ["Under Review", "blue"], revision: ["Under Revision", "purple"], approved: ["Approved", "green"], rejected: ["Rejected", "red"] };
const BANNED = /\b(politic\w*|religio\w*|gambl\w*|betting|casino|crypto|adult|weapons?|drugs?)\b/i;
const FREQ = ["Weekly", "Bi-weekly", "Monthly", "Weekly / Bi-weekly"];
const SIZES = ["10 - 50", "50 - 150", "150+"];

/** Quick checks shown to reviewers (pure, so it's testable). */
export function quickChecks(claim, clubs = []) {
  const a = claim.application || {}, name = claim.clubs?.name || "";
  const words = (s) => String(s).toLowerCase().replace(/\b(ewu|east|west|university|club|society|association|forum|students?|the|of|and|for|&)\b/g, " ").split(/[^a-z0-9]+/).filter((w) => w.length > 2);
  const mine = new Set(words(name));
  const similar = clubs.filter((c) => c.id !== claim.club_id && c.status !== "archived" && words(c.name).some((w) => mine.has(w)));
  return [["Basic information provided", !!(name && (a.about || claim.clubs?.about) && claim.clubs?.category)],
    ["Valid contact information", /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(a.email || claim.email || "") || /^(\+?88)?01[3-9]\d{8}$/.test(String(a.phone || "").replace(/[^0-9+]/g, ""))],
    ["Category matches guidelines", !!claim.clubs?.category && claim.clubs.category !== "other"],
    [similar.length ? `Similar club found (${similar.length})` : "No similar club", !similar.length, similar.map((c) => c.name)],
    ["No prohibited keywords", !BANNED.test(`${name} ${a.about || ""} ${a.statement || ""} ${a.activities || ""}`)]];
}

/** @param {Record<string, any>} pages @param {any} kit */
export function register(pages, kit) {
  const { ui, icon, esc, api, store, ctx } = kit;
  let editing = false;

  /* ═════════ Apply ═════════ */
  pages["club/register"] = () => {
    const g = kit.gate("club registration"); if (g) return g;
    const ae = store.use("me:applications", api.myApplications, { ttl: 30e3 });
    return ui.view(ae, (rows) => {
      const open = rows.find((c) => ["pending", "review", "revision"].includes(c.status));
      if (open && !(editing && open.status === "revision")) return status(open, rows);
      return `${kit.back("#/club/explore", "Clubs")}${ui.ph("Register a Club", "Start a new club on EWUdiots, or bring your existing EWU club here. The EWUdiots team reviews every application.")}${form(editing && open ? open : null)}`;
    }, { n: 2, h: 120 });
  };

  function status(c, rows) {
    const a = c.application || {}, [l, tone] = ST[c.status];
    return `${kit.back("#/club/explore", "Clubs")}${ui.ph("Your Club Application", "We'll message you in the app when there's news.")}
      <section class="card"><div class="row nowrap" style="gap:12px">${ui.logo({ name: c.clubs?.name, short_name: c.clubs?.short_name, color: "#4318ff" }, "lg")}<div class="grow min0"><b style="font-size:18px">${esc(c.clubs?.name || "")}</b><p class="xs">${esc(a.tagline || c.clubs?.tagline || "")}</p></div>${ui.st([l, tone])}</div>
        <p class="xs mt-s">Submitted ${ui.dateLong(c.created_at)}${c.updated_at && c.updated_at !== c.created_at ? ` · updated ${ui.ago(c.updated_at)}` : ""} · Application #${esc(c.id.slice(0, 8).toUpperCase())}</p>
        ${c.status === "revision" ? `<div class="cl-note mt-s"><span class="itile purple">${icon("edit")}</span><div class="grow"><b>The team asked for changes</b><span class="xs">${esc(c.review_note || "")}</span></div><button class="btn primary sm" id="rg-edit">Edit application</button></div>`
          : `<p class="small mt-s">${c.status === "review" ? "A reviewer is checking your details and documents now." : "Your application is in the queue. Reviews usually take a few days."}</p>`}</section>
      ${rows.filter((x) => x.id !== c.id).length ? `${ui.sec("Earlier applications")}<div class="cl-list">${rows.filter((x) => x.id !== c.id).map((x) => `<div class="cl-li"><span class="body"><b>${esc(x.clubs?.name || "")}</b><span>${ui.dateShort(x.created_at)}${x.review_note ? ` · ${esc(x.review_note)}` : ""}</span></span>${ui.st(ST[x.status] || ["Done", "gray"])}</div>`).join("")}</div>` : ""}`;
  }

  /** The application form; c = the claim being revised (or null for a new one). */
  function form(c) {
    const a = c?.application || {}, com = a.committee?.length ? a.committee : [{ role: "President" }, { role: "Vice President" }, { role: "General Secretary" }, { role: "Treasurer" }];
    const cm = (p, i) => `<div class="rg-cm" data-cm>${ui.input(`cn${i}`, p.name || "", 'maxlength="80" placeholder="Full name" aria-label="Name"')}${ui.input(`cr${i}`, p.role || "", 'maxlength="60" placeholder="Position" aria-label="Position"')}${ui.input(`cd${i}`, p.dept || "", 'maxlength="60" placeholder="CSE · 3rd Year" aria-label="Department and year"')}</div>`;
    return `<form id="rg-f" class="stack" novalidate>
      <section class="card"><h2 class="cl-hd">1. Club Basics</h2>
        ${c ? `<p class="small">Club: <b>${esc(c.clubs?.name || "")}</b></p>` : `${ui.field("Full club name", ui.input("name", "", 'required maxlength="100" placeholder="AI & Robotics Club"'))}
        <div class="row" style="gap:8px">${ui.field("Short name", ui.input("abbr", "", 'maxlength="20" placeholder="ARC"'))}${ui.field("Category", ui.select("cat", CATEGORIES, "tech"))}</div>`}
        ${ui.field("One-line description", ui.input("tagline", a.tagline || "", 'maxlength="140" placeholder="Building tomorrow through technology and innovation."'))}
        ${ui.field("About the club", ui.area("about", a.about || "", 'rows="3" maxlength="1500" placeholder="Who it is for and what you will do."'))}</section>
      <section class="card"><h2 class="cl-hd">2. Club Details</h2>
        <div class="row" style="gap:8px">${ui.field("Expected members", ui.select("members", SIZES.map((x) => [x, x]), a.members || SIZES[0]))}${ui.field("Meeting frequency", ui.select("frequency", FREQ.map((x) => [x, x]), a.frequency || "Bi-weekly"))}</div>
        ${ui.field("Department(s)", ui.input("departments", a.departments || "", 'maxlength="200" placeholder="CSE, EEE, BBA (interdisciplinary)"'))}
        ${ui.field("Proposed activities", ui.input("activities", a.activities || "", 'maxlength="300" placeholder="Workshops, competitions, research projects, seminars"'))}
        <div class="row" style="gap:8px">${ui.field("Target members", ui.input("audience", a.audience || "All EWU students", 'maxlength="120"'))}${ui.field("Proposed start", ui.input("start", a.start || "", 'type="month"'))}</div>
        <div class="row" style="gap:8px">${ui.field("Contact email", ui.input("email", a.email || kit.me()?.email || "", 'type="email" maxlength="120"'))}${ui.field("Contact number", ui.input("phone", a.phone || "", 'type="tel" inputmode="tel" maxlength="20" placeholder="01XXXXXXXXX"'))}</div>
        ${ui.field("Faculty advisor (optional)", ui.input("advisor", a.advisor || "", 'maxlength="200" placeholder="Name, department"'))}
        ${ui.field("Social media (optional)", ui.input("social", a.social || "", 'type="url" maxlength="200" placeholder="https://"'))}</section>
      <section class="card"><h2 class="cl-hd">3. Executive Committee (proposed)</h2><div id="rg-cms" class="stack" style="gap:8px">${com.map(cm).join("")}</div>
        <button type="button" class="btn sm outline mt-s" id="rg-addcm">${icon("plus", "sm")} Add person</button></section>
      <section class="card"><h2 class="cl-hd">4. Documents</h2><p class="xs">Club proposal, constitution, activity plan, committee list (PDF, Word or images, up to 10 MB each). Only you and the EWUdiots team can open them.</p>
        <div id="rg-docs" class="cl-list"></div><button type="button" class="btn sm outline mt-s" id="rg-up">${icon("upload", "sm")} Add document</button></section>
      <section class="card"><h2 class="cl-hd">5. Application Statement</h2>
        ${ui.field("Why should EWUdiots list this club?", ui.area("statement", a.statement || "", 'required rows="4" maxlength="1500" placeholder="We aim to create a collaborative space for students who…"'))}
        ${c ? "" : ui.field("Your position in the club", ui.input("pos", "", 'required maxlength="60" placeholder="President"'))}</section>
      <div id="cl-err"></div><button class="btn primary block lg">${icon("send")} ${c ? "Send updated application" : "Submit application"}</button>
      ${c ? `<button type="button" class="btn ghost block" id="rg-cancel">Cancel</button>` : ""}</form>`;
  }

  pages["club/register"].mount = (el) => {
    kit.bindRetry(el);
    const rows = store.peek("me:applications") || [], open = rows.find((c) => ["pending", "review", "revision"].includes(c.status));
    kit.$("#rg-edit", el)?.addEventListener("click", () => { editing = true; ctx.rerender(); });
    kit.$("#rg-cancel", el)?.addEventListener("click", () => { editing = false; ctx.rerender(); });
    const f = kit.$("#rg-f", el); if (!f) return;
    const docs = editing && open ? [...(open.application?.documents || [])] : [];
    const drawDocs = () => { kit.$("#rg-docs", el).innerHTML = docs.map((d, i) => `<div class="cl-li">${ui.ftype(d.name)}<span class="body"><b>${esc(d.name)}</b><span>${ui.size(d.size)}</span></span><button type="button" class="icon-btn" data-rmdoc="${i}" aria-label="Remove ${esc(d.name)}">${icon("x", "sm")}</button></div>`).join("");
      kit.$$("[data-rmdoc]", el).forEach((b) => b.addEventListener("click", () => { docs.splice(Number(b.dataset.rmdoc), 1); drawDocs(); })); };
    drawDocs();
    kit.$("#rg-up", el).addEventListener("click", async (e) => {
      if (docs.length >= 12) return kit.toast("Up to 12 documents", "error");
      const file = await ui.pickFile("application/pdf,.doc,.docx,.xls,.xlsx,image/*"); if (!file) return;
      if (file.size > 10e6) return kit.toast("Files can be up to 10 MB", "error", "Shrink or split the file.");
      const b = e.currentTarget; ctx.busy(b, true, "Uploading…");
      try { docs.push({ name: file.name.slice(0, 120), path: await api.uploadApplicationDoc(file), size: file.size }); drawDocs(); } catch (err) { kit.toast(err.message, "error"); } finally { ctx.busy(b, false); }
    });
    kit.$("#rg-addcm", el).addEventListener("click", () => { const n = kit.$$("[data-cm]", el).length; if (n >= 12) return; kit.$("#rg-cms", el).insertAdjacentHTML("beforeend", `<div class="rg-cm" data-cm>${["cn", "cr", "cd"].map((k, j) => `<input class="input" name="${k}${n}" maxlength="${[80, 60, 60][j]}" placeholder="${["Full name", "Position", "CSE · 2nd Year"][j]}" aria-label="${["Name", "Position", "Department and year"][j]}">`).join("")}</div>`); });
    f.addEventListener("submit", async (e) => {
      e.preventDefault(); const v = ui.values(f), btn = e.submitter;
      const committee = kit.$$("[data-cm]", el).map((_, i) => ({ name: String(v[`cn${i}`] || "").trim(), role: String(v[`cr${i}`] || "").trim(), dept: String(v[`cd${i}`] || "").trim() })).filter((p) => p.name);
      const app = { abbr: v.abbr || "", tagline: v.tagline, about: v.about, members: v.members, frequency: v.frequency, departments: v.departments, activities: v.activities, audience: v.audience, start: v.start, email: v.email, phone: v.phone, advisor: v.advisor, social: v.social, statement: v.statement, committee, documents: docs };
      if (!open && String(v.name || "").trim().length < 3) return ui.fail(f, "Add the club's full name.");
      if (String(v.statement || "").trim().length < 20) return ui.fail(f, "Write an application statement (at least 20 characters).");
      if (!open && String(v.pos || "").trim().length < 2) return ui.fail(f, "Add your position in the club.");
      if (v.social && !/^https:\/\//.test(v.social)) return ui.fail(f, "The social media link must start with https://");
      ctx.busy(btn, true, "Sending…");
      try {
        if (editing && open) await api.updateApplication(open.id, app); else await api.applyClub(v.name.trim(), v.cat, v.pos.trim(), app);
        editing = false; store.invalidate("me:"); kit.toast("Application sent", "success", "We'll message you in the app when it's reviewed."); window.scrollTo(0, 0);
      } catch (err) { ui.fail(f, err.message); } finally { ctx.busy(btn, false); }
    });
  };

  /* ═════════ Review (EWUdiots team) ═════════ */
  let rtab = "pending", rq = "", rcat = "all", rsort = "new";
  const team = () => { const g = kit.gate("club registrations"); if (g) return g; return kit.isPlatform() ? "" : ui.emptyBox("lock", "For the EWUdiots team", "Club registrations are reviewed by people with the clubs.verify permission."); };
  pages["club/registrations"] = () => {
    const g = team(); if (g) return g;
    const ce = store.use("platform:claims", api.admin.claims, { ttl: 30e3 });
    return `${kit.back("#/club/admin?tab=queue", "App Admin")}${ui.ph("Club Registration Requests", "Review new club applications and complete the verification process")}` + ui.view(ce, (rows) => {
      const n = (s) => rows.filter((c) => c.status === s).length;
      const words = rq.toLowerCase().split(/\s+/).filter(Boolean);
      const list = rows.filter((c) => c.status === rtab && (rcat === "all" || c.clubs?.category === rcat) && (!words.length || words.every((w) => `${c.clubs?.name} ${c.clubs?.category} ${c.application?.tagline || ""} ${c.name}`.toLowerCase().includes(w))))
        .sort((a, b) => (rsort === "old" ? 1 : -1) * (new Date(b.created_at) - new Date(a.created_at)) || (rsort === "name" ? String(a.clubs?.name).localeCompare(b.clubs?.name) : 0));
      return `<nav class="cl-seg">${Object.entries(ST).map(([k, [l]]) => `<button data-rt="${k}" aria-pressed="${rtab === k}">${k === "pending" ? "Pending" : l} <span class="n">${n(k)}</span></button>`).join("")}</nav>
        <div class="searchbar cl-search">${icon("search")}<input class="input" id="rg-q" type="search" placeholder="Search club name, category or keyword…" value="${esc(rq)}" autocomplete="off"></div>
        <div class="row nowrap mt-s" style="gap:8px">${ui.select("cat", [["all", "All Categories"], ...Object.entries(CATEGORIES)], rcat, 'id="rg-cat" aria-label="Category"')}${ui.select("sort", [["new", "Sort by: Newest"], ["old", "Oldest"], ["name", "Name"]], rsort, 'id="rg-sort" aria-label="Sort"')}</div>
        ${list.length ? `<div class="stack mt">${list.map(card).join("")}</div>` : ui.emptyBox("community", "No applications here", "New club applications show up in Pending.")}`;
    }, { n: 3, h: 150 });
  };
  const card = (c) => { const a = c.application || {}, cl = c.clubs || {}, open = ["pending", "review"].includes(c.status), isNew = cl.status === "pending" || cl.status === "archived";
    return `<article class="card rg-card"><div class="row nowrap" style="gap:12px;align-items:flex-start">${ui.logo(cl, "lg")}<div class="grow min0"><div class="row between" style="gap:8px"><b class="rg-name">${esc(cl.name || "")}</b>${ui.st(ST[c.status])}</div>
        <p class="xs">${esc(a.tagline || cl.tagline || (isNew ? "" : "Claim for a club already listed"))}</p><div class="cl-chips">${ui.pill(esc(CATEGORIES[cl.category] || "Club"), "blue")}${isNew ? ui.pill("New club", "purple") : ui.pill("Claim", "amber")}</div></div></div>
      <div class="rg-meta">${[["calendar", "Applied on", ui.dateShort(c.created_at)], ["users", "Proposed members", a.members || (a.committee || []).length || "–"], ["file", "Documents", ui.plural((a.documents || []).length, "file")]].map(([ic, l, v]) => `<span>${icon(ic, "sm")}<span><span class="xs">${l}</span><b>${esc(v)}</b></span></span>`).join("")}</div>
      <div class="rg-acts"><a class="btn sm soft" href="#/club/registration?id=${c.id}">${open ? "Review" : "View Details"}</a>${open ? `<button class="btn sm soft amber" data-rev="${c.id}">Request Revision</button><button class="btn sm soft green" data-ok="${c.id}">Approve</button><button class="btn sm soft red" data-no="${c.id}">Reject</button>` : ""}</div></article>`; };

  /** Approve / revise / reject with a note (shared by the list and the review page). */
  function decide(c, kind) {
    const name = esc(c.clubs?.name || "this club");
    if (kind === "ok") return ui.confirm(`Approve ${name}?`, "The club goes live, gets a verified badge, and the applicant becomes its Club Admin.", "Approve Club", async () => { await api.admin.reviewClaim(c.id, true, ""); store.invalidate("platform:", "clubs:"); kit.toast("Club approved", "success"); });
    ui.sheet(kind === "rev" ? "Request changes" : "Reject application", `<form class="stack" id="dc-f">${ui.field(kind === "rev" ? "What should the applicant change?" : "Reason (sent to the applicant)", ui.area("note", "", `rows="4" maxlength="300" ${kind === "rev" ? 'required minlength="5"' : ""} placeholder="${kind === "rev" ? "Please add the faculty advisor and the club constitution." : "A similar club already exists."}"`))}
      <div id="cl-err"></div><button class="btn ${kind === "rev" ? "primary" : "danger"} block">${kind === "rev" ? "Send request" : "Reject Application"}</button></form>`, (m) => kit.$("#dc-f", m).addEventListener("submit", async (e) => {
      e.preventDefault(); const note = String(ui.values(e.target).note || "").trim(), btn = e.submitter; ctx.busy(btn, true);
      try { if (kind === "rev") await api.admin.claimStep(c.id, "revision", note); else await api.admin.reviewClaim(c.id, false, note); ctx.closeModal(); store.invalidate("platform:"); kit.toast(kind === "rev" ? "Changes requested" : "Application rejected", "success"); }
      catch (err) { ui.fail(m, err.message); } finally { ctx.busy(btn, false); }
    }));
  }
  const bindDecisions = (el) => {
    const rows = store.peek("platform:claims") || [], find = (id) => rows.find((c) => c.id === id);
    kit.$$("[data-ok]", el).forEach((b) => b.addEventListener("click", () => decide(find(b.dataset.ok), "ok")));
    kit.$$("[data-rev]", el).forEach((b) => b.addEventListener("click", () => decide(find(b.dataset.rev), "rev")));
    kit.$$("[data-no]", el).forEach((b) => b.addEventListener("click", () => decide(find(b.dataset.no), "no")));
  };
  pages["club/registrations"].mount = (el) => {
    kit.bindRetry(el); bindDecisions(el);
    kit.$$("[data-rt]", el).forEach((b) => b.addEventListener("click", () => { rtab = b.dataset.rt; ctx.rerender(); }));
    kit.$("#rg-cat", el)?.addEventListener("change", (e) => { rcat = e.target.value; ctx.rerender(); });
    kit.$("#rg-sort", el)?.addEventListener("change", (e) => { rsort = e.target.value; ctx.rerender(); });
    const i = kit.$("#rg-q", el); i?.addEventListener("input", () => { rq = i.value; const p = i.selectionStart; ctx.rerender(); const n = kit.$("#rg-q"); if (n) { n.focus(); n.setSelectionRange(p, p); } });
  };

  let dtab = "overview";
  pages["club/registration"] = () => {
    const g = team(); if (g) return g;
    const id = kit.param("id"), ce = store.use("platform:claims", api.admin.claims, { ttl: 30e3 }), all = store.use("platform:clubs", api.admin.clubs, { ttl: 5 * 60e3 }).value || [];
    return kit.back("#/club/registrations", "Registration requests") + ui.view(ce, (rows) => {
      const c = rows.find((x) => x.id === id); if (!c) return ui.emptyBox("search", "Application not found", "");
      const a = c.application || {}, cl = c.clubs || {}, open = ["pending", "review", "revision"].includes(c.status), checks = quickChecks(c, all);
      const tabs = [["overview", "Overview"], ["team", "Executive Team"], ["docs", "Documents"], ["plan", "Activity Plan"], ["verify", "Verification"], ["history", "History"]];
      const facts = (list) => `<div class="cl-facts2">${list.map(([l, v, cls]) => `<div><span class="xs">${l}</span><b class="${cls || ""}">${v ? esc(v) : "—"}</b></div>`).join("")}</div>`;
      const checkList = `<ul class="rg-checks">${checks.map(([l, ok, extra]) => `<li class="${ok ? "ok" : "warn"}">${icon(ok ? "checkc" : "alertc", "sm")}<span>${esc(l)}${extra?.length ? ` <span class="xs">(${esc(extra.slice(0, 3).join(", "))})</span>` : ""}</span></li>`).join("")}</ul>`;
      const body = dtab === "team" ? ((a.committee || []).length ? `<div class="rg-team">${a.committee.map((p) => `<div class="card">${ui.ava(p.name)}<b>${esc(p.name)}</b><span>${esc(p.role)}</span><span class="xs">${esc(p.dept)}</span></div>`).join("")}</div>` : `<p class="small muted">No committee listed.</p>`)
        : dtab === "docs" ? ((a.documents || []).length ? `<section class="card tight">${a.documents.map((d, i) => `<div class="rs-file">${ui.ftype(d.name)}<span class="rs-open" style="cursor:default"><b>${esc(d.name)}</b><span class="xs">${ui.size(d.size)}</span></span><button class="btn sm soft" data-doc="${i}">View</button><button class="icon-btn" data-doc="${i}" aria-label="Download ${esc(d.name)}">${icon("download")}</button></div>`).join("")}</section>` : `<p class="small muted">No documents uploaded.</p>`)
        : dtab === "plan" ? `<section class="card">${facts([["Proposed activities", a.activities], ["Target members", a.audience], ["Meeting frequency", a.frequency], ["Proposed start", a.start], ["Social media", a.social]])}</section>`
        : dtab === "verify" ? `<section class="card"><h2 class="cl-hd">Quick Checks</h2>${checkList}</section><section class="card mt-s"><h2 class="cl-hd">Applicant</h2>${facts([["Name", c.name], ["Email", c.email], ["Position", c.position], ["Proof given", c.proof]])}</section>`
        : dtab === "history" ? `<section class="card"><ul class="cl-tl">${[["Submitted", c.created_at, true], [c.updated_at && c.updated_at !== c.created_at ? "Last change" : "", c.updated_at, true], [ST[c.status][0], c.status === "pending" ? null : c.updated_at, c.status !== "pending"]].filter(([l]) => l).map(([l, at, done]) => `<li class="${done ? "done" : "now"}"><span class="dot">${done ? icon("check", "sm") : ""}</span><span><b>${esc(l)}</b><span class="xs">${at ? ui.dateTime(at) : "Waiting"}</span></span><span></span></li>`).join("")}</ul>${c.review_note ? `<p class="small mt-s">Note to the applicant: “${esc(c.review_note)}”</p>` : ""}</section>`
        : `<section class="card"><div class="row between"><h2 class="cl-hd" style="margin:0">Club Information</h2></div><div class="mt-s">${facts([["Full Club Name", cl.name], ["Proposed Abbreviation", a.abbr || cl.short_name], ["Category", CATEGORIES[cl.category] || "Other", "rg-strong"], ["Expected Members", a.members, "rg-strong"], ["Proposed Department(s)", a.departments], ["Meeting Frequency", a.frequency, "rg-strong"], ["Contact Email", a.email || c.email, "rg-link"], ["Contact Number", a.phone], ["Faculty Advisor", a.advisor || "Not Assigned"], ["Short Description", a.tagline || cl.tagline]])}</div>
            ${a.about ? `<details class="mt-s"><summary class="small">Long description</summary><p class="small">${ui.rich(a.about)}</p></details>` : ""}</section>
          <div class="cl-row2 keep mt-s"><section class="card"><h2 class="cl-hd">Quick Checks</h2>${checkList}</section>
            <section class="card"><h2 class="cl-hd">Club Identity</h2><div class="row" style="gap:10px"><div><span class="xs">Proposed Logo</span>${ui.logo(cl, "xl")}</div><div class="grow min0"><span class="xs">Cover Image</span><div class="rg-cover">${cl.cover_url ? `<img src="${esc(cl.cover_url)}" alt="">` : `<b>${esc(cl.name || "")}</b>`}</div></div></div><p class="xs mt-s">The admin adds the real logo and cover after approval.</p></section></div>
          <section class="card mt-s"><h2 class="cl-hd">Application Statement</h2><blockquote class="ap-quote">“${esc(a.statement || c.proof || "No statement.")}”</blockquote></section>`;
      return `<header class="cl-ph"><div class="min0"><h1>Club Application Review</h1><p>Verify club details, documents and executive information</p></div><span class="cl-disclaimer">Application #${esc(c.id.slice(0, 8).toUpperCase())}</span></header>
        <section class="card row nowrap" style="gap:14px;align-items:flex-start">${ui.logo(cl, "xl")}<div class="grow min0"><h2 class="rg-title">${esc(cl.name || "")}</h2><p class="xs">${esc(a.tagline || cl.tagline || "")}</p><div class="cl-chips mt-s">${ui.pill(esc(CATEGORIES[cl.category] || "Club"), "blue")}${a.departments ? ui.pill(esc(a.departments.split(",")[0]), "pink") : ""}</div></div>
          <div class="rg-side">${ui.st(ST[c.status])}<span class="xs">Submitted on<br>${ui.dateShort(c.created_at)}</span>${c.status === "pending" ? `<button class="btn sm soft" id="rg-start">Start review</button>` : ""}</div></section>
        <nav class="cl-seg sm mt">${tabs.map(([v, l]) => `<button data-dt="${v}" aria-pressed="${dtab === v}">${l}</button>`).join("")}</nav>
        <div class="mt-s">${body}</div>
        ${open ? `<div class="cl-decide mt"><button class="ok" data-ok="${c.id}"><b>${icon("checkc")} Approve Club</b><span>Complete verification and activate</span></button><button class="rev" data-rev="${c.id}"><b>${icon("chat")} Request Changes</b><span>Ask for additional information</span></button><button class="no" data-no="${c.id}"><b>${icon("xc")} Reject Application</b><span>Decline this registration request</span></button></div>` : ""}`;
    }, { n: 3, h: 140 });
  };
  pages["club/registration"].mount = (el) => {
    kit.bindRetry(el); bindDecisions(el);
    const c = (store.peek("platform:claims") || []).find((x) => x.id === kit.param("id")); if (!c) return;
    kit.$$("[data-dt]", el).forEach((b) => b.addEventListener("click", () => { dtab = b.dataset.dt; ctx.rerender(); }));
    kit.$("#rg-start", el)?.addEventListener("click", async (e) => { const b = e.currentTarget; ctx.busy(b, true); try { await api.admin.claimStep(c.id, "review"); store.invalidate("platform:claims"); kit.toast("Marked Under Review", "success"); } catch (err) { kit.toast(err.message, "error"); } finally { ctx.busy(b, false); } });
    kit.$$("[data-doc]", el).forEach((b) => b.addEventListener("click", async () => { try { window.open(await api.signedUrl(c.application.documents[b.dataset.doc].path), "_blank", "noopener"); } catch (err) { kit.toast(err.message, "error"); } }));
  };
}
