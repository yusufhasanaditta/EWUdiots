/* Club events (#/club/events): what every club has coming up (members-only events too, for your own clubs),
   with registration where the club opened a form. Club events also appear in the campus Events page. */
import { KINDS } from "../../events.js";

/** @param {Record<string, any>} pages @param {any} kit */
export function register(pages, kit) {
  const { ui, icon, esc, api, store } = kit;
  let scope = "all";

  pages["club/events"] = () => {
    const head = kit.head("Club events", "Workshops, competitions, meetups and recruitment from EWU's clubs.");
    if (!api) return head + kit.gate("club events");
    const ee = store.use("club:upcoming", api.upcomingClubEvents, { ttl: 60e3 });
    const mine = new Set((kit.memberships().value || []).filter((m) => m.status === "active").map((m) => m.club_id));
    const follows = new Set(kit.me() ? store.use("me:follows", api.follows).value || [] : []);
    return `${head}${kit.me() ? kit.ctx.seg([["all", "All clubs"], ["mine", "My clubs & following"]], scope, "data-es") : ""}
      <div class="mt">${ui.view(ee, (rows) => {
        const list = rows.filter((e) => scope === "all" || mine.has(e.club_id) || follows.has(e.club_id));
        if (!list.length) return ui.emptyBox("calendar", "No upcoming club events", scope === "mine" ? "Follow more clubs to see their events here." : "When clubs announce events, they show up here.");
        const groups = list.reduce((g, e) => { const k = ui.when(e.starts_at, { month: "long", year: "numeric" }); (g[k] = g[k] || []).push(e); return g; }, {});
        return Object.entries(groups).map(([month, l]) => `<h2 class="cl-h2">${esc(month)}</h2><div class="stack">${l.map(row).join("")}</div>`).join("");
      })}</div>`;
  };
  const row = (e) => `<article class="card cl-event"><div class="ev-date"><b>${ui.when(e.starts_at, { day: "numeric" })}</b><span>${ui.when(e.starts_at, { month: "short" })}</span></div>
      <div class="grow min0"><div class="row" style="gap:6px">${ui.pill(esc(KINDS[e.kind] || "Event"))}${e.visibility === "members" ? ui.pill(`${icon("lock", "sm")} Members only`, "purple") : ""}</div>
        <b class="cl-ev-title">${esc(e.title)}</b><p class="xs">${ui.dateTime(e.starts_at)}${e.venue ? ` · ${icon("pin", "sm")} ${esc(e.venue)}` : ""}</p>
        <a class="row nowrap xs mt-s" style="gap:6px" href="#/club/c?slug=${encodeURIComponent(e.clubs?.slug || "")}">${ui.logo(e.clubs, "xs")} ${esc(e.clubs?.name || e.organizer)}</a></div>
      <div class="cl-ev-cta">${e.form_id ? `<a class="btn sm primary" href="#/club/form?id=${e.form_id}">${icon("edit", "sm")} Register</a>` : ""}<a class="btn sm ghost" href="#/club/event?id=${e.id}">Details</a></div></article>`;
  pages["club/events"].mount = (el) => {
    kit.$$("[data-es]", el).forEach((b) => b.addEventListener("click", () => { scope = b.dataset.es; kit.ctx.rerender(); }));
    kit.bindRetry(el);
  };
}
