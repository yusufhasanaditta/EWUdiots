// End-to-end test: Campus News, Alumni, admin-managed content in the app, the admin panel (demo mode), motion, landing.
// Usage: npm run build && node scripts/community-e2e.mjs   (SHOTS=<dir> saves screenshots)
import puppeteer from "puppeteer-core";
import { preview } from "vite";
import { resolve, join } from "node:path";
import { mkdirSync } from "node:fs";

const CHROME = process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 4184, BASE = `http://localhost:${PORT}`, SHOTS = process.env.SHOTS;
const errors = [], results = [];
const check = (name, ok, extra = "") => { results.push(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); if (!ok) process.exitCode = 1; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
process.env.NOTICES_FIXTURE = resolve("tests/fixtures/ewu-notice-board.html");
process.env.NEWS_FIXTURE = resolve("tests/fixtures/ewu-news.html");
const server = await preview({ root: resolve("."), logLevel: "silent", preview: { port: PORT, strictPort: true } });
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
const p = await browser.newPage();
p.on("pageerror", (e) => errors.push(e.message));
p.on("console", (m) => { if (m.type() === "error" && !/fonts\.g|favicon|Failed to load resource|ERR_|net::/.test(m.text())) errors.push(m.text()); });
// Screen changes animate (View Transitions), so wait until the new screen is painted before reading it.
const painted = (h) => p.waitForFunction((x) => { const id = x.replace(/^#\/?/, "").split("?")[0] || "home"; const pg = document.querySelector("[data-page]")?.dataset.page; return pg === id || ["off", "welcome", "notfound", "profile"].includes(pg); }, { timeout: 4000 }, h).catch(() => {});
const go = async (h, ms = 600) => { await p.evaluate((x) => { location.hash = x; }, h); await painted(h); await wait(ms); };
const click = async (sel, ms = 400) => { await p.$eval(sel, (el) => el.click()); await wait(ms); };
const text = () => p.$eval("body", (b) => b.innerText);
const shot = async (n) => { if (SHOTS) await p.screenshot({ path: join(SHOTS, n + ".png") }); };
const noHScroll = () => p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
const STATE = { onboarded: true, role: "student", profile: { name: "Tanvir Test", id: "2026-1-60-001" } };

try {
  // ── App: news + alumni ──
  await p.setViewport({ width: 1440, height: 900 });
  await p.goto(BASE + "/privacy.html", { waitUntil: "networkidle2" }); // no app running, so nothing overwrites the state
  await p.evaluate((s) => { localStorage.clear(); localStorage.setItem("ewudiots.v2", JSON.stringify(s)); }, STATE);
  await p.goto(BASE + "/app.html#/news", { waitUntil: "networkidle2" }); await wait(1200);
  let t = await text();
  check("news page shows official EWU news", /Campus News/.test(t) && (await p.$$eval(".news-card", (c) => c.length)) >= 8 && !!(await p.$(".news-lead")));
  check("news cards have photos", (await p.$$eval(".news-card .nc-img img", (i) => i.length)) >= 6);
  await click('[data-ntag="Research"]', 500);
  check("news tag filter", (await p.$$eval(".news-card, .news-lead", (c) => c.length)) >= 1 && /Research/.test(await text()));
  await shot("news");
  await go("#/home", 900);
  check("home shows a campus news strip", (await p.$$eval(".news-mini", (c) => c.length)) >= 3);
  await go("#/alumni", 1400);
  t = await text();
  check("alumni page: stats + cards", /alumni stories/.test(t) && (await p.$$eval(".alum", (c) => c.length)) >= 20);
  check("alumni shows where they work abroad", /USA/.test(t) && /Amazon Web Services/.test(t));
  await click('[data-country="USA"]', 500);
  const usa = await p.$$eval(".alum", (c) => c.map((x) => x.innerText));
  check("country filter", usa.length >= 3 && usa.every((x) => /USA/.test(x)), `${usa.length} cards`);
  await click("#al-cx", 400); await click('[data-kind="study"]', 500);
  check("higher-study filter", (await p.$$eval(".alum", (c) => c.every((x) => /Higher study/.test(x.innerText)))));
  await click('[data-kind="All"]', 500); await p.type("#al-q", "Intel"); await wait(600);
  check("alumni search by company", /Hasan Ul Banna/.test(await text()));
  check("each story links to its newsletter", (await p.$$eval(".alum a[href*='ewubd.edu']", (a) => a.length)) >= 1);
  await p.$eval("#al-q", (i) => { i.value = ""; i.dispatchEvent(new Event("input")); }); await wait(600);
  await shot("alumni");

  // ── App: content an admin published (seeded into the offline cache) ──
  await p.goto(BASE + "/privacy.html");
  await p.evaluate(() => localStorage.setItem("ewudiots.content", JSON.stringify({ at: Date.now(),
    posts: [{ id: 1, kind: "announcement", title: "Advising opens Sunday", body: "Plan your routine early.", link: "", pinned: true, starts_at: new Date().toISOString() }, { id: 2, kind: "news", title: "EWUdiots team news post", body: "Hello from the team.", image_url: "", link: "", tag: "EWUdiots", pinned: true, starts_at: new Date().toISOString() }],
    settings: { banner: { on: true, title: "Heads up", text: "Library closes early on Thursday.", tone: "amber", link: "#/notices", cta: "Details" }, features: { vault: false } },
    faculty: [{ slug: "hosney.jahan", hidden: true, init: "", room: "" }], rooms: [{ code: "322", name: "Team room", kind: "lab", block: "B", floor: 2 }], alumni: [{ id: 9, name: "Approved Grad", role: "Data Analyst", org: "Example Co", country: "Canada", dept: "CSE", grad_year: 2022, sector: "Technology", note: "", linkedin: "" }] })));
  await p.goto(BASE + "/app.html#/home", { waitUntil: "networkidle2" }); await wait(900);
  check("home banner from the admin panel", /Library closes early on Thursday/.test(await text()));
  check("switched-off feature hidden from navigation", !(await p.$('#side-nav a[href="#/vault"]')));
  await go("#/vault", 500);
  check("switched-off page shows the 'taking a break' screen", /taking a break/.test(await text()));
  await go("#/notices", 1200);
  check("team announcement on the notice board", /Advising opens Sunday/.test(await text()));
  await go("#/news", 900);
  check("team news post leads Campus News", /EWUdiots team news post/.test(await p.$eval(".news-lead", (e) => e.innerText)));
  await go("#/alumni", 1000);
  check("approved alumni profile listed", /Approved Grad/.test(await text()));
  await go("#/faculty", 2000); await p.type("#fac-q", "Hosney"); await wait(700);
  check("hidden faculty listing is gone", !/Hosney Jahan/.test(await text()));
  await go("#/map?tab=data", 900); await p.$eval("#rd-check", (i) => { i.value = "322"; }); await click("#rd-checkgo", 400);
  check("shared campus room is Verified", /Room 322: Block B, 2nd floor/.test(await text()) && /Verified/.test(await p.$eval("#rd-out", (e) => e.innerText)));

  // ── Motion ──
  const vt = await p.evaluate(() => typeof document.startViewTransition === "function");
  check("view transitions available for screen changes", vt);
  check("spring easing defined", await p.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--spring").includes("linear")));
  check("fluid blobs on the home hero", await p.evaluate(async () => { location.hash = "#/home"; await new Promise((r) => setTimeout(r, 900)); return document.querySelectorAll(".fluid i").length >= 3; }));
  await p.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
  check("reduced motion stops the blobs", await p.evaluate(() => getComputedStyle(document.querySelector(".fluid i")).animationName === "none"));
  await p.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "no-preference" }]);
  check("app: no JS errors", errors.length === 0, errors.join(" | "));

  // ── Admin panel (demo mode) ──
  await p.goto(BASE + "/admin.html", { waitUntil: "networkidle2" }); await p.evaluate(() => localStorage.removeItem("ewudiots.admin.demo"));
  await p.reload({ waitUntil: "networkidle2" }); await wait(400);
  check("admin: sign-in screen with demo option", /EWUdiots Admin/.test(await text()) && !!(await p.$("#lg-demo")));
  await click("#lg-demo", 1200);
  t = await text();
  check("admin overview: KPIs + live feeds", (await p.$$eval(".kpi", (k) => k.length)) === 10 && /Sign-ups, last 30 days/.test(t) && /Live feeds/.test(t) && /Demo mode/.test(t));
  check("admin: feeds healthy", (await p.$$eval("#feeds .itile.green", (i) => i.length)) === 2);
  check("admin: badges for pending work", await p.$eval('[data-badge="alumni"]', (b) => !b.hidden && b.textContent === "2"));
  await shot("admin-overview");
  await click("#qa-post", 500);
  await p.type('#pf [name="title"]', "Exam routine published"); await p.type('#pf [name="body"]', "Check the notice board."); await click("#pf button.primary", 800);
  await click('[data-tab="posts"]', 700);
  check("admin: publish an announcement", /Exam routine published/.test(await text()));
  await click('[data-tab="banner"]', 700);
  await p.$eval('#bn [name="text"]', (i) => { i.value = "Campus closed Friday"; i.dispatchEvent(new Event("input", { bubbles: true })); });
  check("admin: banner live preview", /Campus closed Friday/.test(await p.$eval("#bn-prev", (e) => e.innerText)));
  await click("#bn button.primary", 600);
  await click('[data-tab="features"]', 600);
  await p.$eval("#ft-vault", (c) => { c.checked = false; }); await click("#ft button.primary", 600);
  const demo = () => p.evaluate(() => JSON.parse(localStorage.getItem("ewudiots.admin.demo")));
  let D = await demo();
  check("admin: banner + features saved", D.site_settings.find((s) => s.key === "banner").value.text === "Campus closed Friday" && D.site_settings.find((s) => s.key === "features").value.vault === false);
  await click('[data-tab="alumni"]', 800);
  await click("[data-ap]", 700);
  D = await demo();
  check("admin: approve an alumni profile", D.alumni_profiles.filter((a) => a.status === "approved").length === 1 && await p.$eval('[data-badge="alumni"]', (b) => b.textContent === "1"));
  await click('[data-tab="faculty"]', 1800);
  await p.type("#fq", "Hosney"); await wait(400); await click("[data-fe]", 500);
  await p.$eval("#fe-hide", (c) => { c.checked = true; }); await p.type('#fe [name="init"]', "HJN"); await click("#fe button.primary", 600);
  D = await demo();
  check("admin: hide a faculty listing + set initials", D.faculty_overrides.some((o) => o.slug === "hosney.jahan" && o.hidden && o.init === "HJN"));
  await click('[data-tab="rooms"]', 700); await click("#nr", 400);
  await p.type('#rf [name="code"]', "448"); await p.select('#rf [name="block"]', "CS"); await p.$eval('#rf [name="block"]', (s) => s.dispatchEvent(new Event("change"))); await p.select('#rf [name="floor"]', "3"); await click("#rf button.primary", 600);
  D = await demo();
  check("admin: add a shared campus room", D.campus_rooms.some((r) => r.code === "448" && r.block === "CS" && r.floor === 3));
  await click('[data-tab="reports"]', 800);
  check("admin: reported review shown with its text", /Sample reported review/.test(await text()) && /2 reports/.test(await text()));
  await click("[data-hide]", 600);
  D = await demo();
  check("admin: hide a reported review", D.reviews[0].status === "hidden");
  await click("[data-dismiss]", 600);
  check("admin: dismiss reports", (await demo()).reports.length === 0 && /No open reports/.test(await text()));
  await click('[data-tab="activity"]', 600);
  t = await text();
  check("admin: activity log records every change", ["Published post", "Updated home banner", "Changed features", "Approved alumni profile", "Hid faculty listing", "Added room", "Hid review", "Dismissed reports"].every((a) => t.includes(a)));
  await p.keyboard.down("Control"); await p.keyboard.press("k"); await p.keyboard.up("Control"); await wait(300);
  await p.type("#jk-q", "alum"); await p.keyboard.press("Enter"); await wait(700);
  check("admin: Ctrl+K jump", (await p.evaluate(() => location.hash)) === "#alumni");
  await p.setViewport({ width: 390, height: 844 }); await wait(600); // isMobile would reload the page
  await click("#adm-menu", 700);
  check("admin: phone drawer opens", await p.$eval("#admin", (a) => a.classList.contains("drawer")));
  check("admin: fits a phone screen", await noHScroll());
  await shot("admin-phone");

  // ── Landing ──
  await p.setViewport({ width: 1440, height: 900 });
  await p.goto(BASE + "/", { waitUntil: "networkidle0" }); await wait(800);
  check("landing: liquid hero", (await p.$$eval(".hero .liquid i", (i) => i.length)) === 4);
  check("landing: live campus news", (await p.$$eval("#lnews .ncard", (c) => c.length)) === 3);
  check("landing: alumni numbers from the data", Number(await p.$eval("#al-n", (e) => e.dataset.to)) >= 90);
  check("landing: no horizontal scroll", await noHScroll());
  check("no JS errors", errors.length === 0, errors.join(" | "));
} catch (e) { check("run completed", false, e.stack); }
finally {
  console.log(results.join("\n"));
  console.log(`\n${results.filter((r) => r.startsWith("PASS")).length}/${results.length} passed`);
  await browser.close(); await server.close();
}
