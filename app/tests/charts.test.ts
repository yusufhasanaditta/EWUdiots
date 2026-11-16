// Bars and horizontal bars: scale, labels, goal line, escaping.
import test from "node:test";
import assert from "node:assert/strict";
import { barsHtml, hbarsHtml } from "../src/charts.ts";

test("bars scale to the tallest value and label it", () => {
  const html = barsHtml([{ label: "Sun", value: 2 }, { label: "Mon", value: 4 }], { aria: "Hours per day", fmt: (n) => `${n}h` });
  const heights = [...html.matchAll(/height="([\d.]+)"/g)].map((m) => Number(m[1]));
  assert.ok(Math.abs(heights[0] * 2 - heights[1]) < 0.2);
  assert.match(html, /class="dl"[^>]*>4h</);
  assert.match(html, /aria-label="Hours per day"/);
  assert.match(barsHtml([], {}), /Nothing to chart yet/);
});

test("horizontal bars cap at max, mark values under the goal and escape labels", () => {
  const html = hbarsHtml([{ label: "<CSE>", value: 60 }, { label: "MAT", value: 130 }], { goal: 70 });
  assert.match(html, /&lt;CSE&gt;/);
  assert.match(html, /class="cb h bad"/);
  const widths = [...html.matchAll(/width="([\d.]+)" height="14"/g)].map((m) => Number(m[1]));
  assert.ok(widths[1] > widths[0] && widths[1] <= 320);
  assert.match(html, /class="thr"/);
});
