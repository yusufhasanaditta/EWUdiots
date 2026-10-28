// GET /api/pdf?url=… → passes an EWU newsletter PDF to the admin panel, which reads it (ewubd.edu sends no CORS headers).
// Only https://www.ewubd.edu/storage/… PDFs are allowed, so this can't be used to fetch anything else.
export default async function handler(req, res) {
  const url = String(req.query?.url || "");
  if (!/^https:\/\/(www\.)?ewubd\.edu\/storage\/[\w/%.-]+\.pdf$/i.test(url)) return res.status(400).json({ error: "Only EWU newsletter PDFs" });
  try {
    const r = await fetch(url, { headers: { "user-agent": "EWUdiots newsletter reader (unofficial student app)" }, signal: AbortSignal.timeout(20000) });
    if (!r.ok) return res.status(502).json({ error: `ewubd.edu answered ${r.status}` });
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > 40e6 || buf.subarray(0, 4).toString() !== "%PDF") return res.status(502).json({ error: "That isn't a PDF" });
    res.setHeader("content-type", "application/pdf");
    res.setHeader("Cache-Control", "public, s-maxage=86400");
    res.status(200).send(buf);
  } catch (e) { res.status(502).json({ error: String(e.message || e) }); }
}
