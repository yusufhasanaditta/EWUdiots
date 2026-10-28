// Two devices editing one account: each part keeps the newest edit, wherever it was made.
import { test } from "node:test";
import assert from "node:assert/strict";
import { snapshot, stamp, merge } from "../src/syncmerge.js";

test("a stale device saving something unrelated doesn't undo the phone's profile edit", () => {
  const base = { profile: { name: "A" }, read: {}, tasks: [] };
  const phone = structuredClone(base), web = structuredClone(base);
  const ps = snapshot(phone), ws = snapshot(web);
  phone.profile = { name: "A", photo: "data:image/jpeg;base64,xx" }; stamp(phone, ps, 1000);
  web.read = { n1: true }; stamp(web, ws, 2000); // later, but a different part
  const onWeb = merge(web, phone);
  assert.equal(onWeb.state.profile.photo, "data:image/jpeg;base64,xx");
  assert.deepEqual(onWeb.state.read, { n1: true });
  assert.ok(onWeb.fromRemote && onWeb.keepLocal);
  const onPhone = merge(phone, onWeb.state);
  assert.deepEqual([onPhone.state.profile.photo, onPhone.state.read.n1], ["data:image/jpeg;base64,xx", true]);
});

test("the newer edit of the same part wins either way round", () => {
  const a = { profile: { name: "Old" }, _t: { profile: 10 } }, b = { profile: { name: "New" }, _t: { profile: 20 } };
  assert.equal(merge(a, b).state.profile.name, "New");
  assert.equal(merge(b, a).state.profile.name, "New");
  assert.equal(merge(b, a).keepLocal, true);
});

test("stamp only marks real changes", () => {
  const s = { profile: { name: "A" }, routine: [] }, snap = snapshot(s);
  assert.deepEqual(stamp(s, snap, 5), []);
  s.routine.push({ code: "CSE106" });
  assert.deepEqual(stamp(s, snap, 6), ["routine"]);
  assert.equal(s._t.routine, 6);
});

test("old copies without edit times: the account's copy wins", () => {
  const r = merge({ profile: { name: "Device" } }, { profile: { name: "Account" } });
  assert.equal(r.state.profile.name, "Account");
});
