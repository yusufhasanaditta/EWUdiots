-- v2.39 replyable notifications: an admin message can invite replies, and a student's reply is private to that
-- student and to staff who can send messages. Replies never cross between students.

alter table public.user_messages add column if not exists allow_reply boolean not null default false;

create table if not exists public.message_replies (
  id bigint generated always as identity primary key,
  message_id bigint not null references public.user_messages (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  body text not null check (length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists message_replies_message_idx on public.message_replies (message_id, created_at);

alter table public.message_replies enable row level security;
-- Since 0030, new tables grant no DML by default; authenticated needs these (RLS still gates every row).
grant select, insert, delete on public.message_replies to authenticated;

-- A student may reply only to a message that invites replies and is addressed to them (or to everyone),
-- and only as themselves. created_by is forced to the caller.
create policy "reply to my messages" on public.message_replies for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.user_messages m
      where m.id = message_id and m.allow_reply
        and (m.user_id is null or m.user_id = auth.uid())
    )
  );

-- A student reads only their own replies; staff who can send messages read every reply.
create policy "read my replies" on public.message_replies for select to authenticated
  using (user_id = auth.uid() or public.can('messages.send'));

-- Students never edit or delete a reply once sent; staff can remove one.
create policy "staff delete replies" on public.message_replies for delete to authenticated
  using (public.can('messages.send'));
