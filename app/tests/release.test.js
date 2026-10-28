import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const json = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), "utf8"));

// The update prompts read release.json; Vercel builds see only app/, so the extension version is copied there.
test("release.json matches the extension version", () => assert.equal(json("../release.json").extension, json("../../extension/manifest.json").version));
test("release.json has notes and a valid minVersion", () => {
  const r = json("../release.json"), v = (s) => s.split(".").map(Number);
  assert.ok(Array.isArray(r.notes) && r.notes.length > 0 && r.notes.every((n) => typeof n === "string" && n.length < 120));
  assert.match(r.minVersion, /^\d+\.\d+\.\d+$/);
  const [a, b] = [v(r.minVersion), v(json("../package.json").version)];
  assert.ok(a[0] < b[0] || (a[0] === b[0] && (a[1] < b[1] || (a[1] === b[1] && a[2] <= b[2]))), "minVersion can't be newer than the app itself");
});

test("phone portal sync uses the same reader as the Chrome extension", async () => {
  const { readFileSync } = await import("node:fs");
  const { SCRAPE_JS } = await import("../src/portal-scrape.js");
  const ext = readFileSync(new URL("../../extension/portal.js", import.meta.url), "utf8");
  const body = ext.slice(ext.indexOf("  const clean = "), ext.indexOf("  // One storage entry per page")).trimEnd();
  assert.ok(SCRAPE_JS.includes(body), "run: node scripts/build-portal-scrape.mjs");
});
