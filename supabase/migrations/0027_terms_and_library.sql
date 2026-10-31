-- v2.16: past committees can be added by hand, and admins verify shared study materials.

-- Club Admins (settings.edit) and platform club managers can add a past committee to History by hand (until now only
-- the handover could create one; update/delete policies already exist).
drop policy if exists "add terms" on public.club_terms;
create policy "add terms" on public.club_terms for insert to authenticated with check (public.club_can(club_id, 'settings.edit'));

-- Study Library: a "verified" badge given by moderators (reports.handle), shown to everyone. The uploader can't set it:
-- the guard keeps it unchanged unless a moderator is updating.
alter table public.resources add column if not exists verified boolean not null default false;
alter table public.resources add column if not exists verified_at timestamptz;
create or replace function public.guard_resource_verified() returns trigger
language plpgsql set search_path = public as $$
begin
  if (new.verified is distinct from old.verified) and not (public.is_admin() or public.can('reports.handle')) and current_user = 'authenticated' then
    new.verified := old.verified; new.verified_at := old.verified_at;
  elsif new.verified is distinct from old.verified then
    new.verified_at := case when new.verified then now() else null end;
  end if;
  return new;
end $$;
drop trigger if exists guard_resource_verified on public.resources;
create trigger guard_resource_verified before update on public.resources for each row execute function public.guard_resource_verified();
create or replace function public.guard_resource_verified_ins() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.verified and not (public.is_admin() or public.can('reports.handle')) and current_user = 'authenticated' then new.verified := false; new.verified_at := null; end if;
  return new;
end $$;
drop trigger if exists guard_resource_verified_ins on public.resources;
create trigger guard_resource_verified_ins before insert on public.resources for each row execute function public.guard_resource_verified_ins();

drop view if exists public.resources_ranked;
create view public.resources_ranked with (security_invoker = true) as
  select r.id, r.course, r.type, r.title, r.file_path, r.size_bytes, r.created_at, (r.user_id = auth.uid()) as mine,
         r.faculty, r.section, r.semester, r.topic, r.description, r.link, r.source, r.uploader_name, r.uploader_role, r.ext_id, r.visibility, r.verified,
         (select count(*) from public.resource_votes v where v.resource_id = r.id) as votes
  from public.resources r where r.status = 'published';
grant select on public.resources_ranked to anon, authenticated;
