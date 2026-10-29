// Degree plan: done / left / ready / locked and a road map that respects prerequisites (fictional curriculum).
import { test } from "node:test";
import assert from "node:assert/strict";
import { degreeStatus, roadmap, nextSem } from "../src/degreeplan.js";

const CUR = [
  { code: "CSE103", title: "Structured Programming", cr: 4.5, prereq: [] },
  { code: "CSE106", title: "Discrete Mathematics", cr: 3, prereq: [] },
  { code: "CSE110", title: "Object Oriented Programming", cr: 4.5, prereq: ["CSE103"] },
  { code: "CSE207", title: "Data Structures", cr: 4, prereq: ["CSE110", "CSE106"] },
  { code: "CSE246", title: "Algorithms", cr: 4, prereq: ["CSE207"] },
  { code: "MAT101", title: "Calculus", cr: 3, prereq: [] },
  { code: "MAT102", title: "Differential Equations", cr: 3, prereq: ["MAT101"] },
  { code: "ENG101", title: "English", cr: 3, prereq: [] }
];
const GRADES = [{ code: "CSE103", cr: 4.5, g: "B+", sem: "Summer-2026" }, { code: "MAT101", cr: 3, g: "F", sem: "Spring-2026" }, { code: "MAT101", cr: 3, g: "B", sem: "Summer-2026" }];

test("semesters run Spring → Summer → Fall → Spring", () => {
  assert.equal(nextSem("Fall-2026"), "Spring-2027");
  assert.equal(nextSem("Spring-2027"), "Summer-2027");
});

test("done, left, ready and locked (latest grade counts; current courses unlock their dependants)", () => {
  const s = degreeStatus(CUR, GRADES, ["CSE106"]);
  assert.deepEqual(s.done.map((g) => g.code).sort(), ["CSE103", "MAT101"]);
  assert.deepEqual(s.left.map((c) => c.code).sort(), ["CSE110", "CSE207", "CSE246", "ENG101", "MAT102"]);
  assert.deepEqual(s.ready.map((c) => c.code).sort(), ["CSE110", "ENG101", "MAT102"]);
  assert.deepEqual(s.locked.find((c) => c.code === "CSE207").needs, ["CSE110"]);
  assert.equal(s.credits.done, 7.5);
});

test("road map: prerequisites always in an earlier semester, credit cap kept", () => {
  const plan = roadmap(CUR, GRADES, ["CSE106"], "Spring-2027", { perSem: 8 });
  const when = Object.fromEntries(plan.flatMap((p, i) => p.courses.map((c) => [c.code, i])));
  assert.equal(Object.keys(when).length, 5);
  assert.ok(when.CSE110 < when.CSE207 && when.CSE207 < when.CSE246);
  assert.ok(plan.every((p) => p.credits <= 8));
  assert.equal(plan[0].sem, "Spring-2027");
  assert.ok(plan[0].courses.some((c) => c.code === "CSE110")); // the chain's start goes first
});

test("the advising planner's picks come first", () => {
  const plan = roadmap(CUR, GRADES, ["CSE106"], "Spring-2027", { perSem: 8, planned: ["ENG101"] });
  assert.ok(plan[0].courses.some((c) => c.code === "ENG101"));
});
