// Visual check: screenshots of every screen (phone + desktop), with demo data. Usage: node scripts/shots.mjs <outDir> [routes…]
import puppeteer from "puppeteer-core";
import { preview } from "vite";
import { resolve } from "node:path";
const OUT = process.argv[2], only = process.argv.slice(3);
const server = await preview({ root: resolve("."), logLevel: "silent", preview: { port: 4175, strictPort: true } });
const b = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
const errors = [];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const ROUTES = ["welcome", "welcome?s=1", "welcome?s=2", "role", "setup", "home", "routine", "courses", "course?c=CSE207", "marks", "grades", "degree", "whatif", "planner", "plan", "combos", "tasks", "fees", "fee", "vault", "rooms", "faculty", "prof?i=NHR", "focus", "cards", "exams", "me", "more", "profile", "notifications", "sync", "help", "about", "cover", "nope"];
for (const [name, vp] of [["phone", { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }], ["desk", { width: 1440, height: 900 }]]) {
  const p = await b.newPage(); await p.setViewport(vp);
  p.on("pageerror", (e) => errors.push(`${name}: ${e.message}`));
  p.on("console", (m) => { if (m.type() === "error" && !/fonts\.g|favicon|Failed to load/.test(m.text())) errors.push(`${name}: ${m.text()}`); });
  await p.goto("http://localhost:4175/app.html", { waitUntil: "networkidle2" });
  for (const r of ROUTES.filter((r) => !only.length || only.includes(r))) {
    if (r === "home") { await p.evaluate(() => { localStorage.clear(); }); await p.goto("about:blank"); await p.goto("http://localhost:4175/app.html#/sync", { waitUntil: "networkidle2" }); await wait(300); await p.$eval("#sy-demo", (x) => x.click()).catch(() => {}); await wait(400);
      await p.evaluate(() => { const S = JSON.parse(localStorage.getItem("ewudiots.v2")); S.planner.courses = ["CSE246", "CSE325", "MAT205"]; localStorage.setItem("ewudiots.v2", JSON.stringify(S)); }); await p.reload({ waitUntil: "networkidle2" }); }
    await p.evaluate((x) => { location.hash = "#/" + x; }, r); await wait(450);
    const hs = await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
    if (hs) errors.push(`${name} ${r}: horizontal scroll`);
    await p.screenshot({ path: `${OUT}/${name}-${r.replace(/[?=&]/g, "_")}.png`, fullPage: true });
  }
  if (!only.length) { await p.evaluate(() => document.documentElement.setAttribute("data-theme", "dark")); for (const r of ["home", "routine", "course?c=CSE207"]) { await p.evaluate((x) => { location.hash = "#/" + x; }, r); await wait(400); await p.screenshot({ path: `${OUT}/${name}-dark-${r.replace(/[?=&]/g, "_")}.png`, fullPage: true }); } }
  await p.close();
}
await b.close(); await new Promise((r) => server.httpServer.close(r));
console.log(errors.length ? errors.join("\n") : "No JS errors, no horizontal scroll.");
