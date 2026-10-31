/* Club feed (#/club/feed), from the right-hand phone of the "Student Dashboard" board: pill tabs, a carousel of
   upcoming events with Register Now, then "Club Feed" filtered by club.
   For You = clubs you follow or belong to (every public post until you follow some); My Clubs = clubs you're in;
   Announcements / Events / Recruiting = posts of that kind. */
import { createPosts } from "./posts.js";
import { KINDS } from "../../events.js";

/** @param {Record<string, any>} pages @param {any} kit */
export function register(pages, kit) {
  const { ui, icon, esc, api, store } = kit;
  const posts = createPosts(kit);
  const TABS = [["foryou", "For You"], ["mine", "My Clubs"], ["announcement", "Announcements"], ["event", "Events"], ["recruitment", "Recruiting"]];
  let tab = "foryou", only = "", slide = 0;

  // Upcoming events as big poster slides (the event photo, or the title set as a poster).
  const hero = (rows) => {
    const list = rows.filter((e) => new Date(e.ends_at || e.starts_at) > Date.now()).slice(0, 5);
    if (!list.length) return "";
    slide = Math.min(slide, list.length - 1);
    return `<section class="cl-evhero" aria-roledescription="carousel" aria-label="Upcoming events"><div class="track" id="fd-track">${list.map((e) => `<a class="slide" href="#/club/event?id=${e.id}">
        ${e.image ? `<img src="${esc(e.image)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ""}<span class="in"><b>${esc(e.title)}</b><span class="sub">${esc(e.clubs?.short_name || e.clubs?.name || "")} · ${esc(KINDS[e.kind] || "Event")}</span>
        <span class="meta"><span>${icon("calendar", "sm")} ${ui.when(e.starts_at, { day: "numeric", month: "long", year: "numeric" })}</span><span>${icon("clock", "sm")} ${ui.time(e.starts_at)}${e.ends_at ? ` - ${ui.time(e.ends_at)}` : ""}</span>${e.venue ? `<span>${icon("pin", "sm")} ${esc(e.venue)}</span>` : ""}</span>
        <span class="btn sm white">Register Now</span></span>${e.clubs?.logo_url ? `<img class="mark" src="${esc(e.clubs.logo_url)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<span class="mark mono">${esc(e.clubs?.short_name || "")}</span>`}</a>`).join("")}</div>
      ${list.length > 1 ? `<div class="dots">${list.map((_, i) => `<button data-slide="${i}" aria-label="Event ${i + 1}" aria-current="${i === slide}"></button>`).join("")}</div>` : ""}</section>`;
  };

  pages["club/feed"] = () => {
    if (!api) return kit.gate("club posts");
    const mine = kit.myClubs(), follows = kit.me() ? store.use("me:follows", api.follows).value || [] : [];
    const myIds = mine.map((m) => m.club_id), forIds = [...new Set([...myIds, ...follows])];
    const ids = only ? [only] : tab === "mine" ? myIds : tab === "foryou" && forIds.length ? forIds : null;
    const kind = ["announcement", "event", "recruitment"].includes(tab) ? tab : null;
    const fe = store.use(`feed:${tab}:${only}:${ids ? ids.join(",") : "all"}`, () => api.feed({ clubIds: ids, kind }), { ttl: 45e3 });
    const clubs = [...new Map([...mine.map((m) => [m.club_id, m.short_name || m.name]), ...(fe.value || []).map((p) => [p.club_id, p.clubs?.short_name || p.clubs?.name])]).entries()];
    return `${ui.seg(TABS.map(([v, l]) => [v, l]), tab, (v) => `#/club/feed?tab=${v}`)}
      ${ui.view(store.use("club:upcoming", api.upcomingClubEvents, { ttl: 60e3 }), hero, { n: 1, h: 200 })}
      <div class="cl-sec"><h2>Club Feed</h2><label class="cl-pick">${ui.select("fd-club", [["", "All Clubs"], ...clubs], only, 'id="fd-club" aria-label="Show posts from"')}</label></div>
      ${tab === "mine" && !myIds.length ? `<div class="card soft row nowrap"><span class="itile purple">${icon("community")}</span><div class="grow"><b>You're not in a club yet</b><p class="small muted">Club admins add members; you can also apply to clubs that recruit.</p></div><a class="btn sm" href="#/club/explore">Explore</a></div>` : ""}
      ${ui.view(fe, (rows) => {
        if (!rows.length) return ui.emptyBox("megaphone", "No posts here yet", "When clubs post news, events and recruitment, you'll see them here.", `<a class="btn primary" href="#/club/explore">${icon("search")} Explore clubs</a>`);
        const m = posts.meta(rows);
        return `<div class="stack">${rows.map((p) => posts.card(p, m)).join("")}</div>`;
      })}
      <p class="xs mt" style="text-align:center">Clubs run their own pages. Unofficial · not affiliated with EWU.</p>`;
  };
  pages["club/feed"].mount = (el) => {
    const t = kit.param("tab"); if (t && t !== tab && TABS.some(([v]) => v === t)) { tab = t; kit.ctx.rerender(); return; }
    kit.$("#fd-club", el)?.addEventListener("change", (e) => { only = e.target.value; kit.ctx.rerender(); });
    const track = kit.$("#fd-track", el);
    if (track) {
      const dots = kit.$$("[data-slide]", el);
      const show = (i) => { slide = i; track.scrollTo({ left: track.clientWidth * i, behavior: "smooth" }); dots.forEach((d, k) => d.setAttribute("aria-current", String(k === i))); };
      dots.forEach((d) => d.addEventListener("click", () => show(Number(d.dataset.slide))));
      track.addEventListener("scroll", () => { const i = Math.round(track.scrollLeft / Math.max(1, track.clientWidth)); if (i !== slide) { slide = i; dots.forEach((d, k) => d.setAttribute("aria-current", String(k === i))); } }, { passive: true });
      if (slide) track.scrollLeft = track.clientWidth * slide;
    }
    posts.bind(el); kit.bindRetry(el);
  };

  pages["club/post"] = posts.page;
}
