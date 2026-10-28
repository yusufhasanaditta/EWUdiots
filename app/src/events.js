/* Official EWU events: parse www.ewubd.edu/events pages into { id, title, url, start, end, venue, kind }.
   Pure (no DOM): used by the daily job (api/cron.js) and unit tests. Dates are "YYYY-MM-DD" (Dhaka calendar days). */
export const EVENTS_SOURCE = "https://www.ewubd.edu/events";
const NAMED = { nbsp: " ", quot: '"', ldquo: '"', rdquo: '"', rsquo: "'", lsquo: "'", apos: "'", ndash: "–", mdash: "—", hellip: "…", lt: "<", gt: ">", amp: "&" };
const safeChar = (n) => (Number.isInteger(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : "");
const decode = (s) => s.replace(/&(#\d+|#x[\da-f]+|[a-z]+);/gi, (m, e) => (e[0] === "#" ? safeChar(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : NAMED[e.toLowerCase()] ?? " "));
const text = (h) => decode(String(h).replace(/<!--[\s\S]*?-->/g, " ").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const day = (d, m, y) => { const mi = MONTHS.indexOf(m.slice(0, 3).toLowerCase()); return mi < 0 ? "" : `${y}-${String(mi + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`; };

export const KINDS = { workshop: "Workshop", seminar: "Seminar & talk", concert: "Concert", cultural: "Cultural", club_recruitment: "Club recruitment", club_event: "Club event", competition: "Competition", fair: "Fair & expo", sports: "Sports", other: "Other" };
const GUESS = [["club_recruitment", /recruit/i], ["concert", /concert|musical|band night/i], ["competition", /competition|contest|olympiad|hackathon|championship/i], ["fair", /fair|expo|exhibition|carnival/i],
  ["workshop", /workshop|training|bootcamp|hands-on/i], ["seminar", /seminar|lecture|talk|webinar|conference|symposium|session/i], ["sports", /sports?|tournament|football|cricket|marathon/i],
  ["cultural", /cultural|festival|celebrat|boishakh|pohela|fest\b|observ/i], ["club_event", /club/i]];
export const guessKind = (t) => (GUESS.find(([, re]) => re.test(t)) || ["other"])[0];

// ewubd.edu prints today's date as the end of events that have none, so pass `today` to drop that.
export function parseEvents(html, today = "") {
  const out = [], seen = new Set();
  for (const block of String(html).split(/<div class="col-md-12 eventbox/).slice(1)) {
    const slug = (block.match(/href="(?:https?:\/\/(?:www\.)?ewubd\.edu)?\/single-event\/([^"#?\s]+)"/) || [])[1];
    const title = text((block.match(/<h3[^>]*>([\s\S]*?)<\/h3>/) || [])[1] || "");
    if (!slug || !title || seen.has(slug)) continue;
    const when = text((block.match(/fa-clock-o[^>]*><\/i>([\s\S]*?)<\/span>/) || [])[1] || "");
    const ds = [...when.matchAll(/(\d{1,2})\s+([A-Za-z]{3,9}),?\s+(\d{4})/g)].map((m) => day(m[1], m[2], m[3])).filter(Boolean);
    if (!ds.length) continue;
    seen.add(slug);
    const venue = text((block.match(/fa-map-marker[^>]*>(?:<\/i>)+([\s\S]*?)<\/span>/) || [])[1] || "");
    const image = (block.match(/<img[^>]+src="(https?:\/\/[^"]+\.(?:jpe?g|png|webp))"/i) || [])[1] || "";
    out.push({ id: slug, title, url: `https://www.ewubd.edu/single-event/${slug}`, start: ds[0], end: ds[1] && ds[1] > ds[0] && ds[1] !== today ? ds[1] : "", venue: venue.slice(0, 160), image: image.replace(/^http:/, "https:"), kind: guessKind(title) });
  }
  return out;
}

export async function fetchEvents(pages = 2, today = "", fetchImpl = fetch) {
  const all = [];
  for (let p = 1; p <= pages; p++) {
    let r;
    try { r = await fetchImpl(`${EVENTS_SOURCE}${p > 1 ? `?page=${p}` : ""}`, { headers: { "user-agent": "EWUdiots events reader (unofficial student app)" }, signal: AbortSignal.timeout(15000) }); }
    catch (e) { if (p === 1) throw e; break; }
    if (!r.ok) { if (p === 1) throw new Error(`EWU events page answered ${r.status}`); break; }
    all.push(...parseEvents(await r.text(), today));
  }
  const ids = new Set();
  return all.filter((n) => !ids.has(n.id) && ids.add(n.id));
}
