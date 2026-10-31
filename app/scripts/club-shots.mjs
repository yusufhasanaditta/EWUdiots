// Design check for EWUdiots Club: screenshots of club screens at phone size, to compare with the boards in
// "UI Design/Ewudiots Club". Makes a throwaway club with sample data (two throwaway accounts), signs in, captures the
// screens you name and deletes everything again. Nothing is tested here; npm run test:clubs does that.
// Usage (from app/):  node scripts/club-shots.mjs [names…]   (no names = all)   SHOTS_W=1366 for desktop
//   Screenshots go to app/.shots/design/<name>.png
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
const OUT = resolve(import.meta.dirname, "../.shots/design");
mkdirSync(OUT, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const sql = async (query) => { const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, { method: "POST", headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" }, body: JSON.stringify({ query }) }); const t = await r.text(); if (!r.ok) throw new Error(t); return JSON.parse(t); };
const adminApi = async (path, method = "GET", body) => { const r = await fetch(`${URL_}/auth/v1/admin/${path}`, { method, headers: { apikey: SERVICE, authorization: `Bearer ${SERVICE}`, "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined }); const t = await r.text(); if (!r.ok) throw new Error(`${method} ${path}: ${t}`); return t ? JSON.parse(t) : null; };

const tag = Date.now().toString(36).slice(-5), PASS = `Shots-${tag}-pass1`;
const PEOPLE = { admin: ["2099-9-99-811", "Yusuf Hasan"], member: ["2099-9-99-812", "Fariha Rahman"] };
const users = {};
let clubId = null;

async function setup() {
  for (const [k, [sid, name]] of Object.entries(PEOPLE)) {
    const email = `${sid}@std.ewubd.edu`;
    const old = (await adminApi("users?per_page=1000")).users?.find((u) => u.email === email);
    if (old) await adminApi(`users/${old.id}`, "DELETE");
    users[k] = { ...(await adminApi("users", "POST", { email, password: PASS, email_confirm: true, user_metadata: { name, role: "student" } })), sid, name };
  }
  const [c] = await sql(`insert into public.clubs (slug, name, short_name, category, status, verified, join_mode, tagline, about, color, features)
    values ('shots-${tag}', 'Design Check CSE Club ${tag}', 'CSE Club', 'tech', 'active', true, 'apply', 'Code · Create · Collaborate', 'A community for Computer Science and Engineering students to learn, build, and grow together through workshops, competitions, and real-world projects.', '#4F2BFF', '{"store":true,"sponsors":true,"collab":true}') returning id`);
  clubId = c.id;
  const A = users.admin.id, M = users.member.id;
  await sql(`select public.club_add_member('${clubId}', '${A}', 3, 'Yusuf Hasan', '${users.admin.email}', '${PEOPLE.admin[0]}', 'CSE', null);
    select public.club_add_member('${clubId}', '${M}', 4, 'Fariha Rahman', '${users.member.email}', '${PEOPLE.member[0]}', 'EEE', null);
    update public.club_members set role_id = (select id from public.club_roles where club_id = '${clubId}' and name = 'President') where club_id = '${clubId}' and user_id = '${A}';
    update public.clubs set store_settings = '{"payment_numbers":{"bkash":"01700000000"},"pickup_points":["Admin Building"],"allow_cash":true,"return_days":7}' where id = '${clubId}';
    insert into public.club_posts (club_id, title, body, kind, visibility, author_id) values
      ('${clubId}', 'Tech Career Talk 2026', 'Join us for an exciting session with industry professionals. Learn, ask questions, and get inspired!', 'announcement', 'public', '${A}'),
      ('${clubId}', 'Recruitment Results Released', 'Thank you to everyone who applied! Check the list of selected members and next steps.', 'announcement', 'members', '${A}');
    insert into public.events (title, kind, starts_at, ends_at, venue, description, status, source, club_id, visibility, created_by, capacity, perks, speakers, agenda, faqs, ticketing) values
      ('Tech Talk 2026', 'seminar', now() + interval '4 days', now() + interval '4 days 2 hours', 'CSE Lab 403', 'Tech Talk 2026 brings together industry experts, innovators, and students for an evening of insights, networking, and inspiration.', 'approved', 'club', '${clubId}', 'public', '${A}', 200,
        array['Industry Experts as Speakers', 'Networking Opportunities', 'Certificate for Participants'], '[{"name":"Nafis Rahman","role":"Software Engineer · Alumni (CSE)"},{"name":"Tanzila Hossain","role":"AI Researcher · Speaker"}]',
        '[{"at":"3:00 PM","title":"Registration & Check-in"},{"at":"3:30 PM","title":"Opening talk"}]', '[{"q":"Is it free?","a":"Yes, for all EWU students."}]',
        '{"enabled":true,"tiers":[{"id":"free","name":"Student","price":0},{"id":"vip","name":"Front row","price":150,"qty":20}],"methods":["bkash","cash"],"scanners":"staff","door_cash":true}'),
      ('AI in Real Life Workshop', 'workshop', now() + interval '6 days', now() + interval '6 days 3 hours', 'CSE Lab, EWU', 'Hands-on AI workshop.', 'approved', 'club', '${clubId}', 'public', '${A}', 60, '{}', '[]', '[]', '[]', '{}');
    insert into public.club_projects (club_id, title, description, status, due, team) values ('${clubId}', 'MARS Rover', 'Mechanical team building the new chassis', 'in_progress', current_date + 20, array['${A}'::uuid, '${M}'::uuid]);
    insert into public.club_tasks (club_id, project_id, title, status, priority, assignee, due) select '${clubId}', id, t, st, pr, '${A}', current_date + d from public.club_projects, (values ('Prepare presentation for Tech Talk', 'todo', 'high', 3), ('Design event poster', 'done', 'medium', 1), ('Collect participant data', 'doing', 'medium', 5)) v(t, st, pr, d) where club_id = '${clubId}';
    insert into public.club_meetings (club_id, title, starts_at, ends_at, location, online_link, agenda) values ('${clubId}', 'Club Executive Meeting', now() + interval '2 days', now() + interval '2 days 1 hour', 'Room 405, Main Building', 'https://meet.google.com/abc-defg-hij', '[{"at":"5:00 PM","title":"Review previous action items"}]');
    insert into public.club_finance (club_id, kind, amount, category, note) values ('${clubId}', 'income', 25000, 'Sponsorship', 'Sponsorship from TechCorp'), ('${clubId}', 'expense', 4500, 'Venue', 'Hall booking');
    insert into public.club_products (club_id, name, category, price, sizes, colors, stock, status) values ('${clubId}', 'CSE Club Hoodie', 'hoodies', 1200, array['M','L'], '[{"name":"Black","hex":"#111111"}]', '{"M|Black":8,"L|Black":3}', 'active');
    insert into public.club_folders (club_id, name, color) values ('${clubId}', 'Event Planning', 'amber');
    insert into public.club_polls (club_id, title, description, options, closes_at, results, category) values ('${clubId}', 'Tech Talk 2026 - Preferred Date', 'Help us choose the best date for our upcoming Tech Talk event.', '["25 October (Sunday)","26 October (Monday)","28 October (Wednesday)"]', now() + interval '2 days', 'live', 'event'),
      ('${clubId}', 'Club T-shirt Design', 'Vote for your favourite T-shirt design for this year.', '["Design A","Design B"]', now() + interval '5 days', 'live', 'general');`);
  await sql(`select public.club_seed_channels('${clubId}')`).catch(() => {});
}
async function cleanup() {
  try { if (clubId) await sql(`delete from public.club_orders where club_id = '${clubId}'; delete from public.clubs where id = '${clubId}'`); } catch (e) { console.warn("club cleanup:", e.message); }
  for (const u of Object.values(users)) { try { await sql(`delete from public.user_messages where user_id = '${u.id}'`); await adminApi(`users/${u.id}`, "DELETE"); } catch (e) { console.warn("user cleanup:", e.message); } }
}

const PORT = 4184, BASE = `http://localhost:${PORT}`;
const W = Number(process.env.SHOTS_W || 393), H = W > 900 ? 900 : 852;
let browser, srv;
try {
  await setup();
  const ids = Object.fromEntries((await sql(`select 'ev' k, id::text v from public.events where club_id = '${clubId}' and title = 'Tech Talk 2026' union all select 'pr', id::text from public.club_projects where club_id = '${clubId}'
    union all select 'mt', id::text from public.club_meetings where club_id = '${clubId}' union all select 'pd', id::text from public.club_products where club_id = '${clubId}' union all (select 'pl', id::text from public.club_polls where club_id = '${clubId}' limit 1)`)).map((r) => [r.k, r.v]));
  const SCREENS = {
    home: "#/club/home", feed: "#/club/feed", explore: "#/club/explore", profile: `#/club/c?slug=shots-${tag}`, space: `#/club/space?c=${clubId}`, members: `#/club/members?c=${clubId}`, member: `#/club/member?c=${clubId}&u=${users.member.id}`, pass: "#/club/tickets",
    events: "#/club/events", event: `#/club/event?id=${ids.ev}`, eventadmin: `#/club/eventadmin?id=${ids.ev}`, tickets: `#/club/eventadmin?id=${ids.ev}&tab=tickets`, checkin: `#/club/checkin?id=${ids.ev}`,
    messages: "#/club/messages", notifications: "#/club/notifications", meetings: `#/club/meetings?c=${clubId}`, meeting: `#/club/meeting?id=${ids.mt}`, projects: `#/club/projects?c=${clubId}`,
    project: `#/club/project?id=${ids.pr}&tab=tasks`, resources: `#/club/resources?c=${clubId}`, polls: "#/club/polls", poll: `#/club/poll?id=${ids.pl}`, elections: "#/club/elections", recruit: "#/club/recruit", finance: `#/club/finance?c=${clubId}`,
    analytics: `#/club/analytics?c=${clubId}`, store: "#/club/store", product: `#/club/product?id=${ids.pd}`, merch: `#/club/merch?c=${clubId}`, orders: `#/club/ordersadmin?c=${clubId}`,
    sponsors: "#/club/sponsors", collab: "#/club/collab", help: "#/club/help", privacy: "#/club/privacy", me: "#/club/me", more: "#/club/more", roles: `#/club/manage?c=${clubId}&tab=roles`,
    committee: `#/club/committee?c=${clubId}`, mytickets: "#/club/tickets", scan: "#/club/scan"
  };
  const want = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(SCREENS);
  await build({ root: resolve("."), logLevel: "silent" });
  srv = await preview({ root: resolve("."), logLevel: "silent", preview: { port: PORT, strictPort: true } });
  browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
  const p = await browser.newPage();
  await p.setViewport({ width: W, height: H, deviceScaleFactor: 1, isMobile: W < 900, hasTouch: W < 900 });
  await p.evaluateOnNewDocument(() => { if (!localStorage.getItem("ewudiots.v2")) localStorage.setItem("ewudiots.v2", JSON.stringify({ onboarded: true, role: "student", profile: { name: "Yusuf Hasan", department: "CSE", creditsTotal: 140 } })); });
  await p.goto(`${BASE}/app.html#/login?m=signin`, { waitUntil: "networkidle2" });
  await p.waitForSelector("#au-in");
  await p.type('#au-in [name="who"]', users.admin.sid); await p.type('#au-in [name="password"]', PASS);
  await p.$eval("#au-in", (f) => f.requestSubmit());
  await p.waitForFunction(() => location.hash.startsWith("#/home"), { timeout: 20000 });
  for (const name of want) {
    if (!SCREENS[name]) { console.warn(`unknown screen ${name}`); continue; }
    await p.evaluate((h) => { location.hash = h; }, SCREENS[name]);
    await wait(2500);
    await p.evaluate(() => document.querySelectorAll(".toast, #toasts > *").forEach((t) => t.remove()));
    if (process.env.PROBE) console.log(await p.evaluate((sel) => [...document.querySelectorAll(sel)].slice(0, 3).map((e) => { const c = getComputedStyle(e); return `${e.tagName}.${e.className} fs=${c.fontSize} w=${e.getBoundingClientRect().width} h=${e.getBoundingClientRect().height} bg=${c.backgroundColor} rows=${c.gridTemplateRows} parent=${e.parentElement.className}`; }).join(" | "), process.env.PROBE));
    await p.screenshot({ path: resolve(OUT, `${name}${W > 900 ? "-desktop" : ""}.png`), fullPage: true });
    console.log(`shot ${name}`);
  }
} catch (e) { console.error(e); process.exitCode = 1; } finally {
  await browser?.close(); await srv?.close?.(); srv?.httpServer?.close?.();
  await cleanup();
}
