// Sheet drag decisions: distance, flick velocity and upward resistance.
import test from "node:test";
import assert from "node:assert/strict";
import { shouldClose, resist } from "../src/gestures.ts";

test("a sheet closes when dragged far or flicked, and springs back otherwise", () => {
  assert.equal(shouldClose(200, 400, 500), true);   // 40% of its height
  assert.equal(shouldClose(60, 80, 500), true);     // quick flick (0.75 px/ms)
  assert.equal(shouldClose(60, 400, 500), false);   // slow, short
  assert.equal(shouldClose(10, 5, 500), false);     // a tap, not a flick
  assert.equal(shouldClose(-50, 100, 500), false);  // dragged up
});

test("pulling up past the top is damped", () => {
  assert.equal(resist(40), 40);
  assert.ok(resist(-100) > -100 && resist(-100) < 0);
  assert.ok(Math.abs(resist(-400)) < 400 / 4);
});
