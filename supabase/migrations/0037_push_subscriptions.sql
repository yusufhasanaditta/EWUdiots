-- v2.40 background push: each device's push subscription. Web uses the Web Push standard (endpoint + keys); Android
-- (later, via FCM) stores its token as the endpoint. The send path runs server-side with the service key, so no one
-- but the owner needs row access here.

create table public.push_subscriptions (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  kind text not null default 'web' check (kind in ('web', 'android')),
  endpoint text not null,                 -- web: the push service URL; android: the FCM registration token
  keys jsonb not null default '{}',       -- web: { p256dh, auth }
  created_at timestamptz not null default now(),
  unique (user_id, endpoint)
);
create index push_subscriptions_user_idx on public.push_subscriptions (user_id);
alter table public.push_subscriptions enable row level security;
grant select, insert, update, delete on public.push_subscriptions to authenticated;

-- A device manages only its owner's subscriptions. The server reads them with the service key to send.
create policy "my push subscriptions" on public.push_subscriptions for select to authenticated using (user_id = auth.uid());
create policy "add my push subscription" on public.push_subscriptions for insert to authenticated with check (user_id = auth.uid());
create policy "update my push subscription" on public.push_subscriptions for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "remove my push subscription" on public.push_subscriptions for delete to authenticated using (user_id = auth.uid());
