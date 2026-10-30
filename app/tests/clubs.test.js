import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { CLUB_PERMS, RANKS, has, canManage, assignableRanks } from "../src/clubs/perms.js";
import { template, cleanFields, validate, normPhone, openState, summarize, toCSV, newField, FIELD_TYPES } from "../src/clubs/forms.js";
import { codeFor, windowOf, qrText, parseQr, secondsLeft } from "../src/clubs/checkin.js";

const SQL = readFileSync(new URL("../../supabase/migrations/0016_clubs.sql", import.meta.url), "utf8");

test("every app permission exists in the database migration", () => {
  for (const p of CLUB_PERMS) assert.ok(SQL.includes(`'${p}'`), `${p} missing from 0016_clubs.sql`);
  assert.equal(new Set(CLUB_PERMS).size, CLUB_PERMS.length, "no duplicate permission keys");
});
test("default rank names match the migration", () => {
  for (const r of RANKS) assert.ok(SQL.includes(`(new.id, ${r.rank}, '${r.name}'`), `rank ${r.rank} ${r.name}`);
});
test("permission checks: '*' grants everything, inactive members get nothing", () => {
  assert.ok(has({ status: "active", perms: ["*"] }, "finance.edit"));
  assert.ok(has({ status: "active", perms: ["posts.write"] }, "posts.write"));
  assert.ok(!has({ status: "active", perms: ["posts.write"] }, "forms.export"));
  assert.ok(!has({ status: "alumni", perms: ["*"] }, "posts.write"));
  assert.ok(!has(null, "posts.write"));
  assert.ok(canManage({ status: "active", rank: 4, perms: [] }));
  assert.ok(!canManage({ status: "active", rank: 7, perms: [] }));
});
test("ranks you may hand out: below yours, admins may add co-admins", () => {
  assert.deepEqual(assignableRanks(3).map((r) => r.rank), [4, 5, 6, 7]);
  assert.deepEqual(assignableRanks(2).map((r) => r.rank), [2, 3, 4, 5, 6, 7]);
  assert.deepEqual(assignableRanks(1).map((r) => r.rank), [2, 3, 4, 5, 6, 7]);
});

test("templates are valid forms; membership asks about wings when the club has them", () => {
  for (const k of ["membership", "event", "competition", "volunteer", "survey", "other"]) assert.ok(cleanFields(template(k)).length >= 1, k);
  const m = template("membership", ["IT", "PR"]);
  assert.ok(m.some((x) => x.type === "choice" && x.options.includes("PR")));
});
test("cleanFields drops broken fields and caps sizes", () => {
  const out = cleanFields([{ type: "bogus" }, { type: "choice", label: "Pick", options: ["A"] }, { type: "text", label: "  Name  ", required: true, max: 99999 }, { type: "note", label: "Read me", required: true }, null]);
  assert.equal(out.length, 2);
  assert.equal(out[0].label, "Name"); assert.equal(out[0].max, 4000);
  assert.equal(out[1].required, false, "a text block is never required");
});
test("field ids from the database are reduced to safe characters", () => {
  const [x] = cleanFields([{ id: 'a" onfocus="alert(1)', type: "text", label: "Name" }]);
  assert.match(x.id, /^[A-Za-z0-9_-]+$/);
  assert.equal(cleanFields([{ id: '"><', type: "text", label: "x" }])[0].id.length > 0, true, "an id that cleans to nothing gets a fresh one");
});
test("validate mirrors the server: required, types, options, phone", () => {
  const f = [{ ...newField("text", "Name"), id: "a", required: true }, { ...newField("email"), id: "b" }, { ...newField("choice"), id: "c", options: ["X", "Y"] }, { ...newField("multi"), id: "d", options: ["P", "Q"] }, { ...newField("link"), id: "e" }];
  assert.deepEqual(Object.keys(validate(f, {}).errors), ["a"]);
  const bad = validate(f, { a: "Rafi", b: "nope", c: "Z", d: ["P", "R"], e: "github" }, { collectPhone: true }, "123");
  assert.deepEqual(Object.keys(bad.errors).sort(), ["_phone", "b", "c", "d", "e"]);
  assert.ok(validate(f, { a: "Rafi", b: "r@x.com", c: "X", d: ["Q"], e: "https://github.com/rafi" }, { collectPhone: true }, "01712-345678").ok);
});
test("Bangladeshi phone numbers", () => {
  assert.equal(normPhone("01712 345678"), "01712345678");
  assert.equal(normPhone("+8801812345678"), "+8801812345678");
  assert.equal(normPhone("01212345678"), ""); assert.equal(normPhone("12345"), "");
});
test("open state: draft, closed, deadline", () => {
  assert.equal(openState({ status: "draft" }).open, false);
  assert.equal(openState({ status: "closed" }).open, false);
  assert.equal(openState({ status: "open", settings: { deadline: "2020-01-01T00:00:00Z" } }).open, false);
  assert.equal(openState({ status: "open", settings: {} }).open, true);
});
test("summary counts statuses, departments and days", () => {
  const rows = [{ status: "pending", student_id: "2024-1-60-001", created_at: "2026-10-01T05:00:00Z" }, { status: "accepted", department: "BBA", created_at: "2026-10-01T09:00:00Z", checked_in_at: "x" }, { status: "pending", created_at: "2026-10-02T05:00:00Z", payment_verified: true }];
  const s = summarize(rows);
  assert.equal(s.total, 3); assert.equal(s.status.pending, 2); assert.equal(s.department.CSE, 1); assert.equal(s.department.BBA, 1);
  assert.deepEqual(s.perDay.map((d) => d.n), [2, 1]); assert.equal(s.checkedIn, 1); assert.equal(s.paid, 1);
});
test("CSV export quotes text and blocks spreadsheet formulas", () => {
  const form = { fields: [{ id: "q", type: "long", label: "Why, really?" }, { id: "n", type: "note", label: "info" }] };
  const csv = toCSV(form, [{ name: "=HYPERLINK(\"x\")", student_id: "2024-1-60-001", email: "a@b.c", phone: "01712345678", status: "accepted", answers: { q: "Because,\n\"robots\"" }, created_at: "2026-10-01T05:00:00Z" }]);
  const [head, row] = csv.replace(/^\uFEFF/, "").split("\r\n");
  assert.ok(head.endsWith(",\"Why, really?\""), "question label is quoted, text blocks are left out");
  assert.ok(row.startsWith("\"'=HYPERLINK(\"\"x\"\")\""), "formula is neutralised");
  assert.ok(row.includes("\"Because,\n\"\"robots\"\"\""));
  assert.ok(row.includes("Accepted"));
});

test("attendance code matches the database formula", async () => {
  // Same as public.club_code('abc', 1) in 0016_clubs.sql (checked against the live database: 017180).
  assert.equal(await codeFor("abc", 1), "017180");
  const ref = createHash("sha256").update("s3cret:123456").digest("hex");
  assert.equal(await codeFor("s3cret", 123456), String(parseInt(ref.slice(0, 8), 16) % 1e6).padStart(6, "0"));
  assert.equal(windowOf(60_000), 2); assert.equal(secondsLeft(61_000), 29);
});
test("check-in QR text round-trips and rejects anything else", () => {
  const id = "0b7c3f5e-1111-4222-8333-444455556666";
  assert.deepEqual(parseQr(qrText(id, "012345")), { sessionId: id, code: "012345" });
  assert.equal(parseQr("https://evil.example/" + id), null);
  assert.equal(parseQr(`ewudiots-club:checkin:${id}:12`), null);
});
test("field types used by templates all exist", () => {
  for (const k of ["membership", "event", "competition", "volunteer", "survey"]) for (const x of template(k)) assert.ok(FIELD_TYPES[x.type], x.type);
});
