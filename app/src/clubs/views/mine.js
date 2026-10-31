/* My clubs (#/club/mine): memberships with the way into each members' space and console, plus requests and claims
   waiting for an answer. Me (#/club/me): registrations and tickets, certificates, clubs I follow. */
import { STATUSES, FORM_KINDS } from "../forms.js";
import { drawCertificate } from "./cert.js";

/** @param {Record<string, any>} pages @param {any} kit */
export function register(pages, kit) {
  const { ui, icon, esc, api, store } = kit;
  const clubs = () => store.use("clubs:all", api.listClubs, { ttl: 5 * 60e3 }).value || [];
  const byId = (id) => clubs().find((c) => c.id === id);

  pages["club/mine"] = () => {
    const head = kit.head("My clubs", "Clubs you belong to. Club admins add you by inviting your student ID or email, or by accepting your application.");
    const g = kit.gate("your clubs"); if (g) return head + g;
    const me = kit.memberships(), reqs = store.use("me:requests", api.myRequests).value || [], claims = store.use("me:claims", api.myClaims).value || [];
    return head + ui.view(me, (rows) => {
      const active = rows.filter((m) => m.status === "active"), alumni = rows.filter((m) => m.status === "alumni");
      const waiting = reqs.filter((r) => r.status === "pending"), myClaims = claims.filter((c) => c.status === "pending");
      return `${active.length ? `<div class="cl-grid">${active.map((m) => card(m)).join("")}</div>`
          : ui.emptyBox("community", "You're not in a club yet", "Explore EWU's clubs and apply, or ask your club's admin to invite your student ID.", `<a class="btn primary" href="#/club/explore">${icon("search")} Explore clubs</a>`)}
        ${waiting.length || myClaims.length ? `<h2 class="cl-h2">Waiting for an answer</h2><section class="card tight">${[...waiting.map((r) => [byId(r.club_id), "Request to join", r.created_at]), ...myClaims.map((c) => [byId(c.club_id), `Claim as ${c.position}`, c.created_at])]
          .map(([c, what, at]) => `<div class="lrow">${ui.logo(c, "sm")}<span class="body"><b>${esc(c?.name || "Club")}</b><span>${esc(what)} · ${ui.ago(at)}</span></span>${ui.pill("Pending", "amber")}</div>`).join("")}</section>` : ""}
        ${alumni.length ? `<h2 class="cl-h2">Past clubs</h2><section class="card tight">${alumni.map((m) => `<div class="lrow">${ui.logo(m, "sm")}<span class="body"><b>${esc(m.name)}</b><span>Club alumni</span></span></div>`).join("")}</section>` : ""}`;
    });
  };
  const card = (m) => {
    const c = m; // my_clubs() carries the club's name, slug, colour and logo
    return `<article class="cl-card static" style="--cc:${esc(c.color)}"><span class="cl-card-band" aria-hidden="true"></span>
      <div class="row nowrap" style="gap:12px">${ui.logo(c)}<div class="grow min0"><b class="ellipsis cl-name">${esc(c.name)}${ui.verified(c)}</b><span class="xs">${esc(m.title || m.role_name)}${m.wing ? ` · ${esc(m.wing)} wing` : ""}</span></div></div>
      <div class="row" style="gap:6px">${ui.rolePill(m.rank, m.role_name)}</div>
      <div class="row" style="gap:8px;margin-top:auto"><a class="btn sm primary" href="#/club/space?c=${m.club_id}">${icon("community", "sm")} Members' space</a>
        ${kit.canManage(m.club_id) ? `<a class="btn sm outline" href="#/club/manage?c=${m.club_id}">${icon("settings", "sm")} Manage</a>` : ""}
        <a class="btn sm ghost" href="#/club/c?slug=${encodeURIComponent(c.slug)}">Profile</a></div></article>`;
  };
  pages["club/mine"].mount = (el) => kit.bindRetry(el);

  let tab = "regs";
  const TABS = [["regs", "Tickets & registrations"], ["tasks", "My tasks"], ["certs", "Certificates"], ["orders", "Orders"], ["following", "Following"]];
  pages["club/me"] = () => {
    const g = kit.gate("your profile"); if (g) return kit.head("Profile & Settings", "") + g;
    const want = kit.param("tab") === "tickets" ? "regs" : kit.param("tab");
    tab = TABS.some(([v]) => v === want) ? want : tab;
    const p = kit.ctx.S.profile || {}, user = kit.me();
    const mine = kit.myClubs(), resp = store.use("me:responses", api.myResponses, { ttl: 30e3 }).value || [], certsN = (store.use("me:certs", api.myCerts).value || []).length;
    const done = [!!p.name, !!p.photo, !!p.department || !!p.program, mine.length > 0, mine.some((m) => m.bio || m.skills?.length)].filter(Boolean).length, pct = Math.round((done / 5) * 100);
    const body = tab === "tasks" ? tasks() : tab === "certs" ? certs() : tab === "orders" ? orders() : tab === "following" ? following() : regs();
    return `${kit.head("Profile & Settings", "Manage your account, privacy, and preferences")}
      <section class="card me-head"><span class="cl-ava xl">${kit.ctx.myAvatar("lg")}</span><div class="min0"><h2>${esc(p.name || user?.user_metadata?.name || "Your name")}</h2>
          <p class="xs">${esc([p.program || p.department, p.id && `Batch ${String(p.id).slice(0, 4)}`].filter(Boolean).join(" · "))}</p></div><a class="btn outline sm" href="#/profile">${icon("edit", "sm")} Edit profile</a></section>
      <div class="cl-stats mt">${ui.stat("community", "purple", mine.length, "Clubs")}${ui.stat("calendar", "blue", resp.filter((r) => r.checked_in_at).length, "Events attended")}${ui.stat("edit", "green", resp.length, "Registrations")}${ui.stat("award", "amber", certsN, "Certificates")}</div>
      ${pct < 100 ? `<a class="alert purple" href="#/profile" style="text-decoration:none;color:inherit"><span class="a-ic">${icon("crown")}</span><div class="grow"><b>Complete Your Profile</b><p>A complete profile helps you connect with club members and opportunities.</p></div>${kit.charts.ring({ value: pct / 100, label: `${pct}%`, size: 64 })}</a>` : ""}
      <nav class="cl-seg mt">${TABS.map(([v, l]) => `<button data-mt="${v}" aria-pressed="${tab === v}">${l}</button>`).join("")}</nav><div>${body}</div>
      ${ui.sec("Settings")}<div class="cl-list">${[["user", "blue", "Account Settings", "Personal information, email, password", "#/account"], ["image", "purple", "Club Profile", "Bio, skills, links and photo in each club", mine[0] ? `#/club/member?c=${mine[0].club_id}&u=${user.id}` : "#/club/explore"],
        ["lock", "orange", "Privacy & Visibility", "Control who can see your information", "#/club/privacy"], ["bell", "red", "Notifications", "Club news, tasks, orders and messages", "#/club/notifications"], ["shield", "blue", "Security", "Password and sign-in", "#/account"],
        ["moon", "purple", "Appearance", "Light mode, dark mode", "#/more"], ["database", "purple", "Data & Storage", "Download your club data", "#/club/privacy"], ["help", "green", "Help & Support", "Get help or contact the team", "#/club/help"]]
        .map(([ic, t, l, d, h]) => `<a class="cl-setrow" href="${h}"><span class="itile sm ${t}">${icon(ic)}</span><span class="body"><b>${l}</b><span>${d}</span></span>${icon("chevR", "sm")}</a>`).join("")}</div>`;
  };
  const tasks = () => ui.view(store.use("me:tasks", api.myTasks, { ttl: 30e3 }), (rows) => (rows.length
    ? `<div class="cl-list">${rows.map((t) => `<a class="cl-li" href="${t.project_id ? `#/club/project?id=${t.project_id}` : `#/club/space?c=${t.club_id}&tab=tasks`}"><span class="itile sm ${t.status === "doing" ? "blue" : "gray"}">${icon("checksq")}</span><span class="body"><b>${esc(t.title)}</b><span>${esc(t.clubs?.short_name || "")}${t.due ? ` · due ${ui.dateShort(t.due)}` : ""}</span></span>${ui.st({ high: ["High", "red"], medium: ["Medium", "amber"], low: ["Low", "gray"] }[t.priority] || ["Medium", "amber"])}</a>`).join("")}</div>`
    : ui.emptyBox("checksq", "No open tasks", "Tasks your club gives you appear here.")));
  const orders = () => ui.view(store.use("me:orders", api.myOrders, { ttl: 30e3 }), (rows) => (rows.length
    ? `<div class="cl-list">${rows.map((o) => `<a class="cl-li" href="#/club/order?id=${o.id}"><span class="itile sm purple">${icon("bag")}</span><span class="body"><b>#${esc(o.code)} · ${esc(o.club_name)}</b><span>${ui.dateShort(o.created_at)} · ${ui.money(o.total)}</span></span>${ui.st([o.status.replace("_", " "), o.status === "ready" ? "green" : o.status === "cancelled" ? "red" : "blue"])}</a>`).join("")}</div>`
    : ui.emptyBox("bag", "No orders yet", "", `<a class="btn primary" href="#/club/store">Merch store</a>`)));
  const regs = () => ui.view(store.use("me:responses", api.myResponses, { ttl: 30e3 }), (rows) => (rows.length
    ? `<section class="card tight">${rows.map((r) => { const [l, tone] = STATUSES[r.status] || ["Sent", ""], c = byId(r.club_id); return `<a class="lrow" href="#/club/form?id=${r.form_id}">${ui.logo(c, "sm")}<span class="body"><b>${esc(r.club_forms?.title || "Form")}</b><span>${esc(c?.short_name || c?.name || "")} · ${esc(FORM_KINDS[r.club_forms?.kind] || "")} · ${ui.ago(r.created_at)}${r.interview_at ? ` · interview ${ui.dateTime(r.interview_at)}` : ""}</span></span>${r.ticket && r.status !== "rejected" ? ui.pill(`${icon("receipt", "sm")} Ticket`, "blue") : ""}${ui.pill(l, tone)}</a>`; }).join("")}</section>`
    : ui.emptyBox("edit", "No registrations yet", "When you apply to a club or register for an event, it shows up here.", `<a class="btn primary" href="#/club/events">${icon("calendar")} Club events</a>`)));
  const certs = () => ui.view(store.use("me:certs", api.myCerts), (rows) => (rows.length
    ? `<div class="cl-grid">${rows.map((c) => `<article class="card cl-cert" style="--cc:${esc(c.clubs?.color || "#7C3AED")}"><span class="itile purple">${icon("award")}</span><b>${esc(c.title)}</b><span class="xs">${esc(c.clubs?.name || "")}${c.event ? ` · ${esc(c.event)}` : ""} · ${ui.dateLong(c.issued_on)}</span>
        <div class="row mt-s" style="gap:8px"><button class="btn sm primary" data-cert="${c.id}">${icon("download", "sm")} Save</button><a class="btn sm ghost" href="#/club/cert?code=${encodeURIComponent(c.code)}">${icon("checkc", "sm")} Verify link</a></div></article>`).join("")}</div>`
    : ui.emptyBox("award", "No certificates yet", "Clubs can send you certificates for events and volunteering.")));
  const following = () => {
    const ids = store.use("me:follows", api.follows).value || [];
    const list = clubs().filter((c) => ids.includes(c.id));
    return list.length ? `<div class="cl-grid">${list.map((c) => ui.clubCard(c, { following: true })).join("")}</div>` : ui.emptyBox("bell", "You don't follow any clubs", "Follow clubs to see their posts in your feed.", `<a class="btn primary" href="#/club/explore">Explore</a>`);
  };
  pages["club/me"].mount = (el) => {
    kit.$$("[data-mt]", el).forEach((b) => b.addEventListener("click", () => { tab = b.dataset.mt; kit.go(`#/club/me?tab=${tab}`); }));
    kit.$$("[data-cert]", el).forEach((b) => b.addEventListener("click", async () => {
      const c = (store.peek("me:certs") || []).find((x) => x.id === b.dataset.cert); if (!c) return;
      const blob = await drawCertificate({ ...c, club: c.clubs?.name || "", color: c.clubs?.color }, kit.ctx.SITE);
      ui.download(`certificate-${c.code}.png`, blob);
    }));
    kit.bindRetry(el);
  };
}
