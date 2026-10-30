// Analytics page against awkward but real data shapes (portal sign-in, Degree Review only, legacy attendance…).
// Usage: npm run build -- --mode test && node scripts/insights-probe.mjs
import puppeteer from "puppeteer-core";
import { preview } from "vite";
import { resolve } from "node:path";

const CHROME = process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 4181, BASE = `http://localhost:${PORT}`;
const base = { onboarded: true, role: "student", profile: { name: "Test Student", creditsTotal: 140 }, routine: [], grades: [], tasks: [], attendance: {} };
const CASES = {
  "grade report": { grades: [{ code: "CSE103", cr: 3, g: "A", sem: "Spring-2025" }, { code: "MAT101", cr: 3, g: "B+", sem: "Summer-2025" }, { code: "ENG101", cr: 3, g: "A-", sem: "Fall-2025" }] },
  "degree review only (no semesters)": { grades: [{ code: "CSE103", cr: 3, g: "A", sem: "" }, { code: "MAT101", cr: "3.0", g: "B+" }, { code: "PHY109", cr: 4, g: "A-" }] },
  "portal CGPA only": { profile: { name: "T", cgpa: "3.45", creditsDone: "52", creditsTotal: "140" } },
  "odd degree rows": { grades: [{ code: "CSE103", cr: 3, g: "A", sem: "Fall-2025" }], degree: [{ category: "Core", done: 9, total: 30 }, { done: 3, total: 9 }, { category: "", done: 0, total: 0 }, { category: "Elective", done: "6", total: "12" }] },
  "routine + legacy attendance": { routine: [{ code: "CSE207", day: "M", start: "08:30", end: "10:00" }], attendance: { CSE207: { held: 0, missed: 0 }, CSE209: { held: 5, missed: 2 } } },
  "no study block": { grades: [{ code: "CSE103", cr: 3, g: "A", sem: "Fall-2025" }], study: undefined },
  "semester names from portal": { grades: [{ code: "CSE103", cr: 3, g: "A", sem: "Spring 2025" }, { code: "CSE106", cr: 3, g: "B", sem: "FALL-2025" }, { code: "CSE110", cr: 3, g: "A", sem: "Summer2026" }] },
  "grades with W/I/blank": { grades: [{ code: "CSE103", cr: 3, g: "W", sem: "Fall-2025" }, { code: "CSE106", cr: 3, g: "", sem: "Fall-2025" }, { code: "CSE110", cr: 3, g: "I", sem: "Spring-2026" }] }
};
const server = await preview({ root: resolve("."), logLevel: "silent", preview: { port: PORT, strictPort: true } });
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
let failed = 0;
for (const [name, extra] of Object.entries(CASES)) {
  const p = await browser.newPage(), errs = [];
  await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  p.on("pageerror", (e) => errs.push(e.message));
  // Seed before any app code runs, once (the app saves its own state as it goes).
  await p.evaluateOnNewDocument((s) => { if (!sessionStorage.getItem("seeded")) { sessionStorage.setItem("seeded", "1"); localStorage.setItem("ewudiots.v2", JSON.stringify(s)); } }, { ...base, ...extra, profile: { ...base.profile, ...(extra.profile || {}) } });
  await p.goto(BASE + "/app.html#/insights", { waitUntil: "networkidle2" });
  await new Promise((r) => setTimeout(r, 800));
  const out = await p.evaluate(() => ({ page: document.querySelector("[data-page]")?.dataset.page, cards: document.querySelectorAll("[data-page] section").length, nan: /NaN|undefined|Infinity/.test(document.querySelector("[data-page]")?.innerText || ""), text: (document.querySelector("[data-page]")?.innerText || "").slice(0, 160).replace(/\s+/g, " ") }));
  const ok = !errs.length && out.page === "insights" && out.cards > 0 && !out.nan;
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}  — page=${out.page} cards=${out.cards} nan=${out.nan}${errs.length ? " errors=" + errs.join(" | ") : ""}\n      ${out.text}`);
  await p.close();
}
await browser.close(); await server.close();
process.exitCode = failed ? 1 : 0;
