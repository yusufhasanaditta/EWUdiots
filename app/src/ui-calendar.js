/* Academic calendar (#/calendar): EWU's official undergraduate calendar (holidays like Durga Puja, tuition deadlines,
   exams, advising, breaks) together with your own classes, as a month grid (holiday names on the day, your classes only
   inside the semester, make-up days), a year at a glance, and "long breaks": the class days that, if skipped, join
   holidays and weekends into a longer break, with what that costs your attendance. Your final exam day per course comes
   from EWU's final schedule by class days (ST, MW, TR, SR). Data: /api/calendar (src/acadcal.js), kept on the device.
   Day rules, sessions and breaks: src/semplan.js. */
import { dayRules, classRange, sessionsOf, longBreaks, addDays, iso, LETTER_DAY } from "./semplan.js";

const KEY = "ewudiots.acadcal";
const LOOK = { holiday: ["sun", "red", "Holiday"], payment: ["wallet", "orange", "Payment"], exam: ["exam", "purple", "Exam"], deadline: ["alert", "blue", "Deadline"],
  advising: ["calcheck", "green", "Advising"], classes: ["school", "teal", "Classes"], break: ["coffee", "pink", "Break"], other: ["calendar", "purple", "Event"] };
const DAY = 864e5;
const short = (t) => t.replace(/^Holiday(?: on account of|:)?\s*/i, "").replace(/\s*\(.*?\)\s*/g, " ").trim();

export function install(ctx) {
  const { pages, icon, esc, $, $$, toast } = ctx;
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
      if (["calendar", "home", "routine", "course", "marks"].includes(ctx.route())) ctx.rerender();
      ctx.scheduleReminders();
    }).catch(() => {}).finally(() => { loading = false; });
  }
  refresh();

  const events = () => (data?.semesters || []).flatMap((s) => s.events.map((e) => ({ ...e, sem: s.sem })));
  const covers = (e, day) => day >= e.start && day <= (e.end || e.start);
  const on = (day) => events().filter((e) => covers(e, day));
  // One set of rules over every semester's events (holidays near a semester's edge are listed in either).
  let rulesCache = { at: 0, r: null };
  const rules = () => { if (!rulesCache.r || rulesCache.at !== data?.at) rulesCache = { at: data?.at, r: dayRules(events()) }; return rulesCache.r; };
  // No classes on holidays, in the semester break and when classes are suspended.
  const isOff = (day) => rules().isOff(day);
  const offReason = (day) => rules().offReason(day);
  const upcoming = (n = 5, kinds) => { const today = iso(Date.now()); return events().filter((e) => (e.end || e.start) >= today && (!kinds || kinds.includes(e.kind))).sort((a, b) => a.start.localeCompare(b.start)).slice(0, n); };
  const fmt = (d, o = { day: "numeric", month: "short" }) => new Date(d + "T00:00:00").toLocaleDateString("en-GB", o);
  const span = (e) => (e.end ? `${fmt(e.start)} – ${fmt(e.end)}` : fmt(e.start, { weekday: "short", day: "numeric", month: "short" }));
  const inDays = (d) => { const n = Math.round((new Date(d + "T00:00:00") - new Date(iso(Date.now()) + "T00:00:00")) / DAY); return n < 0 ? "Past" : n === 0 ? "Today" : n === 1 ? "Tomorrow" : `In ${n} days`; };

  /* One semester: its first/last day of classes and the routine rows that ran in it. */
  function semInfo(sem = S().routineSem) {
    const evs = (data?.semesters || []).find((s) => s.sem === sem)?.events || [];
    return { sem, range: classRange(sem, evs, S().semDates || {}), rules: rules() };
  }
  const rowsOf = (sem) => (sem === S().routineSem ? S().routine : S().history?.[sem] || []);
  /* Every class of one course in a semester (numbered; holidays listed but not counted). */
  const sessionsFor = (code, sem = S().routineSem) => { const i = semInfo(sem); return sessionsOf(rowsOf(sem).filter((r) => r.code === code), i.range, i.rules); };
  /* The routine blocks running on a given day (holidays, make-up days and the semester's dates applied). */
  function classesOn(day) {
    const i = semInfo();
    // Outside the semester only when its dates are known (EWU calendar or the portal), never on a guess.
    const known = i.range.exact || Boolean(S().semDates?.[i.sem]);
    if (!S().routine.length || isOff(day) || (known && (day < i.range.start || day > i.range.end))) return [];
    const wd = rules().runs(day);
    return ctx.expand(S().routine).filter((b) => b.day === wd).sort((a, b) => a.s - b.s);
  }

  /* Your final exam per course: the theory classes' day pattern (e.g. "MW") → that semester's final exam date. */
  function myFinals() {
    const sem = (data?.semesters || []).find((s) => s.sem === S().routineSem) || (data?.semesters || []).slice(-1)[0];
    if (!sem || !Object.keys(sem.finals || {}).length) return [];
    const byCode = new Map();
    for (const r of S().routine) if (!r.lab && r.days) byCode.set(r.code, { code: r.code, title: r.title, days: r.days.toUpperCase().split("").sort((a, b) => "SMTWRFA".indexOf(a) - "SMTWRFA".indexOf(b)).join("") });
    return [...byCode.values()].map((c) => ({ ...c, date: sem.finals[c.days] || "" })).filter((c) => c.date).sort((a, b) => a.date.localeCompare(b.date));
  }

  /* Long breaks from today to the last day of classes. */
  function breaks() {
    const i = semInfo(), today = iso(Date.now());
    if (!S().routine.length || !i.range.end || today > i.range.end) return [];
    const byDay = (wd) => S().routine.filter((r) => [...String(r.days || "").toUpperCase()].some((c) => LETTER_DAY[c] === wd));
    return longBreaks(byDay, today > i.range.start ? addDays(today, 1) : i.range.start, i.range.end, i.rules).slice(0, 8);
  }

  // Phone reminders: the day before each payment deadline and holiday notices.
  function reminderItems() {
    return upcoming(30, ["payment", "deadline", "exam"]).map((e) => ({ key: `cal-${e.start}-${e.title}`.slice(0, 80), title: e.kind === "payment" ? "Tuition deadline tomorrow" : e.kind === "exam" ? "Exams start tomorrow" : "EWU deadline tomorrow", body: e.title, at: new Date(new Date(e.start + "T10:00:00") - DAY) }))
      .concat(myFinals().map((f) => ({ key: `final-${f.code}-${f.date}`, title: `Final exam tomorrow: ${f.code}`, body: `${f.title || f.code} · check the room on the portal`, at: new Date(new Date(f.date + "T09:00:00") - DAY) })));
  }

  let month = null, picked = null, filter = "all", view = "month";
  function monthGrid(y, m, mini = false) {
    const first = new Date(y, m, 1), lead = first.getDay(), days = new Date(y, m + 1, 0).getDate(), today = iso(Date.now());
    const cells = [];
    for (let i = 0; i < lead; i++) cells.push(`<span class="${mini ? "ym-c" : "cg-cell"} pad" aria-hidden="true"></span>`);
    for (let d = 1; d <= days; d++) {
      const day = iso(new Date(y, m, d)), ev = on(day), off = offReason(day), cls = classesOn(day), swap = rules().runs(day) !== new Date(y, m, d).getDay();
      const kinds = [...new Set(ev.map((e) => e.kind))];
      if (mini) { cells.push(`<span class="ym-c${day === today ? " today" : ""}${off ? " off" : kinds.includes("exam") ? " exam" : kinds.includes("payment") ? " pay" : ""}${cls.length ? " cls" : ""}" title="${esc(off || ev.map((e) => e.title).join(", "))}">${d}</span>`); continue; }
      const tag = off ? `<span class="cg-tag off">${esc(short(off))}</span>` : kinds.includes("exam") ? '<span class="cg-tag exam">Exam</span>' : kinds.includes("payment") ? '<span class="cg-tag pay">Pay</span>' : swap ? `<span class="cg-tag swap">${ctx.DAY_NAMES[rules().runs(day)].slice(0, 3)} classes</span>` : "";
      const dots = [...new Set(cls.map((b) => b.code))].slice(0, 4).map((c) => `<i class="cg-cdot" style="--cc:${ctx.colorFor(c)}"></i>`).join("");
      cells.push(`<button class="cg-cell${day === today ? " today" : ""}${off ? " off" : ""}${picked === day ? " sel" : ""}" data-day="${day}" aria-label="${fmt(day, { weekday: "long", day: "numeric", month: "long" })}${off ? `, holiday: ${esc(short(off))}` : cls.length ? `, ${cls.length} classes` : ""}"><b>${d}</b>${tag}<span class="cg-dots">${dots}</span></button>`);
    }
    return cells.join("");
  }

  /* The month's holidays and breaks by name (the day cells are too small for long names on a phone). */
  function monthHolidays(y, m) {
    const from = iso(new Date(y, m, 1)), to = iso(new Date(y, m + 1, 0));
    const list = events().filter((e) => (e.kind === "holiday" || e.kind === "break") && e.start <= to && (e.end || e.start) >= from).sort((x, z) => x.start.localeCompare(z.start));
    if (!list.length) return "";
    return `<div class="cal-hols"><b class="small">Holidays this month</b>${list.map((e) => `<button class="row nowrap" data-day="${e.start < from ? from : e.start}" style="all:unset;display:flex;gap:10px;align-items:center;cursor:pointer;font-size:13.5px"><span class="d">${fmt(e.start)}${e.end ? ` – ${fmt(e.end)}` : ""}</span><span>${esc(short(e.title))}</span></button>`).join("")}</div>`;
  }
  function dayPanel(day) {
    const ev = on(day), off = offReason(day), cls = classesOn(day), wd = new Date(day + "T00:00:00").getDay();
    const normally = !off ? [] : ctx.expand(S().routine).filter((b) => b.day === rules().runs(day));
    const marks = (code) => S().attendance[code]?.marks || {};
    return `<section class="card mt cg-day fx-rise"><div class="row between"><h3 style="margin:0">${fmt(day, { weekday: "long", day: "numeric", month: "long" })}</h3><span class="xs">${inDays(day)}</span></div>
      ${off ? `<div class="cg-off-banner mt-s"><span class="itile red">${icon("sun")}</span><div><b>${esc(short(off))}</b><p class="small">University holiday${normally.length ? `: no ${[...new Set(normally.map((b) => b.code))].map(esc).join(", ")} today` : ""}.</p></div></div>` : ""}
      ${rules().runs(day) !== wd ? `<div class="alert blue mt-s">${icon("info")}<div><b>${ctx.DAY_NAMES[rules().runs(day)]} classes today</b><p>EWU's make-up day: follow ${ctx.DAY_NAMES[rules().runs(day)]}'s routine.</p></div></div>` : ""}
      ${ev.filter((e) => e.kind !== "holiday").map((e) => row(e)).join("")}
      ${cls.map((b) => { const s = sessionsFor(b.code).find((x) => x.date === day && x.start === b.start), v = s ? marks(b.code)[s.key] : ""; return `<div class="lrow cg-class"><span class="cg-bar" style="--cc:${ctx.colorFor(b.code)}"></span><span class="body"><b>${esc(b.code)}${b.lab ? " Lab" : ""}${s?.n ? ` <span class="xs">· class ${s.n}</span>` : ""}</b><span>${ctx.fmt12(b.s)} – ${ctx.fmt12(b.e)} · ${esc(b.room || "TBA")}</span></span>
        ${s ? `<span class="att-pick" role="group" aria-label="Attendance for ${esc(b.code)}">${[["p", "P", "Present"], ["a", "A", "Absent"], ["c", "C", "Cancelled"]].map(([k, l, t]) => `<button class="ap ${k}" data-cmark="${esc(b.code)}|${esc(s.key)}|${k}" aria-pressed="${v === k}" title="${t}" aria-label="${t}">${l}</button>`).join("")}</span>` : ""}</div>`; }).join("")}
      ${!ev.length && !cls.length && !off ? '<p class="small muted mt-s">No classes or EWU events on this day.</p>' : ""}</section>`;
  }

  function breaksView() {
    const list = breaks(), att = (code) => ctx.attendance?.stats(code);
    if (!S().routine.length) return `<section class="card mt">${ctx.empty("icon:coffee", "Sync your class schedule first", "Then we can show which classes stand between you and a long break.", `<a class="btn primary" href="#/sync">${icon("sync")} Sync portal</a>`)}</section>`;
    const hol = upcoming(40, ["holiday", "break"]).slice(0, 8);
    return `<p class="small muted mt">Days with no classes for you (weekends, holidays, days without your classes) joined into longer breaks. Skipping a class is your call: check your attendance first.</p>
      ${list.length ? `<div class="stack mt-s">${list.map((b) => `<section class="card brk"><div class="brk-days"><b class="num">${b.days}</b><span>days off</span></div><div class="grow min0">
        <b>${fmt(b.from, { weekday: "short", day: "numeric", month: "short" })} – ${fmt(b.to, { weekday: "short", day: "numeric", month: "short" })}</b>
        <p class="small">Skip ${b.skip.map((d) => fmt(d, { weekday: "long", day: "numeric", month: "short" })).join(" and ")}${b.why.length ? ` · around <b>${b.why.map((w) => esc(short(w))).join(", ")}</b>` : ""}</p>
        <div class="brk-cost">${b.cost.map((c) => { const st = att(c.code), after = st && st.total ? Math.round((100 * (st.total - st.absent - c.k)) / st.total) : null; return `<span class="pill ${after !== null && after < (ctx.attendance?.minOf(c.code) || 70) ? "red" : "amber"}">${esc(c.code)}: miss ${c.k}${after !== null ? ` → ${after}% final` : ""}</span>`; }).join("")}</div></div></section>`).join("")}</div>`
        : '<section class="card mt-s"><p class="small muted">No long breaks left this semester for one or two skipped days.</p></section>'}
      <h3 class="mt-l">Holidays ahead</h3><section class="card tight mt-s">${hol.length ? hol.map(row).join("") : '<p class="small muted">None listed yet.</p>'}</section>`;
  }

  pages.calendar = () => {
    const head = ctx.head("Academic calendar", "EWU's holidays, payment deadlines and exams, together with your classes.");
    if (!data) { refresh(true); return head + `<div class="stack mt">${[1, 2].map(() => '<div class="skel" style="height:160px"></div>').join("")}</div>`; }
    const now = new Date(); month = month || new Date(now.getFullYear(), now.getMonth(), 1);
    const today = iso(now), finals = myFinals(), next = upcoming(1)[0];
    const list = events().filter((e) => filter === "all" || e.kind === filter).filter((e) => (e.end || e.start) >= today);
    const seg = ctx.seg([["month", "Month"], ["year", "Year"], ["breaks", "Long breaks"]], view, "data-cv");
    let body;
    if (view === "year") {
      const months = [...Array(12)].map((_, k) => new Date(month.getFullYear(), month.getMonth() + k, 1));
      body = `<div class="ym-grid mt">${months.map((d) => `<button class="ym card" data-ym="${d.getFullYear()}-${d.getMonth()}"><b>${d.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}</b><div class="ym-head">${["S", "M", "T", "W", "T", "F", "S"].map((x) => `<span>${x}</span>`).join("")}</div><div class="ym-days">${monthGrid(d.getFullYear(), d.getMonth(), true)}</div></button>`).join("")}</div>
        <div class="cg-legend mt-s"><span><i class="ym-k off"></i>Holiday</span><span><i class="ym-k exam"></i>Exams</span><span><i class="ym-k pay"></i>Payment</span><span><i class="ym-k cls"></i>Your classes</span></div>`;
    } else if (view === "breaks") body = breaksView();
    else {
      body = `<div class="grid g2 mt cal-grid">
        <section class="card"><div class="row between"><button class="icon-btn" id="cg-prev" aria-label="Previous month">${icon("chevL")}</button><h3 style="margin:0">${month.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}</h3><button class="icon-btn" id="cg-next" aria-label="Next month">${icon("chevR")}</button></div>
          <div class="cg-head">${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => `<span>${d}</span>`).join("")}</div><div class="cg">${monthGrid(month.getFullYear(), month.getMonth())}</div>
          <div class="cg-legend"><span><i class="cg-sw off"></i>Holiday</span><span><i class="cg-sw exam"></i>Exam</span><span><i class="cg-sw pay"></i>Payment</span><span><i class="cg-cdot" style="--cc:var(--primary)"></i>Your classes</span></div>${monthHolidays(month.getFullYear(), month.getMonth())}</section>
        <div>${picked ? dayPanel(picked) : ""}
          <section class="card ${picked ? "mt" : ""}"><div class="card-h"><h2><span class="itile sm purple">${icon("exam")}</span> Your final exams</h2></div>
            ${finals.length ? finals.map((f) => `<div class="lrow"><span class="cal-date"><b>${fmt(f.date, { day: "numeric" })}</b><span>${fmt(f.date, { month: "short" })}</span></span><span class="body"><b>${esc(f.code)}</b><span>${esc(f.title || "")} · ${f.days} classes · ${inDays(f.date)}</span></span></div>`).join("")
              : `<p class="small muted">${S().routine.length ? "EWU hasn't published the final exam schedule for your semester yet." : "Sync your Class Schedule and your final exam dates appear here."}</p>`}
            <p class="xs mt-s">From EWU's final exam schedule by class days. Confirm rooms on the portal.</p></section></div></div>
        <div class="row between mt-l wrap" style="gap:8px"><h2 style="margin:0">Coming up</h2><button class="btn sm" id="cg-ics">${icon("download", "sm")} Add to my phone calendar</button></div>
        <div class="chips mt-s">${[["all", "All"], ["holiday", "Holidays"], ["payment", "Payments"], ["exam", "Exams"], ["deadline", "Deadlines"], ["advising", "Advising"], ["break", "Breaks"]].map(([v, l]) => `<button class="chip" data-kf="${v}" aria-pressed="${filter === v}">${l}</button>`).join("")}</div>
        <section class="card mt tight">${list.length ? list.slice(0, 60).map(row).join("") : '<p class="small muted">Nothing coming up.</p>'}</section>`;
    }
    const b0 = view === "month" ? breaks()[0] : null;
    return `${head}
      ${next ? `<section class="cal-hero fx-rise"><i class="sheen" aria-hidden="true"></i><div class="cal-hero-glow" aria-hidden="true"></div><span class="cal-kicker">${icon(LOOK[next.kind][0], "sm")} Next on the EWU calendar</span><h2>${esc(next.title)}</h2><p>${span(next)} · <b>${inDays(next.start)}</b></p></section>` : ""}
      <div class="mt">${seg}</div>
      ${b0 ? `<button class="alert green mt brk-tip" data-cv="breaks">${icon("coffee")}<div class="grow"><b>${b0.days} days off ${fmt(b0.from)} – ${fmt(b0.to)}</b><p>Skip ${b0.skip.length === 1 ? "one class day" : `${b0.skip.length} class days`}${b0.why.length ? ` around ${esc(short(b0.why[0]))}` : ""}. See what it costs your attendance.</p></div>${icon("chevR")}</button>` : ""}
      ${body}
      <p class="xs mt" style="text-align:center">From <a href="https://www.ewubd.edu/academic-calendar" target="_blank" rel="noopener">ewubd.edu/academic-calendar</a> (undergraduate programs, except B.Pharm/LL.B). Updated ${new Date(data.at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}.</p>`;
  };
  function row(e) { const [ic, tone] = LOOK[e.kind] || LOOK.other; return `<div class="lrow"><span class="itile ${tone}">${icon(ic)}</span><span class="body"><b>${esc(e.title)}</b><span>${span(e)} · ${inDays(e.start)}</span></span></div>`; }

  pages.calendar.mount = (el) => {
    $$("[data-cv]", el).forEach((b) => b.addEventListener("click", () => { view = b.dataset.cv; ctx.rerender(); }));
    $$("[data-ym]", el).forEach((b) => b.addEventListener("click", () => { const [y, m] = b.dataset.ym.split("-").map(Number); month = new Date(y, m, 1); view = "month"; picked = null; ctx.rerender(); }));
    $("#cg-prev", el)?.addEventListener("click", () => { month = new Date(month.getFullYear(), month.getMonth() - 1, 1); picked = null; ctx.rerender(); });
    $("#cg-next", el)?.addEventListener("click", () => { month = new Date(month.getFullYear(), month.getMonth() + 1, 1); picked = null; ctx.rerender(); });
    $$("[data-day]", el).forEach((b) => b.addEventListener("click", () => { picked = picked === b.dataset.day ? null : b.dataset.day; ctx.rerender(); }));
    $$("[data-cmark]", el).forEach((b) => b.addEventListener("click", () => { const [code, date, start, v] = b.dataset.cmark.split("|"); ctx.attendance?.mark(code, `${date}|${start}`, v); }));
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
  return { isOff, offReason, runs: (day) => rules().runs(day), classesOn, semInfo, sessionsFor, breaks, upcoming, myFinals, reminderItems, homeCard, refresh, on, short, ready: () => Boolean(data) };
}
