-- EWUdiots 0007: role permissions (checked on the server), revision history, media library, automatic news / notices /
-- newsletter feeds that admins can edit, alumni imported from EWU newsletters, scheduled-job log, cookie-free analytics.

-- ── Roles & permissions ── Every permission is "module.action". Owners always have all of them (no lock-out).
alter table public.admins drop constraint if exists admins_role_check;
alter table public.admins add constraint admins_role_check check (role in ('owner', 'admin', 'editor', 'moderator'));
alter table public.admin_invites drop constraint if exists admin_invites_role_check;
alter table public.admin_invites add constraint admin_invites_role_check check (role in ('owner', 'admin', 'editor', 'moderator'));

create table public.role_permissions (
  role text primary key check (role in ('admin', 'editor', 'moderator')),
  perms text[] not null default '{}',
  updated_at timestamptz not null default now()
);
alter table public.role_permissions enable row level security;
insert into public.role_permissions (role, perms) values
  ('admin', array['posts.write','messages.send','site.edit','features.edit','media.write','news.edit','alumni.review','faculty.edit','rooms.edit','reports.handle','feedback.handle','users.view','users.manage','security.view','analytics.view','jobs.run']),
  ('editor', array['posts.write','messages.send','site.edit','media.write','news.edit','alumni.review','faculty.edit','rooms.edit','analytics.view']),
  ('moderator', array['reports.handle','feedback.handle','alumni.review','users.view'])
on conflict (role) do nothing;

create or replace function public.can(p text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins a where a.user_id = auth.uid()
    and (a.role = 'owner' or exists (select 1 from public.role_permissions r where r.role = a.role and p = any (r.perms))));
$$;
grant execute on function public.can(text) to anon, authenticated;
create or replace function public.my_admin() returns json
language sql stable security definer set search_path = public as $$
  select json_build_object('role', a.role, 'perms', case when a.role = 'owner' then null else (select r.perms from public.role_permissions r where r.role = a.role) end)
  from public.admins a where a.user_id = auth.uid();
$$;
revoke execute on function public.my_admin() from public, anon; grant execute on function public.my_admin() to authenticated;
create policy "admins read permissions" on public.role_permissions for select to authenticated using (public.is_admin());
create policy "owners edit permissions" on public.role_permissions for all to authenticated using (public.is_owner()) with check (public.is_owner());

-- Re-point every admin write at a specific permission.
drop policy if exists "admins write posts" on public.posts;
create policy "write posts" on public.posts for all to authenticated using (public.can('posts.write')) with check (public.can('posts.write'));
drop policy if exists "admins write settings" on public.site_settings;
create policy "write settings" on public.site_settings for all to authenticated
  using (case when key in ('features', 'maintenance') then public.can('features.edit') else public.can('site.edit') end)
  with check (case when key in ('features', 'maintenance') then public.can('features.edit') else public.can('site.edit') end);
drop policy if exists "admins review alumni" on public.alumni_profiles;
create policy "review alumni" on public.alumni_profiles for update to authenticated using (public.can('alumni.review')) with check (public.can('alumni.review'));
drop policy if exists "delete own profile" on public.alumni_profiles;
create policy "delete own profile" on public.alumni_profiles for delete to authenticated using (auth.uid() = user_id or public.can('alumni.review'));
drop policy if exists "admins write overrides" on public.faculty_overrides;
create policy "write overrides" on public.faculty_overrides for all to authenticated using (public.can('faculty.edit')) with check (public.can('faculty.edit'));
drop policy if exists "admins write rooms" on public.campus_rooms;
create policy "write rooms" on public.campus_rooms for all to authenticated using (public.can('rooms.edit')) with check (public.can('rooms.edit'));
drop policy if exists "admins resolve reports" on public.reports;
create policy "resolve reports" on public.reports for delete to authenticated using (public.can('reports.handle'));
drop policy if exists "admins moderate reviews" on public.reviews;
create policy "moderate reviews" on public.reviews for update to authenticated using (public.can('reports.handle')) with check (public.can('reports.handle'));
drop policy if exists "admins moderate files" on public.resources;
create policy "moderate files" on public.resources for update to authenticated using (public.can('reports.handle')) with check (public.can('reports.handle'));
drop policy if exists "admins send messages" on public.user_messages;
create policy "send messages" on public.user_messages for insert to authenticated with check (public.can('messages.send'));
drop policy if exists "admins delete messages" on public.user_messages;
create policy "delete messages" on public.user_messages for delete to authenticated using (public.can('messages.send'));
drop policy if exists "admins handle feedback" on public.feedback;
create policy "handle feedback" on public.feedback for update to authenticated using (public.can('feedback.handle')) with check (public.can('feedback.handle'));
drop policy if exists "admins delete feedback" on public.feedback;
create policy "delete feedback" on public.feedback for delete to authenticated using (public.can('feedback.handle'));

create or replace function public.admin_users(q text default '', lim int default 200)
returns table (id uuid, email text, role text, name text, created_at timestamptz, last_sign_in_at timestamptz, confirmed boolean, suspended boolean)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not public.can('users.view') then raise exception 'You don''t have permission to see users'; end if;
  return query select u.id, u.email::text, coalesce(u.raw_app_meta_data ->> 'role', ''), coalesce(u.raw_user_meta_data ->> 'name', ''),
    u.created_at, u.last_sign_in_at, u.email_confirmed_at is not null, coalesce(u.banned_until > now(), false)
  from auth.users u
  where q = '' or u.email ilike '%' || q || '%' or coalesce(u.raw_user_meta_data ->> 'name', '') ilike '%' || q || '%'
  order by u.created_at desc limit least(greatest(lim, 1), 1000);
end $$;
create or replace function public.admin_set_suspended(uid uuid, suspend boolean) returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  if not public.can('users.manage') then raise exception 'You don''t have permission to suspend users'; end if;
  if exists (select 1 from public.admins where user_id = uid) then raise exception 'Admins can''t be suspended here. Remove them from Admins first.'; end if;
  update auth.users set banned_until = case when suspend then '2999-01-01'::timestamptz else null end where id = uid;
  if suspend then delete from auth.sessions where user_id = uid; end if;
end $$;
create or replace function public.admin_revoke_sessions(uid uuid) returns int
language plpgsql security definer set search_path = public, auth as $$
declare n int;
begin
  if not public.can('users.manage') then raise exception 'You don''t have permission to sign users out'; end if;
  delete from auth.sessions where user_id = uid; get diagnostics n = row_count; return n;
end $$;
create or replace function public.admin_auth_events(lim int default 100)
returns table (at timestamptz, action text, email text, ip text)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not public.can('security.view') then raise exception 'You don''t have permission to see security events'; end if;
  return query select a.created_at, coalesce(a.payload ->> 'action', ''), coalesce(a.payload ->> 'actor_username', ''),
    coalesce(regexp_replace(a.ip_address, '^(\d+\.\d+)\..*$', '\1.x.x'), '')
  from auth.audit_log_entries a where a.created_at > now() - interval '14 days'
  order by a.created_at desc limit least(greatest(lim, 1), 500);
end $$;

-- ── Revision history: every change to a post or a setting keeps the previous version ──
create table public.revisions (
  id bigint generated always as identity primary key,
  table_name text not null check (table_name in ('posts', 'site_settings', 'alumni_profiles', 'feed_items')),
  row_key text not null,
  data jsonb not null,
  actor text not null default coalesce(lower(auth.jwt() ->> 'email'), 'system'),
  created_at timestamptz not null default now()
);
create index revisions_row on public.revisions (table_name, row_key, created_at desc);
alter table public.revisions enable row level security;
create policy "admins read revisions" on public.revisions for select to authenticated using (public.is_admin());
create or replace function public.keep_revision() returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- The daily feed refresh rewrites rows; only real edits are worth a revision.
  if tg_op = 'UPDATE' and (to_jsonb(new) - 'fetched_at' - 'updated_at') = (to_jsonb(old) - 'fetched_at' - 'updated_at') then return new; end if;
  insert into public.revisions (table_name, row_key, data) values (tg_table_name,
    case tg_table_name when 'site_settings' then old.key::text else old.id::text end, to_jsonb(old));
  return coalesce(new, old);
end $$;
revoke execute on function public.keep_revision() from public, anon, authenticated;
create trigger keep_revision before update or delete on public.posts for each row execute function public.keep_revision();
create trigger keep_revision before update or delete on public.site_settings for each row execute function public.keep_revision();

-- ── Media library (public images for posts, website content and banners) ──
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', true, 4194304, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do nothing;
create policy "media upload" on storage.objects for insert to authenticated with check (bucket_id = 'media' and public.can('media.write'));
create policy "media replace" on storage.objects for update to authenticated using (bucket_id = 'media' and public.can('media.write'));
create policy "media delete" on storage.objects for delete to authenticated using (bucket_id = 'media' and public.can('media.write'));
create table public.media_items (
  path text primary key,
  url text not null check (url ~ '^https://'),
  alt text not null default '' check (length(alt) <= 200),
  width int, height int, size_bytes int, sha256 text unique,
  folder text not null default 'General' check (length(folder) <= 40),
  created_by text not null default coalesce(lower(auth.jwt() ->> 'email'), ''),
  created_at timestamptz not null default now()
);
alter table public.media_items enable row level security;
create policy "read media" on public.media_items for select using (true);
create policy "write media" on public.media_items for all to authenticated using (public.can('media.write')) with check (public.can('media.write'));

-- ── Automatic feeds: the cron job fills these from ewubd.edu; admins hide, pin, retitle or add their own ──
create table public.feed_items (
  id text primary key,                                 -- '<kind>:<id on ewubd.edu>' or 'manual:<uuid>'
  kind text not null check (kind in ('news', 'notice')),
  title text not null check (length(title) between 2 and 300),
  url text not null default '' check (url = '' or url ~ '^https://'),
  date date, image text not null default '' check (image = '' or image ~ '^https://'),
  excerpt text not null default '' check (length(excerpt) <= 1000),
  tag text not null default '', category text not null default '',
  source text not null default 'auto' check (source in ('auto', 'manual')),
  hidden boolean not null default false, pinned boolean not null default false,
  title_override text not null default '' check (length(title_override) <= 300),
  tag_override text not null default '',
  fetched_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index feed_items_kind on public.feed_items (kind, hidden, pinned desc, date desc);
alter table public.feed_items enable row level security;
create policy "read feed" on public.feed_items for select using (not hidden or public.can('news.edit'));
create policy "edit feed" on public.feed_items for all to authenticated using (public.can('news.edit')) with check (public.can('news.edit'));
create trigger keep_revision before update or delete on public.feed_items for each row execute function public.keep_revision();

-- EWU newsletters (ewubd.edu/newsletters): new issues show up for admins to import alumni stories from.
create table public.newsletter_issues (
  url text primary key check (url ~ '^https://(www\.)?ewubd\.edu/'),
  title text not null, image text not null default '', date date,
  status text not null default 'new' check (status in ('new', 'imported', 'ignored')),
  found_at timestamptz not null default now()
);
alter table public.newsletter_issues enable row level security;
create policy "admins read issues" on public.newsletter_issues for select to authenticated using (public.can('alumni.review'));
create policy "admins update issues" on public.newsletter_issues for update to authenticated using (public.can('alumni.review')) with check (public.can('alumni.review'));

-- Alumni: newsletter stories live in the same table as submitted profiles, so admins edit everything in one place.
alter table public.alumni_profiles alter column user_id drop not null;
alter table public.alumni_profiles alter column user_id drop default;
alter table public.alumni_profiles alter column user_id set default auth.uid();
alter table public.alumni_profiles add column if not exists source text not null default 'user' check (source in ('user', 'newsletter', 'admin'));
alter table public.alumni_profiles add column if not exists source_url text not null default '' check (source_url = '' or source_url ~ '^https://');
alter table public.alumni_profiles add column if not exists kind text not null default 'job' check (kind in ('job', 'study', 'award'));
alter table public.alumni_profiles drop constraint if exists alumni_profiles_note_check;
alter table public.alumni_profiles add constraint alumni_profiles_note_check check (length(note) <= 400);
drop policy if exists "submit own profile" on public.alumni_profiles;
create policy "submit own profile" on public.alumni_profiles for insert to authenticated with check (auth.uid() = user_id and status = 'pending' and source = 'user');
create policy "admins add alumni" on public.alumni_profiles for insert to authenticated with check (public.can('alumni.review') and user_id is null and source in ('newsletter', 'admin'));
create trigger keep_revision before update or delete on public.alumni_profiles for each row execute function public.keep_revision();

-- ── Scheduled jobs (api/cron.js) ──
create table public.job_runs (
  id bigint generated always as identity primary key,
  job text not null, ok boolean not null, detail text not null default '', ms int not null default 0,
  trigger text not null default 'schedule', started_at timestamptz not null default now()
);
alter table public.job_runs enable row level security;
create policy "admins read jobs" on public.job_runs for select to authenticated using (public.is_admin());

-- ── Cookie-free analytics (api/track.js): visitor = daily-salted hash, never the IP ──
create table public.page_views (
  id bigint generated always as identity primary key,
  day date not null default current_date,
  path text not null check (length(path) <= 120),
  source text not null default 'direct' check (source in ('direct', 'search', 'social', 'email', 'other', 'app')),
  device text not null default 'desktop' check (device in ('phone', 'tablet', 'desktop')),
  visitor text not null check (length(visitor) = 32),
  slot int not null,                                   -- half-hour slot: one view per visitor+page+slot
  created_at timestamptz not null default now(),
  unique (visitor, path, slot)
);
create index page_views_day on public.page_views (day);
alter table public.page_views enable row level security;
create or replace function public.admin_analytics(days int default 30) returns json
language plpgsql stable security definer set search_path = public as $$
declare d int := least(greatest(days, 7), 365);
begin
  if not public.can('analytics.view') then raise exception 'You don''t have permission to see analytics'; end if;
  return json_build_object(
    'views', (select count(*) from page_views where day > current_date - d),
    'visitors', (select count(distinct visitor) from page_views where day > current_date - d),
    'views_prev', (select count(*) from page_views where day <= current_date - d and day > current_date - 2 * d),
    'visitors_prev', (select count(distinct visitor) from page_views where day <= current_date - d and day > current_date - 2 * d),
    'daily', (select coalesce(json_agg(json_build_object('day', g::date, 'n', (select count(*) from page_views v where v.day = g::date)) order by g), '[]')
              from generate_series(current_date - (d - 1), current_date, interval '1 day') g),
    'pages', (select coalesce(json_agg(t), '[]') from (select path, count(*) n from page_views where day > current_date - d group by path order by n desc limit 12) t),
    'sources', (select coalesce(json_agg(t), '[]') from (select source, count(*) n from page_views where day > current_date - d group by source order by n desc) t),
    'devices', (select coalesce(json_agg(t), '[]') from (select device, count(*) n from page_views where day > current_date - d group by device order by n desc) t));
end $$;
revoke execute on function public.admin_analytics(int) from public, anon; grant execute on function public.admin_analytics(int) to authenticated;
