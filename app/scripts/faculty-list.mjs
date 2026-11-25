// Builds public/data/offered/<Semester>.json from a "faculty list" PDF (ewucoursetracker.live → Download PDF).
//   node scripts/faculty-list.mjs <file.pdf|file.txt> <Spring-2027> [extra.txt]
// Needs `pdftotext` (poppler) for a PDF. Pages the PDF holds only as a picture can be typed into extra.txt
// (same "CODE SEC FACULTY TAKEN/CAP DAYS hh:mm AM - hh:mm PM ROOM" lines). Updates index.json, newest first.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { parseFacultyList, groupRows } from "../src/offered.js";

const [src, sem, extra] = process.argv.slice(2);
if (!src || !/^(Spring|Summer|Fall)-\d{4}$/.test(sem || "")) { console.error("usage: node scripts/faculty-list.mjs <file.pdf|txt> <Spring-2027> [extra.txt]"); process.exit(1); }
const text = (extra ? readFileSync(extra, "utf8") + "\n" : "") + (src.endsWith(".pdf") ? execFileSync("pdftotext", ["-raw", src, "-"], { encoding: "utf8", maxBuffer: 64e6 }) : readFileSync(src, "utf8"));
const rows = parseFacultyList(text);
const missing = rows.filter((r) => !r.time || !r.cap || !r.room);
if (missing.length) console.warn(`${missing.length} rows still miss a piece:`, missing.slice(0, 10));
const courses = groupRows(rows);
const dir = new URL("../public/data/offered/", import.meta.url);
const list = { sem, updated: new Date().toISOString().slice(0, 10), source: "ewucoursetracker.live", courses };
writeFileSync(new URL(`${sem}.json`, dir), JSON.stringify(list));
const idxFile = new URL("index.json", dir), key = (s) => Number(s.slice(-4)) * 3 + ["Spring", "Summer", "Fall"].indexOf(s.split("-")[0]);
const idx = existsSync(idxFile) ? JSON.parse(readFileSync(idxFile, "utf8")) : { semesters: [] };
idx.semesters = [{ sem, updated: list.updated, courses: courses.length, sections: courses.reduce((a, c) => a + c.sections.length, 0) }, ...idx.semesters.filter((s) => s.sem !== sem)].sort((a, b) => key(b.sem) - key(a.sem));
writeFileSync(idxFile, JSON.stringify(idx, null, 1));
console.log(`${sem}: ${rows.length} rows → ${courses.length} courses, ${idx.semesters[0].sections} sections`);
