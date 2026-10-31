/* Club notification centre (#/club/notifications), from the "Notification Centre" board. Filters by kind, grouped
   Today / Yesterday / This week / Earlier, mark all as read, and a detail sheet with related items. Rows come from
   public.club_notifications (written by triggers: posts, tasks, mentions, meetings, orders, applications…). */

const KINDS = { event: ["Events", "calendar", "purple"], recruitment: ["Recruitment", "users", "green"], task: ["Tasks", "clipboard", "orange"], mention: ["Mentions", "chat", "purple"],
  announcement: ["Announcements", "megaphone", "pink"], message: ["Messages", "chat", "blue"], poll: ["Polls", "bars", "purple"], order: ["Orders", "bag", "teal"], meeting: ["Meetings", "clipboard", "blue"], other: ["Others", "bell", "gray"] };
const TABS = [["all", "All"], ["unread", "Unread"], ["event", "Events"], ["recruitment", "Recruitment"], ["task", "Tasks"], ["mention", "Mentions"], ["announcement", "Announcements"], ["other", "Others"]];

/** @param {Record<string, any>} pages @param {any} kit */
export function register(pages, kit) {
  const { ui, icon, esc, api, store, ctx } = kit;
  let tab = "all";

  pages["club/notifications"] = () => {
    const g = kit.gate("your notifications"); if (g) return g;
    const ne = store.use("me:notes", api.notifications, { ttl: 30e3 });
    const rows = ne.value || [], unread = rows.filter((n) => !n.read_at).length;
    const list = rows.filter((n) => tab === "all" || (tab === "unread" ? !n.read_at : tab === "other" ? !["event", "recruitment", "task", "mention", "announcement"].includes(n.kind) : n.kind === tab));
    const day = (d) => { const a = new Date(d), now = new Date(), diff = Math.floor((new Date(now.toDateString()) - new Date(a.toDateString())) / 864e5); return diff <= 0 ? "Today" : diff === 1 ? "Yesterday" : diff < 7 ? "This Week" : "Earlier"; };
    const groups = list.reduce((m, n) => { (m[day(n.created_at)] ||= []).push(n); return m; }, {});
    return `${ui.ph("Notifications", "Stay updated with everything happening in your clubs", unread ? `<button class="btn ghost" id="nt-all">${icon("check")} Mark all as read</button>` : "")}
      <nav class="cl-seg grid4">${TABS.map(([v, l]) => `<button data-t="${v}" aria-pressed="${tab === v}">${l}${v === "unread" && unread ? ` <span class="n">${unread}</span>` : ""}</button>`).join("")}</nav>
      ${ne.loading && !ne.value ? ui.skeleton(5, 70) : !list.length ? ui.emptyBox("bell", tab === "unread" ? "You're all caught up" : "No notifications yet", "News from your clubs, tasks and orders appear here.")
        : ["Today", "Yesterday", "This Week", "Earlier"].filter((k) => groups[k]).map((k) => `<h2 class="cl-sec" style="margin-top:14px"><span style="font-size:17px">${k}</span></h2><div class="cl-list">${groups[k].map(row).join("")}</div>`).join("")}`;
  };
  const row = (n) => {
    const [, ic, tone] = KINDS[n.kind] || KINDS.other;
    return `<button class="cl-li cl-note" data-n="${n.id}"><span class="itile ${tone}">${icon(ic)}</span><span class="body"><b>${esc(n.title)}</b><span>${esc(n.body)}</span></span>
      <span class="end">${ui.ago(n.created_at).replace(" ago", "")}${!n.read_at ? `<span class="dot-unread" aria-label="Unread"></span>` : ""}</span></button>`;
  };
  pages["club/notifications"].mount = (el) => {
    kit.bindRetry(el);
    kit.$$("[data-t]", el).forEach((b) => b.addEventListener("click", () => { tab = b.dataset.t; ctx.rerender(); }));
    kit.$("#nt-all", el)?.addEventListener("click", async () => { try { await api.markNotificationsRead(null); store.invalidate("me:notes", "me:unread"); } catch (e) { kit.toast(e.message, "error"); } });
    const rows = store.peek("me:notes") || [];
    kit.$$("[data-n]", el).forEach((b) => b.addEventListener("click", () => open(rows.find((n) => String(n.id) === b.dataset.n))));
  };

  /** Detail sheet: the full text, a button to what it's about, and other unread items from the same club. */
  function open(n) {
    if (!n) return;
    if (!n.read_at) api.markNotificationsRead([n.id]).then(() => store.invalidate("me:notes", "me:unread")).catch(() => {});
    const [label, ic, tone] = KINDS[n.kind] || KINDS.other;
    const related = (store.peek("me:notes") || []).filter((x) => x.id !== n.id && x.club_id && x.club_id === n.club_id && !x.read_at).slice(0, 3);
    ui.sheet(label, `<div class="row nowrap" style="gap:12px;align-items:flex-start"><span class="itile ${tone}">${icon(ic)}</span><div class="min0"><b style="font-size:17px;display:block">${esc(n.title)}</b>
        <span class="xs">${n.clubs?.name ? `${esc(n.clubs.name)} · ` : ""}${ui.dateTime(n.created_at)}</span></div></div>
      ${n.body ? `<p class="mt" style="color:var(--text-2);line-height:1.55">${ui.rich(n.body)}</p>` : ""}
      <div class="row mt" style="gap:8px">${n.link ? `<a class="btn primary" href="${esc(n.link)}" data-go>${icon("arrow", "sm")} Open</a>` : ""}<button class="btn" data-del>${icon("trash", "sm")} Delete</button></div>
      ${related.length ? `<h3 class="cl-sec" style="font-size:15px">Related</h3><div class="cl-list">${related.map((x) => `<a class="cl-li" href="${esc(x.link || "#/club/notifications")}" data-go><span class="itile sm ${(KINDS[x.kind] || KINDS.other)[2]}">${icon((KINDS[x.kind] || KINDS.other)[1])}</span><span class="body"><b>${esc(x.title)}</b><span>${esc(x.body)}</span></span>${icon("chevR", "sm")}</a>`).join("")}</div>` : ""}`, (m) => {
      kit.$$("[data-go]", m).forEach((a) => a.addEventListener("click", () => ctx.closeModal()));
      kit.$("[data-del]", m).addEventListener("click", async () => { try { await api.deleteNotification(n.id); ctx.closeModal(); store.invalidate("me:notes", "me:unread"); } catch (e) { kit.toast(e.message, "error"); } });
    });
  }
}
