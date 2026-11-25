/* EWU's offices and their officers (Proctor, Dean's Office, Registrar, Controller of Examinations…): the parser for the
   ewubd.edu/admin-office pages (used by scripts/offices.mjs) and helpers for the Offices screen. Pure (no DOM): tested in
   tests/offices.test.js. Block + floor come from the official campus map's directory (campus-data.js). */

/** An office: its ewubd.edu page, its name on the campus map, why a student goes there, and (in offices.json) its people. */
export interface Office { path: string; name: string; map: string; help: string; group: string; dept?: string }
export interface Person { name: string; roles: string[]; ext: string; room: string; email: string; phone: string }
export interface OfficeData extends Office { people: Person[] }
export interface Duty { day: number; name: string; about: string; ext: string; room: string; email: string }

/* path: the page on www.ewubd.edu. map: its name in campus-data.js DIRECTORY. help: why a student goes there. */
export const OFFICES: Office[] = [
  { path: "admin-office/office-of-the-proctor", name: "Proctor's Office", map: "Proctor Office", help: "Discipline, harassment complaints, lost ID cards, campus safety and exam-hall issues." },
  { path: "admin-office/deans-office", name: "Dean's Office", map: "Dean's Office", help: "Faculty-level academic matters: probation, course waivers, transfers and petitions." },
  { path: "admin-office/office-of-the-registrar", name: "Registrar's Office", map: "Registrar", help: "Certificates, transcripts, admission records, name corrections and semester drop." },
  { path: "admin-office/office-of-the-controller-of-examination", name: "Controller of Examinations", map: "Controller of Examinations", help: "Exam schedules, results, grade corrections, transcripts and provisional certificates." },
  { path: "admin-office/office-of-the-students-welfare", name: "Students' Welfare (DSW)", map: "Students' Welfare (DSW)", help: "Clubs, scholarships and financial aid, counselling and student activities." },
  { path: "admin-office/office-of-the-vice-chancellor", name: "Vice Chancellor's Office", map: "Vice Chancellor", help: "Appointments with the Vice Chancellor (through the office)." },
  { path: "admin-office/office-of-the-pro-vice-chancellor", name: "Pro Vice Chancellor's Office", map: "Pro Vice Chancellor", help: "Appointments with the Pro Vice Chancellor." },
  { path: "admin-office/office-of-the-treasurer", name: "Treasurer's Office", map: "Treasurer", help: "University finances and fee policy." },
  { path: "admin-office/office-of-the-director-of-finance", name: "Finance & Accounts", map: "Director of Finance", help: "Tuition payments, refunds, fee waivers and payment slips." },
  { path: "admin-office/information-and-communication-services", name: "ICS (IT services)", map: "Information & Communication Services (ICS)", help: "Portal login, EWU email, campus Wi-Fi and computer labs." },
  { path: "admin-office/library-personnel", name: "Library", map: "Dr. S. R. Lasker Library", help: "Borrowing books, library card, e-resources and reading rooms." },
  { path: "admin-office/ewu-medical-centre", name: "Medical Centre", map: "Medical Center", help: "First aid, a doctor on campus and medical certificates." },
  { path: "admin-office/center-for-research-and-training", name: "Research & Training (CRT)", map: "Center for Research & Training (CRT)", help: "Research grants, seminars and training programs." },
  { path: "admin-office/iqac-officials", name: "IQAC", map: "IQAC", help: "Course evaluations and quality surveys." },
  { path: "admin-office/office-of-the-hr-and-logistics", name: "HR & Logistics", map: "HR & Logistics", help: "Staff matters, transport and logistics." },
  { path: "admin-office/engineering-and-maintenance-department", name: "Engineering & Maintenance", map: "Engineering & Maintenance Dept.", help: "Broken fans, lights, projectors or washrooms in classrooms." },
  { path: "admin-office/department-of-media-communications-and-international-affairs", name: "Media & International Affairs", map: "", help: "Press, student exchange and international partnerships." },
  { path: "admin-office/office-of-the-internal-auditor", name: "Internal Audit", map: "Internal Audit", help: "University audit (rarely needed by students)." },
  { path: "admin-office/office-of-the-chief-advisor", name: "Chief Advisor's Office", map: "Chief Advisor", help: "Office of the Chief Advisor." },
  { path: "admin-office/office-of-the-chairperson-bot", name: "Chairperson, Board of Trustees", map: "Chairperson, Board of Trustees", help: "Office of the Chairperson of the Board of Trustees." }
].map((o): Office => ({ ...o, group: /proctor|dean|registrar|controller|welfare|director-of-finance|information-and|library|medical/.test(o.path) ? "student" : "admin" })).concat(
  /* Department offices: lab officers and departmental officers (ECE shares the EEE floor). */
  [["cse-admin-office","CSE","Dept. of CSE"],["eee-administrative-officials","EEE","Dept. of EEE"],["ece-administrative-officials","ECE","Dept. of EEE"],["geb-administrative-officials","GEB","Dept. of Genetic Eng. & Biotechnology"],["pharmacy-administrative-officials","Pharmacy","Dept. of Pharmacy"],["civil-administrative-officials","Civil Engineering","Dept. of Civil Engineering"],["mathematical-and-physical-sciences-administrative-officials","Mathematics & Data Science","Dept. of Mathematical & Physical Sciences"],["english-department-administrative-officials","English","Dept. of English"],["law-department-administrative-officials","Law","Dept. of Law"],["social-relations-administrative-officials","Social Relations","Dept. of Social Relations"],["information-studies-and-library-management-administrative-officials","Information Studies","Dept. of Information Studies"],["sociology-administrative-officials","Sociology","Dept. of Sociology"],["business-administration-administrative-officials","Business Administration","Dept. of Business Administration"],["economics-administrative-officials","Economics","Dept. of Economics"],["mba-administrative-officials","MBA & EMBA","MBA & EMBA"]].map(([p, name, map]): Office => ({ path: `dept-admin-office/${p}`, name: `${name} department office`, map, dept: name, group: "dept", help: `Lab access, department forms, advising papers and notices for ${name} students.` })));

const clean = (s: unknown): string => String(s).replace(/&lt;br\s*\/?&gt;/gi, " ").replace(/&lt;|&gt;/g, "").replace(/&nbsp;|&#160;/g, " ").replace(/&amp;/g, "&").replace(/&#039;|&rsquo;|’/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();
const FIELD = /^(Ext|Extension|Room|Room No|Email|E-mail|Phone|Cell|Mobile|Tel|Telephone)\.?\s*[:.-]/i;

/* An admin-office page → [{ name, roles: [lines], ext, room, email, phone }]. The people sit between the
   "Home/Office/…" breadcrumb and the "Admin Office" side menu; each person's block ends with its contact lines. */
export function parseOfficePage(html: string): Person[] {
  const lines = String(html).replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<!--[\s\S]*?-->/g, "").replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "\n")
    .split("\n").map(clean).filter((x) => x && x !== "/" && x !== "-->" && x !== "--" && x !== "-");
  const a = lines.findIndex((x) => /^Home\s*\/\s*Office\s*\//i.test(x)), b = lines.findIndex((x, i) => i > a && /^Admin Office$/i.test(x));
  if (a < 0) return [];
  const out: Person[] = []; let cur: Person | null = null, contact = false;
  for (const l of lines.slice(a + 1, b < 0 ? undefined : b)) {
    const f = l.match(FIELD);
    if (f) {
      if (!cur) continue;
      contact = true;
      const v = l.slice(f[0].length).trim(), k = f[1].toLowerCase();
      if (k.startsWith("ext")) cur.ext = v.replace(/[^\d,/ ]/g, "").trim();
      else if (k.startsWith("room")) cur.room = v.replace(/^no\.?\s*[:.]?\s*/i, "").trim();
      else if (k.includes("mail")) cur.email = (v.match(/[\w.+-]+@[\w.-]+\.\w+/) || [""])[0].toLowerCase();
      else cur.phone = v;
      continue;
    }
    if (!cur || contact) { cur = { name: l, roles: [], ext: "", room: "", email: "", phone: "" }; out.push(cur); contact = false; }
    else if (cur.roles.length < 4) cur.roles.push(l);
  }
  return out.filter((p) => p.name.length < 80 && (p.ext || p.room || p.email || p.phone || p.roles.length));
}

/* Search offices and people: "proctor", "transcript", a name, a room number. → offices with only the matching people
   (all people when the office itself matches). */
export function searchOffices(offices: OfficeData[] = [], q = ""): OfficeData[] {
  const t = String(q).toLowerCase().trim();
  if (!t) return offices;
  return offices.map((o) => {
    const hit = `${o.name} ${o.help} ${o.map}`.toLowerCase().includes(t);
    const people = o.people.filter((p) => `${p.name} ${p.roles.join(" ")} ${p.room} ${p.email} ${p.ext}`.toLowerCase().includes(t));
    return hit ? o : people.length ? { ...o, people } : null;
  }).filter((o): o is OfficeData => !!o);
}

/* "Daily Duty Schedule of Proctors" page → [{ day: 0-6 (Sunday = 0), name, about, ext, room, email }]. */
export const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const TITLE = /,?\s+(?=(?:Associate |Assistant )?Professor\b|(?:Senior )?Lecturer\b)/;
export function parseDuty(html: string): Duty[] {
  const h = String(html), at = h.search(/On-Duty Proctor/i);
  if (at < 0) return [];
  const t = h.slice(at, h.indexOf("</table>", at));
  return t.split(/<tr[^>]*>/i).slice(1).map((row) => [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => clean(m[1].replace(/<[^>]+>/g, " "))))
    .filter((c) => c.length >= 4 && DAYS.includes(c[0]))
    .map((c) => {
      const email = (c[1].match(/[\w.+-]+@[\w.-]+\.\w+/) || [""])[0].toLowerCase(), who = c[1].replace(/,?\s*Email:.*$/i, "").trim();
      const [name, ...rest] = who.split(TITLE).length > 1 ? who.split(TITLE) : who.split(/,\s*/);
      return { day: DAYS.indexOf(c[0]), name: (name || "").replace(/,$/, "").trim(), about: rest.join(" ").replace(/ (Department|Dept\.)/, ", $1").replace(/\s*,[\s,]*/g, ", ").trim(), ext: c.at(-2) ?? "", room: c.at(-1) ?? "", email };
    });
}
/* Who is on duty today: null on Friday/Saturday or a day nobody is listed. */
export const onDuty = (duty: Duty[] = [], d = new Date()): Duty | null => duty.find((x) => x.day === d.getDay()) || null;
