/* Club home (#/club/home), from the "Student Dashboard" board: greeting, quick tiles, my clubs with my position,
   upcoming schedule (events + meetings), my tasks, recent announcements and unread messages. Someone in no club yet
   (or signed out) gets the discover version: find your community, upcoming events, clubs recruiting now. */

/** @param {Record<string, any>} pages @param {any} kit */
export function register(pages, kit) {
  const { ui, icon, esc, api, store, ctx } = kit;

  pages["club/home"] = () => {
    if (!api) return kit.gate("clubs");
    const mine = kit.myClubs();
    const ms = kit.memberships();
    if (kit.me() && ms.loading && !ms.value) return ui.skeleton(4, 110);
    return mine.length ? member(mine) : discover();
  };
  pages["club/home"].mount = (el) => kit.bindRetry(el);

  const greet = () => { const h = Number(new Date().toLocaleString("en-GB", { hour: "numeric", hour12: false, timeZone: "Asia/Dhaka" })); return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening"; };

  /* ── In at least one club ── */
  function member(mine) {
    const ids = mine.map((m) => m.club_id);
    const evE = store.use("club:upcoming", api.upcomingClubEvents, { ttl: 60e3 });
    const mtE = store.use(`me:meetings:${ids.join(",")}`, () => api.myMeetings(ids), { ttl: 60e3 });
    const tkE = store.use("me:tasks", api.myTasks, { ttl: 45e3 });
    const anE = store.use(`me:ann:${ids.join(",")}`, () => api.feed({ clubIds: ids, kind: "announcement", limit: 4 }), { ttl: 60e3 });
    const chE = store.use("me:channels", api.channels, { ttl: 30e3 });
    const name = ctx.firstName?.(ctx.S.profile?.name || kit.me()?.user_metadata?.name || "") || "there";
    const unreadMsgs = (chE.value || []).reduce((s, c) => s + (c.unread || 0), 0);

    const schedule = [...(evE.value || []).filter((e) => ids.includes(e.club_id)).map((e) => ({ at: e.starts_at, title: e.title, place: e.venue, href: `#/club/event?id=${e.id}`, red: false })),
      ...(mtE.value || []).map((m) => ({ at: m.starts_at, title: m.title, place: m.location || (m.online_link ? "Online" : ""), href: `#/club/meeting?id=${m.id}`, red: true }))]
      .filter((x) => new Date(x.at) > Date.now() - 3 * 36e5).sort((a, b) => new Date(a.at) - new Date(b.at)).slice(0, 4);

    return `<section class="cl-greet"><p style="margin:0;opacity:.85">${greet()},</p><h1>${esc(name)} 👋</h1><p>“Same campus. Different possibilities.”</p></section>
      <div class="cl-tiles c6">
        ${ui.tile("community", "purple", "My Clubs", "#/club/mine")}${ui.tile("calendar", "blue", "Events", "#/club/events")}
        ${ui.tile("checksq", "green", "Tasks", "#/club/me?tab=tasks", (tkE.value || []).length)}${ui.tile("clipboard", "orange", "Meetings", "#/club/meetings")}
        ${ui.tile("folder", "red", "Resources", `#/club/resources?c=${mine[0].club_id}`)}${ui.tile("grid", "purple", "More", "#/club/more")}</div>

      ${ui.sec("My Clubs", `<a href="#/club/mine">View all</a>`)}
      <div class="cl-hscroll">${mine.map((m) => `<a class="cl-mini" href="#/club/space?c=${m.club_id}" style="--cc:${esc(m.color)}"><span class="art">${m.logo_url ? `<img src="${esc(m.logo_url)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : esc(m.short_name?.replace(/^EWU/, "").slice(0, 5) || ui.initials(m.name))}</span>
        <b class="ellipsis">${esc(m.short_name || m.name)}</b>${ui.rolePill(m.rank, m.title || m.role_name)}</a>`).join("")}
        <a class="cl-mini" href="#/club/explore"><span class="art" style="--cc:#94a3b8">${icon("plus")}</span><b>Join more</b></a></div>

      ${ui.sec("Upcoming Schedule", `<a href="#/club/events">View all</a>`)}
      ${evE.loading && !evE.value ? ui.skeleton(2, 70) : schedule.length ? `<div class="cl-row2">${schedule.map((x) => `<a class="cl-sched" href="${x.href}">${ui.dchip(x.at, x.red ? "red" : "")}<span class="min0 grow"><b class="ellipsis">${esc(x.title)}</b>
          <span class="xs">${icon("clock")} ${ui.time(x.at)}</span>${x.place ? `<span class="xs ellipsis">${icon("pin")} ${esc(x.place)}</span>` : ""}</span>${icon("chevR", "sm")}</a>`).join("")}</div>`
        : `<p class="small muted">Nothing scheduled. Club events and meetings will show here.</p>`}

      ${ui.sec("My Tasks", `<a href="#/club/me?tab=tasks">View all</a>`)}
      ${ui.view(tkE, (rows) => (rows.length ? `<div class="cl-list">${rows.slice(0, 4).map((t) => taskRow(t)).join("")}</div>` : `<p class="small muted">No tasks for you right now.</p>`), { n: 2, h: 56 })}

      <div class="cl-row2">
        <section>${ui.sec("Recent Announcements", `<a href="#/club/feed">View all</a>`)}
          ${ui.view(anE, (rows) => (rows.length ? `<div class="cl-list">${rows.slice(0, 3).map((p) => `<a class="cl-li" href="#/club/post?id=${p.id}"><span class="itile sm pink">${icon("megaphone")}</span><span class="body"><b class="ellipsis">${esc(p.title)}</b><span>${esc(p.clubs?.short_name || p.clubs?.name || "")} · ${ui.ago(p.created_at)}</span></span></a>`).join("")}</div>`
            : `<p class="small muted">No announcements yet.</p>`), { n: 2, h: 56 })}</section>
        <section>${ui.sec(`Unread Messages${unreadMsgs ? ` <span class="badge-n">${unreadMsgs}</span>` : ""}`, `<a href="#/club/messages">View all</a>`)}
          ${ui.view(chE, (rows) => { const list = rows.filter((c) => c.last_body).slice(0, 3); return list.length ? `<div class="cl-list">${list.map((c) => `<a class="cl-li" href="#/club/chat?id=${c.id}">${c.kind === "dm" ? ui.ava(c.other_name) : ui.logo({ name: c.club_name, short_name: c.club_short, color: c.club_color, logo_url: c.club_logo }, "sm")}
              <span class="body"><b class="ellipsis">${esc(c.name)}</b><span class="ellipsis">${esc(c.last_author ? `${c.last_author.split(" ")[0]}: ` : "")}${esc(c.last_body)}</span></span>${c.unread ? `<span class="dot-unread" aria-label="${c.unread} unread"></span>` : ""}</a>`).join("")}</div>`
            : `<p class="small muted">No messages yet. Say hello in your club's chat.</p>`; }, { n: 2, h: 56 })}</section></div>
      <p class="xs mt" style="text-align:center">Unofficial · not affiliated with EWU</p>`;
  }

  function taskRow(t) {
    const due = t.due ? new Date(`${t.due}T23:59:00+06:00`) : null, late = due && due < Date.now();
    const pr = { high: ["High", "red"], medium: ["Medium", "amber"], low: ["Low", "gray"] }[t.priority] || ["Medium", "amber"];
    return `<a class="cl-li" href="${t.project_id ? `#/club/project?id=${t.project_id}` : `#/club/space?c=${t.club_id}&tab=tasks`}"><span class="itile sm ${t.status === "doing" ? "blue" : "gray"}">${icon(t.status === "doing" ? "clock" : "checksq")}</span>
      <span class="body"><b class="ellipsis">${esc(t.title)}</b><span>${esc(t.clubs?.short_name || "")}</span></span>
      <span class="end">${ui.st(pr)}${due ? `<span class="st ${late ? "red" : "gray"}">Due ${ui.dateShort(due)}</span>` : ""}</span></a>`;
  }

  /* ── Not in a club yet ── */
  function discover() {
    const ce = store.use("clubs:all", api.listClubs, { ttl: 5 * 60e3 });
    const evE = store.use("club:upcoming", api.upcomingClubEvents, { ttl: 60e3 });
    const recruiting = (ce.value || []).filter((c) => c.recruiting && c.status === "active");
    return `<section class="cl-banner"><span class="cl-eyebrow">${icon("sparkle", "sm")} EWUdiots Club</span><h2>Find Your Community At EWU</h2><p style="opacity:.9;max-width:420px">${ui.plural((ce.value || []).length || 23, "club")} at East West University. Follow them, register for events and apply to join, all in one place.</p>
        <a class="btn white" href="#/club/explore">Explore Clubs ${icon("arrow", "sm")}</a></section>
      ${!kit.me() ? `<div class="alert purple mt"><span class="a-ic">${icon("user")}</span><div class="grow"><b>Sign in to join clubs</b><p>Your club admin can then add you, and your workspace opens automatically.</p></div><a class="btn sm primary" href="#/login?from=profile">Sign in</a></div>` : ""}
      <div class="cl-tiles c6 mt">${[["community", "purple", "All Clubs", "#/club/explore"], ["cap", "blue", "Academic", "#/club/explore?cat=science"], ["star", "pink", "Cultural", "#/club/explore?cat=arts"],
        ["trophy", "orange", "Sports", "#/club/explore?cat=sports"], ["zap", "teal", "Tech", "#/club/explore?cat=tech"], ["globe", "green", "Social", "#/club/explore?cat=social"]].map((t) => ui.tile(...t)).join("")}</div>
      ${ui.sec("Upcoming Events", `<a href="#/club/events">See all</a>`)}
      ${ui.view(evE, (rows) => (rows.length ? `<div class="cl-list">${rows.slice(0, 4).map((e) => `<a class="cl-li" href="#/club/event?id=${e.id}">${ui.dchip(e.starts_at)}<span class="body"><b class="ellipsis">${esc(e.title)}</b><span>${esc(e.clubs?.name || "")} · ${ui.dateTime(e.starts_at)}</span></span><span class="btn sm outline">View</span></a>`).join("")}</div>`
        : `<p class="small muted">No upcoming club events yet.</p>`), { n: 3, h: 60 })}
      ${recruiting.length ? `${ui.sec("Recruiting now")}<div class="cl-grid">${recruiting.slice(0, 4).map((c) => ui.clubCard(c)).join("")}</div>` : ""}
      <p class="xs mt" style="text-align:center">Club list from ewubd.edu/clubs. Unofficial · not affiliated with EWU.</p>`;
  }
}
