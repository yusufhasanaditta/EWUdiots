/* EWU newsletters (www.ewubd.edu/newsletters): [{ url (PDF), title, image, date }]. Pure, used by api/cron.js and tests. */
export const NEWSLETTER_SOURCE = "https://www.ewubd.edu/newsletters";
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const text = (h) => String(h).replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
export function parseNewsletters(html) {
  const out = [], seen = new Set();
  for (const block of String(html).split(/news-letter-col/).slice(1)) {
    const url = (block.match(/href="(https:\/\/(?:www\.)?ewubd\.edu\/storage\/[^"]+\.pdf)"/i) || [])[1];
    const title = text((block.match(/<h3[^>]*>([\s\S]*?)<\/h3>/) || [])[1] || "");
    if (!url || !title || seen.has(url)) continue;
    seen.add(url);
    const d = text((block.match(/centered-div">([\s\S]*?)<\/div>/) || [])[1] || "").match(/(\d{1,2})\s+([A-Za-z]{3})[a-z]*\s+(\d{4})/);
    const mi = d ? MONTHS.indexOf(d[2].toLowerCase()) : -1;
    out.push({ url, title, image: (block.match(/<img[^>]+src="(https:\/\/[^"]+\.(?:jpe?g|png|webp))"/i) || [])[1] || "",
      date: mi >= 0 ? `${d[3]}-${String(mi + 1).padStart(2, "0")}-${d[1].padStart(2, "0")}` : null });
  }
  return out;
}
export async function fetchNewsletters(fetchImpl = fetch) {
  const r = await fetchImpl(NEWSLETTER_SOURCE, { headers: { "user-agent": "EWUdiots newsletter reader (unofficial student app)" }, signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`EWU newsletters page answered ${r.status}`);
  return parseNewsletters(await r.text());
}

/* Turn the text of a newsletter's "Alumni Success Stories" pages into draft alumni rows for an admin to check.
   Stories usually read "<Name>, a graduate of <Dept> (Batch …), now works as <role> at <org> in <country>". */
const COUNTRIES = ["Bangladesh", "USA", "United States", "Canada", "UK", "United Kingdom", "Germany", "Australia", "Japan", "Malaysia", "Singapore", "Sweden", "Finland", "Netherlands", "Italy", "France", "Korea", "China", "UAE", "Qatar", "Saudi Arabia", "India", "Ireland", "Norway", "Denmark", "New Zealand", "Belgium", "Austria", "Switzerland", "Hong Kong", "Taiwan", "Thailand"];
const VERB = /\b(Joined|Stepped|Took|Started|Began|Secured|Earned|Won|Received|Accepted|Got|Landed|Moved|Became|Was|Is|Has|Admitted|Awarded|Selected|Promoted|Enrolled|Appointed|Graduated|Completed|Launched|Founded|Now|Entered|Joins|Serving|Working|Pursuing|Contributing|Leading|Supporting|Helping)\b/;
const ORG_END = /\b(PLC|Ltd\.?|Limited|Inc\.?|LLC|University|Bank|Group|Company|Corporation|Authority|Hospital|Institute|Foundation|Pharma|Pharmaceuticals|Technologies|Bangladesh)$/;
/* Newer issues use cards: "<Name> Batch 22-1 Placement June 2026 <Role> <Organisation> <one sentence>". */
const NOT_NAME = new Set(["Alumni", "Success", "Story", "Stories", "Spotlight", "Placement", "Admission", "Scholarship", "Award", "Achievement", "News", "Batch"]);
function draftCards(body) {
  // Each card's name is the run of capitalised words (up to 5) right before "Batch 22-1".
  const hits = [...body.matchAll(/\bBatch\s+(\d{2}\s*-\s*\d)\b/g)].map((m) => {
    const words = body.slice(Math.max(0, m.index - 120), m.index).trim().split(/\s+/), name = [];
    while (words.length && name.length < 5 && /^[A-Z][\w.'-]*$/.test(words[words.length - 1]) && !NOT_NAME.has(words[words.length - 1])) name.unshift(words.pop());
    return { m, name: name.join(" "), start: m.index - name.join(" ").length - 1 };
  }).filter((x) => x.name.split(" ").length >= 2);
  const out = [];
  hits.forEach((x, k) => {
    const after = body.slice(x.m.index + x.m[0].length, k + 1 < hits.length ? hits[k + 1].start : x.m.index + 600);
    const m = after.match(/^\s*(?:(Placement|Admission|Scholarship|Award|Achievement)\s+)?(?:[A-Z][a-z]+\s+\d{4}\s+)?([\s\S]+)$/);
    if (!m) return;
    const what = m[1] || "", rest = m[2].trim(), name = x.name;
    const v = rest.search(VERB), head = (v > 0 ? rest.slice(0, v) : rest.slice(0, 140)).trim().replace(/[,;]\s*$/, ""), desc = v > 0 ? rest.slice(v, v + 280) : "";
    // The sentence usually repeats the organisation: "…at Synovia Pharma PLC, helping…" ("at" beats "in the … Department").
    const ORG = (prep) => ((desc.match(new RegExp(`\\b${prep}\\s+(?:the\\s+)?([A-Z][\\w&.'()-]*(?:\\s+(?:[A-Z][\\w&.'()-]*|of|and|for|&)){0,8})`)) || [])[1] || "").replace(/\s+(of|and|for|&)$/, "").trim();
    let org = ORG("at") || ORG("with") || ORG("joined") || ORG("in");
    let role = head;
    if (org && head.includes(org.split(" ")[0])) role = head.slice(0, head.indexOf(org.split(" ")[0])).trim().replace(/[,;]\s*$/, "");
    else if (!org) { const w = head.split(" "); for (let k = Math.max(1, w.length - 5); k < w.length; k++) { const tail = w.slice(k).join(" "); if (ORG_END.test(tail) && /^[A-Z]/.test(tail)) { org = tail; role = w.slice(0, k).join(" ").replace(/[,;]\s*$/, ""); break; } } }
    const study = /admission|scholarship|phd|master|msc|university/i.test(`${what} ${head}`) && !/officer|engineer|executive|manager|analyst/i.test(role);
    out.push({ name: name.trim(), dept: "", role: role || (study ? "Higher study" : ""), org, country: COUNTRIES.find((c) => new RegExp(`\\b${c}\\b`).test(rest.slice(0, 400))) || "Bangladesh",
      kind: /award|achievement/i.test(what) ? "award" : study ? "study" : "job", note: desc.replace(/\s+/g, " ").trim().slice(0, 300) });
  });
  return out;
}
export function draftAlumni(raw) {
  const t = String(raw).replace(/\s+/g, " ");
  const start = t.search(/alumni\s+(success|spotlight|achievement|news)/i);
  const body = start >= 0 ? t.slice(start) : t;
  const cards = draftCards(body);
  if (cards.length) return cards.slice(0, 60);
  const out = [], seen = new Set();
  const re = /([A-Z][a-zA-Z.'-]+(?:\s+[A-Z][a-zA-Z.'-]+){1,4}),?\s+(?:an?\s+)?(?:alumn(?:us|a|i)|graduate|former student)\b([^.]{0,220})\./g;
  let m;
  while ((m = re.exec(body)) && out.length < 40) {
    const name = m[1].trim(), rest = m[2];
    if (seen.has(name) || /^(East West|The|This|Our|Department)/.test(name)) continue;
    seen.add(name);
    const dept = (rest.match(/\b(CSE|EEE|ECE|BBA|MBA|Pharmacy|Economics|English|Law|Civil|GEB|Mathematics|Sociology|Information Studies)\b/i) || [""])[0];
    const at = rest.match(/\b(?:as|is)\s+(?:an?\s+|the\s+)?([^,]{3,80}?)\s+(?:at|in|with)\s+([A-Z][^,;]{2,80})/);
    const study = /\b(phd|ph\.d|master'?s|msc|m\.sc|mba|scholarship|admitted|pursuing)\b/i.test(rest);
    const country = COUNTRIES.find((c) => new RegExp(`\\b${c}\\b`).test(rest)) || "Bangladesh";
    out.push({ name, dept, role: at ? at[1].trim() : study ? "Higher study" : "", org: at ? at[2].trim().replace(/\s+(in|at)\s+.*$/, "") : "", country, kind: /award|prize|winner|honou?red/i.test(rest) ? "award" : study ? "study" : "job", note: (name + "," + rest).slice(0, 300) });
  }
  return out;
}
