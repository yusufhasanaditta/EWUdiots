-- v2.40 course groups: one group chat per course section per semester. The app adds a student to the groups for the
-- sections in their synced routine, and removes them when a course is dropped or withdrawn. Admins can remove anyone.

create table public.course_groups (
  id bigint generated always as identity primary key,
  code text not null check (code ~ '^[A-Z]{2,4}[0-9]{3,4}[A-Z]?$'),
  section text not null default '' check (length(section) <= 6),
  semester text not null check (semester ~ '^(Spring|Summer|Fall)-[0-9]{4}$'),
  created_at timestamptz not null default now(),
  unique (code, section, semester)
);
create table public.course_group_members (
  group_id bigint not null references public.course_groups (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create table public.course_group_messages (
  id bigint generated always as identity primary key,
  group_id bigint not null references public.course_groups (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  body text not null check (length(btrim(body)) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index course_group_messages_idx on public.course_group_messages (group_id, created_at);
create index course_group_members_user_idx on public.course_group_members (user_id);

alter table public.course_groups enable row level security;
alter table public.course_group_members enable row level security;
alter table public.course_group_messages enable row level security;
grant select, insert, delete on public.course_groups to authenticated;
grant select, insert, delete on public.course_group_members to authenticated;
grant select, insert, delete on public.course_group_messages to authenticated;

-- Membership check as owner, so the members/messages policies never recurse into their own table.
create or replace function public.in_course_group(gid bigint) returns boolean
  language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.course_group_members where group_id = gid and user_id = auth.uid());
$$;
grant execute on function public.in_course_group(bigint) to authenticated;

-- Groups are just course identifiers: any signed-in user may look one up or create it on demand; only staff delete.
create policy "read course groups" on public.course_groups for select to authenticated using (true);
create policy "create course groups" on public.course_groups for insert to authenticated with check (true);
create policy "staff delete course groups" on public.course_groups for delete to authenticated using (public.is_admin());

-- A student joins only as themselves; a member sees co-members; a student leaves themselves, an admin removes anyone.
create policy "see my groups' members" on public.course_group_members for select to authenticated
  using (user_id = auth.uid() or public.in_course_group(group_id) or public.is_admin());
create policy "join a group myself" on public.course_group_members for insert to authenticated
  with check (user_id = auth.uid());
create policy "leave or be removed" on public.course_group_members for delete to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- Only members read and post in a group; a message is always authored by the poster.
create policy "read group messages" on public.course_group_messages for select to authenticated
  using (public.in_course_group(group_id) or public.is_admin());
create policy "post to my groups" on public.course_group_messages for insert to authenticated
  with check (user_id = auth.uid() and public.in_course_group(group_id));
create policy "staff delete group messages" on public.course_group_messages for delete to authenticated
  using (public.is_admin());
