/* EWUdiots Club — the club platform inside EWUdiots. Opened from More → EWUdiots Club; every #/club/… route draws
   in club mode: its own header (EWUdiots + lime "Club", "Unofficial · not affiliated with EWU"), its own bottom bar
   (Home · Clubs · + · Messages · More), its own accent, and a way back to the app.
   Layers: api.js + api-more.js (database) → store.js (cache) → views/* (screens), sharing ui.js, perms.js, charts.js.
   Who sees what:
     • everyone: clubs, public posts, recruitment, events, the store, sponsors and collaborations;
     • members: their club's workspace (chat, meetings, projects, resources, polls, elections);
     • positions given by the Club Admin unlock tools (perms.js); the EWUdiots team (App Admin) sees everything.
   Access comes from the club: an invite for your email or an accepted application makes you a member, and
   claim_club_invites() runs when you sign in, so the workspace is simply there next time you open Clubs. */
import { createClubApi } from "./api.js";
import { createStore } from "./store.js";
import { createUI } from "./ui.js";
import { createCart } from "./cart.js";
import * as charts from "./charts.js";
import { has, canManage, featureOn } from "./perms.js";
import { register as home } from "./views/home.js";
import { register as feed } from "./views/feed.js";
import { register as explore } from "./views/explore.js";
import { register as profile } from "./views/profile.js";
import { register as events } from "./views/events.js";
import { register as eventx } from "./views/eventx.js";
import { register as form } from "./views/form.js";
import { register as mine } from "./views/mine.js";
import { register as space } from "./views/space.js";
import { register as manage } from "./views/manage.js";
import { register as cert } from "./views/cert.js";
import { register as messages } from "./views/messages.js";
import { register as notifications } from "./views/notifications.js";
import { register as members } from "./views/members.js";
import { register as meetings } from "./views/meetings.js";
import { register as projects } from "./views/projects.js";
import { register as resources } from "./views/resources.js";
import { register as polls } from "./views/polls.js";
import { register as recruit } from "./views/recruit.js";
import { register as finance } from "./views/finance.js";
import { register as analytics } from "./views/analytics.js";
import { register as shop } from "./views/shop.js";
import { register as merch } from "./views/merch.js";
import { register as sponsors } from "./views/sponsors.js";
import { register as collab } from "./views/collab.js";
import { register as help } from "./views/help.js";
import { register as privacy } from "./views/privacy.js";
import { register as more } from "./views/more.js";
import { register as platform } from "./views/platform.js";
import { register as tickets } from "./views/tickets.js";
import "./clubs.css";
import "./clubs-v2.css";

const PREFIX = "club";
const BOTTOM = [["club/home", "home", "Home"], ["club/explore", "community", "Clubs"], ["fab"], ["club/messages", "chat", "Messages"], ["club/more", "grid", "More"]];
const SIDE = [["club/home", "home", "Home"], ["club/feed", "megaphone", "Feed"], ["club/explore", "community", "Clubs"], ["club/events", "calendar", "Events"], ["club/messages", "chat", "Messages"],
  ["club/notifications", "bell", "Notifications"], ["club/polls", "bars", "Polls & elections"], ["club/store", "bag", "Merch store"], ["club/collab", "handshake", "Collaborate"], ["club/sponsors", "briefcase", "Sponsors"], ["club/help", "help", "Help"]];
// Pages that light up a nav item.
const ACTIVE = {
  "club/c": "club/explore", "club/post": "club/feed", "club/form": "club/events", "club/event": "club/events", "club/eventadmin": "club/events", "club/checkin": "club/events", "club/tickets": "club/events", "club/pass": "club/events", "club/scan": "club/events",
  "club/chat": "club/messages", "club/space": "club/home", "club/manage": "club/home", "club/members": "club/home", "club/member": "club/home", "club/committee": "club/home",
  "club/meetings": "club/home", "club/meeting": "club/home", "club/projects": "club/home", "club/project": "club/home", "club/resources": "club/home", "club/recruit": "club/home",
  "club/applicant": "club/home", "club/finance": "club/home", "club/analytics": "club/home", "club/poll": "club/polls", "club/elections": "club/polls", "club/election": "club/polls",
  "club/product": "club/store", "club/cart": "club/store", "club/checkout": "club/store", "club/order": "club/store", "club/orders": "club/store", "club/merch": "club/home", "club/ordersadmin": "club/home", "club/orderadmin": "club/home",
  "club/sponsor": "club/sponsors", "club/ticket": "club/help", "club/mine": "club/more", "club/me": "club/more", "club/cert": "club/more", "club/privacy": "club/more", "club/admin": "club/more"
};

/** @param {any} ctx the app context from main.js */
export function install(ctx) {
  const { icon, esc, $ } = ctx;
  const isClub = (id) => id === PREFIX || String(id || "").startsWith(PREFIX + "/");
  const me = () => ctx.C.user;
  const api = ctx.cloud.enabled ? createClubApi(ctx.cloud.sb, me) : null;
  const store = createStore({ onChange: () => ctx.rerender(), isActive: () => isClub(ctx.route()) });
  const ui = createUI(ctx);
  const cart = createCart();

  /* ── Shared kit handed to every view ── */
  const memberships = () => (me() && api ? store.use("me:clubs", api.myClubs, { ttl: 30e3 }) : { loading: false, value: [] });
  const kit = {
    ctx, api, store, ui, icon, esc, $, $$: ctx.$$, toast: ctx.toast, me, cart, charts,
    param: (k) => ctx.qparam(k),
    go: (h) => ctx.go(h),
    memberships,
    /** Active memberships (the clubs I'm in). */
    myClubs: () => (memberships().value || []).filter((m) => m.status === "active"),
    /** My membership row in a club (or null). */
    membership: (clubId) => (memberships().value || []).find((m) => m.club_id === clubId && m.status === "active") || null,
    can: (clubId, perm) => has(kit.membership(clubId), perm) || kit.isPlatform(),
    canManage: (clubId) => canManage(kit.membership(clubId)) || kit.isPlatform(),
    /** Is a club feature switched on? (for clubs I'm in, from my_clubs; otherwise from the club row) */
    feature: (clubId, f, club = null) => { const m = kit.membership(clubId); return m ? featureOn(m, f) : !!(club?.features?.[f] ?? ["chat", "meetings", "projects", "resources", "polls", "elections", "finance", "recruitment", "events"].includes(f)); },
    /** The clubs where I hold a permission (for "manage" shortcuts). */
    clubsWith: (perm) => kit.myClubs().filter((m) => has(m, perm)),
    /** EWUdiots team member with clubs.manage (App Admin). */
    isPlatform: () => !!(me() && api && store.use("me:platform", () => api.platformCan("clubs.manage"), { ttl: 10 * 60e3 }).value),
    /** Page heading in club mode. */
    head: (title, sub = "", actions = "") => ui.ph(title, sub, actions),
    back: (href, label) => `<a class="cl-back" href="${href}">${icon("chevL", "sm")} ${esc(label)}</a>`,
    /** Not signed in (or no server in this build): one friendly card instead of the page. */
    gate(what = "this") {
      if (!api) return ui.emptyBox("cloudoff", "Needs the EWUdiots server", "EWUdiots Club works with an account. This build runs on this device only.");
      if (!me()) return ui.emptyBox("community", `Sign in to see ${what}`, "Clubs, members' spaces and registrations need your EWUdiots account.", `<a class="btn primary" href="#/login?from=profile">${icon("user")} Sign in</a>`);
      return "";
    },
    /** Members-only page: gate + membership check. Returns HTML to show instead, or "". */
    memberGate(clubId, what = "this space") {
      const g = kit.gate(what); if (g) return g;
      const ms = memberships(); if (ms.loading && !ms.value) return ui.skeleton(3);
      if (!kit.membership(clubId) && !kit.isPlatform()) return ui.emptyBox("lock", "For club members", `Only members can open ${what}. Join the club first.`, `<a class="btn primary" href="#/club/explore">Find clubs</a>`);
      return "";
    },
    /** Retry buttons in error boxes reload everything on the page. */
    bindRetry: (el) => { ctx.$$("[data-cl-retry]", el).forEach((b) => b.addEventListener("click", () => store.clear())); charts.bindTips(el); }
  };

  const views = { home, feed, explore, profile, events, eventx, form, mine, space, manage, cert, messages, notifications, members, meetings, projects, resources, polls, recruit, finance, analytics, shop, merch, sponsors, collab, help, privacy, more, platform, tickets };
  Object.values(views).forEach((register) => register(ctx.pages, kit));
  ctx.pages[PREFIX] = ctx.pages["club/home"]; // #/club → home
  // An admin can switch the whole club area off (Admin → Settings → Features).
  Object.keys(ctx.pages).filter(isClub).forEach((id) => { ctx.PAGE_FEATURE[id] = "clubs"; });
  ctx.PAGES_SEARCH.push(["club/home", "EWUdiots Club: your clubs, events and tasks", "community"], ["club/explore", "Find a club (all EWU clubs)", "community"],
    ["club/messages", "Club messages and chats", "chat"], ["club/store", "Club merchandise store", "bag"], ["club/events", "Club events and registrations", "calendar"]);

  /* ── Live notification count (bell) ── */
  const unread = () => (me() && api ? store.use("me:unread", api.unreadCount, { ttl: 60e3 }).value || 0 : 0);
  let liveOff = null;
  function liveNotifications() {
    if (liveOff || !api || !me()) return;
    liveOff = api.subscribeNotifications((n) => { store.refresh("me:unread", api.unreadCount); store.invalidate("me:notes"); if (isClub(ctx.route()) && !/chat/.test(ctx.route())) ctx.toast(n.title, "info", n.body || ""); });
  }

  /* ── Club-mode chrome ── */
  const link = (id, ic, l, active, badge = 0) => `<a href="#/${id}" ${active === id ? 'aria-current="page"' : ""}>${icon(ic)}<span>${l}</span>${badge ? `<span class="badge-n">${badge > 9 ? "9+" : badge}</span>` : ""}</a>`;
  // A sheet left open must not follow you to the next page (links inside sheets, the back button).
  let lastHash = "";
  addEventListener("hashchange", () => { if (isClub(ctx.route()) && location.hash !== lastHash && ctx.modalOpen()) ctx.closeModal(); lastHash = location.hash; });
  function renderNav(route) {
    if (me() && api && kit.myClubs().length) store.use("club:scanevents", api.myScanEvents, { ttl: 5 * 60e3 }); // for the + menu
    document.body.dataset.mode = "club";
    liveNotifications();
    const active = ACTIVE[route] || (route === PREFIX ? "club/home" : route);
    const mineList = kit.myClubs(), n = unread(), cartN = cart.count();
    $("#side-nav").innerHTML = `<a href="#/home" class="cl-exit">${icon("chevL")}<span>Back to EWUdiots</span></a>
      ${SIDE.map(([id, ic, l]) => link(id, ic, l, active, id === "club/notifications" ? n : 0)).join("")}
      ${kit.isPlatform() ? link("club/admin", "shield", "App Admin", active) : ""}
      ${mineList.length ? `<p class="cl-side-h">Your clubs</p>${mineList.map((m) => `<a href="#/club/space?c=${m.club_id}" ${ctx.qparam("c") === m.club_id ? 'aria-current="page"' : ""}>${ui.logo(m, "xs")}<span class="ellipsis">${esc(m.short_name || m.name)}</span></a>`).join("")}` : ""}`;
    $("#bottom-nav").innerHTML = BOTTOM.map(([id, ic, l]) => (id === "fab"
      ? `<button class="fab" id="cl-fab" type="button" aria-label="Create">${`<span class="fab-btn">${icon("plus")}</span>`}</button>`
      : `<a href="#/${id}" ${active === id ? 'aria-current="page"' : ""}>${icon(ic)}<span>${l}</span></a>`)).join("");
    $("#cl-fab")?.addEventListener("click", fabMenu);
    // Header: club notifications on the bell, cart (when it has something) and my profile.
    const bell = $("#top-bell");
    bell.href = "#/club/notifications"; bell.innerHTML = `${icon("bell")}${n ? `<span class="dot-n">${n > 9 ? "9+" : n}</span>` : ""}`; bell.setAttribute("aria-label", `Club notifications${n ? `, ${n} unread` : ""}`);
    let x = $("#cl-topx");
    if (!x) { x = Object.assign(document.createElement("span"), { id: "cl-topx", className: "cl-topx" }); bell.after(x); }
    x.innerHTML = `${cartN ? `<a class="icon-btn" href="#/club/cart" aria-label="Cart, ${cartN} items">${icon("cart")}<span class="dot-n">${cartN}</span></a>` : ""}
      <a class="cl-me" href="#/club/me" aria-label="My club profile">${me() ? ctx.myAvatar("sm") : icon("user", "sm")}</a>`;
    document.querySelectorAll(".topbar .mlogo, .sidebar .logo").forEach((a) => a.setAttribute("href", "#/club/home"));
  }
  function leave() {
    if (document.body.dataset.mode !== "club") return;
    delete document.body.dataset.mode;
    $("#cl-topx")?.remove();
    const bell = $("#top-bell"); if (bell) bell.href = "#/notifications";
    document.querySelectorAll(".topbar .mlogo, .sidebar .logo").forEach((a) => a.setAttribute("href", "#/home"));
  }
  cart.onChange(() => { if (isClub(ctx.route())) renderNav(ctx.route()); });

  /** The + button: whatever this person can create, across their clubs. */
  function fabMenu() {
    if (!me()) return kit.go("#/login?from=profile");
    const first = (perm) => kit.clubsWith(perm)[0]?.club_id;
    const items = [
      ["chat", "purple", "New message", "Chat with your club", kit.myClubs().length && "#/club/messages"],
      ["megaphone", "pink", "Post an announcement", "News for members or everyone", first("posts.write") && `#/club/manage?c=${first("posts.write")}&tab=posts&new=1`],
      ["calendar", "blue", "Create an event", "With registration and QR tickets", first("events.manage") && `#/club/manage?c=${first("events.manage")}&tab=events&new=1`],
      ["clipboard", "teal", "Plan a meeting", "Agenda, link and minutes", first("meetings.manage") && `#/club/meetings?c=${first("meetings.manage")}&new=1`],
      ["kanban", "orange", "New project", "Task board for a team", first("projects.manage") && `#/club/projects?c=${first("projects.manage")}&new=1`],
      ["bars", "green", "Start a poll", "Ask members to vote", first("polls.create") && `#/club/polls?c=${first("polls.create")}&new=1`],
      ["edit", "purple", "Recruitment form", "Applications with interviews", first("forms.create") && `#/club/manage?c=${first("forms.create")}&tab=forms&new=1`],
      ["ticket", "green", "Scan tickets", "Check people in at an event", (store.peek("club:scanevents") || []).length && "#/club/scan"],
      ["qr", "amber", "Scan a pickup", "Hand over a merch order", first("orders.manage") && `#/club/ordersadmin?c=${first("orders.manage")}&scan=1`],
      ["help", "gray", "Get help", "Report a problem or ask", "#/club/help"]
    ];
    const list = items.filter((x) => x[4]); // only what this person can do
    ui.sheet("Create", `<div class="stack" style="gap:0">${list.map(([ic, tone, t, d, href]) => `<a class="lrow" href="${href}" data-close-sheet><span class="itile ${tone}">${icon(ic)}</span><span class="body"><b>${t}</b><span>${d}</span></span>${icon("chevR", "chev")}</a>`).join("")}</div>`,
      (m) => ctx.$$("[data-close-sheet]", m).forEach((a) => a.addEventListener("click", () => ctx.closeModal())));
  }

  /* ── Invites become memberships on sign-in ── */
  let claimedFor = null;
  // The auth event can arrive before main.js has stored the user (its listener runs after ours), so use the event's user.
  async function claimInvites(u = me()) {
    if (!api || !u || claimedFor === u.id) return;
    claimedFor = u.id;
    try {
      const n = await api.claimInvites();
      if (n > 0) { store.invalidate("me:", "club:"); ctx.toast(n === 1 ? "You've been added to a club" : `You've been added to ${n} clubs`, "success", "Open More → EWUdiots Club to see your workspace."); }
    } catch { claimedFor = null; /* offline: try again next time */ }
  }
  if (api) ctx.cloud.onAuth((u) => { if (u) claimInvites(u); else { claimedFor = null; liveOff?.(); liveOff = null; store.clear(); } });

  return { owns: isClub, renderNav, leave, claimInvites, kit };
}
