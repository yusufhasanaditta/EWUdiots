// Real OCR output (tesseract, this app's settings) of phone-width screenshots of the fake portal pages
// (tests/fixtures/portal-pages.mjs; regenerate with DUMP=1 node scripts/ocr-phone-probe.mjs). Rows wrap and OCR misreads.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parsePortalText } from "../src/parser.js";

const read = (n) => readFileSync(new URL(`./fixtures/ocr-phone-${n}.txt`, import.meta.url), "utf8");

test("phone schedule: wrapped rows are stitched back (days above, end time below)", () => {
  const rows = parsePortalText(read("schedule")).routine.map((r) => `${r.code} ${r.days} ${r.start}-${r.end}`);
  for (const want of ["CHE109 MW 13:30-15:00", "CHE109 S 13:30-15:30", "MAT102 MW 16:50-18:20"]) assert.ok(rows.includes(want), `${want} in ${rows.join(", ")}`);
});

test("phone grade report: glued credits+grade and O-for-zero course codes", () => {
  const g = parsePortalText(read("grades")).grades;
  assert.equal(g.length, 4);
  assert.deepEqual(g.find((x) => x.code === "ENG099") && [g.find((x) => x.code === "ENG099").cr, g.find((x) => x.code === "ENG099").g], [0, "P"]);
  assert.equal(g.find((x) => x.code === "MAT101").g, "B");
});

test("phone profile page: academic details", () => {
  const p = parsePortalText(read("profile")).profile;
  assert.equal(p.id, "2026-2-60-999"); assert.equal(p.advisorInitial, "NAH"); assert.equal(p.cgpa, 3.15);
});

test("clean pasted rows are left alone by the OCR repairs", () => {
  const r = parsePortalText("Fall-2026\n1\tCSE106\t14\t3\tMW 8:30AM-10:00AM\tAB2-702\tNo\tNo\tSNR\tMs. Sadia Nur\tsadia.nur@ewubd.edu").routine;
  assert.deepEqual(r.map((x) => [x.code, x.days, x.start, x.end, x.room]), [["CSE106", "MW", "08:30", "10:00", "AB2-702"]]);
});

import { findStudentId } from "../src/ui-idcard.js";
test("ID card: student ID survives OCR look-alikes and lost dashes", () => {
  assert.equal(findStudentId("ID: 2026-1-60-001"), "2026-1-60-001");
  assert.equal(findStudentId("ID: 2O26-l-6O-OO1"), "2026-1-60-001");
  assert.equal(findStudentId("ID 2026 - 1 - 60 - 0O1"), "2026-1-60-001");
  assert.equal(findStudentId("ID No 2026160001"), "2026-1-60-001");
  assert.equal(findStudentId("Phone 01711000999"), "");
  assert.equal(findStudentId("1999-7-60-001"), "");
});
