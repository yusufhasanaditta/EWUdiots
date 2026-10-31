-- EWUdiots v2.15: event tickets.
-- A club event can sell or give out tickets (free or paid tiers), or take registrations through its form; either way
-- every ticket is a row in club_tickets with a short code (typed at the door) and a long random token (the QR,
-- "ewud:t:<token>"). Payment works like merch: the buyer pays the club outside the app and types the TrxID (or pays
-- cash at the door) and an organiser verifies it. Organisers choose who may scan: the door team (events.checkin),
-- members they name as ticket checkers, or every active member. Every scan is logged.

-- ───────────────────────── Ticket settings on the event ─────────────────────────
-- ticketing: { enabled, tiers: [{ id, name, price, qty, note }], methods: ['bkash','nagad','rocket','cash'],
--              numbers: { bkash: '01…' }, per_person (fixed at 1), sales_end, scanners: 'staff'|'members', door_cash, note }
alter table public.events add column if not exists ticketing jsonb not null default '{}'::jsonb check (jsonb_typeof(ticketing) = 'object' and length(ticketing::text) <= 8000);

-- ───────────────────────── Tickets ─────────────────────────
create table if not exists public.club_tickets (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events on delete cascade,
  club_id uuid not null references public.clubs on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  response_id uuid unique references public.form_responses on delete cascade, -- set when the ticket comes from a registration form
  tier_id text not null default 'general' check (length(tier_id) <= 24),
  tier_name text not null default 'General' check (length(tier_name) <= 40),
  price numeric(10, 2) not null default 0 check (price >= 0 and price < 1000000),
  code text not null check (code ~ '^[0-9A-Z]{6,12}$'),
  token text not null unique default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  holder_name text not null default '', holder_sid text not null default '', holder_email text not null default '', holder_dept text not null default '',
  status text not null default 'active' check (status in ('active', 'used', 'waitlisted', 'cancelled')),
  payment text not null default 'free' check (payment in ('free', 'unpaid', 'submitted', 'verified', 'rejected')),
  pay_method text not null default '' check (pay_method in ('', 'bkash', 'nagad', 'rocket', 'cash')),
  pay_ref text not null default '' check (length(pay_ref) <= 40),
  pay_note text not null default '' check (length(pay_note) <= 200),
  pay_checked_by uuid references auth.users (id) on delete set null,
  pay_checked_at timestamptz,
  checked_in_at timestamptz,
  checked_in_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, code)
);
create unique index if not exists club_tickets_one_each on public.club_tickets (event_id, user_id) where status <> 'cancelled';
create index if not exists club_tickets_user on public.club_tickets (user_id, created_at desc);
create index if not exists club_tickets_event on public.club_tickets (event_id, status);
alter table public.club_tickets enable row level security;
-- Only the holder reads their own row (it carries the QR token). Organisers and door staff go through the RPCs
-- below, which never return tokens.
drop policy if exists "read my tickets" on public.club_tickets;
create policy "read my tickets" on public.club_tickets for select to authenticated using (user_id = auth.uid());

create table if not exists public.club_event_staff (
  event_id uuid not null references public.events on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  added_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);
alter table public.club_event_staff enable row level security;
drop policy if exists "read my checker roles" on public.club_event_staff;
create policy "read my checker roles" on public.club_event_staff for select to authenticated using (user_id = auth.uid());

create table if not exists public.club_ticket_scans (
  id bigint generated always as identity primary key,
  event_id uuid not null references public.events on delete cascade,
  ticket_id uuid references public.club_tickets on delete set null,
  scanned_by uuid references auth.users (id) on delete set null default auth.uid(),
  result text not null check (result in ('admitted', 'valid', 'used', 'invalid', 'wrong_event', 'unpaid', 'cancelled', 'waitlisted', 'paid_cash')),
  at timestamptz not null default now()
);
create index if not exists club_ticket_scans_event on public.club_ticket_scans (event_id, at desc);
create index if not exists club_ticket_scans_by on public.club_ticket_scans (scanned_by, at desc);
alter table public.club_ticket_scans enable row level security; -- read through event_ticket_scans()

-- ───────────────────────── Who may do what ─────────────────────────
create or replace function public.event_club(ev uuid) returns uuid
language sql stable security definer set search_path = public as $$ select club_id from public.events where id = ev; $$;
revoke execute on function public.event_club(uuid) from public, anon, authenticated;

create or replace function public.can_manage_tickets(ev uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select public.club_can(e.club_id, 'events.manage') or public.club_can(e.club_id, 'payments.verify') or public.club_can(e.club_id, 'forms.view_responses')
    from public.events e where e.id = ev and e.club_id is not null), false);
$$;
create or replace function public.can_scan_event(ev uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select public.club_can(e.club_id, 'events.manage') or public.club_can(e.club_id, 'events.checkin') or public.club_can(e.club_id, 'attendance.take')
      or (public.is_club_member(e.club_id) and (exists (select 1 from public.club_event_staff s where s.event_id = e.id and s.user_id = auth.uid())
                                                or coalesce(e.ticketing ->> 'scanners', 'staff') = 'members'))
    from public.events e where e.id = ev and e.club_id is not null), false);
$$;
revoke execute on function public.can_manage_tickets(uuid), public.can_scan_event(uuid) from public, anon;
grant execute on function public.can_manage_tickets(uuid), public.can_scan_event(uuid) to authenticated;

create or replace function public.ticket_code() returns text
language sql volatile set search_path = public as $$ select upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)); $$;

-- Organisers can't save a ticket setup that would break the rules below.
create or replace function public.event_ticketing_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare t jsonb := coalesce(new.ticketing, '{}'); tr jsonb; ids text[] := '{}';
begin
  if t = '{}'::jsonb or new.ticketing is not distinct from coalesce(old.ticketing, '{}') then return new; end if;
  if new.club_id is null then raise exception 'Only club events can have tickets'; end if;
  if jsonb_typeof(coalesce(t -> 'tiers', '[]')) <> 'array' or jsonb_array_length(coalesce(t -> 'tiers', '[]')) > 6 then raise exception 'Up to 6 ticket types'; end if;
  for tr in select * from jsonb_array_elements(coalesce(t -> 'tiers', '[]')) loop
    if coalesce(tr ->> 'id', '') !~ '^[a-z0-9_-]{1,24}$' or length(coalesce(tr ->> 'name', '')) not between 1 and 40 then raise exception 'Every ticket type needs a name'; end if;
    if coalesce((tr ->> 'price')::numeric, 0) < 0 or coalesce((tr ->> 'price')::numeric, 0) > 100000 then raise exception 'Ticket prices go from 0 to 100000 taka'; end if;
    if tr ->> 'qty' is not null and ((tr ->> 'qty')::int < 1 or (tr ->> 'qty')::int > 20000) then raise exception 'Ticket quantity must be 1 to 20000'; end if;
    if (tr ->> 'id') = any (ids) then raise exception 'Two ticket types have the same id'; end if;
    ids := ids || (tr ->> 'id');
  end loop;
  if coalesce(t ->> 'scanners', 'staff') not in ('staff', 'members') then raise exception 'Unknown scanner setting'; end if;
  if exists (select 1 from jsonb_array_elements_text(coalesce(t -> 'methods', '[]')) m where m not in ('bkash', 'nagad', 'rocket', 'cash')) then raise exception 'Unknown payment method'; end if;
  if exists (select 1 from jsonb_each_text(coalesce(t -> 'numbers', '{}')) n where n.key not in ('bkash', 'nagad', 'rocket') or n.value !~ '^(\+?88)?01[3-9]\d{8}$') then raise exception 'Payment numbers must be Bangladeshi mobile numbers'; end if;
  return new;
end $$;
drop trigger if exists event_ticketing_guard on public.events;
create trigger event_ticketing_guard before insert or update of ticketing on public.events for each row execute function public.event_ticketing_guard();

-- ───────────────────────── Getting a ticket ─────────────────────────
-- Free tiers are valid at once. Paid tiers need a TrxID (verified later) or cash at the door, when the event allows it.
create or replace function public.get_ticket(ev uuid, tier text default 'general', method text default '', ref text default '') returns public.club_tickets
language plpgsql security definer set search_path = public as $$
declare e public.events; t jsonb; tr jsonb; me jsonb := public.club_me(); price numeric; taken int; cap int; r public.club_tickets; pay text := 'free';
begin
  if auth.uid() is null then raise exception 'Sign in to get a ticket'; end if;
  select * into e from public.events where id = ev and status = 'approved' and club_id is not null;
  if e.id is null then raise exception 'Event not found'; end if;
  t := e.ticketing;
  if not coalesce((t ->> 'enabled')::boolean, false) then raise exception 'This event doesn''t sell tickets'; end if;
  if e.form_id is not null then raise exception 'Register with the event''s form to get your ticket'; end if;
  if not exists (select 1 from public.clubs where id = e.club_id and status = 'active') then raise exception 'This club isn''t active'; end if;
  if e.visibility = 'members' and not public.is_club_member(e.club_id) then raise exception 'This event is for club members only'; end if;
  if coalesce(e.ends_at, e.starts_at) < now() then raise exception 'This event is over'; end if;
  if nullif(t ->> 'sales_end', '') is not null and now() > (t ->> 'sales_end')::timestamptz then raise exception 'Ticket sales have closed'; end if;
  select x into tr from jsonb_array_elements(coalesce(t -> 'tiers', '[]')) x where x ->> 'id' = tier;
  if tr is null then raise exception 'Choose a ticket type'; end if;
  if (select count(*) from public.club_tickets where user_id = auth.uid() and created_at > now() - interval '1 day') >= 15 then raise exception 'You''ve taken a lot of tickets today. Try again tomorrow.'; end if;
  perform pg_advisory_xact_lock(hashtext('tickets:' || ev::text)); -- one at a time, so the last seat isn't sold twice
  if exists (select 1 from public.club_tickets where event_id = ev and user_id = auth.uid() and status <> 'cancelled') then raise exception 'You already have a ticket for this event'; end if;
  cap := nullif(tr ->> 'qty', '')::int;
  if cap is not null then
    select count(*) into taken from public.club_tickets where event_id = ev and tier_id = tier and status in ('active', 'used') and payment <> 'rejected';
    if taken >= cap then raise exception 'Sold out: % tickets are gone', tr ->> 'name'; end if;
  end if;
  if e.capacity is not null and (select count(*) from public.club_tickets where event_id = ev and status in ('active', 'used') and payment <> 'rejected') >= e.capacity then raise exception 'This event is full'; end if;
  price := coalesce((tr ->> 'price')::numeric, 0);
  if price > 0 then
    if method not in ('bkash', 'nagad', 'rocket', 'cash') or not (coalesce(t -> 'methods', '["bkash","nagad","rocket"]') ? method) then raise exception 'Choose a payment method'; end if;
    if method = 'cash' then pay := 'unpaid';
    else
      ref := upper(regexp_replace(coalesce(ref, ''), '\s', '', 'g'));
      if ref !~ '^[A-Z0-9]{6,20}$' then raise exception 'Type the transaction ID from your % message', initcap(method); end if;
      if exists (select 1 from public.club_tickets where club_id = e.club_id and pay_ref = ref and status <> 'cancelled') then raise exception 'That transaction ID was already used'; end if;
      pay := 'submitted';
    end if;
  else method := ''; ref := '';
  end if;
  insert into public.club_tickets (event_id, club_id, user_id, tier_id, tier_name, price, code, holder_name, holder_sid, holder_email, holder_dept, payment, pay_method, pay_ref)
  values (ev, e.club_id, auth.uid(), tier, tr ->> 'name', price, public.ticket_code(), me ->> 'name', me ->> 'student_id', me ->> 'email',
    coalesce((select m.department from public.club_members m where m.user_id = auth.uid() and m.department <> '' order by m.joined_at desc limit 1), ''), pay, coalesce(method, ''), coalesce(ref, ''))
  returning * into r;
  perform public.club_alert(auth.uid(), e.club_id, 'event', 'Your ticket: ' || e.title,
    case pay when 'free' then 'Show the QR code at the door.' when 'submitted' then 'We''ll confirm once the club checks your payment.' else 'Pay ৳' || price || ' in cash at the door.' end, '#/club/pass?id=' || r.id);
  return r;
end $$;

-- The buyer sends (or resends, after a rejection) their TrxID.
create or replace function public.pay_ticket(t uuid, method text, ref text) returns public.club_tickets
language plpgsql security definer set search_path = public as $$
declare r public.club_tickets; e public.events;
begin
  select * into r from public.club_tickets where id = t and user_id = auth.uid() for update;
  if r.id is null or r.status <> 'active' or r.payment not in ('unpaid', 'rejected') then raise exception 'This ticket doesn''t need a payment'; end if;
  select * into e from public.events where id = r.event_id;
  if method not in ('bkash', 'nagad', 'rocket') or not (coalesce(e.ticketing -> 'methods', '["bkash","nagad","rocket"]') ? method) then raise exception 'Choose a payment method'; end if;
  ref := upper(regexp_replace(coalesce(ref, ''), '\s', '', 'g'));
  if ref !~ '^[A-Z0-9]{6,20}$' then raise exception 'Type the transaction ID from your % message', initcap(method); end if;
  if exists (select 1 from public.club_tickets where club_id = r.club_id and pay_ref = ref and id <> r.id and status <> 'cancelled') then raise exception 'That transaction ID was already used'; end if;
  update public.club_tickets set payment = 'submitted', pay_method = method, pay_ref = ref, pay_note = '', updated_at = now() where id = t returning * into r;
  return r;
end $$;

-- Organisers check the TrxID in the club's account. A verified payment is booked as ticket income.
create or replace function public.review_ticket_payment(t uuid, ok boolean, note text default '') returns public.club_tickets
language plpgsql security definer set search_path = public as $$
declare r public.club_tickets; e public.events;
begin
  select * into r from public.club_tickets where id = t for update;
  if r.id is null or not (public.club_can(r.club_id, 'events.manage') or public.club_can(r.club_id, 'payments.verify')) then raise exception 'You don''t have permission to check payments'; end if;
  if r.payment not in ('submitted', 'unpaid', 'rejected') or r.status = 'cancelled' then raise exception 'This ticket has no payment to check'; end if;
  select * into e from public.events where id = r.event_id;
  update public.club_tickets set payment = case when ok then 'verified' else 'rejected' end, pay_method = case when ok and pay_method = '' then 'cash' else pay_method end,
    pay_note = left(coalesce(note, ''), 200), pay_checked_by = auth.uid(), pay_checked_at = now(), updated_at = now() where id = t returning * into r;
  if ok and r.price > 0 and r.response_id is null then
    insert into public.club_finance (club_id, kind, amount, category, note, event_id) values (r.club_id, 'income', r.price, 'Tickets', left('Ticket ' || r.code || ' · ' || e.title, 300), e.id);
  end if;
  if r.response_id is not null then update public.form_responses set payment_verified = ok, updated_at = now() where id = r.response_id; end if;
  perform public.club_alert(r.user_id, r.club_id, 'event', case when ok then 'Payment confirmed: ' else 'Payment not found: ' end || e.title,
    case when ok then 'Your ticket is ready. Show the QR code at the door.' else coalesce(nullif(note, ''), 'The club couldn''t find your payment. Check the transaction ID and send it again.') end, '#/club/pass?id=' || r.id);
  perform public.club_log(r.club_id, 'ticket.payment', jsonb_build_object('ticket', r.code, 'ok', ok));
  return r;
end $$;

-- The holder can cancel before the event starts; organisers can cancel any unused ticket.
create or replace function public.cancel_ticket(t uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r public.club_tickets; e public.events; staff boolean;
begin
  select * into r from public.club_tickets where id = t for update;
  if r.id is null then raise exception 'Ticket not found'; end if;
  staff := public.club_can(r.club_id, 'events.manage');
  if not (staff or r.user_id = auth.uid()) then raise exception 'Not allowed'; end if;
  if r.status = 'used' then raise exception 'This ticket was already used'; end if;
  if r.response_id is not null and not staff then raise exception 'Withdraw your registration from the form instead'; end if;
  select * into e from public.events where id = r.event_id;
  if not staff and e.starts_at < now() then raise exception 'The event has started'; end if;
  update public.club_tickets set status = 'cancelled', updated_at = now() where id = t;
  if staff and r.user_id <> auth.uid() then perform public.club_alert(r.user_id, r.club_id, 'event', 'Ticket cancelled: ' || e.title, case when r.payment = 'verified' then 'Contact the club about your refund.' else '' end, '#/club/event?id=' || e.id); end if;
  perform public.club_log(r.club_id, 'ticket.cancelled', jsonb_build_object('ticket', r.code));
end $$;

-- ───────────────────────── At the door ─────────────────────────
-- q is what the camera read ("ewud:t:<token>", or an old "EWUDCLUB:<form>:<code>") or a typed code.
-- Results never raise for a bad ticket, so the scanner can show a big red or green answer:
--   admitted · valid (checked, not admitted) · used · invalid · wrong_event · unpaid · cancelled · waitlisted
-- collect = true takes cash at the door for an unpaid ticket (only when the event allows door cash) and admits.
create or replace function public.scan_ticket(ev uuid, q text, admit boolean default true, collect boolean default false) returns json
language plpgsql security definer set search_path = public as $$
declare e public.events; r public.club_tickets; s text := trim(coalesce(q, '')); res text; other text; who text;
begin
  select * into e from public.events where id = ev;
  if e.id is null or not public.can_scan_event(ev) then raise exception 'You aren''t a ticket checker for this event'; end if;
  if (select count(*) from public.club_ticket_scans where scanned_by = auth.uid() and at > now() - interval '10 minutes') >= 400 then raise exception 'Too many scans. Wait a few minutes.'; end if;
  if s ~* '^ewud:t:[0-9a-f]{32,64}$' then
    select * into r from public.club_tickets where token = lower(substr(s, 8));
  elsif s ~* '^EWUDCLUB:[0-9a-f-]{36}:[0-9A-Z]{6,12}$' then
    select * into r from public.club_tickets where event_id = ev and code = upper(split_part(s, ':', 3));
    if r.id is null then select * into r from public.club_tickets where code = upper(split_part(s, ':', 3)) and response_id in (select id from public.form_responses where form_id = split_part(s, ':', 2)::uuid); end if;
  else
    select * into r from public.club_tickets where event_id = ev and code = upper(regexp_replace(s, '[^0-9A-Za-z]', '', 'g'));
  end if;
  if r.id is null then res := 'invalid';
  elsif r.event_id <> ev then res := 'wrong_event'; other := (select title from public.events where id = r.event_id);
  elsif r.status = 'cancelled' then res := 'cancelled';
  elsif r.status = 'waitlisted' then res := 'waitlisted';
  elsif r.status = 'used' then res := 'used';
  elsif r.payment in ('unpaid', 'submitted', 'rejected') then
    if collect and admit and r.payment = 'unpaid' and coalesce((e.ticketing ->> 'door_cash')::boolean, true) and r.pay_method in ('', 'cash') then
      update public.club_tickets set payment = 'verified', pay_method = 'cash', pay_checked_by = auth.uid(), pay_checked_at = now(), status = 'used', checked_in_at = now(), checked_in_by = auth.uid(), updated_at = now() where id = r.id returning * into r;
      if r.price > 0 and r.response_id is null then insert into public.club_finance (club_id, kind, amount, category, note, event_id) values (r.club_id, 'income', r.price, 'Tickets', left('Ticket ' || r.code || ' (cash at the door) · ' || e.title, 300), e.id); end if;
      res := 'admitted';
      insert into public.club_ticket_scans (event_id, ticket_id, result) values (ev, r.id, 'paid_cash');
    else res := 'unpaid';
    end if;
  elsif admit then
    update public.club_tickets set status = 'used', checked_in_at = now(), checked_in_by = auth.uid(), updated_at = now() where id = r.id and status = 'active' returning * into r;
    res := 'admitted';
  else res := 'valid';
  end if;
  if res = 'admitted' and r.response_id is not null then update public.form_responses set checked_in_at = coalesce(checked_in_at, now()) where id = r.response_id; end if;
  insert into public.club_ticket_scans (event_id, ticket_id, result) values (ev, case when res = 'wrong_event' then null else r.id end, res);
  if r.checked_in_by is not null then who := coalesce((select display_name from public.club_members where club_id = r.club_id and user_id = r.checked_in_by), 'a checker'); end if;
  return json_build_object('result', res, 'other_event', other,
    'ticket', case when r.id is null or res = 'wrong_event' then null else json_build_object('id', r.id, 'code', r.code, 'name', r.holder_name, 'student_id', r.holder_sid, 'department', r.holder_dept,
      'tier', r.tier_name, 'price', r.price, 'payment', r.payment, 'pay_method', r.pay_method, 'checked_in_at', r.checked_in_at, 'checked_in_by', who,
      'door_cash', coalesce((e.ticketing ->> 'door_cash')::boolean, true) and r.payment = 'unpaid' and r.pay_method in ('', 'cash')) end);
end $$;

-- Numbers for the organiser and the door: seats, sold per type, money, check-ins, scans per hour.
create or replace function public.ticket_stats(ev uuid) returns json
language plpgsql stable security definer set search_path = public as $$
declare e public.events;
begin
  select * into e from public.events where id = ev;
  if e.id is null or not (public.can_scan_event(ev) or public.can_manage_tickets(ev)) then raise exception 'Not allowed'; end if;
  return json_build_object(
    'capacity', e.capacity,
    'issued', (select count(*) from public.club_tickets where event_id = ev and status in ('active', 'used')),
    'checked_in', (select count(*) from public.club_tickets where event_id = ev and status = 'used'),
    'waitlist', (select count(*) from public.club_tickets where event_id = ev and status = 'waitlisted'),
    'to_verify', (select count(*) from public.club_tickets where event_id = ev and status = 'active' and payment = 'submitted'),
    'unpaid', (select count(*) from public.club_tickets where event_id = ev and status = 'active' and payment = 'unpaid'),
    'revenue', (select coalesce(sum(price), 0) from public.club_tickets where event_id = ev and status in ('active', 'used') and payment = 'verified'),
    'tiers', (select coalesce(json_agg(json_build_object('id', x ->> 'id', 'name', x ->> 'name', 'price', coalesce((x ->> 'price')::numeric, 0), 'qty', nullif(x ->> 'qty', '')::int,
        'sold', (select count(*) from public.club_tickets t where t.event_id = ev and t.tier_id = x ->> 'id' and t.status in ('active', 'used') and t.payment <> 'rejected'))), '[]')
      from jsonb_array_elements(coalesce(e.ticketing -> 'tiers', '[]')) x),
    'per_hour', (select coalesce(json_agg(json_build_object('h', h, 'n', n) order by h), '[]') from (select date_trunc('hour', checked_in_at) h, count(*) n from public.club_tickets where event_id = ev and checked_in_at is not null group by 1) x),
    'by_department', (select coalesce(json_object_agg(d, n), '{}') from (select coalesce(nullif(holder_dept, ''), '—') d, count(*) n from public.club_tickets where event_id = ev and status in ('active', 'used') group by 1) x),
    'can_manage', public.can_manage_tickets(ev));
end $$;

-- The organiser's ticket list (no tokens). Door staff without the manage permission get the recent check-ins only.
create or replace function public.event_tickets(ev uuid) returns table (id uuid, code text, name text, student_id text, email text, department text, tier text, price numeric,
  status text, payment text, pay_method text, pay_ref text, pay_note text, checked_in_at timestamptz, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.can_manage_tickets(ev) then raise exception 'Not allowed'; end if;
  return query select t.id, t.code, t.holder_name, t.holder_sid, t.holder_email, t.holder_dept, t.tier_name, t.price, t.status, t.payment, t.pay_method, t.pay_ref, t.pay_note, t.checked_in_at, t.created_at
    from public.club_tickets t where t.event_id = ev order by t.created_at desc limit 5000;
end $$;
create or replace function public.event_recent_checkins(ev uuid) returns table (name text, department text, tier text, code text, checked_in_at timestamptz, by_name text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.can_scan_event(ev) then raise exception 'Not allowed'; end if;
  return query select t.holder_name, t.holder_dept, t.tier_name, t.code, t.checked_in_at, coalesce(m.display_name, '')
    from public.club_tickets t left join public.club_members m on m.club_id = t.club_id and m.user_id = t.checked_in_by
    where t.event_id = ev and t.checked_in_at is not null order by t.checked_in_at desc limit 30;
end $$;

-- Ticket checkers: any active member of the club, named by an organiser.
create or replace function public.ticket_checkers(ev uuid) returns table (user_id uuid, name text, role_name text, scans bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.can_scan_event(ev) then raise exception 'Not allowed'; end if;
  return query select s.user_id, coalesce(m.display_name, ''), coalesce(r.name, ''), (select count(*) from public.club_ticket_scans x where x.event_id = ev and x.scanned_by = s.user_id)
    from public.club_event_staff s join public.events e on e.id = s.event_id
    left join public.club_members m on m.club_id = e.club_id and m.user_id = s.user_id left join public.club_roles r on r.id = m.role_id
    where s.event_id = ev order by m.display_name;
end $$;
create or replace function public.set_ticket_checker(ev uuid, u uuid, enable boolean) returns void
language plpgsql security definer set search_path = public as $$
declare e public.events;
begin
  select * into e from public.events where id = ev;
  if e.id is null or not public.club_can(e.club_id, 'events.manage') then raise exception 'Only event organisers choose ticket checkers'; end if;
  if enable then
    if not exists (select 1 from public.club_members where club_id = e.club_id and user_id = u and status = 'active') then raise exception 'Ticket checkers must be members of the club'; end if;
    if (select count(*) from public.club_event_staff where event_id = ev) >= 50 then raise exception 'Up to 50 ticket checkers'; end if;
    insert into public.club_event_staff (event_id, user_id) values (ev, u) on conflict do nothing;
    if found then perform public.club_alert(u, e.club_id, 'event', 'You''re a ticket checker: ' || e.title, 'Open the scanner at the door to check tickets.', '#/club/scan?id=' || ev); end if;
  else delete from public.club_event_staff where event_id = ev and user_id = u;
  end if;
  perform public.club_log(e.club_id, 'ticket.checker', jsonb_build_object('event', e.title, 'user', u, 'on', enable));
end $$;

-- Events the signed-in person can scan tickets for (from yesterday on), for the "Scan tickets" screen.
create or replace function public.my_scan_events() returns table (id uuid, title text, starts_at timestamptz, ends_at timestamptz, venue text, image text, club_id uuid, club_name text, checker boolean)
language sql stable security definer set search_path = public as $$
  select e.id, e.title, e.starts_at, e.ends_at, e.venue, e.image, e.club_id, k.name, exists (select 1 from public.club_event_staff s where s.event_id = e.id and s.user_id = auth.uid())
  from public.events e join public.clubs k on k.id = e.club_id
  where e.club_id in (select club_id from public.club_members where user_id = auth.uid() and status = 'active' union select id from public.clubs where public.can('clubs.manage'))
    and coalesce(e.ends_at, e.starts_at) > now() - interval '1 day' and e.starts_at < now() + interval '60 days'
    and (coalesce((e.ticketing ->> 'enabled')::boolean, false) or e.form_id is not null)
    and public.can_scan_event(e.id)
  order by e.starts_at limit 30;
$$;

-- My tickets, with the event (the QR token is read from club_tickets by its holder).
create or replace function public.my_tickets() returns table (id uuid, event_id uuid, club_id uuid, tier_name text, price numeric, code text, token text, status text, payment text, pay_method text, pay_ref text, pay_note text,
  checked_in_at timestamptz, created_at timestamptz, title text, starts_at timestamptz, ends_at timestamptz, venue text, image text, club_name text, club_slug text, club_logo text, holder_name text, holder_sid text, numbers jsonb)
language sql stable security definer set search_path = public as $$
  select t.id, t.event_id, t.club_id, t.tier_name, t.price, t.code, t.token, t.status, t.payment, t.pay_method, t.pay_ref, t.pay_note, t.checked_in_at, t.created_at,
    e.title, e.starts_at, e.ends_at, e.venue, e.image, k.name, k.slug, k.logo_url, t.holder_name, t.holder_sid,
    coalesce(nullif(e.ticketing -> 'numbers', '{}'::jsonb), k.store_settings -> 'payment_numbers', '{}'::jsonb)
  from public.club_tickets t join public.events e on e.id = t.event_id join public.clubs k on k.id = t.club_id
  where t.user_id = auth.uid() order by (t.status in ('active') and coalesce(e.ends_at, e.starts_at) > now()) desc, e.starts_at;
$$;

-- Payment numbers for an event's checkout (the event's own, or the club's store numbers).
create or replace function public.event_pay_numbers(ev uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(nullif(e.ticketing -> 'numbers', '{}'::jsonb), k.store_settings -> 'payment_numbers', '{}'::jsonb)
  from public.events e join public.clubs k on k.id = e.club_id where e.id = ev and e.status = 'approved';
$$;

-- Tickets left per type, for the public event page.
create or replace function public.ticket_availability(ev uuid) returns json
language sql stable security definer set search_path = public as $$
  select json_build_object('issued', (select count(*) from public.club_tickets where event_id = ev and status in ('active', 'used') and payment <> 'rejected'),
    'tiers', coalesce((select json_object_agg(x ->> 'id', (select count(*) from public.club_tickets t where t.event_id = ev and t.tier_id = x ->> 'id' and t.status in ('active', 'used') and t.payment <> 'rejected'))
      from public.events e, jsonb_array_elements(coalesce(e.ticketing -> 'tiers', '[]')) x where e.id = ev), '{}'))
  where exists (select 1 from public.events where id = ev and status = 'approved');
$$;

-- ───────────────────────── Registration forms issue tickets too ─────────────────────────
-- A response to an event's form (one that gives tickets) gets a matching club_tickets row, kept in step with the
-- response: waitlisted/rejected, the fee and its check, and check-ins made from the form's own door screen.
create or replace function public.form_ticket_sync() returns trigger
language plpgsql security definer set search_path = public as $$
declare e public.events; fee numeric; st text; pay text;
begin
  if new.ticket = '' then return new; end if;
  select * into e from public.events where form_id = new.form_id and club_id is not null order by starts_at desc limit 1;
  if e.id is null then return new; end if;
  fee := coalesce(nullif((select settings ->> 'fee' from public.club_forms where id = new.form_id), '')::numeric, 0);
  st := case when new.status = 'waitlisted' then 'waitlisted' when new.status = 'rejected' then 'cancelled' when new.checked_in_at is not null then 'used' else 'active' end;
  pay := case when fee <= 0 then 'free' when new.payment_verified then 'verified' when new.payment_ref <> '' then 'submitted' else 'unpaid' end;
  insert into public.club_tickets (event_id, club_id, user_id, response_id, tier_id, tier_name, price, code, holder_name, holder_sid, holder_email, holder_dept, status, payment, pay_ref, checked_in_at)
  values (e.id, e.club_id, new.user_id, new.id, 'registration', 'Registration', fee, new.ticket, new.name, new.student_id, new.email, new.department, st, pay, new.payment_ref, new.checked_in_at)
  on conflict (response_id) do update set status = case when club_tickets.status = 'used' and excluded.status = 'active' then 'used' else excluded.status end,
    payment = case when club_tickets.payment in ('verified', 'rejected') and excluded.payment = 'submitted' and club_tickets.pay_ref = excluded.pay_ref then club_tickets.payment else excluded.payment end,
    pay_ref = excluded.pay_ref, price = excluded.price, holder_name = excluded.holder_name, holder_dept = excluded.holder_dept,
    checked_in_at = coalesce(club_tickets.checked_in_at, excluded.checked_in_at), updated_at = now();
  return new;
exception when unique_violation then return new; -- the person already holds another ticket for this event
end $$;
drop trigger if exists form_ticket_sync on public.form_responses;
create trigger form_ticket_sync after insert or update on public.form_responses for each row execute function public.form_ticket_sync();
-- Linking a form to an event later issues tickets for the people already registered.
create or replace function public.event_form_linked() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.form_id is not null and new.form_id is distinct from old.form_id then update public.form_responses set updated_at = updated_at where form_id = new.form_id; end if;
  return new;
end $$;
drop trigger if exists event_form_linked on public.events;
create trigger event_form_linked after update of form_id on public.events for each row execute function public.event_form_linked();

-- The event dashboard counts tickets now (forms feed them), and door staff may read it.
create or replace function public.event_stats(ev uuid) returns json
language plpgsql stable security definer set search_path = public as $$
declare e public.events;
begin
  select * into e from public.events where id = ev;
  if e.id is null or e.club_id is null or not (public.can_scan_event(ev) or public.can_manage_tickets(ev)) then raise exception 'Not allowed'; end if;
  return json_build_object(
    'capacity', e.capacity,
    'registered', (select count(*) from public.club_tickets t where t.event_id = ev and t.status in ('active', 'used')),
    'waitlist', (select count(*) from public.club_tickets t where t.event_id = ev and t.status = 'waitlisted'),
    'checked_in', (select count(*) from public.club_tickets t where t.event_id = ev and t.status = 'used'),
    'volunteers', (select count(*) from public.form_responses r where r.form_id = e.volunteer_form_id and r.status in ('pending', 'accepted')),
    'per_hour', (select coalesce(json_agg(json_build_object('h', h, 'n', n) order by h), '[]') from (select date_trunc('hour', t.checked_in_at) h, count(*) n from public.club_tickets t where t.event_id = ev and t.checked_in_at is not null group by 1) x),
    'by_department', (select coalesce(json_object_agg(d, n), '{}') from (select coalesce(nullif(t.holder_dept, ''), '—') d, count(*) n from public.club_tickets t where t.event_id = ev and t.status in ('active', 'used') group by 1) x));
end $$;
-- The old door RPC goes through the ticket scanner, so both screens agree.
create or replace function public.event_checkin(ev uuid, q text) returns public.form_responses
language plpgsql security definer set search_path = public as $$
declare j json; r public.form_responses;
begin
  j := public.scan_ticket(ev, q, true, false);
  if j ->> 'result' not in ('admitted', 'used') then raise exception 'Ticket %', replace(j ->> 'result', '_', ' '); end if;
  select f.* into r from public.form_responses f join public.club_tickets t on t.response_id = f.id where t.id = (j -> 'ticket' ->> 'id')::uuid;
  return r;
end $$;

revoke execute on function public.get_ticket(uuid, text, text, text), public.pay_ticket(uuid, text, text), public.review_ticket_payment(uuid, boolean, text), public.cancel_ticket(uuid),
  public.scan_ticket(uuid, text, boolean, boolean), public.ticket_stats(uuid), public.event_tickets(uuid), public.event_recent_checkins(uuid), public.ticket_checkers(uuid),
  public.set_ticket_checker(uuid, uuid, boolean), public.my_scan_events(), public.my_tickets(), public.event_pay_numbers(uuid), public.ticket_availability(uuid) from public, anon;
grant execute on function public.get_ticket(uuid, text, text, text), public.pay_ticket(uuid, text, text), public.review_ticket_payment(uuid, boolean, text), public.cancel_ticket(uuid),
  public.scan_ticket(uuid, text, boolean, boolean), public.ticket_stats(uuid), public.event_tickets(uuid), public.event_recent_checkins(uuid), public.ticket_checkers(uuid),
  public.set_ticket_checker(uuid, uuid, boolean), public.my_scan_events(), public.my_tickets(), public.event_pay_numbers(uuid) to authenticated;
grant execute on function public.ticket_availability(uuid) to anon, authenticated;
revoke execute on function public.ticket_code(), public.event_ticketing_guard(), public.form_ticket_sync(), public.event_form_linked() from public, anon, authenticated;

-- Existing registrations get their tickets.
update public.form_responses set updated_at = updated_at where ticket <> '' and form_id in (select form_id from public.events where form_id is not null and club_id is not null);

