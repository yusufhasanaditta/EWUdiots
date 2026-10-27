/* Home dashboard, onboarding (welcome → login → role → profile), notifications, More, Profile & settings, Help, About. */
export function install(ctx) {
  const { pages, icon, esc, $, $$, toast, openModal, closeModal, modalHead, confirmModal, busy } = ctx;
  const S = () => ctx.S;
  const spark = `<svg class="spark" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 9 3 4M11 7l1-5M16 10l5-3" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>`;

  /* ═════════════ HOME ═════════════ */
  pages.home = () => {
    if (S().role !== "student") return homeLite();
    const St = S(), p = St.profile || { name: "" };
    const nc = ctx.nextClass();
    const now = new Date(), today = now.getDay(), nowM = now.getHours() * 60 + now.getMinutes();
    const todays = ctx.expand(St.routine).filter((b) => b.day === today).sort((a, b) => a.s - b.s);
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
    const ncCard = nc ? `<a class="next-card" href="#/course?c=${encodeURIComponent(nc.code)}" aria-live="polite"><span class="fluid" aria-hidden="true"><i></i><i></i><i></i></span>
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
      <div class="dtiles mt">${[["routine", "calendar", "purple", "Routine", "View your classes"], ["planner", "listcheck", "green", "Advising Planner", "Plan next semester"], ["map", "map", "blue", "Campus Map", "Rooms, routes & 3D walk"], ["grades", "bars", "purple", "CGPA", "Track your progress"],
        ["tasks", "clipboard", "red", "Deadlines", "Assignments & exams"], ["fees", "wallet", "orange", "Fees", "Payments & installments"], ["vault", "vault", "blue", "Study Vault", "Notes, past papers"], ["rooms", "door", "purple", "Free Rooms", "Find empty classrooms"]]
        .map(([id, ic, tone, t, d]) => `<a class="dtile" href="#/${id}"><span class="itile ${tone}">${icon(ic)}</span><div class="min0"><b>${t}</b><span>${d}</span></div></a>`).join("")}</div>
      <div class="split mt">
        <section class="card"><div class="card-h"><h2>Today's Schedule</h2><a class="see" href="#/routine">View All</a></div>${navStrip ? `<div style="margin:-4px 0 12px">${navStrip}</div>` : ""}
          ${todays.length ? `<div class="sched">${todays.map((b) => { const live = b.s <= nowM && nowM < b.e; return `<a class="sitem ${b.e <= nowM ? "past" : ""}" href="#/course?c=${encodeURIComponent(b.code)}" style="--cc:${ctx.colorFor(b.code)}"><span class="itile sm ${ctx.toneFor(b.code)}">${icon("calendar")}</span><div class="grow min0"><span class="when">${ctx.fmt12(b.s)} – ${ctx.fmt12(b.e)}</span><b>${esc(b.code)}${b.title ? " - " + esc(b.title) : ""}${b.lab ? " (Lab)" : ""}</b><span class="xs">${esc(b.room || "TBA")}</span></div>${live ? '<span class="pill purple">Now</span>' : ""}</a>`; }).join("")}</div>`
            : ctx.empty("mascot-reading", "No Classes Today", "Take a break or get ahead! You're all caught up.", `<a class="btn sm" href="#/focus">${icon("target")} Start a focus session</a>`)}</section>
        <div class="stack" style="gap:16px">
          <section class="card"><div class="card-h"><h2>Quick Stats</h2><span class="pill">${esc(St.routineSem || "This Semester")}</span></div>
            <div class="grid g4" style="gap:10px">${[["grades", "hexagon", "purple", shown ? shown.toFixed(2) : "—", "CGPA"], ["courses", "notes", "blue", courses ? `${courses}` : "—", "Courses"], ["marks", "checkc", "green", avgAtt !== null ? `${avgAtt}%` : "—", "Attendance"], ["me", "flame", "orange", `${str} day${str === 1 ? "" : "s"}`, "Study Streak"]]
              .map(([id, ic, tone, v, l]) => `<a class="stat-tile" href="#/${id}" style="text-decoration:none;color:inherit"><span class="itile ${tone}">${icon(ic)}</span><span class="v num">${v}</span><span class="l">${l}</span></a>`).join("")}</div></section>
          <div class="mascot-card green"><img src="/img/mascot-thumbs.webp" alt="" width="110"><span class="scribble">“Same campus.<br>Brighter you.”${ctx.swoosh}</span></div>
        </div>
      </div>
      <div class="grid g2 mt">${deadlines}<div class="grid g2">${streakCard}${attCard}</div></div>${ctx.notices.homeCard() ? `<div class="mt">${ctx.notices.homeCard()}</div>` : ""}</div>`;

    const dueToday = St.tasks.filter((t) => !t.done && new Date(t.due).toDateString() === now.toDateString()).length;
    const todayStrip = todays.length ? `<div class="today-strip" role="list" aria-label="Today's classes">${todays.map((b) => { const live = b.s <= nowM && nowM < b.e, past = b.e <= nowM;
      return `<a role="listitem" class="tchip${live ? " live" : ""}${past ? " past" : ""}" href="#/course?c=${encodeURIComponent(b.code)}" style="--cc:${ctx.colorFor(b.code)}"><span class="tt">${ctx.fmtShort(b.s)}</span><b>${esc(b.code)}${b.lab ? " Lab" : ""}</b><span class="tr">${live ? "Now" : esc(ctx.baseRoom(b.room) || "TBA")}</span></a>`; }).join("")}</div>` : "";
    const mobile = `<div class="m-only">
      <div class="m-hello"><a class="avatar" href="#/profile" aria-label="Your profile">${esc(ctx.initials(p.name || "EWU Student"))}</a>
        <div class="grow min0"><p class="hi">${ctx.greeting()}</p><h1 class="ellipsis">${first}</h1></div>
        <a class="streak-chip" href="#/me" aria-label="${str} day study streak">${icon("flame", "sm")}<b>${str}</b></a></div>
      <div class="m-summary">${[[todays.length ? `${todays.filter((b) => b.e > nowM).length}` : "0", todays.length === 1 ? "class today" : "classes today", "#/routine"], [dueToday, "due today", "#/tasks"], [shown ? shown.toFixed(2) : "—", "CGPA", "#/grades"]]
        .map(([v, l, h]) => `<a href="${h}"><b class="num">${v}</b><span>${l}</span></a>`).join("")}</div>
      ${ncCard}${todayStrip}${navStrip}
      <h2 class="mgroup-h">Quick access</h2><div class="qgrid">${TILES.map(([id, ic, tone, t]) => `<a class="qtile" href="#/${id}"><span class="itile ${tone}">${icon(ic)}</span>${t}</a>`).join("")}</div>
      <div class="mt">${deadlines}</div>${ctx.notices.homeCard() ? `<div class="mt">${ctx.notices.homeCard()}</div>` : ""}
      <div class="g2m mt">${streakCard}${attCard}</div></div>`;
    const b = ctx.content.banner();
    const banner = b ? `<div class="alert ${b.tone || "purple"} admin-banner fx-rise"><span class="a-ic">${icon(b.tone === "red" ? "alert" : "megaphone")}</span><div class="grow"><b>${esc(b.title || "From the EWUdiots team")}</b><p>${esc(b.text)}</p></div>${b.link ? `<a class="btn sm" href="${esc(b.link)}" ${/^https:/.test(b.link) ? 'target="_blank" rel="noopener"' : ""}>${esc(b.cta || "Open")}</a>` : ""}</div>` : "";
    const up = ctx.C.update ? `<a class="alert green update-card" href="${esc(ctx.C.update.url)}" target="_blank" rel="noopener"><span class="a-ic">${icon("download")}</span><div class="grow"><b>Update available: EWUdiots ${esc(ctx.C.update.version)}</b><p>Tap to download, then install over this app. Your data stays.</p></div>${icon("chevR")}</a>` : "";
    return `${up}${banner}${ctx.demoBanner()}${mobile}${desktop}${ctx.community.homeNews()}`;
  };
  /* Faculty / alumni home: campus tools only. */
  function homeLite() {
    const now = new Date(), d = now.getDay(), nm = now.getHours() * 60 + now.getMinutes();
    const free = ctx.freeRoomsAt(d, nm, nm + 60).slice(0, 4);
    const tiles = [["vault", "vault", "yellow", "Study Vault", "Notes, past papers"], ["rooms", "building", "blue", "Free Rooms", "Find empty classrooms"], ["faculty", "users", "purple", "Faculty", "Directory & reviews"]]
      .concat(S().role === "faculty" ? [["focus", "target", "pink", "Focus", "Deep-work timer"]] : [["cover", "file", "green", "Cover Page", "Make a PDF cover"]]);
    return `<section class="hero-banner"><h1><small>${ctx.greeting()},</small>${esc(ctx.firstName())}!</h1><p>${S().role === "faculty" ? "Rooms, notes and your faculty profile in one place." : "Stay connected with EWU."}</p></section>
      <div class="dtiles mt">${tiles.map(([id, ic, tone, t, dd]) => `<a class="dtile" href="#/${id}"><span class="itile ${tone}">${icon(ic)}</span><div class="min0"><b>${t}</b><span>${dd}</span></div></a>`).join("")}</div>
      ${ctx.notices.homeCard() ? `<div class="mt">${ctx.notices.homeCard()}</div>` : ""}
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
      ["Academics", [["courses", "book", "teal", "My Courses", "Course hubs and notes", "s"], ["planner", "calcheck", "green", "Advising Planner", "Plan your next semester", "s"], ["marks", "notes", "blue", "Marks Estimator", "Predict your grades", "s"],
        ["degree", "cap", "yellow", "Degree Progress", "Credits by requirement", "s"], ["exams", "exam", "orange", "Exam Planner", "Revision plan for exams", "s"], ["fees", "receipt", "red", "Fees & Deadlines", "Track payments and tasks", "s"], ["sync", "sync", "teal", "Sync Portal", "Import from the EWU portal", "s"]]],
      ["Study", [["focus", "target", "pink", "Focus Timer", "Pomodoro and analytics", "sf"], ["cards", "cards", "pink", "Flashcards", "Spaced repetition decks", "sf"], ["vault", "vault", "blue", "Study Vault", "Notes, past papers, slides", "sfa"], ["me", "award", "purple", "Achievements", "View your badges and stats", "sf"]]],
      ["Campus", [["map", "map", "purple", "Campus Map", "Find rooms, walk in 3D", "sfa"], ["rooms", "building", "purple", "Free Rooms", "Find empty classrooms", "sfa"], ["idcard", "user", "teal", "My ID Card", "Your 3D student pass", "s"], ["faculty", "users", "purple", "Faculty & Reviews", "Contacts and ratings", "sfa"], ["cover", "file", "green", "Cover Page", "Assignment cover PDF", "sa"]]],
      ["Community", [["notices", "megaphone", "orange", "Notice Board", "Official EWU notices", "sfa"], ["news", "globe", "blue", "Campus News", "Stories from EWU", "sfa"], ["alumni", "community", "green", "Alumni", "Where graduates are now", "sfa"]]]
    ].map(([g, list]) => [g, list.filter((t) => t[5].includes(rk) && (!ctx.PAGE_FEATURE[t[0]] || ctx.content.feature(ctx.PAGE_FEATURE[t[0]])))]).filter(([, list]) => list.length);
    return `<a class="me-card" href="#/profile"><span class="avatar lg">${esc(ctx.initials(p.name || "EWU Student"))}</span><span class="grow min0"><b class="ellipsis">${esc(p.name || "Set up your profile")}</b><span class="ellipsis">${esc([p.id, p.program || p.department].filter(Boolean).join(" · ") || ctx.roleLabel())}</span>
        <span class="me-sync ${ctx.C.user ? "on" : ""}">${icon(ctx.C.user ? "cloud" : "database", "sm")} ${ctx.C.user ? "Synced on all your devices" : "Saved on this device"}</span></span>${icon("chevR")}</a>
      ${GROUPS.map(([g, list]) => `<h2 class="mgroup-h">${g}</h2><div class="mtiles">${list.map(([id, ic, tone, t, d]) => `<a class="mtile" href="#/${id}"><span class="itile ${tone}">${icon(ic)}</span><div class="min0"><b>${t}</b><span>${d}</span></div></a>`).join("")}</div>`).join("")}
      ${ctx.C.install ? `<button class="get-app mt" id="mo-install" style="width:100%;text-align:left;cursor:pointer"><span class="itile green">${icon("download")}</span><span class="grow"><b>Install EWUdiots on this device</b><span>Its own window, works offline, same account</span></span>${icon("chevR", "chev")}</button>` : ""}
      <a class="get-app mt" href="${ctx.native.isNative ? ctx.SITE : ""}/#download"${ctx.native.isNative ? ' target="_blank" rel="noopener"' : ""}><span class="itile purple">${icon("download")}</span><span class="grow"><b>Get EWUdiots everywhere</b><span>Android app, Windows and the Chrome extension</span></span>${icon("chevR", "chev")}</a>
      <h2 class="mt-l" style="margin-bottom:10px">Account</h2>
      <section class="card settings-list">
        ${[["profile", "user", "purple", "Profile & Settings", "Manage your account"], ["help", "help", "purple", "Help & Support", "FAQs, contact and feedback"], ["about", "info", "purple", "About EWUdiots", "Unofficial student project"]]
          .map(([id, ic, tone, t, d]) => `<a class="lrow" href="#/${id}"><span class="itile ${tone}">${icon(ic)}</span><span class="body"><b>${t}</b><span>${d}</span></span>${icon("chevR", "chev")}</a>`).join("")}
        <button class="lrow" id="mo-share"><span class="itile purple">${icon("share")}</span><span class="body"><b>Share with Friends</b><span>Help your friends find it</span></span>${icon("chevR", "chev")}</button>
      </section>
      <div class="card soft mt" style="text-align:center"><b>${icon("heart", "sm")} Built by students, for students.</b><p class="small muted">Unofficial · not affiliated with East West University</p></div>`;
  };
  pages.more.mount = (el) => {
    $("#mo-install", el)?.addEventListener("click", async () => { const p = ctx.C.install; if (!p) return; p.prompt(); await p.userChoice.catch(() => {}); ctx.C.install = null; ctx.rerender(); });
    moShare(el);
  };
  const moShare = (el) => $("#mo-share", el).addEventListener("click", async () => {
    try { const r = await ctx.native.share({ title: "EWUdiots", text: "EWUdiots: routine, CGPA, advising planner, deadlines and study tools for EWU students.", url: location.origin }); if (r === "copied") toast("Link copied"); } catch { /* share cancelled */ }
  });

  /* ═════════════ PROFILE & SETTINGS ═════════════ */
  let otpEmail = "";
  pages.profile = () => {
    const St = S(), p = St.profile || {}, L = ctx.study.levelInfo(), x = ctx.study.stats();
    const C = ctx.C, cloud = ctx.cloud;
    const row = (id, ic, t, d, right = "") => `<button class="lrow" id="${id}"><span class="itile purple">${icon(ic)}</span><span class="body"><b>${t}</b><span>${d}</span></span>${right ? `<span class="small muted">${right}</span>` : ""}${icon("chevR", "chev")}</button>`;
    return `${ctx.subHead("Profile &amp; Settings", "", "#/more")}
      <div style="max-width:760px;margin:0 auto">
      <a class="card row nowrap" href="#" id="pf-edit2" style="gap:14px;text-decoration:none;color:inherit"><span class="avatar lg">${esc(ctx.initials(p.name || "EWU Student"))}</span><div class="grow min0"><b style="font-size:19px">${esc(p.name || "Your name")}</b>
        <p class="small muted">${[p.id && `ID: ${p.id}`, p.program || p.department, ctx.roleLabel() !== "Student" ? ctx.roleLabel() : "", "East West University"].filter(Boolean).map(esc).join("<br>")}</p></div>${icon("chevR")}</a>
      <div class="card mt stats-strip">${[["star", "yellow", L.n, "Level"], ["shield", "green", ctx.study.unlockedCount(), "Badges"], ["bars", "blue", Math.round(x.totalMin / 60), "Study Hours"], ["flame", "orange", x.streak, "Day Streak"]]
        .map(([ic, tone, v, l]) => `<div><span class="itile sm ${tone}">${icon(ic)}</span><div><b class="num">${v}</b><span>${l}</span></div></div>`).join("")}</div>
      <section class="card settings-list mt">${row("pf-edit", "userpen", "Edit Profile", "Update your name, ID and program")}<a class="lrow" href="#/idcard"><span class="itile purple">${icon("scan")}</span><span class="body"><b>My ID Card</b><span>${St.idcard ? `${esc(St.idcard.id)}${St.idcard.verified ? " · verified" : ""}` : "Scan your card for a 3D student pass"}</span></span>${icon("chevR", "chev")}</a>${row("pf-acad", "book", "Academic Info", "Role, program, semester and credits")}${row("pf-priv", "shield", "Privacy &amp; Security", "Manage your data and account security")}</section>
      <h2 class="mt-l" style="margin-bottom:10px">Account &amp; Cloud</h2>
      <section class="card">${!cloud.enabled ? `<div class="row nowrap"><span class="itile teal">${icon("database")}</span><div><b>On this device</b><p class="small muted">Everything is saved on this device. Cloud backup isn't connected in this build.</p></div></div>` :
        C.user ? `<div class="row nowrap"><span class="itile green">${icon("cloud")}</span><div class="grow min0"><b class="ellipsis" style="display:block">${esc(C.user.email)}</b><p class="small muted">${St.lastSync ? `Backed up ${new Date(St.lastSync).toLocaleString()}` : "Backing up…"}</p></div></div><div class="row mt"><button class="btn sm" id="ac-sync">${icon("sync")} Back up now</button><button class="btn sm neutral" id="ac-out">${icon("logout")} Log Out</button></div>` :
        `<div class="row nowrap"><span class="itile purple">${icon("cloud")}</span><div class="grow"><b>Back up &amp; unlock shared features</b><p class="small muted">Sign in with your EWU student email for backup, reviews, the shared vault and campus-wide free rooms.</p></div></div><a class="btn primary block mt" href="#/login?from=profile">${icon("mail")} Sign in with EWU email</a>`}</section>
      <h2 class="mt-l" style="margin-bottom:10px">App Preferences</h2>
      <section class="card settings-list">
        ${row("pf-theme", "theme", "Theme", "Light, dark or match your device", { auto: "System", light: "Light", dark: "Dark" }[St.theme])}
        <div class="lrow"><span class="itile purple">${icon("globe")}</span><span class="body"><b>Language</b><span>বাংলা coming soon</span></span><span class="small muted">English</span></div>
        <div class="lrow"><span class="itile purple">${icon("bell")}</span><span class="body"><b>Notifications</b><span>Classes, deadlines and payments</span></span><label class="switch"><input type="checkbox" id="set-notify" ${St.settings.notify ? "checked" : ""} aria-label="Notifications"></label></div>
        <div class="lrow"><span class="itile purple">${icon("clock")}</span><span class="body"><b>Class reminder</b><span>How early to remind you</span></span><select class="select sm" id="set-min" aria-label="Minutes before class">${[5, 10, 15, 20, 30].map((m) => `<option value="${m}" ${St.settings.remindMin === m ? "selected" : ""}>${m} min</option>`).join("")}</select></div>
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
    on("#pf-edit2", "click", (e) => { e.preventDefault(); profileForm("Edit Profile", ["name", "id", "department"]); });
    on("#pf-acad", "click", () => profileForm("Academic Info", ["program", "semester", "advisor", "creditsTotal"]));
    on("#pf-priv", "click", () => openModal(ctx.modalHead("Privacy & Security") + `<div class="stack">
      <div class="privacy" style="margin:0">${icon("shield")}<div><b>What we never read</b><p>Your portal password, NID, phone, address, date of birth, blood group and photo are never read or stored.</p></div></div>
      <p class="small">Your routine, grades, fees and notes are stored on this device${ctx.C.user ? " and in your private, encrypted cloud backup that only you can access" : ""}. Reviews are anonymous.</p>
      <div class="row"><a class="btn sm" href="/privacy.html" target="_blank" rel="noopener">Privacy policy</a><a class="btn sm" href="/terms.html" target="_blank" rel="noopener">Terms</a></div></div>`));
    on("#pf-theme", "click", () => openModal(ctx.modalHead("Theme") + `<div class="stack" style="gap:0">${[["auto", "System", "Match your device"], ["light", "Light", "Bright and clean"], ["dark", "Dark", "Easy on the eyes at night"]].map(([v, l, d]) => `<button class="lrow" data-th="${v}"><span class="itile purple">${icon(v === "dark" ? "moon" : v === "light" ? "sun" : "theme")}</span><span class="body"><b>${l}</b><span>${d}</span></span>${S().theme === v ? icon("check") : ""}</button>`).join("")}</div>`,
      (m) => $$("[data-th]", m).forEach((b) => b.addEventListener("click", () => { S().theme = b.dataset.th; ctx.save({ silent: true }); ctx.applyTheme(); closeModal(); ctx.rerender(); }))));
    on("#set-notify", "change", async (e) => { if (e.target.checked) { if (!(await ctx.enableNotifications())) e.target.checked = false; } else { S().settings.notify = false; ctx.save(); toast("Reminders off", "info"); } });
    on("#set-min", "change", (e) => { S().settings.remindMin = Number(e.target.value); ctx.save(); toast("Saved"); });
    on("#ac-sync", "click", async (e) => { busy(e.currentTarget, true, "Backing up…"); if (await ctx.pushNow()) toast("Backed up"); else toast("Backup failed", "error", "Check your connection and try again."); ctx.rerender(); });
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
  pages.help = () => `${ctx.subHead("Help &amp; Support", "", "#/more")}<div style="max-width:760px;margin:0 auto">
    <section class="card">${FAQ.map(([q, a]) => `<details class="lrow" style="display:block"><summary style="font-weight:600;padding:4px 0">${esc(q)}</summary><p class="small muted" style="margin-top:8px">${esc(a)}</p></details>`).join("")}</section>
    <section class="card mt row nowrap"><span class="itile purple">${icon("mail")}</span><div class="grow"><b>Still need help?</b><p class="small muted">Send feedback, report a bug or request a feature.</p></div><a class="btn primary sm" href="mailto:civicframe01@gmail.com?subject=EWUdiots%20feedback">Contact</a></section></div>`;
  pages.about = () => `${ctx.subHead("About EWUdiots", "", "#/more")}<div style="max-width:760px;margin:0 auto">
    <section class="card" style="text-align:center"><div class="ob-word" style="padding:8px 0"><span class="w" style="font-size:38px">EWU<i>diots</i>${spark}</span><p>Your Uni Life, In One App</p><span class="unoff">Unofficial · not affiliated with EWU</span></div>
      <p class="small muted mt">Version ${ctx.APP_VERSION}. Made by EWU students, for EWU students. EWUdiots is not affiliated with, endorsed by or connected to East West University. Always confirm important information on the official portal.</p>
      <div class="row center mt"><a class="btn sm" href="/privacy.html" target="_blank" rel="noopener">Privacy policy</a><a class="btn sm" href="/terms.html" target="_blank" rel="noopener">Terms</a></div></section></div>`;

  /* ═════════════ ONBOARDING (full screen) ═════════════ */
  const obShell = (inner, { back = "", skip = "", foot = "" } = {}) => `<div class="ob"><div class="ob-card">
    <div class="ob-top">${back ? `<a class="icon-btn" style="border:0;box-shadow:none" href="${back}" aria-label="Back">${icon("chevL")}</a>` : "<span></span>"}${skip ? `<button class="lnk" id="ob-skip">${skip}</button>` : ""}</div>
    <div class="ob-body">${inner}</div>${foot ? `<div class="ob-foot">${foot}</div>` : ""}</div></div>`;
  const dots = (i) => `<div class="ob-dots" aria-label="Step ${i + 1} of 3">${[0, 1, 2].map((k) => `<i class="${k === i ? "on" : ""}"></i>`).join("")}</div>`;
  const FEATURES = [["calendar", "purple", "Smart Routine", "Never miss a class again."], ["bars", "green", "Track CGPA", "Plan smarter, do better."], ["checksq", "teal", "Get Reminders", "Deadlines, exams, fees and more."],
    ["cap", "purple", "Advising Planner", "Find the best course combination."], ["books", "purple", "Study Tools", "Flashcards, notes, past papers."], ["users", "orange", "Campus Extras", "Free rooms, faculty reviews and more."]];
  pages.welcome = () => {
    const i = Math.min(2, Math.max(0, Number(ctx.qparam("s")) || 0));
    if (i === 0) return obShell(`<div class="ob-word"><span class="w">EWU<i>diots</i>${spark}</span><p>Your Uni Life, In One App</p><span class="unoff">Unofficial · not affiliated with EWU</span></div>
      <div class="ob-hero"><img src="/img/onboard-hero.webp" alt="EWUdiots mascot pointing, surrounded by notes: Classes, CGPA, Routine, Deadlines, Uni Life" width="438" height="450"><div class="sheet"><h2 style="font-size:24px">More than just a timetable</h2><p class="muted" style="margin-top:8px">Manage your classes, CGPA, deadlines, fees and study life — all in one place.</p></div></div>`,
      { skip: "Skip", foot: `${dots(0)}<button class="ob-next" id="ob-next" aria-label="Next">${icon("arrow")}</button>` });
    if (i === 1) return obShell(`<span class="eyebrow">Stay ahead</span><h1 style="margin-top:8px">Everything you need for a <span class="hl">smarter uni life</span></h1>
      <div class="fgrid">${FEATURES.map(([ic, tone, t, d]) => `<div><span class="itile ${tone}">${icon(ic)}</span><b>${t}</b><span>${d}</span></div>`).join("")}</div>
      <img src="/img/mascot-study.webp" alt="" width="420" height="165" style="margin:14px -24px 0;width:calc(100% + 48px);max-width:none">`,
      { back: "#/welcome?s=0", skip: "Skip", foot: `<button class="ob-prev" id="ob-prev" aria-label="Previous">${icon("chevL")}</button>${dots(1)}<button class="ob-next" id="ob-next" aria-label="Next">${icon("arrow")}</button>` });
    return obShell(`<span class="eyebrow">Get started</span><h1 style="margin-top:8px">Sync your data from the <span class="hl">EWU portal</span></h1><p class="muted" style="margin-top:8px">Bring your routine, courses, marks and more in a few seconds.</p>
      <div class="mt">${[["scan", "purple", "Upload a Screenshot", "Take or upload a screenshot from your portal."], ["paste", "green", "Paste Data", "Copy and paste directly from the portal."], ["chrome", "blue", "Use Chrome Extension", "Sync with one click using our browser extension."]]
        .map(([ic, tone, t, d]) => `<div class="method" style="cursor:default"><span class="itile ${tone}">${icon(ic)}</span><span class="grow"><b>${t}</b><span>${d}</span></span></div>`).join("")}</div>
      <div class="privacy">${icon("shield")}<div><b>Your Privacy, Our Priority</b><p>We never read your NID, address, phone or password. Your data stays on your device and is used only to make your experience better.</p></div></div>`,
      { back: "#/welcome?s=1", skip: "Skip", foot: `<div class="stack grow" style="gap:12px;align-items:center"><button class="btn primary lg block" id="ob-start">Let's Sync My Data ${icon("arrow")}</button>${dots(2)}</div>` });
  };
  const afterWelcome = () => ctx.go(ctx.cloud.enabled ? "#/login" : "#/role");
  pages.welcome.mount = (el) => {
    const i = Number(ctx.qparam("s")) || 0;
    const on = (s, fn) => { const b = $(s, el); b && b.addEventListener("click", fn); };
    on("#ob-next", () => ctx.go(`#/welcome?s=${i + 1}`)); on("#ob-prev", () => ctx.go(`#/welcome?s=${i - 1}`));
    on("#ob-skip", afterWelcome); on("#ob-start", afterWelcome);
  };

  pages.login = () => {
    const from = ctx.qparam("from"), back = from === "profile" ? "#/profile" : "#/welcome?s=2";
    if (!ctx.cloud.enabled) return obShell(`<h1>Sign in</h1><p class="muted mt-s">Cloud accounts aren't connected in this build. Everything works on this device.</p>`, { back, foot: `<button class="btn primary lg block" id="lg-skip">Continue</button>` });
    if (ctx.C.user) return obShell(`<div class="empty"><span class="ill">${icon("checkc")}</span><h3>You're signed in</h3><p>${esc(ctx.C.user.email)}</p></div>`, { back, foot: `<button class="btn primary lg block" id="lg-skip">Continue</button>` });
    const card = ctx.idcard.savedCard();
    return obShell(`<div class="ob-word" style="padding-top:20px"><span class="w" style="font-size:38px">EWU<i>diots</i>${spark}</span><div><span class="unoff">Unofficial · not affiliated with EWU</span></div></div>
      <h2 class="mt-l" style="text-align:center">Sign in with your ID card</h2><p class="muted small" style="text-align:center;margin-top:4px">${otpEmail ? `We sent a 6-digit code to <b>${esc(otpEmail)}</b>. Open your EWU student mail (check spam too).` : "Add both sides of your EWU ID card. We send a 6-digit code to your EWU student email — no password needed."}</p>
      ${otpEmail ? `<form id="otp-form" class="stack mt"><label class="field">Code<input class="input otp" name="code" inputmode="numeric" autocomplete="one-time-code" pattern="\\d{6}" maxlength="6" required></label><button class="btn primary lg block">Verify &amp; Sign In</button>
          <div class="row"><button type="button" class="btn ghost grow" id="otp-resend">${icon("reset")} Send again</button><button type="button" class="btn ghost grow" id="otp-back">Use another card</button></div></form>`
        : card ? `<div class="card soft mt row nowrap"><span class="itile purple">${icon("user")}</span><div class="grow min0"><b>${esc(card.name || "Your card")}</b><p class="small muted">${esc(card.id)} · both sides added</p></div></div>
          <button class="btn primary lg block mt" id="lg-saved">${icon("mail")} Send code to ${esc(card.id)}@std.ewubd.edu</button><button class="btn ghost block" id="lg-card">${icon("scan")} Use a different card</button>`
        : `<ol class="login-steps mt">${[["scan", "Front of your card", "The side with your photo and ID"], ["reset", "Back of your card", "Turn it over and snap again"], ["mail", "Code to your EWU mail", "<id>@std.ewubd.edu"]].map(([ic, t, d]) => `<li><span class="itile sm purple">${icon(ic)}</span><div><b>${t}</b><span>${esc(d)}</span></div></li>`).join("")}</ol>
          <button class="btn primary lg block mt" id="lg-card">${icon("scan")} Scan my ID card</button>`}
      <p class="small muted mt" style="text-align:center">Only real EWU students can sign in. One account works in the app, on the web, on Windows and in the Chrome extension.</p>`,
      { back, foot: from === "profile" ? "" : `<button class="btn ghost block" id="lg-skip">Continue without an account</button>` });
  };
  pages.login.mount = (el) => {
    const from = ctx.qparam("from");
    const next = () => ctx.go(from === "profile" ? "#/profile" : "#/role");
    const on = (sel, ev, fn) => { const x = $(sel, el); x && x.addEventListener(ev, fn); };
    on("#lg-skip", "click", next);
    const send = async (card, btn) => {
      const email = `${card.id}@std.ewubd.edu`;
      busy(btn, true, "Sending code…");
      try { await ctx.cloud.sendCode(email); ctx.idcard.pending = card; otpEmail = email.toLowerCase(); toast("Code sent", "success", `Check ${email}`); ctx.rerender(); }
      catch (err) { busy(btn, false); toast(/rate|seconds|many/i.test(err.message) ? "Please wait a minute before asking for another code" : err.message, "error"); }
    };
    on("#otp-back", "click", () => { otpEmail = ""; ctx.idcard.pending = null; ctx.rerender(); });
    on("#otp-resend", "click", (e) => { const c = ctx.idcard.pending || ctx.idcard.savedCard(); if (c) send(c, e.currentTarget); });
    on("#lg-saved", "click", (e) => send(ctx.idcard.savedCard(), e.currentTarget));
    on("#lg-card", "click", async () => {
      const card = await ctx.idcard.scan({ title: "Sign in with your ID card", cta: "Send code to my EWU email" });
      if (card) send(card, $("#lg-card", el));
    });
    on("#otp-form", "submit", async (e) => {
      e.preventDefault(); const btn = e.target.querySelector("button.primary");
      busy(btn, true, "Verifying…");
      try {
        await ctx.cloud.verifyCode(otpEmail, String(new FormData(e.target).get("code")));
        const card = ctx.idcard.pending, mail = otpEmail; otpEmail = ""; ctx.idcard.pending = null;
        // Let the cloud restore finish first, so a fresh device never overwrites the backup with just the card.
        for (let i = 0; i < 30 && !ctx.C.user; i++) await new Promise((r) => setTimeout(r, 100));
        await ctx.afterSignIn();
        if (card && mail.startsWith(card.id)) await ctx.idcard.commit(card, { verified: true, email: mail });
        else if (S().idcard && mail.startsWith(S().idcard.id)) { S().idcard.verified = true; S().idcard.email = mail; ctx.save(); }
        toast("Signed in", "success", card ? "Your ID card is verified and saved." : ""); next();
      }
      catch (err) { busy(btn, false); toast(/expired|invalid/i.test(err.message) ? "That code is wrong or expired" : err.message, "error", "Try again or request a new code."); }
    });
  };

  let roleSel = null;
  pages.role = () => {
    roleSel = roleSel || S().role || "student";
    return obShell(`<h1 style="font-size:28px">Set up your profile</h1><p class="muted mt-s">Choose your role to get a personalized experience.</p>
      <div class="mt-l">${[["student", "user", "purple", "I'm a Student", "Routine, CGPA, advising, deadlines and study tools"], ["faculty", "briefcase", "blue", "I'm a Faculty Member", "Free rooms, study vault and the faculty directory"], ["alumni", "cap", "red", "I'm an Alumni", "Stay connected: vault, reviews and campus tools"]]
        .map(([v, ic, tone, t, d]) => `<button class="role" data-role="${v}" aria-pressed="${roleSel === v}"><span class="itile ${tone}">${icon(ic)}</span><span class="grow"><b style="display:block">${t}</b><span class="xs">${d}</span></span><span class="ck">${roleSel === v ? icon("checkc") : ""}</span></button>`).join("")}</div>`,
      { back: ctx.cloud.enabled ? "#/login" : "#/welcome?s=2", foot: `<button class="btn primary lg block" id="role-go">Continue</button>` });
  };
  pages.role.mount = (el) => {
    $$("[data-role]", el).forEach((b) => b.addEventListener("click", () => { roleSel = b.dataset.role; ctx.rerender(); }));
    $("#role-go", el).addEventListener("click", () => { S().role = roleSel; ctx.save({ silent: true }); ctx.go("#/setup"); });
  };

  pages.setup = () => {
    const p = S().profile || {}, role = S().role, stu = role === "student";
    return obShell(`<div style="text-align:center"><span class="avatar lg" style="margin:0 auto">${esc(ctx.initials(p.name || "?"))}</span><h1 style="font-size:26px;margin-top:12px">Complete Your Profile</h1><p class="muted small mt-s">This helps us personalize your experience.</p>${stu ? `<button type="button" class="btn outline sm mt" id="su-card">${icon("scan")} ${S().idcard ? "Rescan my ID card" : "Fill from my ID card"}</button>` : ""}</div>
      <form id="su-form" class="stack mt" novalidate>
        <label class="field">Full Name<input class="input" name="name" autocomplete="name" value="${esc(p.name || "")}" required placeholder="Your full name"><span class="err" data-err="name" hidden></span></label>
        ${stu ? `<label class="field">Student ID<input class="input" name="id" inputmode="numeric" value="${esc(p.id || "")}" placeholder="2024-1-60-123"><span class="hint">Optional. Found on your ID card and portal.</span><span class="err" data-err="id" hidden></span></label>` : ""}
        ${role === "faculty" ? `<label class="field">Faculty Initials<input class="input" name="init" value="${esc(p.init || "")}" placeholder="e.g. ABC" maxlength="8"></label>` : ""}
        <label class="field">Department<input class="input" name="department" list="dept-list" value="${esc(p.department || "")}" placeholder="e.g. CSE"><datalist id="dept-list">${["CSE", "EEE", "ECE", "BBA", "Economics", "English", "Law", "Pharmacy", "Civil Engineering", "GEB", "Mathematics", "Sociology", "Information Studies"].map((d) => `<option value="${d}">`).join("")}</datalist></label>
        ${stu ? `<label class="field">Year<select class="select" name="year">${["1st Year", "2nd Year", "3rd Year", "4th Year", "Graduate"].map((y) => `<option ${p.year === y ? "selected" : ""}>${y}</option>`).join("")}</select></label>` : ""}
        ${role === "alumni" ? `<label class="field">Graduation year<input class="input" name="year" inputmode="numeric" value="${esc(p.year || "")}" placeholder="e.g. 2022"></label>` : ""}
      </form>`, { back: "#/role", foot: `<button class="btn primary lg block" id="su-go" form="su-form">Continue</button>` });
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
