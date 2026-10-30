-- EWUdiots 0020: fix set_order_status (its note/eta parameters clashed with club_orders columns). Found by clubs-rls-check.
create or replace function public.set_order_status(oid uuid, st text, note text default '', eta date default null) returns public.club_orders
language plpgsql security definer set search_path = public as $$
declare o public.club_orders; refund boolean;
begin
  select * into o from public.club_orders where id = oid for update;
  if o.id is null or not public.club_can(o.club_id, 'orders.manage') then raise exception 'You don''t have permission to update orders'; end if;
  if st = o.status then return o; end if;
  if not public.order_next_ok(o.status, st) then raise exception 'An order can''t go from % to %', replace(o.status, '_', ' '), replace(st, '_', ' '); end if;
  if st in ('processing', 'ready') and o.payment_method <> 'cash' and o.payment_status <> 'verified' then raise exception 'Verify the payment first'; end if;
  refund := st = 'cancelled' and o.payment_status = 'verified';
  update public.club_orders set status = st, updated_at = now(), eta = coalesce(set_order_status.eta, public.club_orders.eta),
    processing_at = case when st = 'processing' then now() else processing_at end, ready_at = case when st = 'ready' then now() else ready_at end,
    completed_at = case when st = 'completed' then now() else completed_at end, cancelled_at = case when st = 'cancelled' then now() else cancelled_at end,
    cancel_reason = case when st = 'cancelled' then left(coalesce(set_order_status.note, ''), 300) else cancel_reason end,
    payment_status = case when st = 'completed' and payment_method = 'cash' then 'verified' else payment_status end,
    paid_at = case when st = 'completed' and payment_method = 'cash' then now() else paid_at end
  where id = oid returning * into o;
  if st = 'cancelled' then perform public.order_restock(o); end if;
  if refund then
    insert into public.club_returns (order_id, club_id, user_id, items, reason, details, status, refund_amount)
    values (o.id, o.club_id, o.user_id, o.items, 'cancelled', 'Order cancelled after payment', 'approved', o.total);
  end if;
  perform public.order_log(o, 'status.' || st, note);
  perform public.club_alert(o.user_id, o.club_id, 'order', case st when 'processing' then 'Preparing your order ' || o.code when 'ready' then 'Ready for pickup: ' || o.code
      when 'completed' then 'Picked up: ' || o.code when 'cancelled' then 'Order cancelled: ' || o.code else 'Order update: ' || o.code end,
    case st when 'ready' then 'Collect it at ' || o.pickup_point || '. Show your pickup QR and student ID.' when 'cancelled' then coalesce(nullif(note, ''), '') || case when refund then ' Your refund is on its way.' else '' end else coalesce(note, '') end,
    '#/club/order?id=' || o.id);
  return o;
end $$;
