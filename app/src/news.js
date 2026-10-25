/* Official EWU news: parse www.ewubd.edu/news pages into { id, title, date, url, image, excerpt, tag }.
   Pure (no DOM): shared by the Vercel function (api/news.js), the dev server and unit tests. */
export const NEWS_SOURCE = "https://www.ewubd.edu/news";
const NAMED = { nbsp: " ", quot: '"', ldquo: '"', rdquo: '"', rsquo: "'", lsquo: "'", apos: "'", ndash: "–", mdash: "—", hellip: "…", lt: "<", gt: ">", amp: "&" };
const safeChar = (n) => (Number.isInteger(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : "");
const decode = (s) => s.replace(/&(#\d+|#x[\da-f]+|[a-z]+);/gi, (m, e) => (e[0] === "#" ? safeChar(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : NAMED[e.toLowerCase()] ?? " "));
const text = (h) => decode(String(h).replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const TAGS = [["Research", /research|seminar|conference|crt\b|ewucrt/i], ["Partnership", /mou|partner|agreement|collaborat/i], ["Achievement", /award|wins?|champion|ranked|ranking|recogni|medal|achiev/i],
  ["Events", /celebrat|observ|festival|fair|day\b|convocation|ceremony|program/i], ["Students", /student|club|competition|alumni/i]];
export const tagOf = (t) => (TAGS.find(([, re]) => re.test(t)) || ["Campus"])[0];

export function parseNews(html) {
  const out = [], seen = new Set();
  for (const block of String(html).split(/<div class="news-wrap/).slice(1)) {
    const url = (block.match(/href="(https?:\/\/(?:www\.)?ewubd\.edu\/news\/[^"#?]+)"/) || [])[1];
    const title = text((block.match(/<h3[^>]*>([\s\S]*?)<\/h3>/) || [])[1] || "");
    if (!url || !title) continue;
    const id = url.split("/news/")[1];
    if (seen.has(id)) continue;
    seen.add(id);
    const d = text((block.match(/<div class="centered-div">([\s\S]*?)<\/div>/) || [])[1] || "").match(/(\d{1,2})\s+([A-Za-z]{3})[a-z]*\s+(\d{4})/);
    const mi = d ? MONTHS.indexOf(d[2].toLowerCase()) : -1;
    const image = (block.match(/<img[^>]+src="(https?:\/\/[^"]+\.(?:jpe?g|png|webp))"/i) || [])[1] || "";
    const excerpt = text((block.match(/program-short-desc[^>]*>([\s\S]*?)<\/div>/) || [])[1] || "").replace(/\.{3}$/, "…");
    out.push({ id, title, url, image: image.replace(/^http:/, "https:"), excerpt, date: mi >= 0 ? `${d[3]}-${String(mi + 1).padStart(2, "0")}-${String(d[1]).padStart(2, "0")}` : "", tag: tagOf(title) });
  }
  return out;
}
export async function fetchNews(pages = 2, fetchImpl = fetch) {
  const all = [];
  for (let p = 1; p <= pages; p++) {
    let r;
    try { r = await fetchImpl(`${NEWS_SOURCE}${p > 1 ? `?page=${p}` : ""}`, { headers: { "user-agent": "EWUdiots news reader (unofficial student app)" }, signal: AbortSignal.timeout(15000) }); }
    catch (e) { if (p === 1) throw e; break; }
    if (!r.ok) { if (p === 1) throw new Error(`EWU news page answered ${r.status}`); break; }
    all.push(...parseNews(await r.text()));
  }
  const ids = new Set();
  return all.filter((n) => !ids.has(n.id) && ids.add(n.id));
}
