-- v2.10: students can create an account with just their EWU student email (password + emailed code) and verify it
-- later with their ID card. "Verified" lives in app_metadata (only the server can write it) and is set by
-- verify_my_card() only when both card photos are in the student's private folder and the card's ID is the account's ID.
-- Admins with users.manage can look at the card photos to double-check, and take the badge away.

create or replace function public.verify_my_card(card_id text) returns boolean
language plpgsql security definer set search_path = public, auth, storage as $$
declare uid uuid := auth.uid(); mail text;
begin
  if uid is null then raise exception 'Sign in first'; end if;
  select lower(email) into mail from auth.users where id = uid;
  if mail !~ '^[0-9]{4}-[0-9]-[0-9]{2}-[0-9]{3}@std\.ewubd\.edu$' then raise exception 'Only student accounts verify with an ID card'; end if;
  if split_part(mail, '@', 1) <> lower(trim(card_id)) then raise exception 'This card belongs to a different student ID (%). Use your own card.', trim(card_id); end if;
  if (select count(*) from storage.objects where bucket_id = 'idcards' and name in (uid::text || '/front.jpg', uid::text || '/back.jpg')) < 2 then
    raise exception 'Upload both sides of your card first';
  end if;
  update auth.users set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('card_verified', true, 'card_verified_at', now())
    where id = uid;
  return true;
end $$;
revoke execute on function public.verify_my_card(text) from public, anon; grant execute on function public.verify_my_card(text) to authenticated;

create or replace function public.admin_set_card_verified(uid uuid, verified boolean) returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  if not public.can('users.manage') then raise exception 'Not allowed'; end if;
  update auth.users set raw_app_meta_data = case when verified
      then coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('card_verified', true, 'card_verified_at', now())
      else coalesce(raw_app_meta_data, '{}'::jsonb) - 'card_verified' - 'card_verified_at' end
    where id = uid;
  insert into public.admin_log (email, action, target) values (lower(auth.jwt() ->> 'email'), case when verified then 'Verified student card' else 'Removed card verification' end, uid::text);
end $$;
revoke execute on function public.admin_set_card_verified(uuid, boolean) from public, anon; grant execute on function public.admin_set_card_verified(uuid, boolean) to authenticated;

-- Admin list shows who is verified.
drop function if exists public.admin_users(text, int);
create function public.admin_users(q text default '', lim int default 200)
returns table (id uuid, email text, role text, name text, created_at timestamptz, last_sign_in_at timestamptz, confirmed boolean, suspended boolean, card_verified boolean)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  return query select u.id, u.email::text, coalesce(u.raw_app_meta_data ->> 'role', ''), coalesce(u.raw_user_meta_data ->> 'name', ''),
    u.created_at, u.last_sign_in_at, u.email_confirmed_at is not null, coalesce(u.banned_until > now(), false), coalesce((u.raw_app_meta_data ->> 'card_verified')::boolean, false)
  from auth.users u
  where q = '' or u.email ilike '%' || q || '%' or coalesce(u.raw_user_meta_data ->> 'name', '') ilike '%' || q || '%'
  order by u.created_at desc limit least(greatest(lim, 1), 1000);
end $$;
revoke execute on function public.admin_users(text, int) from public, anon; grant execute on function public.admin_users(text, int) to authenticated;

create policy "idcards admins review" on storage.objects for select to authenticated
  using (bucket_id = 'idcards' and public.can('users.manage'));
