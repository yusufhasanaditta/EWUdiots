/* EWUdiots — EWU student hub. Hash-routed vanilla JS; local-first state with optional Supabase sync.
   This file holds state, shared helpers, the app shell and the router. Screens live in ui-*.js and study.js. */
import "./styles.css";
import "./campus.css";
import "./fx.css";
import "./mobile.css";
import { parsePortalText, mergeParsed, offeredToPlanner, currentSemester, normSemester, semesterKey } from "./parser.js";
import { GRADES, NON_GPA, DAY_NAMES, WEEK, SLOTS, DEMO } from "./data.js";
import * as cloud from "./cloud.js";
import * as native from "./native.js";
import { icon } from "./icons.js";
import { clearBlobs } from "./blobstore.js";
import { install as installStudy, studyDefaults } from "./study.js";
import { install as installHome } from "./ui-home.js";
import { install as installSync } from "./ui-sync.js";
import { install as installAcademic } from "./ui-academic.js";
import { install as installCampus } from "./ui-campus.js";
import { install as installMap } from "./ui-map.js";
import { install as installIdCard } from "./ui-idcard.js";
import { install as installNotices } from "./ui-notices.js";
import { install as installCommunity } from "./ui-community.js";
import { install as installAlarms } from "./ui-alarms.js";
import { install as installAsk } from "./ui-ask.js";
import { install as installPeople } from "./ui-people.js";
import { install as installEvents } from "./ui-events.js";
import { createContent, FEATURES } from "./content.js";
import { applyBrand } from "./theme.js";

const APP_VERSION = __APP_VERSION__; // from package.json (vite.config.js)
const SITE = import.meta.env.VITE_SITE_URL || "https://ewudiots.vercel.app";
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const uid = () => Math.random().toString(36).slice(2, 10);

/* ───────────── State ───────────── */
const KEY = "ewudiots.v2";
const blank = () => ({
  profile: null, routine: [], routineSem: "", grades: [], tasks: [], attendance: {}, marks: {},
  faculty: {}, payments: { schedule: [], fees: {} }, degree: [], rules: {}, recommended: [],
  planner: { courses: [], pins: {}, offered: null, offeredSem: "", filters: { noEarly: false, hideFull: true, daysOff: [] }, saved: [] },
  localReviews: {}, theme: "auto", cover: {}, settings: { remindMin: 10, notify: false, alarms: { on: true, offsets: [10], perCourse: {}, ring: true } }, demo: false, lastSync: null, updatedAt: 0,
  role: "student", onboarded: false, bookmarks: { rooms: [], files: [] }, paid: {}, plans: { whatif: [], marks: {} }, log: [], read: {},
  campus: { rooms: [], from: "E1" }, idcard: null,
  study: studyDefaults()
});
let S;
try { S = Object.assign(blank(), JSON.parse(localStorage.getItem(KEY) || "{}")); } catch { S = blank(); }
S.study = Object.assign(studyDefaults(), S.study || {});
// Class alarms: a default list of "minutes before" for every class, optional per-course lists (older saves had one remindMin).
const alarmDefaults = (st) => Object.assign({ on: true, offsets: [st.remindMin || 10], perCourse: {}, ring: true }, st.alarms || {});
S.settings.alarms = alarmDefaults(S.settings);
if (S.profile && !S.onboarded) S.onboarded = true; // existing users skip the welcome flow
let pushTimer = null;
function save({ silent = false } = {}) {
  S.updatedAt = Date.now(); facCache = null;
  try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { /* storage full or blocked */ }
  if (C.user && !silent) { clearTimeout(pushTimer); pushTimer = setTimeout(pushNow, 1500); }
  scheduleReminders();
}
// updatedAt stays 0, so a cloud backup always wins over a cleared device.
const resetState = () => { const th = S.theme; S = blank(); S.theme = th; try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { /* storage blocked */ } clearBlobs("id:"); idcard?.forget(); };
const C = { user: null, faculty: null, sections: null, vault: null, votes: new Set(), syncing: false, directory: null };
/* Official faculty directory, from EWU's public profile pages (scripts/scrape-faculty.mjs). Loaded on first use. */
let dirP = null;
const loadDirectory = () => (dirP = dirP || fetch("/data/faculty.json").then((r) => (r.ok ? r.json() : { faculty: [] })).catch(() => ({ faculty: [] }))
  .then((j) => { C.directory = j.faculty || []; facCache = null; if (["faculty", "prof", "home"].includes(currentRoute)) rerender(); }));
// A faculty photo that fails to load falls back to the initials underneath it.
addEventListener("error", (e) => { const t = e.target; if (t.tagName === "IMG" && t.closest(".face")) t.remove(); }, true);
let study = null; // study-mode API, installed at boot (src/study.js)
let campus = null, idcard = null, notices = null, community = null, people = null, events = null;
const content = createContent(cloud); // admin-managed posts, settings, overrides // campus map + ID card APIs (src/ui-map.js, src/ui-idcard.js)
async function pushNow() {
  if (!C.user) return false;
  try { C.syncing = true; const { theme, syncedAt, ...data } = S; const at = await cloud.pushData(C.user.id, data); S.lastSync = at; S.syncedAt = new Date(at).getTime(); localStorage.setItem(KEY, JSON.stringify(S)); return true; }
  catch (e) { console.warn("Backup failed", e); return false; } finally { C.syncing = false; }
}
/* One account everywhere (phone app, web, Windows, Chrome): when another device saved a newer backup than the
   one this device last saw, and nothing newer changed here, take it. Runs on focus and every minute. */
let pulling = false;
async function pullNow() {
  if (!C.user || C.syncing || pulling || Date.now() - (S.updatedAt || 0) < 3000) return; // a backup is about to go out
  pulling = true;
  try {
    const remote = await cloud.pullData(C.user.id);
    const at = remote ? new Date(remote.updated_at).getTime() : 0;
    if (!remote?.data?.profile || at <= (S.syncedAt || 0)) return;
    if ((S.updatedAt || 0) > at) { await pushNow(); return; } // this device has the newer edits
    adopt(remote.data, at);
    if (!modalOpen()) rerender();
    toast("Updated from your other device", "info");
  } catch (e) { console.warn("Cloud check failed", e); }
  finally { pulling = false; }
}
function adopt(data, at) {
  const theme = S.theme;
  S = Object.assign(blank(), data, { theme, syncedAt: at, lastSync: new Date(at).toISOString() });
  S.study = Object.assign(studyDefaults(), S.study || {}); S.settings.alarms = alarmDefaults(S.settings || {});
  facCache = null; idcard?.forget();
  try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { /* storage blocked */ }
}
/* Activity log shown in Notifications (sync results, badges…). */
function logEvent(cat, ic, tone, title, body, href = "") {
  S.log.unshift({ id: uid(), cat, icon: ic, tone, title, body, href, at: new Date().toISOString() });
  S.log = S.log.slice(0, 40);
}

/* ───────────── Time + grade helpers ───────────── */
const LETTER = { S: 0, M: 1, T: 2, W: 3, R: 4, F: 5, A: 6 };
const toMin = (t) => { const [h, m] = String(t).split(":").map(Number); return h * 60 + m; };
const fmt12 = (t) => { const m = typeof t === "number" ? t : toMin(t); let h = Math.floor(m / 60); const mm = m % 60, ap = h >= 12 ? "PM" : "AM"; h = h % 12 || 12; return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")} ${ap}`; };
const fmtShort = (t) => { const m = typeof t === "number" ? t : toMin(t); let h = Math.floor(m / 60); const mm = m % 60; h = h % 12 || 12; return `${h}:${String(mm).padStart(2, "0")}`; };
const dayIdx = (letters) => [...String(letters).toUpperCase()].map((c) => LETTER[c]).filter((x) => x !== undefined);
const expand = (list) => list.flatMap((c) => dayIdx(c.days).map((d) => ({ ...c, day: d, s: toMin(c.start), e: toMin(c.end) })));
const overlaps = (a, b) => a.day === b.day && a.s < b.e && b.s < a.e;
const TONES = ["purple", "green", "blue", "orange", "pink", "teal", "yellow"];
const HEX = { purple: "#7c3aed", green: "#22c55e", blue: "#3b82f6", orange: "#f97316", pink: "#ec4899", teal: "#06b6d4", yellow: "#eab308" };
function toneFor(code) {
  const mine = [...new Set(S.routine.map((r) => r.code))].indexOf(code);
  if (mine >= 0) return TONES[mine % TONES.length];
  let h = 0; for (const ch of String(code)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return TONES[h % TONES.length];
}
const colorFor = (code) => HEX[toneFor(code)];
const gradePoint = (g) => (GRADES.find((x) => x.g === g) || { p: 0 }).p;
function cgpaOf(grades) {
  const latest = {};
  grades.slice().sort((a, b) => semesterKey(a.sem) - semesterKey(b.sem)).forEach((r) => { latest[r.code] = r; });
  const rows = Object.values(latest).filter((r) => r.g && !NON_GPA.has(r.g) && Number(r.cr) > 0);
  const cr = rows.reduce((a, r) => a + Number(r.cr), 0);
  const pts = rows.reduce((a, r) => a + Number(r.cr) * gradePoint(r.g), 0);
  const earned = Object.values(latest).filter((r) => r.g && r.g !== "F" && !["U", "I", "W"].includes(r.g)).reduce((a, r) => a + Number(r.cr), 0);
  return { cgpa: cr ? pts / cr : 0, credits: cr, points: pts, earned };
}
const fmtMoney = (n) => "৳" + Number(n || 0).toLocaleString("en-IN");
const fmtCountdown = (m) => m < 60 ? `${m} min` : m < 1440 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${Math.floor(m / 1440)}d ${Math.floor((m % 1440) / 60)}h`;
const daysUntil = (iso) => Math.ceil((new Date(iso + (iso.length === 10 ? "T23:59:59" : "")) - Date.now()) / 864e5);
const fmtDate = (d, o = { day: "numeric", month: "short", year: "numeric" }) => new Date(d).toLocaleDateString("en-GB", o);
const firstName = () => { const n = S.profile?.name || ""; return n.split(" ").find((w) => w && !/^(md|mohammad|mohammed|muhammad|dr)\.?$/i.test(w)) || n.split(" ")[0] || "there"; };
// Your own avatar: the photo you added on Profile, otherwise your initials.
const myAvatar = (cls = "", tag = "span", attrs = "") => { const p = S.profile || {}; return `<${tag} class="avatar ${cls}" ${attrs}>${p.photo && /^data:image\/(jpeg|png|webp);base64,/.test(p.photo) ? `<img src="${p.photo}" alt="">` : esc(initials(p.name || "EWU Student"))}</${tag}>`; };
const initials = (n) => String(n || "?").split(/\s+/).filter((w) => w && !/^(md|dr|mr|ms)\.?$/i.test(w)).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";
const greeting = () => { const h = new Date().getHours(); return h < 12 ? "Good Morning" : h < 17 ? "Good Afternoon" : h < 21 ? "Good Evening" : "Good Night"; };
const nextSemesterGuess = () => { const [t, y] = currentSemester().split("-"); return t === "Spring" ? `Summer-${y}` : t === "Summer" ? `Fall-${y}` : `Spring-${Number(y) + 1}`; };

/* ───────────── UI helpers ───────────── */
const TOAST_IC = { success: "check", error: "x", warn: "alert", info: "info" };
function toast(title, type = "success", body = "") {
  const t = document.createElement("div"); t.className = `toast ${type}`; t.setAttribute("role", type === "error" ? "alert" : "status");
  t.innerHTML = `<span class="t-ic">${icon(TOAST_IC[type] || "info")}</span><div class="grow min0"><b>${esc(title)}</b>${body ? `<p>${esc(body)}</p>` : ""}</div><button class="t-x" aria-label="Dismiss">${icon("x", "sm")}</button>`;
  t.querySelector(".t-x").addEventListener("click", () => t.remove());
  $("#toasts").appendChild(t); setTimeout(() => t.remove(), type === "error" ? 5200 : 3600);
}
let lastFocus = null;
function openModal(html, onMount, { center = false } = {}) {
  lastFocus = document.activeElement;
  const m = $("#modal"); m.className = `modal${center ? " center-modal" : ""}`;
  m.innerHTML = `<div class="grabber" aria-hidden="true"></div>${html}`; $("#scrim").classList.add("open");
  const first = m.querySelector("input:not([type=checkbox]), select, textarea, button:not([data-close])") || m.querySelector("button");
  first && first.focus({ preventScroll: true });
  onMount && onMount(m);
}
function closeModal() { if (C.update?.required && native.isNative && $("#modal .upd-sheet")) return; // a required update stays on screen
  $("#scrim").classList.remove("open"); $("#modal").innerHTML = ""; lastFocus && lastFocus.focus && lastFocus.focus({ preventScroll: true }); }
const modalOpen = () => $("#scrim").classList.contains("open");
$("#scrim").addEventListener("click", (e) => { if (e.target.id === "scrim" || e.target.closest("[data-close]")) closeModal(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && modalOpen()) closeModal(); });
const modalHead = (title) => `<div class="modal-head"><h2 id="modal-title">${esc(title)}</h2><button class="btn icon-only ghost" data-close aria-label="Close">${icon("x")}</button></div>`;
/* Centered confirmation, as on the "Confirmation & Delete Flows" board. */
const confirmModal = (title, body, cta, fn, danger = false, ic = danger ? "trash" : "help") => openModal(
  `<div class="confirm-ic ${danger ? "itile red" : "itile purple"}">${icon(ic)}</div><h2 id="modal-title" style="font-size:20px">${esc(title)}</h2><p class="muted" style="margin:8px 0 18px">${body}</p>
   <div class="stack" style="gap:8px"><button class="btn ${danger ? "danger" : "primary"} block" id="cf-go">${cta}</button><button class="btn neutral block" data-close>Cancel</button></div>`,
  (m) => $("#cf-go", m).addEventListener("click", async () => { const b = $("#cf-go", m); busy(b, true); try { await fn(); closeModal(); } catch (e) { toast(e.message, "error"); busy(b, false); } }), { center: true });
const busy = (btn, on, label) => { if (!btn) return; btn.disabled = on; if (on) { btn.dataset.label = btn.innerHTML; btn.innerHTML = `<span class="spinner" aria-hidden="true"></span> ${label || "Working…"}`; } else if (btn.dataset.label) btn.innerHTML = btn.dataset.label; };
const swoosh = `<svg class="swoosh" viewBox="0 0 90 14" aria-hidden="true"><path d="M3 9c20-6 50-8 84-4M14 12c18-3 38-4 60-2" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>`;
const art = (img, text) => `<div class="ph-art" aria-hidden="true">${text ? `<span class="scribble">${text}${swoosh}</span>` : ""}<img src="/img/${img}.webp" alt="" width="92" height="92"></div>`;
const head = (title, sub = "", actions = "", artHtml = "") => `<div class="page-head"><div class="min0"><h1>${title}</h1>${sub ? `<p class="sub">${sub}</p>` : ""}</div>${artHtml}${actions ? `<div class="actions">${actions}</div>` : ""}</div>`;
const subHead = (title, sub = "", back = "#/home", action = "") => `<div class="sub-head"><a class="icon-btn" href="${back}" aria-label="Back">${icon("chevL")}</a><div class="min0"><h1>${title}</h1>${sub ? `<span class="xs">${sub}</span>` : ""}</div><div>${action}</div></div>`;
const seg = (items, cur, attr = "data-tab", cls = "") => `<div class="seg ${cls}" role="tablist">${items.map(([v, l]) => `<button role="tab" ${attr}="${esc(v)}" aria-selected="${v === cur}">${l}</button>`).join("")}</div>`;
const empty = (img, title, text, btn = "") => `<div class="empty">${img.startsWith("icon:") ? `<span class="ill">${icon(img.slice(5))}</span>` : `<img src="/img/${img}.webp" alt="" width="150">`}<h3>${title}</h3><p>${text}</p>${btn}</div>`;
const demoBanner = () => S.demo ? `<div class="alert purple" style="margin-bottom:14px"><span class="a-ic">${icon("sparkle")}</span><div class="grow"><b>You're exploring demo data</b><p><a href="#/sync">Sync your real portal</a> to replace it.</p></div></div>` : "";
const bar = (pct, cls = "") => `<div class="bar ${cls}" role="progressbar" aria-valuenow="${Math.round(pct)}" aria-valuemin="0" aria-valuemax="100"><span style="width:${Math.max(0, Math.min(100, pct))}%"></span></div>`;

/* Numbers that count up when a stats row appears. */
function countUp(root) {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  root.querySelectorAll(".count[data-to]").forEach((el) => {
    const to = Number(el.dataset.to); if (!to) return;
    const t0 = performance.now(), dur = 900;
    const step = (t) => { const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3); el.textContent = Math.round(to * e).toLocaleString("en-US"); if (k < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  });
}

/* ───────────── Theme ───────────── */
const isDark = () => S.theme === "dark" || (S.theme === "auto" && matchMedia("(prefers-color-scheme: dark)").matches);
function applyTheme() {
  const root = document.documentElement;
  if (S.theme === "auto") root.removeAttribute("data-theme"); else root.setAttribute("data-theme", S.theme);
  const brand = applyBrand(content.data.settings.theme);
  $('meta[name="theme-color"]').setAttribute("content", isDark() ? "#0b0f1e" : brand);
}

/* ───────────── Navigation (role-aware) ───────────── */
const NAV = [
  { id: "home", label: "Home", icon: "home", roles: "sfa" },
  { id: "ask", label: "Ask EWUdiots", icon: "sparkle", roles: "sfa" },
  { id: "routine", label: "Routine", icon: "calendar", roles: "s" },
  { id: "planner", label: "Advising Planner", icon: "calcheck", roles: "s" },
  { id: "courses", label: "Courses", icon: "book", roles: "s" },
  { id: "grades", label: "CGPA", icon: "grid", roles: "s" },
  { id: "tasks", label: "Deadlines", icon: "clipboard", roles: "s" },
  { id: "fees", label: "Fees", icon: "wallet", roles: "s" },
  { id: "vault", label: "Study Vault", icon: "vault", roles: "sfa", feature: "vault" },
  { id: "notices", label: "Notice Board", icon: "megaphone", roles: "sfa", feature: "notices" },
  { id: "news", label: "Campus News", icon: "globe", roles: "sfa", feature: "news" },
  { id: "alumni", label: "Alumni", icon: "community", roles: "sfa", feature: "alumni" },
  { id: "teach", label: "Teaching hub", icon: "briefcase", roles: "f" },
  { id: "alumhub", label: "Alumni hub", icon: "cap", roles: "a" },
  { id: "office", label: "Office hours", icon: "clock", roles: "s" },
  { id: "mentors", label: "Alumni mentors", icon: "heart", roles: "s" },
  { id: "events", label: "Events", icon: "calendar", roles: "sfa" },
  { id: "jobs", label: "Jobs & internships", icon: "briefcase", roles: "sfa" },
  { id: "blog", label: "Blog", icon: "notes", roles: "sfa" },
  { id: "map", label: "Campus Map", icon: "map", roles: "sfa", feature: "map" },
  { id: "rooms", label: "Free Rooms", icon: "door", roles: "sfa" },
  { id: "faculty", label: "Faculty", icon: "users", roles: "fa" },
  { id: "focus", label: "Focus", icon: "focus", roles: "sf", feature: "focus" },
  { id: "me", label: "Achievements", icon: "award", roles: "sf" },
  { id: "more", label: "More", icon: "more", roles: "sfa" }
];
const roleKey = () => ({ faculty: "f", alumni: "a" }[S.role] || "s");
const navFor = () => NAV.filter((n) => n.roles.includes(roleKey()) && (!n.feature || content.feature(n.feature)));
// Pages an admin switched off (Settings → Features) are closed for everyone.
const PAGE_FEATURE = { notices: "notices", news: "news", alumni: "alumni", map: "map", vault: "vault", file: "vault", idcard: "idcard", focus: "focus", cards: "focus", exams: "focus" };
const SUB = { course: "courses", marks: "courses", degree: "grades", whatif: "grades", plan: "planner", combos: "planner", fee: "fees", prof: "faculty", file: "vault", cards: "focus", exams: "tasks", account: "more", profile: "more", notifications: "home", help: "more", about: "more", cover: "more", sync: "more", idcard: "more", alarms: "routine", ask: "ask", post: "blog", write: "blog" };
const prefersReduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
function renderNav(route) {
  const active = SUB[route] || route;
  const dueSoon = S.tasks.filter((t) => !t.done && new Date(t.due) - Date.now() < 3 * 864e5 && new Date(t.due) > Date.now()).length;
  $("#side-nav").innerHTML = navFor().map((n) => `<a href="#/${n.id}" ${active === n.id ? 'aria-current="page"' : ""}>${icon(n.icon)}<span>${n.label}</span>${n.id === "tasks" && dueSoon ? `<span class="badge-n">${dueSoon}</span>` : ""}${n.id === "notices" && notices?.unseenCount() ? `<span class="badge-n">${notices.unseenCount()}</span>` : ""}</a>`).join("");
  const p = S.profile;
  $("#side-user").innerHTML = `${myAvatar("sm")}<div class="grow min0"><b class="ellipsis">${esc(p?.name || "Set up profile")}</b><span class="ellipsis" style="display:block">${esc(p ? (p.program || p.department || roleLabel()) : "Tap to start")}</span></div>${icon("chevR", "sm")}`;
  const B = S.role === "student" ? [["home", "home", "Home"], ["routine", "calendar", "Routine"], ["fab"], ["grades", "bars", "CGPA"], ["more", "grid", "More"]]
    : S.role === "faculty" ? [["home", "home", "Home"], ["teach", "briefcase", "Teaching"], ["fab"], ["blog", "notes", "Blog"], ["more", "grid", "More"]]
    : [["home", "home", "Home"], ["alumhub", "cap", "Hub"], ["fab"], ["jobs", "briefcase", "Jobs"], ["more", "grid", "More"]];
  $("#bottom-nav").innerHTML = B.map(([id, ic, l]) => id === "fab"
    ? `<button class="fab" id="fab" type="button" aria-label="Quick add"><span class="fab-btn">${icon("plus")}</span></button>`
    : `<a href="#/${id}" ${active === id || (id === "more" && !B.some((b) => b[0] === active)) ? 'aria-current="page"' : ""}>${icon(ic)}<span>${l}</span></a>`).join("");
  $("#fab").addEventListener("click", quickAdd);
  const unread = inbox().filter((n) => !S.read[n.id]).length;
  $("#top-bell").innerHTML = `${icon("bell")}${unread ? `<span class="dot-n">${unread > 9 ? "9+" : unread}</span>` : ""}`;
  $("#top-bell").setAttribute("aria-label", `Notifications${unread ? `, ${unread} unread` : ""}`);
}
const roleLabel = () => ({ student: "Student", faculty: "Faculty member", alumni: "Alumni" }[S.role] || "Student");
function quickAdd() {
  const items = (S.role === "student" ? [
    ["clipboard", "orange", "Add deadline", "Assignment, quiz, lab or exam", () => go("#/tasks?add=1")],
    ["calendar", "purple", "Add a class", "Put a class on your routine", () => go("#/routine?add=1")],
    ["bell", "pink", "Class alarms", "Get warned 30 min, 1 hour… before class", () => go("#/alarms")],
    ["focus", "pink", "Start focus", "25-minute Pomodoro session", () => study.focusOn()],
    ["cards", "blue", "Add flashcards", "Create cards for a course", () => go("#/cards?add=1")],
    ["exam", "green", "Add an exam", "Get a revision plan", () => go("#/exams?add=1")],
    ["sync", "teal", "Sync portal", "Screenshot, paste or extension", () => go("#/sync")],
    ["edit", "purple", "Write a blog post", "Share a tip with other students", () => go("#/write")]
  ] : [
    ["edit", "purple", "Write a blog post", "Tips, experiences, advice", () => go("#/write")],
    ["briefcase", "blue", "Post a job or internship", "Help students get hired", () => go("#/jobs")],
    ["door", "green", "Find a free room", "Empty classrooms right now", () => go("#/rooms")],
    ["upload", "purple", "Share material", "Upload notes to the vault", () => go("#/vault?up=1")],
    ["focus", "pink", "Start focus", "25-minute Pomodoro session", () => study.focusOn()]
  ]);
  openModal(modalHead("Quick add") + `<div class="stack" style="gap:0">${items.map(([ic, tone, t, d], i) => `<button class="lrow" data-qa="${i}"><span class="itile ${tone}">${icon(ic)}</span><span class="body"><b>${t}</b><span>${d}</span></span>${icon("chevR", "chev")}</button>`).join("")}</div>`,
    (m) => $$("[data-qa]", m).forEach((b) => b.addEventListener("click", () => { closeModal(); items[Number(b.dataset.qa)][4](); })));
}
const go = (hash) => { if (location.hash === hash) route(); else location.hash = hash; };

/* ───────────── Notifications (derived from your data + activity log) ───────────── */
function inbox() {
  const out = [], now = Date.now();
  S.tasks.filter((t) => !t.done).forEach((t) => {
    const h = (new Date(t.due) - now) / 36e5;
    if (h > -48 && h < 72) out.push({ id: `t${t.id}${h < 24 ? "a" : "b"}`, cat: "Academic", icon: t.type === "Exam" ? "exam" : "clipboard", tone: h < 0 ? "red" : h < 24 ? "orange" : "purple",
      title: h < 0 ? `Overdue: ${t.title}` : h < 24 ? `${t.type} due today` : `${t.type} due in ${Math.ceil(h / 24)} days`, body: `${t.title}${t.course ? " · " + t.course : ""}`, at: new Date(Math.min(now, new Date(t.due) - 3 * 864e5)).toISOString(), href: "#/tasks" });
  });
  const p = nextPayment();
  if (p && daysUntil(p.due) <= 7) out.push({ id: `p${p.due}`, cat: "System", icon: "wallet", tone: daysUntil(p.due) <= 3 ? "red" : "orange", title: "Payment reminder", body: `${fmtMoney(p.amount)} due ${daysUntil(p.due) === 0 ? "today" : `in ${daysUntil(p.due)} days`} (${fmtDate(p.due)})${p.late ? "" : ". Late fee after that"}.`, at: new Date(new Date(p.due) - 7 * 864e5).toISOString(), href: "#/fees" });
  Object.entries(S.attendance).forEach(([c, a]) => { if (a.held >= 4 && (a.held - a.missed) / a.held < 0.7) out.push({ id: `a${c}${a.held}`, cat: "Academic", icon: "alert", tone: "red", title: "You're below 70% attendance", body: `${c}: ${Math.round((100 * (a.held - a.missed)) / a.held)}%. Attend upcoming classes to stay eligible.`, at: new Date().toISOString(), href: `#/course?c=${encodeURIComponent(c)}&tab=attendance` }); });
  const due = study ? study.dueCards().length : 0;
  if (due) out.push({ id: `c${new Date().toDateString()}`, cat: "Academic", icon: "cards", tone: "blue", title: `${due} flashcard${due === 1 ? "" : "s"} due today`, body: "A quick review keeps your streak alive.", at: new Date(new Date().setHours(8, 0, 0, 0)).toISOString(), href: "#/cards" });
  if (notices) out.push(...notices.inboxItems());
  (C.courseNotes || []).forEach((n) => out.push({ id: `cn${n.id}`, cat: "Academic", icon: "megaphone", tone: "orange", title: `${n.course}${n.section ? ` (Sec ${n.section})` : ""}: ${n.title}`, body: `${n.teacher_name}${n.body ? " · " + n.body.slice(0, 140) : ""}`, at: n.created_at, href: `#/course?c=${encodeURIComponent(n.course)}` }));
  (C.messages || []).forEach((m) => out.push({ id: `m${m.id}`, cat: "Campus", icon: "megaphone", tone: "purple", title: m.title, body: m.body || "From the EWUdiots team", at: m.created_at, href: /^(#\/|https:\/\/)/.test(m.link) ? m.link : "#/notifications" }));
  S.log.forEach((l) => out.push(l));
  return out.sort((a, b) => new Date(b.at) - new Date(a.at));
}

/* ───────────── Command palette (Ctrl+K / search) ───────────── */
const PAGES_SEARCH = [["ask", "Ask EWUdiots (assistant)", "sparkle"], ["blog", "Blog: tips and stories", "notes"], ["write", "Write a blog post", "edit"], ["events", "Campus events: workshops, concerts, club recruitment", "calendar"], ["jobs", "Jobs & internships", "briefcase"], ["mentors", "Alumni mentors", "heart"], ["office", "Teachers' office hours & consultations", "clock"], ["teach", "Teaching hub (teachers)", "briefcase"], ["alumhub", "Alumni hub", "cap"], ["home", "Home", "home"], ["routine", "My routine", "calendar"], ["alarms", "Class alarms (remind me before class)", "bell"], ["planner", "Advising planner", "calcheck"], ["courses", "My courses", "book"], ["grades", "CGPA", "bars"], ["degree", "Degree progress", "cap"],
  ["whatif", "What-if calculator", "calc"], ["marks", "Marks & attendance estimator", "percent"], ["tasks", "Deadlines", "clipboard"], ["exams", "Exam planner", "exam"], ["fees", "Fees & payments", "wallet"], ["vault", "Study vault", "vault"],
  ["rooms", "Free rooms", "door"], ["map", "Campus map & directions", "map"], ["notices", "EWU notice board", "megaphone"], ["news", "Campus news", "globe"], ["alumni", "Alumni: where are they now", "community"], ["idcard", "My ID card", "user"], ["faculty", "Faculty & reviews", "users"], ["focus", "Focus timer", "focus"], ["cards", "Flashcards", "cards"], ["me", "Achievements", "award"], ["cover", "Cover page", "file"],
  ["sync", "Sync portal", "sync"], ["notifications", "Notifications", "bell"], ["profile", "Profile & settings", "settings"]];
function palette() {
  loadDirectory();
  const courses = [...new Map(S.routine.map((r) => [r.code, r])).values()];
  const items = [
    { l: "Start a focus session", h: "Action", i: "play", go: () => study.focusOn() },
    { l: "Add a deadline", h: "Action", i: "plus", go: () => go("#/tasks?add=1") },
    { l: isDark() ? "Switch to light mode" : "Switch to dark mode", h: "Action", i: isDark() ? "sun" : "moon", go: () => { S.theme = isDark() ? "light" : "dark"; save({ silent: true }); applyTheme(); } },
    ...PAGES_SEARCH.map(([id, l, i]) => ({ l, h: "Page", i, go: () => go("#/" + id) })),
    ...courses.map((c) => ({ l: `${c.code}${c.title ? " · " + c.title : ""}`, h: "Course", i: "book", go: () => go("#/course?c=" + encodeURIComponent(c.code)) })),
    ...[...facultyIndex().values()].map((f) => ({ l: f.init.startsWith("@") ? f.name : `${f.name || f.init} (${f.init})`, h: "Faculty", i: "user", k: f.email, go: () => go("#/prof?i=" + encodeURIComponent(f.init)) })),
    ...roomData().rooms.slice(0, 200).map((r) => ({ l: `Room ${r}`, h: "Room", i: "door", go: () => go("#/rooms?q=" + encodeURIComponent(r)) })),
    ...campus.placesFor().map((p) => ({ l: p.name, h: "Place", i: "pin", k: p.hint, go: () => campus.goTo(p.go) }))
  ];
  // A typed room number always offers directions, even for rooms nobody has synced.
  const roomAsk = (t) => { const r = campus.where(t); return r && r.block ? [{ l: `Directions to room ${r.code}`, h: "Map", i: "map", go: () => campus.goTo(r.code) }] : []; };
  let sel = 0, shown = items;
  openModal(`<h2 id="modal-title" class="sr-only">Search</h2><div class="palette"><div class="searchbar">${icon("search")}<input class="input" id="pal-q" type="search" placeholder="Search courses, notes, rooms, faculty…" autocomplete="off" aria-controls="pal-list"></div>
    <div id="pal-list" role="listbox" aria-label="Results"></div></div>`, (m) => {
    const q = $("#pal-q", m), list = $("#pal-list", m);
    const draw = () => {
      const t = q.value.trim().toLowerCase();
      shown = (t ? [...roomAsk(t), ...items.filter((x) => (x.l + " " + x.h + " " + (x.k || "")).toLowerCase().includes(t))] : items.slice(0, 9)).slice(0, 12);
      sel = Math.min(sel, Math.max(0, shown.length - 1));
      list.innerHTML = shown.map((x, i) => `<button class="pal-item" role="option" aria-selected="${i === sel}" data-i="${i}">${icon(x.i)}<span class="grow">${esc(x.l)}</span><span class="xs">${x.h}</span></button>`).join("") ||
        empty("icon:search", `No results for "${esc(q.value)}"`, "Try a different keyword, course code or room.");
    };
    const run = (i) => { const x = shown[i]; if (!x) return; closeModal(); x.go(); };
    q.addEventListener("input", () => { sel = 0; draw(); });
    q.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown") { e.preventDefault(); sel = (sel + 1) % Math.max(1, shown.length); draw(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); sel = (sel - 1 + shown.length) % Math.max(1, shown.length); draw(); }
      else if (e.key === "Enter") { e.preventDefault(); run(sel); }
    });
    list.addEventListener("click", (e) => { const b = e.target.closest("[data-i]"); b && run(Number(b.dataset.i)); });
    draw(); q.focus();
  });
}
document.addEventListener("keydown", (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); if (!modalOpen()) palette(); } });

/* ───────────── Router ───────────── */
const pages = {};
const FULLSCREEN = new Set(["welcome", "login", "role", "setup"]);
let currentRoute = null, lastPainted = null, paintSeq = 0;
// animate: only real navigation (links, back button) morphs between screens; internal re-renders paint at once.
function route({ animate = false } = {}) {
  facCache = null;
  const r = location.hash.replace(/^#\/?/, "").split("?")[0] || "home";
  let id = pages[r] ? r : r === "account" ? "profile" : "notfound";
  if (PAGE_FEATURE[id] && !content.feature(PAGE_FEATURE[id])) id = "off";
  if (content.data.settings.maintenance?.on && !maintBypass && !FULLSCREEN.has(id)) id = "maint";
  if (!S.onboarded && !FULLSCREEN.has(id) && id !== "sync") id = "welcome";
  const changed = id !== currentRoute;
  currentRoute = id;
  const full = FULLSCREEN.has(id);
  $("#shell").hidden = full; $("#bottom-nav").hidden = full; $("#fullscreen").hidden = !full;
  const target = full ? $("#fullscreen") : $("#main");
  if (!full) renderNav(id);
  // A later render wins: a transition that hasn't painted yet skips its now-stale paint.
  const seq = ++paintSeq;
  const paint = () => { if (seq !== paintSeq) return; target.innerHTML = `<div class="${changed && !viewTx ? "page-in" : ""}" data-page="${id}">${pages[id]()}</div>`; (pages[id].mount || (() => {}))(target); };
  // Background tabs throttle animation frames, so a transition there could hold taps for seconds; skip it.
  const viewTx = animate && changed && document.startViewTransition && !prefersReduced() && !modalOpen() && lastPainted !== null && document.visibilityState === "visible";
  if (viewTx) {
    const t = document.startViewTransition(paint);
    [t.ready, t.finished, t.updateCallbackDone].forEach((p) => p?.catch(() => {})); // a skipped transition rejects these; that's expected
    let done = false; t.finished?.then(() => { done = true; }, () => { done = true; });
    setTimeout(() => { if (!done) t.skipTransition?.(); }, 700);
  } else paint();
  lastPainted = id; track(id);
  study && study.paintTimer();
  if (changed) { window.scrollTo(0, 0); target.focus?.({ preventScroll: true }); }
}
window.addEventListener("hashchange", () => route({ animate: true }));
// Anonymous page views for the admin Analytics page (no cookies; skipped when "Do Not Track" is on). text/plain avoids a CORS preflight.
let lastTracked = "";
function track(id) {
  if (id === lastTracked || navigator.doNotTrack === "1" || !import.meta.env.PROD) return; lastTracked = id;
  try { fetch((native.isNative ? SITE : "") + "/api/track", { method: "POST", keepalive: true, headers: { "content-type": "text/plain" }, body: JSON.stringify({ path: "/app/" + id, ref: document.referrer, app: native.isNative }) }).catch(() => {}); } catch { /* never block the app */ }
}
const rerender = () => route();
const qparam = (k) => new URLSearchParams(location.hash.split("?")[1] || "").get(k);
// Maintenance mode (admin panel → Features & maintenance): one screen for everyone, with a way into your own offline data.
let maintBypass = false;
pages.maint = () => `<div class="card mt-l maint">${empty("mascot-reading", "We're tidying things up", esc(content.data.settings.maintenance?.text || "EWUdiots is being updated. Please check back soon."), `<button class="btn primary" id="mt-off">${icon("database")} Use my saved data meanwhile</button>`)}</div>`;
pages.maint.mount = (el) => $("#mt-off", el).addEventListener("click", () => { maintBypass = true; rerender(); });
pages.off = () => `<div class="card mt-l">${empty("mascot-reading", "This section is taking a break", "The EWUdiots team has switched it off for now. Please check back soon.", `<a class="btn primary" href="#/home">Go Home</a>`)}</div>`;
pages.notfound = () => `<div class="card mt-l">${empty("mascot-confused", "Oops! Page not found", "The page you're looking for doesn't exist.", `<a class="btn primary" href="#/home">Go Home</a>`)}</div>`;

/* ───────────── Shared computations ───────────── */
function nextClass() {
  const blocks = expand(S.routine);
  if (!blocks.length) return null;
  const now = new Date(), nd = now.getDay(), nm = now.getHours() * 60 + now.getMinutes();
  for (let k = 0; k < 8; k++) {
    const d = (nd + k) % 7;
    for (const b of blocks.filter((x) => x.day === d).sort((a, c) => a.s - c.s)) {
      if (k === 0 && b.e <= nm) continue;
      const live = k === 0 && b.s <= nm;
      return { ...b, live, mins: live ? b.e - nm : k * 1440 + b.s - nm };
    }
  }
  return null;
}
// Paying (any step of) the slip settles the semester; later steps are only the same bill with a late fee.
function nextPayment() { const sch = S.payments.schedule || []; if (sch.some((p) => S.paid[p.due])) return undefined; return sch.filter((p) => daysUntil(p.due) >= 0).sort((a, b) => a.due.localeCompare(b.due))[0]; }
/* Faculty directory = cloud (crowd-sourced) ∪ my synced schedule ∪ demo. */
let facCache = null; // rebuilt once per render / save
function facultyIndex() {
  if (facCache) return facCache;
  const map = (facCache = new Map());
  if (S.demo) DEMO.faculty.forEach((f) => map.set(f.init, { ...f, source: "demo" }));
  (C.faculty || []).forEach((f) => map.set(f.init, { ...map.get(f.init), ...f, source: "cloud" }));
  Object.values(S.faculty).forEach((f) => { const p = map.get(f.init) || {}; map.set(f.init, { ...f, ...Object.fromEntries(Object.entries(p).filter(([, v]) => v)), source: p.source || "mine" }); });
  // Official profiles: matched to a known initial by work email, otherwise keyed by their profile slug ("@HOSNEY.JAHAN").
  const byEmail = new Map([...map.values()].filter((f) => f.email).map((f) => [f.email.toLowerCase(), f.init]));
  const ov = new Map(content.data.faculty.map((o) => [o.slug, o]));
  (C.directory || []).forEach((d0) => {
    const o = ov.get(d0.url.split("/").pop()); if (o?.hidden) return;
    const d = o ? { ...d0, room: o.room || d0.room } : d0;
    const k = (o?.init && map.has(o.init) ? o.init : null) || (d.email && byEmail.get(d.email)) || (o?.init || "@" + d.url.split("/").pop().toUpperCase()), p = map.get(k) || {};
    map.set(k, { ...p, init: k, name: d.name, dept: d.dept, deptName: d.deptName, designation: d.designation, email: d.email || p.email, room: d.room ? `Room ${d.room}` : p.room, roomCode: d.room, ext: d.ext, photo: d.photo, degree: d.degree, bio: d.bio, url: d.url, official: true, source: p.source || "official" });
  });
  return map;
}
const facBy = (init) => facultyIndex().get(String(init || "").toUpperCase());
const facName = (init) => { const f = facBy(init); return f?.name || init || ""; };
const offered = () => S.planner.offered || (S.demo ? DEMO.offered : {});
const sectionBlocks = (code, s) => expand([{ code, sec: s.sec, days: s.days, start: s.start, end: s.end, id: code + s.sec, room: s.room }]
  .concat(s.lab ? [{ code, sec: s.sec, days: s.lab.days, start: s.lab.start, end: s.lab.end, id: code + s.sec + "L", lab: true, room: s.lab.room || s.room }] : []));
/* Every known room and when it's occupied: campus-wide sections ∪ offered courses ∪ my routine. */
const baseRoom = (r) => String(r || "").replace(/\s*\(.*\)$/, "").trim();
function roomData() {
  const occ = [], kind = {};
  const add = (room, b) => { const r = baseRoom(room); if (!r) return; occ.push({ ...b, room: r }); if (/lab/i.test(room)) kind[r] = "Lab"; };
  (C.sections || []).forEach((s) => s.room && expand([{ days: s.days, start: s.start_time, end: s.end_time }]).forEach((b) => add(s.room, b)));
  Object.entries(offered()).forEach(([code, c]) => (S.planner.offered || S.demo) && c.sections.forEach((s) => sectionBlocks(code, s).forEach((b) => add(b.room, b))));
  expand(S.routine).forEach((b) => add(b.room, b));
  return { occ, kind, rooms: [...new Set(occ.map((o) => o.room))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })) };
}
function freeRoomsAt(day, s, e) {
  const { occ, rooms } = roomData();
  const busyR = new Set(occ.filter((o) => o.day === day && o.s < e && s < o.e).map((o) => o.room));
  return rooms.filter((r) => !busyR.has(r));
}
function markAttendance(code, kind) {
  const a = S.attendance[code] = S.attendance[code] || { held: 0, missed: 0 }; a.log = a.log || [];
  if (kind === "undo") { const l = a.log.pop(); if (!l) return; a.held = Math.max(0, a.held - 1); if (l === "absent") a.missed = Math.max(0, a.missed - 1); }
  else { a.held++; if (kind === "absent") a.missed++; a.log.push(kind); study.award(3, "", true); }
  save(); rerender();
}
async function enableNotifications() {
  const ok = await native.askNotifications();
  S.settings.notify = ok; save();
  toast(ok ? "Reminders on" : "Notifications are blocked", ok ? "success" : "warn", ok ? `Class alarms ${S.settings.alarms.offsets.map(fmtBefore).join(" and ")} before, deadlines 1 day and 1 hour before.` : "Allow notifications in your browser or phone settings.");
  return ok;
}

/* ───────────── Reminders ───────────── */
let reminderTimer = null;
function scheduleReminders() {
  clearTimeout(reminderTimer);
  reminderTimer = setTimeout(async () => {
    if (!S.settings.notify) return;
    const items = [];
    S.tasks.filter((t) => !t.done).forEach((t) => {
      const due = new Date(t.due);
      items.push({ key: t.id + "d", title: `Due tomorrow: ${t.title}`, body: `${t.course} ${t.type}`, at: new Date(due - 864e5) });
      items.push({ key: t.id + "h", title: `Due in 1 hour: ${t.title}`, body: `${t.course} ${t.type}`, at: new Date(due - 36e5) });
    });
    (S.payments.schedule || []).filter((p) => !p.late && !S.paid[p.due]).forEach((p) => {
      const at = new Date(p.due + "T10:00:00");
      items.push({ key: "pay3" + p.due, title: "Tuition due in 3 days", body: `${fmtMoney(p.amount)} by ${p.due} — late fee after that`, at: new Date(at - 3 * 864e5) });
      items.push({ key: "pay1" + p.due, title: "Tuition due tomorrow", body: `${fmtMoney(p.amount)} by ${p.due}`, at: new Date(at - 864e5) });
    });
    const t = S.study?.timer;
    if (t?.endAt) items.push({ key: "focus" + t.endAt, title: t.kind === "focus" ? "Focus session done" : "Break's over", body: t.kind === "focus" ? "Nice work. Take a short break." : "Start your next focus session.", at: new Date(t.endAt) });
    await native.scheduleAll({ classes: expand(S.routine).map((c) => ({ ...c, offsets: alarmsFor(c.code) })).filter((c) => c.offsets.length), items }).catch(() => {});
  }, 800);
}
const fmtBefore = (m) => (m >= 60 && m % 60 === 0 ? `${m / 60} hour${m === 60 ? "" : "s"}` : m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`);
function alarmsFor(code) { const a = S.settings.alarms; if (!a.on) return []; return [...new Set(a.perCourse[code] || a.offsets)].sort((x, y) => y - x); }
/* The next alarm times for the coming week: [{ at: Date, off, code, title, room, s, day }] */
function upcomingAlarms(limit = 8) {
  const out = [], now = new Date();
  for (let k = 0; k < 8; k++) {
    const d = new Date(now); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + k);
    for (const b of expand(S.routine).filter((x) => x.day === d.getDay())) for (const off of alarmsFor(b.code)) {
      const at = new Date(d.getTime() + (b.s - off) * 6e4);
      if (at > now) out.push({ at, off, ...b });
    }
  }
  return out.sort((a, b) => a.at - b.at).slice(0, limit);
}
/* In-app alarm: a full sheet with a soft repeating chime, snooze or dismiss. Shown while the app is open
   (on phones the system alarm notification also rings when the app is closed). */
let chime = null;
function stopChime() { if (chime) { clearInterval(chime.t); chime.ctx.close().catch(() => {}); chime = null; } }
function ringAlarm(c, off) {
  if (S.settings.alarms.ring && !prefersReduced()) {
    try {
      const ac = new (window.AudioContext || window.webkitAudioContext)();
      const beep = () => [0, 0.25, 0.5].forEach((dt, i) => { const o = ac.createOscillator(), g = ac.createGain(); o.type = "sine"; o.frequency.value = [880, 988, 1175][i];
        g.gain.setValueAtTime(0.0001, ac.currentTime + dt); g.gain.exponentialRampToValueAtTime(0.25, ac.currentTime + dt + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + dt + 0.22);
        o.connect(g).connect(ac.destination); o.start(ac.currentTime + dt); o.stop(ac.currentTime + dt + 0.25); });
      stopChime(); beep(); chime = { ctx: ac, t: setInterval(beep, 1600) }; setTimeout(stopChime, 30000);
    } catch { /* no audio */ }
  }
  navigator.vibrate?.([300, 150, 300, 150, 300]);
  openModal(`<div class="alarm-sheet"><div class="alarm-ring" aria-hidden="true">${icon("bell")}</div><p class="xs">Class alarm · ${fmtBefore(off)} before</p>
    <h2 id="modal-title">${esc(c.code)}${c.lab ? " Lab" : ""} at ${fmt12(c.s)}</h2><p class="muted">${esc([c.title, c.room && `Room ${baseRoom(c.room)}`].filter(Boolean).join(" · "))}</p>
    <div class="stack mt" style="gap:8px">${c.room ? `<button class="btn primary block" id="al-go">${icon("map")} Directions to ${esc(baseRoom(c.room))}</button>` : ""}
      <div class="row"><button class="btn neutral grow" id="al-snooze">${icon("clock")} Snooze 5 min</button><button class="btn outline grow" data-close id="al-ok">${icon("check")} Got it</button></div></div></div>`, (m) => {
    $("#al-go", m)?.addEventListener("click", () => { stopChime(); closeModal(); go(`#/map?to=${encodeURIComponent(baseRoom(c.room))}`); });
    $("#al-snooze", m).addEventListener("click", () => { stopChime(); closeModal(); setTimeout(() => ringAlarm(c, Math.max(1, off - 5)), 5 * 6e4); toast("Snoozed for 5 minutes", "info"); });
    $("#al-ok", m).addEventListener("click", stopChime);
  }, { center: true });
}
// While the app is open: ring class alarms in the app, and send browser notifications on the web (dedupe in memory).
const notified = new Set(); delete S._notified;
setInterval(() => {
  const now = Date.now(), webNote = !native.isNative && S.settings.notify && "Notification" in window && Notification.permission === "granted";
  const fire = (k, title, body) => { if (notified.has(k)) return false; notified.add(k); if (webNote) new Notification(title, { body, icon: "/icons/icon-192.png", tag: k, requireInteraction: true }); return true; };
  for (const a of upcomingAlarms(20).concat(recentAlarms())) {
    const late = now - a.at.getTime();
    if (late >= 0 && late < 90e3 && fire(`al${a.code}${a.day}${a.s}${a.off}${a.at.toDateString()}`, `⏰ ${a.code} starts in ${fmtBefore(a.off)}`, [a.title, a.room].filter(Boolean).join(" · ")) && document.visibilityState === "visible" && !modalOpen()) ringAlarm(a, a.off);
  }
  if (webNote) S.tasks.filter((t) => !t.done).forEach((t) => { const ms = new Date(t.due) - now; if (ms > 0 && ms < 36e5) fire(t.id + "h", `Due in 1 hour: ${t.title}`, t.course); else if (ms > 0 && ms < 864e5) fire(t.id + "d", `Due tomorrow: ${t.title}`, t.course); });
}, 20000);
// Alarms whose time passed in the last 90 s (upcomingAlarms only looks forward).
function recentAlarms() {
  const now = new Date(), d = new Date(now); d.setHours(0, 0, 0, 0);
  return expand(S.routine).filter((b) => b.day === now.getDay()).flatMap((b) => alarmsFor(b.code).map((off) => ({ at: new Date(d.getTime() + (b.s - off) * 6e4), off, ...b })));
}

/* ───────────── Shared row renderers ───────────── */
const TASK_IC = { Assignment: ["notes", "red"], Quiz: ["clipboard", "orange"], Lab: ["sparkle", "teal"], Presentation: ["megaphone", "purple"], Exam: ["exam", "purple"], Other: ["clipboard", "blue"], Fees: ["wallet", "green"], Advising: ["calcheck", "blue"] };
function duePill(due) {
  const ms = new Date(due) - Date.now(), d = new Date(due), today = new Date().toDateString() === d.toDateString();
  if (ms < 0) return `<span class="pill red">Overdue</span>`;
  if (today) return `<span class="pill red">Due Today</span>`;
  const days = Math.ceil(ms / 864e5);
  return `<span class="pill ${days <= 2 ? "amber" : "blue"}">${days} day${days === 1 ? "" : "s"} left</span>`;
}
function taskLine(t, { compact = false } = {}) {
  const [ic, tone] = TASK_IC[t.type] || TASK_IC.Other;
  const d = new Date(t.due);
  return compact
    ? `<a class="lrow" href="#/tasks" style="min-height:44px;padding:8px 0"><span class="itile sm ${tone}">${icon(ic)}</span><span class="body"><b style="font-size:14px;font-weight:500">${esc(t.course ? `${t.course} - ` : "")}${esc(t.title)}</b></span>${duePill(t.due)}</a>`
    : `<div class="lcard edge" style="--edge:${HEX[tone] || HEX.purple}"><span class="itile ${tone}">${icon(ic)}</span><div class="grow min0"><b style="display:block;font-size:14.5px">${esc(t.course ? `${t.course} - ` : "")}${esc(t.title)}</b><span class="xs">${esc(t.type)}${t.where ? " · " + esc(t.where) : ""}</span></div>
      <div class="meta" style="text-align:right">${new Date().toDateString() === d.toDateString() ? `${duePill(t.due)}<div class="small" style="color:var(--error-t);margin-top:4px">${d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: true })}</div>` : `<b class="small">${d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}</b><div class="xs">${d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: true })}</div>`}</div>
      ${t.id ? `<button class="btn sm icon-only ghost" data-tmenu="${t.id}" aria-label="Options for ${esc(t.title)}">${icon("chevR")}</button>` : ""}</div>`;
}

/* ───────────── Demo data ───────────── */
function loadDemo() {
  const inDays = (d, h = 23) => { const x = new Date(); x.setDate(x.getDate() + d); x.setHours(h, 59, 0, 0); return x.toISOString(); };
  const iso = (d) => { const x = new Date(); x.setDate(x.getDate() + d); return x.toISOString().slice(0, 10); };
  const examId = uid();
  Object.assign(S, {
    demo: true, onboarded: true, role: "student", profile: { ...DEMO.profile }, routine: DEMO.routine.map((r) => ({ ...r, id: uid() })), routineSem: currentSemester(),
    grades: DEMO.grades.map((r) => ({ ...r, id: uid() })), degree: DEMO.degree, rules: DEMO.rules,
    tasks: [
      { id: uid(), title: "Assignment 2", course: "CSE207", type: "Assignment", due: inDays(0), done: false },
      { id: uid(), title: "Quiz 3", course: "CSE209", type: "Quiz", due: inDays(2, 11), done: false },
      { id: uid(), title: "Group Presentation", course: "ENG7102", type: "Presentation", due: inDays(4, 14), done: false },
      { id: examId, title: "Mid-term", course: "MAT205", type: "Exam", due: inDays(9, 10), done: false }
    ],
    attendance: { CSE207: { held: 14, missed: 1 }, CSE209: { held: 12, missed: 4 }, MAT205: { held: 13, missed: 1 }, STA102: { held: 12, missed: 0 } },
    marks: { CSE207: { parts: [{ n: "Quiz 1", w: 10, got: "8" }, { n: "Quiz 2", w: 10, got: "7" }, { n: "Assignment 1", w: 10, got: "8" }, { n: "Mid Term", w: 30, got: "21" }, { n: "Final Exam", w: 40, got: "" }] } },
    payments: { semester: currentSemester(), fees: { tuition: 81500, lab: 4000, activity: 1200, library: 1000 }, schedule: [
      { late: false, due: iso(6), amount: 87700 }, { late: true, due: iso(36), amount: 88200 }, { late: true, due: iso(43), amount: 88700 }] },
    recommended: [{ code: "CSE246", cr: 3, prereq: ["CSE207"] }, { code: "CSE325", cr: 4, prereq: ["CSE207"] }, { code: "MAT205", cr: 3, prereq: [] }]
  });
  S.planner.offered = null;
  if (!S.study.sessions.length && !S.study.cards.length) S.study = Object.assign(studyDefaults(), DEMO.study(examId), { demo: true });
  S.study.seenBadges = [];
  save(); study.checkBadges(); toast("Demo loaded", "info", "Sync your portal any time to replace it."); go("#/home");
}

/* ───────────── Cloud sign-in ───────────── */
// Resolves once the first sign-in's cloud restore/backup has finished (the ID-card login waits for it).
let signInDone = Promise.resolve();
function onSignedIn(user) {
  const first = !C.user;
  C.user = user; C.faculty = null; C.sections = null; C.vault = null;
  if (!first) return signInDone;
  return (signInDone = restoreOrBackup(user));
}
// Messages the team sent to everyone or to you (admin panel → Messages to users).
async function loadMessages() { if (!C.user) return; try { C.messages = await cloud.fetchMessages(); C.courseNotes = await people.courseNotices().catch(() => []); if (["home", "notifications"].includes(currentRoute)) rerender(); } catch { /* offline */ } }
async function restoreOrBackup(user) {
  try {
    const remote = await cloud.pullData(user.id);
    const remoteAt = remote ? new Date(remote.updated_at).getTime() : 0;
    if (remote && remote.data?.profile && (remoteAt > (S.updatedAt || 0) || !S.profile || S.demo)) {
      adopt(remote.data, remoteAt); toast("Your account is ready on this device", "success", "Routine, grades and progress restored.");
    } else if (S.profile && !S.demo) { await pushNow(); }
    idcard?.forget(); // fetch the card pictures from the account if this device doesn't have them
    sync.checkInbox(); loadMessages();
    if (S.routine.length && !S.demo) cloud.contribute({ semester: S.routineSem, rows: S.routine, faculty: Object.values(S.faculty) }).catch(() => {});
  } catch (e) { console.warn(e); }
  rerender();
}

/* ───────────── Boot ───────────── */
const ctx = {
  get S() { return S; }, resetState, pages, save, rerender, route: () => currentRoute, go, qparam, toast, openModal, closeModal, modalHead, confirmModal, modalOpen, busy,
  icon, esc, uid, $, $$, head, subHead, seg, art, swoosh, empty, bar, demoBanner, C, cloud, native, get study() { return study; }, loadDirectory, get campus() { return campus; }, get notices() { return notices; }, get community() { return community; }, get people() { return people; }, get events() { return events; }, get sync() { return sync; }, content, FEATURES, countUp, get idcard() { return idcard; }, APP_VERSION, SITE, pushNow, pullNow, logEvent, PAGE_FEATURE, alarmsFor, upcomingAlarms, PAGES_SEARCH, ringAlarm, fmtBefore, scheduleReminders,
  afterSignIn: () => signInDone, LETTER, toMin, fmt12, fmtShort, dayIdx, expand, overlaps, toneFor, colorFor, HEX, TONES, gradePoint, cgpaOf, fmtMoney, fmtCountdown, daysUntil, fmtDate, firstName, initials, myAvatar, greeting,
  nextClass, nextPayment, markAttendance, facultyIndex, facBy, facName, offered, sectionBlocks, roomData, freeRoomsAt, baseRoom, enableNotifications, taskLine, duePill, TASK_IC, inbox, loadDemo, onSignedIn,
  isDark, applyTheme, palette, roleLabel, navFor, nextSemesterGuess, DAY_NAMES, WEEK, SLOTS, GRADES, NON_GPA, DEMO, parsePortalText, mergeParsed, offeredToPlanner, currentSemester, normSemester, semesterKey
};
study = installStudy(ctx);
installHome(ctx);
const sync = installSync(ctx);
installAcademic(ctx);
installCampus(ctx);
campus = installMap(ctx);
idcard = installIdCard(ctx);
notices = installNotices(ctx);
community = installCommunity(ctx);
installAlarms(ctx);
installAsk(ctx);
people = installPeople(ctx);
events = installEvents(ctx);
content.onChange(() => { facCache = null; applyTheme(); rerender(); });
content.refresh();
setInterval(() => { if (document.visibilityState === "visible") { content.refresh(); loadMessages(); } }, 10 * 60e3);

$("#top-search").addEventListener("click", palette);
$("#top-search-field").addEventListener("click", palette);
applyTheme();
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", applyTheme);
const setOnline = () => document.body.classList.toggle("offline", !navigator.onLine);
addEventListener("online", setOnline); addEventListener("offline", setOnline); setOnline();
native.boot({ dark: isDark(), onBack: () => { if (modalOpen()) { closeModal(); return true; } if (currentRoute !== "home") { history.back(); return true; } return false; } });
route();
// Web: keep the browser's install offer so More → "Install EWUdiots" can show it (Windows, Mac, Android Chrome).
addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); C.install = e; if (currentRoute === "more") rerender(); });
addEventListener("appinstalled", () => { C.install = null; toast("EWUdiots installed", "success", "Open it from your apps. Your account is the same everywhere."); });
/* ───────────── Update prompts ─────────────
   /version.json says what's newest (see vite.config.js and release.json). Checked at start, when the app comes back to
   the front and every 30 minutes.
   · Phone app: a sheet with what's new and "Update now" (downloads the APK); Home also keeps an Update card.
   · Web app / installed desktop app: a bar "New version available · Refresh" (the new files load on reload).
   · Below minVersion the update is required: the prompt can't be dismissed. */
const newer = (a, b) => { const x = String(a).split(".").map(Number), y = String(b).split(".").map(Number); for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); return false; };
const UPD_KEY = "ewudiots.updateSeen";
let checkingUpdate = false;
async function checkUpdate() {
  if (checkingUpdate || !navigator.onLine) return;
  checkingUpdate = true;
  try {
    const j = await (await fetch((native.isNative ? SITE : "") + "/version.json", { cache: "no-store" })).json();
    if (!newer(j.version, APP_VERSION)) return;
    const required = newer(j.minVersion || "0", APP_VERSION);
    C.update = { version: j.version, notes: (j.notes || []).slice(0, 6), required, url: native.isNative ? SITE + (j.apk || "/download/android") : "" };
    if (currentRoute === "home") rerender();
    showUpdate();
  } catch { /* offline or no version file (dev) */ }
  finally { checkingUpdate = false; }
}
function showUpdate() {
  const u = C.update; if (!u) return;
  if (!native.isNative) {
    // Web: one quiet bar; a required update reloads as soon as nothing is being edited.
    // Only once per version, so a lagging cache can never cause a reload loop.
    let tried = ""; try { tried = sessionStorage.getItem("ewudiots.reloadedFor") || ""; } catch { /* storage blocked */ }
    if (u.required && !modalOpen() && tried !== u.version) { try { sessionStorage.setItem("ewudiots.reloadedFor", u.version); } catch { /* storage blocked */ } location.reload(); return; }
    let bar = $("#upd-bar");
    if (!bar) { bar = document.createElement("div"); bar.id = "upd-bar"; bar.className = "upd-bar"; bar.setAttribute("role", "status"); document.body.appendChild(bar); }
    bar.innerHTML = `<span class="upd-dot" aria-hidden="true"></span><span class="grow"><b>New version available</b> <span class="xs">EWUdiots ${esc(u.version)}</span></span><button class="btn sm primary" id="upd-go">${icon("reset", "sm")} Refresh</button>${u.required ? "" : `<button class="icon-btn sm" id="upd-x" aria-label="Later">${icon("x", "sm")}</button>`}`;
    $("#upd-go", bar).addEventListener("click", () => location.reload());
    $("#upd-x", bar)?.addEventListener("click", () => bar.remove());
    return;
  }
  // Phone: the sheet comes back each time the app is opened (at most every 6 hours after "Later"; always when required).
  let seen = {}; try { seen = JSON.parse(localStorage.getItem(UPD_KEY) || "{}") || {}; } catch { /* storage blocked or old format */ }
  if ((!u.required && seen.v === u.version && Date.now() - (seen.at || 0) < 6 * 36e5) || modalOpen()) return;
  try { localStorage.setItem(UPD_KEY, JSON.stringify({ v: u.version, at: Date.now() })); } catch { /* storage blocked */ }
  openUpdateSheet();
}
/* Update now: download the new APK inside the app (progress bar) and open Android's installer, which asks
   "Update this app?" once. Older builds without the in-app updater download it in the browser instead. */
let afterPermission = null; // set while we wait for the "install unknown apps" switch; runs once when the app is back
function openUpdateSheet() {
  const u = C.update; if (!u) return;
  const self = native.canSelfUpdate();
  openModal(`<div class="upd-sheet"><div class="upd-ill" aria-hidden="true">${icon("download")}</div><p class="xs">${u.required ? "Required update" : "Update available"}</p>
    <h2 id="modal-title">EWUdiots ${esc(u.version)}</h2><p class="small muted">You have ${esc(APP_VERSION)}.${u.required ? " This update fixes something important, so please install it to keep using the app." : ""}</p>
    ${u.notes.length ? `<ul class="upd-notes">${u.notes.map((n) => `<li>${icon("check", "sm")}<span>${esc(n)}</span></li>`).join("")}</ul>` : ""}
    <div id="upd-act">${self ? `<button class="btn primary lg block" id="upd-now">${icon("download")} Update now</button><p class="xs mt-s">Downloads inside the app, then tap <b>Update</b> in the Android window. Your data stays.</p>`
      : `<a class="btn primary lg block" id="upd-now" href="${esc(u.url)}" target="_blank" rel="noopener">${icon("download")} Update now</a><p class="xs mt-s">Open the downloaded file and tap Install. Your data stays. After this update, the next ones install from inside the app.</p>`}</div>
    ${u.required ? "" : `<button class="btn ghost block" data-close>Later</button>`}</div>`, (m) => {
    if (u.required) { const head = m.querySelector(".grabber"); head && head.remove(); }
    if (!self) return;
    const act = $("#upd-act", m);
    const run = async () => {
      if (!(await native.updaterAllowed().catch(() => true))) {
        act.innerHTML = `<div class="alert amber">${icon("shield")}<div><b>One-time permission</b><p>Android asks you to allow EWUdiots to install its own updates. Turn on <b>Allow from this source</b>, then come back.</p></div></div>
          <button class="btn primary lg block mt-s" id="upd-perm">${icon("settings")} Open settings</button>`;
        $("#upd-perm", act).addEventListener("click", () => { native.openUpdaterSettings(); afterPermission = run; });
        return;
      }
      act.innerHTML = `<div class="upd-prog"><div class="bar"><span id="upd-bar-fill" style="width:2%"></span></div><p class="small mt-s" id="upd-pct" aria-live="polite">Downloading…</p></div>`;
      try {
        await native.downloadAndInstall(u.url, (pct, bytes) => { const f = $("#upd-bar-fill"), t = $("#upd-pct"); if (f && pct >= 0) f.style.width = `${Math.max(2, pct)}%`; if (t) t.textContent = pct >= 0 ? `Downloading… ${pct}%` : `Downloading… ${(bytes / 1048576).toFixed(1)} MB`; });
        act.innerHTML = `<div class="alert green">${icon("checkc")}<div><b>Almost done</b><p>Tap <b>Update</b> in the Android window. EWUdiots restarts on the new version.</p></div></div><button class="btn outline block mt-s" id="upd-again">${icon("reset")} Show the installer again</button>`;
        $("#upd-again", act).addEventListener("click", run);
      } catch (e) {
        act.innerHTML = `<div class="alert red">${icon("alert")}<div><b>Download didn't finish</b><p>${esc(e.message || "Check your internet and try again.")}</p></div></div><button class="btn primary block mt-s" id="upd-retry">${icon("reset")} Try again</button><a class="btn ghost block" href="${esc(u.url)}" target="_blank" rel="noopener">Download in the browser instead</a>`;
        $("#upd-retry", act).addEventListener("click", run);
      }
    };
    $("#upd-now", m).addEventListener("click", run);
  }, { center: true });
}
// The Home "Update available" card opens the same sheet.
document.addEventListener("click", (e) => { const b = e.target.closest("[data-update]"); if (b && C.update) { e.preventDefault(); openUpdateSheet(); } });
checkUpdate();
setInterval(checkUpdate, 30 * 60e3);
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") checkUpdate(); });
// Coming back to the app: finish an update that was waiting for the permission, otherwise re-check for one.
native.onResume(async () => {
  if (afterPermission && $("#upd-perm")) { const go = afterPermission; afterPermission = null; return go(); }
  await checkUpdate(); if (C.update) showUpdate();
});
sync.takeExtHandoff();
scheduleReminders();
if (cloud.enabled) {
  cloud.currentUser().then((u) => u && onSignedIn(u));
  cloud.onAuth((u) => { if (u && !C.user) onSignedIn(u); else if (!u && C.user) { C.user = null; C.faculty = C.sections = C.vault = null; rerender(); } });
}
setInterval(() => { if (currentRoute === "home" && !modalOpen() && document.visibilityState === "visible") rerender(); }, 60000);
// Pick up pages the extension sends while the app is open (every 2 min, and whenever the app comes back to the front).
setInterval(() => { if (document.visibilityState === "visible" && !modalOpen()) sync.checkInbox(); }, 120000);
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") { sync.checkInbox(); pullNow(); } else if (C.user && S.updatedAt > (S.syncedAt || 0)) pushNow(); });
setInterval(() => { if (document.visibilityState === "visible") pullNow(); }, 60000);
addEventListener("online", () => pullNow());
if ("serviceWorker" in navigator && !native.isNative && import.meta.env.PROD) navigator.serviceWorker.register("/sw.js").catch(() => {});
