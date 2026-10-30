/* EWUdiots Club — the club platform inside EWUdiots. Opened from More → EWUdiots Club; every #/club/… route draws
   in club mode: its own navigation (Feed · Explore · Events · My clubs · Me), its own accent, and a way back.
   Layers: api.js (database) → store.js (cache) → views/* (screens), sharing ui.js and perms.js.
   Access comes from the club: an invite for your email or an accepted application makes you a member, and
   claim_club_invites() runs when you sign in, so the members' space is simply there next time you open Clubs. */
import { createClubApi } from "./api.js";
import { createStore } from "./store.js";
import { createUI } from "./ui.js";
import { has, canManage } from "./perms.js";
import { register as feed } from "./views/feed.js";
import { register as explore } from "./views/explore.js";
import { register as profile } from "./views/profile.js";
import { register as events } from "./views/events.js";
import { register as form } from "./views/form.js";
import { register as mine } from "./views/mine.js";
import { register as space } from "./views/space.js";
import { register as manage } from "./views/manage.js";
import { register as cert } from "./views/cert.js";
import "./clubs.css";

const PREFIX = "club";
const NAV = [["club/feed", "home", "Feed"], ["club/explore", "globe", "Explore"], ["club/events", "calendar", "Events"], ["club/mine", "community", "My clubs"], ["club/me", "user", "Me"]];
// Pages that light up a bottom-nav item.
const ACTIVE = { "club/c": "club/explore", "club/post": "club/feed", "club/form": "club/events", "club/space": "club/mine", "club/manage": "club/mine", "club/cert": "club/me" };

/** @param {any} ctx the app context from main.js */
export function install(ctx) {
  const { icon, esc, $ } = ctx;
  const isClub = (id) => id === PREFIX || String(id || "").startsWith(PREFIX + "/");
  const me = () => ctx.C.user;
  const api = ctx.cloud.enabled ? createClubApi(ctx.cloud.sb, me) : null;
  const store = createStore({ onChange: () => ctx.rerender(), isActive: () => isClub(ctx.route()) });
  const ui = createUI(ctx);

  /* ── Shared kit handed to every view ── */
  const memberships = () => (me() && api ? store.use("me:clubs", api.myClubs, { ttl: 30e3 }) : { loading: false, value: [] });
  const kit = {
    ctx, api, store, ui, icon, esc, $, $$: ctx.$$, toast: ctx.toast, me,
    param: (k) => ctx.qparam(k),
    go: (h) => ctx.go(h),
    memberships,
    /** My membership row in a club (or null). */
    membership: (clubId) => (memberships().value || []).find((m) => m.club_id === clubId && m.status === "active") || null,
    can: (clubId, perm) => has(kit.membership(clubId), perm),
    canManage: (clubId) => canManage(kit.membership(clubId)),
    /** Page heading in club mode. */
    head: (title, sub = "", actions = "") => ctx.head(title, sub, actions),
    back: (href, label) => `<a class="cl-back" href="${href}">${icon("chevL", "sm")} ${esc(label)}</a>`,
    /** Not signed in (or no server in this build): one friendly card instead of the page. */
    gate(what = "this") {
      if (!api) return ui.emptyBox("cloudoff", "Needs the EWUdiots server", "EWUdiots Club works with an account. This build runs on this device only.");
      if (!me()) return ui.emptyBox("community", `Sign in to see ${what}`, "Clubs, members' spaces and registrations need your EWUdiots account.", `<a class="btn primary" href="#/login?from=profile">${icon("user")} Sign in</a>`);
      return "";
    },
    /** Retry buttons in error boxes reload everything on the page. */
    bindRetry: (el) => ctx.$$("[data-cl-retry]", el).forEach((b) => b.addEventListener("click", () => store.clear()))
  };

  const views = { feed, explore, profile, events, form, mine, space, manage, cert };
  Object.values(views).forEach((register) => register(ctx.pages, kit));
  ctx.pages[PREFIX] = ctx.pages["club/feed"]; // #/club → the feed
  // An admin can switch the whole club area off (Admin → Settings → Features).
  Object.keys(ctx.pages).filter(isClub).forEach((id) => { ctx.PAGE_FEATURE[id] = "clubs"; });
  ctx.PAGES_SEARCH.push(["club/feed", "EWUdiots Club: club news, events and registrations", "community"], ["club/explore", "Find a club (all EWU clubs)", "community"], ["club/mine", "My clubs and members' spaces", "community"]);

  /* ── Club-mode navigation ── */
  function renderNav(route) {
    document.body.dataset.mode = "club";
    const active = ACTIVE[route] || (route === PREFIX ? "club/feed" : route);
    const mineList = (memberships().value || []).filter((m) => m.status === "active");
    $("#side-nav").innerHTML = `<a href="#/home" class="cl-exit">${icon("chevL")}<span>Back to EWUdiots</span></a>
      <div class="cl-side-brand">${icon("community")}<b>EWUdiots <i>Club</i></b></div>
      ${NAV.map(([id, ic, l]) => `<a href="#/${id}" ${active === id ? 'aria-current="page"' : ""}>${icon(ic)}<span>${l}</span></a>`).join("")}
      ${mineList.length ? `<p class="cl-side-h">Your clubs</p>${mineList.map((m) => `<a href="#/club/space?c=${m.club_id}" ${ctx.qparam("c") === m.club_id ? 'aria-current="page"' : ""}>${ui.logo(m, "xs")}<span class="ellipsis">${esc(m.short_name || m.name)}</span></a>`).join("")}` : ""}`;
    $("#bottom-nav").innerHTML = NAV.map(([id, ic, l]) => `<a href="#/${id}" ${active === id ? 'aria-current="page"' : ""}>${icon(ic)}<span>${l}</span></a>`).join("");
  }
  function leave() { if (document.body.dataset.mode === "club") delete document.body.dataset.mode; }

  /* ── Invites become memberships on sign-in ── */
  let claimedFor = null;
  // The auth event can arrive before main.js has stored the user (its listener runs after ours), so use the event's user.
  async function claimInvites(u = me()) {
    if (!api || !u || claimedFor === u.id) return;
    claimedFor = u.id;
    try {
      const n = await api.claimInvites();
      if (n > 0) { store.invalidate("me:", "club:"); ctx.toast(n === 1 ? "You've been added to a club" : `You've been added to ${n} clubs`, "success", "Open More → EWUdiots Club to see your members' space."); }
    } catch { claimedFor = null; /* offline: try again next time */ }
  }
  if (api) ctx.cloud.onAuth((u) => { if (u) claimInvites(u); else { claimedFor = null; store.clear(); } });

  return { owns: isClub, renderNav, leave, claimInvites, kit };
}
