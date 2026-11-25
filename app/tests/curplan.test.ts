// Curriculum plans: EWU's plan with the student's status, the rebuilt plan after a failed/dropped course, and edits.
import { test } from "node:test";
import assert from "node:assert/strict";
import { officialStatus, updatedPlan, editedPlan, checkPlan, moveItem, deriveOfficial, firstSemOf, semNo, semAt, altCode } from "../src/curplan.ts";

// A made-up 4-semester program.
const official = [
  { n: 1, courses: [{ code: "ENG101", cr: 3 }, { code: "MAT101", cr: 3 }, { code: "CSE103", cr: 4.5 }] },
  { n: 2, courses: [{ code: "ENG102", cr: 3, prereq: ["ENG101"] }, { code: "CSE106", cr: 3, prereq: ["CSE103"] }] },
  { n: 3, courses: [{ code: "CSE110", cr: 4.5, prereq: ["CSE106"] }, { code: "", title: "Elective General Education-I", cr: 3 }, { code: "CSE400", cr: 1 }] },
  { n: 4, courses: [{ code: "CSE207", cr: 4, prereq: ["CSE110"] }, { code: "CSE400", cr: 2 }] }
];
const base = { official, firstSem: "Spring-2026", curSem: "Fall-2026" };

test("semester numbers count from the first semester", () => {
  assert.equal(firstSemOf("2026-1-60-000", ["Summer-2026"]), "Spring-2026");
  assert.equal(firstSemOf("", ["Fall-2026", "Summer-2026"]), "Summer-2026");
  assert.equal(semNo("Spring-2026", "Fall-2026"), 3);
  assert.equal(semAt("Spring-2026", 4), "Spring-2027");
});

test("official plan shows done, retake (failed or dropped), now, behind and filled elective slots", () => {
  const items = officialStatus({ ...base,
    grades: [{ code: "ENG101", sem: "Spring-2026", g: "A" }, { code: "MAT101", sem: "Spring-2026", g: "B" }, { code: "CSE103", sem: "Spring-2026", g: "F" }, { code: "HIS101", sem: "Summer-2026", g: "A-" }],
    current: ["CSE103"], dropped: [{ code: "ENG102", sem: "Summer-2026" }] });
  const by = Object.fromEntries(items.map((i) => [i.id, i]));
  assert.equal(by.ENG101.status, "done");
  assert.equal(by.CSE103.status, "now"); // failed, retaking now
  assert.equal(by.ENG102.status, "retake"); // dropped
  assert.equal(by.CSE106.status, "behind"); // semester 2 passed without it
  assert.equal(by["slot:Elective General Education-I"].filledBy, "HIS101");
  assert.equal(by["slot:Elective General Education-I"].status, "done");
  assert.equal(by.CSE110.status, "later");
  assert.deepEqual(by["CSE400#2"].prereq, ["CSE400"]); // a repeated code (capstone parts) needs the earlier part
});

test("updated plan places every course still owed after its prerequisites, within the credit limit", () => {
  const plan = updatedPlan({ ...base, grades: [{ code: "ENG101", sem: "Spring-2026", g: "A" }, { code: "MAT101", sem: "Spring-2026", g: "B" }, { code: "CSE103", sem: "Spring-2026", g: "F" }], current: ["CSE103"], maxCredits: 9 });
  assert.deepEqual(plan.map((s) => [s.sem, s.state]), [["Spring-2026", "done"], ["Summer-2026", "done"], ["Fall-2026", "now"], ["Spring-2027", "next"], ["Summer-2027", "next"], ["Fall-2027", "next"]]);
  assert.deepEqual(plan[0].items.map((i) => i.id), ["ENG101", "MAT101"]);
  assert.deepEqual(plan[2].items.map((i) => i.id), ["CSE103"]);
  const where = Object.fromEntries(plan.flatMap((s) => s.items.map((i) => [i.id, s.sem])));
  assert.equal(where.CSE106, "Spring-2027"); // after CSE103 (now)
  assert.equal(where.CSE110, "Summer-2027"); // after CSE106
  assert.equal(where.CSE207, "Fall-2027");
  assert.ok(plan.every((s) => s.state !== "next" || s.credits <= 9));
  assert.deepEqual(checkPlan(plan, { max: 9 }).items, {});
});

test("edits move a course; done and current courses never move; problems are flagged", () => {
  const up = updatedPlan({ ...base, grades: [{ code: "ENG101", sem: "Spring-2026", g: "A" }, { code: "MAT101", sem: "Spring-2026", g: "B" }, { code: "CSE103", sem: "Spring-2026", g: "A" }, { code: "CSE106", sem: "Summer-2026", g: "A" }], current: ["ENG102"] });
  const target = up.find((s) => s.state === "next" && s.items.some((i) => i.id === "CSE110"));
  assert.ok(target);
  const later = editedPlan(up).at(-1); // the spare empty semester
  assert.equal(later?.items.length, 0);
  let edit = moveItem(editedPlan(up), "CSE110", later?.sem || "");
  let ed = editedPlan(up, edit);
  assert.equal(ed.find((s) => s.items.some((i) => i.id === "CSE110"))?.sem, later?.sem);
  assert.match(checkPlan(ed).items.CSE207 || "", /Needs CSE110 first/); // CSE207 now sits before its prerequisite
  assert.deepEqual(moveItem(ed, "ENG102", later?.sem || ""), edit); // current course: not movable
  edit = { ...edit, "Fall-2030": ["ENG101"] }; // done course in an edit is ignored
  ed = editedPlan(up, edit);
  assert.equal(ed.filter((s) => s.items.some((i) => i.id === "ENG101")).length, 1);
});

test("credit limits per semester", () => {
  const plan = [{ sem: "Spring-2027", no: 4, state: "next" as const, credits: 18, items: [] }, { sem: "Summer-2027", no: 5, state: "next" as const, credits: 4, items: [] }];
  assert.match(checkPlan(plan).sems["Spring-2027"], /over the 15-credit limit/);
  assert.match(checkPlan(plan).sems["Summer-2027"], /under the 9-credit minimum/);
});

test("derived plan without a flowchart follows prerequisites", () => {
  const d = deriveOfficial([{ code: "A101", cr: 3 }, { code: "A102", cr: 3, prereq: ["A101"] }, { code: "A201", cr: 3, prereq: ["A102"] }, { code: "B101", cr: 3 }]);
  assert.deepEqual(d.map((s) => s.courses.map((c) => c.code)), [["A101", "B101"], ["A102"], ["A201"]]);
});

test("a course taken under its new code (ENG7101) counts as the plan's ENG101, not an elective", () => {
  assert.equal(altCode("ENG7101"), "ENG101");
  assert.equal(altCode("GEN226"), "GEN7226");
  const items = officialStatus({ ...base, grades: [{ code: "ENG7101", sem: "Spring-2026", g: "A" }], current: ["MAT7101"] });
  const by = Object.fromEntries(items.map((i) => [i.id, i]));
  assert.equal(by.ENG101.status, "done");
  assert.equal(by.MAT101.status, "now");
  assert.ok(items.filter((i) => i.slot).every((i) => !i.filledBy));
});
