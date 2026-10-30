// End-to-end test of EWUdiots Club against the live backend, with throwaway accounts and a throwaway club:
// admin invites a student (who is in the members' space as soon as they sign in), posts members-only news, opens a
// recruitment form; an applicant applies with a phone number; the admin sees it, accepts, and the applicant becomes a
// member; attendance by rotating code; an anonymous poll; certificates and the public check page.
// Everything it creates is deleted at the end (accounts are created confirmed through the admin API: no emails sent).
// Usage (from app/):  npm run test:clubs     (needs ../.secrets/server.env and ../.secrets/supabase-token.env)
import puppeteer from "puppeteer-core";
import { preview, build } from "vite";
import { resolve } from "node:path";
import { readFileSync, mkdirSync } from "node:fs";

const ROOT = resolve(import.meta.dirname, "../..");
const env = (f) => Object.fromEntries(readFileSync(resolve(ROOT, f), "utf8").split(/\r?\n/).filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]));
const app = env("app/.env"), server = env(".secrets/server.env");
const URL_ = app.VITE_SUPABASE_URL, SERVICE = server.SUPABASE_SERVICE_ROLE_KEY;
const TOKEN = readFileSync(resolve(ROOT, ".secrets/supabase-token.env"), "utf8").match(/sbp_[A-Za-z0-9]+/)[0];
const REF = new URL(URL_).hostname.split(".")[0];
const CHROME = process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const SHOTS = process.env.SHOTS_DIR || resolve(import.meta.dirname, "../.shots/clubs");
mkdirSync(SHOTS, { recursive: true });

const results = [], errors = [];
const check = (name, ok, extra = "") => { results.push(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); if (!ok) process.exitCode = 1; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const sql = async (query) => { const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, { method: "POST", headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" }, body: JSON.stringify({ query }) }); const t = await r.text(); if (!r.ok) throw new Error(t); return JSON.parse(t); };
const adminApi = async (path, method = "GET", body) => { const r = await fetch(`${URL_}/auth/v1/admin/${path}`, { method, headers: { apikey: SERVICE, authorization: `Bearer ${SERVICE}`, "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined }); const t = await r.text(); if (!r.ok) throw new Error(`${method} ${path}: ${t}`); return t ? JSON.parse(t) : null; };

// Throwaway people: 2099-9-99-xxx can't be a real EWU ID.
const tag = Date.now().toString(36).slice(-5), PASS = `E2e-${tag}-pass1`;
const PEOPLE = { admin: ["2099-9-99-801", "Ayesha Admin"], member: ["2099-9-99-802", "Bashir Member"], applicant: ["2099-9-99-803", "Chandni Applicant"] };
const users = {};
let clubId = null, slug = `e2e-${tag}`;

async function setup() {
  for (const [k, [sid, name]] of Object.entries(PEOPLE)) {
    const email = `${sid}@std.ewubd.edu`;
    const old = (await adminApi(`users?per_page=1000`)).users?.find((u) => u.email === email);
    if (old) await adminApi(`users/${old.id}`, "DELETE");
    users[k] = { ...(await adminApi("users", "POST", { email, password: PASS, email_confirm: true, user_metadata: { name, role: "student" } })), sid, name };
  }
  const [c] = await sql(`insert into public.clubs (slug, name, short_name, category, status, verified, join_mode, tagline, color)
    values ('${slug}', 'E2E Test Robotics Club ${tag}', 'E2ERC', 'tech', 'active', true, 'apply', 'Throwaway club for automated tests', '#0EA5E9') returning id`);
  clubId = c.id;
  await sql(`select public.club_add_member('${clubId}', '${users.admin.id}', 2, 'Ayesha Admin', '${users.admin.email}', '${PEOPLE.admin[0]}', 'CSE', null)`);
}
async function cleanup() {
  try { if (clubId) await sql(`delete from public.clubs where id = '${clubId}'`); } catch (e) { console.warn("club cleanup:", e.message); }
  for (const u of Object.values(users)) { try { await sql(`delete from public.user_messages where user_id = '${u.id}'`); await adminApi(`users/${u.id}`, "DELETE"); } catch (e) { console.warn("user cleanup:", e.message); } }
}

const PORT = 4183, BASE = `http://localhost:${PORT}`;
let browser, srv;
async function person(who, viewport = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }) {
  const ctx = await browser.createBrowserContext();
  const p = await ctx.newPage(); await p.setViewport(viewport);
  p.on("pageerror", (e) => errors.push(`${who}: ${e.message}`));
  p.on("console", (m) => { if (m.type() === "error" && !/fonts\.g|favicon|Failed to load resource|status of 4\d\d/.test(m.text())) errors.push(`${who}: ${m.text()}`); });
  p.on("dialog", (d) => d.dismiss());
  // A device that finished setup earlier (the sign-in flow itself is covered by e2e.mjs).
  await p.evaluateOnNewDocument((name) => { if (!localStorage.getItem("ewudiots.v2")) localStorage.setItem("ewudiots.v2", JSON.stringify({ onboarded: true, role: "student", profile: { name, department: "CSE", creditsTotal: 140 } })); }, users[who].name);
  await p.goto(`${BASE}/app.html#/login?m=signin`, { waitUntil: "networkidle2" });
  await p.waitForSelector("#au-in");
  await p.type('#au-in [name="who"]', users[who].sid); await p.type('#au-in [name="password"]', PASS);
  await p.$eval("#au-in", (f) => f.requestSubmit());
  await p.waitForFunction(() => location.hash.startsWith("#/home"), { timeout: 20000 });
  return p;
}
const go = async (p, h) => { await p.evaluate((x) => { location.hash = x; }, h); await wait(500); };
const until = (p, fn, arg, timeout = 15000) => p.waitForFunction(fn, { timeout, polling: 200 }, arg).then(() => true, () => false);
const hasText = (p, t, timeout) => until(p, (x) => document.querySelector("#main")?.innerText.includes(x) || document.querySelector("#modal")?.innerText.includes(x), t, timeout);
const click = async (p, sel) => { await p.waitForSelector(sel, { timeout: 15000 }); await p.$eval(sel, (el) => el.click()); await wait(400); };
const typeIn = async (p, sel, text) => { await p.waitForSelector(sel, { timeout: 15000 }); await p.$eval(sel, (el) => { el.value = ""; }); await p.type(sel, text); };
const shot = (p, name) => p.screenshot({ path: resolve(SHOTS, `${name}.png`) });

try {
  await setup();
  await build({ root: resolve("."), logLevel: "silent" });
  srv = await preview({ root: resolve("."), logLevel: "silent", preview: { port: PORT, strictPort: true } });
  browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });

  /* ── 1. Admin opens EWUdiots Club from More ── */
  const A = await person("admin");
  await go(A, "#/more");
  check("More shows the EWUdiots Club entry", !!(await A.$('.cl-entry[href="#/club/feed"]')));
  await click(A, ".cl-entry");
  check("club mode: its own navigation", await until(A, () => document.body.dataset.mode === "club" && !!document.querySelector('#bottom-nav a[href="#/club/explore"]')));
  check("feed renders", await hasText(A, "What's happening in EWU's clubs"));
  await shot(A, "01-feed");
  await go(A, "#/club/explore");
  check("explore lists EWU's 23 clubs (+ the test club)", await until(A, () => document.querySelectorAll(".cl-card").length >= 24));
  await shot(A, "02-explore");
  await go(A, "#/club/mine");
  check("admin sees their club with Manage", await until(A, (id) => !!document.querySelector(`a[href="#/club/manage?c=${id}"]`), clubId));
  await go(A, `#/club/manage?c=${clubId}`);
  check("console overview", await hasText(A, "Get your club ready"));
  await shot(A, "03-console");

  /* ── 2. Invite the member by student ID ── */
  await go(A, `#/club/manage?c=${clubId}&tab=invites`);
  await typeIn(A, '#iv-form [name="who"]', PEOPLE.member[0]);
  await click(A, "#iv-form button.primary");
  check("invite sent", await hasText(A, `${PEOPLE.member[0]}@std.ewubd.edu`));

  /* ── 3. Members-only post + recruitment form ── */
  await go(A, `#/club/manage?c=${clubId}&tab=posts&new=1`);
  await A.waitForSelector("#ps-form");
  await A.select('#ps-form [name="visibility"]', "members");
  await typeIn(A, '#ps-form [name="title"]', "Members meeting on Thursday");
  await typeIn(A, '#ps-form [name="body"]', "Room FUB-603 at 2 PM. Bring your laptops.");
  await click(A, '#ps-form [data-st="published"]');
  check("members-only post published", await hasText(A, "Members meeting on Thursday"));
  await go(A, `#/club/manage?c=${clubId}&tab=forms&new=1`);
  await A.waitForSelector("#fb-form");
  await typeIn(A, '#fb-form [name="title"]', "Join E2E Robotics");
  check("membership template has questions", (await A.$$(".cl-q")).length >= 2);
  await shot(A, "04-form-builder");
  await click(A, '#fb-form [data-save="open"]');
  check("form saved and open", await hasText(A, "Join E2E Robotics"));
  const formId = (await sql(`select id from public.club_forms where club_id = '${clubId}' limit 1`))[0]?.id;
  check("form row exists", !!formId);

  /* ── 4. The invited member signs in and is in straight away ── */
  const B = await person("member");
  check("invite claimed on sign-in", (await sql(`select count(*)::int n from public.club_members where club_id = '${clubId}' and user_id = '${users.member.id}' and status = 'active'`))[0].n === 1);
  await go(B, `#/club/space?c=${clubId}`);
  check("member sees the members-only post", await hasText(B, "Members meeting on Thursday", 20000));
  await shot(B, "05-space");

  /* ── 5. Applicant applies through the form ── */
  const C = await person("applicant");
  await go(C, `#/club/c?slug=${slug}`);
  check("profile shows Apply to join", await until(C, (id) => !!document.querySelector(`a[href="#/club/form?id=${id}"]`), formId));
  await shot(C, "06-profile");
  await go(C, `#/club/space?c=${clubId}`);
  check("non-member can't see the members' space", await hasText(C, "This space is for members"));
  await go(C, `#/club/form?id=${formId}`);
  await C.waitForSelector("#fm-form");
  await click(C, "#fm-form button.primary");
  check("required answers are checked before sending", await hasText(C, "Please check the highlighted answers."));
  const firstLong = await C.$eval("#fm-form textarea", (t) => t.name);
  await typeIn(C, `#fm-form [name="${firstLong}"]`, "I build line-following robots and want to learn more.");
  await typeIn(C, '#fm-form [name="_phone"]', "01712345678");
  await shot(C, "07-form-fill");
  await click(C, "#fm-form button.primary");
  check("application sent", await hasText(C, "The club will review it", 20000));

  /* ── 6. Admin reviews: sees the phone number, accepts ── */
  await go(A, `#/club/manage?c=${clubId}&tab=responses&form=${formId}`);
  check("responses show the applicant with phone", await hasText(A, "01712345678", 20000));
  await shot(A, "08-responses");
  await click(A, "[data-open]");
  await click(A, '[data-rs="accepted"]');
  check("accepting the membership form makes them a member", await until(A, () => true) && (await (async () => { for (let i = 0; i < 20; i++) { const n = (await sql(`select count(*)::int n from public.club_members where club_id = '${clubId}' and user_id = '${users.applicant.id}' and status = 'active'`))[0].n; if (n) return true; await wait(500); } return false; })()));
  check("applicant got an inbox message", (await sql(`select count(*)::int n from public.user_messages where user_id = '${users.applicant.id}'`))[0].n >= 1);
  await go(C, "#/club/mine"); await C.reload({ waitUntil: "networkidle2" });
  check("applicant now sees the club in My clubs", await until(C, (id) => !!document.querySelector(`a[href="#/club/space?c=${id}"]`), clubId, 20000));
  await go(C, `#/club/manage?c=${clubId}`);
  check("a general member can't open the console", await hasText(C, "Only the club's organisers can open this"));

  /* ── 7. Attendance by rotating code ── */
  await go(A, `#/club/manage?c=${clubId}&tab=attendance`);
  await typeIn(A, '#at-new [name="title"]', "Weekly meeting");
  await click(A, "#at-new button");
  check("live code is shown", await until(A, () => /^\d{3} \d{3}$/.test(document.querySelector("#at-code")?.textContent || ""), null, 20000));
  await shot(A, "09-attendance-live");
  const code = (await A.$eval("#at-code", (e) => e.textContent)).replace(/\D/g, "");
  await go(B, `#/club/space?c=${clubId}&tab=attendance`); await B.reload({ waitUntil: "networkidle2" });
  await click(B, "#sp-checkin");
  await typeIn(B, '#ci-form [name="code"]', code);
  await click(B, "#ci-form button.primary");
  check("member checks in with the code", (await (async () => { for (let i = 0; i < 20; i++) { const n = (await sql(`select count(*)::int n from public.club_attendance where user_id = '${users.member.id}'`))[0].n; if (n) return true; await wait(500); } return false; })()));

  /* ── 8. Anonymous poll ── */
  await go(A, `#/club/manage?c=${clubId}&tab=polls`);
  await typeIn(A, '#pl-form [name="title"]', "Workshop day?");
  await typeIn(A, '#pl-form [name="options"]', "Saturday\nSunday");
  await A.select('#pl-form [name="results"]', "live");
  await click(A, "#pl-form button.primary");
  await go(B, `#/club/space?c=${clubId}&tab=polls`); await B.reload({ waitUntil: "networkidle2" });
  await B.waitForSelector("[data-vote] input");
  await B.$eval("[data-vote] input", (i) => { i.checked = true; });
  await click(B, "[data-vote] button");
  check("vote counted, voter not stored on the ballot", await until(B, () => document.querySelector(".cl-poll")?.innerText.includes("you voted"), null, 15000)
    && (await sql(`select bool_and(b.user_id is null) ok from public.club_ballots b join public.club_polls p on p.id = b.poll_id where p.club_id = '${clubId}'`))[0].ok === true);
  await shot(B, "10-poll");

  /* ── 9. Certificates and the public check ── */
  await go(A, `#/club/manage?c=${clubId}&tab=certs`);
  await A.waitForSelector('#ce-form [name="source"]');
  await A.select('#ce-form [name="source"]', "members");
  await typeIn(A, '#ce-form [name="event"]', "E2E Robotics Workshop");
  await click(A, "#ce-form button.primary");
  const cert = (await (async () => { for (let i = 0; i < 20; i++) { const r = await sql(`select code from public.club_certificates where club_id = '${clubId}' and user_id = '${users.member.id}'`); if (r.length) return r[0]; await wait(500); } return null; })());
  check("certificates issued to members", !!cert);
  await go(B, "#/club/me?tab=certs"); await B.reload({ waitUntil: "networkidle2" });
  check("member sees the certificate under Me", await hasText(B, "E2E Robotics Workshop", 20000));
  if (cert) { await go(B, `#/club/cert?code=${cert.code}`); check("public check confirms it", await hasText(B, "Real certificate", 15000)); await shot(B, "11-cert-check"); }

  /* ── 10. Desktop console look ── */
  await A.setViewport({ width: 1366, height: 900 });
  await go(A, `#/club/manage?c=${clubId}&tab=responses&form=${formId}`); await wait(1500);
  check("desktop console sidebar", await A.$eval(".cl-console-nav", (n) => getComputedStyle(n).display !== "none").catch(() => false));
  await shot(A, "12-console-desktop");
  check("no horizontal scroll on phone (member space)", await B.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
} catch (e) {
  check("run completed", false, e.message.split("\n")[0]);
} finally {
  await browser?.close(); await srv?.close?.(); await cleanup();
}
console.log(results.join("\n"));
const relevant = errors.filter((e) => !/AuthApiError|refresh_token/i.test(e));
console.log(relevant.length ? `\nJS errors:\n${relevant.join("\n")}` : "\nNo JS errors.");
if (relevant.length) process.exitCode = 1;
console.log(`${results.filter((r) => r.startsWith("PASS")).length}/${results.length} passed · screenshots in ${SHOTS}`);
