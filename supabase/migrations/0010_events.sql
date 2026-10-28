-- v2.9: campus events. Students, teachers and alumni suggest events (workshops, concerts, club recruitment, club events…);
-- they stay "pending" until an admin with events.review approves them. Official ewubd.edu events arrive by themselves
-- (api/cron.js → source 'auto', already approved), and admins can add their own.

create table public.events (
  id uuid primary key default gen_random_uuid(),
  ext_id text unique, -- 'ewu:<slug>' for events read from ewubd.edu/events
  title text not null check (length(title) between 3 and 160),
  kind text not null default 'other' check (kind in ('workshop', 'seminar', 'concert', 'cultural', 'club_recruitment', 'club_event', 'competition', 'fair', 'sports', 'other')),
  starts_at timestamptz not null,
  all_day boolean not null default false,
  ends_at timestamptz check (ends_at is null or ends_at >= starts_at),
  venue text not null default '' check (length(venue) <= 160),
  organizer text not null default '' check (length(organizer) <= 120),
  description text not null default '' check (length(description) <= 3000),
  link text not null default '' check (link = '' or link ~ '^https://'),
  image text not null default '' check (image = '' or image ~ '^https://'),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  review_note text not null default '' check (length(review_note) <= 300),
  source text not null default 'user' check (source in ('user', 'admin', 'auto')),
  pinned boolean not null default false,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  author_name text not null default '' check (length(author_name) <= 80),
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create index events_list on public.events (status, starts_at);
alter table public.events enable row level security;

update public.role_permissions set perms = array_append(perms, 'events.review') where role in ('admin', 'editor', 'moderator') and not ('events.review' = any (perms));

create or replace function public.daily_limit(tbl text, col text, lim int) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare n int;
begin
  if tbl not in ('blog_posts', 'mentor_requests', 'job_posts', 'consult_requests', 'course_notices', 'events') or col not in ('author_id', 'student_id', 'teacher_id', 'created_by') then raise exception 'Not allowed'; end if;
  execute format('select count(*) from public.%I where %I = auth.uid() and created_at > now() - interval ''1 day''', tbl, col) into n;
  return n < lim;
end $$;

-- Everyone (signed out too) sees approved events; posters see their own; reviewers see everything.
create policy "read events" on public.events for select using (status = 'approved' or created_by = auth.uid() or public.can('events.review'));
create policy "suggest events" on public.events for insert to authenticated
  with check (created_by = auth.uid() and status = 'pending' and source = 'user' and not pinned and ext_id is null
    and public.my_role() in ('student', 'faculty', 'alumni') and public.daily_limit('events', 'created_by', 3));
create policy "admins add events" on public.events for insert to authenticated with check (public.can('events.review') and source = 'admin');
-- A poster can fix a suggestion while it waits; it stays pending.
create policy "edit own pending event" on public.events for update to authenticated
  using (created_by = auth.uid() and status = 'pending') with check (created_by = auth.uid() and status = 'pending' and source = 'user' and not pinned);
create policy "review events" on public.events for update to authenticated using (public.can('events.review')) with check (public.can('events.review'));
create policy "delete events" on public.events for delete to authenticated using (created_by = auth.uid() or public.can('events.review'));

-- Reviews are stamped, and the poster gets a message in their app inbox.
create or replace function public.event_reviewed() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status and new.status in ('approved', 'rejected') then
    new.reviewed_by := auth.uid(); new.reviewed_at := now();
    if new.created_by is not null and new.source = 'user' then
      insert into public.user_messages (user_id, title, body, link, created_by) values (new.created_by,
        case when new.status = 'approved' then 'Your event is live' else 'Your event wasn''t approved' end,
        left(new.title || case when new.review_note <> '' then ' — ' || new.review_note else '' end, 2000), '#/events', auth.uid());
    end if;
  end if;
  return new;
end $$;
revoke execute on function public.event_reviewed() from public, anon, authenticated;
create trigger event_reviewed before update on public.events for each row execute function public.event_reviewed();
create trigger keep_revision before update or delete on public.events for each row execute function public.keep_revision();
