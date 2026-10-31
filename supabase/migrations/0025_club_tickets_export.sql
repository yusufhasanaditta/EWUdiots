-- v2.15: "Download my data" includes event tickets (never the QR token).
create or replace function public.export_my_club_data() returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'exported_at', now(),
    'memberships', (select coalesce(json_agg(json_build_object('club', k.name, 'role', r.name, 'title', m.title, 'wing', m.wing, 'status', m.status, 'joined_at', m.joined_at, 'bio', m.bio, 'skills', m.skills, 'socials', m.socials, 'visibility', m.visibility)), '[]')
      from public.club_members m join public.clubs k on k.id = m.club_id join public.club_roles r on r.id = m.role_id where m.user_id = auth.uid()),
    'following', (select coalesce(json_agg(k.name), '[]') from public.club_follows f join public.clubs k on k.id = f.club_id where f.user_id = auth.uid()),
    'posts', (select coalesce(json_agg(json_build_object('club', club_id, 'title', title, 'body', body, 'created_at', created_at)), '[]') from public.club_posts where author_id = auth.uid()),
    'comments', (select coalesce(json_agg(json_build_object('post', post_id, 'body', body, 'created_at', created_at)), '[]') from public.club_comments where user_id = auth.uid()),
    'messages', (select coalesce(json_agg(json_build_object('channel', channel_id, 'body', body, 'created_at', created_at)), '[]') from public.club_messages where author_id = auth.uid() and not deleted),
    'registrations', (select coalesce(json_agg(json_build_object('form', f.title, 'status', r.status, 'answers', r.answers, 'phone', r.phone, 'created_at', r.created_at)), '[]')
      from public.form_responses r join public.club_forms f on f.id = r.form_id where r.user_id = auth.uid()),
    'tasks', (select coalesce(json_agg(json_build_object('title', title, 'status', status, 'due', due)), '[]') from public.club_tasks where assignee = auth.uid()),
    'polls_voted', (select count(*) from public.club_voted where user_id = auth.uid()),
    'attendance', (select count(*) from public.club_attendance where user_id = auth.uid()),
    'certificates', (select coalesce(json_agg(json_build_object('title', title, 'event', event, 'code', code, 'issued_on', issued_on)), '[]') from public.club_certificates where user_id = auth.uid()),
    'feedback', (select coalesce(json_agg(json_build_object('rating', rating, 'body', body, 'created_at', created_at)), '[]') from public.club_feedback where user_id = auth.uid()),
    'tickets', (select coalesce(json_agg(json_build_object('id', id, 'subject', subject, 'status', status, 'created_at', created_at)), '[]') from public.support_tickets where user_id = auth.uid()),
    'event_tickets', (select coalesce(json_agg(json_build_object('event', e.title, 'starts_at', e.starts_at, 'ticket', t.tier_name, 'price', t.price, 'code', t.code, 'status', t.status, 'payment', t.payment, 'transaction_id', t.pay_ref, 'checked_in_at', t.checked_in_at, 'created_at', t.created_at)), '[]')
      from public.club_tickets t join public.events e on e.id = t.event_id where t.user_id = auth.uid()));
$$;
revoke execute on function public.export_my_club_data() from public, anon; grant execute on function public.export_my_club_data() to authenticated;
