/* Explore (#/club/explore): every EWU club, searchable, with category chips. Clubs that aren't run on EWUdiots yet
   are listed as "Not on EWUdiots yet" with a link to their official page and a way for the president to claim them. */
import { CATEGORIES } from "../perms.js";

/** @param {Record<string, any>} pages @param {any} kit */
export function register(pages, kit) {
  const { ui, icon, esc, api, store } = kit;
  let q = "", cat = "all", only = "", fromLink = "";

  pages["club/explore"] = () => {
    // A link like #/club/explore?cat=tech (from Home) picks the category once.
    const lc = kit.param("cat") || ""; if (lc && lc !== fromLink) { cat = CATEGORIES[lc] ? lc : "all"; fromLink = lc; }
    const head = kit.head("Explore clubs", "Every club at East West University. Follow the ones you like, or apply to join.",
      kit.me() ? `<button class="btn outline" id="ex-request">${icon("plus")} Your club isn't listed?</button>` : "");
    if (!api) return head + kit.gate("clubs");
    const ce = store.use("clubs:all", api.listClubs, { ttl: 5 * 60e3 }), counts = store.use("clubs:counts", api.counts, { ttl: 60e3 }).value || {};
    const mine = kit.memberships().value || [], follows = kit.me() ? store.use("me:follows", api.follows).value || [] : [];
    return `${head}
      <div class="searchbar cl-search">${icon("search")}<input class="input" id="ex-q" type="search" placeholder="Search clubs: robotics, debate, photography…" value="${esc(q)}" autocomplete="off"></div>
      <div class="chips mt-s">${[["all", "All"], ...Object.entries(CATEGORIES)].map(([v, l]) => `<button class="chip" data-cat="${v}" aria-pressed="${cat === v}">${esc(l)}</button>`).join("")}</div>
      <div class="chips mt-s">${[["recruiting", "Recruiting now"], ["mine", "My clubs"], ["following", "Following"]].map(([v, l]) => `<button class="chip" data-only="${v}" aria-pressed="${only === v}">${l}</button>`).join("")}</div>
      <div class="mt">${ui.view(ce, (rows) => {
        const words = q.toLowerCase().split(/\s+/).filter(Boolean);
        const list = rows.filter((c) => (cat === "all" || c.category === cat)
          && (!words.length || words.every((w) => `${c.name} ${c.short_name} ${c.tagline} ${CATEGORIES[c.category]}`.toLowerCase().includes(w)))
          && (only !== "recruiting" || c.recruiting) && (only !== "mine" || mine.some((m) => m.club_id === c.id && m.status === "active")) && (only !== "following" || follows.includes(c.id)))
          // Clubs that are active on EWUdiots first, then by name.
          .sort((a, b) => (a.status === "active" ? 0 : 1) - (b.status === "active" ? 0 : 1) || a.name.localeCompare(b.name));
        if (!list.length) return ui.emptyBox("search", "No clubs match", "Try another word or category.");
        return `<p class="xs" style="margin-bottom:10px">${ui.plural(list.length, "club")}</p><div class="cl-grid">${list.map((c) => ui.clubCard(c, { ...(counts[c.id] || {}), mine: mine.find((m) => m.club_id === c.id && m.status === "active"), following: follows.includes(c.id) })).join("")}</div>`;
      }, { n: 6, h: 120 })}</div>
      <p class="xs mt" style="text-align:center">Club list from ewubd.edu/clubs. Unofficial · not affiliated with EWU.</p>`;
  };
  pages["club/explore"].mount = (el) => {
    const input = kit.$("#ex-q", el);
    input?.addEventListener("input", () => { q = input.value; const pos = input.selectionStart; kit.ctx.rerender(); const i = kit.$("#ex-q"); if (i) { i.focus(); i.setSelectionRange(pos, pos); } });
    kit.$$("[data-cat]", el).forEach((b) => b.addEventListener("click", () => { cat = b.dataset.cat; kit.ctx.rerender(); }));
    kit.$$("[data-only]", el).forEach((b) => b.addEventListener("click", () => { only = only === b.dataset.only ? "" : b.dataset.only; kit.ctx.rerender(); }));
    kit.$("#ex-request", el)?.addEventListener("click", requestClub);
    kit.bindRetry(el);
  };

  /** A student asks for a club that isn't in the list; it waits for the EWUdiots team with their claim. */
  function requestClub() {
    ui.sheet("Add your club", `<form id="rq-form" class="stack" novalidate>
      <p class="small muted">For clubs recognised by EWU's Students' Welfare Department. The EWUdiots team checks every request before the club goes live, and you become its admin.</p>
      ${ui.field("Club name", ui.input("name", "", 'required maxlength="100" placeholder="EWU … Club"'))}
      ${ui.field("Category", ui.select("cat", CATEGORIES, "other"))}
      ${ui.field("Your position", ui.input("pos", "", 'required maxlength="60" placeholder="President, General Secretary…"'))}
      ${ui.field("How can we confirm it?", ui.area("proof", "", 'maxlength="1000" rows="3" placeholder="Your faculty advisor\'s name and email, the club\'s Facebook page, or anything that shows you run it."'))}
      <div id="cl-err"></div><button class="btn primary block">${icon("arrow")} Send for review</button></form>`, (m) => {
      kit.$("#rq-form", m).addEventListener("submit", async (e) => {
        e.preventDefault(); const f = ui.values(e.target), btn = e.target.querySelector("button.primary");
        if (String(f.name).trim().length < 3 || String(f.pos).trim().length < 2) return ui.fail(m, "Add the club's name and your position.");
        kit.ctx.busy(btn, true, "Sending…");
        try { await api.requestClub(f.name.trim(), f.cat, f.pos.trim(), String(f.proof || "").trim()); kit.ctx.closeModal(); store.invalidate("me:"); kit.toast("Request sent", "success", "We'll message you in the app when it's reviewed."); }
        catch (err) { kit.ctx.busy(btn, false); ui.fail(m, err.message); }
      });
    });
  }
}
