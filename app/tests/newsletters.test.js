import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseNewsletters, draftAlumni } from "../src/newsletters.js";

test("newsletter listing: every issue with its PDF, title and date", () => {
  const list = parseNewsletters(readFileSync(new URL("./fixtures/ewu-newsletters.html", import.meta.url), "utf8"));
  assert.ok(list.length >= 20);
  const su26 = list.find((n) => n.title === "Newsletter Summer 2026");
  assert.match(su26.url, /^https:\/\/www\.ewubd\.edu\/storage\/.+\.pdf$/);
  assert.equal(su26.date, "2026-09-09");
  assert.equal(new Set(list.map((n) => n.url)).size, list.length);
});

test("alumni drafts from the card layout (names, role, organisation)", () => {
  const text = `Alumni Success Story Rahim Uddin Khan Batch 20-1 Placement May 2026 Officer, Quality Control Sample Pharma PLC Joined the Quality Control team at Sample Pharma PLC, helping keep standards high.
    Ayesha Siddiqua Batch 19-3 Admission June 2026 MSc in Data Science Example University Began an MSc at Example University in Germany.`;
  const d = draftAlumni(text);
  assert.equal(d.length, 2);
  assert.deepEqual([d[0].name, d[0].role, d[0].org, d[0].kind], ["Rahim Uddin Khan", "Officer, Quality Control", "Sample Pharma PLC", "job"]);
  assert.equal(d[1].name, "Ayesha Siddiqua");
  assert.equal(d[1].kind, "study");
  assert.equal(d[1].country, "Germany");
});

test("alumni drafts from prose stories", () => {
  const d = draftAlumni("Alumni news. Karim Hasan, a graduate of CSE, now works as a Software Engineer at Example Tech in Canada.");
  assert.equal(d[0].name, "Karim Hasan");
  assert.equal(d[0].dept, "CSE");
  assert.equal(d[0].country, "Canada");
});
