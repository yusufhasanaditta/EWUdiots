-- v2.11: Google Classroom import. Each imported post/assignment keeps its Classroom id so it is never added twice.
alter table public.resources add column if not exists ext_id text unique check (ext_id is null or ext_id ~ '^gc:[0-9A-Za-z_:-]{1,120}$');
drop view if exists public.resources_ranked;
create view public.resources_ranked with (security_invoker = true) as
  select r.id, r.course, r.type, r.title, r.file_path, r.size_bytes, r.created_at, (r.user_id = auth.uid()) as mine,
         r.faculty, r.section, r.semester, r.topic, r.description, r.link, r.source, r.uploader_name, r.uploader_role, r.ext_id,
         (select count(*) from public.resource_votes v where v.resource_id = r.id) as votes
  from public.resources r where r.status = 'published';
grant select on public.resources_ranked to anon, authenticated;

-- Imports can be large (a whole semester's posts), so they get their own daily cap.
drop policy if exists "import classroom" on public.resources;
create policy "import classroom" on public.resources for insert to authenticated
  with check (auth.uid() = user_id and status = 'published' and source = 'classroom' and ext_id is not null and public.daily_limit('resources', 'user_id', 600));
