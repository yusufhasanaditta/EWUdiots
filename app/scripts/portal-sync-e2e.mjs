// End-to-end test of the phone app's portal sync logic (src/portalsync.js) without a phone: a fake bridge does what
// PortalSyncPlugin.java does (open page, run scripts, read text) in Chrome over the portal replicas
// (tests/fixtures/portal-pages.mjs, fictional data). Checks every page is read, parsed, and nothing private leaks.
// Usage: node scripts/portal-sync-e2e.mjs
import http from "node:http";
import puppeteer from "puppeteer-core";
import { PAGES, SENSITIVE, STUDENT } from "../tests/fixtures/portal-pages.mjs";
import { start, signIn, readAll, PORTAL_PAGES } from "../src/portalsync.js";
import { parsePortalText, mergeParsed } from "../src/parser.js";

const CHROME = process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const results = [], check = (n, ok, x = "") => { results.push(`${ok ? "PASS" : "FAIL"}  ${n}${x ? " — " + x : ""}`); if (!ok) process.exitCode = 1; };
const server = http.createServer((req, res) => { const html = PAGES[new URL(req.url, "http://x").pathname]; res.writeHead(html ? 200 : 404, { "content-type": "text/html" }); res.end(html || "Not found"); });
await new Promise((r) => server.listen(4195, r));
const BASE = "http://localhost:4195", b = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] }), p = await b.newPage();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let typed = null;
// Same steps as PortalSyncPlugin.java.
const bridge = {
  async open() { await p.goto(BASE + "/"); return { login: true, first: "3", second: "18" }; },
  async login(f) { typed = f; return { login: false }; },
  async read({ path, click, waitFor, script, timeout }) {
    const r = await p.goto(BASE + path); if (r.status() !== 200) return { result: "{}" };
    if (click) { await p.evaluate((c) => { const re = new RegExp(c, "i"); [...document.querySelectorAll("button, input[type=submit], a")].find((x) => re.test(x.innerText || x.value || ""))?.click(); }, click); await wait(1200); }
    for (let t = 0; waitFor && t < timeout; t += 500) { if (await p.evaluate((w) => new RegExp(w, "i").test(document.body.innerText), waitFor)) break; await wait(500); }
    return { result: await p.evaluate(script) };
  }
};
try {
  const st = await start(bridge);
  check("open shows EWU's sum to answer", st.first === "3" && st.second === "18");
  await signIn(bridge, { id: "2026-2-60-999", password: "Secret#123", answer: "21" }).catch((e) => check("sign in", false, e.message));
  check("ID, password and answer go into the portal's form", typed?.username === "2026-2-60-999" && typed?.answer === "21");
  let bad = ""; try { await signIn(bridge, { id: "2026", password: "x", answer: "21" }); } catch (e) { bad = e.field; }
  check("a malformed ID is caught before contacting the portal", bad === "id");
  const steps = []; const pages = await readAll(bridge, (l, s) => steps.push(`${l}:${s}`));
  check("reads profile, schedule, grades, degree, rules and slip", ["profile", "schedule", "grades", "degree", "rules", "slip"].every((k) => pages.some((x) => x.kind === k)), pages.map((x) => x.kind).join(","));
  check("progress reported for every page", PORTAL_PAGES.every((pg) => steps.includes(`${pg.label}:reading`)));
  const all = pages.map((x) => x.text).join("\n"), leaked = SENSITIVE.filter((s) => all.includes(s));
  check("nothing private leaves the portal", !leaked.length, leaked.join(", "));
  const r = mergeParsed(pages.map((x) => parsePortalText(x.text)));
  check("profile parsed", r.profile.id === STUDENT.id && r.profile.cgpa > 0 && r.profile.advisorInitial === "NAH", JSON.stringify(r.profile).slice(0, 120));
  check("routine parsed (schedule needed the Show Courses click)", new Set(r.routine.map((x) => x.code)).size >= 4, r.routine.length + " rows");
  check("grades parsed", r.grades.length >= 3);
} catch (e) { check("run completed", false, e.stack); }
finally { console.log(results.join("\n")); console.log(`\n${results.filter((x) => x.startsWith("PASS")).length}/${results.length} passed`); await b.close(); server.close(); }
