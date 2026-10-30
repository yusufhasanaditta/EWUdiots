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
  pages["club/me"] = () => {
    const head = kit.head("Me", "Your registrations, tickets and certificates.");
    const g = kit.gate("your registrations"); if (g) return head + g;
    tab = ["regs", "certs", "following"].includes(kit.param("tab")) ? kit.param("tab") : tab;
    const body = tab === "regs" ? regs() : tab === "certs" ? certs() : following();
    return `${head}${kit.ctx.seg([["regs", "Registrations"], ["certs", "Certificates"], ["following", "Following"]], tab, "data-mt")}<div class="mt">${body}</div>`;
  };
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
