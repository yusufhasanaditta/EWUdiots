-- v2.12: who can see a shared file or link, and moderators can remove reported material for good.
-- visibility: 'everyone' (every signed-in student, the default) or 'private' (only the uploader, e.g. personal notes).

alter table public.resources add column if not exists visibility text not null default 'everyone' check (visibility in ('everyone', 'private'));

drop policy if exists "read published" on public.resources;
create policy "read published" on public.resources for select
  using ((status = 'published' and visibility = 'everyone') or auth.uid() = user_id);

-- Moderators (reports.handle) can delete a reported file or link, and its stored file.
drop policy if exists "moderate delete files" on public.resources;
create policy "moderate delete files" on public.resources for delete to authenticated using (public.can('reports.handle'));
drop policy if exists "vault moderators delete" on storage.objects;
create policy "vault moderators delete" on storage.objects for delete to authenticated using (bucket_id = 'vault' and public.can('reports.handle'));

-- The uploader can change who sees their item (and nothing else about its moderation status).
drop policy if exists "edit own visibility" on public.resources;
create policy "edit own visibility" on public.resources for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Moderators (reports.handle) may hide/restore reviews and files: the status guard used to allow full admins only, so a
-- moderator's "Hide" was silently undone. Everyone else still can't change a status.
create or replace function public.guard_status() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.status is distinct from old.status and not (public.is_admin() or public.can('reports.handle')) and current_user = 'authenticated' then
    new.status := old.status;
  end if;
  return new;
end $$;

-- The ranked view carries visibility, so the app can mark "Only me" items.
drop view if exists public.resources_ranked;
create view public.resources_ranked with (security_invoker = true) as
  select r.id, r.course, r.type, r.title, r.file_path, r.size_bytes, r.created_at, (r.user_id = auth.uid()) as mine,
         r.faculty, r.section, r.semester, r.topic, r.description, r.link, r.source, r.uploader_name, r.uploader_role, r.ext_id, r.visibility,
         (select count(*) from public.resource_votes v where v.resource_id = r.id) as votes
  from public.resources r where r.status = 'published';
grant select on public.resources_ranked to anon, authenticated;
