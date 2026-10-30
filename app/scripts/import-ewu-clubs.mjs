// Import public club information from the EWU club site (clubs.ewubd.edu). That site went offline in 2026, so this
// reads the Internet Archive's copies. For each of the 23 clubs listed on ewubd.edu/clubs it keeps:
//   about text · logo · club email · present faculty moderators (matched to public/data/faculty.json) · news and events
// It never keeps student names, photos of people or phone numbers. Output: public/data/clubs-ewu.json (review it, then
// run scripts/seed-ewu-clubs.mjs to put it in the database).
// Usage (from app/):  node scripts/import-ewu-clubs.mjs [slug…]
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const OUT = resolve(import.meta.dirname, "../public/data/clubs-ewu.json");
const FACULTY = JSON.parse(readFileSync(resolve(import.meta.dirname, "../public/data/faculty.json"), "utf8")).faculty;
// EWUdiots slug → EWU club site folder (same list as the seed in 0016_clubs.sql).
const CLUBS = {
  "agro-industrialization": "ewuaic", business: "ewubc", "creative-marketing": "ewucmc", "computer-programming": "ewucopc", "performing-arts": "ecpa",
  debating: "ewudc", economics: "ewuecon", electronics: "ewuec", "english-conversation": "ewuecc", "environmental-social": "ewuesc",
  "investment-finance": "ewuifc", "ieee-student-branch": "ieeesb", "model-united-nations": "ewumunc", photography: "ewupc", robotics: "ewurc",
  rotaract: "rcewu", science: "ewuscc", sociology: "scewu", sports: "sportsclub", telecommunication: "ewutc", "cyber-security": "ewucsc",
  "health-well-being": "ehwc", "book-reading": "ewubrc"
};
const HOST = "clubs.ewubd.edu";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Polite fetch with retries (the Archive answers 429 when hurried). */
async function get(url, tries = 5) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: { "user-agent": "EWUdiots club import (student project; contact ewudiots@gmail.com)" }, signal: AbortSignal.timeout(60e3) });
      if (r.status === 429 || r.status >= 500) { await sleep(4000 * (i + 1)); continue; }
      if (!r.ok) return "";
      return await r.text();
    } catch { await sleep(3000 * (i + 1)); }
  }
  return "";
}
const snap = (ts, url) => `https://web.archive.org/web/${ts}id_/${url}`;
const imgSnap = (ts, url) => `https://web.archive.org/web/${ts}im_/${url}`;

/* ── Text helpers ── */
const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rsquo: "’", lsquo: "‘", ldquo: "“", rdquo: "”", ndash: "–", mdash: "—", hellip: "…" };
const decode = (s) => String(s).replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e) => (e[0] === "#" ? String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENT[e.toLowerCase()] ?? m));
// Facebook-style "𝐁𝐨𝐥𝐝" letters → plain text, collapse whitespace.
const clean = (s) => decode(String(s).replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|li|h\d)>/gi, "\n").replace(/<[^>]+>/g, " ")).normalize("NFKC").replace(/[ \t\u00a0]+/g, " ").replace(/\s*\n\s*/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
const oneLine = (s) => clean(s).replace(/\s+/g, " ").trim();
const norm = (s) => String(s).toLowerCase().replace(/^(dr|prof|mr|mrs|ms|md)\.?\s+/g, "").replace(/[^a-z]/g, "");

function parseAbout(html) {
  const m = html.match(/<h3 class="title-text-uper">\s*Welcome to[^<]*<\/h3>([\s\S]*?)<\/div>\s*<div class="col-sm-4">/i) || html.match(/<h3 class="title-text-uper">\s*About[^<]*<\/h3>([\s\S]*?)<\/div>\s*<div class="col-sm-4">/i);
  return m ? clean(m[1]).slice(0, 4000) : "";
}
const parseLogo = (html) => html.match(/<img class="logo-img" src="([^"]+)"/i)?.[1] || "";
function parseEmail(html, ewu) {
  const all = [...new Set((html.match(/[\w.+-]+@ewubd\.edu/gi) || []).map((e) => e.toLowerCase()))];
  // Club addresses only (named after the club), never a person's.
  return all.find((e) => e.startsWith(ewu.toLowerCase() + "@") || /club|^ewu|^ieee|^rc/.test(e.split("@")[0])) || "";
}
function parseModerators(html) {
  const tab = html.match(/<div id="tab1"[^>]*>([\s\S]*?)<div id="tab2"/i)?.[1] || "";
  return [...tab.matchAll(/<li>([\s\S]*?)<\/li>/gi)].map(([, li]) => {
    const name = oneLine(li.match(/<strong>([\s\S]*?)<\/strong>/i)?.[1] || "");
    const designation = oneLine(li.match(/class="badge">([\s\S]*?)<\/label>/i)?.[1] || "");
    const tenure = li.match(/\((\d{4}\s*[-–]\s*\d{4})\)/)?.[1]?.replace(/\s/g, "") || "";
    const department = oneLine([...li.matchAll(/<p>([\s\S]*?)<\/p>/gi)].map((x) => x[1]).find((p) => /department|dept\.?/i.test(p)) || "");
    if (!name) return null;
    const f = FACULTY.find((x) => norm(x.name) === norm(name)) || FACULTY.find((x) => norm(x.name).includes(norm(name)) || norm(name).includes(norm(x.name)));
    return { name, designation: designation || f?.designation || "", tenure, department, email: f?.email || "", photo: f?.photo || "", profile: f?.url || f?.profile || "" };
  }).filter(Boolean);
}
function parseList(html, ewu, ts, kind) {
  return [...html.matchAll(/<article class="row">([\s\S]*?)<\/article>/gi)].map(([, a]) => {
    const href = a.match(/href="(\/[^"]*single-(?:news|event|notice)\/[^"]*)"/i)?.[1] || "";
    const title = oneLine(a.match(/<h2>([\s\S]*?)<\/h2>/i)?.[1] || "");
    const date = oneLine(a.match(/<em class="date">([\s\S]*?)<\/em>/i)?.[1] || "");
    const img = a.match(/<img src="(https:\/\/clubs\.ewubd\.edu\/storage[^"]+)"/i)?.[1] || "";
    const excerpt = clean(a.match(/<div class="post-excerpt">([\s\S]*?)<p><a class="read-more"/i)?.[1] || "").replace(/\.\.\.$/, "…").slice(0, 600);
    if (!title || !href) return null;
    const when = Date.parse(date);
    return { kind, title: title.slice(0, 160), date: Number.isFinite(when) ? new Date(when + 6 * 3600e3).toISOString().slice(0, 10) : "", excerpt,
      image: img ? imgSnap(ts, img) : "", url: `https://web.archive.org/web/${ts}/https://${HOST}${href}` };
  }).filter(Boolean);
}

/** Latest archived copy of each page of one club. */
async function snapshots(ewu) {
  const cdx = await get(`https://web.archive.org/cdx/search/cdx?url=${HOST}/${ewu}*&output=json&fl=original,timestamp,statuscode&filter=statuscode:200&limit=5000`);
  const rows = cdx ? JSON.parse(cdx).slice(1) : [];
  const latest = {};
  for (const [orig, ts] of rows) {
    const path = orig.replace(/^https?:\/\/(www\.)?clubs\.ewubd\.edu(:80)?\//i, "").replace(/\/$/, "").toLowerCase();
    if (!latest[path] || ts > latest[path].ts) latest[path] = { ts, url: orig.replace(/^http:/, "https:").replace(":80/", "/") };
  }
  return latest;
}

async function importClub(slug, ewu) {
  const s = await snapshots(ewu); await sleep(1500);
  const page = async (p) => { const x = s[`${ewu}${p}`]; if (!x) return ["", ""]; const h = await get(snap(x.ts, x.url)); await sleep(1500); return [h, x.ts]; };
  const [about, aboutTs] = await page("/about-us");
  const [home, homeTs] = await page("");
  const [leaders] = await page("/leaders");
  const [news, newsTs] = await page("/news");
  const [events, eventsTs] = await page("/events");
  const any = about || home || leaders;
  const logo = parseLogo(any);
  const items = [...parseList(news, ewu, newsTs, "news"), ...parseList(events, ewu, eventsTs, "event")]
    .filter((x, i, a) => a.findIndex((y) => y.title.toLowerCase() === x.title.toLowerCase()) === i)
    // Committee announcements list students by name; the user chose to import public club information only.
    .filter((x) => !/\b(executive|sub-executive)\s+(committee|panel|body)|\bpanel\s*\(?20\d\d|\bnew (committee|panel)\b/i.test(x.title))
    .sort((a, b) => (b.date || "").localeCompare(a.date || "")).slice(0, 12);
  return {
    ewu, site: `https://${HOST}/${ewu}`,
    about: parseAbout(about) || parseAbout(home),
    about_source: about ? snap(aboutTs, `https://${HOST}/${ewu}/about-us`).replace("id_/", "/") : home ? `https://web.archive.org/web/${homeTs}/https://${HOST}/${ewu}` : "",
    logo: logo ? imgSnap(aboutTs || homeTs, logo) : "",
    email: parseEmail(any, ewu),
    moderators: parseModerators(leaders),
    items,
    archived_pages: Object.keys(s).length
  };
}

const only = process.argv.slice(2);
const prev = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : { clubs: {} };
const out = { source: "Internet Archive copies of clubs.ewubd.edu (the EWU club site, offline since 2026)", fetched: new Date().toISOString().slice(0, 10), clubs: { ...prev.clubs } };
for (const [slug, ewu] of Object.entries(CLUBS)) {
  if (only.length && !only.includes(slug)) continue;
  process.stdout.write(`${slug.padEnd(24)} `);
  try {
    const c = await importClub(slug, ewu);
    out.clubs[slug] = c;
    console.log(`about ${c.about ? "✓" : "–"}  logo ${c.logo ? "✓" : "–"}  email ${c.email || "–"}  moderators ${c.moderators.length}  items ${c.items.length}`);
  } catch (e) { console.log("failed:", e.message); }
  writeFileSync(OUT, JSON.stringify(out, null, 1));
}
console.log(`Wrote ${OUT}`);
