// One-shot backend setup: creates (or reuses) the "ewudiots" Supabase project, runs every migration, turns on
// 6-digit email codes sent through the team Gmail, and writes the keys to app/.env and extension/config.js.
// Usage (from app/):  SUPABASE_ACCESS_TOKEN=sbp_... node scripts/setup-supabase.mjs [owner-email]
// Reads the SMTP login from ../.secrets/smtp.env (never committed). Safe to re-run.
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { randomBytes } from "node:crypto";

const ROOT = resolve(import.meta.dirname, "../..");
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const SITE = process.env.SITE_URL || "https://ewudiots.vercel.app";
if (!TOKEN) throw new Error("Set SUPABASE_ACCESS_TOKEN (supabase.com/dashboard/account/tokens).");
const smtp = Object.fromEntries(readFileSync(resolve(ROOT, ".secrets/smtp.env"), "utf8").split(/\r?\n/).filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]));
const OWNER = process.argv[2] || smtp.SMTP_USER;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(path, { method = "GET", body } = {}) {
  const r = await fetch("https://api.supabase.com" + path, { method, headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j; try { j = t ? JSON.parse(t) : null; } catch { j = t; }
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status} ${typeof j === "string" ? j : JSON.stringify(j)}`);
  return j;
}
const sql = (ref, query) => api(`/v1/projects/${ref}/database/query`, { method: "POST", body: { query } });

/* 1. Project */
let project = (await api("/v1/projects")).find((p) => p.name === "ewudiots");
if (!project) {
  const [org] = await api("/v1/organizations");
  if (!org) throw new Error("This Supabase account has no organization. Create one at supabase.com/dashboard first.");
  const dbPass = randomBytes(24).toString("base64url");
  project = await api("/v1/projects", { method: "POST", body: { name: "ewudiots", organization_id: org.id, region: "ap-southeast-1", db_pass: dbPass } });
  writeFileSync(resolve(ROOT, ".secrets/supabase-db.txt"), `Project ${project.id}\nDatabase password: ${dbPass}\n`);
  console.log("Created project", project.id);
}
const ref = project.id || project.ref;
for (let i = 0; i < 90; i++) {
  const p = await api(`/v1/projects/${ref}`);
  if (p.status === "ACTIVE_HEALTHY") break;
  if (i === 0) console.log("Waiting for the database to start…");
  await wait(10000);
}
for (let i = 0; i < 30; i++) { try { await sql(ref, "select 1"); break; } catch { await wait(5000); } }

/* 2. Migrations (tracked in a small table so re-runs skip what's done) */
await sql(ref, "create table if not exists public._ewud_migrations (name text primary key, at timestamptz default now()); alter table public._ewud_migrations enable row level security;");
const done = new Set((await sql(ref, "select name from public._ewud_migrations")).map((r) => r.name));
for (const f of readdirSync(resolve(ROOT, "supabase/migrations")).filter((f) => f.endsWith(".sql")).sort()) {
  if (done.has(f)) continue;
  await sql(ref, readFileSync(resolve(ROOT, "supabase/migrations", f), "utf8"));
  await sql(ref, `insert into public._ewud_migrations (name) values ('${f}')`);
  console.log("Migrated", f);
}
await sql(ref, `insert into public.admin_invites (email, role) values ('${OWNER.replace(/'/g, "''").toLowerCase()}', 'owner') on conflict do nothing`);

/* 3. Auth: 6-digit codes by email through Gmail SMTP, branded template */
const mail = (title, lead) => `<!doctype html><html><body style="margin:0;background:#f4f2fb;font-family:Inter,Segoe UI,Arial,sans-serif;color:#0f172a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:28px 12px">
<table role="presentation" width="100%" style="max-width:460px;background:#fff;border-radius:22px;overflow:hidden;box-shadow:0 10px 30px rgba(91,61,245,.12)">
<tr><td style="background:linear-gradient(135deg,#8b5cf6,#6d28d9);padding:26px 28px;color:#fff"><div style="font-size:26px;font-weight:900;letter-spacing:-.02em">EWU<span style="color:#c8f04a">diots</span></div><div style="font-size:13px;opacity:.9;margin-top:4px">${title}</div></td></tr>
<tr><td style="padding:28px">
<p style="margin:0 0 16px;font-size:15px;line-height:1.6">${lead}</p>
<div style="font-size:36px;font-weight:800;letter-spacing:.35em;text-align:center;background:#f5f3ff;border:2px dashed #c4b5fd;border-radius:16px;padding:18px 0;color:#5b21b6">{{ .Token }}</div>
<p style="margin:16px 0 0;font-size:13px;color:#64748b;line-height:1.6">The code works for 10 minutes. If you didn't ask for it, ignore this email — nobody can sign in without the code.</p>
</td></tr>
<tr><td style="padding:16px 28px;background:#faf9ff;font-size:11.5px;color:#94a3b8">EWUdiots is an unofficial student project, not affiliated with East West University.</td></tr>
</table></td></tr></table></body></html>`;
await api(`/v1/projects/${ref}/config/auth`, { method: "PATCH", body: {
  site_url: SITE, uri_allow_list: `${SITE}/**,https://localhost/**,http://localhost:5500/**`,
  external_email_enabled: true, mailer_autoconfirm: false, mailer_otp_exp: 600, mailer_otp_length: 6,
  smtp_admin_email: smtp.SMTP_USER, smtp_sender_name: "EWUdiots", smtp_host: smtp.SMTP_HOST, smtp_port: smtp.SMTP_PORT, smtp_user: smtp.SMTP_USER, smtp_pass: smtp.SMTP_PASS, smtp_max_frequency: 30,
  rate_limit_email_sent: 400, rate_limit_otp: 150, rate_limit_verify: 300,
  mailer_subjects_magic_link: "{{ .Token }} is your EWUdiots code", mailer_templates_magic_link_content: mail("Your sign-in code", "Here's your code to sign in to EWUdiots:"),
  mailer_subjects_confirmation: "{{ .Token }} is your EWUdiots code", mailer_templates_confirmation_content: mail("Welcome to EWUdiots", "Welcome! Enter this code in the app to finish creating your account:")
} });
console.log("Auth: email codes via", smtp.SMTP_USER);

/* 4. Keys → app/.env and extension/config.js */
const keys = await api(`/v1/projects/${ref}/api-keys`);
const anon = (keys.find((k) => k.name === "anon") || {}).api_key;
const url = `https://${ref}.supabase.co`;
writeFileSync(resolve(ROOT, "app/.env"), `VITE_SUPABASE_URL=${url}\nVITE_SUPABASE_ANON_KEY=${anon}\nVITE_SITE_URL=${SITE}\n`);
const cfg = resolve(ROOT, "extension/config.js");
if (existsSync(cfg)) writeFileSync(cfg, readFileSync(cfg, "utf8").replace(/supabaseUrl: "[^"]*"/, `supabaseUrl: "${url}"`).replace(/supabaseKey: "[^"]*"/, `supabaseKey: "${anon}"`));
console.log(JSON.stringify({ ref, url, anon }));
