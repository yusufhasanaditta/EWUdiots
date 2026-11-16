// Pie chart markup: shares add up, zero slices are dropped, labels are escaped.
import test from "node:test";
import assert from "node:assert/strict";
import { pieHtml } from "../src/pie.ts";

test("pie slices cover 100% in order and skip empty values", () => {
  const html = pieHtml([{ label: "A", value: 3 }, { label: "B", value: 1 }, { label: "C", value: 0 }], { center: "4", sub: "courses" });
  const dashes = [...html.matchAll(/stroke-dasharray="([\d.]+) /g)].map((m) => Number(m[1]));
  assert.deepEqual(dashes, [75, 25]);
  assert.match(html, /stroke-dashoffset="25.00".*stroke-dashoffset="-50.00"/s);
  assert.doesNotMatch(html, />C</);
  assert.match(html, /class="pie-c"[^>]*>4</);
});

test("pie escapes labels and handles no data", () => {
  assert.match(pieHtml([{ label: "<b>x</b>", value: 1 }]), /&lt;b&gt;x&lt;\/b&gt;/);
  assert.match(pieHtml([]), /Nothing to chart yet/);
});
