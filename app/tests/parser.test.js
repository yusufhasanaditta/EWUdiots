// Fixtures mirror the real EWU portal layouts; all names/IDs/emails are fictional.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parsePortalText, mergeParsed, offeredToPlanner, normSemester, currentSemester } from "../src/parser.js";

const CLASS_SCHEDULE = `Hi, Rafi Ahmed Chowdhury
Home / Class Schedule
Fall-2026
Serial\tCourse\tSection\tCredits\tTiming\tRoom No.\tWithDraw Status\tDrop Status\tFaculty Initial\tFaculty Name\tFaculty Email
1\tCHE109\t6\t4\tMW 1:30PM-3:00PM\tFUB-903\tNo\tNo\tKTRA\tDR. KARIM T. RAHMAN\tktr.sample@ewubd.edu
2\tCHE109 Lab\t6\t4\tS 1:30PM-3:30PM\tFUB-804 (Chemistry Lab)\tNo\tNo\tKTRA\tDR. KARIM T. RAHMAN\tktr.sample@ewubd.edu
3\tCSE106\t14\t3\tMW 8:30AM-10:00AM\tAB2-702\tNo\tNo\tSUN\tMs. Sadia Nur\tsadia.nur@ewubd.edu
4\tMAT102\t7\t3\tMW 4:50PM-6:20PM\tFUB-203\tNo\tNo\tBOLT\tMr. Imran Bolt\timran.bolt@ewubd.edu
5\tENG7101\t23\t3\tTR 10:10AM-11:40AM\tAB1-201\tNo\tNo\tMSAZ\tMs. Zara Sample\tzara.s@ewubd.edu`;

// OCR output: cells collapse to spaces and the timing cell wraps
const CLASS_SCHEDULE_OCR = `Serial Course Section Credits Timing Room No.
1 CHE109 6 4 MW 1:30PM-
3:00PM FUB-903 No No KTRA DR. KARIM T. RAHMAN
3 CSE106 14 3 MW 8:30AM-10:00AM AB2-702 No No SUN Ms. Sadia Nur`;

const ADVISING_SLIP = `Advising / Deposit Slip
Name: Rafi Ahmed Chowdhury   ID# 2026-2-60-999   Fall-2026
Course(s)\tSec\tCr\tTuition\tTime-WeekDay\tRoom\tRemarks
CHE109\t6\t4.00\t26000.00\tMW 1:30PM-3:00PM\tFUB-903
CHE109 Lab\t\t\t\tS 1:30PM-3:30PM\tFUB-804 (Chemistry Lab)
CSE106\t14\t3.00\t19500.00\tMW 8:30AM-10:00AM\tAB2-702
Tuition Fee 81500.00
Laboratory Fee 4000.00
Grand Total Last Date: 24/9/2026 87700.00
Grand Total with Late Fee Last Date: 29/10/2026 88200.00
Grand Total with Late Fee Last Date: 5/11/2026 88700.00`;

const GRADE_REPORT = `EAST WEST UNIVERSITY
EWU ID: 2026-2-60-999
Name: Rafi Ahmed Chowdhury
Degree Objective: B.Sc. in Computer Science and Engineering
Course Title of the Course cr grd gp gpacr
2026 Summer
CSE103 Structured Programming 4.5 B+ 14.62 4.5
ENG099 Remedial English 0.0 P 0.00 0.0
MAT101 Differential & Integral Calculus 3.0 B 9.00 3.0
CGPA: 3.15 Term GPA: 3.15
Summary: CGPA: 3.15 (out of 4.00) gpacr: 7.50 Credit Earned: 7.50 Minimum Credits Required: 140.00`;

const PROFILE = `Hi, Rafi Ahmed Chowdhury
RAFI AHMED CHOWDHURY
Student ID: 2026-2-60-999
Unique ID: 00000000000000
Program: CSE
Department: CSE
Credits completed: 7.5
CGPA: 3.15
CONTACT INFORMATION
01700000000
2026-2-60-999@std.ewubd.edu
PRESENT ADDRESS
House 1, Road 2, Dhaka
Admitted Semester:\tSummer-2026
Date of Birth:\t01/01/2005
National ID:\t1234567890
Blood Group:\tO+
Advisor:\tDr. Nasir Uddin Sample(NUS)
nasir.sample@ewubd.edu`;

const OFFERED = `Home / Offered Courses
Department of CSE Fall-2026
Course\tSection\tTiming\tRoom No\tDedicated department\tCapacity
AIML501\t1\tF 03:00 PM - 06:00 PM\t110\t\t19 / 40
AIML502\t1\tA 09:00 AM - 12:00 PM\t221\t\t24 / 40
AIML504\t1\tF 05:30 PM - 08:30 PM\t217\t\t0 / 0
AIML507\t1\tF 09:00 AM - 12:00 PM\t215 (General Purpose Programming Lab)\t\t29 / 40
CSE110\t2\tST 10:10 AM - 11:40 AM\t630\t\t40 / 40`;

const RULES = `ADVISING RULES
Program Type : Undergraduate Department : Department of CSE
Minimum CGPA Required : 2.16 Max CGPA Required : 4
Max Credit : 15 Min Credit : 9
Max Course : 6 Min Course : 3
Max Courses per day : 3`;

const DEGREE = `Credits Completion Summary
Basic Science Courses 0 (Out of 11)
Mathematics and Statistics Courses 3 (Out of 15)
Core Computer Science and Engineering Courses 4.5 (Out of 62)
Capstone Project 0 (Out of 6)`;

const PRE_ADVISING = `SPRING-2027
Recommended Courses
Course Credits Prerequisite
ACT101 3
BUS231 3 ENG7101
CSE110 4.5 CSE103,CSE106`;

test("class schedule (copy-paste): routine + faculty directory", () => {
  const r = parsePortalText(CLASS_SCHEDULE);
  assert.equal(r.profile.name, "Rafi Ahmed Chowdhury");
  assert.equal(r.routine.length, 5);
  assert.deepEqual(r.routine[0], { code: "CHE109", title: "", sec: "6", days: "MW", start: "13:30", end: "15:00", room: "FUB-903", faculty: "KTRA", lab: false });
  assert.equal(r.routine[1].lab, true);
  assert.equal(r.routine[1].days, "S");
  assert.equal(r.routine[1].room, "FUB-804 (Chemistry Lab)");
  assert.equal(r.routine[4].code, "ENG7101");
  assert.equal(r.routine[4].days, "TR");
  assert.equal(r.routine[2].room, "AB2-702");
  const k = r.faculty.find((f) => f.init === "KTRA");
  assert.equal(k.email, "ktr.sample@ewubd.edu");
  assert.equal(k.name, "Dr. Karim T. Rahman");
  assert.equal(r.offered.length, 0);
});

test("class schedule (OCR with wrapped timing cell)", () => {
  const r = parsePortalText(CLASS_SCHEDULE_OCR);
  assert.equal(r.routine.length, 2);
  assert.equal(r.routine[0].end, "15:00");
  assert.equal(r.routine[0].room, "FUB-903");
  assert.equal(r.routine[1].faculty, "SUN");
});

test("advising slip: routine, lab inherits section, payment schedule", () => {
  const r = parsePortalText(ADVISING_SLIP);
  assert.equal(r.profile.name, "Rafi Ahmed Chowdhury");
  assert.equal(r.profile.id, "2026-2-60-999");
  assert.equal(r.routine.length, 3);
  assert.equal(r.routine[1].sec, "6");
  assert.equal(r.routine[1].lab, true);
  assert.equal(r.payments.schedule.length, 3);
  assert.deepEqual(r.payments.schedule[0], { late: false, due: "2026-09-24", amount: 87700 });
  assert.equal(r.payments.schedule[1].late, true);
  assert.equal(r.payments.fees.tuition, 81500);
});

test("grade report: semester headers, P grade, CGPA, credits", () => {
  const r = parsePortalText(GRADE_REPORT);
  assert.equal(r.grades.length, 3);
  assert.deepEqual(r.grades[0], { code: "CSE103", title: "Structured Programming", cr: 4.5, g: "B+", sem: "Summer-2026" });
  assert.equal(r.grades[1].g, "P");
  assert.equal(r.grades[2].title, "Differential & Integral Calculus");
  assert.equal(r.profile.cgpa, 3.15);
  assert.equal(r.profile.creditsDone, 7.5);
  assert.equal(r.profile.creditsTotal, 140);
  assert.equal(r.profile.program, "B.Sc. in Computer Science and Engineering");
});

test("profile: academic fields only, sensitive fields never extracted", () => {
  const r = parsePortalText(PROFILE);
  assert.equal(r.profile.id, "2026-2-60-999");
  assert.equal(r.profile.email, "2026-2-60-999@std.ewubd.edu");
  assert.equal(r.profile.advisor, "Dr. Nasir Uddin Sample");
  assert.equal(r.profile.advisorInitial, "NUS");
  assert.equal(r.profile.advisorEmail, "nasir.sample@ewubd.edu");
  assert.equal(r.profile.admitted, "Summer-2026");
  assert.equal(r.profile.department, "CSE");
  const all = JSON.stringify(r);
  for (const secret of ["1234567890", "01700000000", "House 1", "01/01/2005", "O+"]) assert.ok(!all.includes(secret), "leaked " + secret);
});

test("offered courses: seats, 4-letter codes, AM/PM with spaces", () => {
  const r = parsePortalText(OFFERED);
  assert.equal(r.routine.length, 0);
  assert.equal(r.offered.length, 5);
  assert.deepEqual(r.offered[0], { code: "AIML501", title: "", sec: "1", days: "F", start: "15:00", end: "18:00", room: "110", faculty: "", lab: false, enrolled: 19, capacity: 40 });
  assert.equal(r.offered[1].days, "A");
  assert.equal(r.offered[3].room, "215 (General Purpose Programming Lab)");
  const P = offeredToPlanner(r.offered);
  assert.equal(P.AIML501.sections[0].seats, 21);
  assert.equal(P.CSE110.sections[0].seats, 0);
});

test("advising rules, degree review, pre-advising", () => {
  assert.deepEqual(parsePortalText(RULES).rules, { maxCredit: 15, minCredit: 9, maxPerDay: 3, maxCourses: 6, minCourses: 3, minCgpa: 2.16 });
  const d = parsePortalText(DEGREE).degree;
  assert.equal(d.length, 4);
  assert.deepEqual(d[2], { category: "Core Computer Science and Engineering Courses", done: 4.5, total: 62 });
  const p = parsePortalText(PRE_ADVISING).recommended;
  assert.deepEqual(p[2], { code: "CSE110", cr: 4.5, prereq: ["CSE103", "CSE106"] });
});

test("semester helpers", () => {
  assert.equal(normSemester("2026 Summer"), "Summer-2026");
  assert.equal(normSemester("FALL-2026"), "Fall-2026");
  assert.equal(currentSemester(new Date("2026-10-04")), "Fall-2026");
  assert.equal(currentSemester(new Date("2027-02-01")), "Spring-2027");
});

// Ctrl+A copy of a portal page also copies the sidebar menu ("OFFERED COURSES"…).
const SIDEBAR = "PRE-ADVISING\nADVISING\nMY CLASS SCHEDULE\nADVISING RULES\nGRADE REPORT\nOFFERED COURSES\nDEGREE REVIEW\n";

test("sidebar menu text doesn't turn a class schedule into offered courses", () => {
  const r = parsePortalText(SIDEBAR + CLASS_SCHEDULE);
  assert.equal(r.routine.length, 5);
  assert.equal(r.offered.length, 0);
  assert.equal(r.sem, "Fall-2026");
});

test("page semester: schedule heading, slip ID line", () => {
  assert.equal(parsePortalText(ADVISING_SLIP).sem, "Fall-2026");
  assert.equal(parsePortalText(GRADE_REPORT).sem, "");
});

test("merge: schedule + slip de-duplicated, running semester wins, dated grades kept", () => {
  const nextSem = parsePortalText(CLASS_SCHEDULE.replace("Fall-2026", "Spring-2027"));
  const m = mergeParsed([parsePortalText(CLASS_SCHEDULE), parsePortalText(CLASS_SCHEDULE), nextSem], new Date("2026-10-21"));
  assert.equal(m.sem, "Fall-2026");
  assert.equal(m.routine.length, 5);
  const undated = { ...parsePortalText(""), grades: [{ code: "CSE103", title: "Structured Programming", cr: 4.5, g: "B+", sem: "" }] };
  const dated = parsePortalText(GRADE_REPORT);
  const g = mergeParsed([undated, dated]).grades;
  assert.equal(g.filter((x) => x.code === "CSE103").length, 1);
  assert.ok(g.every((x) => x.sem));
  // Without the running semester, the newest one is used.
  assert.equal(mergeParsed([nextSem], new Date("2027-06-01")).sem, "Spring-2027");
});

test("merge: full program name beats the short code", () => {
  const a = { ...parsePortalText(""), profile: { program: "B.Sc. in Computer Science and Engineering" } };
  const b = { ...parsePortalText(""), profile: { program: "CSE" } };
  assert.equal(mergeParsed([a, b]).profile.program, "B.Sc. in Computer Science and Engineering");
  assert.equal(mergeParsed([b, a]).profile.program, "B.Sc. in Computer Science and Engineering");
});

test("times crossing noon with AM/PM on one side only (OCR)", () => {
  const a = parsePortalText("CSE106 14 MW 11:50 - 1:20PM AB2-702").routine[0];
  assert.deepEqual([a.start, a.end], ["11:50", "13:20"]);
  const b = parsePortalText("CSE106 14 MW 11:30AM-1:00 AB2-702").routine[0];
  assert.deepEqual([b.start, b.end], ["11:30", "13:00"]);
});

test("Degree Objective stops at the table cell", () => {
  const r = parsePortalText("Degree Objective:\tB.Sc. in Computer Science and Engineering\tAdvisor:\tDr. X Y(ABC)");
  assert.equal(r.profile.program, "B.Sc. in Computer Science and Engineering");
});
