/* Club console (#/club/manage?c=<club id>&tab=…) for the people who run a club. Every section declares the
   permission it needs; the console only lists sections you can use (and the database refuses the rest anyway).
   Sections live in manage-*.js: content (posts, events, history), forms (builder + responses), ops (attendance,
   polls, tasks, docs, certificates, finance) and, here, overview, people, settings, handover and the audit log. */
import { contentSections } from "./manage-content.js";
import { formSections } from "./manage-forms.js";
import { opsSections } from "./manage-ops.js";
import { CATEGORIES, JOIN_MODES, PERM_GROUPS, FEATURES, RANK_GROUPS, assignableRanks, assignableRoles, has } from "../perms.js";

const GROUPS = ["Club", "Content", "People", "Activities", "Admin"];

/** @param {Record<string, any>} pages @param {any} kit */
export function register(pages, kit) {
  const { ui, icon, esc, api, store } = kit;
  const cid = () => kit.param("c") || "";
  const clubE = (id) => store.use(`clubid:${id}`, () => api.clubById(id), { ttl: 2 * 60e3 });

  /** @type {Record<string, { label: string, icon: string, group: string, perm: string|null, render: (club: any, m: any) => string, mount?: (el: HTMLElement, club: any, m: any) => void }>} */
  const S = { ...overview(), ...contentSections(kit), ...formSections(kit), ...people(), ...opsSections(kit), ...admin() };
  const allowed = (m, s) => !s.perm || has(m, s.perm) || (s.perm === "rank<=2" && m.rank <= 2);

  pages["club/manage"] = () => {
    const g = kit.gate("the club console"); if (g) return g;
    const id = cid(), ms = kit.memberships();
    if (ms.loading && !ms.value) return ui.skeleton(3);
    const m = kit.membership(id);
    if (!m || !kit.canManage(id)) return ui.emptyBox("lock", "Only the club's organisers can open this", "Ask your club admin for a role with permissions.", `<a class="btn primary" href="#/club/mine">My clubs</a>`);
    return ui.view(clubE(id), (club) => {
      if (!club) return ui.emptyBox("search", "Club not found", "");
      const list = Object.entries(S).filter(([, s]) => allowed(m, s));
      const t = list.some(([k]) => k === kit.param("tab")) ? kit.param("tab") : "overview", sec = S[t];
      return `<div class="cl-console">
        <aside class="cl-console-nav" aria-label="Club console">
          <a class="cl-console-club" href="#/club/c?slug=${encodeURIComponent(club.slug)}">${ui.logo(club, "sm")}<span class="min0"><b class="ellipsis">${esc(club.short_name || club.name)}</b><span class="xs">${esc(m.role_name)}</span></span></a>
          ${GROUPS.map((gname) => { const items = list.filter(([, s]) => s.group === gname); return items.length ? `<p class="cl-console-h">${gname}</p>${items.map(([k, s]) => `<a href="#/club/manage?c=${id}&tab=${k}" ${k === t ? 'aria-current="page"' : ""}>${icon(s.icon, "sm")}<span>${s.label}</span></a>`).join("")}` : ""; }).join("")}
          <a class="cl-console-exit" href="#/club/space?c=${id}">${icon("chevL", "sm")} Members' space</a></aside>
        <section class="cl-console-main min0">
          <select class="select cl-console-pick" aria-label="Section" id="mg-pick">${GROUPS.map((gname) => { const items = list.filter(([, s]) => s.group === gname); return items.length ? `<optgroup label="${gname}">${items.map(([k, s]) => `<option value="${k}" ${k === t ? "selected" : ""}>${s.label}</option>`).join("")}</optgroup>` : ""; }).join("")}</select>
          ${sec.render(club, m)}</section></div>`;
    }, { n: 2, h: 160 });
  };
  pages["club/manage"].mount = (el) => {
    kit.bindRetry(el);
    const id = cid(), club = store.peek(`clubid:${id}`), m = kit.membership(id); if (!club || !m) return;
    kit.$("#mg-pick", el)?.addEventListener("change", (e) => kit.go(`#/club/manage?c=${id}&tab=${e.target.value}`));
    const t = Object.keys(S).includes(kit.param("tab")) ? kit.param("tab") : "overview";
    if (allowed(m, S[t])) S[t].mount?.(el, club, m);
  };

  /* ═════════ Overview ═════════ */
  function overview() {
    return { overview: { label: "Overview", icon: "grid", group: "Club", perm: null,
      render(club, m) {
        const counts = store.use("clubs:counts", api.counts, { ttl: 30e3 }).value?.[club.id] || { members: 0, followers: 0 };
        const reqs = has(m, "members.approve") ? store.use(`club:requests:${club.id}`, () => api.requests(club.id), { ttl: 30e3 }).value || [] : [];
        const forms = has(m, "forms.create") || has(m, "forms.view_responses") ? store.use(`club:forms:${club.id}`, () => api.forms(club.id), { ttl: 30e3 }).value || [] : [];
        const evs = store.use(`club:events:${club.id}`, () => api.clubEvents(club.id), { ttl: 60e3 }).value || [];
        const upcoming = evs.filter((e) => new Date(e.starts_at) > Date.now()).length;
        const k = (ic, tone, n, l, href) => `<a class="cl-kpi" href="${href}"><span class="itile ${tone}">${icon(ic)}</span><b class="num">${n}</b><span>${l}</span></a>`;
        // A short setup checklist for a club that's new on EWUdiots.
        const steps = [[!!club.about, "Write the club's introduction", "settings"], [!!club.logo_url, "Add a logo", "settings"], [counts.members > 1, "Invite your committee and members", "invites"], [forms.length > 0, "Open a registration form", "forms"], [evs.length > 0, "Announce an event", "events"]];
        const todo = steps.filter(([done]) => !done);
        return `${kit.head("Overview", `Signed in as ${esc(m.title || m.role_name)}.`)}
          <div class="cl-kpis">${k("users", "purple", counts.members, "Members", `#/club/manage?c=${club.id}&tab=members`)}${k("bell", "blue", counts.followers, "Followers", `#/club/c?slug=${encodeURIComponent(club.slug)}`)}
            ${has(m, "members.approve") ? k("userpen", reqs.length ? "orange" : "green", reqs.length, "Join requests", `#/club/manage?c=${club.id}&tab=invites`) : ""}${k("edit", "teal", forms.filter((f) => f.status === "open").length, "Open forms", `#/club/manage?c=${club.id}&tab=forms`)}${k("calendar", "pink", upcoming, "Upcoming events", `#/club/manage?c=${club.id}&tab=events`)}</div>
          ${todo.length && m.rank <= 3 ? `<section class="card mt"><div class="card-h"><h2>${icon("listcheck", "sm")} Get your club ready</h2><span class="pill">${steps.length - todo.length} of ${steps.length}</span></div>${steps.map(([done, label, tab]) => `<a class="lrow" href="#/club/manage?c=${club.id}&tab=${tab}"><span class="itile sm ${done ? "green" : "gray"}">${icon(done ? "checkc" : "clock")}</span><span class="body"><b>${label}</b></span>${done ? "" : icon("chevR", "chev")}</a>`).join("")}</section>` : ""}
          <section class="card mt"><h2>Quick actions</h2><div class="cl-quick mt-s">${[["posts.write", "posts&new=1", "megaphone", "Post news"], ["events.manage", "events&new=1", "calendar", "New event"], ["forms.create", "forms&new=1", "edit", "New form"], ["members.invite", "invites", "userpen", "Invite members"], ["attendance.take", "attendance", "checkc", "Take attendance"], ["polls.create", "polls", "bars", "Start a poll"]]
            .filter(([p]) => has(m, p)).map(([, tab, ic, l]) => `<a class="cl-quick-btn" href="#/club/manage?c=${club.id}&tab=${tab}">${icon(ic)}<span>${l}</span></a>`).join("")}</div></section>`;
      } } };
  }

  /* ═════════ People: members, join requests + invites, roles ═════════ */
  function people() {
    let q = "";
    return {
      members: { label: "Members", icon: "users", group: "People", perm: "members.approve",
        render(club, m) {
          const me = store.use(`club:members:${club.id}`, () => api.members(club.id), { ttl: 30e3 });
          return kit.head("Members", "Change roles, titles and wings. You can't change anyone at or above your own role.", has(m, "forms.export") ? `<button class="btn outline sm" id="mb-csv">${icon("download", "sm")} CSV</button>` : "")
            + `<div class="searchbar">${icon("search")}<input class="input" id="mb-q" type="search" placeholder="Search by name, ID, wing…" value="${esc(q)}"></div>`
            + ui.view(me, (rows) => {
              const list = rows.filter((r) => !q || `${r.display_name} ${r.student_id} ${r.wing} ${r.title} ${r.role_name}`.toLowerCase().includes(q.toLowerCase()));
              return `<p class="xs mt-s">${ui.plural(list.length, "person", "people")}</p><section class="card tight mt-s">${list.map((r) => `<div class="lrow"><span class="avatar sm">${esc(ui.initials(r.display_name))}</span>
                <span class="body"><b>${esc(r.display_name)}${r.status === "alumni" ? " · alumni" : ""}</b><span>${[r.title, r.wing && `${r.wing} wing`, r.student_id, r.department].filter(Boolean).map(esc).join(" · ")}</span></span>
                ${ui.rolePill(r.rank, r.role_name)}${r.user_id !== kit.me()?.id && (r.rank > m.rank || m.rank === 1) ? `<button class="btn sm ghost icon-only" data-mb="${r.user_id}" aria-label="Edit ${esc(r.display_name)}">${icon("edit", "sm")}</button>` : ""}</div>`).join("") || `<p class="small muted">Nobody matches.</p>`}</section>`;
            });
        },
        mount(el, club, m) {
          const input = kit.$("#mb-q", el); input?.addEventListener("input", () => { q = input.value; kit.ctx.rerender(); const i = kit.$("#mb-q"); i?.focus(); i?.setSelectionRange(q.length, q.length); });
          kit.$("#mb-csv", el)?.addEventListener("click", async () => {
            const rows = store.peek(`club:members:${club.id}`) || [];
            const csv = "﻿" + [["Name", "Student ID", "Email", "Role", "Title", "Wing", "Department", "Status", "Joined"], ...rows.map((r) => [r.display_name, r.student_id, r.email, r.role_name, r.title, r.wing, r.department, r.status, r.joined_at.slice(0, 10)])].map((l) => l.map((x) => `"${String(x ?? "").replace(/^([=+\-@])/, "'$1").replace(/"/g, '""')}"`).join(",")).join("\r\n");
            await api.logExport(club.id, "members", rows.length).catch(() => {});
            ui.download(`${club.slug}-members.csv`, csv, "text/csv");
          });
          kit.$$("[data-mb]", el).forEach((b) => b.addEventListener("click", () => editMember(club, m, (store.peek(`club:members:${club.id}`) || []).find((r) => r.user_id === b.dataset.mb))));
        } },
      invites: { label: "Requests & invites", icon: "userpen", group: "People", perm: "members.invite",
        render(club, m) {
          const ie = store.use(`club:invites:${club.id}`, () => api.invites(club.id), { ttl: 30e3 });
          const re = has(m, "members.approve") ? store.use(`club:requests:${club.id}`, () => api.requests(club.id), { ttl: 30e3 }) : { value: [] };
          return kit.head("Requests & invites", "Invite by student ID or email. They're a member the moment they open EWUdiots Club, nothing else to do.")
            + `<form id="iv-form" class="card stack"><div class="grid g2">${ui.field("Student IDs or emails", ui.area("who", "", 'rows="3" required placeholder="2024-1-60-123\n2023-2-50-045\nname@gmail.com"'), "One per line, up to 100 at a time.")}
              <div class="stack">${ui.field("Position", roleSelect("role", club, m, ""))}${ui.field("Title (optional)", ui.input("title", "", 'maxlength="60" placeholder="e.g. Head of PR"'))}${club.wings?.length ? ui.field("Wing", ui.select("wing", [["", "None"], ...club.wings.map((w) => [w, w])])) : ""}</div></div>
              <div id="cl-err"></div><button class="btn primary" style="justify-self:start">${icon("mail")} Send invites</button></form>`
            + (has(m, "members.approve") ? `<h2 class="cl-h2">Join requests</h2>${ui.view(re, (rows) => (rows.length ? `<section class="card tight">${rows.map((r) => `<div class="lrow"><span class="avatar sm">${esc(ui.initials(r.name))}</span><span class="body"><b>${esc(r.name)}</b><span>${[r.student_id, r.department, ui.ago(r.created_at)].filter(Boolean).map(esc).join(" · ")}</span>${r.note ? `<span class="xs">“${esc(r.note)}”</span>` : ""}</span>
                <button class="btn sm primary" data-rq="${r.id}" data-ok="1">${icon("check", "sm")} Accept</button><button class="btn sm ghost" data-rq="${r.id}" data-ok="0">Decline</button></div>`).join("")}</section>` : `<p class="small muted">No requests waiting.</p>`))}` : "")
            + `<h2 class="cl-h2">Invites</h2>${ui.view(ie, (rows) => (rows.length ? `<section class="card tight">${rows.map((x) => `<div class="lrow"><span class="itile sm ${x.status === "claimed" ? "green" : "purple"}">${icon(x.status === "claimed" ? "checkc" : "mail")}</span><span class="body"><b>${esc(x.email)}</b><span>${esc((store.peek(`club:roles:${club.id}`) || []).find((r) => r.id === x.role_id)?.name || assignableRanks(1).find((r) => r.rank === x.rank)?.name || "")}${x.title ? ` · ${esc(x.title)}` : ""} · ${x.status === "claimed" ? "joined" : `waiting · ${ui.ago(x.created_at)}`}</span></span>${x.status === "pending" ? `<button class="btn sm ghost" data-iv="${x.id}">Revoke</button>` : ""}</div>`).join("")}</section>` : `<p class="small muted">No invites yet.</p>`))}`;
        },
        mount(el, club) {
          kit.$("#iv-form", el)?.addEventListener("submit", async (e) => {
            e.preventDefault(); const f = ui.values(e.target), btn = e.target.querySelector("button.primary");
            const list = [...new Set(String(f.who).split(/[\s,;]+/).map((s) => s.trim().toLowerCase()).filter(Boolean))].slice(0, 100);
            if (!list.length) return ui.fail(e.target, "Add at least one student ID or email.");
            kit.ctx.busy(btn, true, "Inviting…");
            const bad = [];
            for (const who of list) { try { await api.inviteRole(club.id, who, f.role, f.title || "", f.wing || ""); } catch (err) { bad.push(`${who}: ${err.message}`); } }
            kit.ctx.busy(btn, false); store.invalidate(`club:invites:${club.id}`);
            if (bad.length) ui.fail(e.target, bad.slice(0, 3).join(" · ")); else { e.target.reset(); kit.toast(list.length === 1 ? "Invite sent" : `${list.length} invites sent`, "success", "They join automatically when they next open EWUdiots Club."); }
          });
          kit.$$("[data-rq]", el).forEach((b) => b.addEventListener("click", async () => { try { await api.reviewRequest(b.dataset.rq, b.dataset.ok === "1"); store.invalidate(`club:requests:${club.id}`, `club:members:${club.id}`, "clubs:counts"); kit.toast(b.dataset.ok === "1" ? "Accepted" : "Declined", "success"); } catch (err) { kit.toast(err.message, "error"); } }));
          kit.$$("[data-iv]", el).forEach((b) => b.addEventListener("click", async () => { try { await api.revokeInvite(b.dataset.iv); store.invalidate(`club:invites:${club.id}`); } catch (err) { kit.toast(err.message, "error"); } }));
        } },
      roles: { label: "Positions & roles", icon: "shield", group: "People", perm: "members.promote",
        render(club, m) {
          const re = store.use(`club:roles:${club.id}`, () => api.roles(club.id), { ttl: 60e3 });
          const count = (store.peek(`club:members:${club.id}`) || store.use(`club:members:${club.id}`, () => api.members(club.id), { ttl: 30e3 }).value || []).reduce((acc, x) => ((acc[x.role_id] = (acc[x.role_id] || 0) + 1), acc), {});
          return kit.head("Positions & permissions", "Give members positions such as President, General Secretary, Treasurer or Executive Member. Each position unlocks its tools. You can only change positions below yours, and only give permissions you have.",
              `<button class="btn primary sm" id="rl-new">${icon("plus", "sm")} Create position</button>`)
            + ui.view(re, (rows) => `${hierarchy(rows, count)}${ui.sec("All Positions")}<div class="stack">${[...rows].sort((a, b) => a.rank - b.rank || a.sort - b.sort).map((r) => {
              const locked = r.perms.includes("*") || r.rank <= m.rank;
              return `<details class="card tight cl-rolecard"><summary class="row nowrap" style="gap:10px">${ui.rolePill(r.rank, r.name)}<span class="xs grow">${esc(r.description || "")}${r.description ? " · " : ""}${r.perms.includes("*") ? "Everything" : ui.plural(r.perms.length, "permission")} · ${ui.plural(count[r.id] || 0, "person", "people")}</span>${locked ? icon("lock", "sm") : icon("chevR", "sm")}</summary>
                ${locked ? `<p class="small muted mt-s">${r.perms.includes("*") ? "This position can do everything in the club." : "You can't change your own position or ones above it."}</p>` : `<form class="stack mt-s" data-role="${r.id}">${ui.field("Name", ui.input("name", r.name, 'maxlength="40" required'))}${ui.field("Description", ui.input("description", r.description || "", 'maxlength="200"'))}
                  ${PERM_GROUPS.map(([gname, perms]) => `<fieldset class="cl-perms"><legend>${gname}</legend>${perms.map(([p, l]) => `<label class="cl-opt ${has(m, p) ? "" : "dim"}"><input type="checkbox" data-perm="${p}" ${r.perms.includes(p) ? "checked" : ""} ${has(m, p) ? "" : "disabled"}> <span>${l}</span></label>`).join("")}</fieldset>`).join("")}
                  <div class="row" style="gap:8px"><button class="btn primary sm">${icon("check", "sm")} Save</button>${!r.is_system && !r.is_default && !count[r.id] ? `<button type="button" class="btn ghost sm" data-delrole="${r.id}" style="color:var(--error)">${icon("trash", "sm")} Delete position</button>` : ""}</div></form>`}</details>`;
            }).join("")}</div>`);
        },
        mount(el, club, m) {
          kit.$$("[data-role]", el).forEach((f) => f.addEventListener("submit", async (e) => {
            e.preventDefault();
            const perms = kit.$$("[data-perm]:checked", f).map((c) => c.dataset.perm);
            try { await api.updateRole(f.dataset.role, { name: f.name.value.trim(), description: f.description.value.trim(), perms }); store.invalidate(`club:roles:${club.id}`, `club:members:${club.id}`, "me:clubs"); kit.toast("Position saved", "success"); } catch (err) { kit.toast(err.message, "error"); }
          }));
          kit.$$("[data-delrole]", el).forEach((b) => b.addEventListener("click", async () => { try { await api.deleteRole(b.dataset.delrole); store.invalidate(`club:roles:${club.id}`); } catch (err) { kit.toast(err.message, "error"); } }));
          kit.$("#rl-new", el)?.addEventListener("click", () => ui.sheet("Create a position", `<form id="rl" class="stack">${ui.field("Name", ui.input("name", "", 'required maxlength="40" placeholder="Head of PR, Media Lead…"'))}${ui.field("Description", ui.input("description", "", 'maxlength="200"'))}
            ${ui.field("Seniority", ui.select("rank", [[3, "Officer (like President)"], [4, "Executive (like Executive Member)"], [5, "Team role (like Moderator)"], [6, "Senior member"], [7, "Member"]].filter(([rk]) => rk > m.rank), 4))}
            ${PERM_GROUPS.map(([gname, perms]) => `<fieldset class="cl-perms"><legend>${gname}</legend>${perms.filter(([p]) => has(m, p)).map(([p, l]) => `<label class="cl-opt"><input type="checkbox" data-perm="${p}"> <span>${l}</span></label>`).join("")}</fieldset>`).join("")}
            <div id="cl-err"></div><button class="btn primary block">${icon("plus")} Create</button></form>`, (s) => kit.$("#rl", s).addEventListener("submit", async (e) => {
            e.preventDefault(); const f = ui.values(e.target), perms = kit.$$("[data-perm]:checked", s).map((c) => c.dataset.perm);
            try { await api.addRole({ club_id: club.id, name: f.name.trim(), description: f.description || "", rank: Number(f.rank), perms, color: ["blue", "blue", "teal", "pink", "green", "gray"][Number(f.rank) - 2] || "gray", sort: 50 }); kit.ctx.closeModal(); store.invalidate(`club:roles:${club.id}`); }
            catch (err) { ui.fail(s, /duplicate|already/i.test(err.message) ? "A position with that name exists." : err.message); }
          })));
        } }
    };
  }

  /** Positions this person may hand out, grouped by seniority (perms.assignableRoles; the database checks again). */
  // "Roles and Permissions" board: people per level, then the hierarchy as a pyramid (top = most access).
  function hierarchy(roles, count) {
    const LEVELS = [[2, "crown", "Club Admin", "Full control over club settings and members", "amber"], [3, "crown", "Officers", "President, Vice President, General Secretary, Treasurer", "pink"],
      [4, "users", "Executive", "Manage assigned modules and activities", "purple"], [5, "shield", "Moderator", "Moderate content, run the merch store", "blue"],
      [6, "user", "Senior Member", "Access additional member features", "green"], [7, "users", "General Member", "Basic access to club features", "gray"]];
    const n = (rank) => roles.filter((r) => r.rank === rank).reduce((s, r) => s + (count[r.id] || 0), 0);
    return `<div class="cl-rolecounts">${LEVELS.map(([rank, ic, l, , tone]) => `<div class="t-${tone}">${icon(ic)}<span><b>${n(rank)}</b><span>${l}</span></span></div>`).join("")}</div>
      ${ui.sec("Role Hierarchy")}<div class="cl-pyramid">${LEVELS.map(([rank, ic, l, d, tone], i) => `<div class="lv t-${tone}" style="--i:${i}"><span class="tri">${icon(ic)}</span><span class="lbl">${icon(ic, "sm")}<b>${l}</b><span>${esc(roles.filter((r) => r.rank === rank).map((r) => r.name).join(", ") || d)}</span></span></div>`).join("")}</div>`;
  }
  function roleSelect(name, club, m, current) {
    const roles = store.use(`club:roles:${club.id}`, () => api.roles(club.id), { ttl: 60e3 }).value || [];
    const list = assignableRoles(m.rank === 1 || kit.isPlatform() ? { rank: 1, perms: ["*"] } : m, roles);
    const def = current || list.find((r) => r.rank === 7)?.id || list.at(-1)?.id || "";
    const groups = list.reduce((g, r) => { (g[r.rank] ||= []).push(r); return g; }, {});
    return `<select class="select" name="${name}" required>${Object.entries(groups).map(([rk, rs]) => `<optgroup label="${RANK_GROUPS[rk] || `Rank ${rk}`}">${rs.map((r) => `<option value="${r.id}" ${r.id === def ? "selected" : ""}>${esc(r.name)}</option>`).join("")}</optgroup>`).join("")}</select>`;
  }

  function editMember(club, m, r) {
    if (!r) return;
    ui.sheet(`Edit ${r.display_name}`, `<form id="em-form" class="stack">
      ${ui.field("Position", roleSelect("role", club, m, r.role_id))}
      ${ui.field("Title", ui.input("title", r.title, 'maxlength="60" placeholder="e.g. General Secretary"'))}
      ${club.wings?.length ? ui.field("Wing", ui.select("wing", [["", "None"], ...club.wings.map((w) => [w, w])], r.wing)) : ui.field("Wing", ui.input("wing", r.wing, 'maxlength="40"'))}
      <div id="cl-err"></div><button class="btn primary block">${icon("check")} Save</button>
      <div class="row" style="gap:8px"><button type="button" class="btn neutral grow" id="em-alumni">${icon("cap", "sm")} Move to club alumni</button>${has(m, "members.remove") ? `<button type="button" class="btn danger-soft grow" id="em-remove">${icon("trash", "sm")} Remove</button>` : ""}</div></form>`, (sh) => {
      const done = (msg) => { kit.ctx.closeModal(); store.invalidate(`club:members:${club.id}`, "clubs:counts"); kit.toast(msg, "success"); };
      kit.$("#em-form", sh).addEventListener("submit", async (e) => {
        e.preventDefault(); const f = ui.values(e.target);
        try { await api.setMemberRole(club.id, r.user_id, { role: f.role === r.role_id ? null : f.role, title: f.title, wing: f.wing }); done("Saved"); } catch (err) { ui.fail(sh, err.message); }
      });
      kit.$("#em-alumni", sh).addEventListener("click", async () => { try { await api.setMember(club.id, r.user_id, { status: "alumni" }); done("Moved to club alumni"); } catch (err) { ui.fail(sh, err.message); } });
      kit.$("#em-remove", sh)?.addEventListener("click", async () => { try { await api.setMember(club.id, r.user_id, { status: "removed" }); done("Removed from the club"); } catch (err) { ui.fail(sh, err.message); } });
    });
  }

  /* ═════════ Admin: settings, handover, audit ═════════ */
  function admin() {
    return {
      settings: { label: "Club profile & settings", icon: "settings", group: "Admin", perm: "settings.edit",
        render(club) {
          const so = club.socials || {};
          return kit.head("Club profile & settings", "What everyone sees on your club's page.") + `<form id="st-form" class="stack">
            <section class="card stack"><h2>Identity</h2>
              <div class="row nowrap" style="gap:14px">${ui.logo(club, "lg")}<div class="stack" style="gap:8px"><button type="button" class="btn sm outline" data-up="logo_url">${icon("upload", "sm")} Logo</button><button type="button" class="btn sm outline" data-up="cover_url">${icon("image", "sm")} Cover photo</button></div></div>
              <div class="grid g2">${ui.field("Club name", ui.input("name", club.name, 'required maxlength="100"'))}${ui.field("Short name", ui.input("short_name", club.short_name, 'maxlength="16" placeholder="e.g. EWURC"'))}</div>
              ${ui.field("One-line tagline", ui.input("tagline", club.tagline, 'maxlength="140" placeholder="What your club is about, in one line"'))}
              <div class="grid g2">${ui.field("Category", ui.select("category", CATEGORIES, club.category))}${ui.field("Founded", ui.input("founded_year", club.founded_year || "", 'type="number" min="1990" max="2100" placeholder="e.g. 2004"'))}</div>
              ${ui.field("Club colour", `<input class="input" type="color" name="color" value="${esc(club.color)}" style="height:44px;padding:4px">`)}</section>
            <section class="card stack"><h2>About</h2>${ui.field("Introduction", ui.area("about", club.about, 'rows="6" maxlength="4000"'))}${ui.field("Mission", ui.area("mission", club.mission, 'rows="3" maxlength="1000"'))}
              ${ui.field("Faculty advisor(s)", ui.input("advisors", club.advisors, 'maxlength="300" placeholder="Names as you want them shown"'))}${ui.field("Wings", ui.input("wings", (club.wings || []).join(", "), 'placeholder="IT, PR, Events, Design"'), "Separate with commas. Used for tasks, invites and wing-only posts.")}</section>
            <section class="card stack"><h2>Membership</h2>${ui.field("How people join", ui.select("join_mode", JOIN_MODES, club.join_mode))}${ui.toggle("recruiting", club.recruiting, "Recruiting now", "Shows a Recruiting badge in Explore.")}</section>
            <section class="card stack"><h2>Contact & links</h2>${ui.field("Email", ui.input("contact_email", club.contact_email, 'type="email"'))}
              ${["facebook", "instagram", "linkedin", "youtube", "website"].map((k) => ui.field(k[0].toUpperCase() + k.slice(1), ui.input(`s_${k}`, so[k] || "", 'type="url" placeholder="https://"'))).join("")}</section>
            <div id="cl-err"></div><button class="btn primary lg">${icon("check")} Save changes</button></form>`;
        },
        mount(el, club) {
          kit.$$("[data-up]", el).forEach((b) => b.addEventListener("click", async () => {
            const file = await ui.pickFile("image/jpeg,image/png,image/webp"); if (!file) return;
            kit.ctx.busy(b, true, "Uploading…");
            try { const url = await api.uploadPublic(club.id, await ui.shrink(file, b.dataset.up === "logo_url" ? 512 : 1800), "brand"); await api.updateClub(club.id, { [b.dataset.up]: url }); store.invalidate(`clubid:${club.id}`, `club:${club.slug}`, "clubs:all"); kit.toast("Uploaded", "success"); }
            catch (err) { kit.ctx.busy(b, false); kit.toast(err.message, "error"); }
          }));
          kit.$("#st-form", el)?.addEventListener("submit", async (e) => {
            e.preventDefault(); const f = ui.values(e.target), btn = e.target.querySelector("button.primary");
            const socials = Object.fromEntries(["facebook", "instagram", "linkedin", "youtube", "website"].map((k) => [k, String(f[`s_${k}`] || "").trim()]).filter(([, v]) => /^https:\/\//.test(v)));
            const patch = { name: f.name.trim(), short_name: f.short_name.trim(), tagline: f.tagline.trim(), category: f.category, founded_year: f.founded_year ? Number(f.founded_year) : null, color: f.color, about: f.about.trim(), mission: f.mission.trim(),
              advisors: f.advisors.trim(), wings: [...new Set(String(f.wings).split(",").map((w) => w.trim()).filter(Boolean))].slice(0, 12), join_mode: f.join_mode, recruiting: !!f.recruiting, contact_email: f.contact_email.trim(), socials };
            kit.ctx.busy(btn, true, "Saving…");
            try { await api.updateClub(club.id, patch); store.invalidate(`clubid:${club.id}`, `club:${club.slug}`, "clubs:all"); kit.toast("Saved", "success"); } catch (err) { kit.ctx.busy(btn, false); ui.fail(e.target, err.message); }
          });
        } },
      handover: { label: "New committee (handover)", icon: "reset", group: "Admin", perm: "rank<=2",
        render(club) {
          const me = store.use(`club:members:${club.id}`, () => api.members(club.id), { ttl: 30e3 });
          store.use(`club:roles:${club.id}`, () => api.roles(club.id), { ttl: 60e3 });
          const year = new Date().getFullYear();
          return kit.head("New committee", "Once a year: save the outgoing committee to History, then give the new committee its roles. Executives and wing heads who aren't re-appointed become Senior General Members.")
            + ui.view(me, (rows) => {
              const active = rows.filter((r) => r.status === "active" && r.rank >= 2);
              return `<form id="ho-form" class="card stack">${ui.field("Name for the outgoing term", ui.input("label", `${year - 1}–${String(year).slice(2)}`, 'required maxlength="40"'))}
                <p class="small muted">Choose the new committee. Leave people out to keep them where they are (executives fall back to Senior General Member).</p>
                <div class="stack">${active.map((r) => `<div class="cl-ho-row row nowrap" style="gap:8px"><span class="grow min0"><b class="ellipsis">${esc(r.display_name)}</b><span class="xs">now ${esc(r.title || r.role_name)}</span></span>
                  ${ui.select(`r_${r.user_id}`, [["", "—"], ...(store.peek(`club:roles:${club.id}`) || []).filter((x) => x.rank >= 2 && x.rank <= 4).sort((a, b) => a.rank - b.rank || a.sort - b.sort).map((x) => [x.id, x.name])], "", 'aria-label="New position"')}${ui.input(`t_${r.user_id}`, "", 'placeholder="Title" maxlength="60" style="max-width:180px"')}</div>`).join("")}</div>
                <div id="cl-err"></div><button class="btn primary">${icon("reset")} Hand over</button></form>`;
            });
        },
        mount(el, club) {
          kit.$("#ho-form", el)?.addEventListener("submit", (e) => {
            e.preventDefault(); const f = ui.values(e.target);
            const roles = store.peek(`club:roles:${club.id}`) || [];
            const assignments = Object.keys(f).filter((k) => k.startsWith("r_") && f[k]).map((k) => { const u = k.slice(2); return { user_id: u, role_id: f[k], title: String(f[`t_${u}`] || "").trim() }; });
            if (!assignments.some((a) => roles.find((x) => x.id === a.role_id)?.rank === 2)) return ui.fail(e.target, "Choose at least one Club Admin for the new committee.");
            kit.ctx.confirmModal("Hand over to the new committee?", `The current committee is saved as “${esc(f.label)}” in History, and ${ui.plural(assignments.length, "person", "people")} get new roles.`, "Hand over", async () => {
              await api.handover(club.id, f.label.trim(), assignments); store.invalidate("me:clubs", `club:members:${club.id}`, `club:terms:${club.id}`, `club:committee:${club.id}`); kit.toast("Handover done", "success", "Welcome to the new committee.");
            });
          });
        } },
      features: { label: "Features", icon: "sliders", group: "Admin", perm: "features.edit",
        render(club, m) {
          const on = m.features || {}, locked = club.features_locked || {};
          return kit.head("Features", "Switch club tools on or off. Positions decide who can use them; members only see what's on.")
            + `<div class="cl-list">${Object.entries(FEATURES).map(([k, [l, ic, d]]) => `<div class="cl-setrow"><span class="itile sm purple">${icon(ic)}</span><span class="body"><b>${l}</b><span>${d}${locked[k] ? " · locked off by the EWUdiots team" : ""}</span></span>
              <label class="switch" aria-label="${l}"><input type="checkbox" data-feat="${k}" ${on[k] && !locked[k] ? "checked" : ""} ${locked[k] ? "disabled" : ""}><span></span></label></div>`).join("")}</div>
              <p class="xs mt">The merch store, sponsors and collaborations start switched off. Turn the store on once you've added payment numbers in Merch → Settings.</p>`;
        },
        mount(el, club) {
          kit.$$("[data-feat]", el).forEach((x) => x.addEventListener("change", async () => {
            const next = { ...(club.features || {}), ...Object.fromEntries(kit.$$("[data-feat]", el).filter((c) => !c.disabled).map((c) => [c.dataset.feat, c.checked])) };
            try { await api.setFeatures(club.id, next); store.invalidate("me:clubs", `clubid:${club.id}`, "store:", "collab:"); kit.toast("Saved", "success"); } catch (err) { x.checked = !x.checked; kit.toast(err.message, "error"); }
          }));
        } },
      audit: { label: "Audit log", icon: "eye", group: "Admin", perm: "audit.view",
        render(club) {
          const ae = store.use(`club:audit:${club.id}`, () => api.audit(club.id), { ttl: 30e3 });
          const LABEL = { invite: "invited", "invite.claimed": "accepted an invite", "member.joined": "joined", "member.changed": "changed a member", "request.accepted": "accepted a request", "request.rejected": "declined a request", "responses.reviewed": "reviewed responses", export: "exported data", handover: "handed over to a new committee", "claim.approved": "became admin (claim approved)", "admin.appointed": "was appointed admin" };
          return kit.head("Audit log", "Who did what: invites, role changes, reviews and exports of personal data.") + ui.view(ae, (rows) => (rows.length
            ? `<section class="card tight">${rows.map((x) => `<div class="lrow"><span class="itile sm ${x.action === "export" ? "orange" : "purple"}">${icon(x.action === "export" ? "download" : "clock")}</span><span class="body"><b>${esc(x.actor_name || "Someone")} ${esc(LABEL[x.action] || x.action)}</b><span>${ui.dateTime(x.at)}${x.detail?.email ? ` · ${esc(x.detail.email)}` : ""}${x.detail?.what ? ` · ${esc(x.detail.what)} (${x.detail.rows} rows)` : ""}${x.detail?.count ? ` · ${x.detail.count} ${x.detail.status || ""}` : ""}${x.detail?.name ? ` · ${esc(x.detail.name)}` : ""}</span></span></div>`).join("")}</section>`
            : `<p class="small muted">Nothing yet.</p>`));
        } }
    };
  }
}
