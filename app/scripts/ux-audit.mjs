// UX audit of every app screen (demo data), phone + desktop: small tap targets, content past the screen edge,
// unnamed buttons/links, images without alt, unlabelled fields, text cut off without "…", JS errors.
// Usage: node scripts/ux-audit.mjs [routes…]   (run `vite build --mode test` first). Report: .shots/ux/report.json
import puppeteer from "puppeteer-core";
import { preview } from "vite";
import { resolve } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";
const OUT = resolve(".shots/ux"); mkdirSync(OUT, { recursive: true });
const only = process.argv.slice(2);
const ROUTES = ["home", "routine", "courses", "course?c=CSE207", "marks", "grades", "degree", "whatif", "planner", "plan", "combos", "tasks", "fees", "fee",
  "vault", "rooms", "faculty", "prof?i=NHR", "focus", "cards", "exams", "me", "more", "profile", "notifications", "sync", "help", "about", "cover",
  "notices", "news", "calendar", "map", "idcard", "alarms", "ask", "people", "events", "scholar", "materials", "classroom", "insights", "attendance", "security", "alumni"];
const server = await preview({ root: resolve("."), logLevel: "silent", preview: { port: 4178, strictPort: true } });
const b = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const report = {};
for (const [dev, vp] of [["phone", { width: 393, height: 852, deviceScaleFactor: 1, isMobile: true, hasTouch: true }], ["desk", { width: 1366, height: 900 }]]) {
  const p = await b.newPage(); await p.setViewport(vp);
  let errs = [];
  p.on("pageerror", (e) => errs.push(e.message));
  p.on("console", (m) => { if (m.type() === "error" && !/fonts\.g|favicon|Failed to load|net::/.test(m.text())) errs.push(m.text()); });
  await p.goto("http://localhost:4178/app.html#/sync", { waitUntil: "networkidle2" });
  await p.evaluate(() => localStorage.clear()); await p.reload({ waitUntil: "networkidle2" }); await wait(300);
  await p.$eval("#sy-demo", (x) => x.click()).catch(() => {}); await wait(500);
  for (const r of ROUTES.filter((x) => !only.length || only.includes(x))) {
    errs = [];
    await p.evaluate((x) => { location.hash = "#/" + x; }, r); await wait(900);
    const found = await p.evaluate((phone) => {
      const out = { small: [], wide: [], unnamed: [], noalt: [], nolabel: [], clipped: [], page: document.querySelector("[data-page]")?.dataset.page };
      const vis = (el) => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none" && !el.closest("[hidden], .sr-only"); };
      const name = (el) => (el.getAttribute("aria-label") || el.getAttribute("title") || el.innerText || el.querySelector("img[alt]")?.alt || el.value || "").trim();
      const desc = (el) => `${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""}${el.className && typeof el.className === "string" ? "." + el.className.trim().split(/\s+/).slice(0, 2).join(".") : ""} "${name(el).slice(0, 30)}"`;
      const main = document.querySelector("#main") || document.body;
      for (const el of main.querySelectorAll("a[href], button, input:not([type=hidden]), select, textarea, [role=button], [role=tab]")) {
        if (!vis(el)) continue;
        const r = el.getBoundingClientRect();
        const inline = el.tagName === "A" && getComputedStyle(el).display === "inline" && el.closest("p, li, span.xs, small");
        if (phone && !inline && (r.width < 44 || r.height < 44) && !(r.width >= 24 && r.height >= 24 && el.closest(".seg, .chips"))) {
          // A smaller button is fine if an invisible hit area (::before/::after) makes it 44px.
          const pad = ["::before", "::after"].some((ps) => { const s = getComputedStyle(el, ps); return s.content !== "none" && s.position === "absolute"; });
          if (!pad) out.small.push(`${desc(el)} ${Math.round(r.width)}×${Math.round(r.height)}`);
        }
        if (!name(el) && !el.labels?.length && !el.getAttribute("aria-labelledby")) out.unnamed.push(desc(el));
        if (/^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName) && !el.labels?.length && !el.getAttribute("aria-label") && !el.getAttribute("aria-labelledby") && el.type !== "checkbox") out.nolabel.push(desc(el));
      }
      for (const el of main.querySelectorAll("*")) {
        if (!vis(el)) continue;
        const r = el.getBoundingClientRect();
        if (r.right > innerWidth + 1 && !el.closest("[style*='overflow'], .seg, .cl-seg, .sem-track, .news-strip, .table-wrap, .hscroll, .chips, .mtiles, .strip, [class*='scroll'], [class*='rail'], [class*='track']")) {
          let p = el.parentElement, scroller = false;
          while (p && p !== main) { const ox = getComputedStyle(p).overflowX; if (ox === "auto" || ox === "scroll" || ox === "hidden") { scroller = true; break; } p = p.parentElement; }
          if (!scroller) out.wide.push(`${desc(el)} right=${Math.round(r.right)}`);
        }
        const s = getComputedStyle(el);
        if (el.children.length === 0 && el.textContent.trim() && el.scrollWidth > el.clientWidth + 1 && (s.overflow === "hidden" || s.overflowX === "hidden") && s.textOverflow !== "ellipsis") out.clipped.push(desc(el));
      }
      for (const img of main.querySelectorAll("img")) if (!img.hasAttribute("alt") && vis(img)) out.noalt.push(img.src.split("/").pop());
      for (const k of Object.keys(out)) if (Array.isArray(out[k])) out[k] = [...new Set(out[k])].slice(0, 12);
      return out;
    }, dev === "phone");
    if (await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) found.hscroll = true;
    if (errs.length) found.errors = errs.slice(0, 5);
    const issues = Object.entries(found).filter(([k, v]) => k !== "page" && (Array.isArray(v) ? v.length : v));
    if (issues.length) (report[r] = report[r] || {})[dev] = Object.fromEntries(issues);
    await p.screenshot({ path: `${OUT}/${dev}-${r.replace(/[?=&]/g, "_")}.png` });
  }
  await p.close();
}
await b.close(); await new Promise((r) => server.httpServer.close(r));
writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 1));
const count = (k) => Object.values(report).reduce((a, d) => a + Object.values(d).reduce((x, v) => x + (Array.isArray(v[k]) ? v[k].length : v[k] ? 1 : 0), 0), 0);
console.log(["small", "wide", "unnamed", "noalt", "nolabel", "clipped", "hscroll", "errors"].map((k) => `${k}: ${count(k)}`).join(" · "));
