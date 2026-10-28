// GET /api/calendar → EWU's undergraduate academic calendar (holidays, payment deadlines, exams, advising, breaks) for the
// recent semesters, and the final exam date for each class-day pattern. Read live from ewubd.edu; CDN-cached for 12 h.
import { fetchCalendar, CAL_SOURCE } from "../src/acadcal.js";

export default async function handler(req, res) {
  try {
    const semesters = await fetchCalendar();
    res.setHeader("Cache-Control", "public, s-maxage=43200, stale-while-revalidate=604800");
    res.status(200).json({ source: CAL_SOURCE, fetched: new Date().toISOString(), semesters });
  } catch (e) {
    res.setHeader("Cache-Control", "public, s-maxage=300");
    res.status(502).json({ error: String(e.message || e), semesters: [] });
  }
}
