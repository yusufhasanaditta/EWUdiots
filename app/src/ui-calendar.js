/* Academic calendar (#/calendar): EWU's official undergraduate calendar (holidays like Durga Puja, tuition deadlines,
   exams, advising, breaks) on a month grid together with your own classes, plus your final exam day per course
   (EWU schedules finals by class days: ST, MW, TR, SR). Data: /api/calendar (src/acadcal.js), kept on the device. */
const KEY = "ewudiots.acadcal";
const LOOK = { holiday: ["sun", "red", "Holiday"], payment: ["wallet", "orange", "Payment"], exam: ["exam", "purple", "Exam"], deadline: ["alert", "blue", "Deadline"],
  advising: ["calcheck", "green", "Advising"], classes: ["school", "teal", "Classes"], break: ["coffee", "pink", "Break"], other: ["calendar", "purple", "Event"] };
const DAY = 864e5;
const iso = (d) => { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`; };

export function install(ctx) {
  const { pages, icon, esc, $, $$, toast, openModal, modalHead } = ctx;
  const S = () => ctx.S;
  let data = null, loading = false;
  try { data = JSON.parse(localStorage.getItem(KEY) || "null"); } catch { data = null; }
  function refresh(force = false) {
    if (loading || (!force && data && Date.now() - data.at < 12 * 36e5)) return;
    loading = true;
    fetch(`${ctx.native.isNative ? ctx.SITE : ""}/api/calendar`).then((r) => r.json()).then((j) => {
      if (!j.semesters?.length) return;
      data = { at: Date.now(), semesters: j.semesters };
      try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* storage full */ }
      if (["calendar", "home", "routine"].includes(ctx.route())) ctx.rerender();
      ctx.scheduleReminders();
    }).catch(() => {}).finally(() => { loading = false; });
  }
  refresh();

  const events = () => (data?.semesters || []).flatMap((s) => s.events.map((e) => ({ ...e, sem: s.sem })));
  const covers = (e, day) => day >= e.start && day <= (e.end || e.start);
  const on = (day) => events().filter((e) => covers(e, day));
  // No classes on holidays and in the semester break.
  const isOff = (day) => on(day).some((e) => e.kind === "holiday" || /semester break|vacation/i.test(e.title));
  const upcoming = (n = 5, kinds) => { const today = iso(Date.now()); return events().filter((e) => (e.end || e.start) >= today && (!kinds || kinds.includes(e.kind))).sort((a, b) => a.start.localeCompare(b.start)).slice(0, n); };
  const fmt = (d, o = { day: "numeric", month: "short" }) => new Date(d + "T00:00:00").toLocaleDateString("en-GB", o);
  const span = (e) => (e.end ? `${fmt(e.start)} – ${fmt(e.end)}` : fmt(e.start, { weekday: "short", day: "numeric", month: "short" }));
  const inDays = (d) => { const n = Math.round((new Date(d + "T00:00:00") - new Date(iso(Date.now()) + "T00:00:00")) / DAY); return n <= 0 ? "Today" : n === 1 ? "Tomorrow" : `In ${n} days`; };

  /* Your final exam per course: the theory classes' day pattern (e.g. "MW") → that semester's final exam date. */
  function myFinals() {
    const sem = (data?.semesters || []).find((s) => s.sem === S().routineSem) || (data?.semesters || []).slice(-1)[0];
    if (!sem || !Object.keys(sem.finals || {}).length) return [];
    const byCode = new Map();
    for (const r of S().routine) if (!r.lab && r.days) byCode.set(r.code, { code: r.code, title: r.title, days: r.days.toUpperCase().split("").sort((a, b) => "SMTWRFA".indexOf(a) - "SMTWRFA".indexOf(b)).join("") });
    return [...byCode.values()].map((c) => ({ ...c, date: sem.finals[c.days] || "" })).filter((c) => c.date).sort((a, b) => a.date.localeCompare(b.date));
  }

  // Phone reminders: the day before each payment deadline and holiday notices.
  function reminderItems() {
    return upcoming(30, ["payment", "deadline", "exam"]).map((e) => ({ key: `cal-${e.start}-${e.title}`.slice(0, 80), title: e.kind === "payment" ? "Tuition deadline tomorrow" : e.kind === "exam" ? "Exams start tomorrow" : "EWU deadline tomorrow", body: e.title, at: new Date(new Date(e.start + "T10:00:00") - DAY) }))
      .concat(myFinals().map((f) => ({ key: `final-${f.code}-${f.date}`, title: `Final exam tomorrow: ${f.code}`, body: `${f.title || f.code} · check the room on the portal`, at: new Date(new Date(f.date + "T09:00:00") - DAY) })));
  }

  let month = null, picked = null, filter = "all";
  pages.calendar = () => {
    const head = ctx.head("Academic calendar", "EWU's holidays, payment deadlines and exams, together with your classes.");
    if (!data) { refresh(true); return head + `<div class="stack mt">${[1, 2].map(() => '<div class="skel" style="height:160px"></div>').join("")}</div>`; }
    const now = new Date(); month = month || new Date(now.getFullYear(), now.getMonth(), 1);
    const y = month.getFullYear(), m = month.getMonth(), first = new Date(y, m, 1), lead = first.getDay(), days = new Date(y, m + 1, 0).getDate();
    const classDays = new Set(ctx.expand(S().routine).map((b) => b.day)), today = iso(now);
    const cells = [];
    for (let i = 0; i < lead; i++) cells.push('<span class="cg-cell pad" aria-hidden="true"></span>');
    for (let d = 1; d <= days; d++) {
      const day = iso(new Date(y, m, d)), ev = on(day), off = isOff(day), cls = classDays.has(new Date(y, m, d).getDay()) && !off;
      const dots = [...new Set(ev.map((e) => e.kind))].slice(0, 3).map((k) => `<i class="cg-dot ${k}"></i>`).join("") + (cls ? '<i class="cg-dot cls"></i>' : "");
      cells.push(`<button class="cg-cell${day === today ? " today" : ""}${off ? " off" : ""}${picked === day ? " sel" : ""}" data-day="${day}" aria-label="${fmt(day, { weekday: "long", day: "numeric", month: "long" })}${off ? ", holiday" : ""}"><b>${d}</b><span class="cg-dots">${dots}</span></button>`);
    }
    const dayList = picked ? (() => {
      const ev = on(picked), dow = new Date(picked + "T00:00:00").getDay(), cls = isOff(picked) ? [] : ctx.expand(S().routine).filter((b) => b.day === dow).sort((a, b) => a.s - b.s);
      return `<section class="card mt cg-day"><h3>${fmt(picked, { weekday: "long", day: "numeric", month: "long" })}</h3>
        ${ev.map((e) => row(e)).join("")}${cls.map((b) => `<div class="lrow"><span class="itile teal">${icon("school")}</span><span class="body"><b>${esc(b.code)}${b.lab ? " Lab" : ""}</b><span>${ctx.fmt12(b.s)} – ${ctx.fmt12(b.e)} · ${esc(b.room || "TBA")}</span></span></div>`).join("")}
        ${!ev.length && !cls.length ? '<p class="small muted">Nothing on this day.</p>' : ""}${isOff(picked) && classDays.has(dow) ? '<p class="small" style="color:var(--error-t)">No classes: university holiday.</p>' : ""}</section>`;
    })() : "";
    const list = events().filter((e) => filter === "all" || e.kind === filter).filter((e) => (e.end || e.start) >= today);
    const finals = myFinals(), next = upcoming(1)[0];
    return `${head}
      ${next ? `<section class="cal-hero fx-rise"><i class="sheen" aria-hidden="true"></i><div class="cal-hero-glow" aria-hidden="true"></div><span class="cal-kicker">${icon(LOOK[next.kind][0], "sm")} Next on the EWU calendar</span><h2>${esc(next.title)}</h2><p>${span(next)} · <b>${inDays(next.start)}</b></p></section>` : ""}
      <div class="grid g2 mt cal-grid">
        <section class="card"><div class="row between"><button class="icon-btn" id="cg-prev" aria-label="Previous month">${icon("chevL")}</button><h3 style="margin:0">${month.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}</h3><button class="icon-btn" id="cg-next" aria-label="Next month">${icon("chevR")}</button></div>
          <div class="cg-head">${["S", "M", "T", "W", "T", "F", "S"].map((d) => `<span>${d}</span>`).join("")}</div><div class="cg">${cells.join("")}</div>
          <div class="cg-legend">${["holiday", "payment", "exam", "deadline"].map((k) => `<span><i class="cg-dot ${k}"></i>${LOOK[k][2]}</span>`).join("")}<span><i class="cg-dot cls"></i>Your classes</span></div></section>
        <div>${dayList}
          <section class="card ${dayList ? "mt" : ""}"><div class="card-h"><h2><span class="itile sm purple">${icon("exam")}</span> Your final exams</h2></div>
            ${finals.length ? finals.map((f) => `<div class="lrow"><span class="cal-date"><b>${fmt(f.date, { day: "numeric" })}</b><span>${fmt(f.date, { month: "short" })}</span></span><span class="body"><b>${esc(f.code)}</b><span>${esc(f.title || "")} · ${f.days} classes · ${inDays(f.date)}</span></span></div>`).join("")
              : `<p class="small muted">${S().routine.length ? "EWU hasn't published the final exam schedule for your semester yet." : "Sync your Class Schedule and your final exam dates appear here."}</p>`}
            <p class="xs mt-s">From EWU's final exam schedule by class days. Confirm rooms on the portal.</p></section></div></div>
      <div class="row between mt-l wrap" style="gap:8px"><h2 style="margin:0">Coming up</h2><button class="btn sm" id="cg-ics">${icon("download", "sm")} Add to my phone calendar</button></div>
      <div class="chips mt-s">${[["all", "All"], ["holiday", "Holidays"], ["payment", "Payments"], ["exam", "Exams"], ["deadline", "Deadlines"], ["advising", "Advising"], ["break", "Breaks"]].map(([v, l]) => `<button class="chip" data-kf="${v}" aria-pressed="${filter === v}">${l}</button>`).join("")}</div>
      <section class="card mt tight">${list.length ? list.slice(0, 60).map(row).join("") : '<p class="small muted">Nothing coming up.</p>'}</section>
      <p class="xs mt" style="text-align:center">From <a href="https://www.ewubd.edu/academic-calendar" target="_blank" rel="noopener">ewubd.edu/academic-calendar</a> (undergraduate programs, except B.Pharm/LL.B). Updated ${new Date(data.at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}.</p>`;
    function row(e) { const [ic, tone] = LOOK[e.kind] || LOOK.other; return `<div class="lrow"><span class="itile ${tone}">${icon(ic)}</span><span class="body"><b>${esc(e.title)}</b><span>${span(e)} · ${inDays(e.start)}</span></span></div>`; }
  };
  pages.calendar.mount = (el) => {
    $("#cg-prev", el)?.addEventListener("click", () => { month = new Date(month.getFullYear(), month.getMonth() - 1, 1); picked = null; ctx.rerender(); });
    $("#cg-next", el)?.addEventListener("click", () => { month = new Date(month.getFullYear(), month.getMonth() + 1, 1); picked = null; ctx.rerender(); });
    $$("[data-day]", el).forEach((b) => b.addEventListener("click", () => { picked = picked === b.dataset.day ? null : b.dataset.day; ctx.rerender(); }));
    $$("[data-kf]", el).forEach((b) => b.addEventListener("click", () => { filter = b.dataset.kf; ctx.rerender(); }));
    $("#cg-ics", el)?.addEventListener("click", () => {
      const txt = (s) => String(s).replace(/\\/g, "\\\\").replace(/[,;]/g, (c) => "\\" + c).replace(/\n/g, "\\n"), d = (s) => s.replace(/-/g, "");
      const ev = upcoming(200).map((e) => ["BEGIN:VEVENT", `UID:${d(e.start)}-${txt(e.title).slice(0, 40).replace(/\W/g, "")}@ewudiots`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`,
        `DTSTART;VALUE=DATE:${d(e.start)}`, `DTEND;VALUE=DATE:${d(iso(new Date((e.end || e.start) + "T00:00:00").getTime() + DAY))}`, `SUMMARY:${txt(e.title)}`, "END:VEVENT"].join("\r\n"))
        .concat(myFinals().map((f) => ["BEGIN:VEVENT", `UID:final-${f.code}-${d(f.date)}@ewudiots`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`, `DTSTART;VALUE=DATE:${d(f.date)}`, `SUMMARY:Final exam: ${txt(f.code)}`, "END:VEVENT"].join("\r\n")));
      const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//EWUdiots//Academic calendar//EN", ...ev, "END:VCALENDAR"].join("\r\n")], { type: "text/calendar" }));
      a.download = "ewu-academic-calendar.ics"; a.click(); toast("Calendar file downloaded", "success", "Open it to add every date to your phone or Google Calendar.");
    });
  };

  /* Home: the next holiday / deadline. */
  const homeCard = () => {
    const list = upcoming(3); if (!list.length) return "";
    return `<section class="card mt"><div class="card-h"><h2><span class="itile sm red">${icon("calendar")}</span> EWU calendar</h2><a class="see" href="#/calendar">Open</a></div>${list.map((e) => { const [ic, tone] = LOOK[e.kind] || LOOK.other; return `<a class="lrow" href="#/calendar"><span class="itile ${tone}">${icon(ic)}</span><span class="body"><b class="ellipsis">${esc(e.title)}</b><span>${span(e)} · ${inDays(e.start)}</span></span></a>`; }).join("")}</section>`;
  };
  return { isOff, upcoming, myFinals, reminderItems, homeCard, refresh, on };
}
