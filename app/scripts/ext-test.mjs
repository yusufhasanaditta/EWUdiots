// Runs extension/portal.js against a mock EWU profile + schedule page (fake data) and checks the allow-list.
import puppeteer from "puppeteer-core";
import { readFileSync } from "node:fs";
const html = `<html><head><title>EWU Student Portal</title></head><body>
<div>Hi, Rafi Ahmed Chowdhury</div>
<h3>RAFI AHMED CHOWDHURY</h3><p>Student ID: 2026-2-60-999</p><p>Unique ID: 00926205101999</p><p>Program: CSE</p><p>Department: CSE</p><p>Credits completed: 7.5</p><p>CGPA: 3.15</p>
<h4>CONTACT INFORMATION</h4><p>1711223344</p><p>2026-2-60-999@std.ewubd.edu</p>
<h4>PRESENT ADDRESS</h4><p>House 4, PO 1212, Rampura, Dhaka</p>
<h4>PERMANENT ADDRES</h4><p>Village X, P.O. Y, DHK 3400</p>
<table><tr><td>Admitted Semester:</td><td>Summer-2026</td></tr><tr><td>Date of Birth:</td><td>12/02/2005</td></tr><tr><td>Blood Group:</td><td>O+</td></tr><tr><td>National ID:</td><td>4230374979</td></tr>
<tr><td>Advisor:</td><td>Dr. Nasir Sample(NUS)<br>nasir.s@ewubd.edu</td></tr></table>
<table><tr><th>Course</th><th>Section</th><th>Timing</th><th>Room No.</th><th>Faculty Initial</th></tr><tr><td>CSE106</td><td>14</td><td>MW 8:30AM-10:00AM</td><td>AB2-702</td><td>SUN</td></tr></table>
<input type="password" value="hunter2"></body></html>`;
const b = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
const p = await b.newPage();
await p.setContent(html);
await p.evaluate(() => { window.chrome = { storage: { onChanged: { addListener() {} }, local: { get: async () => ({}), set: async (o) => { window.__saved = o; } } }, runtime: { onMessage: { addListener() {} } } }; });
await p.addScriptTag({ content: readFileSync("../extension/portal.js", "utf8") });
await p.evaluate(() => [...document.querySelectorAll("button")].pop().click());
await new Promise((r) => setTimeout(r, 300));
const text = await p.evaluate(() => Object.values(window.__saved)[0].text); // stored as { "page:<kind>": data }
console.log(text + "\n---");
const leaks = ["1711223344", "House 4", "PO 1212", "Village", "DHK 3400", "12/02/2005", "O+", "4230374979", "00926205101999", "hunter2"].filter((s) => text.includes(s));
const must = ["Hi, Rafi Ahmed Chowdhury", "2026-2-60-999", "CGPA: 3.15", "Program: CSE", "Credits completed: 7.5", "nasir.s@ewubd.edu", "Summer-2026", "NUS", "CSE106\t14\tMW 8:30AM-10:00AM"].filter((s) => !text.includes(s));
console.log(leaks.length ? "LEAKS: " + leaks.join(", ") : "No sensitive data leaked.");
console.log(must.length ? "MISSING: " + must.join(", ") : "All academic fields kept.");
await b.close();
process.exitCode = leaks.length || must.length ? 1 : 0;
