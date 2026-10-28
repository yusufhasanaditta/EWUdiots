-- EWUdiots 0009: teachers sign up only with their EWU university email; blog for students, teachers and alumni;
-- alumni mentorship and a jobs/internships board; teachers' office hours, consultation requests and course announcements.

-- ── Who may sign up ── Students: <id>@std.ewubd.edu. Teachers: name@ewubd.edu (their university mail). Alumni: a personal
-- email. Every account still proves its email with a 6-digit code before it can be used.
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
  if e ~ '^[a-z0-9._%+-]+@ewubd\.edu$' then
    new.raw_app_meta_data := coalesce(new.raw_app_meta_data, '{}'::jsonb) || '{"role":"faculty"}'; return new;
  end if;
  if claimed = 'faculty' then raise exception 'Teachers sign up with their EWU university email (name@ewubd.edu).'; end if;
  if claimed = 'alumni' then
    new.raw_app_meta_data := coalesce(new.raw_app_meta_data, '{}'::jsonb) || '{"role":"alumni"}'; return new;
  end if;
  raise exception 'Students use their EWU student email, teachers their EWU university email, and alumni a personal email.';
end $$;

-- Daily limits so nobody can flood the community features.
create or replace function public.daily_limit(tbl text, col text, lim int) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare n int;
begin
  if tbl not in ('blog_posts', 'mentor_requests', 'job_posts', 'consult_requests', 'course_notices') or col not in ('author_id', 'student_id', 'teacher_id') then raise exception 'Not allowed'; end if;
  execute format('select count(*) from public.%I where %I = auth.uid() and created_at > now() - interval ''1 day''', tbl, col) into n;
  return n < lim;
end $$;
revoke execute on function public.daily_limit(text, text, int) from public, anon; grant execute on function public.daily_limit(text, text, int) to authenticated;

-- ── Blog ──
create table public.blog_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  author_name text not null check (length(author_name) between 2 and 80),
  author_role text not null default public.my_role() check (author_role in ('student', 'faculty', 'alumni', 'admin')),
  title text not null check (length(title) between 5 and 140),
  body text not null check (length(body) between 40 and 20000),
  category text not null default 'tips' check (category in ('tips', 'experience', 'career', 'study', 'campus', 'research', 'other')),
  cover_url text not null default '' check (cover_url = '' or cover_url ~ '^https://'),
  status text not null default 'published' check (status in ('published', 'hidden')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index blog_posts_list on public.blog_posts (status, created_at desc);
alter table public.blog_posts enable row level security;
create policy "read blog" on public.blog_posts for select using (status = 'published' or author_id = auth.uid() or public.can('blog.moderate'));
create policy "write own blog" on public.blog_posts for insert to authenticated
  with check (author_id = auth.uid() and status = 'published' and public.my_role() in ('student', 'faculty', 'alumni') and author_role = public.my_role() and public.daily_limit('blog_posts', 'author_id', 5));
create policy "edit own blog" on public.blog_posts for update to authenticated using (author_id = auth.uid()) with check (author_id = auth.uid() and status = 'published' and author_role = public.my_role());
create policy "delete own blog" on public.blog_posts for delete to authenticated using (author_id = auth.uid() or public.can('blog.moderate'));
create policy "moderate blog" on public.blog_posts for update to authenticated using (public.can('blog.moderate')) with check (public.can('blog.moderate'));
-- "Helpful" claps, one per reader per post.
create table public.blog_claps (post_id uuid not null references public.blog_posts on delete cascade, user_id uuid not null references auth.users on delete cascade default auth.uid(), primary key (post_id, user_id));
alter table public.blog_claps enable row level security;
create policy "read claps" on public.blog_claps for select using (true);
create policy "clap own" on public.blog_claps for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create view public.blog_feed with (security_invoker = true) as
  select p.id, p.author_id, p.author_name, p.author_role, p.title, p.body, p.category, p.cover_url, p.status, p.created_at, p.updated_at,
    (select count(*) from public.blog_claps c where c.post_id = p.id) as claps, (p.author_id = auth.uid()) as mine
  from public.blog_posts p;
grant select on public.blog_feed to anon, authenticated;

-- Blog posts can be reported like reviews and files; three reports hide one until a moderator looks.
alter table public.reports drop constraint if exists reports_target_type_check;
alter table public.reports add constraint reports_target_type_check check (target_type in ('review', 'resource', 'blog'));
create or replace function public.auto_hide_reported() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.reports where target_type = new.target_type and target_id = new.target_id) >= 3 then
    if new.target_type = 'review' then update public.reviews set status = 'hidden' where id = new.target_id;
    elsif new.target_type = 'blog' then update public.blog_posts set status = 'hidden' where id = new.target_id;
    else update public.resources set status = 'hidden' where id = new.target_id; end if;
  end if;
  return new;
end $$;
update public.role_permissions set perms = array_append(perms, 'blog.moderate') where role in ('admin', 'editor', 'moderator') and not ('blog.moderate' = any (perms));

-- ── Alumni: mentorship ──
alter table public.alumni_profiles add column if not exists mentor boolean not null default false;
alter table public.alumni_profiles add column if not exists mentor_topics text not null default '' check (length(mentor_topics) <= 200);
create table public.mentor_requests (
  id bigint generated always as identity primary key,
  student_id uuid not null references auth.users on delete cascade default auth.uid(),
  student_name text not null default '' check (length(student_name) <= 80),
  student_email text not null default lower(auth.jwt() ->> 'email'),
  mentor_profile_id bigint not null references public.alumni_profiles on delete cascade,
  topic text not null check (length(topic) between 3 and 120),
  message text not null check (length(message) between 10 and 1500),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  reply text not null default '' check (length(reply) <= 1500),
  created_at timestamptz not null default now()
);
alter table public.mentor_requests enable row level security;
create policy "ask a mentor" on public.mentor_requests for insert to authenticated
  with check (student_id = auth.uid() and status = 'pending' and reply = '' and student_email = lower(auth.jwt() ->> 'email')
    and exists (select 1 from public.alumni_profiles a where a.id = mentor_profile_id and a.mentor and a.status = 'approved' and a.user_id is not null)
    and public.daily_limit('mentor_requests', 'student_id', 5));
create policy "see own mentor requests" on public.mentor_requests for select to authenticated
  using (student_id = auth.uid() or exists (select 1 from public.alumni_profiles a where a.id = mentor_profile_id and a.user_id = auth.uid()));
create policy "mentor answers" on public.mentor_requests for update to authenticated
  using (exists (select 1 from public.alumni_profiles a where a.id = mentor_profile_id and a.user_id = auth.uid()))
  with check (exists (select 1 from public.alumni_profiles a where a.id = mentor_profile_id and a.user_id = auth.uid()));
create policy "withdraw mentor request" on public.mentor_requests for delete to authenticated using (student_id = auth.uid());
-- An alumnus switches mentoring on or off for their own profile; only those two fields, so the review status can't change.
create or replace function public.set_my_mentoring(on_ boolean, topics text) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  update public.alumni_profiles set mentor = on_, mentor_topics = left(coalesce(topics, ''), 200) where user_id = auth.uid();
  return found;
end $$;
revoke execute on function public.set_my_mentoring(boolean, text) from public, anon; grant execute on function public.set_my_mentoring(boolean, text) to authenticated;

-- ── Jobs & internships (posted by alumni and teachers) ──
create table public.job_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users on delete cascade default auth.uid(),
  author_name text not null check (length(author_name) between 2 and 80),
  author_role text not null default public.my_role(),
  kind text not null default 'job' check (kind in ('job', 'internship', 'research', 'part-time')),
  title text not null check (length(title) between 3 and 120),
  company text not null check (length(company) between 2 and 120),
  location text not null default 'Dhaka' check (length(location) <= 80),
  link text not null default '' check (link = '' or link ~ '^https://'),
  details text not null default '' check (length(details) <= 4000),
  deadline date,
  status text not null default 'open' check (status in ('open', 'closed', 'hidden')),
  created_at timestamptz not null default now()
);
alter table public.job_posts enable row level security;
create policy "read jobs" on public.job_posts for select to authenticated using (status <> 'hidden' or author_id = auth.uid() or public.can('blog.moderate'));
create policy "post jobs" on public.job_posts for insert to authenticated
  with check (author_id = auth.uid() and status = 'open' and public.my_role() in ('alumni', 'faculty') and public.daily_limit('job_posts', 'author_id', 5));
create policy "edit own jobs" on public.job_posts for update to authenticated using (author_id = auth.uid()) with check (author_id = auth.uid() and status in ('open', 'closed'));
create policy "delete own jobs" on public.job_posts for delete to authenticated using (author_id = auth.uid() or public.can('blog.moderate'));
create policy "moderate jobs" on public.job_posts for update to authenticated using (public.can('blog.moderate')) with check (public.can('blog.moderate'));

-- ── Teachers: profile with office hours, consultation requests, course announcements ──
create table public.teacher_profiles (
  user_id uuid primary key references auth.users on delete cascade default auth.uid(),
  name text not null check (length(name) between 2 and 80),
  email text not null default lower(auth.jwt() ->> 'email'),
  init text not null default '' check (init = '' or init ~ '^[A-Z]{2,8}$'),
  dept text not null default '', designation text not null default '', room text not null default '',
  office_hours jsonb not null default '[]',              -- [{ day: 0-6, start: "10:00", end: "12:00" }]
  consult_open boolean not null default true,
  note text not null default '' check (length(note) <= 300),
  updated_at timestamptz not null default now()
);
alter table public.teacher_profiles enable row level security;
create policy "read teachers" on public.teacher_profiles for select using (true);
create policy "teachers own profile" on public.teacher_profiles for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and public.my_role() = 'faculty' and email = lower(auth.jwt() ->> 'email'));
create table public.consult_requests (
  id bigint generated always as identity primary key,
  student_id uuid not null references auth.users on delete cascade default auth.uid(),
  student_name text not null default '' check (length(student_name) <= 80),
  student_email text not null default lower(auth.jwt() ->> 'email'),
  teacher_id uuid not null references public.teacher_profiles (user_id) on delete cascade,
  course text not null default '' check (length(course) <= 12),
  topic text not null check (length(topic) between 3 and 140),
  preferred text not null default '' check (length(preferred) <= 80),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'done')),
  reply text not null default '' check (length(reply) <= 1000),
  created_at timestamptz not null default now()
);
alter table public.consult_requests enable row level security;
create policy "request consultation" on public.consult_requests for insert to authenticated
  with check (student_id = auth.uid() and status = 'pending' and reply = '' and student_email = lower(auth.jwt() ->> 'email') and public.my_role() = 'student'
    and exists (select 1 from public.teacher_profiles t where t.user_id = teacher_id and t.consult_open) and public.daily_limit('consult_requests', 'student_id', 5));
create policy "see consultations" on public.consult_requests for select to authenticated using (student_id = auth.uid() or teacher_id = auth.uid());
create policy "teacher answers" on public.consult_requests for update to authenticated using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());
create policy "withdraw consultation" on public.consult_requests for delete to authenticated using (student_id = auth.uid());
create table public.course_notices (
  id bigint generated always as identity primary key,
  teacher_id uuid not null references public.teacher_profiles (user_id) on delete cascade default auth.uid(),
  teacher_name text not null,
  course text not null check (course ~ '^[A-Z]{2,4}[0-9]{3,4}[A-Z]?$'),
  section text not null default '' check (section ~ '^[0-9]{0,3}$'),
  title text not null check (length(title) between 3 and 140),
  body text not null default '' check (length(body) <= 3000),
  created_at timestamptz not null default now()
);
create index course_notices_course on public.course_notices (course, created_at desc);
alter table public.course_notices enable row level security;
create policy "read course notices" on public.course_notices for select to authenticated using (true);
create policy "teachers post notices" on public.course_notices for insert to authenticated
  with check (teacher_id = auth.uid() and public.my_role() = 'faculty' and public.daily_limit('course_notices', 'teacher_id', 20));
create policy "teachers remove own notices" on public.course_notices for delete to authenticated using (teacher_id = auth.uid() or public.can('blog.moderate'));
