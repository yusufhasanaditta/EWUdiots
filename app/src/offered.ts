/* Offered courses for a semester (pure, no DOM; tested in tests/offered.test.ts): EWU's "faculty list" (course, section,
   faculty, seats, timing, room per row) from the PDF that ewucoursetracker.live publishes or from its snapshot API,
   grouped into sections, plus what each course means for this student (done, doing, credits, department). */

export interface Row { code: string; sec: string; fac: string; cap: string; time: string; room: string }
export interface Slot { days: string; start: string; end: string; room: string; lab?: boolean }
export interface Section { sec: string; faculty: string; taken: number; capacity: number; slots: Slot[] }
export interface Course { code: string; dept: string; cr: number; crGuess: boolean; sections: Section[] }
export interface OfferedList { sem: string; updated: string; source: string; courses: Course[] }

const CODE = /^([A-Z]{2,5}(?:[-_]?\d{3,4})(?:[A-Z]|-L|-\d{3,4})?)(?=\s|$)/;
const SEC = /^(\d{1,2})(?=\s|$)/;
const CAP = /^(\d+\s?\/\s?\d+)(?=\s|$)/;
const TIME = /^([SMTWRFA]{1,3}) (\d\d:\d\d [AP]M) - (\d\d:\d\d [AP]M)(?=\s|$)/;
const FAC = /^([A-Z][A-Z0-9]{0,11})(?=\s|$)/;
const FIELDS = ["code", "sec", "fac", "cap", "time", "room"] as const;
type Field = typeof FIELDS[number];

// Watermark damage seen in the PDF: names that wrap onto the next line, a day letter glued to a name, seats glued to a room.
const FIXES: [RegExp, string][] = [
  [/\bTBAS (\d\d:)/g, "TBA S $1"], [/\bPCM (\d\d:)/g, "PC M $1"],
  [/(\d+\/\d+?)(\d{3} \()/g, "$1 $2"]
];
const NAME_FIX: Record<string, string> = { RAFICHO: "RAFICHOW", SADDAMP: "SADDAMPT", MMRAHMA: "MMRAHMAN", MOYAZZE: "MOYAZZEM" };
const open = (s: string) => (s.match(/\(/g) || []).length > (s.match(/\)/g) || []).length;

/* `pdftotext -raw` output → rows. Rows split by the watermark are put back together: the pieces the page lost
   (a time, a seat count, a room, the end of a room name) come at the end of that page, in order. */
export function parseFacultyList(text: string): Row[] {
  const out: Row[] = [];
  const pages = String(text).split(/^\f?ewucoursetracker\.live[ \t\r]*$/m);
  for (const page of pages) {
    let lines = page.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !/^Course Sec Faculty/.test(l));
    for (const [re, to] of FIXES) lines = lines.map((l) => l.replace(re, to));
    const rows: (Partial<Row> & { next: number; holes: Field[] })[] = [];
    let cur: (typeof rows)[number] | null = null;
    const orphans: string[] = [];
    const done = (r: typeof cur) => !r || (r.next >= FIELDS.length && !open(r.room || ""));
    for (let line of lines) {
      const startsRow = CODE.test(line) && (SEC.test(line.replace(CODE, "").trim()) || line.replace(CODE, "").trim() === "");
      if (startsRow) { cur = { next: 0, holes: [] }; rows.push(cur); }
      else if (/^[A-Z]$/.test(line)) continue; // a wrapped name letter (fixed by NAME_FIX)
      else if (!cur || done(cur)) { orphans.push(line); continue; }
      else if (cur.next >= FIELDS.length) { cur.room += " " + line.replace(/^[A-Z] (?=\S)/, ""); continue; } // room name continues
      // Fill fields in order; a field that doesn't match while a later one does is left as a hole.
      while (line && cur.next < FIELDS.length) {
        let hit = false;
        for (let k = cur.next; k < FIELDS.length; k++) {
          const f = FIELDS[k], m = take(f, line);
          if (!m) continue;
          for (let j = cur.next; j < k; j++) cur.holes.push(FIELDS[j]);
          (cur as Record<string, unknown>)[f] = m.v; cur.next = k + 1; line = m.rest; hit = true; break;
        }
        if (!hit) break;
      }
    }
    // Hand the page's loose pieces to the rows that miss them, first come first served.
    const queue = (pred: (s: string) => boolean) => orphans.filter(pred);
    const times = queue((s) => TIME.test(s)), caps = queue((s) => CAP.test(s) && s.replace(CAP, "").trim() === "");
    const tails = queue((s) => /\)$/.test(s) && !/^(\d{3}|[A-Z]{2,3}\d?-\d)/.test(s) && !TIME.test(s));
    const rooms = queue((s) => !TIME.test(s) && !(CAP.test(s) && s.replace(CAP, "").trim() === "") && !tails.includes(s));
    for (const r of rows) {
      for (const h of r.holes.concat(FIELDS.slice(r.next) as Field[])) {
        const pool = h === "time" ? times : h === "cap" ? caps : h === "room" ? rooms : null;
        if (pool?.length) (r as Record<string, unknown>)[h] = pool.shift();
      }
      while (open(r.room || "") && tails.length) r.room += " " + tails.shift()!.replace(/^[A-Z] (?=\S)/, "");
    }
    for (const r of rows) if (r.code && r.sec) out.push({ code: r.code, sec: r.sec, fac: NAME_FIX[r.fac || ""] || r.fac || "TBA", cap: (r.cap || "").replace(/\s/g, ""), time: r.time || "", room: (r.room || "").replace(/\s+[A-Z]$/, "").replace(/\s+/g, " ").trim() });
  }
  return out;
}
function take(f: Field, line: string): { v: string; rest: string } | null {
  const re = { code: CODE, sec: SEC, cap: CAP, time: TIME, fac: FAC, room: /^(.+)$/ }[f];
  const m = line.match(re);
  if (!m) return null;
  if (f === "fac" && (TIME.test(line) || CAP.test(line))) return null; // "M 08:30 AM…" is a day, not a name
  if (f === "room" && (TIME.test(line) || CAP.test(line))) return null;
  return { v: m[0].trim(), rest: line.slice(m[0].length).trim() };
}

const to24 = (t: string) => { const m = t.match(/(\d\d):(\d\d) ([AP])M/); if (!m) return ""; let h = Number(m[1]) % 12; if (m[3] === "P") h += 12; return `${String(h).padStart(2, "0")}:${m[2]}`; };
const mins = (a: string, b: string) => { const p = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3)); return p(b) - p(a); };
export const deptOf = (code: string) => (String(code).match(/^[A-Z]+/) || [""])[0];

/* Rows → courses with sections. Rows of a section on different days at the same time merge into one slot ("M" + "W" → "MW");
   a 2-hour-or-longer slot is a lab. */
export function groupRows(rows: Row[]): Course[] {
  const by = new Map<string, Map<string, Section>>();
  for (const r of rows) {
    const t = r.time.match(TIME);
    const secs = by.get(r.code) || new Map<string, Section>(); by.set(r.code, secs);
    const [taken, capacity] = r.cap.split("/").map(Number);
    const s = secs.get(r.sec) || { sec: r.sec, faculty: r.fac, taken: taken || 0, capacity: capacity || 0, slots: [] };
    secs.set(r.sec, s);
    if (s.faculty === "TBA" && r.fac !== "TBA") s.faculty = r.fac;
    if (!t) continue;
    const start = to24(t[2]), end = to24(t[3]), lab = mins(start, end) >= 110;
    const same = s.slots.find((x) => x.start === start && x.end === end && !!x.lab === lab && !x.days.includes(t[1]));
    if (same) { same.days = sortDays(same.days + t[1]); if (!same.room.includes(r.room) && r.room) same.room = same.room ? `${same.room} / ${r.room}` : r.room; }
    else s.slots.push({ days: t[1], start, end, room: r.room, ...(lab ? { lab: true } : {}) });
  }
  return [...by].map(([code, secs]) => {
    const sections = [...secs.values()].sort((a, b) => Number(a.sec) - Number(b.sec));
    return { code, dept: deptOf(code), ...guessCredits(sections), sections };
  }).sort((a, b) => a.code.localeCompare(b.code, "en", { numeric: true }));
}
const ORDER = "SMTWRFA";
const sortDays = (d: string) => [...new Set(d)].sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b)).join("");

/* Credits aren't in the list: 3 for the theory part, plus 1 for a 2-hour lab or 1.5 for a 3-hour one; a lab-only course is
   1 (or 1.5). Long single weekly classes (graduate, 3 hours) count 3. Marked as a guess; the curriculum wins when known. */
export function guessCredits(sections: Section[]): { cr: number; crGuess: boolean } {
  const s = sections.find((x) => x.slots.length) || sections[0];
  if (!s?.slots.length) return { cr: 3, crGuess: true };
  const theory = s.slots.filter((x) => !x.lab), labs = s.slots.filter((x) => x.lab);
  const labCr = labs.length ? (Math.max(...labs.map((x) => mins(x.start, x.end))) >= 170 ? 1.5 : 1) : 0;
  // Only long classes: a 3-hour class outside a lab is a weekly graduate course (3 credits); otherwise a lab course.
  if (!theory.length) return { cr: labs.some((x) => mins(x.start, x.end) >= 170 && !/lab/i.test(x.room)) ? 3 : labCr, crGuess: true };
  return { cr: 3 + labCr, crGuess: true };
}

/* EWU portal snapshot rows (ewucoursetracker.live /api/snapshot/:id) → rows. */
export function fromSnapshot(courses: Record<string, unknown>[] = []): Row[] {
  return courses.map((c) => ({ code: String(c.CourseCode || "").replace(/\s+/g, ""), sec: String(c.SectionName || "").replace(/\D/g, ""), fac: String(c.ShortName || "TBA"),
    cap: `${Number(c.SeatTaken) || 0}/${Number(c.SeatCapacity) || 0}`, time: String(c.TimeSlotName || "").replace(/\s+/g, " ").trim(), room: String(c.RoomCode || "") })).filter((r) => r.code && r.sec);
}

/* Planner shape (ui-academic.js): { CODE: { title, cr, sections: [{ sec, days, start, end, room, faculty, seats, capacity, lab, slots }] } } */
export function toPlanner(courses: Course[], title: (code: string) => string = () => "", credits: (c: Course) => number = (c) => c.cr) {
  const O: Record<string, unknown> = {};
  for (const c of courses) {
    const sections = c.sections.filter((s) => s.slots.length).map((s) => {
      const th = s.slots.find((x) => !x.lab) || s.slots[0], lab = s.slots.find((x) => x.lab && x !== th);
      return { sec: s.sec, days: th.days, start: th.start, end: th.end, room: th.room, faculty: s.faculty, capacity: s.capacity || undefined, seats: s.capacity ? Math.max(0, s.capacity - s.taken) : undefined,
        ...(lab ? { lab: { days: lab.days, start: lab.start, end: lab.end, room: lab.room } } : {}), slots: s.slots };
    });
    if (sections.length) O[c.code] = { title: title(c.code) || c.code, cr: credits(c), sections };
  }
  return O;
}

/* Where a course stands for this student. Dropped courses don't count as done or doing. */
export function standing(code: string, { passed = new Set<string>(), doing = new Set<string>() }: { passed?: Set<string>; doing?: Set<string> }) {
  return passed.has(code) ? "done" : doing.has(code) ? "doing" : "open";
}

/* Credit check for the courses picked for next semester: EWU's load is 9 to 15 credits. */
export function creditCheck(total: number, min = 9, max = 15) {
  return { total, min, max, ok: total >= min && total <= max, under: Math.max(0, min - total), over: Math.max(0, total - max) };
}
