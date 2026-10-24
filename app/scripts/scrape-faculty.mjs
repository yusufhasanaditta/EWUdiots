// Builds public/data/faculty.json from EWU's public faculty profile pages (name, designation, department, office
// room, extension, work email, photo URL, highest degree, short bio, profile link). Re-run when EWU updates its sites:
//   node scripts/scrape-faculty.mjs
// Photos are not copied: the app shows them from ewubd.edu and links every card to the official profile.
import { writeFileSync, mkdirSync } from "node:fs";

const DEPTS = [
  ["CSE", "Computer Science & Engineering", "https://fse.ewubd.edu/computer-science-engineering"],
  ["EEE", "Electrical & Electronic Engineering", "https://fse.ewubd.edu/electrical-electronic-engineering"],
  ["CE", "Civil Engineering", "https://fse.ewubd.edu/civil-engineering"],
  ["GEB", "Genetic Engineering & Biotechnology", "https://fse.ewubd.edu/genetic-engineering-biotechnology"],
  ["MPS", "Mathematical & Physical Sciences", "https://fse.ewubd.edu/mathematical-physical-science"],
  ["PHR", "Pharmacy", "https://fse.ewubd.edu/pharmacy-department"],
  ["BA", "Business Administration", "https://fbe.ewubd.edu/business-administration"],
  ["ECO", "Economics", "https://fbe.ewubd.edu/economics-department"],
  ["ENG", "English", "https://flass.ewubd.edu/english-department"],
  ["LAW", "Law", "https://flass.ewubd.edu/law-department"],
  ["SOC", "Sociology", "https://flass.ewubd.edu/sociology-department"],
  ["ISLM", "Information Studies & Library Management", "https://flass.ewubd.edu/information-studies-library-management"],
  ["SR", "Social Relations", "https://flass.ewubd.edu/social-relations-department"]
];
const TITLE = /^(Professor|Associate Professor|Assistant Professor|Senior Lecturer|Lecturer|Adjunct|Visiting|Professor Emeritus|Honorary|Teaching Assistant|Research|Advisor|Adviser|Chair|Dean|Pro-Vice|Vice|Distinguished|Emeritus|Senior Assistant)/i;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function get(u, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(u, { signal: AbortSignal.timeout(25000), headers: { "user-agent": "EWUdiots faculty directory (student project; contact civicframe01@gmail.com)" } }); if (r.ok) return await r.text(); } catch { /* retry */ }
    await sleep(800 * (i + 1));
  }
  return "";
}
const decode = (s) => s.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#0?39;|&rsquo;|&lsquo;/g, "'").replace(/&quot;|&ldquo;|&rdquo;/g, '"').replace(/&ndash;|&mdash;/g, "–").replace(/&[a-z]+;/g, " ");
const lines = (html) => decode(html.replace(/<!--[\s\S]*?-->/g, "").replace(/<(script|style)[\s\S]*?<\/\1>/gi, "").replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "\n")).split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);

export function parseProfile(html, url) {
  const L = lines(html);
  const photo = (html.match(/<img[^>]+src="([^"]+)"[^>]*alt="Profile Picture"/i) || [])[1] || "";
  // Usual order is name → title → department; adjunct pages use name → department → title.
  let ti = L.findIndex((l, i) => i > 0 && TITLE.test(l) && l.length < 90 && /Department|Dept/i.test(L[i + 1] || ""));
  let name = ti > 0 ? L[ti - 1] : "", designation = ti > 0 ? L[ti] : "";
  if (ti < 0) {
    const di = L.findIndex((l, i) => i > 0 && /^Department of/i.test(l) && /(Adjunct|Faculty|Professor|Lecturer)/i.test(L[i + 1] || "") && (L[i + 1] || "").length < 60);
    if (di > 0) { ti = di; name = L[di - 1]; designation = L[di + 1]; }
  }
  // The person's own address appears below their title; header/footer ones are generic (cse@, admissions@…).
  const email = ((ti > 0 ? L.slice(ti, ti + 25) : []).join(" ").match(/[A-Za-z0-9._%+-]+@ewubd\.edu/g) || []).map((e) => e.toLowerCase()).find((e) => !/^(admissions|info|cse|eee|ce|civil|pharmacy|english|law|registrar|webmaster|[a-z]{2,5}dept|department)@/.test(e)) || "";
  const office = L.find((l) => /Room No/i.test(l)) || "";
  // "636", "AB1 - 305", "AB-1 904", "FUB702" → 636, AB1-305, AB1-904, FUB-702; anything incomplete ("AB-1") is dropped.
  const rawRoom = (office.match(/Room No\.?#?\s*:?\s*([A-Za-z0-9][A-Za-z0-9 -]{0,12})/i) || ["", ""])[1].toUpperCase();
  const mAB = rawRoom.match(/^AB\s*-?\s*([1-3])\s*-?\s*(\d{3,4})\b/), mF = rawRoom.match(/^FUB\s*-?\s*(\d{3,4})\b/), mN = rawRoom.match(/^(\d{3,4})\b/);
  const room = mAB ? `AB${mAB[1]}-${mAB[2]}` : mF ? `FUB-${mF[1]}` : mN ? mN[1] : "";
  const ext = (L.find((l) => /\bExt\b\.?\s*:?\s*(?:Ext\.?\s*)?\d/i.test(l)) || "").match(/Ext\.?\s*:?\s*(?:Ext\.?\s*)?(\d{2,4})/i)?.[1] || "";
  const after = (h) => { const i = L.findIndex((l) => l.toLowerCase() === h); return i >= 0 ? L[i + 1] || "" : ""; };
  const degree = after("academic background").replace(/,?\s*Year:?\s*\d{4}.*$/i, "").slice(0, 160);
  const bioRaw = after("short biography");
  const bio = bioRaw.length > 320 ? bioRaw.slice(0, 317).replace(/\s+\S*$/, "") + "…" : bioRaw;
  // Some pages list a coordinator's address instead; keep an email only if it looks like this person's.
  const toks = name.toLowerCase().replace(/\b(dr|prof|mr|ms|mrs|md|engr)\b\.?/g, "").split(/[^a-z]+/).filter((t) => t.length >= 3);
  const mine = email && toks.some((t) => email.split("@")[0].includes(t.slice(0, 4)));
  return { name, designation, email: mine ? email : "", emailRaw: email, room, ext, photo: /^https?:\/\//.test(photo) && !/default|avatar|no-image/i.test(photo) ? photo.replace(/^http:/, "https:") : "", degree, bio, url };
}

async function run() {
  const out = [];
  for (const [code, dept, base] of DEPTS) {
    const list = await get(base + "/faculty-members");
    const slugs = [...new Set([...list.matchAll(/faculty-view\/([A-Za-z0-9._-]+)/g)].map((m) => m[1]))];
    let n = 0;
    for (let i = 0; i < slugs.length; i += 5) {
      const got = await Promise.all(slugs.slice(i, i + 5).map(async (s) => { const url = `${base}/faculty-view/${s}`; const h = await get(url); return h ? parseProfile(h, url) : null; }));
      for (const f of got) if (f && f.name) { out.push({ ...f, dept: code, deptName: dept }); n++; }
      await sleep(250);
    }
    console.log(`${code}: ${n}/${slugs.length}`);
  }
  // Initials-style addresses (qss@…) don't match the name; accept them when no other profile shows the same one.
  const nameKey = (f) => f.name.toLowerCase().replace(/^(dr|prof)\.?\s+/, "");
  const seen = {}; out.forEach((f) => { if (f.emailRaw) (seen[f.emailRaw] = seen[f.emailRaw] || new Set()).add(nameKey(f)); }); // people, not listings
  out.forEach((f) => { if (!f.email && f.emailRaw && seen[f.emailRaw].size === 1) f.email = f.emailRaw; delete f.emailRaw; });
  // Same person listed by two departments → keep one, note both.
  const byKey = new Map();
  for (const f of out) { const k = f.name.toLowerCase().replace(/^(dr|prof)\.?\s+/, ""); const prev = byKey.get(k); if (prev) prev.also = [...new Set([...(prev.also || []), f.dept])]; else byKey.set(k, f); }
  const faculty = [...byKey.values()].sort((a, b) => a.dept.localeCompare(b.dept) || a.name.localeCompare(b.name));
  mkdirSync("public/data", { recursive: true });
  writeFileSync("public/data/faculty.json", JSON.stringify({ source: "Public EWU faculty profile pages (fse/fbe/flass.ewubd.edu)", fetched: new Date().toISOString(), count: faculty.length, faculty }));
  console.log(`Saved ${faculty.length} faculty to public/data/faculty.json`);
}
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/").split("/").pop())) run();
