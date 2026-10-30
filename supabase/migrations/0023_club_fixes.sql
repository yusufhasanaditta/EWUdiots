-- EWUdiots 0023 (v2.14): gaps found while building the club screens.
--   • score_response falls back to the default rubric the app shows (Motivation 20 · Skills 20 · Portfolio 20 · Fit 40)
--     when a form has none stored, so totals are never silently 0.
--   • Event budgets: planned amounts per category for an event; spending is the finance rows tagged with the event.

create or replace function public.score_response(rid uuid, sc jsonb) returns numeric
language plpgsql security definer set search_path = public as $$
declare r public.form_responses; rub jsonb; tot numeric := 0; it jsonb; v numeric;
begin
  select * into r from public.form_responses where id = rid;
  if r.id is null or not (public.club_can(r.club_id, 'recruitment.evaluate') or public.club_can(r.club_id, 'forms.view_responses')) then raise exception 'You don''t have permission to score applicants'; end if;
  select coalesce(nullif(settings -> 'rubric', '[]'::jsonb), '[{"key":"motivation","max":20},{"key":"skills","max":20},{"key":"portfolio","max":20},{"key":"fit","max":40}]'::jsonb) into rub from public.club_forms where id = r.form_id;
  for it in select * from jsonb_array_elements(rub) loop
    v := least(greatest(coalesce((sc ->> (it ->> 'key'))::numeric, 0), 0), coalesce((it ->> 'max')::numeric, 0));
    tot := tot + v;
  end loop;
  update public.form_responses set score = coalesce(sc, '{}'), score_total = tot, evaluated_by = auth.uid(), updated_at = now() where id = rid;
  return tot;
end $$;

alter table public.club_finance add column if not exists event_id uuid references public.events on delete set null;
create index if not exists club_finance_event on public.club_finance (event_id) where event_id is not null;
create table public.club_budgets (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs on delete cascade,
  event_id uuid references public.events on delete cascade,
  title text not null check (length(title) between 2 and 140),
  lines jsonb not null default '[]'::jsonb check (jsonb_typeof(lines) = 'array' and jsonb_array_length(lines) <= 30), -- [{ category, planned }]
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  unique (club_id, event_id)
);
alter table public.club_budgets enable row level security;
create policy "read budgets" on public.club_budgets for select to authenticated using (public.club_can(club_id, 'finance.view') or public.club_can(club_id, 'finance.edit'));
create policy "write budgets" on public.club_budgets for all to authenticated using (public.club_can(club_id, 'finance.edit')) with check (public.club_can(club_id, 'finance.edit'));
