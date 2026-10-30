/* Privacy & data control (#/club/privacy), from the "Privacy and Data Control" and "Account Settings" boards.
   Per club: who sees my profile (public on the club page / members / private), whether I'm in the member directory,
   whether executives see my email; download everything clubs hold about me (public.export_my_club_data). Account,
   password and deletion live in the main app's Account page, so they aren't duplicated here. */

/** @param {Record<string, any>} pages @param {any} kit */
export function register(pages, kit) {
  const { ui, icon, esc, api, store } = kit;
  const VIS = [["public", "Public"], ["members", "Club Members"], ["private", "Private"]];

  pages["club/privacy"] = () => {
    const g = kit.gate("privacy settings"); if (g) return g;
    const mine = kit.myClubs();
    return `${kit.back("#/club/me", "Me")}${ui.ph("Privacy & Data Control", "Manage your privacy, visibility, and data preferences")}
      <section class="cl-banner" style="min-height:0;grid-template-columns:auto 1fr;align-items:center;gap:14px"><span class="itile" style="background:rgba(255,255,255,.18);color:#fff;width:56px;height:56px">${icon("shield")}</span><div><h2 style="font-size:20px">Your Privacy Matters</h2><p style="opacity:.9">Control what others can see, how your data is used, and keep your account safe.</p></div></section>
      ${ui.sec("Club Privacy Settings")}<p class="xs" style="margin-top:-6px">Who can see your club profile (photo, bio, skills, links) in each club.</p>
      ${mine.length ? `<div class="cl-list">${mine.map((m) => { const d = store.use(`club:member:${m.club_id}:${kit.me().id}`, () => api.memberDetail(m.club_id, kit.me().id), { ttl: 60e3 }).value;
        return `<div class="cl-setrow">${ui.logo(m, "sm")}<span class="body"><b>${esc(m.name)}</b><span>${esc(m.title || m.role_name)}</span></span>
          ${d ? `<select class="select" data-vis="${m.club_id}" aria-label="Visibility in ${esc(m.name)}">${VIS.map(([v, l]) => `<option value="${v}" ${d.visibility === v ? "selected" : ""}>${l}</option>`).join("")}</select>` : ui.skeleton(1, 36)}</div>
          ${d ? `<div class="cl-setrow" style="padding-left:58px">${ui.toggle(`dir-${m.club_id}`, d.in_directory !== false, "Show in member directory", "Other members can find you")}</div><div class="cl-setrow" style="padding-left:58px">${ui.toggle(`em-${m.club_id}`, !!d.show_email, "Show email to executives", "Only the club's executive committee")}</div>` : ""}`; }).join("")}</div>`
        : `<p class="small muted">You're not in a club yet.</p>`}
      ${ui.sec("Your Data, Your Control")}<div class="cl-list">
        <button class="cl-setrow" id="pv-dl" style="all:unset;box-sizing:border-box;display:flex;gap:12px;align-items:center;padding:14px;width:100%;cursor:pointer;border-bottom:1px solid var(--border)"><span class="itile purple">${icon("download")}</span><span class="body"><b>Download Your Data</b><span>Club memberships, posts, comments, your messages, registrations, tasks and more (JSON).</span></span>${icon("chevR")}</button>
        <a class="cl-setrow" href="#/account"><span class="itile blue">${icon("lock")}</span><span class="body"><b>Account & Security</b><span>Password, linked email, sign out — in your EWUdiots account.</span></span>${icon("chevR")}</a>
        <a class="cl-setrow" href="/privacy.html" target="_blank" rel="noopener"><span class="itile green">${icon("shield")}</span><span class="body"><b>Data Retention & Usage</b><span>How EWUdiots stores and uses your data.</span></span>${icon("external")}</a>
        <a class="cl-setrow" href="#/account" style="color:var(--error)"><span class="itile red">${icon("trash")}</span><span class="body"><b style="color:var(--error)">Request Account Deletion</b><span>Permanently delete your account and all associated data.</span></span>${icon("chevR")}</a></div>
      <p class="xs mt">Leaving a club removes you from its member list; your past messages stay so conversations make sense. Elections never record what you voted for.</p>`;
  };
  pages["club/privacy"].mount = (el) => {
    kit.bindRetry(el);
    const save = async (c, patch) => { try { await api.updateMyProfile(c, patch); store.invalidate(`club:member:${c}`, `club:members:${c}`); kit.toast("Saved", "success"); } catch (e) { kit.toast(e.message, "error"); } };
    kit.$$("[data-vis]", el).forEach((s) => s.addEventListener("change", () => save(s.dataset.vis, { visibility: s.value })));
    kit.$$('input[type="checkbox"][name^="dir-"]', el).forEach((c) => c.addEventListener("change", () => save(c.name.slice(4), { in_directory: c.checked })));
    kit.$$('input[type="checkbox"][name^="em-"]', el).forEach((c) => c.addEventListener("change", () => save(c.name.slice(3), { show_email: c.checked })));
    kit.$("#pv-dl", el)?.addEventListener("click", async () => { try { ui.download(`ewudiots-club-data-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(await api.exportMyData(), null, 2), "application/json"); } catch (e) { kit.toast(e.message, "error"); } });
  };
}
