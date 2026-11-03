// Student home + Ask EWUdiots check: demo data, a made-up course outline, a few questions, screenshots.
// Usage (from app/, after `vite build --mode test`): node scripts/ask-shots.mjs   → .shots/ask (not committed)
import puppeteer from "puppeteer-core";
import { preview } from "vite";
import { resolve } from "node:path";
import { mkdirSync } from "node:fs";
const OUT = ".shots/ask";
mkdirSync(OUT, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const OUTLINE = { code: "CSE207", units: [{ title: "Arrays and Lists", topics: ["Arrays", "Linked Lists"] }, { title: "Trees", topics: ["Binary Trees", "Heaps"] }],
  exams: [{ name: "Mid-term", date: new Date(Date.now() + 5 * 864e5).toISOString().slice(0, 10) }], assessment: [{ name: "Mid Term Examination", pct: 30 }, { name: "Final Examination", pct: 40 }, { name: "Quiz", pct: 10 }],
  grading: [], textbooks: ["Made-up Data Structures Book"], instructor: { name: "Test Person", role: "Lecturer", office: "AB1-999" }, officeHours: [], done: { "0.0": true } };
const server = await preview({ root: resolve("."), logLevel: "silent", preview: { port: 4177, strictPort: true } });
const b = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
const errors = [];
try {
  const p = await b.newPage(); await p.setViewport({ width: 393, height: 852, isMobile: true, hasTouch: true });
  p.on("pageerror", (e) => errors.push(e.message));
  await p.goto("http://localhost:4177/app.html#/sync", { waitUntil: "networkidle2" });
  await p.evaluate(() => localStorage.clear()); await p.reload({ waitUntil: "networkidle2" }); await wait(300);
  await p.$eval("#sy-demo", (x) => x.click()).catch(() => {}); await wait(800);
  await p.evaluate((o) => { const k = Object.keys(localStorage).find((x) => x.startsWith("ewudiots.v")); const s = JSON.parse(localStorage.getItem(k)); s.outlines = { CSE207: o }; localStorage.setItem(k, JSON.stringify(s)); }, OUTLINE);
  await p.evaluate(() => { location.hash = "#/home"; }); await p.reload({ waitUntil: "networkidle2" }); await wait(1200);
  await p.screenshot({ path: `${OUT}/home.png`, fullPage: true });
  await p.evaluate(() => { location.hash = "#/ask"; }); await wait(600);
  for (const q of ["When is the CSE207 mid-term?", "How much is the final worth in CSE207?", "CSE207 topics left", "heaps"]) {
    await p.$eval("#ask-q", (i, v) => { i.value = v; }, q); await p.$eval("#ask-f", (f) => f.requestSubmit()); await wait(900);
  }
  await p.screenshot({ path: `${OUT}/ask.png`, fullPage: true });
  console.log(await p.$$eval(".msg.bot p", (ps) => ps.map((x) => x.textContent.trim()).slice(-8).join("\n")));
} catch (e) { errors.push(String(e.message || e)); }
await b.close(); await new Promise((r) => server.httpServer.close(r));
console.log(errors.length ? errors.join("\n") : "Ask flow OK, no JS errors.");
