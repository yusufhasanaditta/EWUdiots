/* Portal sync (Android app): sign in to portal.ewubd.edu on the phone and read the student's data.
   `bridge` is the native PortalSync plugin (android/…/PortalSyncPlugin.java): open → login → exec/read… → close.
   1. Class schedule (every semester) and offered courses come from the portal's own JSON, the same data its Class
      Schedule and Offered Courses pages load after a semester is picked. The script below keeps only academic fields.
   2. The other pages are found through the portal's own menu (the link's address, so EWU renaming a page doesn't break
      it), then read with the same privacy filter as the Chrome extension (src/portal-scrape.js).
   Tests drive the same steps with a fake bridge over the portal replicas in tests/fixtures/portal-pages.mjs. */
import { SCRAPE_JS } from "./portal-scrape.js";

export const PORTAL_PAGES = [
  { kind: "profile", label: "Profile", menu: /\bprofile\b/i, paths: ["/Home/Profile", "/Home/StudentProfile"], waitFor: "Admitted|Student\\s*ID" },
  { kind: "grades", label: "Grade report", menu: /grade\s*report/i, paths: ["/Home/GradeReport", "/ReportForms/rptGradeSheetStudent.aspx"], waitFor: "CGPA|Term\\s*GPA" },
  { kind: "degree", label: "Degree review", menu: /degree\s*review/i, paths: ["/Home/DegreeReview", "/Home/StudentDegreeReview"], waitFor: "Out\\s*of|CGPA" },
  { kind: "rules", label: "Advising rules", menu: /advising\s*rules/i, paths: ["/Home/AdvisingRules"], waitFor: "Max\\s*Course" },
  { kind: "curriculum", label: "Curriculum", menu: /curricul/i, paths: ["/Home/Curriculum"], waitFor: "[A-Z]{3}\\s?\\d{3}" },
  { kind: "installment", label: "Installments", menu: /instal?l?ment/i, paths: ["/Home/InstallmentPayment"], waitFor: "\\d\\.\\d{2}" },
  { kind: "ledger", label: "Accounts ledger", menu: /ledger/i, paths: ["/Home/StudentLedger"], waitFor: "Debit|Voucher" }
];
export const API_STEPS = ["Class schedule, every semester", "Offered courses"];
export const STEPS = [...API_STEPS, ...PORTAL_PAGES.map((p) => p.label)];
// Before these, a page with a semester picker and no table was also read the old way (fallback only).
const SCHEDULE_PAGE = { kind: "schedule", label: API_STEPS[0], paths: ["/Home/ClassSchedule"], click: "show\\s*courses", waitFor: "Faculty\\s*Initial" };

/* Every same-site menu link: [text, path]. */
export const MENU_JS = `(() => JSON.stringify([...document.querySelectorAll("a[href]")].map((a) => {
  try { const u = new URL(a.href, location.href); return u.origin === location.origin ? [String(a.textContent || "").replace(/\\s+/g, " ").trim().slice(0, 60), u.pathname + u.search] : null; } catch (e) { return null; }
}).filter((x) => x && x[0] && x[1] !== "/" && !/logout|signout|log-off/i.test(x[1]))))()`;

/* The portal's JSON, read with the student's own session. Only these fields leave the page: course, section, time,
   room, faculty initial and name, credits, grade, seats. Newest semester first; stops 3 empty semesters after the
   student's first one. Answers through window.__ewud (the bridge waits for it). */
export const API_JS = `(() => { window.__ewud = null; (async () => {
  const get = async (u) => { const r = await fetch(u, { credentials: "include", headers: { Accept: "application/json" } }); if (!r.ok) throw new Error(u + " " + r.status); return r.json(); };
  const keep = (c) => c && c.CourseCode && !/^yes$/i.test(String(c.DropStatus || "")) && !/^yes$/i.test(String(c.WithDrawStatus || "")) && c.isSemesterDrop !== true;
  const pick = (c) => ({ code: String(c.CourseCode || ""), name: String(c.CourseName || c.CourseTitle || ""), sec: c.SectionName == null ? "" : String(c.SectionName),
    slot: String(c.TimeSlotName || ""), room: String(c.RoomName || c.RoomCode || ""), ini: String(c.ShortName || c.FacultyShortName || ""), fac: String(c.FacultyName || ""),
    cr: c.CreditHour || c.Credit || "", grade: String(c.Grade || c.GradeLetter || c.LetterGrade || ""), taken: c.SeatTaken, cap: c.SeatCapacity });
  const out = { semesters: [], offered: [], offeredSem: "" };
  let sems = [];
  try { sems = await get("/api/utility/GetSemesterForDropDown"); } catch (e) { out.error = String(e.message || e); }
  sems = (Array.isArray(sems) ? sems : []).filter((s) => s && s.SemesterId).sort((a, b) => String(b.StartingDate || "").localeCompare(String(a.StartingDate || "")));
  let found = 0, misses = 0;
  for (const s of sems.slice(0, 30)) {
    let list = [];
    try { list = await get("/api/Advising/GetSemesterStudentWiseAdvisingCourseListStudent/" + s.SemesterId); } catch (e) { list = []; }
    list = Array.isArray(list) ? list.filter(keep) : [];
    if (list.length) { found++; misses = 0; out.semesters.push({ name: String(s.SemesterName || ""), start: String(s.StartingDate || ""), end: String(s.EndingDate || ""), rows: list.map(pick) }); }
    else if (found && ++misses >= 3) break;
  }
  try {
    const all = await get("/api/Advising/GetAllRoutine");
    if (Array.isArray(all)) { out.offered = all.filter(keep).map(pick); out.offeredSem = String((all.find((c) => c && c.SemesterName) || {}).SemesterName || ""); }
  } catch (e) { out.offeredError = String(e.message || e); }
  window.__ewud = JSON.stringify(out);
})().catch((e) => { window.__ewud = JSON.stringify({ error: String(e) }); }); return "started"; })()`;

/* Open the login page. → { login: true, first, second } (EWU's "first + second = ?" check), or { login: false } if
   the phone is still signed in from a moment ago. */
export async function start(bridge) { return bridge.open(); }

/* Fill EWU's login form. Throws a readable error (with the new check numbers) when the portal refuses.
   useSaved: the password remembered on this phone is filled in by the plugin (it never comes back to this code). */
export async function signIn(bridge, { id, password, answer, useSaved = false }) {
  if (!/^\d{4}-\d-\d{2}-\d{3}$/.test(String(id).trim())) throw Object.assign(new Error("Enter your student ID like 2024-1-60-123."), { field: "id" });
  if (!password && !useSaved) throw Object.assign(new Error("Enter your portal password."), { field: "password" });
  if (!/^\d{1,3}$/.test(String(answer).trim())) throw Object.assign(new Error("Answer EWU's small sum (for example 3 + 18 = 21)."), { field: "answer" });
  const st = await bridge.login({ username: String(id).trim(), password: useSaved ? "" : password, answer: String(answer).trim(), useSaved });
  if (st.login) throw Object.assign(new Error(st.error || "The portal didn't accept that. Check your ID, password and the sum."), { status: st });
  return st;
}

const hasData = (d) => Boolean(d && d.text && /\d/.test(d.text));
async function readPage(bridge, path, p) {
  const r = await bridge.read({ path, click: p.click, waitFor: p.waitFor, script: SCRAPE_JS, timeout: 9000 });
  return JSON.parse(r.result || "{}");
}
// A report in a frame: open the frame's own address (same portal only).
function framePath(src, from) {
  try { const u = new URL(src, "https://portal.ewubd.edu" + from); return u.origin === "https://portal.ewubd.edu" ? u.pathname + u.search : ""; } catch { return ""; }
}
async function readOne(bridge, p, menu) {
  const link = p.menu && menu.find(([t]) => p.menu.test(t));
  for (const path of [...new Set([link?.[1], ...p.paths].filter(Boolean))]) {
    let d = await readPage(bridge, path, p).catch(() => null);
    const fp = !hasData(d) && d?.frames?.length ? framePath(d.frames[0], path) : "";
    if (fp) d = await readPage(bridge, fp, p).catch(() => null);
    if (hasData(d)) return d;
  }
  return null;
}

/* Read everything. onStep(label, state) with state "reading" | "done" | "skipped".
   → { api: { semesters, offered, offeredSem } | null, pages: [{ kind, page, text }] } */
export async function readAll(bridge, onStep = () => {}) {
  const out = { api: null, pages: [] };
  let menu = [];
  try { menu = JSON.parse((await bridge.exec({ script: MENU_JS })).result || "[]"); } catch { menu = []; }

  API_STEPS.forEach((l) => onStep(l, "reading"));
  try {
    const r = await bridge.exec({ script: API_JS, waitJs: "window.__ewud ? 'yes' : 'no'", result: "window.__ewud || ''", timeout: 90000 });
    out.api = JSON.parse(r.result || "null");
  } catch { out.api = null; }
  if (!out.api?.semesters?.length) {
    // Fallback: the Class Schedule page with whatever semester it opens on.
    const d = await readOne(bridge, SCHEDULE_PAGE, menu).catch(() => null);
    if (d) out.pages.push({ kind: "schedule", page: d.page || "Class Schedule", text: d.text });
    onStep(API_STEPS[0], d ? "done" : "skipped");
  } else onStep(API_STEPS[0], "done");
  onStep(API_STEPS[1], out.api?.offered?.length ? "done" : "skipped");

  for (const p of PORTAL_PAGES) {
    onStep(p.label, "reading");
    const d = await readOne(bridge, p, menu).catch(() => null);
    if (d) out.pages.push({ kind: p.kind, page: d.page || p.label, text: d.text });
    onStep(p.label, d ? "done" : "skipped");
  }
  return out;
}
