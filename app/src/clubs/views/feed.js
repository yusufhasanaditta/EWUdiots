/* Club feed (#/club/feed): posts from every club the person may see, open registrations on top.
   "For you" = clubs you follow or belong to; "All clubs" = every public post; "Recruiting" = recruitment posts + forms. */
import { createPosts } from "./posts.js";

/** @param {Record<string, any>} pages @param {any} kit */
export function register(pages, kit) {
  const { ui, icon, esc, api, store } = kit;
  const posts = createPosts(kit);
  let tab = "foryou";

  const openForms = () => store.use("forms:open", api.openForms, { ttl: 60e3 });
  function formStrip(list) {
    const open = (list || []).filter((f) => !f.settings?.deadline || new Date(f.settings.deadline) > Date.now()).slice(0, 12);
    if (!open.length) return "";
    return `<h2 class="cl-h2">${icon("edit", "sm")} Open registrations</h2><div class="cl-strip">${open.map((f) => `<a class="cl-formchip" href="#/club/form?id=${f.id}" style="--cc:${esc(f.clubs.color)}">
      ${ui.logo(f.clubs, "sm")}<span class="min0"><b class="ellipsis">${esc(f.title)}</b><span class="xs ellipsis">${esc(f.clubs.short_name || f.clubs.name)}${f.settings?.deadline ? ` · until ${ui.dateShort(f.settings.deadline)}` : ""}</span></span></a>`).join("")}</div>`;
  }

  pages["club/feed"] = () => {
    const head = `<section class="cl-hero"><div class="min0"><span class="cl-eyebrow">${icon("community", "sm")} EWUdiots Club</span><h1>What's happening in EWU's clubs</h1>
      <p>News, events and sign-ups from every club. Members see their club's private posts here too.</p></div>
      <div class="row" style="gap:8px"><a class="btn white" href="#/club/explore">${icon("search")} Find a club</a>${kit.me() ? `<a class="btn glass" href="#/club/mine">${icon("community")} My clubs</a>` : ""}</div></section>`;
    if (!api) return head + kit.gate("club posts");
    const mine = kit.memberships().value || [], follows = kit.me() ? store.use("me:follows", api.follows).value || [] : [];
    const myIds = [...new Set([...mine.filter((m) => m.status === "active").map((m) => m.club_id), ...follows])];
    const forYou = tab === "foryou" && kit.me() && myIds.length;
    const key = `feed:${tab}:${forYou ? myIds.join(",") : "all"}`;
    const fe = store.use(key, () => api.feed({ clubIds: forYou ? myIds : null, kind: tab === "recruiting" ? "recruitment" : null }), { ttl: 45e3 });
    return `${head}${ui.view(openForms(), formStrip, { n: 1, h: 64 })}
      <div class="row between mt" style="gap:8px">${kit.ctx.seg([["foryou", "For you"], ["all", "All clubs"], ["recruiting", "Recruiting"]], tab, "data-ft")}</div>
      ${tab === "foryou" && kit.me() && !myIds.length ? `<div class="card soft mt row nowrap"><span class="itile purple">${icon("bell")}</span><div class="grow"><b>Follow clubs to fill your feed</b><p class="small muted">Until then you see every club's public posts.</p></div><a class="btn sm" href="#/club/explore">Explore</a></div>` : ""}
      <div class="mt">${ui.view(fe, (rows) => {
        if (!rows.length) return ui.emptyBox("megaphone", tab === "recruiting" ? "No recruitment posts right now" : "No posts yet", tab === "recruiting" ? "When a club opens recruitment, it shows up here." : "When clubs post news and events, you'll see them here.", `<a class="btn primary" href="#/club/explore">${icon("search")} Explore clubs</a>`);
        const m = posts.meta(rows);
        return `<div class="stack">${rows.map((p) => posts.card(p, m)).join("")}</div>`;
      })}</div>
      <p class="xs mt" style="text-align:center">Clubs run their own pages. Unofficial · not affiliated with EWU.</p>`;
  };
  pages["club/feed"].mount = (el) => {
    kit.$$("[data-ft]", el).forEach((b) => b.addEventListener("click", () => { tab = b.dataset.ft; kit.ctx.rerender(); }));
    posts.bind(el); kit.bindRetry(el);
  };

  pages["club/post"] = posts.page;
}
