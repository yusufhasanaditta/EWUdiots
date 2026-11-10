/* EWU's official "Course Flowchart" (a department's undergraduate-programs page): which courses the department sets for
   each of the 12 semesters (4 years × 3 terms). Pure (no DOM): used by api/flowchart.js, the dev server and unit tests.
   Only departments that publish a flowchart table are listed; the app falls back to the student's own road map. */
import { pageText } from "./acadcal.js";

export const FLOWCHARTS = {
  cse: { name: "B.Sc. in Computer Science and Engineering", url: "https://fse.ewubd.edu/computer-science-engineering/undergraduate-programs", match: /computer science|\bcse\b/i },
  // Civil publishes its flowchart only as a picture: shown as is.
  civil: { name: "B.Sc. in Civil Engineering", url: "https://fse.ewubd.edu/civil-engineering/ug-curriculum-fall-2024-onward", match: /civil/i,
    image: "https://www.ewubd.edu/storage/app/media/Civil/Flow%20Chart/Course%20Flowchart_Fall%202024_Updated.jpg" }
};
const HOSTS = /^(fse|flass|fbe|www)\.ewubd\.edu$/i;

/* Program name from the profile ("B.Sc. in Computer Science & Engineering") → flowchart key, or "". */
export const programKey = (program = "") => Object.keys(FLOWCHARTS).find((k) => FLOWCHARTS[k].match.test(program)) || "";

/* "CSE103 Structured Programming (3+1.5=4.5)" → { code, title, cr }; "Elective Major-I (3+1=4)" → a slot with no code. */
export function parseCell(s) {
  const t = String(s || "").replace(/\s+/g, " ").trim();
  if (!t) return null;
  const cr = t.match(/\(([\d.+=\s]+)\)\s*$/), m = t.replace(/\(([\d.+=\s]+)\)\s*$/, "").trim().match(/^([A-Z]{3,4})\s?(\d{3,4}[A-Z]?)\s+(.+)$/);
  const credits = cr ? Number(cr[1].split("=").pop()) || 0 : 0;
  return m ? { code: m[1] + m[2], title: m[3].trim(), cr: credits } : { code: "", title: t.replace(/\(([\d.+=\s]+)\)\s*$/, "").trim(), cr: credits };
}
const codes = (s) => [...String(s || "").matchAll(/\b([A-Z]{3,4})\s?(\d{3,4}[A-Z]?)\b/g)].map((m) => m[1] + m[2]);

/* The flowchart table → [{ n: 1…12, year, term, courses: [{ code, title, cr, prereq: [codes] }] }]. Columns are
   (course, prerequisite) pairs per year; each semester's first row also holds the "1st Semester" cell (rowspan). */
export function parseFlowchart(html) {
  const h = String(html), at = h.search(/Course\s*Flowchart/i), start = h.indexOf("<table", at < 0 ? 0 : at);
  if (start < 0) return [];
  const table = h.slice(start, h.indexOf("</table>", start));
  const out = []; let term = 0;
  for (const row of table.split(/<tr[^>]*>/i).slice(1)) {
    const cells = [...row.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((m) => pageText(m[1]));
    const head = cells[0]?.match(/^(\d)(?:st|nd|rd|th)\s+Semester$/i);
    if (head) { term = Number(head[1]); cells.shift(); } else if (cells.length !== 8 || !term) continue;
    for (let y = 0; y < 4; y++) {
      const c = parseCell(cells[y * 2]);
      if (!c) continue;
      const n = y * 3 + term;
      let sem = out.find((s) => s.n === n);
      if (!sem) out.push((sem = { n, year: y + 1, term, courses: [] }));
      sem.courses.push({ ...c, prereq: codes(cells[y * 2 + 1]) });
    }
  }
  return out.sort((a, b) => a.n - b.n);
}

export async function fetchFlowchart(key) {
  const f = FLOWCHARTS[key];
  if (!f) throw new Error("No flowchart for this program");
  if (f.image) return { key, name: f.name, source: f.url, image: f.image, semesters: [] };
  const r = await fetch(f.url, { headers: { "user-agent": "EWUdiots (unofficial student app)" } });
  if (!HOSTS.test(new URL(r.url).hostname)) throw new Error("Redirected off ewubd.edu"); // never follow a redirect elsewhere
  if (!r.ok) throw new Error(`ewubd.edu answered ${r.status}`);
  const semesters = parseFlowchart(await r.text());
  if (!semesters.length) throw new Error("No flowchart found on the page");
  return { key, name: f.name, source: f.url, semesters };
}
