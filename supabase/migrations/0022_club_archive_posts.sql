-- EWUdiots 0022: news and events imported from the EWU club site (source_url set) are public history, so they show on
-- a club's profile even before the club is claimed on EWUdiots. Everything else is unchanged from 0016.
create or replace function public.can_see_post(p public.club_posts) returns boolean
language sql stable security definer set search_path = public as $$
  select public.can('clubs.moderate') or p.author_id = auth.uid()
  or (p.source_url <> '' and p.status = 'published' and p.visibility = 'public'
      and exists (select 1 from public.clubs k where k.id = p.club_id and k.status in ('unclaimed', 'active')))
  or (
    exists (select 1 from public.clubs k where k.id = p.club_id and k.status = 'active')
    and (p.status = 'published' or (p.status = 'draft' and public.club_can(p.club_id, 'posts.write')))
    and (
      p.visibility = 'public'
      or (p.visibility = 'members' and public.is_club_member(p.club_id))
      or (p.visibility = 'exec' and public.club_rank(p.club_id) <= 3)
      or (p.visibility = 'wing' and (public.club_rank(p.club_id) <= 3 or exists (select 1 from public.club_members m where m.club_id = p.club_id and m.user_id = auth.uid() and m.status = 'active' and m.wing = p.wing)))));
$$;
