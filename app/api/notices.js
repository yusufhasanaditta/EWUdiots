// Vercel serverless function: GET /api/notices → the latest official EWU notices as JSON.
// The CDN caches it for 30 minutes, so ewubd.edu is asked at most twice an hour no matter how many students open the app.
import { fetchNotices, NOTICE_SOURCE } from "../src/notices.js";

export default async function handler(req, res) {
  try {
    const notices = await fetchNotices(2);
    res.setHeader("Cache-Control", "public, s-maxage=1800, stale-while-revalidate=86400");
    res.status(200).json({ source: NOTICE_SOURCE, fetched: new Date().toISOString(), notices });
  } catch (e) {
    res.setHeader("Cache-Control", "public, s-maxage=120");
    res.status(502).json({ error: String(e.message || e), notices: [] });
  }
}
