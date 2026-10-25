-- Admin panel (admin.html): who is an admin, what they can publish, and what students can submit for review.
-- Make yourself the first admin (any email, also non-EWU) by inviting it, then sign in on /admin.html:
--   insert into public.admin_invites (email, role) values ('you@example.com', 'owner');

create table public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  role text not null default 'admin' check (role in ('owner', 'admin', 'editor')),
  created_at timestamptz not null default now()
);
alter table public.admins enable row level security;

-- Invited emails may sign up even though they aren't @std.ewubd.edu, and become admins on their first sign-in.
create table public.admin_invites (
  email text primary key check (email = lower(email)),
  role text not null default 'admin' check (role in ('owner', 'admin', 'editor')),
  created_at timestamptz not null default now()
);
alter table public.admin_invites enable row level security;

-- Role checks read the tables as the definer, so policies on admins never query admins themselves (no recursion).
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;
create or replace function public.is_owner() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid() and role = 'owner');
$$;
grant execute on function public.is_admin() to anon, authenticated;
grant execute on function public.is_owner() to authenticated;

create policy "admins read admins" on public.admins for select to authenticated using (public.is_admin());
create policy "owners add admins" on public.admins for insert to authenticated with check (public.is_owner());
create policy "owners change admins" on public.admins for update to authenticated using (public.is_owner()) with check (public.is_owner());
create policy "owners remove admins" on public.admins for delete to authenticated using (public.is_owner() and user_id <> auth.uid());
create policy "owners read invites" on public.admin_invites for select to authenticated using (public.is_owner());
create policy "owners invite" on public.admin_invites for insert to authenticated with check (public.is_owner());
create policy "owners revoke invites" on public.admin_invites for delete to authenticated using (public.is_owner());

-- Sign-up: EWU student emails, or an invited admin email.
create or replace function public.enforce_ewu_email() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.email is not null and exists (select 1 from public.admin_invites where email = lower(new.email)) then return new; end if;
  if new.email is null or lower(new.email) !~ '^[0-9]{4}-[0-9]-[0-9]{2}-[0-9]{3}@std\.ewubd\.edu$' then
    raise exception 'Only EWU student emails (e.g. 2026-2-60-123@std.ewubd.edu) can sign up';
  end if;
  return new;
end $$;
create or replace function public.accept_admin_invite() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.admins (user_id, email, role)
    select new.id, lower(new.email), i.role from public.admin_invites i where i.email = lower(new.email)
    on conflict (user_id) do nothing;
  delete from public.admin_invites where email = lower(new.email);
  return new;
end $$;
drop trigger if exists accept_admin_invite on auth.users;
create trigger accept_admin_invite after insert on auth.users for each row execute function public.accept_admin_invite();
-- Already signed up before being invited? Accept the invite on the next check from the admin panel.
create or replace function public.claim_admin_invite() returns boolean
language plpgsql security definer set search_path = public as $$
declare e text := lower(auth.jwt() ->> 'email');
begin
  insert into public.admins (user_id, email, role)
    select auth.uid(), e, i.role from public.admin_invites i where i.email = e
    on conflict (user_id) do nothing;
  delete from public.admin_invites where email = e;
  return public.is_admin();
end $$;
grant execute on function public.claim_admin_invite() to authenticated;

-- Announcements and news written by the EWUdiots team (shown beside the official EWU feeds).
create table public.posts (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('announcement', 'news', 'event')),
  title text not null check (length(title) between 3 and 200),
  body text not null default '' check (length(body) <= 8000),
  image_url text not null default '' check (image_url = '' or image_url ~ '^https://'),
  link text not null default '' check (link = '' or link ~ '^https://'),
  tag text not null default '',
  pinned boolean not null default false,
  published boolean not null default true,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.posts enable row level security;
create policy "read live posts" on public.posts for select using (published and starts_at <= now() and (ends_at is null or ends_at > now()) or public.is_admin());
create policy "admins write posts" on public.posts for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Site-wide switches and texts (feature toggles, home banner, maintenance message…).
create table public.site_settings (
  key text primary key check (key ~ '^[a-z0-9_.]{2,60}$'),
  value jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.site_settings enable row level security;
create policy "read settings" on public.site_settings for select using (true);
create policy "admins write settings" on public.site_settings for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Alumni profiles students submit about themselves; shown only after an admin approves them.
create table public.alumni_profiles (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  name text not null check (length(name) between 2 and 80),
  role text not null check (length(role) between 2 and 120),
  org text not null check (length(org) between 2 and 120),
  country text not null default 'Bangladesh',
  dept text not null default '',
  grad_year int check (grad_year between 1996 and 2100),
  sector text not null default '',
  note text not null default '' check (length(note) <= 280),
  linkedin text not null default '' check (linkedin = '' or linkedin ~ '^https://(www\.)?linkedin\.com/'),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  unique (user_id)
);
alter table public.alumni_profiles enable row level security;
create policy "read approved alumni" on public.alumni_profiles for select using (status = 'approved' or auth.uid() = user_id or public.is_admin());
create policy "submit own profile" on public.alumni_profiles for insert to authenticated with check (auth.uid() = user_id and status = 'pending');
create policy "edit own profile" on public.alumni_profiles for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id and status = 'pending');
create policy "delete own profile" on public.alumni_profiles for delete to authenticated using (auth.uid() = user_id or public.is_admin());
create policy "admins review alumni" on public.alumni_profiles for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- Changes to the official faculty directory (hide a listing on request, fix a room, add initials).
create table public.faculty_overrides (
  slug text primary key, -- profile slug, e.g. 'hosney.jahan'
  hidden boolean not null default false,
  init text not null default '' check (init = '' or init ~ '^[A-Z]{2,8}$'),
  room text not null default '',
  note text not null default '',
  updated_at timestamptz not null default now()
);
alter table public.faculty_overrides enable row level security;
create policy "read overrides" on public.faculty_overrides for select using (true);
create policy "admins write overrides" on public.faculty_overrides for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Verified rooms for the campus map, shared with every student.
create table public.campus_rooms (
  code text primary key check (code ~ '^((AB[1-3]|FUB)-)?\d{3,4}$'),
  name text not null default '',
  kind text not null default 'classroom',
  block text not null,
  floor int not null check (floor between -2 and 12),
  u real, v real,
  updated_at timestamptz not null default now()
);
alter table public.campus_rooms enable row level security;
create policy "read rooms" on public.campus_rooms for select using (true);
create policy "admins write rooms" on public.campus_rooms for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Moderation: admins can see reports and hide/restore reviews and vault files.
create policy "admins read reports" on public.reports for select to authenticated using (public.is_admin());
create policy "admins resolve reports" on public.reports for delete to authenticated using (public.is_admin());
create policy "admins moderate reviews" on public.reviews for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admins read all reviews" on public.reviews for select to authenticated using (public.is_admin());
create policy "admins moderate files" on public.resources for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admins read all files" on public.resources for select to authenticated using (public.is_admin());

-- Everything an admin changes is written here.
create table public.admin_log (
  id bigint generated always as identity primary key,
  user_id uuid default auth.uid(),
  email text not null default '',
  action text not null,
  target text not null default '',
  created_at timestamptz not null default now()
);
alter table public.admin_log enable row level security;
create policy "admins read log" on public.admin_log for select to authenticated using (public.is_admin());
create policy "admins write log" on public.admin_log for insert to authenticated with check (public.is_admin());

-- Feature switches (admin panel → Features) are enforced in the database too, not only in the app.
create or replace function public.feature_on(k text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select (value ->> k)::boolean from public.site_settings where key = 'features'), true);
$$;
grant execute on function public.feature_on(text) to anon, authenticated;
create policy "alumni submissions open" on public.alumni_profiles as restrictive for insert to authenticated with check (public.feature_on('alumni_submissions') and public.feature_on('alumni'));
create policy "reviews open" on public.reviews as restrictive for insert to authenticated with check (public.feature_on('reviews'));

-- Only admins (or the auto-hide trigger) may change a review's or file's moderation status; authors can't un-hide.
-- Runs with the caller's rights: API users are 'authenticated', the auto-hide trigger (security definer) is not.
create or replace function public.guard_status() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.status is distinct from old.status and not public.is_admin() and current_user = 'authenticated' then
    new.status := old.status;
  end if;
  return new;
end $$;
drop trigger if exists guard_review_status on public.reviews;
create trigger guard_review_status before update on public.reviews for each row execute function public.guard_status();
drop trigger if exists guard_resource_status on public.resources;
create trigger guard_resource_status before update on public.resources for each row execute function public.guard_status();

-- Home banner: only known colours and safe links can be stored.
alter table public.site_settings add constraint banner_safe check (key <> 'banner' or (
  coalesce(value ->> 'tone', 'purple') in ('purple', 'green', 'amber', 'red')
  and coalesce(value ->> 'link', '') ~ '^(|#/[A-Za-z0-9/?=&_.-]*|https://[^\s"<>]+)$'));
