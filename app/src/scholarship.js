/* EWU undergraduate scholarship rules (www.ewubd.edu/scholarships-financial-aid, read Oct 2026) and the maths for
   "what do I need". Pure: unit-tested; the screen is in ui-scholar.js. Always point students to the official page. */
export const SOURCE = "https://www.ewubd.edu/scholarships-financial-aid";

// Program → total credits (current curriculum). A quarter of it must be completed in the past year for merit awards.
export const PROGRAM_CREDITS = { CSE: 140, ICE: 140, EEE: 140, "B.Pharm": 158, Mathematics: 130, DSA: 130, "Information Studies": 123, Economics: 130, English: 130, PPHS: 130, "LL.B": 130, CE: 145, BBA: 130, Sociology: 130, GEB: 140 };

const TERM = { spring: 0, summer: 1, fall: 2 };
const semKey = (s) => { const m = String(s || "").match(/(spring|summer|fall)\W*(\d{4})|(\d{4})\W*(spring|summer|fall)/i); return m ? Number(m[2] || m[3]) * 3 + TERM[(m[1] || m[4]).toLowerCase()] : 0; };
// Students admitted in Spring 2026 or later have the newer, higher bands.
export const newCohort = (admitted) => semKey(admitted) >= semKey("Spring-2026");

export function bands(admitted) {
  const n = newCohort(admitted);
  return [
    { id: "merit", name: "Merit scholarship (100% tuition)", min: n ? 3.95 : 3.9, max: 4, value: "Full tuition for the credits you earned, over the next 3 semesters", note: "Top 10% of your department's batch. If 6 or fewer qualify, only the top student." },
    { id: "deans", name: "Dean's List scholarship", min: n ? 3.85 : 3.75, max: n ? 3.94 : 3.89, value: n ? "Tk 60,000" : "Tk 55,000", note: "Adjusted over the next year." },
    { id: "medha", name: "Medha Lalon scholarship", min: n ? 3.75 : 3.5, max: n ? 3.84 : 3.74, value: n ? "Tk 51,000" : "Tk 45,000", note: "Adjusted over the next year." },
    { id: "aid", name: "Financial assistance (need-based)", min: n ? 2.7 : 2.6, max: 4, value: "Partial tuition waiver", note: "Apply with the form at the start of each semester. Needs 9 credits last semester (B.Pharm/LL.B: 12)." }
  ];
}

/* Term GPA needed over the next `credits` to reach `target` CGPA. > 4 means not possible in that many credits. */
export function neededGpa(cgpa, done, target, credits) {
  if (!credits) return Infinity;
  return (target * (done + credits) - cgpa * done) / credits;
}
/* Credits of straight A+ (4.00) needed to lift the CGPA to `target`. */
export const creditsAtFour = (cgpa, done, target) => (target >= 4 ? Infinity : Math.max(0, Math.ceil((done * (target - cgpa)) / (4 - target))));

/* Where a student stands. grades: [{ code, cr, g, sem }], cgpa from the app's own calculation. */
export function assess({ cgpa, credits, grades = [], admitted = "", program = "CSE" }) {
  const total = PROGRAM_CREDITS[program] || 140, quarter = Math.ceil(total / 4 - 0.5);
  const sems = [...new Set(grades.map((g) => g.sem).filter(Boolean))].sort((a, b) => semKey(a) - semKey(b)), lastYear = new Set(sems.slice(-3));
  const yearCredits = grades.filter((g) => lastYear.has(g.sem) && g.g && !["F", "W", "I", "U", "R"].includes(g.g)).reduce((a, g) => a + Number(g.cr || 0), 0);
  const seen = new Map(); let retake = false;
  for (const g of grades) { if (seen.has(g.code) && seen.get(g.code) !== g.sem) retake = true; seen.set(g.code, g.sem); }
  const list = bands(admitted).map((b) => ({ ...b, eligible: cgpa >= b.min && (b.id === "aid" || yearCredits >= quarter) && !retake, inBand: cgpa >= b.min && cgpa <= b.max + 0.0001 }));
  const current = list.find((b) => b.id !== "aid" && b.inBand) || (cgpa >= list[3].min ? list[3] : null);
  const next = list.filter((b) => b.id !== "aid" && b.min > cgpa).sort((a, b) => a.min - b.min)[0] || null;
  return { cgpa, credits, yearCredits, quarter, total, retake, list, current, next, newCohort: newCohort(admitted) };
}
