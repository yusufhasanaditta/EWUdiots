// End-to-end test of the phone app's portal sync logic (src/portalsync.js) without a phone: a fake bridge does what
// PortalSyncPlugin.java does (open page, run scripts, read text) in Chrome over the portal replicas
// (tests/fixtures/portal-pages.mjs, fictional data). Checks every page and the portal's JSON are read, parsed, and
// nothing private leaks.
// Usage: node scripts/portal-sync-e2e.mjs
import http from "node:http";
import puppeteer from "puppeteer-core";
import { PAGES, API, SENSITIVE, STUDENT } from "../tests/fixtures/portal-pages.mjs";
import { start, signIn, readAll, STEPS } from "../src/portalsync.js";
import { parsePortalText, mergeParsed, apiToParsed } from "../src/parser.js";

const CHROME = process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const results = [], check = (n, ok, x = "") => { results.push(`${ok ? "PASS" : "FAIL"}  ${n}${x ? " — " + x : ""}`); if (!ok) process.exitCode = 1; };
const server = http.createServer((req, res) => {
  const path = new URL(req.url, "http://x").pathname;
  if (API[path]) { res.writeHead(200, { "content-type": "application/json" }); return setTimeout(() => res.end(JSON.stringify(API[path])), 20); }
  const html = PAGES[path]; res.writeHead(html ? 200 : 404, { "content-type": "text/html" }); res.end(html || "Not found");
});
await new Promise((r) => server.listen(4195, r));
const BASE = "http://localhost:4195", b = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] }), p = await b.newPage();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let typed = null;
// Same steps as PortalSyncPlugin.java.
const bridge = {
  async open() { await p.goto(BASE + "/"); return { login: true, first: "3", second: "18" }; },
  async login(f) { typed = f; await p.goto(BASE + "/Home/Index"); return { login: false }; },
  async read({ path, click, waitFor, script, timeout }) {
    const r = await p.goto(BASE + path); if (r.status() !== 200) return { result: "{}" };
    if (click) { await p.evaluate((c) => { const re = new RegExp(c, "i"); [...document.querySelectorAll("button, input[type=submit], a")].find((x) => re.test(x.innerText || x.value || ""))?.click(); }, click); await wait(1200); }
    for (let t = 0; waitFor && t < timeout; t += 500) { if (await p.evaluate((w) => new RegExp(w, "i").test(document.body.innerText), waitFor)) break; await wait(500); }
    return { result: await p.evaluate(script) };
  },
  async exec({ script, waitJs, result, timeout = 30000 }) {
    const r = await p.evaluate(script);
    if (!waitJs) return { result: r };
    for (let t = 0; t < timeout; t += 200) { if ((await p.evaluate(waitJs)) === "yes") break; await wait(200); }
    return { result: await p.evaluate(result) };
  }
};
try {
  const st = await start(bridge);
  check("open shows EWU's sum to answer", st.first === "3" && st.second === "18");
  await signIn(bridge, { id: "2026-2-60-999", password: "Secret#123", answer: "21" }).catch((e) => check("sign in", false, e.message));
  check("ID, password and answer go into the portal's form", typed?.username === "2026-2-60-999" && typed?.answer === "21");
  let bad = ""; try { await signIn(bridge, { id: "2026", password: "x", answer: "21" }); } catch (e) { bad = e.field; }
  check("a malformed ID is caught before contacting the portal", bad === "id");
  await signIn(bridge, { id: "2026-2-60-999", answer: "21", useSaved: true });
  check("a remembered password is filled in by the phone, never by the app", typed?.useSaved === true && typed?.password === "");
  const steps = []; const got = await readAll(bridge, (l, s) => steps.push(`${l}:${s}`));
  const kinds = got.pages.map((x) => x.kind);
  check("reads profile, grades, degree, rules, curriculum, installments and ledger", ["profile", "grades", "degree", "rules", "curriculum", "installment", "ledger"].every((k) => kinds.includes(k)), kinds.join(","));
  check("pages are found through the portal menu (grade report, curriculum, installments)", ["grades", "curriculum", "installment"].every((k) => kinds.includes(k)));
  check("progress reported for every step", STEPS.every((l) => steps.includes(`${l}:reading`) || steps.includes(`${l}:done`)), steps.join(" "));
  check("schedule of every semester the student had", got.api?.semesters?.map((s) => s.name).join("|") === "Fall 2026|Summer 2026", got.api?.semesters?.map((s) => s.name).join("|"));
  const apiText = JSON.stringify(got.api || {});
  check("dropped courses and semesters before the student's first are skipped", !apiText.includes("BUS101") && !apiText.includes("XYZ999"));
  const all = got.pages.map((x) => x.text).join("\n") + apiText, leaked = SENSITIVE.filter((s) => all.includes(s)).concat(apiText.includes(STUDENT.name) ? ["the name, in the JSON"] : []);
  check("nothing private leaves the portal (pages and JSON)", !leaked.length, leaked.join(", "));

  const r = mergeParsed([...apiToParsed(got.api), ...got.pages.map((x) => parsePortalText(x.text, x.kind))], new Date("2026-10-29T10:00:00"));
  check("profile parsed", r.profile.id === STUDENT.id && r.profile.cgpa > 0 && r.profile.advisorInitial === "NAH", JSON.stringify(r.profile).slice(0, 120));
  check("this semester's routine, labs included", r.sem === "Fall-2026" && new Set(r.routine.map((x) => x.code)).size === 4 && r.routine.some((x) => x.code === "CHE109" && x.lab), `${r.sem} ${r.routine.map((x) => x.code + (x.lab ? "L" : "")).join(",")}`);
  check("every semester kept with its dates", Object.keys(r.history).sort().join(",") === "Fall-2026,Summer-2026" && r.semDates["Fall-2026"]?.start === "2026-09-08");
  check("faculty names from the portal", r.faculty.some((f) => f.init === "SNR" && /Sadia/.test(f.name)));
  check("grades parsed (report + JSON)", r.grades.some((g) => g.code === "CSE103" && g.g === "B+") && r.grades.length >= 3);
  check("offered courses for the planner, with seats", r.offered.length === 4 && r.offered.some((o) => o.code === "CSE110" && o.capacity === 40), String(r.offered.length));
  check("fee ledger: billed, paid, waiver and due", r.ledger && r.ledger.paid === 101200 && r.ledger.waiver === 20375 && r.ledger.due === 27325, JSON.stringify(r.ledger && { b: r.ledger.billed, p: r.ledger.paid, w: r.ledger.waiver, d: r.ledger.due }));
  check("installment due dates", r.payments.schedule.length === 2 && r.payments.schedule.some((x) => x.due === "2026-10-29" && !x.paid && x.amount === 27325), JSON.stringify(r.payments.schedule));
  check("curriculum with prerequisites", r.curriculum.length === 8 && r.curriculum.find((c) => c.code === "CSE207")?.prereq.join() === "CSE110,CSE106", JSON.stringify(r.curriculum.find((c) => c.code === "CSE207")));
} catch (e) { check("run completed", false, e.stack); }
finally { console.log(results.join("\n")); console.log(`\n${results.filter((x) => x.startsWith("PASS")).length}/${results.length} passed`); await b.close(); server.close(); }
