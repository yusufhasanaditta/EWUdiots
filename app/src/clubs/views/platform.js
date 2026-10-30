/* App Admin — Platform Control Center (#/club/admin?tab=…), from the "App Admin / Club Management / Roles &
   Permissions" boards. Only for the EWUdiots team (public.can('clubs.manage')); every action is an RPC or a write that
   the database checks again. Clubs are created only here: Register Club → appoint the Club Admin, who then gives
   positions (President, Secretary, Executive Member…) to members. The team can also lock any club feature, suspend
   or archive clubs, and edit the default positions every new club starts with. */
import { CATEGORIES, PERM_GROUPS, FEATURES } from "../perms.js";

const STATUS = { unclaimed: ["Not on EWUdiots", "gray"], pending: ["Pending", "amber"], active: ["Verified", "green"], suspended: ["Suspended", "red"], archived: ["Archived", "gray"] };
const PAGE = 10;

/** @param {Record<string, any>} pages @param {any} kit */
export function register(pages, kit) {
  const { ui, icon, esc, api, store, ctx, charts } = kit;
  let ctab = "all", q = "", fcat = "", sort = "new", page = 1, rtab = "platform";

  pages["club/admin"] = () => {
    const g = kit.gate("App Admin"); if (g) return g;
    const pe = store.use("me:platform", () => api.platformCan("clubs.manage"), { ttl: 10 * 60e3 });
    if (pe.loading && pe.value === undefined) return ui.skeleton(3);
    if (!pe.value) return ui.emptyBox("lock", "For the EWUdiots team", "App Admin is only for people with the clubs.manage permission.");
    const t = kit.param("tab") || "home";
    return `${ui.ph(t === "clubs" ? "Club Management" : t === "roles" ? "Roles & Permissions" : t === "queue" ? "Pending Approvals" : "App Admin<br><span style=\"font-size:.7em\">Platform Control Center</span>",
        t === "clubs" ? "View, verify, and manage all registered clubs on the platform." : t === "roles" ? "Manage the positions and permissions every club starts with." : "Manage clubs, users, content, and platform activities.",
        `<span class="cl-disclaimer">${icon("info", "sm")} Unofficial · not affiliated with EWU</span>${t === "clubs" ? `<button class="btn primary" id="pa-new">${icon("plus")} Register Club</button>` : ""}`)}
      ${ui.seg([["home", "Overview"], ["clubs", "Clubs"], ["roles", "Roles & Permissions"], ["queue", "Approvals"]], t, (v) => `#/club/admin?tab=${v}`)}
      ${t === "clubs" ? clubs() : t === "roles" ? roles() : t === "queue" ? queue() : home()}`;
  };

  /* ── Overview ── */
  function home() {
    const se = store.use("platform:stats", api.platform.stats, { ttl: 60e3 });
    return ui.view(se, (s) => `<div class="cl-stats">${ui.stat("users", "purple", s.users.toLocaleString(), "Total users", { d: charts.delta(s.users, s.users_prev), spark: charts.spark(s.growth.map((x) => x.total)) })}${ui.stat("community", "blue", s.clubs, "Registered clubs", { d: charts.delta(s.clubs, s.clubs_prev) })}
        ${ui.stat("calendar", "amber", s.events, "Club events", { d: charts.delta(s.events, s.events_prev) })}${ui.stat("file", "purple", s.posts, "Club posts", { d: charts.delta(s.posts, s.posts_prev) })}</div>
      <div class="cl-row2"><section class="card cl-chart"><h3>User Growth <span class="xs">Last 6 months</span></h3>${charts.line({ title: "Users per month", labels: s.growth.map((x) => charts.monthLabel(x.m)), series: [{ name: "Total users", values: s.growth.map((x) => x.total), area: true }, { name: "Active (signed in)", values: s.growth.map((x) => x.active) }], fmt: charts.compact })}</section>
        <section class="card cl-chart"><h3>Club Distribution</h3>${charts.donut({ title: "Clubs by category", items: Object.entries(s.by_category).map(([k, v]) => ({ label: CATEGORIES[k] || k, value: v })), sub: "Clubs" })}</section></div>
      <div class="cl-tiles mt" style="grid-template-columns:repeat(auto-fill,minmax(150px,1fr))">${[["community", "purple", "Club Management", "#/club/admin?tab=clubs"], ["users", "blue", "User Management", "/admin.html#users"], ["shield", "red", "Content Moderation", "/admin.html#clubs"],
        ["calendar", "orange", "Event Oversight", "/admin.html#events"], ["megaphone", "pink", "Announcements", "/admin.html#messages"], ["chart", "blue", "Reports & Analytics", "#/club/admin?tab=home"], ["settings", "purple", "System Settings", "/admin.html#settings"],
        ["lock", "green", "Access Control", "#/club/admin?tab=roles"], ["help", "purple", "Feedback & Support", "#/club/admin?tab=queue"]].map((x) => ui.tile(...x)).join("")}</div>
      <div class="cl-row2 mt"><section class="card"><div class="card-h"><h2>Recent Activities</h2></div>${s.recent.map((a) => `<div class="cl-li" style="padding:8px 0"><span class="itile sm purple">${icon("clock")}</span><span class="body"><b>${esc(a.action.replace(/[._]/g, " "))}</b><span>${esc(a.club)} · ${esc(a.actor_name || "System")}</span></span><span class="end">${ui.ago(a.at)}</span></div>`).join("") || `<p class="small muted">Nothing yet.</p>`}</section>
        <section class="card"><div class="card-h"><h2>Pending Approvals</h2><a class="small" href="#/club/admin?tab=queue">See all</a></div>${[["Club Verification", "community", s.pending.claims], ["Event Approval", "calendar", s.pending.events], ["Content Reports", "shield", s.pending.reports], ["Support Tickets", "help", s.pending.tickets]].map(([l, ic, n]) => `<a class="cl-li" style="padding:8px 0" href="#/club/admin?tab=queue">${icon(ic)}<span class="body"><b>${l}</b></span><span class="badge-n">${n}</span>${icon("chevR", "sm")}</a>`).join("")}</section></div>`, { n: 4, h: 140 });
  }

  /* ── Club management ── */
  function clubs() {
    const ce = store.use("platform:clubs", api.admin.clubs, { ttl: 30e3 }), counts = store.use("clubs:counts", api.counts, { ttl: 60e3 }).value || {};
    return ui.view(ce, (rows) => {
      const groups = { all: rows, pending: rows.filter((c) => ["pending", "unclaimed"].includes(c.status)), active: rows.filter((c) => c.status === "active"), suspended: rows.filter((c) => c.status === "suspended"), archived: rows.filter((c) => c.status === "archived") };
      const words = q.toLowerCase().split(/\s+/).filter(Boolean);
      const list = groups[ctab].filter((c) => (!fcat || c.category === fcat) && (!words.length || words.every((w) => `${c.name} ${c.short_name} ${c.slug}`.toLowerCase().includes(w))))
        .sort((a, b) => (sort === "name" ? a.name.localeCompare(b.name) : sort === "members" ? (counts[b.id]?.members || 0) - (counts[a.id]?.members || 0) : new Date(b.created_at) - new Date(a.created_at)));
      const pages_ = Math.max(1, Math.ceil(list.length / PAGE)); page = Math.min(page, pages_);
      const sel = rows.find((c) => c.id === kit.param("club"));
      return `<nav class="cl-seg">${[["all", "All Clubs"], ["pending", "Pending Verification"], ["active", "Verified"], ["suspended", "Suspended"], ["archived", "Archived"]].map(([v, l]) => `<button data-ct="${v}" aria-pressed="${ctab === v}">${l} <span class="n">${groups[v].length}</span></button>`).join("")}</nav>
        <div class="row nowrap" style="gap:8px"><div class="searchbar cl-search grow">${icon("search")}<input class="input" id="pa-q" type="search" placeholder="Search clubs by name, category, or keywords…" value="${esc(q)}" autocomplete="off"></div></div>
        <div class="row mt-s" style="gap:8px;flex-wrap:wrap">${ui.select("cat", [["", "All Categories"], ...Object.entries(CATEGORIES)], fcat, 'id="pa-cat" style="width:auto" aria-label="Category"')}${ui.select("sort", [["new", "Newest First"], ["name", "Name"], ["members", "Most members"]], sort, 'id="pa-sort" style="width:auto" aria-label="Sort"')}</div>
        <section class="card mt-s" style="padding:0;overflow:auto"><table class="cl-dtable"><thead><tr><th class="hide-s">#</th><th>Club Name</th><th class="hide-s">Category</th><th>Members</th><th class="hide-s">Source</th><th>Status</th><th><span class="sr-only">Actions</span></th></tr></thead>
          <tbody>${list.slice((page - 1) * PAGE, page * PAGE).map((c, i) => `<tr><td class="hide-s">${(page - 1) * PAGE + i + 1}</td><td><a class="row nowrap" style="gap:8px;color:inherit;text-decoration:none" href="#/club/admin?tab=clubs&club=${c.id}">${ui.logo(c, "xs")}<b>${esc(c.name)}</b></a></td>
            <td class="hide-s">${ui.st([CATEGORIES[c.category], "blue"])}</td><td>${counts[c.id]?.members || 0}</td><td class="hide-s">${c.source === "ewubd" ? "EWU site" : "EWUdiots"}</td><td>${ui.st(STATUS[c.status])}</td>
            <td><button class="icon-btn" data-club="${c.id}" aria-label="Actions for ${esc(c.name)}">${icon("more")}</button></td></tr>`).join("")}</tbody></table></section>
        ${ui.pager(page, pages_)}
        ${sel ? clubCard(sel, counts[sel.id] || {}) : ""}`;
    }, { n: 5, h: 54 });
  }
  function clubCard(c, n) {
    const feats = c.features || {}, locks = c.features_locked || {};
    return `<section class="card mt" id="pa-card"><div class="row nowrap" style="gap:14px">${ui.logo(c, "xl")}<div class="grow min0"><div class="row" style="gap:8px"><h2>${esc(c.name)}</h2>${c.verified ? icon("checkc", "sm") : ""}${ui.st(STATUS[c.status])}</div>
        <p class="xs">@${esc(c.slug)} · ${esc(CATEGORIES[c.category])}</p><p class="small" style="color:var(--text-2)">${esc((c.about || c.tagline || "").slice(0, 220))}${(c.about || "").length > 220 ? "…" : ""}</p></div>
        <div class="row" style="gap:16px">${[["users", n.members || 0, "Members"], ["bell", n.followers || 0, "Followers"]].map(([ic, v, l]) => `<div style="text-align:center">${icon(ic)}<b style="display:block">${v}</b><span class="xs">${l}</span></div>`).join("")}</div></div>
      ${ui.sec("Features", `<span class="xs">Locked features stay off whatever the club chooses</span>`)}<div class="cl-list">${Object.entries(FEATURES).map(([k, [l, ic]]) => `<div class="cl-setrow">${icon(ic)}<span class="body"><b>${l}</b><span>${feats[k] === false ? "Off" : feats[k] ? "On" : "Default"}${locks[k] ? " · locked by the EWUdiots team" : ""}</span></span><label class="switch" aria-label="Lock ${l}"><input type="checkbox" data-lock="${k}" ${locks[k] ? "checked" : ""}><span></span></label><span class="xs">Lock</span></div>`).join("")}</div>
      <div class="row mt" style="gap:8px;flex-wrap:wrap"><a class="btn outline" href="#/club/manage?c=${c.id}&tab=settings">${icon("edit")} Edit Details</a><a class="btn outline" href="#/club/manage?c=${c.id}&tab=members">${icon("users")} Manage Members</a>
        <a class="btn outline" href="#/club/analytics?c=${c.id}">${icon("chart")} View Analytics</a><button class="btn outline" data-admin="${c.id}">${icon("crown")} Appoint Club Admin</button>
        ${c.status === "suspended" ? `<button class="btn outline" data-status="active">${icon("checkc")} Reinstate</button>` : `<button class="btn outline" data-status="suspended" style="color:var(--error)">${icon("xc")} Suspend Club</button>`}${c.status !== "archived" ? `<button class="btn ghost" data-status="archived">Archive</button>` : ""}</div></section>`;
  }

  /* ── Roles & permissions (the template every new club starts with) ── */
  function roles() {
    const te = store.use("platform:template", api.roleTemplate, { ttl: 60e3 });
    return `${ui.seg([["platform", "Club Roles"], ["matrix", "Permission Matrix"]], rtab, (v) => `#/club/admin?tab=roles&r=${v}`, "sm")}` + ui.view(te, (rows) => {
      if ((kit.param("r") || rtab) === "matrix") {
        const keys = PERM_GROUPS.flatMap(([, l]) => l);
        return `<section class="card" style="padding:0;overflow:auto"><table class="cl-dtable"><thead><tr><th>Permission</th>${rows.map((r) => `<th title="${esc(r.name)}">${esc(r.name.split(" ").map((w) => w[0]).join(""))}</th>`).join("")}</tr></thead>
          <tbody>${keys.map(([k, l]) => `<tr><td>${esc(l)}</td>${rows.map((r) => `<td style="text-align:center">${r.perms.includes("*") || r.perms.includes(k) ? icon("check", "sm") : ""}</td>`).join("")}</tr>`).join("")}</tbody></table></section><p class="xs mt-s">${rows.map((r) => `${esc(r.name.split(" ").map((w) => w[0]).join(""))} = ${esc(r.name)}`).join(" · ")}</p>`;
      }
      return `<p class="small muted">Every new club starts with these positions. Clubs can rename them, change their permissions (never above their own) and add their own.</p><div class="cl-list mt-s">${rows.map((r) => `<button class="cl-li" data-tpl="${r.id}"><span class="itile ${r.color === "gray" ? "gray" : r.color}">${icon(r.rank <= 2 ? "crown" : r.rank <= 4 ? "users" : "user")}</span>
        <span class="body"><b>${esc(r.name)}</b><span>${esc(r.description)}</span><span class="xs">${icon("lock", "sm")} ${r.perms.includes("*") ? "All permissions" : `${r.perms.length} permissions`} · Rank ${r.rank}</span></span>${ui.st(["Active", "green"])}</button>`).join("")}</div>`;
    }, { n: 6, h: 70 });
  }

  /* ── Approval queues ── */
  function queue() {
    const cl = store.use("platform:claims", api.admin.claims, { ttl: 30e3 }), sp = store.use("platform:sponsors", api.platform.pendingSponsors, { ttl: 30e3 });
    const tk = store.use("platform:tickets", api.platform.allTickets, { ttl: 30e3 }), rp = store.use("platform:reports", api.admin.reports, { ttl: 30e3 });
    return `${ui.sec("Club Verification")}${ui.view(cl, (rows) => { const list = rows.filter((c) => c.status === "pending"); return list.length ? `<div class="cl-list">${list.map((c) => `<div class="cl-li"><span class="itile sm amber">${icon("community")}</span><span class="body"><b>${esc(c.clubs?.name || "")}</b><span>${esc(c.name)} · ${esc(c.position)} · ${esc(c.email)}</span><span class="xs">${esc(c.proof || "")}</span></span><button class="btn sm primary" data-claim="${c.id}" data-ok="1">Verify</button><button class="btn sm ghost" data-claim="${c.id}" data-ok="0">Reject</button></div>`).join("")}</div>` : `<p class="small muted">No claims waiting.</p>`; })}
      ${ui.sec("Sponsors to approve")}${ui.view(sp, (rows) => (rows.length ? `<div class="cl-list">${rows.map((s) => `<div class="cl-li"><span class="itile sm green">${icon("handshake")}</span><span class="body"><b>${esc(s.name)}</b><span>${esc(s.industry)} · added by ${esc(s.clubs?.name || "")}${s.website ? ` · ${esc(s.website)}` : ""}</span></span><button class="btn sm primary" data-sp="${s.id}" data-ok="1">Approve</button><button class="btn sm outline" data-sp="${s.id}" data-ok="2">Approve + verified</button><button class="btn sm ghost" data-sp="${s.id}" data-ok="0">Reject</button></div>`).join("")}</div>` : `<p class="small muted">Nothing to approve.</p>`))}
      ${ui.sec("Support Tickets")}${ui.view(tk, (rows) => { const open = rows.filter((t) => ["open", "pending"].includes(t.status)); return open.length ? `<div class="cl-list">${open.map((t) => `<button class="cl-li" data-tk="${t.id}"><span class="itile sm ${t.priority === "high" ? "red" : "blue"}">${icon("ticket")}</span><span class="body"><b>#${t.id} · ${esc(t.subject)}</b><span>${esc(t.name)} · ${esc(t.category)} · ${ui.ago(t.updated_at)}</span></span>${ui.st(t.status === "open" ? ["Needs reply", "red"] : ["Answered", "amber"])}</button>`).join("")}</div>` : `<p class="small muted">No open tickets.</p>`; })}
      ${ui.sec("Content Reports")}${ui.view(rp, (rows) => (rows.length ? `<div class="cl-list">${rows.map((r) => `<div class="cl-li"><span class="itile sm red">${icon("flag")}</span><span class="body"><b>${esc(r.target_type)} in ${esc(r.clubs?.name || "")}</b><span>${esc(r.reason)}</span></span>${r.target_type === "post" ? `<button class="btn sm ghost" data-hide="${r.target_id}">Hide post</button>` : ""}<button class="btn sm outline" data-rp="${r.id}">Resolve</button></div>`).join("")}</div>` : `<p class="small muted">No open reports.</p>`))}`;
  }

  pages["club/admin"].mount = (el) => {
    kit.bindRetry(el);
    const reload = (...k) => store.invalidate("platform:", "clubs:", ...k);
    const input = kit.$("#pa-q", el);
    input?.addEventListener("input", () => { q = input.value; page = 1; const pos = input.selectionStart; ctx.rerender(); const i = kit.$("#pa-q"); if (i) { i.focus(); i.setSelectionRange(pos, pos); } });
    kit.$$("[data-ct]", el).forEach((b) => b.addEventListener("click", () => { ctab = b.dataset.ct; page = 1; ctx.rerender(); }));
    kit.$("#pa-cat", el)?.addEventListener("change", (e) => { fcat = e.target.value; ctx.rerender(); });
    kit.$("#pa-sort", el)?.addEventListener("change", (e) => { sort = e.target.value; ctx.rerender(); });
    kit.$$("[data-pg]", el).forEach((b) => b.addEventListener("click", () => { page = Number(b.dataset.pg); ctx.rerender(); }));
    kit.$$("[data-club]", el).forEach((b) => b.addEventListener("click", () => { kit.go(`#/club/admin?tab=clubs&club=${b.dataset.club}`); requestAnimationFrame(() => kit.$("#pa-card")?.scrollIntoView({ behavior: "smooth" })); }));
    kit.$("#pa-new", el)?.addEventListener("click", registerClub);
    const cid = kit.param("club");
    kit.$$("[data-lock]", el).forEach((x) => x.addEventListener("change", async () => { try { await api.platform.lockFeature(cid, x.dataset.lock, x.checked); reload(); } catch (e) { kit.toast(e.message, "error"); x.checked = !x.checked; } }));
    kit.$$("[data-status]", el).forEach((b) => b.addEventListener("click", () => ui.confirm(`${b.textContent.trim()}?`, b.dataset.status === "suspended" ? "Members keep their data but the club disappears from the directory and its tools stop working." : b.dataset.status === "archived" ? "The club is hidden everywhere. You can reinstate it later." : "The club goes live again.", "Confirm",
      async () => { await api.admin.setStatus(cid, b.dataset.status); reload(); }, b.dataset.status !== "active")));
    kit.$$("[data-admin]", el).forEach((b) => b.addEventListener("click", () => ui.sheet("Appoint the Club Admin", `<form id="ad" class="stack">${ui.field("Student ID or email", ui.input("who", "", 'required placeholder="2024-1-60-123 or someone@ewubd.edu"'))}<p class="xs">They become Club Admin straight away (or the moment they create an account) and can then give positions to the committee. The club becomes verified and active.</p><div id="cl-err"></div><button class="btn primary block">${icon("crown")} Appoint</button></form>`, (s) =>
      kit.$("#ad", s).addEventListener("submit", async (e) => { e.preventDefault(); try { await api.admin.setAdmin(b.dataset.admin, String(new FormData(e.target).get("who")).trim()); ctx.closeModal(); reload(); kit.toast("Club Admin appointed", "success"); } catch (err) { ui.fail(s, err.message); } }))));
    kit.$$("[data-tpl]", el).forEach((b) => b.addEventListener("click", () => editTemplate((store.peek("platform:template") || []).find((r) => String(r.id) === b.dataset.tpl))));
    kit.$$("[data-claim]", el).forEach((b) => b.addEventListener("click", () => ui.confirm(b.dataset.ok === "1" ? "Verify this claim?" : "Reject this claim?", b.dataset.ok === "1" ? "They become Club Admin and the club goes live with the verified badge." : "They're told it wasn't approved.", b.dataset.ok === "1" ? "Verify" : "Reject",
      async () => { await api.admin.reviewClaim(b.dataset.claim, b.dataset.ok === "1"); reload(); }, b.dataset.ok !== "1")));
    kit.$$("[data-sp]", el).forEach((b) => b.addEventListener("click", async () => { try { await api.platform.reviewSponsor(b.dataset.sp, b.dataset.ok !== "0", b.dataset.ok === "2"); reload("sponsors:"); } catch (e) { kit.toast(e.message, "error"); } }));
    kit.$$("[data-rp]", el).forEach((b) => b.addEventListener("click", async () => { try { await api.admin.resolveReport(b.dataset.rp); reload(); } catch (e) { kit.toast(e.message, "error"); } }));
    kit.$$("[data-hide]", el).forEach((b) => b.addEventListener("click", async () => { try { await api.admin.hidePost(b.dataset.hide); kit.toast("Post hidden", "success"); } catch (e) { kit.toast(e.message, "error"); } }));
    kit.$$("[data-tk]", el).forEach((b) => b.addEventListener("click", () => answer((store.peek("platform:tickets") || []).find((t) => String(t.id) === b.dataset.tk))));
  };

  /** Register a club (only the App Admin can create clubs), then appoint its admin. */
  function registerClub() {
    ui.sheet("Register Club", `<form id="rc" class="stack">${ui.field("Club name", ui.input("name", "", 'required maxlength="100" placeholder="EWU AI Research Club"'))}
      <div class="row" style="gap:8px">${ui.field("Short name", ui.input("short", "", 'maxlength="16" placeholder="EWUAIRC"'))}${ui.field("Category", ui.select("category", CATEGORIES, "tech"))}</div>
      ${ui.field("Address (slug)", ui.input("slug", "", 'required pattern="[a-z0-9][a-z0-9-]{1,40}" placeholder="ai-research"'))}${ui.field("Club Admin (student ID or email, optional)", ui.input("admin", "", 'placeholder="2024-1-60-123"'))}
      <div id="cl-err"></div><button class="btn primary block">${icon("plus")} Register</button></form>`, (s) => {
      const nameI = s.querySelector('[name="name"]'), slugI = s.querySelector('[name="slug"]');
      nameI.addEventListener("input", () => { if (!slugI.dataset.touched) slugI.value = nameI.value.toLowerCase().replace(/^ewu\s+/, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 36); });
      slugI.addEventListener("input", () => { slugI.dataset.touched = "1"; });
      kit.$("#rc", s).addEventListener("submit", async (e) => {
        e.preventDefault(); const f = ui.values(e.target), btn = e.target.querySelector("button.primary"); ctx.busy(btn, true, "Registering…");
        try {
          const c = await api.platform.createClub({ name: f.name.trim(), short_name: (f.short || "").trim(), category: f.category, slug: f.slug.trim() });
          if (f.admin) await api.admin.setAdmin(c.id, f.admin.trim());
          ctx.closeModal(); store.invalidate("platform:", "clubs:"); kit.go(`#/club/admin?tab=clubs&club=${c.id}`); kit.toast("Club registered", "success");
        } catch (err) { ctx.busy(btn, false); ui.fail(s, /duplicate|already/i.test(err.message) ? "That address is taken. Choose another." : err.message); }
      });
    });
  }
  function editTemplate(r) {
    if (!r) return;
    ui.sheet(`Default position: ${r.name}`, `<form id="tp" class="stack">${ui.field("Name", ui.input("name", r.name, 'required maxlength="40"'))}${ui.field("Description", ui.input("description", r.description, 'maxlength="200"'))}
      ${r.perms.includes("*") ? `<p class="small muted">This position has every permission.</p>` : PERM_GROUPS.map(([g, list]) => `<fieldset class="cl-perms"><legend>${g}</legend>${list.map(([k, l]) => ui.toggle(`p:${k}`, r.perms.includes(k), l)).join("")}</fieldset>`).join("")}
      <p class="xs">Changes apply to clubs created from now on. Existing clubs keep their own settings.</p><button class="btn primary block">Save</button></form>`, (s) =>
      kit.$("#tp", s).addEventListener("submit", async (e) => {
        e.preventDefault(); const f = ui.values(e.target);
        const perms = r.perms.includes("*") ? r.perms : Object.keys(f).filter((k) => k.startsWith("p:") && f[k]).map((k) => k.slice(2));
        try { await api.platform.saveTemplateRole({ id: r.id, name: f.name.trim(), description: f.description || "", perms }); ctx.closeModal(); store.invalidate("platform:template"); } catch (err) { kit.toast(err.message, "error"); }
      }));
  }
  function answer(t) {
    if (!t) return;
    const me = store.use(`ticket:msgs:${t.id}`, () => api.ticketMessages(t.id), { ttl: 20e3 });
    ui.sheet(`Ticket #${t.id}`, `<p><b>${esc(t.subject)}</b> · ${esc(t.name)} (${esc(t.email)})</p><div class="cl-bubble mt-s">${ui.rich(t.body)}</div>${(me.value || []).map((m) => `<div class="cl-bubble mt-s" style="${m.from_staff ? "background:var(--primary-ll)" : ""}"><b class="xs">${esc(m.name)}</b><br>${ui.rich(m.body)}</div>`).join("")}
      <form id="an" class="stack mt">${ui.area("b", "", 'rows="4" maxlength="4000" placeholder="Reply as Support Team" required')}<div class="row" style="gap:8px"><button class="btn primary grow">${icon("send")} Reply</button><button type="button" class="btn outline" id="an-res">Mark resolved</button></div></form>`, (s) => {
      kit.$("#an", s).addEventListener("submit", async (e) => { e.preventDefault(); try { await api.replyTicket(t.id, String(new FormData(e.target).get("b")).trim()); ctx.closeModal(); store.invalidate("platform:tickets"); kit.toast("Reply sent", "success"); } catch (err) { kit.toast(err.message, "error"); } });
      kit.$("#an-res", s).addEventListener("click", async () => { try { await api.platform.setTicket(t.id, { status: "resolved" }); ctx.closeModal(); store.invalidate("platform:tickets"); } catch (err) { kit.toast(err.message, "error"); } });
    });
  }
}
