-- v2.18: Club Analytics & Insights / Reports & Performance. Executives (rank 4) can see analytics too, and one more
-- call adds what the new boards need: engagement counts, an activity heatmap, retention and event categories.

update public.club_role_template set perms = array_append(perms, 'analytics.view') where rank = 4 and not ('analytics.view' = any (perms));
update public.club_roles set perms = array_append(perms, 'analytics.view') where rank = 4 and not ('analytics.view' = any (perms));

create or replace function public.club_analytics_extra(c uuid) returns json
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.club_can(c, 'analytics.view') then raise exception 'You don''t have permission to see club analytics'; end if;
  return json_build_object(
    'executives', (select count(*) from public.club_members m join public.club_roles r on r.id = m.role_id where m.club_id = c and m.status = 'active' and r.rank <= 4),
    'participants', (select count(*) from public.form_responses r join public.events e on e.form_id = r.form_id where e.club_id = c),
    'participants_prev', (select count(*) from public.form_responses r join public.events e on e.form_id = r.form_id where e.club_id = c and r.created_at < now() - interval '6 months'),
    'members_6m', (select count(*) from public.club_members where club_id = c and joined_at < now() - interval '6 months' and (left_at is null or left_at >= now() - interval '6 months')),
    'events_6m', (select count(*) from public.events where club_id = c and created_at < now() - interval '6 months'),
    -- Last 90 days of posts, reactions, comments and chat messages.
    'engagement', json_build_object(
      'posts', (select count(*) from public.club_posts where club_id = c and source_url = '' and created_at > now() - interval '90 days'),
      'reactions', (select count(*) from public.club_reactions x join public.club_posts p on p.id = x.post_id where p.club_id = c and p.created_at > now() - interval '90 days'),
      'comments', (select count(*) from public.club_comments x join public.club_posts p on p.id = x.post_id where p.club_id = c and x.created_at > now() - interval '90 days'),
      'messages', (select count(*) from public.club_messages where club_id = c and created_at > now() - interval '90 days')),
    -- Activity by weekday (0 = Sunday) and part of day over 90 days: check-ins, chat messages and event check-ins (Dhaka time).
    'heatmap', (select coalesce(json_agg(json_build_object('d', d, 'p', p, 'n', n)), '[]') from (
        select extract(dow from t)::int d, case when extract(hour from t) < 12 then 0 when extract(hour from t) < 17 then 1 when extract(hour from t) < 21 then 2 else 3 end p, count(*) n
        from (select a.at at time zone 'Asia/Dhaka' t from public.club_attendance a where a.club_id = c and a.at > now() - interval '90 days'
              union all select x.created_at at time zone 'Asia/Dhaka' from public.club_messages x where x.club_id = c and x.created_at > now() - interval '90 days'
              union all select r.checked_in_at at time zone 'Asia/Dhaka' from public.form_responses r join public.events e on e.form_id = r.form_id where e.club_id = c and r.checked_in_at > now() - interval '90 days') z
        group by 1, 2) h),
    -- Members who joined in the last 12 months: still active, inactive (30+ days quiet) or left.
    'retention', (select json_build_object(
        'active', count(*) filter (where m.status = 'active' and (exists (select 1 from public.club_attendance a where a.club_id = c and a.user_id = m.user_id and a.at > now() - interval '30 days')
                                                                 or exists (select 1 from public.club_messages x where x.club_id = c and x.author_id = m.user_id and x.created_at > now() - interval '30 days') or m.joined_at > now() - interval '30 days')),
        'joined', count(*), 'left', count(*) filter (where m.status <> 'active'))
      from public.club_members m where m.club_id = c and m.joined_at > now() - interval '12 months'),
    -- Share of members still in the club N months after joining (only cohorts old enough to measure).
    'retention_trend', (select coalesce(json_agg(json_build_object('m', k, 'pct', pct) order by k), '[]') from (
        select k, round(100.0 * count(*) filter (where m.left_at is null or m.left_at >= m.joined_at + make_interval(months => k)) / nullif(count(*), 0)) pct
        from unnest(array[1, 2, 3, 6, 9, 12]) k cross join public.club_members m
        where m.club_id = c and m.joined_at < now() - make_interval(months => k) group by k) t where pct is not null),
    'event_kinds', (select coalesce(json_object_agg(kind, n), '{}') from (select kind, count(*) n from public.events where club_id = c group by 1) z),
    'monthly_participants', (select coalesce(json_agg(json_build_object('m', to_char(g, 'YYYY-MM'), 'n', (select count(distinct r.user_id) from public.form_responses r join public.events e on e.form_id = r.form_id where e.club_id = c and r.created_at >= g and r.created_at < g + interval '1 month')) order by g), '[]')
      from generate_series(date_trunc('month', now()) - interval '11 months', date_trunc('month', now()), interval '1 month') g));
end $$;
grant execute on function public.club_analytics_extra(uuid) to authenticated;
