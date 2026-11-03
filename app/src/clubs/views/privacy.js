/* Privacy & data control (#/club/privacy, &tab=data), from the "Privacy and Data Control" board.
   Privacy: profile visibility, member directory, email and social links for every club at once, then per club.
   Your data: download everything clubs hold about you (public.export_my_club_data), last sign-in, connected accounts
   (GitHub / LinkedIn profile links kept on your EWUdiots profile and shown on club profiles when "Show Social Links"
   is on), data retention and account deletion (in the main app's Account page). */

const VIS = [["public", "Public", "eye", "green"], ["members", "Club Members", "users", "blue"], ["private", "Private", "lock", "red"]];
const LINKS = [["github", "GitHub", "https://github.com/"], ["linkedin", "LinkedIn", "https://www.linkedin.com/in/"]];

/** @param {Record<string, any>} pages @param {any} kit */
export function register(pages, kit) {
  const { ui, icon, esc, api, store, ctx } = kit;
  const links = () => ctx.S.profile?.links || {};
  const detail = (m) => store.use(`club:member:${m.club_id}:${kit.me().id}`, () => api.memberDetail(m.club_id, kit.me().id), { ttl: 60e3 }).value;
  const row = (ic, tone, title, sub, control) => `<div class="cl-set"><span class="itile ${tone}">${icon(ic)}</span><span class="body"><b>${title}</b><span class="xs">${sub}</span></span>${control}</div>`;
  const sw = (name, on, label) => `<span class="switch"><input type="checkbox" name="${name}" ${on ? "checked" : ""} aria-label="${label}"><span></span></span>`;

  pages["club/privacy"] = () => {
    const g = kit.gate("privacy settings"); if (g) return g;
    const tab = kit.param("tab") === "data" ? "data" : "privacy";
    return `${kit.back("#/club/me", "Me")}${ui.seg([["privacy", "Privacy"], ["data", "Your Data"]], tab, (v) => `#/club/privacy${v === "data" ? "?tab=data" : ""}`, "sm")}${tab === "data" ? dataPage() : privacyPage()}`;
  };

  function privacyPage() {
    const mine = kit.myClubs(), ds = mine.map(detail), ready = ds.every(Boolean) && mine.length;
    const all = (k, v) => ready && ds.every((d) => d[k] === v);
    const vis = ready ? (VIS.find(([v]) => all("visibility", v))?.[0] || "mixed") : "members";
    const hasLinks = LINKS.some(([k]) => links()[k]), shown = ready && hasLinks && ds.every((d) => LINKS.every(([k]) => !links()[k] || d.socials?.[k] === links()[k]));
    return `${ui.ph("Privacy &amp; Data Control", "Manage your privacy, visibility, and data preferences")}
      <section class="pv-hero"><span class="pv-shield">${icon("shield")}</span><div class="grow"><h2>Your Privacy Matters</h2><p>Control what others can see, how your data is used, and keep your account safe.</p></div><span class="pv-lock" aria-hidden="true">${icon("lock")}</span></section>
      ${ui.sec("Profile Visibility")}<p class="xs pv-sub">Who can see your profile and information · applies to all your clubs</p>
      ${!mine.length ? `<p class="small muted">Join a club to choose who sees your club profile.</p>` : !ready ? ui.skeleton(3, 52) : `<section class="card">
        ${row("user", "purple", "Profile Visibility", "Choose who can view your profile", `<select class="select" id="pv-all" aria-label="Profile visibility in all clubs">${vis === "mixed" ? `<option value="" selected>Different per club</option>` : ""}${VIS.map(([v, l]) => `<option value="${v}" ${vis === v ? "selected" : ""}>${l}</option>`).join("")}</select>`)}
        ${row("users", "green", "Show in Member Directory", "Allow other club members to find your profile", sw("all-dir", all("in_directory", true), "Show in member directory"))}
        ${row("mail", "orange", "Show Email Address", "Only visible to club executives (not public)", sw("all-em", all("show_email", true), "Show email address to executives"))}
        ${row("link", "purple", "Show Social Links", hasLinks ? "Display your LinkedIn and GitHub links" : `Connect GitHub or LinkedIn in <a href="#/club/privacy?tab=data">Your Data</a> first`, sw("all-soc", shown, "Show social links"))}</section>`}
      ${ui.sec("Club Privacy Settings")}<p class="xs pv-sub">Control your visibility for each club</p>
      ${mine.length ? `<section class="card">${mine.map((m, i) => { const d = ds[i];
        return `<div class="cl-set">${ui.logo(m, "sm")}<span class="body"><b>${esc(m.name)}</b><span class="xs">${esc(m.title || m.role_name)}</span></span>
          ${d ? `<label class="pv-vis t-${(VIS.find(([v]) => v === d.visibility) || VIS[1])[3]}">${icon((VIS.find(([v]) => v === d.visibility) || VIS[1])[2], "sm")}<select class="select" data-vis="${m.club_id}" aria-label="Visibility in ${esc(m.name)}">${VIS.map(([v, l]) => `<option value="${v}" ${d.visibility === v ? "selected" : ""}>${l}</option>`).join("")}</select></label>` : ui.skeleton(1, 36)}</div>`; }).join("")}
        <p class="xs" style="margin:8px 0 0">Manage which clubs show your profile, and to whom.</p></section>` : `<p class="small muted">You're not in a club yet.</p>`}
      <p class="xs mt">Leaving a club removes you from its member list; your past messages stay so conversations make sense. Elections never record what you voted for.</p>`;
  }

  function dataPage() {
    const u = kit.me(), google = u?.app_metadata?.provider === "google" || (u?.identities || []).some((x) => x.provider === "google");
    return `${ui.ph("Your Data &amp; Account Control", "Access, manage, and control your personal data")}
      <div class="cl-note"><span class="itile purple">${icon("database")}</span><div class="grow"><b>Your Data, Your Control</b><span class="xs">Download your data, review activity, manage connected accounts, or request account deletion at any time.</span></div></div>
      <section class="card"><button class="cl-set pv-btn" id="pv-dl"><span class="itile purple">${icon("download")}</span><span class="body"><b>Download Your Data</b><span class="xs">Get a copy of your personal data, including your profile, club memberships, activity history, and content (JSON).</span></span>${icon("chevR")}</button>
        <p class="xs" style="margin:6px 0">Data includes:</p><div class="cl-chips">${[["user", "Profile Information"], ["community", "Club Memberships"], ["chat", "Posts &amp; Comments"], ["send", "Messages (your own)"], ["calendar", "Event Registrations"], ["checksq", "Tasks &amp; Activity"]].map(([ic, l]) => `<span>${icon(ic, "sm")} ${l}</span>`).join("")}</div></section>
      <section class="card mt-s"><div class="cl-set" style="border:0"><span class="itile blue">${icon("clock")}</span><span class="body"><b>Account Activity</b><span class="xs">Your recent sign-in and account changes.</span></span></div>
        ${row("sync", "gray", "Last Sign-in", u?.last_sign_in_at ? `${ui.dateTime(u.last_sign_in_at)}` : "Not known", "")}
        <a class="cl-set" href="#/account" style="color:inherit;text-decoration:none"><span class="itile gray">${icon("edit")}</span><span class="body"><b>Recent Account Changes</b><span class="xs">Password, email and sign-out live in your EWUdiots account</span></span>${icon("chevR")}</a></section>
      <section class="card mt-s"><div class="cl-set" style="border:0"><span class="itile purple">${icon("link")}</span><span class="body"><b>Connected Accounts</b><span class="xs">Profile links shown on your club profiles when “Show Social Links” is on.</span></span></div>
        <div class="cl-set"><span class="pv-brand">G</span><span class="body"><b>Google</b><span class="xs">${google ? `Signed in as ${esc(u.email)}` : "Not connected"}</span></span>${google ? ui.st(["Connected", "green"]) : `<span class="xs muted">Use “Continue with Google” at sign-in</span>`}</div>
        ${LINKS.map(([k, l]) => `<div class="cl-set"><span class="pv-brand">${icon(k)}</span><span class="body"><b>${l}</b><span class="xs ellipsis">${links()[k] ? esc(links()[k].replace(/^https:\/\/(www\.)?/, "")) : "Not connected"}</span></span>
          ${links()[k] ? `<button class="btn sm soft red" data-unlink="${k}">Disconnect</button>` : `<button class="btn sm outline" data-link="${k}">Connect</button>`}</div>`).join("")}</section>
      <section class="card mt-s"><a class="cl-set" href="/privacy.html" target="_blank" rel="noopener" style="color:inherit;text-decoration:none;border:0"><span class="itile blue">${icon("shield")}</span><span class="body"><b>Data Retention &amp; Usage</b><span class="xs">Learn how your data is stored, used, and protected.</span></span>${icon("external")}</a></section>
      <a class="cl-set pv-danger mt-s" href="#/account"><span class="itile red">${icon("trash")}</span><span class="body"><b>Request Account Deletion</b><span class="xs">Permanently delete your account and all associated data.</span></span>${icon("chevR")}</a>`;
  }

  /** Put my GitHub / LinkedIn links on every club profile (or take them off); other links (website) stay. */
  async function pushLinks(show, only = null) {
    const l = links(), uid = kit.me().id;
    await Promise.all(kit.myClubs().map(async (m) => { const d = (await store.fetch(`club:member:${m.club_id}:${uid}`, () => api.memberDetail(m.club_id, uid))) || {}, s = { ...(d.socials || {}) };
      LINKS.forEach(([k]) => { if (only && k !== only) return; if (show && l[k]) s[k] = l[k]; else delete s[k]; });
      return api.updateMyProfile(m.club_id, { socials: s }); }));
    store.invalidate("club:member:", "club:members:");
  }

  pages["club/privacy"].mount = (el) => {
    kit.bindRetry(el);
    const mine = kit.myClubs();
    const save = async (clubs, patch, msg = "Saved") => { try { await Promise.all(clubs.map((c) => api.updateMyProfile(c, patch))); store.invalidate("club:member:", "club:members:"); kit.toast(msg, "success"); } catch (e) { kit.toast(e.message, "error"); } };
    kit.$$("[data-vis]", el).forEach((s) => s.addEventListener("change", () => save([s.dataset.vis], { visibility: s.value })));
    kit.$("#pv-all", el)?.addEventListener("change", (e) => e.target.value && save(mine.map((m) => m.club_id), { visibility: e.target.value }, "Saved for all your clubs"));
    kit.$('[name="all-dir"]', el)?.addEventListener("change", (e) => save(mine.map((m) => m.club_id), { in_directory: e.target.checked }));
    kit.$('[name="all-em"]', el)?.addEventListener("change", (e) => save(mine.map((m) => m.club_id), { show_email: e.target.checked }));
    kit.$('[name="all-soc"]', el)?.addEventListener("change", async (e) => {
      if (!LINKS.some(([k]) => links()[k])) { e.target.checked = false; return kit.go("#/club/privacy?tab=data"); }
      try { await pushLinks(e.target.checked); kit.toast(e.target.checked ? "Links shown on your club profiles" : "Links hidden from your club profiles", "success"); } catch (err) { kit.toast(err.message, "error"); }
    });
    kit.$("#pv-dl", el)?.addEventListener("click", async (e) => { const b = e.currentTarget; ctx.busy(b, true); try { ui.download(`ewudiots-club-data-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(await api.exportMyData(), null, 2), "application/json"); } catch (err) { kit.toast(err.message, "error"); } finally { ctx.busy(b, false); } });
    kit.$$("[data-link]", el).forEach((b) => b.addEventListener("click", () => { const [k, l, base] = LINKS.find(([x]) => x === b.dataset.link);
      ui.sheet(`Connect ${l}`, `<form class="stack" id="lk-f">${ui.field(`Your ${l} profile link`, ui.input("u", "", `type="url" required maxlength="200" placeholder="${base}your-name"`), "Shown on your club profiles when “Show Social Links” is on.")}<div id="cl-err"></div><button class="btn primary block">Connect ${l}</button></form>`, (m) =>
        kit.$("#lk-f", m).addEventListener("submit", async (ev) => { ev.preventDefault(); const u = String(ui.values(ev.target).u || "").trim();
          if (!new RegExp(`^https://(www\\.)?${k === "github" ? "github\\.com" : "linkedin\\.com"}/`, "i").test(u)) return ui.fail(m, `Paste a link that starts with ${base}`);
          ctx.S.profile = { ...(ctx.S.profile || {}), links: { ...links(), [k]: u } }; ctx.save(); ctx.closeModal();
          try { await pushLinks(true); } catch { /* the link is saved; club profiles update next time */ } kit.toast(`${l} connected`, "success"); ctx.rerender(); })); }));
    kit.$$("[data-unlink]", el).forEach((b) => b.addEventListener("click", async () => { const l = { ...links() }; delete l[b.dataset.unlink];
      ctx.S.profile = { ...(ctx.S.profile || {}), links: l }; ctx.save();
      try { await pushLinks(false, b.dataset.unlink); } catch (err) { kit.toast(err.message, "error"); }
      kit.toast("Disconnected", "success"); ctx.rerender(); }));
  };
}
