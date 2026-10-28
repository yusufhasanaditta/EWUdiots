// GET /api/notices → EWU notices as JSON, from the editable feed table (filled daily from ewubd.edu/notice-board),
// falling back to reading ewubd.edu live. The CDN caches it for 30 minutes.
import { fetchNotices, NOTICE_SOURCE } from "../src/notices.js";
import { feed } from "./_db.js";

export default async function handler(req, res) {
  try {
    const rows = await feed("notice", 80);
    const notices = rows.length ? rows.map((r) => ({ id: r.id.replace(/^notice:/, ""), title: r.title_override || r.title, url: r.url, pdf: r.pdf || "", date: r.date || "", cat: r.tag_override || r.category || "General", pinned: r.pinned }))
      : await fetchNotices(2);
    res.setHeader("Cache-Control", "public, s-maxage=1800, stale-while-revalidate=86400");
    res.status(200).json({ source: NOTICE_SOURCE, fetched: new Date().toISOString(), notices });
  } catch (e) {
    res.setHeader("Cache-Control", "public, s-maxage=120");
    res.status(502).json({ error: String(e.message || e), notices: [] });
  }
}
