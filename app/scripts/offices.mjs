// Officers of EWU's offices (Proctor, Dean's Office, Registrar, VC…) from ewubd.edu/admin-office/* → public/data/offices.json.
// Run from app/: node scripts/offices.mjs [folder-with-saved-pages]. Public contact details only (as EWU publishes them).
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { parseOfficePage, parseDuty, OFFICES } from "../src/offices.ts";

const dir = process.argv[2];
const get = async (file, url) => (file && existsSync(file) ? readFileSync(file, "utf8")
  : (await fetch(url, { headers: { "user-agent": "EWUdiots (unofficial student app)" } })).text());
const out = [];
for (const o of OFFICES) {
  const file = dir && `${dir}/${o.path.startsWith("dept") ? "da" : "ao"}-${o.path.split("/")[1]}.html`;
  const html = await get(file, `https://www.ewubd.edu/${o.path}`);
  const people = parseOfficePage(html);
  console.log(o.path, people.length);
  out.push({ ...o, people });
}
const dutyHtml = await get(dir && `${dir}/daily-duty-schedule-proctors.html`, "https://www.ewubd.edu/daily-duty-schedule-proctors");
const duty = parseDuty(dutyHtml), term = (dutyHtml.replace(/<[^>]+>/g, " ").match(/(Spring|Summer|Fall)\s*-\s*(\d{4})/) || []).slice(1).join("-");
console.log("duty", term, duty.length);
writeFileSync("public/data/offices.json", JSON.stringify({ at: new Date().toISOString().slice(0, 10), source: "https://www.ewubd.edu/admin-office", term, duty, offices: out.filter((o) => o.people.length) }));
