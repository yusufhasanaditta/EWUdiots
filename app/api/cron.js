// Scheduled jobs. Vercel Cron calls GET /api/cron daily with "Authorization: Bearer $CRON_SECRET"; admins with the
// jobs.run permission can run one now from the admin panel with their own sign-in token. Each run is logged in job_runs.
import { fetchNews } from "../src/news.js";
import { fetchNotices } from "../src/notices.js";
import { fetchNewsletters } from "../src/newsletters.js";
import { fetchEvents } from "../src/events.js";
import { fromSnapshot, groupRows } from "../src/offered.js";
import { normSemester } from "../src/parser.js";
import { db, hasService } from "./_db.js";
import { timingSafeEqual } from "node:crypto";

const now = () => new Date().toISOString();
const TRACKER = "https://ewucoursetracker.live";
const upsert = (rows) => db("/rest/v1/feed_items?on_conflict=id", { method: "POST", service: true, prefer: "resolution=merge-duplicates,return=minimal", body: rows });
const JOBS = {
  // News and notices: only the fields that come from ewubd.edu are written, so an admin's hide / pin / new title stays.
  async news() {
    const items = await fetchNews(3);
    if (items.length) await upsert(items.map((n) => ({ id: `news:${n.id}`.slice(0, 200), kind: "news", title: n.title.slice(0, 300), url: n.url, date: n.date || null, image: n.image || "", excerpt: (n.excerpt || "").slice(0, 1000), tag: n.tag || "", source: "auto", fetched_at: now() })));
    return `${items.length} news items`;
  },
  async notices() {
    const items = await fetchNotices(3);
    if (items.length) await upsert(items.map((n) => ({ id: `notice:${n.id}`.slice(0, 200), kind: "notice", title: n.title.slice(0, 300), url: n.url || "", pdf: n.pdf || "", date: n.date || null, category: n.cat || "", source: "auto", fetched_at: now() })));
    return `${items.length} notices`;
  },
  // Official events go in approved. Rows that already exist are left alone, so an admin's edit, pin or rejection stays.
  async events() {
    const today = new Date(Date.now() + 6 * 36e5).toISOString().slice(0, 10); // Dhaka date
    const items = await fetchEvents(2, today);
    if (items.length) await db("/rest/v1/events?on_conflict=ext_id", { method: "POST", service: true, prefer: "resolution=ignore-duplicates,return=minimal",
      body: items.map((e) => ({ ext_id: `ewu:${e.id}`.slice(0, 200), title: e.title.slice(0, 160), kind: e.kind, all_day: true, starts_at: `${e.start}T00:00:00+06:00`, ends_at: e.end ? `${e.end}T23:59:00+06:00` : null,
        venue: e.venue, organizer: "East West University", link: e.url, image: e.image, status: "approved", source: "auto", created_by: null })) });
    return `${items.length} official events checked`;
  },
  // Offered courses (every section, faculty, seats, time, room) from ewucoursetracker.live's public snapshots: the newest
  // snapshot of each semester replaces that semester's list. Only that host, no redirects, ids checked before use.
  async courses() {
    const get = async (path) => { const r = await fetch(TRACKER + path, { redirect: "error", signal: AbortSignal.timeout(25e3), headers: { "user-agent": "EWUdiots/1.0 (+https://ewudiots.vercel.app)" } }); if (!r.ok) throw new Error(`${path}: ${r.status}`); return r.json(); };
    const { snapshots = [] } = await get("/api/history");
    const newest = new Map();
    for (const s of snapshots) {
      const sem = normSemester(s.semesterName || ""), id = String(s.id || s._id || "");
      if (!sem || !/^[A-Za-z0-9_-]{1,64}$/.test(id)) continue;
      const at = new Date(s.timestamp || s.createdAt || 0).getTime();
      if (!newest.has(sem) || at > newest.get(sem).at) newest.set(sem, { id, at });
    }
    if (!newest.size) return "no public snapshots on the tracker yet";
    const have = new Map(((await db("/rest/v1/offered_lists?select=sem,snapshot_id", { service: true })) || []).map((r) => [r.sem, r.snapshot_id]));
    const done = [];
    for (const [sem, { id, at }] of newest) {
      if (have.get(sem) === id) continue;
      const snap = await get(`/api/snapshot/${encodeURIComponent(id)}`);
      const courses = groupRows(fromSnapshot(Array.isArray(snap.courses) ? snap.courses : []));
      if (!courses.length) continue;
      const data = { sem, updated: new Date(at || Date.now()).toISOString(), source: "ewucoursetracker.live", courses };
      await db("/rest/v1/offered_lists?on_conflict=sem", { method: "POST", service: true, prefer: "resolution=merge-duplicates,return=minimal", body: [{ sem, data, snapshot_id: id, courses: courses.length, updated_at: now() }] });
      done.push(`${sem} (${courses.length} courses)`);
    }
    return done.length ? `updated ${done.join(", ")}` : "no new snapshots";
  },
  // New newsletter issues appear in the admin panel (Alumni → Newsletter import) for an admin to pull stories from.
  async newsletters() {
    const list = await fetchNewsletters();
    const known = new Set(((await db("/rest/v1/newsletter_issues?select=url", { service: true })) || []).map((r) => r.url));
    const fresh = list.filter((n) => !known.has(n.url));
    // The first run records the back catalogue as already imported (those stories ship with the app).
    const status = known.size ? "new" : "imported";
    if (fresh.length) await db("/rest/v1/newsletter_issues", { method: "POST", service: true, prefer: "return=minimal", body: fresh.map((n) => ({ ...n, status })) });
    return `${fresh.length} new issue(s)`;
  },
  // Trash older than 30 days, analytics older than a year and job logs older than 90 days are removed for good.
  async cleanup() {
    const ago = (d) => new Date(Date.now() - d * 864e5).toISOString();
    await db(`/rest/v1/posts?deleted_at=lt.${ago(30)}`, { method: "DELETE", service: true, prefer: "return=minimal" });
    await db(`/rest/v1/page_views?day=lt.${ago(365).slice(0, 10)}`, { method: "DELETE", service: true, prefer: "return=minimal" });
    await db(`/rest/v1/job_runs?started_at=lt.${ago(90)}`, { method: "DELETE", service: true, prefer: "return=minimal" });
    return "old trash and logs removed";
  },
  // ewucoursetracker.live's own announcement (its /api/notice): shown on the Notice Board when it changes.
  async tracker() {
    const r = await fetch(TRACKER + "/api/notice", { redirect: "error", signal: AbortSignal.timeout(15e3), headers: { "user-agent": "EWUdiots/1.0 (+https://ewudiots.vercel.app)" } });
    if (!r.ok) throw new Error(`/api/notice: ${r.status}`);
    const n = (await r.json())?.notice;
    if (!n?.isActive || !n.message) return "no active tracker notice";
    const id = String(n._id || n.id || "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64), when = new Date(n.updatedAt || n.createdAt || Date.now());
    if (!id || Number.isNaN(when.getTime())) return "tracker notice without an id or date";
    const title = `ewucoursetracker.live: ${String(n.message).replace(/\s+/g, " ").trim()}`.slice(0, 300);
    await upsert([{ id: `notice:tracker-${id}-${when.getTime()}`.slice(0, 200), kind: "notice", title, url: TRACKER + "/", pdf: "", date: when.toISOString().slice(0, 10), category: "", source: "auto", fetched_at: now() }]);
    return "tracker notice saved";
  }
};

async function allowed(req) {
  const auth = String(req.headers.authorization || "");
  const want = Buffer.from(`Bearer ${process.env.CRON_SECRET || ""}`), got = Buffer.from(auth);
  if (process.env.CRON_SECRET && got.length === want.length && timingSafeEqual(got, want)) return "schedule"; // constant time: no secret leaks through timing
  const token = auth.replace(/^Bearer\s+/, "");
  if (!token || token.length > 4000) return null;
  try { return (await db("/rest/v1/rpc/can", { method: "POST", token, body: { p: "jobs.run" } })) === true ? "admin" : null; } catch { return null; }
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (!hasService) return res.status(503).json({ error: "Jobs aren't configured (SUPABASE_SERVICE_ROLE_KEY)." });
  const trigger = await allowed(req);
  if (!trigger) return res.status(401).json({ error: "Not allowed" });
  const want = String(req.query?.job || "all"), names = want === "all" ? Object.keys(JOBS) : want.split(",").filter((j) => JOBS[j]);
  if (!names.length) return res.status(400).json({ error: "Unknown job" });
  const results = [];
  for (const job of names) {
    const t0 = Date.now(); let ok = true, detail = "";
    try { detail = await JOBS[job](); } catch (e) { ok = false; detail = String(e.message || e).slice(0, 300); }
    results.push({ job, ok, detail, ms: Date.now() - t0 });
    await db("/rest/v1/job_runs", { method: "POST", service: true, prefer: "return=minimal", body: { job, ok, detail, ms: Date.now() - t0, trigger } }).catch(() => {});
  }
  res.status(results.every((r) => r.ok) ? 200 : 207).json({ results });
}
