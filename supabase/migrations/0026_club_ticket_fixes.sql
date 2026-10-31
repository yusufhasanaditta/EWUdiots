-- v2.15 fix: cash taken at the door for a registration-form ticket stays paid. The form row is marked paid too,
-- and the form→ticket sync never turns a confirmed (or cash) payment back into "unpaid".
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
  if res = 'admitted' and r.response_id is not null then
    update public.form_responses set checked_in_at = coalesce(checked_in_at, now()), payment_verified = payment_verified or (collect and r.pay_method = 'cash') where id = r.response_id;
  end if;
  insert into public.club_ticket_scans (event_id, ticket_id, result) values (ev, case when res = 'wrong_event' then null else r.id end, res);
  if r.checked_in_by is not null then who := coalesce((select display_name from public.club_members where club_id = r.club_id and user_id = r.checked_in_by), 'a checker'); end if;
  return json_build_object('result', res, 'other_event', other,
    'ticket', case when r.id is null or res = 'wrong_event' then null else json_build_object('id', r.id, 'code', r.code, 'name', r.holder_name, 'student_id', r.holder_sid, 'department', r.holder_dept,
      'tier', r.tier_name, 'price', r.price, 'payment', r.payment, 'pay_method', r.pay_method, 'checked_in_at', r.checked_in_at, 'checked_in_by', who,
      'door_cash', coalesce((e.ticketing ->> 'door_cash')::boolean, true) and r.payment = 'unpaid' and r.pay_method in ('', 'cash')) end);
end $$;

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
    payment = case when club_tickets.payment in ('verified', 'rejected') and excluded.payment in ('unpaid', 'submitted') and (club_tickets.pay_ref = excluded.pay_ref or club_tickets.pay_method = 'cash') then club_tickets.payment else excluded.payment end,
    pay_ref = case when club_tickets.pay_method = 'cash' then club_tickets.pay_ref else excluded.pay_ref end, price = excluded.price, holder_name = excluded.holder_name, holder_dept = excluded.holder_dept,
    checked_in_at = coalesce(club_tickets.checked_in_at, excluded.checked_in_at), updated_at = now();
  return new;
exception when unique_violation then return new; -- the person already holds another ticket for this event
end $$;
