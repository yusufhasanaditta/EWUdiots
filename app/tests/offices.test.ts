// Offices: reading an ewubd.edu admin-office page, the proctor duty roster, and search. Made-up people.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseOfficePage, parseDuty, searchOffices, onDuty } from "../src/offices.ts";

const page = `<nav>Home</nav><h2>Office of the Test</h2><p>Home/Office/Office of the Test</p>
  <div><h4>Dr. Test Person</h4><p>Proctor, EWU</p><p>Associate Professor</p><p>/</p><!-- x --><p>Ext: 999</p><p>Room No: 123</p><p>Email: Test@ewubd.edu</p></div>
  <div><h4>Sample Officer</h4><p>Senior Departmental Officer &amp; Helper</p><p>-->Ext: 111</p><p>Email: sample@ewubd.edu</p></div>
  <aside><p>Admin Office</p><p>Office of The Registrar</p><p>Ext: 1</p></aside>`;

test("an office page lists each person with role, extension, room and email", () => {
  const p = parseOfficePage(page);
  assert.equal(p.length, 2);
  assert.deepEqual(p[0], { name: "Dr. Test Person", roles: ["Proctor, EWU", "Associate Professor"], ext: "999", room: "123", email: "test@ewubd.edu", phone: "" });
  assert.equal(p[1].roles[0], "Senior Departmental Officer & Helper");
  assert.equal(p[1].room, "");
  assert.deepEqual(parseOfficePage("<p>nothing here</p>"), []);
});

test("the proctor duty roster reads each weekday", () => {
  const html = `<table><tr><th>Day</th><th>On-Duty Proctor</th><th>Designation</th><th>Office Extension</th><th>Room No</th></tr>
    <tr><td>Sunday</td><td>Dr. Test Person, Assistant Professor, Department of Testing, Email: test@ewubd.edu</td><td>Assistant Proctor</td><td>999</td><td>123</td></tr>
    <tr><td>Monday</td><td>Ms. Sample Name Senior Lecturer Department of Law Email:sample@ewubd.edu</td><td>Assistant Proctor</td><td>111</td><td>816</td></tr>
    <tr><td>Thursday</td><td>Proxy (on-duty Proctor)</td><td>404</td><td>362</td></tr></table>`;
  const d = parseDuty(html);
  assert.deepEqual(d.map((x) => [x.day, x.name, x.room]), [[0, "Dr. Test Person", "123"], [1, "Ms. Sample Name", "816"], [4, "Proxy (on-duty Proctor)", "362"]]);
  assert.equal(d[0].about, "Assistant Professor, Department of Testing");
  assert.equal(d[1].email, "sample@ewubd.edu");
  assert.equal(onDuty(d, new Date(2026, 10, 22))?.name, "Dr. Test Person"); // a Sunday
  assert.equal(onDuty(d, new Date(2026, 10, 27)), null); // a Friday
});

test("search finds offices by purpose and people by name or room", () => {
  const P = (name: string, room: string, roles: string[] = []) => ({ name, roles, room, email: "", ext: "", phone: "" });
  const O = { path: "", group: "student" };
  const offices = [{ ...O, name: "Proctor's Office", help: "Lost ID cards and discipline", map: "", people: [P("Dr. Test Person", "123", ["Proctor"]), P("Other", "9")] },
    { ...O, name: "Registrar's Office", help: "Transcripts", map: "", people: [P("Sample Officer", "456")] }];
  assert.deepEqual(searchOffices(offices, "transcript").map((o) => o.name), ["Registrar's Office"]);
  assert.equal(searchOffices(offices, "lost id")[0].people.length, 2); // office matches: everyone
  assert.deepEqual(searchOffices(offices, "123").map((o) => o.people.map((p) => p.name)), [["Dr. Test Person"]]);
  assert.equal(searchOffices(offices, "").length, 2);
});
