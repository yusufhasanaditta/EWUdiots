// Semester planning: days off, class sessions, attendance and long breaks (Fall 2026 dates from EWU's calendar).
import { test } from "node:test";
import assert from "node:assert/strict";
import { dayRules, classRange, sessionsOf, attendance, ifMissed, longBreaks, LETTER_DAY } from "../src/semplan.js";

const EVENTS = [
  { start: "2026-09-13", end: "", title: "First Day of Classes", kind: "classes" },
  { start: "2026-10-19", end: "2026-10-21", title: "Holiday: Durgapuja", kind: "holiday" },
  { start: "2026-10-22", end: "", title: "Holiday: Executive order by the Government", kind: "holiday" },
  { start: "2026-11-29", end: "", title: "Regular Tuesday Classes", kind: "other" },
  { start: "2026-12-10", end: "", title: "Last Day of Classes", kind: "classes" },
  { start: "2026-12-26", end: "2027-01-04", title: "Semester Break", kind: "break" }
];
const ROUTINE = [
  { code: "CSE106", days: "MW", start: "08:30", end: "10:00", room: "AB2-702" },
  { code: "ENG7101", days: "TR", start: "10:10", end: "11:40", room: "AB1-201" },
  { code: "CHE109", days: "S", start: "13:30", end: "15:30", room: "FUB-804", lab: true }
];
const rules = dayRules(EVENTS), range = classRange("Fall-2026", EVENTS);

test("holidays are off, with their name, and make-up days run another weekday", () => {
  assert.equal(rules.isOff("2026-10-20"), true);
  assert.equal(rules.offReason("2026-10-19"), "Durgapuja");
  assert.equal(rules.isOff("2026-10-18"), false);
  assert.equal(rules.runs("2026-11-29"), 2); // a Sunday that runs Tuesday's classes
  assert.equal(rules.runs("2026-11-30"), 1);
});

test("class range from the calendar, else the portal's dates, else a guess", () => {
  assert.deepEqual(range, { start: "2026-09-13", end: "2026-12-10", exact: true });
  assert.equal(classRange("Spring-2027", [], { "Spring-2027": { start: "2027-01-10", end: "2027-05-05" } }).start, "2027-01-10");
  assert.equal(classRange("Summer-2027").start, "2027-05-18");
});

test("sessions are numbered, and holidays are listed but not counted", () => {
  const s = sessionsOf(ROUTINE.filter((r) => r.code === "CSE106"), range, rules);
  const puja = s.filter((x) => x.off);
  assert.deepEqual(puja.map((x) => x.date), ["2026-10-19", "2026-10-21"]);
  assert.equal(puja[0].off, "Durgapuja");
  assert.equal(s[0].date, "2026-09-14");
  assert.equal(s[0].n, 1);
  const numbered = s.filter((x) => x.n);
  assert.equal(numbered[numbered.length - 1].n, numbered.length);
  // The make-up Sunday runs Tuesday: ENG7101 meets, the Sunday lab doesn't.
  assert.ok(sessionsOf([ROUTINE[1]], range, rules).some((x) => x.date === "2026-11-29"));
  assert.ok(!sessionsOf([ROUTINE[2]], range, rules).some((x) => x.date === "2026-11-29"));
});

test("attendance from per-class marks: cancelled classes don't count", () => {
  const s = sessionsOf([ROUTINE[0]], range, rules).filter((x) => !x.off);
  const marks = { [s[0].key]: "p", [s[1].key]: "a", [s[2].key]: "c", [s[3].key]: "p" };
  const st = attendance(sessionsOf([ROUTINE[0]], range, rules), marks, "2026-10-01", 0.7);
  assert.equal(st.present, 2);
  assert.equal(st.absent, 1);
  assert.equal(st.cancelled, 1);
  assert.equal(st.pct, 67);
  assert.equal(st.total, s.length - 1);
  assert.equal(st.maxAbsent, Math.floor(st.total * 0.3));
  assert.equal(st.canMiss, st.maxAbsent - 1);
  assert.equal(ifMissed(st, 0), Math.round((100 * (st.total - 1)) / st.total));
});

test("long breaks: skipping one class day joins the weekend and Durga Puja", () => {
  const byDay = (wd) => ROUTINE.filter((r) => [...r.days].some((c) => LETTER_DAY[c] === wd));
  const list = longBreaks(byDay, "2026-10-10", "2026-10-31", rules);
  const puja = list.find((b) => b.skip.includes("2026-10-18"));
  assert.ok(puja, JSON.stringify(list));
  assert.deepEqual([puja.from, puja.to, puja.days], ["2026-10-16", "2026-10-24", 9]);
  assert.deepEqual(puja.cost, [{ code: "CHE109", k: 1 }]);
  assert.ok(puja.why.includes("Durgapuja"));
  assert.equal(list[0], puja); // the best deal comes first
});
