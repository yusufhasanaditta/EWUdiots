-- EWUdiots 0018: EWUdiots Club platform (v2.14). Builds on 0016_clubs.sql.
--   • Positions: several roles may share a rank (President, Vice President, General Secretary, Treasurer are all rank 3).
--     Each rank has one default role (used when only a rank is known); invites, role changes and handovers carry the role id.
--   • Club features the Club Admin switches on (chat, meetings, projects, store…); the EWUdiots team can lock any off.
--   • Member profiles, member directory privacy, notes.
--   • Chat (channels, direct messages between members of the same club, reactions, read markers; Realtime).
--   • Club notification centre, meetings with agenda and minutes, projects with a task board, resource folders,
--     poll comments, elections with positions and candidates, recruitment scores and interviews, richer events,
--     handover checklist, feedback, analytics, support tickets, "download my data".
-- Rule as before: the database decides. Row-level security for reads, security-definer RPCs for anything with rules.

-- ───────────────────────── Role template and positions ─────────────────────────
-- The EWUdiots team's starting set of roles for every new club (Admin → Clubs → Roles). Clubs then rename/add their own.
create table public.club_role_template (
  id serial primary key,
  rank int not null check (rank between 1 and 9),
  name text not null check (length(name) between 2 and 40),
  kind text not null default 'member' check (kind in ('advisor', 'admin', 'officer', 'exec', 'lead', 'moderator', 'member')),
  perms text[] not null default '{}',
  is_default boolean not null default false,
  is_system boolean not null default false,
  color text not null default 'gray',
  description text not null default '' check (length(description) <= 200),
  sort int not null default 0
);
alter table public.club_role_template enable row level security;
create policy "read role template" on public.club_role_template for select using (true);
create policy "edit role template" on public.club_role_template for all to authenticated using (public.can('clubs.manage')) with check (public.can('clubs.manage'));

insert into public.club_role_template (rank, name, kind, perms, is_default, is_system, color, description, sort) values
  (1, 'Faculty Advisor', 'advisor', array['*'], true, true, 'orange', 'Faculty moderator of the club', 1),
  (2, 'Club Admin', 'admin', array['*'], true, true, 'purple', 'Runs the club on EWUdiots and hands out positions', 2),
  (3, 'President', 'officer', array['posts.write','posts.publish_public','events.manage','events.checkin','forms.create','forms.view_responses','forms.export','recruitment.evaluate','members.invite','members.approve','members.promote','members.remove','attendance.take','polls.create','elections.manage','tasks.manage','projects.manage','meetings.manage','docs.manage','resources.manage','chat.manage','finance.view','finance.edit','certs.issue','comments.moderate','analytics.view','audit.view','sponsors.manage','collab.manage','store.manage','orders.manage','payments.verify','refunds.approve'], true, false, 'blue', 'Leads the executive committee', 3),
  (3, 'Vice President', 'officer', array['posts.write','posts.publish_public','events.manage','events.checkin','forms.create','forms.view_responses','forms.export','recruitment.evaluate','members.invite','members.approve','members.promote','attendance.take','polls.create','tasks.manage','projects.manage','meetings.manage','docs.manage','resources.manage','chat.manage','finance.view','certs.issue','comments.moderate','analytics.view','audit.view','sponsors.manage','collab.manage'], false, false, 'blue', 'Stands in for the President', 4),
  (3, 'General Secretary', 'officer', array['posts.write','posts.publish_public','events.manage','events.checkin','forms.create','forms.view_responses','forms.export','recruitment.evaluate','members.invite','members.approve','attendance.take','polls.create','tasks.manage','projects.manage','meetings.manage','docs.manage','resources.manage','chat.manage','finance.view','certs.issue','comments.moderate','analytics.view','audit.view'], false, false, 'pink', 'Meetings, minutes, records and members', 5),
  (3, 'Treasurer', 'officer', array['posts.write','events.manage','forms.view_responses','attendance.take','tasks.manage','meetings.manage','docs.manage','finance.view','finance.edit','analytics.view','audit.view','sponsors.manage','store.manage','orders.manage','payments.verify','refunds.approve'], false, false, 'green', 'Money, budgets, sponsorships and refunds', 6),
  (4, 'Executive Member', 'exec', array['posts.write','events.manage','events.checkin','forms.create','recruitment.evaluate','attendance.take','polls.create','tasks.manage','projects.manage','meetings.manage','docs.manage','resources.manage'], true, false, 'teal', 'Member of the executive committee', 7),
  (4, 'Wing Head', 'lead', array['posts.write','events.manage','events.checkin','forms.create','attendance.take','polls.create','tasks.manage','projects.manage','docs.manage','resources.manage'], false, false, 'teal', 'Leads one wing or team', 8),
  (5, 'Moderator', 'moderator', array['posts.write','comments.moderate','attendance.take','events.checkin','chat.manage'], true, false, 'pink', 'Keeps posts and chats friendly', 9),
  (5, 'Merch Manager', 'moderator', array['store.manage','orders.manage','payments.verify'], false, false, 'orange', 'Products, orders and pickups (no refunds)', 10),
  (6, 'Senior Member', 'member', array['attendance.take'], true, false, 'green', 'Experienced member', 11),
  (7, 'General Member', 'member', array[]::text[], true, true, 'gray', 'Member of the club', 12);

alter table public.club_roles drop constraint if exists club_roles_club_id_rank_key;
alter table public.club_roles add column if not exists kind text not null default 'member' check (kind in ('advisor', 'admin', 'officer', 'exec', 'lead', 'moderator', 'member'));
alter table public.club_roles add column if not exists is_default boolean not null default false;
alter table public.club_roles add column if not exists color text not null default 'gray' check (color in ('gray', 'purple', 'blue', 'teal', 'green', 'orange', 'pink', 'red', 'amber'));
alter table public.club_roles add column if not exists description text not null default '' check (length(description) <= 200);
alter table public.club_roles add column if not exists sort int not null default 0;
create unique index if not exists club_roles_default on public.club_roles (club_id, rank) where is_default;
create unique index if not exists club_roles_name on public.club_roles (club_id, lower(name));

create or replace function public.club_seed_roles() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.club_roles (club_id, rank, name, kind, perms, is_default, is_system, color, description, sort)
  select new.id, t.rank, t.name, t.kind, t.perms, t.is_default, t.is_system, t.color, t.description, t.sort from public.club_role_template t order by t.sort;
  return new;
end $$;
revoke execute on function public.club_seed_roles() from public, anon, authenticated;

-- Existing clubs (no members yet in any of them when this ran) get the new set.
delete from public.club_roles r where not exists (select 1 from public.club_members m where m.role_id = r.id);
insert into public.club_roles (club_id, rank, name, kind, perms, is_default, is_system, color, description, sort)
select k.id, t.rank, t.name, t.kind, t.perms, t.is_default and not exists (select 1 from public.club_roles x where x.club_id = k.id and x.rank = t.rank),
  t.is_system, t.color, t.description, t.sort
from public.clubs k cross join public.club_role_template t
where not exists (select 1 from public.club_roles x where x.club_id = k.id and lower(x.name) = lower(t.name));
update public.club_roles r set is_default = true where not exists (select 1 from public.club_roles x where x.club_id = r.club_id and x.rank = r.rank and x.is_default)
  and r.id = (select y.id from public.club_roles y where y.club_id = r.club_id and y.rank = r.rank order by y.sort limit 1);

/** The default role at a rank (when only a rank is known). */
create or replace function public.club_default_role(c uuid, rnk int) returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.club_roles where club_id = c and rank = rnk order by is_default desc, sort limit 1;
$$;
revoke execute on function public.club_default_role(uuid, int) from public, anon, authenticated;

-- Club Admins (and anyone with members.promote) may add their own roles below their rank, never with '*'.
create policy "add club roles" on public.club_roles for insert to authenticated
  with check (public.club_can(club_id, 'members.promote') and rank between 3 and 7 and rank > public.club_rank(club_id) and not is_default and not is_system
    and not ('*' = any (perms)) and (public.can('clubs.manage') or '*' = any ((public.club_role_row(club_id)).perms) or (public.club_role_row(club_id)).perms @> perms));
create policy "delete club roles" on public.club_roles for delete to authenticated
  using (public.club_can(club_id, 'members.promote') and not is_system and not is_default and rank > public.club_rank(club_id)
    and not exists (select 1 from public.club_members m where m.role_id = club_roles.id));

-- Insert or re-activate a membership with a role (falls back to the default role at the rank).
create or replace function public.club_add_member(c uuid, u uuid, rnk int, nm text, em text, sid text, dept text, inviter uuid) returns void
language plpgsql security definer set search_path = public as $$
declare rid uuid := public.club_default_role(c, rnk);
begin
  insert into public.club_members (club_id, user_id, role_id, display_name, email, student_id, department, invited_by)
  values (c, u, rid, left(coalesce(nm, ''), 80), coalesce(em, ''), coalesce(sid, ''), left(coalesce(dept, ''), 60), inviter)
  on conflict (club_id, user_id) do update set status = 'active', left_at = null, role_id = case when public.club_members.status = 'active' then public.club_members.role_id else excluded.role_id end;
end $$;
revoke execute on function public.club_add_member(uuid, uuid, int, text, text, text, text, uuid) from public, anon, authenticated;

-- May the caller hand out this role? Below your own rank (Club Admins may add co-admins), and only permissions you hold.
create or replace function public.club_may_assign(c uuid, rid uuid) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare r public.club_roles; mine int := public.club_rank(c); my public.club_roles := public.club_role_row(c);
begin
  select * into r from public.club_roles where id = rid and club_id = c;
  if r.id is null or r.rank < 2 then return false; end if;
  if mine = 1 then return true; end if;
  if r.rank < mine or (r.rank = mine and mine > 2) then return false; end if;
  return '*' = any (my.perms) or (my.perms @> r.perms and not ('*' = any (r.perms)));
end $$;
revoke execute on function public.club_may_assign(uuid, uuid) from public, anon, authenticated;

-- Invites now carry a role (position) as well as the rank.
alter table public.club_invites add column if not exists role_id uuid references public.club_roles on delete set null;
drop function if exists public.invite_member(uuid, text, int, text, text);
create or replace function public.invite_member(c uuid, who text, rnk int default 7, ttl text default '', wng text default '', rid uuid default null) returns void
language plpgsql security definer set search_path = public as $$
declare e text := lower(trim(who)); the_role uuid := coalesce(rid, public.club_default_role(c, rnk)); rr int;
begin
  if not public.club_can(c, 'members.invite') then raise exception 'You don''t have permission to invite members'; end if;
  if e ~ '^\d{4}-\d-\d{2}-\d{3}$' then e := e || '@std.ewubd.edu'; end if;
  if e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Enter a student ID like 2024-1-60-123 or an email'; end if;
  select r.rank into rr from public.club_roles r where r.id = the_role and r.club_id = c;
  if rr is null or not public.club_may_assign(c, the_role) then raise exception 'You can only invite people to a role below yours'; end if;
  if (select count(*) from public.club_invites i where i.club_id = c and i.created_at > now() - interval '1 day') >= 300 then raise exception 'Too many invites today'; end if;
  insert into public.club_invites (club_id, email, rank, role_id, title, wing) values (c, e, rr, the_role, left(coalesce(ttl, ''), 60), left(coalesce(wng, ''), 40))
  on conflict (club_id, email) do update set rank = excluded.rank, role_id = excluded.role_id, title = excluded.title, wing = excluded.wing, status = 'pending', invited_by = auth.uid(), created_at = now(), expires_at = now() + interval '60 days';
  perform public.club_log(c, 'invite', jsonb_build_object('email', e, 'role', (select r.name from public.club_roles r where r.id = the_role)));
end $$;
create or replace function public.claim_club_invites() returns int
language plpgsql security definer set search_path = public as $$
declare me jsonb := public.club_me(); i public.club_invites; n int := 0; rid uuid;
begin
  if auth.uid() is null or coalesce(me ->> 'email', '') = '' then return 0; end if;
  for i in select * from public.club_invites where email = me ->> 'email' and status = 'pending' and expires_at > now() loop
    rid := coalesce(i.role_id, public.club_default_role(i.club_id, i.rank));
    perform public.club_add_member(i.club_id, auth.uid(), i.rank, me ->> 'name', me ->> 'email', me ->> 'student_id', '', i.invited_by);
    update public.club_members set role_id = rid,
      title = case when i.title <> '' then i.title else title end, wing = case when i.wing <> '' then i.wing else wing end
      where club_id = i.club_id and user_id = auth.uid() and (select r.rank from public.club_roles r where r.id = role_id) >= i.rank;
    update public.club_invites set status = 'claimed' where id = i.id;
    perform public.club_log(i.club_id, 'invite.claimed', jsonb_build_object('email', i.email));
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public.invite_member(uuid, text, int, text, text, uuid), public.claim_club_invites() from public, anon;
grant execute on function public.invite_member(uuid, text, int, text, text, uuid), public.claim_club_invites() to authenticated;

-- Give someone a position (role), title, wing or status. Same rules as before, by role id.
create or replace function public.set_member_role(c uuid, u uuid, rid uuid default null, ttl text default null, wng text default null, st text default null) returns void
language plpgsql security definer set search_path = public as $$
declare mine int := public.club_rank(c); theirs int;
begin
  select r.rank into theirs from public.club_members m join public.club_roles r on r.id = m.role_id where m.club_id = c and m.user_id = u;
  if theirs is null then raise exception 'Not a member of this club'; end if;
  if u = auth.uid() and mine > 1 then raise exception 'Ask another admin to change your own role'; end if;
  if (rid is not null or st is not null) and not public.club_can(c, case when st = 'removed' then 'members.remove' else 'members.promote' end) then raise exception 'You don''t have permission to change members'; end if;
  if (ttl is not null or wng is not null) and not public.club_can(c, 'members.promote') then raise exception 'You don''t have permission to change members'; end if;
  if mine > 1 and theirs <= mine and not (mine = 2 and theirs = 2 and rid is null and st is null) then raise exception 'You can''t change someone at or above your own role'; end if;
  if rid is not null and not public.club_may_assign(c, rid) then raise exception 'You can only give a role below yours'; end if;
  if st is not null and st not in ('active', 'alumni', 'removed') then raise exception 'Unknown status'; end if;
  update public.club_members set role_id = coalesce(rid, role_id), title = coalesce(left(ttl, 60), title), wing = coalesce(left(wng, 40), wing), status = coalesce(st, status) where club_id = c and user_id = u;
  perform public.club_log(c, 'member.changed', jsonb_build_object('user', u, 'role', (select name from public.club_roles where id = rid), 'title', ttl, 'wing', wng, 'status', st));
  if rid is not null and u <> auth.uid() then
    perform public.club_alert(u, c, 'other', 'Your role changed', 'You are now ' || (select name from public.club_roles where id = rid) || ' in ' || (select name from public.clubs where id = c), '#/club/space?c=' || c);
  end if;
end $$;
-- The old rank-based call keeps working (it picks the default role at that rank).
create or replace function public.set_member(c uuid, u uuid, rnk int default null, ttl text default null, wng text default null, st text default null) returns void
language sql security definer set search_path = public as $$
  select public.set_member_role(c, u, case when rnk is null then null else public.club_default_role(c, rnk) end, ttl, wng, st);
$$;
revoke execute on function public.set_member_role(uuid, uuid, uuid, text, text, text) from public, anon; grant execute on function public.set_member_role(uuid, uuid, uuid, text, text, text) to authenticated;

-- Year change. assignments: [{ user_id, role_id?, rank?, title, wing }].
create or replace function public.handover_term(c uuid, lbl text, assignments jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare a jsonb; rid uuid;
begin
  if public.club_rank(c) > 2 then raise exception 'Only a club admin can hand over to a new committee'; end if;
  insert into public.club_terms (club_id, label, committee)
  select c, left(lbl, 40), coalesce(jsonb_agg(jsonb_build_object('name', x.display_name, 'title', x.title, 'role', x.role_name) order by x.rank), '[]') from public.club_committee(c) x where x.rank between 2 and 4;
  update public.club_members m set role_id = public.club_default_role(c, 6), title = ''
    where m.club_id = c and m.status = 'active' and (select rank from public.club_roles r where r.id = m.role_id) between 3 and 4;
  for a in select * from jsonb_array_elements(coalesce(assignments, '[]')) loop
    rid := coalesce(nullif(a ->> 'role_id', '')::uuid, case when (a ->> 'rank') is not null then public.club_default_role(c, (a ->> 'rank')::int) end);
    if rid is not null and (select rank from public.club_roles where id = rid and club_id = c) between 2 and 7 then
      update public.club_members set role_id = rid, title = left(coalesce(a ->> 'title', ''), 60), wing = left(coalesce(a ->> 'wing', wing), 40)
        where club_id = c and user_id = (a ->> 'user_id')::uuid and status = 'active';
    end if;
  end loop;
  perform public.club_log(c, 'handover', jsonb_build_object('label', lbl, 'new', jsonb_array_length(coalesce(assignments, '[]'))));
end $$;

create or replace function public.review_claim(claim uuid, approve boolean, note text default '') returns void
language plpgsql security definer set search_path = public as $$
declare r public.club_claims;
begin
  if not public.can('clubs.verify') then raise exception 'You don''t have permission to verify clubs'; end if;
  update public.club_claims set status = case when approve then 'approved' else 'rejected' end, review_note = left(coalesce(note, ''), 300) where id = claim returning * into r;
  if r.id is null then raise exception 'Claim not found'; end if;
  if approve then
    update public.clubs set status = 'active', verified = true where id = r.club_id;
    perform public.club_add_member(r.club_id, r.user_id, 2, r.name, r.email, coalesce(substring(r.email from '^(\d{4}-\d-\d{2}-\d{3})@'), ''), '', auth.uid());
    update public.club_members set role_id = public.club_default_role(r.club_id, 2), title = left(r.position, 60) where club_id = r.club_id and user_id = r.user_id;
    perform public.club_log(r.club_id, 'claim.approved', jsonb_build_object('user', r.name, 'position', r.position));
  else
    update public.clubs set status = 'archived' where id = r.club_id and status = 'pending' and not exists (select 1 from public.club_claims where club_id = r.club_id and status in ('pending', 'approved'));
  end if;
  perform public.club_notify(r.user_id, case when approve then 'You''re now the admin of your club' else 'Your club request wasn''t approved' end, note, '#/club/mine');
end $$;
create or replace function public.admin_set_club_admin(c uuid, who text) returns void
language plpgsql security definer set search_path = public as $$
declare u auth.users; e text := lower(trim(who)); rid uuid := public.club_default_role(c, 2);
begin
  if not public.can('clubs.manage') then raise exception 'Not allowed'; end if;
  if e ~ '^\d{4}-\d-\d{2}-\d{3}$' then e := e || '@std.ewubd.edu'; end if;
  select * into u from auth.users where lower(email) = e;
  if u.id is null then
    insert into public.club_invites (club_id, email, rank, role_id) values (c, e, 2, rid) on conflict (club_id, email) do update set rank = 2, role_id = rid, status = 'pending', created_at = now(), expires_at = now() + interval '60 days';
  else
    perform public.club_add_member(c, u.id, 2, coalesce(u.raw_user_meta_data ->> 'name', split_part(e, '@', 1)), e, coalesce(substring(e from '^(\d{4}-\d-\d{2}-\d{3})@'), ''), '', auth.uid());
    update public.club_members set role_id = rid where club_id = c and user_id = u.id;
    perform public.club_alert(u.id, c, 'other', 'You''re now a Club Admin', 'The EWUdiots team made you admin of ' || (select name from public.clubs where id = c) || '. Give your committee their positions in Manage → Members.', '#/club/space?c=' || c);
  end if;
  update public.clubs set status = 'active', verified = true where id = c and status in ('unclaimed', 'pending');
  perform public.club_log(c, 'admin.appointed', jsonb_build_object('email', e));
end $$;

-- ───────────────────────── Club features (Club Admin switches; EWUdiots team can lock) ─────────────────────────
alter table public.clubs add column if not exists features jsonb not null default '{}'::jsonb check (jsonb_typeof(features) = 'object');
alter table public.clubs add column if not exists features_locked jsonb not null default '{}'::jsonb check (jsonb_typeof(features_locked) = 'object');
alter table public.clubs add column if not exists source text not null default '' check (source in ('', 'ewubd'));
alter table public.clubs add column if not exists ewu_info jsonb not null default '{}'::jsonb check (jsonb_typeof(ewu_info) = 'object'); -- moderators, counts, archive links from the EWU club site
alter table public.clubs add column if not exists store_settings jsonb not null default '{}'::jsonb check (jsonb_typeof(store_settings) = 'object');

create or replace function public.club_feature_default(f text) returns boolean
language sql immutable as $$ select f in ('chat', 'meetings', 'projects', 'resources', 'polls', 'elections', 'finance', 'recruitment', 'events') $$;
create or replace function public.club_feature(c uuid, f text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select coalesce((k.features ->> f)::boolean, public.club_feature_default(f)) and not coalesce((k.features_locked ->> f)::boolean, false) from public.clubs k where k.id = c), false);
$$;
create or replace function public.club_features(c uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_object_agg(f, public.club_feature(c, f)) from unnest(array['chat', 'meetings', 'projects', 'resources', 'polls', 'elections', 'finance', 'recruitment', 'events', 'store', 'sponsors', 'collab']) f;
$$;
grant execute on function public.club_feature(uuid, text), public.club_features(uuid), public.club_feature_default(text) to anon, authenticated;

drop function if exists public.my_clubs();
create function public.my_clubs() returns table (club_id uuid, status text, rank int, role_id uuid, role_name text, role_kind text, role_color text, perms text[], title text, wing text,
  name text, slug text, short_name text, color text, logo_url text, cover_url text, verified boolean, features jsonb, club_status text)
language sql stable security definer set search_path = public as $$
  select m.club_id, m.status, r.rank, r.id, r.name, r.kind, r.color, r.perms, m.title, m.wing, k.name, k.slug, k.short_name, k.color, k.logo_url, k.cover_url, k.verified,
    public.club_features(k.id), k.status
  from public.club_members m join public.club_roles r on r.id = m.role_id join public.clubs k on k.id = m.club_id
  where m.user_id = auth.uid() and m.status <> 'removed' and k.status in ('active', 'suspended');
$$;
revoke execute on function public.my_clubs() from public, anon; grant execute on function public.my_clubs() to authenticated;


-- Club admins switch features (features.edit); only the platform changes the locks.
create or replace function public.club_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.can('clubs.manage') and not public.can('clubs.verify') then
    if new.verified is distinct from old.verified or new.status is distinct from old.status or new.slug is distinct from old.slug or new.features_locked is distinct from old.features_locked or new.source is distinct from old.source then
      raise exception 'Only the EWUdiots team can change a club''s verification, status, address or feature locks';
    end if;
    if new.features is distinct from old.features and not public.club_can(new.id, 'features.edit') then raise exception 'You don''t have permission to switch club features'; end if;
    if new.store_settings is distinct from old.store_settings and not public.club_can(new.id, 'store.manage') then raise exception 'You don''t have permission to change store settings'; end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
-- Store managers may edit store settings without settings.edit.
drop policy if exists "edit club" on public.clubs;
create policy "edit club" on public.clubs for update to authenticated
  using (public.club_can(id, 'settings.edit') or public.club_can(id, 'features.edit') or public.club_can(id, 'store.manage'))
  with check (public.club_can(id, 'settings.edit') or public.club_can(id, 'features.edit') or public.club_can(id, 'store.manage'));
create or replace function public.club_settings_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- Anything other than features / store settings needs settings.edit.
  if auth.uid() is not null and not public.club_can(new.id, 'settings.edit')
     and (to_jsonb(new) - array['features', 'store_settings', 'updated_at']) <> (to_jsonb(old) - array['features', 'store_settings', 'updated_at']) then
    raise exception 'You don''t have permission to edit the club profile';
  end if;
  return new;
end $$;
revoke execute on function public.club_settings_guard() from public, anon, authenticated;
create trigger club_settings_guard before update on public.clubs for each row execute function public.club_settings_guard();

-- ───────────────────────── Notification centre ─────────────────────────
create table public.club_notifications (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  club_id uuid references public.clubs on delete cascade,
  kind text not null default 'other' check (kind in ('event', 'recruitment', 'task', 'mention', 'announcement', 'message', 'poll', 'order', 'meeting', 'other')),
  title text not null check (length(title) between 1 and 160),
  body text not null default '' check (length(body) <= 1000),
  link text not null default '' check (link = '' or link ~ '^#/'),
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index club_notifications_user on public.club_notifications (user_id, created_at desc);
alter table public.club_notifications enable row level security;
create policy "read my club notifications" on public.club_notifications for select to authenticated using (user_id = auth.uid());
create policy "update my club notifications" on public.club_notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "delete my club notifications" on public.club_notifications for delete to authenticated using (user_id = auth.uid());
create or replace function public.club_alert(u uuid, c uuid, k text, t text, b text, l text) returns void
language sql security definer set search_path = public as $$
  insert into public.club_notifications (user_id, club_id, kind, title, body, link)
  values (u, c, case when k in ('event', 'recruitment', 'task', 'mention', 'announcement', 'message', 'poll', 'order', 'meeting') then k else 'other' end, left(t, 160), left(coalesce(b, ''), 1000), coalesce(l, ''));
$$;
revoke execute on function public.club_alert(uuid, uuid, text, text, text, text) from public, anon, authenticated;
-- The v2.13 inbox message also lands in the club notification centre.
create or replace function public.club_notify(u uuid, t text, b text, l text) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into public.user_messages (user_id, title, body, link, created_by) values (u, left(t, 120), left(coalesce(b, ''), 2000), l, auth.uid());
  perform public.club_alert(u, null, case when l like '%tab=tasks%' then 'task' when l like '#/club/mine%' then 'recruitment' else 'other' end, t, b, l);
end $$;
revoke execute on function public.club_notify(uuid, text, text, text) from public, anon, authenticated;
create or replace function public.mark_club_notifications_read(ids bigint[] default null) returns void
language sql security definer set search_path = public as $$
  update public.club_notifications set read_at = now() where user_id = auth.uid() and read_at is null and (ids is null or id = any (ids));
$$;
revoke execute on function public.mark_club_notifications_read(bigint[]) from public, anon; grant execute on function public.mark_club_notifications_read(bigint[]) to authenticated;
-- New posts → followers and members (announcements to members only).
create or replace function public.club_post_alert() returns trigger
language plpgsql security definer set search_path = public as $$
declare k text := (select name from public.clubs where id = new.club_id);
begin
  if new.status = 'published' and (tg_op = 'INSERT' or old.status <> 'published') and coalesce(new.link, '') not like 'https://web.archive.org/%' then
    insert into public.club_notifications (user_id, club_id, kind, title, body, link)
    select distinct u, new.club_id, case when new.kind = 'recruitment' then 'recruitment' else 'announcement' end, k || ': ' || left(new.title, 120), left(new.body, 200), '#/club/post?id=' || new.id
    from (select m.user_id u from public.club_members m where m.club_id = new.club_id and m.status = 'active'
            and (new.visibility in ('public', 'members') or (new.visibility = 'exec' and (select rank from public.club_roles r where r.id = m.role_id) <= 3) or (new.visibility = 'wing' and m.wing = new.wing))
          union select f.user_id from public.club_follows f where new.visibility = 'public' and f.club_id = new.club_id) x
    where u is distinct from new.author_id;
  end if;
  return new;
end $$;
revoke execute on function public.club_post_alert() from public, anon, authenticated;
create trigger club_post_alert after insert or update of status on public.club_posts for each row execute function public.club_post_alert();

-- Archived posts imported from the EWU club site.
alter table public.club_posts add column if not exists source_url text not null default '';
create unique index if not exists club_posts_source on public.club_posts (club_id, source_url) where source_url <> '';
alter table public.club_posts drop constraint if exists club_posts_kind_check;
alter table public.club_posts add constraint club_posts_kind_check check (kind in ('news', 'announcement', 'achievement', 'recruitment', 'event', 'project', 'gallery'));
alter table public.club_posts add column if not exists event_id uuid references public.events on delete set null;
alter table public.club_posts add column if not exists published_at timestamptz;

-- ───────────────────────── Member profiles and directory privacy ─────────────────────────
alter table public.club_members add column if not exists bio text not null default '' check (length(bio) <= 600);
alter table public.club_members add column if not exists skills text[] not null default '{}' check (cardinality(skills) <= 12);
alter table public.club_members add column if not exists socials jsonb not null default '{}'::jsonb check (jsonb_typeof(socials) = 'object');
alter table public.club_members add column if not exists photo_url text not null default '' check (photo_url = '' or photo_url ~ '^https://');
alter table public.club_members add column if not exists visibility text not null default 'members' check (visibility in ('public', 'members', 'private'));
alter table public.club_members add column if not exists in_directory boolean not null default true;
alter table public.club_members add column if not exists show_email boolean not null default false;
alter table public.club_members add column if not exists left_at timestamptz;
create or replace function public.club_member_left() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status <> 'active' and old.status = 'active' then new.left_at := now(); elsif new.status = 'active' then new.left_at := null; end if;
  return new;
end $$;
revoke execute on function public.club_member_left() from public, anon, authenticated;
create trigger club_member_left before update of status on public.club_members for each row execute function public.club_member_left();

-- A member edits their own club profile (never role, status or ids).
create or replace function public.update_my_club_profile(c uuid, patch jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_club_member(c) then raise exception 'You''re not a member of this club'; end if;
  update public.club_members set
    display_name = coalesce(left(nullif(trim(patch ->> 'display_name'), ''), 80), display_name),
    department = coalesce(left(patch ->> 'department', 60), department),
    bio = coalesce(left(patch ->> 'bio', 600), bio),
    skills = case when jsonb_typeof(patch -> 'skills') = 'array'
      then coalesce((select array_agg(z.x) from (select left(trim(s), 30) x from jsonb_array_elements_text(patch -> 'skills') s where trim(s) <> '' limit 12) z), '{}') else skills end,
    socials = case when jsonb_typeof(patch -> 'socials') = 'object' then (select coalesce(jsonb_object_agg(k, left(v, 200)), '{}') from jsonb_each_text(patch -> 'socials') x(k, v) where k in ('linkedin', 'github', 'facebook', 'instagram', 'website') and v ~ '^https://') else socials end,
    photo_url = case when patch ? 'photo_url' and coalesce(patch ->> 'photo_url', '') ~ '^(https://.*)?$' then coalesce(patch ->> 'photo_url', '') else photo_url end,
    visibility = case when patch ->> 'visibility' in ('public', 'members', 'private') then patch ->> 'visibility' else visibility end,
    in_directory = coalesce((patch ->> 'in_directory')::boolean, in_directory),
    show_email = coalesce((patch ->> 'show_email')::boolean, show_email)
  where club_id = c and user_id = auth.uid();
end $$;
revoke execute on function public.update_my_club_profile(uuid, jsonb) from public, anon; grant execute on function public.update_my_club_profile(uuid, jsonb) to authenticated;

-- Directory: members who chose to be listed (managers see everyone). Emails only to approvers, or when the member allows it.
drop function if exists public.club_member_list(uuid);
create function public.club_member_list(c uuid) returns table (user_id uuid, display_name text, title text, role_id uuid, role_name text, role_color text, rank int, wing text, department text,
  status text, joined_at timestamptz, email text, student_id text, photo_url text, skills text[], batch text, in_directory boolean)
language plpgsql stable security definer set search_path = public as $$
declare see_all boolean := public.club_can(c, 'members.approve');
begin
  if not (public.is_club_member(c) or see_all) then raise exception 'Only club members can see the member list'; end if;
  return query select m.user_id, m.display_name, m.title, r.id, r.name, r.color, r.rank, m.wing, m.department, m.status, m.joined_at,
    case when see_all or (m.show_email and public.club_rank(c) <= 4) then m.email else '' end, case when see_all then m.student_id else '' end,
    m.photo_url, m.skills, coalesce(substring(m.student_id from '^(\d{4})'), ''), m.in_directory
    from public.club_members m join public.club_roles r on r.id = m.role_id
    where m.club_id = c and m.status in ('active', 'alumni') and (see_all or m.in_directory or m.user_id = auth.uid() or r.rank <= 4)
    order by r.rank, r.sort, m.display_name;
end $$;
revoke execute on function public.club_member_list(uuid) from public, anon; grant execute on function public.club_member_list(uuid) to authenticated;

drop function if exists public.club_committee(uuid);
create function public.club_committee(c uuid) returns table (user_id uuid, display_name text, title text, role_name text, role_color text, rank int, wing text, department text, photo_url text, socials jsonb)
language sql stable security definer set search_path = public as $$
  select m.user_id, m.display_name, m.title, r.name, r.color, r.rank, m.wing, m.department,
    case when m.visibility = 'public' then m.photo_url else '' end, case when m.visibility = 'public' then m.socials else '{}'::jsonb end
  from public.club_members m join public.club_roles r on r.id = m.role_id join public.clubs k on k.id = m.club_id
  where m.club_id = c and m.status = 'active' and r.rank between 1 and 4 and k.status = 'active' order by r.rank, r.sort, m.joined_at;
$$;
grant execute on function public.club_committee(uuid) to anon, authenticated;

create table public.club_member_notes (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  author uuid references auth.users (id) on delete set null default auth.uid(),
  author_name text not null default '',
  body text not null check (length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);
alter table public.club_member_notes enable row level security;
create policy "read member notes" on public.club_member_notes for select to authenticated using (public.club_can(club_id, 'members.promote'));
create policy "add member notes" on public.club_member_notes for insert to authenticated with check (public.club_can(club_id, 'members.promote') and author = auth.uid());
create policy "delete member notes" on public.club_member_notes for delete to authenticated using (public.club_can(club_id, 'members.promote'));

-- ───────────────────────── Chat ─────────────────────────
create table public.club_channels (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs on delete cascade,
  kind text not null check (kind in ('all', 'announce', 'exec', 'wing', 'team', 'custom', 'dm', 'collab')),
  name text not null default '' check (length(name) <= 60),
  description text not null default '' check (length(description) <= 300),
  wing text not null default '' check (length(wing) <= 40),
  icon text not null default '' check (length(icon) <= 20),
  pinned_text text not null default '' check (length(pinned_text) <= 300),
  archived boolean not null default false,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now()
);
create index club_channels_club on public.club_channels (club_id, kind);
create unique index club_channels_one_all on public.club_channels (club_id, kind) where kind in ('all', 'announce', 'exec');
alter table public.club_channels enable row level security;
create table public.club_channel_members (
  channel_id uuid not null references public.club_channels on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (channel_id, user_id)
);
create index club_channel_members_user on public.club_channel_members (user_id);
alter table public.club_channel_members enable row level security;

create or replace function public.can_read_channel(ch uuid) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare x public.club_channels;
begin
  select * into x from public.club_channels where id = ch;
  if x.id is null then return false; end if;
  if x.kind in ('dm', 'custom', 'team', 'collab') then return exists (select 1 from public.club_channel_members where channel_id = ch and user_id = auth.uid()); end if;
  if not public.is_club_member(x.club_id) then return false; end if;
  return case x.kind
    when 'exec' then public.club_rank(x.club_id) <= 4
    when 'wing' then public.club_rank(x.club_id) <= 3 or exists (select 1 from public.club_members m where m.club_id = x.club_id and m.user_id = auth.uid() and m.status = 'active' and m.wing = x.wing)
    else true end;
end $$;
create or replace function public.can_post_channel(ch uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.can_read_channel(ch) and exists (select 1 from public.club_channels x where x.id = ch and not x.archived
    and public.club_feature(x.club_id, 'chat') and (x.kind <> 'announce' or public.club_can(x.club_id, 'posts.write')));
$$;
grant execute on function public.can_read_channel(uuid), public.can_post_channel(uuid) to authenticated;
create policy "read channels" on public.club_channels for select to authenticated using (public.can_read_channel(id));
create policy "add channels" on public.club_channels for insert to authenticated with check (kind in ('wing', 'team', 'custom') and public.club_can(club_id, 'chat.manage') and created_by = auth.uid());
create policy "edit channels" on public.club_channels for update to authenticated using (public.club_can(club_id, 'chat.manage')) with check (public.club_can(club_id, 'chat.manage'));
create policy "delete channels" on public.club_channels for delete to authenticated using (kind in ('wing', 'team', 'custom') and public.club_can(club_id, 'chat.manage'));
create policy "read channel members" on public.club_channel_members for select to authenticated using (user_id = auth.uid() or public.can_read_channel(channel_id));
create policy "add channel members" on public.club_channel_members for insert to authenticated with check (exists (select 1 from public.club_channels x where x.id = channel_id and x.kind in ('team', 'custom') and public.club_can(x.club_id, 'chat.manage'))
  and exists (select 1 from public.club_members m join public.club_channels x on x.club_id = m.club_id where x.id = channel_id and m.user_id = club_channel_members.user_id and m.status = 'active'));
create policy "remove channel members" on public.club_channel_members for delete to authenticated using (user_id = auth.uid() or exists (select 1 from public.club_channels x where x.id = channel_id and x.kind in ('team', 'custom') and public.club_can(x.club_id, 'chat.manage')));

-- Every club gets its General, Announcements and Executive channels.
create or replace function public.club_seed_channels(c uuid) returns void
language sql security definer set search_path = public as $$
  insert into public.club_channels (club_id, kind, name, icon, created_by) values
    (c, 'announce', 'Announcements', 'megaphone', null), (c, 'all', 'General Members', 'users', null), (c, 'exec', 'Executive Team', 'briefcase', null)
  on conflict do nothing;
$$;
revoke execute on function public.club_seed_channels(uuid) from public, anon, authenticated;
create or replace function public.club_seed_channels_trg() returns trigger
language plpgsql security definer set search_path = public as $$ begin perform public.club_seed_channels(new.id); return new; end $$;
revoke execute on function public.club_seed_channels_trg() from public, anon, authenticated;
create trigger club_seed_channels after insert on public.clubs for each row execute function public.club_seed_channels_trg();
select public.club_seed_channels(id) from public.clubs;

create table public.club_messages (
  id bigint generated always as identity primary key,
  channel_id uuid not null references public.club_channels on delete cascade,
  club_id uuid not null references public.clubs on delete cascade,
  author_id uuid references auth.users (id) on delete set null default auth.uid(),
  author_name text not null default '',
  body text not null default '' check (length(body) <= 4000),
  attachments jsonb not null default '[]'::jsonb check (jsonb_typeof(attachments) = 'array' and jsonb_array_length(attachments) <= 6),
  mentions uuid[] not null default '{}' check (cardinality(mentions) <= 20),
  reply_to bigint references public.club_messages on delete set null,
  pinned boolean not null default false,
  deleted boolean not null default false,
  edited_at timestamptz,
  created_at timestamptz not null default now(),
  check (body <> '' or jsonb_array_length(attachments) > 0 or deleted)
);
create index club_messages_channel on public.club_messages (channel_id, id desc);
alter table public.club_messages enable row level security;
create policy "read messages" on public.club_messages for select to authenticated using (public.can_read_channel(channel_id));
create policy "send messages" on public.club_messages for insert to authenticated with check (author_id = auth.uid() and public.can_post_channel(channel_id) and not pinned and not deleted);
create policy "edit messages" on public.club_messages for update to authenticated
  using (author_id = auth.uid() or public.club_can(club_id, 'chat.manage')) with check (author_id = auth.uid() or public.club_can(club_id, 'chat.manage'));
create or replace function public.club_message_stamp() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.club_id := (select club_id from public.club_channels where id = new.channel_id);
    new.author_name := coalesce((select display_name from public.club_members where club_id = new.club_id and user_id = auth.uid()), coalesce(auth.jwt() -> 'user_metadata' ->> 'name', ''));
    -- Flood control: 30 messages a minute per person.
    if (select count(*) from public.club_messages where author_id = auth.uid() and created_at > now() - interval '1 minute') >= 30 then raise exception 'Slow down a little: too many messages in a minute'; end if;
    -- Attachments must be files in this channel's folder.
    if exists (select 1 from jsonb_array_elements(new.attachments) a where coalesce(a ->> 'path', '') !~ ('^' || new.club_id || '/chat/' || new.channel_id || '/')) then raise exception 'Unexpected attachment'; end if;
    return new;
  end if;
  -- Authors edit body/attachments or delete; managers may pin or delete. Nobody moves a message.
  if new.channel_id <> old.channel_id or new.author_id is distinct from old.author_id or new.created_at <> old.created_at then raise exception 'Not allowed'; end if;
  if new.pinned <> old.pinned and not public.club_can(new.club_id, 'chat.manage') and not exists (select 1 from public.club_channels x where x.id = new.channel_id and x.kind = 'dm') then raise exception 'Only chat managers can pin messages'; end if;
  if (new.body <> old.body or new.attachments <> old.attachments) then
    if old.author_id is distinct from auth.uid() and not new.deleted then raise exception 'You can only edit your own messages'; end if;
    new.edited_at := now();
  end if;
  if new.deleted and not old.deleted then new.body := ''; new.attachments := '[]'; end if;
  return new;
end $$;
revoke execute on function public.club_message_stamp() from public, anon, authenticated;
create trigger club_message_stamp before insert or update on public.club_messages for each row execute function public.club_message_stamp();
create or replace function public.club_message_after() returns trigger
language plpgsql security definer set search_path = public as $$
declare ch public.club_channels; u uuid;
begin
  update public.club_channels set last_message_at = new.created_at where id = new.channel_id returning * into ch;
  foreach u in array new.mentions loop
    if u <> new.author_id and exists (select 1 from public.club_members m where m.club_id = new.club_id and m.user_id = u and m.status = 'active') then
      perform public.club_alert(u, new.club_id, 'mention', new.author_name || ' mentioned you', left(new.body, 160), '#/club/chat?id=' || new.channel_id);
    end if;
  end loop;
  if ch.kind = 'dm' then
    insert into public.club_notifications (user_id, club_id, kind, title, body, link)
    select cm.user_id, new.club_id, 'message', 'Message from ' || new.author_name, left(coalesce(nullif(new.body, ''), 'Sent a file'), 160), '#/club/chat?id=' || new.channel_id
    from public.club_channel_members cm where cm.channel_id = new.channel_id and cm.user_id <> new.author_id
      and not exists (select 1 from public.club_notifications n where n.user_id = cm.user_id and n.link = '#/club/chat?id=' || new.channel_id and n.read_at is null);
  end if;
  return new;
end $$;
revoke execute on function public.club_message_after() from public, anon, authenticated;
create trigger club_message_after after insert on public.club_messages for each row execute function public.club_message_after();

create table public.club_message_reactions (
  message_id bigint not null references public.club_messages on delete cascade,
  channel_id uuid not null references public.club_channels on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  emoji text not null check (emoji in ('👍', '❤️', '😂', '🎉', '😮', '🙏', '🔥', '✅')),
  primary key (message_id, user_id, emoji)
);
alter table public.club_message_reactions enable row level security;
create policy "read reactions" on public.club_message_reactions for select to authenticated using (public.can_read_channel(channel_id));
create policy "react" on public.club_message_reactions for insert to authenticated with check (user_id = auth.uid() and public.can_read_channel(channel_id)
  and exists (select 1 from public.club_messages m where m.id = message_id and m.channel_id = club_message_reactions.channel_id));
create policy "unreact" on public.club_message_reactions for delete to authenticated using (user_id = auth.uid());

create table public.club_channel_reads (
  channel_id uuid not null references public.club_channels on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  read_at timestamptz not null default now(),
  primary key (channel_id, user_id)
);
alter table public.club_channel_reads enable row level security;
create policy "my reads" on public.club_channel_reads for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid() and public.can_read_channel(channel_id));

-- Direct message between two active members of the same club (no messages to strangers).
create or replace function public.open_dm(c uuid, other uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare ch uuid;
begin
  if other = auth.uid() then raise exception 'That''s you'; end if;
  if not public.club_feature(c, 'chat') then raise exception 'Chat is switched off for this club'; end if;
  if not public.is_club_member(c) or not exists (select 1 from public.club_members where club_id = c and user_id = other and status = 'active') then raise exception 'You can message members of your own clubs only'; end if;
  select x.id into ch from public.club_channels x where x.club_id = c and x.kind = 'dm'
    and exists (select 1 from public.club_channel_members a where a.channel_id = x.id and a.user_id = auth.uid())
    and exists (select 1 from public.club_channel_members b where b.channel_id = x.id and b.user_id = other) limit 1;
  if ch is null then
    if (select count(*) from public.club_channels where kind = 'dm' and created_by = auth.uid() and created_at > now() - interval '1 day') >= 40 then raise exception 'Too many new conversations today'; end if;
    insert into public.club_channels (club_id, kind, created_by) values (c, 'dm', auth.uid()) returning id into ch;
    insert into public.club_channel_members (channel_id, user_id) values (ch, auth.uid()), (ch, other);
  end if;
  return ch;
end $$;
-- Team/custom group: creator picks members (all must be active members of the club).
create or replace function public.create_channel(c uuid, nm text, kd text, wng text, members uuid[]) returns uuid
language plpgsql security definer set search_path = public as $$
declare ch uuid;
begin
  if not public.club_can(c, 'chat.manage') then raise exception 'You don''t have permission to create channels'; end if;
  if kd not in ('wing', 'team', 'custom') then raise exception 'Unknown channel type'; end if;
  insert into public.club_channels (club_id, kind, name, wing, created_by) values (c, kd, left(trim(nm), 60), left(coalesce(wng, ''), 40), auth.uid()) returning id into ch;
  if kd <> 'wing' then
    insert into public.club_channel_members (channel_id, user_id)
    select ch, m.user_id from public.club_members m where m.club_id = c and m.status = 'active' and (m.user_id = any (coalesce(members, '{}')) or m.user_id = auth.uid()) on conflict do nothing;
  end if;
  perform public.club_log(c, 'channel.created', jsonb_build_object('name', nm, 'kind', kd));
  return ch;
end $$;
-- Every channel I can read, with the last message, unread count and (for DMs) the other person.
create or replace function public.my_channels() returns table (id uuid, club_id uuid, club_name text, club_short text, club_color text, club_logo text, kind text, name text, icon text, wing text,
  pinned_text text, last_message_at timestamptz, last_body text, last_author text, unread int, other_id uuid, other_name text, members int)
language sql stable security definer set search_path = public as $$
  select x.id, x.club_id, k.name, k.short_name, k.color, k.logo_url, x.kind,
    case when x.kind = 'dm' then coalesce(o.display_name, 'Member') else x.name end, x.icon, x.wing, x.pinned_text, x.last_message_at,
    lm.body, lm.author_name,
    (select count(*)::int from public.club_messages m where m.channel_id = x.id and not m.deleted and m.author_id is distinct from auth.uid() and m.created_at > coalesce(rd.read_at, '-infinity')),
    o.user_id, o.display_name,
    case when x.kind in ('dm', 'custom', 'team', 'collab') then (select count(*)::int from public.club_channel_members cm where cm.channel_id = x.id) else null end
  from public.club_channels x join public.clubs k on k.id = x.club_id
  left join public.club_channel_reads rd on rd.channel_id = x.id and rd.user_id = auth.uid()
  left join lateral (select m.body, m.author_name from public.club_messages m where m.channel_id = x.id and not m.deleted order by m.id desc limit 1) lm on true
  left join lateral (select cm.user_id, mm.display_name from public.club_channel_members cm left join public.club_members mm on mm.club_id = x.club_id and mm.user_id = cm.user_id
                     where x.kind = 'dm' and cm.channel_id = x.id and cm.user_id <> auth.uid() limit 1) o on true
  where not x.archived and public.club_feature(x.club_id, 'chat') and k.status = 'active' and public.can_read_channel(x.id)
    and (x.kind <> 'dm' or exists (select 1 from public.club_messages m where m.channel_id = x.id) or x.created_by = auth.uid())
  order by x.last_message_at desc;
$$;
revoke execute on function public.open_dm(uuid, uuid), public.create_channel(uuid, text, text, text, uuid[]), public.my_channels() from public, anon;
grant execute on function public.open_dm(uuid, uuid), public.create_channel(uuid, text, text, text, uuid[]), public.my_channels() to authenticated;

-- Realtime: clients subscribe to inserts/updates on messages; RLS decides who receives each one.
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin alter publication supabase_realtime add table public.club_messages; exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table public.club_message_reactions; exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table public.club_notifications; exception when duplicate_object then null; end;
  end if;
end $$;

-- ───────────────────────── Meetings ─────────────────────────
create table public.club_meetings (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs on delete cascade,
  title text not null check (length(title) between 3 and 140),
  description text not null default '' check (length(description) <= 2000),
  starts_at timestamptz not null,
  ends_at timestamptz check (ends_at is null or ends_at >= starts_at),
  location text not null default '' check (length(location) <= 140),
  online_link text not null default '' check (online_link = '' or online_link ~ '^https://'),
  agenda jsonb not null default '[]'::jsonb check (jsonb_typeof(agenda) = 'array' and jsonb_array_length(agenda) <= 30), -- [{ title, at }]
  minutes text not null default '' check (length(minutes) <= 20000),
  status text not null default 'scheduled' check (status in ('scheduled', 'completed', 'cancelled')),
  audience text not null default 'members' check (audience in ('members', 'exec')),
  cover_url text not null default '' check (cover_url = '' or cover_url ~ '^https://'),
  session_id uuid references public.club_sessions on delete set null,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index club_meetings_club on public.club_meetings (club_id, starts_at desc);
alter table public.club_meetings enable row level security;
create policy "read meetings" on public.club_meetings for select to authenticated using (public.club_can(club_id, 'meetings.manage') or (public.is_club_member(club_id) and (audience = 'members' or public.club_rank(club_id) <= 4)));
create policy "write meetings" on public.club_meetings for all to authenticated using (public.club_can(club_id, 'meetings.manage') and public.club_feature(club_id, 'meetings')) with check (public.club_can(club_id, 'meetings.manage') and public.club_feature(club_id, 'meetings'));
create or replace function public.club_meeting_alert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' or new.starts_at <> old.starts_at or new.status <> old.status then
    insert into public.club_notifications (user_id, club_id, kind, title, body, link)
    select m.user_id, new.club_id, 'meeting', case when new.status = 'cancelled' then 'Cancelled: ' else case when tg_op = 'INSERT' then 'New meeting: ' else 'Meeting changed: ' end end || new.title,
      to_char(new.starts_at at time zone 'Asia/Dhaka', 'Dy DD Mon, HH12:MI AM') || coalesce(' · ' || nullif(new.location, ''), ''), '#/club/meeting?id=' || new.id
    from public.club_members m join public.club_roles r on r.id = m.role_id
    where m.club_id = new.club_id and m.status = 'active' and m.user_id is distinct from auth.uid() and (new.audience = 'members' or r.rank <= 4);
  end if;
  new.updated_at := now();
  return new;
end $$;
revoke execute on function public.club_meeting_alert() from public, anon, authenticated;
create trigger club_meeting_alert before insert or update on public.club_meetings for each row execute function public.club_meeting_alert();
-- Who attended (present members of the linked attendance session). Members see names; managers see everyone.
create or replace function public.meeting_attendance(mt uuid) returns table (user_id uuid, display_name text, photo_url text, present boolean)
language plpgsql stable security definer set search_path = public as $$
declare x public.club_meetings;
begin
  select * into x from public.club_meetings where id = mt;
  if x.id is null or not (public.is_club_member(x.club_id) or public.club_can(x.club_id, 'meetings.manage')) then raise exception 'Not allowed'; end if;
  return query select m.user_id, m.display_name, m.photo_url, exists (select 1 from public.club_attendance a where a.session_id = x.session_id and a.user_id = m.user_id)
    from public.club_members m join public.club_roles r on r.id = m.role_id
    where m.club_id = x.club_id and m.status = 'active' and (x.audience = 'members' or r.rank <= 4) order by 4 desc, m.display_name;
end $$;
revoke execute on function public.meeting_attendance(uuid) from public, anon; grant execute on function public.meeting_attendance(uuid) to authenticated;

-- ───────────────────────── Projects and the task board ─────────────────────────
create table public.club_projects (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs on delete cascade,
  title text not null check (length(title) between 3 and 120),
  description text not null default '' check (length(description) <= 4000),
  status text not null default 'in_progress' check (status in ('planning', 'in_progress', 'completed', 'on_hold')),
  starts_on date, due date,
  cover_url text not null default '' check (cover_url = '' or cover_url ~ '^https://'),
  color text not null default '#4F2BFF' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  team uuid[] not null default '{}' check (cardinality(team) <= 100),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index club_projects_club on public.club_projects (club_id, status);
alter table public.club_projects enable row level security;
create policy "read projects" on public.club_projects for select to authenticated using (public.is_club_member(club_id) or public.club_can(club_id, 'projects.manage'));
create policy "write projects" on public.club_projects for all to authenticated using (public.club_can(club_id, 'projects.manage') and public.club_feature(club_id, 'projects')) with check (public.club_can(club_id, 'projects.manage') and public.club_feature(club_id, 'projects'));
create or replace function public.on_project_team(p uuid) returns boolean
language sql stable security definer set search_path = public as $$ select exists (select 1 from public.club_projects where id = p and auth.uid() = any (team)) $$;
grant execute on function public.on_project_team(uuid) to authenticated;

alter table public.club_tasks add column if not exists project_id uuid references public.club_projects on delete cascade;
alter table public.club_tasks add column if not exists meeting_id uuid references public.club_meetings on delete set null;
alter table public.club_tasks add column if not exists priority text not null default 'medium' check (priority in ('low', 'medium', 'high'));
alter table public.club_tasks add column if not exists checklist jsonb not null default '[]'::jsonb check (jsonb_typeof(checklist) = 'array' and jsonb_array_length(checklist) <= 30); -- [{ t, done }]
alter table public.club_tasks add column if not exists position int not null default 0;
alter table public.club_tasks add column if not exists done_at timestamptz;
create index if not exists club_tasks_project on public.club_tasks (project_id, status, position);
drop policy if exists "add tasks" on public.club_tasks;
drop policy if exists "update tasks" on public.club_tasks;
drop policy if exists "delete tasks" on public.club_tasks;
create policy "add tasks" on public.club_tasks for insert to authenticated with check (created_by = auth.uid() and (public.club_can(club_id, 'tasks.manage') or (project_id is not null and public.on_project_team(project_id))));
create policy "update tasks" on public.club_tasks for update to authenticated
  using (public.club_can(club_id, 'tasks.manage') or assignee = auth.uid() or (project_id is not null and public.on_project_team(project_id)))
  with check (public.club_can(club_id, 'tasks.manage') or assignee = auth.uid() or (project_id is not null and public.on_project_team(project_id)));
create policy "delete tasks" on public.club_tasks for delete to authenticated using (public.club_can(club_id, 'tasks.manage') or (project_id is not null and public.on_project_team(project_id)));
-- The assignee alone may only move status, position and checklist ticks.
create or replace function public.club_task_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and not public.club_can(new.club_id, 'tasks.manage') and not (new.project_id is not null and public.on_project_team(new.project_id))
     and (to_jsonb(new) - array['status', 'position', 'checklist', 'done_at']) <> (to_jsonb(old) - array['status', 'position', 'checklist', 'done_at']) then
    raise exception 'You can only move your task or tick its checklist';
  end if;
  if new.assignee is not null and not exists (select 1 from public.club_members where club_id = new.club_id and user_id = new.assignee and status = 'active') then raise exception 'Tasks can only be given to club members'; end if;
  if tg_op = 'INSERT' or new.assignee is distinct from old.assignee then new.assignee_name := coalesce((select display_name from public.club_members where club_id = new.club_id and user_id = new.assignee), ''); end if;
  if new.status = 'done' and (tg_op = 'INSERT' or old.status <> 'done') then new.done_at := now(); elsif new.status <> 'done' then new.done_at := null; end if;
  return new;
end $$;
create or replace function public.club_task_notify() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.assignee is not null and new.assignee is distinct from (case when tg_op = 'UPDATE' then old.assignee end) and new.assignee is distinct from auth.uid() then
    perform public.club_alert(new.assignee, new.club_id, 'task', 'Task assigned: ' || new.title, coalesce('Due ' || to_char(new.due, 'DD Mon'), ''),
      case when new.project_id is not null then '#/club/project?id=' || new.project_id else '#/club/space?c=' || new.club_id || '&tab=tasks' end);
  end if;
  return new;
end $$;

-- ───────────────────────── Resources (folders + files) ─────────────────────────
create table public.club_folders (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs on delete cascade,
  name text not null check (length(name) between 1 and 60),
  description text not null default '' check (length(description) <= 300),
  color text not null default 'purple' check (color in ('purple', 'blue', 'amber', 'pink', 'green', 'teal', 'orange', 'gray')),
  audience text not null default 'members' check (audience in ('members', 'exec')),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  unique (club_id, name)
);
alter table public.club_folders enable row level security;
create policy "read folders" on public.club_folders for select to authenticated using (public.club_can(club_id, 'resources.manage') or public.club_can(club_id, 'docs.manage') or (public.is_club_member(club_id) and (audience = 'members' or public.club_rank(club_id) <= 4)));
create policy "write folders" on public.club_folders for all to authenticated using (public.club_can(club_id, 'resources.manage') or public.club_can(club_id, 'docs.manage')) with check (public.club_can(club_id, 'resources.manage') or public.club_can(club_id, 'docs.manage'));
alter table public.club_docs add column if not exists folder_id uuid references public.club_folders on delete set null;
alter table public.club_docs add column if not exists meeting_id uuid references public.club_meetings on delete cascade;
alter table public.club_docs add column if not exists project_id uuid references public.club_projects on delete cascade;
alter table public.club_docs add column if not exists mime text not null default '' check (length(mime) <= 120);
alter table public.club_docs add column if not exists size bigint not null default 0;
alter table public.club_docs add column if not exists featured boolean not null default false;
alter table public.club_docs add column if not exists description text not null default '' check (length(description) <= 300);
drop policy if exists "read docs" on public.club_docs;
drop policy if exists "write docs" on public.club_docs;
create policy "read docs" on public.club_docs for select to authenticated using (public.club_can(club_id, 'docs.manage') or public.club_can(club_id, 'resources.manage') or (public.is_club_member(club_id) and (audience = 'members' or public.club_rank(club_id) <= 4)));
create policy "write docs" on public.club_docs for all to authenticated
  using (public.club_can(club_id, 'docs.manage') or public.club_can(club_id, 'resources.manage') or (project_id is not null and public.on_project_team(project_id)) or (meeting_id is not null and public.club_can(club_id, 'meetings.manage')))
  with check (public.club_can(club_id, 'docs.manage') or public.club_can(club_id, 'resources.manage') or (project_id is not null and public.on_project_team(project_id)) or (meeting_id is not null and public.club_can(club_id, 'meetings.manage')));

-- ───────────────────────── Polls (comments, categories, start time, change vote) ─────────────────────────
alter table public.club_polls add column if not exists category text not null default 'general' check (category in ('general', 'event', 'executive', 'project', 'other'));
alter table public.club_polls add column if not exists starts_at timestamptz;
alter table public.club_polls add column if not exists cover_url text not null default '' check (cover_url = '' or cover_url ~ '^https://');
create or replace function public.cast_vote(p uuid, choices int[]) returns void
language plpgsql security definer set search_path = public as $$
declare pl public.club_polls; ch int;
begin
  select * into pl from public.club_polls where id = p;
  if pl.id is null or pl.closed or (pl.closes_at is not null and now() > pl.closes_at) then raise exception 'Voting has closed'; end if;
  if pl.starts_at is not null and now() < pl.starts_at then raise exception 'Voting hasn''t started yet'; end if;
  if not public.is_club_member(pl.club_id) or (pl.audience = 'exec' and public.club_rank(pl.club_id) > 3) then raise exception 'You can''t vote in this poll'; end if;
  if cardinality(choices) = 0 or (not pl.multi and cardinality(choices) > 1) then raise exception 'Choose % option', case when pl.multi then 'at least one' else 'one' end; end if;
  insert into public.club_voted (poll_id, user_id) values (p, auth.uid());
  foreach ch in array (select array_agg(distinct x) from unnest(choices) x) loop
    if ch < 0 or ch >= jsonb_array_length(pl.options) then raise exception 'Unknown option'; end if;
    insert into public.club_ballots (poll_id, choice, user_id) values (p, ch, case when pl.anonymous then null else auth.uid() end);
  end loop;
exception when unique_violation then raise exception 'You''ve already voted';
end $$;
-- Named (not anonymous) polls only: your ballot is yours, so you may change it while voting is open.
create or replace function public.change_vote(p uuid, choices int[]) returns void
language plpgsql security definer set search_path = public as $$
declare pl public.club_polls;
begin
  select * into pl from public.club_polls where id = p;
  if pl.id is null or pl.anonymous then raise exception 'Votes in anonymous polls can''t be changed'; end if;
  if pl.closed or (pl.closes_at is not null and now() > pl.closes_at) then raise exception 'Voting has closed'; end if;
  delete from public.club_ballots where poll_id = p and user_id = auth.uid();
  delete from public.club_voted where poll_id = p and user_id = auth.uid();
  perform public.cast_vote(p, choices);
end $$;
-- What I chose (named polls only, so the app can show "You selected …").
create or replace function public.my_poll_choice(p uuid) returns int[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(choice order by choice), '{}') from public.club_ballots where poll_id = p and user_id = auth.uid();
$$;
revoke execute on function public.change_vote(uuid, int[]), public.my_poll_choice(uuid) from public, anon;
grant execute on function public.change_vote(uuid, int[]), public.my_poll_choice(uuid) to authenticated;
create table public.club_poll_comments (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.club_polls on delete cascade,
  club_id uuid not null references public.clubs on delete cascade,
  user_id uuid references auth.users (id) on delete set null default auth.uid(),
  name text not null default '',
  body text not null check (length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);
alter table public.club_poll_comments enable row level security;
create policy "read poll comments" on public.club_poll_comments for select to authenticated using (exists (select 1 from public.club_polls p where p.id = poll_id and (public.club_can(p.club_id, 'polls.create') or (public.is_club_member(p.club_id) and (p.audience = 'members' or public.club_rank(p.club_id) <= 3)))));
create policy "add poll comments" on public.club_poll_comments for insert to authenticated with check (user_id = auth.uid() and public.is_club_member(club_id) and exists (select 1 from public.club_polls p where p.id = poll_id and p.club_id = club_poll_comments.club_id));
create policy "delete poll comments" on public.club_poll_comments for delete to authenticated using (user_id = auth.uid() or public.club_can(club_id, 'comments.moderate'));
create or replace function public.club_poll_comment_stamp() returns trigger
language plpgsql security definer set search_path = public as $$
begin new.name := coalesce((select display_name from public.club_members where club_id = new.club_id and user_id = auth.uid()), ''); return new; end $$;
revoke execute on function public.club_poll_comment_stamp() from public, anon, authenticated;
create trigger club_poll_comment_stamp before insert on public.club_poll_comments for each row execute function public.club_poll_comment_stamp();

-- ───────────────────────── Elections (positions, candidates, anonymous ballots) ─────────────────────────
create table public.club_elections (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs on delete cascade,
  title text not null check (length(title) between 3 and 140),
  description text not null default '' check (length(description) <= 2000),
  rules text not null default '' check (length(rules) <= 6000),
  term_label text not null default '' check (length(term_label) <= 40), -- "2026–27"
  nomination_start timestamptz not null, nomination_end timestamptz not null,
  verification_end timestamptz, campaign_end timestamptz,
  voting_start timestamptz not null, voting_end timestamptz not null,
  results_at timestamptz,
  status text not null default 'draft' check (status in ('draft', 'published', 'applied', 'cancelled')),
  cover_url text not null default '' check (cover_url = '' or cover_url ~ '^https://'),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  check (nomination_end > nomination_start and voting_start >= nomination_end and voting_end > voting_start)
);
alter table public.club_elections enable row level security;
create table public.club_election_positions (
  id uuid primary key default gen_random_uuid(),
  election_id uuid not null references public.club_elections on delete cascade,
  club_id uuid not null references public.clubs on delete cascade,
  name text not null check (length(name) between 2 and 60),
  seats int not null default 1 check (seats between 1 and 20),
  role_id uuid references public.club_roles on delete set null, -- the role the winner gets
  sort int not null default 0
);
alter table public.club_election_positions enable row level security;
create table public.club_candidates (
  id uuid primary key default gen_random_uuid(),
  election_id uuid not null references public.club_elections on delete cascade,
  position_id uuid not null references public.club_election_positions on delete cascade,
  club_id uuid not null references public.clubs on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  name text not null default '', department text not null default '', year_label text not null default '',
  photo_url text not null default '' check (photo_url = '' or photo_url ~ '^https://'),
  statement text not null default '' check (length(statement) <= 200),
  manifesto text not null default '' check (length(manifesto) <= 4000),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'withdrawn')),
  review_note text not null default '' check (length(review_note) <= 300),
  created_at timestamptz not null default now(),
  unique (position_id, user_id)
);
alter table public.club_candidates enable row level security;
create table public.club_election_voted (
  position_id uuid not null references public.club_election_positions on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  primary key (position_id, user_id)
);
create table public.club_election_ballots (
  id uuid primary key default gen_random_uuid(),
  position_id uuid not null references public.club_election_positions on delete cascade,
  candidate_id uuid not null references public.club_candidates on delete cascade
);
alter table public.club_election_voted enable row level security;
alter table public.club_election_ballots enable row level security;
-- No direct reads of ballots for anyone; results come only from election_results().
create policy "my election votes" on public.club_election_voted for select to authenticated using (user_id = auth.uid());
create policy "read elections" on public.club_elections for select to authenticated using (public.club_can(club_id, 'elections.manage') or (status <> 'draft' and public.is_club_member(club_id)));
create policy "write elections" on public.club_elections for all to authenticated
  using (public.club_can(club_id, 'elections.manage') and public.club_rank(club_id) <= 3 and public.club_feature(club_id, 'elections'))
  with check (public.club_can(club_id, 'elections.manage') and public.club_rank(club_id) <= 3 and public.club_feature(club_id, 'elections') and status in ('draft', 'published', 'cancelled'));
create policy "read positions" on public.club_election_positions for select to authenticated using (exists (select 1 from public.club_elections e where e.id = election_id));
create policy "write positions" on public.club_election_positions for all to authenticated
  using (public.club_can(club_id, 'elections.manage') and public.club_rank(club_id) <= 3) with check (public.club_can(club_id, 'elections.manage') and public.club_rank(club_id) <= 3
    and exists (select 1 from public.club_elections e where e.id = election_id and e.club_id = club_election_positions.club_id));
create policy "read candidates" on public.club_candidates for select to authenticated using (user_id = auth.uid() or public.club_can(club_id, 'elections.manage') or (status = 'approved' and public.is_club_member(club_id)));
create policy "withdraw candidacy" on public.club_candidates for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid() and status in ('pending', 'withdrawn'));

create or replace function public.election_phase(e public.club_elections) returns text
language sql stable as $$
  select case when e.status = 'cancelled' then 'cancelled' when e.status = 'applied' then 'applied' when e.status = 'draft' then 'draft'
    when now() < e.nomination_start then 'upcoming' when now() < e.nomination_end then 'nomination'
    when now() < coalesce(e.verification_end, e.nomination_end) then 'verification' when now() < e.voting_start then 'campaign'
    when now() < e.voting_end then 'voting' else 'results' end;
$$;
grant execute on function public.election_phase(public.club_elections) to authenticated;
create or replace function public.nominate(pos uuid, stmt text, mani text, photo text default '', yr text default '') returns uuid
language plpgsql security definer set search_path = public as $$
declare p public.club_election_positions; e public.club_elections; m public.club_members; cid uuid;
begin
  select * into p from public.club_election_positions where id = pos;
  select * into e from public.club_elections where id = p.election_id;
  if e.id is null or public.election_phase(e) <> 'nomination' then raise exception 'Nominations aren''t open'; end if;
  select * into m from public.club_members where club_id = e.club_id and user_id = auth.uid() and status = 'active';
  if m.user_id is null then raise exception 'Only club members can stand'; end if;
  if (select count(*) from public.club_candidates where election_id = e.id and user_id = auth.uid() and status <> 'withdrawn') >= 2 then raise exception 'You can stand for two positions at most'; end if;
  insert into public.club_candidates (election_id, position_id, club_id, user_id, name, department, year_label, photo_url, statement, manifesto)
  values (e.id, pos, e.club_id, auth.uid(), m.display_name, m.department, left(coalesce(yr, ''), 20), case when coalesce(photo, '') ~ '^https://' then photo else '' end, left(coalesce(stmt, ''), 200), left(coalesce(mani, ''), 4000))
  on conflict (position_id, user_id) do update set statement = excluded.statement, manifesto = excluded.manifesto, photo_url = excluded.photo_url, year_label = excluded.year_label, status = 'pending'
  returning id into cid;
  return cid;
end $$;
create or replace function public.review_candidate(cand uuid, approve boolean, note text default '') returns void
language plpgsql security definer set search_path = public as $$
declare x public.club_candidates;
begin
  select * into x from public.club_candidates where id = cand;
  if x.id is null or not public.club_can(x.club_id, 'elections.manage') then raise exception 'You don''t have permission to review candidates'; end if;
  update public.club_candidates set status = case when approve then 'approved' else 'rejected' end, review_note = left(coalesce(note, ''), 300) where id = cand;
  perform public.club_alert(x.user_id, x.club_id, 'poll', case when approve then 'Your nomination was approved' else 'Your nomination wasn''t approved' end, coalesce(nullif(note, ''), ''), '#/club/election?id=' || x.election_id);
end $$;
create or replace function public.cast_election_vote(pos uuid, picks uuid[]) returns void
language plpgsql security definer set search_path = public as $$
declare p public.club_election_positions; e public.club_elections; c uuid;
begin
  select * into p from public.club_election_positions where id = pos;
  select * into e from public.club_elections where id = p.election_id;
  if e.id is null or public.election_phase(e) <> 'voting' then raise exception 'Voting isn''t open'; end if;
  if not public.is_club_member(e.club_id) then raise exception 'Only club members can vote'; end if;
  if cardinality(picks) = 0 or cardinality(picks) > p.seats then raise exception 'Choose up to % candidate(s)', p.seats; end if;
  insert into public.club_election_voted (position_id, user_id) values (pos, auth.uid());
  foreach c in array (select array_agg(distinct x) from unnest(picks) x) loop
    if not exists (select 1 from public.club_candidates where id = c and position_id = pos and status = 'approved') then raise exception 'Unknown candidate'; end if;
    insert into public.club_election_ballots (position_id, candidate_id) values (pos, c);
  end loop;
exception when unique_violation then raise exception 'You''ve already voted for this position';
end $$;
-- Results: after voting ends for members; election managers see live counts.
create or replace function public.election_results(el uuid) returns table (position_id uuid, candidate_id uuid, votes int, voters int, elected boolean)
language plpgsql stable security definer set search_path = public as $$
declare e public.club_elections;
begin
  select * into e from public.club_elections where id = el;
  if e.id is null or not (public.is_club_member(e.club_id) or public.club_can(e.club_id, 'elections.manage')) then raise exception 'Not allowed'; end if;
  if public.election_phase(e) not in ('results', 'applied') and not public.club_can(e.club_id, 'elections.manage') then return; end if;
  return query
    with t as (select c.position_id, c.id candidate_id, (select count(*)::int from public.club_election_ballots b where b.candidate_id = c.id) votes
               from public.club_candidates c where c.election_id = el and c.status = 'approved'),
         r as (select t.*, rank() over (partition by t.position_id order by t.votes desc) rk from t)
    select r.position_id, r.candidate_id, r.votes, (select count(*)::int from public.club_election_voted v where v.position_id = r.position_id),
      r.votes > 0 and r.rk <= (select seats from public.club_election_positions where id = r.position_id) from r;
end $$;
-- Apply the results: the outgoing committee goes to History, winners get their positions (ties need a manual decision).
create or replace function public.apply_election(el uuid) returns int
language plpgsql security definer set search_path = public as $$
declare e public.club_elections; a jsonb := '[]'; n int;
begin
  select * into e from public.club_elections where id = el;
  if e.id is null or public.club_rank(e.club_id) > 2 then raise exception 'Only a club admin can apply election results'; end if;
  if public.election_phase(e) <> 'results' then raise exception 'Voting hasn''t finished'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('user_id', c.user_id, 'role_id', p.role_id, 'title', p.name)), '[]') into a
  from public.election_results(el) r join public.club_candidates c on c.id = r.candidate_id join public.club_election_positions p on p.id = r.position_id
  where r.elected and p.role_id is not null;
  perform public.handover_term(e.club_id, coalesce(nullif(e.term_label, ''), to_char(now(), 'YYYY')), a);
  update public.club_elections set status = 'applied' where id = el;
  n := jsonb_array_length(a);
  perform public.club_log(e.club_id, 'election.applied', jsonb_build_object('election', e.title, 'positions', n));
  return n;
end $$;
revoke execute on function public.nominate(uuid, text, text, text, text), public.review_candidate(uuid, boolean, text), public.cast_election_vote(uuid, uuid[]), public.election_results(uuid), public.apply_election(uuid) from public, anon;
grant execute on function public.nominate(uuid, text, text, text, text), public.review_candidate(uuid, boolean, text), public.cast_election_vote(uuid, uuid[]), public.election_results(uuid), public.apply_election(uuid) to authenticated;

-- ───────────────────────── Recruitment: interviews and scores ─────────────────────────
alter table public.form_responses drop constraint if exists form_responses_status_check;
alter table public.form_responses add constraint form_responses_status_check check (status in ('pending', 'shortlisted', 'interview', 'accepted', 'waitlisted', 'rejected'));
alter table public.form_responses add column if not exists score jsonb not null default '{}'::jsonb check (jsonb_typeof(score) = 'object'); -- { criterion: points }
alter table public.form_responses add column if not exists score_total numeric(6, 2);
alter table public.form_responses add column if not exists interview_place text not null default '' check (length(interview_place) <= 120);
alter table public.form_responses add column if not exists evaluated_by uuid references auth.users (id) on delete set null;
alter table public.form_responses add column if not exists position_pref text not null default '' check (length(position_pref) <= 120);
create or replace function public.review_responses(ids uuid[], st text default null, nt text default null, paid boolean default null, interview timestamptz default null) returns int
language plpgsql security definer set search_path = public as $$
declare r public.form_responses; fm public.club_forms; k text; n int := 0;
begin
  if st is not null and st not in ('pending', 'shortlisted', 'interview', 'accepted', 'waitlisted', 'rejected') then raise exception 'Unknown status'; end if;
  for r in select * from public.form_responses where id = any (ids) loop
    if not public.club_can(r.club_id, 'forms.view_responses') then raise exception 'You don''t have permission to review responses'; end if;
    update public.form_responses set status = coalesce(st, status), note = coalesce(left(nt, 500), note), payment_verified = coalesce(paid, payment_verified),
      interview_at = coalesce(interview, interview_at), updated_at = now() where id = r.id;
    if st is not null and st is distinct from r.status then
      select * into fm from public.club_forms where id = r.form_id; select name into k from public.clubs where id = r.club_id;
      if st = 'accepted' and fm.kind = 'membership' then perform public.club_add_member(r.club_id, r.user_id, 7, r.name, r.email, r.student_id, r.department, auth.uid()); end if;
      if st in ('accepted', 'rejected', 'shortlisted', 'waitlisted', 'interview') then
        perform public.club_notify(r.user_id, k || ': ' || case st when 'accepted' then 'you''re in!' when 'rejected' then 'application update' when 'shortlisted' then 'you''re shortlisted' when 'interview' then 'interview invitation' else 'you''re on the waitlist' end,
          fm.title || case when coalesce(interview, r.interview_at) is not null and st in ('shortlisted', 'interview') then ' · Interview ' || to_char(coalesce(interview, r.interview_at) at time zone 'Asia/Dhaka', 'DD Mon, HH12:MI AM') else '' end, '#/club/mine');
      end if;
    end if;
    n := n + 1;
  end loop;
  if n > 0 then perform public.club_log(r.club_id, 'responses.reviewed', jsonb_build_object('count', n, 'status', st)); end if;
  return n;
end $$;
-- Score an applicant against the form's rubric (settings.rubric: [{ key, label, max }]).
create or replace function public.score_response(rid uuid, sc jsonb) returns numeric
language plpgsql security definer set search_path = public as $$
declare r public.form_responses; rub jsonb; tot numeric := 0; it jsonb; v numeric;
begin
  select * into r from public.form_responses where id = rid;
  if r.id is null or not (public.club_can(r.club_id, 'recruitment.evaluate') or public.club_can(r.club_id, 'forms.view_responses')) then raise exception 'You don''t have permission to score applicants'; end if;
  select coalesce(settings -> 'rubric', '[]') into rub from public.club_forms where id = r.form_id;
  for it in select * from jsonb_array_elements(rub) loop
    v := least(greatest(coalesce((sc ->> (it ->> 'key'))::numeric, 0), 0), coalesce((it ->> 'max')::numeric, 0));
    tot := tot + v;
  end loop;
  update public.form_responses set score = coalesce(sc, '{}'), score_total = tot, evaluated_by = auth.uid(), updated_at = now() where id = rid;
  return tot;
end $$;
create or replace function public.set_interview(ids uuid[], at timestamptz, place text default '') returns int
language plpgsql security definer set search_path = public as $$
declare r public.form_responses; n int := 0;
begin
  for r in select * from public.form_responses where id = any (ids) loop
    if not public.club_can(r.club_id, 'forms.view_responses') then raise exception 'You don''t have permission to schedule interviews'; end if;
    update public.form_responses set interview_at = at, interview_place = left(coalesce(place, ''), 120), status = case when status in ('pending', 'shortlisted') then 'interview' else status end, updated_at = now() where id = r.id;
    perform public.club_alert(r.user_id, r.club_id, 'recruitment', 'Interview scheduled', to_char(at at time zone 'Asia/Dhaka', 'Dy DD Mon, HH12:MI AM') || coalesce(' · ' || nullif(place, ''), ''), '#/club/mine');
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public.score_response(uuid, jsonb), public.set_interview(uuid[], timestamptz, text) from public, anon;
grant execute on function public.score_response(uuid, jsonb), public.set_interview(uuid[], timestamptz, text) to authenticated;

-- ───────────────────────── Events: speakers, schedule, FAQs, volunteers ─────────────────────────
alter table public.events add column if not exists speakers jsonb not null default '[]'::jsonb check (jsonb_typeof(speakers) = 'array' and jsonb_array_length(speakers) <= 20); -- [{ name, role, photo }]
alter table public.events add column if not exists agenda jsonb not null default '[]'::jsonb check (jsonb_typeof(agenda) = 'array' and jsonb_array_length(agenda) <= 40); -- [{ at, title, published }]
alter table public.events add column if not exists faqs jsonb not null default '[]'::jsonb check (jsonb_typeof(faqs) = 'array' and jsonb_array_length(faqs) <= 20); -- [{ q, a }]
alter table public.events add column if not exists perks text[] not null default '{}' check (cardinality(perks) <= 6); -- "Certificate for participants"
alter table public.events add column if not exists volunteer_form_id uuid references public.club_forms on delete set null;
alter table public.events add column if not exists seeking_sponsors boolean not null default false;
alter table public.events add column if not exists collab_id uuid;
create or replace function public.event_stats(ev uuid) returns json
language plpgsql stable security definer set search_path = public as $$
declare e public.events;
begin
  select * into e from public.events where id = ev;
  if e.id is null or e.club_id is null or not (public.club_can(e.club_id, 'events.manage') or public.club_can(e.club_id, 'events.checkin') or public.club_can(e.club_id, 'forms.view_responses')) then raise exception 'Not allowed'; end if;
  return json_build_object(
    'capacity', e.capacity,
    'registered', (select count(*) from public.form_responses r where r.form_id = e.form_id and r.status in ('pending', 'shortlisted', 'interview', 'accepted')),
    'waitlist', (select count(*) from public.form_responses r where r.form_id = e.form_id and r.status = 'waitlisted'),
    'checked_in', (select count(*) from public.form_responses r where r.form_id = e.form_id and r.checked_in_at is not null),
    'volunteers', (select count(*) from public.form_responses r where r.form_id = e.volunteer_form_id and r.status in ('pending', 'accepted')),
    'per_hour', (select coalesce(json_agg(json_build_object('h', h, 'n', n) order by h), '[]') from (select date_trunc('hour', r.checked_in_at) h, count(*) n from public.form_responses r where r.form_id = e.form_id and r.checked_in_at is not null group by 1) x),
    'by_department', (select coalesce(json_object_agg(d, n), '{}') from (select coalesce(nullif(r.department, ''), '—') d, count(*) n from public.form_responses r where r.form_id = e.form_id group by 1) x));
end $$;
-- Door scanner / manual check-in by attendee name, email or ticket.
create or replace function public.event_checkin(ev uuid, q text) returns public.form_responses
language plpgsql security definer set search_path = public as $$
declare e public.events; r public.form_responses;
begin
  select * into e from public.events where id = ev;
  if e.id is null or not (public.club_can(e.club_id, 'events.checkin') or public.club_can(e.club_id, 'attendance.take')) then raise exception 'You don''t have permission to check people in'; end if;
  select * into r from public.form_responses where form_id = e.form_id and (ticket = upper(trim(regexp_replace(q, '^ewud:t:', ''))) or id::text = trim(q)) limit 1;
  if r.id is null then raise exception 'No registration with that ticket'; end if;
  if r.status in ('rejected', 'waitlisted') then raise exception 'This registration is %', r.status; end if;
  if r.checked_in_at is null then update public.form_responses set checked_in_at = now() where id = r.id returning * into r; end if;
  return r;
end $$;
-- Tell everyone registered for an event (in the club notification centre).
create or replace function public.notify_registrants(ev uuid, t text, b text) returns int
language plpgsql security definer set search_path = public as $$
declare e public.events; n int;
begin
  select * into e from public.events where id = ev;
  if e.id is null or not public.club_can(e.club_id, 'events.manage') then raise exception 'Not allowed'; end if;
  insert into public.club_notifications (user_id, club_id, kind, title, body, link)
  select r.user_id, e.club_id, 'event', left(e.title || ': ' || t, 160), left(coalesce(b, ''), 1000), '#/club/event?id=' || ev from public.form_responses r where r.form_id = e.form_id and r.status not in ('rejected');
  get diagnostics n = row_count;
  perform public.club_log(e.club_id, 'event.notified', jsonb_build_object('event', e.title, 'people', n));
  return n;
end $$;
revoke execute on function public.event_stats(uuid), public.event_checkin(uuid, text), public.notify_registrants(uuid, text, text) from public, anon;
grant execute on function public.event_stats(uuid), public.event_checkin(uuid, text), public.notify_registrants(uuid, text, text) to authenticated;

-- ───────────────────────── Handover checklist ─────────────────────────
create table public.club_handover (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs on delete cascade,
  label text not null check (length(label) between 2 and 40), -- "2026 → 2027"
  items jsonb not null default '[]'::jsonb check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) <= 60), -- [{ title, done, total, note }]
  notes text not null default '' check (length(notes) <= 6000),
  status text not null default 'open' check (status in ('open', 'done')),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.club_handover enable row level security;
create policy "read handover" on public.club_handover for select to authenticated using (public.club_rank(club_id) <= 4);
create policy "write handover" on public.club_handover for all to authenticated using (public.club_rank(club_id) <= 3 or public.club_can(club_id, 'settings.edit')) with check (public.club_rank(club_id) <= 3 or public.club_can(club_id, 'settings.edit'));

-- ───────────────────────── Feedback and engagement ─────────────────────────
create table public.club_feedback (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs on delete cascade,
  event_id uuid references public.events on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  name text not null default '',
  rating int not null check (rating between 1 and 5),
  body text not null default '' check (length(body) <= 1000),
  likes text[] not null default '{}' check (cardinality(likes) <= 6), -- workshops, social, competitions, networking, community
  created_at timestamptz not null default now()
);
create unique index club_feedback_once on public.club_feedback (club_id, coalesce(event_id, '00000000-0000-0000-0000-000000000000'::uuid), user_id);
alter table public.club_feedback enable row level security;
create policy "read feedback" on public.club_feedback for select to authenticated using (user_id = auth.uid() or public.club_can(club_id, 'analytics.view'));
create policy "give feedback" on public.club_feedback for insert to authenticated with check (user_id = auth.uid() and (public.is_club_member(club_id)
  or (event_id is not null and exists (select 1 from public.events e join public.form_responses r on r.form_id = e.form_id where e.id = event_id and r.user_id = auth.uid()))));
create or replace function public.club_feedback_stamp() returns trigger
language plpgsql security definer set search_path = public as $$
begin new.name := coalesce((select display_name from public.club_members where club_id = new.club_id and user_id = auth.uid()), public.club_me() ->> 'name', ''); return new; end $$;
revoke execute on function public.club_feedback_stamp() from public, anon, authenticated;
create trigger club_feedback_stamp before insert on public.club_feedback for each row execute function public.club_feedback_stamp();

-- Everything the analytics screens need, in one call.
create or replace function public.club_analytics(c uuid) returns json
language plpgsql stable security definer set search_path = public as $$
declare since timestamptz := date_trunc('month', now()) - interval '11 months';
begin
  if not public.club_can(c, 'analytics.view') then raise exception 'You don''t have permission to see club analytics'; end if;
  return json_build_object(
    'members', (select count(*) from public.club_members where club_id = c and status = 'active'),
    'members_prev', (select count(*) from public.club_members where club_id = c and joined_at < now() - interval '30 days' and (status = 'active' or left_at > now() - interval '30 days')),
    'events', (select count(*) from public.events where club_id = c),
    'events_prev', (select count(*) from public.events where club_id = c and created_at < now() - interval '30 days'),
    'posts', (select count(*) from public.club_posts where club_id = c and status = 'published' and source_url = ''),
    'posts_prev', (select count(*) from public.club_posts where club_id = c and status = 'published' and source_url = '' and created_at < now() - interval '30 days'),
    'growth', (select coalesce(json_agg(json_build_object('m', to_char(g, 'YYYY-MM'),
        'total', (select count(*) from public.club_members m where m.club_id = c and m.joined_at < g + interval '1 month' and (m.left_at is null or m.left_at >= g + interval '1 month')),
        'active', (select count(distinct a.user_id) from public.club_attendance a where a.club_id = c and a.at >= g and a.at < g + interval '1 month')
          + (select count(distinct x.author_id) from public.club_messages x where x.club_id = c and x.created_at >= g and x.created_at < g + interval '1 month'
               and not exists (select 1 from public.club_attendance a2 where a2.club_id = c and a2.user_id = x.author_id and a2.at >= g and a2.at < g + interval '1 month')),
        'new', (select count(*) from public.club_members m where m.club_id = c and m.joined_at >= g and m.joined_at < g + interval '1 month'),
        'left', (select count(*) from public.club_members m where m.club_id = c and m.left_at >= g and m.left_at < g + interval '1 month')) order by g), '[]')
      from generate_series(since, date_trunc('month', now()), interval '1 month') g),
    'by_department', (select coalesce(json_object_agg(d, n), '{}') from (select coalesce(nullif(department, ''), coalesce(case split_part(student_id, '-', 3) when '60' then 'CSE' end, 'Other')) d, count(*) n from public.club_members where club_id = c and status = 'active' group by 1) x),
    'by_batch', (select coalesce(json_object_agg(b, n), '{}') from (select coalesce(nullif(substring(student_id from '^(\d{4})'), ''), 'Other') b, count(*) n from public.club_members where club_id = c and status = 'active' group by 1) x),
    'events_monthly', (select coalesce(json_agg(json_build_object('m', to_char(g, 'YYYY-MM'),
        'registrations', (select count(*) from public.form_responses r join public.events e on e.form_id = r.form_id where e.club_id = c and r.created_at >= g and r.created_at < g + interval '1 month'),
        'attendance', (select count(*) from public.form_responses r join public.events e on e.form_id = r.form_id where e.club_id = c and r.checked_in_at >= g and r.checked_in_at < g + interval '1 month')) order by g), '[]')
      from generate_series(since, date_trunc('month', now()), interval '1 month') g),
    'top_events', (select coalesce(json_agg(t), '[]') from (select e.id, e.title, e.starts_at, e.image, (select count(*) from public.form_responses r where r.form_id = e.form_id) participants
        from public.events e where e.club_id = c order by participants desc, e.starts_at desc limit 5) t),
    'top_members', (select coalesce(json_agg(t), '[]') from (select m.user_id, m.display_name, m.photo_url, r.name role_name,
        (select count(*) from public.club_attendance a where a.club_id = c and a.user_id = m.user_id and a.at > now() - interval '90 days') * 3
        + (select count(*) from public.club_tasks t where t.club_id = c and t.assignee = m.user_id and t.status = 'done' and t.done_at > now() - interval '90 days') * 2
        + (select count(*) from public.club_messages x where x.club_id = c and x.author_id = m.user_id and x.created_at > now() - interval '90 days') score
        from public.club_members m join public.club_roles r on r.id = m.role_id where m.club_id = c and m.status = 'active' order by score desc, m.display_name limit 5) t),
    'sessions', (select coalesce(json_agg(t), '[]') from (select s.title, s.starts_at, (select count(*) from public.club_attendance a where a.session_id = s.id) present from public.club_sessions s where s.club_id = c order by s.starts_at desc limit 12) t),
    'recruitment', (select coalesce(json_agg(t), '[]') from (select f.id, f.title, f.kind, (select json_object_agg(st, n) from (select r.status st, count(*) n from public.form_responses r where r.form_id = f.id group by 1) z) statuses
        from public.club_forms f where f.club_id = c and f.kind in ('membership', 'volunteer', 'competition') order by f.created_at desc limit 6) t),
    'finance_monthly', case when public.club_can(c, 'finance.view') then (select coalesce(json_agg(json_build_object('m', to_char(g, 'YYYY-MM'),
        'income', (select coalesce(sum(amount), 0) from public.club_finance f where f.club_id = c and f.kind = 'income' and f.on_date >= g and f.on_date < g + interval '1 month'),
        'expense', (select coalesce(sum(amount), 0) from public.club_finance f where f.club_id = c and f.kind = 'expense' and f.on_date >= g and f.on_date < g + interval '1 month')) order by g), '[]')
      from generate_series(since, date_trunc('month', now()), interval '1 month') g) else null end,
    'content', (select coalesce(json_object_agg(k, n), '{}') from (select p.kind k, sum((select count(*) from public.club_reactions x where x.post_id = p.id) + (select count(*) from public.club_comments cm where cm.post_id = p.id)) n
        from public.club_posts p where p.club_id = c and p.source_url = '' group by 1) z),
    'feedback', json_build_object('avg', (select round(avg(rating)::numeric, 1) from public.club_feedback where club_id = c), 'count', (select count(*) from public.club_feedback where club_id = c),
      'positive', (select round(100.0 * count(*) filter (where rating >= 4) / nullif(count(*), 0)) from public.club_feedback where club_id = c and event_id is not null),
      'likes', (select coalesce(json_object_agg(l, n), '{}') from (select unnest(likes) l, count(*) n from public.club_feedback where club_id = c group by 1) z),
      'recent', (select coalesce(json_agg(t), '[]') from (select name, rating, body, created_at from public.club_feedback where club_id = c and body <> '' order by created_at desc limit 6) t)),
    'inactive', (select count(*) from public.club_members m where m.club_id = c and m.status = 'active' and m.joined_at < now() - interval '30 days'
        and not exists (select 1 from public.club_attendance a where a.club_id = c and a.user_id = m.user_id and a.at > now() - interval '30 days')
        and not exists (select 1 from public.club_messages x where x.club_id = c and x.author_id = m.user_id and x.created_at > now() - interval '30 days')),
    'new_30d', (select count(*) from public.club_members where club_id = c and status = 'active' and joined_at > now() - interval '30 days'));
end $$;
-- A friendly nudge to members inactive for 30+ days (once a week per club).
create or replace function public.remind_inactive(c uuid, msg text default '') returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.club_can(c, 'analytics.view') then raise exception 'Not allowed'; end if;
  if exists (select 1 from public.club_audit where club_id = c and action = 'members.reminded' and at > now() - interval '7 days') then raise exception 'You sent a reminder this week already'; end if;
  insert into public.club_notifications (user_id, club_id, kind, title, body, link)
  select m.user_id, c, 'announcement', 'We miss you at ' || (select name from public.clubs where id = c), coalesce(nullif(left(msg, 600), ''), 'Come along to our next event or say hello in the members'' chat.'), '#/club/space?c=' || c
  from public.club_members m where m.club_id = c and m.status = 'active' and m.joined_at < now() - interval '30 days'
    and not exists (select 1 from public.club_attendance a where a.club_id = c and a.user_id = m.user_id and a.at > now() - interval '30 days')
    and not exists (select 1 from public.club_messages x where x.club_id = c and x.author_id = m.user_id and x.created_at > now() - interval '30 days');
  get diagnostics n = row_count;
  perform public.club_log(c, 'members.reminded', jsonb_build_object('people', n));
  return n;
end $$;
-- Member profile: numbers and recent activity (members of the club; their own profile always).
create or replace function public.club_member_detail(c uuid, u uuid) returns json
language plpgsql stable security definer set search_path = public as $$
declare m public.club_members; r public.club_roles; see_all boolean := public.club_can(c, 'members.approve');
begin
  select * into m from public.club_members where club_id = c and user_id = u;
  if m.user_id is null or not (u = auth.uid() or see_all or (public.is_club_member(c) and (m.in_directory or m.visibility <> 'private'))) then raise exception 'Not allowed'; end if;
  select * into r from public.club_roles where id = m.role_id;
  return json_build_object(
    'user_id', m.user_id, 'display_name', m.display_name, 'title', m.title, 'role_id', r.id, 'role_name', r.name, 'role_color', r.color, 'rank', r.rank, 'wing', m.wing, 'department', m.department,
    'status', m.status, 'joined_at', m.joined_at, 'bio', m.bio, 'skills', m.skills, 'socials', m.socials, 'photo_url', m.photo_url,
    'email', case when see_all or u = auth.uid() or (m.show_email and public.club_rank(c) <= 4) then m.email else '' end,
    'student_id', case when see_all or u = auth.uid() then m.student_id else '' end,
    'events', (select count(*) from public.form_responses x join public.events e on e.form_id = x.form_id where e.club_id = c and x.user_id = u and x.checked_in_at is not null)
      + (select count(*) from public.club_attendance a where a.club_id = c and a.user_id = u),
    'projects', (select count(*) from public.club_projects p where p.club_id = c and u = any (p.team)),
    'tasks_done', (select count(*) from public.club_tasks t where t.club_id = c and t.assignee = u and t.status = 'done'),
    'attendance_pct', (select round(100.0 * (select count(*) from public.club_attendance a where a.club_id = c and a.user_id = u and a.at >= m.joined_at) / nullif(count(*), 0)) from public.club_sessions s where s.club_id = c and s.starts_at >= m.joined_at),
    'activity', (select coalesce(json_agg(t order by t.at desc), '[]') from (
        (select 'attended' k, s.title, a.at from public.club_attendance a join public.club_sessions s on s.id = a.session_id where a.club_id = c and a.user_id = u order by a.at desc limit 5)
        union all (select 'task', t.title, t.done_at from public.club_tasks t where t.club_id = c and t.assignee = u and t.status = 'done' order by t.done_at desc limit 5)
        union all (select 'post', p.title, p.created_at from public.club_posts p where p.club_id = c and p.author_id = u and p.status = 'published' order by p.created_at desc limit 5)) t));
end $$;
revoke execute on function public.club_analytics(uuid), public.remind_inactive(uuid, text), public.club_member_detail(uuid, uuid) from public, anon;
grant execute on function public.club_analytics(uuid), public.remind_inactive(uuid, text), public.club_member_detail(uuid, uuid) to authenticated;

-- ───────────────────────── Help centre: support tickets ─────────────────────────
create table public.support_tickets (
  id bigint generated always as identity (start with 2500) primary key,
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  name text not null default '', email text not null default '',
  club_id uuid references public.clubs on delete set null,
  category text not null default 'other' check (category in ('account', 'membership', 'events', 'recruitment', 'messaging', 'polls', 'resources', 'store', 'technical', 'feature', 'question', 'other')),
  kind text not null default 'problem' check (kind in ('problem', 'feature', 'question')),
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high')),
  subject text not null check (length(subject) between 3 and 140),
  body text not null check (length(body) between 3 and 4000),
  attachments jsonb not null default '[]'::jsonb check (jsonb_typeof(attachments) = 'array' and jsonb_array_length(attachments) <= 4),
  status text not null default 'open' check (status in ('open', 'pending', 'resolved', 'closed')),
  assigned_to uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index support_tickets_user on public.support_tickets (user_id, created_at desc);
create index support_tickets_status on public.support_tickets (status, created_at desc);
alter table public.support_tickets enable row level security;
create table public.support_messages (
  id bigint generated always as identity primary key,
  ticket_id bigint not null references public.support_tickets on delete cascade,
  user_id uuid references auth.users (id) on delete set null default auth.uid(),
  from_staff boolean not null default false,
  name text not null default '',
  body text not null check (length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);
alter table public.support_messages enable row level security;
create policy "read my tickets" on public.support_tickets for select to authenticated using (user_id = auth.uid() or public.can('support.manage'));
create policy "open tickets" on public.support_tickets for insert to authenticated with check (user_id = auth.uid() and status = 'open' and assigned_to is null and public.daily_limit('support_tickets', 'user_id', 10));
create policy "staff update tickets" on public.support_tickets for update to authenticated using (public.can('support.manage') or user_id = auth.uid()) with check (public.can('support.manage') or (user_id = auth.uid() and status in ('open', 'closed')));
create policy "read ticket messages" on public.support_messages for select to authenticated using (exists (select 1 from public.support_tickets t where t.id = ticket_id and (t.user_id = auth.uid() or public.can('support.manage'))));
create policy "reply tickets" on public.support_messages for insert to authenticated with check (user_id = auth.uid() and exists (select 1 from public.support_tickets t where t.id = ticket_id and (t.user_id = auth.uid() or public.can('support.manage'))));
create or replace function public.support_stamp() returns trigger
language plpgsql security definer set search_path = public as $$
declare t public.support_tickets;
begin
  if tg_table_name = 'support_tickets' then
    if tg_op = 'INSERT' then new.name := public.club_me() ->> 'name'; new.email := public.club_me() ->> 'email'; end if;
    new.updated_at := now();
    return new;
  end if;
  select * into t from public.support_tickets where id = new.ticket_id;
  new.from_staff := public.can('support.manage') and t.user_id <> auth.uid();
  new.name := case when new.from_staff then 'Support Team' else coalesce(public.club_me() ->> 'name', '') end;
  update public.support_tickets set updated_at = now(), status = case when new.from_staff and status = 'open' then 'pending' when not new.from_staff and status in ('pending', 'resolved') then 'open' else status end where id = new.ticket_id;
  if new.from_staff then perform public.club_alert(t.user_id, t.club_id, 'other', 'Reply to your ticket #' || t.id, left(new.body, 160), '#/club/ticket?id=' || t.id); end if;
  return new;
end $$;
revoke execute on function public.support_stamp() from public, anon, authenticated;
create trigger support_ticket_stamp before insert or update on public.support_tickets for each row execute function public.support_stamp();
create trigger support_message_stamp before insert on public.support_messages for each row execute function public.support_stamp();
update public.role_permissions set perms = (select array_agg(distinct x) from unnest(perms || array['support.manage']) x) where role in ('admin', 'editor');
-- Ticket files: clubs-private/support/<user_id>/…
create policy "support files read" on storage.objects for select to authenticated using (bucket_id = 'clubs-private' and (storage.foldername(name))[1] = 'support' and ((storage.foldername(name))[2] = auth.uid()::text or public.can('support.manage')));
create policy "support files upload" on storage.objects for insert to authenticated with check (bucket_id = 'clubs-private' and (storage.foldername(name))[1] = 'support' and (storage.foldername(name))[2] = auth.uid()::text);

-- ───────────────────────── Storage for chat files ─────────────────────────
-- clubs-private/<club>/chat/<channel>/<file>: anyone who can read the channel; upload if you can post.
update storage.buckets set allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf', 'text/plain', 'text/csv', 'application/zip',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
  where id = 'clubs-private';
create or replace function public.chat_folder(name text) returns uuid
language sql immutable as $$ select case when (storage.foldername(name))[2] = 'chat' and (storage.foldername(name))[3] ~ '^[0-9a-f-]{36}$' then (storage.foldername(name))[3]::uuid end $$;
create policy "chat files read" on storage.objects for select to authenticated using (bucket_id = 'clubs-private' and public.chat_folder(name) is not null and public.can_read_channel(public.chat_folder(name)));
create policy "chat files upload" on storage.objects for insert to authenticated with check (bucket_id = 'clubs-private' and public.chat_folder(name) is not null and public.can_post_channel(public.chat_folder(name))
  and (select club_id from public.club_channels where id = public.chat_folder(name)) = public.club_folder(name));
-- Resource managers (not only docs.manage) may upload to docs/.
create policy "club resources upload" on storage.objects for insert to authenticated with check (bucket_id = 'clubs-private' and (storage.foldername(name))[2] = 'docs'
  and (public.club_can(public.club_folder(name), 'resources.manage') or public.club_can(public.club_folder(name), 'meetings.manage') or public.club_can(public.club_folder(name), 'projects.manage')));
create policy "club resources delete" on storage.objects for delete to authenticated using (bucket_id = 'clubs-private' and (storage.foldername(name))[2] = 'docs' and public.club_can(public.club_folder(name), 'resources.manage'));
-- Members upload their own photos to clubs-public/<club>/people/<user>/…
create policy "club people photos" on storage.objects for insert to authenticated with check (bucket_id = 'clubs-public' and (storage.foldername(name))[2] = 'people' and (storage.foldername(name))[3] = auth.uid()::text and public.is_club_member(public.club_folder(name)));

-- ───────────────────────── Download my club data ─────────────────────────
create or replace function public.export_my_club_data() returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'exported_at', now(),
    'memberships', (select coalesce(json_agg(json_build_object('club', k.name, 'role', r.name, 'title', m.title, 'wing', m.wing, 'status', m.status, 'joined_at', m.joined_at, 'bio', m.bio, 'skills', m.skills, 'socials', m.socials, 'visibility', m.visibility)), '[]')
      from public.club_members m join public.clubs k on k.id = m.club_id join public.club_roles r on r.id = m.role_id where m.user_id = auth.uid()),
    'following', (select coalesce(json_agg(k.name), '[]') from public.club_follows f join public.clubs k on k.id = f.club_id where f.user_id = auth.uid()),
    'posts', (select coalesce(json_agg(json_build_object('club', club_id, 'title', title, 'body', body, 'created_at', created_at)), '[]') from public.club_posts where author_id = auth.uid()),
    'comments', (select coalesce(json_agg(json_build_object('post', post_id, 'body', body, 'created_at', created_at)), '[]') from public.club_comments where user_id = auth.uid()),
    'messages', (select coalesce(json_agg(json_build_object('channel', channel_id, 'body', body, 'created_at', created_at)), '[]') from public.club_messages where author_id = auth.uid() and not deleted),
    'registrations', (select coalesce(json_agg(json_build_object('form', f.title, 'status', r.status, 'answers', r.answers, 'phone', r.phone, 'created_at', r.created_at)), '[]')
      from public.form_responses r join public.club_forms f on f.id = r.form_id where r.user_id = auth.uid()),
    'tasks', (select coalesce(json_agg(json_build_object('title', title, 'status', status, 'due', due)), '[]') from public.club_tasks where assignee = auth.uid()),
    'polls_voted', (select count(*) from public.club_voted where user_id = auth.uid()),
    'attendance', (select count(*) from public.club_attendance where user_id = auth.uid()),
    'certificates', (select coalesce(json_agg(json_build_object('title', title, 'event', event, 'code', code, 'issued_on', issued_on)), '[]') from public.club_certificates where user_id = auth.uid()),
    'feedback', (select coalesce(json_agg(json_build_object('rating', rating, 'body', body, 'created_at', created_at)), '[]') from public.club_feedback where user_id = auth.uid()),
    'tickets', (select coalesce(json_agg(json_build_object('id', id, 'subject', subject, 'status', status, 'created_at', created_at)), '[]') from public.support_tickets where user_id = auth.uid()));
$$;
revoke execute on function public.export_my_club_data() from public, anon; grant execute on function public.export_my_club_data() to authenticated;

-- ───────────────────────── Platform (App Admin) overview ─────────────────────────
create or replace function public.admin_platform_stats() returns json
language plpgsql stable security definer set search_path = public as $$
declare since timestamptz := date_trunc('month', now()) - interval '5 months';
begin
  if not (public.can('clubs.manage') or public.can('clubs.verify')) then raise exception 'Not allowed'; end if;
  return json_build_object(
    'users', (select count(*) from auth.users), 'users_prev', (select count(*) from auth.users where created_at < now() - interval '30 days'),
    'clubs', (select count(*) from public.clubs where status = 'active'), 'clubs_prev', (select count(*) from public.clubs where status = 'active' and created_at < now() - interval '30 days'),
    'events', (select count(*) from public.events where club_id is not null), 'events_prev', (select count(*) from public.events where club_id is not null and created_at < now() - interval '30 days'),
    'posts', (select count(*) from public.club_posts where source_url = ''), 'posts_prev', (select count(*) from public.club_posts where source_url = '' and created_at < now() - interval '30 days'),
    'growth', (select coalesce(json_agg(json_build_object('m', to_char(g, 'YYYY-MM'),
        'total', (select count(*) from auth.users u where u.created_at < g + interval '1 month'),
        'new', (select count(*) from auth.users u where u.created_at >= g and u.created_at < g + interval '1 month'),
        'active', (select count(*) from auth.users u where u.last_sign_in_at >= g and u.last_sign_in_at < g + interval '1 month')) order by g), '[]')
      from generate_series(since, date_trunc('month', now()), interval '1 month') g),
    'by_category', (select coalesce(json_object_agg(category, n), '{}') from (select category, count(*) n from public.clubs where status in ('active', 'unclaimed') group by 1) x),
    'by_status', (select coalesce(json_object_agg(status, n), '{}') from (select status, count(*) n from public.clubs group by 1) x),
    'pending', json_build_object(
      'claims', (select count(*) from public.club_claims where status = 'pending'),
      'reports', (select count(*) from public.club_reports where status = 'open'),
      'tickets', (select count(*) from public.support_tickets where status = 'open'),
      'events', (select count(*) from public.events where status = 'pending')),
    'recent', (select coalesce(json_agg(t), '[]') from (select a.action, a.actor_name, a.at, k.name club from public.club_audit a join public.clubs k on k.id = a.club_id order by a.at desc limit 12) t));
end $$;
-- Lock / unlock a club feature (the club can't switch a locked feature back on).
create or replace function public.admin_lock_feature(c uuid, f text, locked boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.can('clubs.manage') then raise exception 'Not allowed'; end if;
  update public.clubs set features_locked = case when locked then features_locked || jsonb_build_object(f, true) else features_locked - f end where id = c;
  perform public.club_log(c, case when locked then 'feature.locked' else 'feature.unlocked' end, jsonb_build_object('feature', f));
end $$;
revoke execute on function public.admin_platform_stats(), public.admin_lock_feature(uuid, text, boolean) from public, anon;
grant execute on function public.admin_platform_stats(), public.admin_lock_feature(uuid, text, boolean) to authenticated;
