// Probe: phone-sized screenshots of the fake portal pages → the app's OCR + parser. Prints what was recognised.
import puppeteer from "puppeteer-core";
import { createServer } from "vite";
import { resolve } from "node:path";
import { writeFileSync } from "node:fs";
import { PAGES } from "../tests/fixtures/portal-pages.mjs";
const CHROME = process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const server = await createServer({ root: resolve("."), logLevel: "silent", server: { port: 5199, strictPort: true }, mode: "test" }); await server.listen();
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
const shots = {};
const sp = await browser.newPage();
for (const [path, w, scale] of [["/Home/Profile", 412, 2.625], ["/Home/StudentClassSchedule", 412, 2.625], ["/ReportForms/rptGradeSheetStudent.aspx", 412, 2.625], ["/Home/StudentClassSchedule", 980, 1.1]]) {
  await sp.setViewport({ width: w, height: 900, deviceScaleFactor: scale, isMobile: w < 500 });
  await sp.setContent(PAGES[path], { waitUntil: "load" });
  if (await sp.$("#show")) { await sp.click("#show"); await new Promise((r) => setTimeout(r, 600)); }
  const b64 = await sp.screenshot({ fullPage: true, encoding: "base64" });
  shots[`${path}@${w}`] = "data:image/png;base64," + b64;
}
const p = await browser.newPage();
p.on("pageerror", (e) => console.log("pageerror", e.message));
await p.goto("http://localhost:5199/privacy.html");
for (const [name, url] of Object.entries(shots)) {
  const t0 = Date.now();
  const r = await p.evaluate(async (u) => {
    const { readText } = await import("/src/ocr.js"); const { parsePortalText } = await import("/src/parser.js");
    const blob = await (await fetch(u)).blob();
    const f = new File([blob], "s.png", { type: "image/png" });
    let text = await readText(f), x = parsePortalText(text);
    const rowsOf = (r) => r.routine.length + r.offered.length + r.grades.length + r.recommended.length + r.payments.schedule.length;
    const times = (text.match(/\d{1,2}[:.]?\d{2}\s*[AaPp]\.?[Mm]/g) || []).length, codes = new Set(text.match(/\b[A-Z]{2,4}\s?[0-9OIl]{3,4}\b/g) || []).size;
    const missed = (times >= 3 && (x.routine.length + x.offered.length) * 2 < times - 1) || (codes >= 3 && rowsOf(x) < codes * 0.6);
    let retried = false;
    if (missed) { retried = true; const t2 = await readText(f, () => {}, { boost: true }), x2 = parsePortalText(t2); if (rowsOf(x2) > rowsOf(x)) { text = t2; x = x2; } }
    x.retried = retried;
    return { retried: x.retried, profile: x.profile, routine: x.routine.length, rows: x.routine.map((r) => [r.code, r.days, r.start, r.end, r.room, r.faculty].join(" ")), codes: [...new Set(x.routine.map((r) => r.code))], grades: x.grades.length, text: text.slice(-500), full: text };
  }, url).catch((e) => ({ error: e.message }));
  // DUMP=1 saves the phone OCR text as unit-test fixtures (fictional data only).
  if (process.env.DUMP && r.full && name.endsWith("@412")) writeFileSync(`tests/fixtures/ocr-phone-${/Schedule/.test(name) ? "schedule" : /Grade/.test(name) ? "grades" : "profile"}.txt`, r.full);
  delete r.full;
  console.log("\n==", name, `${Date.now() - t0} ms`); console.log(JSON.stringify(r, null, 1).slice(0, 1500));
}
await browser.close(); await server.close();
