/* Turns EWU portal text (copy-paste, OCR of a screenshot, or extension capture)
   into structured data. Formats are modelled on the real portal pages:
   Profile, Class Schedule, Advising/Deposit Slip, Grade Report, Degree Review,
   Offered Courses, Advising Rules and Pre-Advising.

   Privacy: only academic fields are extracted. Phone, address, national ID,
   date of birth, blood group, marital status and photos are never read. */

export const DAY_LETTERS = { S: 0, M: 1, T: 2, W: 3, R: 4, F: 5, A: 6 };
const FULLDAYS = { sun: "S", mon: "M", tue: "T", wed: "W", thu: "R", fri: "F", sat: "A" };
const TERM_ORDER = { spring: 0, summer: 1, fall: 2 };

const CODE_RE = /\b([A-Z]{2,4})\s?(\d{3,4}[A-Z]?)\b/;
const TIME_RE = /(\d{1,2})[:.](\d{2})\s*([AaPp]\.?[Mm]\.?)?\s*(?:-|–|to|~)\s*(\d{1,2})[:.](\d{2})\s*([AaPp]\.?[Mm]\.?)?/;
const GRADE_RE = /(?:^|\s)(\d{1,2}(?:\.\d{1,2})?)\s+(A\+|A-|B\+|B-|C\+|C-|D\+|A|B|C|D|F|P|S|U|R|I|W)(?=\s|$)/;
const ROOM_RE = /\b([A-Z]{1,4}\d?-\d{2,4}[A-Z]?|\d{3,4}[A-Z]?)\b(\s*\([^)]{2,40}\))?/;
const EMAIL_RE = /[A-Za-z0-9._%+-]+@(?:std\.)?ewubd\.edu/;
const NOT_INITIALS = new Set(["NO", "YES", "DR", "MR", "MS", "MRS", "LAB", "AM", "PM", "TBA", "N/A"]);

export function currentSemester(d = new Date()) {
  const m = d.getMonth(); // EWU: Spring Jan–Apr, Summer May–Aug, Fall Sep–Dec
  return `${m < 4 ? "Spring" : m < 8 ? "Summer" : "Fall"}-${d.getFullYear()}`;
}
export function normSemester(s) {
  const m = String(s).match(/(Spring|Summer|Fall)\s*[-, ]?\s*(\d{4})|(\d{4})\s*[-, ]?\s*(Spring|Summer|Fall)/i);
  if (!m) return "";
  const term = (m[1] || m[4]).toLowerCase(), year = m[2] || m[3];
  return `${term[0].toUpperCase()}${term.slice(1)}-${year}`;
}
export const semesterKey = (s) => { const m = normSemester(s).match(/(\w+)-(\d{4})/); return m ? Number(m[2]) * 3 + TERM_ORDER[m[1].toLowerCase()] : 0; };

function to24(h, m, ap) {
  h = Number(h);
  if (ap) { const pm = /p/i.test(ap); if (pm && h < 12) h += 12; if (!pm && h === 12) h = 0; }
  else if (h >= 1 && h <= 7) h += 12; // campus hours: 1–7 without AM/PM means afternoon
  return `${String(h).padStart(2, "0")}:${m}`;
}

/* OCR and copy-paste often break a table cell over two lines
   ("MW 1:30PM-" / "3:00PM"). Re-join those before parsing. */
function joinBrokenLines(text) {
  return text.replace(/(\d[:.]\d{2}\s*(?:[AaPp][Mm])?\s*[-–])\s*\n\s*(?=\d{1,2}[:.]\d{2})/g, "$1");
}

function grabProfile(T) {
  const p = {};
  const g = (re) => { const m = T.match(re); return m ? m[1].replace(/\s+/g, " ").trim() : undefined; };
  p.name = g(/\bHi,\s*([A-Za-z][A-Za-z. ]{2,60}?)\s*(?:\n|\t|$)/) ||
           g(/(?:Student\s+)?Name\s*(?::|\t)\s*([A-Za-z][A-Za-z. ]{2,60}?)\s*(?:\s{2,}ID|ID#|\t|\n|$)/i);
  p.id = g(/\b(\d{4}-\d-\d{2}-\d{3})\b/);
  p.program = g(/Degree Objective\s*:\s*([^\n\t]+)/i) || g(/\bProgram\s*:\s*([^\n\t]+)/i);
  p.department = g(/\bDepartment\s*:\s*(?:Department of\s*)?([A-Za-z&. ]{2,40}?)\s*(?:\n|\t|$)/i);
  const adv = T.match(/Advis[eo]r\s*:?\s*\t?\s*((?:Dr\.|Mr\.|Ms\.|Mrs\.|Prof\.)?[A-Za-z. ]{4,80}?)\s*\(([A-Z]{2,8})\)/);
  if (adv) { p.advisor = adv[1].replace(/\s+/g, " ").trim(); p.advisorInitial = adv[2]; }
  const advMail = T.match(/\(([A-Z]{2,8})\)\s*\n?\s*([A-Za-z0-9._%+-]+@ewubd\.edu)/);
  if (advMail) p.advisorEmail = advMail[2];
  p.email = g(/\b(\d{4}-\d-\d{2}-\d{3}@std\.ewubd\.edu)\b/);
  const cg = g(/\bCGPA\s*[:\t]?\s*(\d\.\d{1,2})/i); if (cg) p.cgpa = Number(cg);
  const cc = g(/Credits?\s*(?:completed|earned)\s*[:\t]?\s*(\d{1,3}(?:\.\d{1,2})?)/i) || g(/\bCr\s*Earn\s*[:\t]?\s*(\d{1,3}(?:\.\d{1,2})?)/i);
  if (cc) p.creditsDone = Number(cc);
  const tot = g(/Min(?:imum)?\s*Credits?\s*Required\s*[:\t]?\s*(\d{2,3})/i); if (tot) p.creditsTotal = Number(tot);
  const adm = g(/Admitted\s*Semester\s*:?\s*\t?\s*((?:Spring|Summer|Fall)-?\s*\d{4})/i); if (adm) p.admitted = normSemester(adm);
  Object.keys(p).forEach((k) => (p[k] === undefined || p[k] === "") && delete p[k]);
  return p;
}

function grabRules(T) {
  const r = {};
  const n = (re) => { const m = T.match(re); return m ? Number(m[1]) : undefined; };
  r.maxCredit = n(/Max\s*Credit\s*:\s*(\d+(?:\.\d)?)/i);
  r.minCredit = n(/Min\s*Credit\s*:\s*(\d+(?:\.\d)?)/i);
  r.maxPerDay = n(/Max\s*Courses?\s*per\s*day\s*:\s*(\d+)/i);
  r.maxCourses = n(/Max\s*Course\s*:\s*(\d+)/i);
  r.minCourses = n(/Min\s*Course\s*:\s*(\d+)/i);
  r.minCgpa = n(/Minimum\s*CGPA\s*Required\s*:\s*(\d\.\d+)/i);
  Object.keys(r).forEach((k) => r[k] === undefined && delete r[k]);
  return r;
}

function grabPayments(T) {
  const out = [];
  const re = /Grand\s*Total(\s*with\s*Late\s*Fee)?\s*Last\s*Date\s*:?\s*(\d{1,2})\/(\d{1,2})\/(\d{4})\s+([\d,]+(?:\.\d{2})?)/gi;
  let m;
  while ((m = re.exec(T))) out.push({ late: !!m[1], due: `${m[4]}-${m[3].padStart(2, "0")}-${m[2].padStart(2, "0")}`, amount: Number(m[5].replace(/,/g, "")) });
  const fees = {};
  for (const [k, label] of [["tuition", "Tuition Fee"], ["lab", "Laboratory Fee"], ["activity", "Student Activity Fee"], ["library", "Library Fee"]]) {
    const f = T.match(new RegExp(label + "\\s+([\\d,]+(?:\\.\\d{2})?)", "i")); if (f) fees[k] = Number(f[1].replace(/,/g, ""));
  }
  return { schedule: out, fees };
}

function grabDegree(T) {
  const out = [];
  for (const line of T.split("\n")) {
    const m = line.match(/^\s*([A-Za-z][A-Za-z &,-]{3,90}?)\s+(\d{1,3}(?:\.\d)?)\s*\(\s*Out\s*of\s*(\d{1,3}(?:\.\d)?)\s*\)/i);
    if (m) out.push({ category: m[1].trim(), done: Number(m[2]), total: Number(m[3]) });
  }
  return out;
}

export function parsePortalText(input) {
  const T = joinBrokenLines(String(input || "").replace(/–|—/g, "-").replace(/\r/g, "").replace(/ /g, " "));
  const profile = grabProfile(T);
  const rules = grabRules(T);
  const payments = grabPayments(T);
  const degree = grabDegree(T);
  // Not "Offered Courses": that phrase is in the portal's sidebar menu on every page.
  const offeredMode = /\bCapacity\b|Dedicated\s*department/i.test(T);
  const preAdvising = /\bPrerequisite\b|Recommended\s*Courses/i.test(T);
  const routine = [], offered = [], grades = [], recommended = [], faculty = new Map();
  let sem = "", last = null, rowSem;

  for (const raw of T.split("\n")) {
    const line = raw.replace(/[|]/g, " ").replace(/[ \t]+/g, " ").trim();
    if (!line) continue;
    const semHead = line.match(/^(\d{4}\s+(?:Spring|Summer|Fall)|(?:Spring|Summer|Fall)[- ]\d{4})$/i);
    if (semHead) { sem = normSemester(semHead[1]); continue; }

    const cm = line.match(CODE_RE);
    const tm = line.match(TIME_RE);
    const gm = !tm && line.match(GRADE_RE);

    if (cm && gm) { // grade-report or degree-review row
      const start = line.indexOf(cm[0]) + cm[0].length;
      const title = line.slice(start, line.indexOf(gm[0], start)).replace(/\s+/g, " ").trim();
      grades.push({ code: cm[1] + cm[2], title, cr: Number(gm[1]), g: gm[2], sem });
      continue;
    }
    if (cm && !tm && preAdvising) {
      const rest = line.slice(line.indexOf(cm[0]) + cm[0].length);
      const cr = rest.match(/^\s*(\d(?:\.\d)?)\b/);
      if (cr) { recommended.push({ code: cm[1] + cm[2], cr: Number(cr[1]), prereq: [...rest.matchAll(/\b[A-Z]{2,4}\d{3,4}\b/g)].map((x) => x[0]) }); }
      continue;
    }
    if (!tm) continue;

    const before = line.slice(0, line.indexOf(tm[0]));
    const after = line.slice(line.indexOf(tm[0]) + tm[0].length);
    let days = "";
    for (const tk of before.split(" ").reverse()) { if (/^[SMTWRFA]{1,3}$/.test(tk)) { days = tk; break; } }
    if (!days) days = [...new Set([...before.toLowerCase().matchAll(/\b(sun|mon|tue|wed|thu|fri|sat)[a-z]*/g)].map((m) => FULLDAYS[m[1]]))].join("");
    if (!days) continue;

    let start = to24(tm[1], tm[2], tm[3] || tm[6]);
    let end = to24(tm[4], tm[5], tm[6] || tm[3]);
    // Only one side had AM/PM ("11:50 - 1:20PM", "11:30AM-1:00"): if borrowing it put the
    // start after the end, the class crosses noon.
    if (Boolean(tm[3]) !== Boolean(tm[6]) && start >= end) {
      if (tm[6]) start = to24(tm[1], tm[2], "AM"); else end = to24(tm[4], tm[5], "PM");
    }
    const roomM = after.match(ROOM_RE);
    const room = roomM ? (roomM[1] + (roomM[2] || "")).trim() : "";
    let tail = roomM ? after.replace(roomM[0], " ") : after;
    const email = (tail.match(EMAIL_RE) || [""])[0];
    tail = tail.replace(EMAIL_RE, " ");
    const seatsM = tail.match(/\b(\d{1,3})\s*\/\s*(\d{1,3})\b/);
    if (seatsM) tail = tail.replace(seatsM[0], " ");
    const tokens = tail.split(" ").filter(Boolean);
    const iIdx = tokens.findIndex((t) => /^[A-Z]{2,6}$/.test(t) && !NOT_INITIALS.has(t));
    const initial = iIdx >= 0 ? tokens[iIdx] : "";
    const facName = iIdx >= 0 ? tokens.slice(iIdx + 1).join(" ").replace(/\s+/g, " ").trim() : "";

    let isLab = /\blab\b/i.test(before);
    if (cm) {
      const afterCode = line.slice(line.indexOf(cm[0]) + cm[0].length, line.indexOf(tm[0]));
      const nums = [...afterCode.matchAll(/\b\d+(?:\.\d+)?\b/g)].map((x) => x[0]);
      const sec = nums.find((x) => /^\d{1,2}$/.test(x)) || "";
      const title = afterCode.replace(/\b\d+(?:\.\d+)?\b/g, " ").replace(new RegExp(`\\b${days}\\b`), " ").replace(/\b(lab)\b/i, " ")
        .replace(/\b(sun|mon|tue|wed|thu|fri|sat)[a-z]*\b/gi, " ").replace(/\s+/g, " ").trim();
      const code = cm[1] + cm[2];
      last = { code, title: title || (last && last.code === code ? last.title : ""), sec: sec || (last && last.code === code ? last.sec : "") };
    }
    if (!last) continue;

    if (initial && (facName || email)) {
      const prev = faculty.get(initial) || {};
      faculty.set(initial, { init: initial, name: facName && !/@/.test(facName) ? titleCase(facName) : prev.name || "", email: email || prev.email || "" });
    }
    const row = { code: last.code, title: last.title, sec: last.sec, days, start, end, room, faculty: initial, lab: isLab };
    if (rowSem === undefined) rowSem = sem;
    if (offeredMode) {
      if (seatsM) { row.enrolled = Number(seatsM[1]); row.capacity = Number(seatsM[2]); }
      offered.push(row);
    } else routine.push(row);
  }

  // The page's semester: the heading above its class rows (Class Schedule's selected
  // semester), else the first one mentioned (Advising Slip: "ID# … Fall-2026").
  const pageSem = rowSem || (routine.length || offered.length || payments.schedule.length ? normSemester(T) : "");
  return { sem: pageSem, profile, rules, payments, degree, routine, offered, grades, recommended, faculty: [...faculty.values()] };
}

/* Combines the results of several pages (e.g. everything the extension captured).
   Class Schedule and Advising Slip list the same classes, so rows are de-duplicated,
   and when pages from different semesters are present the running semester wins. */
export function mergeParsed(list, today = new Date()) {
  const out = { sem: "", offeredSem: "", profile: {}, rules: {}, payments: { schedule: [], fees: {} }, degree: [], routine: [], offered: [], grades: [], recommended: [], faculty: [] };
  const newest = (sems) => sems.filter(Boolean).sort((a, b) => semesterKey(b) - semesterKey(a))[0] || "";
  const fromSem = (rs, s) => rs.filter((r) => (r.sem || "") === s || (!r.sem && !rs.some((x) => x.sem)));
  const dedupe = (rows, key) => {
    const m = new Map();
    rows.forEach((r) => { const k = key(r), o = m.get(k); m.set(k, o ? { ...o, ...Object.fromEntries(Object.entries(r).filter(([, v]) => v !== "" && v !== undefined)) } : { ...r }); });
    return [...m.values()];
  };
  const slot = (r) => [r.code, r.sec, r.days, r.start, r.end, r.lab ? "L" : ""].join("|");

  const withRoutine = list.filter((r) => r.routine?.length);
  const sems = withRoutine.map((r) => r.sem);
  out.sem = sems.includes(currentSemester(today)) ? currentSemester(today) : newest(sems);
  out.routine = dedupe(fromSem(withRoutine, out.sem).flatMap((r) => r.routine), slot);
  const withOffered = list.filter((r) => r.offered?.length);
  out.offeredSem = newest(withOffered.map((r) => r.sem));
  out.offered = dedupe(fromSem(withOffered, out.offeredSem).flatMap((r) => r.offered), slot);

  for (const r of list) {
    const program = [out.profile.program, r.profile?.program].filter(Boolean).sort((a, b) => b.length - a.length)[0]; // "B.Sc. in …" beats "CSE"
    Object.assign(out.profile, r.profile, program && { program }); Object.assign(out.rules, r.rules);
    if (r.payments?.schedule?.length) out.payments = { ...r.payments, semester: r.sem || "" };
    if (r.degree?.length) out.degree = r.degree;
    out.grades.push(...(r.grades || [])); out.recommended.push(...(r.recommended || [])); out.faculty.push(...(r.faculty || []));
  }
  // Degree Review repeats Grade Report rows without a semester; keep the dated copy.
  const dated = new Set(out.grades.filter((g) => g.sem).map((g) => g.code));
  out.grades = dedupe(out.grades.filter((g) => g.sem || !dated.has(g.code)), (g) => g.code + "|" + g.sem);
  out.recommended = dedupe(out.recommended, (r) => r.code);
  out.faculty = dedupe(out.faculty, (f) => f.init);
  return out;
}

function titleCase(s) {
  return s.toLowerCase().replace(/\b([a-z])/g, (c) => c.toUpperCase()).replace(/\b(Dr|Mr|Ms|Mrs|Prof)\b\.?/g, "$1.").replace(/\.\./g, ".");
}

/* Offered rows → planner structure { CODE: { title, cr, sections:[...] } } */
export function offeredToPlanner(rows, existing = {}) {
  const O = {};
  for (const r of rows) {
    const c = O[r.code] = O[r.code] || { title: existing[r.code]?.title || r.title || r.code, cr: existing[r.code]?.cr || 3, sections: [] };
    const sec = r.sec || String(c.sections.length + 1);
    const ex = c.sections.find((s) => s.sec === sec);
    if (ex) { if (!ex.lab && (r.lab || ex.days !== r.days)) ex.lab = { days: r.days, start: r.start, end: r.end, room: r.room }; continue; }
    c.sections.push({ sec, days: r.days, start: r.start, end: r.end, room: r.room, faculty: r.faculty,
      seats: r.capacity !== undefined ? Math.max(0, r.capacity - r.enrolled) : undefined, capacity: r.capacity });
  }
  return O;
}
