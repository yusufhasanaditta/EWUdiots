// Google Classroom → EWU course codes, shared materials and deadlines (sample API shapes, fictional data).
import { test } from "node:test";
import assert from "node:assert/strict";
import { courseCodeOf, sectionOf, toMaterials, toNotices, toTasks, SCOPES } from "../src/classroom.js";

test("course codes and sections from Classroom names", () => {
  assert.equal(courseCodeOf({ name: "CSE106 Sec 3 (Fall 2026)" }), "CSE106");
  assert.equal(courseCodeOf({ name: "Discrete Mathematics", section: "MAT 205 - Section 2" }), "MAT205");
  assert.equal(courseCodeOf({ name: "Club announcements" }), "");
  assert.equal(sectionOf({ name: "CSE106 Sec 3" }), "3");
  assert.equal(sectionOf({ name: "ENG101", section: "Section-12" }), "12");
});

test("posts become materials with topics, links and types", () => {
  const rows = toMaterials({
    course: { id: "111", name: "CSE106 Sec 3" }, code: "CSE106", info: { faculty: "SNR", sem: "Fall-2026" },
    topics: [{ topicId: "t1", name: "Week 1: Intro" }],
    materials: [{ id: "m1", title: "Lecture 1 slides", topicId: "t1", materials: [{ driveFile: { driveFile: { alternateLink: "https://drive.google.com/file/d/x", title: "L1.pptx" } } }] }],
    work: [{ id: "w1", title: "Lab 1", workType: "ASSIGNMENT", alternateLink: "https://classroom.google.com/c/111/a/w1", topicId: "t1" }]
  });
  assert.equal(rows.length, 2);
  assert.deepEqual([rows[0].type, rows[0].topic, rows[0].section, rows[0].faculty, rows[0].ext_id], ["Slides", "Week 1: Intro", "3", "SNR", "gc:111:m1"]);
  assert.equal(rows[1].type, "Assignment");
});

test("assignments with due dates become deadlines", () => {
  const t = toTasks({ code: "CSE106", work: [{ id: "w1", title: "Lab 1", dueDate: { year: 2026, month: 11, day: 3 }, dueTime: { hours: 17, minutes: 59 } }, { id: "w2", title: "No due date" }] });
  assert.equal(t.length, 1);
  assert.deepEqual([t[0].id, t[0].course, t[0].due], ["gc-w1", "CSE106", "2026-11-03T17:59:00.000Z"]);
});

test("teacher and TA announcements become Notice rows, titled from their first line", () => {
  const out = toNotices({ course: { id: "c9", name: "CSE110 Sec 1" }, code: "CSE110",
    announcements: [
      { id: "a1", text: "Quiz 2 is on Sunday. Bring your calculator.", alternateLink: "https://classroom.google.com/c/1/p/a1" },
      { id: "a2", text: "", materials: [{ link: { url: "https://ex.com/slides", title: "Week 5 slides" } }], alternateLink: "https://classroom.google.com/c/1/p/a2" },
      { id: "a3" } ], // empty announcement is skipped
    info: { faculty: "SJ", sem: "Fall-2026" } });
  assert.equal(out.length, 2);
  assert.equal(out[0].type, "Notice");
  assert.equal(out[0].topic, "Notices");
  assert.equal(out[0].title, "Quiz 2 is on Sunday.");
  assert.equal(out[0].link, "https://classroom.google.com/c/1/p/a1"); // a text-only notice still links to its Classroom post
  assert.equal(out[1].link, "https://ex.com/slides"); // one with an attachment links to the attachment
  assert.equal(out[0].faculty, "SJ");
  assert.equal(out[0].section, "1");
});

test("the announcements scope is requested", () => {
  assert.ok(SCOPES.includes("classroom.announcements.readonly"));
});
