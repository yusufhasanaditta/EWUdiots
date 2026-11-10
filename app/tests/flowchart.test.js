// Official course flowchart: the department's table → 12 semesters (fictional courses, EWU's table layout).
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseFlowchart, parseCell, programKey } from "../src/flowchart.js";

const td = (s) => `<td><div style="text-align: justify;">${s}</div></td>`;
const row = (cells, head) => `<tr>${head ? `<td rowspan="2"><div>${head}</div></td>` : ""}${cells.map(td).join("")}</tr>`;
const HTML = `<p>Course Flowchart</p><table><tbody>
  <tr><td></td><td colspan="2">1st Year</td><td colspan="2">2nd Year</td><td colspan="2">3rd Year</td><td colspan="2">4th Year</td></tr>
  <tr><td></td>${["Course (Credit)", "Pre-requisite", "Course", "Pre-requisite", "Course", "Pre-requisite", "Course", "Pre-requisite"].map(td).join("")}</tr>
  ${row(["ABC101 Intro to Things (3)", "", "ABC201 More Things (3+1=4)", "ABC101", "Elective Wide-I (3)", "", "ABC400 Project-I (0+1=1)", ""], "1st Semester")}
  ${row(["XYZ101 Numbers (3)", "", "", "", "ABC 301 Spaced Code (3+1.5=4.5)", "ABC201, XYZ101", "", ""])}
  ${row(["ABC102 Next Things (3)", "ABC101", "", "", "", "", "", ""], "2nd Semester")}
  <tr><td>Year-Credit</td><td>35</td><td></td><td>35</td><td></td><td>35</td><td></td><td>35</td><td></td></tr>
</tbody></table>`;

test("parses each year's column into semesters 1…12", () => {
  const s = parseFlowchart(HTML);
  assert.deepEqual(s.map((x) => x.n), [1, 2, 4, 7, 10]);
  assert.deepEqual(s[0].courses.map((c) => c.code), ["ABC101", "XYZ101"]);
  assert.equal(s.find((x) => x.n === 4).courses[0].cr, 4);
  assert.deepEqual(s.find((x) => x.n === 4).courses[0].prereq, ["ABC101"]);
  assert.deepEqual(s.find((x) => x.n === 2).courses.map((c) => c.code), ["ABC102"]);
});

test("normalises spaced codes, multi prerequisites and elective slots", () => {
  const y3 = parseFlowchart(HTML).find((x) => x.n === 7).courses;
  assert.deepEqual(y3.map((c) => c.code), ["", "ABC301"]);
  assert.equal(y3[0].title, "Elective Wide-I");
  assert.deepEqual(y3[1].prereq, ["ABC201", "XYZ101"]);
  assert.equal(y3[1].cr, 4.5);
});

test("cells and program names", () => {
  assert.deepEqual(parseCell("ABC110 Object Things (3+1.5=4.5)"), { code: "ABC110", title: "Object Things", cr: 4.5 });
  assert.equal(parseCell("  "), null);
  assert.equal(programKey("B.Sc. in Computer Science & Engineering"), "cse");
  assert.equal(programKey("BBA"), "");
  assert.deepEqual(parseFlowchart("<p>No table here</p>"), []);
});
