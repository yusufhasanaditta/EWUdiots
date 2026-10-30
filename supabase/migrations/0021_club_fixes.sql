-- EWUdiots 0021: fixes found by clubs-rls-check after 0018–0020.
-- daily_limit() only knows the blog/teaching tables, so support tickets count their own (10 a day).
drop policy if exists "open tickets" on public.support_tickets;
create or replace function public.support_quota_ok() returns boolean
language sql stable security definer set search_path = public as $$
  select (select count(*) from public.support_tickets where user_id = auth.uid() and created_at > now() - interval '1 day') < 10;
$$;
revoke execute on function public.support_quota_ok() from public, anon; grant execute on function public.support_quota_ok() to authenticated;
create policy "open tickets" on public.support_tickets for insert to authenticated with check (user_id = auth.uid() and status = 'open' and assigned_to is null and public.support_quota_ok());
