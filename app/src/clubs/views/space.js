/* Members' space (#/club/space?c=<club id>&tab=…): only for the club's members (the database enforces it).
   Announcements · Calendar · Attendance · Polls & elections · Tasks · Docs · Members. */
import { createPosts } from "./posts.js";
import { parseQr } from "../checkin.js";
import { CATEGORIES } from "../perms.js";

const TABS = [["home", "Workspace", "grid"], ["me", "My panel", "user"], ["posts", "Announcements", "megaphone"], ["calendar", "Calendar", "calendar"], ["attendance", "Attendance", "checkc"], ["polls", "Polls", "bars"], ["tasks", "Tasks", "clipboard"], ["docs", "Docs", "file"], ["members", "Members", "users"]];

/* What each position is for (matched on the position's name); the last one is the default. */
const DUTIES = [
  [/advisor/i, ["Guide the committee and approve big decisions", "Sign off on budgets and elections", "Keep the club aligned with university rules"]],
  [/club admin/i, ["Run the club's page, settings and features", "Give positions to the committee and members", "Hand over to the next committee each year"]],
  [/^president/i, ["Lead the committee and chair meetings", "Approve events, posts and spending", "Represent the club to faculty, sponsors and other clubs"]],
  [/vice/i, ["Stand in for the President", "Coordinate the wings and their projects", "Follow up on action items from meetings"]],
  [/secretary/i, ["Write agendas and minutes for every meeting", "Keep members informed with announcements", "Look after documents and records"]],
  [/treasurer|finance/i, ["Keep the finance book up to date", "Collect and record payments and receipts", "Report the balance at every meeting"]],
  [/wing|head|executive/i, ["Lead your wing's projects and tasks", "Plan events with the committee", "Mentor new members in your wing"]],
  [/moderator/i, ["Keep chats and comments friendly", "Review reported posts", "Help members find their way"]],
  [/merch/i, ["Manage products, stock and orders", "Verify payments and pickups", "Plan new merch with the committee"]],
  [/senior/i, ["Help with events and projects", "Mentor general members", "Vote in polls and elections"]],
  [/./, ["Join events, meetings and projects", "Vote in polls and elections", "Share ideas with the committee"]]
];

/** @param {Record<string, any>} pages @param {any} kit */
export function register(pages, kit) {
  const { ui, icon, esc, api, store } = kit;
  const posts = createPosts(kit);
  const cid = () => kit.param("c") || "";
  const tab = () => (TABS.some(([t]) => t === kit.param("tab")) ? kit.param("tab") : "home");
  const clubE = (id) => store.use(`clubid:${id}`, () => api.clubById(id), { ttl: 5 * 60e3 });

  pages["club/space"] = () => {
    const g = kit.gate("the members' space"); if (g) return g;
    const id = cid(), ms = kit.memberships();
    if (ms.loading && !ms.value) return ui.skeleton(3);
    const m = kit.membership(id);
    return ui.view(clubE(id), (club) => {
      if (!club) return ui.emptyBox("search", "Club not found", "");
      if (!m) return ui.emptyBox("lock", "This space is for members", `Join ${esc(club.name)} to see its announcements, polls and tasks.`, `<a class="btn primary" href="#/club/c?slug=${encodeURIComponent(club.slug)}">View the club</a>`);
      const t = tab();
      // Header from the "Workspace Dashboard" board: cover, logo over its edge, name, tags, the Member menu, about.
      return `<section class="cl-sphead" style="--cc:${esc(club.color)}"><div class="cover">${club.cover_url ? `<img src="${esc(club.cover_url)}" alt="">` : `<span class="tagline">${esc(club.tagline || "Learn · Build · Create · Together")}</span>`}</div>
          <div class="id">${ui.logo(club, "xl")}<div class="grow min0"><h1>${esc(club.short_name || club.name)}${ui.verified(club)}</h1><p class="tags">${[CATEGORIES[club.category] || "Club", "Members' space", m.wing ? `${m.wing} wing` : ""].filter(Boolean).map(esc).join(" · ")}</p></div>
            <button class="btn primary sm" id="sp-menu" aria-haspopup="dialog">${esc(m.title || m.role_name || "Member")} ${icon("chevD", "sm")}</button></div>
          ${club.about || club.tagline ? `<p class="about clamp3">${esc(club.about || club.tagline)}</p>` : ""}</section>
        <nav class="cl-seg sm" role="tablist">${TABS.map(([v, l]) => `<a role="tab" href="#/club/space?c=${id}&tab=${v}" aria-selected="${t === v}">${l}</a>`).join("")}</nav>
        <div class="mt">${SECTIONS[t](club, m)}</div>`;
    }, { n: 2, h: 120 });
  };

  /* ── Sections ── */
  const SECTIONS = {
    /** My panel: the member's own position, what that position is for, and every tool their permissions open. */
    me(club, m) {
      const id = club.id, can = (p) => kit.can(id, p), M = (tab) => `#/club/manage?c=${id}&tab=${tab}`;
      const TOOLS = [["posts.write", "megaphone", "pink", "Announcements", "Write news for members or everyone", M("posts")], ["events.manage", "calendar", "blue", "Events", "Create events, registrations and tickets", M("events")],
        ["events.checkin", "scan", "teal", "Check-in", "Scan tickets at the door", `#/club/scan?c=${id}`], ["forms.create", "clipboard", "orange", "Forms", "Registration and recruitment forms", M("forms")],
        ["recruitment.evaluate", "userpen", "purple", "Recruitment", "Review and score applicants", `#/club/recruit?c=${id}`], ["members.approve", "users", "green", "Members", "Requests, contact details, removals", M("members")],
        ["members.invite", "mail", "blue", "Invites", "Invite people into the club", M("invites")], ["members.promote", "shield", "purple", "Positions", "Give positions, titles and wings", M("roles")],
        ["meetings.manage", "clipboard", "teal", "Meetings", "Agendas, minutes, action items", `#/club/meetings?c=${id}`], ["projects.manage", "kanban", "orange", "Projects", "Boards and tasks for teams", `#/club/projects?c=${id}`],
        ["polls.create", "bars", "green", "Polls", "Ask members to vote", `#/club/polls?c=${id}`], ["elections.manage", "ballot", "red", "Elections", "Committee elections", `#/club/elections?c=${id}`],
        ["finance.view", "wallet", "green", "Finance", "Budgets, income and expenses", `#/club/finance?c=${id}`], ["store.manage", "bag", "pink", "Merch store", "Products and stock", M("products")],
        ["orders.manage", "receipt", "orange", "Orders", "Payments, pickups and returns", `#/club/ordersadmin?c=${id}`], ["sponsors.manage", "handshake", "blue", "Sponsors", "Sponsor packages", `#/club/sponsors?c=${id}`],
        ["analytics.view", "chart", "purple", "Analytics", "How the club is doing", `#/club/analytics?c=${id}`], ["settings.edit", "settings", "gray", "Club profile", "Logo, cover, about, committee history", M("settings")],
        ["audit.view", "eye", "gray", "Audit log", "Who changed what", M("audit")]].filter(([p]) => can(p));
      const name = String(m.title || m.role_name || "Member"), duty = DUTIES.find(([re]) => re.test(name))?.[1] || DUTIES[DUTIES.length - 1][1];
      const te = store.use(`club:tasks:${id}`, () => api.tasks(id), { ttl: 30e3 }), mineT = (te.value || []).filter((x) => x.assignee === kit.me()?.id && x.status !== "done");
      return `<section class="cl-mypanel"><div class="row nowrap" style="gap:14px">${ui.logo(club, "lg")}<div class="grow min0"><span class="xs">Your position in ${esc(club.short_name || club.name)}</span><h2>${esc(name)}</h2>
          <p class="small">${ui.rolePill(m.rank, m.role_name)}${m.wing ? ` · ${esc(m.wing)} wing` : ""}</p></div></div>
          <ul class="cl-duties">${duty.map((d) => `<li>${icon("checkc", "sm")}<span>${esc(d)}</span></li>`).join("")}</ul></section>
        ${ui.sec(TOOLS.length ? `Your tools · ${TOOLS.length}` : "Your tools")}
        ${TOOLS.length ? `<div class="cl-tools">${TOOLS.map(([, ic, tone, t, d, href]) => `<a class="cl-tool" href="${href}"><span class="itile ${tone}">${icon(ic)}</span><b>${t}</b><span class="xs">${d}</span></a>`).join("")}</div>`
          : `<p class="small muted">As a ${esc(name)} you join events, polls, meetings and projects. Your committee can give you more responsibilities.</p>`}
        ${ui.sec(`My open tasks · ${mineT.length}`)}
        ${mineT.length ? `<div class="cl-list">${mineT.slice(0, 8).map((x) => `<a class="cl-li" href="#/club/space?c=${id}&tab=tasks"><span class="itile sm orange">${icon("clipboard")}</span><span class="body"><b>${esc(x.title)}</b><span>${x.due ? `Due ${new Date(x.due).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : "No due date"}</span></span></a>`).join("")}</div>` : '<p class="small muted">Nothing assigned to you right now.</p>'}`;
    },
    /** Workspace dashboard ("Workspace Dashboard" board): numbers, tools, what's next, my tasks, news and chats. */
    home(club, m) {
      const id = club.id, f = (k) => kit.feature(id, k), counts = store.use("clubs:counts", api.counts, { ttl: 60e3 }).value?.[id] || {};
      const pe = f("projects") ? store.use(`club:projects:${id}`, () => api.projects(id), { ttl: 60e3 }).value || [] : [];
      const te = store.use(`club:tasks:${id}`, () => api.tasks(id), { ttl: 30e3 }), tasks = te.value || [];
      const ee = store.use(`club:events:${id}`, () => api.clubEvents(id), { ttl: 60e3 }).value || [];
      const me = f("meetings") ? store.use(`club:meetings:${id}`, () => api.meetings(id), { ttl: 60e3 }).value || [] : [];
      const ch = f("chat") ? (store.use("me:channels", api.channels, { ttl: 30e3 }).value || []).filter((c) => c.club_id === id) : [];
      const pp = store.use(`club:posts:${id}`, () => api.clubPosts(id), { ttl: 30e3 }).value || [];
      const now = Date.now(), upcoming = [...ee.filter((e) => new Date(e.starts_at) > now).map((e) => ({ at: e.starts_at, title: e.title, place: e.venue, href: `#/club/event?id=${e.id}` })),
        ...me.filter((x) => new Date(x.starts_at) > now && x.status !== "cancelled").map((x) => ({ at: x.starts_at, title: x.title, place: x.location || "Online", href: `#/club/meeting?id=${x.id}`, red: true }))].sort((a, b) => new Date(a.at) - new Date(b.at)).slice(0, 4);
      const mine = tasks.filter((t) => t.assignee === kit.me()?.id && t.status !== "done").slice(0, 4);
      const tiles = [["megaphone", "pink", "Announcements", `#/club/space?c=${id}&tab=posts`], ["users", "blue", "Members", `#/club/members?c=${id}`], ["checksq", "green", "Tasks", `#/club/space?c=${id}&tab=tasks`],
        f("meetings") && ["clipboard", "purple", "Meetings", `#/club/meetings?c=${id}`], f("projects") && ["kanban", "orange", "Projects", `#/club/projects?c=${id}`], f("resources") && ["folder", "red", "Resources", `#/club/resources?c=${id}`],
        f("chat") && ["chat", "blue", "Discussions", "#/club/messages"], ["calendar", "amber", "Events", `#/club/space?c=${id}&tab=calendar`], f("polls") && ["bars", "teal", "Polls", "#/club/polls"], f("elections") && ["ballot", "purple", "Elections", "#/club/elections"],
        ["award", "green", "Committee", `#/club/committee?c=${id}`], kit.can(id, "finance.view") && f("finance") && ["wallet", "amber", "Finance", `#/club/finance?c=${id}`], kit.can(id, "analytics.view") && ["chart", "blue", "Analytics", `#/club/analytics?c=${id}`],
        (kit.can(id, "store.manage") || kit.can(id, "orders.manage")) && ["bag", "orange", "Merch", `#/club/merch?c=${id}`], kit.can(id, "forms.view_responses") && ["userpen", "purple", "Recruitment", "#/club/recruit"]].filter(Boolean);
      return `<div class="alert pink"><span class="a-ic">${icon("megaphone")}</span><div class="grow"><b>This is a private member workspace</b><p>Only club members can access this content.</p></div></div>
        <div class="cl-stats c4 mt">${ui.stat("users", "purple", counts.members || 0, "Members")}${f("projects") ? ui.stat("layers", "blue", pe.length, "Projects") : ""}${ui.stat("checksq", "green", tasks.filter((t) => t.status !== "done").length, "Ongoing tasks")}${ui.stat("calendar", "amber", ee.filter((e) => new Date(e.starts_at) > now).length, "Upcoming events")}</div>
        <div class="cl-tiles">${tiles.map((t) => ui.tile(...t)).join("")}</div>
        ${ui.sec("Upcoming Activities", `<a href="#/club/space?c=${id}&tab=calendar">View all</a>`)}${upcoming.length ? `<div class="cl-row2 keep">${upcoming.map((x) => `<a class="cl-sched" href="${x.href}">${ui.dchip(x.at, x.red ? "red" : "")}<span class="min0 grow"><b class="clamp2">${esc(x.title)}</b><span class="xs">${icon("clock")} ${ui.time(x.at)}</span>${x.place ? `<span class="xs ellipsis">${icon("pin")} ${esc(x.place)}</span>` : ""}</span>${icon("chevR", "sm")}</a>`).join("")}</div>` : `<p class="small muted">Nothing scheduled.</p>`}
        ${ui.sec("My Tasks", `<a href="#/club/space?c=${id}&tab=tasks">View all</a>`)}${mine.length ? `<div class="cl-list">${mine.map((t) => `<a class="cl-li" href="${t.project_id ? `#/club/project?id=${t.project_id}` : `#/club/space?c=${id}&tab=tasks`}"><span class="itile sm ${t.status === "doing" ? "blue" : "gray"}">${icon("checksq")}</span><span class="body"><b>${esc(t.title)}</b><span>${t.due ? `Due ${ui.dateShort(t.due)}` : "No due date"}</span></span>${ui.st({ high: ["High", "red"], medium: ["Medium", "amber"], low: ["Low", "gray"] }[t.priority] || ["Medium", "amber"])}</a>`).join("")}</div>` : `<p class="small muted">No tasks for you.</p>`}
        <div class="cl-row2 keep"><section>${ui.sec("Recent Announcements", `<a href="#/club/space?c=${id}&tab=posts">View all</a>`)}${pp.length ? `<div class="cl-list">${pp.slice(0, 3).map((p) => `<a class="cl-li" href="#/club/post?id=${p.id}"><span class="itile sm pink">${icon("megaphone")}</span><span class="body"><b class="ellipsis">${esc(p.title)}</b><span>${ui.ago(p.created_at)}</span></span>${icon("chevR", "sm")}</a>`).join("")}</div>` : `<p class="small muted">No announcements yet.</p>`}</section>
          ${f("chat") ? `<section>${ui.sec("Unread Messages", `<a href="#/club/messages">View all</a>`)}${ch.length ? `<div class="cl-list">${ch.slice(0, 3).map((c) => `<a class="cl-li" href="#/club/chat?id=${c.id}">${ui.ava(c.name)}<span class="body"><b class="ellipsis">${esc(c.name)}</b><span class="ellipsis">${esc(c.last_body || "No messages yet")}</span></span>${c.unread ? `<span class="badge-n">${c.unread}</span>` : ""}</a>`).join("")}</div>` : `<p class="small muted">No chats yet.</p>`}</section>` : ""}</div>
        ${m.rank <= 3 || kit.canManage(id) ? `<a class="btn outline mt" href="#/club/manage?c=${id}">${icon("settings")} Open the club console</a>` : ""}`;
    },
    posts(club) {
      const pe = store.use(`club:posts:${club.id}`, () => api.clubPosts(club.id), { ttl: 30e3 });
      const write = kit.can(club.id, "posts.write") ? `<a class="btn sm primary" href="#/club/manage?c=${club.id}&tab=posts&new=1">${icon("plus", "sm")} New post</a>` : "";
      return `<div class="row between" style="margin-bottom:10px"><p class="xs">Members-only posts are marked; public ones are on the club's profile too.</p>${write}</div>` + ui.view(pe, (rows) => {
        if (!rows.length) return ui.emptyBox("megaphone", "No announcements yet", "");
        const mt = posts.meta(rows);
        return `<div class="stack">${rows.map((p) => posts.card(p, mt, { showClub: false })).join("")}</div>`;
      });
    },
    calendar(club) {
      const ee = store.use(`club:events:${club.id}`, () => api.clubEvents(club.id), { ttl: 45e3 });
      const se = store.use(`club:sessions:${club.id}`, () => api.sessions(club.id), { ttl: 30e3 });
      return ui.view(ee, (evs) => {
        const ses = se.value || [], now = Date.now();
        const items = [...evs.map((e) => ({ at: e.starts_at, title: e.title, sub: e.venue, tag: e.visibility === "members" ? ui.pill(`${icon("lock", "sm")} Members`, "purple") : ui.pill("Public"), href: e.form_id ? `#/club/form?id=${e.form_id}` : `#/events?id=${e.id}` })),
          ...ses.map((s) => ({ at: s.starts_at, title: s.title, sub: "Meeting", tag: s.open ? ui.pill("Check-in open", "green") : "", href: `#/club/space?c=${club.id}&tab=attendance` }))]
          .sort((a, b) => new Date(a.at) - new Date(b.at));
        const up = items.filter((x) => new Date(x.at) >= now - 3 * 36e5), past = items.filter((x) => new Date(x.at) < now - 3 * 36e5).reverse().slice(0, 15);
        const list = (l) => `<section class="card tight">${l.map((x) => `<a class="lrow" href="${x.href}"><span class="cl-cal-date"><b>${ui.when(x.at, { day: "numeric" })}</b><span>${ui.when(x.at, { month: "short" })}</span></span><span class="body"><b>${esc(x.title)}</b><span>${ui.dateTime(x.at)}${x.sub ? ` · ${esc(x.sub)}` : ""}</span></span>${x.tag}</a>`).join("")}</section>`;
        return `${up.length ? `<h2 class="cl-h2">Coming up</h2>${list(up)}` : ui.emptyBox("calendar", "Nothing scheduled", "Events and meetings appear here.")}${past.length ? `<h2 class="cl-h2">Earlier</h2>${list(past)}` : ""}`;
      });
    },
    attendance(club) {
      const se = store.use(`club:sessions:${club.id}`, () => api.sessions(club.id), { ttl: 20e3 });
      const ae = store.use(`club:myatt:${club.id}`, () => api.attendance(club.id), { ttl: 20e3 });
      return ui.view(se, (ses) => {
        const mine = new Set((ae.value || []).filter((a) => a.user_id === kit.me()?.id).map((a) => a.session_id));
        const pct = ses.length ? Math.round((100 * ses.filter((s) => mine.has(s.id)).length) / ses.length) : null;
        const open = ses.filter((s) => s.open && !mine.has(s.id));
        return `<div class="grid g2">
          <section class="card row nowrap"><div class="ring sm ${pct == null || pct >= 70 ? "green" : "red"}" style="--p:${pct ?? 0}"><div><b>${pct ?? "—"}${pct == null ? "" : "%"}</b></div></div><div><b>Your attendance</b><p class="small muted">${ses.length ? `${mine.size} of ${ses.length} meetings` : "No meetings recorded yet"}</p></div></section>
          <section class="card"><b>${icon("scan", "sm")} At a meeting?</b><p class="small muted">Type the 6-digit code on the organiser's screen, or scan its QR code.</p><button class="btn primary mt-s" id="sp-checkin" ${ses.some((s) => s.open) ? "" : "disabled"}>${icon("checkc")} Check in</button></section></div>
          ${open.length ? `<div class="alert green mt"><span class="a-ic">${icon("bell")}</span><div><b>Check-in is open: ${esc(open[0].title)}</b><p>Started ${ui.ago(open[0].starts_at)}.</p></div></div>` : ""}
          <h2 class="cl-h2">Meetings</h2>${ses.length ? `<section class="card tight">${ses.map((s) => `<div class="lrow"><span class="itile sm ${mine.has(s.id) ? "green" : "gray"}">${icon(mine.has(s.id) ? "checkc" : "clock")}</span><span class="body"><b>${esc(s.title)}</b><span>${ui.dateTime(s.starts_at)}</span></span>${mine.has(s.id) ? ui.pill("Present", "green") : s.open ? ui.pill("Open", "amber") : ui.pill("Missed")}</div>`).join("")}</section>` : `<p class="small muted">No meetings yet.</p>`}`;
      });
    },
    polls(club) {
      const pe = store.use(`club:polls:${club.id}`, () => api.polls(club.id), { ttl: 20e3 });
      return (kit.can(club.id, "polls.create") ? `<div class="row" style="justify-content:flex-end;margin-bottom:10px"><a class="btn sm primary" href="#/club/manage?c=${club.id}&tab=polls">${icon("plus", "sm")} New poll</a></div>` : "") + ui.view(pe, (rows) => {
        if (!rows.length) return ui.emptyBox("bars", "No polls yet", "Polls and elections for members appear here.");
        const voted = new Set(store.use(`club:voted:${club.id}`, () => api.myVotes(rows.map((p) => p.id)), { ttl: 20e3 }).value || []);
        return `<div class="stack">${rows.map((p) => pollCard(p, voted.has(p.id))).join("")}</div>`;
      });
    },
    tasks(club, m) {
      const te = store.use(`club:tasks:${club.id}`, () => api.tasks(club.id), { ttl: 20e3 });
      return (kit.can(club.id, "tasks.manage") ? `<div class="row" style="justify-content:flex-end;margin-bottom:10px"><a class="btn sm primary" href="#/club/manage?c=${club.id}&tab=tasks">${icon("plus", "sm")} Assign a task</a></div>` : "") + ui.view(te, (rows) => {
        const mine = rows.filter((t) => t.assignee === kit.me()?.id), wing = rows.filter((t) => t.assignee !== kit.me()?.id && (!t.wing || t.wing === m.wing));
        const row = (t, canMove) => `<div class="lrow cl-task ${t.status}"><span class="itile sm ${t.status === "done" ? "green" : t.status === "doing" ? "blue" : "orange"}">${icon(t.status === "done" ? "checkc" : "clipboard")}</span>
          <span class="body"><b>${esc(t.title)}</b><span>${t.assignee_name ? esc(t.assignee_name) : "Anyone"}${t.wing ? ` · ${esc(t.wing)}` : ""}${t.due ? ` · due ${ui.dateShort(t.due)}` : ""}</span>${t.notes ? `<span class="xs">${esc(t.notes)}</span>` : ""}</span>
          ${canMove ? ui.select(`st-${t.id}`, { todo: "To do", doing: "Doing", done: "Done" }, t.status, `data-task="${t.id}" aria-label="Status"`) : ui.pill({ todo: "To do", doing: "Doing", done: "Done" }[t.status])}</div>`;
        if (!rows.length) return ui.emptyBox("clipboard", "No tasks", "When organisers assign work, it shows up here.");
        return `${mine.length ? `<h2 class="cl-h2">Your tasks</h2><section class="card tight">${mine.map((t) => row(t, true)).join("")}</section>` : ""}${wing.length ? `<h2 class="cl-h2">${m.wing ? `${esc(m.wing)} wing` : "Club"} tasks</h2><section class="card tight">${wing.map((t) => row(t, kit.can(club.id, "tasks.manage"))).join("")}</section>` : ""}`;
      });
    },
    docs(club) {
      const de = store.use(`club:docs:${club.id}`, () => api.docs(club.id), { ttl: 60e3 });
      return (kit.can(club.id, "docs.manage") ? `<div class="row" style="justify-content:flex-end;margin-bottom:10px"><a class="btn sm primary" href="#/club/manage?c=${club.id}&tab=docs">${icon("plus", "sm")} Add a document</a></div>` : "") + ui.view(de, (rows) => (rows.length
        ? `<section class="card tight">${rows.map((d) => `<button class="lrow" data-doc="${d.id}"><span class="itile sm blue">${icon(d.path ? "file" : "link")}</span><span class="body"><b>${esc(d.title)}</b><span>${d.audience === "exec" ? "Executives · " : ""}${ui.ago(d.created_at)}</span></span>${icon("external", "chev")}</button>`).join("")}</section>`
        : ui.emptyBox("file", "No documents", "The constitution, meeting minutes and templates go here.")));
    },
    members(club) {
      const me = store.use(`club:members:${club.id}`, () => api.members(club.id), { ttl: 60e3 });
      return ui.view(me, (rows) => {
        const groups = rows.filter((r) => r.status === "active").reduce((g, r) => { (g[r.rank] = g[r.rank] || { name: r.role_name, list: [] }).list.push(r); return g; }, {});
        return `<p class="xs" style="margin-bottom:10px">${ui.plural(rows.filter((r) => r.status === "active").length, "member")}</p>` + Object.entries(groups).sort(([a], [b]) => a - b).map(([rank, g]) => `<h2 class="cl-h2">${ui.rolePill(Number(rank), g.name)} <span class="xs">${g.list.length}</span></h2><section class="card tight">${g.list.map((r) => ui.person(r.display_name, [r.title, r.wing && `${esc(r.wing)} wing`, r.department].filter(Boolean).map(esc).join(" · "))).join("")}</section>`).join("");
      });
    }
  };

  function pollCard(p, voted) {
    const closed = p.closed || (p.closes_at && new Date(p.closes_at) < Date.now());
    const showRes = voted || closed;
    const re = showRes ? store.use(`poll:res:${p.id}`, () => api.results(p.id), { ttl: 15e3 }).value : null;
    const total = re?.[0]?.voters || 0, max = Math.max(1, ...(re || []).map((x) => x.votes));
    return `<article class="card cl-poll" data-poll="${p.id}"><div class="row nowrap" style="gap:8px">${ui.pill(p.kind === "election" ? `${icon("crown", "sm")} Election` : `${icon("bars", "sm")} Poll`, p.kind === "election" ? "amber" : "purple")}${p.anonymous ? ui.pill(`${icon("lock", "sm")} Anonymous`) : ""}<span class="xs push">${closed ? "Closed" : p.closes_at ? `Closes ${ui.dateTime(p.closes_at)}` : "Open"}</span></div>
      <h3 class="mt-s">${esc(p.title)}</h3>${p.description ? `<p class="small muted">${ui.rich(p.description)}</p>` : ""}
      ${!showRes ? `<form class="stack mt-s" data-vote="${p.id}">${p.options.map((o, i) => `<label class="cl-opt"><input type="${p.multi ? "checkbox" : "radio"}" name="v" value="${i}"> <span>${esc(o)}</span></label>`).join("")}<button class="btn primary sm" style="justify-self:start">${icon("check", "sm")} Vote</button></form>`
        : re && re.length ? `<div class="stack mt-s">${p.options.map((o, i) => { const v = re.find((x) => x.choice === i)?.votes || 0; return `<div class="cl-bar"><div class="row between"><span class="small">${esc(o)}</span><b class="small num">${v}</b></div><i style="width:${(100 * v) / max}%"></i></div>`; }).join("")}<p class="xs">${ui.plural(total, "person", "people")} voted${voted ? " · you voted" : ""}</p></div>`
        : `<p class="small muted mt-s">${icon("checkc", "sm")} You voted. Results show when voting closes.</p>`}</article>`;
  }

  /* ── Check-in: type the code or scan the QR (where the browser can read QR codes) ── */
  function checkin(club) {
    const ses = (store.peek(`club:sessions:${club.id}`) || []).filter((s) => s.open);
    if (!ses.length) return;
    const scan = "BarcodeDetector" in window;
    ui.sheet("Check in", `<form id="ci-form" class="stack">
      ${ses.length > 1 ? ui.field("Meeting", ui.select("s", ses.map((s) => [s.id, s.title]))) : `<input type="hidden" name="s" value="${ses[0].id}"><p class="small"><b>${esc(ses[0].title)}</b></p>`}
      ${ui.field("Code on the screen", ui.input("code", "", 'inputmode="numeric" maxlength="6" autocomplete="one-time-code" class="input otp" placeholder="000000" required'))}
      ${scan ? `<button type="button" class="btn outline" id="ci-scan">${icon("scan")} Scan the QR code</button><video id="ci-video" playsinline muted hidden></video>` : ""}
      <div id="cl-err"></div><button class="btn primary block">${icon("checkc")} Check in</button></form>`, (m) => {
      const f = kit.$("#ci-form", m);
      const send = async (sid, code) => {
        try { const title = await api.checkin(sid, code); kit.ctx.closeModal(); store.invalidate(`club:myatt:${club.id}`); kit.toast("You're checked in", "success", title); }
        catch (err) { ui.fail(m, err.message); }
      };
      f.addEventListener("submit", (e) => { e.preventDefault(); const code = f.code.value.replace(/\D/g, ""); if (code.length !== 6) return ui.fail(m, "Enter the 6 digits on the screen."); send(f.s.value, code); });
      kit.$("#ci-scan", m)?.addEventListener("click", async () => {
        const video = kit.$("#ci-video", m);
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
          video.srcObject = stream; video.hidden = false; await video.play();
          const det = new window.BarcodeDetector({ formats: ["qr_code"] });
          const stop = () => stream.getTracks().forEach((t) => t.stop());
          const tick = async () => {
            if (!document.body.contains(video)) return stop();
            const hit = (await det.detect(video).catch(() => [])).map((c) => parseQr(c.rawValue)).find(Boolean);
            if (hit) { stop(); return send(hit.sessionId, hit.code); }
            requestAnimationFrame(tick);
          };
          tick();
        } catch { ui.fail(m, "The camera isn't available. Type the code instead."); }
      });
    });
  }

  pages["club/space"].mount = (el) => {
    const id = cid(), club = store.peek(`clubid:${id}`);
    posts.bind(el); kit.bindRetry(el); if (!club) return;
    kit.$("#sp-checkin", el)?.addEventListener("click", () => checkin(club));
    kit.$("#sp-menu", el)?.addEventListener("click", () => { const m = kit.membership(id);
      ui.sheet(club.name, `<p class="small muted">You are ${ui.rolePill(m?.rank, m?.role_name || "Member")}${m?.title ? ` · ${esc(m.title)}` : ""}</p><div class="stack mt" style="gap:0">${[["community", "Public club page", `#/club/c?slug=${encodeURIComponent(club.slug)}`], kit.canManage(id) && ["settings", "Club console", `#/club/manage?c=${id}`], ["user", "My club profile", "#/club/privacy"], ["ticket", "My tickets", "#/club/tickets"]].filter(Boolean).map(([ic, l, h]) => `<a class="lrow" href="${h}"><span class="itile purple">${icon(ic)}</span><span class="body"><b>${l}</b></span>${icon("chevR", "chev")}</a>`).join("")}</div>`); });
    kit.$$("[data-vote]", el).forEach((f) => f.addEventListener("submit", async (e) => {
      e.preventDefault(); const choices = kit.$$("input:checked", f).map((i) => Number(i.value));
      if (!choices.length) return kit.toast("Choose an option first", "warn");
      try { await api.vote(f.dataset.vote, choices); store.invalidate(`club:voted:${id}`, `poll:res:${f.dataset.vote}`); kit.toast("Vote saved", "success"); } catch (err) { kit.toast(err.message, "error"); }
    }));
    kit.$$("[data-task]", el).forEach((s) => s.addEventListener("change", async () => {
      try { await api.updateTask(s.dataset.task, { status: s.value }); store.invalidate(`club:tasks:${id}`); } catch (err) { kit.toast(err.message, "error"); }
    }));
    kit.$$("[data-doc]", el).forEach((b) => b.addEventListener("click", async () => {
      const d = (store.peek(`club:docs:${id}`) || []).find((x) => x.id === b.dataset.doc); if (!d) return;
      try { window.open(d.path ? await api.signedUrl(d.path) : d.url, "_blank", "noopener"); } catch (err) { kit.toast(err.message, "error"); }
    }));
  };
}
