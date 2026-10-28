// EWU scholarship bands and the "what do I need" maths.
import { test } from "node:test";
import assert from "node:assert/strict";
import { assess, neededGpa, creditsAtFour, newCohort } from "../src/scholarship.js";

const grades = (n, g = "A", sems = ["Spring-2026", "Summer-2026", "Fall-2026"]) => Array.from({ length: n }, (_, i) => ({ code: `CSE${100 + i}`, cr: 3, g, sem: sems[i % sems.length] }));

test("cohorts: Spring 2026 onward has the newer bands", () => {
  assert.equal(newCohort("Fall-2025"), false); assert.equal(newCohort("Spring-2026"), true); assert.equal(newCohort("Summer-2026"), true);
});
test("Dean's List band with enough credits in the past year", () => {
  const a = assess({ cgpa: 3.8, credits: 36, grades: grades(12), admitted: "Fall-2024", program: "CSE" });
  assert.equal(a.current.id, "deans"); assert.equal(a.quarter, 35); assert.equal(a.yearCredits, 36); assert.equal(a.next.id, "merit");
});
test("a retake makes a student ineligible", () => {
  const g = grades(12); g.push({ code: "CSE100", cr: 3, g: "A+", sem: "Fall-2026" });
  assert.equal(assess({ cgpa: 3.95, credits: 39, grades: g, admitted: "Fall-2024" }).retake, true);
});
test("term GPA needed and credits of A+ needed", () => {
  assert.equal(neededGpa(3.5, 30, 3.75, 12).toFixed(3), "4.375");
  assert.equal(creditsAtFour(3.5, 30, 3.75), 30);
  assert.ok(neededGpa(3.9, 30, 3.75, 12) < 3.75);
});
