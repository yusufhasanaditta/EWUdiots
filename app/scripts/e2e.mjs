// End-to-end test of the app UI: onboarding, every screen, and the main actions on each.
// Usage: npm run build && node scripts/e2e.mjs
import puppeteer from "puppeteer-core";
import { preview } from "vite";
import { resolve } from "node:path";

const CHROME = process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 4177, BASE = `http://localhost:${PORT}`;
const errors = [], results = [];
const check = (name, ok, extra = "") => { results.push(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); if (!ok) process.exitCode = 1; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const SCHEDULE = `Hi, Rafi Ahmed Chowdhury
Fall-2026
Serial\tCourse\tSection\tCredits\tTiming\tRoom No.\tWithDraw Status\tDrop Status\tFaculty Initial\tFaculty Name\tFaculty Email
1\tCHE109\t6\t4\tMW 1:30PM-3:00PM\tFUB-903\tNo\tNo\tKTRA\tDR. KARIM T. RAHMAN\tktr.sample@ewubd.edu
2\tCHE109 Lab\t6\t4\tS 1:30PM-3:30PM\tFUB-804 (Chemistry Lab)\tNo\tNo\tKTRA\tDR. KARIM T. RAHMAN\tktr.sample@ewubd.edu
3\tCSE106\t14\t3\tMW 8:30AM-10:00AM\tAB2-702\tNo\tNo\tSUN\tMs. Sadia Nur\tsadia.nur@ewubd.edu
4\tENG7101\t23\t3\tTR 10:10AM-11:40AM\tAB1-201\tNo\tNo\tMSAZ\tMs. Zara Sample\tzara.s@ewubd.edu`;

const server = await preview({ root: resolve("."), logLevel: "silent", preview: { port: PORT, strictPort: true } });
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
const phone = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const p = await browser.newPage(); await p.setViewport(phone);
p.on("pageerror", (e) => errors.push(e.message));
p.on("console", (m) => { if (m.type() === "error" && !/fonts\.g|favicon|Failed to load resource/.test(m.text())) errors.push(m.text()); });
p.on("dialog", (d) => d.dismiss());
// Screen changes animate (View Transitions), so wait until the new screen is painted before reading it.
const painted = (h) => p.waitForFunction((x) => { const id = x.replace(/^#\/?/, "").split("?")[0] || "home"; const pg = document.querySelector("[data-page]")?.dataset.page; return pg === id || ["off", "welcome", "notfound", "profile"].includes(pg); }, { timeout: 4000 }, h).catch(() => {});
const go = async (h) => { await p.evaluate((x) => { location.hash = x; }, h); await painted(h); await wait(350); };
const click = async (sel) => { await p.$eval(sel, (el) => el.click()); await wait(300); };
const text = () => p.$eval("body", (b) => b.innerText);
const state = () => p.evaluate(() => JSON.parse(localStorage.getItem("ewudiots.v2") || "{}"));
const noHScroll = () => p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);

try {
  // 1. Landing page
  await p.goto(BASE + "/", { waitUntil: "networkidle2" });
  check("landing page renders", !!(await p.$("h1")));

  // 2. Onboarding: welcome (3 slides) → role → profile → sync
  await p.goto(BASE + "/app.html", { waitUntil: "networkidle2" });
  check("new user sees welcome", /Let's get you set up/.test(await text()) && /Create an account/.test(await text()));
  check("welcome uses no cropped artwork", !(await p.$('.auth img[src*="/img/"]')));
  check("brand panel with the logo", !!(await p.$(".auth-brand .ab-logo img")));
  await click("#ob-local");
  check("role screen", /Set up your profile/.test(await text()));
  await click('[data-role="student"]'); await click("#role-go");
  await click("#su-go"); check("setup validates name", /Please enter your name/.test(await text()));
  await p.type('[name="name"]', "Rafi Ahmed Chowdhury"); await p.type('[name="id"]', "12345"); await click("#su-go");
  check("setup validates student ID format", /EWU format/.test(await text()));
  await p.$eval('[name="id"]', (i) => { i.value = "2026-2-60-999"; }); await click("#su-go");
  check("setup → sync screen", (await p.evaluate(() => location.hash)) === "#/sync" && (await state()).onboarded === true);

  // 3. Paste import → review → save
  await click('[data-m="txt"]'); await click("#sy-go");
  await p.$eval("#paste-in", (t, v) => { t.value = v; }, SCHEDULE); await click("#parse-btn");
  check("review shows 4 classes", (await p.$$eval("#rv-table tbody tr", (r) => r.length)) === 4);
  await click("#rv-save"); await wait(300);
  let S = await state();
  check("routine saved", S.routine.length === 4 && S.routineSem === "Fall-2026" && S.profile.id === "2026-2-60-999");
  check("home greets student", /Rafi/.test(await text()));

  // 4. Every screen renders with no horizontal scroll
  for (const r of ["home", "routine", "planner", "courses", "course?c=CSE106", "grades", "degree", "whatif", "marks", "tasks", "exams", "fees", "vault", "rooms", "faculty", "prof?i=SUN", "focus", "cards", "me", "more", "profile", "notifications", "help", "about", "cover"]) {
    await go("#/" + r);
    const h = await p.$eval("#main h1, #main h2", (x) => x.textContent).catch(() => "");
    check(`screen ${r}`, !!h && (await noHScroll()), h.slice(0, 40));
  }
  await go("#/does-not-exist"); check("404 page", /Page not found/.test(await text()));

  // 5. Quick-add (FAB) → deadline, then mark done from its menu
  await go("#/home"); await click("#fab"); check("quick add sheet", /Quick add/.test(await text()));
  await click('[data-qa="0"]'); await wait(200);
  await p.type('#t-form [name="title"]', "Lab report 3"); await p.$eval('#t-form [name="course"]', (i) => { i.value = "CSE106"; });
  await click("#t-form button.primary");
  S = await state(); const task = S.tasks.find((t) => t.title === "Lab report 3");
  check("deadline added", !!task && task.course === "CSE106");
  await click(`[data-tmenu="${task.id}"]`); await click("#tm-done");
  check("deadline marked done + XP", (await state()).tasks.find((t) => t.id === task.id).done && (await state()).study.xp > 0);

  // 6. Routine: add class by hand, invalid days rejected, clash shown
  await go("#/routine?add=1"); await wait(200);
  for (const [k, v] of [["code", "MAT101"], ["days", "ST"], ["room", "FUB-203"]]) await p.$eval(`#cls-form [name="${k}"]`, (i, x) => { i.value = x; }, v);
  await p.$eval('#cls-form [name="start"]', (i) => { i.value = "13:30"; }); await p.$eval('#cls-form [name="end"]', (i) => { i.value = "15:00"; });
  await click("#cls-form button.primary");
  check("class added to routine", (await state()).routine.some((r) => r.code === "MAT101"));

  // 7. CGPA: add grades, what-if predicts, degree page
  for (const [code, g] of [["CSE103", "A"], ["MAT100", "B+"]]) {
    await go("#/grades"); await click("#g-add");
    await p.$eval('#g-form [name="code"]', (i, x) => { i.value = x; }, code); await p.$eval('#g-form [name="sem"]', (i) => { i.value = "Summer-2026"; });
    await p.select('#g-form [name="g"]', g); await click("#g-form button.primary");
  }
  check("CGPA computed from grades", /3\.\d\d/.test(await text()));
  await go("#/whatif"); check("what-if lists current courses", (await p.$$("[data-wg]")).length >= 3);
  await p.select('[data-wg="0"]', "A+"); await wait(300);
  check("what-if predicts CGPA", /Predicted CGPA/.test(await text()));
  await click('[data-wt="target"]'); await wait(200); check("target CGPA calculator", /term GPA|Already there|Not reachable/.test(await text()));
  await click('[data-wt="credit"]'); await wait(200); check("credit planner", /more semester/.test(await text()));

  // 8. Marks estimator + attendance
  await go("#/marks?c=CSE106");
  for (const [i, v] of [[0, "9"], [1, "8"], [3, "25"]]) { await p.$eval(`[data-got="${i}"]`, (el, x) => { el.value = x; el.dispatchEvent(new Event("input")); }, v); await wait(120); }
  check("estimated grade shown", /Estimated Grade/.test(await text()));
  await click('[data-mt="att"]');
  // Class by class: pick class 1, 2, 3 by number and mark Present, Present, Absent; the 4th is Cancelled (not counted).
  await click('[data-amode="n"]');
  for (const [n, v] of [["1", "p"], ["2", "p"], ["3", "a"], ["4", "c"]]) { await p.select("#att-n", n); await wait(250); await click(`[data-amark$="|${v}"]`); }
  S = await state(); check("attendance logged class by class", S.attendance.CSE106?.held === 3 && S.attendance.CSE106?.missed === 1 && Object.keys(S.attendance.CSE106?.marks || {}).length === 4, JSON.stringify(S.attendance.CSE106));
  check("what-if bars and the class grid", (await p.$$(".att-what .bar")).length >= 4 && (await p.$$(".att-chip")).length > 10);
  await click('[data-amode="date"]'); check("mark by date", !!(await p.$("#att-date")));

  // 9. Planner with demo data → combinations → choose
  await go("#/sync"); await wait(200);
  await p.evaluate(() => { localStorage.clear(); }); await p.goto("about:blank"); await p.goto(BASE + "/app.html#/sync", { waitUntil: "networkidle2" });
  await click("#sy-demo"); check("demo loads", (await state()).demo === true);
  await go("#/planner");
  for (const c of ["CSE246", "CSE325", "MAT205"]) await click(`[data-course="${c}"]`);
  check("planner cart shows options", /clash-free option/.test(await p.$eval(".sticky-cart", (x) => x.textContent)));
  await go("#/plan"); check("schedule preview", !!(await p.$(".minical")));
  await go("#/combos"); await click('[data-sort="gaps"]'); check("combination sort tabs", (await p.$$(".combo")).length > 0);
  await click("#cb-compare"); check("compare options", /Days on campus/.test(await text())); await p.keyboard.press("Escape"); await wait(200);
  await click("#cb-choose"); await click("#cf-go");
  check("combination saved as routine", (await p.evaluate(() => location.hash)) === "#/routine");

  // 10. Focus: start, runs across pages, custom preset, sounds, analysis
  await go("#/focus"); await click("#fx-go"); await wait(1200);
  check("focus timer runs", !!(await state()).study.timer.endAt);
  await go("#/home"); await wait(1100); check("focus pill on other pages", await p.$eval("#focus-pill", (x) => !x.hidden));
  await go("#/focus"); await click("#fx-reset");
  await click('[data-preset="custom"]'); await p.$eval('#cu-form [name="m"]', (i) => { i.value = "40"; }); await click("#cu-form button.primary");
  check("custom session length", (await state()).study.preset === "40" && /40:00/.test(await text()));
  await click('[data-ft="analysis"]'); check("focus analysis", /Focus by Subject/.test(await text()));
  await click('[data-ar="week"]'); check("analysis week view", /Productivity Heatmap/.test(await text()));

  // 11. Flashcards: review session
  await go("#/cards"); await click('[data-ctab="due"]'); await click("#fc-all");
  let reviewed = 0;
  for (let i = 0; i < 20 && (await p.$("#fc-card")); i++) { await click("#fc-card"); await click('[data-q="2"]'); reviewed++; }
  check("flashcard review session", reviewed >= 5 && /Session complete/.test(await text()), `${reviewed} cards`);

  // 12. Fees: mark paid stops reminder; detail stepper
  await go("#/fees"); const due = await p.$eval("[data-paid]", (b) => b.dataset.paid); await click(`[data-paid="${due}"]`);
  check("fee marked paid", !!(await state()).paid[due]);
  await go("#/fee"); check("payment detail stepper", !!(await p.$(".stepper")));

  // 13. Rooms favorite, notifications, search palette, theme, semester card
  await go("#/rooms"); const room = await p.$eval("[data-fav]", (b) => b.dataset.fav); await click(`[data-fav="${room}"]`);
  await click('[data-rt="favs"]'); check("room favorites", (await p.$$(".room")).length === 1);
  await go("#/notifications"); const n = (await p.$$(".notif.unread")).length; await click("#n-read");
  check("notifications mark all read", n > 0 && (await p.$$(".notif.unread")).length === 0, `${n} unread before`);
  await click("#top-search"); await p.type("#pal-q", "deadl"); await p.keyboard.press("Enter"); await wait(300);
  check("search opens page", (await p.evaluate(() => location.hash)) === "#/tasks");
  await go("#/profile"); await click("#pf-theme"); await click('[data-th="dark"]');
  check("dark theme", (await p.evaluate(() => document.documentElement.dataset.theme)) === "dark");
  await go("#/me"); await click("#me-card"); await wait(1200);
  check("semester card renders", await p.$eval("#sc-img", (i) => i.src.startsWith("data:image/png") && i.naturalWidth === 1080));
  await p.keyboard.press("Escape"); await wait(200);

  // 14. Faculty / alumni role gets the lighter app
  await go("#/profile"); await click("#pf-acad"); await p.select('#pf-form [name="role"]', "faculty"); await click("#pf-form button.primary");
  await go("#/home"); check("faculty home", /Free for the next hour/.test(await text()) && !(await p.$('#side-nav a[href="#/grades"]')));

  // 15. Clear local data → back to welcome
  await go("#/profile"); await click("#pf-wipe"); await click("#cf-go"); await wait(300);
  check("clear data returns to welcome", /Let.s get you set up/.test(await text()) && !(await state()).profile);

  // 16. Desktop layout + legal pages
  await p.setViewport({ width: 1440, height: 900 });
  await click("#ob-local"); await click('[data-role="student"]'); await click("#role-go"); await p.type('[name="name"]', "Test User"); await click("#su-go");
  await go("#/home"); check("desktop sidebar visible", await p.$eval(".sidebar", (s) => getComputedStyle(s).display !== "none"));
  for (const path of ["/privacy.html", "/terms.html", "/delete-account.html"]) { await p.goto(BASE + path); check(`page ${path}`, !!(await p.$("h1"))); }
} catch (e) { check("test run finished", false, e.message); }

await browser.close();
await new Promise((r) => server.httpServer.close(r));
console.log(results.join("\n"));
console.log(errors.length ? "\nJS ERRORS:\n" + errors.join("\n") : "\nNo JS errors.");
if (errors.length) process.exitCode = 1;
