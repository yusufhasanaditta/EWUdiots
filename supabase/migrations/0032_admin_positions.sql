-- App Admin (the EWUdiots team, can('clubs.manage')) can put anyone in any position of any club, including
-- Faculty Moderator (rank 1), and take them out again. Club members keep the old rules (only roles below their own).

-- Rank 1 roles (Faculty Moderator) are assignable by the App Admin only.
create or replace function public.club_may_assign(c uuid, rid uuid) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare r public.club_roles; mine int := public.club_rank(c); my public.club_roles := public.club_role_row(c);
begin
  select * into r from public.club_roles where id = rid and club_id = c;
  if r.id is null then return false; end if;
  if public.can('clubs.manage') then return true; end if;
  if r.rank < 2 then return false; end if;
  if mine = 1 then return true; end if;
  if r.rank < mine or (r.rank = mine and mine > 2) then return false; end if;
  return '*' = any (my.perms) or (my.perms @> r.perms and not ('*' = any (r.perms)));
end $$;
revoke execute on function public.club_may_assign(uuid, uuid) from public, anon, authenticated;

-- Put a person (student ID or email) in a position. Existing accounts join or move straight away; people without an
-- account get an invite that is claimed when they sign up. Returns 'added' or 'invited'.
create or replace function public.admin_set_club_position(c uuid, who text, rid uuid) returns text
language plpgsql security definer set search_path = public as $$
declare u auth.users; e text := lower(trim(coalesce(who, ''))); r public.club_roles;
begin
  if not public.can('clubs.manage') then raise exception 'Only the EWUdiots team can do this'; end if;
  select * into r from public.club_roles where id = rid and club_id = c;
  if r.id is null then raise exception 'Pick a position from this club'; end if;
  if e ~ '^\d{4}-\d-\d{2}-\d{3}$' then e := e || '@std.ewubd.edu'; end if;
  if e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(e) > 200 then raise exception 'Enter a student ID like 2024-1-60-123 or an email'; end if;
  select * into u from auth.users where lower(email) = e;
  if u.id is null then
    insert into public.club_invites (club_id, email, rank, role_id) values (c, e, r.rank, r.id)
    on conflict (club_id, email) do update set rank = excluded.rank, role_id = excluded.role_id, status = 'pending', invited_by = auth.uid(), created_at = now(), expires_at = now() + interval '60 days';
    perform public.club_log(c, 'position.invited', jsonb_build_object('email', e, 'role', r.name));
    return 'invited';
  end if;
  perform public.club_add_member(c, u.id, r.rank, coalesce(u.raw_user_meta_data ->> 'name', split_part(e, '@', 1)), e, coalesce(substring(e from '^(\d{4}-\d-\d{2}-\d{3})@'), ''), '', auth.uid());
  update public.club_members set role_id = r.id, status = 'active' where club_id = c and user_id = u.id;
  perform public.club_alert(u.id, c, 'other', 'Your position changed', 'The EWUdiots team made you ' || r.name || ' in ' || (select name from public.clubs where id = c), '#/club/space?c=' || c);
  perform public.club_log(c, 'position.set', jsonb_build_object('email', e, 'role', r.name));
  if r.rank <= 2 then update public.clubs set status = 'active', verified = true where id = c and status in ('unclaimed', 'pending'); end if;
  return 'added';
end $$;
revoke execute on function public.admin_set_club_position(uuid, text, uuid) from public, anon;
grant execute on function public.admin_set_club_position(uuid, text, uuid) to authenticated;
