// Club registration quick checks and the task board's Review column. Made-up data only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { quickChecks } from "../src/clubs/views/register.js";
import { COLUMNS, stats, move } from "../src/clubs/kanban.js";

const claim = (over = {}) => ({ id: "c1", club_id: "k1", email: "someone@example.com", clubs: { name: "Robotics Club", about: "Builds robots", category: "tech" },
  application: { about: "We build small robots.", statement: "A place to learn robotics together.", email: "team@example.com" }, ...over });

test("quick checks pass for a complete, unique application", () => {
  const r = quickChecks(claim(), [{ id: "k2", name: "Photography Club", status: "active" }]);
  assert.deepEqual(r.map(([, ok]) => ok), [true, true, true, true, true]);
});

test("quick checks flag a similar club, a vague category and banned words", () => {
  const r = quickChecks(claim({ clubs: { name: "Robotics Society", about: "x", category: "other" }, application: { statement: "Betting nights for members" } }),
    [{ id: "k9", name: "EWU Robotics Club", status: "active" }, { id: "k8", name: "Old Robotics", status: "archived" }]);
  const byLabel = Object.fromEntries(r.map(([l, ok, extra]) => [l.replace(/ \(\d+\)$/, ""), [ok, extra]]));
  assert.equal(byLabel["Category matches guidelines"][0], false);
  assert.deepEqual(byLabel["Similar club found"], [false, ["EWU Robotics Club"]]);
  assert.equal(byLabel["No prohibited keywords"][0], false);
});

test("contact check accepts a Bangladeshi mobile number when there is no email", () => {
  const r = quickChecks(claim({ email: "", application: { phone: "01712-345678" } }));
  assert.equal(r[1][1], true);
});

test("task board has a Review column that cards can move into", () => {
  assert.deepEqual(COLUMNS.map(([k]) => k), ["todo", "doing", "review", "done"]);
  const tasks = [{ id: "a", status: "doing", position: 0 }, { id: "b", status: "todo", position: 0 }];
  assert.deepEqual(move(tasks, "a", "review"), [{ id: "a", status: "review", position: 0 }]);
  assert.equal(stats([...tasks, { id: "c", status: "review" }]).review, 1);
});
