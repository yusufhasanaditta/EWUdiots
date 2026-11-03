-- Security hardening (v2.25). Least privilege on top of Row Level Security, so one missed policy can't become a leak.

-- 1. TRUNCATE ignores RLS, and TRIGGER / REFERENCES are never needed by app users. Remove them everywhere.
revoke truncate, trigger, references on all tables in schema public from anon, authenticated;
-- 2. Signed-out visitors never write: no policy lets them, and now no grant does either.
revoke insert, update, delete on all tables in schema public from anon;
-- 3. Same rules for tables created by future migrations.
alter default privileges for role postgres in schema public revoke truncate, trigger, references on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke insert, update, delete on tables from anon;

-- 4. Moderators may hide or edit comments, but not move them to another club or post, or change their author.
drop policy if exists "moderate comments" on public.club_comments;
create policy "moderate comments" on public.club_comments for update to authenticated
  using (public.club_can(club_id, 'comments.moderate') or public.can('clubs.moderate'))
  with check (public.club_can(club_id, 'comments.moderate') or public.can('clubs.moderate'));
create or replace function public.club_comment_frozen() returns trigger language plpgsql set search_path = public as $$
begin
  if new.club_id is distinct from old.club_id or new.post_id is distinct from old.post_id or new.user_id is distinct from old.user_id then
    raise exception 'A comment''s club, post and author can''t be changed';
  end if;
  return new;
end $$;
drop trigger if exists club_comment_frozen on public.club_comments;
create trigger club_comment_frozen before update on public.club_comments for each row execute function public.club_comment_frozen();

-- 5. Crowd-sourced faculty and sections (filled by every student's portal sync): remember who changed a row last,
--    never let an update blank out a value that is already known, and cap text lengths.
alter table public.faculty add column if not exists updated_by uuid references auth.users (id) on delete set null;
alter table public.sections add column if not exists updated_by uuid references auth.users (id) on delete set null;
create or replace function public.crowd_keep_filled() returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_by := auth.uid();
  new.updated_at := now();
  if tg_op = 'UPDATE' then
    if tg_table_name = 'faculty' then
      new.name := coalesce(nullif(new.name, ''), old.name); new.email := coalesce(nullif(new.email, ''), old.email);
      new.dept := coalesce(nullif(new.dept, ''), old.dept); new.room := coalesce(nullif(new.room, ''), old.room);
      new.hours := coalesce(nullif(new.hours, ''), old.hours);
    else
      new.title := coalesce(nullif(new.title, ''), old.title); new.room := coalesce(nullif(new.room, ''), old.room);
      new.faculty := coalesce(nullif(new.faculty, ''), old.faculty);
      new.credits := coalesce(new.credits, old.credits); new.capacity := coalesce(new.capacity, old.capacity);
    end if;
  end if;
  return new;
end $$;
drop trigger if exists faculty_keep_filled on public.faculty;
create trigger faculty_keep_filled before insert or update on public.faculty for each row execute function public.crowd_keep_filled();
drop trigger if exists sections_keep_filled on public.sections;
create trigger sections_keep_filled before insert or update on public.sections for each row execute function public.crowd_keep_filled();
alter table public.faculty drop constraint if exists faculty_lengths;
alter table public.faculty add constraint faculty_lengths check (length(name) <= 120 and length(dept) <= 60 and length(room) <= 40 and length(hours) <= 200);
alter table public.sections drop constraint if exists sections_lengths;
alter table public.sections add constraint sections_lengths check (length(title) <= 160 and length(room) <= 40 and length(faculty) <= 20 and length(sec) <= 10
  and coalesce(enrolled, 0) between 0 and 2000 and coalesce(capacity, 0) between 0 and 2000);
