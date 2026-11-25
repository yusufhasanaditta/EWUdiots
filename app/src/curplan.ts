/* EWU curriculum vs the student's record (pure, no DOM; tested in tests/curplan.test.ts).
   - official: EWU's semester-by-semester plan (the department's course flowchart, or one derived from the synced
     curriculum's prerequisites when the department publishes none), with each course's status for this student.
   - updated: the plan rebuilt from the student's real record. Finished and current semesters show what they took; every
     course still owed (never taken, failed, withdrawn or dropped) is placed again in a later semester, after its
     prerequisites, no earlier than EWU schedules it, within the credit limit.
   - edited: the student's own changes on top (courses moved between future semesters). Done and current courses never move. */

export interface Course { code: string; title?: string; cr?: number | string; prereq?: string[] }
export interface OfficialSem { n: number; courses: Course[] }
export interface Grade { code: string; sem?: string; g?: string; cr?: number | string; title?: string }
export type Status = "done" | "now" | "retake" | "behind" | "later";
/** One course (or an elective slot) of the official plan, with where it stands. */
export interface Item {
  id: string; code: string; title: string; cr: number; prereq: string[]; needs: string[]; n: number; slot: boolean;
  status: Status; g?: string; takenIn?: string; filledBy?: string; attempts: number;
}
export interface PlanSem { sem: string; no: number; state: "done" | "now" | "next"; items: Item[]; credits: number }
export interface Input {
  official: OfficialSem[]; grades?: Grade[]; current?: string[]; dropped?: { code: string; sem?: string }[];
  firstSem: string; curSem: string; maxCredits?: number;
}

import { isPass } from "./degreeplan.js";

const TERMS = ["Spring", "Summer", "Fall"];
export const PASS = (g?: string): boolean => isPass(g);
/** "CSE400#2" (the second part of a repeated course) → "CSE400". */
export const baseCode = (id: string): string => id.replace(/#\d+$/, "");
const semKey = (s = ""): number => { const m = String(s).match(/(Spring|Summer|Fall)[-\s]+(\d{4})/i); return m ? Number(m[2]) * 3 + TERMS.indexOf(m[1]) : 0; };
export const nextSem = (s: string): string => { const k = semKey(s) + 1; return k > 1 ? `${TERMS[k % 3]}-${Math.floor(k / 3)}` : ""; };
/** Semester number of `sem` counted from the student's first semester (first = 1). */
export const semNo = (first: string, sem: string): number => semKey(sem) - semKey(first) + 1;
export const semAt = (first: string, no: number): string => { const k = semKey(first) + no - 1; return `${TERMS[k % 3]}-${Math.floor(k / 3)}`; };

/** The first semester from the student ID ("2025-1-60-…" = Spring 2025), else the earliest graded semester. */
export function firstSemOf(id = "", sems: string[] = [], fallback = ""): string {
  const m = String(id).match(/^(\d{4})-([123])-/);
  const all = [...(m ? [`${TERMS[Number(m[2]) - 1]}-${m[1]}`] : []), ...sems.filter((s) => semKey(s))].sort((a, b) => semKey(a) - semKey(b));
  return all[0] || fallback;
}

/** No flowchart: derive EWU-like semesters from the curriculum's prerequisites (each course one term after its
    prerequisites, at most `per` credits a term). */
export function deriveOfficial(curriculum: Course[] = [], per = 15): OfficialSem[] {
  const known = new Set(curriculum.map((c) => c.code)), at = new Map<string, number>(), out: OfficialSem[] = [];
  let todo = curriculum.slice();
  for (let n = 1; todo.length && n <= 24; n++) {
    const sem: OfficialSem = { n, courses: [] }; let cr = 0;
    for (const c of todo) {
      const ok = (c.prereq || []).every((p) => !known.has(p) || (at.has(p) && (at.get(p) as number) < n));
      if (ok && (cr + (Number(c.cr) || 0) <= per + 0.01 || !sem.courses.length)) { sem.courses.push(c); cr += Number(c.cr) || 0; }
    }
    sem.courses.forEach((c) => at.set(c.code, n));
    todo = todo.filter((c) => !sem.courses.includes(c));
    if (sem.courses.length) out.push(sem);
  }
  return out;
}

/** The official plan with this student's status for every course. */
export function officialStatus({ official, grades = [], current = [], dropped = [], firstSem, curSem }: Input): Item[] {
  const curNo = semNo(firstSem, curSem), cur = new Set(current), seen = new Map<string, number>();
  const codes = new Set(official.flatMap((s) => s.courses.map((c) => c.code)).filter(Boolean));
  // Every course's attempts in semester order, grouped once.
  const sorted = [...grades].sort((a, b) => semKey(a.sem) - semKey(b.sem)), rowsOf = new Map<string, Grade[]>();
  for (const g of sorted) { if (!rowsOf.has(g.code)) rowsOf.set(g.code, []); (rowsOf.get(g.code) as Grade[]).push(g); }
  const byCode = (code: string): Grade[] => rowsOf.get(code) || [];
  const gone = new Set(dropped.map((d) => d.code));
  // Elective slots are filled, in order, by passed or current courses that aren't in the official list.
  const extras = [...new Set([...sorted.filter((g) => PASS(g.g)).map((g) => g.code), ...current].filter((c) => !codes.has(c)))];
  const items: Item[] = [];
  for (const s of [...official].sort((a, b) => a.n - b.n)) for (const c of s.courses) {
    const slot = !c.code, k = slot ? 0 : (seen.get(c.code) || 0); if (!slot) seen.set(c.code, k + 1);
    const id = slot ? `slot:${c.title}` : k ? `${c.code}#${k + 1}` : c.code;
    const prereq = [...new Set([...(c.prereq || []), ...(k ? [k > 1 ? `${c.code}#${k}` : c.code] : [])])];
    const base = { id, code: c.code || "", title: c.title || c.code, cr: Number(c.cr) || 0, n: s.n, slot, prereq,
      needs: [...new Set(prereq.map(baseCode))].filter((p) => p !== c.code) };
    let status: Status, g: string | undefined, takenIn: string | undefined, filledBy: string | undefined, attempts = 0;
    if (slot) {
      filledBy = extras.shift();
      const fg = filledBy ? byCode(filledBy).filter((x) => PASS(x.g)).pop() : undefined;
      status = fg ? "done" : filledBy && cur.has(filledBy) ? "now" : s.n < curNo ? "behind" : "later";
      g = fg?.g; takenIn = fg?.sem;
    } else {
      const rows = byCode(c.code), passes = rows.filter((x) => PASS(x.g)), mine = passes[k], last = rows.at(-1);
      attempts = rows.length;
      const owed = passes.length === k; // every earlier part passed, this one not yet
      if (mine) { status = "done"; g = mine.g; takenIn = mine.sem; }
      else if (owed && cur.has(c.code)) status = "now";
      else if (owed && ((last && !PASS(last.g)) || gone.has(c.code))) { status = "retake"; g = last?.g || "Dropped"; takenIn = last?.sem; }
      else status = s.n < curNo ? "behind" : "later";
    }
    items.push({ ...base, status, g, takenIn, filledBy, attempts });
  }
  return items;
}

/** The plan rebuilt from the student's record: [done semesters…, this semester, future semesters with every course
    still owed]. Done semesters list the official items finished there (by the semester they were passed). */
export function updatedPlan(input: Input, items: Item[] = officialStatus(input)): PlanSem[] {
  const { firstSem, curSem, maxCredits = 15 } = input;
  const curNo = Math.max(1, semNo(firstSem, curSem));
  const sum = (l: Item[]) => l.reduce((a, c) => a + c.cr, 0);
  const out: PlanSem[] = [];
  for (let no = 1; no < curNo; no++) {
    const sem = semAt(firstSem, no), l = items.filter((i) => i.status === "done" && i.takenIn === sem);
    out.push({ sem, no, state: "done", items: l, credits: sum(l) });
  }
  // Passed before the first counted semester (transfer credit, or an ID-less record): shown with the first semester.
  const at = (i: Item) => (i.takenIn ? semNo(firstSem, i.takenIn) : 0);
  const early = items.filter((i) => i.status === "done" && (at(i) < 1 || (at(i) >= curNo && i.takenIn !== curSem)));
  if (early.length && out[0]) { out[0].items.push(...early); out[0].credits = sum(out[0].items); }
  // This semester: courses being taken, plus any whose grade for this semester is already out.
  const earlySet = new Set(early);
  const now = items.filter((i) => i.status === "now" || (i.status === "done" && (i.takenIn === curSem || (earlySet.has(i) && !out[0]))));
  out.push({ sem: curSem, no: curNo, state: "now", items: now, credits: sum(now) });
  const placed = new Map<string, number>(); // id → semester number
  items.filter((i) => i.status === "done" || i.status === "now").forEach((i) => placed.set(i.id, i.status === "done" ? 0 : curNo));
  const ids = new Set(items.map((i) => i.id)), owed = items.filter((i) => !placed.has(i.id));
  const deps = new Map<string, number>();
  owed.forEach((x) => x.prereq.forEach((p) => deps.set(p, (deps.get(p) || 0) + 1)));
  const dependants = (id: string): number => deps.get(id) || 0;
  // Courses still owed: retakes and catch-ups first (ASAP), then each at its official semester or later.
  let todo = owed.slice().sort((a, b) => a.n - b.n || dependants(b.id) - dependants(a.id) || a.id.localeCompare(b.id));
  const future: PlanSem[] = [];
  for (let no = curNo + 1; todo.length && no <= curNo + 30; no++) {
    const take: Item[] = []; let cr = 0;
    const ready = (c: Item) => c.n <= no && c.prereq.every((p) => !ids.has(p) || ((placed.get(p) ?? Infinity) < no));
    for (const c of todo) if (ready(c) && cr + c.cr <= maxCredits + 0.01) { take.push(c); cr += c.cr; }
    // A single course bigger than the limit still gets a semester of its own.
    if (!take.length) { const big = todo.find(ready); if (big) { take.push(big); cr = big.cr; } }
    take.forEach((c) => placed.set(c.id, no));
    const taken = new Set(take);
    todo = todo.filter((c) => !taken.has(c));
    future.push({ sem: semAt(firstSem, no), no, state: "next", items: take, credits: cr });
  }
  if (todo.length) { const no = curNo + future.length + 1; future.push({ sem: semAt(firstSem, no), no, state: "next", items: todo, credits: sum(todo) }); }
  while (future.length && !future.at(-1)?.items.length) future.pop();
  return [...out, ...future];
}

/** The student's edit on top of the updated plan. `edit` = { "Fall-2027": [ids] } for future semesters. Items the
    edit doesn't mention keep their updated place; ids that are done, current or gone are ignored. One empty semester
    is added at the end so a course can be moved later than the plan's last semester. */
export function editedPlan(updated: PlanSem[], edit: Record<string, string[]> = {}, extra = 1): PlanSem[] {
  const fixed = updated.filter((s) => s.state !== "next"), future = updated.filter((s) => s.state === "next");
  const movable = new Map(future.flatMap((s) => s.items.map((i) => [i.id, i] as const)));
  const first = semAt(updated[0].sem, 2 - updated[0].no), lastFixed = fixed.at(-1)?.no ?? 0;
  const target = new Map<string, string>();
  for (const [sem, list] of Object.entries(edit)) if (semNo(first, sem) > lastFixed) for (const id of list) if (movable.has(id)) target.set(id, sem);
  const sems = new Map<string, Item[]>();
  future.forEach((s) => sems.set(s.sem, []));
  for (const s of future) for (const i of s.items) { const t = target.get(i.id) || s.sem; if (!sems.has(t)) sems.set(t, []); (sems.get(t) as Item[]).push(i); }
  const end = [...sems.keys()].sort((a, b) => semKey(a) - semKey(b)).at(-1) || "";
  // Every semester from the next one to the last used (no gaps), then `extra` empty ones to move courses into.
  const list: string[] = [];
  for (let x = semAt(first, lastFixed + 1); semKey(x) <= semKey(end); x = nextSem(x)) list.push(x);
  while (list.length && !(sems.get(list.at(-1) as string) || []).length) list.pop();
  for (let k = 0; k < extra; k++) list.push(list.length ? nextSem(list.at(-1) as string) : semAt(first, lastFixed + 1));
  return [...fixed, ...list.map((sem) => { const items = sems.get(sem) || []; return { sem, no: semNo(first, sem), state: "next" as const, items, credits: items.reduce((a, c) => a + c.cr, 0) }; })];
}

/** Problems in a plan: a course placed before (or with) its prerequisite, a semester over the credit limit or under the
    minimum. → { [id]: "Needs CSE110 first" } and { [sem]: "18 credits: over the 15-credit limit" } */
export function checkPlan(plan: PlanSem[], { min = 9, max = 15 } = {}): { items: Record<string, string>; sems: Record<string, string> } {
  const when = new Map<string, number>();
  plan.forEach((s, i) => s.items.forEach((it) => when.set(it.id, s.state === "next" ? i : -1)));
  const items: Record<string, string> = {}, sems: Record<string, string> = {};
  plan.forEach((s, i) => {
    if (s.state !== "next") return;
    for (const it of s.items) {
      const late = it.prereq.filter((p) => when.has(p) && (when.get(p) as number) >= i).map(baseCode);
      if (late.length) items[it.id] = `Needs ${[...new Set(late)].join(", ")} first`;
    }
    if (s.credits > max + 0.01) sems[s.sem] = `${s.credits} credits: over the ${max}-credit limit`;
    else if (s.credits && s.credits < min - 0.01) sems[s.sem] = `${s.credits} credits: under the ${min}-credit minimum`;
  });
  return { items, sems };
}

/** Move one course in the edited plan → the new edit (a full snapshot of every future semester). */
export function moveItem(plan: PlanSem[], id: string, toSem: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const s of plan) if (s.state === "next") out[s.sem] = s.items.map((i) => i.id).filter((x) => x !== id);
  if (plan.some((s) => s.state === "next" && s.items.some((i) => i.id === id))) (out[toSem] ||= []).push(id);
  return Object.fromEntries(Object.entries(out).filter(([, l]) => l.length));
}
