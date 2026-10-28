-- v2.11: course materials. Files in the shared vault now say which teacher, section and semester they're from, the
-- topic/week, who shared them, and can be links (Google Drive, Classroom, YouTube) instead of files. Students see them
-- on the course page (my section / my teacher / all sections) and on each teacher's profile.

alter table public.resources alter column file_path drop not null;
alter table public.resources alter column size_bytes set default 0;
alter table public.resources add column if not exists faculty text not null default '' check (faculty = '' or faculty ~ '^@?[A-Z][A-Z0-9.]{1,30}$');
alter table public.resources add column if not exists section text not null default '' check (length(section) <= 6);
alter table public.resources add column if not exists semester text not null default '' check (semester = '' or semester ~ '^(Spring|Summer|Fall)-[0-9]{4}$');
alter table public.resources add column if not exists topic text not null default '' check (length(topic) <= 80);
alter table public.resources add column if not exists description text not null default '' check (length(description) <= 1000);
alter table public.resources add column if not exists link text not null default '' check (link = '' or link ~ '^https://');
alter table public.resources add column if not exists source text not null default 'upload' check (source in ('upload', 'link', 'classroom'));
alter table public.resources add column if not exists uploader_name text not null default '' check (length(uploader_name) <= 80);
alter table public.resources add column if not exists uploader_role text not null default public.my_role();
alter table public.resources drop constraint if exists resources_type_check;
alter table public.resources add constraint resources_type_check check (type in ('Notes', 'Slides', 'Past paper', 'Solutions', 'Lab', 'Cheat sheet', 'Template',
  'Assignment', 'Question', 'Syllabus', 'Book', 'Video', 'Announcement', 'Other'));
alter table public.resources drop constraint if exists resources_file_or_link;
alter table public.resources add constraint resources_file_or_link check (file_path is not null or link <> '');
create index if not exists resources_course on public.resources (course, faculty, section);

-- Anti-flood: 30 shares a day.
create or replace function public.daily_limit(tbl text, col text, lim int) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare n int;
begin
  if tbl not in ('blog_posts', 'mentor_requests', 'job_posts', 'consult_requests', 'course_notices', 'events', 'resources') or col not in ('author_id', 'student_id', 'teacher_id', 'created_by', 'user_id') then raise exception 'Not allowed'; end if;
  execute format('select count(*) from public.%I where %I = auth.uid() and created_at > now() - interval ''1 day''', tbl, col) into n;
  return n < lim;
end $$;
drop policy if exists "upload own" on public.resources;
create policy "upload own" on public.resources for insert to authenticated
  with check (auth.uid() = user_id and status = 'published' and uploader_role = public.my_role() and public.daily_limit('resources', 'user_id', 30));

drop view if exists public.resources_ranked;
create view public.resources_ranked with (security_invoker = true) as
  select r.id, r.course, r.type, r.title, r.file_path, r.size_bytes, r.created_at, (r.user_id = auth.uid()) as mine,
         r.faculty, r.section, r.semester, r.topic, r.description, r.link, r.source, r.uploader_name, r.uploader_role,
         (select count(*) from public.resource_votes v where v.resource_id = r.id) as votes
  from public.resources r where r.status = 'published';
grant select on public.resources_ranked to anon, authenticated;

-- A few more everyday file types (Word/PowerPoint/PDF/images were already allowed).
update storage.buckets set allowed_mime_types = array['application/pdf', 'image/png', 'image/jpeg', 'image/webp',
  'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/plain', 'application/zip'] where id = 'vault';
