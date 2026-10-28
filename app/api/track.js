// POST /api/track {path, ref, app} → one anonymous page view. No cookies: the visitor is a hash of IP + browser + a salt
// that changes every day, so nobody can be followed across days and the IP is never stored. Bots and "Do Not Track"
// are skipped, and repeat views of the same page within 30 minutes count once.
import { createHash } from "node:crypto";
import { db, hasService } from "./_db.js";

const BOT = /bot|crawl|spider|slurp|preview|monitor|headless|lighthouse|curl|wget|python|axios|node-fetch/i;
const SEARCH = /google\.|bing\.|duckduckgo\.|yahoo\.|yandex\.|baidu\./i;
const SOCIAL = /facebook\.|fb\.|instagram\.|t\.co|twitter\.|x\.com|linkedin\.|reddit\.|youtube\.|tiktok\.|whatsapp|messenger/i;
const MAIL = /mail\.|outlook\.|gmail/i;

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).end();
  const ua = String(req.headers["user-agent"] || "");
  if (!hasService || BOT.test(ua) || req.headers.dnt === "1" || req.headers["sec-gpc"] === "1") return res.status(204).end();
  let b = req.body; if (typeof b === "string") { try { b = JSON.parse(b); } catch { b = {}; } }
  const path = String(b?.path || "/").replace(/[?].*$/, "").replace(/[^\w/.#-]/g, "").slice(0, 120) || "/";
  let host = ""; try { host = new URL(String(b?.ref || "")).hostname; } catch { /* no referrer */ }
  const source = b?.app ? "app" : !host || host === String(req.headers.host || "") ? "direct" : SEARCH.test(host) ? "search" : SOCIAL.test(host) ? "social" : MAIL.test(host) ? "email" : "other";
  const device = /ipad|tablet/i.test(ua) ? "tablet" : /mobi|android|iphone/i.test(ua) ? "phone" : "desktop";
  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  const day = new Date().toISOString().slice(0, 10);
  const visitor = createHash("sha256").update(`${ip}|${ua}|${day}|${process.env.CRON_SECRET || "salt"}`).digest("hex").slice(0, 32);
  try {
    await db("/rest/v1/page_views?on_conflict=visitor,path,slot", { method: "POST", service: true, prefer: "resolution=ignore-duplicates,return=minimal",
      body: { day, path, source, device, visitor, slot: Math.floor(Date.now() / 18e5) } });
  } catch { /* analytics must never break a page */ }
  res.status(204).end();
}
