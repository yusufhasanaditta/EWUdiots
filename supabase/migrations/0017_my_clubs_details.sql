-- EWUdiots 0017: my_clubs() also returns each club's name, slug, short name, colour and logo, so the app can show
-- "Your clubs" (sidebar, My clubs) without loading the whole directory first.
drop function if exists public.my_clubs();
create function public.my_clubs() returns table (club_id uuid, status text, rank int, role_name text, perms text[], title text, wing text, name text, slug text, short_name text, color text, logo_url text, verified boolean)
language sql stable security definer set search_path = public as $$
  select m.club_id, m.status, r.rank, r.name, r.perms, m.title, m.wing, k.name, k.slug, k.short_name, k.color, k.logo_url, k.verified
  from public.club_members m join public.club_roles r on r.id = m.role_id join public.clubs k on k.id = m.club_id
  where m.user_id = auth.uid() and m.status <> 'removed' and k.status in ('active', 'suspended');
$$;
revoke execute on function public.my_clubs() from public, anon; grant execute on function public.my_clubs() to authenticated;
