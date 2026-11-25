-- Offered courses per semester (EWU's "faculty list": every section, faculty, seats, time and room), refreshed every
-- 30 minutes from ewucoursetracker.live by /api/cron?job=courses. Anyone can read it; only the service role writes.
create table if not exists public.offered_lists (
  sem text primary key check (sem ~ '^(Spring|Summer|Fall)-[0-9]{4}$'),
  data jsonb not null,
  source text not null default 'ewucoursetracker.live',
  snapshot_id text not null default '',
  courses int not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.offered_lists enable row level security;
drop policy if exists "anyone reads offered lists" on public.offered_lists;
create policy "anyone reads offered lists" on public.offered_lists for select to anon, authenticated using (true);
revoke all on public.offered_lists from anon, authenticated;
grant select on public.offered_lists to anon, authenticated;
