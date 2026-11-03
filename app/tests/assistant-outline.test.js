// Ask EWUdiots answering from a scanned course outline (made-up outline, no real person or numbers).
import { test } from "node:test";
import assert from "node:assert/strict";
import { outlineAnswer, outlineTopicHits, norm } from "../src/assistant.js";

const OUT = {
  MAT102: {
    units: [{ title: "Ordinary Differential Equations", topics: ["First-Order Differential Equations", "Higher-Order Differential Equations"] },
      { title: "Special Functions", topics: ["Bessel Functions", "Legendre Polynomials"] }],
    exams: [{ name: "Mid-term", date: "2026-10-28" }, { name: "Final exam", date: "2026-12-14" }],
    assessment: [{ name: "Mid Term Examination", pct: 25 }, { name: "Final Examination", pct: 25 }, { name: "Class Test (Quiz)", pct: 10 }],
    grading: [{ range: "80% and above", letter: "A+", point: 4 }, { range: "Less than 40%", letter: "F", point: 0 }],
    textbooks: ["A First Course in Differential Equations"],
    instructor: { name: "Test Person", role: "Lecturer", email: "test.person@example.edu", office: "AB1-999" },
    officeHours: [{ day: "Monday", start: "1:50 PM", end: "4:20 PM" }],
    done: { "0.0": true }
  }
};
const ask = (q, now = new Date("2026-10-20T10:00")) => outlineAnswer(norm(q), OUT, now);

test("next exam comes from the outline", () => {
  const r = ask("When is the MAT102 mid-term?");
  assert.equal(r.kind, "exams");
  assert.equal(r.exams[0].name, "Mid-term");
  assert.equal(ask("mat 102 final", new Date("2026-11-01")).exams[0].name, "Final exam");
  assert.equal(ask("MAT102 exam", new Date("2027-01-01")).past, true);
});

test("marks: one item when named, the whole split otherwise", () => {
  const one = ask("How much is the quiz worth in MAT102?");
  assert.deepEqual(one.items.map((a) => a.name), ["Class Test (Quiz)"]);
  const all = ask("MAT102 mark distribution");
  assert.equal(all.all, true);
  assert.equal(all.items.length, 3);
});

test("grading, books, instructor and topics", () => {
  assert.equal(ask("MAT102 grading").kind, "grading");
  assert.equal(ask("MAT102 textbook").items.length, 1);
  assert.equal(ask("MAT102 office hours").ins.office, "AB1-999");
  const t = ask("MAT102 topics left");
  assert.equal(t.total, 4);
  assert.equal(t.left.length, 3);
  assert.equal(t.onlyLeft, true);
});

test("no outline, no course code or an unrelated question: not an outline answer", () => {
  assert.equal(ask("CSE207 topics"), null);
  assert.equal(ask("topics left"), null);
  assert.equal(ask("MAT102 room"), null);
});

test("the fallback search finds topics across outlines", () => {
  const hits = outlineTopicHits(norm("bessel functions"), OUT);
  assert.equal(hits[0].code, "MAT102");
  assert.match(hits[0].topic, /Bessel/);
});
