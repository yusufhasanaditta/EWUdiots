// Course outline reader. The sample follows the layout of an EWU outline's PDF text layer, with made-up people and numbers.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseOutline, normTime, importantDates } from "../src/outline.js";

const SAMPLE = `East West University
Course Outline
Department of Mathematics and Data Sciences
Semester: Fall 2026
Course Title: Differential Equations and Special Functions Course Code: MAT102
Pre-Requisite: MAT101 Credit Hour: 3
Course Instructor: Test Person, Lecturer, Dept. MDS
Office Room: Room# AB1-999 Phone Number: 01700000000
E-mail Address: test.person@example.edu
Class Schedule and Office Hour:
Day Course Code and Section Class Time and Room No. Office Hour
Sunday
MAT101(9)
11:50 AM – 01:20 PM
FUB-802
02.30 PM-04:30PM
(2 Hours)
Monday MAT102(7) 04.50 PM-6.20 PM
FUB-203
01:50 PM -4:20 PM
(2.5 Hours)
Tuesday
MAT102(8)
01:30 PM – 03:00 PM
AB3-902
10:00 AM-11:00 AM
(1 Hour)
Wednesday MAT102(7) 04.50 PM-6.20 PM
FUB-203
01:50 PM -4:20 PM
(2.5 Hours)
Course Outline
MAT102
Section: 7
Fall 2026
Page 1 of 5
Course Contents
1. Ordinary Differential Equations
Introduction to Differential Equations, First-Order Differential Equations, Modeling
with First-Order Differential Equations, Higher-Order Differential Equations.
2. Partial Differential Equations
Linear Partial Differential Equations of Order One, Partial Differential Equations and Fourier
series.
3. Special Functions
Bessel's Differential Equation and Bessel Functions, Legendre polynomials, Spherical Harmonics.
Course Rationale
The laws of nature are expressed as differential equations.
Course Objective
The objectives of the course are to
1. give knowledge which will allow the students to progress with further complicated
topics
2. give skills for the implementation of mathematical knowledge and expertise.
Course Learning Outcomes
On completion of this course, the student will be able to
1. understand of basic concepts of the differential equations.
2. solve differential equations as well as the systems of such equations.
Textbooks
1. A First Course in Differential Equations with Modeling Applications-Dennis G. Zill.
2. Ordinary and Partial Differential Equations: M. D. Raisinghania
Assessment Tools and Mark Distribution :
Mid Term Examination 25%
Final Examination 25%
Class Test (Quiz) 10%
Assignment 10%
Viva Voce 5%
Presentation 10%
Class Attendance 5%
Class Performance 5%
Short Quiz 5%
Total 100%
Grading Policy:
Score in 100 Letter Grade Grade Point
80% and above A+ 4.00
75% to less than 80% A 3.75
40% to less than 45% D 2.00
Less than 40% F 0.00
Examination Dates:
Midterm Exam Wednesday, 28 October 2026
Final Exam Monday, 14 December 2026
Important Dates
Date Day Event
September 13 Sunday First Day of Classes
September 13, 14,
15 Sun, Mon, Tue Adding of Courses
October 19–21 Monday–
Wednesday Holiday: Durgapuja
November 30 –
December 03 Monday–Thursday Online Advising of Courses for Spring 2027 (ongoing
students)
January 05 Tuesday University Reopens for Spring 2027
Special Instruction:
♣ Students are not allowed to enter into the classroom after 10 minutes of starting time.
♣ No make-up quizzes and assignment will be held.
(Test Person)
Date: 01-09-2026`;

test("reads the header of an outline", () => {
  const o = parseOutline(SAMPLE);
  assert.equal(o.code, "MAT102");
  assert.equal(o.title, "Differential Equations and Special Functions");
  assert.deepEqual(o.semester, { term: "Fall", year: 2026 });
  assert.equal(o.section, "7");
  assert.equal(o.credits, 3);
  assert.equal(o.prereq, "MAT101");
  assert.equal(o.instructor.name, "Test Person");
  assert.match(o.instructor.role, /Lecturer/);
  assert.equal(o.instructor.email, "test.person@example.edu");
  assert.equal(o.instructor.phone, "01700000000");
  assert.equal(o.instructor.office, "AB1-999");
});

test("finds this section's classes and the office hours", () => {
  const o = parseOutline(SAMPLE);
  assert.deepEqual(o.classes.map((c) => `${c.day} ${c.start}-${c.end} ${c.room}`), ["Monday 4:50 PM-6:20 PM FUB-203", "Wednesday 4:50 PM-6:20 PM FUB-203"]);
  assert.ok(o.officeHours.some((h) => h.day === "Monday" && h.start === "1:50 PM" && h.hours === 2.5));
});

test("course contents become units with topics", () => {
  const o = parseOutline(SAMPLE);
  assert.equal(o.units.length, 3);
  assert.equal(o.units[0].title, "Ordinary Differential Equations");
  assert.ok(o.units[0].topics.includes("Introduction to Differential Equations"));
  assert.ok(o.units[2].topics.some((t) => /Legendre/.test(t)));
});

test("lists, marks, grading and exams", () => {
  const o = parseOutline(SAMPLE);
  assert.equal(o.objectives.length, 2);
  assert.match(o.objectives[0], /further complicated topics/);
  assert.equal(o.outcomes.length, 2);
  assert.equal(o.textbooks.length, 2);
  assert.equal(o.assessment.reduce((s, a) => s + a.pct, 0), 100);
  assert.deepEqual(o.assessment[0], { name: "Mid Term Examination", pct: 25 });
  assert.deepEqual(o.grading[0], { range: "80% and above", letter: "A+", point: 4 });
  assert.equal(o.grading.at(-1).letter, "F");
  assert.deepEqual(o.exams, [{ name: "Mid-term", date: "2026-10-28" }, { name: "Final exam", date: "2026-12-14" }]);
  assert.equal(o.instructions.length, 2);
});

test("important dates, ranges across months and the next year", () => {
  const o = parseOutline(SAMPLE);
  const by = Object.fromEntries(o.dates.map((d) => [d.label.slice(0, 18), d]));
  assert.equal(by["First Day of Class"].date, "2026-09-13");
  assert.deepEqual([by["Adding of Courses"].date, by["Adding of Courses"].end], ["2026-09-13", "2026-09-15"]);
  assert.deepEqual([by["Holiday: Durgapuja"].date, by["Holiday: Durgapuja"].end], ["2026-10-19", "2026-10-21"]);
  assert.equal(by["Online Advising of"].end, "2026-12-03");
  assert.equal(by["University Reopens"].date, "2027-01-05");
  assert.equal(importantDates("", null).length, 0);
});

test("times", () => {
  assert.equal(normTime("04.50 PM"), "4:50 PM");
  assert.equal(normTime("6.20", "04.50 PM"), "6:20 PM");
  assert.equal(normTime("11:50 AM"), "11:50 AM");
});

test("an outline with almost nothing still parses", () => {
  const o = parseOutline("CSE110 lecture notes", { code: "CSE110", section: 3 });
  assert.equal(o.code, "CSE110");
  assert.deepEqual(o.units, []);
  assert.equal(o.instructor, null);
});

test("inline grading without grade points uses EWU's scale", async () => {
  const { grading } = await import("../src/outline.js");
  const g = grading("80 % and above - : A+ 60 % to less than 65 % : B 40 % to less than 45 % : D\nless than 40 % : F");
  assert.deepEqual(g.map((x) => `${x.letter}:${x.point}`), ["A+:4", "B:3", "D:2", "F:0"]);
});
