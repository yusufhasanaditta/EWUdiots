/* Replicas of the real EWU portal pages (layout from portal screenshots, Oct 2026)
   filled with FAKE data. Used by scripts/ext-e2e.mjs to run the real extension
   against portal-shaped pages. The SENSITIVE values must never leave a page. */

export const STUDENT = { name: "Rafi Ahmed Chowdhury", id: "2026-2-60-999" };
export const SENSITIVE = [
  "1711000999", "House 7, Road 3", "PO 1212", "Banasree", "Charpara", "Narail-7500", "05/03/2005", "AB+",
  "1234567890", "00926205101999", "Abdul Karim", "Secret#123", "Single"
];

const MENU = ["PRE-ADVISING", "ADVISING", "MY CLASS SCHEDULE", "ADVISING RULES", "GRADE REPORT", "SEMESTER DROP", "CURRICULUMN",
  "INSTALLMENT PAYMENT", "MY ACCOUNTS LEDGER", "OFFERED COURSES", "DEGREE REVIEW", "FACULTY EVALUATION", "CONVOCATION APPLICATION", "UPLOAD DOCUMENT"];

// Portal shell: sidebar menu, header with "Hi, <name>", breadcrumb.
const shell = (title, crumb, body, script = "") => `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>${title}</title>
<style>body{font-family:sans-serif;margin:0;display:flex}.side{width:260px;background:#1e3a68}.side a{display:block;color:#fff;padding:10px}
main{flex:1}header{background:#1e3a68;color:#fff;padding:16px;display:flex;justify-content:space-between}td,th{padding:6px 10px;border:1px solid #ddd}
.tab-pane{display:none}.tab-pane.active{display:block}.modal{display:none}</style></head><body>
<nav class="side"><ul class="list-unstyled">${MENU.map((m) => `<li><a href="#">${m}</a></li>`).join("")}</ul></nav>
<main><header><span>EAST WEST UNIVERSITY</span><span><i class="fa fa-bell"></i> 0 <span class="user">Hi, ${STUDENT.name}</span></span></header>
<div class="breadcrumb"><a href="/Home/Index">Home</a> / ${crumb}</div>${body}</main>${script ? `<script>${script}</script>` : ""}</body></html>`;

const table = (head, rows) => `<table class="table"><thead><tr>${head.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
const semSelect = (id, sems, sel) => `<select id="${id}" class="form-control">${sems.map((s) => `<option${s === sel ? " selected" : ""}>${s}</option>`).join("")}</select>`;
// Data appears only after pressing the Show button, like the portal's AJAX tables.
const later = (btn, target, html) => `document.getElementById(${JSON.stringify(btn)}).addEventListener("click",()=>setTimeout(()=>{document.getElementById(${JSON.stringify(target)}).innerHTML=${JSON.stringify(html)}},300));`;

const SCHEDULE_ROWS = [
  ["1", "CHE109", "6", "4", "MW 1:30PM-3:00PM", "FUB-903", "No", "No", "KTRA", "DR. KARIM T. RAHMAN", "ktr.sample@ewubd.edu"],
  ["2", "CHE109 Lab", "6", "4", "S 1:30PM-3:30PM", "FUB-804 (Chemistry Lab)", "No", "No", "KTRA", "DR. KARIM T. RAHMAN", "ktr.sample@ewubd.edu"],
  ["3", "CSE106", "14", "3", "MW 8:30AM-10:00AM", "AB2-702", "No", "No", "SNR", "Ms. Sadia Nur Rahman", "sadia.nur@ewubd.edu"],
  ["4", "MAT102", "7", "3", "MW 4:50PM-6:20PM", "FUB-203", "No", "No", "AMS", "Mr. Arif M. Sarker", "arif.ms@ewubd.edu"],
  ["5", "ENG7101", "23", "3", "TR 10:10AM-11:40AM", "AB1-201", "No", "No", "MSZ", "Ms. Zara Sultana", "zara.s@ewubd.edu"]
];

export const PAGES = {
  "/Home/Index": shell("EWU Student Portal", "Dashboard", `<div class="alert alert-info">Welcome to East West University Student Portal!</div>`),

  "/Home/Profile": shell("EWU Student Portal", "Profile", `
<div class="row"><div class="col-md-4 card"><img alt="" src="data:,"><h4>${STUDENT.name.toUpperCase()}</h4>
<p>Student ID: ${STUDENT.id}</p><p>Unique ID: 00926205101999</p><p>Program: CSE</p><p>Department: CSE</p><p>Credits completed: 7.5</p><p>CGPA: 3.15</p></div>
<div class="col-md-4"><h5>CONTACT INFORMATION</h5><p><i class="fa fa-phone"></i> 1711000999</p><p><i class="fa fa-envelope"></i> ${STUDENT.id}@std.ewubd.edu</p>
<h5>PRESENT ADDRESS</h5><p>House 7, Road 3, Banasree, Dhaka</p><h5>PERMANENT ADDRES</h5><p>Village Charpara, P.O. Kalia, Narail-7500</p></div>
<div class="col-md-4"><h5>OTHER DETAILS</h5><table class="table">
<tr><th>Admitted Semester:</th><td>Summer-2026</td></tr><tr><th>Date of Admission:</th><td>23/04/2026</td></tr>
<tr><th>Date of Birth:</th><td>05/03/2005</td></tr><tr><th>Blood Group:</th><td>AB+</td></tr><tr><th>Marital Status:</th><td>Single</td></tr>
<tr><th>National ID:</th><td>1234567890</td></tr><tr><th>Advisor:</th><td>Dr. Nasima Akter Hossain(NAH)<br><a href="mailto:nasima.h@ewubd.edu">nasima.h@ewubd.edu</a></td></tr>
<tr><th>Pending Documents:</th><td></td></tr></table></div></div>`),

  "/Home/StudentClassSchedule": shell("EWU Student Portal", "Class Schedule", `
<div class="row">${semSelect("sem", ["Spring-2027", "Fall-2026", "Summer-2026"], "Fall-2026")}
<button id="show" class="btn">SHOW COURSES</button> <button class="btn"><i class="fa fa-print"></i> PRINT SLIP</button></div><div id="result"></div>`,
  later("show", "result", table(["Serial", "Course", "Section", "Credits", "Timing", "Room No.", "WithDraw Status", "Drop Status", "Faculty Initial", "Faculty Name", "Faculty Email"], SCHEDULE_ROWS))),

  "/Home/AdvisingRules": shell("EWU Student Portal", "Advising Rules", `<div class="panel"><div class="panel-heading">ADVISING RULES</div><div class="panel-body row">
${[["Program Type", "Undergraduate"], ["Department", "Department of CSE"], ["Completed Credit", ""], ["Max Courses per day", "3"], ["Minimum CGPA Required", "2.16"], ["Max CGPA Required", "4"],
  ["Student ID", STUDENT.id], ["Unique ID", "00926205101999"], ["Max Credit", "15"], ["Min Credit", "9"], ["Max Course", "6"], ["Min Course", "3"], ["Max Course Drop", ""], ["Max Course Left at F TAB", "0"]]
  .map(([l, v]) => `<div class="col-md-6"><div class="col-md-5"><label>${l} :</label></div><div class="col-md-7">${v}</div></div>`).join("")}</div></div>`),

  "/ReportForms/rptGradeSheetStudent.aspx": `<!DOCTYPE html><html><head><title>Grade Report</title></head><body>
<div class="toolbar"><input type="text" value="1" size="3"> of 1 <input type="text" title="Find text in report"> Find | Next</div>
<div id="ReportViewer1"><table><tr><td><b>EAST WEST UNIVERSITY</b></td><td>Student's Copy</td></tr>
<tr><td>Plot No. A/2, Jahurul Islam City, Aftabnagar Dhaka 1212</td></tr></table>
<table><tr><td>Grade Report:</td><td>21 Oct, 2026</td><td>Abdul Karim Chowdhury</td></tr><tr><td>EWU ID:</td><td>${STUDENT.id}</td><td>House 7, Road 3</td></tr>
<tr><td>Unique ID:</td><td>00926205101999</td><td>Banasree</td></tr><tr><td>Name:</td><td><b>${STUDENT.name}</b></td><td>PO 1212, Dhaka</td></tr>
<tr><td>Degree Objective:</td><td>B.Sc. in Computer Science and Engineering</td></tr></table>
<table><tr><td>Course</td><td>Title of the Course</td><td>cr</td><td>grd</td><td>gp</td><td>gpacr</td></tr>
<tr><td colspan="6"><b>2026 Summer</b></td></tr>
<tr><td>CSE103</td><td>Structured Programming</td><td>4.5</td><td>B+</td><td>14.62</td><td>4.5</td></tr>
<tr><td>ENG099</td><td>Remedial English</td><td>0.0</td><td>P</td><td>0.00</td><td>0.0</td></tr>
<tr><td>MAT101</td><td>Differential &amp; Integral Calculus</td><td>3.0</td><td>B</td><td>9.00</td><td>3.0</td></tr>
<tr><td>CSE489</td><td>Mobile Application Development</td><td>3.0</td><td>W</td><td>0.00</td><td>0.0</td></tr>
<tr><td colspan="2">CGPA: 3.15</td><td colspan="4">Term GPA: 3.15</td></tr></table>
<table><tr><td>Summary:</td><td>CGPA: 3.15 (out of 4.00)</td><td>gpacr: 7.50</td><td>Credit Earned: 7.50</td><td>Minimum Credits Required: 140.00</td></tr></table>
<table><tr><td>A+ =4.0</td><td>B- =2.75</td><td>S = Satisfactory=0</td></tr><tr><td>A =3.75</td><td>C+ =2.50</td><td>P= Pass=0</td></tr></table></div></body></html>`,

  "/Home/StudentDegreeReview": shell("EWU Student Portal", "Degree Review", `<fieldset><legend>Degree Analysis</legend><h3>B.Sc. in Computer Science and Engineering</h3>
<div class="row"><div class="col-md-6"><fieldset><legend>Student Information</legend>
<div class="form-group"><label class="col-md-4">Student Id</label><input class="form-control" readonly value="${STUDENT.id}"></div>
<div class="form-group"><label class="col-md-4">Student Name</label><input class="form-control" readonly value="${STUDENT.name}"></div>
<div class="form-group"><label>CGPA</label><input class="form-control" readonly value="3.15"><label>Cr Atn</label><input class="form-control" readonly value="7.5"><label>Cr Earn</label><input class="form-control" readonly value="7.5"></div>
<div class="form-group"><label>Min Credit Required</label><input class="form-control" readonly value="140"></div>
<div class="form-group"><label>Remaining Credit</label><input class="form-control" readonly value="132.5"></div></fieldset></div>
<div class="col-md-6"><fieldset><legend>Credits Completion Summary</legend>${table([], [["Basic Science Courses", "0 (Out of 11)"], ["Mathematics and Statistics Courses", "3 (Out of 15)"],
  ["Compulsory Language and General Education Courses", "0 (Out of 9)"], ["Elective General Education Courses", "0 (Out of 9)"], ["Core Computer Science and Engineering Courses", "4.5 (Out of 62)"],
  ["Capstone Project", "0 (Out of 6)"], ["Non-major Elective Computer Science and Engineering Courses", "0 (Out of 8)"], ["Others", "0 (Out of 0)"], ["Major", "0 (Out of 20)"]])}</fieldset></div></div>
<h3>Core Computer Science and Engineering Courses</h3><p>Completed:4.5 Remaining:57.5</p>
${table(["Sl.", "Course", "Title", "Credit", "Grade", "Factor", "Grd Point", "Crd Earn"], [["1", "CSE103", "Structured Programming", "4.5", "B+", "3.25", "14.62", "4.5"], ["", "", "", "", "", "Total", "14.62", "4.5"]])}
<h3>Other Courses</h3>${table(["Sl.", "Course", "Title", "Credit", "Grade", "Factor", "Grd Point", "Crd Earn"], [["1", "ENG099", "Remedial English", "0", "P", "0", "0", "0"]])}</fieldset>`),

  "/ReportForms/AdvisingSlip.aspx": `<!DOCTYPE html><html><head><title>Advising Slip</title></head><body>
<div class="toolbar"><input type="text" value="1" size="3"> of 1</div><div id="ReportViewer1">
<table><tr><td>East West University</td><td>Student Copy</td></tr><tr><td>A/2, Jahurul Islam Avenue, Jahurul Islam City, Aftabnagar, Dhaka-1212</td></tr></table>
<table><tr><td>Wednesday, October 21, 2026 8:45 PM</td><td><u>Advising / Deposit Slip</u></td></tr>
<tr><td>Name:</td><td>${STUDENT.name}</td><td>ID#</td><td>${STUDENT.id}</td><td>Fall-2026</td></tr></table>
${table(["Course(s)", "Sec", "Cr", "Tuition", "Time-WeekDay", "Room", "Remarks"], [["CHE109", "6", "4.00", "26000.00", "MW 1:30PM-3:00PM", "FUB-903", ""], ["CHE109 Lab", "", "", "", "S 1:30PM-3:30PM", "FUB-804 (Chemistry Lab)", ""],
  ["CSE106", "14", "3.00", "19500.00", "MW 8:30AM-10:00AM", "AB2-702", ""], ["ENG7101", "23", "3.00", "16500.00", "TR 10:10AM-11:40AM", "AB1-201", ""], ["MAT102", "7", "3.00", "19500.00", "MW 4:50PM-6:20PM", "FUB-203", ""]])}
<table><tr><td>Tuition Fee</td><td>81500.00</td><td>a) Bank Asia PLC (Any Branch )</td></tr><tr><td>Laboratory Fee</td><td>4000.00</td><td>b) United Commercial Bank PLC (Any Branch)</td></tr>
<tr><td>Student Activity Fee</td><td>1200.00</td></tr><tr><td>Library Fee</td><td>1000.00</td></tr>
<tr><td>Grand Total</td><td>Last Date:</td><td>24/9/2026</td><td>87700.00</td></tr><tr><td>Grand Total with Late Fee</td><td>Last Date:</td><td>29/10/2026</td><td>88200.00</td></tr>
<tr><td>Grand Total with Late Fee</td><td>Last Date:</td><td>5/11/2026</td><td>88700.00</td></tr><tr><td>Grand Total with Late Fee</td><td>Last Date:</td><td>22/11/2026</td><td>90700.00</td></tr></table>
<p>Student's Signature: ........ Authorized Signature (By Bank): ........</p></div></body></html>`,

  "/Home/OfferedCoursesStudent": shell("EWU Student Portal", "Offered Courses", `<div class="row"><label>Department</label>${semSelect("dept", ["Department of CSE", "Department of EEE"], "Department of CSE")}
<label>Semester</label>${semSelect("sem", ["Fall-2026", "Spring-2027"], "Spring-2027")}<button id="show" class="btn"><i class="fa fa-eye"></i> Show Offered Courses</button> <button class="btn">Print</button></div><div id="result"></div>`,
  later("show", "result", table(["Course", "Section", "Timing", "Room No", "Dedicated department", "Capacity"], [
    ["CSE110", "1", "ST 08:30 AM - 10:00 AM", "AB2-702", "", "38 / 40"], ["CSE110", "2", "MW 10:10 AM - 11:40 AM", "AB2-703", "", "40 / 40"],
    ["CSE110", "1", "R 08:30 AM - 10:30 AM", "AB3-501 (Lab)", "", "38 / 40"], ["MAT104", "1", "MW 01:30 PM - 03:00 PM", "FUB-203", "", "20 / 45"],
    ["MAT104", "2", "ST 10:10 AM - 11:40 AM", "FUB-204", "", "11 / 45"], ["PHY109", "1", "TR 11:50 AM - 01:20 PM", "FUB-501", "", "30 / 40"],
    ["ENG7102", "3", "ST 01:30 PM - 03:00 PM", "AB1-201", "", "25 / 40"], ["AIML501", "1", "F 03:00 PM - 06:00 PM", "215 (General Purpose Programming Lab)", "", "19 / 40"]]))),

  "/Home/PreCourseRegistration": shell("EWU Student Portal", "Pre-Advising", `<h3>SPRING-2027</h3>
<ul class="nav nav-tabs"><li><a href="#f">F Grade Courses</a></li><li class="active"><a href="#rec">Recommended Courses</a></li><li><a href="#d">D / D+ Courses</a></li><li><a href="#r">Retakable Courses</a></li></ul>
<div class="tab-pane" id="f">${table(["Course", "Credits", "Prerequisite"], [["XYZ999", "3", ""]])}</div>
<div class="tab-pane active" id="rec">${table(["Course", "Credits", "Prerequisite"], [["ACT101", "3", ""], ["CSE110", "4.5", "CSE103,CSE106"], ["MAT104", "3", "MAT101"], ["PHY109", "4", ""]])}</div>
<div class="selected"><h4>SELECTED COURSES</h4>${table(["Course", "Credits", "Action"], [["CSE110", "4.5", ""], ["MAT104", "3", ""]])}<p>Credits taken 7.5</p></div>
<div class="modal"><p>6. Student cannot take more than 2 classes in same day.</p></div>`),

  "/": `<!DOCTYPE html><html><head><title>EWU Student Panel: Login</title></head><body><form id="loginform">
<input type="text" placeholder="Student ID" id="username" name="Username"><input type="password" placeholder="Password" id="pass" name="Password">
<button type="button">Sign in</button></form></body></html>`
};
