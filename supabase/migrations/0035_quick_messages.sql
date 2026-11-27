-- v2.39 quick messages: a short, private student <-> staff chat that keeps only the last 5 days. Separate from the
-- help desk (support_tickets), which keeps full history. Old messages are pruned by purge_quick_messages().

create table public.quick_messages (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(), -- the student whose thread this is
  from_staff boolean not null default false,
  body text not null check (length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index quick_messages_user_idx on public.quick_messages (user_id, created_at);
alter table public.quick_messages enable row level security;
grant select, insert, delete on public.quick_messages to authenticated;

-- A student sees only their own thread; staff who manage support see every thread.
create policy "read my quick messages" on public.quick_messages for select to authenticated
  using (user_id = auth.uid() or public.can('support.manage'));
-- A student writes as themselves and never as staff; staff write a reply into a student's thread.
create policy "write quick messages" on public.quick_messages for insert to authenticated
  with check (
    (user_id = auth.uid() and from_staff = false)
    or (public.can('support.manage') and from_staff = true)
  );
-- Only staff remove messages (the purge function below runs as owner, so students never need delete).
create policy "staff delete quick messages" on public.quick_messages for delete to authenticated
  using (public.can('support.manage'));

-- Keep only the last 5 days. Security definer so any caller can prune, but it only ever deletes rows past 5 days.
create or replace function public.purge_quick_messages() returns void
  language sql security definer set search_path = public as $$
  delete from public.quick_messages where created_at < now() - interval '5 days';
$$;
grant execute on function public.purge_quick_messages() to authenticated;

-- Optional, if pg_cron is enabled, prune hourly even without app traffic:
--   select cron.schedule('purge-quick-messages', '0 * * * *', $$select public.purge_quick_messages()$$);
