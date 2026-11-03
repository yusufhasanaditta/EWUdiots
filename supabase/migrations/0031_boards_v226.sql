-- v2.26 boards: full club registration applications (review / revision states), task workspace (review column,
-- labels, attachments, comments) and role access requests.

-- ── Club registration: the application travels with the claim ──
alter table public.club_claims add column if not exists application jsonb not null default '{}'::jsonb;
alter table public.club_claims add column if not exists updated_at timestamptz not null default now();
alter table public.club_claims drop constraint if exists club_claims_application_size;
alter table public.club_claims add constraint club_claims_application_size check (jsonb_typeof(application) = 'object' and length(application::text) <= 20000);
alter table public.club_claims drop constraint if exists club_claims_status_check;
alter table public.club_claims add constraint club_claims_status_check check (status in ('pending', 'review', 'revision', 'approved', 'rejected'));

-- Keep only the keys the form has, as text (or the two lists), so nothing odd is stored.
create or replace function public.club_clean_application(a jsonb) returns jsonb
language sql stable set search_path = public as $$
  select coalesce(jsonb_object_agg(k, case when k in ('committee', 'documents') then
      (select coalesce(jsonb_agg(e), '[]'::jsonb) from (select e from jsonb_array_elements(case when jsonb_typeof(a -> k) = 'array' then a -> k else '[]'::jsonb end) e
        where jsonb_typeof(e) = 'object' and (k <> 'documents' or coalesce(e ->> 'url', '') ~ '^https://') limit 12) x)
    else to_jsonb(left(a ->> k, 1500)) end), '{}'::jsonb)
  from jsonb_object_keys(coalesce(a, '{}'::jsonb)) k
  where k in ('abbr', 'tagline', 'about', 'members', 'advisor', 'email', 'phone', 'departments', 'activities', 'audience', 'frequency', 'start', 'social', 'statement', 'committee', 'documents');
$$;

create or replace function public.club_apply(nm text, cat text, pos text, app jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare cid uuid; a jsonb := public.club_clean_application(app);
begin
  if length(trim(coalesce(nm, ''))) < 3 then raise exception 'Give the club a name (3 letters or more)'; end if;
  if length(coalesce(a ->> 'statement', '')) < 20 then raise exception 'Write a short application statement (20 characters or more)'; end if;
  cid := public.request_club(nm, cat, pos, left(coalesce(a ->> 'about', ''), 1000));
  update public.clubs set short_name = nullif(left(a ->> 'abbr', 20), ''), tagline = nullif(left(a ->> 'tagline', 140), ''), about = nullif(left(a ->> 'about', 1500), ''),
    contact_email = nullif(left(a ->> 'email', 120), ''), advisors = nullif(left(a ->> 'advisor', 200), '') where id = cid;
  update public.club_claims set application = a, updated_at = now() where club_id = cid and user_id = auth.uid();
  return cid;
end $$;

-- The applicant answers a revision request: new details go back to the review queue.
create or replace function public.club_update_application(claim uuid, app jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare r public.club_claims;
begin
  select * into r from public.club_claims where id = claim and user_id = auth.uid();
  if r.id is null then raise exception 'Application not found'; end if;
  if r.status <> 'revision' then raise exception 'You can change the application only when the team asks for changes'; end if;
  update public.club_claims set application = public.club_clean_application(app), status = 'pending', updated_at = now() where id = claim;
end $$;

-- Reviewer steps that don't decide yet: start reviewing, or ask the applicant for changes.
create or replace function public.club_claim_step(claim uuid, st text, note text default '') returns void
language plpgsql security definer set search_path = public as $$
declare r public.club_claims;
begin
  if not public.can('clubs.verify') then raise exception 'You don''t have permission to verify clubs'; end if;
  if st not in ('review', 'revision') then raise exception 'Unknown step'; end if;
  if st = 'revision' and length(trim(coalesce(note, ''))) < 5 then raise exception 'Say what the applicant should change'; end if;
  update public.club_claims set status = st, review_note = left(coalesce(note, ''), 300), updated_at = now() where id = claim and status in ('pending', 'review', 'revision') returning * into r;
  if r.id is null then raise exception 'Application not found or already decided'; end if;
  if st = 'revision' then perform public.club_notify(r.user_id, 'Your club application needs changes', note, '#/club/register'); end if;
end $$;

revoke execute on function public.club_apply(text, text, text, jsonb), public.club_update_application(uuid, jsonb), public.club_claim_step(uuid, text, text) from public, anon;
grant execute on function public.club_apply(text, text, text, jsonb), public.club_update_application(uuid, jsonb), public.club_claim_step(uuid, text, text) to authenticated;
revoke execute on function public.club_clean_application(jsonb) from public, anon;

-- ── Task workspace ──
alter table public.club_tasks drop constraint if exists club_tasks_status_check;
alter table public.club_tasks add constraint club_tasks_status_check check (status in ('todo', 'doing', 'review', 'done'));
alter table public.club_tasks add column if not exists labels text[] not null default '{}';
alter table public.club_tasks add column if not exists attachments jsonb not null default '[]'::jsonb;
alter table public.club_tasks drop constraint if exists club_tasks_labels_ok;
alter table public.club_tasks add constraint club_tasks_labels_ok check (cardinality(labels) <= 8 and length(array_to_string(labels, ',')) <= 300);
alter table public.club_tasks drop constraint if exists club_tasks_attachments_ok;
alter table public.club_tasks add constraint club_tasks_attachments_ok check (jsonb_typeof(attachments) = 'array' and jsonb_array_length(attachments) <= 12 and length(attachments::text) <= 6000);

create table if not exists public.club_task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.club_tasks (id) on delete cascade,
  club_id uuid not null references public.clubs (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  author_name text not null default '' check (length(author_name) <= 80),
  body text not null check (length(trim(body)) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index if not exists club_task_comments_task on public.club_task_comments (task_id, created_at);
alter table public.club_task_comments enable row level security;
create policy "read task comments" on public.club_task_comments for select to authenticated using (public.is_club_member(club_id));
create policy "add task comments" on public.club_task_comments for insert to authenticated
  with check (user_id = auth.uid() and public.is_club_member(club_id) and exists (select 1 from public.club_tasks t where t.id = task_id and t.club_id = club_task_comments.club_id));
create policy "remove task comments" on public.club_task_comments for delete to authenticated using (user_id = auth.uid() or public.club_can(club_id, 'tasks.manage'));
grant select, insert, delete on public.club_task_comments to authenticated;

-- ── Role access requests ("I need Media access") ──
create table if not exists public.club_access_requests (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null default '' check (length(name) <= 80),
  role_id uuid not null references public.club_roles (id) on delete cascade,
  reason text not null default '' check (length(reason) <= 300),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  decided_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index if not exists club_access_requests_open on public.club_access_requests (club_id, user_id) where status = 'pending';
alter table public.club_access_requests enable row level security;
create policy "read access requests" on public.club_access_requests for select to authenticated using (user_id = auth.uid() or public.club_can(club_id, 'members.promote'));
create policy "ask for access" on public.club_access_requests for insert to authenticated
  with check (user_id = auth.uid() and status = 'pending' and decided_by is null and public.is_club_member(club_id)
    and exists (select 1 from public.club_roles r where r.id = role_id and r.club_id = club_access_requests.club_id and r.rank >= 3));
create policy "withdraw access request" on public.club_access_requests for delete to authenticated using (user_id = auth.uid() and status = 'pending');
grant select, insert, delete on public.club_access_requests to authenticated;

-- Approving gives the role through set_member_role, which checks rank and permissions itself.
create or replace function public.club_decide_access(req uuid, approve boolean) returns void
language plpgsql security definer set search_path = public as $$
declare r public.club_access_requests;
begin
  select * into r from public.club_access_requests where id = req and status = 'pending';
  if r.id is null then raise exception 'Request not found or already decided'; end if;
  if not public.club_can(r.club_id, 'members.promote') then raise exception 'You don''t have permission to change roles'; end if;
  if approve then perform public.set_member_role(r.club_id, r.user_id, r.role_id); end if;
  update public.club_access_requests set status = case when approve then 'approved' else 'rejected' end, decided_by = auth.uid() where id = req;
  perform public.club_notify(r.user_id, case when approve then 'Your access request was approved' else 'Your access request wasn''t approved' end, '', '#/club/mine');
end $$;
revoke execute on function public.club_decide_access(uuid, boolean) from public, anon;
grant execute on function public.club_decide_access(uuid, boolean) to authenticated;

-- Task attachments: <club>/tasks/<uploader>/<file> in the private bucket; members read, each member writes their own folder.
drop policy if exists "club task files read" on storage.objects;
drop policy if exists "club task files upload" on storage.objects;
drop policy if exists "club task files delete" on storage.objects;
create policy "club task files read" on storage.objects for select to authenticated
  using (bucket_id = 'clubs-private' and (storage.foldername(name))[2] = 'tasks' and public.is_club_member(public.club_folder(name)));
create policy "club task files upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'clubs-private' and (storage.foldername(name))[2] = 'tasks' and (storage.foldername(name))[3] = auth.uid()::text and public.is_club_member(public.club_folder(name)));
create policy "club task files delete" on storage.objects for delete to authenticated
  using (bucket_id = 'clubs-private' and (storage.foldername(name))[2] = 'tasks' and ((storage.foldername(name))[3] = auth.uid()::text or public.club_can(public.club_folder(name), 'tasks.manage')));

-- Registration documents: clubs-private/applications/<applicant>/<file>; the applicant and the verification team read them.
drop policy if exists "club application files read" on storage.objects;
drop policy if exists "club application files upload" on storage.objects;
create policy "club application files read" on storage.objects for select to authenticated
  using (bucket_id = 'clubs-private' and (storage.foldername(name))[1] = 'applications' and ((storage.foldername(name))[2] = auth.uid()::text or public.can('clubs.verify')));
create policy "club application files upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'clubs-private' and (storage.foldername(name))[1] = 'applications' and (storage.foldername(name))[2] = auth.uid()::text);

-- Documents in an application are paths in the applicant's own folder (checked against the claim's owner on save).
create or replace function public.club_clean_application(a jsonb) returns jsonb
language sql stable set search_path = public as $$
  select coalesce(jsonb_object_agg(k, case when k in ('committee', 'documents') then
      (select coalesce(jsonb_agg(case when k = 'documents' then jsonb_build_object('name', left(e ->> 'name', 120), 'path', e ->> 'path', 'size', coalesce((e ->> 'size')::bigint, 0))
          else jsonb_build_object('name', left(e ->> 'name', 80), 'role', left(e ->> 'role', 60), 'dept', left(e ->> 'dept', 60)) end), '[]'::jsonb)
        from (select e from jsonb_array_elements(case when jsonb_typeof(a -> k) = 'array' then a -> k else '[]'::jsonb end) e
          where jsonb_typeof(e) = 'object' and (k <> 'documents' or coalesce(e ->> 'path', '') ~ ('^applications/' || auth.uid()::text || '/[A-Za-z0-9._-]+$')) and (k <> 'documents' or coalesce(e ->> 'size', '0') ~ '^[0-9]{1,9}$') limit 12) x)
    else to_jsonb(left(a ->> k, 1500)) end), '{}'::jsonb)
  from jsonb_object_keys(coalesce(a, '{}'::jsonb)) k
  where k in ('abbr', 'tagline', 'about', 'members', 'advisor', 'email', 'phone', 'departments', 'activities', 'audience', 'frequency', 'start', 'social', 'statement', 'committee', 'documents');
$$;

-- Assignees may also add labels and attachments to their task; server-side scripts (no signed-in user) pass.
create or replace function public.club_task_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and auth.uid() is not null and not public.club_can(new.club_id, 'tasks.manage') and not (new.project_id is not null and public.on_project_team(new.project_id))
     and (to_jsonb(new) - array['status', 'position', 'checklist', 'done_at', 'labels', 'attachments']) <> (to_jsonb(old) - array['status', 'position', 'checklist', 'done_at', 'labels', 'attachments']) then
    raise exception 'You can only move your task, tick its checklist, or add labels and files';
  end if;
  if new.assignee is not null and not exists (select 1 from public.club_members where club_id = new.club_id and user_id = new.assignee and status = 'active') then raise exception 'Tasks can only be given to club members'; end if;
  if tg_op = 'INSERT' or new.assignee is distinct from old.assignee then new.assignee_name := coalesce((select display_name from public.club_members where club_id = new.club_id and user_id = new.assignee), ''); end if;
  if new.status = 'done' and (tg_op = 'INSERT' or old.status <> 'done') then new.done_at := now(); elsif new.status <> 'done' then new.done_at := null; end if;
  return new;
end $$;

-- Least privilege: nobody signed out reads these, and rows are never edited in place.
revoke all on public.club_task_comments, public.club_access_requests from anon;
revoke update on public.club_task_comments, public.club_access_requests from authenticated;
