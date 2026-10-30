// Put the reviewed EWU club information (public/data/clubs-ewu.json, from import-ewu-clubs.mjs) into the database:
//   • logo → copied into storage (clubs-public/ewu/<slug>.<ext>) so the app doesn't depend on the Archive
//   • about, faculty moderators, club email → only where the club hasn't filled them in itself
//   • archived news and events → public posts marked as coming from the EWU club site (re-running adds nothing twice)
// Usage (from app/):  node scripts/seed-ewu-clubs.mjs [--dry]
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { sql } from "./sql.mjs";

const ROOT = resolve(import.meta.dirname, "../..");
const DATA = JSON.parse(readFileSync(resolve(import.meta.dirname, "../public/data/clubs-ewu.json"), "utf8"));
const SERVER = Object.fromEntries(readFileSync(resolve(ROOT, ".secrets/server.env"), "utf8").split(/\r?\n/).filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]));
const URL_ = (readFileSync(resolve(import.meta.dirname, "../.env"), "utf8").match(/VITE_SUPABASE_URL=(\S+)/) || [])[1];
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || SERVER.SUPABASE_SERVICE_ROLE_KEY;
const DRY = process.argv.includes("--dry");
const q = (s) => `'${String(s ?? "").replace(/'/g, "''")}'`;

async function copyLogo(slug, src) {
  if (!src || DRY) return "";
  const r = await fetch(src, { signal: AbortSignal.timeout(60e3) }).catch(() => null);
  if (!r?.ok) return "";
  const type = (r.headers.get("content-type") || "image/jpeg").split(";")[0];
  if (!/^image\/(jpeg|png|webp|gif)$/.test(type)) return "";
  const path = `ewu/${slug}.${type.split("/")[1].replace("jpeg", "jpg")}`;
  const up = await fetch(`${URL_}/storage/v1/object/clubs-public/${path}`, { method: "POST", headers: { authorization: `Bearer ${KEY}`, "content-type": type, "x-upsert": "true", "cache-control": "max-age=604800" }, body: Buffer.from(await r.arrayBuffer()) });
  if (!up.ok) { console.log(`  logo upload failed: ${await up.text()}`); return ""; }
  return `${URL_}/storage/v1/object/public/clubs-public/${path}`;
}

for (const [slug, c] of Object.entries(DATA.clubs)) {
  const logo = await copyLogo(slug, c.logo);
  const info = { site: c.site, about_source: c.about_source, moderators: c.moderators, fetched: DATA.fetched };
  const advisors = c.moderators.map((m) => m.name).join(", ").slice(0, 300);
  const stmts = [
    `update public.clubs set source = 'ewubd', ewu_info = ${q(JSON.stringify(info))}::jsonb,
       about = case when about = '' then ${q(c.about.slice(0, 4000))} else about end,
       advisors = case when advisors = '' then ${q(advisors)} else advisors end,
       contact_email = case when contact_email = '' then ${q(c.email)} else contact_email end,
       logo_url = case when logo_url = '' or logo_url like '%/clubs-public/ewu/%' then ${q(logo)} else logo_url end
     where slug = ${q(slug)};`,
    ...c.items.map((it) => `insert into public.club_posts (club_id, author_id, author_name, kind, title, body, images, link, visibility, status, source_url, created_at, published_at)
       select id, null, short_name, ${q(it.kind === "event" ? "event" : "news")}, ${q(it.title.length >= 3 ? it.title : it.title + "…")}, ${q(it.excerpt)},
         ${it.image ? `array[${q(it.image)}]` : "'{}'"}, ${q(it.url)}, 'public', 'published', ${q(it.url)},
         ${it.date ? `${q(it.date)}::date + time '12:00'` : "now()"}, ${it.date ? `${q(it.date)}::date + time '12:00'` : "now()"}
       from public.clubs where slug = ${q(slug)}
       on conflict (club_id, source_url) where source_url <> '' do nothing;`)
  ];
  if (DRY) { console.log(`${slug}: ${c.items.length} posts, logo ${c.logo ? "yes" : "no"}`); continue; }
  await sql(`begin;\n${stmts.join("\n")}\ncommit;`);
  console.log(`${slug.padEnd(24)} logo ${logo ? "✓" : "–"}  posts ${c.items.length}  moderators ${c.moderators.length}`);
}
const [n] = await sql("select count(*) filter (where source = 'ewubd') clubs, (select count(*) from public.club_posts where source_url <> '') posts from public.clubs");
console.log(`Done: ${n.clubs} clubs carry EWU information, ${n.posts} archived posts.`);
