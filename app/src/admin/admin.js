/* EWUdiots admin panel: publish announcements and news, run the home banner and feature switches, review alumni
   profiles, manage faculty listings, campus rooms and reports, see who did what. Layout ideas from the Aven admin console:
   grouped sidebar with badges, overview KPIs, Ctrl+K jump, spring drawer on phones, an activity log. */
import "../styles.css";
import "../fx.css";
import "./admin.css";
import * as cloud from "../cloud.js";
import { icon } from "../icons.js";
import { FEATURES } from "../content.js";
import { BLOCKS, floorsOf, floorLabel, parseRoom } from "../campus-data.js";
import { supabaseBackend, demoBackend } from "./backend.js";

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const ago = (d) => { if (!d) return ""; const m = Math.round((Date.now() - new Date(d)) / 6e4); return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }); };
const root = $("#admin");

const SECTIONS = [
  ["overview", "Overview", "grid", "Workspace"],
  ["posts", "Posts & announcements", "megaphone", "Content"], ["banner", "Home banner", "bell", "Content"], ["features", "Features", "sliders", "Content"],
  ["alumni", "Alumni profiles", "community", "People"], ["faculty", "Faculty listings", "users", "People"],
  ["reports", "Reports", "flag", "Community"], ["rooms", "Campus rooms", "map", "Campus"],
  ["admins", "Admins", "shield", "System"], ["activity", "Activity log", "clock", "System"]
];

/* ── tiny UI kit (same look as the app) ── */
function toast(title, type = "success", body = "") {
  const t = document.createElement("div"); t.className = `toast ${type}`; t.setAttribute("role", type === "error" ? "alert" : "status");
  t.innerHTML = `<span class="t-ic">${icon({ success: "check", error: "x", warn: "alert", info: "info" }[type])}</span><div class="grow min0"><b>${esc(title)}</b>${body ? `<p>${esc(body)}</p>` : ""}</div>`;
  $("#toasts").appendChild(t); setTimeout(() => t.remove(), type === "error" ? 5200 : 3200);
}
function openModal(title, html, onMount) {
  const m = $("#modal"); m.className = "modal center-modal";
  m.innerHTML = `<div class="modal-head"><h2 id="modal-title">${esc(title)}</h2><button class="btn icon-only ghost" data-close aria-label="Close">${icon("x")}</button></div>${html}`;
  $("#scrim").classList.add("open"); onMount && onMount(m); (m.querySelector("input, select, textarea") || m.querySelector("button")).focus();
}
const closeModal = () => { $("#scrim").classList.remove("open"); $("#modal").innerHTML = ""; };
$("#scrim").addEventListener("click", (e) => { if (e.target.id === "scrim" || e.target.closest("[data-close]")) closeModal(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") { closeModal(); closeDrawer(); } });
const confirmAct = (title, body, cta, fn) => openModal(title, `<p class="muted">${body}</p><div class="row mt"><button class="btn neutral grow" data-close>Cancel</button><button class="btn danger grow" id="cf-go">${cta}</button></div>`, (m) => $("#cf-go", m).addEventListener("click", async () => { try { await fn(); closeModal(); } catch (e) { toast(e.message, "error"); } }));
const busy = (b, on) => { if (!b) return; b.disabled = on; if (on) { b.dataset.l = b.innerHTML; b.innerHTML = `<span class="spinner"></span> Saving…`; } else if (b.dataset.l) b.innerHTML = b.dataset.l; };
const sw = (id, on, label) => `<label class="sw-row"><span class="grow">${label}</span><input type="checkbox" class="switch" id="${id}" ${on ? "checked" : ""}></label>`;

/* ── state ── */
let api = null, tab = "overview", badges = {}, cache = {};
const load = async (key, fn) => (cache[key] = await fn());
const go = (t) => { tab = t; cache = {}; history.replaceState(null, "", `#${t}`); closeDrawer(); draw(); window.scrollTo(0, 0); };
async function act(action, target, fn) { const r = await fn(); try { await api.log(action, target); } catch { /* log is best-effort */ } return r; }

/* ── sign-in ── */
let otpEmail = "";
function signIn(msg = "") {
  const live = cloud.enabled;
  root.innerHTML = `<div class="adm-login"><div class="card fx-rise">
    <div class="row nowrap"><span class="adm-logo">${icon("shield")}</span><div><h1 style="font-size:22px">EWUdiots Admin</h1><p class="xs">Unofficial · not affiliated with EWU</p></div></div>
    ${msg ? `<div class="alert amber mt">${icon("alert")}<div><b>${esc(msg)}</b></div></div>` : ""}
    ${live ? (otpEmail ? `<form id="lg-code" class="stack mt"><label class="field">Code sent to ${esc(otpEmail)}<input class="input otp" name="code" inputmode="numeric" maxlength="6" required autocomplete="one-time-code"></label><button class="btn primary lg block">Verify</button><button type="button" class="btn ghost block" id="lg-back">Use another email</button></form>`
      : `<form id="lg-mail" class="stack mt"><label class="field">Admin email<input class="input" name="email" type="email" required autocomplete="email" placeholder="you@example.com"></label><button class="btn primary lg block">Send me a code</button></form>`)
      : `<p class="small muted mt">This build isn't connected to the EWUdiots server yet (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY), so there's nothing live to manage.</p>`}
    <div class="or-line"><span>or</span></div>
    <button class="btn outline block" id="lg-demo">${icon("play")} Explore demo mode</button>
    <p class="xs mt-s">Demo mode keeps everything in this browser. Nothing you do there reaches students.</p></div></div>`;
  $("#lg-demo").addEventListener("click", () => { api = demoBackend(); start(); });
  $("#lg-back")?.addEventListener("click", () => { otpEmail = ""; signIn(); });
  $("#lg-mail")?.addEventListener("submit", async (e) => { e.preventDefault(); const b = e.target.querySelector("button"); busy(b, true);
    try { const email = String(new FormData(e.target).get("email")).trim().toLowerCase(); const r = await cloud.sb.auth.signInWithOtp({ email, options: { shouldCreateUser: true } }); if (r.error) throw r.error; otpEmail = email; signIn(); } catch (err) { busy(b, false); toast(err.message, "error"); } });
  $("#lg-code")?.addEventListener("submit", async (e) => { e.preventDefault(); const b = e.target.querySelector("button"); busy(b, true);
    try { const r = await cloud.sb.auth.verifyOtp({ email: otpEmail, token: String(new FormData(e.target).get("code")).trim(), type: "email" }); if (r.error) throw r.error; otpEmail = ""; await checkAdmin(r.data.user); } catch (err) { busy(b, false); toast(/expired|invalid/i.test(err.message) ? "That code is wrong or expired" : err.message, "error"); } });
}
async function checkAdmin(user) {
  const { data, error } = await cloud.sb.rpc("claim_admin_invite"); // also accepts a pending invite for this email
  if (error || !data) {
    root.innerHTML = `<div class="adm-login"><div class="card"><h1 style="font-size:22px">Not an admin yet</h1><p class="muted mt-s">${esc(user.email)} is signed in but isn't an admin. An owner can invite it from Admins, or for the very first owner run this once in Supabase → SQL Editor:</p>
      <pre class="adm-code">insert into public.admin_invites (email, role) values ('${esc(user.email.replace(/'/g, ""))}', 'owner');</pre>
      <div class="row mt"><button class="btn primary grow" id="na-retry">I've done it, check again</button><button class="btn neutral" id="na-out">Sign out</button></div></div></div>`;
    $("#na-retry").addEventListener("click", () => checkAdmin(user)); $("#na-out").addEventListener("click", async () => { await cloud.signOut(); signIn(); });
    return;
  }
  api = supabaseBackend(user); start();
}

/* ── shell ── */
let drawerOpen = false;
const closeDrawer = () => { drawerOpen = false; root.classList.remove("drawer"); };
async function refreshBadges() {
  try { const [a, r] = await Promise.all([api.count("alumni_profiles", { status: "pending" }), api.count("reports")]); badges = { alumni: a, reports: r }; } catch { badges = {}; }
  $$(".adm-nav [data-badge]").forEach((el) => { const n = badges[el.dataset.badge] || 0; el.textContent = n; el.hidden = !n; });
}
function start() {
  tab = SECTIONS.some((s) => s[0] === location.hash.slice(1)) ? location.hash.slice(1) : "overview";
  const groups = [...new Set(SECTIONS.map((s) => s[3]))];
  root.innerHTML = `<aside class="adm-side"><div class="adm-brand"><span class="adm-logo">${icon("shield")}</span><div><b>EWU<i>diots</i></b><span class="xs">Admin console</span></div></div>
      <nav class="adm-nav">${groups.map((g) => `<p class="adm-group">${g}</p>${SECTIONS.filter((s) => s[3] === g).map(([id, l, ic]) => `<a href="#${id}" data-tab="${id}">${icon(ic)}<span class="grow">${l}</span><span class="badge-n" data-badge="${id}" hidden></span></a>`).join("")}`).join("")}</nav>
      <div class="adm-me"><span class="avatar sm">${esc(api.email.slice(0, 2).toUpperCase())}</span><div class="min0 grow"><b class="ellipsis" style="display:block">${esc(api.email)}</b><span class="xs">${api.kind === "demo" ? "Demo mode" : "Signed in"}</span></div><button class="icon-btn" id="adm-out" aria-label="Sign out">${icon("logout")}</button></div></aside>
    <div class="adm-scrim" id="adm-scrim"></div>
    <div class="adm-main"><header class="adm-top"><button class="icon-btn adm-menu" id="adm-menu" aria-label="Menu">${icon("list")}</button>
      <button class="searchbar adm-search" id="adm-k" type="button">${icon("search")}<span>Jump to…</span><span class="kbd">Ctrl K</span></button><span class="grow"></span>
      ${api.kind === "demo" ? `<span class="pill amber">${icon("alert", "sm")} Demo mode · not live</span>` : `<span class="pill green">${icon("cloud", "sm")} Live</span>`}
      <a class="btn sm outline" href="/app.html" target="_blank" rel="noopener">${icon("external", "sm")} Open app</a></header>
      <main class="adm-body" id="adm-body"></main></div>`;
  $$(".adm-nav a").forEach((a) => a.addEventListener("click", (e) => { e.preventDefault(); go(a.dataset.tab); }));
  $("#adm-menu").addEventListener("click", () => { drawerOpen = !drawerOpen; root.classList.toggle("drawer", drawerOpen); });
  $("#adm-scrim").addEventListener("click", closeDrawer);
  $("#adm-out").addEventListener("click", async () => { await api.signOut(); api = null; signIn(); });
  $("#adm-k").addEventListener("click", jump);
  draw(); refreshBadges();
}
document.addEventListener("keydown", (e) => { if (api && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); jump(); } });
function jump() {
  openModal("Jump to", `<input class="input" id="jk-q" placeholder="Type a section…" autocomplete="off"><div id="jk-list" class="mt-s"></div>`, (m) => {
    const q = $("#jk-q", m), list = $("#jk-list", m);
    const draw2 = () => { const t = q.value.toLowerCase(); list.innerHTML = SECTIONS.filter((s) => s[1].toLowerCase().includes(t)).map(([id, l, ic]) => `<button class="lrow" data-j="${id}"><span class="itile sm purple">${icon(ic)}</span><span class="body"><b>${l}</b></span></button>`).join(""); $$("[data-j]", list).forEach((b) => b.addEventListener("click", () => { closeModal(); go(b.dataset.j); })); };
    q.addEventListener("input", draw2); q.addEventListener("keydown", (e) => { if (e.key === "Enter") $("[data-j]", list)?.click(); }); draw2();
  });
}
async function draw() {
  $$(".adm-nav a").forEach((a) => a.setAttribute("aria-current", a.dataset.tab === tab ? "page" : "false"));
  const body = $("#adm-body"), [, title, ic] = SECTIONS.find((s) => s[0] === tab);
  body.innerHTML = `<div class="adm-head fx-rise"><span class="itile purple">${icon(ic)}</span><h1>${title}</h1></div><div id="sec"><div class="skel" style="height:180px"></div></div>`;
  try { await VIEWS[tab]($("#sec")); }
  catch (e) { $("#sec").innerHTML = `<div class="alert red">${icon("alert")}<div><b>Couldn't load this section</b><p>${esc(e.message)}</p></div></div>`; }
}
const redraw = () => { draw(); refreshBadges(); };

/* ── sections ── */
const VIEWS = {
  async overview(el) {
    const [posts, pending, reports, hidden, rooms, admins, log] = await Promise.all([api.count("posts", { published: true }), api.count("alumni_profiles", { status: "pending" }), api.count("reports"), api.count("faculty_overrides", { hidden: true }), api.count("campus_rooms"), api.count("admins"), api.list("admin_log", { limit: 8 })]);
    const kpi = [["megaphone", "purple", posts, "Live posts", "posts"], ["community", "green", pending, "Alumni waiting", "alumni"], ["flag", "red", reports, "Open reports", "reports"], ["users", "blue", hidden, "Hidden faculty", "faculty"], ["map", "orange", rooms, "Shared rooms", "rooms"], ["shield", "teal", admins, "Admins", "admins"]];
    el.innerHTML = `<div class="kpis">${kpi.map(([i, t, n, l, to], k) => `<button class="kpi fx-rise" style="--i:${k}" data-go="${to}"><span class="itile ${t}">${icon(i)}</span><b class="count" data-to="${n}">${n}</b><span>${l}</span></button>`).join("")}</div>
      <div class="split mt" style="align-items:start">
        <section class="card fx-rise" style="--i:3"><div class="card-h"><h2>Live feeds</h2></div><div id="feeds"><div class="skel" style="height:90px"></div></div></section>
        <section class="card fx-rise" style="--i:4"><div class="card-h"><h2>Recent activity</h2><button class="lnk" data-go="activity">See all</button></div>${log.length ? log.map(logRow).join("") : '<p class="small muted">Nothing yet.</p>'}</section>
      </div>
      <section class="card mt fx-rise" style="--i:5"><h2>Quick actions</h2><div class="row mt-s"><button class="btn primary" id="qa-post">${icon("plus")} New announcement</button><button class="btn outline" data-go="banner">${icon("bell")} Edit home banner</button><button class="btn outline" data-go="alumni">${icon("community")} Review alumni</button><button class="btn outline" id="qa-export">${icon("download")} Export everything</button></div></section>`;
    bindGo(el); $("#qa-post", el).addEventListener("click", () => postForm({ kind: "announcement" }));
    $("#qa-export", el).addEventListener("click", exportAll);
    const feeds = await Promise.all(["/api/notices", "/api/news"].map(async (u) => { try { const r = await fetch(u); const j = await r.json(); return [u, r.ok, (j.notices || j.news || []).length, j.fetched]; } catch { return [u, false, 0]; } }));
    $("#feeds", el).innerHTML = feeds.map(([u, ok, n, at]) => `<div class="lrow"><span class="itile sm ${ok ? "green" : "red"}">${icon(ok ? "checkc" : "alert")}</span><span class="body"><b>${u === "/api/notices" ? "EWU notice board" : "EWU news"}</b><span>${ok ? `${n} items · fetched ${ago(at)}` : "Not reachable right now"}</span></span></div>`).join("");
  },

  async posts(el) {
    const rows = await load("posts", () => api.list("posts", { order: "starts_at" }));
    el.innerHTML = `<div class="row"><button class="btn primary" id="np">${icon("plus")} New post</button><span class="grow"></span><span class="xs">Announcements show on the Notice Board; news posts lead the Campus News page.</span></div>
      <section class="card mt tight">${rows.length ? rows.map((p) => `<div class="lrow"><span class="itile sm ${p.kind === "announcement" ? "orange" : p.kind === "news" ? "blue" : "green"}">${icon(p.kind === "announcement" ? "megaphone" : p.kind === "news" ? "globe" : "calendar")}</span>
        <span class="body"><b>${esc(p.title)}</b><span>${esc(p.kind)} · ${ago(p.starts_at || p.created_at)}${p.ends_at ? ` · ends ${ago(p.ends_at)}` : ""}</span></span>
        ${p.pinned ? '<span class="pill amber">Pinned</span>' : ""}<span class="pill ${p.published ? "green" : ""}">${p.published ? "Live" : "Draft"}</span>
        <button class="btn sm ghost" data-edit="${p.id}" aria-label="Edit ${esc(p.title)}">${icon("edit")}</button><button class="btn sm ghost" data-del="${p.id}" aria-label="Delete ${esc(p.title)}">${icon("trash")}</button></div>`).join("") : `<p class="small muted">No posts yet. Write the first announcement.</p>`}</section>`;
    $("#np", el).addEventListener("click", () => postForm({ kind: "announcement" }));
    $$("[data-edit]", el).forEach((b) => b.addEventListener("click", () => postForm(rows.find((p) => String(p.id) === b.dataset.edit))));
    $$("[data-del]", el).forEach((b) => b.addEventListener("click", () => { const p = rows.find((x) => String(x.id) === b.dataset.del); confirmAct("Delete this post?", `“${esc(p.title)}” disappears for everyone.`, "Delete", async () => { await act("Deleted post", p.title, () => api.remove("posts", { id: p.id })); toast("Post deleted", "info"); redraw(); }); }));
  },

  async banner(el) {
    const rows = await api.list("site_settings", { order: null }), b = (rows.find((r) => r.key === "banner") || {}).value || {};
    el.innerHTML = `<div class="split" style="align-items:start"><form class="card stack" id="bn">
        ${sw("bn-on", b.on !== false && b.text, "Show the banner on everyone's Home screen")}
        <label class="field">Title<input class="input" name="title" maxlength="80" value="${esc(b.title || "")}" placeholder="From the EWUdiots team"></label>
        <label class="field">Message<textarea class="input" name="text" maxlength="280" rows="3" placeholder="Short and useful">${esc(b.text || "")}</textarea></label>
        <div class="grid g2"><label class="field">Colour<select class="select" name="tone">${[["purple", "Purple (news)"], ["green", "Green (good news)"], ["amber", "Amber (heads-up)"], ["red", "Red (urgent)"]].map(([v, l]) => `<option value="${v}" ${b.tone === v ? "selected" : ""}>${l}</option>`).join("")}</select></label>
          <label class="field">Button text<input class="input" name="cta" maxlength="24" value="${esc(b.cta || "")}" placeholder="Open"></label></div>
        <label class="field">Button link (app page like #/news, or https://…)<input class="input" name="link" value="${esc(b.link || "")}" pattern="(#/.*|https://.+)?"></label>
        <button class="btn primary">${icon("check")} Publish banner</button></form>
      <div><p class="small strong">Preview</p><div class="alert ${esc(b.tone || "purple")} mt-s" id="bn-prev"></div></div></div>`;
    const form = $("#bn", el), prev = () => { const f = Object.fromEntries(new FormData(form)); const p = $("#bn-prev", el); p.className = `alert ${f.tone} mt-s`; p.innerHTML = `<span class="a-ic">${icon(f.tone === "red" ? "alert" : "megaphone")}</span><div class="grow"><b>${esc(f.title || "From the EWUdiots team")}</b><p>${esc(f.text || "Your message")}</p></div>${f.link ? `<span class="btn sm">${esc(f.cta || "Open")}</span>` : ""}`; };
    form.addEventListener("input", prev); prev();
    form.addEventListener("submit", async (e) => { e.preventDefault(); const btn = form.querySelector("button.primary"); busy(btn, true);
      try { const f = Object.fromEntries(new FormData(form)); await act("Updated home banner", f.title || f.text, () => api.upsert("site_settings", { key: "banner", value: { ...f, on: $("#bn-on", el).checked }, updated_at: new Date().toISOString() })); toast("Banner published", "success", "Students see it on their next refresh."); }
      catch (err) { toast(err.message, "error"); } busy(btn, false); });
  },

  async features(el) {
    const rows = await api.list("site_settings", { order: null }), f = (rows.find((r) => r.key === "features") || {}).value || {};
    el.innerHTML = `<form class="card stack" id="ft" style="max-width:640px"><p class="small muted">Switch a section off for every student (for example during maintenance, or if a feed breaks). Pages show a friendly "taking a break" screen.</p>
      ${FEATURES.map(([k, l]) => sw(`ft-${k}`, f[k] !== false, l)).join("")}<button class="btn primary">${icon("check")} Save</button></form>`;
    $("#ft", el).addEventListener("submit", async (e) => { e.preventDefault(); const btn = e.target.querySelector("button.primary"); busy(btn, true);
      const value = Object.fromEntries(FEATURES.map(([k]) => [k, $(`#ft-${k}`, el).checked]));
      try { await act("Changed features", Object.entries(value).filter(([, v]) => !v).map(([k]) => k).join(", ") || "all on", () => api.upsert("site_settings", { key: "features", value, updated_at: new Date().toISOString() })); toast("Features saved"); }
      catch (err) { toast(err.message, "error"); } busy(btn, false); });
  },

  async alumni(el) {
    let st = el.dataset.st || "pending";
    const rows = await api.list("alumni_profiles", { eq: { status: st } });
    const count = (await fetch("/data/alumni.json").then((r) => r.json()).catch(() => ({ alumni: [] }))).alumni.length;
    el.innerHTML = `<div class="seg">${[["pending", "Waiting"], ["approved", "Approved"], ["rejected", "Rejected"]].map(([v, l]) => `<button data-st="${v}" aria-selected="${st === v}">${l}</button>`).join("")}</div>
      <p class="xs mt-s">${count} more alumni come from EWU newsletters (public/data/alumni.json).</p>
      <div class="adm-cards mt">${rows.length ? rows.map((a) => `<article class="card fx-rise"><div class="row nowrap"><span class="avatar">${esc(a.name.slice(0, 2).toUpperCase())}</span><div class="min0 grow"><b>${esc(a.name)}</b><p class="xs">${esc([a.dept, a.grad_year && `Class of ${a.grad_year}`].filter(Boolean).join(" · "))} · sent ${ago(a.created_at)}</p></div></div>
          <p class="mt-s"><b>${esc(a.role)}</b> · ${esc(a.org)}</p><p class="xs">${icon("pin", "sm")} ${esc(a.country)} · ${esc(a.sector)}</p>${a.note ? `<p class="small muted mt-s">${esc(a.note)}</p>` : ""}${a.linkedin ? `<a class="xs" href="${esc(a.linkedin)}" target="_blank" rel="noopener">LinkedIn</a>` : ""}
          <div class="row mt">${st !== "approved" ? `<button class="btn sm primary" data-ap="${a.id}">${icon("check", "sm")} Approve</button>` : ""}${st !== "rejected" ? `<button class="btn sm danger-soft" data-rj="${a.id}">${icon("x", "sm")} ${st === "approved" ? "Unpublish" : "Reject"}</button>` : ""}</div></article>`).join("")
        : `<div class="card">${`<p class="small muted">Nothing ${st === "pending" ? "waiting for review" : "here"}.</p>`}</div>`}</div>`;
    $$("[data-st]", el).forEach((b) => b.addEventListener("click", () => { el.dataset.st = b.dataset.st; VIEWS.alumni(el); }));
    const setSt = (id, status, verb) => { const a = rows.find((x) => String(x.id) === id); return act(`${verb} alumni profile`, a.name, () => api.update("alumni_profiles", { id: a.id }, { status })).then(() => { toast(`${a.name}: ${status}`); VIEWS.alumni(el); refreshBadges(); }).catch((e) => toast(e.message, "error")); };
    $$("[data-ap]", el).forEach((b) => b.addEventListener("click", () => setSt(b.dataset.ap, "approved", "Approved")));
    $$("[data-rj]", el).forEach((b) => b.addEventListener("click", () => setSt(b.dataset.rj, "rejected", "Rejected")));
  },

  async faculty(el) {
    const [dir, ovs] = await Promise.all([fetch("/data/faculty.json").then((r) => r.json()).then((j) => j.faculty || []).catch(() => []), api.list("faculty_overrides", { order: null })]);
    const ov = new Map(ovs.map((o) => [o.slug, o]));
    let q = "", onlyChanged = false;
    const drawList = () => {
      const t = q.toLowerCase(), list = dir.map((f) => ({ ...f, slug: f.url.split("/").pop(), o: ov.get(f.url.split("/").pop()) })).filter((f) => (!onlyChanged || f.o) && (!t || `${f.name} ${f.dept} ${f.email} ${f.room}`.toLowerCase().includes(t))).slice(0, 80);
      $("#fl", el).innerHTML = list.map((f) => `<div class="lrow"><span class="avatar sm face">${esc(f.name.split(" ").pop()[0] || "?")}${f.photo ? `<img src="${esc(f.photo)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ""}</span>
        <span class="body"><b>${esc(f.name)}</b><span>${esc(f.designation)} · ${esc(f.dept)}${f.o?.init ? ` · ${esc(f.o.init)}` : ""}${(f.o?.room || f.room) ? ` · Room ${esc(f.o?.room || f.room)}` : ""}</span></span>
        ${f.o?.hidden ? '<span class="pill red">Hidden</span>' : f.o ? '<span class="pill purple">Edited</span>' : ""}<button class="btn sm ghost" data-fe="${esc(f.slug)}">${icon("edit")} Edit</button></div>`).join("") || '<p class="small muted">No faculty match.</p>';
      $$("[data-fe]", el).forEach((b) => b.addEventListener("click", () => editFaculty(dir.find((f) => f.url.endsWith("/" + b.dataset.fe)), ov.get(b.dataset.fe))));
    };
    el.innerHTML = `<div class="row nowrap"><div class="searchbar grow">${icon("search")}<input class="input" id="fq" type="search" placeholder="Search ${dir.length} faculty"></div><button class="chip" id="fch" aria-pressed="false">Edited only</button></div>
      <p class="xs mt-s">Hide a listing when a faculty member asks, add their routine initials so reviews and schedules match, or correct an office room.</p><section class="card mt tight" id="fl"></section>`;
    $("#fq", el).addEventListener("input", (e) => { q = e.target.value; drawList(); });
    $("#fch", el).addEventListener("click", (e) => { onlyChanged = !onlyChanged; e.currentTarget.setAttribute("aria-pressed", onlyChanged); drawList(); });
    drawList();
    function editFaculty(f, o = {}) {
      const slug = f.url.split("/").pop();
      openModal(f.name, `<form id="fe" class="stack">${sw("fe-hide", o.hidden, "Hide this listing from the app")}
        <label class="field">Routine initials (as on the portal)<input class="input" name="init" maxlength="8" pattern="[A-Z]{2,8}" value="${esc(o.init || "")}" placeholder="e.g. NHR"></label>
        <label class="field">Office room<input class="input" name="room" value="${esc(o.room || "")}" placeholder="${esc(f.room || "e.g. 636")}"></label>
        <label class="field">Note (only admins see this)<input class="input" name="note" value="${esc(o.note || "")}" placeholder="Requested by email on …"></label>
        <div class="row"><a class="btn ghost" href="${esc(f.url)}" target="_blank" rel="noopener">${icon("external", "sm")} Official profile</a><span class="grow"></span><button class="btn primary">${icon("check")} Save</button></div></form>`, (m) => {
        $("#fe", m).addEventListener("submit", async (e) => { e.preventDefault(); const d = Object.fromEntries(new FormData(e.target)), btn = e.target.querySelector("button.primary");
          if (d.room && !parseRoom(d.room)) return toast("That isn't an EWU room number", "error");
          busy(btn, true);
          try { const row = { slug, hidden: $("#fe-hide", m).checked, init: d.init.toUpperCase(), room: d.room ? parseRoom(d.room).code : "", note: d.note, updated_at: new Date().toISOString() };
            await act(row.hidden ? "Hid faculty listing" : "Edited faculty listing", f.name, () => api.upsert("faculty_overrides", row)); ov.set(slug, row); closeModal(); drawList(); toast("Saved", "success", f.name); }
          catch (err) { busy(btn, false); toast(err.message, "error"); } });
      });
    }
  },

  async reports(el) {
    const reps = await api.list("reports");
    const groups = new Map(); reps.forEach((r) => { const k = `${r.target_type}:${r.target_id}`; groups.set(k, [...(groups.get(k) || []), r]); });
    const items = await Promise.all([...groups.entries()].map(async ([k, rs]) => { const [type, id] = k.split(":"); const t = (await api.list(type === "review" ? "reviews" : "resources", { eq: { id }, order: null }))[0]; return { type, id, rs, t }; }));
    el.innerHTML = items.length ? `<div class="adm-cards">${items.map((it) => `<article class="card fx-rise"><div class="row"><span class="pill red">${it.rs.length} report${it.rs.length > 1 ? "s" : ""}</span><span class="pill">${esc(it.type)}</span>${it.t?.status === "hidden" ? '<span class="pill amber">Hidden</span>' : ""}<span class="grow"></span><span class="xs">${ago(it.rs[0].created_at)}</span></div>
        ${it.t ? it.type === "review" ? `<p class="mt-s"><b>${"★".repeat(it.t.stars)}</b> · ${esc(it.t.faculty_init)} ${it.t.course ? `· ${esc(it.t.course)}` : ""}</p><p class="small mt-s">${esc(it.t.body || "(no text)")}</p>` : `<p class="mt-s"><b>${esc(it.t.course)} - ${esc(it.t.title)}</b></p><p class="xs">${esc(it.t.type)}</p>` : `<p class="small muted mt-s">The item was already deleted.</p>`}
        ${it.rs.some((r) => r.reason) ? `<p class="xs mt-s">Reasons: ${it.rs.filter((r) => r.reason).map((r) => esc(r.reason)).join(" · ")}</p>` : ""}
        <div class="row mt">${it.t && it.t.status !== "hidden" ? `<button class="btn sm danger" data-hide="${it.type}:${it.id}">${icon("eye", "sm")} Hide</button>` : ""}${it.t?.status === "hidden" ? `<button class="btn sm" data-show="${it.type}:${it.id}">Restore</button>` : ""}<button class="btn sm ghost" data-dismiss="${it.type}:${it.id}">Dismiss reports</button></div></article>`).join("")}</div>`
      : `<div class="card"><p class="small muted">No open reports. Students can report reviews and vault files; three reports hide an item automatically.</p></div>`;
    const tbl = (t) => (t === "review" ? "reviews" : "resources");
    const run = (attr, fn) => $$(`[data-${attr}]`, el).forEach((b) => b.addEventListener("click", async () => { const [t, id] = b.dataset[attr].split(":"); try { await fn(t, id); VIEWS.reports(el); refreshBadges(); } catch (e) { toast(e.message, "error"); } }));
    run("hide", (t, id) => act(`Hid ${t}`, id, () => api.update(tbl(t), { id }, { status: "hidden" })).then(() => toast("Hidden", "info")));
    run("show", (t, id) => act(`Restored ${t}`, id, () => api.update(tbl(t), { id }, { status: "published" })).then(() => toast("Restored")));
    run("dismiss", (t, id) => act(`Dismissed reports on ${t}`, id, () => api.remove("reports", { target_type: t, target_id: id })).then(() => toast("Reports dismissed", "info")));
  },

  async rooms(el) {
    const rows = await load("rooms", () => api.list("campus_rooms", { order: "code", asc: true }));
    el.innerHTML = `<div class="row"><button class="btn primary" id="nr">${icon("plus")} Add room</button><label class="btn outline" style="cursor:pointer">${icon("upload")} Import from app export<input type="file" id="ri" accept=".json,application/json" hidden></label><span class="grow"></span><span class="xs">Rooms here count as "Verified" on every student's campus map.</span></div>
      <section class="card mt tight">${rows.length ? rows.map((r) => `<div class="lrow"><span class="itile sm yellow">${icon("door")}</span><span class="body"><b>Room ${esc(r.code)}${r.name ? ` · ${esc(r.name)}` : ""}</b><span>${esc(BLOCKS.find((b) => b.id === r.block)?.name || r.block)} · ${floorLabel(r.floor)}${r.u != null ? " · pinned" : ""}</span></span><button class="btn sm ghost" data-re="${esc(r.code)}">${icon("edit")}</button><button class="btn sm ghost" data-rd="${esc(r.code)}">${icon("trash")}</button></div>`).join("") : '<p class="small muted">No shared rooms yet.</p>'}</section>`;
    $("#nr", el).addEventListener("click", () => roomForm());
    $$("[data-re]", el).forEach((b) => b.addEventListener("click", () => roomForm(rows.find((r) => r.code === b.dataset.re))));
    $$("[data-rd]", el).forEach((b) => b.addEventListener("click", () => confirmAct(`Delete room ${b.dataset.rd}?`, "Students go back to the app's own guess for it.", "Delete", async () => { await act("Deleted room", b.dataset.rd, () => api.remove("campus_rooms", { code: b.dataset.rd })); redraw(); })));
    $("#ri", el).addEventListener("change", async (e) => {
      try { const j = JSON.parse(await e.target.files[0].text()); const ok = (j.rooms || []).filter((r) => parseRoom(r.code) && BLOCKS.some((b) => b.id === r.block && r.floor >= b.low && r.floor <= b.top));
        for (const r of ok) await api.upsert("campus_rooms", { code: parseRoom(r.code).code, name: String(r.name || "").slice(0, 80), kind: r.kind || "classroom", block: r.block, floor: Number(r.floor), u: r.u ?? null, v: r.v ?? null, updated_at: new Date().toISOString() });
        await api.log("Imported rooms", `${ok.length} rooms`); toast(`Imported ${ok.length} rooms`); redraw(); } catch (err) { toast("Import failed", "error", err.message); } });
    function roomForm(r = { code: "", name: "", kind: "classroom", block: "CS", floor: 0 }) {
      openModal(r.code ? `Room ${r.code}` : "Add room", `<form id="rf" class="grid g2"><label class="field">Room number<input class="input" name="code" required value="${esc(r.code)}" ${r.code ? "readonly" : ""} placeholder="636, AB2-702"></label>
        <label class="field">Type<select class="select" name="kind">${["classroom", "lab", "office", "gallery", "seminar", "facility"].map((k) => `<option ${r.kind === k ? "selected" : ""}>${k}</option>`).join("")}</select></label>
        <label class="field full-row">Name<input class="input" name="name" value="${esc(r.name)}" placeholder="e.g. Database Lab"></label>
        <label class="field">Block<select class="select" name="block">${BLOCKS.map((b) => `<option value="${b.id}" ${b.id === r.block ? "selected" : ""}>${esc(b.name)}</option>`).join("")}</select></label>
        <label class="field">Floor<select class="select" name="floor"></select></label><div class="row full-row"><span class="grow"></span><button class="btn primary">${icon("check")} Save</button></div></form>`, (m) => {
        const f = $("#rf", m), fl = () => { const b = BLOCKS.find((x) => x.id === f.block.value); f.floor.innerHTML = floorsOf(b).map((x) => `<option value="${x}" ${x === Number(r.floor) ? "selected" : ""}>${floorLabel(x)}</option>`).join(""); };
        f.block.addEventListener("change", fl); fl();
        f.addEventListener("submit", async (e) => { e.preventDefault(); const p = parseRoom(f.code.value); if (!p) return toast("That isn't an EWU room number", "error");
          try { await act(r.code ? "Edited room" : "Added room", p.code, () => api.upsert("campus_rooms", { code: p.code, name: f.name.value.trim(), kind: f.kind.value, block: f.block.value, floor: Number(f.floor.value), u: r.u ?? null, v: r.v ?? null, updated_at: new Date().toISOString() })); closeModal(); redraw(); toast(`Room ${p.code} saved`); }
          catch (err) { toast(err.message, "error"); } });
      });
    }
  },

  async admins(el) {
    const rows = await api.list("admins"), me = rows.find((a) => a.email === api.email), owner = me?.role === "owner";
    const invites = owner ? await api.list("admin_invites").catch(() => []) : [];
    el.innerHTML = `<section class="card tight">${rows.map((a) => `<div class="lrow"><span class="avatar sm">${esc(a.email.slice(0, 2).toUpperCase())}</span><span class="body"><b>${esc(a.email)}</b><span>Added ${ago(a.created_at)}</span></span><span class="pill ${a.role === "owner" ? "purple" : ""}">${esc(a.role)}</span>${owner && a.role !== "owner" ? `<button class="btn sm ghost" data-ra="${esc(a.user_id)}" aria-label="Remove ${esc(a.email)}">${icon("trash")}</button>` : ""}</div>`).join("")}</section>
      ${owner ? `<form class="card mt" id="ad-form"><h3>Invite an admin</h3><p class="small muted mt-s">They become an admin the first time they sign in to this page with that email (any email works, not only EWU).</p>
        <div class="grid g2 mt-s"><label class="field">Email<input class="input" name="email" type="email" required placeholder="name@example.com"></label><label class="field">Role<select class="select" name="role"><option value="admin">Admin (everything except admins)</option><option value="editor">Editor</option><option value="owner">Owner</option></select></label></div>
        <button class="btn primary mt-s">${icon("mail")} Send invite</button>
        ${invites.length ? `<div class="mt">${invites.map((i) => `<div class="lrow"><span class="itile sm yellow">${icon("mail")}</span><span class="body"><b>${esc(i.email)}</b><span>Invited ${ago(i.created_at)} · ${esc(i.role)}</span></span><button type="button" class="btn sm ghost" data-ri="${esc(i.email)}">${icon("x")}</button></div>`).join("")}</div>` : ""}</form>`
        : `<div class="card mt"><p class="small muted">Only owners can invite or remove admins.</p></div>`}`;
    $("#ad-form", el)?.addEventListener("submit", async (e) => { e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)), email = String(f.email).trim().toLowerCase();
      try { await act("Invited admin", `${email} (${f.role})`, () => api.insert("admin_invites", { email, role: f.role })); toast("Invite saved", "success", `${email} becomes ${f.role} on first sign-in.`); redraw(); } catch (err) { toast(err.message, "error"); } });
    $$("[data-ri]", el).forEach((b) => b.addEventListener("click", async () => { try { await act("Revoked invite", b.dataset.ri, () => api.remove("admin_invites", { email: b.dataset.ri })); redraw(); } catch (err) { toast(err.message, "error"); } }));
    $$("[data-ra]", el).forEach((b) => b.addEventListener("click", () => confirmAct("Remove this admin?", "They lose access to the admin panel immediately.", "Remove", async () => { await act("Removed admin", b.dataset.ra, () => api.remove("admins", { user_id: b.dataset.ra })); redraw(); })));
  },

  async activity(el) {
    const rows = await api.list("admin_log", { limit: 200 });
    el.innerHTML = `<section class="card tight">${rows.length ? rows.map(logRow).join("") : '<p class="small muted">No activity yet.</p>'}</section>`;
  }
};
const logRow = (l) => `<div class="lrow"><span class="itile sm purple">${icon("clock")}</span><span class="body"><b>${esc(l.action)}${l.target ? ` · ${esc(l.target)}` : ""}</b><span>${esc(l.email)} · ${ago(l.created_at)}</span></span></div>`;
const bindGo = (el) => $$("[data-go]", el).forEach((b) => b.addEventListener("click", () => go(b.dataset.go)));
async function postForm(p = {}) {
  const local = (d) => (d ? new Date(new Date(d) - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 16) : "");
  openModal(p.id ? "Edit post" : "New post", `<form id="pf" class="grid g2">
    <label class="field">Type<select class="select" name="kind">${[["announcement", "Announcement (Notice Board)"], ["news", "News (Campus News)"], ["event", "Event"]].map(([v, l]) => `<option value="${v}" ${p.kind === v ? "selected" : ""}>${l}</option>`).join("")}</select></label>
    <label class="field">Tag<input class="input" name="tag" maxlength="30" value="${esc(p.tag || "")}" placeholder="Advising, Exams…"></label>
    <label class="field full-row">Title<input class="input" name="title" required minlength="3" maxlength="200" value="${esc(p.title || "")}"></label>
    <label class="field full-row">Text<textarea class="input" name="body" rows="5" maxlength="8000">${esc(p.body || "")}</textarea></label>
    <label class="field">Image URL (https)<input class="input" name="image_url" type="url" pattern="https://.+" value="${esc(p.image_url || "")}"></label>
    <label class="field">Link (https)<input class="input" name="link" type="url" pattern="https://.+" value="${esc(p.link || "")}"></label>
    <label class="field">Show from<input class="input" name="starts_at" type="datetime-local" value="${local(p.starts_at) || local(new Date())}"></label>
    <label class="field">Hide after (optional)<input class="input" name="ends_at" type="datetime-local" value="${local(p.ends_at)}"></label>
    <div class="full-row stack" style="gap:0">${sw("pf-pub", p.published !== false, "Published (students can see it)")}${sw("pf-pin", p.pinned, "Pin to the top")}</div>
    <div class="row full-row"><span class="grow"></span><button type="button" class="btn neutral" data-close>Cancel</button><button class="btn primary">${icon("check")} ${p.id ? "Save" : "Publish"}</button></div></form>`, (m) => {
    $("#pf", m).addEventListener("submit", async (e) => {
      e.preventDefault(); const d = Object.fromEntries(new FormData(e.target)), btn = e.target.querySelector("button.primary"); busy(btn, true);
      const row = { kind: d.kind, tag: d.tag.trim(), title: d.title.trim(), body: d.body.trim(), image_url: d.image_url.trim(), link: d.link.trim(), published: $("#pf-pub", m).checked, pinned: $("#pf-pin", m).checked,
        starts_at: d.starts_at ? new Date(d.starts_at).toISOString() : new Date().toISOString(), ends_at: d.ends_at ? new Date(d.ends_at).toISOString() : null, updated_at: new Date().toISOString() };
      try { await act(p.id ? "Edited post" : "Published post", row.title, () => (p.id ? api.update("posts", { id: p.id }, row) : api.insert("posts", row))); closeModal(); toast(p.id ? "Post saved" : "Post published", "success", row.published ? "Students see it on their next refresh." : "Saved as a draft."); if (tab === "posts" || tab === "overview") redraw(); }
      catch (err) { busy(btn, false); toast(err.message, "error"); }
    });
  });
}
async function exportAll() {
  const out = { exported: new Date().toISOString(), mode: api.kind };
  for (const t of ["posts", "site_settings", "alumni_profiles", "faculty_overrides", "campus_rooms", "admin_log"]) out[t] = await api.list(t, { order: null, limit: 5000 }).catch(() => []);
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([JSON.stringify(out, null, 2)], { type: "application/json" })); a.download = `ewudiots-admin-${new Date().toISOString().slice(0, 10)}.json`; a.click(); toast("Export downloaded");
}

/* ── boot ── */
(async () => {
  if (location.hash === "#demo") { api = demoBackend(); return start(); }
  if (cloud.enabled) { const u = await cloud.currentUser(); if (u) return checkAdmin(u); }
  signIn();
})();
