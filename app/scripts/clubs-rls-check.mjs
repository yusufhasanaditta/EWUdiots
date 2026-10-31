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
  fails("admin can't invite someone as Faculty Moderator", `perform public.invite_member(${v("club")}::uuid, 'x@gmail.com', 1)`),
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
  fails("exec can't touch the verified badge", `update public.clubs set verified = false where id = ${v("club")}::uuid`),
  expect("verified badge unchanged", `(select verified from public.clubs where id = ${v("club")}::uuid)`),

  // ── Posts by audience ──
  as("admin"),
  `insert into public.club_posts (club_id, title, body, visibility) values (${v("club")}::uuid, 'Public news', 'Hello', 'public'), (${v("club")}::uuid, 'Members only', 'Inside', 'members'), (${v("club")}::uuid, 'Exec only', 'Plans', 'exec');`,
  as("outsider"), expect("outsider sees only the public post", `(select count(*) from public.club_posts where club_id = ${v("club")}::uuid and source_url = '') = 1`),
  as("member"), expect("member sees public + members", `(select count(*) from public.club_posts where club_id = ${v("club")}::uuid and source_url = '') = 2`),
  as("exec"), expect("exec sees all three", `(select count(*) from public.club_posts where club_id = ${v("club")}::uuid and source_url = '') = 3`),
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
  as("outsider"), expect("outsider can't read the audit log", `(select count(*) from public.club_audit) = 0`),

  // ════════ v2.14 (0018/0019) ════════
  // ── Features: the Club Admin switches them; only the platform locks them ──
  as("exec"),
  fails("a President can't switch club features", `update public.clubs set features = '{"store":true}' where id = ${v("club")}::uuid`),
  as("admin"),
  `update public.clubs set features = '{"store":true,"sponsors":true,"collab":true}', store_settings = '{"payment_numbers":{"bkash":"01700000000"},"pickup_points":["Admin Building"],"return_days":7}' where id = ${v("club")}::uuid;`,
  expect("store is on", `public.club_feature(${v("club")}::uuid, 'store')`),
  fails("a Club Admin can't lock features", `update public.clubs set features_locked = '{"chat":true}' where id = ${v("club")}::uuid`),
  as("outsider"),
  fails("outsiders can't lock features", `perform public.admin_lock_feature(${v("club")}::uuid, 'chat', true)`),

  // ── Positions: several roles at one rank, custom roles, no granting above yourself ──
  as("admin"),
  `insert into public.club_roles (club_id, rank, name, perms) values (${v("club")}::uuid, 5, 'Photographer', array['posts.write']);`,
  expect("rank 3 has four positions", `(select count(*) from public.club_roles where club_id = ${v("club")}::uuid and rank = 3) = 4`),
  fails("can't create a role with every permission", `insert into public.club_roles (club_id, rank, name, perms) values (${v("club")}::uuid, 4, 'Boss', array['*'])`),
  as("member"),
  fails("an Executive Member can't create roles", `insert into public.club_roles (club_id, rank, name, perms) values (${v("club")}::uuid, 6, 'Helper', array[]::text[])`),
  as("exec"),
  `select public.set_member_role(${v("club")}::uuid, '${U.applicant[0]}', (select id from public.club_roles where club_id = ${v("club")}::uuid and name = 'Merch Manager'));`,
  expect("applicant is now Merch Manager", `(select r.name = 'Merch Manager' from public.club_members m join public.club_roles r on r.id = m.role_id where m.club_id = ${v("club")}::uuid and m.user_id = '${U.applicant[0]}')`),
  fails("a President can't make a Club Admin", `perform public.set_member_role(${v("club")}::uuid, '${U.member[0]}', (select id from public.club_roles where club_id = ${v("club")}::uuid and name = 'Club Admin'))`),
  fails("a President can't make a fellow President-rank officer… of themselves", `perform public.set_member_role(${v("club")}::uuid, '${U.exec[0]}', (select id from public.club_roles where club_id = ${v("club")}::uuid and name = 'Treasurer'))`),

  // ── Chat: channels by audience, DMs only between members ──
  as("member"),
  expect("Executive Member sees General, Announcements and Executive", `(select count(*) from public.my_channels() where club_id = ${v("club")}::uuid) = 3`),
  as("applicant"),
  expect("Merch Manager (rank 5) doesn't see the Executive channel", `(select count(*) from public.my_channels() where club_id = ${v("club")}::uuid and kind = 'exec') = 0`),
  setv("gen", `(select id from public.club_channels where club_id = ${v("club")}::uuid and kind = 'all')`),
  setv("exch", `(select id from public.club_channels where club_id = ${v("club")}::uuid and kind = 'exec')`),
  setv("ann", `(select id from public.club_channels where club_id = ${v("club")}::uuid and kind = 'announce')`),
  `insert into public.club_messages (channel_id, club_id, body) values (${v("gen")}::uuid, ${v("club")}::uuid, 'Hello everyone');`,
  fails("can't post to the Executive channel", `insert into public.club_messages (channel_id, club_id, body) values (${v("exch")}::uuid, ${v("club")}::uuid, 'Let me in')`),
  fails("can't post announcements without posts.write", `insert into public.club_messages (channel_id, club_id, body) values (${v("ann")}::uuid, ${v("club")}::uuid, 'Free pizza')`),
  fails("attachments must live in the channel's folder", `insert into public.club_messages (channel_id, club_id, body, attachments) values (${v("gen")}::uuid, ${v("club")}::uuid, 'x', '[{"path":"other/file.pdf"}]')`),
  setv("dm", `public.open_dm(${v("club")}::uuid, '${U.member[0]}')`),
  `insert into public.club_messages (channel_id, club_id, body) values (${v("dm")}::uuid, ${v("club")}::uuid, 'Private hello');`,
  expect("opening the DM again finds the same conversation", `public.open_dm(${v("club")}::uuid, '${U.member[0]}') = ${v("dm")}::uuid`),
  as("member"),
  expect("the other person reads the DM", `(select count(*) from public.club_messages where channel_id = ${v("dm")}::uuid) = 1`),
  expect("and gets a message notification", `exists (select 1 from public.club_notifications where kind = 'message' and link like '%' || ${v("dm")})`),
  as("exec"),
  expect("a President can't read other people's DMs", `(select count(*) from public.club_messages where channel_id = ${v("dm")}::uuid) = 0`),
  as("outsider"),
  expect("outsiders read no club messages", `(select count(*) from public.club_messages) = 0`),
  fails("outsiders can't DM members", `perform public.open_dm(${v("club")}::uuid, '${U.member[0]}')`),

  // ── Store: server-side prices and stock, manual payment check, QR pickup, refunds ──
  as("applicant"),
  `insert into public.club_products (club_id, name, category, price, sizes, colors, stock, status) values (${v("club")}::uuid, 'Club Hoodie', 'hoodies', 1200, array['M'], '[{"name":"Black","hex":"#000000"}]', '{"M|Black":2}', 'active');`,
  setv("prod", "(select id from public.club_products where name = 'Club Hoodie')"),
  as("member"),
  fails("Executive Member can't add products", `insert into public.club_products (club_id, name, price, status) values (${v("club")}::uuid, 'Fake', 10, 'active')`),
  as("outsider"),
  expect("anyone sees active products", `(select count(*) from public.club_products where club_id = ${v("club")}::uuid) = 1`),
  fails("can't buy more than in stock", `perform public.place_order(${v("club")}::uuid, jsonb_build_array(jsonb_build_object('product_id', ${v("prod")}, 'size', 'M', 'color', 'Black', 'qty', 3)), 'bkash', 'TRX123456', 'Admin Building', '01812345678')`),
  fails("payment method must be one the club takes", `perform public.place_order(${v("club")}::uuid, jsonb_build_array(jsonb_build_object('product_id', ${v("prod")}, 'size', 'M', 'color', 'Black', 'qty', 1)), 'nagad', 'TRX123456', 'Admin Building', '01812345678')`),
  expect("order placed with the price from the database", `(public.place_order(${v("club")}::uuid, jsonb_build_array(jsonb_build_object('product_id', ${v("prod")}, 'size', 'M', 'color', 'Black', 'qty', 1, 'price', 1)), 'bkash', 'TRX123456', 'Admin Building', '01812345678')).total = 1200`),
  setv("ord", `(select id from public.club_orders where user_id = '${U.outsider[0]}')`),
  expect("stock went down", `(select (stock ->> 'M|Black')::int = 1 from public.club_products where id = ${v("prod")}::uuid)`),
  fails("buyers can't move their own order", `perform public.set_order_status(${v("ord")}::uuid, 'completed')`),
  fails("buyers can't edit orders directly", `update public.club_orders set total = 1 where id = ${v("ord")}::uuid returning 1 into strict ok`),
  as("member"),
  expect("Executive Member can't see orders", `(select count(*) from public.club_orders) = 0`),
  as("applicant"),
  fails("can't prepare an order before the payment is verified", `perform public.set_order_status(${v("ord")}::uuid, 'processing')`),
  `select public.verify_payment(${v("ord")}::uuid, true);`,
  `select public.set_order_status(${v("ord")}::uuid, 'processing');`,
  fails("can't skip from processing to completed", `perform public.set_order_status(${v("ord")}::uuid, 'completed')`),
  `select public.set_order_status(${v("ord")}::uuid, 'ready');`,
  asRoot, setv("tok", `(select pickup_token from public.club_orders where id = ${v("ord")}::uuid)`),
  as("member"),
  fails("only order managers can scan pickups", `perform public.scan_pickup('ewud:o:' || ${v("tok")})`),
  as("applicant"),
  expect("pickup QR completes the order", `(public.scan_pickup('ewud:o:' || ${v("tok")}) ->> 'code') like 'EWU-%'`),
  fails("the same QR can't be used twice", `perform public.scan_pickup('ewud:o:' || ${v("tok")})`),
  as("outsider"),
  setv("ret", `public.request_return(${v("ord")}::uuid, 'wrong_size', 'Too small')`),
  as("applicant"),
  `select public.review_return(${v("ret")}::uuid, true, 'OK');`,
  fails("a Merch Manager can't send refunds", `perform public.record_refund(${v("ret")}::uuid, 1200, 'bkash', 'R1')`),
  as("exec"),
  fails("can't refund more than was paid", `perform public.record_refund(${v("ret")}::uuid, 5000, 'bkash', 'R1')`),
  `select public.record_refund(${v("ret")}::uuid, 1200, 'bkash', 'R1');`,
  expect("refund logged in finance", `exists (select 1 from public.club_finance where club_id = ${v("club")}::uuid and category = 'Refund' and amount = 1200)`),
  as("outsider"),
  expect("buyer sees the refund", `(select status from public.club_returns where id = ${v("ret")}::uuid) = 'refunded'`),
  expect("buyer doesn't see staff-only notes", `not exists (select 1 from public.club_order_events where internal)`),

  // ── Elections: anonymous per-position ballots ──
  as("admin"),
  `insert into public.club_elections (club_id, title, nomination_start, nomination_end, voting_start, voting_end, status) values (${v("club")}::uuid, 'EC 2027', now() - interval '1 hour', now() + interval '1 hour', now() + interval '2 hours', now() + interval '3 hours', 'published');`,
  setv("el", "(select id from public.club_elections where title = 'EC 2027')"),
  `insert into public.club_election_positions (election_id, club_id, name, role_id) values (${v("el")}::uuid, ${v("club")}::uuid, 'President', (select id from public.club_roles where club_id = ${v("club")}::uuid and name = 'President'));`,
  setv("pos", `(select id from public.club_election_positions where election_id = ${v("el")}::uuid)`),
  as("applicant"), setv("cand", `public.nominate(${v("pos")}::uuid, 'Better merch', 'More hoodies')`),
  as("outsider"), fails("non-members can't stand", `perform public.nominate(${v("pos")}::uuid, 'Me', '')`),
  as("member"), fails("can't vote before voting opens", `perform public.cast_election_vote(${v("pos")}::uuid, array[${v("cand")}::uuid])`),
  as("admin"), `select public.review_candidate(${v("cand")}::uuid, true);`,
  asRoot, `update public.club_elections set nomination_start = now() - interval '3 hours', nomination_end = now() - interval '2 hours', voting_start = now() - interval '1 hour', voting_end = now() + interval '1 hour' where id = ${v("el")}::uuid;`,
  as("member"),
  `select public.cast_election_vote(${v("pos")}::uuid, array[${v("cand")}::uuid]);`,
  fails("one vote per position", `perform public.cast_election_vote(${v("pos")}::uuid, array[${v("cand")}::uuid])`),
  expect("members can't read ballots", `(select count(*) from public.club_election_ballots) = 0`),
  expect("members see no results while voting is open", `(select count(*) from public.election_results(${v("el")}::uuid)) = 0`),
  as("admin"),
  expect("election managers see live counts", `(select votes from public.election_results(${v("el")}::uuid)) = 1`),
  asRoot,
  expect("ballots carry no voter", `not exists (select 1 from information_schema.columns where table_name = 'club_election_ballots' and column_name = 'user_id')`),

  // ── Notifications, sponsors, support, privacy ──
  as("member"),
  expect("people read only their own notifications", `(select bool_and(user_id = auth.uid()) from public.club_notifications)`),
  fails("Executive Member can't add sponsors", `insert into public.sponsors (name, added_club, added_by) values ('Acme', ${v("club")}::uuid, auth.uid())`),
  as("exec"),
  `insert into public.sponsors (name, added_club, added_by, status, verified) values ('TechNova', ${v("club")}::uuid, auth.uid(), 'approved', true);`,
  expect("club-added sponsors wait for the EWUdiots team", `(select status = 'pending' and not verified from public.sponsors where name = 'TechNova')`),
  as("outsider"),
  expect("pending sponsors aren't public", `(select count(*) from public.sponsors where name = 'TechNova') = 0`),
  `insert into public.support_tickets (subject, body) values ('Can''t register', 'It says something went wrong');`,
  as("member"),
  expect("tickets are private", `(select count(*) from public.support_tickets) = 0`),
  expect("download my data works", `(public.export_my_club_data() -> 'memberships') is not null`),
  `select public.update_my_club_profile(${v("club")}::uuid, jsonb_build_object('bio', 'Hi', 'role_id', (select id from public.club_roles where club_id = ${v("club")}::uuid and name = 'Club Admin'), 'skills', jsonb_build_array('AI', '', 'Robotics')));`,
  expect("profile edits change the bio and skills only", `(select m.bio = 'Hi' and m.skills = array['AI', 'Robotics'] and r.rank = 4 from public.club_members m join public.club_roles r on r.id = m.role_id where m.user_id = auth.uid() and m.club_id = ${v("club")}::uuid)`),

  // ── Event tickets: free and paid, the QR works once, organisers name ticket checkers ──
  as("admin"),
  `insert into public.events (title, kind, starts_at, ends_at, status, source, club_id, visibility, created_by, capacity, ticketing) values ('Robotics Expo', 'club_event', now() + interval '1 day', now() + interval '1 day 3 hours', 'approved', 'club', ${v("club")}::uuid, 'public', auth.uid(), 3,
    '{"enabled":true,"tiers":[{"id":"free","name":"Free","price":0},{"id":"vip","name":"VIP","price":200,"qty":1}],"methods":["bkash","cash"],"scanners":"staff","door_cash":true}');`,
  setv("ev", "(select id from public.events where title = 'Robotics Expo')"),
  fails("ticket setups are checked", `update public.events set ticketing = '{"enabled":true,"tiers":[{"id":"x","name":"X","price":-5}]}' where id = ${v("ev")}::uuid`),
  as("outsider"),
  setv("t1", `(public.get_ticket(${v("ev")}::uuid, 'free')).id`),
  expect("a free ticket is valid at once", `(select status = 'active' and payment = 'free' and length(token) = 64 from public.club_tickets where id = ${v("t1")}::uuid)`),
  fails("one ticket per person per event", `perform public.get_ticket(${v("ev")}::uuid, 'free')`),
  fails("people who aren't checkers can't scan", `perform public.scan_ticket(${v("ev")}::uuid, 'ABCDEF12')`),
  fails("holders can't edit their ticket", `update public.club_tickets set status = 'used' where id = ${v("t1")}::uuid returning 1 into strict ok`),
  as("applicant"),
  fails("a paid ticket needs a transaction ID", `perform public.get_ticket(${v("ev")}::uuid, 'vip', 'bkash', '')`),
  fails("only payment methods the event takes", `perform public.get_ticket(${v("ev")}::uuid, 'vip', 'nagad', 'TRX12345')`),
  setv("t2", `(public.get_ticket(${v("ev")}::uuid, 'vip', 'bkash', 'trx aa1234')).id`),
  expect("price comes from the event; payment waits for a check", `(select price = 200 and payment = 'submitted' and pay_ref = 'TRXAA1234' from public.club_tickets where id = ${v("t2")}::uuid)`),
  fails("a Merch Manager isn't a ticket checker by default", `perform public.scan_ticket(${v("ev")}::uuid, 'ABCDEF12')`),
  fails("only organisers name ticket checkers", `perform public.set_ticket_checker(${v("ev")}::uuid, auth.uid(), true)`),
  as("exec"),
  fails("a sold-out ticket type can't be taken", `perform public.get_ticket(${v("ev")}::uuid, 'vip', 'cash')`),
  expect("organisers don't read other people's tickets (no tokens)", `(select count(*) from public.club_tickets where event_id = ${v("ev")}::uuid) = 0`),
  `select public.get_ticket(${v("ev")}::uuid, 'free');`,
  as("admin"),
  fails("the event is full at its capacity", `perform public.get_ticket(${v("ev")}::uuid, 'free')`),
  fails("ticket checkers must be club members", `perform public.set_ticket_checker(${v("ev")}::uuid, '${U.outsider[0]}', true)`),
  `select public.set_ticket_checker(${v("ev")}::uuid, '${U.applicant[0]}', true);`,
  expect("the organiser's list has every ticket", `(select count(*) from public.event_tickets(${v("ev")}::uuid)) = 3`),
  asRoot, setv("tok1", `(select token from public.club_tickets where id = ${v("t1")}::uuid)`), setv("code2", `(select code from public.club_tickets where id = ${v("t2")}::uuid)`),
  as("applicant"),
  expect("a named checker can scan: valid ticket admitted", `(public.scan_ticket(${v("ev")}::uuid, 'ewud:t:' || ${v("tok1")}) ->> 'result') = 'admitted'`),
  expect("the same QR can't get in twice", `(public.scan_ticket(${v("ev")}::uuid, 'ewud:t:' || ${v("tok1")}) ->> 'result') = 'used'`),
  expect("an unchecked payment doesn't get in", `(public.scan_ticket(${v("ev")}::uuid, ${v("code2")}) ->> 'result') = 'unpaid'`),
  expect("made-up codes are refused", `(public.scan_ticket(${v("ev")}::uuid, 'ZZZZ9999') ->> 'result') = 'invalid'`),
  `select public.review_ticket_payment(${v("t2")}::uuid, true);`,
  asRoot,
  expect("a verified ticket payment is booked as income", `exists (select 1 from public.club_finance where club_id = ${v("club")}::uuid and category = 'Tickets' and amount = 200)`),
  as("applicant"),
  expect("after the check the paid ticket gets in", `(public.scan_ticket(${v("ev")}::uuid, ${v("code2")}) ->> 'result') = 'admitted'`),
  as("admin"),
  `insert into public.events (title, kind, starts_at, status, source, club_id, created_by, ticketing) values ('Robotics Night', 'club_event', now() + interval '3 days', 'approved', 'club', ${v("club")}::uuid, auth.uid(), '{"enabled":true,"tiers":[{"id":"free","name":"Free","price":0}]}');`,
  expect("a ticket for another event is caught", `(public.scan_ticket((select id from public.events where title = 'Robotics Night'), 'ewud:t:' || ${v("tok1")}) ->> 'result') = 'wrong_event'`),
  // A registration form with a fee issues tickets too; cash taken at the door must stay paid.
  `insert into public.club_forms (club_id, kind, title, settings, status) values (${v("club")}::uuid, 'event', 'Robotics Night signup', '{"fee": 100, "ticket": true}', 'open');`,
  `update public.events set form_id = (select id from public.club_forms where title = 'Robotics Night signup'), ticketing = '{}' where title = 'Robotics Night';`,
  as("member"),
  `select public.submit_response((select id from public.club_forms where title = 'Robotics Night signup'), '{}');`,
  asRoot, setv("fcode", `(select t.code from public.club_tickets t join public.events e on e.id = t.event_id where e.title = 'Robotics Night' and t.user_id = '${U.member[0]}')`),
  expect("a form registration gets an unpaid ticket", `(select payment = 'unpaid' and price = 100 from public.club_tickets where code = ${v("fcode")})`),
  as("admin"),
  expect("cash at the door admits the form ticket", `(public.scan_ticket((select id from public.events where title = 'Robotics Night'), ${v("fcode")}, true, true) ->> 'result') = 'admitted'`),
  asRoot,
  `update public.form_responses set note = 'checked' where user_id = '${U.member[0]}' and form_id = (select id from public.club_forms where title = 'Robotics Night signup');`,
  expect("door cash stays paid after the form changes", `(select payment = 'verified' and status = 'used' from public.club_tickets where code = ${v("fcode")})`),
  as("outsider"),
  fails("a used ticket can't be cancelled", `perform public.cancel_ticket(${v("t1")}::uuid)`),
  expect("every scan is logged, out of reach of members", `(select count(*) from public.club_ticket_scans) = 0`),
  asRoot,
  expect("scans were logged", `(select count(*) from public.club_ticket_scans where event_id = ${v("ev")}::uuid) >= 5`)
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
