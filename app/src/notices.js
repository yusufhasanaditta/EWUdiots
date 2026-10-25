/* Official EWU notices: parse www.ewubd.edu/notice-board pages into { id, title, date, url, pdf, cat }.
   Pure (no DOM) so the Vercel function (api/notices.js), the dev server and unit tests share it. */
export const NOTICE_SOURCE = "https://www.ewubd.edu/notice-board";
const CATS = [
  ["Exams", /\bexam|final|mid[- ]?term|test\b|viva|result/i], ["Advising", /advising|add[- ]?drop|course (?:withdraw|registration)|pre-?advising|enrol/i],
  ["Payments", /payment|tuition|fee|waiver|refund/i], ["Scholarships", /scholarship|merit|stipend|award/i], ["Holidays", /holiday|closed|vacation|eid|puja|break\b/i],
  ["Admission", /admission|orientation|briefing|freshers/i], ["Convocation", /convocation|graduation/i], ["Events", /seminar|workshop|conference|lecture|competition|fest|webinar/i]
];
export const categoryOf = (t) => (CATS.find(([, re]) => re.test(t)) || ["General"])[0];
const NAMED = { nbsp: " ", quot: '"', ldquo: '"', rdquo: '"', rsquo: "'", lsquo: "'", apos: "'", ndash: "–", mdash: "—", hellip: "…", lt: "<", gt: ">", amp: "&" };
const safeChar = (n) => (Number.isInteger(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : "");
const decode = (s) => s.replace(/&(#\d+|#x[\da-f]+|[a-z]+);/gi, (m, e) => (e[0] === "#" ? safeChar(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : NAMED[e.toLowerCase()] ?? " ")); // one pass, so "&amp;lt;" stays "&lt;"
const text = (h) => decode(h.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
const MONTHS = "january february march april may june july august september october november december".split(" ");
function isoDate(s) {
  const m = String(s).match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
  if (!m) return "";
  const mi = MONTHS.indexOf(m[2].toLowerCase());
  return mi < 0 ? "" : `${m[3]}-${String(mi + 1).padStart(2, "0")}-${String(m[1]).padStart(2, "0")}`;
}
export function parseNotices(html) {
  const out = [], seen = new Set();
  const parts = String(html).split(/<a\s+href="(https?:\/\/(?:www\.)?ewubd\.edu\/notice-details\/[^"]+)"\s*>/i);
  for (let i = 1; i < parts.length; i += 2) {
    const url = parts[i], body = parts[i + 1] || "";
    const h3 = body.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i);
    if (!h3) continue;
    const id = url.split("/notice-details/")[1].replace(/[?#].*$/, "");
    if (seen.has(id)) continue;
    seen.add(id);
    const chunk = body.slice(0, 1500);
    const date = isoDate(text((chunk.match(/fa-calendar[\s\S]*?<\/span>([\s\S]*?)<\/li>/i) || ["", ""])[1]));
    const pdf = (chunk.match(/href="(https?:\/\/[^"]+\.pdf)"/i) || [])[1] || "";
    const title = text(h3[1]);
    out.push({ id, title, date, url, pdf, cat: categoryOf(title) });
  }
  return out;
}
/* Fetch the first pages of the official board (server side: no CORS). */
export async function fetchNotices(pages = 2, fetchImpl = fetch) {
  const all = [];
  for (let p = 1; p <= pages; p++) {
    let r;
    try { r = await fetchImpl(`${NOTICE_SOURCE}${p > 1 ? `?page=${p}` : ""}`, { headers: { "user-agent": "EWUdiots notice reader (unofficial student app)" }, signal: AbortSignal.timeout(15000) }); }
    catch (e) { if (p === 1) throw e; break; } // later pages are a bonus
    if (!r.ok) { if (p === 1) throw new Error(`EWU notice board answered ${r.status}`); break; }
    all.push(...parseNotices(await r.text()));
  }
  const ids = new Set();
  return all.filter((n) => !ids.has(n.id) && ids.add(n.id));
}
