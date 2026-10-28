-- Fix: keep_revision() read old.key / old.id directly, and PL/pgSQL fails on a field the row doesn't have
-- ("record old has no field key"), so admin edits of posts, feed items, alumni and events were refused.
-- Read the key through jsonb instead, which works for every table.
create or replace function public.keep_revision() returns trigger language plpgsql security definer set search_path = public as $$
declare o jsonb := to_jsonb(old);
begin
  -- The daily feed refresh rewrites rows; only real edits are worth a revision.
  if tg_op = 'UPDATE' and (to_jsonb(new) - 'fetched_at' - 'updated_at') = (o - 'fetched_at' - 'updated_at') then return new; end if;
  insert into public.revisions (table_name, row_key, data) values (tg_table_name, coalesce(o ->> 'key', o ->> 'id', o ->> 'slug', ''), o);
  return coalesce(new, old);
end $$;
revoke execute on function public.keep_revision() from public, anon, authenticated;

-- Events (0010) keep revisions too.
alter table public.revisions drop constraint if exists revisions_table_name_check;
alter table public.revisions add constraint revisions_table_name_check check (table_name in ('posts', 'site_settings', 'alumni_profiles', 'feed_items', 'events'));
