// GET /api/news → EWU news as JSON. Served from the feed table that the daily job fills from ewubd.edu/news and that
// admins can edit (hide, pin, retitle, add their own); falls back to reading ewubd.edu live. CDN-cached for 30 min.
import { fetchNews, NEWS_SOURCE } from "../src/news.js";
import { feed } from "./_db.js";

export default async function handler(req, res) {
  try {
    const rows = await feed("news");
    const news = rows.length ? rows.map((r) => ({ id: r.id.replace(/^news:/, ""), title: r.title_override || r.title, url: r.url, image: r.image, excerpt: r.excerpt, date: r.date || "", tag: r.tag_override || r.tag || "Campus", pinned: r.pinned, team: r.source === "manual" }))
      : await fetchNews(2);
    res.setHeader("Cache-Control", "public, s-maxage=1800, stale-while-revalidate=86400");
    res.status(200).json({ source: NEWS_SOURCE, fetched: new Date().toISOString(), news });
  } catch (e) {
    res.setHeader("Cache-Control", "public, s-maxage=120");
    res.status(502).json({ error: String(e.message || e), news: [] });
  }
}
