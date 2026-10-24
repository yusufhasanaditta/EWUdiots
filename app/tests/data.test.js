// Notice-board and faculty-profile parsers (saved public notice page; synthetic profile HTML).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseNotices, categoryOf } from "../src/notices.js";
import { parseProfile } from "../scripts/scrape-faculty.mjs";

test("EWU notice board page → notices with dates, links and categories", () => {
  const n = parseNotices(readFileSync(new URL("./fixtures/ewu-notice-board.html", import.meta.url), "utf8"));
  assert.ok(n.length >= 10, `${n.length} notices`);
  assert.ok(n.every((x) => x.title && x.url.startsWith("https://www.ewubd.edu/notice-details/") && /^\d{4}-\d\d-\d\d$/.test(x.date)));
  assert.equal(new Set(n.map((x) => x.id)).size, n.length);
  assert.ok(n.some((x) => x.pdf.endsWith(".pdf")));
});

test("notice categories", () => {
  assert.equal(categoryOf("Schedule of Pre-advising for Spring 2027"), "Advising");
  assert.equal(categoryOf("Final Examination Schedule"), "Exams");
  assert.equal(categoryOf("MERIT SCHOLARSHIP: Fall Semester 2026"), "Scholarships");
  assert.equal(categoryOf("Collection of RFID Card"), "General");
});

test("faculty profile page → directory entry (own email, not the department's)", () => {
  const html = `<header><a href="mailto:cse@ewubd.edu">cse@ewubd.edu</a></header>
    <img class="dean-image" src="https://fse.ewubd.edu/storage/app/uploads/public/a/b/c/photo.jpeg" alt="Profile Picture">
    <h3>Dr. Test Person</h3><p>Assistant Professor</p><p>Department of Computer Science &amp; Engineering</p>
    <p>Ext: Ext. 429&nbsp;||&nbsp;Room No# 636</p><p>test.person@ewubd.edu</p>
    <h4>Academic Background</h4><p>PhD in Computer Science, Some University, Year: 2022</p><h4>Short Biography</h4><p>Teaches algorithms.</p>`;
  const f = parseProfile(html, "https://fse.ewubd.edu/x/faculty-view/test.person");
  assert.equal(f.name, "Dr. Test Person"); assert.equal(f.designation, "Assistant Professor");
  assert.equal(f.email, "test.person@ewubd.edu"); assert.equal(f.room, "636"); assert.equal(f.ext, "429");
  assert.match(f.photo, /^https:\/\/fse\.ewubd\.edu\/storage\//); assert.equal(f.degree, "PhD in Computer Science, Some University");
});
