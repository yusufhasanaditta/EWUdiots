// Security check for EWUdiots Club against the live database: plays several people (club admin, member, applicant,
// outsider) through the real row-level security and RPCs, asserting what each can see and do. Everything runs in
// one transaction that is rolled back, so nothing is left behind. If 0016_clubs.sql isn't applied yet, it is
// applied inside the same transaction first (and rolled back with it).
// Usage (from app/):  node scripts/clubs-rls-check.mjs        (reads ../.secrets/supabase-token.env)
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "../..");
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN || readFileSync(resolve(ROOT, ".secrets/supabase-token.env"), "utf8").match(/sbp_[A-Za-z0-9]+/)[0];
const REF = process.env.SUPABASE_REF || "dbbktfznkaavjmfrndcs";
const sql = async (query) => {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, { method: "POST", headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" }, body: JSON.stringify({ query }) });
  const t = await r.text();
  if (!r.ok) throw new Error(t);
  return JSON.parse(t);
};

const applied = (await sql("select exists (select 1 from public._ewud_migrations where name = '0016_clubs.sql') as ok"))[0].ok;
const migration = applied ? "" : readFileSync(resolve(ROOT, "supabase/migrations/0016_clubs.sql"), "utf8");

// People. Student emails follow the sign-up rule enforced on auth.users.
const U = {
  admin: ["a0000000-0000-4000-8000-00000000000a", "2020-1-60-901@std.ewubd.edu", "Ayesha Admin"],
  member: ["b0000000-0000-4000-8000-00000000000b", "2021-2-60-902@std.ewubd.edu", "Bashir Member"],
  applicant: ["c0000000-0000-4000-8000-00000000000c", "2022-3-60-903@std.ewubd.edu", "Chandni Applicant"],
  outsider: ["d0000000-0000-4000-8000-00000000000d", "2023-1-60-904@std.ewubd.edu", "Dipu Outsider"],
  exec: ["e0000000-0000-4000-8000-00000000000e", "2021-1-60-905@std.ewubd.edu", "Esha Exec"]
};
const as = (who) => {
  const [id, email, name] = U[who];
  const claims = JSON.stringify({ sub: id, email, role: "authenticated", aud: "authenticated", app_metadata: { role: "student" }, user_metadata: { name } });
  return `reset role; select set_config('request.jwt.claims', '${claims}', true); set local role authenticated;`;
};
const asRoot = "reset role; select set_config('request.jwt.claims', '', true);";
// Assertions run as DO blocks; any failure raises and aborts the whole script with its message.
const expect = (label, cond) => `do $t$ begin if not (${cond}) then raise exception 'FAIL: %', ${q(label)}; end if; end $t$;`;
const fails = (label, stmt) => `do $t$ declare ok boolean := false; begin begin ${stmt}; exception when others then ok := true; end; if not ok then raise exception 'FAIL (should be refused): %', ${q(label)}; end if; end $t$;`;
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const setv = (k, expr) => `select set_config('t.${k}', (${expr})::text, true);`;
const v = (k) => `current_setting('t.${k}')`;

const steps = [
  // ── Setup (database owner) ──
  asRoot,
  ...Object.values(U).map(([id, email, name]) => `insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values ('${id}', 'authenticated', 'authenticated', '${email}', '{"role":"student"}', '{"name":"${name}","role":"student"}', now(), now());`),
  setv("club", "(select id from public.clubs where slug = 'robotics')"),
  `update public.clubs set status = 'active', verified = true, join_mode = 'apply' where id = ${v("club")}::uuid;`,
  `select public.club_add_member(${v("club")}::uuid, '${U.admin[0]}', 2, 'Ayesha Admin', '${U.admin[1]}', '2020-1-60-901', 'CSE', null);`,

  // ── Admin invites a student by ID; the student is a member as soon as they open Clubs ──
  as("admin"),
  `select public.invite_member(${v("club")}::uuid, '2021-2-60-902', 7, '', 'IT');`,
  `select public.invite_member(${v("club")}::uuid, '2021-1-60-905', 3, 'General Secretary', '');`,
  fails("admin can't invite someone as Faculty Advisor", `perform public.invite_member(${v("club")}::uuid, 'x@gmail.com', 1)`),
  as("member"),
  expect("not a member before claiming the invite", `not public.is_club_member(${v("club")}::uuid)`),
  expect("claiming the invite joins one club", `public.claim_club_invites() = 1`),
  expect("member after claiming", `public.is_club_member(${v("club")}::uuid)`),
  expect("invited as General Member in the IT wing", `(select rank = 7 and wing = 'IT' from public.my_clubs() where club_id = ${v("club")}::uuid)`),
  as("exec"),
  expect("exec claims the invite", `public.claim_club_invites() = 1`),
  expect("exec is rank 3 with a title", `(select rank = 3 and title = 'General Secretary' from public.my_clubs() where club_id = ${v("club")}::uuid)`),

  // ── Member directory: fellow members see names, not emails ──
  as("member"),
  expect("member sees the member list", `(select count(*) from public.club_member_list(${v("club")}::uuid)) = 3`),
  expect("member doesn't see emails", `(select bool_and(email = '' and student_id = '') from public.club_member_list(${v("club")}::uuid))`),
  expect("member reads only their own membership row", `(select count(*) from public.club_members where club_id = ${v("club")}::uuid) = 1`),
  as("exec"),
  expect("exec (members.approve) sees emails", `(select bool_and(email <> '') from public.club_member_list(${v("club")}::uuid))`),
  as("outsider"),
  fails("outsider can't read the member list", `perform * from public.club_member_list(${v("club")}::uuid)`),
  expect("outsider sees the public committee (admin + exec)", `(select count(*) from public.club_committee(${v("club")}::uuid)) = 2`),

  // ── Ranks: no promoting yourself, no granting what you don't have ──
  as("member"),
  fails("general member can't invite", `perform public.invite_member(${v("club")}::uuid, '2023-1-60-904')`),
  fails("member can't promote themselves", `perform public.set_member(${v("club")}::uuid, '${U.member[0]}', 3)`),
  as("exec"),
  fails("exec can't change the club admin", `perform public.set_member(${v("club")}::uuid, '${U.admin[0]}', 7)`),
  fails("exec can't make someone an admin", `perform public.set_member(${v("club")}::uuid, '${U.member[0]}', 2)`),
  `select public.set_member(${v("club")}::uuid, '${U.member[0]}', 4, 'IT Lead', 'IT');`,
  expect("exec can promote a member to Wing Head", `(select r.rank = 4 from public.club_members m join public.club_roles r on r.id = m.role_id where m.user_id = '${U.member[0]}' and m.club_id = ${v("club")}::uuid)`),
  fails("exec can't grant settings.edit (they don't have it)", `update public.club_roles set perms = array['settings.edit'] where club_id = ${v("club")}::uuid and rank = 6`),
  `update public.club_roles set perms = array['attendance.take', 'polls.create'] where club_id = ${v("club")}::uuid and rank = 6;`,
  expect("exec can grant permissions they hold", `(select perms @> array['polls.create'] from public.club_roles where club_id = ${v("club")}::uuid and rank = 6)`),
  `update public.clubs set verified = false where id = ${v("club")}::uuid;`,
  expect("exec can't touch the verified badge", `(select verified from public.clubs where id = ${v("club")}::uuid)`),

  // ── Posts by audience ──
  as("admin"),
  `insert into public.club_posts (club_id, title, body, visibility) values (${v("club")}::uuid, 'Public news', 'Hello', 'public'), (${v("club")}::uuid, 'Members only', 'Inside', 'members'), (${v("club")}::uuid, 'Exec only', 'Plans', 'exec');`,
  as("outsider"), expect("outsider sees only the public post", `(select count(*) from public.club_posts where club_id = ${v("club")}::uuid) = 1`),
  as("member"), expect("member sees public + members", `(select count(*) from public.club_posts where club_id = ${v("club")}::uuid) = 2`),
  as("exec"), expect("exec sees all three", `(select count(*) from public.club_posts where club_id = ${v("club")}::uuid) = 3`),
  as("outsider"),
  fails("outsider can't post for the club", `insert into public.club_posts (club_id, title, author_id) values (${v("club")}::uuid, 'Fake news', auth.uid())`),
  `insert into public.club_comments (post_id, club_id, body) select id, club_id, 'Nice!' from public.club_posts where club_id = ${v("club")}::uuid and visibility = 'public';`,
  asRoot, setv("mpost", "(select id from public.club_posts where title = 'Members only')"), as("outsider"),
  fails("outsider can't comment on a members-only post", `insert into public.club_comments (post_id, club_id, body) values (${v("mpost")}::uuid, ${v("club")}::uuid, 'Sneaky')`),

  // ── Members-only event stays hidden ──
  as("admin"),
  `insert into public.events (title, kind, starts_at, status, source, club_id, visibility, created_by) values ('Robotics internal meetup', 'club_event', now() + interval '2 days', 'approved', 'club', ${v("club")}::uuid, 'members', auth.uid());`,
  as("outsider"), expect("outsider can't see the members-only event", `(select count(*) from public.events where title = 'Robotics internal meetup') = 0`),
  as("member"), expect("member sees the members-only event", `(select count(*) from public.events where title = 'Robotics internal meetup') = 1`),

  // ── Recruitment form: limit 1 + waitlist, phone required, private responses ──
  as("admin"),
  `insert into public.club_forms (club_id, kind, title, fields, settings, status) values (${v("club")}::uuid, 'membership', 'Join Robotics 2026',
     '[{"id":"why","type":"long","label":"Why do you want to join?","required":true}]', '{"limit":1,"waitlist":true,"collectPhone":true}', 'open');`,
  setv("form", "(select id from public.club_forms where title = 'Join Robotics 2026')"),
  as("applicant"),
  fails("required answer is enforced", `perform public.submit_response(${v("form")}::uuid, '{}', '01712345678')`),
  fails("phone number is checked", `perform public.submit_response(${v("form")}::uuid, '{"why":"I build robots"}', '123')`),
  expect("applicant submits → pending", `(public.submit_response(${v("form")}::uuid, '{"why":"I build robots"}', '01712345678')).status = 'pending'`),
  fails("can't submit twice", `perform public.submit_response(${v("form")}::uuid, '{"why":"again"}', '01712345678')`),
  as("outsider"),
  expect("over the limit → waitlisted", `(public.submit_response(${v("form")}::uuid, '{"why":"Me too"}', '01812345678')).status = 'waitlisted'`),
  expect("outsider sees only their own response", `(select count(*) from public.form_responses where form_id = ${v("form")}::uuid) = 1`),
  as("member"),
  expect("a wing head can't read applicants' phone numbers", `(select count(*) from public.form_responses where form_id = ${v("form")}::uuid) = 0`),
  as("exec"),
  expect("exec sees both responses with phone numbers", `(select count(*) from public.form_responses where form_id = ${v("form")}::uuid and phone <> '') = 2`),
  `select public.review_responses(array(select id from public.form_responses where form_id = ${v("form")}::uuid and user_id = '${U.applicant[0]}'), 'accepted');`,
  as("applicant"),
  expect("accepted membership form → now a member", `public.is_club_member(${v("club")}::uuid)`),
  expect("acceptance landed in the inbox", `exists (select 1 from public.user_messages where user_id = auth.uid() and title like '%you''re in%')`),

  // ── Attendance: rotating code, secret hidden from members ──
  as("admin"),
  `insert into public.club_sessions (club_id, title) values (${v("club")}::uuid, 'Weekly meeting');`,
  setv("sess", "(select id from public.club_sessions where title = 'Weekly meeting')"),
  asRoot,
  setv("code", `public.club_code((select secret from public.club_session_keys where session_id = ${v("sess")}::uuid), floor(extract(epoch from now()) / 30)::bigint)`),
  as("applicant"),
  expect("members can't read session secrets", `(select count(*) from public.club_session_keys) = 0`),
  fails("wrong code is refused", `perform public.club_checkin(${v("sess")}::uuid, '000000x')`),
  expect("right code checks in", `public.club_checkin(${v("sess")}::uuid, ${v("code")}) = 'Weekly meeting'`),
  as("outsider"),
  fails("non-members can't check in", `perform public.club_checkin(${v("sess")}::uuid, ${v("code")})`),

  // ── Anonymous election ──
  as("admin"),
  `insert into public.club_polls (club_id, kind, title, options, anonymous, results) values (${v("club")}::uuid, 'election', 'President 2026-27', '["Ayesha","Esha"]', true, 'live');`,
  setv("poll", "(select id from public.club_polls where title = 'President 2026-27')"),
  as("member"),
  `select public.cast_vote(${v("poll")}::uuid, array[1]);`,
  fails("can't vote twice", `perform public.cast_vote(${v("poll")}::uuid, array[0])`),
  expect("ballots aren't readable directly", `(select count(*) from public.club_ballots) = 0`),
  expect("results count the vote", `(select votes from public.poll_results(${v("poll")}::uuid) where choice = 1) = 1`),
  asRoot,
  expect("anonymous ballot has no voter on it", `(select bool_and(user_id is null) from public.club_ballots where poll_id = ${v("poll")}::uuid)`),
  as("outsider"),
  fails("outsiders can't vote", `perform public.cast_vote(${v("poll")}::uuid, array[0])`),

  // ── Finance and audit stay with the right people ──
  as("admin"),
  `insert into public.club_finance (club_id, kind, amount, category) values (${v("club")}::uuid, 'expense', 1500, 'Printing');`,
  as("member"), expect("wing head can't see finance", `(select count(*) from public.club_finance) = 0`),
  as("exec"), expect("exec (finance.view) sees finance", `(select count(*) from public.club_finance where club_id = ${v("club")}::uuid) = 1`),
  expect("audit log recorded the invites and review", `(select count(*) from public.club_audit where club_id = ${v("club")}::uuid) >= 4`),
  as("outsider"), expect("outsider can't read the audit log", `(select count(*) from public.club_audit) = 0`)
];

const script = `begin;\n${migration}\n${steps.join("\n")}\nreset role;\nselect 'ALL OK' as result;\nrollback;`;
try {
  const out = await sql(script);
  console.log(out.at?.(-1)?.result === "ALL OK" || JSON.stringify(out).includes("ALL OK") ? `PASS  ${steps.filter((s) => s.startsWith("do ")).length} security checks (rolled back${applied ? "" : ", migration applied in the transaction only"})` : JSON.stringify(out));
} catch (e) {
  const m = String(e.message).match(/FAIL[^"\\]*/);
  console.log(m ? m[0] : e.message.slice(0, 1500));
  process.exitCode = 1;
}
