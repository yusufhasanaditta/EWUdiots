/* EWU academic calendar (www.ewubd.edu/academic-calendar): holidays, payment deadlines, exams, advising and breaks for
   undergraduate programs, plus the final exam day for each class-day pattern (ST, MW, TR, SR…).
   Pure (no DOM): used by api/calendar.js, the dev server and unit tests. Dates are "YYYY-MM-DD" Dhaka calendar days. */
export const CAL_SOURCE = "https://www.ewubd.edu/academic-calendar";
const NAMED = { nbsp: " ", quot: '"', ldquo: '"', rdquo: '"', rsquo: "'", lsquo: "'", apos: "'", ndash: "–", mdash: "—", hellip: "…", lt: "<", gt: ">", amp: "&" };
const decode = (s) => s.replace(/&(#\d+|#x[\da-f]+|[a-z]+);/gi, (m, e) => (e[0] === "#" ? String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : NAMED[e.toLowerCase()] ?? " "));
const text = (h) => decode(String(h).replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, " ")).replace(/[ \t\r]+/g, " ").replace(/\s*\n\s*/g, "\n").trim();
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const TERM_START = { spring: 0, summer: 4, fall: 8 }; // first month of each semester (0-based)

/* Which calendars on the list page are the undergraduate ones (not B.Pharm/LL.B, not graduate). */
export function parseCalendarList(html) {
  const out = [];
  for (const m of String(html).matchAll(/href="(?:https?:\/\/(?:www\.)?ewubd\.edu)?\/academic-calendar-details\/([^"#?]+)"[^>]*>([^<]*)</g)) {
    const slug = m[1], title = text(m[2]), sem = (title.match(/(Spring|Summer|Fall)\s+(\d{4})/i) || slug.match(/(spring|summer|fall)-(\d{4})/i));
    if (!sem || /pharm|llb|ll\.b|llm|graduate(?!-?programs?$)|pgd/i.test(slug.replace(/undergraduate/, ""))) continue;
    const key = `${sem[1][0].toUpperCase()}${sem[1].slice(1).toLowerCase()}-${sem[2]}`;
    out.push({ slug, sem: key, finals: /final-exam/i.test(slug) });
  }
  const seen = new Set();
  return out.filter((c) => { const k = c.sem + c.finals; if (seen.has(k)) return false; seen.add(k); return true; });
}

export const kindOf = (t) => /holiday|eid|puja|victory|independence|christmas|ashura|shab|buddha|mother language|may day|new year|boishakh|janmashtami|revolution/i.test(t) ? "holiday"
  : /payment|tuition|fee/i.test(t) ? "payment" : /exam/i.test(t) ? "exam" : /break|reopen/i.test(t) ? "break"
  : /advising/i.test(t) ? "advising" : /first day of classes|last day of classes/i.test(t) ? "classes" : /last day|drop|withdraw|submission|incomplete|blocking/i.test(t) ? "deadline" : "other";

/* "September 08", "Sept. 13, 14, 15", "October 19-21", "Nov. 30-Dec. 03", "Dec 26-Jan 04" → [start, end] in that semester. */
export function parseDateRange(s, sem) {
  const [term, y] = sem.split("-"), base = Number(y), first = TERM_START[term.toLowerCase()];
  const parts = [...String(s).matchAll(/([A-Za-z]{3,9})\.?\s*(\d{1,2})|(?:^|[\s,\-–])(\d{1,2})(?=\s*(?:$|[,\-–]))/g)];
  let month = -1; const days = [];
  for (const p of parts) {
    if (p[1]) { const mi = MONTHS.indexOf(p[1].slice(0, 3).toLowerCase()); if (mi < 0) continue; month = mi; days.push([mi, Number(p[2])]); }
    else if (month >= 0) days.push([month, Number(p[3])]);
  }
  if (!days.length) return null;
  const iso = ([mi, d]) => { const yr = first >= 8 && mi < 4 ? base + 1 : base; return `${yr}-${String(mi + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`; };
  const a = iso(days[0]), b = iso(days[days.length - 1]);
  return [a, b > a ? b : ""];
}

export function parseCalendarPage(html, sem) {
  const out = [], h = String(html), i = h.search(/<table/i);
  if (i < 0) return out;
  const table = h.slice(i, h.indexOf("</table>", i));
  for (const row of table.split(/<tr[^>]*>/i).slice(1)) {
    const cells = row.split(/<\/t[dh]>/i).map(text).filter((c, k, a) => k < a.length - 1 || c);
    if (cells.length < 3 || /^date$/i.test(cells[0])) continue;
    const range = parseDateRange(cells[0], sem), title = cells[2].replace(/\s*\n\s*/g, " · ").trim();
    if (!range || !title) continue;
    out.push({ start: range[0], end: range[1], title, kind: kindOf(title) });
  }
  return out;
}

/* Final exam schedule: class days ("ST", "MW"…) → exam date. */
export function parseFinals(html) {
  const out = {}, h = String(html), i = h.search(/<table/i);
  if (i < 0) return out;
  for (const row of h.slice(i, h.indexOf("</table>", i)).split(/<tr[^>]*>/i).slice(1)) {
    const c = row.split(/<\/t[dh]>/i).map(text);
    const days = (c[0] || "").replace(/\s+/g, "").toUpperCase(), d = (c[3] || "").match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
    if (!/^[SMTWRFA]{1,3}$/.test(days) || !d) continue;
    const mi = MONTHS.indexOf(d[2].slice(0, 3).toLowerCase());
    if (mi >= 0) out[days] = `${d[3]}-${String(mi + 1).padStart(2, "0")}-${d[1].padStart(2, "0")}`;
  }
  return out;
}

/* The latest few undergraduate semesters, read live. */
export async function fetchCalendar(fetchImpl = fetch, now = new Date()) {
  const get = async (u) => { const r = await fetchImpl(u, { headers: { "user-agent": "EWUdiots calendar reader (unofficial student app)" }, signal: AbortSignal.timeout(15000) }); if (!r.ok) throw new Error(`EWU answered ${r.status}`); return r.text(); };
  const list = parseCalendarList(await get(CAL_SOURCE));
  const y = now.getFullYear(), wanted = new Set([y - 1, y, y + 1].flatMap((yr) => ["Spring", "Summer", "Fall"].map((t) => `${t}-${yr}`)));
  const sems = [...new Set(list.filter((c) => wanted.has(c.sem)).map((c) => c.sem))];
  const out = [];
  for (const sem of sems) {
    const cal = list.find((c) => c.sem === sem && !c.finals), fin = list.find((c) => c.sem === sem && c.finals);
    const events = cal ? parseCalendarPage(await get(`https://www.ewubd.edu/academic-calendar-details/${cal.slug}`), sem).map((e) => ({ ...e, url: `https://www.ewubd.edu/academic-calendar-details/${cal.slug}` })) : [];
    const finals = fin ? parseFinals(await get(`https://www.ewubd.edu/academic-calendar-details/${fin.slug}`)) : {};
    if (events.length || Object.keys(finals).length) out.push({ sem, events, finals });
  }
  return out;
}
