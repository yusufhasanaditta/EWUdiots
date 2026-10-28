// Official events parser (saved ewubd.edu/events page) and the kind guesser.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseEvents, guessKind } from "../src/events.js";

const html = readFileSync(new URL("./fixtures/ewu-events.html", import.meta.url), "utf8");

test("EWU events page → events with dates, venue and link", () => {
  const e = parseEvents(html);
  assert.ok(e.length >= 5, `${e.length} events`);
  assert.ok(e.every((x) => x.title && x.url.startsWith("https://www.ewubd.edu/single-event/") && /^\d{4}-\d\d-\d\d$/.test(x.start)));
  assert.equal(new Set(e.map((x) => x.id)).size, e.length);
  const expo = e.find((x) => x.id === "uddokta-101-exhibition-program");
  assert.deepEqual([expo.start, expo.end, expo.venue, expo.kind], ["2026-08-02", "2026-08-03", "CCC Lobby, East West University", "fair"]);
});

test("the page's stand-in end date (today) is dropped", () => {
  const lecture = parseEvents(html, "2026-10-28").find((x) => x.id === "public-lecture-30-july");
  assert.equal(lecture.end, "");
});

test("event kinds", () => {
  assert.equal(guessKind("Robotics Club Recruitment Fall 2026"), "club_recruitment");
  assert.equal(guessKind("Spring Concert 2026"), "concert");
  assert.equal(guessKind("Seminar titled Research in Japan"), "seminar");
  assert.equal(guessKind("Inter-university Programming Contest"), "competition");
  assert.equal(guessKind("Annual dinner"), "other");
});
