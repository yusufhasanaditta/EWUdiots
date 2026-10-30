/* Members' space (#/club/space?c=<club id>&tab=…): only for the club's members (the database enforces it).
   Announcements · Calendar · Attendance · Polls & elections · Tasks · Docs · Members. */
import { createPosts } from "./posts.js";
import { parseQr } from "../checkin.js";

const TABS = [["posts", "Announcements", "megaphone"], ["calendar", "Calendar", "calendar"], ["attendance", "Attendance", "checkc"], ["polls", "Polls", "bars"], ["tasks", "Tasks", "clipboard"], ["docs", "Docs", "file"], ["members", "Members", "users"]];

/** @param {Record<string, any>} pages @param {any} kit */
export function register(pages, kit) {
  const { ui, icon, esc, api, store } = kit;
  const posts = createPosts(kit);
  const cid = () => kit.param("c") || "";
  const tab = () => (TABS.some(([t]) => t === kit.param("tab")) ? kit.param("tab") : "posts");
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
      return `<section class="cl-space-head" style="--cc:${esc(club.color)}">${ui.logo(club)}<div class="grow min0"><span class="cl-eyebrow">Members' space</span><h1 class="ellipsis">${esc(club.name)}</h1><p class="xs">${ui.rolePill(m.rank, m.role_name)} ${m.title ? esc(m.title) : ""}${m.wing ? ` · ${esc(m.wing)} wing` : ""}</p></div>
          <div class="row" style="gap:8px">${kit.canManage(id) ? `<a class="btn sm white" href="#/club/manage?c=${id}">${icon("settings", "sm")} Manage</a>` : ""}<a class="btn sm glass" href="#/club/c?slug=${encodeURIComponent(club.slug)}">Profile</a></div></section>
        <nav class="cl-tabs scroll" role="tablist">${TABS.map(([v, l, ic]) => `<a role="tab" href="#/club/space?c=${id}&tab=${v}" aria-selected="${t === v}">${icon(ic, "sm")} ${l}</a>`).join("")}</nav>
        <div class="mt">${SECTIONS[t](club, m)}</div>`;
    }, { n: 2, h: 120 });
  };

  /* ── Sections ── */
  const SECTIONS = {
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
