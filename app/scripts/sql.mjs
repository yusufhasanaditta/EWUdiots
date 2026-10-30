// Run SQL against the live Supabase database through the Management API (no psql needed on Windows).
// Usage (from app/):
//   node scripts/sql.mjs -e "select count(*) from public.clubs"      one query, prints JSON rows
//   node scripts/sql.mjs ../supabase/migrations/0018_x.sql --dry        run it inside a transaction that is rolled back
//   node scripts/sql.mjs ../supabase/migrations/0018_x.sql --apply      run a migration file and record it in _ewud_migrations
// Reads the access token from ../.secrets/supabase-token.env (or SUPABASE_ACCESS_TOKEN).
import { readFileSync } from "node:fs";
import { resolve, basename } from "node:path";

const ROOT = resolve(import.meta.dirname, "../..");
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN || readFileSync(resolve(ROOT, ".secrets/supabase-token.env"), "utf8").match(/sbp_[A-Za-z0-9]+/)[0];
const REF = process.env.SUPABASE_REF || "dbbktfznkaavjmfrndcs";

export async function sql(query) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, { method: "POST", headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" }, body: JSON.stringify({ query }) });
  const t = await r.text();
  if (!r.ok) throw new Error(t);
  return JSON.parse(t);
}

if (process.argv[1]?.endsWith("sql.mjs")) {
  const args = process.argv.slice(2);
  try {
    if (args[0] === "-e") console.log(JSON.stringify(await sql(args[1]), null, 1));
    else if (args[0]) {
      const file = resolve(process.cwd(), args[0]), name = basename(file);
      const body = readFileSync(file, "utf8");
      if (args.includes("--dry")) { await sql(`begin;\n${body}\nrollback;`); console.log(`${name} runs cleanly (rolled back).`); }
      else if (args.includes("--apply")) {
        const done = (await sql(`select exists (select 1 from public._ewud_migrations where name = '${name}') as ok`))[0].ok;
        if (done) { console.log(`${name} is already applied.`); process.exit(0); }
        await sql(`begin;\n${body}\ninsert into public._ewud_migrations (name) values ('${name}');\ncommit;`);
        console.log(`Applied ${name}.`);
      } else console.log(JSON.stringify(await sql(body), null, 1));
    } else console.log("Usage: node scripts/sql.mjs -e \"query\" | file.sql [--apply]");
  } catch (e) { console.error(String(e.message || e).slice(0, 4000)); process.exit(1); }
}
