/* Security & Account Management (#/security), from the "Club Account Settings" board: password, two-step
   verification with an authenticator app (Supabase MFA, TOTP), linked email, this device and signing out the others,
   account recovery, download your data and delete account. Two-step is enforced at sign-in by mfaGate() below. */
export function install(ctx) {
  const { pages, icon, esc, $, toast, openModal, closeModal, modalHead, confirmModal, busy } = ctx;
  const sb = () => ctx.cloud.sb;
  let factors = null; // verified TOTP factors, loaded on open

  const device = () => {
    const ua = navigator.userAgent;
    const name = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? `Android${(ua.match(/Android [\d.]+; ([^;)]+)/) || [])[1] ? ` (${ua.match(/Android [\d.]+; ([^;)]+)/)[1].trim()})` : ""}` : /Windows/.test(ua) ? "Windows PC" : /Mac/.test(ua) ? "Mac" : /Linux/.test(ua) ? "Linux PC" : "This device";
    return { name, phone: /iPhone|Android|iPad/.test(ua), app: ctx.native.isNative ? "EWUdiots app" : /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : /Firefox\//.test(ua) ? "Firefox" : "Browser" };
  };
  const ago = (t) => { if (!t) return ""; const m = Math.round((Date.now() - new Date(t)) / 6e4); return m < 2 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} hours ago` : `${Math.round(m / 1440)} days ago`; };
  const row = (ic, tone, title, sub, right = "", id = "", extra = "") => `<section class="sec-row${tone === "red" ? " danger" : ""}"${id ? ` id="${id}"` : ""}><span class="itile ${tone}">${icon(ic)}</span><div class="grow min0"><b>${title}</b><p>${sub}</p>${extra}</div>${right}</section>`;

  pages.security = () => {
    const u = ctx.C.user;
    if (!u) return `${ctx.subHead("Security & Account", "", "#/profile")}<div class="card">${ctx.empty("icon:shield", "Sign in to manage security", "Password, two-step verification and devices are for signed-in accounts.", `<a class="btn primary" href="#/login">Sign in</a>`)}</div>`;
    if (factors === null) loadFactors();
    const on = (factors || []).length > 0, d = device();
    return `${ctx.subHead("Security & Account", "", "#/profile")}
      <header class="sec-head"><h1>Security &amp; Account Management</h1><p>Keep your account safe and in your control</p></header>
      <div class="sec-list">
        ${row("lock", "purple", "Password", "Update your password regularly to keep your account secure.", `<button class="btn outline sm" id="sc-pw">Change Password</button>`)}
        ${row("shield", "green", "Two-Step Verification", "Add an extra layer of security to your account.", `<label class="switch" aria-label="Two-step verification"><input type="checkbox" id="sc-2fa" ${on ? "checked" : ""} ${factors === null ? "disabled" : ""}><span></span></label>`, "",
          on ? `<div class="sec-ok">${icon("checkc")}<div><b>Two-step verification is enabled</b><span>You'll be asked for a code from your authenticator app when you sign in.</span></div></div>` : "")}
        ${row("mail", "blue", "Linked Email", `<span class="sec-mail">${esc(u.email || "")}</span> ${u.email_confirmed_at ? `<span class="st green">Verified</span>` : `<span class="st amber">Not verified</span>`}<br>Used for sign-in, notifications and account recovery.`)}
        ${row("phone", "purple", "Active Sessions", "Devices where you're signed in.", "", "",
          `<div class="sec-devs"><div class="sec-dev">${icon(d.phone ? "phone" : "chrome")}<div class="grow min0"><b>${esc(d.name)}</b><span>${esc(d.app)} · signed in ${esc(ago(u.last_sign_in_at))}</span></div><span class="st green">Current</span></div>
            <div class="sec-dev">${icon("users")}<div class="grow min0"><b>Your other devices</b><span>Phones and computers you've signed in on before</span></div><button class="btn sm outline" id="sc-others">Log out</button></div></div>`)}
        ${row("reset", "orange", "Account Recovery", "Get a password reset link at your linked email if you lose access.", `<button class="btn sm ghost" id="sc-rec" aria-label="Send a recovery link">${icon("chevR")}</button>`)}
        ${row("download", "teal", "Download Your Data", "A copy of your data on this device (profile, routine, grades, notes, settings).", `<button class="btn sm ghost" id="sc-dl" aria-label="Download your data">${icon("chevR")}</button>`)}
        ${row("trash", "red", "Delete Account", "Permanently delete your account and all associated data.", `<button class="btn sm ghost" id="sc-del" aria-label="Delete account">${icon("chevR")}</button>`)}
      </div>`;
  };

  async function loadFactors() {
    try { const { data } = await sb().auth.mfa.listFactors(); factors = (data?.totp || []).filter((f) => f.status === "verified"); }
    catch { factors = []; }
    if (ctx.route() === "security") ctx.rerender();
  }

  pages.security.mount = (el) => {
    const on = (s, fn) => $(s, el)?.addEventListener("click", fn);
    on("#sc-pw", () => openModal(modalHead("Change password") + `<form id="scp" class="stack"><label class="field">New password<input class="input" name="p" type="password" minlength="8" required autocomplete="new-password"></label>
        <label class="field">Repeat it<input class="input" name="p2" type="password" minlength="8" required autocomplete="new-password"></label><p class="xs">At least 8 characters. Don't reuse your EWU portal password.</p><button class="btn primary block">Change Password</button></form>`, (m) =>
      $("#scp", m).addEventListener("submit", async (e) => {
        e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)), b = e.target.querySelector("button");
        if (f.p !== f.p2) return toast("The passwords don't match", "error");
        busy(b, true, "Saving…"); try { await ctx.cloud.changePassword(f.p); closeModal(); toast("Password changed", "success"); } catch (err) { busy(b, false); toast(err.message, "error"); }
      })));
    $("#sc-2fa", el)?.addEventListener("change", (e) => { const want = e.target.checked; e.target.checked = !want; (want ? enroll : disable)(); });
    on("#sc-others", () => confirmModal("Log out other devices?", "Every other phone and computer is signed out. This device stays signed in.", "Log out others", async () => {
      const { error } = await sb().auth.signOut({ scope: "others" }); if (error) throw error; toast("Other devices signed out", "success"); }));
    on("#sc-rec", async () => { try { const to = await ctx.cloud.forgotPassword(ctx.C.user.email); toast("Recovery link sent", "success", `Check ${to}.`); } catch (err) { toast(err.message, "error"); } });
    on("#sc-dl", () => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([JSON.stringify(ctx.S, null, 2)], { type: "application/json" })); a.download = `ewudiots-data-${new Date().toISOString().slice(0, 10)}.json`; a.click(); toast("Your data is downloading", "success"); });
    on("#sc-del", () => confirmModal("Delete Account?", "This permanently deletes your account and all your data. This can't be undone.", "Delete Account", async () => { await ctx.cloud.deleteAccount(ctx.C.user.id); ctx.resetState(); ctx.go("#/welcome"); toast("Your account was deleted", "info"); }, true));
  };

  /* Turn on: enroll a TOTP factor, show its QR code and secret, confirm with the first code. */
  async function enroll() {
    let f;
    try {
      // A half-finished setup from earlier blocks a new one; clear unverified factors first.
      const { data } = await sb().auth.mfa.listFactors();
      for (const x of (data?.all || []).filter((x) => x.status !== "verified")) await sb().auth.mfa.unenroll({ factorId: x.id });
      const r = await sb().auth.mfa.enroll({ factorType: "totp", friendlyName: `EWUdiots ${Date.now().toString(36)}` }); if (r.error) throw r.error; f = r.data;
    } catch (err) { return toast("Couldn't start two-step setup", "error", err.message); }
    openModal(modalHead("Turn on two-step verification") + `<form id="tf" class="stack"><p class="small">1. Open an authenticator app (Google Authenticator, Microsoft Authenticator, Authy or your phone's password manager) and scan this code.</p>
      <div class="sec-qr"><img src="${esc(f.totp.qr_code)}" alt="QR code for your authenticator app" width="180" height="180"></div>
      <p class="xs">Can't scan? Enter this key: <code class="sec-key">${esc(f.totp.secret)}</code></p>
      <label class="field">2. Enter the 6-digit code it shows<input class="input" name="c" inputmode="numeric" autocomplete="one-time-code" pattern="\\d{6}" maxlength="6" required></label>
      <button class="btn primary block">${icon("shield", "sm")} Turn on</button></form>`, (m) => $("#tf", m).addEventListener("submit", async (e) => {
      e.preventDefault(); const code = String(new FormData(e.target).get("c")).trim(), b = e.target.querySelector("button");
      busy(b, true, "Checking…");
      const { error } = await sb().auth.mfa.challengeAndVerify({ factorId: f.id, code });
      if (error) { busy(b, false); return toast("That code didn't work", "error", "Check the time on your phone and try the newest code."); }
      closeModal(); factors = null; toast("Two-step verification is on", "success", "You'll need your authenticator app when you sign in."); ctx.rerender();
    }));
  }
  /* Turn off: needs a current code (an attacker with only your password can't switch it off). */
  function disable() {
    openModal(modalHead("Turn off two-step verification") + `<form id="td" class="stack"><p class="small">Enter a code from your authenticator app to confirm.</p>
      <label class="field">6-digit code<input class="input" name="c" inputmode="numeric" autocomplete="one-time-code" pattern="\\d{6}" maxlength="6" required></label><button class="btn danger block">Turn off</button></form>`, (m) => $("#td", m).addEventListener("submit", async (e) => {
      e.preventDefault(); const code = String(new FormData(e.target).get("c")).trim(), b = e.target.querySelector("button"), fid = factors?.[0]?.id; if (!fid) return;
      busy(b, true, "Checking…");
      try {
        const v = await sb().auth.mfa.challengeAndVerify({ factorId: fid, code }); if (v.error) throw v.error;
        for (const x of factors) { const r = await sb().auth.mfa.unenroll({ factorId: x.id }); if (r.error) throw r.error; }
        closeModal(); factors = null; toast("Two-step verification is off", "info"); ctx.rerender();
      } catch (err) { busy(b, false); toast("That code didn't work", "error", err.message); }
    }));
  }

  /* At sign-in: an account with two-step on stays at the lower assurance level until a code is entered. */
  let asking = false;
  async function mfaGate(user) {
    if (!user || asking || !sb()) return;
    const { data } = await sb().auth.mfa.getAuthenticatorAssuranceLevel();
    if (!data || data.currentLevel === "aal2" || data.nextLevel !== "aal2") return;
    const { data: fl } = await sb().auth.mfa.listFactors(); const fid = fl?.totp?.find((f) => f.status === "verified")?.id; if (!fid) return;
    asking = true;
    openModal(modalHead("Two-step verification") + `<form id="mg" class="stack" data-locked><p class="small">Enter the 6-digit code from your authenticator app to finish signing in.</p>
      <label class="field">Code<input class="input" name="c" inputmode="numeric" autocomplete="one-time-code" pattern="\\d{6}" maxlength="6" required autofocus></label>
      <button class="btn primary block">Verify</button><button type="button" class="btn ghost block" id="mg-out">Sign out instead</button></form>`, (m) => {
      $("#mg", m).addEventListener("submit", async (e) => {
        e.preventDefault(); const b = e.target.querySelector("button.primary"); busy(b, true, "Checking…");
        const { error } = await sb().auth.mfa.challengeAndVerify({ factorId: fid, code: String(new FormData(e.target).get("c")).trim() });
        if (error) { busy(b, false); return toast("That code didn't work", "error"); }
        asking = false; closeModal(true); toast("Signed in", "success");
      });
      $("#mg-out", m).addEventListener("click", async () => { asking = false; closeModal(true); await ctx.cloud.signOut(); ctx.go("#/login"); });
    });
  }
  if (ctx.cloud.enabled) ctx.cloud.onAuth((u) => { factors = null; if (u) setTimeout(() => mfaGate(u).catch(() => {}), 400); });
}
