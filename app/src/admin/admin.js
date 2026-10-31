/* EWUdiots admin panel: publish announcements and news, run the home banner and feature switches, review alumni
   profiles, manage faculty listings, campus rooms and reports, see who did what. Layout ideas from the Aven admin console:
   grouped sidebar with badges, overview KPIs, Ctrl+K jump, spring drawer on phones, an activity log. */
import "../styles.css";
import "../fx.css";
import "../mobile.css";
import "../v212.css";
import "../v216.css";
import { start as startDropdowns } from "../dropdown.js";
import "./admin.css";
import * as cloud from "../cloud.js";
import { icon } from "../icons.js";
import { FEATURES } from "../content.js";
import { BLOCKS, floorsOf, floorLabel, parseRoom } from "../campus-data.js";
import { supabaseBackend, demoBackend } from "./backend.js";
import { cmsViews } from "./cms.js";
import { clubViews } from "./clubs-admin.js";

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const ago = (d) => { if (!d) return ""; const m = Math.round((Date.now() - new Date(d)) / 6e4); return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }); };
const root = $("#admin");

// [id, label, icon, group, permission needed]. The sidebar shows only what your role allows; the server enforces it too.
const ALL_SECTIONS = [
  ["overview", "Overview", "grid", "Workspace"], ["assistant", "Ask the assistant", "brain", "Workspace"], ["analytics", "Analytics", "chart", "Workspace", "analytics.view"],
  ["posts", "Posts & announcements", "megaphone", "Content", "posts.write"], ["feed", "News & notices feed", "globe", "Content", "news.edit"], ["website", "Website & theme", "layers", "Content", "site.edit"],
  ["media", "Media library", "image", "Content", "media.write"], ["messages", "Messages to users", "mail", "Content", "messages.send"], ["banner", "Home banner", "bell", "Content", "site.edit"], ["features", "Features & maintenance", "sliders", "Content", "features.edit"],
  ["users", "Users", "user", "People", "users.view"], ["alumni", "Alumni waiting", "community", "People", "alumni.review"], ["alumdb", "All alumni & import", "cap", "People", "alumni.review"], ["faculty", "Faculty listings", "users", "People", "faculty.edit"],
  ["events", "Events", "calendar", "Community", "events.review"], ["clubs", "Clubs", "community", "Community", "clubs.verify"], ["feedback", "Feedback inbox", "help", "Community", "feedback.handle"], ["library", "Study Library", "books", "Community", "reports.handle"], ["reports", "Reports", "flag", "Community", "reports.handle"], ["rooms", "Campus rooms", "map", "Campus", "rooms.edit"],
  ["security", "Security centre", "lock", "System", "security.view"], ["jobs", "Scheduled jobs", "zap", "System", "jobs.run"], ["history", "Change history", "clock", "System"],
  ["roles", "Roles & permissions", "shield", "System"], ["admins", "Admins", "crown", "System"], ["activity", "Activity log", "list", "System"]
];
let SECTIONS = ALL_SECTIONS, me = { role: "owner", perms: null };
const can = (p) => !p || me.role === "owner" || (me.perms || []).includes(p);
/* CSV that opens cleanly in Excel (UTF-8 BOM keeps Bangla text) and can't run formulas (=, +, -, @ are escaped). */
function downloadCSV(name, rows, cols) {
  const cell = (v) => { let t = v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v); if (/^[=+\-@\t\r]/.test(t)) t = "'" + t; return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
  const csv = "﻿" + [cols.join(","), ...rows.map((r) => cols.map((c) => cell(r[c])).join(","))].join("\r\n");
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })); a.download = `ewudiots-${name}-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
  toast(`Exported ${rows.length} rows`); api.log("Exported CSV", name).catch(() => {});
}
/* Small inline bar chart (no library). */
function barChart(points, { h = 120 } = {}) {
  const max = Math.max(1, ...points.map((p) => p.n)), w = 100 / points.length;
  return `<svg class="adm-chart" viewBox="0 0 100 ${h}" preserveAspectRatio="none" role="img" aria-label="Sign-ups per day">${points.map((p, i) => { const bh = (p.n / max) * (h - 14); return `<rect x="${i * w + w * 0.15}" y="${h - bh}" width="${w * 0.7}" height="${Math.max(bh, p.n ? 2 : 0.6)}" rx="0.8" class="${p.n ? "" : "zero"}"><title>${p.day}: ${p.n}</title></rect>`; }).join("")}</svg>
    <div class="row between xs"><span>${points[0]?.day || ""}</span><span>today</span></div>`;
}
const delta = (now, prev) => { if (!prev) return now ? '<span class="pill green">new</span>' : ""; const d = Math.round(((now - prev) / prev) * 100); return `<span class="pill ${d >= 0 ? "green" : "red"}">${d >= 0 ? "▲" : "▼"} ${Math.abs(d)}%</span>`; };

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
    <div class="row nowrap"><img class="adm-logo" src="/logo-mark.png" alt=""><div><h1 style="font-size:22px">EWUdiots Admin</h1><p class="xs">Unofficial · not affiliated with EWU</p></div></div>
    ${msg ? `<div class="alert amber mt">${icon("alert")}<div><b>${esc(msg)}</b></div></div>` : ""}
    ${live ? (otpEmail ? `<form id="lg-code" class="stack mt"><label class="field">Code sent to ${esc(otpEmail)}<input class="input otp" name="code" inputmode="numeric" maxlength="6" required autocomplete="one-time-code"></label><button class="btn primary lg block">Verify</button><button type="button" class="btn ghost block" id="lg-back">Use another email</button></form>`
      : `<form id="lg-mail" class="stack mt"><label class="field">Admin email<input class="input" name="email" type="email" required autocomplete="email" placeholder="you@example.com"></label><button class="btn primary lg block">Send me a code</button></form>`)
      : `<p class="small muted mt">This build isn't connected to the EWUdiots server yet (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY), so there's nothing live to manage.</p>`}</div></div>`;
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
  try { const [a, r, f, e] = await Promise.all([api.count("alumni_profiles", { status: "pending" }), api.count("reports"), api.count("feedback", { status: "new" }).catch(() => 0), can("events.review") ? api.count("events", { status: "pending" }).catch(() => 0) : 0]); badges = { alumni: a, reports: r, feedback: f, events: e }; } catch { badges = {}; }
  $$(".adm-nav [data-badge]").forEach((el) => { const n = badges[el.dataset.badge] || 0; el.textContent = n; el.hidden = !n; });
  const total = (badges.alumni || 0) + (badges.reports || 0) + (badges.feedback || 0) + (badges.events || 0), bell = $("#adm-bell");
  if (bell) bell.innerHTML = `${icon("bell")}${total ? `<span class="dot-n">${total > 9 ? "9+" : total}</span>` : ""}`;
}
async function start() {
  me = (await api.rpc("my_admin").catch(() => null)) || { role: "owner", perms: null };
  SECTIONS = ALL_SECTIONS.filter((s) => can(s[4]));
  tab = SECTIONS.some((s) => s[0] === location.hash.slice(1)) ? location.hash.slice(1) : "overview";
  const groups = [...new Set(SECTIONS.map((s) => s[3]))];
  root.innerHTML = `<aside class="adm-side"><div class="adm-brand"><img class="adm-logo" src="/logo-mark.png" alt=""><div><b>EWU<i>diots</i></b><span class="xs">Admin console</span></div></div>
      <nav class="adm-nav">${groups.map((g) => `<p class="adm-group">${g}</p>${SECTIONS.filter((s) => s[3] === g).map(([id, l, ic]) => `<a href="#${id}" data-tab="${id}">${icon(ic)}<span class="grow">${l}</span><span class="badge-n" data-badge="${id}" hidden></span></a>`).join("")}`).join("")}</nav>
      <div class="adm-me"><span class="avatar sm">${esc(api.email.slice(0, 2).toUpperCase())}</span><div class="min0 grow"><b class="ellipsis" style="display:block">${esc(api.email)}</b><span class="xs">${api.kind === "demo" ? "Demo mode" : "Signed in"}</span></div><button class="icon-btn" id="adm-out" aria-label="Sign out">${icon("logout")}</button></div></aside>
    <div class="adm-scrim" id="adm-scrim"></div>
    <div class="adm-main"><header class="adm-top"><button class="icon-btn adm-menu" id="adm-menu" aria-label="Menu">${icon("list")}</button>
      <button class="searchbar adm-search" id="adm-k" type="button">${icon("search")}<span>Jump to…</span><span class="kbd">Ctrl K</span></button><span class="grow"></span>
      ${api.kind === "demo" ? `<span class="pill amber">${icon("alert", "sm")} Demo mode · not live</span>` : `<span class="pill green">${icon("cloud", "sm")} Live</span>`}
      <button class="icon-btn" id="adm-bell" aria-label="Alerts">${icon("bell")}</button>
      <a class="btn sm outline" href="/app.html" target="_blank" rel="noopener">${icon("external", "sm")} Open app</a></header>
      <main class="adm-body" id="adm-body"></main></div>`;
  $$(".adm-nav a").forEach((a) => a.addEventListener("click", (e) => { e.preventDefault(); go(a.dataset.tab); }));
  $("#adm-menu").addEventListener("click", () => { drawerOpen = !drawerOpen; root.classList.toggle("drawer", drawerOpen); });
  $("#adm-scrim").addEventListener("click", closeDrawer);
  $("#adm-out").addEventListener("click", async () => { await api.signOut(); api = null; signIn(); });
  $("#adm-k").addEventListener("click", jump);
  // Alerts: everything waiting for an admin, each opening the right section.
  $("#adm-bell").addEventListener("click", () => {
    const items = [["alumni", "community", "green", badges.alumni, "alumni profile(s) waiting for review"], ["reports", "flag", "red", badges.reports, "open report(s) on reviews or files"], ["feedback", "help", "blue", badges.feedback, "new feedback message(s)"]].filter((x) => x[3]);
    openModal("Alerts", items.length ? items.map(([to, ic, t, n, l]) => `<button class="lrow" data-al="${to}"><span class="itile sm ${t}">${icon(ic)}</span><span class="body"><b>${n} ${l}</b></span>${icon("chevR", "sm")}</button>`).join("") : '<p class="small muted">All clear. Nothing is waiting for you.</p>',
      (m) => $$("[data-al]", m).forEach((b) => b.addEventListener("click", () => { closeModal(); go(b.dataset.al); })));
  });
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
/* Users at a glance (Users section): sign-ups per week, who is active, roles and student verification. Plain SVG,
   one series per chart, values on the bars, a table under each for exact numbers. */
function userCharts(rows) {
  const now = Date.now(), DAY = 864e5, W = innerWidth < 600 ? 360 : 620;
  const weeks = [...Array(12)].map((_, i) => { const end = now - (11 - i) * 7 * DAY, start = end - 7 * DAY; return { k: new Date(end).toLocaleDateString("en-GB", { day: "numeric", month: "short" }), v: rows.filter((u) => { const t = new Date(u.created_at).getTime(); return t > start && t <= end; }).length }; });
  const active = (d) => rows.filter((u) => u.last_sign_in_at && now - new Date(u.last_sign_in_at) < d * DAY).length;
  const roles = ["student", "alumni", "faculty", "admin", ""].map((r) => ({ k: r || "no role", v: rows.filter((u) => (u.role || "") === r).length })).filter((x) => x.v);
  const students = rows.filter((u) => u.role === "student"), verified = students.filter((u) => u.card_verified).length, vp = students.length ? Math.round((100 * verified) / students.length) : 0;
  const max = Math.max(1, ...weeks.map((w) => w.v)), H = 160, B = 26, T = 16, bw = (W - 20) / weeks.length;
  const bars = `<div class="viz"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="New accounts per week, last 12 weeks"><line class="base" x1="10" x2="${W - 10}" y1="${H - B}" y2="${H - B}"/>
    ${weeks.map((w, i) => { const h = ((H - B - T) * w.v) / max, x = 10 + i * bw + bw * 0.2; return `<rect class="bar" x="${x}" y="${H - B - h}" width="${bw * 0.6}" height="${h}" rx="3"><title>${w.k}: ${w.v}</title></rect>${w.v ? `<text class="dl" x="${x + bw * 0.3}" y="${H - B - h - 4}" text-anchor="middle" style="font-size:11px">${w.v}</text>` : ""}${i % 2 === 1 ? `<text class="ax" x="${x + bw * 0.3}" y="${H - 8}" text-anchor="middle" style="font-size:10.5px">${w.k}</text>` : ""}`; }).join("")}</svg></div>`;
  const rmax = Math.max(1, ...roles.map((r) => r.v));
  return `<section class="u-insights mt"><div class="kpis">${[["users", "purple", rows.length, "Accounts"], ["zap", "green", active(7), "Active this week"], ["clock", "blue", active(30), "Active in 30 days"], ["checkc", vp >= 50 ? "green" : "orange", `${vp}%`, "Students verified"]].map(([i, t, v, l], k) => `<div class="kpi fx-rise" style="--i:${k}"><span class="itile ${t}">${icon(i)}</span><b>${v}</b><span>${l}</span></div>`).join("")}</div>
    <div class="grid g2 mt"><section class="card"><h3>New accounts per week</h3>${bars}<details class="viz-table"><summary>Show as a table</summary><table><tbody>${weeks.map((w) => `<tr><td>Week to ${w.k}</td><td>${w.v}</td></tr>`).join("")}</tbody></table></details></section>
      <section class="card"><h3>Accounts by role</h3><div class="stack mt-s" style="gap:10px">${roles.map((r) => `<div><div class="row between small"><b style="text-transform:capitalize">${esc(r.k)}</b><span class="num">${r.v}</span></div><div class="u-bar"><i style="width:${(100 * r.v) / rmax}%"></i></div></div>`).join("")}</div>
        <h3 class="mt">Student verification</h3><div class="u-bar big"><i style="width:${vp}%"></i></div><p class="xs mt-s">${verified} of ${students.length} students verified with their ID card.</p></section></div></section>`;
}
const VIEWS = {
  async overview(el) {
    const [posts, pending, reports, hidden, rooms, admins, log] = await Promise.all([api.count("posts", { published: true }), api.count("alumni_profiles", { status: "pending" }), api.count("reports"), api.count("faculty_overrides", { hidden: true }), api.count("campus_rooms"), api.count("admins"), api.list("admin_log", { limit: 8 })]);
    const kpi = [["megaphone", "purple", posts, "Live posts", "posts"], ["community", "green", pending, "Alumni waiting", "alumni"], ["flag", "red", reports, "Open reports", "reports"], ["users", "blue", hidden, "Hidden faculty", "faculty"], ["map", "orange", rooms, "Shared rooms", "rooms"], ["shield", "teal", admins, "Admins", "admins"]];
    const st = await api.rpc("admin_stats", { days: 30 }).catch(() => null);
    el.innerHTML = `${st ? `<div class="kpis">${[["user", "purple", st.users, "Accounts", "users", ""], ["trend", "green", st.new_period, "New in 30 days", "users", delta(st.new_period, st.new_prev)], ["zap", "orange", st.active_7d, "Active this week", "security", ""], ["help", "blue", st.feedback_new, "New feedback", "feedback", ""]]
        .map(([i, t, n, l, to, d], k) => `<button class="kpi fx-rise" style="--i:${k}" data-go="${to}"><span class="itile ${t}">${icon(i)}</span><b class="count" data-to="${n}">${n}</b><span>${l} ${d}</span></button>`).join("")}</div>
      <div class="split mt" style="align-items:start"><section class="card fx-rise"><div class="card-h"><h2>Sign-ups, last 30 days</h2><span class="xs">${st.students} students · ${st.alumni} alumni · ${st.faculty} faculty</span></div>${barChart(st.signups)}</section>
        <section class="card fx-rise"><div class="card-h"><h2>Accounts</h2></div>${[["Synced their data", st.synced], ["Signed-in sessions", st.sessions], ["Suspended", st.suspended]].map(([l, n]) => `<div class="lrow"><span class="body"><b>${l}</b></span><b>${n}</b></div>`).join("")}</section></div>` : ""}
      <h2 class="mt" style="font-size:16px">Content</h2><div class="kpis mt-s">${kpi.map(([i, t, n, l, to], k) => `<button class="kpi fx-rise" style="--i:${k}" data-go="${to}"><span class="itile ${t}">${icon(i)}</span><b class="count" data-to="${n}">${n}</b><span>${l}</span></button>`).join("")}</div>
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
    const all = await load("posts", () => api.list("posts", { order: "starts_at" }));
    // Trash: deleted posts stay 30 days so they can be restored, then they're removed for good.
    const old = all.filter((p) => p.deleted_at && Date.now() - new Date(p.deleted_at) > 30 * 864e5);
    for (const p of old) await api.remove("posts", { id: p.id }).catch(() => {});
    const view = el.dataset.v || "live", rows = all.filter((p) => !old.includes(p) && (view === "trash" ? p.deleted_at : !p.deleted_at)), trashN = all.filter((p) => p.deleted_at && !old.includes(p)).length;
    el.innerHTML = `<div class="row"><button class="btn primary" id="np">${icon("plus")} New post</button><div class="seg">${[["live", "Posts"], ["trash", `Trash (${trashN})`]].map(([v, l]) => `<button data-pv="${v}" aria-selected="${view === v}">${l}</button>`).join("")}</div><span class="grow"></span><button class="btn outline sm" id="p-csv">${icon("download")} CSV</button></div>
      <div class="row mt-s bulk" id="bulk" hidden><b id="bulk-n"></b>${view === "trash" ? `<button class="btn sm" data-bulk="restore">Restore</button><button class="btn sm danger" data-bulk="purge">Delete forever</button>` : `<button class="btn sm" data-bulk="publish">Publish</button><button class="btn sm" data-bulk="draft">Unpublish</button><button class="btn sm danger-soft" data-bulk="trash">Move to trash</button>`}</div>
      <section class="card mt tight">${rows.length ? rows.map((p) => `<div class="lrow"><input type="checkbox" class="check" data-sel="${p.id}" aria-label="Select ${esc(p.title)}"><span class="itile sm ${p.kind === "announcement" ? "orange" : p.kind === "news" ? "blue" : "green"}">${icon(p.kind === "announcement" ? "megaphone" : p.kind === "news" ? "globe" : "calendar")}</span>
        <span class="body"><b>${esc(p.title)}</b><span>${esc(p.kind)} · ${view === "trash" ? `deleted ${ago(p.deleted_at)} · removed for good after 30 days` : `${ago(p.starts_at || p.created_at)}${p.ends_at ? ` · ends ${ago(p.ends_at)}` : ""}`}</span></span>
        ${view === "trash" ? `<button class="btn sm" data-restore="${p.id}">Restore</button>` : `${p.pinned ? '<span class="pill amber">Pinned</span>' : ""}<span class="pill ${p.published ? "green" : ""}">${p.published ? "Live" : "Draft"}</span>
        <button class="btn sm ghost" data-edit="${p.id}" aria-label="Edit ${esc(p.title)}">${icon("edit")}</button><button class="btn sm ghost" data-del="${p.id}" aria-label="Move ${esc(p.title)} to trash">${icon("trash")}</button>`}</div>`).join("")
        : `<p class="small muted">${view === "trash" ? "Trash is empty." : "No posts yet. Write the first announcement."}</p>`}</section>`;
    const byId = (id) => rows.find((p) => String(p.id) === String(id));
    const trash = (p) => api.update("posts", { id: p.id }, { deleted_at: new Date().toISOString(), published: false });
    const restore = (p) => api.update("posts", { id: p.id }, { deleted_at: null });
    $("#np", el).addEventListener("click", () => postForm({ kind: "announcement" }));
    $$("[data-pv]", el).forEach((b) => b.addEventListener("click", () => { el.dataset.v = b.dataset.pv; cache = {}; VIEWS.posts(el); }));
    $("#p-csv", el).addEventListener("click", () => downloadCSV("posts", rows, ["id", "kind", "title", "tag", "published", "pinned", "starts_at", "ends_at", "link", "body"]));
    $$("[data-edit]", el).forEach((b) => b.addEventListener("click", () => postForm(byId(b.dataset.edit))));
    $$("[data-del]", el).forEach((b) => b.addEventListener("click", async () => { const p = byId(b.dataset.del); try { await act("Moved post to trash", p.title, () => trash(p)); toast("Moved to trash", "info", "Restore it from Trash within 30 days."); redraw(); } catch (e) { toast(e.message, "error"); } }));
    $$("[data-restore]", el).forEach((b) => b.addEventListener("click", async () => { const p = byId(b.dataset.restore); try { await act("Restored post", p.title, () => restore(p)); toast("Restored as a draft", "success", "Publish it again when you're ready."); redraw(); } catch (e) { toast(e.message, "error"); } }));
    const sel = () => $$("[data-sel]:checked", el).map((c) => byId(c.dataset.sel));
    const showBulk = () => { const n = sel().length; $("#bulk", el).hidden = !n; $("#bulk-n", el).textContent = `${n} selected`; };
    $$("[data-sel]", el).forEach((c) => c.addEventListener("change", showBulk));
    $$("[data-bulk]", el).forEach((b) => b.addEventListener("click", async () => {
      const list = sel(), kind = b.dataset.bulk;
      const run = async () => { for (const p of list) { if (kind === "publish") await api.update("posts", { id: p.id }, { published: true }); else if (kind === "draft") await api.update("posts", { id: p.id }, { published: false }); else if (kind === "trash") await trash(p); else if (kind === "restore") await restore(p); else await api.remove("posts", { id: p.id }); }
        await api.log(`Bulk ${kind} posts`, `${list.length} posts`).catch(() => {}); toast(`${list.length} post(s) updated`); redraw(); };
      // Deleting for good needs the word typed out, so it can't happen by accident.
      if (kind === "purge") openModal("Delete forever?", `<p class="muted">${list.length} post(s) will be gone for good. Type <b>DELETE</b> to confirm.</p><input class="input mt-s" id="pg-t" autocomplete="off"><div class="row mt"><button class="btn neutral grow" data-close>Cancel</button><button class="btn danger grow" id="pg-go" disabled>Delete forever</button></div>`, (m) => {
        $("#pg-t", m).addEventListener("input", (e) => { $("#pg-go", m).disabled = e.target.value !== "DELETE"; });
        $("#pg-go", m).addEventListener("click", async () => { closeModal(); await run().catch((e) => toast(e.message, "error")); });
      });
      else await run().catch((e) => toast(e.message, "error"));
    }));
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
        <label class="field">Picture (optional, https)<input class="input" name="image" type="url" pattern="https://.+" value="${esc(b.image || "")}" placeholder="Upload a photo or paste a link"></label>
        <button class="btn primary">${icon("check")} Publish banner</button></form>
      <div><p class="small strong">Preview</p><div class="alert ${esc(b.tone || "purple")} mt-s" id="bn-prev"></div></div></div>`;
    const form = $("#bn", el), prev = () => { const f = Object.fromEntries(new FormData(form)); const p = $("#bn-prev", el); p.className = `alert ${f.tone} mt-s`; p.innerHTML = `${String(f.image || "").startsWith("https://") ? `<img class="bn-img" src="${esc(f.image)}" alt="">` : ""}<span class="a-ic">${icon(f.tone === "red" ? "alert" : "megaphone")}</span><div class="grow"><b>${esc(f.title || "From the EWUdiots team")}</b><p>${esc(f.text || "Your message")}</p></div>${f.link ? `<span class="btn sm">${esc(f.cta || "Open")}</span>` : ""}`; };
    form.addEventListener("input", prev); prev();
    form.addEventListener("submit", async (e) => { e.preventDefault(); const btn = form.querySelector("button.primary"); busy(btn, true);
      try { const f = Object.fromEntries(new FormData(form)); await act("Updated home banner", f.title || f.text, () => api.upsert("site_settings", { key: "banner", value: { ...f, on: $("#bn-on", el).checked }, updated_at: new Date().toISOString() })); toast("Banner published", "success", "Students see it on their next refresh."); }
      catch (err) { toast(err.message, "error"); } busy(btn, false); });
  },

  async features(el) {
    const rows = await api.list("site_settings", { order: null }), f = (rows.find((r) => r.key === "features") || {}).value || {}, mt = (rows.find((r) => r.key === "maintenance") || {}).value || {};
    el.innerHTML = `<form class="card stack" id="mt" style="max-width:640px"><h2 style="font-size:17px">${icon("alert", "sm")} Maintenance mode</h2>
        <p class="small muted">Shows everyone a maintenance screen in the app with your message. Their own data stays on their device; admins can still use this panel.</p>
        ${sw("mt-on", mt.on, "Maintenance mode on")}<label class="field">Message<input class="input" name="text" maxlength="200" value="${esc(mt.text || "")}" placeholder="We're updating EWUdiots. Back in about 30 minutes."></label>
        <button class="btn ${mt.on ? "danger" : "primary"}">${icon("check")} Save maintenance</button></form>
      <form class="card stack mt" id="ft" style="max-width:640px"><h2 style="font-size:17px">Sections</h2><p class="small muted">Switch a section off for every student (for example if a feed breaks). Pages show a friendly "taking a break" screen.</p>
      ${FEATURES.map(([k, l]) => sw(`ft-${k}`, f[k] !== false, l)).join("")}<button class="btn primary">${icon("check")} Save</button></form>`;
    $("#mt", el).addEventListener("submit", async (e) => { e.preventDefault(); const btn = e.target.querySelector("button"); busy(btn, true);
      const value = { on: $("#mt-on", el).checked, text: String(new FormData(e.target).get("text") || "").trim().slice(0, 200) };
      if (value.on && !confirm("Turn on maintenance mode for everyone?")) return busy(btn, false);
      try { await act(value.on ? "Turned maintenance ON" : "Turned maintenance off", value.text, () => api.upsert("site_settings", { key: "maintenance", value, updated_at: new Date().toISOString() })); toast(value.on ? "Maintenance mode is on" : "Maintenance mode is off", value.on ? "warn" : "success"); VIEWS.features(el); }
      catch (err) { toast(err.message, "error"); busy(btn, false); } });
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

  /* Study Library: everything students shared (files and links). Moderators verify good material (a badge everyone
     sees), hide it, or remove it for good. */
  async library(el) {
    const rows = await api.list("resources", { limit: 400 }), f = el.dataset.f || "new";
    const shown = rows.filter((r) => (f === "new" ? !r.verified && r.status === "published" : f === "verified" ? r.verified : f === "hidden" ? r.status === "hidden" : true));
    const n = { new: rows.filter((r) => !r.verified && r.status === "published").length, verified: rows.filter((r) => r.verified).length, hidden: rows.filter((r) => r.status === "hidden").length };
    el.innerHTML = `<div class="kpis">${[["books", "purple", rows.length, "Items shared"], ["clock", n.new ? "orange" : "green", n.new, "Waiting for review"], ["checkc", "green", n.verified, "Verified"], ["eye", "red", n.hidden, "Hidden"]].map(([i, t, v, l], k) => `<div class="kpi fx-rise" style="--i:${k}"><span class="itile ${t}">${icon(i)}</span><b>${v}</b><span>${l}</span></div>`).join("")}</div>
      <div class="seg mt">${[["new", `To review (${n.new})`], ["verified", "Verified"], ["hidden", "Hidden"], ["all", "All"]].map(([v, l]) => `<button data-lf="${v}" aria-pressed="${f === v}">${l}</button>`).join("")}</div>
      <input class="input mt" id="lq" type="search" placeholder="Search course, title or uploader">
      <section class="card tight mt">${shown.length ? shown.map((r) => `<div class="lrow top" data-lrow="${esc(`${r.course} ${r.title} ${r.uploader_name || ""}`.toLowerCase())}"><span class="itile sm ${r.verified ? "green" : r.status === "hidden" ? "red" : "orange"}">${icon(r.link ? "link" : "file")}</span>
        <span class="body"><b>${esc(r.course)} · ${esc(r.title)}${r.verified ? ` <span class="pill green">${icon("checkc", "sm")} Verified</span>` : ""}${r.visibility === "private" ? ' <span class="pill">Only uploader</span>' : ""}</b><span>${esc(r.type)}${r.faculty ? ` · ${esc(r.faculty)}` : ""}${r.uploader_name ? ` · by ${esc(r.uploader_name)}` : ""} · ${ago(r.created_at)}</span></span>
        <span class="row" style="gap:6px;flex-wrap:wrap;justify-content:flex-end"><button class="btn sm ghost" data-lopen="${r.id}">${icon("external", "sm")} Open</button>
          <button class="btn sm ${r.verified ? "neutral" : "primary"}" data-lver="${r.id}">${icon("checkc", "sm")} ${r.verified ? "Unverify" : "Verify"}</button>
          <button class="btn sm ${r.status === "hidden" ? "" : "danger-soft"}" data-lhide="${r.id}">${r.status === "hidden" ? "Restore" : "Hide"}</button><button class="btn sm danger" data-lpurge="${r.id}" aria-label="Remove for good">${icon("trash", "sm")}</button></span></div>`).join("") : '<p class="small muted">Nothing here.</p>'}</section>`;
    $$("[data-lf]", el).forEach((b) => b.addEventListener("click", () => { el.dataset.f = b.dataset.lf; VIEWS.library(el); }));
    $("#lq", el).addEventListener("input", (e) => { const q = e.target.value.toLowerCase(); $$("[data-lrow]", el).forEach((r) => { r.hidden = q && !r.dataset.lrow.includes(q); }); });
    const row = (id) => rows.find((r) => r.id === id), again = () => VIEWS.library(el);
    const run = (attr, fn) => $$(`[data-${attr}]`, el).forEach((b) => b.addEventListener("click", async () => { try { await fn(row(b.dataset[attr])); again(); } catch (e) { toast(e.message, "error"); } }));
    run("lver", (r) => act(r.verified ? "Unverified study material" : "Verified study material", `${r.course} ${r.title}`, () => api.update("resources", { id: r.id }, { verified: !r.verified })));
    run("lhide", (r) => act(r.status === "hidden" ? "Restored study material" : "Hid study material", `${r.course} ${r.title}`, () => api.update("resources", { id: r.id }, { status: r.status === "hidden" ? "published" : "hidden" })));
    run("lpurge", async (r) => { if (!confirm(`Remove "${r.title}" for good? It can't be restored.`)) return; await act("Removed study material", `${r.course} ${r.title}`, () => api.purgeResource(r.id)); });
    $$("[data-lopen]", el).forEach((b) => b.addEventListener("click", async () => { const r = row(b.dataset.lopen); try { window.open(r.link || (await cloud.downloadUrl(r.file_path)), "_blank", "noopener"); } catch (e) { toast(e.message, "error"); } }));
  },
  async reports(el) {
    const reps = await api.list("reports");
    const groups = new Map(); reps.forEach((r) => { const k = `${r.target_type}:${r.target_id}`; groups.set(k, [...(groups.get(k) || []), r]); });
    const items = await Promise.all([...groups.entries()].map(async ([k, rs]) => { const [type, id] = k.split(":"); const t = (await api.list(type === "review" ? "reviews" : "resources", { eq: { id }, order: null }))[0]; return { type, id, rs, t }; }));
    el.innerHTML = items.length ? `<div class="adm-cards">${items.map((it) => `<article class="card fx-rise"><div class="row"><span class="pill red">${it.rs.length} report${it.rs.length > 1 ? "s" : ""}</span><span class="pill">${esc(it.type)}</span>${it.t?.status === "hidden" ? '<span class="pill amber">Hidden</span>' : ""}<span class="grow"></span><span class="xs">${ago(it.rs[0].created_at)}</span></div>
        ${it.t ? it.type === "review" ? `<p class="mt-s"><b>${"★".repeat(it.t.stars)}</b> · ${esc(it.t.faculty_init)} ${it.t.course ? `· ${esc(it.t.course)}` : ""}</p><p class="small mt-s">${esc(it.t.body || "(no text)")}</p>` : `<p class="mt-s"><b>${esc(it.t.course)} - ${esc(it.t.title)}</b></p><p class="xs">${esc(it.t.type)}</p>` : `<p class="small muted mt-s">The item was already deleted.</p>`}
        ${it.rs.some((r) => r.reason) ? `<p class="xs mt-s">Reasons: ${it.rs.filter((r) => r.reason).map((r) => esc(r.reason)).join(" · ")}</p>` : ""}
        <div class="row mt">${it.t && it.t.status !== "hidden" ? `<button class="btn sm danger" data-hide="${it.type}:${it.id}">${icon("eye", "sm")} Hide</button>` : ""}${it.t?.status === "hidden" ? `<button class="btn sm" data-show="${it.type}:${it.id}">Restore</button>` : ""}${it.type === "resource" && it.t ? `<button class="btn sm danger" data-purge="${it.type}:${it.id}">${icon("trash", "sm")} Remove for good</button>` : ""}<button class="btn sm ghost" data-dismiss="${it.type}:${it.id}">Dismiss reports</button></div></article>`).join("")}</div>`
      : `<div class="card"><p class="small muted">No open reports. Students can report reviews and vault files; three reports hide an item automatically.</p></div>`;
    const tbl = (t) => (t === "review" ? "reviews" : "resources");
    const run = (attr, fn) => $$(`[data-${attr}]`, el).forEach((b) => b.addEventListener("click", async () => { const [t, id] = b.dataset[attr].split(":"); try { await fn(t, id); VIEWS.reports(el); refreshBadges(); } catch (e) { toast(e.message, "error"); } }));
    run("hide", (t, id) => act(`Hid ${t}`, id, () => api.update(tbl(t), { id }, { status: "hidden" })).then(() => toast("Hidden", "info")));
    run("show", (t, id) => act(`Restored ${t}`, id, () => api.update(tbl(t), { id }, { status: "published" })).then(() => toast("Restored")));
    run("purge", async (t, id) => { if (!confirm("Remove this material for good? It is deleted for everyone and can't be restored.")) return; await act("Removed reported material", id, () => api.purgeResource(id)); await api.remove("reports", { target_type: t, target_id: id }).catch(() => {}); toast("Removed", "success"); });
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

  async users(el) {
    let q = el.dataset.q || "", role = el.dataset.role || "all";
    const rows = await api.rpc("admin_users", { q, lim: 500 });
    const pick = (r) => (u) => r === "all" || (r === "suspended" ? u.suspended : r === "unverified" ? u.role === "student" && !u.card_verified : u.role === r);
    const shown = rows.filter(pick(role)), count = (r) => rows.filter(pick(r)).length;
    el.innerHTML = `<div class="row nowrap"><form class="searchbar grow" id="uq">${icon("search")}<input class="input" name="q" type="search" value="${esc(q)}" placeholder="Search email or name"></form><button class="btn outline" id="u-csv">${icon("download")} CSV</button></div>
      ${!q ? userCharts(rows) : ""}
      <div class="seg mt-s">${[["all", "All"], ["student", "Students"], ["unverified", "Students not verified"], ["alumni", "Alumni"], ["faculty", "Faculty"], ["suspended", "Suspended"]].map(([v, l]) => `<button data-role="${v}" aria-selected="${role === v}">${l} (${count(v)})</button>`).join("")}</div>
      <section class="card mt tight">${shown.length ? shown.map((u) => `<div class="lrow"><span class="avatar sm">${esc((u.name || u.email).slice(0, 2).toUpperCase())}</span>
        <span class="body"><b>${esc(u.name || u.email)}</b><span>${esc(u.email)} · joined ${ago(u.created_at)} · ${u.last_sign_in_at ? `seen ${ago(u.last_sign_in_at)}` : "never signed in"}</span></span>
        ${u.role ? `<span class="pill">${esc(u.role)}</span>` : ""}${!u.confirmed ? '<span class="pill amber">Email not confirmed</span>' : ""}${u.role === "student" ? (u.card_verified ? `<span class="pill green">${icon("checkc", "sm")} ID verified</span>` : '<span class="pill">ID not verified</span>') : ""}${u.suspended ? '<span class="pill red">Suspended</span>' : ""}
        <button class="btn sm ghost" data-u="${esc(u.id)}" aria-label="Manage ${esc(u.email)}">${icon("morev")}</button></div>`).join("") : '<p class="small muted">No users match.</p>'}</section>`;
    $("#uq", el).addEventListener("submit", (e) => { e.preventDefault(); el.dataset.q = new FormData(e.target).get("q"); VIEWS.users(el); });
    $$("[data-role]", el).forEach((b) => b.addEventListener("click", () => { el.dataset.role = b.dataset.role; VIEWS.users(el); }));
    $("#u-csv", el).addEventListener("click", () => downloadCSV("users", shown, ["email", "name", "role", "created_at", "last_sign_in_at", "confirmed", "card_verified", "suspended"]));
    $$("[data-u]", el).forEach((b) => b.addEventListener("click", () => {
      const u = rows.find((x) => x.id === b.dataset.u);
      openModal(u.name || u.email, `<p class="small muted">${esc(u.email)} · ${esc(u.role || "no role")} · joined ${ago(u.created_at)}</p><div class="stack mt" style="gap:0">
        ${u.role === "student" ? `<button class="lrow" id="um-card"><span class="itile sm green">${icon("scan")}</span><span class="body"><b>${u.card_verified ? "ID card: verified" : "ID card: not verified"}</b><span>See the card photos, verify or remove the badge</span></span></button>` : ""}
        <button class="lrow" id="um-msg"><span class="itile sm purple">${icon("mail")}</span><span class="body"><b>Send a message</b><span>Shows in their app notifications</span></span></button>
        <button class="lrow" id="um-reset"><span class="itile sm blue">${icon("lock")}</span><span class="body"><b>Email a password reset code</b><span>They choose a new password in the app</span></span></button>
        <button class="lrow" id="um-out"><span class="itile sm orange">${icon("logout")}</span><span class="body"><b>Sign out on all devices</b><span>Ends every session (lost phone, shared PC)</span></span></button>
        <button class="lrow" id="um-sus"><span class="itile sm ${u.suspended ? "green" : "red"}">${icon(u.suspended ? "checkc" : "x")}</span><span class="body"><b>${u.suspended ? "Restore access" : "Suspend account"}</b><span>${u.suspended ? "They can sign in again" : "Blocks sign-in and signs them out"}</span></span></button></div>`, (m) => {
        $("#um-msg", m).addEventListener("click", () => { closeModal(); messageForm(u); });
        $("#um-card", m)?.addEventListener("click", async () => {
          const urls = await Promise.all(["front", "back"].map((side) => api.cardUrl(u.id, side).catch(() => "")));
          openModal(`ID card · ${u.email.split("@")[0]}`, `<div class="grid g2">${urls.map((x, i) => x ? `<figure style="margin:0"><img src="${esc(x)}" alt="" style="width:100%;border-radius:12px"><figcaption class="xs">${i ? "Back" : "Front"}</figcaption></figure>` : `<p class="small muted">No ${i ? "back" : "front"} photo uploaded.</p>`).join("")}</div>
            <p class="xs mt-s">Check that the student ID on the card is ${esc(u.email.split("@")[0])}. Photos are private; only admins who manage users can open them.</p>
            <div class="row mt"><span class="grow"></span>${u.card_verified ? `<button class="btn danger-soft" id="uc-off">${icon("x", "sm")} Remove badge</button>` : `<button class="btn primary" id="uc-on">${icon("check", "sm")} Mark verified</button>`}</div>`, (m2) => {
            const set = (on) => act(on ? "Verified student card" : "Removed card verification", u.email, () => api.rpc("admin_set_card_verified", { uid: u.id, verified: on })).then(() => { closeModal(); toast(on ? "Marked verified" : "Badge removed", "info"); VIEWS.users(el); }).catch((e) => toast(e.message, "error"));
            $("#uc-on", m2)?.addEventListener("click", () => set(true)); $("#uc-off", m2)?.addEventListener("click", () => set(false));
          });
        });
        $("#um-reset", m).addEventListener("click", async () => { try { await act("Sent password reset", u.email, () => api.sendReset(u.email)); closeModal(); toast("Reset code sent", "success", u.email); } catch (e) { toast(e.message, "error"); } });
        $("#um-out", m).addEventListener("click", async () => { try { const n = await act("Signed user out everywhere", u.email, () => api.rpc("admin_revoke_sessions", { uid: u.id })); closeModal(); toast(`Ended ${n || 0} session(s)`, "info"); } catch (e) { toast(e.message, "error"); } });
        $("#um-sus", m).addEventListener("click", () => { closeModal(); confirmAct(u.suspended ? "Restore this account?" : "Suspend this account?", u.suspended ? `${esc(u.email)} can sign in again.` : `${esc(u.email)} is signed out everywhere and can't sign in until you restore access.`, u.suspended ? "Restore" : "Suspend",
          async () => { await act(u.suspended ? "Restored user" : "Suspended user", u.email, () => api.rpc("admin_set_suspended", { uid: u.id, suspend: !u.suspended })); toast(u.suspended ? "Access restored" : "Account suspended", "info"); VIEWS.users(el); }); });
      });
    }));
  },

  async messages(el) {
    const rows = await api.list("user_messages", { limit: 100 });
    el.innerHTML = `<div class="row"><button class="btn primary" id="nm">${icon("plus")} New message</button><span class="grow"></span><span class="xs">Messages appear in each student's Notifications, on every device.</span></div>
      <section class="card mt tight">${rows.length ? rows.map((r) => `<div class="lrow"><span class="itile sm ${r.user_id ? "blue" : "purple"}">${icon(r.user_id ? "user" : "megaphone")}</span><span class="body"><b>${esc(r.title)}</b><span>${r.user_id ? "To one user" : "To everyone"} · ${ago(r.created_at)}${r.body ? ` · ${esc(r.body.slice(0, 80))}` : ""}</span></span><button class="btn sm ghost" data-md="${r.id}" aria-label="Delete">${icon("trash")}</button></div>`).join("") : '<p class="small muted">No messages sent yet.</p>'}</section>`;
    $("#nm", el).addEventListener("click", () => messageForm());
    $$("[data-md]", el).forEach((b) => b.addEventListener("click", () => confirmAct("Delete this message?", "It disappears from everyone's notifications.", "Delete", async () => { await act("Deleted message", b.dataset.md, () => api.remove("user_messages", { id: Number(b.dataset.md) || b.dataset.md })); VIEWS.messages(el); })));
  },

  async feedback(el) {
    const st = el.dataset.st || "new", rows = await api.list("feedback", { eq: st === "all" ? undefined : { status: st }, limit: 300 });
    el.innerHTML = `<div class="row"><div class="seg">${[["new", "New"], ["read", "Read"], ["replied", "Replied"], ["closed", "Closed"], ["all", "All"]].map(([v, l]) => `<button data-fs="${v}" aria-selected="${st === v}">${l}</button>`).join("")}</div><span class="grow"></span><button class="btn outline sm" id="f-csv">${icon("download")} CSV</button></div>
      <div class="adm-cards mt">${rows.length ? rows.map((f) => `<article class="card fx-rise"><div class="row"><span class="pill ${{ bug: "red", idea: "purple", question: "blue" }[f.kind] || ""}">${esc(f.kind)}</span><span class="pill">${esc(f.status)}</span><span class="grow"></span><span class="xs">${ago(f.created_at)}</span></div>
          <p class="mt-s">${esc(f.body)}</p><p class="xs mt-s">${esc(f.email)}${f.app_version ? ` · v${esc(f.app_version)}` : ""}</p>
          <div class="row mt"><a class="btn sm primary" data-rep="${f.id}" href="mailto:${esc(f.email)}?subject=${encodeURIComponent("Re: your EWUdiots feedback")}&body=${encodeURIComponent("\n\n> " + f.body.slice(0, 500))}">${icon("mail", "sm")} Reply</a>
          ${f.status !== "read" && f.status !== "replied" ? `<button class="btn sm" data-fset="${f.id}:read">Mark read</button>` : ""}${f.status !== "closed" ? `<button class="btn sm ghost" data-fset="${f.id}:closed">Close</button>` : ""}<button class="btn sm ghost" data-fdel="${f.id}" aria-label="Delete">${icon("trash")}</button></div></article>`).join("")
        : `<div class="card"><p class="small muted">Nothing ${st === "all" ? "yet" : "here"}. Students send feedback from Help → Send feedback in the app.</p></div>`}</div>`;
    $$("[data-fs]", el).forEach((b) => b.addEventListener("click", () => { el.dataset.st = b.dataset.fs; VIEWS.feedback(el); }));
    $("#f-csv", el).addEventListener("click", () => downloadCSV("feedback", rows, ["created_at", "kind", "status", "email", "app_version", "body"]));
    const setS = async (id, status) => { const f = rows.find((x) => String(x.id) === String(id)); await act(`Feedback ${status}`, f.email, () => api.update("feedback", { id: f.id }, { status })); VIEWS.feedback(el); refreshBadges(); };
    $$("[data-fset]", el).forEach((b) => b.addEventListener("click", () => { const [id, s] = b.dataset.fset.split(":"); setS(id, s).catch((e) => toast(e.message, "error")); }));
    $$("[data-rep]", el).forEach((b) => b.addEventListener("click", () => setS(b.dataset.rep, "replied").catch(() => {})));
    $$("[data-fdel]", el).forEach((b) => b.addEventListener("click", () => confirmAct("Delete this feedback?", "This can't be undone.", "Delete", async () => { const f = rows.find((x) => String(x.id) === b.dataset.fdel); await act("Deleted feedback", f.email, () => api.remove("feedback", { id: f.id })); VIEWS.feedback(el); refreshBadges(); })));
  },

  async security(el) {
    const [st, ev, users] = await Promise.all([api.rpc("admin_stats", { days: 7 }), api.rpc("admin_auth_events", { lim: 200 }), api.rpc("admin_users", { q: "", lim: 1000 })]);
    const since = Date.now() - 7 * 864e5, recent = ev.filter((e) => new Date(e.at) > since);
    const cnt = (re) => recent.filter((e) => re.test(e.action)).length;
    // Many password-reset or sign-up attempts from one address in a day can mean someone is probing accounts.
    const byIp = {}; ev.filter((e) => new Date(e.at) > Date.now() - 864e5 && /recovery|signup|otp|repeated/.test(e.action)).forEach((e) => { byIp[e.ip] = (byIp[e.ip] || 0) + 1; });
    const hot = Object.entries(byIp).filter(([ip, n]) => ip && n >= 5);
    const LABEL = { login: "Signed in", logout: "Signed out", user_signedup: "Created an account", user_recovery_requested: "Asked for a password reset", user_updated_password: "Changed password", token_refreshed: "Session refreshed", user_confirmation_requested: "Asked for a sign-up code", user_repeated_signup: "Tried to sign up again", user_deleted: "Deleted account", user_invited: "Was invited" };
    el.innerHTML = `<div class="kpis">${[["user", "green", cnt(/^login$/), "Sign-ins (7 days)"], ["plus", "purple", cnt(/signedup/), "New accounts (7 days)"], ["lock", "blue", cnt(/recovery|password/), "Password resets (7 days)"], ["x", "red", st.suspended, "Suspended"], ["zap", "orange", st.sessions, "Active sessions"]]
        .map(([i, t, n, l], k) => `<div class="kpi fx-rise" style="--i:${k}"><span class="itile ${t}">${icon(i)}</span><b>${n}</b><span>${l}</span></div>`).join("")}</div>
      ${hot.length ? `<div class="alert red mt">${icon("alert")}<div><b>Unusual activity</b><p>${hot.map(([ip, n]) => `${esc(ip)}: ${n} sign-up/reset attempts in 24 h`).join(" · ")}. Supabase rate limits already slow this down; suspend accounts in Users if needed.</p></div></div>` : `<div class="alert green mt">${icon("checkc")}<div><b>No unusual activity in the last 24 hours</b></div></div>`}
      <div class="split mt" style="align-items:start">
        <section class="card tight"><div class="card-h"><h2>Recent sign-in activity</h2><span class="xs">14 days · IPs masked</span></div>${ev.filter((e) => e.action !== "token_refreshed").slice(0, 40).map((e) => `<div class="lrow"><span class="itile sm ${/recovery|password/.test(e.action) ? "blue" : /signedup/.test(e.action) ? "purple" : /delete|repeated/.test(e.action) ? "red" : "green"}">${icon(/login/.test(e.action) ? "user" : /password|recovery/.test(e.action) ? "lock" : "clock")}</span><span class="body"><b>${esc(LABEL[e.action] || e.action)}</b><span>${esc(e.email)} · ${ago(e.at)}${e.ip ? ` · ${esc(e.ip)}` : ""}</span></span></div>`).join("") || '<p class="small muted">No activity yet.</p>'}</section>
        <section class="card tight"><div class="card-h"><h2>Suspended accounts</h2></div>${users.filter((u) => u.suspended).map((u) => `<div class="lrow"><span class="body"><b>${esc(u.email)}</b><span>${esc(u.role)}</span></span><button class="btn sm" data-restore="${esc(u.id)}">Restore</button></div>`).join("") || '<p class="small muted">None.</p>'}
          <div class="card soft mt"><b>How EWUdiots stays safe</b><ul class="small muted" style="margin:8px 0 0;padding-left:18px;line-height:1.7"><li>Every table has row-level security: students only reach their own data.</li><li>Admin tools check your admin role on the server, not just in this page.</li><li>New accounts must verify their email with a code; students also need both sides of their ID card.</li><li>Passwords need 8+ characters with letters and numbers; resets use one-time codes.</li><li>No secret keys are in the website or on GitHub.</li></ul></div></section></div>`;
    $$("[data-restore]", el).forEach((b) => b.addEventListener("click", async () => { try { await act("Restored user", b.dataset.restore, () => api.rpc("admin_set_suspended", { uid: b.dataset.restore, suspend: false })); VIEWS.security(el); } catch (e) { toast(e.message, "error"); } }));
  },

  async assistant(el) {
    const SUG = ["What needs my attention?", "How many students signed up this week?", "Find user 2024-1-60", "Show new feedback", "How do I post an announcement?", "Turn on maintenance mode", "Who are the admins?"];
    el.innerHTML = `<div class="ask-wrap" style="min-height:0"><div class="ask-log" id="aa-log">${aChat.length ? aChat.map(aBubble).join("") : `<div class="ask-hello"><span class="ask-orb" aria-hidden="true">${icon("brain")}</span><h2>Ask about your admin work</h2><p class="small muted">Counts, users, feedback, alumni, reports, and how to do anything here. Free and runs in this page.</p></div>`}</div>
      <div class="ask-sugg">${SUG.map((s) => `<button class="chip" data-as="${esc(s)}">${esc(s)}</button>`).join("")}</div>
      <form class="ask-bar" id="aa-f" style="position:static"><input class="input" id="aa-q" autocomplete="off" placeholder="Ask anything about the admin panel…" maxlength="200"><button class="btn primary icon-only" aria-label="Send">${icon("arrow")}</button></form></div>`;
    const ask = async (t) => { t = t.trim(); if (!t) return; aChat.push({ me: true, text: t }); aChat.push(await adminAnswer(t)); VIEWS.assistant(el); setTimeout(() => { $("#aa-q")?.focus(); const lg = $("#aa-log"); if (lg) lg.scrollTop = lg.scrollHeight; }, 20); };
    $("#aa-f", el).addEventListener("submit", (e) => { e.preventDefault(); ask($("#aa-q", el).value); });
    $$("[data-as]", el).forEach((b) => b.addEventListener("click", () => ask(b.dataset.as)));
    $$("[data-ago]", el).forEach((b) => b.addEventListener("click", () => go(b.dataset.ago)));
  },

  async activity(el) {
    const rows = await api.list("admin_log", { limit: 200 });
    el.innerHTML = `<section class="card tight">${rows.length ? rows.map(logRow).join("") : '<p class="small muted">No activity yet.</p>'}</section>`;
  }
};
// Website, media, feed, alumni import, analytics, jobs, history and roles live in cms.js.
const H = { $, $$, esc, icon, toast, openModal, closeModal, confirmAct, act, busy, sw, ago, downloadCSV, barChart, delta, refreshBadges, api: () => api, me: () => me, go: (t) => go(t), VIEWS };
Object.assign(VIEWS, cmsViews(H), clubViews(H));
const logRow = (l) => `<div class="lrow"><span class="itile sm purple">${icon("clock")}</span><span class="body"><b>${esc(l.action)}${l.target ? ` · ${esc(l.target)}` : ""}</b><span>${esc(l.email)} · ${ago(l.created_at)}</span></span></div>`;
const bindGo = (el) => $$("[data-go]", el).forEach((b) => b.addEventListener("click", () => go(b.dataset.go)));

/* Message to everyone, or to one user (from Users). Shows in their app notifications. */
function messageForm(to = null) {
  openModal(to ? `Message ${to.name || to.email}` : "Message everyone", `<form id="mf" class="stack">
    <label class="field">Title<input class="input" name="title" required minlength="2" maxlength="120" placeholder="${to ? "About your account" : "Advising opens Sunday"}"></label>
    <label class="field">Message<textarea class="input" name="body" rows="4" maxlength="2000"></textarea></label>
    <label class="field">Link (optional: app page like #/notices, or https://…)<input class="input" name="link" pattern="(#/.*|https://.+)?"></label>
    <div class="row"><span class="grow xs">${to ? esc(to.email) : "Every signed-in user sees it."}</span><button class="btn primary">${icon("mail")} Send</button></div></form>`, (m) => {
    $("#mf", m).addEventListener("submit", async (e) => { e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)), b = e.target.querySelector("button.primary"); busy(b, true);
      try { await act(to ? "Messaged user" : "Messaged everyone", to ? to.email : f.title, () => api.insert("user_messages", { user_id: to ? to.id : null, title: f.title.trim(), body: f.body.trim(), link: f.link.trim() })); closeModal(); toast("Message sent"); if (tab === "messages") redraw(); }
      catch (err) { busy(b, false); toast(err.message, "error"); } });
  });
}

/* Admin assistant: free, rule-based, answers from live admin data. */
const aChat = [];
const aBubble = (m) => m.me ? `<div class="msg me"><p>${esc(m.text)}</p></div>` : `<div class="msg bot"><span class="bot-av">${icon("brain", "sm")}</span><div class="grow min0"><p>${m.text}</p>${m.go ? `<div class="row ans-acts">${m.go.map(([t, l]) => `<button class="btn sm outline" data-ago="${t}">${esc(l)}</button>`).join("")}</div>` : ""}</div></div>`;
const HOWTO = [
  [/announce|post|news|notice/, "Go to <b>Posts &amp; announcements</b> → New post. Announcements show on the Notice Board, news posts lead Campus News. You can schedule a start and end time and pin it.", [["posts", "Posts"]]],
  [/banner/, "Open <b>Home banner</b>, write a short message, choose a colour and an optional button, then Publish.", [["banner", "Home banner"]]],
  [/maintenance|switch off|turn off|disable/, "Open <b>Features &amp; maintenance</b>. Turn on Maintenance mode to show everyone a maintenance screen, or switch single sections off.", [["features", "Features"]]],
  [/invite|add (an )?admin|new admin/, "Owners invite admins from <b>Admins</b> → Invite an admin. They become admin the first time they sign in here with that email.", [["admins", "Admins"]]],
  [/suspend|ban|block/, "Open <b>Users</b>, find the person, tap ⋮ → Suspend account. They're signed out everywhere until you restore access.", [["users", "Users"]]],
  [/password|reset/, "In <b>Users</b>, tap ⋮ → Email a password reset code. Students can also use Forgot password in the app themselves.", [["users", "Users"]]],
  [/message|notify|tell (all|every)/, "Use <b>Messages to users</b> to reach everyone, or Users → ⋮ → Send a message for one person.", [["messages", "Messages"]]],
  [/hide.*(faculty|teacher)|faculty/, "In <b>Faculty listings</b>, search the name → Edit → Hide this listing (or fix the room / initials).", [["faculty", "Faculty"]]],
  [/export|csv|download|backup/, "Users and Feedback have CSV buttons; Overview → Export everything downloads a full JSON backup.", [["overview", "Overview"]]],
  [/room|map/, "Add or import shared rooms in <b>Campus rooms</b>; they show as Verified on every student's map.", [["rooms", "Campus rooms"]]]
];
async function adminAnswer(t) {
  const q = t.toLowerCase();
  try {
    if (/attention|todo|to do|pending|waiting|what.*(do|now)|alert/.test(q)) {
      await refreshBadges(); const list = [[badges.alumni, "alumni profiles to review", "alumni"], [badges.reports, "reports to handle", "reports"], [badges.feedback, "new feedback messages", "feedback"]].filter((x) => x[0]);
      return { text: list.length ? `Waiting for you: ${list.map(([n, l]) => `<b>${n}</b> ${l}`).join(", ")}.` : "Nothing is waiting. All clear! ✨", go: list.map(([, l, to]) => [to, l.replace(/^\w/, (c) => c.toUpperCase())]) };
    }
    if (/sign.?ups?|joined|new (users|students|accounts)|how many (users|students|alumni|faculty|accounts)/.test(q)) {
      const days = /today/.test(q) ? 1 : /month|30/.test(q) ? 30 : 7, st = await api.rpc("admin_stats", { days: Math.max(7, days) });
      const n = st.signups.slice(-days).reduce((a, d) => a + d.n, 0);
      return { text: `<b>${n}</b> new account${n === 1 ? "" : "s"} ${days === 1 ? "today" : `in the last ${days} days`}. In total: <b>${st.users}</b> accounts (${st.students} students, ${st.alumni} alumni, ${st.faculty} faculty), ${st.active_7d} active this week.`, go: [["users", "Users"], ["overview", "Overview"]] };
    }
    const id = q.match(/\d{4}-\d(-\d{2}(-\d{3})?)?|[\w.+-]+@[\w.-]+/);
    if (/find|search|look ?up|user|student/.test(q) && id) {
      const rows = await api.rpc("admin_users", { q: id[0], lim: 10 });
      return { text: rows.length ? rows.map((u) => `<b>${esc(u.email)}</b> · ${esc(u.role || "no role")} · ${u.suspended ? "suspended" : u.last_sign_in_at ? `seen ${ago(u.last_sign_in_at)}` : "never signed in"}`).join("<br>") : `No user matches ${esc(id[0])}.`, go: [["users", "Open Users"]] };
    }
    if (/feedback|complain|suggest/.test(q)) { const rows = await api.list("feedback", { eq: { status: "new" }, limit: 5 }); return { text: rows.length ? `${rows.length} new: ${rows.map((f) => `“${esc(f.body.slice(0, 70))}”`).join(" · ")}` : "No new feedback.", go: [["feedback", "Feedback inbox"]] }; }
    if (/alumni/.test(q)) { const n = await api.count("alumni_profiles", { status: "pending" }); return { text: `<b>${n}</b> alumni profile${n === 1 ? "" : "s"} waiting for review.`, go: [["alumni", "Alumni profiles"]] }; }
    if (/report/.test(q)) { const n = await api.count("reports"); return { text: `<b>${n}</b> open report${n === 1 ? "" : "s"}.`, go: [["reports", "Reports"]] }; }
    if (/admins?\b/.test(q) && /who|list|show/.test(q)) { const rows = await api.list("admins"); return { text: rows.map((a) => `${esc(a.email)} (${esc(a.role)})`).join("<br>"), go: [["admins", "Admins"]] }; }
    if (/(turn on|enable|start).*maintenance/.test(q)) return { text: "Open Features &amp; maintenance and switch on Maintenance mode. Students see your message until you switch it off.", go: [["features", "Features & maintenance"]] };
    for (const [re, text, g] of HOWTO) if (re.test(q)) return { text, go: g };
    const s = SECTIONS.find(([, l]) => q.includes(l.toLowerCase().split(" ")[0]));
    if (s) return { text: `That's in <b>${esc(s[1])}</b>.`, go: [[s[0], s[1]]] };
  } catch (e) { return { text: `I couldn't check that: ${esc(e.message)}` }; }
  return { text: "I can tell you what needs attention, count sign-ups, find a user by email or student ID, show new feedback, and explain how to do anything in this panel." };
}
async function postForm(p = {}) {
  const local = (d) => (d ? new Date(new Date(d) - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 16) : "");
  openModal(p.id ? "Edit post" : "New post", `<form id="pf" class="grid g2">
    <label class="field">Type<select class="select" name="kind">${[["announcement", "Announcement (Notice Board)"], ["news", "News (Campus News)"], ["event", "Event"]].map(([v, l]) => `<option value="${v}" ${p.kind === v ? "selected" : ""}>${l}</option>`).join("")}</select></label>
    <label class="field">Tag<input class="input" name="tag" maxlength="30" value="${esc(p.tag || "")}" placeholder="Advising, Exams…"></label>
    <label class="field full-row">Title<input class="input" name="title" required minlength="3" maxlength="200" value="${esc(p.title || "")}"></label>
    <label class="field full-row">Text<textarea class="input" name="body" rows="5" maxlength="8000">${esc(p.body || "")}</textarea></label>
    <div class="row nowrap"><label class="field grow">Image URL (https)<input class="input" name="image_url" id="pf-img" type="url" pattern="https://.+" value="${esc(p.image_url || "")}"></label><button type="button" class="btn outline" id="pf-pick" style="align-self:flex-end">${icon("image", "sm")} Library</button></div>
    <label class="field">Link (https)<input class="input" name="link" type="url" pattern="https://.+" value="${esc(p.link || "")}"></label>
    <label class="field">Show from<input class="input" name="starts_at" type="datetime-local" value="${local(p.starts_at) || local(new Date())}"></label>
    <label class="field">Hide after (optional)<input class="input" name="ends_at" type="datetime-local" value="${local(p.ends_at)}"></label>
    <div class="full-row stack" style="gap:0">${sw("pf-pub", p.published !== false, "Published (students can see it)")}${sw("pf-pin", p.pinned, "Pin to the top")}</div>
    <div class="row full-row"><span class="grow"></span><button type="button" class="btn neutral" data-close>Cancel</button><button class="btn primary">${icon("check")} ${p.id ? "Save" : "Publish"}</button></div></form>`, (m) => {
    $("#pf-pick", m).addEventListener("click", async () => { const keep = Object.fromEntries(new FormData($("#pf", m))); const u = await H.pickMedia(); postForm({ ...p, ...keep, published: p.published, pinned: p.pinned, image_url: u || keep.image_url }); });
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

startDropdowns();
/* "Upload photo" next to every image field (banner, events, posts, alumni, …): pick a photo from the phone or computer,
   it goes to the media library (public "media" bucket) and its address fills the field. */
function photoButtons(scope = document) {
  $$('input[name="image"], input[name="image_url"], input[name="photo"], input[name="photo_url"], input[name="cover"], input[name="cover_url"], input[data-photo]', scope).forEach((inp) => {
    if (inp.dataset.up) return; inp.dataset.up = "1";
    const b = document.createElement("button"); b.type = "button"; b.className = "btn outline up-photo"; b.innerHTML = `${icon("upload", "sm")} Upload photo`;
    const file = Object.assign(document.createElement("input"), { type: "file", accept: "image/*", hidden: true });
    const wrap = inp.closest("label") || inp; wrap.after(b, file);
    b.addEventListener("click", () => file.click());
    file.addEventListener("change", async () => {
      const f = file.files[0]; if (!f) return;
      if (!/^image\//.test(f.type)) return toast("Choose an image file", "error");
      if (f.size > 8 * 1048576) return toast("That photo is over 8 MB", "error");
      busy(b, true, "Uploading…");
      try {
        const url = await api.upload(`uploads/${new Date().toISOString().slice(0, 7)}/${crypto.randomUUID()}-${f.name.replace(/[^\w.-]+/g, "_").slice(-60)}`, f);
        inp.value = url; inp.dispatchEvent(new Event("input", { bubbles: true })); inp.dispatchEvent(new Event("change", { bubbles: true }));
        toast("Photo uploaded", "success");
      } catch (e) { toast("Upload failed", "error", e.message); }
      busy(b, false); file.value = "";
    });
  });
}
new MutationObserver(() => photoButtons()).observe(document.body, { childList: true, subtree: true });
/* ── boot ── */
(async () => {
  // Demo sandbox for the end-to-end tests only (vite --mode test); production builds drop it.
  if (import.meta.env.MODE === "test" && location.hash === "#demo") { api = demoBackend(); return start(); }
  if (cloud.enabled) { const u = await cloud.currentUser(); if (u) return checkAdmin(u); }
  signIn();
})();
