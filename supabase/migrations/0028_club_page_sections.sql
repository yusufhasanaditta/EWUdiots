-- v2.17: the club president decides which sections visitors see, and committee photos show on the public page.

-- Sections hidden from non-members, e.g. {"gallery": false, "events": false}. Missing keys mean "shown".
alter table public.clubs add column if not exists public_sections jsonb not null default '{}'::jsonb check (jsonb_typeof(public_sections) = 'object');

create or replace function public.club_sections_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and new.public_sections is distinct from old.public_sections
     and not public.club_can(new.id, 'settings.edit') and not public.can('clubs.manage') then
    raise exception 'Only the club''s president or admin can choose what visitors see';
  end if;
  return new;
end $$;
revoke execute on function public.club_sections_guard() from public, anon, authenticated;
drop trigger if exists club_sections_guard on public.clubs;
create trigger club_sections_guard before update on public.clubs for each row execute function public.club_sections_guard();

-- Executives are the club's public face: their photo shows unless they chose "private" (it was hidden for the default
-- "members" setting, so committee cards showed only initials). Socials still need "public".
create or replace function public.club_committee(c uuid) returns table (user_id uuid, display_name text, title text, role_name text, role_color text, rank int, wing text, department text, photo_url text, socials jsonb)
language sql stable security definer set search_path = public as $$
  select m.user_id, m.display_name, m.title, r.name, r.color, r.rank, m.wing, m.department,
    case when m.visibility <> 'private' then m.photo_url else '' end, case when m.visibility = 'public' then m.socials else '{}'::jsonb end
  from public.club_members m join public.club_roles r on r.id = m.role_id join public.clubs k on k.id = m.club_id
  where m.club_id = c and m.status = 'active' and r.rank between 1 and 4 and k.status = 'active' order by r.rank, r.sort, m.joined_at;
$$;

-- At EWU a club's moderator is a faculty member: the top position is "Faculty Moderator", and the student content role
-- is now "Community Lead" so the two are never confused.
update public.club_role_template set name = 'Faculty Moderator' where name = 'Faculty Advisor';
update public.club_role_template set name = 'Community Lead', description = 'Keeps chats and posts friendly' where name = 'Moderator';
update public.club_roles set name = 'Faculty Moderator' where name = 'Faculty Advisor';
update public.club_roles set name = 'Community Lead' where name = 'Moderator';
