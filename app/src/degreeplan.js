/* Degree plan (pure; tested in tests/degreeplan.test.js): from the curriculum (portal → Curriculum), your grades and
   this semester's routine → what's done, what's left, what you can take next, and a semester-by-semester road map to
   graduation that respects prerequisites. EWU runs three semesters a year: Spring, Summer, Fall. */
import { normSemester, semesterKey } from "./parser.js";

const PASS = (g) => g && !["F", "W", "I", "U", "R"].includes(g);
export const nextSem = (sem) => { const m = normSemester(sem).match(/(\w+)-(\d{4})/); if (!m) return ""; const t = ["Spring", "Summer", "Fall"], i = t.indexOf(m[1]); return i === 2 ? `Spring-${Number(m[2]) + 1}` : `${t[i + 1]}-${m[2]}`; };

/* Latest attempt of each course (EWU counts the latest grade). */
export function latestGrades(grades = []) {
  const out = {};
  [...grades].sort((a, b) => semesterKey(a.sem) - semesterKey(b.sem)).forEach((g) => { out[g.code] = g; });
  return out;
}

/* → { done: [grade rows passed], current: [codes], left: [curriculum rows], ready: [...left whose prerequisites are done or
   being taken now], locked: [{ ...course, needs: [codes] }], credits: { done, current, left } } */
export function degreeStatus(curriculum = [], grades = [], currentCodes = []) {
  const latest = latestGrades(grades), done = Object.values(latest).filter((g) => PASS(g.g));
  const passed = new Set(done.map((g) => g.code)), cur = new Set(currentCodes);
  const left = curriculum.filter((c) => !passed.has(c.code) && !cur.has(c.code));
  const ok = (c) => (c.prereq || []).every((p) => passed.has(p) || cur.has(p) || !curriculum.some((x) => x.code === p));
  const ready = left.filter(ok), locked = left.filter((c) => !ok(c)).map((c) => ({ ...c, needs: c.prereq.filter((p) => !passed.has(p) && !cur.has(p)) }));
  const sum = (rows) => rows.reduce((a, c) => a + (Number(c.cr) || 0), 0);
  return { done, current: [...cur], left, ready, locked, credits: { done: sum(done), current: sum(curriculum.filter((c) => cur.has(c.code))), left: sum(left) } };
}

/* Road map: place every remaining course in the earliest semester where its prerequisites are done in an earlier
   semester, up to `perSem` credits a semester (core courses with many dependants first). → [{ sem, courses, credits }] */
export function roadmap(curriculum = [], grades = [], currentCodes = [], fromSem, { perSem = 15, planned = [] } = {}) {
  const st = degreeStatus(curriculum, grades, currentCodes);
  const doneBy = new Map(st.done.map((g) => [g.code, -1]));
  currentCodes.forEach((c) => doneBy.set(c, -1));
  const known = new Set(curriculum.map((c) => c.code));
  const dependants = (code) => curriculum.filter((c) => (c.prereq || []).includes(code)).length;
  let todo = st.left.slice().sort((a, b) => dependants(b.code) - dependants(a.code) || a.code.localeCompare(b.code));
  // The advising planner's picks go first, in the first semester.
  todo = [...todo.filter((c) => planned.includes(c.code)), ...todo.filter((c) => !planned.includes(c.code))];
  const out = [];
  let sem = fromSem;
  for (let i = 0; todo.length && i < 24; i++, sem = nextSem(sem)) {
    const take = [];
    let cr = 0;
    for (const c of todo) {
      const ready = (c.prereq || []).every((p) => !known.has(p) || (doneBy.has(p) && doneBy.get(p) < i));
      if (!ready || cr + (Number(c.cr) || 0) > perSem + 0.01) continue;
      take.push(c); cr += Number(c.cr) || 0;
    }
    if (!take.length) { if (todo.every((c) => (Number(c.cr) || 0) > perSem)) { take.push(todo[0]); cr = Number(todo[0].cr) || 0; } else { continue; } }
    take.forEach((c) => doneBy.set(c.code, i));
    todo = todo.filter((c) => !take.includes(c));
    out.push({ sem, courses: take, credits: cr });
  }
  return out;
}
