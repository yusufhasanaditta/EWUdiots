/* Portal sync (Android app): sign in to portal.ewubd.edu on the phone and read the student's pages.
   `bridge` is the native PortalSync plugin (android/…/PortalSyncPlugin.java): open → login → read(page)… → close.
   Tests drive the same steps with a fake bridge over the portal replicas in tests/fixtures/portal-pages.mjs. */
import { SCRAPE_JS } from "./portal-scrape.js";

export const PORTAL_PAGES = [
  { kind: "profile", label: "Profile", path: "/Home/Profile", waitFor: "Admitted|Student\\s*ID" },
  { kind: "schedule", label: "Class schedule", path: "/Home/StudentClassSchedule", click: "show\\s*courses", waitFor: "Faculty\\s*Initial" },
  { kind: "grades", label: "Grade report", path: "/ReportForms/rptGradeSheetStudent.aspx", waitFor: "CGPA|Term\\s*GPA" },
  { kind: "degree", label: "Degree review", path: "/Home/StudentDegreeReview", waitFor: "Out\\s*of" },
  { kind: "rules", label: "Advising rules", path: "/Home/AdvisingRules", waitFor: "Max\\s*Course" },
  { kind: "slip", label: "Advising slip and fees", path: "/ReportForms/AdvisingSlip.aspx", waitFor: "Grand\\s*Total|Deposit" }
];

/* Open the login page. → { login: true, first, second } (EWU's "first + second = ?" check), or { login: false } if
   the phone is still signed in from a moment ago. */
export async function start(bridge) { return bridge.open(); }

/* Fill EWU's login form. Throws a readable error (with the new check numbers) when the portal refuses. */
export async function signIn(bridge, { id, password, answer }) {
  if (!/^\d{4}-\d-\d{2}-\d{3}$/.test(String(id).trim())) throw Object.assign(new Error("Enter your student ID like 2024-1-60-123."), { field: "id" });
  if (!password) throw Object.assign(new Error("Enter your portal password."), { field: "password" });
  if (!/^\d{1,3}$/.test(String(answer).trim())) throw Object.assign(new Error("Answer EWU's small sum (for example 3 + 18 = 21)."), { field: "answer" });
  const st = await bridge.login({ username: String(id).trim(), password, answer: String(answer).trim() });
  if (st.login) throw Object.assign(new Error(st.error || "The portal didn't accept that. Check your ID, password and the sum."), { status: st });
  return st;
}

/* Read every page. onStep(label, state) with state "reading" | "done" | "skipped". → [{ kind, page, text }] */
export async function readAll(bridge, onStep = () => {}) {
  const out = [];
  for (const p of PORTAL_PAGES) {
    onStep(p.label, "reading");
    try {
      const r = await bridge.read({ path: p.path, click: p.click, waitFor: p.waitFor, script: SCRAPE_JS, timeout: 9000 });
      const data = JSON.parse(r.result || "{}");
      if (data.text && /\d/.test(data.text)) { out.push({ kind: data.kind || p.kind, page: data.page || p.label, text: data.text }); onStep(p.label, "done"); }
      else onStep(p.label, "skipped");
    } catch { onStep(p.label, "skipped"); }
  }
  return out;
}
