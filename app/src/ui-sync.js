/* Portal sync: choose a method → scanning progress → review & confirm ("Data Sync Flow" board).
   Also the Chrome-extension bridge and the #ext= hand-off from the extension popup. */
import { readText, isImageFile } from "./ocr.js";

export function install(ctx) {
  const { pages, icon, esc, uid, $, $$, toast, openModal, closeModal, modalHead, busy } = ctx;
  const S = () => ctx.S;
  let pending = null, method = "img", stage = "pick", scan = null, extDetected = false, rvTab = "courses";

  const METHODS = [
    ["img", "image", "purple", "Upload a Screenshot", "Take or upload a screenshot from your EWU portal (routine, marks, etc)."],
    ["txt", "paste", "green", "Paste Data", "Copy and paste directly from the portal."],
    ["ext", "chrome", "blue", "Use Chrome Extension", "Sync with one click using our browser extension."]
  ];
  const brandHead = (back) => ctx.subHead("Sync portal", "Unofficial · not affiliated with EWU", back);
  const TIPS = [["reset", "Turn your phone sideways", "or tap Desktop site in your browser so the whole table fits."], ["search", "One table per screenshot", "Zoom until the text is sharp. Several screenshots are fine."], ["shield", "Crop out private info", "We skip NID, phone and address anyway."]];

  pages.sync = () => {
    if (pending) return reviewView();
    if (stage === "scan") return scanView();
    if (stage === "paste") return `${brandHead("#/sync")}<div style="max-width:640px;margin:0 auto">
      <h1 style="font-size:28px">Paste from the <span class="hl">EWU portal</span></h1>
      <ol class="small muted" style="padding-left:18px;margin:10px 0 14px;line-height:1.8"><li>Open a portal page (e.g. <b>My Class Schedule</b> → Show Courses).</li><li>Press <span class="kbd">Ctrl</span>+<span class="kbd">A</span> then <span class="kbd">Ctrl</span>+<span class="kbd">C</span>.</li><li>Paste below. Repeat for Grade Report, Degree Review, Advising Slip…</li></ol>
      <label class="field">Portal text<textarea class="input" id="paste-in" rows="10" placeholder="Paste here…"></textarea></label>
      <div class="row mt"><button class="btn neutral" id="sy-back">Back</button><button class="btn primary grow" id="parse-btn">${icon("sparkle")} Read my data</button></div></div>`;
    if (stage === "ext") return `${brandHead("#/sync")}<div style="max-width:640px;margin:0 auto">
      <h1 style="font-size:28px">Sync with the <span class="hl">Chrome extension</span></h1>
      <div class="card mt stack">
        <div class="row nowrap"><span class="itile blue">${icon("chrome")}</span><div class="grow"><b>1. Install the EWUdiots extension</b><p class="small muted">On a computer, in Chrome or Edge.</p></div></div>
        <div class="row nowrap"><span class="itile purple">${icon("globe")}</span><div class="grow"><b>2. Open your portal pages</b><p class="small muted">Profile, Class Schedule, Grade Report, Degree Review, Advising Slip, Offered Courses. Each saves automatically.</p></div></div>
        <div class="row nowrap"><span class="itile green">${icon("sync")}</span><div class="grow"><b>3. Press "Send to EWUdiots"</b><p class="small muted">Click the extension icon. Your data opens here for review.</p></div></div>
      </div>
      <div class="alert ${extDetected ? "green" : "amber"} mt" id="ext-status"><span class="a-ic">${icon(extDetected ? "check" : "info")}</span><div><b>${extDetected ? "Extension connected" : "Not connected on this page"}</b><p>${extDetected ? "Import everything the extension has saved." : "Click the extension icon and press Send to EWUdiots."}</p></div></div>
      <div class="row mt"><button class="btn neutral" id="sy-back">Back</button><button class="btn primary grow" id="ext-pull" ${extDetected ? "" : "disabled"}>${icon("download")} Import from extension</button></div></div>`;
    return `${brandHead(S().onboarded ? "#/home" : "#/welcome")}<div style="max-width:640px;margin:0 auto">
      <h1 style="font-size:30px;margin-top:8px">Sync your data<br>from the <span class="hl">EWU portal</span></h1>
      <p class="muted" style="margin:8px 0 18px">Choose a method to import your routine, courses, marks and more.</p>
      ${METHODS.map(([k, ic, tone, t, d]) => `<button class="method" data-m="${k}" aria-pressed="${method === k}"><span class="itile ${tone}">${icon(ic)}</span><span class="grow"><b>${t}</b><span>${d}</span></span>${icon("chevR")}</button>`).join("")}
      <input type="file" id="file-in" accept="image/*" multiple class="sr-only">
      <details class="card soft mt shot-tips"><summary><span class="itile sm yellow">${icon("bulb")}</span><b>Tips for screenshots that read well</b></summary>
        <div class="stack mt-s">${TIPS.map(([ic, t, d]) => `<div class="row nowrap top"><span class="itile sm purple">${icon(ic)}</span><div><b class="small">${t}</b><p class="xs">${d}</p></div></div>`).join("")}</div></details>
      ${ctx.cloud.enabled && ctx.C.user ? `<label class="row small mt-s"><input type="checkbox" class="check" id="smart" checked> ${icon("sparkle", "sm")} <b>Smart scan</b> (AI) reads tables more accurately</label>` : ""}
      <div class="privacy">${icon("shield")}<div><b>Your Privacy, Our Priority</b><p>We never read your NID, address, phone or password. Your data stays on your device and is used only to make your experience better.</p></div></div>
      <div class="row nowrap mt" style="align-items:flex-end"><div class="mascot-card" style="background:none;padding:0;min-height:0;flex:1"><img src="/img/mascot-thumbs.webp" alt="" style="width:120px;margin:0"><span class="scribble" style="font-size:22px;transform:rotate(-8deg)">Easy and<br>Secure!${ctx.swoosh}</span></div>
        <button class="btn primary lg" id="sy-go">Continue ${icon("arrow")}</button></div>
      ${!S().onboarded ? `<p class="xs" style="text-align:center;margin-top:14px"><a href="#" id="sy-demo">Just exploring? Try with demo data</a></p>` : ""}</div>`;
  };

  function scanView() {
    const s = scan, p = (k) => Math.round(s[k] * 100);
    const step = (k, l) => `<div class="sp ${s[k] >= 1 ? "done" : s.cur === k ? "cur" : ""}"><span class="dotc">${s[k] >= 1 ? icon("check") : ""}</span><div><b style="font-weight:500">${l}</b>${ctx.bar(p(k), "thin")}</div><span class="small muted num">${p(k)}%</span></div>`;
    return `${brandHead("#/sync")}<div style="max-width:560px;margin:0 auto">
      <h1 style="font-size:28px">Scanning your screenshot…</h1><p class="muted" style="margin-top:6px">We're extracting your classes, marks, and more. This may take a few seconds.</p>
      <img class="scan-art" src="/img/scan.webp" alt="" width="300" height="240">
      <div class="card mt"><div class="steps" aria-live="polite">${step("up", "Uploading image")}${step("ocr", "Reading text (OCR)")}${step("id", "Identifying courses & data")}${step("prep", "Preparing for review")}</div></div>
      ${s.found ? `<div class="card soft mt row nowrap top"><span class="itile yellow">${icon("bulb")}</span><div><b>Looks good so far!</b><p class="small muted">We've detected ${s.found}. Please review and confirm them on the next screen.</p></div></div>` : ""}
      ${s.error ? `<div class="alert red mt"><span class="a-ic">${icon("x")}</span><div class="grow"><b>Couldn't extract text</b><p>${esc(s.error)}</p></div></div><div class="row mt"><button class="btn neutral grow" id="sc-retry">Try Again</button><button class="btn outline grow" id="sc-paste">Paste text instead</button></div>` : ""}</div>`;
  }

  pages.sync.mount = (el) => {
    if (pending) return mountReview(el);
    if (stage === "scan") {
      const on = (s, fn) => { const b = $(s, el); b && b.addEventListener("click", fn); };
      on("#sc-retry", () => { stage = "pick"; scan = null; ctx.rerender(); setTimeout(() => $("#file-in")?.click(), 50); });
      on("#sc-paste", () => { stage = "paste"; scan = null; ctx.rerender(); });
      return;
    }
    const back = $("#sy-back", el); back && back.addEventListener("click", () => { stage = "pick"; ctx.rerender(); });
    if (stage === "paste") {
      $("#parse-btn", el).addEventListener("click", () => {
        const txt = $("#paste-in", el).value.trim();
        if (!txt) return toast("Paste some text from the portal first", "warn");
        finishParse([ctx.parsePortalText(txt)], "pasted text");
      });
      return;
    }
    if (stage === "ext") { $("#ext-pull", el).addEventListener("click", requestExtension); window.postMessage({ type: "EWUD_APP_PING" }, location.origin); return; }
    $$("[data-m]", el).forEach((b) => b.addEventListener("click", () => { method = b.dataset.m; $$("[data-m]", el).forEach((x) => x.setAttribute("aria-pressed", x === b)); if (method === "img") $("#file-in", el).click(); }));
    $("#file-in", el).addEventListener("change", (e) => { const files = [...e.target.files]; e.target.value = ""; readImages(files); });
    $("#sy-go", el).addEventListener("click", () => { if (method === "img") $("#file-in", el).click(); else { stage = method === "txt" ? "paste" : "ext"; ctx.rerender(); } });
    const demo = $("#sy-demo", el); demo && demo.addEventListener("click", (e) => { e.preventDefault(); ctx.loadDemo(); });
  };
  document.addEventListener("paste", (e) => {
    if (ctx.route() !== "sync" || pending || stage !== "pick") return;
    const files = [...(e.clipboardData?.items || [])].filter((i) => i.type.startsWith("image/")).map((i) => i.getAsFile());
    if (files.length) { e.preventDefault(); readImages(files); }
  });

  /* Normalise Smart-scan output to the on-device parser's shape. */
  function fromSmart(j) {
    const clean = (o) => Object.fromEntries(Object.entries(o || {}).filter(([, v]) => v !== "" && v !== 0 && v !== null));
    const rowFix = (r) => { const o = { ...r, start: r.start?.slice(0, 5), end: r.end?.slice(0, 5) }; if (!o.capacity) { delete o.capacity; delete o.enrolled; } return o; };
    return { profile: clean(j.profile), rules: clean(j.rules), routine: (j.routine || []).map(rowFix), offered: (j.offered || []).map(rowFix),
      grades: (j.grades || []).map((g) => ({ ...g, sem: ctx.normSemester(g.sem) })), faculty: j.faculty || [], degree: [], recommended: [],
      payments: { schedule: (j.payments || []).filter((p) => p.due && p.amount), fees: {} } };
  }
  const paint = () => { if (ctx.route() === "sync") ctx.rerender(); };
  async function readImages(files) {
    files = files.filter(isImageFile);
    if (!files.length) return toast("Choose a screenshot (PNG or JPG)", "warn", "Pick the picture from your gallery or files.");
    const smart = $("#smart")?.checked;
    stage = "scan"; scan = { up: 1, ocr: 0, id: 0, prep: 0, cur: "ocr", found: "" }; paint();
    const results = [], raws = [];
    for (const [i, f] of files.entries()) {
      try {
        if (smart) { results.push(fromSmart(await ctx.cloud.smartScan(f))); }
        else {
          const t = await readText(f,(pr) => { scan.ocr = (i + pr) / files.length; const b = $(".steps .sp:nth-child(2) .bar span"); if (b) b.style.width = Math.round(scan.ocr * 100) + "%"; });
          raws.push(t); results.push(ctx.parsePortalText(t));
        }
      } catch (err) { scan.error = `${err.message || "The file might be scanned or low quality."} Try a sharper screenshot, or paste the text instead.`; scan.cur = ""; paint(); return; }
    }
    scan.ocr = 1; scan.cur = "id"; paint();
    const r = mergeResults(results);
    scan.id = 1; scan.cur = "prep"; scan.found = summary(r) || ""; paint();
    if (isEmptyResult(r)) { scan.error = "We couldn't find portal data in that screenshot."; scan.cur = ""; paint(); return; }
    setTimeout(() => { scan.prep = 1; paint(); setTimeout(() => finishParse(null, smart ? "smart scan" : "screenshot", raws.join("\n\n—\n\n"), r), 600); }, 500);
  }
  const summary = (r) => [r.routine.length && `${new Set(r.routine.map((x) => x.code)).size} courses`, r.grades.length && `${r.grades.length} grades`, r.payments.schedule.length && `${r.payments.schedule.length} fee deadline${r.payments.schedule.length > 1 ? "s" : ""}`,
    r.offered.length && `${r.offered.length} offered sections`, r.degree.length && "degree progress", Object.keys(r.profile).length && "your profile"].filter(Boolean).join(", ").replace(/, ([^,]*)$/, " and $1");
  function mergeResults(list) {
    const out = ctx.mergeParsed(list);
    out.routine = out.routine.map((r) => ({ ...r, id: uid(), keep: true }));
    return out;
  }
  const isEmptyResult = (r) => !r.routine.length && !r.offered.length && !r.grades.length && !r.degree.length && !r.payments.schedule.length && !Object.keys(r.profile).length && !Object.keys(r.rules).length && !r.recommended.length;
  function finishParse(list, source, raw = "", merged = null) {
    const r = merged || mergeResults(list);
    r.source = source; r.raw = raw;
    if (isEmptyResult(r)) { toast("Couldn't find portal data in that", "warn", "Try another page or use Paste Data."); return null; }
    pending = r; stage = "pick"; scan = null; rvTab = r.routine.length ? "courses" : r.grades.length ? "grades" : r.payments.schedule.length ? "fees" : "personal";
    if (location.hash.startsWith("#/sync")) ctx.rerender(); else location.hash = "#/sync";
    return r;
  }
  const clearInbox = (r) => { if (r?.inboxIds?.length) ctx.cloud.clearInbox(r.inboxIds).catch((e) => console.warn("Inbox clear failed", e)); };

  /* ───────── Review ───────── */
  function reviewView() {
    const p = pending, sem = p.sem || S().routineSem || ctx.currentSemester();
    const other = p.offered.length + p.degree.length + Object.keys(p.rules).length + p.recommended.length;
    const tabs = [["courses", `Courses (${new Set(p.routine.map((r) => r.code)).size})`], ["grades", `Grades (${p.grades.length})`], ["fees", `Fees (${p.payments.schedule.length ? 1 : 0})`], ["personal", "Personal (1)"]].concat(other ? [["other", `Other (${(p.offered.length ? 1 : 0) + (p.degree.length ? 1 : 0) + (Object.keys(p.rules).length ? 1 : 0) + (p.recommended.length ? 1 : 0)})`]] : []);
    const fields = [["name", "Full name"], ["id", "Student ID"], ["program", "Program"], ["department", "Department"], ["advisor", "Advisor"], ["cgpa", "CGPA (portal)"], ["creditsDone", "Credits earned"], ["creditsTotal", "Credits required"]];
    let body = "";
    if (rvTab === "courses") body = p.routine.length ? `<div class="card-h"><h2><span class="itile sm purple">${icon("school")}</span> Your Courses</h2><span class="xs">${p.routine.length} items</span></div>
      <div class="row small" style="margin-bottom:6px"><label class="field" style="flex-direction:row;align-items:center;gap:8px">Semester <input class="input" id="rv-sem" value="${esc(sem)}" style="width:140px;min-height:38px"></label></div>
      <div class="table-wrap"><table class="rv-table" id="rv-table"><thead><tr><th><span class="sr-only">Include</span></th><th>Course Code</th><th>Course Title</th><th>Section</th><th>Days</th><th>Start</th><th>End</th><th>Room</th><th>Faculty</th><th>Lab</th><th></th></tr></thead><tbody>${p.routine.map(rvRow).join("")}</tbody></table></div>
      <div class="row between mt-s"><button class="btn outline sm" id="rv-add">${icon("plus")} Add Manually</button><label class="row small"><input type="checkbox" class="check" id="rv-all" ${p.routine.every((r) => r.keep) ? "checked" : ""}> Select All</label></div>
      <p class="xs mt-s">Days: S Sun · M Mon · T Tue · W Wed · R Thu · F Fri · A Sat. This replaces your current routine.</p>`
      : ctx.empty("icon:calendar", "No classes in this sync", "Sync your Class Schedule or Advising Slip to get your routine.");
    else if (rvTab === "grades") body = p.grades.length ? `<div class="table-wrap"><table class="rv-table"><thead><tr><th>Semester</th><th>Course</th><th>Title</th><th>Cr</th><th>Grade</th></tr></thead><tbody>${p.grades.map((g) => `<tr><td class="small">${esc(g.sem || "—")}</td><td><b>${esc(g.code)}</b></td><td class="small">${esc(g.title)}</td><td class="num">${esc(g.cr)}</td><td><span class="pill purple">${esc(g.g)}</span></td></tr>`).join("")}</tbody></table></div>` : ctx.empty("icon:bars", "No grades in this sync", "Sync your Grade Report to see your CGPA.");
    else if (rvTab === "fees") body = p.payments.schedule.length ? p.payments.schedule.map((x) => `<div class="lrow"><span class="itile ${x.late ? "orange" : "green"}">${icon("wallet")}</span><div class="body"><b>${x.late ? "With late fee" : "Regular deadline"}</b><span>${ctx.fmtDate(x.due)}</span></div><b class="num">${ctx.fmtMoney(x.amount)}</b></div>`).join("") : ctx.empty("icon:wallet", "No fees in this sync", "Sync your Advising / Deposit Slip to track payments.");
    else if (rvTab === "personal") body = `<div class="grid g2">${fields.map(([k, l]) => `<label class="field">${l}<input class="input" data-pf="${k}" value="${esc(p.profile[k] ?? S().profile?.[k] ?? "")}"></label>`).join("")}</div>`;
    else body = `<div class="stack">${p.offered.length ? `<div class="lrow"><span class="itile blue">${icon("calcheck")}</span><div class="body"><b>${p.offered.length} offered sections</b><span>${new Set(p.offered.map((o) => o.code)).size} courses for the advising planner${p.offeredSem ? ` · ${esc(p.offeredSem)}` : ""}</span></div></div>` : ""}
      ${p.degree.length ? `<div class="lrow"><span class="itile green">${icon("cap")}</span><div class="body"><b>Degree progress</b><span>${p.degree.length} requirement categories</span></div></div>` : ""}
      ${Object.keys(p.rules).length ? `<div class="lrow"><span class="itile purple">${icon("list")}</span><div class="body"><b>Advising rules</b><span>${Object.entries(p.rules).map(([k, v]) => `${esc(k)} ${esc(v)}`).join(" · ")}</span></div></div>` : ""}
      ${p.recommended.length ? `<div class="lrow"><span class="itile orange">${icon("star")}</span><div class="body"><b>Recommended courses</b><span>${p.recommended.map((r) => esc(r.code)).join(", ")}</span></div></div>` : ""}</div>`;
    return `<div class="sub-head"><button class="icon-btn" id="rv-x" aria-label="Discard">${icon("chevL")}</button><div style="text-align:center"><span class="logo" style="padding:0;align-items:center"><span class="word" style="font-size:24px">EWU<i>diots</i></span></span></div><div></div></div>
      <div style="max-width:980px;margin:0 auto">
      <h1>Review Your Data</h1><p class="muted" style="margin:6px 0 14px">We found the following information from ${esc(p.source)}. Please check and edit if needed.</p>
      ${ctx.seg(tabs, rvTab, "data-rv")}
      <section class="card mt">${body}</section>
      ${p.raw ? `<details class="mt"><summary class="small muted">Show the raw text we read</summary><pre class="raw">${esc(p.raw)}</pre></details>` : ""}
      <div class="row mt sticky-bottom"><button class="btn neutral lg" id="rv-cancel">Discard</button><button class="btn primary lg grow" id="rv-save">Confirm &amp; Continue ${icon("arrow")}</button></div></div>`;
  }
  const rvRow = (r) => `<tr data-id="${r.id}"><td><input type="checkbox" class="check" data-k="keep" ${r.keep ? "checked" : ""} aria-label="Include ${esc(r.code)}"></td>${["code", "title", "sec", "days", "start", "end", "room", "faculty"].map((k) => `<td><input class="input" data-k="${k}" value="${esc(r[k])}" aria-label="${k}" ${k === "start" || k === "end" ? 'type="time"' : ""} style="min-width:${k === "title" ? 150 : k === "room" ? 120 : k === "start" || k === "end" ? 104 : 64}px"></td>`).join("")}<td><input type="checkbox" class="check" data-k="lab" ${r.lab ? "checked" : ""} aria-label="Lab"></td><td><button class="btn sm icon-only ghost" data-del aria-label="Remove row">${icon("trash")}</button></td></tr>`;
  function readReview(el) {
    $$("[data-pf]", el).forEach((i) => { pending.profile[i.dataset.pf] = i.value.trim(); });
    const table = $("#rv-table", el);
    if (table) pending.routine = $$("tbody tr", table).map((tr) => {
      const o = { ...(pending.routine.find((r) => r.id === tr.dataset.id) || {}), id: tr.dataset.id };
      $$("[data-k]", tr).forEach((i) => { o[i.dataset.k] = i.type === "checkbox" ? i.checked : i.value.trim(); });
      o.code = o.code.toUpperCase().replace(/\s/g, ""); o.days = o.days.toUpperCase(); return o;
    });
    const sem = $("#rv-sem", el); if (sem) pending.sem = ctx.normSemester(sem.value) || ctx.currentSemester();
  }
  function mountReview(el) {
    const discard = () => { clearInbox(pending); pending = null; ctx.rerender(); };
    $("#rv-cancel", el).addEventListener("click", discard); $("#rv-x", el).addEventListener("click", discard);
    $$("[data-rv]", el).forEach((b) => b.addEventListener("click", () => { readReview(el); rvTab = b.dataset.rv; ctx.rerender(); }));
    const add = $("#rv-add", el);
    add && add.addEventListener("click", () => { readReview(el); pending.routine.push({ id: uid(), code: "", title: "", sec: "", days: "", start: "08:30", end: "10:00", room: "", faculty: "", keep: true }); ctx.rerender(); });
    const all = $("#rv-all", el); all && all.addEventListener("change", () => $$('[data-k="keep"]', el).forEach((c) => { c.checked = all.checked; }));
    const t = $("#rv-table", el);
    t && t.addEventListener("click", (e) => { if (e.target.closest("[data-del]")) e.target.closest("tr").remove(); });
    $("#rv-save", el).addEventListener("click", () => {
      readReview(el);
      pending.routine = pending.routine.filter((r) => r.keep);
      const bad = pending.routine.filter((r) => !r.code || !ctx.dayIdx(r.days).length || !r.start || !r.end || ctx.toMin(r.end) <= ctx.toMin(r.start));
      if (bad.length) { rvTab = "courses"; ctx.rerender(); return toast(`${bad.length} row(s) need a course code, valid days and times`, "error"); }
      pending.routine.forEach((r) => delete r.keep);
      applyParsed(pending);
      clearInbox(pending);
      pending = null; toast("Saved to your profile", "success", "Your routine, courses and progress are up to date."); ctx.go("#/home");
    });
  }
  function applyParsed(p) {
    const s = S();
    if (s.demo) { const keep = s.study.demo ? null : s.study; const theme = s.theme; ctx.resetState(); Object.assign(ctx.S, { theme }); if (keep) ctx.S.study = keep; }
    const St = S();
    const firstSync = !St.lastImport;
    const pf = Object.fromEntries(Object.entries(p.profile).filter(([, v]) => v !== "" && v !== undefined));
    ["cgpa", "creditsDone", "creditsTotal"].forEach((k) => { if (pf[k] !== undefined) pf[k] = Number(pf[k]) || undefined; });
    St.profile = Object.assign({ name: "Student", id: "", creditsTotal: 140, semester: ctx.currentSemester() }, St.profile || {}, pf, { source: p.source });
    if (p.routine.length) { St.routine = p.routine; St.routineSem = p.sem || ctx.currentSemester(); }
    if (p.grades.length) {
      const key = (g) => g.code + "|" + (g.sem || "");
      const have = new Map(St.grades.map((g) => [key(g), g]));
      p.grades.forEach((g) => {
        if (!g.sem && St.grades.some((x) => x.code === g.code)) return; // degree-review rows without semester
        have.set(key(g), { ...have.get(key(g)), ...g, id: have.get(key(g))?.id || uid() });
      });
      St.grades = [...have.values()];
    }
    if (p.offered.length) {
      const sem = p.offeredSem || ctx.nextSemesterGuess();
      St.planner.offered = { ...(St.planner.offeredSem === sem ? St.planner.offered : {}), ...ctx.offeredToPlanner(p.offered, St.planner.offered || {}) };
      St.planner.offeredSem = sem; St.planner.courses = St.planner.courses.filter((c) => St.planner.offered[c]); St.planner.pins = {};
    }
    p.faculty.forEach((f) => { St.faculty[f.init] = { ...St.faculty[f.init], ...Object.fromEntries(Object.entries(f).filter(([, v]) => v)) }; });
    if (p.payments.schedule.length) St.payments = { ...p.payments, semester: p.payments.semester || St.routineSem || ctx.currentSemester() };
    if (p.degree.length) St.degree = p.degree;
    if (Object.keys(p.rules).length) St.rules = { ...St.rules, ...p.rules };
    if (p.recommended.length) St.recommended = p.recommended;
    St.demo = false; St.onboarded = true; St.lastImport = new Date().toISOString();
    ctx.logEvent("System", "sync", "teal", "Portal synced", summary(p) ? `Imported ${summary(p)}.` : "Your data is up to date.", "#/home");
    ctx.save();
    ctx.study.award(firstSync ? 30 : 10, "portal synced");
    if (ctx.C.user) {
      ctx.cloud.contribute({ semester: St.routineSem, rows: p.routine, faculty: p.faculty }).catch(() => {});
      if (p.offered.length) ctx.cloud.contribute({ semester: St.planner.offeredSem, rows: p.offered }).catch(() => {});
    }
  }

  /* ───────── Extension bridge (extension/bridge.js) ───────── */
  window.addEventListener("message", (e) => {
    if (e.source !== window || !e.data || typeof e.data !== "object") return;
    if (e.data.type === "EWUD_EXT_READY") {
      extDetected = true;
      if (ctx.route() === "sync" && stage === "ext") ctx.rerender();
    }
    if (e.data.type === "EWUD_EXT_DATA") importExtPages(e.data.payload?.pages || []);
  });
  function importExtPages(list) {
    if (!list.length) { toast("No portal pages saved yet", "warn", "Open the portal and the extension saves each page."); return null; }
    return finishParse(list.map((pg) => ctx.parsePortalText(pg.text || "")), `extension (${list.map((p) => p.page).join(", ")})`);
  }
  function requestExtension() { window.postMessage({ type: "EWUD_APP_REQUEST" }, location.origin); }
  window.postMessage({ type: "EWUD_APP_PING" }, location.origin);
  /* The extension popup's "Send to EWUdiots" opens app.html#ext=<base64url JSON>.
     It works on any domain, and a URL fragment is never sent to a server. */
  function takeExtHandoff() {
    const m = location.hash.match(/^#ext=([\w-]+)/);
    if (!m) return;
    history.replaceState(null, "", "#/sync");
    try {
      const bin = atob(m[1].replace(/-/g, "+").replace(/_/g, "/"));
      importExtPages(JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)))).pages || []);
    } catch { toast("Couldn't read the data from the extension", "error", "Press Send to EWUdiots again."); }
    ctx.rerender();
  }
  /* Pages the extension saved to this account: open them for review, then empty the inbox. */
  let inboxBusy = false;
  async function checkInbox() {
    if (inboxBusy || !ctx.C.user || pending || ctx.modalOpen()) return; // never replace a review that's open
    inboxBusy = true;
    try {
      const rows = await ctx.cloud.fetchInbox();
      if (!rows.length) return false;
      const latest = new Map(); // newest copy of each page kind wins
      rows.flatMap((r) => r.pages || []).forEach((p) => latest.set(p.kind || p.page, p));
      const ids = rows.map((r) => r.id), r = importExtPages([...latest.values()]);
      if (!r) { await ctx.cloud.clearInbox(ids); return false; } // nothing usable in them
      r.inboxIds = ids; // deleted from the account once you Save or Discard
      toast("Portal pages from your Chrome extension", "info", "Check them and press Save.");
      return true;
    } catch (e) { console.warn("Inbox check failed", e); return false; }
    finally { inboxBusy = false; }
  }
  return { takeExtHandoff, checkInbox, openSync: (m) => { method = m; stage = m === "img" ? "pick" : m === "txt" ? "paste" : "ext"; ctx.go("#/sync"); } };
}
