/* Admin data access. "supabase" = the live database (RLS: only rows in public.admins may write).
   "demo" = a sandbox kept in this browser's localStorage so the panel can be tried before the server is connected;
   nothing done in demo mode reaches students. Both expose the same small API. */
import * as cloud from "../cloud.js";

const TABLES = ["posts", "site_settings", "alumni_profiles", "faculty_overrides", "campus_rooms", "reports", "reviews", "resources", "admins", "admin_invites", "admin_log"];
const KEYS = { site_settings: "key", faculty_overrides: "slug", campus_rooms: "code", admins: "user_id", admin_invites: "email" };

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
    _id: id
  };
}
export function demoBackend() {
  let db; try { db = JSON.parse(localStorage.getItem(DEMO_KEY)) || seed(); } catch { db = seed(); }
  const persist = () => { try { localStorage.setItem(DEMO_KEY, JSON.stringify(db)); } catch { /* storage full */ } };
  const match = (row, m) => Object.entries(m).every(([k, v]) => row[k] === v);
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
    async update(table, m, patch) { const rows = db[table].filter((r) => match(r, m)); rows.forEach((r) => Object.assign(r, patch)); persist(); return structuredClone(rows); },
    async upsert(table, row) { const k = KEYS[table] || "id", i = db[table].findIndex((r) => r[k] === row[k]); if (i >= 0) Object.assign(db[table][i], row); else db[table].push({ created_at: now(), ...row }); persist(); return [structuredClone(row)]; },
    async remove(table, m) { db[table] = db[table].filter((r) => !match(r, m)); persist(); },
    async log(action, target = "") { db.admin_log.push({ id: db._id++, email: "you@demo", action, target, created_at: now() }); persist(); },
    reset() { localStorage.removeItem(DEMO_KEY); },
    signOut: async () => {}
  };
}
