/* Club events (#/club/events), from the "Events Dashboard" board ("Events & Operations"): numbers, status tabs,
   search, and event cards with the cover, date, status, venue, time and seats. Everyone sees public events of every
   club (members-only ones of their own clubs); Completed lists the past events of the clubs you're in or follow.
   Club events also appear in the campus Events page. */
import { priceLabel } from "../tickets.js";

/** @param {Record<string, any>} pages @param {any} kit */
export function register(pages, kit) {
  const { ui, icon, esc, api, store } = kit;
  let tab = "all", scope = "all", q = "";

  const stateOf = (e, now = Date.now()) => (new Date(e.starts_at) > now ? "upcoming" : new Date(e.ends_at || new Date(e.starts_at).getTime() + 3 * 36e5) > now ? "ongoing" : "completed");
  const STATE = { upcoming: ["Upcoming", "purple"], ongoing: ["Ongoing", "green"], completed: ["Completed", "gray"] };

  pages["club/events"] = () => {
    const managers = kit.clubsWith("events.manage");
    const head = ui.ph("Events & Operations", "Plan, organize and join club events all in one place.", managers.length ? `<a class="btn primary" href="#/club/manage?c=${managers[0].club_id}&tab=events&new=1">${icon("plus")} Create Event</a>` : "");
    if (!api) return head + kit.gate("club events");
    const ee = store.use("club:upcoming", api.upcomingClubEvents, { ttl: 60e3 });
    const mine = new Set(kit.myClubs().map((m) => m.club_id));
    const follows = new Set(kit.me() ? store.use("me:follows", api.follows).value || [] : []);
    const ids = [...new Set([...mine, ...follows])];
    const pe = tab === "completed" || tab === "all" ? store.use(`club:past:${ids.join(",")}`, () => api.pastClubEvents(ids), { ttl: 5 * 60e3 }) : { value: [] };
    const tk = kit.me() ? store.use("club:mytickets", api.myTickets, { ttl: 60e3 }).value || [] : [];
    return `${head}${ui.view(ee, (up) => {
      const now = Date.now(), all = [...up, ...(pe.value || []).filter((e) => !up.some((u) => u.id === e.id))];
      const inScope = all.filter((e) => scope === "all" || mine.has(e.club_id) || follows.has(e.club_id));
      const words = q.toLowerCase().split(/\s+/).filter(Boolean);
      const list = inScope.filter((e) => (tab === "all" || stateOf(e, now) === tab) && (!words.length || words.every((w) => `${e.title} ${e.venue} ${e.clubs?.name} ${ui.dateLong(e.starts_at)}`.toLowerCase().includes(w))))
        .sort((a, b) => (stateOf(a, now) === "completed") - (stateOf(b, now) === "completed") || (stateOf(a, now) === "completed" ? new Date(b.starts_at) - new Date(a.starts_at) : new Date(a.starts_at) - new Date(b.starts_at)));
      const n = (s) => inScope.filter((e) => stateOf(e, now) === s).length;
      return `<div class="cl-stats">${ui.stat("calendar", "purple", inScope.length, "Total Events")}${ui.stat("checkc", "green", n("upcoming"), "Upcoming")}${ui.stat("ticket", "blue", tk.filter((t) => t.status !== "cancelled").length, "My Tickets", { href: "#/club/tickets" })}${ui.stat("bars", "amber", n("ongoing"), "Ongoing")}</div>
        <nav class="cl-seg">${[["all", "All Events"], ["upcoming", "Upcoming"], ["ongoing", "Ongoing"], ["completed", "Completed"]].map(([v, l]) => `<button data-et="${v}" aria-pressed="${tab === v}">${l}</button>`).join("")}</nav>
        <div class="row nowrap" style="gap:8px"><div class="searchbar cl-search grow">${icon("search")}<input class="input" id="ev-q" type="search" placeholder="Search events by title, date or keyword…" value="${esc(q)}" autocomplete="off"></div>
          ${kit.me() ? `<label class="cl-pick">${ui.select("scope", [["all", "All clubs"], ["mine", "My clubs"]], scope, 'id="ev-scope" aria-label="Which clubs"')}</label>` : ""}</div>
        <div class="stack mt-s">${list.map((e) => card(e, stateOf(e, now))).join("") || ui.emptyBox("calendar", "No events here", scope === "mine" ? "Follow more clubs to see their events here." : "When clubs announce events, they show up here.")}</div>`;
    }, { n: 4, h: 120 })}`;
  };
  const card = (e, st) => {
    const tiers = e.ticketing?.enabled ? e.ticketing.tiers || [] : [], cheapest = tiers.length ? Math.min(...tiers.map((x) => Number(x.price) || 0)) : null;
    return `<a class="cl-ccard cl-evcard" href="#/club/event?id=${e.id}"><span class="art">${ui.art(e.image, e.title)}${ui.dchip(e.starts_at)}</span>
      <span class="min0"><span class="row nowrap" style="gap:6px">${ui.st(STATE[st])}${e.visibility === "members" ? ui.st(["Members", "blue"], "lock") : ""}</span><b class="clamp2">${esc(e.title)}</b>
        <span class="meta">${e.venue ? `<span>${icon("pin")} ${esc(e.venue)}</span>` : ""}<span>${icon("clock")} ${e.all_day ? "All day" : `${ui.time(e.starts_at)}${e.ends_at ? ` - ${ui.time(e.ends_at)}` : ""}`}</span>
          <span>${icon("users")} ${esc(e.clubs?.short_name || e.clubs?.name || "")}${e.capacity ? ` · ${e.capacity} seats` : ""}${cheapest != null ? ` · ${cheapest > 0 ? `from ${priceLabel(cheapest)}` : "Free tickets"}` : e.form_id ? " · Registration open" : ""}</span></span></span>
      ${st === "completed" ? `<span class="btn sm outline cl-evcta">View</span>` : ""}</a>`;
  };
  pages["club/events"].mount = (el) => {
    kit.$$("[data-et]", el).forEach((b) => b.addEventListener("click", () => { tab = b.dataset.et; kit.ctx.rerender(); }));
    kit.$("#ev-scope", el)?.addEventListener("change", (e) => { scope = e.target.value; kit.ctx.rerender(); });
    const input = kit.$("#ev-q", el);
    input?.addEventListener("input", () => { q = input.value; const pos = input.selectionStart; kit.ctx.rerender(); const i = kit.$("#ev-q"); if (i) { i.focus(); i.setSelectionRange(pos, pos); } });
    kit.bindRetry(el);
  };
}
