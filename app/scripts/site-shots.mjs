// Regenerates the app screenshots used on the landing page (public/screens/*.webp) from the real app with demo data.
// Usage: npm run build && node scripts/site-shots.mjs
import puppeteer from "puppeteer-core";
import sharp from "sharp";
import { preview } from "vite";
import { resolve } from "node:path";
import { mkdirSync } from "node:fs";

const CHROME = process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 4181, BASE = `http://localhost:${PORT}/app.html`;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
process.env.NOTICES_FIXTURE = resolve("tests/fixtures/ewu-notice-board.html");
const server = await preview({ root: resolve("."), logLevel: "silent", preview: { port: PORT, strictPort: true } });
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--hide-scrollbars"] });
const p = await browser.newPage();
mkdirSync("public/screens", { recursive: true });
const save = async (name, w) => { const png = await p.screenshot(); await sharp(png).resize({ width: w }).webp({ quality: 82 }).toFile(`public/screens/${name}.webp`); console.log("saved", name); };
const go = async (h, ms) => { await p.evaluate((x) => { location.hash = x; }, h); await wait(ms); };

async function demo(vp) {
  await p.setViewport(vp);
  await p.goto(BASE, { waitUntil: "networkidle2" }); await p.evaluate(() => localStorage.clear()); await p.goto("about:blank");
  await p.goto(BASE + "#/sync", { waitUntil: "networkidle2" }); await wait(400);
  await p.$eval("#sy-demo", (x) => x.click()); await wait(700);
  // Edit the saved state from a page without the app running, so the app cannot overwrite it first.
  await p.goto(BASE.replace("app.html", "privacy.html"), { waitUntil: "networkidle2" });
  await p.evaluate(() => { const s = JSON.parse(localStorage.getItem("ewudiots.v2")); s.demo = false; s.profile.name = "Rafi Ahmed"; s.idcard = { id: "2024-1-60-123", name: "Rafi Ahmed", dept: "CSE", valid: "", verified: true, email: "2024-1-60-123@std.ewubd.edu" }; localStorage.setItem("ewudiots.v2", JSON.stringify(s)); });
  await p.goto(BASE + "#/home", { waitUntil: "networkidle2" }); await wait(500);
}
try {
  const phone = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
  await demo(phone);
  await go("#/home", 1200); await save("phone-home", 780);
  await go("#/map?to=636", 3500); await p.evaluate(() => window.scrollTo(0, 0)); await save("phone-map", 780);
  await go("#/idcard", 1200); await save("phone-idcard", 780);
  await go("#/notices", 1500); await save("phone-notices", 780);
  await go("#/faculty", 2500); await save("phone-faculty", 780);
  await go("#/grades", 900); await save("phone-cgpa", 780);
  await demo({ width: 1440, height: 900 });
  await go("#/map?to=805", 4000); await save("desk-map", 1440);
  await go("#/routine", 1200); await save("desk-routine", 1440);
} finally { await browser.close(); await server.close(); }
