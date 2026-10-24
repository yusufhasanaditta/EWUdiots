// Campus model, room resolver, routing and ID-card text parsing (synthetic card text only).
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseRoom, resolveRoom, BLOCKS, LINKS, floorLabel, libraryOpen } from "../src/campus-data.js";
import { route } from "../src/campus-nav.js";
import { parseCardText } from "../src/ui-idcard.js";

test("room numbers give the floor (1xx = ground floor)", () => {
  assert.deepEqual([parseRoom("126").floor, parseRoom("636").floor, parseRoom("AB2-702").floor, parseRoom("FUB-1001").floor], [0, 5, 6, 9]);
  assert.equal(parseRoom("Room No# 642 (Lab)").code, "642");
  assert.equal(parseRoom("fub 903").code, "FUB-903");
  assert.equal(parseRoom("hello"), null);
  assert.equal(parseRoom("9999"), null);
});

test("sourced rooms are verified; faculty-office ranges infer the block", () => {
  assert.equal(resolveRoom("126").block, "CM");
  assert.equal(resolveRoom("126").conf, "verified");
  assert.deepEqual([resolveRoom("636").block, resolveRoom("636").conf], ["CS", "likely"]); // CSE offices
  assert.equal(resolveRoom("238").block, "CN"); // English seminar room
  assert.equal(resolveRoom("805").block, "A"); // GEB, 7th floor
  assert.equal(resolveRoom("AB1-305").block, "AB1");
});

test("rooms the user adds override the app's guess", () => {
  assert.equal(resolveRoom("322").block, "A");
  const r = resolveRoom("322", [{ code: "322", block: "B", floor: 2, name: "Test" }]);
  assert.deepEqual([r.block, r.floor, r.conf], ["B", 2, "user"]);
});

test("map legend links are honoured (no A↔B link on the 7th floor)", () => {
  const ab = LINKS.find((l) => l.a === "A" && l.b === "B");
  assert.deepEqual(ab.except, [7]);
  assert.ok(BLOCKS.every((b) => b.top >= 2 && b.low <= 0));
  assert.equal(floorLabel(0), "Ground floor"); assert.equal(floorLabel(2), "2nd floor"); assert.equal(floorLabel(11), "11th floor"); assert.equal(floorLabel(-1), "B1 (basement)");
});

test("route: gate → CSE floor uses Lobby #4 and climbs to the 5th floor", () => {
  const r = route({ kind: "gate", id: "E1" }, { kind: "room", code: "636" });
  assert.ok(r && r.seconds > 60 && r.seconds < 600);
  const text = r.steps.map((s) => s.text).join(" | ");
  assert.match(text, /Lobby #4/); assert.match(text, /5th floor/);
  assert.equal(r.points.at(-1).f, 5);
});

test("route: FUB only connects at the ground floor", () => {
  const r = route({ kind: "room", code: "FUB-1001" }, { kind: "room", code: "636" });
  const fubLinks = r.hops.filter((h) => h.to.startsWith("L|FUB|"));
  assert.ok(fubLinks.length > 0 && fubLinks.every((h) => h.to.endsWith("|0")));
});

test("route: off-campus academic building walk", () => {
  const r = route({ kind: "gate", id: "E1" }, { kind: "room", code: "AB2-702" });
  assert.ok(r.steps.some((s) => /Academic Building 2/.test(s.text)));
  assert.equal(route({ kind: "gate", id: "E1" }, { kind: "room", code: "nope" }), null);
});

test("library hours", () => {
  const at = (day, h, m = 0) => { const d = new Date(2026, 9, 18 + day); d.setHours(h, m); return d; }; // 18 Oct 2026 = Sunday
  assert.equal(libraryOpen(at(0, 9)).open, true);
  assert.equal(libraryOpen(at(5, 13, 30)).open, false); // Friday prayer break
  assert.equal(libraryOpen(at(6, 12)).open, false); // Saturday opens 5 PM
  assert.equal(libraryOpen(at(6, 18)).open, true);
});

test("ID card OCR text → ID, name, department", () => {
  const t = "EAST WEST UNIVERSITY\nSTUDENT ID CARD\nName : TANVIR TEST HASAN\nID: 2026 - 1 - 60 - 001\nDept: CSE\nValid upto: Dec 2030";
  assert.deepEqual(parseCardText(t), { id: "2026-1-60-001", name: "Tanvir Test Hasan", program: "", dept: "CSE", valid: "Dec 2030" });
  const u = parseCardText("EAST WEST UNIVERSITY\nNusrat Sample Akter\n2025-3-10-045\nBBA");
  assert.equal(u.id, "2025-3-10-045"); assert.equal(u.name, "Nusrat Sample Akter");
  assert.equal(parseCardText("blurry").id, "");
});
