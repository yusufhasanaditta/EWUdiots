-- EWUdiots 0016: EWUdiots Club — club profiles, per-club roles and permissions, invites (claimed automatically by
-- email), join requests, posts with audiences, club events (in the campus Events feed), form builder + responses,
-- QR/code attendance, polls and anonymous elections, committee history, gallery, tasks, docs, certificates,
-- a finance log (record keeping only, no payments) and an audit log.
--
-- Access model
--   Platform:  public.can('clubs.manage' | 'clubs.verify' | 'clubs.moderate') — the existing admin roles.
--   Club:      public.club_can(club, 'perm') — the caller's active membership → club_roles.perms.
--              '*' grants every club permission (Faculty Advisor, Club Admin). Platform clubs.manage overrides.
--   Ranks:     1 Advisor · 2 Club Admin · 3 Executive · 4 Wing Head · 5 Moderator · 6 Senior Member · 7 General Member.
--              Lower rank = more senior. Nobody can hand out a rank more senior than their own.
-- Every write that needs rules (limits, deadlines, ranks, anonymity) goes through a security-definer RPC.
-- Keep CLUB_PERMS in app/src/clubs/perms.js in step with the permission list below (tests/clubs.test.js checks it).

-- ───────────────────────── Clubs ─────────────────────────
create table public.clubs (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,40}$'),
  name text not null check (length(name) between 3 and 100),
  short_name text not null default '' check (length(short_name) <= 16),
  category text not null default 'other' check (category in ('tech', 'business', 'arts', 'social', 'debate', 'sports', 'science', 'other')),
  tagline text not null default '' check (length(tagline) <= 140),
  about text not null default '' check (length(about) <= 4000),
  mission text not null default '' check (length(mission) <= 1000),
  founded_year int check (founded_year is null or founded_year between 1990 and 2100),
  logo_url text not null default '' check (logo_url = '' or logo_url ~ '^https://'),
  cover_url text not null default '' check (cover_url = '' or cover_url ~ '^https://'),
  color text not null default '#7C3AED' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  advisors text not null default '' check (length(advisors) <= 300), -- faculty moderators' names, as shown publicly
  contact_email text not null default '' check (contact_email = '' or contact_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  socials jsonb not null default '{}'::jsonb check (jsonb_typeof(socials) = 'object'),
  official_url text not null default '' check (official_url = '' or official_url ~ '^https?://'),
  join_mode text not null default 'apply' check (join_mode in ('open', 'apply', 'invite')),
  recruiting boolean not null default false,
  wings text[] not null default '{}',
  verified boolean not null default false,
  status text not null default 'pending' check (status in ('unclaimed', 'pending', 'active', 'suspended', 'archived')),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index clubs_status on public.clubs (status, name);
alter table public.clubs enable row level security;

-- Per-club ranks. Created automatically for every new club (trigger below); club admins may rename them and switch
-- permissions, never above their own rank.
create table public.club_roles (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs on delete cascade,
  rank int not null check (rank between 1 and 9),
  name text not null check (length(name) between 2 and 40),
  perms text[] not null default '{}',
  is_system boolean not null default false,
  unique (club_id, rank)
);
alter table public.club_roles enable row level security;

create table public.club_members (
  club_id uuid not null references public.clubs on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role_id uuid not null references public.club_roles (id),
  status text not null default 'active' check (status in ('active', 'alumni', 'removed')),
  title text not null default '' check (length(title) <= 60),       -- "General Secretary", "Head of PR"…
  wing text not null default '' check (length(wing) <= 40),
  display_name text not null default '' check (length(display_name) <= 80),
  email text not null default '',
  student_id text not null default '',
  department text not null default '' check (length(department) <= 60),
  invited_by uuid references auth.users (id) on delete set null,
  joined_at timestamptz not null default now(),
  primary key (club_id, user_id)
);
create index club_members_user on public.club_members (user_id, status);
alter table public.club_members enable row level security;

-- ───────────────────────── Permission helpers ─────────────────────────
create or replace function public.club_role_row(c uuid) returns public.club_roles
language sql stable security definer set search_path = public as $$
  select r.* from public.club_members m join public.club_roles r on r.id = m.role_id
  where m.club_id = c and m.user_id = auth.uid() and m.status = 'active';
$$;
create or replace function public.is_club_member(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.club_members where club_id = c and user_id = auth.uid() and status = 'active');
$$;
-- 99 = not a member. Platform club managers count as rank 1 everywhere.
create or replace function public.club_rank(c uuid) returns int
language sql stable security definer set search_path = public as $$
  select case when public.can('clubs.manage') then 1 else coalesce((public.club_role_row(c)).rank, 99) end;
$$;
create or replace function public.club_can(c uuid, p text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.can('clubs.manage') or exists (
    select 1 from public.club_members m join public.club_roles r on r.id = m.role_id join public.clubs k on k.id = m.club_id
    where m.club_id = c and m.user_id = auth.uid() and m.status = 'active' and k.status = 'active'
      and ('*' = any (r.perms) or p = any (r.perms)));
$$;
grant execute on function public.is_club_member(uuid), public.club_rank(uuid), public.club_can(uuid, text) to anon, authenticated;
revoke execute on function public.club_role_row(uuid) from public, anon; grant execute on function public.club_role_row(uuid) to authenticated;

-- Default ranks for a new club.
create or replace function public.club_seed_roles() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.club_roles (club_id, rank, name, perms, is_system) values
    (new.id, 1, 'Faculty Advisor', array['*'], true),
    (new.id, 2, 'Club Admin', array['*'], true),
    (new.id, 3, 'Executive Panel', array['posts.write','posts.publish_public','events.manage','forms.create','forms.view_responses','forms.export','members.invite','members.approve','members.promote','attendance.take','polls.create','tasks.manage','docs.manage','finance.view','certs.issue','comments.moderate','audit.view'], false),
    (new.id, 4, 'Wing Head', array['posts.write','events.manage','forms.create','attendance.take','polls.create','tasks.manage','docs.manage'], false), -- no applicant phone numbers by default
    (new.id, 5, 'Club Moderator', array['posts.write','comments.moderate','attendance.take'], false),
    (new.id, 6, 'Senior General Member', array['attendance.take'], false),
    (new.id, 7, 'General Member', array[]::text[], true);
  return new;
end $$;
revoke execute on function public.club_seed_roles() from public, anon, authenticated;
create trigger club_seed_roles after insert on public.clubs for each row execute function public.club_seed_roles();

-- Only the platform may change a club's identity and standing; club admins edit the profile.
create or replace function public.club_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- auth.uid() is null for the database owner and server jobs (anonymous visitors have no update policy at all).
  if auth.uid() is not null and not public.can('clubs.manage') and not public.can('clubs.verify') then
    if new.verified is distinct from old.verified or new.status is distinct from old.status or new.slug is distinct from old.slug then
      raise exception 'Only the EWUdiots team can change a club''s verification, status or address';
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
revoke execute on function public.club_guard() from public, anon, authenticated;
create trigger club_guard before update on public.clubs for each row execute function public.club_guard();

create policy "read clubs" on public.clubs for select using (status in ('unclaimed', 'active') or public.club_can(id, 'settings.edit') or public.can('clubs.verify') or created_by = auth.uid());
create policy "edit club" on public.clubs for update to authenticated using (public.club_can(id, 'settings.edit')) with check (public.club_can(id, 'settings.edit'));
create policy "platform adds clubs" on public.clubs for insert to authenticated with check (public.can('clubs.manage'));
create policy "platform deletes clubs" on public.clubs for delete to authenticated using (public.can('clubs.manage'));

create policy "read club roles" on public.club_roles for select using (true);
create policy "edit club roles" on public.club_roles for update to authenticated
  using (public.club_can(club_id, 'members.promote') and rank > public.club_rank(club_id))
  with check (public.club_can(club_id, 'members.promote') and rank > public.club_rank(club_id) and not ('*' = any (perms))
    and (public.can('clubs.manage') or '*' = any ((public.club_role_row(club_id)).perms) or (public.club_role_row(club_id)).perms @> perms));

create policy "read members" on public.club_members for select to authenticated using (user_id = auth.uid() or public.club_can(club_id, 'members.approve'));
create policy "leave club" on public.club_members for delete to authenticated using (user_id = auth.uid());

-- Member directory for the members' space. Emails and student IDs only for people who approve members.
create or replace function public.club_member_list(c uuid) returns table (user_id uuid, display_name text, title text, role_name text, rank int, wing text, department text, status text, joined_at timestamptz, email text, student_id text)
language plpgsql stable security definer set search_path = public as $$
declare see_all boolean := public.club_can(c, 'members.approve');
begin
  if not (public.is_club_member(c) or see_all) then raise exception 'Only club members can see the member list'; end if;
  return query select m.user_id, m.display_name, m.title, r.name, r.rank, m.wing, m.department, m.status, m.joined_at,
    case when see_all then m.email else '' end, case when see_all then m.student_id else '' end
    from public.club_members m join public.club_roles r on r.id = m.role_id where m.club_id = c and m.status in ('active', 'alumni') order by r.rank, m.display_name;
end $$;
revoke execute on function public.club_member_list(uuid) from public, anon; grant execute on function public.club_member_list(uuid) to authenticated;

-- Public committee (name, title, role) for the club profile: no emails or IDs.
create or replace function public.club_committee(c uuid) returns table (user_id uuid, display_name text, title text, role_name text, rank int, wing text)
language sql stable security definer set search_path = public as $$
  select m.user_id, m.display_name, m.title, r.name, r.rank, m.wing from public.club_members m join public.club_roles r on r.id = m.role_id
  join public.clubs k on k.id = m.club_id
  where m.club_id = c and m.status = 'active' and r.rank <= 4 and k.status = 'active' order by r.rank, m.joined_at;
$$;
grant execute on function public.club_committee(uuid) to anon, authenticated;

-- Member and follower counts for cards (public numbers only).
create table public.club_follows (
  club_id uuid not null references public.clubs on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  created_at timestamptz not null default now(),
  primary key (club_id, user_id)
);
alter table public.club_follows enable row level security;
create policy "my follows" on public.club_follows for select to authenticated using (user_id = auth.uid());
create policy "follow" on public.club_follows for insert to authenticated with check (user_id = auth.uid());
create policy "unfollow" on public.club_follows for delete to authenticated using (user_id = auth.uid());
create or replace function public.club_counts() returns table (club_id uuid, members int, followers int)
language sql stable security definer set search_path = public as $$
  select k.id, (select count(*)::int from public.club_members m where m.club_id = k.id and m.status = 'active'),
    (select count(*)::int from public.club_follows f where f.club_id = k.id) from public.clubs k where k.status in ('unclaimed', 'active');
$$;
grant execute on function public.club_counts() to anon, authenticated;

-- ───────────────────────── Audit ─────────────────────────
create table public.club_audit (
  id bigint generated always as identity primary key,
  club_id uuid not null references public.clubs on delete cascade,
  actor uuid references auth.users (id) on delete set null default auth.uid(),
  actor_name text not null default '',
  action text not null check (length(action) between 2 and 60),
  detail jsonb not null default '{}'::jsonb,
  at timestamptz not null default now()
);
create index club_audit_club on public.club_audit (club_id, at desc);
alter table public.club_audit enable row level security;
create policy "read audit" on public.club_audit for select to authenticated using (public.club_can(club_id, 'audit.view'));
create or replace function public.club_log(c uuid, act text, det jsonb default '{}'::jsonb) returns void
language sql security definer set search_path = public as $$
  insert into public.club_audit (club_id, actor, actor_name, action, detail)
  values (c, auth.uid(), coalesce(auth.jwt() -> 'user_metadata' ->> 'name', auth.jwt() ->> 'email', ''), act, coalesce(det, '{}'::jsonb));
$$;
revoke execute on function public.club_log(uuid, text, jsonb) from public, anon, authenticated;
-- The app logs exports (CSV of applicants with phone numbers) through this, only with the export permission.
create or replace function public.club_log_export(c uuid, what text, n int) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.club_can(c, 'forms.export') then raise exception 'You don''t have permission to export'; end if;
  perform public.club_log(c, 'export', jsonb_build_object('what', left(what, 120), 'rows', n));
end $$;
revoke execute on function public.club_log_export(uuid, text, int) from public, anon; grant execute on function public.club_log_export(uuid, text, int) to authenticated;

-- In-app inbox message (user_messages from 0006) to one person.
create or replace function public.club_notify(u uuid, t text, b text, l text) returns void
language sql security definer set search_path = public as $$
  insert into public.user_messages (user_id, title, body, link, created_by) values (u, left(t, 120), left(coalesce(b, ''), 2000), l, auth.uid());
$$;
revoke execute on function public.club_notify(uuid, text, text, text) from public, anon, authenticated;

-- The signed-in person's details as stored on a membership row.
create or replace function public.club_me() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'name', coalesce(nullif(auth.jwt() -> 'user_metadata' ->> 'name', ''), split_part(auth.jwt() ->> 'email', '@', 1)),
    'email', lower(coalesce(auth.jwt() ->> 'email', '')),
    'student_id', coalesce(substring(lower(auth.jwt() ->> 'email') from '^(\d{4}-\d-\d{2}-\d{3})@std\.ewubd\.edu$'), ''));
$$;
revoke execute on function public.club_me() from public, anon, authenticated;

-- Insert or re-activate a membership at a rank.
create or replace function public.club_add_member(c uuid, u uuid, rnk int, nm text, em text, sid text, dept text, inviter uuid) returns void
language plpgsql security definer set search_path = public as $$
declare rid uuid := (select id from public.club_roles where club_id = c and rank = rnk);
begin
  insert into public.club_members (club_id, user_id, role_id, display_name, email, student_id, department, invited_by)
  values (c, u, rid, left(coalesce(nm, ''), 80), coalesce(em, ''), coalesce(sid, ''), left(coalesce(dept, ''), 60), inviter)
  on conflict (club_id, user_id) do update set status = 'active', role_id = case when public.club_members.status = 'active' then public.club_members.role_id else excluded.role_id end;
end $$;
revoke execute on function public.club_add_member(uuid, uuid, int, text, text, text, text, uuid) from public, anon, authenticated;

-- ───────────────────────── Claiming a club (presidents) ─────────────────────────
create table public.club_claims (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  name text not null default '',
  email text not null default '',
  position text not null check (length(position) between 2 and 60),
  proof text not null default '' check (length(proof) <= 1000),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  review_note text not null default '' check (length(review_note) <= 300),
  created_at timestamptz not null default now(),
  unique (club_id, user_id)
);
alter table public.club_claims enable row level security;
create policy "read claims" on public.club_claims for select to authenticated using (user_id = auth.uid() or public.can('clubs.verify'));
create or replace function public.claim_club(c uuid, pos text, prf text) returns void
language plpgsql security definer set search_path = public as $$
declare me jsonb := public.club_me();
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if not exists (select 1 from public.clubs where id = c and status in ('unclaimed', 'active')) then raise exception 'This club can''t be claimed'; end if;
  insert into public.club_claims (club_id, user_id, name, email, position, proof) values (c, auth.uid(), me ->> 'name', me ->> 'email', left(pos, 60), left(prf, 1000))
  on conflict (club_id, user_id) do update set position = excluded.position, proof = excluded.proof, status = 'pending', created_at = now();
end $$;
-- Ask for a club that isn't listed yet: it waits as 'pending' with the asker's claim.
create or replace function public.request_club(nm text, cat text, pos text, prf text) returns uuid
language plpgsql security definer set search_path = public as $$
declare cid uuid; s text := trim(both '-' from regexp_replace(lower(nm), '[^a-z0-9]+', '-', 'g'));
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if (select count(*) from public.club_claims where user_id = auth.uid() and created_at > now() - interval '1 day') >= 3 then raise exception 'Please wait a day before asking again'; end if;
  s := left(s, 36); if exists (select 1 from public.clubs where slug = s) then s := left(s, 30) || '-' || substr(md5(random()::text), 1, 5); end if;
  insert into public.clubs (slug, name, category, status, created_by) values (s, left(nm, 100), case when cat in ('tech','business','arts','social','debate','sports','science') then cat else 'other' end, 'pending', auth.uid()) returning id into cid;
  insert into public.club_claims (club_id, user_id, name, email, position, proof) values (cid, auth.uid(), public.club_me() ->> 'name', public.club_me() ->> 'email', left(pos, 60), left(prf, 1000));
  return cid;
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
    update public.club_members set role_id = (select id from public.club_roles where club_id = r.club_id and rank = 2), title = left(r.position, 60) where club_id = r.club_id and user_id = r.user_id;
    perform public.club_log(r.club_id, 'claim.approved', jsonb_build_object('user', r.name, 'position', r.position));
  else
    update public.clubs set status = 'archived' where id = r.club_id and status = 'pending' and not exists (select 1 from public.club_claims where club_id = r.club_id and status in ('pending', 'approved'));
  end if;
  perform public.club_notify(r.user_id, case when approve then 'You''re now the admin of your club' else 'Your club request wasn''t approved' end, note, '#/club/mine');
end $$;
revoke execute on function public.claim_club(uuid, text, text), public.request_club(text, text, text, text), public.review_claim(uuid, boolean, text) from public, anon;
grant execute on function public.claim_club(uuid, text, text), public.request_club(text, text, text, text), public.review_claim(uuid, boolean, text) to authenticated;

-- ───────────────────────── Invites (claimed automatically) ─────────────────────────
create table public.club_invites (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs on delete cascade,
  email text not null check (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  rank int not null default 7 check (rank between 2 and 7),
  title text not null default '' check (length(title) <= 60),
  wing text not null default '' check (length(wing) <= 40),
  status text not null default 'pending' check (status in ('pending', 'claimed', 'revoked')),
  invited_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '60 days',
  unique (club_id, email)
);
alter table public.club_invites enable row level security;
create policy "read invites" on public.club_invites for select to authenticated using (public.club_can(club_id, 'members.invite') or email = lower(auth.jwt() ->> 'email'));
create policy "revoke invites" on public.club_invites for delete to authenticated using (public.club_can(club_id, 'members.invite'));

-- Invite by student ID (→ <id>@std.ewubd.edu) or any email. Only to ranks below your own (club admins may add co-admins).
create or replace function public.invite_member(c uuid, who text, rnk int default 7, ttl text default '', wng text default '') returns void
language plpgsql security definer set search_path = public as $$
declare e text := lower(trim(who)); mine int := public.club_rank(c);
begin
  if not public.club_can(c, 'members.invite') then raise exception 'You don''t have permission to invite members'; end if;
  if e ~ '^\d{4}-\d-\d{2}-\d{3}$' then e := e || '@std.ewubd.edu'; end if;
  if e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Enter a student ID like 2024-1-60-123 or an email'; end if;
  -- Below your own rank; club admins may also add co-admins (rank 2).
  if rnk < 2 or rnk > 7 or (mine > 1 and (rnk < mine or (rnk = mine and mine > 2))) then raise exception 'You can only invite people to a role below yours'; end if;
  if (select count(*) from public.club_invites where club_id = c and created_at > now() - interval '1 day') >= 300 then raise exception 'Too many invites today'; end if;
  insert into public.club_invites (club_id, email, rank, title, wing) values (c, e, rnk, left(coalesce(ttl, ''), 60), left(coalesce(wng, ''), 40))
  on conflict (club_id, email) do update set rank = excluded.rank, title = excluded.title, wing = excluded.wing, status = 'pending', invited_by = auth.uid(), created_at = now(), expires_at = now() + interval '60 days';
  perform public.club_log(c, 'invite', jsonb_build_object('email', e, 'rank', rnk));
end $$;
-- Called by the app when the person opens EWUdiots Club: every pending invite for their (verified) email becomes a
-- membership straight away. Returns how many clubs they joined.
create or replace function public.claim_club_invites() returns int
language plpgsql security definer set search_path = public as $$
declare me jsonb := public.club_me(); i public.club_invites; n int := 0;
begin
  if auth.uid() is null or coalesce(me ->> 'email', '') = '' then return 0; end if;
  for i in select * from public.club_invites where email = me ->> 'email' and status = 'pending' and expires_at > now() loop
    perform public.club_add_member(i.club_id, auth.uid(), i.rank, me ->> 'name', me ->> 'email', me ->> 'student_id', '', i.invited_by);
    update public.club_members set role_id = (select id from public.club_roles where club_id = i.club_id and rank = i.rank),
      title = case when i.title <> '' then i.title else title end, wing = case when i.wing <> '' then i.wing else wing end
      where club_id = i.club_id and user_id = auth.uid() and (select r.rank from public.club_roles r where r.id = role_id) >= i.rank;
    update public.club_invites set status = 'claimed' where id = i.id;
    perform public.club_log(i.club_id, 'invite.claimed', jsonb_build_object('email', i.email));
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public.invite_member(uuid, text, int, text, text), public.claim_club_invites() from public, anon;
grant execute on function public.invite_member(uuid, text, int, text, text), public.claim_club_invites() to authenticated;

-- ───────────────────────── Joining ─────────────────────────
create table public.club_requests (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  name text not null default '', email text not null default '', student_id text not null default '',
  department text not null default '' check (length(department) <= 60),
  note text not null default '' check (length(note) <= 600),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  created_at timestamptz not null default now(),
  unique (club_id, user_id)
);
alter table public.club_requests enable row level security;
create policy "read requests" on public.club_requests for select to authenticated using (user_id = auth.uid() or public.club_can(club_id, 'members.approve'));
create policy "cancel request" on public.club_requests for delete to authenticated using (user_id = auth.uid() and status = 'pending');

-- Open clubs: join at once. Apply clubs: a request the executives accept or reject. Invite-only: not possible.
create or replace function public.join_club(c uuid, dept text default '', nt text default '') returns text
language plpgsql security definer set search_path = public as $$
declare k public.clubs; me jsonb := public.club_me();
begin
  if auth.uid() is null then raise exception 'Sign in to join a club'; end if;
  select * into k from public.clubs where id = c and status = 'active';
  if k.id is null then raise exception 'This club isn''t taking members on EWUdiots yet'; end if;
  if public.is_club_member(c) then return 'member'; end if;
  if k.join_mode = 'invite' then raise exception 'This club adds members by invitation only'; end if;
  if k.join_mode = 'open' then
    perform public.club_add_member(c, auth.uid(), 7, me ->> 'name', me ->> 'email', me ->> 'student_id', dept, null);
    perform public.club_log(c, 'member.joined', jsonb_build_object('name', me ->> 'name'));
    return 'member';
  end if;
  insert into public.club_requests (club_id, user_id, name, email, student_id, department, note) values (c, auth.uid(), me ->> 'name', me ->> 'email', me ->> 'student_id', left(coalesce(dept, ''), 60), left(coalesce(nt, ''), 600))
  on conflict (club_id, user_id) do update set status = 'pending', note = excluded.note, department = excluded.department, created_at = now();
  return 'requested';
end $$;
create or replace function public.review_request(req uuid, accept boolean) returns void
language plpgsql security definer set search_path = public as $$
declare r public.club_requests; k text;
begin
  select * into r from public.club_requests where id = req;
  if r.id is null or not public.club_can(r.club_id, 'members.approve') then raise exception 'You don''t have permission to review requests'; end if;
  update public.club_requests set status = case when accept then 'accepted' else 'rejected' end where id = req;
  select name into k from public.clubs where id = r.club_id;
  if accept then perform public.club_add_member(r.club_id, r.user_id, 7, r.name, r.email, r.student_id, r.department, auth.uid()); end if;
  perform public.club_log(r.club_id, case when accept then 'request.accepted' else 'request.rejected' end, jsonb_build_object('name', r.name));
  perform public.club_notify(r.user_id, case when accept then 'Welcome to ' || k else 'Update from ' || k end,
    case when accept then 'Your request to join was accepted. The members'' space is open for you.' else 'Your request to join wasn''t accepted this time.' end, '#/club/mine');
end $$;
-- Change a member's rank, title, wing or status. Never to a rank at or above your own (club admins may add co-admins).
create or replace function public.set_member(c uuid, u uuid, rnk int default null, ttl text default null, wng text default null, st text default null) returns void
language plpgsql security definer set search_path = public as $$
declare mine int := public.club_rank(c); theirs int;
begin
  select r.rank into theirs from public.club_members m join public.club_roles r on r.id = m.role_id where m.club_id = c and m.user_id = u;
  if theirs is null then raise exception 'Not a member of this club'; end if;
  if u = auth.uid() and mine > 1 then raise exception 'Ask another admin to change your own role'; end if;
  if (rnk is not null or st is not null) and not public.club_can(c, case when st = 'removed' then 'members.remove' else 'members.promote' end) then raise exception 'You don''t have permission to change members'; end if;
  if (ttl is not null or wng is not null) and not public.club_can(c, 'members.promote') then raise exception 'You don''t have permission to change members'; end if;
  if mine > 1 and theirs <= mine and not (mine = 2 and theirs = 2 and rnk is null and st is null) then raise exception 'You can''t change someone at or above your own role'; end if;
  if rnk is not null and (rnk < 1 or rnk > 7 or (rnk < mine) or (rnk = mine and mine > 2)) then raise exception 'You can only give a role below yours'; end if;
  if st is not null and st not in ('active', 'alumni', 'removed') then raise exception 'Unknown status'; end if;
  update public.club_members set role_id = coalesce((select id from public.club_roles where club_id = c and rank = rnk), role_id),
    title = coalesce(left(ttl, 60), title), wing = coalesce(left(wng, 40), wing), status = coalesce(st, status) where club_id = c and user_id = u;
  perform public.club_log(c, 'member.changed', jsonb_build_object('user', u, 'rank', rnk, 'title', ttl, 'wing', wng, 'status', st));
end $$;
revoke execute on function public.join_club(uuid, text, text), public.review_request(uuid, boolean), public.set_member(uuid, uuid, int, text, text, text) from public, anon;
grant execute on function public.join_club(uuid, text, text), public.review_request(uuid, boolean), public.set_member(uuid, uuid, int, text, text, text) to authenticated;

-- ───────────────────────── Posts, reactions, comments ─────────────────────────
create table public.club_posts (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs on delete cascade,
  author_id uuid references auth.users (id) on delete set null default auth.uid(),
  author_name text not null default '',
  kind text not null default 'news' check (kind in ('news', 'announcement', 'achievement', 'recruitment')),
  title text not null check (length(title) between 3 and 160),
  body text not null default '' check (length(body) <= 8000),
  images text[] not null default '{}' check (cardinality(images) <= 6),
  link text not null default '' check (link = '' or link ~ '^(https://|#/)'),
  visibility text not null default 'public' check (visibility in ('public', 'members', 'wing', 'exec')),
  wing text not null default '' check (length(wing) <= 40),
  pinned boolean not null default false,
  status text not null default 'published' check (status in ('draft', 'published', 'hidden')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index club_posts_feed on public.club_posts (status, visibility, created_at desc);
create index club_posts_club on public.club_posts (club_id, created_at desc);
alter table public.club_posts enable row level security;
create or replace function public.can_see_post(p public.club_posts) returns boolean
language sql stable security definer set search_path = public as $$
  -- The audience always applies, also to people who can write posts (a Wing Head never sees Executive-only posts).
  -- Drafts are seen by the club's writers within that audience; moderators see everything.
  select public.can('clubs.moderate') or p.author_id = auth.uid() or (
    exists (select 1 from public.clubs k where k.id = p.club_id and k.status = 'active')
    and (p.status = 'published' or (p.status = 'draft' and public.club_can(p.club_id, 'posts.write')))
    and (
      p.visibility = 'public'
      or (p.visibility = 'members' and public.is_club_member(p.club_id))
      or (p.visibility = 'exec' and public.club_rank(p.club_id) <= 3)
      or (p.visibility = 'wing' and (public.club_rank(p.club_id) <= 3 or exists (select 1 from public.club_members m where m.club_id = p.club_id and m.user_id = auth.uid() and m.status = 'active' and m.wing = p.wing)))));
$$;
grant execute on function public.can_see_post(public.club_posts) to anon, authenticated;
create policy "read posts" on public.club_posts for select using (public.can_see_post(club_posts));
create policy "write posts" on public.club_posts for insert to authenticated
  with check (author_id = auth.uid() and public.club_can(club_id, 'posts.write') and (visibility <> 'public' or public.club_can(club_id, 'posts.publish_public')) and status <> 'hidden');
create policy "edit posts" on public.club_posts for update to authenticated
  using (public.club_can(club_id, 'posts.write') or public.can('clubs.moderate'))
  with check ((public.club_can(club_id, 'posts.write') and (visibility <> 'public' or public.club_can(club_id, 'posts.publish_public'))) or public.can('clubs.moderate'));
create policy "delete posts" on public.club_posts for delete to authenticated using (public.club_can(club_id, 'posts.write') or public.can('clubs.moderate'));
create or replace function public.club_post_stamp() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then new.author_name := coalesce((select display_name from public.club_members where club_id = new.club_id and user_id = auth.uid()), ''); end if;
  -- Only the platform hides or un-hides a post.
  if tg_op = 'UPDATE' and (new.status = 'hidden') is distinct from (old.status = 'hidden') and not public.can('clubs.moderate') then raise exception 'Only moderators can hide posts'; end if;
  new.updated_at := now();
  return new;
end $$;
revoke execute on function public.club_post_stamp() from public, anon, authenticated;
create trigger club_post_stamp before insert or update on public.club_posts for each row execute function public.club_post_stamp();

create table public.club_reactions (
  post_id uuid not null references public.club_posts on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  kind text not null default 'like' check (kind in ('like', 'celebrate', 'support')),
  primary key (post_id, user_id)
);
alter table public.club_reactions enable row level security;
create policy "read reactions" on public.club_reactions for select using (exists (select 1 from public.club_posts p where p.id = post_id));
create policy "react" on public.club_reactions for insert to authenticated with check (user_id = auth.uid() and exists (select 1 from public.club_posts p where p.id = post_id));
create policy "change reaction" on public.club_reactions for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "unreact" on public.club_reactions for delete to authenticated using (user_id = auth.uid());

create table public.club_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.club_posts on delete cascade,
  club_id uuid not null references public.clubs on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  author_name text not null default '',
  body text not null check (length(body) between 1 and 1000),
  hidden boolean not null default false,
  created_at timestamptz not null default now()
);
create index club_comments_post on public.club_comments (post_id, created_at);
alter table public.club_comments enable row level security;
create policy "read comments" on public.club_comments for select using (exists (select 1 from public.club_posts p where p.id = post_id) and (not hidden or user_id = auth.uid() or public.club_can(club_id, 'comments.moderate') or public.can('clubs.moderate')));
-- 30 comments an hour per person (a policy can't count its own table, so this lives in a function).
create or replace function public.club_comment_rate_ok() returns boolean
language sql stable security definer set search_path = public as $$
  select (select count(*) from public.club_comments where user_id = auth.uid() and created_at > now() - interval '1 hour') < 30;
$$;
revoke execute on function public.club_comment_rate_ok() from public, anon; grant execute on function public.club_comment_rate_ok() to authenticated;
create policy "comment" on public.club_comments for insert to authenticated
  with check (user_id = auth.uid() and not hidden and exists (select 1 from public.club_posts p where p.id = post_id and p.club_id = club_comments.club_id)
    and public.club_comment_rate_ok());
create policy "moderate comments" on public.club_comments for update to authenticated using (public.club_can(club_id, 'comments.moderate') or public.can('clubs.moderate')) with check (true);
create policy "delete comments" on public.club_comments for delete to authenticated using (user_id = auth.uid() or public.club_can(club_id, 'comments.moderate') or public.can('clubs.moderate'));
create or replace function public.club_comment_name() returns trigger
language plpgsql security definer set search_path = public as $$
begin new.author_name := public.club_me() ->> 'name'; return new; end $$;
revoke execute on function public.club_comment_name() from public, anon, authenticated;
create trigger club_comment_name before insert on public.club_comments for each row execute function public.club_comment_name();

create table public.club_reports (
  id bigint generated always as identity primary key,
  club_id uuid not null references public.clubs on delete cascade,
  target_type text not null check (target_type in ('post', 'comment', 'club')),
  target_id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  reason text not null default '' check (length(reason) <= 300),
  status text not null default 'open' check (status in ('open', 'done')),
  created_at timestamptz not null default now(),
  unique (target_type, target_id, user_id)
);
alter table public.club_reports enable row level security;
create policy "report" on public.club_reports for insert to authenticated with check (user_id = auth.uid() and status = 'open');
create policy "read reports" on public.club_reports for select to authenticated using (user_id = auth.uid() or public.can('clubs.moderate'));
create policy "handle reports" on public.club_reports for update to authenticated using (public.can('clubs.moderate')) with check (public.can('clubs.moderate'));

-- ───────────────────────── Club events (in the campus Events feed) ─────────────────────────
alter table public.events add column if not exists club_id uuid references public.clubs on delete cascade;
alter table public.events add column if not exists visibility text not null default 'public' check (visibility in ('public', 'members'));
alter table public.events add column if not exists capacity int check (capacity is null or capacity between 1 and 20000);
alter table public.events add column if not exists form_id uuid;
alter table public.events drop constraint if exists events_source_check;
alter table public.events add constraint events_source_check check (source in ('user', 'admin', 'auto', 'club'));
create index if not exists events_club on public.events (club_id, starts_at);
drop policy if exists "read events" on public.events;
create policy "read events" on public.events for select using (
  (status = 'approved' and (club_id is null or visibility = 'public' or public.is_club_member(club_id)))
  or created_by = auth.uid() or public.can('events.review') or (club_id is not null and public.club_can(club_id, 'events.manage')));
-- Events from a verified club go live straight away; they still appear in the admin's event list.
create policy "clubs add events" on public.events for insert to authenticated
  with check (club_id is not null and source = 'club' and status = 'approved' and created_by = auth.uid() and not pinned and ext_id is null and public.club_can(club_id, 'events.manage'));
create policy "clubs edit events" on public.events for update to authenticated
  using (club_id is not null and public.club_can(club_id, 'events.manage')) with check (club_id is not null and source = 'club' and public.club_can(club_id, 'events.manage'));
create policy "clubs delete events" on public.events for delete to authenticated using (club_id is not null and public.club_can(club_id, 'events.manage'));
create or replace function public.club_event_stamp() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.club_id is not null and new.source = 'club' then
    new.organizer := coalesce((select name from public.clubs where id = new.club_id), new.organizer);
    new.author_name := new.organizer;
  end if;
  return new;
end $$;
revoke execute on function public.club_event_stamp() from public, anon, authenticated;
create trigger club_event_stamp before insert or update on public.events for each row execute function public.club_event_stamp();

-- ───────────────────────── Forms and responses ─────────────────────────
-- fields: [{ id, type: text|long|choice|multi|dropdown|phone|email|number|date|student_id|department|semester|file|note,
--            label, required, options[], max }]
-- settings: { deadline, limit, waitlist, allowEdit, collectPhone, fee, feeNote, confirmMsg, ticket }
create table public.club_forms (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs on delete cascade,
  kind text not null default 'event' check (kind in ('membership', 'event', 'competition', 'volunteer', 'survey', 'other')),
  title text not null check (length(title) between 3 and 140),
  description text not null default '' check (length(description) <= 3000),
  fields jsonb not null default '[]'::jsonb check (jsonb_typeof(fields) = 'array' and jsonb_array_length(fields) <= 40),
  settings jsonb not null default '{}'::jsonb check (jsonb_typeof(settings) = 'object'),
  audience text not null default 'everyone' check (audience in ('everyone', 'members')),
  status text not null default 'draft' check (status in ('draft', 'open', 'closed')),
  event_id uuid references public.events on delete set null,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index club_forms_club on public.club_forms (club_id, created_at desc);
alter table public.club_forms enable row level security;
alter table public.events add constraint events_form_fk foreign key (form_id) references public.club_forms on delete set null;
create policy "read forms" on public.club_forms for select using (
  public.club_can(club_id, 'forms.create') or public.club_can(club_id, 'forms.view_responses')
  or (status in ('open', 'closed') and exists (select 1 from public.clubs k where k.id = club_id and k.status = 'active') and (audience = 'everyone' or public.is_club_member(club_id))));
create policy "create forms" on public.club_forms for insert to authenticated with check (public.club_can(club_id, 'forms.create') and created_by = auth.uid());
create policy "edit forms" on public.club_forms for update to authenticated using (public.club_can(club_id, 'forms.create')) with check (public.club_can(club_id, 'forms.create'));
create policy "delete forms" on public.club_forms for delete to authenticated using (public.club_can(club_id, 'forms.create'));

create table public.form_responses (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references public.club_forms on delete cascade,
  club_id uuid not null references public.clubs on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  answers jsonb not null default '{}'::jsonb check (jsonb_typeof(answers) = 'object'),
  name text not null default '', email text not null default '', student_id text not null default '',
  department text not null default '', phone text not null default '' check (length(phone) <= 20),
  status text not null default 'pending' check (status in ('pending', 'shortlisted', 'accepted', 'waitlisted', 'rejected')),
  payment_ref text not null default '' check (length(payment_ref) <= 40),
  payment_verified boolean not null default false,
  ticket text not null default '',
  checked_in_at timestamptz,
  interview_at timestamptz,
  note text not null default '' check (length(note) <= 500), -- private to the club
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (form_id, user_id)
);
create index form_responses_form on public.form_responses (form_id, created_at);
create index form_responses_user on public.form_responses (user_id);
alter table public.form_responses enable row level security;
create policy "read responses" on public.form_responses for select to authenticated using (user_id = auth.uid() or public.club_can(club_id, 'forms.view_responses'));
create policy "withdraw response" on public.form_responses for delete to authenticated using (user_id = auth.uid() and status in ('pending', 'waitlisted'));

-- Submit (or edit, if the form allows it) a response. Checks the form is open, the deadline, the limit (overflow
-- goes to the waitlist when that's on), the audience and required fields. Returns the response.
create or replace function public.submit_response(f uuid, ans jsonb, ph text default '', pay text default '', dept text default '') returns public.form_responses
language plpgsql security definer set search_path = public as $$
declare fm public.club_forms; me jsonb := public.club_me(); r public.form_responses; prev public.form_responses; fld jsonb; v jsonb;
  lim int; taken int; st text := 'pending'; dl timestamptz;
begin
  if auth.uid() is null then raise exception 'Sign in to fill in this form'; end if;
  select * into fm from public.club_forms where id = f;
  if fm.id is null or fm.status <> 'open' then raise exception 'This form isn''t open'; end if;
  if not exists (select 1 from public.clubs where id = fm.club_id and status = 'active') then raise exception 'This form isn''t open'; end if;
  if fm.audience = 'members' and not public.is_club_member(fm.club_id) then raise exception 'This form is for club members only'; end if;
  dl := nullif(fm.settings ->> 'deadline', '')::timestamptz;
  if dl is not null and now() > dl then raise exception 'The deadline for this form has passed'; end if;
  if jsonb_typeof(ans) <> 'object' or length(ans::text) > 20000 then raise exception 'Your answers are too long'; end if;
  for fld in select * from jsonb_array_elements(fm.fields) loop
    v := ans -> (fld ->> 'id');
    if coalesce((fld ->> 'required')::boolean, false) and fld ->> 'type' <> 'note'
      and (v is null or v = 'null'::jsonb or v = '""'::jsonb or v = '[]'::jsonb) then
      raise exception 'Please answer: %', fld ->> 'label';
    end if;
  end loop;
  ph := regexp_replace(coalesce(ph, ''), '[^0-9+]', '', 'g');
  if coalesce((fm.settings ->> 'collectPhone')::boolean, false) and ph !~ '^(\+?88)?01[3-9]\d{8}$' then raise exception 'Enter a Bangladeshi mobile number like 01712345678'; end if;
  select * into prev from public.form_responses where form_id = f and user_id = auth.uid();
  if prev.id is not null then
    if not coalesce((fm.settings ->> 'allowEdit')::boolean, false) or prev.status not in ('pending', 'waitlisted') then raise exception 'You''ve already sent this form'; end if;
    update public.form_responses set answers = ans, phone = ph, payment_ref = left(coalesce(pay, ''), 40), department = left(coalesce(dept, ''), 60), updated_at = now() where id = prev.id returning * into r;
    return r;
  end if;
  lim := nullif(fm.settings ->> 'limit', '')::int;
  if lim is not null then
    perform pg_advisory_xact_lock(hashtext(f::text)); -- one at a time, so the last seat isn't given twice
    select count(*) into taken from public.form_responses where form_id = f and status in ('pending', 'shortlisted', 'accepted');
    if taken >= lim then
      if coalesce((fm.settings ->> 'waitlist')::boolean, false) then st := 'waitlisted'; else raise exception 'This form is full'; end if;
    end if;
  end if;
  insert into public.form_responses (form_id, club_id, user_id, answers, name, email, student_id, department, phone, status, payment_ref, ticket)
  values (f, fm.club_id, auth.uid(), ans, me ->> 'name', me ->> 'email', me ->> 'student_id', left(coalesce(dept, ''), 60), ph, st, left(coalesce(pay, ''), 40),
    case when fm.kind in ('event', 'competition') or coalesce((fm.settings ->> 'ticket')::boolean, false) then upper(substr(md5(gen_random_uuid()::text), 1, 8)) else '' end)
  returning * into r;
  return r;
end $$;
-- Review responses one by one or in bulk. Accepting a membership form makes the person a General Member.
create or replace function public.review_responses(ids uuid[], st text default null, nt text default null, paid boolean default null, interview timestamptz default null) returns int
language plpgsql security definer set search_path = public as $$
declare r public.form_responses; fm public.club_forms; k text; n int := 0;
begin
  if st is not null and st not in ('pending', 'shortlisted', 'accepted', 'waitlisted', 'rejected') then raise exception 'Unknown status'; end if;
  for r in select * from public.form_responses where id = any (ids) loop
    if not public.club_can(r.club_id, 'forms.view_responses') then raise exception 'You don''t have permission to review responses'; end if;
    update public.form_responses set status = coalesce(st, status), note = coalesce(left(nt, 500), note), payment_verified = coalesce(paid, payment_verified),
      interview_at = coalesce(interview, interview_at), updated_at = now() where id = r.id;
    if st is not null and st is distinct from r.status then
      select * into fm from public.club_forms where id = r.form_id; select name into k from public.clubs where id = r.club_id;
      if st = 'accepted' and fm.kind = 'membership' then perform public.club_add_member(r.club_id, r.user_id, 7, r.name, r.email, r.student_id, r.department, auth.uid()); end if;
      if st in ('accepted', 'rejected', 'shortlisted', 'waitlisted') then
        perform public.club_notify(r.user_id, k || ': ' || case st when 'accepted' then 'you''re in!' when 'rejected' then 'application update' when 'shortlisted' then 'you''re shortlisted' else 'you''re on the waitlist' end,
          fm.title || case when interview is not null and st = 'shortlisted' then ' · Interview ' || to_char(interview at time zone 'Asia/Dhaka', 'DD Mon, HH12:MI AM') else '' end, '#/club/mine');
      end if;
    end if;
    n := n + 1;
  end loop;
  if n > 0 then perform public.club_log(r.club_id, 'responses.reviewed', jsonb_build_object('count', n, 'status', st)); end if;
  return n;
end $$;
-- Event door: check a ticket in by its code.
create or replace function public.check_in_ticket(f uuid, code text) returns public.form_responses
language plpgsql security definer set search_path = public as $$
declare r public.form_responses;
begin
  select * into r from public.form_responses where form_id = f and ticket = upper(trim(code));
  if r.id is null then raise exception 'No ticket with that code for this event'; end if;
  if not public.club_can(r.club_id, 'attendance.take') then raise exception 'You don''t have permission to check people in'; end if;
  if r.status = 'rejected' then raise exception 'This registration was rejected'; end if;
  if r.checked_in_at is null then update public.form_responses set checked_in_at = now() where id = r.id returning * into r; end if;
  return r;
end $$;
revoke execute on function public.submit_response(uuid, jsonb, text, text, text), public.review_responses(uuid[], text, text, boolean, timestamptz), public.check_in_ticket(uuid, text) from public, anon;
grant execute on function public.submit_response(uuid, jsonb, text, text, text), public.review_responses(uuid[], text, text, boolean, timestamptz), public.check_in_ticket(uuid, text) to authenticated;
-- How many responses a form has (shown on the public form: "34 of 50 seats taken").
create or replace function public.form_count(f uuid) returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from public.form_responses r join public.club_forms m on m.id = r.form_id where r.form_id = f and r.status in ('pending', 'shortlisted', 'accepted') and m.status <> 'draft';
$$;
grant execute on function public.form_count(uuid) to anon, authenticated;

-- ───────────────────────── Attendance (rotating code / QR) ─────────────────────────
create table public.club_sessions (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs on delete cascade,
  title text not null check (length(title) between 2 and 120),
  starts_at timestamptz not null default now(),
  open boolean not null default true,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index club_sessions_club on public.club_sessions (club_id, starts_at desc);
alter table public.club_sessions enable row level security;
-- The secret lives apart so members can list sessions without seeing it.
create table public.club_session_keys (
  session_id uuid primary key references public.club_sessions on delete cascade,
  club_id uuid not null references public.clubs on delete cascade,
  secret text not null default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')
);
alter table public.club_session_keys enable row level security;
create table public.club_attendance (
  session_id uuid not null references public.club_sessions on delete cascade,
  club_id uuid not null references public.clubs on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  at timestamptz not null default now(),
  by_hand boolean not null default false,
  primary key (session_id, user_id)
);
alter table public.club_attendance enable row level security;
create policy "read sessions" on public.club_sessions for select to authenticated using (public.is_club_member(club_id) or public.club_can(club_id, 'attendance.take'));
create policy "add sessions" on public.club_sessions for insert to authenticated with check (public.club_can(club_id, 'attendance.take') and created_by = auth.uid());
create policy "edit sessions" on public.club_sessions for update to authenticated using (public.club_can(club_id, 'attendance.take')) with check (public.club_can(club_id, 'attendance.take'));
create policy "delete sessions" on public.club_sessions for delete to authenticated using (public.club_can(club_id, 'attendance.take'));
create policy "read session keys" on public.club_session_keys for select to authenticated using (public.club_can(club_id, 'attendance.take'));
create policy "read attendance" on public.club_attendance for select to authenticated using (user_id = auth.uid() or public.club_can(club_id, 'attendance.take'));
create or replace function public.club_session_key() returns trigger
language plpgsql security definer set search_path = public as $$
begin insert into public.club_session_keys (session_id, club_id) values (new.id, new.club_id); return new; end $$;
revoke execute on function public.club_session_key() from public, anon, authenticated;
create trigger club_session_key after insert on public.club_sessions for each row execute function public.club_session_key();
-- The code on screen changes every 30 s: first 6 digits of sha256(secret:window). The app computes the same
-- (src/clubs/checkin.js). The current and the previous window are accepted.
create or replace function public.club_code(secret text, win bigint) returns text
language sql immutable set search_path = public as $$
  select lpad((('x' || substr(encode(sha256(convert_to(secret || ':' || win::text, 'UTF8')), 'hex'), 1, 8))::bit(32)::bigint % 1000000)::text, 6, '0');
$$;
revoke execute on function public.club_code(text, bigint) from public, anon, authenticated;
create or replace function public.club_checkin(s uuid, code text) returns text
language plpgsql security definer set search_path = public as $$
declare k public.club_session_keys; ss public.club_sessions; w bigint := floor(extract(epoch from now()) / 30); title text;
begin
  select * into ss from public.club_sessions where id = s;
  if ss.id is null or not ss.open then raise exception 'Check-in for this session is closed'; end if;
  if not public.is_club_member(ss.club_id) then raise exception 'Only club members can check in'; end if;
  select * into k from public.club_session_keys where session_id = s;
  if trim(code) not in (public.club_code(k.secret, w), public.club_code(k.secret, w - 1)) then raise exception 'That code has changed. Scan again or type the new code.'; end if;
  insert into public.club_attendance (session_id, club_id, user_id) values (s, ss.club_id, auth.uid()) on conflict do nothing;
  return ss.title;
end $$;
-- Mark someone present by hand (no phone, forgot to scan).
create or replace function public.club_mark_present(s uuid, u uuid, present boolean default true) returns void
language plpgsql security definer set search_path = public as $$
declare c uuid := (select club_id from public.club_sessions where id = s);
begin
  if c is null or not public.club_can(c, 'attendance.take') then raise exception 'You don''t have permission to take attendance'; end if;
  if present then insert into public.club_attendance (session_id, club_id, user_id, by_hand) values (s, c, u, true) on conflict do nothing;
  else delete from public.club_attendance where session_id = s and user_id = u; end if;
end $$;
revoke execute on function public.club_checkin(uuid, text), public.club_mark_present(uuid, uuid, boolean) from public, anon;
grant execute on function public.club_checkin(uuid, text), public.club_mark_present(uuid, uuid, boolean) to authenticated;

-- ───────────────────────── Polls and elections ─────────────────────────
create table public.club_polls (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs on delete cascade,
  kind text not null default 'poll' check (kind in ('poll', 'election')),
  title text not null check (length(title) between 3 and 160),
  description text not null default '' check (length(description) <= 2000),
  options jsonb not null check (jsonb_typeof(options) = 'array' and jsonb_array_length(options) between 2 and 30),
  multi boolean not null default false,
  anonymous boolean not null default true,
  audience text not null default 'members' check (audience in ('members', 'exec')),
  results text not null default 'after_close' check (results in ('live', 'after_close')),
  closes_at timestamptz,
  closed boolean not null default false,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index club_polls_club on public.club_polls (club_id, created_at desc);
alter table public.club_polls enable row level security;
-- Who voted (one row per person) and what was voted (no person on anonymous ballots) are kept apart.
create table public.club_voted (
  poll_id uuid not null references public.club_polls on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  primary key (poll_id, user_id)
);
create table public.club_ballots (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.club_polls on delete cascade,
  choice int not null,
  user_id uuid references auth.users (id) on delete set null -- null on anonymous polls
);
alter table public.club_voted enable row level security;
alter table public.club_ballots enable row level security;
create policy "read polls" on public.club_polls for select to authenticated using (public.club_can(club_id, 'polls.create') or (public.is_club_member(club_id) and (audience = 'members' or public.club_rank(club_id) <= 3)));
create policy "create polls" on public.club_polls for insert to authenticated with check (public.club_can(club_id, 'polls.create') and created_by = auth.uid() and not (kind = 'election' and public.club_rank(club_id) > 2));
create policy "edit polls" on public.club_polls for update to authenticated using (public.club_can(club_id, 'polls.create')) with check (public.club_can(club_id, 'polls.create'));
create policy "delete polls" on public.club_polls for delete to authenticated using (public.club_can(club_id, 'polls.create'));
create policy "my votes" on public.club_voted for select to authenticated using (user_id = auth.uid());
create or replace function public.cast_vote(p uuid, choices int[]) returns void
language plpgsql security definer set search_path = public as $$
declare pl public.club_polls; ch int;
begin
  select * into pl from public.club_polls where id = p;
  if pl.id is null or pl.closed or (pl.closes_at is not null and now() > pl.closes_at) then raise exception 'Voting has closed'; end if;
  if not public.is_club_member(pl.club_id) or (pl.audience = 'exec' and public.club_rank(pl.club_id) > 3) then raise exception 'You can''t vote in this poll'; end if;
  if cardinality(choices) = 0 or (not pl.multi and cardinality(choices) > 1) then raise exception 'Choose % option', case when pl.multi then 'at least one' else 'one' end; end if;
  insert into public.club_voted (poll_id, user_id) values (p, auth.uid()); -- fails if you already voted
  foreach ch in array (select array_agg(distinct x) from unnest(choices) x) loop
    if ch < 0 or ch >= jsonb_array_length(pl.options) then raise exception 'Unknown option'; end if;
    insert into public.club_ballots (poll_id, choice, user_id) values (p, ch, case when pl.anonymous then null else auth.uid() end);
  end loop;
exception when unique_violation then raise exception 'You''ve already voted';
end $$;
create or replace function public.poll_results(p uuid) returns table (choice int, votes int, voters int)
language plpgsql stable security definer set search_path = public as $$
declare pl public.club_polls;
begin
  select * into pl from public.club_polls where id = p;
  if pl.id is null or not (public.is_club_member(pl.club_id) or public.club_can(pl.club_id, 'polls.create')) then raise exception 'Not allowed'; end if;
  if pl.results = 'after_close' and not (pl.closed or (pl.closes_at is not null and now() > pl.closes_at)) and not public.club_can(pl.club_id, 'polls.create') then return; end if;
  return query select g.i::int, (select count(*)::int from public.club_ballots b where b.poll_id = p and b.choice = g.i), (select count(*)::int from public.club_voted v where v.poll_id = p)
    from generate_series(0, jsonb_array_length(pl.options) - 1) g(i);
end $$;
revoke execute on function public.cast_vote(uuid, int[]), public.poll_results(uuid) from public, anon;
grant execute on function public.cast_vote(uuid, int[]), public.poll_results(uuid) to authenticated;

-- ───────────────────────── Committee history and handover ─────────────────────────
create table public.club_terms (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs on delete cascade,
  label text not null check (length(label) between 2 and 40), -- "2025–26"
  ended_on date not null default current_date,
  committee jsonb not null default '[]'::jsonb, -- [{ name, title, role }]
  created_at timestamptz not null default now()
);
alter table public.club_terms enable row level security;
create policy "read terms" on public.club_terms for select using (exists (select 1 from public.clubs k where k.id = club_id and k.status = 'active'));
create policy "fix terms" on public.club_terms for update to authenticated using (public.club_can(club_id, 'settings.edit')) with check (public.club_can(club_id, 'settings.edit'));
create policy "delete terms" on public.club_terms for delete to authenticated using (public.club_can(club_id, 'settings.edit'));
-- Year change: the outgoing committee is saved to History, everyone at Executive/Wing Head becomes a Senior
-- General Member, then the new committee gets its roles. assignments: [{ user_id, rank, title, wing }].
create or replace function public.handover_term(c uuid, lbl text, assignments jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare a jsonb;
begin
  if public.club_rank(c) > 2 then raise exception 'Only a club admin can hand over to a new committee'; end if;
  insert into public.club_terms (club_id, label, committee)
  select c, left(lbl, 40), coalesce(jsonb_agg(jsonb_build_object('name', x.display_name, 'title', x.title, 'role', x.role_name) order by x.rank), '[]') from public.club_committee(c) x where x.rank between 2 and 4;
  update public.club_members m set role_id = (select id from public.club_roles where club_id = c and rank = 6), title = ''
    where m.club_id = c and m.status = 'active' and (select rank from public.club_roles r where r.id = m.role_id) between 3 and 4;
  for a in select * from jsonb_array_elements(coalesce(assignments, '[]')) loop
    if (a ->> 'rank')::int between 2 and 7 then
      update public.club_members set role_id = (select id from public.club_roles where club_id = c and rank = (a ->> 'rank')::int),
        title = left(coalesce(a ->> 'title', ''), 60), wing = left(coalesce(a ->> 'wing', wing), 40)
        where club_id = c and user_id = (a ->> 'user_id')::uuid and status = 'active';
    end if;
  end loop;
  perform public.club_log(c, 'handover', jsonb_build_object('label', lbl, 'new', jsonb_array_length(coalesce(assignments, '[]'))));
end $$;
revoke execute on function public.handover_term(uuid, text, jsonb) from public, anon; grant execute on function public.handover_term(uuid, text, jsonb) to authenticated;

create table public.club_milestones (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs on delete cascade,
  year int not null check (year between 1990 and 2100),
  kind text not null default 'milestone' check (kind in ('milestone', 'award', 'event')),
  title text not null check (length(title) between 3 and 140),
  body text not null default '' check (length(body) <= 1500),
  image text not null default '' check (image = '' or image ~ '^https://'),
  created_at timestamptz not null default now()
);
create table public.club_media (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs on delete cascade,
  album text not null default 'General' check (length(album) between 1 and 60),
  url text not null check (url ~ '^https://'),
  caption text not null default '' check (length(caption) <= 200),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
alter table public.club_milestones enable row level security;
alter table public.club_media enable row level security;
create policy "read milestones" on public.club_milestones for select using (exists (select 1 from public.clubs k where k.id = club_id and k.status = 'active'));
create policy "write milestones" on public.club_milestones for all to authenticated using (public.club_can(club_id, 'settings.edit')) with check (public.club_can(club_id, 'settings.edit'));
create policy "read media" on public.club_media for select using (exists (select 1 from public.clubs k where k.id = club_id and k.status = 'active'));
create policy "write media" on public.club_media for insert to authenticated with check (public.club_can(club_id, 'posts.write') and created_by = auth.uid());
create policy "delete media" on public.club_media for delete to authenticated using (public.club_can(club_id, 'posts.write'));

-- ───────────────────────── Tasks and documents ─────────────────────────
create table public.club_tasks (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs on delete cascade,
  wing text not null default '' check (length(wing) <= 40),
  title text not null check (length(title) between 2 and 160),
  notes text not null default '' check (length(notes) <= 2000),
  assignee uuid references auth.users (id) on delete set null,
  assignee_name text not null default '',
  due date,
  status text not null default 'todo' check (status in ('todo', 'doing', 'done')),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index club_tasks_club on public.club_tasks (club_id, status, due);
alter table public.club_tasks enable row level security;
create policy "read tasks" on public.club_tasks for select to authenticated using (public.is_club_member(club_id) or public.club_can(club_id, 'tasks.manage'));
create policy "add tasks" on public.club_tasks for insert to authenticated with check (public.club_can(club_id, 'tasks.manage') and created_by = auth.uid());
create policy "update tasks" on public.club_tasks for update to authenticated using (public.club_can(club_id, 'tasks.manage') or assignee = auth.uid()) with check (public.club_can(club_id, 'tasks.manage') or assignee = auth.uid());
create policy "delete tasks" on public.club_tasks for delete to authenticated using (public.club_can(club_id, 'tasks.manage'));
-- Someone assigned a task may only move its status.
create or replace function public.club_task_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not public.club_can(new.club_id, 'tasks.manage') and (to_jsonb(new) - 'status') <> (to_jsonb(old) - 'status') then raise exception 'You can only change the status of your task'; end if;
  if new.assignee is distinct from old.assignee or tg_op = 'INSERT' then new.assignee_name := coalesce((select display_name from public.club_members where club_id = new.club_id and user_id = new.assignee), ''); end if;
  return new;
end $$;
revoke execute on function public.club_task_guard() from public, anon, authenticated;
create trigger club_task_guard before insert or update on public.club_tasks for each row execute function public.club_task_guard();
create or replace function public.club_task_notify() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.assignee is not null and new.assignee is distinct from (case when tg_op = 'UPDATE' then old.assignee end) and new.assignee <> auth.uid() then
    perform public.club_notify(new.assignee, 'New task: ' || new.title, coalesce('Due ' || to_char(new.due, 'DD Mon'), ''), '#/club/space?c=' || new.club_id || '&tab=tasks');
  end if;
  return new;
end $$;
revoke execute on function public.club_task_notify() from public, anon, authenticated;
create trigger club_task_notify after insert or update on public.club_tasks for each row execute function public.club_task_notify();

create table public.club_docs (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs on delete cascade,
  title text not null check (length(title) between 2 and 140),
  url text not null default '' check (url = '' or url ~ '^https://'),
  path text not null default '', -- file in the clubs-private bucket
  audience text not null default 'members' check (audience in ('members', 'exec')),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  check (url <> '' or path <> '')
);
alter table public.club_docs enable row level security;
create policy "read docs" on public.club_docs for select to authenticated using (public.club_can(club_id, 'docs.manage') or (public.is_club_member(club_id) and (audience = 'members' or public.club_rank(club_id) <= 3)));
create policy "write docs" on public.club_docs for all to authenticated using (public.club_can(club_id, 'docs.manage')) with check (public.club_can(club_id, 'docs.manage'));

-- ───────────────────────── Certificates ─────────────────────────
create table public.club_certificates (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default upper(substr(md5(gen_random_uuid()::text), 1, 10)),
  club_id uuid not null references public.clubs on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  recipient text not null check (length(recipient) between 2 and 80),
  title text not null check (length(title) between 3 and 140), -- "Certificate of Participation"
  event text not null default '' check (length(event) <= 140),
  issued_on date not null default current_date,
  issued_by uuid references auth.users (id) on delete set null default auth.uid(),
  signer text not null default '' check (length(signer) <= 120)
);
alter table public.club_certificates enable row level security;
create policy "read certificates" on public.club_certificates for select to authenticated using (user_id = auth.uid() or public.club_can(club_id, 'certs.issue'));
create policy "issue certificates" on public.club_certificates for insert to authenticated with check (public.club_can(club_id, 'certs.issue') and issued_by = auth.uid());
create policy "revoke certificates" on public.club_certificates for delete to authenticated using (public.club_can(club_id, 'certs.issue'));
create or replace function public.verify_certificate(c text) returns table (recipient text, title text, event text, issued_on date, club text, signer text)
language sql stable security definer set search_path = public as $$
  select x.recipient, x.title, x.event, x.issued_on, k.name, x.signer from public.club_certificates x join public.clubs k on k.id = x.club_id where x.code = upper(trim(c));
$$;
grant execute on function public.verify_certificate(text) to anon, authenticated;
create or replace function public.club_cert_notify() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.user_id is not null then perform public.club_notify(new.user_id, 'You received a certificate', new.title || coalesce(' · ' || nullif(new.event, ''), ''), '#/club/mine?tab=certs'); end if;
  return new;
end $$;
revoke execute on function public.club_cert_notify() from public, anon, authenticated;
create trigger club_cert_notify after insert on public.club_certificates for each row execute function public.club_cert_notify();

-- ───────────────────────── Finance log (record keeping only) ─────────────────────────
create table public.club_finance (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs on delete cascade,
  kind text not null check (kind in ('income', 'expense')),
  amount numeric(12, 2) not null check (amount > 0 and amount < 100000000),
  category text not null default 'Other' check (length(category) between 1 and 40),
  note text not null default '' check (length(note) <= 300),
  on_date date not null default current_date,
  receipt_path text not null default '',
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index club_finance_club on public.club_finance (club_id, on_date desc);
alter table public.club_finance enable row level security;
create policy "read finance" on public.club_finance for select to authenticated using (public.club_can(club_id, 'finance.view') or public.club_can(club_id, 'finance.edit'));
create policy "write finance" on public.club_finance for all to authenticated using (public.club_can(club_id, 'finance.edit')) with check (public.club_can(club_id, 'finance.edit'));

-- ───────────────────────── My clubs (one call for the app) ─────────────────────────
create or replace function public.my_clubs() returns table (club_id uuid, status text, rank int, role_name text, perms text[], title text, wing text)
language sql stable security definer set search_path = public as $$
  select m.club_id, m.status, r.rank, r.name, r.perms, m.title, m.wing from public.club_members m join public.club_roles r on r.id = m.role_id
  where m.user_id = auth.uid() and m.status <> 'removed';
$$;
revoke execute on function public.my_clubs() from public, anon; grant execute on function public.my_clubs() to authenticated;

-- ───────────────────────── Platform admin overview ─────────────────────────
create or replace function public.admin_club_stats() returns json
language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.can('clubs.manage') or public.can('clubs.verify')) then raise exception 'Not allowed'; end if;
  return json_build_object(
    'clubs', (select count(*) from clubs where status = 'active'), 'unclaimed', (select count(*) from clubs where status = 'unclaimed'),
    'pending_claims', (select count(*) from club_claims where status = 'pending'), 'members', (select count(*) from club_members where status = 'active'),
    'posts_30d', (select count(*) from club_posts where created_at > now() - interval '30 days'), 'responses_30d', (select count(*) from form_responses where created_at > now() - interval '30 days'),
    'open_reports', (select count(*) from club_reports where status = 'open'),
    'top', (select coalesce(json_agg(t), '[]') from (select k.name, count(m.*) n from clubs k left join club_members m on m.club_id = k.id and m.status = 'active' where k.status = 'active' group by k.name order by n desc limit 8) t));
end $$;
revoke execute on function public.admin_club_stats() from public, anon; grant execute on function public.admin_club_stats() to authenticated;
-- Platform: appoint (or replace) a club admin by email; they must already have an EWUdiots account.
create or replace function public.admin_set_club_admin(c uuid, who text) returns void
language plpgsql security definer set search_path = public as $$
declare u auth.users; e text := lower(trim(who));
begin
  if not public.can('clubs.manage') then raise exception 'Not allowed'; end if;
  if e ~ '^\d{4}-\d-\d{2}-\d{3}$' then e := e || '@std.ewubd.edu'; end if;
  select * into u from auth.users where lower(email) = e;
  if u.id is null then
    insert into public.club_invites (club_id, email, rank) values (c, e, 2) on conflict (club_id, email) do update set rank = 2, status = 'pending', created_at = now(), expires_at = now() + interval '60 days';
  else
    perform public.club_add_member(c, u.id, 2, coalesce(u.raw_user_meta_data ->> 'name', split_part(e, '@', 1)), e, coalesce(substring(e from '^(\d{4}-\d-\d{2}-\d{3})@'), ''), '', auth.uid());
    update public.club_members set role_id = (select id from public.club_roles where club_id = c and rank = 2) where club_id = c and user_id = u.id;
  end if;
  update public.clubs set status = 'active', verified = true where id = c and status in ('unclaimed', 'pending');
  perform public.club_log(c, 'admin.appointed', jsonb_build_object('email', e));
end $$;
revoke execute on function public.admin_set_club_admin(uuid, text) from public, anon; grant execute on function public.admin_set_club_admin(uuid, text) to authenticated;

update public.role_permissions set perms = (select array_agg(distinct x) from unnest(perms || array['clubs.manage', 'clubs.verify', 'clubs.moderate']) x) where role = 'admin';
update public.role_permissions set perms = (select array_agg(distinct x) from unnest(perms || array['clubs.verify', 'clubs.moderate']) x) where role = 'editor';
update public.role_permissions set perms = (select array_agg(distinct x) from unnest(perms || array['clubs.moderate']) x) where role = 'moderator';

-- ───────────────────────── Storage ─────────────────────────
-- clubs-public/<club_id>/…  logo, cover, post images, gallery (anyone can view)
-- clubs-private/<club_id>/docs/…, /receipts/…, /forms/<form_id>/<user_id>/…
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('clubs-public', 'clubs-public', true, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do nothing;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('clubs-private', 'clubs-private', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
on conflict (id) do nothing;
create or replace function public.club_folder(name text) returns uuid
language sql immutable as $$ select case when (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$' then (storage.foldername(name))[1]::uuid end $$;
create policy "club public upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'clubs-public' and (public.club_can(public.club_folder(name), 'posts.write') or public.club_can(public.club_folder(name), 'settings.edit')));
create policy "club public delete" on storage.objects for delete to authenticated
  using (bucket_id = 'clubs-public' and (public.club_can(public.club_folder(name), 'posts.write') or public.club_can(public.club_folder(name), 'settings.edit')));
create policy "club private read" on storage.objects for select to authenticated using (bucket_id = 'clubs-private' and (
  ((storage.foldername(name))[2] = 'docs' and public.is_club_member(public.club_folder(name)))
  or ((storage.foldername(name))[2] = 'receipts' and public.club_can(public.club_folder(name), 'finance.view'))
  or ((storage.foldername(name))[2] = 'forms' and ((storage.foldername(name))[4] = auth.uid()::text or public.club_can(public.club_folder(name), 'forms.view_responses')))));
create policy "club private upload" on storage.objects for insert to authenticated with check (bucket_id = 'clubs-private' and (
  ((storage.foldername(name))[2] = 'docs' and public.club_can(public.club_folder(name), 'docs.manage'))
  or ((storage.foldername(name))[2] = 'receipts' and public.club_can(public.club_folder(name), 'finance.edit'))
  or ((storage.foldername(name))[2] = 'forms' and (storage.foldername(name))[4] = auth.uid()::text)));
create policy "club private delete" on storage.objects for delete to authenticated using (bucket_id = 'clubs-private' and (
  ((storage.foldername(name))[2] = 'docs' and public.club_can(public.club_folder(name), 'docs.manage'))
  or ((storage.foldername(name))[2] = 'receipts' and public.club_can(public.club_folder(name), 'finance.edit'))));

-- ───────────────────────── Seed: EWU's clubs (ewubd.edu/clubs, Oct 2026) ─────────────────────────
-- Listed as "unclaimed": name, category and the official page only. A club's president claims it to run it here.
insert into public.clubs (slug, name, short_name, category, official_url, status, join_mode) values
  ('agro-industrialization', 'EWU Agro-Industrialization Club', 'EWUAIC', 'business', 'https://clubs.ewubd.edu/ewuaic', 'unclaimed', 'apply'),
  ('business', 'EWU Business Club', 'EWUBC', 'business', 'https://clubs.ewubd.edu/ewubc', 'unclaimed', 'apply'),
  ('creative-marketing', 'EWU Creative Marketing Club', 'EWUCMC', 'business', 'https://clubs.ewubd.edu/ewucmc', 'unclaimed', 'apply'),
  ('computer-programming', 'EWU Computer Programming Club', 'EWUCoPC', 'tech', 'https://clubs.ewubd.edu/ewucopc', 'unclaimed', 'apply'),
  ('performing-arts', 'EWU Club for Performing Arts', 'ECPA', 'arts', 'https://clubs.ewubd.edu/ecpa', 'unclaimed', 'apply'),
  ('debating', 'EWU Debating Club', 'EWUDC', 'debate', 'https://clubs.ewubd.edu/ewudc', 'unclaimed', 'apply'),
  ('economics', 'EWU Economics Club', 'EWUEcon', 'business', 'https://clubs.ewubd.edu/ewuecon', 'unclaimed', 'apply'),
  ('electronics', 'EWU Electronics Club', 'EWUEC', 'tech', 'https://clubs.ewubd.edu/ewuec', 'unclaimed', 'apply'),
  ('english-conversation', 'EWU English Conversation Club', 'EWUECC', 'debate', 'https://clubs.ewubd.edu/ewuecc', 'unclaimed', 'apply'),
  ('environmental-social', 'EWU Environmental & Social Club', 'EWUESC', 'social', 'https://clubs.ewubd.edu/ewuesc', 'unclaimed', 'apply'),
  ('investment-finance', 'EWU Investment and Finance Club', 'EWUIFC', 'business', 'https://clubs.ewubd.edu/ewuifc', 'unclaimed', 'apply'),
  ('ieee-student-branch', 'IEEE EWU Student Branch', 'IEEE SB', 'tech', 'https://clubs.ewubd.edu/ieeesb', 'unclaimed', 'apply'),
  ('model-united-nations', 'EWU Model United Nations Club', 'EWUMUNC', 'debate', 'https://clubs.ewubd.edu/ewumunc', 'unclaimed', 'apply'),
  ('photography', 'EWU Photography Club', 'EWUPC', 'arts', 'https://clubs.ewubd.edu/ewupc', 'unclaimed', 'apply'),
  ('robotics', 'EWU Robotics Club', 'EWURC', 'tech', 'https://clubs.ewubd.edu/ewurc', 'unclaimed', 'apply'),
  ('rotaract', 'Rotaract Club of EWU', 'RCEWU', 'social', 'https://clubs.ewubd.edu/rcewu', 'unclaimed', 'apply'),
  ('science', 'EWU Science Club', 'EWUSCC', 'science', 'https://clubs.ewubd.edu/ewuscc', 'unclaimed', 'apply'),
  ('sociology', 'EWU Sociology Club', 'SCEWU', 'social', 'https://clubs.ewubd.edu/scewu', 'unclaimed', 'apply'),
  ('sports', 'EWU Sports Club', 'EWUSC', 'sports', 'https://clubs.ewubd.edu/sportsclub', 'unclaimed', 'apply'),
  ('telecommunication', 'EWU Telecommunication Club', 'EWUTC', 'tech', 'https://clubs.ewubd.edu/ewutc', 'unclaimed', 'apply'),
  ('cyber-security', 'EWU Cyber Security Club', 'EWUCSC', 'tech', 'https://clubs.ewubd.edu/ewucsc', 'unclaimed', 'apply'),
  ('health-well-being', 'EWU Health and Well-Being Club', 'EHWC', 'social', 'https://clubs.ewubd.edu/ehwc', 'unclaimed', 'apply'),
  ('book-reading', 'EWU Book Reading Club', 'EWUBRC', 'arts', 'https://clubs.ewubd.edu/ewubrc', 'unclaimed', 'apply')
on conflict (slug) do nothing;
