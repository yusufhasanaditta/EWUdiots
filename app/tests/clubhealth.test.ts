// Club health score and running balance (made-up numbers).
import test from "node:test";
import assert from "node:assert/strict";
import { clubHealth, runningBalance } from "../src/clubs/health.ts";

test("a busy, growing club scores high; a quiet, shrinking one scores low with tips", () => {
  const busy = clubHealth({ members: 60, members_prev: 50, events: 6, events_prev: 4, participants: 300, participants_prev: 200, posts: 20, posts_prev: 10, growth: [{ active: 40 }] });
  assert.ok(busy.score >= 80, `busy ${busy.score}`); assert.equal(busy.grade, "Thriving");
  const quiet = clubHealth({ members: 40, members_prev: 60, events: 0, events_prev: 3, participants: 0, participants_prev: 50, posts: 1, posts_prev: 8, growth: [{ active: 2 }] });
  assert.ok(quiet.score < 40, `quiet ${quiet.score}`); assert.equal(quiet.grade, "At risk");
  assert.ok(quiet.parts.every((p) => p.score >= 0 && p.score <= 20 && p.tip));
});

test("a brand-new club with no history is not punished for missing previous numbers", () => {
  const h = clubHealth({ members: 5, events: 1, participants: 10, posts: 2, growth: [{ active: 3 }] });
  assert.ok(h.score >= 50 && h.score <= 90, `new ${h.score}`);
  assert.equal(clubHealth({ members: 0 }).score >= 0, true);
});

test("running balance carries money over month to month", () => {
  assert.deepEqual(runningBalance([{ m: "2026-09", income: 5000, expense: 2000 }, { m: "2026-10", income: "0", expense: "4500" }]),
    [{ m: "2026-09", net: 3000, balance: 3000 }, { m: "2026-10", net: -4500, balance: -1500 }]);
});
