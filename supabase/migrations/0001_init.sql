-- EWUdiots — initial schema
-- Apply with: supabase db push   (or paste into the Supabase SQL editor)

-- ───────────────────────── Sign-up restriction ─────────────────────────
-- Only EWU student emails may create accounts.
create or replace function public.enforce_ewu_email() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.email is null or lower(new.email) !~ '^[0-9]{4}-[0-9]-[0-9]{2}-[0-9]{3}@std\.ewubd\.edu$' then
    raise exception 'Only EWU student emails (e.g. 2026-2-60-123@std.ewubd.edu) can sign up';
  end if;
  return new;
end $$;
drop trigger if exists ewu_email_only on auth.users;
create trigger ewu_email_only before insert on auth.users for each row execute function public.enforce_ewu_email();

-- ───────────────────────── Private, per-student data ─────────────────────────
-- Profile, routine, grades, tasks, marks, attendance: one JSON document per user.
create table public.user_data (
  user_id uuid primary key references auth.users on delete cascade,
  data jsonb not null default '{}',
  updated_at timestamptz not null default now()
);
alter table public.user_data enable row level security;
create policy "own data" on public.user_data for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ───────────────────────── Shared, crowd-sourced data ─────────────────────────
-- Faculty directory, built from students' class-schedule syncs (initials, name, work email only).
create table public.faculty (
  init text primary key check (init ~ '^[A-Z]{2,8}$'),
  name text not null default '',
  email text not null default '' check (email = '' or email ~* '@ewubd\.edu$'),
  dept text not null default '',
  room text not null default '',
  hours text not null default '',
  updated_at timestamptz not null default now()
);
alter table public.faculty enable row level security;
create policy "read faculty" on public.faculty for select using (true);
create policy "contribute faculty" on public.faculty for insert to authenticated with check (true);
create policy "update faculty" on public.faculty for update to authenticated using (true);

-- Section timetable per semester (from class schedules and offered-course syncs).
-- Powers the advising planner, seat counts and the free-room finder.
create table public.sections (
  id bigint generated always as identity primary key,
  semester text not null check (semester ~ '^(Spring|Summer|Fall)-[0-9]{4}$'),
  course text not null check (course ~ '^[A-Z]{2,4}[0-9]{3,4}[A-Z]?$'),
  sec text not null,
  kind text not null default 'class' check (kind in ('class', 'lab')),
  title text not null default '',
  credits numeric(3,1),
  days text not null check (days ~ '^[SMTWRFA]{1,4}$'),
  start_time text not null check (start_time ~ '^[0-2][0-9]:[0-5][0-9]$'),
  end_time text not null check (end_time ~ '^[0-2][0-9]:[0-5][0-9]$'),
  room text not null default '',
  faculty text not null default '',
  capacity int,
  enrolled int,
  updated_at timestamptz not null default now(),
  unique (semester, course, sec, kind)
);
create index sections_semester_idx on public.sections (semester);
alter table public.sections enable row level security;
create policy "read sections" on public.sections for select using (true);
create policy "contribute sections" on public.sections for insert to authenticated with check (true);
create policy "update sections" on public.sections for update to authenticated using (true);

-- ───────────────────────── Faculty reviews ─────────────────────────
create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  faculty_init text not null references public.faculty (init) on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  stars int not null check (stars between 1 and 5),
  tags text[] not null default '{}' check (cardinality(tags) <= 6),
  course text not null default '',
  body text not null default '' check (char_length(body) <= 500),
  status text not null default 'published' check (status in ('published', 'hidden')),
  created_at timestamptz not null default now(),
  unique (faculty_init, user_id)
);
alter table public.reviews enable row level security;
create policy "own reviews" on public.reviews for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
-- Other students see reviews without the author.
create view public.reviews_public with (security_invoker = false) as
  select id, faculty_init, stars, tags, course, body, created_at, (user_id = auth.uid()) as mine
  from public.reviews where status = 'published';
create view public.faculty_ratings with (security_invoker = false) as
  select faculty_init, round(avg(stars)::numeric, 2) as rating, count(*) as reviews
  from public.reviews where status = 'published' group by faculty_init;
grant select on public.reviews_public, public.faculty_ratings to anon, authenticated;

-- ───────────────────────── Study vault ─────────────────────────
create table public.resources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  course text not null check (course ~ '^[A-Z]{2,4}[0-9]{3,4}[A-Z]?$'),
  type text not null check (type in ('Notes', 'Slides', 'Past paper', 'Solutions', 'Lab', 'Cheat sheet', 'Template')),
  title text not null check (char_length(title) between 3 and 120),
  file_path text not null,
  size_bytes bigint not null check (size_bytes <= 26214400),
  status text not null default 'published' check (status in ('published', 'hidden')),
  created_at timestamptz not null default now()
);
alter table public.resources enable row level security;
create policy "read published" on public.resources for select using (status = 'published' or auth.uid() = user_id);
create policy "upload own" on public.resources for insert to authenticated with check (auth.uid() = user_id);
create policy "delete own" on public.resources for delete using (auth.uid() = user_id);

create table public.resource_votes (
  resource_id uuid references public.resources on delete cascade,
  user_id uuid references auth.users on delete cascade,
  primary key (resource_id, user_id)
);
alter table public.resource_votes enable row level security;
create policy "read votes" on public.resource_votes for select using (true);
create policy "own votes" on public.resource_votes for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create view public.resources_ranked with (security_invoker = true) as
  select r.id, r.course, r.type, r.title, r.file_path, r.size_bytes, r.created_at, (r.user_id = auth.uid()) as mine,
         (select count(*) from public.resource_votes v where v.resource_id = r.id) as votes
  from public.resources r where r.status = 'published';
grant select on public.resources_ranked to anon, authenticated;

-- Abuse reports (reviews or files). Three reports auto-hide the item until a moderator reviews it.
create table public.reports (
  id bigint generated always as identity primary key,
  target_type text not null check (target_type in ('review', 'resource')),
  target_id uuid not null,
  user_id uuid not null references auth.users on delete cascade,
  reason text not null default '' check (char_length(reason) <= 300),
  created_at timestamptz not null default now(),
  unique (target_type, target_id, user_id)
);
alter table public.reports enable row level security;
create policy "file report" on public.reports for insert to authenticated with check (auth.uid() = user_id);

create or replace function public.auto_hide_reported() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.reports where target_type = new.target_type and target_id = new.target_id) >= 3 then
    if new.target_type = 'review' then update public.reviews set status = 'hidden' where id = new.target_id;
    else update public.resources set status = 'hidden' where id = new.target_id; end if;
  end if;
  return new;
end $$;
create trigger reports_auto_hide after insert on public.reports for each row execute function public.auto_hide_reported();

-- Smart-scan (AI screenshot reading) usage, for the daily limit. Written by the edge function only.
create table public.ai_usage (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users on delete cascade,
  created_at timestamptz not null default now()
);
create index ai_usage_user_idx on public.ai_usage (user_id, created_at);
alter table public.ai_usage enable row level security;

-- ───────────────────────── Storage for the vault ─────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('vault', 'vault', false, 26214400, array['application/pdf', 'image/png', 'image/jpeg',
  'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
on conflict (id) do nothing;
create policy "vault read" on storage.objects for select to authenticated using (bucket_id = 'vault');
create policy "vault upload own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'vault' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "vault delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'vault' and (storage.foldername(name))[1] = auth.uid()::text);

-- ───────────────────────── Account deletion (required by Play Store & App Store) ─────────────────────────
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  -- Vault files are removed by the app through the Storage API before this runs
  -- (Supabase blocks deleting storage objects directly from SQL).
  delete from auth.users where id = auth.uid(); -- cascades to every table above
end $$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
