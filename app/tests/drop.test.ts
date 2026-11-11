// Dropping a course: refund steps from the academic calendar and what a drop changes (fictional data).
import { test } from "node:test";
import assert from "node:assert/strict";
import { dropTiers, dropWindow, dropImpact } from "../src/drop.ts";

const EVENTS = [
  { start: "2026-11-26", end: "", title: "Last day of Withdrawal of Course(s)/Semester" },
  { start: "2026-09-23", end: "", title: "Last day to Drop Course(s)/Semester with 100% Refund" },
  { start: "2026-11-19", end: "", title: "Last Day to Drop Course(s)/Semester with 50% Refund" },
  { start: "2026-10-01", end: "", title: "Last day to Drop Course(s)/Semester with 85% Refund" },
  { start: "2026-09-13", end: "", title: "First Day of Classes" }
];

test("reads the refund steps in date order", () => {
  const t = dropTiers(EVENTS);
  assert.deepEqual(t.map((x) => [x.until, x.refund, x.grade]), [["2026-09-23", 100, ""], ["2026-10-01", 85, ""], ["2026-11-19", 50, ""], ["2026-11-26", 0, "W"]]);
});

test("finds the step in force today", () => {
  const t = dropTiers(EVENTS);
  assert.equal(dropWindow(t, "2026-09-01").tier?.refund, 100);
  const w = dropWindow(t, "2026-11-10");
  assert.equal(w.tier?.refund, 50); assert.equal(w.daysLeft, 9); assert.equal(w.next?.grade, "W");
  assert.equal(dropWindow(t, "2026-11-19").tier?.refund, 50); // the last day still counts
  assert.equal(dropWindow(t, "2026-11-20").tier?.grade, "W");
  assert.equal(dropWindow(t, "2026-12-01").closed, true);
  assert.equal(dropWindow([], "2026-12-01").closed, false); // no calendar yet: unknown, not closed
});

test("works out refund, credits, minimum load and knock-on courses", () => {
  const courses = [{ code: "ABC201", cr: 4 }, { code: "ABC202", cr: 3 }, { code: "XYZ101", cr: 3 }, { code: "XYZ102", cr: 3 }];
  const i = dropImpact({ code: "ABC201", courses, tier: { refund: 50, grade: "" }, fees: { tuition: 65000 }, rules: { minCredit: 10 },
    curriculum: [{ code: "ABC301", prereq: ["ABC201"] }, { code: "ABC302", prereq: ["XYZ101"] }], creditsLeft: 30, perSem: 15 });
  assert.equal(i.amount, 10000); // 65000 × 4/13 × 50%
  assert.deepEqual(i.credits, { before: 13, after: 9 });
  assert.equal(i.belowMin, 10);
  assert.equal(i.delay, 1); // 34 credits at 15 a semester: 3 semesters instead of 2
  assert.deepEqual(i.unlocks, ["ABC301"]);
  const w = dropImpact({ code: "XYZ101", courses, tier: { refund: 0, grade: "W" } });
  assert.equal(w.grade, "W"); assert.equal(w.amount, null); assert.equal(w.belowMin, 0);
});
