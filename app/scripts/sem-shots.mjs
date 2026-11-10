// Screenshots of My Courses → Semesters and the Drop-a-course sheet (demo data), phone + desktop.
// Usage: node scripts/sem-shots.mjs <outDir>   (run `vite build --mode test` first)
import puppeteer from "puppeteer-core";
import { preview } from "vite";
import { resolve } from "node:path";
const OUT = process.argv[2] || ".shots/sem";
const server = await preview({ root: resolve("."), logLevel: "silent", preview: { port: 4176, strictPort: true } });
const b = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const errors = [];
for (const [name, vp] of [["phone", { width: 393, height: 852, deviceScaleFactor: 2, isMobile: true, hasTouch: true }], ["desk", { width: 1366, height: 900 }]]) {
  const p = await b.newPage(); await p.setViewport(vp);
  p.on("pageerror", (e) => errors.push(`${name}: ${e.message}`));
  p.on("console", (m) => { if (m.type() === "error" && !/fonts\.g|favicon|Failed to load/.test(m.text())) errors.push(`${name}: ${m.text()}`); });
  await p.goto("http://localhost:4176/app.html#/sync", { waitUntil: "networkidle2" });
  await p.evaluate(() => localStorage.clear()); await p.reload({ waitUntil: "networkidle2" }); await wait(300);
  await p.$eval("#sy-demo", (x) => x.click()); await wait(500);
  const shot = async (n) => {
    if (await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) errors.push(`${name} ${n}: horizontal scroll`);
    await p.screenshot({ path: `${OUT}/${name}-${n}.png`, fullPage: true });
  };
  for (const r of ["home", "grades"]) { await p.evaluate((x) => { location.hash = "#/" + x; }, r); await wait(1400); await shot(r); }
  await p.evaluate(() => { location.hash = "#/courses"; }); await wait(800);
  await p.$eval('[data-co="plan12"]', (x) => x.click()); await wait(2500); // flowchart loads from ewubd.edu
  await shot("semesters");
  await p.$eval('[data-co="ongoing"]', (x) => x.click()); await wait(600);
  await shot("ongoing");
  await p.$eval('.btn[data-sx="drop"]', (x) => x.click()); await wait(900);
  await p.screenshot({ path: `${OUT}/${name}-drop.png` });
  await p.$eval("#drop-go", (x) => x.click()); await wait(800);
  await shot("dropped");
  await p.close();
}
await b.close(); await new Promise((r) => server.httpServer.close(r));
console.log(errors.length ? errors.join("\n") : "No JS errors, no horizontal scroll.");
