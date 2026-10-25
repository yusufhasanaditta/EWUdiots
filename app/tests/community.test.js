// News parser (saved public news page) and the alumni dataset's integrity.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseNews, tagOf } from "../src/news.js";

test("EWU news page → articles with image, date, excerpt and link", () => {
  const n = parseNews(readFileSync(new URL("./fixtures/ewu-news.html", import.meta.url), "utf8"));
  assert.ok(n.length >= 10, `${n.length} articles`);
  assert.ok(n.every((x) => x.title && x.url.startsWith("https://www.ewubd.edu/news/") && /^\d{4}-\d\d-\d\d$/.test(x.date)));
  assert.ok(n.filter((x) => x.image.startsWith("https://")).length >= n.length - 2);
  assert.equal(new Set(n.map((x) => x.id)).size, n.length);
});

test("news tags", () => {
  assert.equal(tagOf("EWUCRT Holds 146th Research Seminar"), "Research");
  assert.equal(tagOf("East West University and Huawei Technologies Partner to Boost ICT Education"), "Partnership");
  assert.equal(tagOf("EWU Observes World Teachers' Day 2026"), "Events");
});

test("alumni dataset: every row complete and sourced", () => {
  const j = JSON.parse(readFileSync(new URL("../public/data/alumni.json", import.meta.url), "utf8"));
  const F = j.fields;
  assert.deepEqual(F, ["name", "role", "org", "country", "dept", "sector", "kind", "note", "issue"]);
  assert.ok(j.alumni.length >= 90);
  for (const r of j.alumni) {
    const o = Object.fromEntries(F.map((k, i) => [k, r[i]]));
    assert.equal(r.length, F.length, o.name);
    assert.ok(o.name && o.role && o.org && o.country, `incomplete: ${o.name}`);
    assert.ok(["job", "study", "award"].includes(o.kind), `${o.name}: kind ${o.kind}`);
    assert.ok(j.issues[o.issue]?.url.startsWith("https://www.ewubd.edu/"), `${o.name}: source ${o.issue}`);
  }
  assert.equal(new Set(j.alumni.map((r) => r[0])).size, j.alumni.length, "duplicate names");
});
