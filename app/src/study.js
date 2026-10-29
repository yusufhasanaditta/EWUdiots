/* Study mode: focus timer + analytics, flashcards (spaced repetition), exam revision planner,
   my courses + course hub, XP / levels / badges and the shareable semester card.
   Everything is local-first and lives in S.study. */
import { confetti, chime, ambient, ambientOn } from "./art.js";
import { degreeStatus, roadmap, nextSem, latestGrades } from "./degreeplan.js";

export const studyDefaults = () => ({
  sessions: [], days: {}, goal: 120, xp: 0, ev: {}, cards: [], prep: {}, notes: {}, links: {},
  preset: "25", ambient: "off", perDay: 2, sessLen: 50, reviews: 0, seenBadges: [], timer: null
});

export const dkey = (d = new Date()) => { const x = new Date(d); x.setMinutes(x.getMinutes() - x.getTimezoneOffset()); return x.toISOString().slice(0, 10); };
const addDays = (k, n) => { const d = new Date(k + "T12:00:00"); d.setDate(d.getDate() + n); return dkey(d); };
const breakFor = (p) => ({ 15: 3, 25: 5, 50: 10, 90: 15 }[p] || Math.max(5, Math.round(Number(p) / 5)));
export const LEVELS = ["Certified EWUdiot", "Note Taker", "Quiz Survivor", "Lab Rat", "Midterm Warrior", "Consistent Learner", "Assignment Ninja", "Dean's List Dreamer", "CGPA Wizard", "Graduation Legend"];
const xpFor = (n) => 50 * n * (n - 1); // xp needed to reach level n

const TIPS = [
  ["Active recall beats re-reading", "Close the slides and write what you remember. Then check."],
  ["Space it out", "Three 30-minute sessions on different days stick far better than one cram."],
  ["Start with the ugly one", "Do the task you're avoiding first. Momentum carries the rest of the day."],
  ["Past papers are gold", "Exam patterns repeat more than you think. Check the Study Vault."],
  ["Protect your gaps", "A 90-minute gap between classes is a full Pomodoro plus a break."],
  ["Phone in another room", "Even a face-down phone on the desk drains focus."]
];

export function install(ctx) {
  const { pages, icon, esc, uid, $, $$, toast, openModal, closeModal, modalHead, confirmModal } = ctx;
  const S = () => ctx.S;
  // Same object every call (S itself may be replaced on restore/clear, so look it up each time).
  const st = () => { const s = ctx.S; if (!s.study || !Array.isArray(s.study.cards) || !s.study.days) s.study = Object.assign(studyDefaults(), s.study || {}); return s.study; };
  const myCourses = () => {
    const map = new Map();
    S().routine.forEach((r) => { if (!map.has(r.code) || !r.lab) map.set(r.code, { code: r.code, title: r.title || map.get(r.code)?.title || "", sec: r.sec, faculty: r.faculty, room: r.room }); });
    st().cards.forEach((c) => !map.has(c.course) && map.set(c.course, { code: c.course, title: "" }));
    return [...map.values()];
  };

  /* ───────── XP, levels, streak, badges ───────── */
  const levelOf = (xp) => { let n = 1; while (xp >= xpFor(n + 1)) n++; return n; };
  function levelInfo() {
    const xp = st().xp, n = levelOf(xp), lo = xpFor(n), hi = xpFor(n + 1);
    return { n, xp, lo, hi, name: LEVELS[Math.min(n, LEVELS.length) - 1] + (n > LEVELS.length ? ` +${n - LEVELS.length}` : ""), pct: Math.round((100 * (xp - lo)) / (hi - lo)), toNext: hi - xp };
  }
  const dayOf = (k) => st().days[k] || { m: 0, c: 0 };
  const active = (k) => dayOf(k).m >= 10 || dayOf(k).c >= 10;
  function streak() {
    let k = dkey(), n = 0;
    if (!active(k)) k = addDays(k, -1);
    while (active(k)) { n++; k = addDays(k, -1); }
    return n;
  }
  const bump = (field, n) => { const k = dkey(), d = st().days; d[k] = Object.assign({ m: 0, c: 0 }, d[k]); d[k][field] += n; };
  function stats() {
    const s = st(), S0 = S();
    const hrs = s.sessions.map((x) => new Date(x.at).getHours());
    const att = Object.values(S0.attendance || {});
    return {
      totalMin: s.sessions.reduce((a, x) => a + x.min, 0), sessions: s.sessions.length, maxSession: Math.max(0, ...s.sessions.map((x) => x.min)),
      streak: streak(), night: hrs.some((h) => h >= 23 || h < 4), early: hrs.some((h) => h >= 5 && h < 8), reviews: s.reviews, cards: s.cards.length,
      synced: !!S0.lastImport, tasksDone: S0.tasks.filter((t) => t.done).length, planner: !!s.ev.planner,
      front: att.some((a) => a.held >= 10 && (a.held - a.missed) / a.held >= 0.95), prepDone: Object.values(s.prep).reduce((a, p) => a + Object.keys(p.done || {}).length, 0),
      cgpa: ctx.cgpaOf(S0.grades).cgpa || S0.profile?.cgpa || 0, notes: Object.values(s.notes).filter((n) => n && n.length > 40).length
    };
  }
  // [id, name, how, icon, hexagon colour, test]
  const BADGES = [
    ["first", "First Class", "Finish your first focus session", "clock", "linear-gradient(135deg,#c084fc,#7c3aed)", (x) => x.sessions >= 1],
    ["notes", "Note Maker", "Write notes for 3 courses", "notes", "linear-gradient(135deg,#fdba74,#ea580c)", (x) => x.notes >= 3],
    ["streak7", "Streak Master", "7-day study streak", "flame", "linear-gradient(135deg,#38bdf8,#1d4ed8)", (x) => x.streak >= 7],
    ["slayer", "Helpful Mate", "Complete 10 deadlines", "check", "linear-gradient(135deg,#1e3a8a,#0f766e)", (x) => x.tasksDone >= 10],
    ["early", "Early Bird", "Study before 8 AM", "sun", "linear-gradient(135deg,#fde047,#f59e0b)", (x) => x.early],
    ["club", "Top Contributor", "CGPA of 3.50 or higher", "trophy", "linear-gradient(135deg,#fbbf24,#c2410c)", (x) => x.cgpa >= 3.5],
    ["deep", "Deep Diver", "One focus session of 50+ minutes", "sparkle", "linear-gradient(135deg,#a78bfa,#4c1d95)", (x) => x.maxSession >= 50],
    ["ten", "10-Hour Club", "10 hours of total focus", "award", "linear-gradient(135deg,#f472b6,#be185d)", (x) => x.totalMin >= 600],
    ["streak3", "Warming Up", "3-day study streak", "flame", "linear-gradient(135deg,#fb923c,#dc2626)", (x) => x.streak >= 3],
    ["night", "Night Owl", "Study after 11 PM", "moon", "linear-gradient(135deg,#6366f1,#1e1b4b)", (x) => x.night],
    ["cards50", "Card Shark", "Review 50 flashcards", "cards", "linear-gradient(135deg,#34d399,#047857)", (x) => x.reviews >= 50],
    ["deck", "Memory Palace", "Create 30 flashcards", "brain", "linear-gradient(135deg,#22d3ee,#0e7490)", (x) => x.cards >= 30],
    ["sync", "Synced Up", "Import your portal data", "sync", "linear-gradient(135deg,#2dd4bf,#0f766e)", (x) => x.synced],
    ["plan", "Clash-Free", "Save a routine from the planner", "calcheck", "linear-gradient(135deg,#4ade80,#15803d)", (x) => x.planner],
    ["front", "Front Bencher", "95%+ attendance in a course", "user", "linear-gradient(135deg,#60a5fa,#1e40af)", (x) => x.front],
    ["prep", "Revision Machine", "Complete 10 exam-prep sessions", "target", "linear-gradient(135deg,#e879f9,#86198f)", (x) => x.prepDone >= 10]
  ];
  const unlocked = () => { const x = stats(); return BADGES.filter((b) => b[5](x)).map((b) => b[0]); };
  function checkBadges() {
    const s = st(), now = unlocked(), fresh = now.filter((id) => !s.seenBadges.includes(id));
    if (!fresh.length) return;
    s.seenBadges = [...new Set([...s.seenBadges, ...fresh])];
    if (S().demo) return;
    const b = BADGES.find((x) => x[0] === fresh[0]);
    ctx.logEvent("System", "award", "purple", `Badge unlocked: ${b[1]}`, b[2], "#/me");
    setTimeout(() => { confetti(70); toast(`Badge unlocked: ${b[1]}`, "success", b[2]); }, 400);
  }
  function award(n, why, quiet = false) {
    const s = st(), before = levelOf(s.xp);
    s.xp += Math.max(0, Math.round(n));
    const after = levelOf(s.xp);
    if (after > before) { confetti(); toast(`Level up! Level ${after}`, "success", LEVELS[Math.min(after, LEVELS.length) - 1]); }
    else if (!quiet && why) toast(`+${Math.round(n)} XP`, "success", why);
    checkBadges();
    ctx.save({ silent: false });
  }

  /* ───────── Focus timer ───────── */
  const newTimer = (kind = "focus", course) => {
    const p = Number(st().preset) || 25, mins = kind === "focus" ? p : breakFor(p);
    return { kind, dur: mins * 60, left: mins * 60, endAt: null, course: course ?? st().timer?.course ?? myCourses()[0]?.code ?? "" };
  };
  const timer = () => (st().timer = st().timer || newTimer());
  const remaining = () => { const t = timer(); return t.endAt ? Math.max(0, Math.ceil((t.endAt - Date.now()) / 1000)) : t.left; };
  const mmss = (sec) => `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`;
  let wake = null;
  const keepAwake = async (on) => { try { if (on && !wake && navigator.wakeLock) wake = await navigator.wakeLock.request("screen"); if (!on && wake) { await wake.release(); wake = null; } } catch { wake = null; } };
  function startTimer() { const t = timer(); if (!t.endAt) t.endAt = Date.now() + t.left * 1000; keepAwake(true); ctx.save(); }
  function pauseTimer() { const t = timer(); if (t.endAt) { t.left = remaining(); t.endAt = null; } keepAwake(false); ctx.save(); }
  function resetTimer(kind = "focus") { st().timer = newTimer(kind); keepAwake(false); ctx.save(); }
  function logSession(course, min, at = new Date()) {
    if (min < 1) return;
    st().sessions.push({ id: uid(), course: course || "General", min, at: at.toISOString() });
    if (st().sessions.length > 3000) st().sessions.splice(0, st().sessions.length - 3000);
    bump("m", min);
  }
  function complete({ skipped = false } = {}) {
    const t = timer();
    if (t.kind === "focus") {
      const min = Math.round((t.dur - (skipped ? remaining() : 0)) / 60);
      if (min >= (skipped ? 5 : 1)) { logSession(t.course, min); award(min, `${min} min focus${t.course ? " · " + t.course : ""}`, true); }
      if (!skipped) {
        chime(); confetti(50);
        toast("Focus session done!", "success", `${min} minutes logged. Take a ${breakFor(st().preset)}-minute break.`);
        notify("Focus session done", `${min} min${t.course ? " of " + t.course : ""}. Time for a short break.`);
      }
      st().timer = newTimer("break", t.course);
    } else {
      if (!skipped) { chime(); toast("Break's over", "info", "Ready for the next round?"); notify("Break's over", "Start your next focus session."); }
      st().timer = newTimer("focus", t.course);
    }
    keepAwake(false);
    ctx.save();
    if (ctx.route() === "focus") ctx.rerender();
  }
  function notify(title, body) {
    if (ctx.native.isNative || !("Notification" in window) || Notification.permission !== "granted" || document.visibilityState === "visible") return;
    try { new Notification(title, { body, icon: "/icons/icon-192.png" }); } catch { /* not allowed */ }
  }
  const RING = 2 * Math.PI * 96;
  function paintTimer() {
    const t = st().timer, pill = $("#focus-pill");
    const running = !!(t && t.endAt), sec = t ? remaining() : 0;
    if (pill) {
      pill.hidden = !running || ctx.route() === "focus";
      if (running) pill.innerHTML = `<span class="pulse-dot"></span>${t.kind === "focus" ? "Focus" : "Break"} <b class="num">${mmss(sec)}</b>`;
    }
    document.title = running ? `${mmss(sec)} · ${t.kind === "focus" ? "Focus" : "Break"} · EWUdiots` : "EWUdiots";
    const time = $("#fx-time");
    if (time && t) {
      time.textContent = mmss(sec);
      const ring = $("#fx-ring"); ring && ring.setAttribute("stroke-dashoffset", String(RING * (1 - (t.dur - sec) / t.dur)));
    }
  }
  setInterval(() => { const t = st().timer; if (t && t.endAt && Date.now() >= t.endAt) complete(); paintTimer(); }, 1000);
  // Session finished while the app was closed: count it.
  { const t = st().timer; if (t && t.endAt && Date.now() >= t.endAt) setTimeout(() => complete(), 600); }

  const minutesOn = (k) => dayOf(k).m;
  const focusToday = () => minutesOn(dkey());
  const fmtH = (m) => m >= 60 ? `${Math.floor(m / 60)}h ${m % 60 ? (m % 60) + "m" : ""}`.trim() : `${m}m`;
  const SOUNDS = [["off", "volx", "No Sound", "linear-gradient(135deg,#94a3b8,#64748b)"], ["rain", "rain", "Rain", "linear-gradient(135deg,#475569,#1e3a8a)"], ["library", "library", "Library", "linear-gradient(135deg,#a16207,#713f12)"],
    ["cafe", "coffee", "Cafe", "linear-gradient(135deg,#b45309,#7c2d12)"], ["brown", "wave", "Brown Noise", "linear-gradient(135deg,#7c3aed,#4c1d95)"]];
  let fTab = "timer", aRange = "today", aDay = dkey();

  pages.focus = () => {
    const tabs = ctx.seg([["timer", "Focus Timer"], ["goals", "Study Goals"], ["analysis", "Analysis"], ["sounds", "Sounds"]], fTab, "data-ft");
    const headHtml = ctx.head("Focus", "Study now. A better you, tomorrow.", "", ctx.art("mascot-thumbs", "Same campus,<br>Brighter you."));
    if (fTab === "analysis") return headHtml + tabs + `<div class="mt">${analysis()}</div>`;
    const s = st(), t = timer(), running = !!t.endAt, sec = remaining(), goal = s.goal, today = focusToday();
    const sounds = `<div class="sounds" role="group" aria-label="Ambient sound">${SOUNDS.map(([k, ic, l, bg]) => `<button data-amb="${k}" aria-pressed="${ambientOn() === k}" style="background:${bg}">${icon(ic)}${l}</button>`).join("")}</div>`;
    if (fTab === "sounds") return headHtml + tabs + `<section class="card mt"><h2>Ambient Sounds</h2><p class="small muted mt-s">Generated on your device, no internet needed. Plays while the timer runs.</p><div class="mt">${sounds}</div></section>`;
    if (fTab === "goals") return headHtml + tabs + `<div class="grid g2 mt"><section class="card stack"><h2>Daily goal</h2><div class="row nowrap" style="gap:18px"><div class="ring lg" style="--p:${Math.min(100, (100 * today) / goal)}"><div><b>${today}</b><span>of ${goal} min</span></div></div>
        <div class="stack" style="gap:6px"><span class="row small">${icon("flame")} <b>${streak()}-day streak</b></span><span class="small muted">${s.sessions.filter((x) => dkey(new Date(x.at)) === dkey()).length} sessions today</span><span class="small muted">Level ${levelInfo().n} · ${levelInfo().xp} XP</span></div></div>
        <label class="field">Daily goal<select class="select" id="fx-goal">${[30, 60, 90, 120, 180, 240].map((m) => `<option value="${m}" ${goal === m ? "selected" : ""}>${m} minutes</option>`).join("")}</select></label>
        <p class="xs">Study 10+ minutes (or review 10 cards) every day to keep your streak alive.</p></section>
      <section class="card"><h2>Tips</h2>${TIPS.map(([a, b]) => `<div class="lrow"><span class="itile sm yellow">${icon("bulb")}</span><div class="body"><b>${a}</b><span>${b}</span></div></div>`).join("")}</section></div>`;
    const courses = myCourses(), p = String(s.preset);
    const P = [["25", "Pomodoro", "25 min"], ["15", "Short", "15 min"], ["50", "Long", "50 min"]];
    const custom = !P.some((x) => x[0] === p);
    return headHtml + tabs + `<div class="split mt">
      <section class="card" aria-label="Focus timer">
        <div class="timer-ring"><svg viewBox="0 0 220 220" aria-hidden="true"><defs><linearGradient id="fx-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#a78bfa"/><stop offset="1" stop-color="#6d28d9"/></linearGradient></defs>
          <circle class="track" r="96" cx="110" cy="110"/><circle class="prog" id="fx-ring" r="96" cx="110" cy="110" stroke-dasharray="${RING}" stroke-dashoffset="${RING * (1 - (t.dur - sec) / t.dur)}"/></svg>
          <div class="center"><span class="itile purple">${icon(t.kind === "focus" ? "book" : "coffee")}</span><b id="fx-time" class="num" role="timer" aria-live="off">${mmss(sec)}</b><span>${t.kind === "focus" ? "Focus Session" : "Break"}${t.course ? ` · ${esc(t.course)}` : ""}</span></div></div>
        <div class="row center mt-s"><label class="sr-only" for="fx-course">Course</label><select class="select sm" id="fx-course" ${running ? "disabled" : ""}><option value="">General study</option>${courses.map((c) => `<option value="${esc(c.code)}" ${t.course === c.code ? "selected" : ""}>${esc(c.code)}${c.title ? " · " + esc(c.title) : ""}</option>`).join("")}</select>
          <button class="btn sm icon-only neutral" id="fx-reset" aria-label="Reset timer">${icon("reset")}</button><button class="btn sm icon-only neutral" id="fx-skip" aria-label="Skip to ${t.kind === "focus" ? "break" : "focus"}">${icon("skip")}</button></div>
        <div class="row nowrap mt"><button class="btn primary lg grow" id="fx-go">${icon(running ? "pause" : "play")} ${running ? "Pause" : sec < t.dur ? "Resume" : t.kind === "focus" ? "Start Focus" : "Start Break"}</button><button class="icon-btn" id="fx-set" aria-label="Timer settings" style="width:54px;height:54px">${icon("settings")}</button></div>
        <div class="presets mt">${P.map(([v, l, d]) => `<button data-preset="${v}" aria-pressed="${p === v}" ${running ? "disabled" : ""}><b>${l}</b>${d}</button>`).join("")}<button data-preset="custom" aria-pressed="${custom}" ${running ? "disabled" : ""}><b>Custom</b>${custom ? `${p} min` : "•••"}</button></div>
      </section>
      <div class="stack" style="gap:16px">
        <section class="card"><div class="card-h"><h2>Ambient Sounds</h2><button class="see" style="background:none;border:0;cursor:pointer" data-ftab="sounds">See All</button></div>${sounds}</section>
        <section class="card row nowrap"><span class="itile red">${icon("target")}</span><div class="grow"><b>Today's Goal</b><p class="small muted">${today} / ${goal} minutes</p>${ctx.bar((100 * today) / goal)}</div><b class="num">${Math.min(100, Math.round((100 * today) / goal))}%</b></section>
        <section class="card row nowrap"><span class="itile orange">${icon("flame")}</span><div class="grow"><b>${streak()} day streak</b><p class="small muted">Sessions keep running when you switch pages.</p></div><button class="btn sm" data-ftab="analysis">Analytics</button></section>
      </div></div>`;
  };
  function analysis() {
    const s = st(), today = dkey();
    const monday = addDays(today, -((new Date(today + "T12:00:00").getDay() + 6) % 7));
    const week = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
    const days = aRange === "today" ? [aDay] : aRange === "week" ? week : Array.from({ length: 30 }, (_, i) => addDays(today, i - 29));
    const inRange = s.sessions.filter((x) => days.includes(dkey(new Date(x.at))));
    const mins = inRange.reduce((a, x) => a + x.min, 0);
    const prevDays = days.map((k) => addDays(k, -days.length)), prevMin = s.sessions.filter((x) => prevDays.includes(dkey(new Date(x.at)))).reduce((a, x) => a + x.min, 0);
    const delta = prevMin ? Math.round((100 * (mins - prevMin)) / prevMin) : null;
    const by = {}; inRange.forEach((x) => { by[x.course] = (by[x.course] || 0) + x.min; });
    const list = Object.entries(by).sort((a, b) => b[1] - a[1]), top = list.slice(0, 3), other = list.slice(3).reduce((a, x) => a + x[1], 0);
    const parts = top.concat(other ? [["Others", other]] : []), COL = ["#7c3aed", "#22c55e", "#3b82f6", "#94a3b8"];
    let acc = 0; const R = 52, Cc = 2 * Math.PI * R;
    const donut = `<svg viewBox="0 0 140 140" width="140" height="140" role="img" aria-label="Focus by subject">${mins ? parts.map(([, m], i) => { const len = (m / mins) * Cc, el = `<circle r="${R}" cx="70" cy="70" fill="none" stroke="${COL[i]}" stroke-width="16" stroke-dasharray="${len} ${Cc - len}" stroke-dashoffset="${-acc}" transform="rotate(-90 70 70)"/>`; acc += len; return el; }).join("") : `<circle r="${R}" cx="70" cy="70" fill="none" stroke="var(--surface-3)" stroke-width="16"/>`}
      <text x="70" y="68" text-anchor="middle" style="font-size:18px;font-weight:800;fill:var(--text)">${fmtH(mins)}</text><text x="70" y="86" text-anchor="middle" style="font-size:11px;fill:var(--text-3)">Total</text></svg>`;
    const heat = Array.from({ length: 35 }, (_, i) => addDays(monday, i - 28)), lvl = (m) => (m === 0 ? 0 : m < 30 ? 1 : m < 60 ? 2 : m < 120 ? 3 : 4);
    return `${ctx.seg([["today", "Today"], ["week", "This Week"], ["month", "This Month"]], aRange, "data-ar", "fill")}
      ${aRange === "today" ? `<div class="day-chips mt">${week.map((k) => `<button data-aday="${k}" aria-pressed="${k === aDay}">${new Date(k + "T12:00:00").toLocaleDateString("en-GB", { weekday: "short" })}<b style="display:block">${Number(k.slice(8))}</b></button>`).join("")}</div>` : ""}
      <div class="g2m mt"><section class="card"><div class="row nowrap"><span class="itile purple">${icon("clock")}</span><span>Focus Time</span></div><b style="font-size:30px;display:block;margin-top:6px" class="num">${fmtH(mins)}</b>${delta !== null ? `<span class="pill ${delta >= 0 ? "green" : "red"}">${delta >= 0 ? "↑" : "↓"} ${Math.abs(delta)}%</span> <span class="xs">vs ${aRange === "today" ? "yesterday" : "previous"}</span>` : ""}</section>
        <section class="card"><div class="row nowrap"><span class="itile red">${icon("target")}</span><span>Sessions</span></div><b style="font-size:30px;display:block;margin-top:6px" class="num">${inRange.length}</b><span class="xs">Goal ${Math.round(s.goal / 25)} per day</span></section></div>
      <div class="split mt"><section class="card"><h3>Productivity Heatmap</h3><div class="heat7 mt-s">${["M", "T", "W", "T", "F", "S", "S"].map((d) => `<span class="lbl">${d}</span>`).join("")}${heat.map((k) => `<span class="h${lvl(minutesOn(k))}" title="${k}: ${minutesOn(k)} min"></span>`).join("")}</div>
          <div class="heat-key">Less ${[0, 1, 2, 3, 4].map((i) => `<span class="h${i}" style="background:${["var(--surface-3)", "#ddd6fe", "#a78bfa", "#8b5cf6", "#6d28d9"][i]}"></span>`).join("")} More</div></section>
        <section class="card" style="text-align:center"><h3>Current Streak</h3><div style="color:var(--orange);margin:8px auto 0;width:48px">${icon("flame", "lg")}</div><b style="font-size:40px;display:block" class="num">${streak()}</b><span>Days</span><p class="small mt-s"><b>Keep it up!</b></p></section></div>
      <section class="card mt"><h3>Focus by Subject</h3><div class="row nowrap mt-s" style="gap:20px">${donut}<div class="donut-legend">${parts.length ? parts.map(([c, m], i) => `<div><i style="background:${COL[i]}"></i>${esc(c)}<b>${fmtH(m)}</b></div>`).join("") : '<p class="small muted">No sessions in this period yet.</p>'}</div></div></section>
      <div class="mascot-card mt"><img src="/img/mascot-thumbs.webp" alt="" width="110"><span class="scribble">“Consistency today<br>builds freedom tomorrow.”${ctx.swoosh}</span></div>`;
  }
  pages.focus.mount = (el) => {
    $$("[data-ft], [data-ftab]", el).forEach((b) => b.addEventListener("click", () => { fTab = b.dataset.ft || b.dataset.ftab; ctx.rerender(); }));
    $$("[data-ar]", el).forEach((b) => b.addEventListener("click", () => { aRange = b.dataset.ar; ctx.rerender(); }));
    $$("[data-aday]", el).forEach((b) => b.addEventListener("click", () => { aDay = b.dataset.aday; ctx.rerender(); }));
    $$("[data-amb]", el).forEach((b) => b.addEventListener("click", () => { ambient(b.dataset.amb); st().ambient = b.dataset.amb; ctx.save({ silent: true }); ctx.rerender(); }));
    const g = $("#fx-goal", el); g && g.addEventListener("change", () => { st().goal = Number(g.value); ctx.save(); ctx.rerender(); });
    if (!$("#fx-go", el)) return;
    const t = timer();
    $("#fx-go", el).addEventListener("click", () => { t.endAt ? pauseTimer() : startTimer(); ctx.rerender(); });
    $("#fx-reset", el).addEventListener("click", () => { resetTimer(t.kind); ctx.rerender(); });
    $("#fx-skip", el).addEventListener("click", () => complete({ skipped: true }));
    $("#fx-course", el).addEventListener("change", (e) => { t.course = e.target.value; ctx.save({ silent: true }); ctx.rerender(); });
    $$("[data-preset]", el).forEach((b) => b.addEventListener("click", () => {
      if (b.dataset.preset !== "custom") { st().preset = b.dataset.preset; resetTimer("focus"); ctx.rerender(); return; }
      openModal(modalHead("Custom session") + `<form id="cu-form" class="stack"><label class="field">Focus minutes<input class="input" name="m" type="number" min="5" max="180" value="${esc(st().preset)}" required></label><p class="xs">Breaks are one fifth of the session (at least 5 minutes).</p><button class="btn primary block">Set timer</button></form>`,
        (m) => $("#cu-form", m).addEventListener("submit", (e) => { e.preventDefault(); const n = Math.min(180, Math.max(5, Number(e.target.m.value) || 25)); st().preset = String(n); resetTimer("focus"); closeModal(); ctx.rerender(); }));
    }));
    $("#fx-set", el).addEventListener("click", () => openModal(modalHead("Timer settings") + `<div class="stack"><label class="field">Daily goal<select class="select" id="ts-goal">${[30, 60, 90, 120, 180, 240].map((m) => `<option value="${m}" ${st().goal === m ? "selected" : ""}>${m} minutes</option>`).join("")}</select></label>
      <div class="lrow"><span class="itile purple">${icon("bell")}</span><span class="body"><b>Notify when a session ends</b><span>Uses your reminder settings</span></span><label class="switch"><input type="checkbox" id="ts-n" ${S().settings.notify ? "checked" : ""}></label></div><button class="btn primary block" data-close>Done</button></div>`, (m) => {
      $("#ts-goal", m).addEventListener("change", (e) => { st().goal = Number(e.target.value); ctx.save(); ctx.rerender(); });
      $("#ts-n", m).addEventListener("change", async (e) => { if (e.target.checked) e.target.checked = await ctx.enableNotifications(); else { S().settings.notify = false; ctx.save(); } });
    }));
    paintTimer();
  };
  function focusOn(course) { if (!timer().endAt) st().timer = newTimer("focus", course || ""); fTab = "timer"; ctx.go("#/focus"); }

  /* ───────── Flashcards (SM-2 lite) ───────── */
  const today = () => dkey();
  const dueCards = (course) => st().cards.filter((c) => c.due <= today() && (!course || c.course === course));
  function schedule(c, q) { // q: 0 again, 1 hard, 2 good, 3 easy
    const ease = Math.max(1.3, (c.ease || 2.5) + [-0.2, -0.15, 0, 0.15][q]);
    let ivl;
    if (q === 0) ivl = 0;
    else if (q === 1) ivl = Math.max(1, Math.round((c.ivl || 1) * 1.2));
    else if (q === 2) ivl = !c.reps ? 1 : c.reps === 1 ? 3 : Math.round((c.ivl || 1) * ease);
    else ivl = !c.reps ? 3 : Math.round((c.ivl || 1) * ease * 1.3);
    return { ease, ivl, reps: q === 0 ? 0 : (c.reps || 0) + 1, due: addDays(today(), ivl) };
  }
  const ivlLabel = (n) => (n === 0 ? "now" : n < 30 ? `${n}d` : n < 365 ? `${Math.round(n / 30)}mo` : `${(n / 365).toFixed(1)}y`);
  let rv = null, cTab = "decks"; // rv: { course, queue, flipped, done, xp }
  pages.cards = () => {
    if (rv) return reviewView();
    const s = st(), decks = myCourses().filter((d) => s.cards.some((c) => c.course === d.code) || cTab === "decks"), due = dueCards().length;
    const mastered = s.cards.filter((c) => (c.ivl || 0) >= 21).length;
    const deckRow = (d) => { const all = s.cards.filter((c) => c.course === d.code), du = all.filter((c) => c.due <= today()).length, m = all.filter((c) => (c.ivl || 0) >= 7).length;
      return `<div class="deck"><span class="itile lg ${ctx.toneFor(d.code)}">${icon("cards")}</span><div class="body"><div class="row between nowrap"><b>${esc(d.code)}</b><span class="pill ${du ? "red" : "green"}">${du} due</span></div><div class="small">${esc(d.title || "")}</div><div class="row nowrap mt-s">${ctx.bar(all.length ? (100 * m) / all.length : 0)}<span class="xs">${m} / ${all.length} cards</span></div></div><button class="btn sm icon-only ghost" data-deck="${esc(d.code)}" aria-label="Open ${esc(d.code)} deck">${icon("chevR")}</button></div>`; };
    const missing = myCourses().filter((d) => !s.cards.some((c) => c.course === d.code));
    let body;
    if (cTab === "decks") body = `${decks.length ? decks.map(deckRow).join("") : `<div class="card">${ctx.empty("icon:cards", "No decks yet", "Sync your routine to get a deck per course, or add cards with any course code.")}</div>`}
      <button class="btn primary lg block mt" id="fc-add">${icon("plus")} Create New Deck</button>
      ${missing.length ? `<div class="section-h"><h2>Recommended for You</h2></div><div class="reco">${missing.map((d) => `<div class="rc" style="--cc:${ctx.colorFor(d.code)}"><b>${esc(d.code)}</b><span class="small">${esc(d.title || "Start a deck")}</span><span class="xs" style="margin-top:auto">0 cards</span><button class="add" data-addto="${esc(d.code)}" aria-label="Create ${esc(d.code)} deck">${icon("plus", "sm")}</button></div>`).join("")}</div>` : ""}`;
    else if (cTab === "due") body = due ? `${[...new Set(dueCards().map((c) => c.course))].map((code) => `<div class="deck"><span class="itile ${ctx.toneFor(code)}">${icon("cards")}</span><div class="body"><b>${esc(code)}</b><div class="small muted">${dueCards(code).length} cards due</div></div><button class="btn sm primary" data-study="${esc(code)}">${icon("play")} Review</button></div>`).join("")}<button class="btn primary lg block mt" id="fc-all">${icon("play")} Start Review (${due})</button>`
      : `<div class="card">${ctx.empty("mascot-reading", "All caught up!", "No cards due today. Come back tomorrow or add new cards.")}</div>`;
    else if (cTab === "explore") body = `<section class="card"><h3>How it works</h3><p class="small muted mt-s">Each card comes back right before you'd forget it: “Again” shows it in this session, “Good” in a few days, “Easy” even later. 10 reviews a day keeps your streak alive.</p></section>
      <section class="card mt"><h3>Bulk-add cards</h3><p class="small muted mt-s">Paste one card per line as <span class="kbd">question :: answer</span>. Great for turning lecture notes into a deck.</p><button class="btn outline mt" id="fc-bulk">${icon("paste")} Paste cards</button></section>
      ${missing.length ? `<div class="section-h"><h2>Start a deck for</h2></div><div class="reco">${missing.map((d) => `<div class="rc" style="--cc:${ctx.colorFor(d.code)}"><b>${esc(d.code)}</b><span class="small">${esc(d.title || "")}</span><button class="add" data-addto="${esc(d.code)}" aria-label="Create ${esc(d.code)} deck">${icon("plus", "sm")}</button></div>`).join("")}</div>` : ""}`;
    else body = `<div class="grid g2">${[["cards", "purple", s.cards.length, "Total cards"], ["check", "green", dayOf(today()).c, "Reviewed today"], ["award", "orange", mastered, "Mastered (3+ weeks)"], ["layers", "blue", s.reviews, "All-time reviews"]].map(([ic, tone, v, l]) => `<div class="card row nowrap"><span class="itile ${tone}">${icon(ic)}</span><div class="stat"><span class="v num">${v}</span><span class="l">${l}</span></div></div>`).join("")}</div>`;
    return `${ctx.head("Flashcards", "Revise smarter, remember longer.", `<button class="btn ghost sm" data-ctab="explore">How it works?</button>`)}
      <div class="seg" role="tablist">${[["decks", "My Decks"], ["due", "Due Today"], ["explore", "Explore"], ["stats", "Stats"]].map(([v, l]) => `<button role="tab" data-ctab="${v}" aria-selected="${cTab === v}">${l}${v === "due" && due ? ` <span class="cnt">${due}</span>` : ""}</button>`).join("")}</div>
      <div class="mt">${body}</div>`;
  };
  function reviewView() {
    if (rv.finished) return `<div class="card mt">${ctx.empty("mascot-thumbs", "Session complete!", `${rv.done} card${rv.done === 1 ? "" : "s"} reviewed · +${rv.xp} XP. We'll bring each card back right before you'd forget it.`, `<button class="btn primary" id="fc-back">${icon("cards")} Back to decks</button>`)}</div>`;
    rv.queue = rv.queue.filter((id) => st().cards.some((x) => x.id === id)); // cards can vanish on a cloud restore
    if (!rv.queue.length) { rv.finished = true; return reviewView(); }
    const c = st().cards.find((x) => x.id === rv.queue[0]);
    const prev = [0, 1, 2, 3].map((q) => ivlLabel(schedule(c, q).ivl));
    return `${ctx.head(`Reviewing ${esc(rv.course || "all decks")}`, `${rv.done} done · ${rv.queue.length} left`, `<button class="btn neutral" id="fc-quit">${icon("x")} End</button>`)}
      ${ctx.bar((100 * rv.done) / Math.max(1, rv.done + rv.queue.length), "grad")}
      <div class="fc-stage mt"><button class="fc-card ${rv.flipped ? "flipped" : ""}" id="fc-card" aria-label="${rv.flipped ? "Answer shown" : "Show answer"}" style="--deck:${ctx.colorFor(c.course)}">
        <div class="fc-inner"><div class="fc-face front"><span class="pill">${esc(c.course)}</span><p>${esc(c.f).replace(/\n/g, "<br>")}</p><span class="xs">Tap or press Space to flip</span></div>
        <div class="fc-face back"><span class="pill purple">Answer</span><p>${esc(c.b).replace(/\n/g, "<br>")}</p></div></div></button></div>
      <div class="fc-actions" ${rv.flipped ? "" : "hidden"}>${[["Again", "red"], ["Hard", "amber"], ["Good", "blue"], ["Easy", "green"]].map(([l, cl], q) => `<button class="btn fc-rate ${cl}" data-q="${q}"><b>${l}</b><span class="xs">${prev[q]} · ${q + 1}</span></button>`).join("")}</div>`;
  }
  function rate(q) {
    const id = rv.queue.shift(), c = st().cards.find((x) => x.id === id);
    Object.assign(c, schedule(c, q));
    if (q === 0) rv.queue.push(id); else rv.done++;
    st().reviews++; bump("c", 1); rv.xp += 2; rv.flipped = false;
    if (!rv.queue.length) { rv.finished = true; confetti(60); award(rv.xp, "", true); }
    ctx.save({ silent: true }); ctx.rerender();
  }
  const startReview = (course) => {
    const q = dueCards(course).map((c) => c.id).sort(() => Math.random() - 0.5);
    if (!q.length) return toast("Nothing due here", "info", "Come back tomorrow!");
    rv = { course, queue: q, flipped: false, done: 0, xp: 0 }; ctx.go("#/cards");
  };
  pages.cards.mount = (el) => {
    if (rv && rv.finished) { $("#fc-back", el).addEventListener("click", () => { rv = null; ctx.rerender(); }); return; }
    if (rv) {
      const flip = () => { rv.flipped = !rv.flipped; $("#fc-card", el).classList.toggle("flipped", rv.flipped); $(".fc-actions", el).hidden = !rv.flipped; };
      $("#fc-card", el).addEventListener("click", flip);
      $$("[data-q]", el).forEach((b) => b.addEventListener("click", () => rate(Number(b.dataset.q))));
      $("#fc-quit", el).addEventListener("click", () => { const xp = rv.xp; rv = null; if (xp) award(xp, `${xp / 2} cards reviewed`); ctx.rerender(); });
      return;
    }
    const on = (s, fn) => $$(s, el).forEach((b) => b.addEventListener("click", fn));
    on("[data-ctab]", (e) => { cTab = e.currentTarget.dataset.ctab; ctx.rerender(); });
    on("#fc-add", () => addCards()); on("#fc-bulk", () => addCards("", "bulk")); on("#fc-all", () => startReview(null));
    on("[data-study]", (e) => startReview(e.currentTarget.dataset.study));
    on("[data-addto]", (e) => addCards(e.currentTarget.dataset.addto));
    on("[data-deck]", (e) => deckSheet(e.currentTarget.dataset.deck));
    if (ctx.qparam("add")) { history.replaceState(null, "", "#/cards"); setTimeout(() => addCards()); }
  };
  document.addEventListener("keydown", (e) => {
    if (!rv || rv.finished || ctx.route() !== "cards" || ctx.modalOpen() || /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)) return;
    if (e.key === " " || e.key === "Enter") { e.preventDefault(); $("#fc-card")?.click(); }
    else if (rv.flipped && ["1", "2", "3", "4"].includes(e.key)) rate(Number(e.key) - 1);
  });
  function deckSheet(code) {
    const n = st().cards.filter((c) => c.course === code).length, du = dueCards(code).length;
    openModal(modalHead(`${code} deck`) + `<p class="small muted">${n} cards · ${du} due today</p><div class="stack mt" style="gap:0">
      <button class="lrow" id="dk-study" ${du ? "" : "disabled"}><span class="itile purple">${icon("play")}</span><span class="body"><b>Study now</b><span>${du ? `${du} cards due` : "Nothing due today"}</span></span></button>
      <button class="lrow" id="dk-add"><span class="itile green">${icon("plus")}</span><span class="body"><b>Add cards</b><span>One at a time or many at once</span></span></button>
      <button class="lrow" id="dk-man"><span class="itile blue">${icon("list")}</span><span class="body"><b>Manage cards</b><span>See and delete cards</span></span></button></div>`, (m) => {
      $("#dk-study", m).addEventListener("click", () => { closeModal(); startReview(code); });
      $("#dk-add", m).addEventListener("click", () => { closeModal(); addCards(code); });
      $("#dk-man", m).addEventListener("click", () => { closeModal(); manageDeck(code); });
    });
  }
  const parseBulk = (txt) => txt.split(/\r?\n/).map((l) => l.split(/\s*::\s*|\t/)).filter((p) => p.length >= 2 && p[0].trim() && p[1].trim()).map(([f, ...b]) => ({ f: f.trim(), b: b.join(" ").trim() }));
  function addCards(course = "", startMode = "one") {
    const codes = myCourses().map((c) => c.code);
    openModal(modalHead("Add flashcards") + `<form id="fc-form" class="stack">
      <label class="field">Course<input class="input" name="course" list="fc-courses" required value="${esc(course || codes[0] || "")}" autocapitalize="characters"><datalist id="fc-courses">${codes.map((c) => `<option value="${esc(c)}">`).join("")}</datalist></label>
      <div class="seg fill" role="tablist"><button type="button" role="tab" data-mode="one" aria-selected="${startMode === "one"}">One card</button><button type="button" role="tab" data-mode="bulk" aria-selected="${startMode === "bulk"}">Many at once</button></div>
      <div data-pane="one" class="stack" ${startMode === "one" ? "" : "hidden"}><label class="field">Front (question)<textarea class="input" name="f" rows="2" maxlength="500"></textarea></label><label class="field">Back (answer)<textarea class="input" name="b" rows="3" maxlength="1000"></textarea></label></div>
      <div data-pane="bulk" class="stack" ${startMode === "bulk" ? "" : "hidden"}><label class="field">One card per line: question :: answer<textarea class="input" name="bulk" rows="7" placeholder="Binary search complexity :: O(log n)&#10;Stack order :: LIFO (last in, first out)"></textarea></label><p class="xs" id="fc-count">0 cards</p></div>
      <div class="row"><button type="button" class="btn neutral grow" data-close>Done</button><button class="btn primary grow">${icon("plus")} Add</button></div></form>`, (m) => {
      let mode = startMode;
      $$("[data-mode]", m).forEach((b) => b.addEventListener("click", () => { mode = b.dataset.mode; $$("[data-mode]", m).forEach((x) => x.setAttribute("aria-selected", x === b)); $$("[data-pane]", m).forEach((p) => { p.hidden = p.dataset.pane !== mode; }); }));
      const bulk = m.querySelector('[name="bulk"]');
      bulk.addEventListener("input", () => { $("#fc-count", m).textContent = `${parseBulk(bulk.value).length} cards`; });
      $("#fc-form", m).addEventListener("submit", (e) => {
        e.preventDefault(); const fd = new FormData(e.target);
        const code = String(fd.get("course")).toUpperCase().replace(/\s/g, "");
        const list = mode === "bulk" ? parseBulk(String(fd.get("bulk"))) : [{ f: String(fd.get("f")).trim(), b: String(fd.get("b")).trim() }].filter((x) => x.f && x.b);
        if (!list.length) return toast(mode === "bulk" ? "Write lines like: question :: answer" : "Write both sides of the card", "warn");
        list.forEach((x) => st().cards.push({ id: uid(), course: code, f: x.f.slice(0, 500), b: x.b.slice(0, 1000), due: today(), ivl: 0, ease: 2.5, reps: 0, created: Date.now() }));
        award(list.length, `${list.length} card${list.length > 1 ? "s" : ""} added`);
        if (mode === "bulk") closeModal(); else { e.target.f.value = ""; e.target.b.value = ""; e.target.f.focus(); }
        ctx.rerender();
      });
    });
  }
  function manageDeck(course) {
    const list = () => st().cards.filter((c) => c.course === course);
    const body = () => list().map((c) => `<div class="lrow"><div class="body"><b class="small">${esc(c.f)}</b><span>${esc(c.b)}</span></div><span class="pill">${c.due <= today() ? "due" : ivlLabel(Math.round((new Date(c.due) - new Date(today())) / 864e5))}</span><button class="btn sm icon-only ghost" data-cdel="${c.id}" aria-label="Delete card">${icon("trash")}</button></div>`).join("") || `<p class="small muted">No cards left.</p>`;
    openModal(modalHead(`${course} deck`) + `<div id="fc-list" style="max-height:60dvh;overflow:auto">${body()}</div>`, (m) => {
      m.addEventListener("click", (e) => { const b = e.target.closest("[data-cdel]"); if (!b) return; st().cards = st().cards.filter((c) => c.id !== b.dataset.cdel); ctx.save(); $("#fc-list", m).innerHTML = body(); ctx.rerender(); });
    });
  }

  /* ───────── Exam revision planner ───────── */
  const upcomingExams = () => S().tasks.filter((t) => t.type === "Exam" && !t.done && new Date(t.due) > Date.now()).sort((a, b) => new Date(a.due) - new Date(b.due));
  const prepOf = (id) => (st().prep[id] = st().prep[id] || { topics: [], done: {} });
  function candidateSlots(day, afterMin, len) {
    const busy = ctx.expand(S().routine).filter((b) => b.day === day).sort((a, b) => a.s - b.s);
    const out = [];
    for (let i = 1; i < busy.length; i++) if (busy[i].s - busy[i - 1].e >= len + 20) out.push(busy[i - 1].e + 10);
    const fixed = busy.length ? [19 * 60, 20 * 60 + 15, 21 * 60 + 30] : [10 * 60, 15 * 60, 19 * 60, 20 * 60 + 15];
    fixed.forEach((m) => { if (!busy.some((b) => m < b.e + 15 && b.s < m + len)) out.push(m); });
    return [...new Set(out)].filter((m) => m > afterMin + 10).sort((a, b) => a - b);
  }
  function buildPlan() {
    const exams = upcomingExams(); if (!exams.length) return [];
    const s = st(), len = s.sessLen, out = [], given = {};
    const examDay = (e) => dkey(new Date(e.due));
    const last = exams.map(examDay).sort().pop();
    const now = new Date(), nowM = now.getHours() * 60 + now.getMinutes();
    for (let k = today(), i = 0; k < last && i < 28; k = addDays(k, 1), i++) {
      const day = new Date(k + "T12:00:00").getDay();
      const hasClass = ctx.expand(S().routine).some((b) => b.day === day);
      const slots = candidateSlots(day, k === today() ? nowM : 0, len).slice(0, s.perDay + (hasClass ? 0 : 1));
      for (const start of slots) {
        const avail = exams.filter((e) => examDay(e) > k);
        if (!avail.length) break;
        const weight = (e) => { const t = prepOf(e.id).topics; return t.length ? t.reduce((a, x) => a + (4 - (x.conf || 1)), 0) / t.length : 2; };
        const daysLeft = (e) => Math.max(0.5, (new Date(examDay(e) + "T12:00:00") - new Date(k + "T12:00:00")) / 864e5);
        const pick = avail.slice().sort((a, b) => (weight(b) / daysLeft(b)) / (1 + (given[b.id] || 0) * 0.12) - (weight(a) / daysLeft(a)) / (1 + (given[a.id] || 0) * 0.12))[0];
        given[pick.id] = (given[pick.id] || 0) + 1;
        // Weighted rotation: weak topics come up ~3x as often as strong ones, but every topic gets time.
        const share = (t) => ((t._n || 0) + 1) / (4 - (t.conf || 1));
        const topics = prepOf(pick.id).topics.slice().sort((a, b) => share(a) - share(b) || (a.conf || 1) - (b.conf || 1));
        let topic;
        if (daysLeft(pick) <= 1) topic = "Full revision + past paper";
        else if (topics.length) { topic = topics[0].name; topics[0]._n = (topics[0]._n || 0) + 1; }
        else topic = `Revise ${pick.course || pick.title}`;
        out.push({ key: `${pick.id}|${k}|${start}`, date: k, start, end: start + len, exam: pick, course: pick.course || "", topic });
      }
    }
    exams.forEach((e) => prepOf(e.id).topics.forEach((t) => delete t._n));
    return out;
  }
  const CONF = [null, ["Weak", "red"], ["Okay", "amber"], ["Strong", "green"]];
  pages.exams = () => {
    const exams = upcomingExams(), s = st(), plan = buildPlan(), days = [...new Set(plan.map((p) => p.date))];
    return `${ctx.head("Exam Planner", "Add your topics. We spread revision across your free time before each exam.", `<button class="btn primary" id="ex-add">${icon("plus")} Add Exam</button>`)}
      ${!exams.length ? `<div class="card">${ctx.empty("mascot-reading", "No exams coming up", "Add a mid-term or final and we'll build a day-by-day revision plan around your classes.", `<button class="btn primary" id="ex-add2">${icon("plus")} Add an Exam</button>`)}</div>` : `
      <div class="grid g3">${exams.map((e) => {
        const p = prepOf(e.id), d = Math.ceil((new Date(e.due) - Date.now()) / 864e5);
        const mine = plan.filter((x) => x.exam.id === e.id), doneN = Object.keys(p.done).filter((k) => k.startsWith(e.id + "|")).length;
        const ready = p.topics.length ? Math.round((100 * p.topics.reduce((a, t) => a + (t.conf || 1) - 1, 0)) / (p.topics.length * 2)) : 0;
        return `<article class="ccard stack" style="--cc:${ctx.colorFor(e.course || e.title)};gap:10px">
          <div class="row between"><span class="pill">${esc(e.course || "Exam")}</span><span class="pill ${d <= 3 ? "red" : d <= 7 ? "amber" : "blue"}">${d} day${d === 1 ? "" : "s"} left</span></div>
          <h3>${esc(e.title)}</h3><p class="xs">${new Date(e.due).toLocaleString("en-GB", { weekday: "long", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</p>
          <div><div class="row between xs"><span>Confidence</span><b>${ready}%</b></div>${ctx.bar(ready)}</div>
          <div class="row" style="gap:6px">${p.topics.map((t) => `<button class="chip" data-topic="${e.id}|${t.id}" title="Tap to change confidence. Right-click to remove."><span class="pill ${CONF[t.conf || 1][1]}" style="padding:0 6px">${CONF[t.conf || 1][0]}</span>${esc(t.name)}</button>`).join("") || `<span class="xs">Add chapters or topics to plan smarter.</span>`}</div>
          <form class="row nowrap" data-tadd="${e.id}"><input class="input" name="t" placeholder="Add topic, e.g. Chapter 3" maxlength="60" aria-label="New topic for ${esc(e.title)}"><button class="btn icon-only" aria-label="Add topic">${icon("plus")}</button></form>
          <p class="xs">${mine.length} sessions planned · ${doneN} done</p></article>`; }).join("")}</div>
      <section class="card mt"><div class="card-h"><h2>Your Revision Plan</h2>
          <div class="row small"><label class="row">Per day <select class="select sm" id="ex-per">${[1, 2, 3, 4].map((n) => `<option ${s.perDay === n ? "selected" : ""}>${n}</option>`).join("")}</select></label>
          <label class="row">Length <select class="select sm" id="ex-len">${[25, 50, 90].map((n) => `<option value="${n}" ${s.sessLen === n ? "selected" : ""}>${n} min</option>`).join("")}</select></label></div></div>
        ${days.length ? days.map((k) => `<h3 class="mt" style="margin-bottom:6px">${k === today() ? "Today" : k === addDays(today(), 1) ? "Tomorrow" : new Date(k + "T12:00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short" })}</h3>
          ${plan.filter((p) => p.date === k).map((p) => { const done = !!prepOf(p.exam.id).done[p.key]; return `<div class="lrow"><input type="checkbox" class="check" data-pdone="${esc(p.key)}" ${done ? "checked" : ""} aria-label="Mark session done"><span class="pill num">${ctx.fmt12(p.start)}</span><span style="width:4px;height:30px;border-radius:3px;background:${ctx.colorFor(p.course || p.exam.title)}"></span><div class="body"><b style="${done ? "text-decoration:line-through;color:var(--text-3)" : ""}">${esc(p.topic)}</b><span>${esc(p.course)} · ${esc(p.exam.title)} · ${s.sessLen} min</span></div>${k === today() && !done ? `<button class="btn sm" data-pfocus="${esc(p.course)}">${icon("play")} Focus</button>` : ""}</div>`; }).join("")}`).join("") : `<p class="small muted">No free slots found before your exams. Try fewer sessions or a shorter length.</p>`}
        <p class="xs mt">Sessions avoid your class times. Weak topics and nearer exams get more time. The last day before each exam is for full revision.</p></section>`}`;
  };
  function addExam() {
    const codes = myCourses().map((c) => c.code);
    const d = new Date(Date.now() + 7 * 864e5); d.setHours(10, 0, 0, 0); d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    openModal(modalHead("Add exam") + `<form id="ex-form" class="grid g2">
      <label class="field">Course<input class="input" name="course" list="ex-courses" required value="${esc(codes[0] || "")}"><datalist id="ex-courses">${codes.map((c) => `<option value="${esc(c)}">`).join("")}</datalist></label>
      <label class="field">Exam<select class="select" name="title">${["Mid-term", "Final exam", "Quiz", "Lab final", "Viva"].map((x) => `<option>${x}</option>`).join("")}</select></label>
      <label class="field full-row">Date and time<input class="input" type="datetime-local" name="due" required value="${d.toISOString().slice(0, 16)}"></label>
      <label class="field full-row">Topics (optional, comma separated)<input class="input" name="topics" placeholder="Chapter 1, Chapter 2, Trees, Graphs"></label>
      <div class="row full-row"><button type="button" class="btn neutral grow" data-close>Cancel</button><button class="btn primary grow">Add exam</button></div></form>`, (m) => {
      $("#ex-form", m).addEventListener("submit", (e) => {
        e.preventDefault(); const f = Object.fromEntries(new FormData(e.target));
        const course = f.course.toUpperCase().replace(/\s/g, ""), id = uid();
        S().tasks.push({ id, title: `${f.title}`, course, type: "Exam", due: new Date(f.due).toISOString(), done: false });
        prepOf(id).topics = String(f.topics || "").split(",").map((x) => x.trim()).filter(Boolean).slice(0, 30).map((name) => ({ id: uid(), name: name.slice(0, 60), conf: 1 }));
        ctx.save(); closeModal(); ctx.rerender(); toast("Exam added", "success", "Your revision plan is ready.");
      });
    });
  }
  pages.exams.mount = (el) => {
    const on = (s, fn) => $$(s, el).forEach((b) => b.addEventListener("click", fn));
    on("#ex-add, #ex-add2", addExam);
    $$("[data-topic]", el).forEach((b) => b.addEventListener("click", () => { const [eid, tid] = b.dataset.topic.split("|"); const t = prepOf(eid).topics.find((x) => x.id === tid); t.conf = ((t.conf || 1) % 3) + 1; ctx.save(); ctx.rerender(); }));
    $$("[data-topic]", el).forEach((b) => b.addEventListener("contextmenu", (e) => { e.preventDefault(); const [eid, tid] = b.dataset.topic.split("|"); confirmModal("Remove topic?", "It will be removed from this exam's plan.", "Remove", () => { prepOf(eid).topics = prepOf(eid).topics.filter((x) => x.id !== tid); ctx.save(); ctx.rerender(); }, true); }));
    $$("[data-tadd]", el).forEach((f) => f.addEventListener("submit", (e) => { e.preventDefault(); const v = f.t.value.trim(); if (!v) return; prepOf(f.dataset.tadd).topics.push({ id: uid(), name: v.slice(0, 60), conf: 1 }); ctx.save(); ctx.rerender(); $(`[data-tadd="${f.dataset.tadd}"] input`)?.focus(); }));
    $$("[data-pdone]", el).forEach((c) => c.addEventListener("change", () => { const key = c.dataset.pdone, p = prepOf(key.split("|")[0]); if (c.checked) { p.done[key] = Date.now(); award(10, "revision session"); } else { delete p.done[key]; ctx.save(); } ctx.rerender(); }));
    on("[data-pfocus]", (e) => focusOn(e.currentTarget.dataset.pfocus));
    const per = $("#ex-per", el); per && per.addEventListener("change", () => { st().perDay = Number(per.value); ctx.save(); ctx.rerender(); });
    const len = $("#ex-len", el); len && len.addEventListener("change", () => { st().sessLen = Number(len.value); ctx.save(); ctx.rerender(); });
    if (ctx.qparam("add")) { history.replaceState(null, "", "#/exams"); setTimeout(addExam); }
  };

  /* ───────── My courses + course hub ───────── */
  const attOf = (code) => { const a = S().attendance[code]; return a && a.held ? Math.round((100 * (a.held - a.missed)) / a.held) : null; };
  let coTab = "ongoing";
  /* A course from an earlier semester: its latest grade and the section/faculty it ran with (portal history). */
  function pastCourse(code) {
    const g = latestGrades(S().grades)[code];
    const hist = Object.entries(S().history || {}).sort((a, b) => ctx.semesterKey(b[0]) - ctx.semesterKey(a[0])).find(([sem, rows]) => rows.some((r) => r.code === code) && (!g || !g.sem || sem === g.sem))
      || Object.entries(S().history || {}).find(([, rows]) => rows.some((r) => r.code === code));
    const row = hist?.[1].find((r) => r.code === code && !r.lab) || hist?.[1].find((r) => r.code === code);
    if (!g && !row) return null;
    const cur = (S().curriculum || []).find((c) => c.code === code);
    return { code, title: g?.title || row?.title || cur?.title || "", sec: row?.sec || "", faculty: row?.faculty || "", room: row?.room || "", sem: g?.sem || hist?.[0] || "", g: g?.g || "", cr: g?.cr ?? cur?.cr ?? "", past: true };
  }
  pages.courses = () => {
    const St = S(), cur = myCourses().filter((c) => St.routine.some((r) => r.code === c.code)), curCodes = cur.map((c) => c.code);
    const ds = degreeStatus(St.curriculum || [], St.grades, curCodes), g = ctx.cgpaOf(St.grades), total = Number(St.profile?.creditsTotal) || 140;
    const earned = Math.max(g.earned || 0, Number(St.profile?.creditsDone) || 0), pct = Math.min(100, Math.round((100 * earned) / total));
    const perSem = Number(St.settings.perSem) || 15;
    const plan = St.curriculum?.length ? roadmap(St.curriculum, St.grades, curCodes, nextSem(St.routineSem || ctx.currentSemester()), { perSem, planned: St.planner.courses || [] }) : [];
    const leftCr = St.curriculum?.length ? ds.credits.left : Math.max(0, total - earned - ds.credits.current);
    const gradSem = plan.length ? plan[plan.length - 1].sem : leftCr > 0 ? (() => { let s = St.routineSem || ctx.currentSemester(); for (let i = 0; i < Math.ceil(leftCr / perSem); i++) s = nextSem(s); return s; })() : St.routineSem;
    const card = (c) => { const att = attOf(c.code), ms = ctx.marksSummary ? ctx.marksSummary(c.code) : null;
      return `<a class="ccard" href="#/course?c=${encodeURIComponent(c.code)}" style="--cc:${ctx.colorFor(c.code)}"><span class="chev-abs">${icon("chevR")}</span><h3>${esc(c.code)}</h3><div class="t">${esc(c.title || "")}</div>
        <div class="meta"><span>${icon("room")} ${esc(c.room || "TBA")}</span>${c.faculty ? `<span>${icon("user")} ${esc(ctx.facName(c.faculty))}</span>` : ""}</div>
        <div class="bars"><div><span class="xs">Attendance</span><div class="row nowrap">${ctx.bar(att ?? 0, att !== null && att < 70 ? "red" : "green")}<b class="small num">${att !== null ? att + "%" : "—"}</b></div></div>
          <div><span class="xs">Current Marks</span><div class="row nowrap">${ctx.bar(ms && ms.of ? (100 * ms.got) / ms.of : 0)}<b class="small num">${ms && ms.of ? `${ms.got}/${ms.of}` : "—"}</b></div></div></div></a>`; };
    const doneCard = (r) => { const p = pastCourse(r.code); return `<a class="ccard done" href="#/course?c=${encodeURIComponent(r.code)}" style="--cc:${ctx.colorFor(r.code)}"><div class="row between nowrap"><h3>${esc(r.code)}</h3><span class="grade-chip g-${esc(r.g.replace("+", "p").replace("-", "m"))}">${esc(r.g)}</span></div><div class="t">${esc(r.title || p?.title || "")}</div><p class="xs mt-s">${r.cr} credits${p?.faculty ? ` · ${esc(ctx.facName(p.faculty))}` : ""}${p?.sec ? ` · Sec ${esc(p.sec)}` : ""}</p></a>`; };
    const leftCard = (c, needs) => `<div class="ccard left" style="--cc:${ctx.colorFor(c.code)}"><div class="row between nowrap"><h3>${esc(c.code)}</h3><span class="pill">${c.cr} cr</span></div><div class="t">${esc(c.title || "")}</div>${needs?.length ? `<p class="xs mt-s">${icon("lock", "sm")} Needs ${needs.map(esc).join(", ")}</p>` : `<p class="xs mt-s" style="color:var(--success-t)">${icon("checkc", "sm")} You can take it next</p>`}</div>`;
    let body = "";
    if (coTab === "ongoing") body = cur.length ? `<div class="grid g2 mt">${cur.map(card).join("")}</div>` : `<div class="card mt">${ctx.empty("icon:book", "No courses this semester", "Sync your class schedule to see your courses.", `<a class="btn primary" href="#/sync">Sync portal</a>`)}</div>`;
    else if (coTab === "completed") {
      const bySem = {}; ds.done.concat(Object.values(latestGrades(St.grades)).filter((x) => !ds.done.includes(x))).forEach((r) => (bySem[r.sem || "Earlier"] = bySem[r.sem || "Earlier"] || []).push(r));
      const sems = Object.keys(bySem).sort((a, b) => ctx.semesterKey(b) - ctx.semesterKey(a));
      body = sems.length ? sems.map((s) => { const t = ctx.cgpaOf(bySem[s]); return `<div class="sem-h mt"><h3>${esc(s)}</h3><span class="xs">${t.credits ? `Term GPA ${t.cgpa.toFixed(2)} · ` : ""}${bySem[s].reduce((a, r) => a + (Number(r.cr) || 0), 0)} credits</span></div><div class="grid g3 mt-s">${bySem[s].map(doneCard).join("")}</div>`; }).join("")
        : `<div class="card mt">${ctx.empty("icon:cap", "No completed courses yet", "Sync your grade report to see every course you've done.", `<a class="btn primary" href="#/sync">Sync portal</a>`)}</div>`;
    } else if (coTab === "left") {
      body = St.curriculum?.length ? `${ds.ready.length ? `<h3 class="mt">Ready to take <span class="xs">· ${ds.ready.length}</span></h3><div class="grid g3 mt-s">${ds.ready.map((c) => leftCard(c)).join("")}</div>` : ""}
        ${ds.locked.length ? `<h3 class="mt-l">After their prerequisites <span class="xs">· ${ds.locked.length}</span></h3><div class="grid g3 mt-s">${ds.locked.map((c) => leftCard(c, c.needs)).join("")}</div>` : ""}
        ${!ds.left.length ? `<div class="card mt">${ctx.empty("icon:trophy", "Every course done or in progress", "Only this semester stands between you and graduation.")}</div>` : ""}`
        : `${St.degree?.length ? `<section class="card mt"><div class="card-h"><h2>Credits still needed by area</h2></div>${St.degree.map((d) => `<div class="deg-row"><div class="row between"><b class="small">${esc(d.category)}</b><span class="xs num">${d.done} / ${d.total}</span></div>${ctx.bar(d.total ? (100 * d.done) / d.total : 100, d.done >= d.total ? "green" : "")}</div>`).join("")}</section>` : ""}
          <div class="alert purple mt">${icon("info")}<div><b>Sync your curriculum to list every course left</b><p>Sign in to the portal from the Sync page (Android app) and we read your program's curriculum and prerequisites.</p></div></div>`;
    } else {
      body = plan.length ? `<div class="row between mt wrap" style="gap:8px"><p class="small muted" style="margin:0">Every remaining course placed after its prerequisites. Your advising planner's picks come first.</p>
          <label class="row nowrap small" style="gap:6px">Credits a semester<select class="select sm" id="co-per">${[9, 12, 15, 18].map((v) => `<option ${v === perSem ? "selected" : ""}>${v}</option>`).join("")}</select></label></div>
        <ol class="road mt">${plan.map((p, i) => `<li class="road-step"><span class="road-dot">${i + 1}</span><div class="grow min0"><div class="row between nowrap"><b>${esc(p.sem)}</b><span class="xs num">${p.credits} credits</span></div><div class="road-courses">${p.courses.map((c) => `<span class="road-c" style="--cc:${ctx.colorFor(c.code)}" title="${esc(c.title)}"><b>${esc(c.code)}</b> ${esc(c.title)}</span>`).join("")}</div></div></li>`).join("")}
          <li class="road-step end"><span class="road-dot">${icon("cap", "sm")}</span><div><b>Graduation</b><p class="small muted">Around the end of ${esc(gradSem)} if you keep ${perSem} credits a semester and pass everything.</p></div></li></ol>`
        : `<div class="card mt">${ctx.empty("icon:map", "Your road map needs the curriculum", leftCr > 0 ? `About ${leftCr} credits left: at ${perSem} a semester you'd finish around ${gradSem}. Sync your curriculum for a course-by-course plan.` : "Sync your curriculum from the portal to plan every semester.", `<a class="btn primary" href="#/sync">Sync portal</a>`)}</div>`;
    }
    return `${ctx.demoBanner()}${ctx.head("My Courses", "Everything you've done, what's on now, and what's left until graduation.", `<span class="pill" style="padding:8px 12px">${esc(St.routineSem || ctx.currentSemester())}</span>`)}
      <section class="deg-hero fx-rise"><i class="sheen" aria-hidden="true"></i><div class="ring lg" style="--p:${pct}"><div><b>${pct}%</b><span>of degree</span></div></div>
        <div class="deg-stats">${[["Credits earned", `${earned} / ${total}`], ["Courses done", ds.done.length], ["This semester", cur.length], [St.curriculum?.length ? "Courses left" : "Credits left", St.curriculum?.length ? ds.left.length : leftCr], ["Graduation", gradSem || "—"]].map(([l, v]) => `<div><span>${l}</span><b class="num">${esc(String(v))}</b></div>`).join("")}</div></section>
      <div class="mt">${ctx.seg([["ongoing", "This semester"], ["completed", "Completed"], ["left", "Still to take"], ["roadmap", "Road map"]], coTab, "data-co")}</div>
      ${body}
      <div class="row mt"><a class="btn outline" href="#/marks">${icon("percent")} Marks &amp; Attendance Estimator</a><a class="btn outline" href="#/planner">${icon("calcheck")} Advising planner</a></div>`;
  };
  pages.courses.mount = (el) => {
    $$("[data-co]", el).forEach((b) => b.addEventListener("click", () => { coTab = b.dataset.co; ctx.rerender(); }));
    $("#co-per", el)?.addEventListener("change", (e) => { S().settings.perSem = Number(e.target.value); ctx.save(); ctx.rerender(); });
  };
  const safeUrl = (u) => (/^https?:\/\/[^\s"'<>]+$/i.test(u) ? u : "");
  let chTab = "overview";
  /* Overview of a course from an earlier semester: grade, credits, faculty and section, and that semester's attendance. */
  function pastOverview(c) {
    const f = ctx.facBy(c.faculty), gp = ctx.gradePoint ? ctx.gradePoint(c.g) : null, st = ctx.attendance.stats(c.code, c.sem), marked = st.present + st.absent > 0;
    return `<section class="card past-grade"><span class="grade-bubble">${esc(c.g || "—")}</span><div class="grow min0"><b>${c.g ? "Final grade" : "Taken"} · ${esc(c.sem || "")}</b><p class="small muted">${c.cr !== "" ? `${c.cr} credits` : ""}${gp != null && c.g ? ` · ${Number(gp).toFixed(2)} grade points` : ""}${["F", "W", "I"].includes(c.g) ? " · not passed: plan a retake" : ""}</p></div></section>
      <section class="card mt info-strip">${[["user", ctx.facName(c.faculty) || "—", "Faculty"], ["users", c.sec ? `Section ${c.sec}` : "—", "Section"], ["pin", c.room || "—", "Room"]].map(([ic, v, l]) => `<div><span class="itile sm purple">${icon(ic)}</span><div class="min0"><b class="ellipsis" style="display:block">${esc(v)}</b><span class="xs">${esc(l)}</span></div></div>`).join("")}</section>
      ${f ? `<a class="card mt row nowrap" href="#/prof?i=${encodeURIComponent(f.init)}"><span class="itile blue">${icon("user")}</span><div class="grow"><b>${esc(f.name || f.init)}</b><p class="xs">See their profile, reviews and shared materials</p></div>${icon("chevR")}</a>` : ""}
      ${marked ? `<a class="card mt row nowrap" href="#/course?c=${encodeURIComponent(c.code)}&tab=attendance"><div class="ring sm ${st.pct < 70 ? "red" : "green"}" style="--p:${st.pct ?? 0}"><div><b>${st.pct ?? "—"}%</b></div></div><div><b>Attendance that semester</b><p class="xs">${st.present} present · ${st.absent} absent</p></div></a>` : ""}`;
  }
  pages.course = () => {
    const code = (ctx.qparam("c") || "").toUpperCase();
    const S0 = S(), c = myCourses().find((x) => x.code === code) || pastCourse(code);
    if (!code || !c) return `${ctx.subHead("Course", "", "#/courses")}<div class="card">${ctx.empty("mascot-confused", "Course not found", "That course isn't in your routine.", `<a class="btn primary" href="#/courses">All Courses</a>`)}</div>`;
    const qt = ctx.qparam("tab"); if (qt) { chTab = qt; history.replaceState(null, "", `#/course?c=${encodeURIComponent(code)}`); }
    const blocks = ctx.expand(S0.routine.filter((r) => r.code === code)).sort((a, b) => ((a.day + 6) % 7) - ((b.day + 6) % 7) || a.s - b.s);
    const theory = blocks.find((b) => !b.lab) || blocks[0];
    const f = ctx.facBy(c.faculty), a = S0.attendance[code] || { held: 0, missed: 0 }, att = attOf(code);
    const ms = ctx.marksSummary ? ctx.marksSummary(code) : null, m = S0.marks[code];
    const tasks = S0.tasks.filter((t) => !t.done && t.course === code).sort((p, q) => new Date(p.due) - new Date(q.due));
    const links = st().links[code] || [], cardsN = st().cards.filter((x) => x.course === code).length, due = dueCards(code).length;
    const nowD = new Date(), nm = nowD.getHours() * 60 + nowD.getMinutes();
    let nxt = null; for (let k = 0; k < 8 && !nxt; k++) { const d = (nowD.getDay() + k) % 7; const b = blocks.filter((x) => x.day === d && !(k === 0 && x.e <= nm)).sort((x, y) => x.s - y.s)[0]; if (b) nxt = { ...b, k, mins: k * 1440 + b.s - nm }; }
    const days = [...new Set(blocks.filter((b) => !b.lab).map((b) => ctx.DAY_NAMES[b.day]))].join(", ");
    const est = ms && ms.of ? (100 * ms.got) / ms.of : null, estG = est !== null ? (ctx.GRADES.find((g) => est >= g.min) || { g: "F" }).g : null;
    if (c.past && !["overview", "attendance", "materials", "notes"].includes(chTab)) chTab = "overview";
    const sem = c.past ? c.sem : S0.routineSem;
    let body;
    if (c.past && chTab === "overview") body = pastOverview(c);
    else if (chTab === "overview") body = `<section class="card info-strip">${[["user", ctx.facName(c.faculty) || "—", "Faculty"], ["pin", theory?.room || "TBA", "Room"], ["calendar", days || "—", theory ? `${ctx.fmt12(theory.s)} – ${ctx.fmt12(theory.e)}` : ""]].map(([ic, v, l]) => `<div><span class="itile sm purple">${icon(ic)}</span><div class="min0"><b class="ellipsis" style="display:block">${esc(v)}</b><span class="xs">${esc(l)}</span></div></div>`).join("")}</section>
      <div class="g2m mt"><a class="card row nowrap" href="#/course?c=${encodeURIComponent(code)}&tab=attendance" style="gap:14px"><div class="ring sm ${att !== null && att < 70 ? "red" : "green"}" style="--p:${att ?? 0}"><div><b>${att ?? "—"}${att !== null ? "%" : ""}</b></div></div><div><b>Attendance</b><p class="xs">${a.held ? `${a.held - a.missed} / ${a.held} classes` : "Tap to start tracking"}</p></div></a>
        <a class="card row nowrap" href="#/marks?c=${encodeURIComponent(code)}&from=course" style="gap:14px"><div class="ring sm" style="--p:${est ?? 0}"><div><b style="font-size:13px">${ms && ms.of ? `${ms.got}/${ms.of}` : "—"}</b></div></div><div><b>Current Marks</b><p class="xs">${ms && ms.of ? `${Math.round(est)}% of assessments` : "Add your marks"}</p></div></a></div>
      ${att !== null && att < 70 ? `<a class="alert red mt" href="#/course?c=${encodeURIComponent(code)}&tab=attendance"><span class="a-ic">${icon("alertc")}</span><div class="grow"><b>Your attendance is below 70%</b><p>You may not be eligible to sit for the final exam. Check your course outline.</p></div>${icon("chevR")}</a>` : ""}
      ${nxt ? `<section class="card mt row nowrap" style="border-left:4px solid var(--primary)"><span class="itile purple">${icon("calendar")}</span><div class="grow"><b>Next Class</b><p class="small">${nxt.k === 0 ? "Today" : nxt.k === 1 ? "Tomorrow" : ctx.DAY_NAMES[nxt.day]}, ${ctx.fmt12(nxt.s)} – ${ctx.fmt12(nxt.e)}</p><p class="xs">${icon("pin", "sm")} ${esc(nxt.room || "TBA")}${nxt.lab ? " · Lab" : ""}</p></div><span class="pill green">${ctx.fmtCountdown(Math.max(0, nxt.mins))} left</span></section>` : ""}
      <div class="section-h"><h2>Upcoming Deadlines</h2><a class="see" href="#/tasks">See All</a></div>${tasks.length ? tasks.slice(0, 3).map((t) => ctx.taskLine(t)).join("") : `<p class="small muted">Nothing due for this course.</p>`}
      <div class="section-h"><h2>Quick Links</h2></div><div class="g2m">${[["file", "red", "Lecture Slides", "In the Study Vault", `#/vault?q=${encodeURIComponent(code)}`], ["notes", "blue", "Past Papers", "Shared by students", `#/vault?q=${encodeURIComponent(code)}`], ["clipboard", "purple", "Assignments", `${tasks.length} open`, "#/tasks"], ["link", "green", "Useful Links", `${links.length} resources`, `#/course?c=${encodeURIComponent(code)}&tab=materials`]]
        .map(([ic, tone, t, d, h]) => `<a class="dtile" href="${h}"><span class="itile ${tone}">${icon(ic)}</span><div><b>${t}</b><span>${d}</span></div></a>`).join("")}</div>
      <div class="row mt"><button class="btn primary grow" id="ch-focus">${icon("target")} Focus on ${esc(code)}</button><button class="btn outline grow" id="ch-cards">${icon("cards")} ${due ? `${due} cards due` : `${cardsN} flashcards`}</button></div>`;
    else if (chTab === "marks") body = `<div class="card-h"><h2>Marks Breakdown</h2><span class="small muted">${ms ? `Total: ${ms.total} Marks` : ""}</span></div>
      ${m ? `<section class="card tight">${m.parts.map((p) => { const has = p.got !== "" && p.got != null, pc = has ? (100 * Number(p.got)) / p.w : 0; return `<div class="lrow"><span class="itile sm purple">${icon("notes")}</span><div class="body"><b>${esc(p.n)}</b><span>${p.w} marks</span></div><div style="width:34%">${ctx.bar(pc, pc >= 70 ? "green" : pc >= 50 ? "" : "orange")}</div><span class="pill ${!has ? "" : pc >= 70 ? "green" : pc >= 50 ? "purple" : "red"}" style="min-width:58px;justify-content:center">${has ? `${p.got} / ${p.w}` : "–"}</span></div>`; }).join("")}</section>
        ${estG ? `<div class="card tint-green mt row nowrap"><span class="grade-bubble">${estG}</span><div class="grow"><b>Estimated Final Grade</b><p class="small muted">Based on current marks (${Math.round(est)}% of what's been assessed)</p></div></div>` : ""}` : `<div class="card">${ctx.empty("icon:percent", "No marks yet", "Enter your quiz, assignment and exam marks to estimate your grade.")}</div>`}
      <a class="btn primary block mt" href="#/marks?c=${encodeURIComponent(code)}&from=course">${icon("calc")} Open Marks Estimator</a>`;
    else if (chTab === "attendance") body = ctx.attendance.panel(code, c.past ? c.sem : undefined);
    else if (chTab === "notes") body = `<section class="card stack"><div class="card-h" style="margin:0"><h2>${icon("edit")} Notes</h2><span class="xs" id="ch-saved">Saved on this device</span></div>
      <textarea class="input" id="ch-notes" rows="14" placeholder="Class notes, formulas, what the faculty said will be on the exam…" aria-label="Notes for ${esc(code)}">${esc(st().notes[code] || "")}</textarea></section>`;
    else body = `${ctx.materials.panel(code, { faculty: c.faculty, sec: c.sec, sem })}
      <h3 class="mat-h">Your own links</h3><section class="card stack">
      ${links.map((l, i) => `<div class="lrow"><span class="itile sm green">${icon("link")}</span><a class="body" href="${esc(safeUrl(l.url))}" target="_blank" rel="noopener noreferrer"><b>${esc(l.title)}</b><span>${esc(l.url)}</span></a><button class="btn sm icon-only ghost" data-ldel="${i}" aria-label="Remove link">${icon("trash")}</button></div>`).join("") || '<p class="small muted">Add Google Classroom, a Drive folder, the course outline, a YouTube playlist…</p>'}
      <form id="ch-link" class="grid g2"><input class="input" name="title" placeholder="Title" required maxlength="60" aria-label="Link title"><input class="input" name="url" type="url" placeholder="https://" required aria-label="Link URL"><button class="btn full-row">${icon("plus")} Add link</button></form>
      <a class="btn outline" href="#/vault?q=${encodeURIComponent(code)}">${icon("vault")} Find ${esc(code)} notes in the Study Vault</a></section>`;
    return `${ctx.subHead(esc(code), esc(c.title || ""), "#/courses", f?.email ? `<a class="icon-btn" href="mailto:${esc(f.email)}?subject=${encodeURIComponent(code + " Section " + (c.sec || ""))}" aria-label="Email faculty">${icon("mail")}</a>` : "")}
      <div style="max-width:900px;margin:0 auto"><section class="course-hero"><h1>${esc(code)}</h1><p>${esc(c.title || "")}</p><div class="row">${c.sec ? `<span>${icon("users", "sm")} Section ${esc(c.sec)}</span>` : ""}<span>${icon("calendar", "sm")} ${esc(sem || "")}</span>${f ? `<a href="#/prof?i=${encodeURIComponent(f.init)}" style="color:#fff">${icon("user", "sm")} ${esc(f.name || f.init)}</a>` : ""}</div></section>
      <div class="mt">${ctx.seg([["overview", "Overview"], ["materials", "Materials"], ...(c.past ? [] : [["marks", "Marks"]]), ["attendance", "Attendance"], ["notes", "Notes"]], chTab, "data-cht")}</div><div class="mt">${body}</div></div>`;
  };
  pages.course.mount = (el) => {
    const code = (ctx.qparam("c") || "").toUpperCase();
    const on = (s, ev, fn) => { const b = $(s, el); b && b.addEventListener(ev, fn); };
    $$("[data-cht]", el).forEach((b) => b.addEventListener("click", () => { chTab = b.dataset.cht; ctx.rerender(); }));
    on("#ch-focus", "click", () => focusOn(code)); on("#ch-cards", "click", () => (dueCards(code).length ? startReview(code) : addCards(code)));
    let t; on("#ch-notes", "input", (e) => { clearTimeout(t); $("#ch-saved", el).textContent = "Saving…"; t = setTimeout(() => { st().notes[code] = e.target.value.slice(0, 20000); ctx.save(); checkBadges(); $("#ch-saved", el).textContent = "Saved on this device"; }, 600); });
    on("#ch-link", "submit", (e) => { e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)); if (!safeUrl(f.url)) return toast("Use a full link starting with https://", "error"); (st().links[code] = st().links[code] || []).push({ title: f.title.slice(0, 60), url: f.url }); ctx.save(); ctx.rerender(); });
    $$("[data-ldel]", el).forEach((b) => b.addEventListener("click", () => { st().links[code].splice(Number(b.dataset.ldel), 1); ctx.save(); ctx.rerender(); }));
    if (chTab === "attendance") ctx.attendance.mount(el, code);
    if (chTab === "materials") { const c = myCourses().find((x) => x.code === code) || pastCourse(code); if (c) ctx.materials.mountPanel(el, code, { faculty: c.faculty, sec: c.sec, sem: c.past ? c.sem : S().routineSem }); }
  };

  /* ───────── Achievements + semester card ───────── */
  let allBadges = false;
  pages.me = () => {
    const L = levelInfo(), x = stats(), got = new Set(unlocked());
    const shownB = allBadges ? BADGES : BADGES.slice().sort((a, b) => got.has(b[0]) - got.has(a[0])).slice(0, 5);
    const S0 = S(), cg = x.cgpa;
    return `${ctx.demoBanner()}${ctx.head("Achievements", "Study more. Do more. Be a better you.", "", ctx.art("mascot-thumbs", "Small steps<br>Big progress!"))}
      <div class="grid g2"><section class="level-card"><div class="row nowrap"><span class="hex">${icon("star")}</span><div><b style="font-size:24px">Level ${L.n}</b><p style="opacity:.85">${esc(L.name)}</p></div></div>
          <div class="row nowrap" style="margin-top:16px;max-width:70%"><div class="xp"><span style="width:${L.pct}%"></span></div><span class="small num" style="white-space:nowrap">${L.xp - L.lo} / ${L.hi - L.lo} XP</span></div>
          <span class="hex bighex" style="background:linear-gradient(135deg,#a78bfa,#6d28d9)" aria-hidden="true">${icon("crown", "lg")}</span></section>
        <section class="card stats-strip">${[["shield", "yellow", got.size, "Badges"], ["clock", "purple", Math.round(x.totalMin / 60), "Study Hours"], ["cards", "orange", x.cards, "Flashcards"], ["flame", "red", x.streak, "Day Streak"]].map(([ic, tone, v, l]) => `<div><span class="itile sm ${tone}">${icon(ic)}</span><div><b class="num">${v}</b><span>${l}</span></div></div>`).join("")}</section></div>
      <div class="section-h"><h2>Badges</h2><button class="see" id="me-all" style="background:none;border:0;cursor:pointer">${allBadges ? "Show less" : "See All"}</button></div>
      <section class="card"><div class="hexes">${shownB.map(([id, n, d, ic, bg]) => `<div class="hexb ${got.has(id) ? "" : "off"}"><span class="hex" style="--hc:${bg}">${icon(got.has(id) ? ic : "lock")}</span><b>${n}</b><span>${d}</span>${got.has(id) ? "" : `<span class="sr-only">Locked</span>`}</div>`).join("")}</div></section>
      <div class="section-h"><h2>Share Your Progress</h2><button class="see" id="me-cust" style="background:none;border:0;cursor:pointer">Customize</button></div>
      <section class="recap"><div style="padding:16px 18px 0" class="row between"><span class="logo" style="padding:0"><span class="word" style="font-size:22px">EWU<i>diots</i></span><small>Unofficial · not affiliated with EWU</small></span><div style="text-align:right"><b>${esc((S0.routineSem || ctx.currentSemester()).replace("-", " "))}</b><p class="xs">Semester Recap</p></div></div>
        <div class="rt mt-s"><img src="/img/campus.webp" alt="" loading="lazy"><div class="grid g2" style="padding:12px;gap:10px">${[["CGPA", cg ? cg.toFixed(2) : "—"], ["Courses", new Set(S0.routine.map((r) => r.code)).size], ["Study Hours", Math.round(x.totalMin / 60)], ["Streak", `${x.streak} days`]].map(([k, v]) => `<div><span class="xs">${k}</span><b style="font-size:22px;display:block" class="num">${v}</b></div>`).join("")}</div></div></section>
      <button class="btn primary lg block mt" id="me-card">${icon("sharebox")} Share My Semester Card</button>
      <section class="card mt"><h3>How to earn XP</h3><div class="row mt-s">${[["1 XP", "per focus minute"], ["2 XP", "per flashcard"], ["10 XP", "per revision session"], ["15 XP", "per deadline done"], ["3 XP", "per attendance logged"], ["30 XP", "for a portal sync"]].map(([a, b]) => `<span class="pill purple">${a} ${b}</span>`).join("")}</div></section>`;
  };
  pages.me.mount = (el) => { $("#me-card", el).addEventListener("click", semesterCard); $("#me-cust", el).addEventListener("click", semesterCard); $("#me-all", el).addEventListener("click", () => { allBadges = !allBadges; ctx.rerender(); }); };

  async function drawCard(showCgpa) {
    const W = 1080, H = 1350, cv = document.createElement("canvas"); cv.width = W; cv.height = H;
    const g = cv.getContext("2d"), S0 = S(), L = levelInfo(), x = stats();
    try { await document.fonts.ready; } catch { /* fonts API missing */ }
    const F = (w, s) => `${w} ${s}px "Inter", system-ui, sans-serif`;
    const bg = g.createLinearGradient(0, 0, W, H); bg.addColorStop(0, "#8b5cf6"); bg.addColorStop(0.55, "#7c3aed"); bg.addColorStop(1, "#4c1d95");
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    const img = await new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.onerror = () => r(null); i.src = "/img/campus.webp"; });
    if (img) { g.save(); g.globalAlpha = 0.28; g.drawImage(img, 0, H - 560, W, 560); g.restore(); }
    g.fillStyle = "rgba(163,230,53,.18)"; g.beginPath(); g.arc(W - 80, 140, 300, 0, 7); g.fill();
    g.fillStyle = "#fff"; g.font = F(900, 64); g.fillText("EWU", 80, 150); const wE = g.measureText("EWU").width; g.fillStyle = "#ddd6fe"; g.fillText("diots", 80 + wE, 150);
    g.font = F(500, 26); g.fillStyle = "rgba(255,255,255,.75)"; g.fillText("Semester Recap · Unofficial", 80, 195);
    const name = (S0.profile?.name || "EWU Student").split(" ").filter((w) => !/^(md|mohammad|mohammed|muhammad)\.?$/i.test(w)).slice(0, 2).join(" ");
    g.fillStyle = "#a3e635"; g.font = F(700, 34); g.fillText((S0.routineSem || S0.profile?.semester || "").replace("-", " ").toUpperCase(), 80, 330);
    g.fillStyle = "#fff"; g.font = F(800, name.length > 14 ? 84 : 104); g.fillText(name, 80, 450);
    g.font = F(500, 30); g.fillStyle = "rgba(255,255,255,.85)"; g.fillText((S0.profile?.program || "East West University").slice(0, 52), 80, 505);
    const tiles = [showCgpa && (x.cgpa ? ["CGPA", x.cgpa.toFixed(2)] : null), ["Study Hours", String(Math.round(x.totalMin / 60))], ["Streak", `${x.streak} days`], ["Cards", String(x.reviews)],
      ["Level", `Lv ${L.n}`], ["Courses", String(new Set(S0.routine.map((r) => r.code)).size)], ["Badges", `${unlocked().length}/${BADGES.length}`]].filter(Boolean).slice(0, 6);
    tiles.forEach(([k, v], i) => {
      const cx = 80 + (i % 2) * 470, cy = 580 + Math.floor(i / 2) * 190;
      g.fillStyle = "rgba(255,255,255,.14)"; roundRect(g, cx, cy, 450, 165, 36); g.fill();
      g.fillStyle = "rgba(255,255,255,.75)"; g.font = F(600, 28); g.fillText(k.toUpperCase(), cx + 36, cy + 56);
      g.fillStyle = i === 0 ? "#a3e635" : "#fff"; g.font = F(800, 64); g.fillText(v, cx + 36, cy + 130);
    });
    g.fillStyle = "#a3e635"; roundRect(g, 80, H - 170, W - 160, 90, 45); g.fill();
    g.fillStyle = "#1a2e05"; g.font = F(800, 32); g.textAlign = "center"; g.fillText("Same campus. Brighter you.", W / 2, H - 113);
    g.textAlign = "left"; g.font = F(500, 22); g.fillStyle = "rgba(255,255,255,.7)"; g.fillText("Unofficial · not affiliated with EWU", 80, H - 30);
    return cv;
  }
  function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
  async function semesterCard() {
    let showCgpa = false;
    openModal(modalHead("Your semester card") + `<div class="stack"><img id="sc-img" alt="Your semester card preview" style="border-radius:16px;max-height:52dvh;margin:0 auto">
      <label class="row small"><input type="checkbox" class="check" id="sc-cgpa"> Show my CGPA on the card</label>
      <p class="xs">Your student ID is never printed.${ctx.native.isNative ? " Press and hold the image to save it, or use Share." : ""}</p>
      <div class="row"><button class="btn outline grow" id="sc-share">${icon("share")} Share</button><button class="btn primary grow" id="sc-dl">${icon("download")} Download PNG</button></div></div>`, async (m) => {
      let cv;
      const paint = async () => { cv = await drawCard(showCgpa); $("#sc-img", m).src = cv.toDataURL("image/png"); };
      await paint();
      $("#sc-cgpa", m).addEventListener("change", async (e) => { showCgpa = e.target.checked; await paint(); });
      $("#sc-dl", m).addEventListener("click", () => { const a = document.createElement("a"); a.href = cv.toDataURL("image/png"); a.download = "my-ewu-semester.png"; a.click(); });
      $("#sc-share", m).addEventListener("click", () => cv.toBlob(async (b) => {
        const file = new File([b], "my-ewu-semester.png", { type: "image/png" });
        try { if (navigator.canShare && navigator.canShare({ files: [file] })) await navigator.share({ files: [file], title: "My EWU semester", text: "Made with EWUdiots" }); else await ctx.native.share({ title: "My EWU semester", text: `Level ${levelInfo().n} · ${streak()}-day streak on EWUdiots` }); } catch { /* share cancelled */ }
      }));
    });
  }

  /* ───────── Small widgets for the dashboard ───────── */
  const tipOfDay = () => TIPS[Math.floor(Date.now() / 864e5) % TIPS.length];
  const nextExam = () => upcomingExams()[0];
  // Restore the ambient choice only after a user gesture (browsers block autoplay).
  if (st().ambient !== "off") document.addEventListener("pointerdown", function once() { document.removeEventListener("pointerdown", once); if (st().timer?.endAt) ambient(st().ambient); }, { once: true });

  return { award, levelInfo, streak, focusToday, dueCards, nextExam, tipOfDay, focusOn, checkBadges, fmtH, stats, upcomingExams, paintTimer, unlockedCount: () => unlocked().length };
}
