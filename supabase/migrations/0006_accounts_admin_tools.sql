-- EWUdiots 0006: password accounts for students, alumni and faculty; security hardening; admin tools
-- (users, suspensions, sessions, security events, stats, messages to students, feedback inbox, post trash).

-- ── Who may sign up, and with which role ──
-- Students: their EWU student email. Alumni and faculty: any email, choosing the role at sign-up (they still prove the
-- email with a 6-digit code). Invited admins: any email. The role goes into app_metadata, which users can't edit.
create or replace function public.enforce_ewu_email() returns trigger
language plpgsql security definer set search_path = public as $$
declare e text := lower(coalesce(new.email, '')); claimed text := coalesce(new.raw_user_meta_data ->> 'role', '');
begin
  if e = '' then raise exception 'An email address is required'; end if;
  if exists (select 1 from public.admin_invites where email = e) then
    new.raw_app_meta_data := coalesce(new.raw_app_meta_data, '{}'::jsonb) || '{"role":"admin"}'; return new;
  end if;
  if e ~ '^[0-9]{4}-[0-9]-[0-9]{2}-[0-9]{3}@std\.ewubd\.edu$' then
    new.raw_app_meta_data := coalesce(new.raw_app_meta_data, '{}'::jsonb) || '{"role":"student"}'; return new;
  end if;
  if e ~ '@std\.ewubd\.edu$' then raise exception 'Use your student email in the form 2024-1-60-123@std.ewubd.edu'; end if;
  if claimed in ('alumni', 'faculty') then
    new.raw_app_meta_data := coalesce(new.raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('role', claimed); return new;
  end if;
  raise exception 'Students sign up with their EWU student email. Alumni and faculty choose their role when creating an account.';
end $$;

create or replace function public.my_role() returns text
language sql stable set search_path = public as $$ select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') $$;
grant execute on function public.my_role() to anon, authenticated;

-- Faculty reviews come from students and alumni only (faculty can't review colleagues).
create policy "reviews by students and alumni" on public.reviews as restrictive for insert to authenticated
  with check (public.my_role() in ('student', 'alumni') or public.is_admin());

-- ── Hardening ──
revoke all on public._ewud_migrations from anon, authenticated;
revoke execute on function public.enforce_ewu_email() from public, anon, authenticated;
revoke execute on function public.accept_admin_invite() from public, anon, authenticated;
revoke execute on function public.auto_hide_reported() from public, anon, authenticated;
revoke execute on function public.delete_my_account() from public, anon;
revoke execute on function public.claim_admin_invite() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
grant execute on function public.claim_admin_invite() to authenticated;
-- Activity-log entries carry the signed-in admin's own email, never someone else's.
create policy "log as yourself" on public.admin_log as restrictive for insert to authenticated
  with check (lower(email) = lower(auth.jwt() ->> 'email'));

-- ── Post trash (soft delete, restore within 30 days) ──
alter table public.posts add column if not exists deleted_at timestamptz;
drop policy if exists "read live posts" on public.posts;
create policy "read live posts" on public.posts for select
  using (deleted_at is null and published and starts_at <= now() and (ends_at is null or ends_at > now()) or public.is_admin());

-- ── Messages from the team to one student or everyone (shown in the app's notifications) ──
create table public.user_messages (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users (id) on delete cascade, -- null = everyone
  title text not null check (length(title) between 2 and 120),
  body text not null default '' check (length(body) <= 2000),
  link text not null default '' check (link = '' or link ~ '^(#/|https://)'),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
alter table public.user_messages enable row level security;
create policy "read my messages" on public.user_messages for select to authenticated using (user_id is null or user_id = auth.uid() or public.is_admin());
create policy "admins send messages" on public.user_messages for insert to authenticated with check (public.is_admin());
create policy "admins delete messages" on public.user_messages for delete to authenticated using (public.is_admin());

-- ── Feedback inbox (Help → Send feedback in the app) ──
create table public.feedback (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  email text not null default lower(auth.jwt() ->> 'email'),
  kind text not null default 'other' check (kind in ('bug', 'idea', 'question', 'other')),
  body text not null check (length(body) between 3 and 4000),
  status text not null default 'new' check (status in ('new', 'read', 'replied', 'closed')),
  app_version text not null default '' check (length(app_version) <= 20),
  created_at timestamptz not null default now()
);
alter table public.feedback enable row level security;
create policy "send own feedback" on public.feedback for insert to authenticated
  with check (user_id = auth.uid() and email = lower(auth.jwt() ->> 'email') and status = 'new');
create policy "read own feedback" on public.feedback for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy "admins handle feedback" on public.feedback for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admins delete feedback" on public.feedback for delete to authenticated using (public.is_admin());
-- At most 10 messages a day per account, so the inbox can't be flooded.
create or replace function public.feedback_rate() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.feedback where user_id = new.user_id and created_at > now() - interval '1 day') >= 10 then
    raise exception 'Thanks! You have sent a lot of feedback today. Please try again tomorrow.';
  end if;
  return new;
end $$;
revoke execute on function public.feedback_rate() from public, anon, authenticated;
create trigger feedback_rate before insert on public.feedback for each row execute function public.feedback_rate();

-- ── Admin tools (each checks is_admin() first; they read auth tables as the definer) ──
create or replace function public.admin_users(q text default '', lim int default 200)
returns table (id uuid, email text, role text, name text, created_at timestamptz, last_sign_in_at timestamptz, confirmed boolean, suspended boolean)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  return query select u.id, u.email::text, coalesce(u.raw_app_meta_data ->> 'role', ''), coalesce(u.raw_user_meta_data ->> 'name', ''),
    u.created_at, u.last_sign_in_at, u.email_confirmed_at is not null, coalesce(u.banned_until > now(), false)
  from auth.users u
  where q = '' or u.email ilike '%' || q || '%' or coalesce(u.raw_user_meta_data ->> 'name', '') ilike '%' || q || '%'
  order by u.created_at desc limit least(greatest(lim, 1), 1000);
end $$;

create or replace function public.admin_set_suspended(uid uuid, suspend boolean) returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  if exists (select 1 from public.admins where user_id = uid) then raise exception 'Admins can''t be suspended here. Remove them from Admins first.'; end if;
  update auth.users set banned_until = case when suspend then '2999-01-01'::timestamptz else null end where id = uid;
  if suspend then delete from auth.sessions where user_id = uid; end if;
end $$;

create or replace function public.admin_revoke_sessions(uid uuid) returns int
language plpgsql security definer set search_path = public, auth as $$
declare n int;
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  delete from auth.sessions where user_id = uid; get diagnostics n = row_count; return n;
end $$;

create or replace function public.admin_stats(days int default 30) returns json
language plpgsql stable security definer set search_path = public, auth as $$
declare d int := least(greatest(days, 7), 180);
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  return json_build_object(
    'users', (select count(*) from auth.users),
    'students', (select count(*) from auth.users where raw_app_meta_data ->> 'role' = 'student'),
    'alumni', (select count(*) from auth.users where raw_app_meta_data ->> 'role' = 'alumni'),
    'faculty', (select count(*) from auth.users where raw_app_meta_data ->> 'role' = 'faculty'),
    'suspended', (select count(*) from auth.users where banned_until > now()),
    'new_period', (select count(*) from auth.users where created_at > now() - make_interval(days => d)),
    'new_prev', (select count(*) from auth.users where created_at between now() - make_interval(days => 2 * d) and now() - make_interval(days => d)),
    'active_7d', (select count(*) from auth.users where last_sign_in_at > now() - interval '7 days'),
    'sessions', (select count(*) from auth.sessions),
    'synced', (select count(*) from public.user_data),
    'signups', (select coalesce(json_agg(json_build_object('day', g::date, 'n', (select count(*) from auth.users u where u.created_at::date = g::date)) order by g), '[]'::json)
                from generate_series(current_date - (d - 1), current_date, interval '1 day') g),
    'feedback_new', (select count(*) from public.feedback where status = 'new'));
end $$;

-- Recent sign-in activity for the Security page. IP addresses are masked to their first two parts.
create or replace function public.admin_auth_events(lim int default 100)
returns table (at timestamptz, action text, email text, ip text)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  return query select a.created_at, coalesce(a.payload ->> 'action', ''), coalesce(a.payload ->> 'actor_username', ''),
    coalesce(regexp_replace(a.ip_address, '^(\d+\.\d+)\..*$', '\1.x.x'), '')
  from auth.audit_log_entries a where a.created_at > now() - interval '14 days'
  order by a.created_at desc limit least(greatest(lim, 1), 500);
end $$;

revoke execute on function public.admin_users(text, int), public.admin_set_suspended(uuid, boolean), public.admin_revoke_sessions(uuid),
  public.admin_stats(int), public.admin_auth_events(int) from public, anon;
grant execute on function public.admin_users(text, int), public.admin_set_suspended(uuid, boolean), public.admin_revoke_sessions(uuid),
  public.admin_stats(int), public.admin_auth_events(int) to authenticated;
