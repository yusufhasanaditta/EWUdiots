// Popup: sign in with the EWU student email (6-digit code, Supabase Auth REST), then save captured portal pages
// to the account's private inbox (table portal_inbox, RLS: own rows only). The app imports and deletes them.
const PORTAL = "https://portal.ewubd.edu";
const CFG = self.EWUD_CONFIG || {};
const EWU_EMAIL = /^\d{4}-\d-\d{2}-\d{3}@std\.ewubd\.edu$/i;
// The pages the app understands, with how to reach each one on the portal.
const PAGES = [
  ["profile", "Profile", "/Home/Profile"],
  ["schedule", "Class Schedule", "", "Menu → My Class Schedule → Show Courses"],
  ["grades", "Grade Report", "/ReportForms/rptGradeSheetStudent.aspx"],
  ["degree", "Degree Review", "/Home/StudentDegreeReview"],
  ["slip", "Advising Slip", "", "My Class Schedule → Print Slip"],
  ["rules", "Advising Rules", "", "Menu → Advising Rules"],
  ["offered", "Offered Courses", "/Home/OfferedCoursesStudent", "Pick department + semester → Show Offered Courses"],
  ["preadvising", "Pre-Advising", "/Home/PreCourseRegistration"]
];
const $ = (s) => document.querySelector(s);
const status = (t, tone = "") => { const s = $("#status"); s.textContent = t; s.className = tone; };
const ago = (iso) => { const m = Math.round((Date.now() - new Date(iso)) / 60000); return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : new Date(iso).toLocaleDateString(); };
const validUrl = (u) => /^https:\/\/[^\s#]+$|^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/[^\s#]*$/.test(u);
// portal.js stores each page as "page:<kind>".
const getPages = async () => Object.fromEntries(Object.entries(await chrome.storage.local.get(null))
  .filter(([k]) => k.startsWith("page:")).map(([k, v]) => [k.slice(5), v]));

/* ── Supabase Auth + REST, no SDK ── */
async function backend() { const { backendOverride } = await chrome.storage.local.get("backendOverride"); const b = backendOverride || { url: CFG.supabaseUrl, key: CFG.supabaseKey }; return b.url && b.key ? b : null; }
async function api(path, { method = "POST", body, token, prefer } = {}) {
  const b = await backend(); if (!b) throw new Error("Accounts aren't connected in this build.");
  const r = await fetch(b.url.replace(/\/$/, "") + path, { method, headers: { apikey: b.key, "content-type": "application/json", authorization: `Bearer ${token || b.key}`, ...(prefer ? { prefer } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j = null; try { j = t ? JSON.parse(t) : null; } catch { /* not JSON */ }
  if (!r.ok) throw Object.assign(new Error((j && (j.msg || j.message || j.error_description || j.error)) || `Server error ${r.status}`), { status: r.status });
  return j;
}
const saveSession = (s) => chrome.storage.local.set({ session: { access_token: s.access_token, refresh_token: s.refresh_token, expires_at: Date.now() + (s.expires_in || 3600) * 1000, user: { id: s.user.id, email: s.user.email } } });
async function session() {
  const { session: s } = await chrome.storage.local.get("session");
  if (!s) return null;
  if (s.expires_at - Date.now() > 60e3) return s;
  try { await saveSession(await api("/auth/v1/token?grant_type=refresh_token", { body: { refresh_token: s.refresh_token } })); return (await chrome.storage.local.get("session")).session; }
  catch (e) { if (e.status === 400 || e.status === 401) await chrome.storage.local.remove("session"); return e.status ? null : s; } // offline: keep the session, retry later
}
// The popup closes whenever you switch tabs to read the code, so the pending email is kept for 15 minutes.
let pendingEmail = "";
const setPending = async (email) => { pendingEmail = email; if (email) await chrome.storage.local.set({ pendingEmail: { email, at: Date.now() } }); else await chrome.storage.local.remove("pendingEmail"); };

async function render() {
  const { auto = true, appUrl = CFG.appUrl, pendingEmail: pe } = await chrome.storage.local.get(["auto", "appUrl", "pendingEmail"]);
  pendingEmail = pe && Date.now() - pe.at < 15 * 60e3 ? pe.email : "";
  const [pages, b, s] = [await getPages(), await backend(), await session()];
  $("#auto").checked = auto; $("#app-url").value = appUrl || "";
  $("#auth-off").hidden = Boolean(b); $("#auth-out").hidden = !b || Boolean(s); $("#auth-in").hidden = !s;
  $("#mail-form").hidden = Boolean(pendingEmail); $("#code-form").hidden = !pendingEmail; $("#code-to").textContent = pendingEmail;
  if (s) { $("#me-mail").textContent = s.user.email; $("#me-av").textContent = s.user.email.slice(0, 2).toUpperCase(); showAccount(s); }
  const list = $("#pages"); list.innerHTML = "";
  const known = new Set(PAGES.map((p) => p[0]));
  const rows = PAGES.map(([kind, name, path, hint]) => ({ name, path, hint, saved: pages[kind] }))
    .concat(Object.entries(pages).filter(([k]) => !known.has(k)).map(([, p]) => ({ name: p.page, saved: p })));
  for (const r of rows) {
    const li = document.createElement("li"); if (r.saved) li.className = "done";
    const ic = document.createElement("span"); ic.className = "ic"; ic.textContent = r.saved ? "✓" : "○"; ic.setAttribute("aria-hidden", "true");
    const name = document.createElement("span"); name.className = "name";
    if (!r.saved && r.path) { const a = document.createElement("a"); a.href = PORTAL + r.path; a.textContent = r.name; a.addEventListener("click", (e) => { e.preventDefault(); chrome.tabs.create({ url: a.href }); }); name.appendChild(a); }
    else name.textContent = r.name;
    if (!r.saved && r.hint) { const h = document.createElement("small"); h.textContent = r.hint; name.appendChild(h); }
    const meta = document.createElement("span"); meta.className = "meta"; meta.textContent = r.saved ? ago(r.saved.at) : "not yet";
    li.append(ic, name, meta); list.appendChild(li);
  }
  const n = Object.keys(pages).length, label = `${n} page${n === 1 ? "" : "s"}`;
  // With accounts connected, sending needs a signed-in student; without them the old one-click hand-off stays.
  $("#send").hidden = !b; $("#send").disabled = !n || !s; $("#send").textContent = !s ? "Sign in to save pages" : n ? `Save ${label} to my account` : "Save to my account";
  $("#open").disabled = !n || (b && !s); $("#open").className = b ? "" : "primary"; $("#open").textContent = n ? `Open ${label} in EWUdiots now` : "Open in EWUdiots now";
}

/* The same account backup the app uses (table user_data, own row only), so the popup shows what every device sees. */
async function showAccount(s) {
  const box = $("#acct");
  try {
    const [row] = (await api(`/rest/v1/user_data?select=data,updated_at&user_id=eq.${encodeURIComponent(s.user.id)}`, { method: "GET", token: s.access_token })) || [];
    const d = row?.data; if (!d?.profile) { box.hidden = true; return; }
    const courses = new Set((d.routine || []).map((r) => r.code)).size, cgpa = Number(d.profile.cgpa);
    box.replaceChildren(...[[d.profile.name || "Student", d.profile.id || ""], [courses || "—", "courses"], [cgpa ? cgpa.toFixed(2) : "—", "CGPA"]].map(([v, l]) => {
      const c = document.createElement("div"), b = document.createElement("b"), m = document.createElement("small");
      b.textContent = v; m.textContent = l; c.append(b, m); return c;
    }), Object.assign(document.createElement("p"), { textContent: `Account backup updated ${ago(row.updated_at)}` }));
    box.hidden = false;
  } catch { box.hidden = true; }
}

$("#mail-form").addEventListener("submit", async (e) => {
  e.preventDefault(); const email = $("#email").value.trim().toLowerCase();
  if (!EWU_EMAIL.test(email)) return status("Use your EWU student email, e.g. 2024-1-60-123@std.ewubd.edu", "err");
  $("#mail-go").disabled = true; status("Sending code…");
  try { await api("/auth/v1/otp", { body: { email, create_user: true } }); await setPending(email); status("Check your EWU mail (and spam) for the 6-digit code.", "ok"); render(); setTimeout(() => $("#code").focus(), 50); }
  catch (err) { status(err.message, "err"); } finally { $("#mail-go").disabled = false; }
});
$("#code-form").addEventListener("submit", async (e) => {
  e.preventDefault(); const token = $("#code").value.trim();
  if (!/^\d{6}$/.test(token)) return status("Enter the 6-digit code.", "err");
  $("#code-go").disabled = true; status("Verifying…");
  try { await saveSession(await api("/auth/v1/verify", { body: { type: "email", email: pendingEmail, token } })); await setPending(""); status("Signed in.", "ok"); render(); }
  catch (err) { status(/expired|invalid/i.test(err.message) ? "That code is wrong or expired. Try again." : err.message, "err"); } finally { $("#code-go").disabled = false; }
});
$("#code-back").addEventListener("click", async () => { await setPending(""); status(""); render(); });
$("#sign-out").addEventListener("click", async () => {
  const s = await session();
  if (s) api("/auth/v1/logout", { token: s.access_token }).catch(() => {});
  await chrome.storage.local.remove("session"); status("Signed out."); render();
});

const pageList = async () => Object.values(await getPages()).map((p) => ({ page: p.page, kind: p.kind, text: p.text, at: p.at }));
$("#send").addEventListener("click", async () => {
  const s = await session(); if (!s) return status("Sign in first.", "err");
  const pages = await pageList(); if (!pages.length) return status("Nothing saved yet.");
  $("#send").disabled = true; status("Saving to your account…");
  try {
    await api("/rest/v1/portal_inbox", { token: s.access_token, prefer: "return=minimal", body: { user_id: s.user.id, pages } });
    status(`Saved ${pages.length} page${pages.length === 1 ? "" : "s"}. Open EWUdiots on any device to review and import.`, "ok");
  } catch (err) { status(err.message, "err"); }
  render();
});

// Direct hand-off to an open app in the URL fragment (#ext=…). Fragments never reach a web server.
function encode(obj) {
  const bytes = new TextEncoder().encode(JSON.stringify(obj));
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
$("#open").addEventListener("click", async () => {
  if ((await backend()) && !(await session())) return status("Sign in first.", "err");
  const { appUrl = CFG.appUrl } = await chrome.storage.local.get("appUrl");
  const list = (await pageList()).map(({ page, text }) => ({ page, text }));
  if (!list.length) return status("Nothing saved yet.");
  if (!validUrl(appUrl)) return status("Set a valid app address in Settings first.", "err");
  await chrome.tabs.create({ url: `${appUrl}#ext=${encode({ pages: list })}` });
});

$("#sync").addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !/^https:\/\/portal\.ewubd\.edu\//.test(tab.url || "")) return status("Open an EWU portal page first.");
  status("Reading page…");
  try { const r = await chrome.tabs.sendMessage(tab.id, { type: "EWUD_SCRAPE" }); status(r && r.ok ? `Saved "${r.page}"` : "No academic data on this page yet. If it has a Show button, press it first."); }
  catch { status("Reload the portal tab and try again."); }
  render();
});
$("#auto").addEventListener("change", (e) => chrome.storage.local.set({ auto: e.target.checked }));
$("#app-url").addEventListener("change", async (e) => {
  const u = e.target.value.trim();
  if (!validUrl(u)) return status("Use an https:// address (or http://localhost for testing).", "err");
  await chrome.storage.local.set({ appUrl: u }); status("App address saved.", "ok");
});
$("#clear").addEventListener("click", async () => {
  await chrome.storage.local.remove(Object.keys(await getPages()).map((k) => "page:" + k).concat("pages")); // "pages": v1.0 format
  status("Cleared."); render();
});
chrome.storage.onChanged.addListener((c) => { if (Object.keys(c).some((k) => k.startsWith("page:") || k === "backendOverride")) render(); });
render();
