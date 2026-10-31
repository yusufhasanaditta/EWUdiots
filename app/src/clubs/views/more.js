/* Club "More" (#/club/more): every place in EWUdiots Club, grouped. Organiser tools appear only for the positions
   that grant them (perms.js), and App Admin only for the EWUdiots team. */

/** @param {Record<string, any>} pages @param {any} kit */
export function register(pages, kit) {
  const { ui, icon, esc } = kit;

  pages["club/more"] = () => {
    const mine = kit.myClubs(), first = (perm) => kit.clubsWith(perm)[0]?.club_id;
    const group = (title, items) => { const list = items.filter(Boolean); return list.length ? `${ui.sec(title)}<div class="cl-tiles">${list.map((t) => ui.tile(...t)).join("")}</div>` : ""; };
    return `${ui.ph("More", "Everything in the Club Town Hall", `<a class="btn outline" href="#/home">${icon("chevL")} Back to EWUdiots</a>`)}
      ${group("Discover", [["community", "purple", "All Clubs", "#/club/explore"], ["megaphone", "pink", "Club Feed", "#/club/feed"], ["calendar", "blue", "Events", "#/club/events"], ["handshake", "green", "Collaborate", "#/club/collab"],
        ["briefcase", "amber", "Sponsors", "#/club/sponsors"], ["bag", "teal", "Merch Store", "#/club/store"]])}
      ${group("Me", [kit.me() && ["user", "purple", "My Profile", "#/club/me"], kit.me() && ["community", "blue", "My Clubs", "#/club/mine"], kit.me() && ["ticket", "green", "My Tickets", "#/club/tickets"], kit.me() && ["award", "amber", "Certificates", "#/club/me?tab=certs"],
        kit.me() && ["package", "orange", "My Orders", "#/club/orders"], kit.me() && ["bell", "pink", "Notifications", "#/club/notifications"], kit.me() && ["shield", "teal", "Privacy", "#/club/privacy"]])}
      ${mine.length ? group("Workspace", [["chat", "purple", "Messages", "#/club/messages"], ["qr", "teal", "Scan Tickets", "#/club/scan"], ["clipboard", "blue", "Meetings", "#/club/meetings"], ["kanban", "orange", "Projects", `#/club/projects?c=${mine[0].club_id}`],
        ["folder", "red", "Resources", `#/club/resources?c=${mine[0].club_id}`], ["bars", "green", "Polls", "#/club/polls"], ["ballot", "purple", "Elections", "#/club/elections"]]) : ""}
      ${group("Run your club", [first("settings.edit") && ["settings", "purple", "Club Console", `#/club/manage?c=${first("settings.edit")}`], first("members.promote") && ["userpen", "blue", "Positions & Roles", `#/club/manage?c=${first("members.promote")}&tab=roles`],
        first("forms.view_responses") && ["users", "green", "Recruitment", "#/club/recruit"], first("analytics.view") && ["chart", "teal", "Analytics", `#/club/analytics?c=${first("analytics.view")}`],
        first("finance.view") && ["wallet", "amber", "Finance", `#/club/finance?c=${first("finance.view")}`], (first("store.manage") || first("orders.manage")) && ["bag", "orange", "Merch & Orders", `#/club/merch?c=${first("store.manage") || first("orders.manage")}`]])}
      ${group("Help", [["help", "blue", "Help Center", "#/club/help"], kit.isPlatform() && ["shield", "red", "App Admin", "#/club/admin"]])}
      ${mine.length > 1 ? `${ui.sec("Your clubs")}<div class="cl-list">${mine.map((m) => `<a class="cl-li" href="#/club/space?c=${m.club_id}">${ui.logo(m, "sm")}<span class="body"><b>${esc(m.name)}</b><span>${esc(m.title || m.role_name)}</span></span>${icon("chevR", "sm")}</a>`).join("")}</div>` : ""}
      <p class="xs mt" style="text-align:center">Club Town Hall · Unofficial · not affiliated with EWU</p>`;
  };
  pages["club/more"].mount = (el) => kit.bindRetry(el);
}
