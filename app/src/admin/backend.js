/* Admin data access. "supabase" = the live database (RLS: only rows in public.admins may write).
   "demo" = a sandbox kept in this browser's localStorage so the panel can be tried before the server is connected;
   nothing done in demo mode reaches students. Both expose the same small API. */
import * as cloud from "../cloud.js";

const TABLES = ["feed_items", "media_items", "revisions", "job_runs", "newsletter_issues", "role_permissions", "users", "user_messages", "feedback", "posts", "site_settings", "alumni_profiles", "faculty_overrides", "campus_rooms", "reports", "reviews", "resources", "admins", "admin_invites", "admin_log"];
const KEYS = { media_items: "path", role_permissions: "role", newsletter_issues: "url", site_settings: "key", faculty_overrides: "slug", campus_rooms: "code", admins: "user_id", admin_invites: "email" };

export function supabaseBackend(user) {
  const sb = cloud.sb;
  const ok = ({ data, error }) => { if (error) throw new Error(error.message); return data; };
  return {
    kind: "supabase", email: user.email,
    async list(table, { order = "created_at", asc = false, eq, limit = 500, select = "*" } = {}) {
      let q = sb.from(table).select(select);
      if (eq) Object.entries(eq).forEach(([k, v]) => { q = q.eq(k, v); });
      if (order) q = q.order(order, { ascending: asc });
      return ok(await q.limit(limit)) || [];
    },
    async count(table, eq) { let q = sb.from(table).select("*", { count: "exact", head: true }); if (eq) Object.entries(eq).forEach(([k, v]) => { q = q.eq(k, v); }); const r = await q; if (r.error) throw new Error(r.error.message); return r.count || 0; },
    async insert(table, row) { return ok(await sb.from(table).insert(row).select().single()); },
    async update(table, match, patch) { let q = sb.from(table).update(patch); Object.entries(match).forEach(([k, v]) => { q = q.eq(k, v); }); const rows = ok(await q.select()); if (!rows?.length) throw new Error("Nothing was changed (no permission, or it's gone)."); return rows; },
    async upsert(table, row) { return ok(await sb.from(table).upsert(row, { onConflict: KEYS[table] || "id" }).select()); },
    async remove(table, match) { let q = sb.from(table).delete(); Object.entries(match).forEach(([k, v]) => { q = q.eq(k, v); }); const rows = ok(await q.select()); if (!rows?.length) throw new Error("Nothing was removed (no permission, or it's already gone)."); return rows; },
    async log(action, target = "") { await sb.from("admin_log").insert({ email: user.email, action, target: String(target).slice(0, 200) }); },
    async rpc(fn, args = {}) { return ok(await sb.rpc(fn, args)); },
    async sendReset(email) { const { error } = await sb.auth.resetPasswordForEmail(email); if (error) throw new Error(error.message); },
    // Media library: public "media" bucket (only admins with media.write can write, enforced by storage policies).
    async upload(path, blob) { ok(await sb.storage.from("media").upload(path, blob, { contentType: blob.type, upsert: true })); return sb.storage.from("media").getPublicUrl(path).data.publicUrl; },
    async removeFile(path) { ok(await sb.storage.from("media").remove([path])); ok(await sb.from("media_items").delete().eq("path", path)); },
    // Scheduled jobs run on the server (api/cron.js), which checks the jobs.run permission with this session's token.
    async runJob(job) {
      const { data } = await sb.auth.getSession();
      const r = await fetch(`/api/cron?job=${encodeURIComponent(job)}`, { headers: { authorization: `Bearer ${data.session?.access_token || ""}` } });
      const j = await r.json().catch(() => ({})); if (!r.ok && r.status !== 207) throw new Error(j.error || `Job failed (${r.status})`);
      return j.results?.[0] || { ok: false, detail: "No result" };
    },
    signOut: () => cloud.signOut()
  };
}

/* ── Demo sandbox ── */
const DEMO_KEY = "ewudiots.admin.demo";
const now = () => new Date().toISOString();
const ago = (d) => new Date(Date.now() - d * 864e5).toISOString();
function seed() {
  let id = 1;
  return {
    posts: [
      { id: id++, kind: "announcement", title: "Advising week: plan with EWUdiots", body: "Online advising for Spring 2027 opens soon. Use the Advising Planner to find a clash-free routine before your slot.", image_url: "", link: "", tag: "Advising", pinned: true, published: true, starts_at: ago(1), ends_at: null, created_at: ago(1) },
      { id: id++, kind: "news", title: "EWUdiots now has a 3D campus map", body: "Search any room number and get step-by-step directions.", image_url: "", link: "", tag: "EWUdiots", pinned: false, published: true, starts_at: ago(2), ends_at: null, created_at: ago(2) }
    ],
    site_settings: [{ key: "banner", value: { on: true, title: "Welcome to the new EWUdiots", text: "Campus news, alumni and a 3D map are here.", tone: "purple", link: "#/news", cta: "See news" } }, { key: "features", value: {} }],
    alumni_profiles: [
      { id: id++, name: "Sample Graduate One", role: "Software Engineer", org: "Example Tech Ltd.", country: "Bangladesh", dept: "CSE", grad_year: 2024, sector: "Technology", note: "Started as an intern.", linkedin: "", status: "pending", created_at: ago(0.2) },
      { id: id++, name: "Sample Graduate Two", role: "MSc in Data Science", org: "Example University", country: "Germany", dept: "EEE", grad_year: 2023, sector: "Higher study", note: "", linkedin: "", status: "pending", created_at: ago(1.5) }
    ],
    faculty_overrides: [],
    campus_rooms: [{ code: "636", name: "CSE faculty office", kind: "office", block: "CS", floor: 5, u: null, v: null, updated_at: ago(3) }],
    reports: [{ id: id++, target_type: "review", target_id: "rv-demo-1", reason: "Personal attack", created_at: ago(0.5) }, { id: id++, target_type: "review", target_id: "rv-demo-1", reason: "", created_at: ago(0.4) }],
    reviews: [{ id: "rv-demo-1", faculty_init: "@SAMPLE.TEACHER", stars: 1, tags: [], course: "CSE101", body: "Sample reported review text for the demo.", status: "published", created_at: ago(2) }],
    resources: [],
    admins: [{ user_id: "demo-owner", email: "you@demo", role: "owner", created_at: ago(10) }],
    admin_invites: [],
    admin_log: [{ id: id++, email: "you@demo", action: "Opened demo mode", target: "", created_at: now() }],
    feed_items: [
      { id: "news:sample-1", kind: "news", title: "EWU students win a national programming contest", url: "https://www.ewubd.edu/news", date: ago(1).slice(0, 10), image: "", excerpt: "A sample automatic news item.", tag: "Achievement", category: "", source: "auto", hidden: false, pinned: false, title_override: "", tag_override: "", pdf: "", fetched_at: now(), updated_at: now() },
      { id: "notice:sample-1", kind: "notice", title: "Sample notice: class schedule for the next semester", url: "https://www.ewubd.edu/notice-board", date: ago(2).slice(0, 10), image: "", excerpt: "", tag: "", category: "Exams", source: "auto", hidden: false, pinned: false, title_override: "", tag_override: "", pdf: "", fetched_at: now(), updated_at: now() }],
    newsletter_issues: [{ url: "https://www.ewubd.edu/storage/app/uploads/public/sample.pdf", title: "Newsletter Summer 2026 (sample)", image: "", date: ago(5).slice(0, 10), status: "new", found_at: ago(1) }],
    role_permissions: [{ role: "admin", perms: ["posts.write", "messages.send", "site.edit", "features.edit", "media.write", "news.edit", "alumni.review", "faculty.edit", "rooms.edit", "reports.handle", "feedback.handle", "users.view", "users.manage", "security.view", "analytics.view", "jobs.run"] },
      { role: "editor", perms: ["posts.write", "messages.send", "site.edit", "media.write", "news.edit", "alumni.review", "faculty.edit", "rooms.edit", "analytics.view"] }, { role: "moderator", perms: ["reports.handle", "feedback.handle", "alumni.review", "users.view"] }],
    job_runs: [{ id: id++, job: "news", ok: true, detail: "12 news items", ms: 820, trigger: "schedule", started_at: ago(0.4) }],
    user_messages: [{ id: id++, user_id: null, title: "Welcome to EWUdiots", body: "Tell us what you'd like next from Help → Send feedback.", link: "", created_at: ago(3) }],
    feedback: [{ id: id++, user_id: "u2", email: "2024-1-60-002@std.ewubd.edu", kind: "idea", body: "Please add a bus schedule for the university shuttle.", status: "new", app_version: "2.5.0", created_at: ago(0.3) },
      { id: id++, user_id: "u3", email: "alumni.sample@gmail.com", kind: "bug", body: "The alumni filter by country resets when I go back.", status: "read", app_version: "2.4.0", created_at: ago(2) }],
    users: [["u1", "2024-1-60-001@std.ewubd.edu", "student", "Sample Student", 0.1], ["u2", "2024-1-60-002@std.ewubd.edu", "student", "Another Student", 1], ["u3", "alumni.sample@gmail.com", "alumni", "Sample Alumni", 4], ["u4", "faculty.sample@gmail.com", "faculty", "Sample Faculty", 8]]
      .map(([uid, email, role, name, d]) => ({ id: uid, email, role, name, created_at: ago(d + 2), last_sign_in_at: ago(d), confirmed: true, suspended: false })),
    _id: id
  };
}
export function demoBackend() {
  let db; try { db = JSON.parse(localStorage.getItem(DEMO_KEY)) || seed(); } catch { db = seed(); }
  const persist = () => { try { localStorage.setItem(DEMO_KEY, JSON.stringify(db)); } catch { /* storage full */ } };
  const match = (row, m) => Object.entries(m).every(([k, v]) => row[k] === v);
  const rev = (table, old) => { if (["posts", "site_settings", "feed_items", "alumni_profiles"].includes(table)) db.revisions.unshift({ id: db._id++, table_name: table, row_key: String(old.key || old.id), data: structuredClone(old), actor: "you@demo", created_at: now() }); };
  TABLES.forEach((t) => { db[t] = db[t] || []; });
  persist();
  return {
    kind: "demo", email: "you@demo",
    async list(table, { order = "created_at", asc = false, eq, limit = 500 } = {}) {
      let rows = db[table].filter((r) => !eq || match(r, eq));
      if (order) rows = rows.slice().sort((a, b) => (String(a[order] ?? "") < String(b[order] ?? "") ? -1 : 1) * (asc ? 1 : -1));
      return structuredClone(rows.slice(0, limit));
    },
    async count(table, eq) { return db[table].filter((r) => !eq || match(r, eq)).length; },
    async insert(table, row) { const r = { id: db._id++, created_at: now(), ...row }; db[table].push(r); persist(); return structuredClone(r); },
    // Demo keeps the same change history as the server trigger (posts, settings, feed, alumni).
    async update(table, m, patch) { const rows = db[table].filter((r) => match(r, m)); rows.forEach((r) => { rev(table, r); Object.assign(r, patch); }); persist(); return structuredClone(rows); },
    async upsert(table, row) { const k = KEYS[table] || "id", i = db[table].findIndex((r) => r[k] === row[k]); if (i >= 0) { rev(table, db[table][i]); Object.assign(db[table][i], row); } else db[table].push({ created_at: now(), ...row }); persist(); return [structuredClone(row)]; },
    async remove(table, m) { db[table].filter((r) => match(r, m)).forEach((r) => rev(table, r)); db[table] = db[table].filter((r) => !match(r, m)); persist(); },
    async log(action, target = "") { db.admin_log.push({ id: db._id++, email: "you@demo", action, target, created_at: now() }); persist(); },
    async rpc(fn, args = {}) {
      if (fn === "admin_users") return structuredClone(db.users.filter((u) => !args.q || (u.email + u.name).toLowerCase().includes(args.q.toLowerCase())));
      if (fn === "admin_set_suspended") { const u = db.users.find((x) => x.id === args.uid); if (u) u.suspended = args.suspend; persist(); return null; }
      if (fn === "admin_revoke_sessions") return 1;
      if (fn === "admin_auth_events") return db.users.flatMap((u, i) => [{ at: u.last_sign_in_at, action: "login", email: u.email, ip: `103.${120 + i}.x.x` }, { at: u.created_at, action: "user_signedup", email: u.email, ip: `103.${120 + i}.x.x` }]).sort((a, b) => (a.at < b.at ? 1 : -1));
      if (fn === "admin_stats") {
        const days = args.days || 30;
        return { users: db.users.length, students: 2, alumni: 1, faculty: 1, suspended: db.users.filter((u) => u.suspended).length, new_period: 4, new_prev: 2, active_7d: 3, sessions: 5, synced: 3, feedback_new: db.feedback.filter((f) => f.status === "new").length,
          signups: Array.from({ length: days }, (_, k) => ({ day: new Date(Date.now() - (days - 1 - k) * 864e5).toISOString().slice(0, 10), n: [3, 7, 8, 9].includes(days - 1 - k) ? 1 : 0 })) };
      }
      if (fn === "my_admin") return { role: "owner", perms: null };
      if (fn === "admin_analytics") {
        const days = args.days || 30, daily = Array.from({ length: days }, (_, k) => ({ day: new Date(Date.now() - (days - 1 - k) * 864e5).toISOString().slice(0, 10), n: 20 + ((k * 37) % 45) }));
        return { views: daily.reduce((a, d) => a + d.n, 0), visitors: Math.round(daily.reduce((a, d) => a + d.n, 0) * 0.38), views_prev: 1100, visitors_prev: 420, daily,
          pages: [["/", 410], ["/app/home", 380], ["/app/routine", 210], ["/app/notices", 160], ["/app/alumni", 90]].map(([path, n]) => ({ path, n })),
          sources: [["direct", 520], ["social", 240], ["search", 160], ["app", 140]].map(([source, n]) => ({ source, n })), devices: [["phone", 690], ["desktop", 320], ["tablet", 40]].map(([device, n]) => ({ device, n })) };
      }
      throw new Error(`Unknown function ${fn}`);
    },
    async sendReset() {},
    async upload(path, blob) { return new Promise((res) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.readAsDataURL(blob); }); },
    async removeFile(path) { db.media_items = db.media_items.filter((m) => m.path !== path); persist(); },
    async runJob(job) { const detail = { news: "12 news items (demo)", notices: "20 notices (demo)", newsletters: "0 new issue(s)", cleanup: "old trash and logs removed" }[job] || "done";
      db.job_runs.unshift({ id: db._id++, job, ok: true, detail, ms: 640, trigger: "admin", started_at: now() }); persist(); return { job, ok: true, detail }; },
    reset() { localStorage.removeItem(DEMO_KEY); },
    signOut: async () => {}
  };
}
