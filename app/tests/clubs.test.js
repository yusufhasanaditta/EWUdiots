import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { CLUB_PERMS, DEFAULT_ROLES, has, canManage, assignableRanks, assignableRoles } from "../src/clubs/perms.js";
import { template, cleanFields, validate, normPhone, openState, summarize, toCSV, newField, FIELD_TYPES } from "../src/clubs/forms.js";
import { codeFor, windowOf, qrText, parseQr, secondsLeft } from "../src/clubs/checkin.js";
import { normaliseScan, ticketQR, ticketState, showsQR, tierLeft, priceLabel, cleanTicketing, SCAN_RESULTS } from "../src/clubs/tickets.js";

const MIG = (f) => readFileSync(new URL(`../../supabase/migrations/${f}`, import.meta.url), "utf8");
const SQL = MIG("0016_clubs.sql"), SQL18 = MIG("0018_club_platform.sql");

test("every app permission exists in the database migrations", () => {
  for (const p of CLUB_PERMS) assert.ok((SQL + SQL18).includes(`'${p}'`), `${p} missing from the club migrations`);
  assert.equal(new Set(CLUB_PERMS).size, CLUB_PERMS.length, "no duplicate permission keys");
});
test("default positions match the role template, and grant only known permissions", () => {
  const rows = [...SQL18.matchAll(/^ {2}\((\d), '([^']+)', '\w+', array\[([^\]]*)\]/gm)];
  assert.deepEqual(rows.map((m) => `${m[1]} ${m[2]}`), DEFAULT_ROLES.map((r) => `${r.rank} ${r.name}`), "same positions in the same order");
  for (const m of rows) for (const k of m[3].match(/'[^']+'/g) || []) assert.ok(k === "'*'" || CLUB_PERMS.includes(k.slice(1, -1)), `${m[2]}: ${k}`);
});
test("positions you may hand out: below your rank, only permissions you hold", () => {
  const roles = [{ id: "a", rank: 2, perms: ["*"], sort: 1 }, { id: "p", rank: 3, perms: ["posts.write", "refunds.approve"], sort: 2 }, { id: "m", rank: 5, perms: ["orders.manage"], sort: 3 }, { id: "g", rank: 7, perms: [], sort: 4 }];
  assert.deepEqual(assignableRoles({ rank: 2, perms: ["*"] }, roles).map((r) => r.id), ["a", "p", "m", "g"]);
  assert.deepEqual(assignableRoles({ rank: 3, perms: ["posts.write", "orders.manage"] }, roles).map((r) => r.id), ["m", "g"]);
  assert.deepEqual(assignableRoles({ rank: 4, perms: [] }, roles).map((r) => r.id), ["g"]);
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

/* ── v2.14: store, board, calendar, charts ── */
import { TRANSITIONS, canMove, nextSteps, progress, canReturn, stockKey, stockOf, stockKeys, couponDiscount } from "../src/clubs/orders.js";
import { addLine, setQty, byClub, subtotal } from "../src/clubs/cart.js";
import { move, column, stats } from "../src/clubs/kanban.js";
import { toICS } from "../src/clubs/ics.js";
import { niceScale, line, donut, delta } from "../src/clubs/charts.js";
const SQL19 = MIG("0019_club_store_partners.sql");

test("order status moves match public.order_next_ok", () => {
  const body = SQL19.match(/order_next_ok[\s\S]*?select \(cur, nxt\) in \(([\s\S]*?)\);\n\$\$/)[1];
  const pairs = [...body.matchAll(/\('(\w+)', '(\w+)'\)/g)].map((m) => `${m[1]}>${m[2]}`).sort();
  assert.deepEqual(TRANSITIONS.map(([a, b]) => `${a}>${b}`).sort(), pairs);
  assert.ok(canMove("ready", "completed") && !canMove("processing", "completed") && !canMove("completed", "cancelled"));
});
test("an unpaid bKash order can't be prepared; cash can", () => {
  assert.deepEqual(nextSteps({ status: "confirmed", payment_method: "bkash", payment_status: "submitted" }), ["cancelled"]);
  assert.deepEqual(nextSteps({ status: "confirmed", payment_method: "cash", payment_status: "unpaid" }), ["processing", "cancelled"]);
  const p = progress({ status: "processing" });
  assert.deepEqual(p.map((s) => [s.done, s.current]), [[true, false], [false, true], [false, false], [false, false]]);
});
test("returns only inside the window after pickup", () => {
  const done = { status: "completed", completed_at: new Date(Date.now() - 3 * 864e5).toISOString() };
  assert.ok(canReturn(done, 7)); assert.ok(!canReturn(done, 2)); assert.ok(!canReturn(done, 0)); assert.ok(!canReturn({ ...done, status: "ready" }, 7));
});
test("stock keys match the database's", () => {
  const hoodie = { sizes: ["M", "L"], colors: [{ name: "Black" }], track_stock: true, stock: { "M|Black": 3 } };
  assert.equal(stockKey(hoodie, "M", "Black"), "M|Black"); assert.equal(stockOf(hoodie, "M", "Black"), 3); assert.equal(stockOf(hoodie, "L", "Black"), 0);
  assert.deepEqual(stockKeys(hoodie), ["M|Black", "L|Black"]);
  const sticker = { sizes: [], colors: [], track_stock: true, stock: { "": 40 } };
  assert.equal(stockKey(sticker, "", ""), ""); assert.equal(stockOf(sticker), 40);
  assert.equal(stockOf({ ...sticker, preorder: true }), Infinity);
  assert.equal(couponDiscount(1650, { percent: 10 }), 165); assert.equal(couponDiscount(100, { amount: 500 }), 100);
});
test("cart merges the same item and groups by club", () => {
  let c = addLine([], { product_id: "p", club_id: "a", club_name: "A", price: 650, size: "L", color: "", qty: 1 });
  c = addLine(c, { product_id: "p", club_id: "a", club_name: "A", price: 650, size: "L", color: "", qty: 2 });
  c = addLine(c, { product_id: "q", club_id: "b", club_name: "B", price: 450, size: "", color: "", qty: 1 });
  assert.equal(c.length, 2); assert.equal(c[0].qty, 3); assert.equal(subtotal(c), 2400); assert.equal(byClub(c).length, 2);
  assert.equal(setQty(c, c[0], 0).length, 1); assert.equal(addLine(c, { ...c[0], qty: 20 })[0].qty, 10);
});
test("task board moves renumber the target column", () => {
  const t = [{ id: "a", status: "todo", position: 0 }, { id: "b", status: "todo", position: 1 }, { id: "c", status: "doing", position: 0 }];
  assert.deepEqual(move(t, "b", "doing", "c"), [{ id: "b", status: "doing", position: 0 }, { id: "c", status: "doing", position: 1 }]);
  assert.deepEqual(move(t, "a", "todo"), [{ id: "b", status: "todo", position: 0 }, { id: "a", status: "todo", position: 1 }]);
  assert.deepEqual(column(t, "todo").map((x) => x.id), ["a", "b"]); assert.equal(stats(t).total, 3);
});
test("calendar file is valid and escaped", () => {
  const ics = toICS({ id: "e1", title: "Tech Talk; 2026, Q&A", starts_at: "2026-10-28T09:00:00Z", venue: "CSE Lab 403" }, new Date("2026-10-01T00:00:00Z"));
  assert.match(ics, /^BEGIN:VCALENDAR\r\n/); assert.match(ics, /DTSTART:20261028T090000Z/); assert.match(ics, /DTEND:20261028T110000Z/);
  assert.ok(ics.includes("SUMMARY:Tech Talk\\; 2026\\, Q&A\r\n")); assert.ok(ics.split("\r\n").every((l) => l.length <= 75));
});
test("charts: nice axis, escaped labels, empty state", () => {
  assert.deepEqual(niceScale(420), { top: 500, step: 100 });
  assert.deepEqual(niceScale(52000), { top: 60000, step: 20000 });
  assert.equal(niceScale(0).top, 4);
  const svg = line({ title: "t", labels: ["<b>"], series: [{ name: "x", values: [3] }] });
  assert.ok(!svg.includes("<b>") || svg.includes("&lt;b&gt;"));
  assert.match(line({ title: "t", labels: ["a"], series: [{ name: "x", values: [0] }] }), /No data/);
  assert.match(donut({ title: "d", items: [1, 2, 3, 4, 5, 6].map((v) => ({ label: `c${v}`, value: v })) }), /Other/);
  assert.equal(delta(110, 100).text, "↑ 10%"); assert.equal(delta(5, 0), null);
});

test("tickets: what the scanner sends matches what scan_ticket reads", () => {
  const tok = "a".repeat(64), SQL24 = MIG("0024_club_tickets.sql");
  assert.equal(normaliseScan(ticketQR(tok)), `ewud:t:${tok}`);
  assert.equal(normaliseScan("EWUD:T:" + tok.toUpperCase()), `ewud:t:${tok}`, "QR case doesn't matter");
  assert.equal(normaliseScan(" 7f3a-9c21 "), "7F3A9C21", "typed codes lose spaces and dashes");
  const old = "EWUDCLUB:123e4567-e89b-12d3-a456-426614174000:7F3A9C21";
  assert.equal(normaliseScan(old), old, "v2.13 form tickets still scan");
  for (const r of ["admitted", "valid", "used", "invalid", "wrong_event", "unpaid", "cancelled", "waitlisted"]) {
    assert.ok(SCAN_RESULTS[r], r); assert.ok(SQL24.includes(`'${r}'`), `${r} in the SQL`);
  }
});
test("tickets: holder status, QR and seats left", () => {
  const soon = new Date(Date.now() + 864e5).toISOString();
  assert.deepEqual(ticketState({ status: "active", payment: "free", starts_at: soon }), ["Valid", "green"]);
  assert.deepEqual(ticketState({ status: "active", payment: "submitted", starts_at: soon }), ["Payment being checked", "amber"]);
  assert.deepEqual(ticketState({ status: "active", payment: "unpaid", pay_method: "cash", starts_at: soon }), ["Pay at the door", "amber"]);
  assert.deepEqual(ticketState({ status: "used", payment: "free" }), ["Checked in", "green"]);
  assert.ok(showsQR({ status: "active", payment: "verified" }) && showsQR({ status: "active", payment: "unpaid" }));
  assert.ok(!showsQR({ status: "active", payment: "submitted" }) && !showsQR({ status: "used", payment: "free" }) && !showsQR({ status: "cancelled", payment: "free" }));
  assert.equal(tierLeft({ qty: 50 }, 48), 2); assert.equal(tierLeft({ qty: 50 }, 60), 0); assert.equal(tierLeft({}, 5), null);
  assert.equal(priceLabel(0), "Free"); assert.equal(priceLabel(1500), "৳1,500");
});
test("tickets: the organiser's setup is cleaned before saving", () => {
  assert.match(cleanTicketing({ enabled: true, tiers: [] }).error, /at least one/);
  assert.match(cleanTicketing({ enabled: true, tiers: [{ name: "VIP", price: 300 }] }).error, /how people can pay/);
  assert.match(cleanTicketing({ enabled: true, tiers: [{ name: "A", price: 0 }], numbers: { bkash: "12345" } }).error, /Bangladeshi/);
  assert.match(cleanTicketing({ enabled: true, tiers: [{ id: "x", name: "A" }, { id: "x", name: "B" }] }).error, /same id/);
  const { value } = cleanTicketing({ enabled: true, methods: ["bkash", "paypal"], numbers: { bkash: "017 1234 5678", nagad: "" }, scanners: "members",
    tiers: [{ name: " Student ", price: "150", qty: "100" }, { name: "Free entry", price: 0, qty: "" }, { name: "" }] });
  assert.deepEqual(value.tiers, [{ id: "t1", name: "Student", price: 150, qty: 100 }, { id: "t2", name: "Free entry", price: 0 }]);
  assert.deepEqual(value.methods, ["bkash"]); assert.deepEqual(value.numbers, { bkash: "01712345678" }); assert.equal(value.scanners, "members"); assert.equal(value.door_cash, true);
});
