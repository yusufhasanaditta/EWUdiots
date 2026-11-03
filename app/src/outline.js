/* Course outline reader: turns the text of an EWU course outline (from a PDF's text layer or OCR of a photo) into
   structured data for the course page. Pure functions, no DOM, so it runs in tests.
   Everything is best-effort: a field the outline doesn't have stays empty and the page simply leaves it out. */

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const MON_RE = "(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)";
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DAY_RE = "(?:Sun|Mon|Tues?|Wed(?:nes)?|Thu(?:rs)?|Fri|Sat(?:ur)?)(?:day)?";
const TIME = "\\d{1,2}\\s*[.:]\\s*\\d{2}\\s*(?:[AaPp]\\.?\\s*[Mm]\\.?)?";
const RANGE_RE = new RegExp(`(${TIME})\\s*(?:[-–—]|to)\\s*(${TIME})`, "g");
const ROOM_RE = /\b([A-Z]{2,4}\d?\s?-\s?\d{2,4}[A-Z]?)\b/;

/* Headings in the order EWU outlines usually use them; each maps to a field. */
const HEADS = [
  ["schedule", /class\s+schedule(?:\s+and\s+office\s+hours?)?/i],
  ["contents", /course\s+contents?|course\s+content\s+outline|syllabus/i],
  ["rationale", /course\s+rationale/i],
  ["objectives", /(?:course\s+)?objectives?(?=\s*(?:of\s+the\s+course)?\s*[:\n])/i],
  ["description", /description(?=\s*[:\n])/i],
  ["outcomes", /(?:course\s+)?learning\s+outcomes?|\bCLOs?\b(?=\s*[:\n])/i],
  ["textbooks", /text\s*books?|recommended\s+books?/i],
  ["references", /reference\s+books?|references(?=\s*[:\n])/i],
  ["assessment", /assessment(?:\s+tools)?(?:\s+and\s+mark\s+distribution)?|mark(?:s)?\s+distribution|score\s+distribution|evaluation\s+(?:scheme|criteria)/i],
  ["grading", /grading\s+(?:policy|scale|system)/i],
  ["exams", /exam(?:ination)?\s+(?:dates?|schedule)|term\s+examinations?/i],
  ["dates", /important\s+dates/i],
  ["instructions", /special\s+instructions?|general\s+instructions?|course\s+policies|class\s+policies/i],
];

const EWU_POINTS = { "A+": 4, A: 3.75, "A-": 3.5, "B+": 3.25, B: 3, "B-": 2.75, "C+": 2.5, C: 2.25, D: 2, F: 0 };
const clean = (s) => String(s || "").replace(/\s+/g, " ").trim();
const cap = (s, n = 400) => clean(s).slice(0, n);
const monthIdx = (m) => MONTHS.findIndex((x) => x.startsWith(String(m).toLowerCase().slice(0, 3)));

/** Remove page furniture: "Page 2 of 5" footers and the repeated "Course Outline / MAT102 / Section: 7 / Fall 2026" block. */
export function stripFooters(text) {
  return String(text || "")
    .replace(/\r/g, "")
    .replace(/^.*\bPage\s+\d+\s+of\s+\d+.*$/gim, "")
    // Download-site watermarks ("Downloaded by … (email)", "lOMoARcPSD|123") aren't part of the outline.
    .replace(/\s*Downloaded by .*?(?:\)|$)/gim, "").replace(/\s*lOMoARcPSD\|\d+/g, "").replace(/^.*\bstudocu\b.*$/gim, "")
    .replace(/^\s*Course\s+Outline(?:\s+(?:Spring|Summer|Fall)\s*\d{4})?\s*$/gim, "")
    .replace(/^\s*(?:[A-Z]{3,4}\s?\d{3}[A-Z]?|Section\s*:\s*\d{1,2}|(?:Spring|Summer|Fall)\s+\d{4})\s*$/gm, "")
    .replace(/^\s*_{3,}\s*$/gm, "")
    .replace(/\n{3,}/g, "\n\n");
}

/** Split into named sections at the known headings (first occurrence of each, in text order). */
export function sections(text) {
  const hits = [];
  for (const [key, re] of HEADS) {
    const g = new RegExp(re.source, "gi");
    let m;
    while ((m = g.exec(text))) {
      // A heading starts a line (or follows a sentence end) and is short; skip mentions inside running text.
      const before = text.slice(Math.max(0, m.index - 2), m.index), lineEnd = text.indexOf("\n", m.index);
      const line = text.slice(m.index, lineEnd < 0 ? undefined : lineEnd);
      // A heading may have a word in front of it on its line ("Clouse Learning Outcome"), but not a sentence.
      const lead = text.slice(text.lastIndexOf("\n", m.index - 1) + 1, m.index);
      const tail = text.slice(m.index + m[0].length, lineEnd < 0 ? undefined : lineEnd), bare = /^\s*$/.test(lead);
      const ok = bare ? line.length < 80 || /^\s*[:\-–]/.test(tail) : /^\s*(?:[A-Za-z]{2,10}\s+)$/.test(lead) && /^\s*:?\s*$/.test(tail);
      if ((m.index === 0 || /\n\s*$|[:.]\s$/.test(before) || !bare) && ok) { hits.push({ key, at: m.index - (/^\s*$/.test(lead) ? 0 : lead.length), end: m.index + m[0].length }); break; }
    }
  }
  hits.sort((a, b) => a.at - b.at);
  const out = { head: text.slice(0, hits[0]?.at ?? text.length) };
  hits.forEach((h, i) => { if (!(h.key in out)) out[h.key] = text.slice(h.end, hits[i + 1]?.at ?? text.length).replace(/^\s*[:\-–]\s*/, ""); });
  return out;
}

/** "1. foo\n bar 2. baz" → ["foo bar", "baz"]; text before the first number is an intro and is dropped
    unless there are no numbers at all, then lines/bullets are used. */
export function listItems(block, { keepIntro = false } = {}) {
  const s = String(block || "").replace(/[♣•●▪■◆►✓✔]||/g, "\n• ").trim();
  if (!s) return [];
  const parts = s.split(/(?:^|\n|\s)\d{1,2}[.)]\s+(?=\S)|(?:^|\n)\s*(?:[ivx]{1,4}|[a-h])[.)]\s+(?=\S)|(?:^|\n|\s)\(\s*(?:\d{1,2}|[ivx]{1,4}|[a-h])\s*\)\s*(?=\S)/i);
  let items = parts.length > 1 ? (keepIntro ? parts : parts.slice(1)) : s.split(/\n\s*•\s*|\n(?=[A-Z])/);
  items = items.map((x) => clean(x.replace(/^•\s*/, ""))).filter((x) => x.length > 2);
  if (parts.length <= 1 && items.length === 1 && s.includes("•")) items = s.split("•").map(clean).filter((x) => x.length > 2);
  return items.slice(0, 40).map((x) => cap(x, 500));
}

/** Course contents: numbered units, each with a title (first line) and topics (comma separated). */
export function units(block) {
  const s = String(block || "").trim();
  if (!s) return [];
  const chunks = s.split(/(?:^|\n)\s*(?:\d{1,2}|unit\s*\d+|chapter\s*\d+|week\s*\d+)\s*[.):-]\s*/i).map((x) => x.trim()).filter(Boolean);
  const list = chunks.length > 1 || /^\s*\d/.test(s) ? chunks : [s];
  return list.slice(0, 30).map((c) => {
    const lines = c.split("\n").map(clean).filter(Boolean);
    let title = lines[0] || "", rest = lines.slice(1).join(" ");
    // One long line: the title is what comes before the first sentence that lists topics.
    if (!rest && title.length > 70) { const k = title.search(/\s(?=[A-Z][a-z]+(?:\s[a-z]+)*\s(?:to|of|and|with)\b)/); if (k > 8) { rest = title.slice(k); title = title.slice(0, k); } }
    const topics = rest.split(/[,;]|\.\s+(?=[A-Z])/).map((t) => clean(t).replace(/\.$/, "")).filter((t) => t.length > 2 && t.length < 160);
    return { title: cap(title.replace(/[:.]$/, ""), 120), topics: topics.slice(0, 40) };
  }).filter((u) => u.title || u.topics.length);
}

/** "Mid Term Examination 25%" lines → [{ name, pct }], without the Total row. */
export function assessment(block) {
  const out = [], seen = new Set();
  const re = /([A-Za-z][A-Za-z0-9 ()/&.,'-]{2,60}?)\s*[:\-–]?\s*(\d{1,3}(?:\.\d+)?)\s*%/g;
  let m;
  while ((m = re.exec(String(block || "")))) {
    const name = clean(m[1]).replace(/^(?:and|&)\s+/i, ""), pct = Number(m[2]);
    if (/^total\b/i.test(name) || pct <= 0 || pct > 100 || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase()); out.push({ name: cap(name, 60), pct });
  }
  return out.slice(0, 20);
}

/** Grading scale rows: "75% to less than 80% A 3.75" → { range, letter, point }. */
export function grading(block) {
  const out = [];
  // "80% and above A+ 4.00" (table) or "80 % and above -: A+" (inline, no points: EWU's scale fills them in).
  const re = /((?:\d{1,3}\s*%?\s*(?:and\s+above|or\s+above|to\s+(?:less\s+than\s+)?\d{1,3}\s*%?|[-–]\s*\d{1,3}\s*%?))|(?:less\s+than|below)\s+\d{1,3}\s*%?)[\s\-–:]*(A\+|A-|A|B\+|B-|B|C\+|C-|C|D\+|D|F)(?![A-Za-z])(?:\s+(\d\.\d{1,2}))?/gi;
  let m;
  while ((m = re.exec(String(block || "")))) {
    const letter = m[2].toUpperCase();
    if (!out.some((x) => x.letter === letter)) out.push({ range: clean(m[1]).replace(/\s+%/g, "%"), letter, point: m[3] ? Number(m[3]) : EWU_POINTS[letter] ?? null });
  }
  // Inline scales are read row by row across columns; show them best grade first.
  return out.sort((a, b) => (b.point ?? 0) - (a.point ?? 0)).slice(0, 15);
}

/** Year for a month in the outline's semester (Fall 2026: Jan–Apr fall into 2027). */
const yearFor = (mi, sem) => {
  const y = Number(sem?.year) || new Date().getFullYear();
  if (/fall/i.test(sem?.term || "") && mi <= 3) return y + 1;
  if (/spring/i.test(sem?.term || "") && mi >= 10) return y - 1;
  return y;
};
const iso = (y, mi, d) => `${y}-${String(mi + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/** Exam dates: "Midterm Exam Wednesday, 28 October 2026" / "Final: 14 Dec" … → [{ name, date }] */
export function exams(text, sem) {
  const out = [];
  const re = new RegExp(`(mid[\\s-]*term(?:\\s*(?:exam(?:ination)?)?\\s*[-–]?\\s*(?:\\d|I{1,2}))?|final(?:\\s+exam(?:ination)?)?|term[\\s-]*[1-3]|quiz\\s*\\d?)[^\\n\\d]{0,30}?(?:(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MON_RE})|(${MON_RE})\\s+(\\d{1,2}))(?:\\s*,?\\s*(\\d{4}))?`, "gi");
  let m;
  while ((m = re.exec(String(text || "")))) {
    const d = Number(m[2] || m[5]), mi = monthIdx(m[3] || m[4]);
    if (mi < 0 || !d || d > 31) continue;
    const y = Number(m[6]) || yearFor(mi, sem), raw = clean(m[1]);
    const name = /final/i.test(raw) ? "Final exam" : /^term/i.test(raw) ? `Term-${raw.match(/\d/)[0]} exam` : /quiz/i.test(raw) ? raw.replace(/^q/, "Q") : /\d|I{1,2}\b/.test(raw.replace(/mid[\s-]*term/i, "")) ? raw.replace(/mid[\s-]*term/i, "Mid-term") : "Mid-term";
    if (!out.some((x) => x.name === name)) out.push({ name, date: iso(y, mi, d) });
  }
  return out;
}

/** Important dates table: "October 19–21 Monday–Wednesday Holiday: Durgapuja" → [{ date, end?, label }]. */
export function importantDates(block, sem) {
  let s = clean(String(block || "").replace(/\bDate\s+Day\s+Event\b/i, ""));
  const starts = [], re = new RegExp(`\\b(${MON_RE})\\s+(\\d{1,2})\\b`, "gi");
  let m;
  while ((m = re.exec(s))) starts.push({ at: m.index, mon: m[1], day: Number(m[2]), len: m[0].length });
  const rows = [];
  for (let i = 0; i < starts.length; i++) {
    const a = starts[i], next = starts[i + 1];
    let chunk = s.slice(a.at + a.len, next ? next.at : s.length);
    let end = null;
    // "November 30 – December 03": the second month belongs to this row.
    if (next && /^\s*[-–—]\s*$/.test(chunk)) { end = { mon: next.mon, day: next.day }; chunk = s.slice(next.at + next.len, starts[i + 2] ? starts[i + 2].at : s.length); i++; }
    const r = chunk.match(new RegExp(`^\\s*((?:[,\\s]*\\d{1,2})*)\\s*(?:[-–—]\\s*(\\d{1,2}))?\\s*((?:${DAY_RE}\\s*[,–—-]?\\s*)*)(.*)$`, "i"));
    if (!r) continue;
    const label = clean(r[4]).replace(/^[-–:,\s]+/, "");
    if (!label || label.length < 3) continue;
    const mi = monthIdx(a.mon), y = yearFor(mi, sem);
    const lastExtra = (r[1].match(/\d{1,2}/g) || []).pop();
    const endDay = r[2] ? Number(r[2]) : lastExtra ? Number(lastExtra) : null;
    const row = { date: iso(y, mi, a.day), label: cap(label, 220) };
    if (end) { const em = monthIdx(end.mon); row.end = iso(yearFor(em, sem), em, end.day); }
    else if (endDay && endDay > a.day) row.end = iso(y, mi, endDay);
    rows.push(row);
  }
  return rows.slice(0, 60);
}

/** Class schedule rows for this course (and the instructor's office hours) from the schedule table. */
export function schedule(block, code, section) {
  const s = String(block || "").replace(/\n/g, " ");
  const dayRe = new RegExp(`\\b(${DAYS.join("|")})\\b`, "g");
  const marks = []; let m;
  while ((m = dayRe.exec(s))) marks.push({ at: m.index, day: m[1] });
  const num = String(code || "").match(/\d{3}[A-Z]?$/)?.[0] || "";
  const courseRe = new RegExp(`\\b[A-Z]{2,4}\\s?(\\d{3}[A-Z]?)\\s*\\(\\s*([^)]*?)\\s*\\)`, "g");
  const classes = [], office = [];
  if (!marks.length) return { classes, office };
  // Two table layouts: the day written above its rows, or centred down the middle of them (rows above and below it).
  const entries = []; let c;
  while ((c = courseRe.exec(s))) entries.push(c);
  const centred = entries.length && entries[0].index < marks[0].at;
  const dayAt = (pos) => (centred ? marks.reduce((b, d) => (Math.abs(d.at - pos) < Math.abs(b.at - pos) ? d : b)) : [...marks].reverse().find((d) => d.at <= pos) || marks[0]).day;
  const used = [];
  for (const e of entries) {
    const from = e.index + e[0].length, t = new RegExp(RANGE_RE.source).exec(s.slice(from, from + 60));
    if (!t) continue;
    used.push(from + t.index);
    const room = s.slice(from + t.index + t[0].length, from + t.index + t[0].length + 40).replace(new RegExp(`\\b(${DAYS.join("|")})\\b`, "g"), "").match(ROOM_RE)?.[1]?.replace(/\s/g, "") || "";
    const secs = e[2].split(/[^\d]+/).filter(Boolean);
    if (e[1] === num && (!section || !secs.length || secs.includes(String(section)))) classes.push({ day: dayAt(e.index), start: normTime(t[1], t[2]), end: normTime(t[2], t[1]), room });
  }
  const rr = new RegExp(RANGE_RE.source, "g");
  let t;
  while ((t = rr.exec(s))) if (t.index >= marks[0].at - (centred ? 400 : 0) && !used.includes(t.index)) {
    const hrs = s.slice(t.index + t[0].length, t.index + t[0].length + 20).match(/^\s*\(?\s*(\d+(?:\.\d+)?)\s*hours?/i);
    office.push({ day: dayAt(t.index), start: normTime(t[1], t[2]), end: normTime(t[2], t[1]), hours: hrs ? Number(hrs[1]) : null });
  }
  return { classes, office };
}

/** "04.50 PM" → "4:50 PM"; a missing AM/PM borrows from the other end of the range. */
export function normTime(t, other = "") {
  const m = String(t).replace(/\s/g, "").match(/^(\d{1,2})[.:](\d{2})([AaPp])?\.?([Mm])?\.?$/);
  if (!m) return clean(t);
  const ap = m[3] ? `${m[3].toUpperCase()}M` : (String(other).match(/([AaPp])\.?\s*[Mm]/)?.[1]?.toUpperCase() || "") && `${String(other).match(/([AaPp])/)[1].toUpperCase()}M`;
  return `${Number(m[1])}:${m[2]}${ap ? ` ${ap}` : ""}`;
}

/** Units listed by name only ("1. Ordinary Differential Equations") get their topics from a later block that repeats
    each unit name as a heading with numbered topics under it ("Description: The following topics…"). */
function withTopics(us, block) {
  if (!us.length || us.reduce((n, u) => n + u.topics.length, 0) >= us.length * 2) return us;
  const norm = (x) => x.toLowerCase().replace(/[^a-z]/g, ""), num = /^\d{1,2}[.)]\s*/;
  let cur = null;
  for (const l of String(block).split("\n").map(clean).filter(Boolean)) {
    const u = !num.test(l) && us.find((x) => norm(x.title) === norm(l));
    if (u) { cur = u; u.topics = []; continue; }
    if (!cur) continue;
    if (num.test(l)) cur.topics.push(l.replace(num, ""));
    else if (cur.topics.length) cur.topics[cur.topics.length - 1] += ` ${l}`;
  }
  for (const u of us) u.topics = u.topics.flatMap((t) => (t.length > 70 ? t.split(/,\s*/) : [t])).map((t) => clean(t).replace(/\s+([.,])/g, "$1").replace(/\.$/, "")).filter((t) => t.length > 2).slice(0, 40);
  return us;
}

/** The whole outline. `hint` = { code, section } of the course page, used when the outline is vague. */
export function parseOutline(raw, hint = {}) {
  const text = stripFooters(raw);
  const flat = clean(text);
  const pick = (re) => clean(flat.match(re)?.[1] || "");
  const sec = sections(text);

  const code = (pick(/Course\s*Code\s*[:\-]\s*([A-Z]{2,4}\s?\d{3}[A-Z]?)/i) || hint.code || pick(/\b([A-Z]{3,4}\d{3})\b/)).replace(/\s/g, "").toUpperCase();
  const title = pick(/Course\s*(?:Title|Name)\s*[:\-]\s*(.+?)\s*(?:Course\s*Code|Pre[-\s]?Requisite|Credit|$)/i);
  const semM = flat.match(/\b(Spring|Summer|Fall)\s*[-,]?\s*(20\d{2})\b/i);
  const semester = semM ? { term: semM[1][0].toUpperCase() + semM[1].slice(1).toLowerCase(), year: Number(semM[2]) } : null;
  // The course page's own section wins when the outline mentions it (one outline often covers several sections).
  const rawFlat = clean(raw), secs = [...rawFlat.matchAll(/Sec(?:tion)?\s*(?:No\.?)?\s*[:\-]?\s*(\d{1,2})\b/gi)].map((x) => x[1]);
  const section = hint.section && secs.includes(String(hint.section)) ? String(hint.section) : secs[0] || String(hint.section || "");
  const ins = pick(/(?:Course\s+)?Instructor(?:'s)?(?:\s+Name)?\s*[:\-]\s*(.+?)\s*(?:Office|E-?mail|Phone|Cell|Mobile|Class\s+Schedule|$)/i);
  const [insName, ...insRest] = ins.split(/\s*,\s*/);
  const email = (flat.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/) || [""])[0];
  const phone = (flat.match(/(?:Phone|Cell|Mobile|Contact)(?:\s*(?:Number|No\.?))?\s*[:\-]?\s*(\+?88)?\s*(01[3-9]\d{2}[-\s]?\d{6})/i) || [])[2]?.replace(/[-\s]/g, "") || "";
  const office = pick(/Office\s*(?:Room|No\.?)?\s*[:\-]\s*(?:Room\s*#?\s*)?([A-Z0-9]{2,5}\s?-?\s?\d{2,4}[A-Z]?)/i).replace(/\s/g, "");
  const credits = Number(pick(/Credit\s*Hours?\s*[:\-]\s*(\d(?:\.\d)?)/i)) || null;
  const prereq = pick(/Pre[-\s]?Requisites?\s*[:\-]\s*(.+?)\s*(?:Credit|Course\s+Instructor|Course\s+Title|$)/i).replace(/\bnone\b/i, "None");
  const dept = pick(/Department\s+of\s+([A-Za-z &,]+?)\s*(?:Semester|Course|$)/i);

  const sch = sec.schedule ? schedule(sec.schedule, code, section) : schedule(text, code, section);
  const allExams = exams(sec.exams || text, semester);

  const out = {
    code, title: cap(title, 120), section, semester, dept: cap(dept, 80), credits, prereq: cap(prereq, 80),
    instructor: insName ? { name: cap(insName, 80), role: cap(insRest.join(", "), 120), email, phone, office } : (email ? { name: "", role: "", email, phone, office } : null),
    classes: sch.classes, officeHours: sch.office,
    units: withTopics(units(sec.contents), sec.description || sec.contents || ""),
    rationale: cap(sec.rationale, 1500),
    objectives: listItems(sec.objectives),
    outcomes: listItems(sec.outcomes),
    // "th" is a stray superscript from "10th edition" lifted onto its own line.
    textbooks: [...listItems(sec.textbooks), ...listItems(sec.references)].map((x) => x.replace(/\(\s*(\d+)\s+edition\)/i, "($1th edition)").replace(/\s+th\s+/g, " ")).slice(0, 20),
    // Inline layouts put some score lines just above the "Score Distribution" heading.
    assessment: assessment(`${sec.assessment || ""}\n${(sec.exams || "").split("\n").filter((l) => /%/.test(l)).join("\n")}`),
    grading: grading(sec.grading || ""),
    exams: allExams,
    dates: importantDates(sec.dates || "", semester),
    // The signature "(Name)" and "Date: …" under the instructions aren't instructions.
    instructions: listItems(String(sec.instructions || "").replace(/^\s*\([^)\n]{3,60}\)\s*$/gm, "").replace(/^\s*Date\s*:.*$/gim, "").replace(/\n\s*\([^)\n]{3,60}\)\s*(?=\n|$)/g, "")),
  };
  // How much we found, so the page can say "we read 9 of 12 parts".
  const parts = ["title", "instructor", "classes", "units", "objectives", "outcomes", "textbooks", "assessment", "grading", "exams", "dates", "instructions"];
  out.found = parts.filter((k) => (Array.isArray(out[k]) ? out[k].length : !!out[k]));
  return out;
}

/** Text of a PDF, line by line: pdf.js gives positioned pieces; pieces on the same baseline become one line.
    `pdfjs` is the loaded pdfjs-dist module (passed in so this file stays free of imports). */
export async function pdfText(data, pdfjs, maxPages = 12) {
  const doc = await pdfjs.getDocument({ data, isEvalSupported: false, disableFontFace: true }).promise;
  const pages = [];
  for (let p = 1; p <= Math.min(doc.numPages, maxPages); p++) {
    const tc = await (await doc.getPage(p)).getTextContent();
    const rows = [];
    for (const it of tc.items) {
      if (!it.str || !it.str.trim()) continue;
      const x = it.transform[4], y = it.transform[5];
      let r = rows.find((q) => Math.abs(q.y - y) < 3);
      if (!r) rows.push((r = { y, parts: [] }));
      r.parts.push({ x, w: it.width || 0, h: Math.abs(it.transform[3]) || it.height || 10, s: it.str });
    }
    rows.sort((a, b) => b.y - a.y);
    // Pieces that touch belong to one word ("S"+"ummer"); a real gap (over ~¼ of the font size) is a space.
    const join = (parts) => parts.sort((a, b) => a.x - b.x).reduce((acc, q, i, arr) => {
      if (!i) return q.s;
      const p = arr[i - 1], gap = q.x - (p.x + p.w);
      return acc + (gap > Math.max(1.2, q.h * 0.22) || /\s$/.test(acc) || /^\s/.test(q.s) ? " " : "") + q.s;
    }, "");
    pages.push(rows.map((r) => join(r.parts).replace(/\s+/g, " ").trim()).join("\n"));
  }
  return pages.join("\n");
}
