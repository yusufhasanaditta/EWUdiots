// Tide and start clock: fill levels, nearness, clock hands and repeatable bubbles.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fillOf, nearness, hands, bubbles, tideHtml, clockHtml } from "../src/tide.ts";

const T = (hm: string): number => new Date(`2026-11-12T${hm}:00`).getTime();

test("fill follows the time through a class and stays within 0…1", () => {
  assert.equal(fillOf(T("08:30"), T("08:30"), T("10:00")), 0);
  assert.equal(fillOf(T("09:15"), T("08:30"), T("10:00")), 0.5);
  assert.equal(fillOf(T("11:00"), T("08:30"), T("10:00")), 1);
  assert.equal(fillOf(T("08:00"), T("08:30"), T("10:00")), 0);
  assert.equal(fillOf(T("09:00"), T("10:00"), T("10:00")), 0); // zero-length class
});

test("nearness closes over the last hour before the start", () => {
  assert.equal(nearness(T("07:00"), T("08:30")), 0);
  assert.equal(nearness(T("08:00"), T("08:30")), 0.5);
  assert.equal(nearness(T("08:30"), T("08:30")), 1);
  assert.equal(nearness(T("08:00"), T("08:30"), 0), 0);
});

test("clock hands only move forward through the day", () => {
  const a = hands(new Date("2026-11-12T03:00:00")), b = hands(new Date("2026-11-12T03:00:01"));
  assert.deepEqual(a, { h: 90, m: 1080, s: 64800 });
  assert.ok(b.s > a.s && b.m > a.m && b.h > a.h);
  assert.equal(hands(new Date("2026-11-12T00:00:00")).s, 0);
});

test("bubbles repeat for a seed and stay inside the card", () => {
  assert.deepEqual(bubbles(6, 3), bubbles(6, 3));
  assert.notDeepEqual(bubbles(6, 3), bubbles(6, 4));
  for (const b of bubbles(20)) { assert.ok(b.x >= 0 && b.x <= 100); assert.ok(b.size >= 4 && b.size <= 13); assert.ok(b.delay <= 0); }
  assert.deepEqual(bubbles(0), []);
});

test("markup carries the fill and the start marker", () => {
  assert.match(tideHtml(0.4213, { id: "t1" }), /id="t1" style="--fill:0.421"/);
  assert.match(tideHtml(4), /--fill:1.000/);
  assert.equal((tideHtml(0.5, { bubbles: 5 }).match(/<i /g) || []).length, 5);
  const svg = clockHtml(new Date("2026-11-12T08:00:00"), new Date("2026-11-12T08:30:00"));
  assert.match(svg, /--near:0.500/);
  assert.match(svg, /class="cc-start" cx="50.0" cy="91.0"/); // :30 is straight down
});
