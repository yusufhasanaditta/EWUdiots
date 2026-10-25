// Vercel serverless function: GET /api/news → the latest official EWU news as JSON (CDN-cached for an hour).
import { fetchNews, NEWS_SOURCE } from "../src/news.js";

export default async function handler(req, res) {
  try {
    const news = await fetchNews(2);
    res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");
    res.status(200).json({ source: NEWS_SOURCE, fetched: new Date().toISOString(), news });
  } catch (e) {
    res.setHeader("Cache-Control", "public, s-maxage=120");
    res.status(502).json({ error: String(e.message || e), news: [] });
  }
}
