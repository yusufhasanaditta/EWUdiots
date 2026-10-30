/* global chrome */
// Full real-world test of the Chrome extension + app, in real Chrome:
// installs extension/ unpacked, browses portal-shaped pages (fake data) served at
// https://portal.ewubd.edu, lets auto-save capture them, sends them to the app via the
// popup, saves, and checks every imported value — and that no private data leaked.
// Usage: npm run build && node scripts/ext-e2e.mjs
import puppeteer from "puppeteer-core";
import { preview } from "vite";
import { resolve } from "node:path";
import { PAGES, STUDENT, SENSITIVE } from "../tests/fixtures/portal-pages.mjs";

const CHROME = process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 4174, APP = `http://localhost:${PORT}/app.html`;
const results = [], errors = [];
const check = (name, ok, extra = "") => { results.push(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); if (!ok) process.exitCode = 1; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const leaks = (text) => SENSITIVE.filter((s) => text.includes(s));

const server = await preview({ root: resolve("."), logLevel: "silent", preview: { port: PORT, strictPort: true } });
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, pipe: true, enableExtensions: true, args: ["--no-sandbox"] });
const extId = await browser.installExtension(resolve("../extension"));

async function portalTab() {
  const p = await browser.newPage();
  await p.setRequestInterception(true);
  p.on("request", (r) => {
    const u = new URL(r.url());
    if (u.hostname !== "portal.ewubd.edu") return r.continue();
    const html = PAGES[u.pathname];
    r.respond(html ? { status: 200, contentType: "text/html; charset=utf-8", body: html } : { status: 404, body: "" });
  });
  p.on("pageerror", (e) => errors.push(`portal: ${e.message}`));
  return p;
}
const extPage = async () => {
  const p = await browser.newPage();
  await p.goto(`chrome-extension://${extId}/popup.html`);
  return p;
};
// Pages are stored one per key, "page:<kind>".
const stored = async (p) => {
  const all = await p.evaluate(() => chrome.storage.local.get(null));
  return { ...all, pages: Object.fromEntries(Object.entries(all).filter(([k]) => k.startsWith("page:")).map(([k, v]) => [k.slice(5), v])) };
};

try {
// 1. Browse the portal like a student. Auto-save should capture each page once data shows.
const portal = await portalTab();
await portal.goto("https://portal.ewubd.edu/");
await portal.type("#username", STUDENT.id); await portal.type("#pass", "Secret#123");
await wait(1500);
const visits = [
  ["/Home/Profile"], ["/Home/ClassSchedule", "#show"], ["/Home/AdvisingRules"], ["/ReportForms/rptGradeSheetStudent.aspx"],
  ["/Home/DegreeReview"], ["/ReportForms/AdvisingSlip.aspx?token=abc123"], ["/Home/OfferedCoursesStudent", "#show"], ["/Home/PreCourseRegistration"]
];
for (const [path, show] of visits) {
  await portal.goto("https://portal.ewubd.edu" + path);
  if (show) { await wait(1300); await portal.click(show); }
  await wait(1600);
}
check("floating Sync button injected on portal", await portal.$$eval("button", (b) => b.some((x) => /EWUdiots|Saved/.test(x.textContent))));

// 2. What the extension stored
let popup = await extPage();
const st = await stored(popup);
const kinds = Object.keys(st.pages || {}).sort();
check("auto-save captured all 8 page types", kinds.join() === "degree,grades,offered,preadvising,profile,rules,schedule,slip", kinds.join());
if (process.env.DUMP) console.log(Object.values(st.pages).map((p) => `== ${p.kind}\n${p.text}`).join("\n"));
const allText = Object.values(st.pages || {}).map((p) => p.text).join("\n");
check("extension stored no private data (phone, address, NID, DOB, password…)", !leaks(JSON.stringify(st)).length, leaks(JSON.stringify(st)).join(", "));
check("login page not captured", !Object.values(st.pages || {}).some((p) => p.path === "/"));
check("sidebar menu dropped", !/OFFERED COURSES|GRADE REPORT/.test(allText));
check("only the selected semester kept", st.pages?.schedule?.text.includes("Fall-2026") && !st.pages?.schedule?.text.includes("Spring-2027"));
check("read-only boxes read (Degree Review)", /CGPA: 3\.15/.test(st.pages?.degree?.text || "") && /Cr Earn: 7\.5/.test(st.pages?.degree?.text || ""));
check("hidden tab content ignored", !allText.includes("XYZ999"));
check("slip token not kept in key", !Object.keys(st.pages || {}).some((k) => k.includes("abc123")));

// 3. Popup checklist
await popup.reload(); await wait(300);
const done = await popup.$$eval("#pages li.done", (l) => l.length);
check("popup checklist shows 8 saved pages", done === 8, `${done} saved`);
// With accounts configured (extension/config.js), nothing leaves the extension until you sign in.
const hasAccounts = await popup.evaluate(() => Boolean(self.EWUD_CONFIG?.supabaseUrl));
if (hasAccounts) check("with accounts: sign-in required before sending", await popup.$eval("#auth-out", (s) => !s.hidden) && await popup.$eval("#send", (b) => b.disabled) && await popup.$eval("#open", (b) => b.disabled));
else check("without accounts: one-click open button ready", await popup.$eval("#open", (b) => !b.disabled && /8 pages/.test(b.textContent)) && await popup.$eval("#send", (b) => b.hidden));

// 4. Sign in (EWU email + 6-digit code) against a mock Supabase, then save the pages to the account inbox.
const SB = "https://mock-ewud.supabase.co", sent = [];
await popup.evaluate((u) => chrome.storage.local.set({ backendOverride: { url: u, key: "anon-test-key" } }), SB);
await popup.setRequestInterception(true);
popup.on("request", (r) => {
  if (!r.url().startsWith(SB)) return r.continue();
  const u = new URL(r.url()), body = r.postData() ? JSON.parse(r.postData()) : null;
  sent.push({ path: u.pathname + u.search, body, auth: r.headers().authorization, apikey: r.headers().apikey });
  const json = (status, b) => r.respond({ status, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: b ? JSON.stringify(b) : "" });
  if (u.pathname === "/auth/v1/token" && u.searchParams.get("grant_type") === "password") return body.password === "Secret123" ? json(200, { access_token: "tok-1", refresh_token: "ref-1", expires_in: 3600, user: { id: "user-1", email: body.email } }) : json(400, { error: "invalid_grant", error_description: "Invalid login credentials" });
  if (u.pathname === "/rest/v1/user_data") return json(200, []);
  if (u.pathname === "/rest/v1/portal_inbox") return json(201);
  json(404, { msg: "not mocked" });
});
await popup.reload(); await wait(400);
check("popup asks to sign in first", await popup.$eval("#auth-out", (e) => !e.hidden) && await popup.$eval("#send", (b) => b.disabled && /Sign in/.test(b.textContent)));
check("hand-off is locked until sign-in", await popup.$eval("#open", (b) => b.disabled));
await popup.type("#email", "2026-1-60-001"); await popup.type("#pw", "nope1234"); await popup.click("#mail-go"); await wait(400);
check("wrong password shows an error", /Wrong ID.email or password/.test(await popup.$eval("#status", (s) => s.textContent)));
check("student ID becomes the EWU email", sent.some((s) => s.path.startsWith("/auth/v1/token") && s.body.email === "2026-1-60-001@std.ewubd.edu" && s.apikey === "anon-test-key"));
check("forgot password and create account open the app", await popup.$$eval("[data-app]", (l) => l.map((a) => a.dataset.app).join(" ")) === "#/login?m=forgot #/login?m=signup");
await popup.$eval("#pw", (i) => { i.value = ""; }); await popup.type("#pw", "Secret123"); await popup.click("#mail-go"); await wait(500);
check("signed in: account shown", await popup.$eval("#auth-in", (e) => !e.hidden) && /2026-1-60-001/.test(await popup.$eval("#me-mail", (e) => e.textContent)));
check("session stored in extension storage", (await stored(popup)).session?.user?.id === "user-1");
await popup.click("#send"); await wait(600);
const ins = sent.find((s) => s.path === "/rest/v1/portal_inbox");
check("pages saved to the account inbox with the user's token", ins && ins.auth === "Bearer tok-1" && ins.body.user_id === "user-1" && ins.body.pages.length === 8, ins ? `${ins.body.pages.length} pages` : "no request");
check("inbox upload has no private data", ins && !leaks(JSON.stringify(ins.body)).length);
check("popup confirms the save", /Saved 8 pages/.test(await popup.$eval("#status", (s) => s.textContent)));

// 5. Open in the app directly (URL-fragment hand-off) and save
await popup.$eval("#app-url", (i, u) => { i.value = u; i.dispatchEvent(new Event("change")); }, APP);
await wait(200);
const appTarget = browser.waitForTarget((t) => t.url().startsWith(APP));
await popup.click("#open");
const app = await (await appTarget).page();
app.on("pageerror", (e) => errors.push(`app: ${e.message}`));
app.on("console", (m) => { if (m.type() === "error" && !/fonts\.g|favicon|Failed to load resource/.test(m.text())) errors.push(`app: ${m.text()}`); });
await app.waitForSelector("#rv-save", { timeout: 15000 });
check("app URL fragment cleared after hand-off", await app.evaluate(() => location.hash === "#/sync"));
const reviewRows = await app.$$eval("#rv-table tbody tr", (r) => r.length);
check("review shows 5 classes (schedule + slip de-duplicated)", reviewRows === 5, `${reviewRows} rows`);
check("review semester = Fall-2026", await app.$eval("#rv-sem", (i) => i.value) === "Fall-2026");
await app.click("#rv-save"); await wait(600);
const S = await app.evaluate(() => JSON.parse(localStorage.getItem("ewudiots.v2")));
const P = S.profile;
check("profile", P.name === STUDENT.name && P.id === STUDENT.id && P.cgpa === 3.15 && P.creditsDone === 7.5 && P.creditsTotal === 140, JSON.stringify({ n: P.name, id: P.id, cg: P.cgpa, cd: P.creditsDone, ct: P.creditsTotal }));
check("advisor", P.advisor === "Dr. Nasima Akter Hossain" && P.advisorInitial === "NAH" && P.advisorEmail === "nasima.h@ewubd.edu", `${P.advisor} ${P.advisorInitial} ${P.advisorEmail}`);
check("program, department, admitted", /Computer Science/.test(P.program) && P.department === "CSE" && P.admitted === "Summer-2026", `${P.program} | ${P.department} | ${P.admitted}`);
check("routine: 5 classes incl. lab, Fall-2026", S.routine.length === 5 && S.routine.filter((r) => r.lab).length === 1 && S.routineSem === "Fall-2026", `${S.routine.length} / ${S.routineSem}`);
const cse = S.routine.find((r) => r.code === "CSE106");
check("class row values", cse && cse.days === "MW" && cse.start === "08:30" && cse.end === "10:00" && cse.room === "AB2-702" && cse.faculty === "SNR" && cse.sec === "14", JSON.stringify(cse));
check("grades: 4 Summer-2026 incl. \"Mobile Application Development\", no duplicates from Degree Review", S.grades.length === 4 && S.grades.some((g) => g.code === "CSE489" && g.g === "W") && S.grades.every((g) => g.sem === "Summer-2026"), S.grades.map((g) => `${g.code}:${g.g}:${g.sem}`).join(" "));
check("degree categories", S.degree.length === 9 && S.degree.find((d) => /^Core/.test(d.category))?.done === 4.5, `${S.degree.length}`);
check("advising rules", S.rules.maxCredit === 15 && S.rules.minCredit === 9 && S.rules.maxPerDay === 3 && S.rules.maxCourses === 6 && S.rules.minCourses === 3 && S.rules.minCgpa === 2.16, JSON.stringify(S.rules));
check("payments + fees", S.payments.schedule.length === 4 && S.payments.schedule[0].amount === 87700 && S.payments.schedule[0].due === "2026-09-24" && S.payments.fees.tuition === 81500 && S.payments.semester === "Fall-2026");
const O = S.planner.offered || {};
check("offered courses for Spring-2027 with seats + lab", S.planner.offeredSem === "Spring-2027" && Object.keys(O).length === 5 && O.CSE110?.sections.length === 2 && O.CSE110.sections[0].lab?.days === "R" && O.CSE110.sections[1].seats === 0 && O.MAT104.sections[0].seats === 25,
  `${S.planner.offeredSem} ${Object.keys(O).join(",")}`);
check("recommended courses", S.recommended.map((r) => r.code).sort().join() === "ACT101,CSE110,MAT104,PHY109", S.recommended.map((r) => r.code).join());
check("faculty directory", Object.keys(S.faculty).sort().join() === "AMS,KTRA,MSZ,SNR" && S.faculty.KTRA.email === "ktr.sample@ewubd.edu");
check("app stored no private data", !leaks(JSON.stringify(S)).length, leaks(JSON.stringify(S)).join(", "));
check("not demo", S.demo === false);

// 5. Use the real data across the app
const go = async (r) => { await app.evaluate((x) => { location.hash = x; }, r); await wait(300); };
await go("#/home");
check("dashboard greets the student", await app.$eval(".greet h1, .hero-banner h1", (h) => h.textContent.includes("Rafi")));
await go("#/routine");
check("routine page shows classes", (await app.$$eval(".tt .blk, .tt [data-code], .tt-block", (x) => x.length).catch(() => 0)) > 0 || /CSE106/.test(await app.$eval("#main", (m) => m.textContent)));
await go("#/planner");
check("planner has no demo list", !(await app.$eval("#main", (m) => /demo course list/i.test(m.textContent))));
for (const c of ["CSE110", "MAT104", "ENG7102"]) { await app.$eval(`[data-course="${c}"]`, (el) => el.click()); await wait(150); }
const combos = await app.$eval(".sticky-cart", (x) => x.textContent).catch(() => "");
check("planner builds clash-free routines from real offered data", /[1-9]\d* clash-free/.test(combos), combos.trim());
await go("#/combos");
check("best combinations listed", (await app.$$(".combo")).length > 0);
await app.$eval("#cb-choose", (b) => b.click()); await wait(300); await app.$eval("#cf-go", (b) => b.click()); await wait(500);
const S2 = await app.evaluate(() => JSON.parse(localStorage.getItem("ewudiots.v2")));
check("chosen combination saved as routine", S2.routineSem === "Spring-2027" && ["CSE110", "MAT104", "ENG7102"].every((c) => S2.routine.some((x) => x.code === c)), S2.routine.map((x) => x.code).join(","));
await go("#/grades");
check("CGPA page computes 3.15", /3\.15/.test(await app.$eval("#main", (m) => m.textContent)));
await go("#/fees");
check("fees page shows deadlines", /87,?700/.test(await app.$eval("#main", (m) => m.textContent)));
await go("#/vault");
check("vault shows no sample items for real users", !(await app.$eval("#main", (m) => /Trees & graphs/.test(m.textContent))));

// 6. The in-page bridge (app already open on localhost)
const app2 = await browser.newPage();
await app2.goto(APP + "#/sync"); await wait(600); await app2.$eval('[data-m="ext"]', (b) => b.click()); await app2.$eval("#sy-go", (b) => b.click()); await wait(800);
check("bridge: app detects extension", await app2.$eval("#ext-status", (s) => /connected/i.test(s.textContent) && !/not connected/i.test(s.textContent)));
await app2.$eval("#ext-pull", (b) => b.click()); await wait(600);
check("bridge: import opens review", !!(await app2.$("#rv-save")));

// 7. Disabling auto-save is respected
popup = await extPage();
await popup.$eval("#clear", (b) => b.click()); await popup.$eval("#auto", (c) => { c.checked = false; c.dispatchEvent(new Event("change")); }); await wait(200);
await portal.goto("https://portal.ewubd.edu/Home/Profile"); await wait(1800);
check("auto-save off: nothing captured", !Object.keys((await stored(popup)).pages || {}).length);
await portal.bringToFront();
await portal.$$eval("button", (b) => b.find((x) => /Sync to EWUdiots/.test(x.textContent)).click()); await wait(800);
check("manual Sync button still works", !!(await stored(popup)).pages?.profile);

} catch (e) { check("test run finished", false, e.message); }
await browser.close();
await new Promise((r) => server.httpServer.close(r));
console.log(results.join("\n"));
console.log(errors.length ? "\nJS ERRORS:\n" + errors.join("\n") : "\nNo JS errors.");
if (errors.length) process.exitCode = 1;
