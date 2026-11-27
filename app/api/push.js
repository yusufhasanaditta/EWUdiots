// Send a background push to one user or everyone. Called by the admin panel with the caller's token; the caller must
// be allowed to send messages. Web subscriptions are sent via the Web Push standard (VAPID). Android/FCM is added
// later once a Firebase project exists. Dead subscriptions (404/410) are pruned.
import webpush from "web-push";
import { db, hasService } from "./_db.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const pub = process.env.VITE_VAPID_PUBLIC_KEY || process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:team@ewudiots.app";
  if (!pub || !priv || !hasService) return res.status(503).json({ error: "Push is not configured" });

  const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) return res.status(401).json({ error: "Sign in required" });
  // Authorize with the caller's own token: public.can('messages.send') runs as them.
  let allowed = false;
  try { allowed = await db("/rest/v1/rpc/can", { method: "POST", token, body: { p: "messages.send" } }); } catch { allowed = false; }
  if (allowed !== true) return res.status(403).json({ error: "Not allowed" });

  const { title, body = "", url = "#/notifications", user_id = null } = req.body || {};
  if (!title || typeof title !== "string") return res.status(400).json({ error: "title required" });
  const link = String(url).startsWith("http") ? url : `/app.html${String(url).startsWith("#") ? url : "#" + url}`;
  const payload = JSON.stringify({ title: title.slice(0, 120), body: String(body).slice(0, 300), url: link, tag: "ewudiots" });

  webpush.setVapidDetails(subject, pub, priv);
  const filter = user_id ? `&user_id=eq.${encodeURIComponent(user_id)}` : "";
  const subs = await db(`/rest/v1/push_subscriptions?select=id,endpoint,keys&kind=eq.web${filter}`, { service: true }).catch(() => []);
  let sent = 0; const gone = [];
  await Promise.all((Array.isArray(subs) ? subs : []).map(async (s) => {
    try { await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, payload); sent++; }
    catch (e) { if (e && (e.statusCode === 404 || e.statusCode === 410)) gone.push(s.id); }
  }));
  if (gone.length) await db(`/rest/v1/push_subscriptions?id=in.(${gone.join(",")})`, { method: "DELETE", service: true }).catch(() => {});
  return res.status(200).json({ sent, removed: gone.length });
}
