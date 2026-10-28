// Server-side Supabase REST helper for the Vercel functions (files starting with "_" aren't routes).
// Reads use the public anon key (RLS applies). The service key is used only by api/cron.js and api/track.js, only on
// the server, and is never sent to a browser.
const URL_ = (process.env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
const ANON = process.env.VITE_SUPABASE_ANON_KEY || "", SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
export const hasDb = Boolean(URL_ && ANON);
export const hasService = Boolean(URL_ && SERVICE);
export async function db(path, { method = "GET", body, service = false, token, prefer } = {}) {
  const key = service ? SERVICE : ANON;
  const r = await fetch(URL_ + path, { method, signal: AbortSignal.timeout(10000),
    headers: { apikey: key, authorization: `Bearer ${token || key}`, "content-type": "application/json", ...(prefer ? { prefer } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j = null; try { j = t ? JSON.parse(t) : null; } catch { j = t; }
  if (!r.ok) throw new Error((j && (j.message || j.msg || j.error)) || `Database answered ${r.status}`);
  return j;
}
/* Items from the editable feed table (feed_items), pinned first, then newest. Empty if the database isn't set up. */
export async function feed(kind, limit = 60) {
  if (!hasDb) return [];
  const rows = await db(`/rest/v1/feed_items?kind=eq.${kind}&hidden=eq.false&select=*&order=pinned.desc,date.desc.nullslast&limit=${limit}`).catch(() => []);
  return Array.isArray(rows) ? rows : [];
}
