// EWU academic calendar pages (saved from ewubd.edu): list, Fall 2026 events, final exam schedule, date ranges.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseCalendarList, parseCalendarPage, parseFinals, parseDateRange, kindOf } from "../src/acadcal.js";
const fx = (n) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url), "utf8");

test("calendar list: undergraduate calendars and final exam schedules only", () => {
  const l = parseCalendarList(fx("ewu-calendar-list.html")).filter((c) => c.sem === "Fall-2026");
  assert.deepEqual(l.map((c) => [c.slug, c.finals]), [["fall-2026", false], ["fall-2026-schedule-final-exam", true]]);
});

test("Fall 2026: holidays, payments and exams with dates", () => {
  const e = parseCalendarPage(fx("ewu-calendar-fall-2026.html"), "Fall-2026");
  assert.ok(e.length >= 25);
  const puja = e.find((x) => /Durgapuja/.test(x.title));
  assert.deepEqual([puja.start, puja.end, puja.kind], ["2026-10-19", "2026-10-21", "holiday"]);
  assert.equal(e.find((x) => /Final Examinations/.test(x.title)).kind, "exam");
  assert.ok(e.filter((x) => x.kind === "payment").length >= 4);
  assert.deepEqual(parseDateRange("Dec 26-Jan 04", "Fall-2026"), ["2026-12-26", "2027-01-04"]);
  assert.deepEqual(parseDateRange("Sept. 13, 14, 15", "Fall-2026"), ["2026-09-13", "2026-09-15"]);
  assert.deepEqual(parseDateRange("Nov. 30-Dec. 03", "Fall-2026"), ["2026-11-30", "2026-12-03"]);
});

test("final exam day by class days", () => {
  assert.deepEqual(parseFinals(fx("ewu-finals-fall-2026.html")), { ST: "2026-12-13", TR: "2026-12-15", MW: "2026-12-14", SR: "2026-12-17" });
});

test("event kinds", () => {
  assert.equal(kindOf("Holiday: Victory Day"), "holiday");
  assert.equal(kindOf("Last day of Tuition Payment with Late Fee of Tk. 500/-"), "payment");
  assert.equal(kindOf("Online Advising of Courses for Spring 2027"), "advising");
  assert.equal(kindOf("Admission Test for Spring 2027"), "other");
});
