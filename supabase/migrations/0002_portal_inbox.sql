-- Portal pages sent from the Chrome extension to a student's own account.
-- The app imports them on the next open (after the student reviews them) and deletes the rows.
create table public.portal_inbox (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  pages jsonb not null check (jsonb_typeof(pages) = 'array' and octet_length(pages::text) < 2000000),
  created_at timestamptz not null default now()
);
create index portal_inbox_user on public.portal_inbox (user_id, created_at);
alter table public.portal_inbox enable row level security;
create policy "own inbox" on public.portal_inbox for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
-- Nothing should wait in an inbox for long: rows older than 30 days are removed (needs the pg_cron extension).
-- select cron.schedule('portal-inbox-cleanup', '0 3 * * *', $$delete from public.portal_inbox where created_at < now() - interval '30 days'$$);
