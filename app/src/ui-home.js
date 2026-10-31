/* Home dashboard, onboarding (welcome → login → role → profile), notifications, More, Profile & settings, Help, About. */
import { CLUBS } from "./campus-data.js";

export function install(ctx) {
  const { pages, icon, esc, $, $$, toast, openModal, closeModal, confirmModal, busy } = ctx;
  const S = () => ctx.S;

  /* ═════════════ HOME ═════════════ */
  pages.home = () => {
    if (S().role !== "student") return homeLite();
    const St = S(), p = St.profile || { name: "" };
    const nc = ctx.nextClass();
    const now = new Date(), today = now.getDay(), nowM = now.getHours() * 60 + now.getMinutes();
    const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    // Holidays, make-up days and the semester's dates from the EWU calendar.
    const todays = ctx.acal ? ctx.acal.classesOn(todayIso) : ctx.expand(St.routine).filter((b) => b.day === today).sort((a, b) => a.s - b.s);
    const holidayToday = ctx.acal?.offReason(todayIso) || "";
    const { cgpa } = ctx.cgpaOf(St.grades);
    const shown = cgpa || p.cgpa || 0;
    const upcoming = St.tasks.filter((t) => !t.done && new Date(t.due) > now - 864e5).sort((a, b) => new Date(a.due) - new Date(b.due)).slice(0, 3);
    const att = Object.entries(St.attendance).filter(([, a]) => a.held).map(([c, a]) => ({ c, pct: Math.round((100 * (a.held - a.missed)) / a.held) })).sort((a, b) => a.pct - b.pct);
    const avgAtt = att.length ? Math.round(att.reduce((s, x) => s + x.pct, 0) / att.length) : null;
    const low = att.find((a) => a.pct < 70) || att.find((a) => a.pct < 80);
    const courses = new Set(St.routine.map((r) => r.code)).size;
    const str = ctx.study.streak();
    const first = esc(ctx.firstName());
    const TILES = [["routine", "calendar", "purple", "Routine", "View your classes"], ["planner", "listcheck", "green", "Planner", "Plan next semester"], ["grades", "bars", "blue", "CGPA", "Track your progress"], ["focus", "target", "pink", "Focus", "Study timer"],
      ["map", "map", "purple", "Campus Map", "Find any room"], ["vault", "vault", "yellow", "Vault", "Notes, past papers"], ["rooms", "building", "blue", "Free Rooms", "Find empty classrooms"], ["fees", "wallet", "orange", "Fees", "Payments & installments"]];
    const prof = nc ? ctx.facName(nc.faculty) : "";
    const ncAt = nc ? (() => { const t = new Date(); t.setSeconds(0, 0); return t.getTime() + nc.mins * 6e4; })() : 0;
    const ncCard = nc ? `<a class="next-card" data-at="${ncAt}" data-live="${nc.live ? 1 : 0}" href="#/course?c=${encodeURIComponent(nc.code)}" aria-live="polite"><span class="fluid" aria-hidden="true"><i></i><i></i><i></i></span>
        <div class="top"><span class="row" style="gap:8px">${icon("school", "sm")} ${nc.live ? "Happening now" : "Next Class"} ${icon("chevR", "sm")}</span>${nc.live ? "" : `<span class="starts">Starts in</span>`}</div>
        <h2>${esc(nc.code)}</h2><div class="t">${esc(nc.title || (nc.lab ? "Lab session" : ""))}</div>
        ${nc.live ? `<div class="cd"><div class="ring sm" style="--p:${Math.round(100 * (1 - nc.mins / (nc.e - nc.s)))};--rc:var(--accent);background:conic-gradient(var(--accent) calc(var(--p)*1%), rgba(255,255,255,.25) 0)"><div><b style="color:#fff">${nc.mins}</b><span style="color:#fff">min left</span></div></div></div>` :
          `<div class="cd">${nc.mins < 1440 ? `<b>${nc.mins < 60 ? nc.mins : Math.floor(nc.mins / 60)}</b><span>${nc.mins < 60 ? "min" : `h ${nc.mins % 60}m`}</span>` : `<b style="font-size:26px">${ctx.DAY_NAMES[nc.day]}</b><span>${ctx.fmt12(nc.s)}</span>`}</div>`}
        <div class="meta"><span>${icon("room")} ${esc(nc.room || "TBA")}</span><span>${icon("clock")} ${ctx.fmt12(nc.s)} – ${ctx.fmt12(nc.e)}</span>${prof ? `<span>${icon("user")} ${esc(prof)}</span>` : ""}</div></a>`
      : `<div class="next-card"><div class="top">${icon("school", "sm")} No classes yet</div><h2>Add your routine</h2><div class="t">Sync your Class Schedule to see your next class here.</div><div class="row mt"><a class="btn white sm" href="#/sync">${icon("sync")} Sync portal</a></div></div>`;

    const room = nc && nc.room ? ctx.baseRoom(nc.room) : "";
    const prev = nc ? ctx.expand(St.routine).filter((b) => b.day === nc.day && b.e <= nc.s && nc.s - b.e < 60 && b.room).sort((a, b) => b.e - a.e)[0] : null;
    const walk = prev ? ctx.campus.walkBetween(prev.room, nc.room) : null, gap = prev ? nc.s - prev.e : 0;
    const where = room ? ctx.campus.where(room) : null;
    const navStrip = room && where?.block ? `<a class="nav-strip${walk && walk / 60 + 2 > gap ? " warn" : ""}" href="#/map?to=${encodeURIComponent(room)}${prev ? `&from=room:${encodeURIComponent(ctx.baseRoom(prev.room))}` : ""}"><span class="itile sm purple">${icon("map")}</span><span class="grow min0"><b>Directions to ${esc(room)}</b><span class="xs">${walk ? `${Math.max(1, Math.round(walk / 60))} min walk from ${esc(ctx.baseRoom(prev.room))}${walk / 60 + 2 > gap ? ` · only ${gap} min between classes` : ""}` : esc(ctx.campus.placeText(room))}</span></span>${icon("chevR", "sm")}</a>` : "";
    const deadlines = `<section class="card"><div class="card-h"><h2><span class="itile sm purple">${icon("calendar")}</span>Today's Deadlines</h2><a class="see" href="#/tasks">View All</a></div>
      ${upcoming.length ? upcoming.map((t) => ctx.taskLine(t, { compact: true })).join("") : `<p class="small muted">No deadlines coming up. <a href="#/tasks?add=1">Add one</a></p>`}</section>`;
    const streakCard = `<a class="card tint-purple" href="#/me" style="display:flex;align-items:center;gap:12px"><span style="font-size:0">${icon("flame", "lg")}</span><div><span class="xs">Your Streak</span><div style="font-size:30px;font-weight:800;line-height:1.1">${str} <small style="font-size:14px;font-weight:600">Days</small></div><span class="xs">${str ? "Keep going!" : "Study 10 min today"}</span></div></a>`;
    const attCard = low ? `<a class="card tint-red" href="#/course?c=${encodeURIComponent(low.c)}&tab=attendance" style="display:block"><div class="row nowrap" style="gap:8px"><span style="color:var(--error)">${icon("alert")}</span><b>Attendance Alert</b></div><p class="small muted mt-s">${esc(low.c)} Attendance</p><div class="row between"><b style="font-size:28px">${low.pct}%</b><span class="pill red">Below ${low.pct < 70 ? 70 : 80}%</span></div></a>`
      : `<a class="card tint-green" href="#/marks" style="display:block"><div class="row nowrap" style="gap:8px"><span style="color:var(--success)">${icon("checkc")}</span><b>Attendance</b></div><p class="small muted mt-s">${avgAtt !== null ? "Average across courses" : "Track it per course"}</p><b style="font-size:28px">${avgAtt !== null ? avgAtt + "%" : "—"}</b></a>`;

    const desktop = `<div class="d-only">
      <section class="hero-banner"><span class="fluid" aria-hidden="true"><i></i><i></i><i></i></span><span class="date">${now.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" })} ${icon("star", "sm")}</span>
        <h1><small>${ctx.greeting()},</small>${first}!</h1><p>Small steps. Big progress.</p></section>
      <div class="mt"><a class="ask-entry" href="#/ask"><span class="ask-orb sm" aria-hidden="true">${icon("sparkle")}</span><span class="grow"><b>Ask EWUdiots</b><span>“Where is my next class?” · “Remind me 30 min before”</span></span>${icon("arrow")}</a></div>
      <div class="dtiles mt">${[["routine", "calendar", "purple", "Routine", "View your classes"], ["planner", "listcheck", "green", "Advising Planner", "Plan next semester"], ["map", "map", "blue", "Campus Map", "Rooms, routes & 3D walk"], ["grades", "bars", "purple", "CGPA", "Track your progress"],
        ["tasks", "clipboard", "red", "Deadlines", "Assignments & exams"], ["fees", "wallet", "orange", "Fees", "Payments & installments"], ["vault", "vault", "blue", "Study Library", "Notes, past papers"], ["rooms", "door", "purple", "Free Rooms", "Find empty classrooms"]]
        .map(([id, ic, tone, t, d]) => `<a class="dtile" href="#/${id}"><span class="itile ${tone}">${icon(ic)}</span><div class="min0"><b>${t}</b><span>${d}</span></div></a>`).join("")}</div>
      <div class="split mt">
        <section class="card"><div class="card-h"><h2>Today's Schedule</h2><a class="see" href="#/routine">View All</a></div>${navStrip ? `<div style="margin:-4px 0 12px">${navStrip}</div>` : ""}
          ${todays.length ? `<div class="sched">${todays.map((b) => { const live = b.s <= nowM && nowM < b.e; return `<a class="sitem ${b.e <= nowM ? "past" : ""}" href="#/course?c=${encodeURIComponent(b.code)}" style="--cc:${ctx.colorFor(b.code)}"><span class="itile sm ${ctx.toneFor(b.code)}">${icon("calendar")}</span><div class="grow min0"><span class="when">${ctx.fmt12(b.s)} – ${ctx.fmt12(b.e)}</span><b>${esc(b.code)}${b.title ? " - " + esc(b.title) : ""}${b.lab ? " (Lab)" : ""}</b><span class="xs">${esc(b.room || "TBA")}</span></div>${live ? '<span class="pill purple">Now</span>' : ""}</a>`; }).join("")}</div>`
            : holidayToday ? `<div class="cg-off-banner"><span class="itile red">${icon("sun")}</span><div><b>${esc(ctx.acal.short(holidayToday))}</b><p class="small">University holiday: no classes today. Enjoy it!</p></div></div>`
            : ctx.empty("mascot-reading", "No Classes Today", "Take a break or get ahead! You're all caught up.", `<a class="btn sm" href="#/focus">${icon("target")} Start a focus session</a>`)}</section>
        <div class="stack" style="gap:16px">
          <section class="card"><div class="card-h"><h2>Quick Stats</h2><span class="pill">${esc(St.routineSem || "This Semester")}</span></div>
            <div class="grid g4" style="gap:10px">${[["grades", "hexagon", "purple", shown ? shown.toFixed(2) : "—", "CGPA"], ["courses", "notes", "blue", courses ? `${courses}` : "—", "Courses"], ["marks", "checkc", "green", avgAtt !== null ? `${avgAtt}%` : "—", "Attendance"], ["me", "flame", "orange", `${str} day${str === 1 ? "" : "s"}`, "Study Streak"]]
              .map(([id, ic, tone, v, l]) => `<a class="stat-tile" href="#/${id}" style="text-decoration:none;color:inherit"><span class="itile ${tone}">${icon(ic)}</span><span class="v num">${v}</span><span class="l">${l}</span></a>`).join("")}</div></section>
          <div class="mascot-card green"><img src="/img/mascot-thumbs.webp" alt="" width="110"><span class="scribble">“Same campus.<br>Brighter you.”${ctx.swoosh}</span></div>
        </div>
      </div>
      <div class="grid g2 mt">${deadlines}<div class="grid g2">${streakCard}${attCard}</div></div>${ctx.notices.homeCard() ? `<div class="mt">${ctx.notices.homeCard()}</div>` : ""}${ctx.acal?.homeCard() || ""}${eventsCard()}</div>`;

    const dueToday = St.tasks.filter((t) => !t.done && new Date(t.due).toDateString() === now.toDateString()).length;
    const holidayStrip = holidayToday && !todays.length ? `<a class="cg-off-banner mt" href="#/calendar"><span class="itile red">${icon("sun")}</span><div><b>Today: ${esc(ctx.acal.short(holidayToday))}</b><p class="small">University holiday, no classes.</p></div></a>` : "";
    const todayStrip = todays.length ? `<div class="today-strip" role="list" aria-label="Today's classes">${todays.map((b) => { const live = b.s <= nowM && nowM < b.e, past = b.e <= nowM;
      return `<a role="listitem" class="tchip${live ? " live" : ""}${past ? " past" : ""}" href="#/course?c=${encodeURIComponent(b.code)}" style="--cc:${ctx.colorFor(b.code)}"><span class="tt">${ctx.fmtShort(b.s)}</span><b>${esc(b.code)}${b.lab ? " Lab" : ""}</b><span class="tr">${live ? "Now" : esc(ctx.baseRoom(b.room) || "TBA")}</span></a>`; }).join("")}</div>` : "";
    // Classes that ended today and aren't marked yet: one tap for Present / Absent, and a note on what was covered.
    const marksOf = (c) => St.attendance[c]?.marks || {};
    const ended = holidayToday ? [] : todays.filter((b) => b.e <= nowM && b.start);
    const pend = ended.filter((b) => !marksOf(b.code)[`${todayIso}|${b.start}`]);
    const pendCard = ended.length ? `<section class="card att-pend">${ended.map((b) => { const key = `${todayIso}|${b.start}`, v = marksOf(b.code)[key], note = (St.classNotes || {})[`${b.code}|${key}`];
        return `<div class="lrow"><span class="itile sm ${v === "p" ? "green" : v === "a" ? "red" : "orange"}">${icon(v ? (v === "p" ? "checkc" : "x") : "clock")}</span><span class="body"><b>${esc(b.code)}${b.lab ? " Lab" : ""} · ${ctx.fmt12(b.s)}</b><span class="ellipsis">${note ? `${icon("notes", "sm")} ${esc(note)}` : v ? (v === "p" ? "Present" : "Absent") : "Were you there?"}</span></span>
          <span class="row nowrap" style="gap:6px">${v ? "" : `<button class="btn sm primary" data-am="${esc(b.code)}" data-k="${key}" data-v="p" aria-label="Present in ${esc(b.code)}">${icon("check", "sm")}</button><button class="btn sm danger-soft" data-am="${esc(b.code)}" data-k="${key}" data-v="a" aria-label="Absent from ${esc(b.code)}">${icon("x", "sm")}</button>`}
          <button class="btn sm ghost" data-cn="${esc(b.code)}" data-k="${key}" aria-label="Note what ${esc(b.code)} covered">${icon("edit", "sm")}</button></span></div>`; }).join("")}</section>` : "";
    const sec = (ic, tone, title, sub, body, link = "") => (body ? `<section class="h-sec"><div class="h-sh"><span class="itile sm ${tone}">${icon(ic)}</span><div class="grow min0"><h2>${title}</h2>${sub ? `<p>${sub}</p>` : ""}</div>${link}</div>${body}</section>` : "");
    const campusBits = `${ctx.notices.homeCard() || ""}${ctx.acal?.homeCard() || ""}${eventsCard()}`;
    const mobile = `<div class="m-only">
      <div class="m-hello">${ctx.myAvatar("", "a", 'href="#/profile" aria-label="Your profile"')}
        <div class="grow min0"><p class="hi">${ctx.greeting()}</p><h1 class="ellipsis">${first}</h1></div>
        <a class="streak-chip" href="#/me" aria-label="${str} day study streak">${icon("flame", "sm")}<b>${str}</b></a></div>
      <div class="m-summary">${[[todays.length ? `${todays.filter((b) => b.e > nowM).length}` : "0", todays.length === 1 ? "class today" : "classes today", "#/routine"], [dueToday, "due today", "#/tasks"], [shown ? shown.toFixed(2) : "—", "CGPA", "#/grades"]]
        .map(([v, l, h]) => `<a href="${h}"><b class="num">${v}</b><span>${l}</span></a>`).join("")}</div>
      ${sec("school", "purple", "Right now", nc ? (nc.live ? "Class in progress" : "Your next class") : "", `${ncCard}${holidayStrip}${todayStrip}${navStrip}`)}
      ${sec("checksq", pend.length ? "orange" : "green", "Today's attendance", pend.length ? `${pend.length} class${pend.length === 1 ? "" : "es"} to mark · add a note on what you covered` : "All marked · tap the pen to note what you covered", pendCard)}
      ${sec("grid", "blue", "Quick access", "", `<div class="qgrid">${TILES.map(([id, ic, tone, t]) => `<a class="qtile" href="#/${id}"><span class="itile ${tone}">${icon(ic)}</span>${t}</a>`).join("")}</div>`)}
      ${sec("clipboard", "red", "Due soon", "", deadlines, `<a class="see" href="#/tasks">All</a>`)}
      ${sec("flame", "orange", "Your progress", "", `<div class="g2m">${streakCard}${attCard}</div>`)}
      ${sec("megaphone", "pink", "On campus", "Notices, calendar and events", campusBits)}
      <div class="h-sec"><a class="ask-entry" href="#/ask"><span class="ask-orb sm" aria-hidden="true">${icon("sparkle")}</span><span class="grow"><b>Ask EWUdiots</b><span>“Where is my next class?” · “Remind me 30 min before”</span></span>${icon("arrow")}</a></div></div>`;
    const b = ctx.content.banner();
    const banner = b ? `<div class="alert ${b.tone || "purple"} admin-banner fx-rise${String(b.image || "").startsWith("https://") ? " has-img" : ""}">${String(b.image || "").startsWith("https://") ? `<img class="bn-img" src="${esc(b.image)}" alt="" loading="lazy">` : ""}<span class="a-ic">${icon(b.tone === "red" ? "alert" : "megaphone")}</span><div class="grow"><b>${esc(b.title || "From the EWUdiots team")}</b><p>${esc(b.text)}</p></div>${b.link ? `<a class="btn sm" href="${esc(b.link)}" ${/^https:/.test(b.link) ? 'target="_blank" rel="noopener"' : ""}>${esc(b.cta || "Open")}</a>` : ""}</div>` : "";
    const up = ctx.C.update && ctx.native.isNative ? `<a class="alert green update-card" href="${esc(ctx.C.update.url)}" data-update target="_blank" rel="noopener"><span class="a-ic">${icon("download")}</span><div class="grow"><b>Update available: EWUdiots ${esc(ctx.C.update.version)}</b><p>Tap to update. Your data stays.</p></div>${icon("chevR")}</a>` : "";
    const verify = needsVerify() ? `<a class="alert green fx-rise" href="#/profile?verify=1"><span class="a-ic">${icon("shield")}</span><div class="grow"><b>Verify your student account</b><p>Scan your EWU ID card once to get the verified badge.</p></div>${icon("chevR")}</a>` : "";
    return `${up}${banner}${verify}${ctx.demoBanner()}${mobile}${desktop}${ctx.community.homeNews()}`;
  };
  // Home: live countdown to the next class (ticks every second), attendance buttons and class notes.
  let cdTimer = 0;
  pages.home.mount = (el) => {
    clearInterval(cdTimer);
    const card = $(".m-only .next-card[data-at], .next-card[data-at]", el);
    if (card) {
      const at = Number(card.dataset.at), live = card.dataset.live === "1", cd = $(".cd", card);
      const tick = () => {
        if (!document.body.contains(card)) return clearInterval(cdTimer);
        const left = Math.max(0, Math.round((at - Date.now()) / 1000));
        if (!left) { clearInterval(cdTimer); return ctx.rerender(); }
        const h = Math.floor(left / 3600), m = Math.floor((left % 3600) / 60), s = left % 60, two = (n) => String(n).padStart(2, "0");
        if (!live && cd) cd.innerHTML = `<b class="countdown">${h ? `${h}:${two(m)}` : m}:${two(s)}</b><span>${h ? "hours" : "min"} left</span>`;
      };
      if (live || at - Date.now() < 864e5) { tick(); cdTimer = setInterval(tick, 1000); }
    }
    $$("[data-am]", el).forEach((b) => b.addEventListener("click", () => ctx.attendance.mark(b.dataset.am, b.dataset.k, b.dataset.v)));
    $$("[data-cn]", el).forEach((b) => b.addEventListener("click", () => classNote(b.dataset.cn, b.dataset.k)));
  };
  /* What was covered in one class: kept per class (course + date + start) and shown on Home and the course page. */
  function classNote(code, key) {
    const id = `${code}|${key}`, notes = (S().classNotes = S().classNotes || {});
    ctx.openModal(ctx.modalHead(`${code}: what did you cover?`) + `<form id="cn-f" class="stack"><p class="small muted">${esc(new Date(key.split("|")[0] + "T00:00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short" }))}</p>
        <textarea class="input" name="t" rows="5" maxlength="1000" placeholder="e.g. Chapter 3: linked lists, insertion and deletion. Quiz next week.">${esc(notes[id] || "")}</textarea>
        <button class="btn primary block">${icon("check", "sm")} Save note</button></form>`, (m) => $("#cn-f", m).addEventListener("submit", (e) => {
      e.preventDefault(); const t = String(new FormData(e.target).get("t") || "").trim();
      if (t) notes[id] = t; else delete notes[id];
      ctx.closeModal(); ctx.save(); ctx.rerender(); ctx.toast(t ? "Note saved" : "Note removed", "success");
    }));
  }
  // Next few campus events (approved), with a link to the full list.
  const eventsCard = () => {
    const list = ctx.events?.upcoming(3) || [];
    if (!list.length) return "";
    return `<section class="card mt"><div class="card-h"><h2>Upcoming events</h2><a class="see" href="#/events">See All</a></div>${list.map((e) => { const [ic, tone] = ctx.events.look(e.kind); return `<a class="lrow" href="#/events?id=${e.id}"><span class="itile ${tone}">${icon(ic)}</span><span class="body"><b class="ellipsis">${esc(e.title)}</b><span>${ctx.events.when(e)}${e.venue ? ` · ${esc(e.venue)}` : ""}</span></span>${icon("chevR", "chev")}</a>`; }).join("")}</section>`;
  };
  /* Faculty / alumni home: campus tools only. */
  function homeLite() {
    const now = new Date(), d = now.getDay(), nm = now.getHours() * 60 + now.getMinutes();
    const free = ctx.freeRoomsAt(d, nm, nm + 60).slice(0, 4);
    const tiles = (S().role === "faculty" ? [["teach", "briefcase", "purple", "Teaching hub", "Consultations & announcements"], ["rooms", "building", "blue", "Free Rooms", "Find empty classrooms"], ["blog", "notes", "green", "Blog", "Share tips with students"], ["jobs", "briefcase", "orange", "Jobs & research", "Post an opening"]]
      : [["alumhub", "cap", "purple", "Alumni hub", "Mentor students"], ["jobs", "briefcase", "blue", "Jobs & internships", "Post an opening"], ["blog", "notes", "green", "Blog", "Write your story"], ["alumni", "community", "orange", "Alumni", "Where graduates are now"]]);
    return `<section class="hero-banner"><h1><small>${ctx.greeting()},</small>${esc(ctx.firstName())}!</h1><p>${S().role === "faculty" ? "Rooms, notes and your faculty profile in one place." : "Stay connected with EWU."}</p></section>
      <div class="mt"><a class="ask-entry" href="#/ask"><span class="ask-orb sm" aria-hidden="true">${icon("sparkle")}</span><span class="grow"><b>Ask EWUdiots</b><span>“Where is my next class?” · “Remind me 30 min before”</span></span>${icon("arrow")}</a></div>
      <div class="dtiles mt">${tiles.map(([id, ic, tone, t, dd]) => `<a class="dtile" href="#/${id}"><span class="itile ${tone}">${icon(ic)}</span><div class="min0"><b>${t}</b><span>${dd}</span></div></a>`).join("")}</div>
      ${ctx.notices.homeCard() ? `<div class="mt">${ctx.notices.homeCard()}</div>` : ""}${eventsCard()}
      <section class="card mt"><div class="card-h"><h2>Free for the next hour</h2><a class="see" href="#/rooms">See All</a></div>
        ${free.length ? free.map((r) => `<div class="lrow"><span class="itile green">${icon("door")}</span><div class="body"><b>${esc(r)}</b><span>No class scheduled</span></div><span class="pill green">Available</span></div>`).join("") : `<p class="small muted">Room data comes from synced timetables. ${ctx.cloud.enabled ? "Sign in to see campus-wide rooms." : ""}</p>`}</section>`;
  }

  /* ═════════════ NOTIFICATIONS ═════════════ */
  let nTab = "All";
  pages.notifications = () => {
    const all = ctx.inbox(), list = all.filter((n) => nTab === "All" || n.cat === nTab);
    const ago = (at) => { const m = Math.round((Date.now() - new Date(at)) / 6e4); return m < 1 ? "now" : m < 60 ? `${m}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`; };
    return `${ctx.head("Notifications", "Deadlines, payments, attendance and sync updates.", all.some((n) => !S().read[n.id]) ? `<button class="btn ghost sm" id="n-read">${icon("check")} Mark all read</button>` : "")}
      ${ctx.seg(["All", "Academic", "Campus", "System"].map((x) => [x, x]), nTab, "data-nt")}
      <section class="card mt">${list.length ? list.map((n) => `<a class="notif ${S().read[n.id] ? "" : "unread"}" href="${esc(n.href || "#/home")}" data-nid="${esc(n.id)}" style="color:inherit;text-decoration:none"><span class="itile ${n.tone}">${icon(n.icon)}</span><div class="min0"><b>${esc(n.title)}</b><p>${esc(n.body)}</p></div><span class="xs">${ago(n.at)}</span></a>`).join("")
        : ctx.empty("icon:bell", "You're all caught up", "New deadlines, payment reminders and sync updates will show up here.")}</section>
      ${!S().settings.notify ? `<div class="card mt tint-purple row nowrap"><span class="itile purple">${icon("bell")}</span><div class="grow"><b>Enable notifications?</b><p class="small muted">Get reminders for your classes, deadlines and payments.</p></div><button class="btn primary sm" id="n-allow">Allow</button></div>` : ""}`;
  };
  pages.notifications.mount = (el) => {
    $$("[data-nt]", el).forEach((b) => b.addEventListener("click", () => { nTab = b.dataset.nt; ctx.rerender(); }));
    $$("[data-nid]", el).forEach((a) => a.addEventListener("click", () => { S().read[a.dataset.nid] = 1; ctx.save({ silent: true }); }));
    const r = $("#n-read", el); r && r.addEventListener("click", () => { ctx.inbox().forEach((n) => { S().read[n.id] = 1; }); ctx.save({ silent: true }); ctx.rerender(); });
    const a = $("#n-allow", el); a && a.addEventListener("click", async () => { await ctx.enableNotifications(); ctx.rerender(); });
  };

  /* ═════════════ MORE ═════════════ */
  pages.more = () => {
    const role = S().role;
    const rk = { faculty: "f", alumni: "a" }[role] || "s", p = S().profile || {};
    const GROUPS = [
      ["Teaching", [["teach", "briefcase", "purple", "Teaching hub", "Office hours, consultations", "f"]]], ["Alumni", [["alumhub", "cap", "green", "Alumni hub", "Mentoring and openings", "a"]]],
      ["Academics", [["office", "clock", "teal", "Office hours", "Book a consultation", "s"], ["alarms", "bell", "pink", "Class Alarms", "Warn me before class", "s"], ["courses", "book", "teal", "My Courses", "Course hubs and notes", "s"], ["planner", "calcheck", "green", "Advising Planner", "Plan your next semester", "s"], ["marks", "notes", "blue", "Marks Estimator", "Predict your grades", "s"],
        ["degree", "cap", "yellow", "Degree Progress", "Credits by requirement", "s"], ["insights", "chart", "purple", "Analytics", "CGPA trend and charts", "s"], ["scholarship", "trophy", "orange", "Scholarships", "What CGPA you need", "s"], ["exams", "exam", "orange", "Exam Planner", "Revision plan for exams", "s"], ["fees", "receipt", "red", "Fees & Deadlines", "Track payments and tasks", "s"], ["sync", "sync", "teal", "Sync Portal", "Import from the EWU portal", "s"], ["classroom", "school", "green", "Google Classroom", "Materials and assignments", "s"]]],
      ["Study", [["focus", "target", "pink", "Focus Quest", "Pomodoro, streaks and XP", "sf"], ["cards", "cards", "pink", "Flashcards", "Spaced repetition decks", "sf"], ["vault", "vault", "blue", "Study Library", "Notes, past papers, slides", "sfa"], ["me", "award", "purple", "Achievements", "View your badges and stats", "sf"]]],
      ["Campus", [["map", "map", "purple", "Campus Map", "Find rooms, walk in 3D", "sfa"], ["rooms", "building", "purple", "Free Rooms", "Find empty classrooms", "sfa"], ["idcard", "user", "teal", "My ID Card", "Your 3D student pass", "s"], ["faculty", "users", "purple", "Faculty & Reviews", "Contacts and ratings", "sfa"], ["cover", "file", "green", "Cover Page", "Assignment cover PDF", "sa"]]],
      ["Community", [["notices", "megaphone", "orange", "Notice Board", "Official EWU notices", "sfa"], ["news", "globe", "blue", "Campus News", "Stories from EWU", "sfa"], ["club/home", "community", "purple", "Club Town Hall", "Clubs, chats, events and merch", "sfa"], ["events", "calendar", "pink", "Events", "Workshops, concerts, clubs", "sfa"], ["calendar", "calcheck", "red", "Academic calendar", "Holidays, payments, finals", "sfa"], ["alumni", "community", "green", "Alumni", "Where graduates are now", "sfa"], ["blog", "notes", "purple", "Blog", "Tips and stories", "sfa"], ["jobs", "briefcase", "blue", "Jobs", "Jobs & internships", "sfa"], ["mentors", "heart", "pink", "Mentors", "Ask alumni for advice", "s"]]]
    ].map(([g, list]) => [g, list.filter((t) => t[5].includes(rk) && (!ctx.PAGE_FEATURE[t[0]] || ctx.content.feature(ctx.PAGE_FEATURE[t[0]])))]).filter(([, list]) => list.length);
    return `<a class="me-card" href="#/profile">${ctx.myAvatar("lg")}<span class="grow min0"><b class="ellipsis">${esc(p.name || "Set up your profile")}</b><span class="ellipsis">${esc([p.id, p.program || p.department].filter(Boolean).join(" · ") || ctx.roleLabel())}</span>
        <span class="me-sync ${ctx.C.user ? "on" : ""}">${icon(ctx.C.user ? "cloud" : "database", "sm")} ${ctx.C.user ? "Synced on all your devices" : "Saved on this device"}</span></span>${icon("chevR")}</a>
      ${ctx.content.feature("clubs") ? `<a class="cl-entry" href="#/club/home"><span class="cl-entry-ic">${icon("community")}</span><span class="grow min0"><b>Club Town Hall</b><span>Your clubs, chats, events, elections and merch</span></span>${icon("chevR")}</a>` : ""}
      ${rk !== "a" ? arcade() : ""}
      ${GROUPS.map(([g, list]) => `<h2 class="mgroup-h">${g}</h2><div class="mtiles">${list.map(([id, ic, tone, t, d]) => `<a class="mtile" href="#/${id}"><span class="itile ${tone}">${icon(ic)}</span><div class="min0"><b>${t}</b><span>${d}</span></div></a>`).join("")}</div>`).join("")}
      ${ctx.C.install ? `<button class="get-app mt" id="mo-install" style="width:100%;text-align:left;cursor:pointer"><span class="itile green">${icon("download")}</span><span class="grow"><b>Install EWUdiots on this device</b><span>Its own window, works offline, same account</span></span>${icon("chevR", "chev")}</button>` : ""}
      <a class="get-app mt" href="${ctx.native.isNative ? ctx.SITE : ""}/#download"${ctx.native.isNative ? ' target="_blank" rel="noopener"' : ""}><span class="itile purple">${icon("download")}</span><span class="grow"><b>Get EWUdiots everywhere</b><span>Android app, Windows and the Chrome extension</span></span>${icon("chevR", "chev")}</a>
      <h2 class="mt-l" style="margin-bottom:10px">Account</h2>
      <section class="card settings-list">
        ${[["profile", "user", "purple", "Profile & Settings", "Manage your account"], ["help", "help", "purple", "Help & Support", "FAQs, contact and feedback"], ["about", "info", "purple", "About EWUdiots", "Unofficial student project"]]
          .map(([id, ic, tone, t, d]) => `<a class="lrow" href="#/${id}"><span class="itile ${tone}">${icon(ic)}</span><span class="body"><b>${t}</b><span>${d}</span></span>${icon("chevR", "chev")}</a>`).join("")}
        <button class="lrow" id="mo-share"><span class="itile purple">${icon("share")}</span><span class="body"><b>Share with Friends</b><span>Help your friends find it</span></span>${icon("chevR", "chev")}</button>
      </section>
      ${devCard()}`;
  };
  /* Arcade: the study tools as games, with your level and XP from Focus Quest. */
  const arcade = () => {
    const L = ctx.study.levelInfo(), streak = ctx.study.streak(), due = ctx.study.dueCards().length;
    const GAMES = [["focus", "target", "linear-gradient(135deg,#5b3df5,#8b5cf6)", "Focus Quest", "Beat the 25-min boss", `Lv ${L.n}`],
      ["cards", "cards", "linear-gradient(135deg,#e0457b,#f59e0b)", "Flashcard Duel", due ? `${due} cards waiting` : "Win your daily review", due ? `${due}` : "Ready"],
      ["me", "trophy", "linear-gradient(135deg,#f08a24,#facc15)", "Trophy Room", "Badges and records", `${ctx.study.unlockedCount()} won`],
      ["map", "map", "linear-gradient(135deg,#0ea5e9,#22c55e)", "Campus Quest", "Walk the campus in 3D", "Explore"],
      ["whatif", "bars", "linear-gradient(135deg,#15122e,#5b3df5)", "CGPA Boss Fight", "What grade do you need?", "Plan"],
      ["exams", "exam", "linear-gradient(135deg,#16a34a,#84cc16)", "Exam Raid", "A revision plan per exam", "Prep"]].filter(([id]) => ctx.pages[id]);
    return `<section class="arcade-head mt"><div class="row between nowrap" style="gap:10px"><div class="min0"><h2 class="mgroup-h" style="margin:0">Arcade</h2><p class="xs" style="margin:2px 0 0">Level ${L.n} · ${esc(L.name)} · ${streak}-day streak</p></div>
        <span class="xp-pill">${icon("zap", "sm")} ${L.xp} XP</span></div><div class="xp-bar mt-s" role="progressbar" aria-valuenow="${L.pct}" aria-valuemin="0" aria-valuemax="100" aria-label="Progress to level ${L.n + 1}"><i style="width:${L.pct}%"></i></div><p class="xs mt-s">${L.toNext} XP to level ${L.n + 1}</p></section>
      <div class="arcade mt-s">${GAMES.map(([id, ic, bg, t, d, lv]) => `<a class="arc" href="#/${id}" style="background:${bg}"><span class="lvl">${esc(lv)}</span>${icon(ic)}<b>${t}</b><span>${d}</span></a>`).join("")}</div>`;
  };
  /* The maker of EWUdiots (More and About). */
  const devCard = () => `<section class="dev-card mt" aria-label="Made by">
    <div class="dev-glow" aria-hidden="true"></div>
    <img class="dev-photo" src="/img/dev-yusuf.webp" alt="Yusuf Hasan Aditta" width="88" height="88" loading="lazy">
    <div class="dev-body"><span class="dev-kicker">${icon("heart", "sm")} Built by a student, for students</span>
      <b class="dev-name">Yusuf Hasan Aditta</b>
      <span class="dev-role">CSE · East West University</span>
      <div class="dev-links"><a class="btn sm dev-btn" href="https://github.com/yusufhasanaditta" target="_blank" rel="noopener">${icon("github", "sm")} GitHub</a><a class="btn sm dev-btn li" href="https://www.linkedin.com/in/yusuf-hasan-aditta" target="_blank" rel="noopener">${icon("linkedin", "sm")} LinkedIn</a></div>
    </div></section>
    <p class="xs mt-s" style="text-align:center">Unofficial · not affiliated with East West University</p>`;
  pages.more.mount = (el) => {
    $("#mo-install", el)?.addEventListener("click", async () => { const p = ctx.C.install; if (!p) return; p.prompt(); await p.userChoice.catch(() => {}); ctx.C.install = null; ctx.rerender(); });
    moShare(el);
  };
  const moShare = (el) => $("#mo-share", el).addEventListener("click", async () => {
    try { const r = await ctx.native.share({ title: "EWUdiots", text: "EWUdiots: routine, CGPA, advising planner, deadlines and study tools for EWU students.", url: location.origin }); if (r === "copied") toast("Link copied"); } catch { /* share cancelled */ }
  });

  /* ═════════════ PROFILE & SETTINGS ═════════════ */
  pages.profile = () => {
    const St = S(), p = St.profile || {}, L = ctx.study.levelInfo(), x = ctx.study.stats();
    const C = ctx.C, cloud = ctx.cloud;
    const row = (id, ic, t, d, right = "") => `<button class="lrow" id="${id}"><span class="itile purple">${icon(ic)}</span><span class="body"><b>${t}</b><span>${d}</span></span>${right ? `<span class="small muted">${right}</span>` : ""}${icon("chevR", "chev")}</button>`;
    return `${ctx.subHead("Profile &amp; Settings", "", "#/more")}
      <div style="max-width:760px;margin:0 auto">
      ${profileHero(p)}
      ${verifyNudge("pf-verify")}
      ${St.role === "student" ? portalCard(p, St) : ""}
      ${aboutCard(p)}
      <div class="card mt stats-strip">${[["star", "yellow", L.n, "Level"], ["shield", "green", ctx.study.unlockedCount(), "Badges"], ["bars", "blue", Math.round(x.totalMin / 60), "Study Hours"], ["flame", "orange", x.streak, "Day Streak"]]
        .map(([ic, tone, v, l]) => `<div><span class="itile sm ${tone}">${icon(ic)}</span><div><b class="num">${v}</b><span>${l}</span></div></div>`).join("")}</div>
      <section class="card settings-list mt">${row("pf-edit", "userpen", "Edit Profile", "Update your name, ID and program")}<a class="lrow" href="#/idcard"><span class="itile purple">${icon("scan")}</span><span class="body"><b>My ID Card</b><span>${St.idcard ? `${esc(St.idcard.id)}${St.idcard.verified ? " · verified" : ""}` : "Scan your card for a 3D student pass"}</span></span>${icon("chevR", "chev")}</a>${row("pf-acad", "book", "Academic Info", "Role, program, semester and credits")}${row("pf-priv", "shield", "Privacy &amp; Security", "Manage your data and account security")}</section>
      <h2 class="mt-l" style="margin-bottom:10px">Account &amp; Cloud</h2>
      <section class="card">${!cloud.enabled ? `<div class="row nowrap"><span class="itile teal">${icon("database")}</span><div><b>On this device</b><p class="small muted">Everything is saved on this device. Cloud backup isn't connected in this build.</p></div></div>` :
        C.user ? `<div class="row nowrap"><span class="itile green">${icon("cloud")}</span><div class="grow min0"><b class="ellipsis" style="display:block">${esc(C.user.email)}</b><p class="small muted">${St.lastSync ? `Backed up ${new Date(St.lastSync).toLocaleString()}` : "Backing up…"}</p></div></div><div class="row mt"><button class="btn sm" id="ac-sync">${icon("sync")} Back up now</button><button class="btn sm" id="ac-pw">${icon("shield")} Change password</button><button class="btn sm neutral" id="ac-out">${icon("logout")} Log Out</button></div>` :
        `<div class="row nowrap"><span class="itile purple">${icon("cloud")}</span><div class="grow"><b>Back up &amp; unlock shared features</b><p class="small muted">Sign in with your EWU student email for backup, reviews, the shared vault and campus-wide free rooms.</p></div></div><a class="btn primary block mt" href="#/login?from=profile">${icon("mail")} Sign in with EWU email</a>`}</section>
      <h2 class="mt-l" style="margin-bottom:10px">App Preferences</h2>
      <section class="card settings-list">
        ${row("pf-theme", "theme", "Theme", "Light, dark or match your device", { auto: "System", light: "Light", dark: "Dark" }[St.theme])}
        <div class="lrow"><span class="itile purple">${icon("globe")}</span><span class="body"><b>Language</b><span>বাংলা coming soon</span></span><span class="small muted">English</span></div>
        <div class="lrow"><span class="itile purple">${icon("bell")}</span><span class="body"><b>Notifications</b><span>Classes, deadlines and payments</span></span><label class="switch"><input type="checkbox" id="set-notify" ${St.settings.notify ? "checked" : ""} aria-label="Notifications"></label></div>
        <a class="lrow" href="#/alarms"><span class="itile purple">${icon("clock")}</span><span class="body"><b>Class alarms</b><span>${St.settings.alarms.on ? St.settings.alarms.offsets.map(ctx.fmtBefore).join(", ") + " before each class" : "Off"}</span></span>${icon("chevR", "chev")}</a>
        <a class="lrow" href="#/sync"><span class="itile purple">${icon("sync")}</span><span class="body"><b>Data Sync</b><span>Re-sync academic data from portal${St.lastImport ? ` · last ${ctx.fmtDate(St.lastImport)}` : ""}</span></span>${icon("chevR", "chev")}</a>
      </section>
      <h2 class="mt-l" style="margin-bottom:10px">Data &amp; Backup</h2>
      <section class="card settings-list">
        ${row("pf-export", "download", "Export My Data", "Download your data (notes, settings, progress)")}
        ${row("pf-wipe", "trash", "Clear Local Data", "Remove your data from this device")}
        ${C.user ? `<button class="lrow" id="pf-delete" style="background:var(--error-s);margin:4px -16px;padding:12px 16px;border-radius:0 0 16px 16px"><span class="itile solid-red">${icon("shield")}</span><span class="body"><b style="color:var(--error-t)">Delete My Account</b><span style="color:var(--error-t)">Permanently delete your account and all data</span></span>${icon("chevR", "chev")}</button>` : ""}
      </section>
      <p class="xs mt" style="text-align:center">EWUdiots ${ctx.APP_VERSION} · Unofficial · not affiliated with East West University</p></div>`;
  };
  /* Signed-in students who haven't verified with their ID card yet see this on Home and Profile. */
  const needsVerify = () => { const u = ctx.C.user; return Boolean(u && ctx.cloud.roleOf(u) === "student" && !ctx.cloud.cardVerified(u)); };
  const verifyNudge = (id) => needsVerify() ? `<section class="card mt verify-nudge row nowrap"><span class="itile green">${icon("shield")}</span><div class="grow min0"><b>Verify your student account</b><p class="small muted">Scan both sides of your EWU ID card to get the verified badge. Takes a minute.</p></div><button class="btn primary sm" id="${id}">${icon("scan", "sm")} Verify</button></section>` : "";
  /* Profile header: photo (tap to change), name, role, and how complete the profile is. */
  const ABOUT = [["headline", "Headline", "text", "CSE student · competitive programmer", 80], ["bio", "About me", "area", "A few lines about you, what you're into and what you're looking for.", 500],
    ["phone", "Phone", "tel", "01XXXXXXXXX", 20], ["hometown", "Hometown", "text", "e.g. Chattogram", 60], ["skills", "Skills", "text", "Python, UI design, public speaking", 200],
    ["interests", "Interests", "text", "AI, photography, football", 200], ["clubs", "Clubs", "clubs", "", 300], ["linkedin", "LinkedIn", "url", "https://linkedin.com/in/…", 200],
    ["github", "GitHub", "url", "https://github.com/…", 200], ["website", "Website / portfolio", "url", "https://…", 200]];
  const completeness = (p) => {
    const keys = ["photo", "name", ...(S().role === "student" ? ["id", "program", "department", "advisor"] : ["department"]), "headline", "bio", "skills", "interests", "linkedin"];
    return Math.round((keys.filter((k) => p[k]).length / keys.length) * 100);
  };
  function profileHero(p) {
    const pc = completeness(p);
    return `<section class="card pf-hero">
      <div class="pf-photo">${ctx.myAvatar("xl")}<label class="pf-cam" aria-label="${p.photo ? "Change" : "Add"} your photo">${icon("image", "sm")}<input type="file" id="pf-photo" accept="image/*" hidden></label></div>
      <div class="grow min0"><b class="pf-name">${esc(p.name || "Your name")}${ctx.cloud.cardVerified(ctx.C.user) ? ` <span class="pill green" title="ID card checked">${icon("checkc", "sm")} Verified student</span>` : ""}</b>
        ${p.headline ? `<p class="small">${esc(p.headline)}</p>` : ""}
        <p class="small muted">${[p.id && `ID ${p.id}`, p.program || p.department, ctx.roleLabel(), "East West University"].filter(Boolean).map(esc).join(" · ")}</p>
        <div class="pf-meter mt-s" title="Profile ${pc}% complete"><span style="width:${pc}%"></span></div>
        <p class="xs mt-s">${pc >= 100 ? "Your profile is complete." : `Profile ${pc}% complete${p.photo ? "" : " · add a photo"}`}</p>
        <div class="row mt-s"><button class="btn sm" id="pf-edit2">${icon("userpen", "sm")} Edit name</button>${p.photo ? `<button class="btn sm ghost" id="pf-photo-x">${icon("trash", "sm")} Remove photo</button>` : ""}</div></div></section>`;
  }
  /* Everything the Chrome extension (or a screenshot) brought in from the EWU portal. */
  function portalCard(p, St) {
    const rows = [["Student ID", p.id], ["University email", p.email || (p.id ? `${p.id}@std.ewubd.edu` : "")], ["Program", p.program], ["Department", p.department],
      ["Advisor", p.advisor && `${p.advisor}${p.advisorInitial ? ` (${p.advisorInitial})` : ""}`], ["Advisor email", p.advisorEmail], ["CGPA (portal)", p.cgpa && Number(p.cgpa).toFixed(2)],
      ["Credits", p.creditsDone != null && `${p.creditsDone} of ${p.creditsTotal || 140} done`], ["Admitted", p.admitted], ["Current semester", p.semester]];
    const have = rows.filter(([, v]) => v);
    return `<section class="card mt"><div class="card-h"><h2><span class="itile sm blue">${icon("chrome")}</span> From your EWU portal</h2>${St.lastImport ? `<span class="xs">Synced ${ctx.fmtDate(St.lastImport)}</span>` : ""}</div>
      ${have.length ? `<dl class="pf-dl">${have.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl>` : `<p class="small muted">Nothing synced yet. The Chrome extension reads your Profile page on the portal and fills this in for you.</p>`}
      <div class="row mt"><button class="btn primary sm" id="pf-ext">${icon("download", "sm")} Fill from extension</button><button class="btn sm" id="pf-acad2">${icon("edit", "sm")} Edit</button></div>
      <p class="xs mt-s">${icon("shield", "sm")} Only academic details are read. Your portal password, NID, phone, address, date of birth and blood group are never read from the portal.</p></section>`;
  }
  function aboutCard(p) {
    const link = (u) => `<a href="${esc(u)}" target="_blank" rel="noopener nofollow">${esc(u.replace(/^https:\/\/(www\.)?/, "").replace(/\/$/, ""))}</a>`;
    const shown = ABOUT.filter(([k]) => p[k] && k !== "headline");
    return `<section class="card mt"><div class="card-h"><h2><span class="itile sm green">${icon("user")}</span> About me</h2><button class="btn sm" id="pf-about">${icon(shown.length ? "edit" : "plus", "sm")} ${shown.length ? "Edit" : "Add details"}</button></div>
      ${shown.length ? `<dl class="pf-dl">${shown.map(([k, l, type]) => `<div class="${k === "bio" ? "full" : ""}"><dt>${l}</dt><dd>${type === "url" && /^https:\/\//.test(p[k]) ? link(p[k]) : k === "clubs" ? p[k].split("|").filter(Boolean).map((c) => `<span class="tag">${esc(c)}</span>`).join(" ") : esc(p[k]).replace(/\n/g, "<br>")}</dd></div>`).join("")}</dl>`
        : `<p class="small muted">Add a headline, a short bio, your skills, interests, clubs and links. It's saved to your account and follows you to every device.</p>`}</section>`;
  }
  // Square-crop and shrink a picked photo to a small JPEG so it syncs quickly with the rest of your data.
  async function photoData(file) {
    if (!/^image\//.test(file.type)) throw new Error("Pick an image file.");
    if (file.size > 15e6) throw new Error("That image is too large (15 MB max).");
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error("Couldn't open that image. Try a JPG or PNG.")); i.src = url; });
      const s = Math.min(img.naturalWidth, img.naturalHeight), c = document.createElement("canvas"); c.width = c.height = 320;
      c.getContext("2d").drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, 0, 0, 320, 320);
      return c.toDataURL("image/jpeg", 0.85);
    } finally { URL.revokeObjectURL(url); }
  }
  function aboutForm() {
    const p = S().profile || {}, mine = new Set(String(p.clubs || "").split("|").filter(Boolean));
    openModal(ctx.modalHead("About me") + `<form id="ab-form" class="grid g2" novalidate>${ABOUT.map(([k, l, type, ph, max]) => type === "clubs"
      ? `<fieldset class="field full-row"><legend>${l}</legend><div class="chips">${CLUBS.map((c) => `<label class="chip"><input type="checkbox" name="club" value="${esc(c)}" ${mine.has(c) ? "checked" : ""}> ${esc(c)}</label>`).join("")}</div></fieldset>`
      : type === "area" ? `<label class="field full-row">${l}<textarea class="input" name="${k}" rows="3" maxlength="${max}" placeholder="${esc(ph)}">${esc(p[k] || "")}</textarea></label>`
      : `<label class="field ${["headline", "skills", "interests"].includes(k) ? "full-row" : ""}">${l}<input class="input" name="${k}" type="${type}" maxlength="${max}" value="${esc(p[k] || "")}" placeholder="${esc(ph)}" ${type === "tel" ? 'inputmode="tel" autocomplete="tel"' : ""}></label>`).join("")}
      <div id="ab-err" class="full-row"></div><p class="xs full-row">${icon("lock", "sm")} Private to your account. Nothing here is shown to other users.</p>
      <div class="row full-row"><span class="grow"></span><button class="btn primary">${icon("check")} Save</button></div></form>`, (m) => {
      $("#ab-form", m).addEventListener("submit", (e) => {
        e.preventDefault(); const fd = new FormData(e.target), f = {};
        ABOUT.forEach(([k, , type, , max]) => { f[k] = type === "clubs" ? fd.getAll("club").join("|") : String(fd.get(k) || "").trim().slice(0, max); });
        const bad = ABOUT.find(([k, , type]) => type === "url" && f[k] && !/^https:\/\/[^\s]+\.[^\s]+/i.test(f[k]));
        if (bad) { $("#ab-err", m).innerHTML = `<div class="alert red">${icon("alert")}<div><p>${bad[1]} must be a full link starting with https://</p></div></div>`; m.querySelector(`[name="${bad[0]}"]`).focus(); return; }
        if (f.phone && !/^\+?[\d\s-]{7,20}$/.test(f.phone)) { $("#ab-err", m).innerHTML = `<div class="alert red">${icon("alert")}<div><p>Use digits only for the phone number.</p></div></div>`; return; }
        S().profile = Object.assign(S().profile || {}, f); ctx.save(); closeModal(); ctx.rerender(); toast("Profile saved");
      });
    });
  }
  function profileForm(title, keys) {
    const p = S().profile || {};
    const L = { name: "Full Name", id: "Student ID", program: "Program", department: "Department", advisor: "Advisor", creditsTotal: "Credits required for degree", semester: "Current semester", year: "Year" };
    openModal(ctx.modalHead(title) + `<form id="pf-form" class="stack">${keys.map((k) => `<label class="field">${L[k]}<input class="input" name="${k}" value="${esc(p[k] ?? "")}" ${k === "creditsTotal" ? 'type="number" min="1"' : ""} ${k === "id" ? 'inputmode="numeric" placeholder="2024-1-60-123"' : ""}></label>`).join("")}
      ${keys.includes("program") ? `<label class="field">I am a<select class="select" name="role">${[["student", "Student"], ["faculty", "Faculty Member"], ["alumni", "Alumni"]].map(([v, l]) => `<option value="${v}" ${S().role === v ? "selected" : ""}>${l}</option>`).join("")}</select></label>` : ""}
      <button class="btn primary block">Save Changes</button></form>`, (m) => {
      $("#pf-form", m).addEventListener("submit", (e) => {
        e.preventDefault(); const f = Object.fromEntries(new FormData(e.target));
        if (f.id && !/^\d{4}-\d-\d{2}-\d{3}$/.test(f.id.trim())) { const i = m.querySelector('[name="id"]'); i.setAttribute("aria-invalid", "true"); i.insertAdjacentHTML("afterend", '<span class="err">Use the EWU format, e.g. 2024-1-60-123</span>'); return; }
        if (f.role) { S().role = f.role; delete f.role; }
        S().profile = Object.assign(S().profile || {}, f);
        if (f.creditsTotal) S().profile.creditsTotal = Number(f.creditsTotal) || 140;
        ctx.save(); closeModal(); ctx.rerender(); toast("Profile saved");
      });
    });
  }
  pages.profile.mount = (el) => {
    const on = (sel, ev, fn) => { const x = $(sel, el); x && x.addEventListener(ev, fn); };
    on("#pf-edit", "click", () => profileForm("Edit Profile", ["name", "id", "department"]));
    on("#pf-edit2", "click", () => profileForm("Edit Profile", S().role === "student" ? ["name", "id", "department"] : ["name", "department"]));
    on("#pf-about", "click", aboutForm);
    on("#pf-verify", "click", () => ctx.idcard.verifyAccount());
    if (ctx.qparam("verify") && needsVerify()) { history.replaceState(null, "", "#/profile"); ctx.idcard.verifyAccount(); }
    on("#pf-photo", "change", async (e) => {
      const f = e.target.files[0]; e.target.value = ""; if (!f) return;
      try { S().profile = Object.assign(S().profile || {}, { photo: await photoData(f) }); ctx.save(); ctx.rerender(); toast("Photo updated", "success", ctx.C.user ? "It's saved to your account." : ""); }
      catch (x) { toast(x.message, "error"); }
    });
    on("#pf-photo-x", "click", () => { delete S().profile.photo; ctx.save(); ctx.rerender(); toast("Photo removed", "info"); });
    on("#pf-ext", "click", async (e) => {
      const b = e.currentTarget; busy(b, true, "Checking…");
      const got = ctx.C.user ? await ctx.sync.checkInbox() : false;
      busy(b, false); if (got) return;
      openModal(ctx.modalHead("Fill your profile from the portal") + `<div class="stack">
        <div class="lrow"><span class="itile blue">${icon("chrome")}</span><span class="body"><b>1. Install the EWUdiots extension</b><span>On a computer, in Chrome or Edge. ${ctx.C.user ? "Sign in to it with this account." : ""}</span></span></div>
        <div class="lrow"><span class="itile purple">${icon("user")}</span><span class="body"><b>2. Open your Profile page on the portal</b><span>portal.ewubd.edu → Profile. Open Grade Report and Class Schedule too for CGPA and routine.</span></span></div>
        <div class="lrow"><span class="itile green">${icon("sync")}</span><span class="body"><b>3. Press "Send to EWUdiots"</b><span>${ctx.C.user ? "Your pages arrive here on every device. Tap Fill from extension again." : "The app opens with your details to review."}</span></span></div>
        <div class="row"><a class="btn" href="/download/extension" target="_blank" rel="noopener">${icon("download", "sm")} Get the extension</a><button class="btn primary" id="pf-ext-go">${icon("sync", "sm")} Other ways to sync</button></div></div>`,
        (m) => $("#pf-ext-go", m).addEventListener("click", () => { closeModal(); ctx.sync.openSync("ext"); }));
    });
    on("#pf-acad", "click", () => profileForm("Academic Info", ["program", "semester", "advisor", "creditsTotal"]));
    on("#pf-acad2", "click", () => profileForm("Academic Info", ["program", "semester", "advisor", "creditsTotal"]));
    on("#pf-priv", "click", () => openModal(ctx.modalHead("Privacy & Security") + `<div class="stack">
      <div class="privacy" style="margin:0">${icon("shield")}<div><b>What we never read</b><p>Your portal password, NID, phone, address, date of birth, blood group and portal photo are never read from the portal. A profile photo or phone number is stored only if you add it yourself.</p></div></div>
      <p class="small">Your routine, grades, fees and notes are stored on this device${ctx.C.user ? " and in your private, encrypted cloud backup that only you can access" : ""}. Reviews are anonymous.</p>
      <div class="row"><a class="btn sm" href="/privacy.html" target="_blank" rel="noopener">Privacy policy</a><a class="btn sm" href="/terms.html" target="_blank" rel="noopener">Terms</a></div></div>`));
    on("#pf-theme", "click", () => openModal(ctx.modalHead("Theme") + `<div class="stack" style="gap:0">${[["auto", "System", "Match your device"], ["light", "Light", "Bright and clean"], ["dark", "Dark", "Easy on the eyes at night"]].map(([v, l, d]) => `<button class="lrow" data-th="${v}"><span class="itile purple">${icon(v === "dark" ? "moon" : v === "light" ? "sun" : "theme")}</span><span class="body"><b>${l}</b><span>${d}</span></span>${S().theme === v ? icon("check") : ""}</button>`).join("")}</div>`,
      (m) => $$("[data-th]", m).forEach((b) => b.addEventListener("click", () => { S().theme = b.dataset.th; ctx.save({ silent: true }); ctx.applyTheme(); closeModal(); ctx.rerender(); }))));
    on("#set-notify", "change", async (e) => { if (e.target.checked) { if (!(await ctx.enableNotifications())) e.target.checked = false; } else { S().settings.notify = false; ctx.save(); toast("Reminders off", "info"); } });
    on("#ac-sync", "click", async (e) => { busy(e.currentTarget, true, "Backing up…"); if (await ctx.pushNow()) toast("Backed up"); else toast("Backup failed", "error", "Check your connection and try again."); ctx.rerender(); });
    on("#ac-pw", "click", () => openModal(ctx.modalHead("Change password") + `<form id="cp" class="stack" novalidate>${pwField("password", "New password", "new-password")}${pwField("password2", "Confirm new password", "new-password")}<p class="xs">At least 8 characters, with letters and numbers. You stay signed in on this device.</p><div id="cp-err"></div><button class="btn primary block">${icon("check")} Save password</button></form>`, (m) => {
      $$("[data-eye]", m).forEach((b) => b.addEventListener("click", () => { const i = b.previousElementSibling; i.type = i.type === "password" ? "text" : "password"; }));
      $("#cp", m).addEventListener("submit", async (e) => { e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)), err = (t) => { $("#cp-err", m).innerHTML = authErr(t); };
        if (!pwOk(f.password)) return err("Use at least 8 characters with letters and numbers."); if (f.password !== f.password2) return err("The two passwords don't match.");
        const b = e.target.querySelector("button.primary"); busy(b, true, "Saving…");
        try { await ctx.cloud.changePassword(f.password); closeModal(); toast("Password changed"); } catch (x) { busy(b, false); err(x.message); } });
    }));
    on("#ac-out", "click", () => confirmModal("Log Out?", "Are you sure you want to log out of your account? Your data stays on this device.", "Log Out", async () => { await ctx.cloud.signOut(); }, true, "logout"));
    on("#pf-export", "click", () => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([JSON.stringify(S(), null, 2)], { type: "application/json" })); a.download = "ewudiots-data.json"; a.click(); toast("Export downloaded"); });
    on("#pf-wipe", "click", () => confirmModal("Clear Local Data?", `Removes your profile, routine, grades, tasks and settings from this device.${ctx.C.user ? " Your cloud backup stays — sign in again to restore." : " This action cannot be undone."}`, "Clear Data", async () => { if (ctx.C.user) await ctx.cloud.signOut(); ctx.resetState(); ctx.go("#/welcome"); toast("Device cleared", "info"); }, true));
    on("#pf-delete", "click", () => confirmModal("Delete Account?", "This will permanently delete your account and all your data. This action cannot be undone.", "Delete Account", async () => { await ctx.cloud.deleteAccount(ctx.C.user.id); ctx.resetState(); ctx.go("#/welcome"); toast("Your account was deleted", "info"); }, true));
  };

  /* ═════════════ HELP + ABOUT ═════════════ */
  const FAQ = [
    ["How do I get my routine into EWUdiots?", "Go to Sync Portal. Upload a screenshot of My Class Schedule, paste the page text (Ctrl+A, Ctrl+C), or use the Chrome extension on a computer. You review everything before it's saved."],
    ["Is my portal password safe?", "EWUdiots never asks for or reads your portal password. It only reads academic info you choose to share: courses, times, rooms, grades, credits and fees."],
    ["Why is my CGPA different from the portal?", "Some courses may be missing. Sync your full Grade Report, or add missing courses on the CGPA page. Retakes count the latest grade, and P, S, U, R, I and W grades don't count."],
    ["How does the advising planner work?", "Sync the Offered Courses page for next semester, add the courses you want, and EWUdiots finds every clash-free routine that follows your advising rules."],
    ["Can I use it without an account?", "Yes. Everything works on your device. Signing in with your EWU email only adds backup and shared features like reviews and the study vault."],
    ["Is this the official EWU app?", "No. EWUdiots is an unofficial project by students. Always confirm important information on the official portal."]
  ];
  ctx.FAQ = FAQ; // the assistant answers how-to questions from these
  pages.help = () => `${ctx.subHead("Help &amp; Support", "", "#/more")}<div style="max-width:760px;margin:0 auto">
    <section class="card">${FAQ.map(([q, a]) => `<details class="lrow" style="display:block"><summary style="font-weight:600;padding:4px 0">${esc(q)}</summary><p class="small muted" style="margin-top:8px">${esc(a)}</p></details>`).join("")}</section>
    ${ctx.C.user ? `<form class="card mt stack" id="fb-form"><div class="row nowrap"><span class="itile purple">${icon("mail")}</span><div class="grow"><b>Send feedback</b><p class="small muted">Report a bug, ask a question or request a feature. The EWUdiots team reads every message.</p></div></div>
      <div class="seg" role="radiogroup">${[["idea", "Idea"], ["bug", "Bug"], ["question", "Question"], ["other", "Other"]].map(([v, l], i) => `<label class="seg-radio"><input type="radio" name="kind" value="${v}" ${i ? "" : "checked"}><span>${l}</span></label>`).join("")}</div>
      <label class="field"><span class="sr-only">Message</span><textarea class="input" name="body" rows="4" minlength="3" maxlength="4000" required placeholder="Tell us what happened or what you'd like…"></textarea></label>
      <button class="btn primary">${icon("arrow")} Send to the team</button></form>`
      : `<section class="card mt row nowrap"><span class="itile purple">${icon("mail")}</span><div class="grow"><b>Still need help?</b><p class="small muted">Sign in to send feedback in the app, or email us.</p></div><a class="btn primary sm" href="mailto:civicframe01@gmail.com?subject=EWUdiots%20feedback">Contact</a></section>`}</div>`;
  pages.help.mount = (el) => $("#fb-form", el)?.addEventListener("submit", async (e) => {
    e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)), b = e.target.querySelector("button.primary");
    if (String(f.body).trim().length < 3) return toast("Write a little more first", "warn");
    busy(b, true, "Sending…");
    try { await ctx.cloud.sendFeedback(f.kind, String(f.body), ctx.APP_VERSION); e.target.reset(); toast("Thanks! The team got your message", "success"); } catch (err) { toast(err.message, "error"); }
    busy(b, false);
  });
  pages.about = () => `${ctx.subHead("About EWUdiots", "", "#/more")}<div style="max-width:760px;margin:0 auto">
    <section class="card" style="text-align:center"><div class="ob-word" style="padding:8px 0"><span class="w" style="font-size:38px">EWU<i>diots</i></span><p>Your Uni Life, In One App</p><span class="unoff">Unofficial · not affiliated with EWU</span></div>
      <p class="small muted mt">Version ${ctx.APP_VERSION}. Made by EWU students, for EWU students. EWUdiots is not affiliated with, endorsed by or connected to East West University. Always confirm important information on the official portal.</p>
      <div class="row center mt"><a class="btn sm" href="/privacy.html" target="_blank" rel="noopener">Privacy policy</a><a class="btn sm" href="/terms.html" target="_blank" rel="noopener">Terms</a></div></section>
    <section class="card credits mt"><span class="itile purple" style="margin:0 auto">${icon("heart")}</span><h2>Built by a student, <span>for students</span></h2><p class="small muted">Credits</p>
      <ul>${[["user", "Design, code and campus research by Yusuf Hasan Aditta, CSE, East West University"], ["users", "Ideas, bug reports and testing from EWU students"], ["school", "Public information from EWU notices, the academic calendar and club pages"], ["heart", "Free and open to every EWU student, teacher and alumnus"]].map(([ic, t]) => `<li>${icon(ic, "sm")}<span>${t}</span></li>`).join("")}</ul></section>${devCard()}</div>`;

  /* ═════════════ ONBOARDING + ACCOUNTS (full screen) ═════════════
     Split layout: a brand panel (logo, promise, live-looking cards drawn in CSS) and the form. No cropped pictures. */
  const BRAND_FEATS = [["calendar", "Routine, alarms and next class"], ["bars", "CGPA, degree progress and advising"], ["megaphone", "Official notices and campus news"], ["community", "Alumni mentors, jobs and the blog"]];
  const obShell = (inner, { back = "", skip = "", foot = "" } = {}) => `<div class="auth">
    <aside class="auth-brand" aria-hidden="true"><div class="ab-glow"></div><div class="ab-grid"></div>
      <div class="ab-inner"><div class="ab-logo"><img src="/logo-mark.png" alt="" width="52" height="52"><span class="word">EWU<i>diots</i></span></div>
        <h2>Your whole EWU life, <span>in one place.</span></h2><p>Made by EWU students for students, teachers and alumni.</p>
        <ul class="ab-feats">${BRAND_FEATS.map(([ic, t]) => `<li><span>${icon(ic, "sm")}</span>${t}</li>`).join("")}</ul>
        <div class="ab-cards"><div class="ab-card abc1"><span class="ab-dot"></span><div><b>CSE207 · starts in 25 min</b><small>FUB-603 · 5th floor</small></div></div>
          <div class="ab-card abc2"><span class="ab-ring">3.62</span><div><b>CGPA this semester</b><small>▲ 0.14 since last term</small></div></div>
          <div class="ab-card abc3">${icon("bell", "sm")}<div><b>Alarm set</b><small>30 min before every class</small></div></div></div>
        <p class="ab-unoff">Unofficial · not affiliated with East West University</p></div></aside>
    <main class="auth-main"><div class="auth-card">
      <div class="auth-top">${back ? `<a class="icon-btn" href="${back}" aria-label="Back">${icon("chevL")}</a>` : "<span></span>"}<span class="auth-mlogo"><img src="/logo-mark.png" alt="" width="30" height="30"><span class="word">EWU<i>diots</i></span></span>${skip ? `<button class="lnk" id="ob-skip">${skip}</button>` : "<span></span>"}</div>
      <div class="auth-body">${inner}</div>${foot ? `<div class="auth-foot">${foot}</div>` : ""}</div></main></div>`;
  pages.welcome = () => obShell(`<span class="eyebrow">Welcome</span><h1 class="auth-h">Let's get you set up</h1>
      <p class="muted">One account for the phone app, the web, Windows, Mac and the Chrome extension.</p>
      <div class="stack mt" style="gap:10px">
        <button class="choice" data-go="#/login?m=signup"><span class="itile purple">${icon("plus")}</span><span class="grow"><b>Create an account</b><span>Students, teachers and alumni</span></span>${icon("chevR")}</button>
        <button class="choice" data-go="#/login?m=signin"><span class="itile blue">${icon("user")}</span><span class="grow"><b>I already have an account</b><span>Sign in with your ID or email and password</span></span>${icon("chevR")}</button>
        <button class="choice ghosty" id="ob-local"><span class="itile teal">${icon("database")}</span><span class="grow"><b>Try without an account</b><span>Everything stays on this device</span></span>${icon("chevR")}</button></div>
      <div class="trust mt">${[["shield", "Never asks for your portal password"], ["wifioff", "Works offline"], ["heart", "Free for every student"]].map(([ic, t]) => `<span>${icon(ic, "sm")} ${t}</span>`).join("")}</div>`);
  pages.welcome.mount = (el) => {
    if (ctx.C.user && ctx.cloud.enabled) { setTimeout(() => ctx.go(S().onboarded ? "#/home" : "#/setup"), 0); return; } // already signed in
    $$("[data-go]", el).forEach((b) => b.addEventListener("click", () => ctx.go(ctx.cloud.enabled ? b.dataset.go : "#/role")));
    $("#ob-local", el)?.addEventListener("click", () => ctx.go("#/role"));
  };

  /* ── Accounts: sign in (ID/email + password, or a code by email, or by scanning the ID card → code to the student mail)
     · create account (students: student email, verify with the ID card later — or scan both sides now) · verify the
     email with a 6-digit code · forgot password (code by email → new password). ── */
  const auth = { mode: "signin", role: "student", sMethod: "email", sid: "", codeSent: false, email: "", card: null, name: "", pendingRole: "" };
  const pwOk = (p) => p.length >= 8 && /[A-Za-z]/.test(p) && /\d/.test(p);
  const pwField = (name, label, auto) => `<label class="field">${label}<span class="pw-wrap"><input class="input" name="${name}" type="password" autocomplete="${auto}" minlength="8" required><button type="button" class="pw-eye" data-eye aria-label="Show password">${icon("eye", "sm")}</button></span></label>`;
  const authErr = (msg) => `<div class="alert red mt-s" role="alert"><span class="a-ic">${icon("alert")}</span><div><b>${esc(msg)}</b></div></div>`;
  pages.login = () => {
    const from = ctx.qparam("from"), back = from === "profile" ? "#/profile" : "#/welcome?s=2";
    const m = ctx.qparam("m"); if (m && ["signin", "signup", "forgot"].includes(m) && auth.mode !== "verify" && auth.mode !== "reset") auth.mode = m;
    if (!ctx.cloud.enabled) return obShell(`<h1>Sign in</h1><p class="muted mt-s">Cloud accounts aren't connected in this build. Everything works on this device.</p>`, { back, foot: `<button class="btn primary lg block" id="lg-skip">Continue</button>` });
    if (ctx.C.user) return obShell(`<div class="empty"><span class="ill">${icon("checkc")}</span><h3>You're signed in</h3><p>${esc(ctx.C.user.email)}</p></div>`, { back, foot: `<button class="btn primary lg block" id="lg-skip">Continue</button>` });
    const brand = auth.mode === "signin" ? `<h1 class="auth-h">Welcome back</h1><p class="muted">Sign in to sync your data on every device.</p>`
      : auth.mode === "signup" ? `<h1 class="auth-h">Create your account</h1><p class="muted">Every new account is checked with a 6-digit code sent to its email.</p>` : "";
    const tabs = auth.mode === "signin" || auth.mode === "signup" ? `<div class="seg auth-tabs mt-l" role="tablist">${[["signin", "Sign in"], ["signup", "Create account"]].map(([v, l]) => `<button role="tab" data-am="${v}" aria-selected="${auth.mode === v}">${l}</button>`).join("")}</div>` : "";
    let body = "";
    if (auth.mode === "signin") body = `<form id="au-in" class="stack mt" novalidate>
        <label class="field">Student ID or email<span class="searchbar">${icon("user")}<input class="input" name="who" autocomplete="username" placeholder="2024-1-60-123 or you@gmail.com" value="${esc(auth.email)}" required></span></label>
        ${pwField("password", "Password", "current-password")}
        <div class="row between"><label class="row small" style="gap:6px"><input type="checkbox" class="check" checked disabled> Keep me signed in</label><button type="button" class="lnk" data-am="forgot">Forgot password?</button></div>
        <div id="au-err"></div><button class="btn primary lg block">${icon("arrow")} Sign in</button></form>
        <div class="or-line"><span>or</span></div>
        <div class="grid g2 alt-signin"><button type="button" class="btn outline" id="au-scanin">${icon("scan")} Scan ID card</button><button type="button" class="btn outline" data-am="code">${icon("mail")} Email me a code</button></div>`;
    else if (auth.mode === "code") body = !auth.codeSent
      ? `<h2 class="mt" style="text-align:center">Sign in with a code</h2><p class="muted small" style="text-align:center">No password needed. We email a 6-digit code to your account's email.</p>
        <form id="au-cd1" class="stack mt" novalidate><label class="field">Student ID or email<span class="searchbar">${icon("user")}<input class="input" name="who" autocomplete="username" required value="${esc(auth.email)}" placeholder="2024-1-60-123 or you@gmail.com"></span></label><div id="au-err"></div>
        <button class="btn primary lg block">${icon("mail")} Email me a code</button><div class="row"><button type="button" class="btn ghost grow" id="au-scanin">${icon("scan")} Scan ID card</button><button type="button" class="btn ghost grow" data-am="signin">Back</button></div></form>`
      : `<div class="verify-ill">${icon("mail")}</div><h2 style="text-align:center">Check your email</h2><p class="muted small" style="text-align:center">We sent a sign-in code to <b>${esc(auth.email)}</b>.${/@std\.ewubd\.edu$/.test(auth.email) ? " Open your EWU student mail" : " Open your inbox"}.</p><p class="xs mail-hint">It comes from <b>EWUdiots &lt;ewudiots@gmail.com&gt;</b> within a minute. Not there? Look in <b>Spam</b> or <b>Promotions</b>, or search your mail for “EWUdiots”. Still nothing after 2 minutes? Tap “Send a new code”.</p>
        <form id="au-cd2" class="stack mt" novalidate><label class="field">Code<input class="input otp" name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" required></label><div id="au-err"></div>
        <button class="btn primary lg block">${icon("check")} Sign in</button><div class="row"><button type="button" class="btn ghost grow" id="au-cdre">${icon("reset")} Send a new code</button><button type="button" class="btn ghost grow" id="au-cdback">Back</button></div></form>`;
    else if (auth.mode === "signup") {
      const R = [["student", "user", "Student"], ["alumni", "cap", "Alumni"], ["faculty", "briefcase", "Faculty"]];
      const viaCard = auth.sMethod === "card";
      body = `<div class="role-pick mt" role="radiogroup" aria-label="I am">${R.map(([v, ic, l]) => `<button type="button" role="radio" data-ar="${v}" aria-checked="${auth.role === v}">${icon(ic)}<span>${l}</span></button>`).join("")}</div>
        ${auth.role === "student" ? `<div class="seg auth-tabs mt" role="tablist" aria-label="Sign up with">${[["email", "mail", "Student email"], ["card", "scan", "Scan ID card"]].map(([v, ic, l]) => `<button type="button" role="tab" data-sm="${v}" aria-selected="${(auth.sMethod || "email") === v}">${icon(ic, "sm")} ${l}</button>`).join("")}</div>` : ""}
        <form id="au-up" class="stack mt" novalidate>
        ${auth.role === "student" ? (viaCard ? (auth.card ? `<div class="card soft row nowrap"><span class="itile green">${icon("checkc")}</span><div class="grow min0"><b>${esc(auth.card.name || "ID card added")}</b><p class="small muted">${esc(auth.card.id)}@std.ewubd.edu · both sides added</p></div><button type="button" class="btn sm ghost" id="au-card">${icon("reset", "sm")} Redo</button></div>`
            : `<button type="button" class="id-cta" id="au-card"><span class="itile purple">${icon("scan")}</span><span class="grow"><b>Scan both sides of your ID card</b><span>We read your student ID, send the code to your EWU mail, and your account is verified straight away.</span></span>${icon("chevR")}</button>`)
            : `<label class="field">Student ID or EWU email<span class="searchbar">${icon("user")}<input class="input" name="sid" autocomplete="username" required value="${esc(auth.sid || "")}" placeholder="2024-1-60-123"></span><span class="hint">We send a code to your EWU student mail. You can verify with your ID card later from your account.</span></label>
               <label class="field">Full name<input class="input" name="name" autocomplete="name" required value="${esc(auth.name)}" placeholder="As on your ID card"></label>`)
          : `<label class="field">Full name<input class="input" name="name" autocomplete="name" required value="${esc(auth.name)}" placeholder="Your name"></label>
             <label class="field">${auth.role === "faculty" ? "University email" : "Personal email"}<span class="searchbar">${icon("mail")}<input class="input" name="email" type="email" autocomplete="email" required value="${esc(auth.email)}" placeholder="${auth.role === "faculty" ? "yourname@ewubd.edu" : "you@gmail.com"}"></span><span class="hint">${auth.role === "faculty" ? "Teachers must use their EWU university email (@ewubd.edu). We send a code to it." : "The email you use now (Gmail is fine). We send a code to check it."}</span></label>`}
        ${pwField("password", "Create a password", "new-password")}${pwField("password2", "Confirm password", "new-password")}
        <p class="xs">At least 8 characters, with letters and numbers.</p>
        <div id="au-err"></div><button class="btn primary lg block" ${auth.role === "student" && viaCard && !auth.card ? "disabled" : ""}>${icon("mail")} Create account &amp; send code</button></form>`;
    } else if (auth.mode === "verify") body = `<div class="verify-ill">${icon("mail")}</div><h2 style="text-align:center">Check your email</h2><p class="muted small" style="text-align:center">We sent a 6-digit code to <b>${esc(auth.email)}</b>.${/@std\.ewubd\.edu$/.test(auth.email) ? " Open your EWU student mail" : " Open your inbox"}.</p><p class="xs mail-hint">It comes from <b>EWUdiots &lt;ewudiots@gmail.com&gt;</b> within a minute. Not there? Look in <b>Spam</b> or <b>Promotions</b>, or search your mail for “EWUdiots”. Still nothing after 2 minutes? Tap “Send a new code”.</p>
        <form id="au-code" class="stack mt" novalidate><label class="field">Code<input class="input otp" name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" required></label><div id="au-err"></div>
        <button class="btn primary lg block">${icon("check")} Verify &amp; continue</button><div class="row"><button type="button" class="btn ghost grow" id="au-resend">${icon("reset")} Send a new code</button><button type="button" class="btn ghost grow" data-am="signin">Back</button></div></form>`;
    else if (auth.mode === "forgot") body = `<h2 class="mt" style="text-align:center">Forgot your password?</h2><p class="muted small" style="text-align:center">Enter your student ID or email. We'll email you a 6-digit code to set a new password.</p>
        <form id="au-fg" class="stack mt" novalidate><label class="field">Student ID or email<span class="searchbar">${icon("user")}<input class="input" name="who" autocomplete="username" required value="${esc(auth.email)}" placeholder="2024-1-60-123 or you@gmail.com"></span></label><div id="au-err"></div>
        <button class="btn primary lg block">${icon("mail")} Email me a code</button><button type="button" class="btn ghost block" data-am="signin">Back to sign in</button></form>`;
    else if (auth.mode === "reset") body = `<h2 class="mt" style="text-align:center">Set a new password</h2><p class="muted small" style="text-align:center">Enter the code we sent to <b>${esc(auth.email)}</b> and choose a new password.</p>
        <form id="au-rs" class="stack mt" novalidate><label class="field">Code<input class="input otp" name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" required></label>
        ${pwField("password", "New password", "new-password")}${pwField("password2", "Confirm new password", "new-password")}<div id="au-err"></div>
        <button class="btn primary lg block">${icon("check")} Save password &amp; sign in</button><button type="button" class="btn ghost block" data-am="forgot">Send a new code</button></form>`;
    return obShell(`${brand}${tabs}${body}<p class="xs mt" style="text-align:center">One account for the phone app, web, Windows, Mac and the Chrome extension.</p>`,
      { back, foot: from === "profile" ? "" : `<button class="btn ghost block" id="lg-skip">Continue without an account</button>` });
  };
  pages.login.mount = (el) => {
    const from = ctx.qparam("from");
    // Only a finished profile skips Setup: the router sends anyone not onboarded back to Welcome (the old sign-up loop).
    const next = () => ctx.go(from === "profile" ? "#/profile" : S().onboarded ? "#/home" : "#/setup");
    const on = (sel, ev, fn) => { const x = $(sel, el); x && x.addEventListener(ev, fn); };
    const fail = (msg) => { const e = $("#au-err", el); if (e) e.innerHTML = authErr(msg); else toast(msg, "error"); };
    const mode = (m) => { if (m === "code") auth.codeSent = false; auth.mode = m; ctx.rerender(); };
    // Already signed in (e.g. came back here through Welcome): don't ask again, carry on to Setup or Home.
    if (ctx.C.user && ctx.cloud.enabled && !auth.finishing) { setTimeout(next, 0); return; }
    on("#lg-skip", "click", () => ctx.go(from === "profile" ? "#/profile" : "#/role"));
    $$("[data-am]", el).forEach((b) => b.addEventListener("click", () => mode(b.dataset.am)));
    $$("[data-ar]", el).forEach((b) => b.addEventListener("click", () => { auth.role = b.dataset.ar; ctx.rerender(); }));
    $$("[data-eye]", el).forEach((b) => b.addEventListener("click", () => { const i = b.previousElementSibling; i.type = i.type === "password" ? "text" : "password"; b.setAttribute("aria-label", i.type === "password" ? "Show password" : "Hide password"); }));
    // After any successful sign-in: wait for the cloud restore, apply the role, keep a verified card.
    const done = async (msg) => {
      auth.finishing = true; // the cloud restore redraws this page meanwhile; don't redirect from under us
      try { await finish(msg); } finally { auth.finishing = false; }
    };
    const finish = async (msg) => {
      for (let i = 0; i < 30 && !ctx.C.user; i++) await new Promise((r) => setTimeout(r, 100));
      await ctx.afterSignIn();
      const role = ctx.cloud.roleOf(ctx.C.user) || auth.pendingRole;
      if (["student", "alumni", "faculty"].includes(role)) S().role = role;
      // A profile restored from the account means this person finished setup on another device.
      if (S().profile && !S().demo && ctx.C.user && !auth.pendingRole) S().onboarded = true;
      // Signed up by scanning both sides: the card is saved to the account and the server marks it verified.
      if (auth.card?.back && ctx.C.user?.email?.startsWith(auth.card.id + "@")) await ctx.idcard.verifyWithCard(auth.card);
      if (!S().profile && auth.name) S().profile = { name: auth.name, creditsTotal: 140, semester: ctx.currentSemester() };
      ctx.save(); Object.assign(auth, { mode: "signin", card: null, pendingRole: "" });
      toast(msg, "success");
      // Android students with nothing synced yet go straight to "Sign in to the EWU portal".
      if (ctx.native.canPortalSync() && S().role === "student" && !S().routine.length) { ctx.sync.openSync("portal"); return; }
      next();
    };
    on("#au-card", "click", async () => {
      const card = await ctx.idcard.scan({ title: "Your EWU ID card", cta: "Use this card" });
      if (card) { auth.card = card; auth.email = `${card.id}@std.ewubd.edu`; auth.name = card.name; ctx.rerender(); }
    });
    $$("[data-sm]", el).forEach((b) => b.addEventListener("click", () => { auth.sMethod = b.dataset.sm; ctx.rerender(); }));
    // Sign in by scanning the card: read the ID from the front, then a code goes to that student's EWU mail.
    const sendLogin = async (who, btn) => {
      busy(btn, true, "Sending…");
      try { auth.email = await ctx.cloud.sendLoginCode(who); auth.codeSent = true; auth.mode = "code"; ctx.rerender(); toast("Code sent", "success", auth.email); }
      catch (err) {
        busy(btn, false);
        if (/no account/i.test(err.message) && ctx.cloud.STUDENT_ID.test(String(who))) { Object.assign(auth, { mode: "signup", role: "student", sMethod: "email", sid: who }); ctx.rerender(); toast("No account for this ID yet", "info", "Create one: your ID is filled in."); }
        else fail(err.message);
      }
    };
    on("#au-scanin", "click", async (e) => {
      const btn = e.currentTarget, card = await ctx.idcard.scan({ title: "Sign in with your ID card", cta: "Send me a code", frontOnly: true });
      if (!card) return;
      auth.name = card.name || auth.name; await sendLogin(card.id, btn);
    });
    on("#au-cd1", "submit", (e) => {
      e.preventDefault(); const who = String(new FormData(e.target).get("who") || "").trim();
      if (!who) return fail("Enter your student ID or email.");
      sendLogin(who, e.target.querySelector("button.primary"));
    });
    on("#au-cd2", "submit", async (e) => {
      e.preventDefault(); const code = String(new FormData(e.target).get("code")).trim(), btn = e.target.querySelector("button.primary");
      if (!/^\d{6}$/.test(code)) return fail("Enter the 6-digit code from the email.");
      busy(btn, true, "Signing in…");
      try { await ctx.cloud.verifyLoginCode(auth.email, code); auth.codeSent = false; await done("Welcome back!"); }
      catch (err) { busy(btn, false); fail(err.message); }
    });
    let cdCool = 0;
    on("#au-cdre", "click", async (e) => {
      if (Date.now() < cdCool) return toast("Please wait a minute before asking again", "warn");
      const b = e.currentTarget; busy(b, true, "Sending…");
      try { await ctx.cloud.sendLoginCode(auth.email); cdCool = Date.now() + 60e3; toast("New code sent", "success", auth.email); } catch (err) { fail(err.message); }
      busy(b, false);
    });
    on("#au-cdback", "click", () => { auth.codeSent = false; ctx.rerender(); });
    on("#au-in", "submit", async (e) => {
      e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)), btn = e.target.querySelector("button.primary");
      auth.email = String(f.who).trim();
      if (!auth.email || !f.password) return fail("Enter your student ID (or email) and password.");
      busy(btn, true, "Signing in…");
      try { await ctx.cloud.signInPassword(auth.email, f.password); await done("Welcome back!"); }
      catch (err) {
        busy(btn, false);
        if (/verify your email/i.test(err.message)) { auth.email = ctx.cloud.emailFor(auth.email); ctx.cloud.resendSignup(auth.email).catch(() => {}); mode("verify"); toast("Verify your email", "info", "We sent you a new code."); }
        else fail(`${err.message}${/wrong/i.test(err.message) ? " Forgot it? Tap Forgot password." : ""}`);
      }
    });
    on("#au-up", "submit", async (e) => {
      e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)), btn = e.target.querySelector("button.primary");
      const viaCard = auth.role === "student" && auth.sMethod === "card";
      if (auth.role === "student" && !viaCard) {
        auth.sid = String(f.sid || "").trim(); auth.name = String(f.name || "").trim();
        if (!ctx.cloud.EWU_EMAIL.test(ctx.cloud.emailFor(auth.sid))) return fail("Enter your student ID like 2024-1-60-123, or your EWU student email.");
        if (auth.name.length < 2) return fail("Please enter your name.");
        auth.card = null;
      }
      const email = auth.role === "student" ? (viaCard ? auth.card && `${auth.card.id}@std.ewubd.edu` : ctx.cloud.emailFor(auth.sid)) : String(f.email || "").trim().toLowerCase();
      if (viaCard && !auth.card) return fail("Scan both sides of your ID card first, or choose Student email.");
      if (auth.role !== "student") { auth.name = String(f.name || "").trim(); auth.email = email; if (auth.name.length < 2) return fail("Please enter your name."); if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail("Please enter a valid email."); if (/@std\.ewubd\.edu$/.test(email)) return fail("Students: choose Student above and use your student ID.");
        if (auth.role === "faculty" && !/^[^@\s]+@ewubd\.edu$/.test(email)) return fail("Teachers must use their EWU university email (name@ewubd.edu).");
        if (auth.role === "alumni" && /@ewubd\.edu$/.test(email)) return fail("Alumni: please use your personal email. EWU staff should choose Teacher."); }
      if (!pwOk(f.password)) return fail("Use at least 8 characters with letters and numbers.");
      if (f.password !== f.password2) return fail("The two passwords don't match.");
      busy(btn, true, "Creating…");
      try { auth.email = await ctx.cloud.signUp({ email, password: f.password, role: auth.role, name: viaCard ? auth.card.name : auth.name }); auth.pendingRole = auth.role; mode("verify"); toast("Code sent", "success", `Check ${auth.email}`); }
      catch (err) { busy(btn, false); if (err.exists) { auth.email = email; fail(err.message); } else fail(err.message); }
    });
    on("#au-code", "submit", async (e) => {
      e.preventDefault(); const code = String(new FormData(e.target).get("code")).trim(), btn = e.target.querySelector("button.primary");
      if (!/^\d{6}$/.test(code)) return fail("Enter the 6-digit code from the email.");
      busy(btn, true, "Verifying…");
      try { await ctx.cloud.verifySignup(auth.email, code); await done("Your account is ready"); }
      catch (err) { busy(btn, false); fail(err.message); }
    });
    let cool = 0;
    on("#au-resend", "click", async (e) => {
      if (Date.now() < cool) return toast("Please wait a minute before asking again", "warn");
      const b = e.currentTarget; busy(b, true, "Sending…");
      try { await ctx.cloud.resendSignup(auth.email); cool = Date.now() + 60e3; toast("New code sent", "success", auth.email); } catch (err) { fail(err.message); }
      busy(b, false);
    });
    on("#au-fg", "submit", async (e) => {
      e.preventDefault(); const who = String(new FormData(e.target).get("who")).trim(), btn = e.target.querySelector("button.primary");
      if (!who) return fail("Enter your student ID or email.");
      busy(btn, true, "Sending…");
      // Same answer whether or not the account exists, so this can't be used to discover who has one.
      try { auth.email = await ctx.cloud.forgotPassword(who); mode("reset"); toast("If that account exists, a code is on its way", "info", auth.email); }
      catch (err) { busy(btn, false); fail(err.message); }
    });
    on("#au-rs", "submit", async (e) => {
      e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)), btn = e.target.querySelector("button.primary");
      if (!/^\d{6}$/.test(String(f.code).trim())) return fail("Enter the 6-digit code from the email.");
      if (!pwOk(f.password)) return fail("Use at least 8 characters with letters and numbers.");
      if (f.password !== f.password2) return fail("The two passwords don't match.");
      busy(btn, true, "Saving…");
      try { await ctx.cloud.resetPassword(auth.email, f.code, f.password); await done("Password changed. You're signed in."); }
      catch (err) { busy(btn, false); fail(err.message); }
    });
  };

  let roleSel = null;
  pages.role = () => {
    // No account means no faculty mode: teachers prove it with their @ewubd.edu email.
    roleSel = roleSel && roleSel !== "faculty" ? roleSel : S().role === "alumni" ? "alumni" : "student";
    return obShell(`<h1 style="font-size:28px">Set up your profile</h1><p class="muted mt-s">Choose your role to get a personalized experience.</p>
      <div class="mt-l">${[["student", "user", "purple", "I'm a Student", "Routine, CGPA, advising, deadlines and study tools"], ["alumni", "cap", "red", "I'm an Alumni", "Stay connected: vault, reviews and campus tools"]]
        .map(([v, ic, tone, t, d]) => `<button class="role" data-role="${v}" aria-pressed="${roleSel === v}"><span class="itile ${tone}">${icon(ic)}</span><span class="grow"><b style="display:block">${t}</b><span class="xs">${d}</span></span><span class="ck">${roleSel === v ? icon("checkc") : ""}</span></button>`).join("")}
        ${ctx.cloud.enabled ? `<button class="role" id="role-fac"><span class="itile blue">${icon("briefcase")}</span><span class="grow"><b style="display:block">I'm a Faculty Member</b><span class="xs">Create an account with your EWU university email (@ewubd.edu)</span></span>${icon("chevR")}</button>` : ""}</div>`,
      { back: ctx.cloud.enabled ? "#/login" : "#/welcome?s=2", foot: `<button class="btn primary lg block" id="role-go">Continue</button>` });
  };
  pages.role.mount = (el) => {
    $$("[data-role]", el).forEach((b) => b.addEventListener("click", () => { roleSel = b.dataset.role; ctx.rerender(); }));
    $("#role-fac", el)?.addEventListener("click", () => { Object.assign(auth, { mode: "signup", role: "faculty" }); ctx.go("#/login?m=signup"); });
    $("#role-go", el).addEventListener("click", () => { S().role = roleSel; ctx.save({ silent: true }); ctx.go("#/setup"); });
  };

  pages.setup = () => {
    const p = S().profile || {}, role = S().role, stu = role === "student", acct = ctx.C.user;
    return obShell(`<div style="text-align:center"><span class="avatar lg" style="margin:0 auto">${esc(ctx.initials(p.name || "?"))}</span><h1 style="font-size:26px;margin-top:12px">Complete Your Profile</h1><p class="muted small mt-s">This helps us personalize your experience.</p>${stu ? `<button type="button" class="btn outline sm mt" id="su-card">${icon("scan")} ${S().idcard ? "Rescan my ID card" : "Fill from my ID card"}</button>` : ""}</div>
      <form id="su-form" class="stack mt" novalidate>
        <label class="field">Full Name<input class="input" name="name" autocomplete="name" value="${esc(p.name || "")}" required placeholder="Your full name"><span class="err" data-err="name" hidden></span></label>
        ${stu ? `<label class="field">Student ID<input class="input" name="id" inputmode="numeric" value="${esc(p.id || "")}" placeholder="2024-1-60-123"><span class="hint">Optional. Found on your ID card and portal.</span><span class="err" data-err="id" hidden></span></label>` : ""}
        ${role === "faculty" && acct ? `<label class="field">University email<input class="input" value="${esc(acct.email)}" readonly><span class="hint">Verified EWU faculty email</span></label>` : ""}
        ${role === "faculty" ? `<label class="field">Faculty Initials<input class="input" name="init" value="${esc(p.init || "")}" placeholder="e.g. ABC" maxlength="8"></label>` : ""}
        <label class="field">Department<input class="input" name="department" list="dept-list" value="${esc(p.department || "")}" placeholder="e.g. CSE"><datalist id="dept-list">${["CSE", "EEE", "ECE", "BBA", "Economics", "English", "Law", "Pharmacy", "Civil Engineering", "GEB", "Mathematics", "Sociology", "Information Studies"].map((d) => `<option value="${d}">`).join("")}</datalist></label>
        ${stu ? `<label class="field">Year<select class="select" name="year">${["1st Year", "2nd Year", "3rd Year", "4th Year", "Graduate"].map((y) => `<option ${p.year === y ? "selected" : ""}>${y}</option>`).join("")}</select></label>` : ""}
        ${role === "alumni" ? `<label class="field">Graduation year<input class="input" name="year" inputmode="numeric" value="${esc(p.year || "")}" placeholder="e.g. 2022"></label>` : ""}
      </form>`, { back: acct ? "" : "#/role", foot: `<button class="btn primary lg block" id="su-go" form="su-form">Continue</button>` });
  };
  pages.setup.mount = (el) => {
    $("#su-card", el)?.addEventListener("click", async () => {
      const card = await ctx.idcard.scan({ cta: "Use these details" });
      if (!card) return;
      await ctx.idcard.commit(card);
      const f = $("#su-form", el); f.name.value = f.name.value || card.name; f.id.value = card.id; if (card.dept) f.department.value = card.dept;
      toast("Filled from your ID card", "success", "Your 3D pass is ready in More → My ID Card.");
    });
    $("#su-form", el).addEventListener("submit", (e) => {
      e.preventDefault(); const f = Object.fromEntries(new FormData(e.target));
      const err = (k, msg) => { const i = e.target.elements[k], s = $(`[data-err="${k}"]`, el); i.setAttribute("aria-invalid", "true"); s.hidden = false; s.textContent = msg; i.focus(); };
      $$(".err", el).forEach((s) => { s.hidden = true; }); $$("[aria-invalid]", el).forEach((i) => i.removeAttribute("aria-invalid"));
      if (!f.name || f.name.trim().length < 2) return err("name", "Please enter your name.");
      if (f.id && !/^\d{4}-\d-\d{2}-\d{3}$/.test(f.id.trim())) return err("id", "Use the EWU format, e.g. 2024-1-60-123.");
      const St = S();
      St.profile = Object.assign({ creditsTotal: 140, semester: ctx.currentSemester() }, St.profile || {}, Object.fromEntries(Object.entries(f).map(([k, v]) => [k, String(v).trim()])));
      St.onboarded = true; ctx.save();
      toast(`Welcome, ${ctx.firstName()}!`, "success", St.role === "student" ? "Now let's bring in your portal data." : "Your campus tools are ready.");
      ctx.go(St.role === "student" ? "#/sync" : "#/home");
    });
  };
}
