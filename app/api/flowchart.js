// GET /api/flowchart?p=cse → the department's official semester-by-semester course flowchart, read live from
// ewubd.edu (only the programs listed in src/flowchart.js). CDN-cached for a day: curricula change once a year at most.
import { fetchFlowchart, FLOWCHARTS } from "../src/flowchart.js";

export default async function handler(req, res) {
  const p = String(req.query?.p || "");
  if (!Object.hasOwn(FLOWCHARTS, p)) return res.status(400).json({ error: "Unknown program" });
  try {
    const out = await fetchFlowchart(p);
    res.setHeader("Cache-Control", "public, s-maxage=86400, stale-while-revalidate=2592000");
    res.status(200).json({ fetched: new Date().toISOString(), ...out });
  } catch (e) {
    res.setHeader("Cache-Control", "public, s-maxage=300");
    res.status(502).json({ error: String(e.message || e), semesters: [] });
  }
}
