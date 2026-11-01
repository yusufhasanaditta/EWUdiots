/* Announcements (#/club/feed), from the "Club Announcement Showcase" board: title + New Announcement, search with a
   filter button, kind chips (All · General · Events · Recruitments · Achievements · Alerts) and image cards.
   Scope (filter sheet): everyone's public posts, clubs I follow or belong to, or only my clubs.
   Alerts = pinned posts; General = news, announcements, project updates and galleries. */
import { createPosts } from "./posts.js";

const CHIPS = [["all", "All"], ["general", "General"], ["event", "Events"], ["recruitment", "Recruitments"], ["achievement", "Achievements"], ["alert", "Alerts"]];
const GENERAL = ["news", "announcement", "project", "gallery"];

/** @param {Record<string, any>} pages @param {any} kit */
export function register(pages, kit) {
  const { ui, icon, esc, api, store } = kit;
  const posts = createPosts(kit);
  let chip = "all", scope = "all", only = "", q = "", limit = 12;

  const match = (p) => (chip === "all" ? true : chip === "alert" ? p.pinned : chip === "general" ? GENERAL.includes(p.kind) : p.kind === chip)
    && (!q || `${p.title} ${p.body} ${p.clubs?.name || ""} ${p.clubs?.short_name || ""}`.toLowerCase().includes(q));

  pages["club/feed"] = () => {
    if (!api) return kit.gate("club announcements");
    const mine = kit.myClubs(), follows = kit.me() ? store.use("me:follows", api.follows).value || [] : [];
    const myIds = mine.map((m) => m.club_id), forIds = [...new Set([...myIds, ...follows])];
    const ids = only ? [only] : scope === "mine" ? myIds : scope === "following" ? forIds : null;
    const fe = store.use(`feed:${scope}:${only}:${ids ? ids.join(",") : "all"}`, () => api.feed({ clubIds: ids, limit: 80 }), { ttl: 45e3 });
    const writer = mine.filter((m) => kit.can(m.club_id, "posts.write"));
    const filtered = scope !== "all" || only;
    return `<header class="an-head"><div class="min0"><h1>Announcements</h1><p>Stay updated with the latest news, events, and updates from all clubs.</p></div>
        ${writer.length ? `<button class="btn primary" id="an-new">${icon("plus", "sm")} New Announcement</button>` : ""}</header>
      <div class="an-search"><label class="rs-search grow">${icon("search", "sm")}<input class="input" id="an-q" type="search" value="${esc(q)}" placeholder="Search announcements, clubs or keywords…" aria-label="Search announcements"></label>
        <button class="an-filter ${filtered ? "on" : ""}" id="an-filter" aria-label="Filter">${icon("filter")}</button></div>
      <nav class="an-chips" role="tablist">${CHIPS.map(([v, l]) => `<button role="tab" data-chip="${v}" aria-selected="${chip === v}">${l}</button>`).join("")}</nav>
      ${scope === "mine" && !myIds.length ? `<div class="card soft row nowrap mt-s"><span class="itile purple">${icon("community")}</span><div class="grow"><b>You're not in a club yet</b><p class="small muted">Join a club to see its member posts here.</p></div><a class="btn sm" href="#/club/explore">Explore</a></div>` : ""}
      <div id="an-list">${ui.view(fe, (rows) => list(rows), { n: 4, h: 130 })}</div>
      <p class="xs mt" style="text-align:center">Clubs run their own pages. Unofficial · not affiliated with EWU.</p>`;
  };

  function list(rows) {
    const shown = rows.filter(match);
    if (!shown.length) return ui.emptyBox("megaphone", rows.length ? "Nothing matches" : "No announcements yet", rows.length ? "Try another filter or search." : "When clubs post news, events and recruitment, you'll see them here.", rows.length ? "" : `<a class="btn primary" href="#/club/explore">${icon("search")} Explore clubs</a>`);
    return `<div class="an-list">${shown.slice(0, limit).map((p) => posts.row(p)).join("")}</div>${shown.length > limit ? `<button class="btn outline block mt" id="an-moreb">Show more (${shown.length - limit})</button>` : ""}`;
  }

  pages["club/feed"].mount = (el) => {
    const t = kit.param("tab");
    if (t && CHIPS.some(([v]) => v === t) && t !== chip) { chip = t; kit.ctx.rerender(); return; }
    if (t === "announcement" && chip !== "general") { chip = "general"; kit.ctx.rerender(); return; }
    // Typing and chips filter the rows already loaded, without a refetch.
    const mine = kit.myClubs(), follows = kit.me() ? store.peek("me:follows") || [] : [];
    const myIds = mine.map((m) => m.club_id), forIds = [...new Set([...myIds, ...follows])];
    const ids = only ? [only] : scope === "mine" ? myIds : scope === "following" ? forIds : null;
    const rows = store.peek(`feed:${scope}:${only}:${ids ? ids.join(",") : "all"}`);
    const redraw = () => { const box = kit.$("#an-list", el); if (box && rows) { box.innerHTML = list(rows); posts.bindRows(box); more(); } };
    const more = () => kit.$("#an-moreb", el)?.addEventListener("click", () => { limit += 12; redraw(); });
    more();
    kit.$("#an-q", el)?.addEventListener("input", (e) => { q = e.target.value.trim().toLowerCase(); redraw(); });
    kit.$$("[data-chip]", el).forEach((b) => b.addEventListener("click", () => {
      chip = b.dataset.chip; limit = 12; kit.$$("[data-chip]", el).forEach((x) => x.setAttribute("aria-selected", String(x === b))); redraw();
    }));
    kit.$("#an-filter", el)?.addEventListener("click", () => filterSheet());
    kit.$("#an-new", el)?.addEventListener("click", () => {
      const w = kit.myClubs().filter((m) => kit.can(m.club_id, "posts.write"));
      if (w.length === 1) { location.hash = `#/club/manage?c=${w[0].club_id}&tab=posts&new=1`; return; }
      ui.sheet("Post for which club?", `<div class="cl-list">${w.map((m) => `<a class="cl-li" href="#/club/manage?c=${m.club_id}&tab=posts&new=1">${ui.logo(m, "sm")}<span class="body"><b>${esc(m.name)}</b></span>${icon("chevR", "sm")}</a>`).join("")}</div>`, (m) => kit.$$("a", m).forEach((a) => a.addEventListener("click", () => kit.ctx.closeModal())));
    });
    posts.bindRows(el); kit.bindRetry(el);
  };

  function filterSheet() {
    const mine = kit.myClubs(), all = store.peek("clubs:all") || [];
    const opts = [["", "All clubs"], ...(mine.length ? mine.map((m) => [m.club_id, m.short_name || m.name]) : []), ...all.filter((c) => !mine.some((m) => m.club_id === c.id)).map((c) => [c.id, c.short_name || c.name])];
    ui.sheet("Filter announcements", `<form id="an-ff" class="stack">
      <fieldset class="an-scope"><legend class="small"><b>Show posts from</b></legend>${[["all", "Everyone"], ["following", "Clubs I follow"], ["mine", "My clubs"]].map(([v, l]) => `<label><input type="radio" name="scope" value="${v}" ${scope === v ? "checked" : ""} ${v !== "all" && !kit.me() ? "disabled" : ""}><span>${l}</span></label>`).join("")}</fieldset>
      ${ui.field("Club", ui.select("club", opts, only))}
      <div class="row nowrap" style="gap:8px"><button type="button" class="btn neutral grow" id="an-reset">Reset</button><button class="btn primary grow">Apply</button></div></form>`, (m) => {
      kit.$("#an-ff", m).addEventListener("submit", (e) => { e.preventDefault(); scope = e.target.scope.value; only = e.target.club.value; kit.ctx.closeModal(); kit.ctx.rerender(); });
      kit.$("#an-reset", m).addEventListener("click", () => { scope = "all"; only = ""; kit.ctx.closeModal(); kit.ctx.rerender(); });
    });
    if (!all.length) store.use("clubs:all", api.listClubs, { ttl: 5 * 60e3 });
  }

  pages["club/post"] = posts.page;
}
