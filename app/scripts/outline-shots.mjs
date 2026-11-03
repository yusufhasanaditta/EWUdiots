// Course outline check: demo data, open a course's Outline tab, upload an outline PDF, screenshot the result.
// Usage (from app/, after `vite build --mode test`): node scripts/outline-shots.mjs <outline.pdf> [course] [outDir]
// The PDF is only read in this local browser; screenshots go to .shots/outline (not committed).
import puppeteer from "puppeteer-core";
import { preview } from "vite";
import { resolve } from "node:path";
import { mkdirSync } from "node:fs";
const [pdf, course = "CSE207", OUT = ".shots/outline"] = process.argv.slice(2);
mkdirSync(OUT, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const server = await preview({ root: resolve("."), logLevel: "silent", preview: { port: 4176, strictPort: true } });
const b = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
const errors = [];
try {
  for (const [name, vp] of [["phone", { width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true }], ["desk", { width: 1366, height: 900 }]]) {
    const p = await b.newPage(); await p.setViewport(vp);
    p.on("pageerror", (e) => errors.push(`${name}: ${e.message}`));
    p.on("console", (m) => { if (m.type() === "error" && !/fonts\.g|favicon|Failed to load/.test(m.text())) errors.push(`${name}: ${m.text()}`); });
    await p.goto("http://localhost:4176/app.html#/sync", { waitUntil: "networkidle2" });
    await p.evaluate(() => localStorage.clear()); await p.reload({ waitUntil: "networkidle2" }); await wait(300);
    await p.$eval("#sy-demo", (x) => x.click()).catch(() => {}); await wait(800);
    await p.evaluate((c) => { location.hash = `#/course?c=${c}&tab=outline`; }, course); await wait(700);
    await p.screenshot({ path: `${OUT}/${name}-empty.png`, fullPage: true });
    const input = await p.$("#ol-file");
    if (!input) throw new Error("no upload button");
    await input.uploadFile(resolve(pdf));
    await p.waitForSelector(".ol-head", { timeout: 30000 });
    await wait(500);
    await p.screenshot({ path: `${OUT}/${name}-outline.png`, fullPage: true });
    if (await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) errors.push(`${name}: horizontal scroll`);
    await p.evaluate((c) => { location.hash = `#/course?c=${c}&tab=overview`; }, course); await wait(500);
    await p.screenshot({ path: `${OUT}/${name}-overview.png`, fullPage: true });
    await p.evaluate(() => { location.hash = "#/courses"; }); await wait(400);
    await p.$$eval("[data-co]", (bs) => bs.find((x) => x.dataset.co === "completed")?.click()); await wait(500);
    await p.screenshot({ path: `${OUT}/${name}-completed.png`, fullPage: true });
    await p.close();
  }
} catch (e) { errors.push(String(e.message || e)); }
await b.close(); await new Promise((r) => server.httpServer.close(r));
console.log(errors.length ? errors.join("\n") : "Outline flow OK, no JS errors.");
