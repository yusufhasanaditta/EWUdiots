/* Academic screens: routine, advising planner (browse → selected → best combinations), CGPA, degree progress,
   what-if calculator, marks & attendance estimator, deadlines, fees. */
export function install(ctx) {
  const { pages, icon, esc, uid, $, $$, toast, openModal, closeModal, modalHead, confirmModal } = ctx;
  const S = () => ctx.S;
  const W7 = [1, 2, 3, 4, 5, 6, 0]; // Mon → Sun, as on the routine board
  const DS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  /* ═════════════ ROUTINE ═════════════ */
  let rView = "grid", rWeek = 0, rDay = new Date().getDay();
  const weekStart = () => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + rWeek * 7); return d; };
  pages.routine = () => {
    const St = S();
    if (!St.routine.length) return `${ctx.head("My Routine", St.routineSem || "")}<div class="card">${ctx.empty("mascot-reading", "No Classes Yet", "Sync your Class Schedule, build one in the advising planner, or add classes by hand.",
      `<div class="row center"><a class="btn primary" href="#/sync">${icon("sync")} Sync Portal</a><button class="btn" id="add-class">${icon("plus")} Add Class</button></div>`)}</div>`;
    const blocks = ctx.expand(St.routine);
    const clashes = new Set();
    blocks.forEach((a, i) => blocks.forEach((b, j) => { if (i < j && ctx.overlaps(a, b)) { clashes.add(a.id + a.day); clashes.add(b.id + b.day); } }));
    const nCourses = new Set(St.routine.map((r) => r.code)).size;
    const ws = weekStart(), we = new Date(ws); we.setDate(ws.getDate() + 6);
    const range = `${ws.getDate()}${ws.getMonth() !== we.getMonth() ? " " + ws.toLocaleDateString("en-GB", { month: "short" }) : ""} – ${we.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`;
    const dayBlocks = blocks.filter((b) => b.day === rDay).sort((a, b) => a.s - b.s);
    return `${ctx.demoBanner()}<div class="d-only">${ctx.head("My Routine", `${esc(St.routineSem || "")} · ${nCourses} Courses`,
      `${ctx.seg([["grid", "Weekly View"], ["list", "List View"]], rView, "data-rv")}<button class="btn outline" id="ics-btn">${icon("plus")} Add to Google Calendar</button>`)}
      <div class="row between" style="margin-bottom:12px"><div class="row"><button class="btn sm icon-only neutral" id="wk-prev" aria-label="Previous week">${icon("chevL")}</button><button class="btn sm icon-only neutral" id="wk-next" aria-label="Next week">${icon("chevR")}</button><b>${range}</b></div>
        <div class="row"><button class="btn sm" id="add-class">${icon("plus")} Add Class</button><button class="btn sm" id="share-btn">${icon("share")} Share</button><button class="btn sm ${rWeek ? "" : "neutral"}" id="wk-now">${icon("calendar")} This Week</button></div></div>
      ${clashes.size ? `<div class="alert red" style="margin-bottom:12px"><span class="a-ic">${icon("alert")}</span><div><b>Time clash detected</b><p>Outlined classes overlap. Tap one to edit it.</p></div></div>` : ""}
      ${rView === "grid" ? weekGrid(blocks, clashes, ws) : listView(blocks)}
      <div class="section-h"><h2>Upcoming Classes</h2><a class="see" href="#/courses">See All</a></div>
      <div class="dtiles">${upcoming(blocks).map((b) => `<a class="dtile" href="#/course?c=${encodeURIComponent(b.code)}"><span class="itile ${ctx.toneFor(b.code)}">${icon("calendar")}</span><div class="min0"><b>${esc(b.code)}</b><span class="ellipsis" style="display:block">${esc(b.title || "")}</span><span>${b.when} · ${esc(b.room || "TBA")}</span></div></a>`).join("")}</div></div>

      <div class="m-only">
        <div class="row between" style="margin:4px 0 14px"><div><h1>My Routine</h1><p class="sub muted">${esc(St.routineSem || "")} · ${nCourses} Courses</p></div><div class="row"><button class="icon-btn" id="ics-btn-m" aria-label="Add to Google Calendar">${icon("calendar")}</button><button class="icon-btn" id="r-menu" aria-label="More options">${icon("morev")}</button></div></div>
        <div class="day-chips" role="group" aria-label="Day">${[0, 1, 2, 3, 4, 5, 6].map((d) => `<button data-day="${d}" aria-pressed="${rDay === d}">${DS[d]}<span class="dot ${blocks.some((b) => b.day === d) ? "" : "none"}"></span></button>`).join("")}</div>
        <div class="mt">${ctx.seg([["grid", `${icon("list")} List View`], ["cal", `${icon("calendar")} Calendar View`]], rView === "list" ? "grid" : rView === "grid" ? "grid" : "cal", "data-rvm", "fill")}</div>
        ${clashes.size ? `<div class="alert red mt"><span class="a-ic">${icon("alert")}</span><div><b>Time clash detected</b><p>Some classes overlap.</p></div></div>` : ""}
        ${rView === "cal" ? `<div class="mt">${weekGrid(blocks, clashes, ws)}</div>` : `<div class="mt">${dayBlocks.length ? dayBlocks.map((b) => `<a class="tblock" href="#/course?c=${encodeURIComponent(b.code)}" style="--cc:${ctx.colorFor(b.code)}"><span class="tt">${ctx.fmtShort(b.s)}<br>${ctx.fmtShort(b.e)}</span><div class="min0"><b>${esc(b.code)}${b.lab ? " Lab" : ""}</b><span>${esc(b.title || "")}</span><span class="xs" style="display:flex;gap:4px;align-items:center">${icon("room", "sm")} ${esc(b.room || "TBA")}</span></div>${icon("chevR")}</a>`).join("")
          : ctx.empty("mascot-reading", "No Classes Today", "Take a break or get ahead!", `<a class="btn sm" href="#/focus">${icon("target")} Explore Focus</a>`)}</div>
        ${dayBlocks.length ? `<h3 class="mt">${["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][rDay]} · ${dayBlocks.length} Class${dayBlocks.length > 1 ? "es" : ""}</h3><section class="card tight mt-s">${dayBlocks.map((b) => `<div class="lrow"><span style="width:4px;height:36px;border-radius:3px;background:${ctx.colorFor(b.code)}"></span><b style="width:72px">${esc(b.code)}</b><div class="body"><b style="font-size:13.5px">${esc(b.title || (b.lab ? "Lab" : "Class"))}</b><span>${ctx.fmt12(b.s)} – ${ctx.fmt12(b.e)} | ${esc(b.room || "TBA")}</span></div><button class="btn sm icon-only ghost" data-edit="${b.id}" aria-label="Edit ${esc(b.code)}">${icon("more")}</button></div>`).join("")}</section>` : ""}`}
        <button class="btn primary block lg mt" id="ics-btn-m2">${icon("calendar")} Export to Google Calendar</button>
      </div>`;
  };
  function upcoming(blocks) {
    const now = new Date(), nd = now.getDay(), nm = now.getHours() * 60 + now.getMinutes(), out = [];
    for (let k = 0; k < 7 && out.length < 4; k++) {
      const d = (nd + k) % 7;
      blocks.filter((b) => b.day === d && !(k === 0 && b.e <= nm)).sort((a, b) => a.s - b.s).forEach((b) => out.length < 4 && out.push({ ...b, when: `${k === 0 ? "Today" : k === 1 ? "Tomorrow" : DS[d]} · ${ctx.fmt12(b.s)}` }));
    }
    return out;
  }
  function weekGrid(blocks, clashes, ws) {
    const startH = Math.min(8, ...blocks.map((b) => Math.floor(b.s / 60))), endH = Math.max(18, ...blocks.map((b) => Math.ceil(b.e / 60)));
    const PX = 0.9, H = (endH - startH) * 60 * PX + 16, y = (m) => (m - startH * 60) * PX + 8;
    const now = new Date(), nm = now.getHours() * 60 + now.getMinutes(), hrs = []; for (let h = startH; h <= endH; h++) hrs.push(h);
    const dateOf = (d) => { const x = new Date(ws); x.setDate(ws.getDate() + W7.indexOf(d)); return x; };
    const isToday = (d) => dateOf(d).toDateString() === now.toDateString();
    return `<div class="cal-wrap"><div class="cal" style="--days:7">
      <div class="cal-h"></div>${W7.map((d) => `<div class="cal-h ${isToday(d) ? "today" : ""}">${DS[d]}<small>${dateOf(d).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</small></div>`).join("")}
      <div class="cal-hours" style="height:${H}px">${hrs.map((h) => `<span class="cal-hour" style="top:${y(h * 60)}px">${h % 12 || 12}:00 ${h >= 12 ? "PM" : "AM"}</span>`).join("")}</div>
      ${W7.map((d) => `<div class="cal-col" style="height:${H}px">${hrs.map((h) => `<div class="cal-line" style="top:${y(h * 60)}px"></div>`).join("")}
        ${isToday(d) && nm > startH * 60 && nm < endH * 60 ? `<div class="cal-now" style="top:${y(nm)}px"></div>` : ""}
        ${blocks.filter((b) => b.day === d).map((b) => `<button class="cal-blk ${clashes.has(b.id + b.day) ? "clash" : ""}" data-edit="${b.id}" style="top:${y(b.s)}px;height:${Math.max(30, (b.e - b.s) * PX - 2)}px;--cc:${ctx.colorFor(b.code)}" aria-label="${esc(b.code)} ${DS[b.day]} ${ctx.fmt12(b.s)}"><span class="tm">${ctx.fmtShort(b.s)}–${ctx.fmtShort(b.e)}</span><b>${esc(b.code)}${b.lab ? " Lab" : ""}</b>${esc(b.room || "")}</button>`).join("")}</div>`).join("")}
    </div></div>`;
  }
  function listView(blocks) {
    return `<div class="grid g3">${W7.filter((d) => blocks.some((b) => b.day === d)).map((d) => { const bs = blocks.filter((b) => b.day === d).sort((a, b) => a.s - b.s); return `<section class="card"><h3>${["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][d]}</h3><div class="sched mt-s">${bs.map((b) => `<button class="sitem" data-edit="${b.id}" style="--cc:${ctx.colorFor(b.code)};text-align:left;cursor:pointer;width:100%"><div class="grow min0"><span class="when">${ctx.fmt12(b.s)} – ${ctx.fmt12(b.e)}</span><b>${esc(b.code)}${b.lab ? " Lab" : ""}</b><span class="xs">${esc(b.room || "TBA")} · ${esc(ctx.facName(b.faculty))}</span></div>${icon("edit", "sm")}</button>`).join("")}</div></section>`; }).join("")}</div>`;
  }
  pages.routine.mount = (el) => {
    const on = (s, fn) => $$(s, el).forEach((b) => b.addEventListener("click", fn));
    on("[data-rv]", (e) => { rView = e.currentTarget.dataset.rv; ctx.rerender(); });
    on("[data-rvm]", (e) => { rView = e.currentTarget.dataset.rvm; ctx.rerender(); });
    on("[data-day]", (e) => { rDay = Number(e.currentTarget.dataset.day); ctx.rerender(); });
    on("[data-edit]", (e) => editClass(e.currentTarget.dataset.edit));
    on("#add-class", () => editClass(null));
    on("#ics-btn, #ics-btn-m, #ics-btn-m2", icsModal);
    on("#wk-prev", () => { rWeek--; ctx.rerender(); }); on("#wk-next", () => { rWeek++; ctx.rerender(); }); on("#wk-now", () => { rWeek = 0; ctx.rerender(); });
    on("#share-btn", shareRoutine);
    on("#r-menu", () => openModal(modalHead("Routine") + `<div class="stack" style="gap:0">
      <button class="lrow" id="rm-add"><span class="itile purple">${icon("plus")}</span><span class="body"><b>Add a class</b><span>Put a class on your routine</span></span></button>
      <button class="lrow" id="rm-share"><span class="itile blue">${icon("share")}</span><span class="body"><b>Share routine</b><span>Send it to friends</span></span></button>
      <a class="lrow" href="#/sync" data-close><span class="itile teal">${icon("sync")}</span><span class="body"><b>Re-sync from portal</b><span>Replace with your latest schedule</span></span></a></div>`, (m) => {
      $("#rm-add", m).addEventListener("click", () => { closeModal(); editClass(null); });
      $("#rm-share", m).addEventListener("click", () => { closeModal(); shareRoutine(); });
    }));
    if (ctx.qparam("add")) { history.replaceState(null, "", "#/routine"); setTimeout(() => editClass(null)); }
  };
  async function shareRoutine() {
    const lines = W7.map((d) => { const bs = ctx.expand(S().routine).filter((b) => b.day === d).sort((a, b) => a.s - b.s); return bs.length ? `${DS[d]}: ${bs.map((b) => `${b.code}${b.lab ? " Lab" : ""} ${ctx.fmt12(b.s)} (${b.room})`).join(", ")}` : ""; }).filter(Boolean);
    try { const r = await ctx.native.share({ title: "My EWU routine", text: `My routine — ${S().routineSem}\n${lines.join("\n")}\n\nMade with EWUdiots` }); if (r === "copied") toast("Routine copied to clipboard"); } catch { /* share cancelled */ }
  }
  function editClass(id) {
    const c = S().routine.find((r) => r.id === id) || { code: "", title: "", sec: "", days: "", start: "08:30", end: "10:00", room: "", faculty: "", lab: false };
    openModal(modalHead(id ? `Edit ${c.code}` : "Add to My Routine") + `<form id="cls-form" class="grid g2">
      ${[["code", "Course code", "", "e.g. CSE211"], ["title", "Course title", "", "Database Systems"], ["sec", "Section", "", "1"], ["days", "Days", "", "MW, ST, R…"], ["start", "Start", "time"], ["end", "End", "time"], ["room", "Room", "", "AB2-704"], ["faculty", "Faculty initials", "", "ABC"]]
        .map(([k, l, t, ph]) => `<label class="field">${l}<input class="input" name="${k}" type="${t || "text"}" value="${esc(c[k])}" placeholder="${ph || ""}" ${["code", "days", "start", "end"].includes(k) ? "required" : ""}></label>`).join("")}
      <label class="row small full-row"><input type="checkbox" class="check" name="lab" ${c.lab ? "checked" : ""}> Lab session</label>
      <p class="hint full-row">Days use the portal letters: S Sun · M Mon · T Tue · W Wed · R Thu · F Fri · A Sat.</p>
      <div class="row full-row" style="margin-top:4px">${id ? `<button type="button" class="btn danger-soft" id="cls-del">${icon("trash")} Remove</button>` : ""}<button type="button" class="btn neutral grow" data-close>Cancel</button><button class="btn primary grow">${id ? "Save" : "Add"}</button></div></form>`, (m) => {
      $("#cls-form", m).addEventListener("submit", (e) => {
        e.preventDefault(); const f = Object.fromEntries(new FormData(e.target));
        f.code = f.code.toUpperCase().replace(/\s/g, ""); f.days = f.days.toUpperCase().replace(/[^SMTWRFA]/g, ""); f.lab = !!f.lab; f.faculty = f.faculty.toUpperCase();
        if (!ctx.dayIdx(f.days).length) return toast("Days must use S M T W R F A", "error");
        if (ctx.toMin(f.end) <= ctx.toMin(f.start)) return toast("End time must be after start", "error");
        if (id) Object.assign(c, f); else S().routine.push({ ...f, id: uid() });
        if (!S().routineSem) S().routineSem = ctx.currentSemester();
        ctx.save(); closeModal(); ctx.rerender(); toast(id ? "Routine updated" : "Course added to routine!", "success", `${f.code} ${f.title || ""}`.trim());
      });
      const del = $("#cls-del", m); del && del.addEventListener("click", () => { S().routine = S().routine.filter((r) => r.id !== id); ctx.save(); closeModal(); ctx.rerender(); toast("Class removed", "info"); });
    });
  }
  function icsModal() {
    openModal(modalHead("Add to Google Calendar") + `<p class="muted small">Download a calendar file with weekly repeating classes. Open it on your phone, or in Google Calendar go to Settings → Import &amp; export → Import.</p>
      <div class="grid g2 mt"><label class="field">Semester starts<input class="input" type="date" id="ics-start" value="${new Date().toISOString().slice(0, 10)}"></label><label class="field">Weeks<input class="input" type="number" id="ics-weeks" value="14" min="1" max="20"></label></div>
      <label class="row small mt"><input type="checkbox" class="check" id="ics-alarm" checked> Remind me 15 minutes before each class</label>
      <div class="row mt"><button class="btn neutral grow" data-close>Cancel</button><button class="btn primary grow" id="ics-go">${icon("download")} Download .ics</button></div>`, (m) => {
      $("#ics-go", m).addEventListener("click", () => { downloadICS($("#ics-start", m).value, Number($("#ics-weeks", m).value), $("#ics-alarm", m).checked); closeModal(); });
    });
  }
  function downloadICS(startDate, weeks, alarm) {
    const BY = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"], pad = (n) => String(n).padStart(2, "0");
    const base = new Date(startDate + "T00:00:00");
    const stamp = new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
    const ev = S().routine.flatMap((c) => ctx.dayIdx(c.days).map((d) => {
      const first = new Date(base); first.setDate(base.getDate() + ((d - base.getDay() + 7) % 7));
      const dt = (t) => `${first.getFullYear()}${pad(first.getMonth() + 1)}${pad(first.getDate())}T${t.replace(":", "")}00`;
      return ["BEGIN:VEVENT", `UID:${c.id}-${d}@ewudiots`, `DTSTAMP:${stamp}`, `DTSTART;TZID=Asia/Dhaka:${dt(c.start)}`, `DTEND;TZID=Asia/Dhaka:${dt(c.end)}`,
        `RRULE:FREQ=WEEKLY;COUNT=${weeks};BYDAY=${BY[d]}`, `SUMMARY:${c.code}${c.lab ? " Lab" : ""} ${c.title || ""}`.trim(), `LOCATION:${c.room || ""}`, `DESCRIPTION:Section ${c.sec || "-"} · ${c.faculty || ""}`,
        ...(alarm ? ["BEGIN:VALARM", "TRIGGER:-PT15M", "ACTION:DISPLAY", `DESCRIPTION:${c.code} in 15 minutes`, "END:VALARM"] : []), "END:VEVENT"].join("\r\n");
    }));
    const ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//EWUdiots//Routine//EN", "CALSCALE:GREGORIAN", "BEGIN:VTIMEZONE", "TZID:Asia/Dhaka", "BEGIN:STANDARD", "DTSTART:19700101T000000", "TZOFFSETFROM:+0600", "TZOFFSETTO:+0600", "END:STANDARD", "END:VTIMEZONE", ...ev, "END:VCALENDAR"].join("\r\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([ics], { type: "text/calendar" })); a.download = "ewu-routine.ics"; a.click();
    toast("Calendar file downloaded", "success", "Open it to add your classes.");
  }

  /* ═════════════ ADVISING PLANNER ═════════════ */
  function generateCombos() {
    const P = S().planner, O = ctx.offered(), F = P.filters, maxPerDay = S().rules.maxPerDay || 0;
    const lists = P.courses.map((code) => {
      let secs = O[code]?.sections || [];
      if (P.pins[code]) secs = secs.filter((s) => s.sec === P.pins[code]);
      else {
        if (F.hideFull) secs = secs.filter((s) => s.seats === undefined || s.seats > 0);
        if (F.noEarly) secs = secs.filter((s) => ctx.sectionBlocks(code, s).every((b) => b.s >= 600));
        if (F.daysOff.length) secs = secs.filter((s) => ctx.sectionBlocks(code, s).every((b) => !F.daysOff.includes(b.day)));
      }
      return secs.map((s) => ({ code, s, blocks: ctx.sectionBlocks(code, s) }));
    });
    if (lists.some((l) => !l.length)) return { combos: [], blocked: P.courses.filter((_, i) => !lists[i].length) };
    const combos = [], LIMIT = 3000;
    (function walk(i, picked, blocks) {
      if (combos.length >= LIMIT) return;
      if (i === lists.length) { combos.push(picked.slice()); return; }
      for (const opt of lists[i]) {
        if (opt.blocks.some((b) => blocks.some((x) => ctx.overlaps(b, x)))) continue;
        const next = blocks.concat(opt.blocks);
        if (maxPerDay && opt.blocks.some((b) => new Set(next.filter((x) => x.day === b.day && !x.lab).map((x) => x.code)).size > maxPerDay)) continue;
        picked.push(opt); walk(i + 1, picked, next); picked.pop();
      }
    })(0, [], []);
    const fac = ctx.facultyIndex();
    return { blocked: [], combos: combos.map((c) => {
      const bl = c.flatMap((o) => o.blocks), days = new Set(bl.map((b) => b.day));
      let gaps = 0; days.forEach((d) => { const xs = bl.filter((b) => b.day === d).sort((a, b) => a.s - b.s); for (let k = 1; k < xs.length; k++) gaps += Math.max(0, xs[k].s - xs[k - 1].e - 10); });
      const rated = c.map((o) => fac.get(o.s.faculty)?.rating).filter(Boolean);
      const rating = rated.length ? rated.reduce((a, b) => a + b, 0) / rated.length : 0;
      const early = bl.filter((b) => b.s < 600).length, lastEnd = Math.max(...bl.map((b) => b.e));
      const seats = Math.min(...c.map((o) => o.s.seats ?? 99));
      return { c, bl, days: days.size, gaps, rating, early, lastEnd, seats, score: days.size * 60 + gaps * 0.5 - rating * 25 + early * 10 };
    }) };
  }
  let pSort = "best", pDay = "all", pTime = "any", pQ = "";
  const SORTS = { best: (a, b) => a.score - b.score, gaps: (a, b) => a.gaps - b.gaps || a.score - b.score, early: (a, b) => a.lastEnd - b.lastEnd || a.score - b.score, rating: (a, b) => b.rating - a.rating || a.score - b.score };
  const crOf = (code) => ctx.offered()[code]?.cr || 3;
  const plannerNote = () => S().planner.offered ? "" : S().demo ? `<div class="alert purple" style="margin-bottom:12px"><span class="a-ic">${icon("info")}</span><div><b>Demo course list</b><p>Sync the portal's Offered Courses page to plan with real sections and seats.</p></div></div>`
    : `<div class="card">${ctx.empty("icon:calcheck", "No offered courses yet", "On the portal open <b>Offered Courses</b>, choose your department and next semester, press <b>Show Offered Courses</b>, then sync that page here.", `<a class="btn primary" href="#/sync">${icon("sync")} Sync Offered Courses</a>`)}</div>`;
  pages.planner = () => {
    const St = S(), P = St.planner, O = ctx.offered(), R = St.rules;
    const note = plannerNote();
    if (!Object.keys(O).length) return `${ctx.head("Advising Planner", "Find the best course combination for your next semester.", "", ctx.art("mascot-laptop", "Plan smart,<br>study happy!"))}${note}`;
    const rec = new Set(St.recommended.map((r) => r.code)), fac = ctx.facultyIndex();
    const q = pQ.trim().toUpperCase();
    const tOK = (s) => pTime === "any" || (pTime === "morning" ? ctx.toMin(s.start) < 720 : pTime === "afternoon" ? ctx.toMin(s.start) >= 720 && ctx.toMin(s.start) < 1020 : ctx.toMin(s.start) >= 1020);
    const dOK = (s) => pDay === "all" || ctx.dayIdx(s.days).includes(Number(pDay));
    const codes = Object.keys(O).filter((c) => (!q || c.includes(q.replace(/\s/g, "")) || (O[c].title || "").toUpperCase().includes(q) || O[c].sections.some((s) => (ctx.facName(s.faculty) || "").toUpperCase().includes(q))) && O[c].sections.some((s) => tOK(s) && dOK(s)))
      .sort((a, b) => (rec.has(b) - rec.has(a)) || a.localeCompare(b));
    const totalCr = P.courses.reduce((a, c) => a + crOf(c), 0);
    const { combos } = P.courses.length ? generateCombos() : { combos: [] };
    const card = (code) => {
      const c = O[code], s = c.sections.find((x) => tOK(x) && dOK(x)) || c.sections[0], f = fac.get(s.faculty), added = P.courses.includes(code), saved = (P.saved || []).includes(code);
      const filled = s.capacity ? (s.capacity - (s.seats ?? 0)) / s.capacity : 0;
      return `<article class="pcard" style="--cc:${ctx.colorFor(code)}"><div class="row nowrap top" style="gap:12px">
        <span class="fac" style="background:${ctx.colorFor(s.faculty || code)}" aria-hidden="true">${esc((s.faculty || code).slice(0, 3))}</span>
        <div class="grow min0"><div class="row between nowrap"><h3>${esc(code)}</h3><div class="row nowrap" style="gap:6px">${rec.has(code) ? '<span class="pill green">Recommended</span>' : filled >= 0.8 ? `<span class="pill red">${icon("flame")} Popular</span>` : ""}<button class="bm" data-save="${esc(code)}" aria-pressed="${saved}" aria-label="${saved ? "Remove bookmark" : "Bookmark"} ${esc(code)}">${icon("bookmark")}</button></div></div>
          <div class="t">${esc(c.title || "")}</div>${f?.rating ? `<div class="small" style="margin-top:2px"><span style="color:var(--yellow)">★</span> ${f.rating.toFixed(1)} <span class="muted">(${f.reviews || 0})</span></div>` : f?.name ? `<div class="xs">${esc(f.name)}</div>` : ""}</div></div>
        <div class="meta"><span>${icon("calendar")} ${esc(ctx.dayIdx(s.days).map((d) => DS[d]).join(", "))} ${ctx.fmt12(s.start)} – ${ctx.fmt12(s.end)}</span><span>${icon("room")} ${esc(s.room || "TBA")}</span>${c.sections.length > 1 ? `<button class="btn sm ghost" data-secs="${esc(code)}" style="min-height:28px;padding:0 6px">${c.sections.length} sections ${icon("chevD", "sm")}</button>` : ""}</div>
        <div class="seats">${s.capacity ? `${ctx.bar(100 * filled, filled >= 0.9 ? "red" : "green")}<span><b>${s.capacity - (s.seats ?? 0)}</b> / ${s.capacity} seats</span>` : `<span class="xs grow">${c.cr || 3} credits</span>`}
          <button class="btn sm ${added ? "outline" : "primary"}" data-course="${esc(code)}" aria-pressed="${added}">${icon(added ? "check" : "plus")} ${added ? "Added" : "Add"}</button></div>
        <div class="secs" data-secs-of="${esc(code)}" hidden>${c.sections.map((x) => { const pin = P.pins[code] === x.sec; return `<div class="secrow ${pin ? "pinned" : ""}"><b>Sec ${esc(x.sec)}</b><span class="small">${esc(x.days)} ${ctx.fmt12(x.start)}${x.lab ? ` · Lab ${esc(x.lab.days)}` : ""} · ${esc(ctx.facName(x.faculty))}</span>${x.seats !== undefined ? `<span class="pill ${x.seats === 0 ? "red" : x.seats < 5 ? "amber" : "green"}">${x.seats} left</span>` : "<span></span>"}<button class="btn sm ${pin ? "primary" : "neutral"}" data-pin="${esc(code)}|${esc(x.sec)}" aria-pressed="${pin}">${pin ? "Pinned" : "Pin"}</button></div>`; }).join("")}</div></article>`;
    };
    return `${ctx.head("Advising Planner", "Find the best course combination for your next semester.", "", ctx.art("mascot-laptop", "Plan smart,<br>study happy!"))}${note}
      <div class="row nowrap" style="gap:8px"><div class="seg grow">${[["all", "All"], ...[0, 1, 2, 3, 4, 6].map((d) => [String(d), DS[d]])].map(([v, l]) => `<button data-pday="${v}" aria-selected="${pDay === v}">${l}</button>`).join("")}</div>
        <select class="select sm" id="p-time" aria-label="Time of day">${[["any", "Time"], ["morning", "Morning"], ["afternoon", "Afternoon"], ["evening", "Evening"]].map(([v, l]) => `<option value="${v}" ${pTime === v ? "selected" : ""}>${l}</option>`).join("")}</select>
        <button class="icon-btn" id="p-filter" aria-label="Filters">${icon("filter")}</button></div>
      <div class="searchbar mt">${icon("search")}<input class="input" id="p-q" type="search" placeholder="Search by course code, title or faculty…" value="${esc(pQ)}" aria-label="Search courses"></div>
      <p class="xs mt-s">${esc(P.offeredSem || "Next semester")} · ${Object.keys(O).length} courses offered${R.maxCredit ? ` · your limit ${R.minCredit || 0}–${R.maxCredit} credits` : ""}${R.maxPerDay ? ` · max ${R.maxPerDay} courses/day` : ""}</p>
      <div class="grid g2 mt">${codes.slice(0, 60).map(card).join("") || `<div class="card full-row">${ctx.empty("icon:search", "No results found", "Try a different keyword or filter.", `<button class="btn" id="p-clear">Clear Filters</button>`)}</div>`}</div>
      ${codes.length > 60 ? `<p class="xs mt-s">Showing 60 of ${codes.length}. Search to find more.</p>` : ""}
      ${P.courses.length ? `<div class="sticky-cart"><div class="grow"><b>${P.courses.length} course${P.courses.length > 1 ? "s" : ""} · ${totalCr} credits</b><span>${combos.length ? `${combos.length >= 3000 ? "3000+" : combos.length} clash-free option${combos.length === 1 ? "" : "s"}` : "No clash-free option yet"}${R.maxCredit && totalCr > R.maxCredit ? ` · over your ${R.maxCredit}-credit limit` : ""}</span></div><a class="btn white" href="#/plan">Review ${icon("arrow")}</a></div>` : ""}`;
  };
  pages.planner.mount = (el) => {
    const P = S().planner, upd = () => { ctx.save(); ctx.rerender(); };
    $$("[data-course]", el).forEach((b) => b.addEventListener("click", () => { const c = b.dataset.course; P.courses = P.courses.includes(c) ? P.courses.filter((x) => x !== c) : [...P.courses, c]; delete P.pins[c]; upd(); if (P.courses.includes(c)) toast("Course added", "success", `${c} added to your selection.`); }));
    $$("[data-save]", el).forEach((b) => b.addEventListener("click", () => { const c = b.dataset.save; P.saved = P.saved || []; P.saved = P.saved.includes(c) ? P.saved.filter((x) => x !== c) : [...P.saved, c]; upd(); }));
    $$("[data-secs]", el).forEach((b) => b.addEventListener("click", () => { const box = $(`[data-secs-of="${CSS.escape(b.dataset.secs)}"]`, el); box.hidden = !box.hidden; }));
    $$("[data-pin]", el).forEach((b) => b.addEventListener("click", () => { const [c, s] = b.dataset.pin.split("|"); if (P.pins[c] === s) delete P.pins[c]; else { P.pins[c] = s; if (!P.courses.includes(c)) P.courses.push(c); } upd(); }));
    $$("[data-pday]", el).forEach((b) => b.addEventListener("click", () => { pDay = b.dataset.pday; ctx.rerender(); }));
    const t = $("#p-time", el); t && t.addEventListener("change", () => { pTime = t.value; ctx.rerender(); });
    const q = $("#p-q", el); let tm;
    q && q.addEventListener("input", () => { clearTimeout(tm); tm = setTimeout(() => { pQ = q.value; ctx.rerender(); const n = $("#p-q"); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 220); });
    const cl = $("#p-clear", el); cl && cl.addEventListener("click", () => { pQ = ""; pDay = "all"; pTime = "any"; ctx.rerender(); });
    const f = $("#p-filter", el); f && f.addEventListener("click", filterSheet);
  };
  function filterSheet() {
    const F = S().planner.filters;
    openModal(modalHead("Filter Courses") + `<div class="stack">
      <label class="row small"><input type="checkbox" class="check" id="f-full" ${F.hideFull ? "checked" : ""}> Hide full sections</label>
      <label class="row small"><input type="checkbox" class="check" id="f-early" ${F.noEarly ? "checked" : ""}> No classes before 10:00 AM</label>
      <div><b class="small">Days off</b><div class="row mt-s">${[6, 0, 1, 2, 3, 4].map((d) => `<button class="chip" data-off="${d}" aria-pressed="${F.daysOff.includes(d)}">${DS[d]}</button>`).join("")}</div></div>
      <p class="xs">Filters apply to sections you haven't pinned. Your advising rules (max courses per day) are always applied.</p>
      <button class="btn primary block" id="f-apply">Apply Filters</button></div>`, (m) => {
      $$("[data-off]", m).forEach((b) => b.addEventListener("click", () => b.setAttribute("aria-pressed", b.getAttribute("aria-pressed") !== "true")));
      $("#f-apply", m).addEventListener("click", () => { F.hideFull = $("#f-full", m).checked; F.noEarly = $("#f-early", m).checked; F.daysOff = $$('[data-off][aria-pressed="true"]', m).map((b) => Number(b.dataset.off)); ctx.save(); closeModal(); ctx.rerender(); });
    });
  }
  function miniCal(blocks) {
    const startH = Math.min(8, ...blocks.map((b) => Math.floor(b.s / 60))), endH = Math.max(15, ...blocks.map((b) => Math.ceil(b.e / 60)));
    const PX = 0.55, H = (endH - startH) * 60 * PX + 8, y = (m) => (m - startH * 60) * PX + 4, hrs = []; for (let h = startH; h <= endH; h++) hrs.push(h);
    const days = [0, 1, 2, 3, 4, 5, 6];
    return `<div class="minical"><span></span>${days.map((d) => `<span class="mh">${DS[d]}</span>`).join("")}
      <div class="mhours" style="height:${H}px">${hrs.map((h) => `<span style="top:${y(h * 60)}px">${h % 12 || 12}:00</span>`).join("")}</div>
      ${days.map((d) => `<div class="mcol" style="height:${H}px">${hrs.map((h) => `<div class="mline" style="top:${y(h * 60)}px"></div>`).join("")}${blocks.filter((b) => b.day === d).map((b) => `<div class="mb" style="top:${y(b.s)}px;height:${(b.e - b.s) * PX}px;--cc:${ctx.colorFor(b.code)}"><b>${esc(b.code)}</b>${esc(b.room || "")}</div>`).join("")}</div>`).join("")}</div>`;
  }
  pages.plan = () => {
    const P = S().planner, O = ctx.offered();
    const { combos, blocked } = P.courses.length ? generateCombos() : { combos: [], blocked: [] };
    const best = combos.slice().sort(SORTS.best)[0];
    const totalCr = P.courses.reduce((a, c) => a + crOf(c), 0);
    const pinnedBlocks = P.courses.flatMap((c) => { const s = O[c]?.sections.find((x) => x.sec === P.pins[c]); return s ? ctx.sectionBlocks(c, s) : []; });
    return `${ctx.subHead("Selected Courses", `${esc(P.offeredSem || "Next semester")} · ${P.courses.length} Courses`, "#/planner", P.courses.length ? `<button class="btn ghost sm" id="pl-clear">Clear All</button>` : "")}
      <div style="max-width:860px;margin:0 auto">
      ${P.courses.length ? P.courses.map((c) => { const s = O[c]?.sections.find((x) => x.sec === P.pins[c]); return `<div class="selrow" style="--cc:${ctx.colorFor(c)}"><span class="grip">${icon("grip", "sm")}</span><span class="bar5"></span><div class="min0 row nowrap" style="gap:14px"><b style="min-width:76px">${esc(c)}</b><div class="min0"><b style="font-weight:500;display:block" class="ellipsis">${esc(O[c]?.title || "")}</b><span class="xs">${s ? `Sec ${esc(s.sec)} · ${esc(ctx.dayIdx(s.days).map((d) => DS[d]).join(", "))} ${ctx.fmt12(s.start)} – ${ctx.fmt12(s.end)} · ${esc(s.room || "")}` : `Any of ${O[c]?.sections.length || 0} sections · ${crOf(c)} credits`}</span></div></div><button class="btn sm icon-only ghost" data-rm="${esc(c)}" aria-label="Remove ${esc(c)}">${icon("trash")}</button></div>`; }).join("")
        : `<div class="card">${ctx.empty("icon:calcheck", "No courses selected", "Go back and add the courses you want next semester.", `<a class="btn primary" href="#/planner">Browse courses</a>`)}</div>`}
      ${P.courses.length ? `<button class="btn primary lg block mt" id="pl-find" ${combos.length ? "" : "disabled"}>${icon("sparkle")} Find Best Combination</button>
      <div class="card mt"><div class="card-h"><h2>Schedule Preview</h2><span class="pill">${best ? "Best option" : "Pinned sections"}</span></div>${miniCal(best ? best.bl : pinnedBlocks)}</div>
      ${combos.length ? `<div class="alert green mt"><span class="a-ic">${icon("check")}</span><div><b>No class clashes found!</b><p>${P.courses.length} courses · ${totalCr} credits · ${combos.length >= 3000 ? "3000+" : combos.length} possible routines</p></div></div>`
        : `<div class="alert red mt"><span class="a-ic">${icon("x")}</span><div><b>${blocked.length ? `No section of ${blocked.map(esc).join(", ")} fits` : "Every combination clashes"}</b><p>${blocked.length ? "Relax a filter or unpin a section." : `Remove a course or a pin${S().rules.maxPerDay ? `, or check the ${S().rules.maxPerDay}-courses-per-day rule` : ""}.`}</p></div></div>`}
      <button class="btn primary lg block mt" id="pl-save" ${best ? "" : "disabled"}>Review &amp; Save ${icon("arrow")}</button>` : ""}</div>`;
  };
  pages.plan.mount = (el) => {
    const P = S().planner;
    $$("[data-rm]", el).forEach((b) => b.addEventListener("click", () => { P.courses = P.courses.filter((c) => c !== b.dataset.rm); delete P.pins[b.dataset.rm]; ctx.save(); ctx.rerender(); }));
    const on = (s, fn) => { const b = $(s, el); b && b.addEventListener("click", fn); };
    on("#pl-clear", () => confirmModal("Clear all courses?", "Your selected courses and pinned sections will be removed.", "Clear All", () => { P.courses = []; P.pins = {}; ctx.save(); ctx.rerender(); }, true));
    on("#pl-find", () => ctx.go("#/combos"));
    on("#pl-save", () => applyCombo(generateCombos().combos.sort(SORTS.best)[0]));
  };
  const TAGS = { best: ["Most Balanced", "purple"], gaps: ["Fewer Gaps", "green"], early: ["Earlier Finish", "blue"], rating: ["Highest Rated", "red"] };
  let pickIdx = 0;
  function reasons(x, all) {
    const out = [];
    if (x.rating >= 4) out.push("Good faculty ratings");
    if (x.gaps <= 90) out.push(x.gaps <= 20 ? "Back to back classes" : "Reasonable gaps");
    if (x.lastEnd <= 15 * 60) out.push("Earlier finish time");
    if (x.days <= Math.min(...all.map((y) => y.days))) out.push(`Only ${x.days} days on campus`);
    if (x.seats !== 99 && x.seats >= 10) out.push("More seats available");
    if (x.seats !== 99 && x.seats < 5) out.push("Limited seats (hurry!)");
    if (!x.early) out.push("No early-morning classes");
    return out.slice(0, 3).concat(out.length ? [] : ["No class clashes"]);
  }
  pages.combos = () => {
    const P = S().planner, { combos } = P.courses.length ? generateCombos() : { combos: [] };
    if (!combos.length) return `${ctx.subHead("Best Combinations", "", "#/plan")}<div class="card">${ctx.empty("icon:calcheck", "No combinations yet", "Add courses that don't clash, then try again.", `<a class="btn primary" href="#/planner">Browse courses</a>`)}</div>`;
    const list = combos.slice().sort(SORTS[pSort]).slice(0, 8);
    const totalCr = P.courses.reduce((a, c) => a + crOf(c), 0);
    pickIdx = Math.min(pickIdx, list.length - 1);
    return `${ctx.subHead("Best Combinations", `${esc(P.offeredSem || "Next semester")} · Based on your preferences`, "#/plan")}
      <div style="max-width:860px;margin:0 auto">${ctx.seg([["best", "Recommended"], ["gaps", "Less Gaps"], ["early", "Early Finish"], ["rating", "Faculty Rating"]], pSort, "data-sort")}
      <div class="stack mt">${list.map((x, i) => `<article class="combo ${i === pickIdx ? "best" : ""}" data-pick="${i}" tabindex="0" role="radio" aria-checked="${i === pickIdx}" aria-label="Option ${i + 1}">
        <div class="row between"><div class="row"><span class="opt">Option ${i + 1}</span>${i === 0 ? `<span class="pill ${TAGS[pSort][1]}">${TAGS[pSort][0]}</span>` : ""}</div>${x.rating ? `<b style="font-size:18px">${x.rating.toFixed(1)} <span style="color:var(--success)">★</span></b>` : `<span class="pill">${x.days} days</span>`}</div>
        <p class="small muted">${P.courses.length} Courses · ${totalCr} Credits</p><p class="xs" style="color:var(--success-t);display:flex;gap:4px;align-items:center">${icon("checkc", "sm")} No class clashes</p>
        <div class="miniweek">${[0, 1, 2, 3, 4, 5, 6].map((d) => `<span>${DS[d]}</span>`).join("")}${[0, 1, 2, 3, 4, 5, 6].map((d) => `<div class="mwc">${x.bl.filter((b) => b.day === d).map((b) => `<i style="top:${Math.max(2, Math.min(44, ((b.s - 480) / 660) * 50))}px;--cc:${ctx.colorFor(b.code)}" title="${esc(b.code)} ${ctx.fmt12(b.s)}"></i>`).join("")}</div>`).join("")}</div>
        <div class="row between top"><div class="checks">${reasons(x, list).map((r) => `<div><span class="ok">${icon("check")}</span>${r}</div>`).join("")}</div><button class="btn ${i === pickIdx ? "primary" : "outline"} sm" data-view="${i}">View Details ${icon("arrow")}</button></div></article>`).join("")}</div>
      <div class="row mt sticky-bottom"><button class="btn outline lg" id="cb-compare">${icon("grid")} Compare</button><button class="btn primary lg grow" id="cb-choose">Choose This Combination ${icon("arrow")}</button></div></div>`;
  };
  pages.combos.mount = (el) => {
    const list = () => generateCombos().combos.sort(SORTS[pSort]).slice(0, 8);
    $$("[data-sort]", el).forEach((b) => b.addEventListener("click", () => { pSort = b.dataset.sort; pickIdx = 0; ctx.rerender(); }));
    $$("[data-pick]", el).forEach((a) => { const pick = () => { pickIdx = Number(a.dataset.pick); ctx.rerender(); }; a.addEventListener("click", (e) => { if (!e.target.closest("[data-view]")) pick(); }); a.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(); } }); });
    $$("[data-view]", el).forEach((b) => b.addEventListener("click", () => {
      const x = list()[Number(b.dataset.view)];
      openModal(modalHead(`Option ${Number(b.dataset.view) + 1}`) + `${miniCal(x.bl)}<div class="mt">${x.c.map((o) => `<div class="lrow"><span style="width:4px;height:36px;border-radius:3px;background:${ctx.colorFor(o.code)}"></span><div class="body"><b>${esc(o.code)} · Sec ${esc(o.s.sec)}</b><span>${esc(o.s.days)} ${ctx.fmt12(o.s.start)}–${ctx.fmt12(o.s.end)}${o.s.lab ? ` · Lab ${esc(o.s.lab.days)} ${ctx.fmt12(o.s.lab.start)}` : ""} · ${esc(o.s.room || "")} · ${esc(ctx.facName(o.s.faculty))}</span></div>${o.s.seats !== undefined ? `<span class="pill ${o.s.seats < 5 ? "amber" : "green"}">${o.s.seats} seats</span>` : ""}</div>`).join("")}</div>
        <button class="btn primary block mt" id="vd-choose">Choose This Combination</button>`, (m) => $("#vd-choose", m).addEventListener("click", () => { closeModal(); applyCombo(x); }));
    }));
    const on = (s, fn) => { const b = $(s, el); b && b.addEventListener("click", fn); };
    on("#cb-choose", () => applyCombo(list()[pickIdx]));
    on("#cb-compare", () => {
      const L = list().slice(0, 3);
      openModal(modalHead("Compare options") + `<div class="table-wrap"><table class="mtable"><tr><td></td>${L.map((_, i) => `<td><b>Option ${i + 1}</b></td>`).join("")}</tr>
        ${[["Days on campus", (x) => x.days], ["Waiting between classes", (x) => `${Math.round(x.gaps)} min`], ["Latest finish", (x) => ctx.fmt12(x.lastEnd)], ["Early classes", (x) => x.early], ["Faculty rating", (x) => (x.rating ? x.rating.toFixed(1) + " ★" : "—")], ["Fewest seats left", (x) => (x.seats === 99 ? "—" : x.seats)]]
          .map(([l, f]) => `<tr><td class="small muted">${l}</td>${L.map((x) => `<td class="num">${f(x)}</td>`).join("")}</tr>`).join("")}</table></div>`);
    });
  };
  function applyCombo(pick) {
    if (!pick) return;
    const O = ctx.offered(), P = S().planner, sem = P.offeredSem || ctx.nextSemesterGuess();
    confirmModal("Save as your routine?", `Your current routine (${S().routine.length} classes) will be replaced with this ${pick.c.length}-course plan for ${esc(sem)}. You can still edit it later.`, "Save Routine", () => {
      const St = S();
      St.routine = pick.c.flatMap((o) => [{ id: uid(), code: o.code, title: O[o.code].title, sec: o.s.sec, days: o.s.days, start: o.s.start, end: o.s.end, room: o.s.room || "", faculty: o.s.faculty || "" }]
        .concat(o.s.lab ? [{ id: uid(), code: o.code, title: O[o.code].title, sec: o.s.sec, days: o.s.lab.days, start: o.s.lab.start, end: o.s.lab.end, room: o.s.lab.room || o.s.room || "", faculty: o.s.faculty || "", lab: true }] : []));
      St.routineSem = sem;
      const firstPlan = !St.study.ev.planner; St.study.ev.planner = true;
      ctx.logEvent("Academic", "calcheck", "green", "Routine planned", `${pick.c.length} courses saved for ${sem}.`, "#/routine");
      ctx.save(); if (firstPlan) ctx.study.award(20, "routine planned");
      toast("Routine saved!", "success", `${pick.c.map((o) => o.code).join(", ")}`); ctx.go("#/routine");
    }, false, "calcheck");
  }

  /* ═════════════ CGPA ═════════════ */
  const semRows = () => {
    const G = S().grades, sems = [...new Set(G.map((g) => g.sem).filter(Boolean))].sort((a, b) => ctx.semesterKey(a) - ctx.semesterKey(b));
    return sems.map((s, i) => ({ s, term: ctx.cgpaOf(G.filter((g) => g.sem === s)), cum: ctx.cgpaOf(G.filter((g) => sems.slice(0, i + 1).includes(g.sem))) })).filter((r) => r.term.credits || r.cum.credits);
  };
  const letterFor = (gpa) => (ctx.GRADES.find((g) => gpa >= g.p - 0.0001) || { g: "F" }).g;
  function lineChart(pts, { h = 190, max = 4, min = 0 } = {}) {
    if (!pts.length) return "";
    const W = 560, pad = 34, n = pts.length, X = (i) => pad + (n === 1 ? (W - pad * 2) / 2 : (i * (W - pad * 2)) / (n - 1)), Y = (v) => h - 26 - ((v - min) / (max - min)) * (h - 50);
    const line = pts.map((p, i) => `${i ? "L" : "M"}${X(i)},${Y(p.v)}`).join(" ");
    return `<svg class="chart" viewBox="0 0 ${W} ${h}" role="img" aria-label="${pts.map((p) => `${p.l} ${p.v.toFixed(2)}`).join(", ")}"><defs><linearGradient id="cg-a" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7c3aed" stop-opacity=".25"/><stop offset="1" stop-color="#7c3aed" stop-opacity="0"/></linearGradient></defs>
      ${[0, 1, 2, 3, 4].map((v) => `<line class="grid-l" x1="${pad}" x2="${W - 8}" y1="${Y(v)}" y2="${Y(v)}"/><text x="4" y="${Y(v) + 4}">${v.toFixed(1)}</text>`).join("")}
      <path d="${line} L${X(n - 1)},${h - 26} L${X(0)},${h - 26} Z" fill="url(#cg-a)"/><path d="${line}" fill="none" stroke="#7c3aed" stroke-width="3" stroke-linejoin="round"/>
      ${pts.map((p, i) => `<circle cx="${X(i)}" cy="${Y(p.v)}" r="5" fill="#7c3aed" stroke="#fff" stroke-width="2"/><text class="lbl" x="${X(i)}" y="${Y(p.v) - 11}" text-anchor="middle">${p.v.toFixed(2)}</text><text x="${X(i)}" y="${h - 6}" text-anchor="middle">${esc(p.l)}</text>`).join("")}</svg>`;
  }
  pages.grades = () => {
    const St = S(), { cgpa, earned } = ctx.cgpaOf(St.grades);
    const total = St.profile?.creditsTotal || 140, done = Math.max(earned, St.profile?.creditsDone || 0), rem = Math.max(0, total - done);
    const shown = cgpa || St.profile?.cgpa || 0;
    const rows = semRows(), last = rows[rows.length - 1], prev = rows[rows.length - 2];
    const delta = last && prev ? last.cum.cgpa - prev.cum.cgpa : 0;
    const proj = rows.length >= 2 ? (() => { const t = rows.slice(-2).map((r) => r.term.cgpa), avgT = (t[0] + t[1]) / 2, cr = ctx.cgpaOf(St.grades).credits; return Math.min(4, (shown * cr + avgT * 15) / (cr + 15)); })() : 0;
    if (!St.grades.length && !shown) return `${ctx.head("My CGPA", `Keep going, ${esc(ctx.firstName())}!`)}<div class="card">${ctx.empty("icon:bars", "No grades yet", "Sync your Grade Report to see your CGPA, semester trend and degree progress, or add courses by hand.", `<div class="row center"><a class="btn primary" href="#/sync">${icon("sync")} Sync Grade Report</a><button class="btn" id="g-add">${icon("plus")} Add Course</button></div>`)}</div>`;
    const latest = {}; St.grades.slice().sort((a, b) => ctx.semesterKey(a.sem) - ctx.semesterKey(b.sem)).forEach((g) => { latest[g.code] = g; });
    const perf = Object.values(latest).filter((g) => !ctx.NON_GPA.has(g.g)).slice(-6).reverse();
    return `${ctx.demoBanner()}${ctx.head("CGPA &amp; Degree Progress", "Track your performance and see how close you are to graduation.", `<a class="btn outline" href="#/whatif">${icon("calc")} What-If Calculator</a>`)}
      <div class="grid g4">
        <div class="cgpa-card"><span class="small" style="opacity:.9">Current CGPA</span><div class="row nowrap between"><div class="big num">${shown ? shown.toFixed(2) : "—"}<small>/ 4.00</small></div></div>
          <div class="row" style="margin-top:6px"><span class="small" style="opacity:.9">Overall CGPA</span>${delta ? `<span class="up">${delta > 0 ? "↑" : "↓"} ${Math.abs(delta).toFixed(2)}</span><span class="xs" style="color:rgba(255,255,255,.85)">vs last semester</span>` : ""}</div>${icon("bars", "deco")}</div>
        <a class="card" href="#/degree"><span class="xs">Completed Credits</span><div class="stat"><span class="v num">${done} <small>/ ${total}</small></span></div>${ctx.bar((100 * done) / total, "grad")}<span class="xs">${Math.round((100 * done) / total)}% completed</span></a>
        <a class="card" href="#/degree"><span class="xs">Remaining Credits</span><div class="row nowrap"><span class="itile sm orange">${icon("clock")}</span><span class="stat"><span class="v num">${rem}</span></span></div><span class="xs">To graduate</span></a>
        <a class="card" href="#/whatif"><span class="xs">Projected CGPA</span><div class="row nowrap"><span class="itile sm green">${icon("trend")}</span><span class="stat"><span class="v num">${proj ? proj.toFixed(2) : "—"}</span></span></div><span class="xs">${proj ? "If current trend continues" : "Needs 2+ semesters"}</span></a>
      </div>
      <div class="split mt">
        <section class="card"><div class="card-h"><h2>Semester-wise CGPA</h2><a class="see" href="#/degree">View Details ${icon("arrow", "sm")}</a></div>${rows.length ? lineChart(rows.map((r) => ({ l: r.s.replace(/(\w+)-\d\d(\d\d)/, (m, t, y) => `${t} ${y}`), v: r.cum.cgpa }))) : `<p class="small muted">Grades with a semester will show your trend here.</p>`}</section>
        <section class="card"><div class="card-h"><h2>Degree Progress</h2><a class="see" href="#/degree">View</a></div>${degreeCats(4)}<p class="small mt-s"><b>Total: ${done} / ${total} Credits</b></p></section>
      </div>
      <div class="grid g4 mt">
        <div class="card row nowrap"><span class="itile purple">${icon("cap")}</span><div class="stat"><span class="v num">${done}</span><span class="l">Credits Completed</span>${ctx.bar((100 * done) / total)}</div></div>
        <div class="card row nowrap"><span class="itile green">${icon("notes")}</span><div class="stat"><span class="v num">${rem}</span><span class="l">Credits Remaining</span>${ctx.bar((100 * rem) / total, "green")}</div></div>
        <div class="card row nowrap"><span class="itile pink">${icon("book")}</span><div class="stat"><span class="v num">${last ? last.term.cgpa.toFixed(2) : "—"}</span><span class="l">Semester GPA${last ? `<br>${esc(last.s)}` : ""}</span></div></div>
        <div class="card row nowrap"><span class="itile blue">${icon("trend")}</span><div class="stat"><span class="v">${last ? letterFor(last.term.cgpa) : "—"}</span><span class="l">Current Semester<br>GPA Equivalent</span></div></div>
      </div>
      <div class="grid g2 mt">
        <section class="card"><div class="card-h"><h2>Course-wise Performance</h2><a class="see" href="#/grades?all=1" id="g-all">See All</a></div>${perf.map((g) => `<div class="row nowrap" style="padding:8px 0"><span class="small ellipsis" style="width:42%">${esc(g.code)}${g.title ? " - " + esc(g.title) : ""}</span><div class="grow">${ctx.bar((100 * ctx.gradePoint(g.g)) / 4, ctx.gradePoint(g.g) >= 3.5 ? "" : ctx.gradePoint(g.g) >= 3 ? "green" : ctx.gradePoint(g.g) >= 2.5 ? "blue" : "orange")}</div><b class="small" style="width:28px">${esc(g.g)}</b><span class="small muted num">${ctx.gradePoint(g.g).toFixed(2)}</span></div>`).join("") || '<p class="small muted">No graded courses yet.</p>'}</section>
        <div class="mascot-card" style="align-self:start"><img src="/img/mascot-thumbs.webp" alt="" width="110"><div><b>${done / total >= 0.5 ? "Great progress!" : "Keep going!"}</b><p>You have completed ${Math.round((100 * done) / total)}% of your degree requirements.</p></div></div>
      </div>
      <section class="card mt" id="all-courses"><div class="card-h"><h2>All Courses</h2><button class="btn sm" id="g-add">${icon("plus")} Add Course</button></div>
        <div class="table-wrap"><table class="mtable"><tr><td class="xs">Semester</td><td class="xs">Course</td><td class="xs">Cr</td><td class="xs">Grade</td><td class="xs">Points</td><td></td></tr>
        ${St.grades.slice().sort((a, b) => ctx.semesterKey(b.sem) - ctx.semesterKey(a.sem)).map((g) => `<tr><td class="small">${esc(g.sem || "—")}</td><td><b>${esc(g.code)}</b><div class="xs">${esc(g.title || "")}</div></td><td class="num">${g.cr}</td><td><select class="select sm" data-gr="${g.id}" aria-label="Grade for ${esc(g.code)}">${ctx.GRADES.map((x) => x.g).concat([...ctx.NON_GPA]).map((x) => `<option ${x === g.g ? "selected" : ""}>${x}</option>`).join("")}</select></td><td class="num">${ctx.NON_GPA.has(g.g) ? "—" : (ctx.gradePoint(g.g) * g.cr).toFixed(2)}</td><td><button class="btn sm icon-only ghost" data-gdel="${g.id}" aria-label="Remove ${esc(g.code)}">${icon("trash")}</button></td></tr>`).join("")}</table></div>
        <p class="xs mt-s">EWU scale (Fall 2023 onward): ${ctx.GRADES.map((x) => `${x.g} ${x.p.toFixed(2)}`).join(" · ")}. P, S, U, R, I and W don't count toward CGPA. Retakes count the latest grade.</p></section>`;
  };
  function degreeCats(limit = 99) {
    const D = S().degree;
    if (!D.length) return `<p class="small muted">Sync your <b>Degree Review</b> page to see credits by requirement.</p>`;
    const IC = ["book", "cap", "grid", "star", "notes", "award"], TN = ["blue", "purple", "teal", "orange", "green", "pink"];
    return D.filter((d) => d.total > 0).slice(0, limit).map((d, i) => `<div class="row nowrap" style="padding:7px 0"><span class="itile sm ${TN[i % 6]}">${icon(IC[i % 6])}</span><div class="grow min0"><div class="row between nowrap"><span class="small ellipsis">${esc(d.category.replace(/ Courses?$/i, ""))}</span><b class="small num nw">${d.done} / ${d.total}</b></div>${ctx.bar(d.total ? (100 * d.done) / d.total : 100, d.done >= d.total ? "green" : "")}</div>${d.done >= d.total ? `<span style="color:var(--success)">${icon("checkc", "sm")}</span>` : ""}</div>`).join("");
  }
  pages.grades.mount = (el) => {
    $$("[data-gr]", el).forEach((s) => s.addEventListener("change", () => { S().grades.find((g) => g.id === s.dataset.gr).g = s.value; ctx.save(); ctx.rerender(); }));
    $$("[data-gdel]", el).forEach((b) => b.addEventListener("click", () => { S().grades = S().grades.filter((g) => g.id !== b.dataset.gdel); ctx.save(); ctx.rerender(); toast("Course removed", "info"); }));
    const all = $("#g-all", el); all && all.addEventListener("click", (e) => { e.preventDefault(); $("#all-courses").scrollIntoView({ behavior: "smooth" }); });
    $$("#g-add", el).forEach((b) => b.addEventListener("click", () => openModal(modalHead("Add course grade") + `<form id="g-form" class="grid g2">
      <label class="field">Semester<input class="input" name="sem" required value="${esc(S().routineSem || ctx.currentSemester())}"></label><label class="field">Course code<input class="input" name="code" required placeholder="CSE211"></label>
      <label class="field">Title<input class="input" name="title"></label><label class="field">Credits<input class="input" name="cr" type="number" step="0.5" value="3" required></label>
      <label class="field">Grade<select class="select" name="g">${ctx.GRADES.map((x) => `<option>${x.g}</option>`).join("")}</select></label>
      <div class="row full-row"><button type="button" class="btn neutral grow" data-close>Cancel</button><button class="btn primary grow">Add</button></div></form>`, (m) => {
      $("#g-form", m).addEventListener("submit", (e) => { e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)); S().grades.push({ ...f, sem: ctx.normSemester(f.sem) || f.sem, code: f.code.toUpperCase().replace(/\s/g, ""), cr: Number(f.cr), id: uid() }); ctx.save(); closeModal(); ctx.rerender(); toast("Course added"); });
    })));
  };

  /* ═════════════ DEGREE PROGRESS ═════════════ */
  let dTab = "overview";
  pages.degree = () => {
    const St = S(), { earned } = ctx.cgpaOf(St.grades);
    const total = St.profile?.creditsTotal || 140, done = Math.max(earned, St.profile?.creditsDone || 0);
    const inProg = St.routine.length ? [...new Map(St.routine.filter((r) => !r.lab).map((r) => [r.code, r])).keys()].filter((c) => !St.grades.some((g) => g.code === c && g.sem === St.routineSem)).length * 3 : 0;
    const rem = Math.max(0, total - done - inProg), pct = Math.round((100 * done) / total);
    const floorsDone = Math.min(4, Math.floor((done / total) * 4 + 0.0001));
    const FL = [["Final Year", 14], ["Year 3", 31], ["Year 2", 48], ["Year 1", 65]];
    const perFloor = total / 4;
    const building = `<div class="building-wrap"><div class="lbls">${FL.map(([l, y]) => `<div style="top:${y}%">${l}</div>`).join("")}</div>
      <div class="building"><img src="/img/building.webp" alt="A building whose floors light up as you complete each year of your degree" width="226" height="355">${FL.map(([, y], i) => { const lvl = 3 - i, on = lvl < floorsDone; return `<span class="floor ${on ? "" : "off"}" style="top:${y - 7}%;height:14%;${on && lvl === 3 ? "background:rgba(255,196,80,.28)" : ""}"></span>`; }).join("")}</div>
      <div class="rlbls" style="position:relative">${FL.map(([l, y], i) => { const lvl = 3 - i, on = lvl < floorsDone, left = Math.max(0, Math.round((lvl + 1) * perFloor - done)); return `<div style="top:${y}%"><span class="ok ${on ? "" : "no"}">${icon("check")}</span><span>${on ? `${l}<br><span class="xs">Completed</span>` : `<span class="xs">${left} credits<br>remaining</span>`}</span></div>`; }).join("")}</div></div>`;
    const latest = {}; St.grades.slice().sort((a, b) => ctx.semesterKey(a.sem) - ctx.semesterKey(b.sem)).forEach((g) => { latest[g.code] = g; });
    const completed = Object.values(latest).filter((g) => g.g && !["F", "U", "I", "W"].includes(g.g));
    let body;
    if (dTab === "overview") body = `<section class="card row nowrap" style="gap:18px"><div class="ring lg grad-g" style="--p:${pct}" role="img" aria-label="${pct}% completed"><div><b>${pct}%</b><span>Completed</span></div></div>
        <div class="grow"><b style="font-size:24px">${done} / ${total}</b><p class="xs">Total Credits</p>${[["var(--success)", "Completed", done], ["var(--primary)", "In Progress", inProg], ["var(--surface-3)", "Remaining", rem]].map(([c, l, v]) => `<div class="row between small" style="margin-top:6px"><span class="row" style="gap:8px"><i style="width:10px;height:10px;border-radius:50%;background:${c};display:inline-block"></i>${l}</span><b class="num">${v}</b></div>`).join("")}</div></section>
      <section class="card mt">${building}</section>
      <section class="card mt"><h2 style="margin-bottom:8px">Requirement Categories</h2>${degreeCats()}</section>`;
    else if (dTab === "requirements") body = `<section class="card">${degreeCats()}</section><p class="xs mt-s">From your portal's Degree Review page. Re-sync after each semester.</p>`;
    else if (dTab === "completed") body = `<section class="card">${completed.length ? completed.map((g) => `<div class="lrow"><span class="itile sm green">${icon("check")}</span><div class="body"><b>${esc(g.code)}</b><span>${esc(g.title || "")} · ${esc(g.sem || "")}</span></div><span class="small num">${g.cr} cr</span><span class="pill purple">${esc(g.g)}</span></div>`).join("") : ctx.empty("icon:checkc", "Nothing completed yet", "Sync your Grade Report to list completed courses.")}</section>`;
    else body = `<section class="card">${St.degree.filter((d) => d.total > d.done).map((d) => `<div class="lrow"><span class="itile sm orange">${icon("clock")}</span><div class="body"><b>${esc(d.category)}</b><span>${d.done} of ${d.total} done</span></div><b class="num">${(d.total - d.done).toFixed(1).replace(/\.0$/, "")} left</b></div>`).join("") || ctx.empty("icon:cap", "All categories done", "Or sync your Degree Review to check.")}</section>
      ${St.recommended.length ? `<section class="card mt"><h3>Recommended next by the portal</h3><div class="row mt-s">${St.recommended.map((r) => `<span class="tag">${esc(r.code)} · ${r.cr} cr</span>`).join("")}</div></section>` : ""}`;
    return `${ctx.subHead("Degree Progress", esc(St.profile?.program || ""), "#/grades")}<div style="max-width:760px;margin:0 auto">${ctx.seg([["overview", "Overview"], ["requirements", "Requirements"], ["completed", "Completed"], ["remaining", "Remaining"]], dTab, "data-dt")}<div class="mt">${body}</div></div>`;
  };
  pages.degree.mount = (el) => $$("[data-dt]", el).forEach((b) => b.addEventListener("click", () => { dTab = b.dataset.dt; ctx.rerender(); }));

  /* ═════════════ WHAT-IF CALCULATOR ═════════════ */
  let wTab = "semester", wRows = null;
  const defaultRows = () => {
    const St = S(), graded = new Set(St.grades.filter((g) => g.sem === St.routineSem).map((g) => g.code));
    return [...new Map(St.routine.filter((r) => !r.lab && !graded.has(r.code)).map((r) => [r.code, r])).values()].map((r) => ({ code: r.code, title: r.title || "", cr: 3, g: "A-" }));
  };
  pages.whatif = () => {
    const St = S(), base = ctx.cgpaOf(St.grades), total = St.profile?.creditsTotal || 140, done = Math.max(base.earned, St.profile?.creditsDone || 0);
    wRows = wRows || (St.plans.whatif.length ? St.plans.whatif.map((r) => ({ ...r })) : defaultRows());
    const status = `<h3>Current Status</h3><div class="card soft mt-s stats-strip" style="grid-template-columns:repeat(3,1fr)">${[[base.cgpa ? base.cgpa.toFixed(2) : "—", "Current CGPA", "var(--primary)"], [done, "Credits Completed", ""], [Math.max(0, total - done), "Credits Remaining", ""]].map(([v, l, c]) => `<div style="flex-direction:column;align-items:flex-start;gap:2px"><b class="num" style="font-size:24px;${c ? `color:${c}` : ""}">${v}</b><span>${l}</span></div>`).join("")}</div>`;
    let body = "";
    if (wTab === "semester") {
      const add = wRows.filter((r) => r.code && Number(r.cr) > 0);
      const cr = add.reduce((a, r) => a + Number(r.cr), 0), pts = add.reduce((a, r) => a + Number(r.cr) * ctx.gradePoint(r.g), 0);
      const pred = base.credits + cr ? (base.points + pts) / (base.credits + cr) : 0, d = pred - base.cgpa;
      body = `${status}<div class="row between mt"><h3>Add Predicted Grades</h3><span class="pill">${esc(St.routineSem || ctx.currentSemester())}</span></div>
        <section class="card tight mt-s">${wRows.map((r, i) => `<div class="row nowrap" style="padding:8px 0;border-bottom:1px solid var(--border)"><span style="width:4px;height:30px;border-radius:3px;background:${ctx.colorFor(r.code)}"></span><input class="input" data-wcode="${i}" value="${esc(r.code)}" placeholder="Code" style="width:96px;min-height:40px;font-weight:700"><span class="small muted grow ellipsis">${esc(r.title)}</span>
          <select class="select sm" data-wg="${i}" aria-label="Predicted grade for ${esc(r.code)}">${ctx.GRADES.map((x) => `<option ${x.g === r.g ? "selected" : ""}>${x.g}</option>`).join("")}</select><input class="input num" data-wcr="${i}" type="number" step="0.5" min="0" value="${r.cr}" aria-label="Credits" style="width:62px;min-height:40px;text-align:center"><button class="btn sm icon-only ghost" data-wdel="${i}" aria-label="Remove">${icon("x")}</button></div>`).join("") || '<p class="small muted" style="padding:8px">Add the courses you are taking this semester.</p>'}
          <div class="row between" style="padding-top:10px"><button class="btn outline sm" id="w-add">${icon("plus")} Add Course</button><span class="small">Total Credits <b class="num" style="margin-left:8px">${cr}</b></span></div></section>
        <div class="card tint-green mt"><h3>Predicted Result</h3><div class="row nowrap mt-s" style="gap:20px"><div><b style="font-size:40px" class="num">${pred ? pred.toFixed(2) : "—"}</b><p class="xs">Predicted CGPA</p>${d ? `<span class="pill ${d >= 0 ? "green" : "red"}">${d >= 0 ? "↑" : "↓"} ${Math.abs(d).toFixed(2)}</span>` : ""}</div>
          <div class="grow stack" style="gap:8px"><div class="row nowrap small"><span style="width:110px" class="muted">Current</span>${ctx.bar((100 * base.cgpa) / 4, "")}<b class="num">${base.cgpa.toFixed(2)}</b></div><div class="row nowrap small"><span style="width:110px" class="muted">After This Semester</span>${ctx.bar((100 * pred) / 4, "grad")}<b class="num">${pred.toFixed(2)}</b></div></div></div></div>
        <button class="btn primary lg block mt" id="w-save">Save This Plan ${icon("arrow")}</button>`;
    } else if (wTab === "target") {
      body = `${status}<section class="card mt stack"><h3>What do I need next semester?</h3><div class="grid g2"><label class="field">Target CGPA<input class="input" id="t-cg" type="number" step="0.01" min="0" max="4" value="${Math.min(4, Math.max(3, Math.ceil((base.cgpa + 0.1) * 10) / 10)).toFixed(2)}"></label><label class="field">Credits next semester<input class="input" id="t-cr" type="number" step="0.5" min="1" value="${St.rules.maxCredit || 13}"></label></div><div id="t-out" aria-live="polite"></div></section>`;
    } else {
      const left = Math.max(0, total - done);
      body = `${status}<section class="card mt stack"><h3>When will I graduate?</h3><label class="field">Credits per semester<input class="input" id="cp-cr" type="number" step="0.5" min="1" value="${St.rules.maxCredit || 13}"></label><div id="cp-out" aria-live="polite"></div><p class="xs">${left} credits left. EWU runs Spring, Summer and Fall semesters.</p></section>`;
    }
    return `${ctx.subHead("What-If Calculator", "", "#/grades")}<div style="max-width:760px;margin:0 auto">${ctx.seg([["semester", "Semester"], ["target", "Target CGPA"], ["credit", "Credit Planner"]], wTab, "data-wt", "fill")}<div class="mt">${body}</div></div>`;
  };
  pages.whatif.mount = (el) => {
    $$("[data-wt]", el).forEach((b) => b.addEventListener("click", () => { wTab = b.dataset.wt; ctx.rerender(); }));
    const keep = (sel, i, k, fn = (v) => v) => $$(sel, el).forEach((x) => x.addEventListener("change", () => { wRows[Number(x.dataset[i])][k] = fn(x.value); ctx.rerender(); }));
    keep("[data-wg]", "wg", "g"); keep("[data-wcr]", "wcr", "cr", Number); keep("[data-wcode]", "wcode", "code", (v) => v.toUpperCase().replace(/\s/g, ""));
    $$("[data-wdel]", el).forEach((b) => b.addEventListener("click", () => { wRows.splice(Number(b.dataset.wdel), 1); ctx.rerender(); }));
    const on = (s, fn) => { const b = $(s, el); b && b.addEventListener("click", fn); };
    on("#w-add", () => { wRows.push({ code: "", title: "", cr: 3, g: "A" }); ctx.rerender(); setTimeout(() => $$("[data-wcode]").pop()?.focus()); });
    on("#w-save", () => { S().plans.whatif = wRows.map((r) => ({ ...r })); ctx.save(); toast("Plan saved", "success", "Your predicted grades are saved."); });
    const tcg = $("#t-cg", el);
    if (tcg) { const calc = () => { const { points, credits } = ctx.cgpaOf(S().grades), t = Number(tcg.value), n = Number($("#t-cr", el).value), need = (t * (credits + n) - points) / n, g = ctx.GRADES.slice().reverse().find((x) => x.p >= need);
      $("#t-out", el).innerHTML = !n ? "" : need > 4 ? `<div class="alert red"><span class="a-ic">${icon("x")}</span><div><b>Not reachable in ${n} credits</b><p>You'd need ${need.toFixed(2)}. Spread it over more semesters.</p></div></div>` : need <= 0 ? `<div class="alert green"><span class="a-ic">${icon("check")}</span><div><b>Already there</b><p>Keep it up!</p></div></div>` : `<div class="alert purple"><span class="a-ic">${icon("target")}</span><div><b>You need a term GPA of ${need.toFixed(2)}</b><p>About ${g ? g.g : "A+"} on average across ${n} credits.</p></div></div>`; };
      tcg.addEventListener("input", calc); $("#t-cr", el).addEventListener("input", calc); calc(); }
    const cp = $("#cp-cr", el);
    if (cp) { const calc = () => { const St = S(), total = St.profile?.creditsTotal || 140, done = Math.max(ctx.cgpaOf(St.grades).earned, St.profile?.creditsDone || 0), n = Number(cp.value), sems = n ? Math.ceil(Math.max(0, total - done) / n) : 0;
      let sem = St.routineSem || ctx.currentSemester(); const order = ["Spring", "Summer", "Fall"]; for (let i = 0; i < sems; i++) { const [t, y] = sem.split("-"); const k = order.indexOf(t); sem = k === 2 ? `Spring-${Number(y) + 1}` : `${order[k + 1]}-${y}`; }
      $("#cp-out", el).innerHTML = `<div class="alert purple"><span class="a-ic">${icon("cap")}</span><div><b>${sems} more semester${sems === 1 ? "" : "s"}</b><p>${sems ? `At ${n} credits per semester you could finish around ${esc(sem.replace("-", " "))}.` : "You've completed your required credits!"}</p></div></div>`; };
      cp.addEventListener("input", calc); calc(); }
  };

  /* ═════════════ MARKS & ATTENDANCE ESTIMATOR ═════════════ */
  const DEFAULT_PARTS = [["Quiz 1", 10], ["Quiz 2", 10], ["Assignment 1", 10], ["Mid Term", 30], ["Final Exam", 40]];
  let mCourse = null, mTab = "marks";
  const marksOf = (c) => (S().marks[c] = S().marks[c] || { parts: DEFAULT_PARTS.map(([n, w]) => ({ n, w, got: "" })) });
  const gradeOf = (pct) => ctx.GRADES.find((g) => pct >= g.min) || ctx.GRADES[ctx.GRADES.length - 1];
  ctx.marksSummary = (c) => { const m = S().marks[c]; if (!m) return null; const done = m.parts.filter((p) => p.got !== "" && p.got != null); const got = done.reduce((a, p) => a + Number(p.got), 0), of = done.reduce((a, p) => a + Number(p.w), 0); return { got, of, total: m.parts.reduce((a, p) => a + Number(p.w), 0) }; };
  pages.marks = () => {
    const St = S(), courses = [...new Set(St.routine.map((r) => r.code))];
    if (!courses.length) return `${ctx.subHead("Marks &amp; Attendance Estimator", "", "#/courses")}<div class="card">${ctx.empty("icon:percent", "Add your courses first", "Sync your routine so we know your courses.", `<a class="btn primary" href="#/sync">Sync Portal</a>`)}</div>`;
    const qc = ctx.qparam("c"); if (qc && courses.includes(qc.toUpperCase())) mCourse = qc.toUpperCase();
    if (!courses.includes(mCourse)) mCourse = courses[0];
    const picker = `<div style="display:flex;justify-content:center;margin-bottom:12px"><select class="select" id="m-course" style="width:auto;font-weight:600" aria-label="Course">${courses.map((c) => `<option value="${esc(c)}" ${c === mCourse ? "selected" : ""}>${esc(c)}${St.routine.find((r) => r.code === c)?.title ? " - " + esc(St.routine.find((r) => r.code === c).title) : ""}</option>`).join("")}</select></div>`;
    return `${ctx.subHead("Marks &amp; Attendance Estimator", "", ctx.qparam("from") === "course" ? `#/course?c=${encodeURIComponent(mCourse)}` : "#/courses")}<div style="max-width:760px;margin:0 auto">${picker}
      ${ctx.seg([["marks", "Marks Estimator"], ["att", "Attendance Estimator"]], mTab, "data-mt", "fill")}<div class="mt" id="m-body">${mTab === "marks" ? marksBody(mCourse) : attBody(mCourse)}</div></div>`;
  };
  function marksBody(c) {
    const m = marksOf(c), total = m.parts.reduce((a, p) => a + Number(p.w), 0);
    const firstOpen = m.parts.findIndex((p) => p.got === "" || p.got == null);
    return `<h3>1. Enter your expected marks</h3><p class="small muted">Fill in your expected score for remaining components.</p>
      <section class="card tight mt-s"><table class="mtable">${m.parts.map((p, i) => `<tr class="${p.got === "" || p.got == null ? (i === firstOpen ? "upcoming" : "") : ""}"><td><b style="font-weight:600">${esc(p.n)}</b> <span class="xs">(${p.got === "" || p.got == null ? "Upcoming" : "Completed"})</span></td><td class="num muted" style="width:56px">${p.w}</td><td style="width:96px"><input class="input num" type="number" min="0" max="${p.w}" step="0.5" data-got="${i}" value="${esc(p.got)}" placeholder="—" aria-label="${esc(p.n)} marks out of ${p.w}"></td></tr>`).join("")}</table>
        <div class="row between mt-s"><span class="xs">${total === 100 ? "Total weight 100" : `Weights add up to ${total}, not 100`}</span><button class="btn sm ghost" id="m-edit">${icon("edit")} Edit components</button></div></section>
      <div id="m-out">${marksOut(c)}</div>`;
  }
  function marksOut(c) {
    const m = marksOf(c), total = m.parts.reduce((a, p) => a + Number(p.w), 0);
    const got = m.parts.reduce((a, p) => a + (p.got === "" || p.got == null ? 0 : Number(p.got)), 0);
    const counted = m.parts.filter((p) => p.got !== "" && p.got != null).reduce((a, p) => a + Number(p.w), 0);
    const pct = counted ? (100 * got) / counted : 0, g = gradeOf(pct); // estimate from what has been assessed so far
    const open = m.parts.map((p) => p.got === "" || p.got == null), last = m.parts[open.includes(true) ? open.lastIndexOf(true) : m.parts.length - 1];
    const otherGot = got - (last.got === "" || last.got == null ? 0 : Number(last.got));
    const opts = [0.5, 0.6, 0.7, 0.8, 0.9, 1].map((f) => Math.round(last.w * f * 2) / 2);
    const scale = ctx.GRADES.slice().reverse();
    return `<h3 class="mt">2. See your estimated result</h3>
      <div class="est mt-s"><div class="grade"><b>${g.g}</b><span class="xs">Estimated Grade</span></div><div><span class="xs">Total Marks (Est.)</span><b style="font-size:24px;display:block" class="num">${got % 1 ? got.toFixed(1) : got} / ${counted || total}</b></div><div><span class="xs">Percentage</span><b style="font-size:24px;display:block" class="num">${pct.toFixed(1)}%</b></div></div>
      <div class="gstrip mt-s">${scale.map((x, i) => `<div class="${x.g === g.g ? "on" : ""}"><b>${x.g}</b>${x.min}${i < scale.length - 1 ? `-${scale[i + 1].min - 1}` : "+"}</div>`).join("")}</div>
      <h3 class="mt">What if I score different in ${esc(last.n)}?</h3>
      <div class="whatif mt-s">${opts.map((v) => { const p2 = total ? (100 * (otherGot + v)) / total : 0; return `<button data-wi="${v}" data-wi-i="${m.parts.indexOf(last)}" aria-pressed="${String(last.got) === String(v)}"><span>${v}/${last.w}</span><b>${gradeOf(p2).g}</b><span>${p2.toFixed(1)}%</span></button>`; }).join("")}</div>
      <p class="xs mt-s">Cut-offs: ${ctx.GRADES.slice(0, -1).map((x) => `${x.g} ${x.min}`).join(" · ")}. They vary by course outline, so check yours.</p>
      <button class="btn primary lg block mt" id="m-save">${icon("bookmark")} Save This Plan</button>`;
  }
  function attBody(c) {
    const a = S().attendance[c] || { held: 0, missed: 0 }, planned = a.planned || 26;
    const pct = a.held ? Math.round((100 * (a.held - a.missed)) / a.held) : 100;
    const canMiss = Math.max(0, Math.floor(planned * 0.3) - a.missed);
    return `<section class="card"><div class="row nowrap" style="gap:18px"><div class="ring lg ${pct < 70 ? "red" : "green"}" style="--p:${pct}"><div><b>${pct}%</b><span>Attendance</span></div></div>
        <div class="grow"><div class="stats-strip" style="grid-template-columns:repeat(3,1fr)"><div style="flex-direction:column;align-items:flex-start;gap:0"><b class="num">${a.held}</b><span>Total</span></div><div style="flex-direction:column;align-items:flex-start;gap:0"><b class="num" style="color:var(--success)">${a.held - a.missed}</b><span>Present</span></div><div style="flex-direction:column;align-items:flex-start;gap:0"><b class="num" style="color:var(--error)">${a.missed}</b><span>Absent</span></div></div></div></div>
      <div class="row mt"><button class="btn primary grow" data-att="present">${icon("check")} Present</button><button class="btn danger-soft grow" data-att="absent">${icon("x")} Absent</button><button class="btn neutral" data-att="undo" aria-label="Undo last">${icon("reset")}</button></div></section>
      ${pct < 70 && a.held ? `<div class="alert red mt"><span class="a-ic">${icon("alertc")}</span><div><b>Your attendance is below 70%</b><p>Many courses require at least 70% to sit the final. Check your course outline.</p></div></div>` : ""}
      <section class="card mt stack"><h3>Plan ahead</h3><label class="field">Classes planned this semester<input class="input" type="number" id="a-planned" min="1" max="60" value="${planned}"></label>
        <div class="alert ${canMiss > 2 ? "green" : canMiss > 0 ? "amber" : "red"}"><span class="a-ic">${icon("calendar")}</span><div><b>You can miss ${canMiss} more class${canMiss === 1 ? "" : "es"}</b><p>…and still finish at 70%+ (${planned} classes in total).</p></div></div></section>`;
  }
  pages.marks.mount = (el) => {
    $("#m-course", el).addEventListener("change", (e) => { mCourse = e.target.value; ctx.rerender(); });
    $$("[data-mt]", el).forEach((b) => b.addEventListener("click", () => { mTab = b.dataset.mt; ctx.rerender(); }));
    const c = mCourse, m = marksOf(c);
    const refresh = () => { const o = $("#m-out", el); if (o) { o.innerHTML = marksOut(c); bindOut(); } };
    const bindOut = () => {
      $$("[data-wi]", el).forEach((b) => b.addEventListener("click", () => { m.parts[Number(b.dataset.wiI)].got = b.dataset.wi; ctx.save({ silent: true }); ctx.rerender(); }));
      const s = $("#m-save", el); s && s.addEventListener("click", () => { ctx.save(); toast("Plan saved", "success", `${c}: estimate saved.`); });
    };
    $$("[data-got]", el).forEach((i) => i.addEventListener("input", () => { m.parts[i.dataset.got].got = i.value; ctx.save({ silent: true }); refresh(); }));
    bindOut();
    const ed = $("#m-edit", el); ed && ed.addEventListener("click", () => openModal(modalHead("Edit components") + `<form id="mc-form" class="stack"><div id="mc-rows" class="stack" style="gap:8px">${m.parts.map((p) => `<div class="row nowrap"><input class="input" name="n" value="${esc(p.n)}" aria-label="Component name"><input class="input num" name="w" type="number" min="0" max="100" value="${p.w}" aria-label="Out of" style="width:90px"><button type="button" class="btn icon-only neutral" data-rmrow aria-label="Remove">${icon("x")}</button></div>`).join("")}</div>
      <button type="button" class="btn outline sm" id="mc-add">${icon("plus")} Add component</button><p class="xs">Copy components and marks from your course outline. Weights should add up to 100.</p><button class="btn primary block">Save</button></form>`, (mm) => {
      const rows = $("#mc-rows", mm);
      rows.addEventListener("click", (e) => { if (e.target.closest("[data-rmrow]")) e.target.closest(".row").remove(); });
      $("#mc-add", mm).addEventListener("click", () => rows.insertAdjacentHTML("beforeend", `<div class="row nowrap"><input class="input" name="n" placeholder="e.g. Lab" aria-label="Component name"><input class="input num" name="w" type="number" min="0" max="100" value="10" aria-label="Out of" style="width:90px"><button type="button" class="btn icon-only neutral" data-rmrow aria-label="Remove">${icon("x")}</button></div>`));
      $("#mc-form", mm).addEventListener("submit", (e) => { e.preventDefault(); const old = Object.fromEntries(m.parts.map((p) => [p.n, p.got])); m.parts = $$(".row", rows).map((r) => ({ n: r.querySelector('[name="n"]').value.trim() || "Component", w: Number(r.querySelector('[name="w"]').value) || 0, got: old[r.querySelector('[name="n"]').value.trim()] ?? "" })); ctx.save(); closeModal(); ctx.rerender(); });
    }));
    $$("[data-att]", el).forEach((b) => b.addEventListener("click", () => ctx.markAttendance(c, b.dataset.att)));
    const pl = $("#a-planned", el); pl && pl.addEventListener("change", () => { const a = S().attendance[c] = S().attendance[c] || { held: 0, missed: 0 }; a.planned = Number(pl.value) || 26; ctx.save(); ctx.rerender(); });
  };

  /* ═════════════ DEADLINES ═════════════ */
  let tTab = "All";
  const TYPES = ["Assignment", "Quiz", "Lab", "Presentation", "Exam", "Advising", "Other"];
  pages.tasks = () => {
    const St = S(), now = new Date(), endToday = new Date(now); endToday.setHours(23, 59, 59, 999);
    const endWeek = new Date(endToday); endWeek.setDate(endWeek.getDate() + 6);
    const feeItems = (St.payments.schedule || []).filter((p) => !p.late && !St.paid[p.due] && ctx.daysUntil(p.due) >= 0).map((p) => ({ title: "Tuition payment", course: "", type: "Fees", due: new Date(p.due + "T23:59:00").toISOString(), where: ctx.fmtMoney(p.amount) }));
    const filt = (t) => tTab === "All" || (tTab === "Assignments" ? ["Assignment", "Lab", "Presentation", "Quiz", "Other"].includes(t.type) : tTab === "Exams" ? t.type === "Exam" : tTab === "Fees" ? t.type === "Fees" : t.type === "Advising");
    const open = St.tasks.filter((t) => !t.done).concat(feeItems).filter(filt).sort((a, b) => new Date(a.due) - new Date(b.due));
    const groups = [["Today", now.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" }), open.filter((t) => new Date(t.due) <= endToday)],
      ["This Week", `${now.getDate()} – ${endWeek.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`, open.filter((t) => new Date(t.due) > endToday && new Date(t.due) <= endWeek)],
      ["Later", `After ${endWeek.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`, open.filter((t) => new Date(t.due) > endWeek)]];
    const done = St.tasks.filter((t) => t.done);
    return `${ctx.head("Deadlines", "Stay on track, never miss a deadline.", `<button class="btn primary" id="t-add">${icon("plus")} Add</button>`, ctx.art("mascot-laptop", "Plan today,<br>Stress less<br>tomorrow!"))}
      ${ctx.seg(["All", "Assignments", "Exams", "Fees", "Advising"].map((x) => [x, x]), tTab, "data-tt")}
      ${!St.settings.notify ? `<div class="alert purple mt"><span class="a-ic">${icon("bell")}</span><div class="grow"><b>Never miss one</b><p>Get a reminder 1 day and 1 hour before each deadline.</p></div><button class="btn primary sm" id="notif-btn">Turn on</button></div>` : ""}
      ${open.length ? groups.filter((g) => g[2].length).map(([t, sub, items]) => `<div class="section-h"><h2>${t} <span class="small muted" style="font-weight:500;margin-left:6px">${sub}</span></h2><span class="small muted">${items.length} item${items.length > 1 ? "s" : ""}</span></div><div>${items.map((x) => ctx.taskLine(x)).join("")}</div>`).join("")
        : `<div class="card mt">${ctx.empty("mascot-reading", "Nothing due", "You're all caught up. Add assignments, quizzes and exams to get reminders.", `<button class="btn primary" id="t-add2">${icon("plus")} Add Deadline</button>`)}</div>`}
      <div class="row mt-l"><a class="btn outline" href="#/exams">${icon("exam")} Exam revision planner</a></div>
      ${done.length ? `<details class="card mt"><summary><b>Completed (${done.length})</b></summary>${done.map((t) => `<div class="lrow"><input type="checkbox" class="check" checked data-undone="${t.id}" aria-label="Mark ${esc(t.title)} not done"><div class="body"><b style="text-decoration:line-through;color:var(--text-3)">${esc(t.title)}</b><span>${esc(t.course || "")} · ${esc(t.type)}</span></div><button class="btn sm icon-only ghost" data-tdel="${t.id}" aria-label="Delete">${icon("trash")}</button></div>`).join("")}</details>` : ""}`;
  };
  function taskForm(t) {
    const courses = [...new Set(S().routine.map((r) => r.code))];
    const d = t ? new Date(t.due) : new Date(Date.now() + 864e5); d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    openModal(modalHead(t ? "Edit deadline" : "Add deadline") + `<form id="t-form" class="grid g2">
      <label class="field full-row">Title<input class="input" name="title" required placeholder="e.g. Assignment 2" value="${esc(t?.title || "")}"></label>
      <label class="field">Course<input class="input" name="course" list="course-list" value="${esc(t?.course || "")}" placeholder="CSE211"><datalist id="course-list">${courses.map((c) => `<option value="${esc(c)}">`).join("")}</datalist></label>
      <label class="field">Type<select class="select" name="type">${TYPES.map((x) => `<option ${t?.type === x ? "selected" : ""}>${x}</option>`).join("")}</select></label>
      <label class="field full-row">Due<input class="input" type="datetime-local" name="due" required value="${d.toISOString().slice(0, 16)}"></label>
      <label class="field full-row">Where (optional)<input class="input" name="where" placeholder="Room, Google Classroom…" value="${esc(t?.where || "")}"></label>
      <div class="row full-row"><button type="button" class="btn neutral grow" data-close>Cancel</button><button class="btn primary grow">${t ? "Save" : "Add"}</button></div></form>`, (m) => {
      $("#t-form", m).addEventListener("submit", (e) => {
        e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)); const v = { ...f, course: f.course.toUpperCase().replace(/\s/g, ""), due: new Date(f.due).toISOString() };
        if (t) Object.assign(t, v); else S().tasks.push({ id: uid(), ...v, done: false });
        ctx.save(); closeModal(); ctx.rerender(); toast(t ? "Deadline updated" : "Deadline added", "success", v.title);
      });
    });
  }
  pages.tasks.mount = (el) => {
    const on = (s, fn) => $$(s, el).forEach((b) => b.addEventListener("click", fn));
    on("[data-tt]", (e) => { tTab = e.currentTarget.dataset.tt; ctx.rerender(); });
    on("#t-add, #t-add2", () => taskForm(null));
    on("#notif-btn", async () => { await ctx.enableNotifications(); ctx.rerender(); });
    on("[data-tmenu]", (e) => {
      const t = S().tasks.find((x) => x.id === e.currentTarget.dataset.tmenu);
      openModal(modalHead(t.title) + `<div class="stack" style="gap:0">
        <button class="lrow" id="tm-done"><span class="itile green">${icon("check")}</span><span class="body"><b>Mark as done</b><span>+15 XP</span></span></button>
        <button class="lrow" id="tm-edit"><span class="itile purple">${icon("edit")}</span><span class="body"><b>Edit</b><span>Change title, type or due date</span></span></button>
        ${t.course ? `<a class="lrow" href="#/course?c=${encodeURIComponent(t.course)}" data-close><span class="itile blue">${icon("book")}</span><span class="body"><b>Open ${esc(t.course)}</b><span>Course hub</span></span></a>` : ""}
        <button class="lrow" id="tm-del"><span class="itile red">${icon("trash")}</span><span class="body"><b style="color:var(--error-t)">Delete</b><span>Remove this deadline</span></span></button></div>`, (m) => {
        $("#tm-done", m).addEventListener("click", () => { t.done = true; if (!t.xp) { t.xp = 1; ctx.study.award(15, "deadline done"); } ctx.save(); closeModal(); ctx.rerender(); });
        $("#tm-edit", m).addEventListener("click", () => { closeModal(); taskForm(t); });
        $("#tm-del", m).addEventListener("click", () => { S().tasks = S().tasks.filter((x) => x !== t); ctx.save(); closeModal(); ctx.rerender(); toast("Deadline deleted", "info", t.title); });
      });
    });
    on("[data-undone]", (e) => { S().tasks.find((x) => x.id === e.currentTarget.dataset.undone).done = false; ctx.save(); ctx.rerender(); });
    on("[data-tdel]", (e) => { S().tasks = S().tasks.filter((x) => x.id !== e.currentTarget.dataset.tdel); ctx.save(); ctx.rerender(); });
    if (ctx.qparam("add")) { history.replaceState(null, "", "#/tasks"); setTimeout(() => taskForm(null)); }
  };

  /* ═════════════ FEES ═════════════ */
  const feeRows = () => { const f = S().payments.fees || {}; return [["tuition", "Tuition Fee"], ["lab", "Laboratory Fee"], ["activity", "Student Activity Fee"], ["library", "Library Fee"]].filter(([k]) => f[k]).map(([k, l]) => [l, f[k]]); };
  pages.fees = () => {
    const St = S(), P = St.payments || { schedule: [] }, sched = (P.schedule || []).slice().sort((a, b) => a.due.localeCompare(b.due));
    if (!sched.length) return `${ctx.head("My Fees", "Track your installments, payments and important dates.")}<div class="card">${ctx.empty("icon:wallet", "No payment info yet", "Sync your <b>Advising / Deposit Slip</b> (My Class Schedule → Print Slip) to see your fees, deadlines and late-fee steps.", `<a class="btn primary" href="#/sync">${icon("sync")} Sync Advising Slip</a>`)}</div>`;
    const regular = sched.find((p) => !p.late) || sched[0];
    const paid = St.paid[regular.due] ? regular.amount : 0;
    const next = ctx.nextPayment();
    return `${ctx.demoBanner()}${ctx.head("My Fees", "Track your installments, payments and important dates.", `<span class="pill" style="padding:8px 12px">${esc(P.semester || St.routineSem || "")}</span>`)}
      <div class="grid g2"><div class="fee-hero"><span class="small" style="opacity:.92">Total Payable This Semester</span><div class="amt num">${ctx.fmtMoney(regular.amount)}</div><a class="btn glass sm" href="#/fee">View Details ${icon("arrow")}</a></div>
        <div class="g3m">${[["receipt", "green", ctx.fmtMoney(paid), "Paid"], ["wallet", "purple", ctx.fmtMoney(regular.amount - paid), "Remaining"], ["calendar", "blue", sched.length, "Deadlines"]].map(([ic, tone, v, l]) => `<div class="card tight row nowrap" style="flex-direction:column;align-items:flex-start;gap:8px"><span class="itile sm ${tone}">${icon(ic)}</span><b class="num">${v}</b><span class="xs">${l}</span></div>`).join("")}</div></div>
      ${next && ctx.daysUntil(next.due) <= 7 ? `<a class="alert red mt" href="#/fee"><span class="a-ic">${icon("alertc")}</span><div class="grow"><b>Due in ${ctx.daysUntil(next.due)} day${ctx.daysUntil(next.due) === 1 ? "" : "s"}</b><p>Pay ${ctx.fmtMoney(next.amount)} before ${ctx.fmtDate(next.due)}${next.late ? "" : " to avoid late fees"}.</p></div>${icon("chevR")}</a>` : ""}
      <div class="section-h"><h2>Payment Deadlines</h2><button class="btn sm outline" id="f-hist">${icon("receipt")} Payment History</button></div>
      ${sched.map((p, i) => { const d = ctx.daysUntil(p.due), isPaid = !!St.paid[p.due], cur = next && next.due === p.due; return `<div class="inst ${cur ? "due" : ""}"><span class="n ${isPaid ? "ok" : ""}">${isPaid ? icon("check", "sm") : i + 1}</span>
        <div class="min0"><div class="row" style="gap:8px"><b>${p.late ? `With late fee ${i}` : "Regular deadline"}</b>${isPaid ? '<span class="pill green">Paid</span>' : d < 0 ? '<span class="pill">Passed</span>' : cur ? `<span class="pill red">Due in ${d} day${d === 1 ? "" : "s"}</span>` : ""}</div><span class="xs">Amount</span><div><b class="num">${ctx.fmtMoney(p.amount)}</b>${i ? ` <span class="xs">(+${ctx.fmtMoney(p.amount - sched[0].amount)} late fee)</span>` : ""}</div></div>
        <div style="text-align:right"><span class="xs">Due Date</span><div class="small"><b>${ctx.fmtDate(p.due)}</b></div>${!p.late ? `<button class="btn sm ${isPaid ? "neutral" : "primary"} mt-s" data-paid="${p.due}">${isPaid ? "Mark unpaid" : `${icon("check")} Mark as paid`}</button>` : ""}</div></div>`; }).join("")}
      ${feeRows().length ? `<section class="card mt"><h2 style="margin-bottom:6px">Fee Breakdown</h2>${feeRows().map(([l, v]) => `<div class="lrow" style="min-height:44px"><span class="itile sm purple">${icon("receipt")}</span><span class="body"><b style="font-weight:500">${l}</b></span><b class="num">${ctx.fmtMoney(v)}</b></div>`).join("")}</section>` : ""}
      ${!St.settings.notify ? `<div class="alert purple mt"><span class="a-ic">${icon("bell")}</span><div class="grow"><b>Get payment reminders</b><p>3 days and 1 day before the regular deadline.</p></div><button class="btn primary sm" id="fee-notif">Remind me</button></div>` : ""}
      <p class="xs mt">Amounts come from your advising slip. Pay through the official channels printed on your slip (banks or mobile banking) and always confirm on the official portal.</p>`;
  };
  pages.fees.mount = (el) => {
    $$("[data-paid]", el).forEach((b) => b.addEventListener("click", () => { const k = b.dataset.paid; if (S().paid[k]) delete S().paid[k]; else { S().paid[k] = new Date().toISOString(); ctx.logEvent("System", "wallet", "green", "Payment marked as paid", `${ctx.fmtMoney((S().payments.schedule.find((p) => p.due === k) || {}).amount)} for ${S().payments.semester || ""}.`, "#/fees"); } ctx.save(); ctx.rerender(); }));
    const n = $("#fee-notif", el); n && n.addEventListener("click", async () => { await ctx.enableNotifications(); ctx.rerender(); });
    $("#f-hist", el)?.addEventListener("click", () => { const P = S().paid; const rows = (S().payments.schedule || []).filter((p) => P[p.due]);
      openModal(modalHead("Payment History") + (rows.length ? rows.map((p) => `<div class="lrow"><span class="itile green">${icon("check")}</span><div class="body"><b>${ctx.fmtMoney(p.amount)}</b><span>Marked paid ${ctx.fmtDate(P[p.due])}</span></div><span class="xs">Due ${ctx.fmtDate(p.due)}</span></div>`).join("") : ctx.empty("icon:receipt", "No payments marked yet", "After you pay, tap Mark as paid to stop the reminders."))); });
  };
  pages.fee = () => {
    const St = S(), sched = (St.payments.schedule || []).slice().sort((a, b) => a.due.localeCompare(b.due));
    if (!sched.length) return `${ctx.subHead("Payment Details", "", "#/fees")}<div class="card">${ctx.empty("icon:wallet", "No payment info", "Sync your advising slip first.", `<a class="btn primary" href="#/sync">Sync</a>`)}</div>`;
    const next = ctx.nextPayment(), cur = next ? sched.indexOf(next) : sched.length, d = next ? ctx.daysUntil(next.due) : 0;
    const total = feeRows().reduce((a, [, v]) => a + v, 0) || sched[0].amount;
    return `${ctx.subHead("Payment Details", esc(St.payments.semester || ""), "#/fees", `<a class="btn sm outline" href="#/help">${icon("help")} Help</a>`)}<div style="max-width:720px;margin:0 auto">
      ${next ? `<div class="alert red"><span class="a-ic">${icon("alertc")}</span><div><b>Due in ${d} day${d === 1 ? "" : "s"}</b><p>Pay before ${ctx.fmtDate(next.due)}${next.late ? "" : " to avoid late fees"}.</p></div></div>` : `<div class="alert green"><span class="a-ic">${icon("check")}</span><div><b>${St.paid[sched[0].due] ? "Paid" : "All deadlines passed"}</b><p>Check the portal ledger for your balance.</p></div></div>`}
      <div class="card mt"><div class="stepper" style="--n:${sched.length}">${sched.map((p, i) => `<div class="st ${St.paid[p.due] || i < cur ? "done" : i === cur ? "cur" : ""}"><span class="dotc">${St.paid[p.due] || i < cur ? icon("check", "sm") : i + 1}</span><b>${p.late ? `Late fee ${i}` : "Regular"}</b><span class="xs">${St.paid[p.due] ? "Paid" : i === cur ? "Due" : i < cur ? "Passed" : "If unpaid"}</span><span class="xs">${ctx.fmtDate(p.due)}</span></div>`).join("")}</div></div>
      <section class="card mt"><h2 style="margin-bottom:6px">Amount Details</h2>${feeRows().map(([l, v]) => `<div class="row between" style="padding:8px 0"><span class="muted">${l}</span><span class="num">${ctx.fmtMoney(v)}</span></div>`).join("")}
        <hr class="divider"><div class="row between"><b>Total Amount</b><b class="num" style="font-size:22px;color:var(--primary)">${ctx.fmtMoney(total)}</b></div>
        ${sched.slice(1).map((p) => `<div class="row between small" style="padding-top:6px"><span class="muted">After ${ctx.fmtDate(sched[sched.indexOf(p) - 1].due)} (late)</span><span class="num">${ctx.fmtMoney(p.amount)}</span></div>`).join("")}</section>
      ${sched[0] && !sched[0].late ? `<button class="btn ${St.paid[sched[0].due] ? "neutral" : "primary"} lg block mt" id="fd-paid">${St.paid[sched[0].due] ? "Mark as unpaid" : `${icon("check")} I've paid — Mark as paid`}</button>` : ""}
      <p class="xs mt">EWUdiots doesn't take payments. Pay through the banks or mobile-banking biller listed on your official advising slip.</p></div>`;
  };
  pages.fee.mount = (el) => { const b = $("#fd-paid", el); b && b.addEventListener("click", () => { const k = (S().payments.schedule || []).slice().sort((a, c) => a.due.localeCompare(c.due))[0].due; if (S().paid[k]) delete S().paid[k]; else S().paid[k] = new Date().toISOString(); ctx.save(); ctx.rerender(); toast(S().paid[k] ? "Marked as paid" : "Marked as unpaid", "success"); }); };
}
