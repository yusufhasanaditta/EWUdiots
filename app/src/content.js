/* Content managed in the admin panel (admin.html): team posts, site settings and feature switches, faculty listing
   changes, shared campus rooms and approved alumni profiles. Public read (anon key + RLS), cached for offline use. */
const CACHE = "ewudiots.content";
const EMPTY = { at: 0, posts: [], settings: {}, faculty: [], rooms: [], alumni: [] };
// Sections an admin can switch off for everyone (Settings → Features).
export const FEATURES = [["news", "News"], ["notices", "Notice board"], ["alumni", "Alumni"], ["alumni_submissions", "New alumni profiles"], ["map", "Campus map"], ["vault", "Study vault"], ["reviews", "Faculty reviews"], ["idcard", "ID card"], ["focus", "Focus & study tools"]];

export function createContent(cloud) {
  let data = (() => { try { return { ...EMPTY, ...JSON.parse(localStorage.getItem(CACHE)) }; } catch { return { ...EMPTY }; } })();
  let loading = null;
  const listeners = new Set();
  async function refresh() {
    if (!cloud.enabled || !cloud.sb) return data;
    if (loading) return loading;
    loading = (async () => {
      try {
        const sb = cloud.sb, pick = (r) => (r.error ? [] : r.data || []);
        const [posts, settings, faculty, rooms, alumni] = await Promise.all([
          sb.from("posts").select("id, kind, title, body, image_url, link, tag, pinned, starts_at, ends_at, created_at").eq("published", true).order("pinned", { ascending: false }).order("starts_at", { ascending: false }).limit(60),
          sb.from("site_settings").select("key, value"),
          sb.from("faculty_overrides").select("slug, hidden, init, room"),
          sb.from("campus_rooms").select("code, name, kind, block, floor, u, v"),
          sb.from("alumni_profiles").select("id, name, role, org, country, dept, grad_year, sector, note, linkedin").eq("status", "approved").limit(1000)
        ]);
        const before = JSON.stringify({ ...data, at: 0 });
        data = { at: Date.now(), posts: pick(posts), settings: Object.fromEntries(pick(settings).map((s) => [s.key, s.value])), faculty: pick(faculty), rooms: pick(rooms), alumni: pick(alumni) };
        try { localStorage.setItem(CACHE, JSON.stringify(data)); } catch { /* storage full */ }
        if (JSON.stringify({ ...data, at: 0 }) !== before) listeners.forEach((fn) => fn(data));
      } catch (e) { console.warn("Content refresh failed", e); }
      finally { loading = null; }
      return data;
    })();
    return loading;
  }
  return {
    get data() { return data; }, refresh, onChange: (fn) => listeners.add(fn),
    feature: (k) => (data.settings.features || {})[k] !== false,
    // Scheduled and expired posts stay hidden even from the offline cache (and from admins browsing the app).
    posts: (kind) => { const now = Date.now(); return data.posts.filter((p) => (!kind || p.kind === kind) && (!p.starts_at || new Date(p.starts_at) <= now) && (!p.ends_at || new Date(p.ends_at) > now)); },
    // Only known colours and safe links ever reach the page, whatever is stored.
    banner: () => { const b = data.settings.banner; if (!b || !b.text || b.on === false) return null;
      return { ...b, tone: ["purple", "green", "amber", "red"].includes(b.tone) ? b.tone : "purple", link: /^(#\/[\w\/?=&.-]*|https:\/\/[^\s"<>]+)$/.test(b.link || "") ? b.link : "" }; }
  };
}
