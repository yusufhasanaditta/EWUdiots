// Offered courses: the faculty-list PDF text, split rows put back together, sections, credits and changes (made-up rows).
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseFacultyList, groupRows, fromSnapshot, toPlanner, courseChanges, creditCheck, standing, deptOf } from "../src/offered.js";

const PAGE = `ewucoursetracker.live
Course Sec Faculty Capacity Timing Room No
CSE999 1 ABC 3/30 M 10:10 AM - 11:40 AM 529 (C. Lab-1)
CSE999 1 ABC 3/30 W 10:10 AM - 11:40 AM 114
CSE999 2
XYZ 0/30 AB2-201
CSE999 3
TBA M 04:50 PM - 06:20 PM 436 (Competitive Programming
CSE998 1 QRS 0/40 MW 08:30 AM - 10:00 AM 222
CSE998 1 QRS 0/40 T 10:10 AM - 01:10 PM 224 (Multi Media and Image
Processing Lab)
S 01:30 PM - 03:00 PM
0 / 30
Lab)
\fewucoursetracker.live
MAT900 1 TBAS 08:00 AM - 10:00 AM 101
0/38`;

test("rows split by the watermark get their lost pieces back, page by page", () => {
  const rows = parseFacultyList(PAGE);
  assert.equal(rows.length, 7);
  const sec2 = rows.find((r) => r.code === "CSE999" && r.sec === "2");
  assert.deepEqual(sec2, { code: "CSE999", sec: "2", fac: "XYZ", cap: "0/30", time: "S 01:30 PM - 03:00 PM", room: "AB2-201" });
  const sec3 = rows.find((r) => r.sec === "3");
  assert.equal(sec3.cap, "0/30");
  assert.equal(sec3.room, "436 (Competitive Programming Lab)");
  assert.equal(rows.find((r) => r.code === "CSE998" && r.time.startsWith("T")).room, "224 (Multi Media and Image Processing Lab)");
  // A day glued to a name ("TBAS 08:00") and seats on the next page's loose line.
  assert.deepEqual(rows.find((r) => r.code === "MAT900"), { code: "MAT900", sec: "1", fac: "TBA", cap: "0/38", time: "S 08:00 AM - 10:00 AM", room: "101" });
});

test("sections merge same-time days and spot labs; credits are guessed from the timetable", () => {
  const C = groupRows(parseFacultyList(PAGE));
  const a = C.find((c) => c.code === "CSE999"), b = C.find((c) => c.code === "CSE998");
  assert.deepEqual(a.sections[0].slots, [{ days: "MW", start: "10:10", end: "11:40", room: "529 (C. Lab-1) / 114" }]);
  assert.equal(a.sections[0].taken, 3);
  assert.equal(a.cr, 3);
  assert.equal(b.cr, 4.5); // 3 + a 3-hour lab
  assert.equal(b.sections[0].slots[1].lab, true);
  assert.equal(a.dept, "CSE");
  assert.equal(deptOf("PHRM101-L"), "PHRM");
});

test("snapshot rows from the tracker API read the same way", () => {
  const rows = fromSnapshot([{ CourseCode: "CSE 999", SectionName: "Sec 4", ShortName: "ABC", SeatTaken: 10, SeatCapacity: 40, TimeSlotName: "ST  08:30 AM - 10:00 AM", RoomCode: "FUB-301" }]);
  assert.deepEqual(rows, [{ code: "CSE999", sec: "4", fac: "ABC", cap: "10/40", time: "ST 08:30 AM - 10:00 AM", room: "FUB-301" }]);
  const P = toPlanner(groupRows(rows), () => "Test Course");
  assert.deepEqual(P.CSE999.sections[0], { sec: "4", days: "ST", start: "08:30", end: "10:00", room: "FUB-301", faculty: "ABC", capacity: 40, seats: 30, slots: [{ days: "ST", start: "08:30", end: "10:00", room: "FUB-301" }] });
  assert.equal(P.CSE999.title, "Test Course");
});

test("changes between two lists, the 9–15 credit rule and a course's standing", () => {
  const one = groupRows(fromSnapshot([{ CourseCode: "CSE999", SectionName: "1", ShortName: "TBA", SeatCapacity: 30, TimeSlotName: "M 10:10 AM - 11:40 AM", RoomCode: "114" },
    { CourseCode: "CSE999", SectionName: "2", ShortName: "ABC", SeatCapacity: 30, TimeSlotName: "S 10:10 AM - 11:40 AM", RoomCode: "115" }]))[0];
  const two = groupRows(fromSnapshot([{ CourseCode: "CSE999", SectionName: "1", ShortName: "XYZ", SeatCapacity: 30, TimeSlotName: "M 01:30 PM - 03:00 PM", RoomCode: "114" }]))[0];
  assert.deepEqual(courseChanges(one, two), ["Sec 1: faculty TBA → XYZ", "Sec 1: time or room changed", "Sec 2 removed"]);
  assert.deepEqual(creditCheck(7.5), { total: 7.5, min: 9, max: 15, ok: false, under: 1.5, over: 0 });
  assert.equal(creditCheck(16).over, 1);
  assert.equal(creditCheck(12).ok, true);
  assert.equal(standing("CSE999", { passed: new Set(["CSE999"]) }), "done");
  assert.equal(standing("CSE998", { doing: new Set(["CSE998"]) }), "doing");
  assert.equal(standing("CSE997", {}), "open");
});
