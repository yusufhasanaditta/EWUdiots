-- EWUdiots 0019: club merchandise store, orders, pickups, returns and refunds; sponsors; club collaborations (v2.14).
-- Payments are made outside the app (bKash / Nagad / Rocket to the club's number, or cash at pickup). The buyer types the
-- transaction ID and a manager with payments.verify checks it in their own app before the order moves on. Nothing here
-- moves money. Prices, stock and coupons are always computed in the database (place_order), never trusted from the app.

-- ───────────────────────── Products ─────────────────────────
create table public.club_products (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs on delete cascade,
  name text not null check (length(name) between 2 and 80),
  category text not null default 'other' check (category in ('tshirts', 'hoodies', 'jerseys', 'caps', 'accessories', 'stickers', 'other')),
  description text not null default '' check (length(description) <= 3000),
  features text[] not null default '{}' check (cardinality(features) <= 8), -- "Premium fabric", "Unisex fit"
  price numeric(10, 2) not null check (price > 0 and price < 1000000),
  compare_at numeric(10, 2) check (compare_at is null or compare_at > price),
  images text[] not null default '{}' check (cardinality(images) <= 6),
  sizes text[] not null default '{}' check (cardinality(sizes) <= 10),
  colors jsonb not null default '[]'::jsonb check (jsonb_typeof(colors) = 'array' and jsonb_array_length(colors) <= 10), -- [{ name, hex }]
  track_stock boolean not null default true,
  stock jsonb not null default '{}'::jsonb check (jsonb_typeof(stock) = 'object'), -- { "M|Black": 8, "L|Black": 15 } or { "": 40 } without options
  badge text not null default '' check (badge in ('', 'popular', 'new', 'limited')),
  preorder boolean not null default false,
  drop_at timestamptz, -- "Coming soon" until then
  sku text not null default '' check (length(sku) <= 40),
  status text not null default 'draft' check (status in ('draft', 'active', 'archived')),
  sold int not null default 0,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index club_products_club on public.club_products (club_id, status);
alter table public.club_products enable row level security;
create policy "read products" on public.club_products for select using (
  public.club_can(club_id, 'store.manage') or public.club_can(club_id, 'orders.manage')
  or (status = 'active' and public.club_feature(club_id, 'store') and exists (select 1 from public.clubs k where k.id = club_id and k.status = 'active')));
create policy "write products" on public.club_products for all to authenticated
  using (public.club_can(club_id, 'store.manage') and public.club_feature(club_id, 'store'))
  with check (public.club_can(club_id, 'store.manage') and public.club_feature(club_id, 'store') and not exists (select 1 from unnest(images) i where i !~ '^https://'));
create or replace function public.club_product_stamp() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.sold <> old.sold and auth.uid() is not null and current_setting('ewud.order', true) is distinct from '1' then new.sold := old.sold; end if;
  new.updated_at := now();
  return new;
end $$;
revoke execute on function public.club_product_stamp() from public, anon, authenticated;
create trigger club_product_stamp before insert or update on public.club_products for each row execute function public.club_product_stamp();
/* Stock key for a size/colour choice ("M|Black", "|Black", "M|", or "" for a plain product). */
create or replace function public.stock_key(sz text, col text) returns text language sql immutable as $$ select coalesce(sz, '') || '|' || coalesce(col, '') $$;

create table public.club_coupons (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs on delete cascade,
  code text not null check (code ~ '^[A-Z0-9-]{3,20}$'),
  percent int check (percent is null or percent between 1 and 90),
  amount numeric(10, 2) check (amount is null or amount > 0),
  max_uses int check (max_uses is null or max_uses > 0),
  used int not null default 0,
  expires_at timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (club_id, code),
  check ((percent is null) <> (amount is null))
);
alter table public.club_coupons enable row level security;
create policy "manage coupons" on public.club_coupons for all to authenticated using (public.club_can(club_id, 'store.manage')) with check (public.club_can(club_id, 'store.manage'));

-- ───────────────────────── Orders ─────────────────────────
create sequence if not exists public.club_order_seq start 7801;
create sequence if not exists public.club_return_seq start 1001;
create table public.club_orders (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default ('EWU-' || to_char(now(), 'YYYY') || '-' || nextval('public.club_order_seq')),
  club_id uuid not null references public.clubs on delete restrict,
  user_id uuid not null references auth.users (id) on delete cascade,
  buyer_name text not null default '', buyer_email text not null default '', buyer_phone text not null default '', student_id text not null default '',
  items jsonb not null check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) between 1 and 20), -- [{ product_id, name, size, color, qty, price, image }]
  subtotal numeric(10, 2) not null, discount numeric(10, 2) not null default 0, delivery_fee numeric(10, 2) not null default 0, total numeric(10, 2) not null,
  coupon text not null default '',
  pickup_point text not null default '' check (length(pickup_point) <= 120),
  payment_method text not null check (payment_method in ('bkash', 'nagad', 'rocket', 'cash')),
  payment_ref text not null default '' check (length(payment_ref) <= 40),
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid', 'submitted', 'verified', 'rejected')),
  status text not null default 'pending_payment' check (status in ('pending_payment', 'confirmed', 'processing', 'ready', 'completed', 'cancelled')),
  pickup_token text not null unique default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  note text not null default '' check (length(note) <= 300),
  cancel_reason text not null default '' check (length(cancel_reason) <= 300),
  eta date,
  confirmed_at timestamptz, processing_at timestamptz, ready_at timestamptz, completed_at timestamptz, cancelled_at timestamptz, paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index club_orders_club on public.club_orders (club_id, created_at desc);
create index club_orders_user on public.club_orders (user_id, created_at desc);
alter table public.club_orders enable row level security;
-- Reads only; every change goes through the RPCs below.
create policy "read orders" on public.club_orders for select to authenticated using (user_id = auth.uid() or public.club_can(club_id, 'orders.manage') or public.club_can(club_id, 'refunds.approve'));

create table public.club_order_events (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.club_orders on delete cascade,
  club_id uuid not null references public.clubs on delete cascade,
  actor uuid references auth.users (id) on delete set null default auth.uid(),
  actor_name text not null default '',
  action text not null check (length(action) between 2 and 40),
  detail text not null default '' check (length(detail) <= 500),
  internal boolean not null default false, -- staff notes the buyer doesn't see
  at timestamptz not null default now()
);
create index club_order_events_order on public.club_order_events (order_id, at);
alter table public.club_order_events enable row level security;
create policy "read order events" on public.club_order_events for select to authenticated using (public.club_can(club_id, 'orders.manage') or public.club_can(club_id, 'refunds.approve')
  or (not internal and exists (select 1 from public.club_orders o where o.id = order_id and o.user_id = auth.uid())));
create or replace function public.order_log(o public.club_orders, act text, det text default '', internal boolean default false) returns void
language sql security definer set search_path = public as $$
  insert into public.club_order_events (order_id, club_id, actor, actor_name, action, detail, internal)
  values (o.id, o.club_id, auth.uid(), coalesce(public.club_me() ->> 'name', ''), act, left(coalesce(det, ''), 500), internal);
$$;
revoke execute on function public.order_log(public.club_orders, text, text, boolean) from public, anon, authenticated;
-- Managers of a club get a heads-up (orders.manage).
create or replace function public.order_alert_staff(o public.club_orders, t text, b text) returns void
language sql security definer set search_path = public as $$
  insert into public.club_notifications (user_id, club_id, kind, title, body, link)
  select m.user_id, o.club_id, 'order', left(t, 160), left(b, 1000), '#/club/orderadmin?id=' || o.id
  from public.club_members m join public.club_roles r on r.id = m.role_id
  where m.club_id = o.club_id and m.status = 'active' and m.user_id <> o.user_id and ('*' = any (r.perms) or 'orders.manage' = any (r.perms)) and r.rank >= 2;
$$;
revoke execute on function public.order_alert_staff(public.club_orders, text, text) from public, anon, authenticated;

-- Allowed status moves (src/clubs/orders.js mirrors this; a unit test keeps them equal).
create or replace function public.order_next_ok(cur text, nxt text) returns boolean language sql immutable as $$
  select (cur, nxt) in (('pending_payment', 'confirmed'), ('pending_payment', 'cancelled'), ('confirmed', 'processing'), ('confirmed', 'cancelled'),
    ('processing', 'ready'), ('processing', 'cancelled'), ('processing', 'confirmed'), ('ready', 'completed'), ('ready', 'processing'), ('ready', 'cancelled'));
$$;

-- Put items back on the shelf (cancel).
create or replace function public.order_restock(o public.club_orders) returns void
language plpgsql security definer set search_path = public as $$
declare it jsonb; k text;
begin
  perform set_config('ewud.order', '1', true);
  for it in select * from jsonb_array_elements(o.items) loop
    k := public.stock_key(it ->> 'size', it ->> 'color');
    update public.club_products set sold = greatest(sold - (it ->> 'qty')::int, 0),
      stock = case when track_stock and stock ? k then jsonb_set(stock, array[k], to_jsonb(coalesce((stock ->> k)::int, 0) + (it ->> 'qty')::int)) else stock end
    where id = (it ->> 'product_id')::uuid;
  end loop;
end $$;
revoke execute on function public.order_restock(public.club_orders) from public, anon, authenticated;

/* Place an order. items: [{ product_id, size, color, qty }]. Returns the order. */
create or replace function public.place_order(c uuid, items jsonb, method text, ref text default '', pickup text default '', phone text default '', coupon text default '', note text default '') returns public.club_orders
language plpgsql security definer set search_path = public as $$
declare k public.clubs; me jsonb := public.club_me(); it jsonb; p public.club_products; key text; qty int; lines jsonb := '[]'; sub numeric := 0; disc numeric := 0;
  cp public.club_coupons; o public.club_orders; ph text := regexp_replace(coalesce(phone, ''), '[^0-9+]', '', 'g'); pts jsonb; nums jsonb; pick text;
begin
  if auth.uid() is null then raise exception 'Sign in to order'; end if;
  select * into k from public.clubs where id = c and status = 'active';
  if k.id is null or not public.club_feature(c, 'store') then raise exception 'This club''s store isn''t open'; end if;
  if (select count(*) from public.club_orders where user_id = auth.uid() and created_at > now() - interval '1 day') >= 10 then raise exception 'You''ve placed a lot of orders today. Try again tomorrow.'; end if;
  if ph !~ '^(\+?88)?01[3-9]\d{8}$' then raise exception 'Enter a Bangladeshi mobile number like 01712345678'; end if;
  if jsonb_typeof(items) <> 'array' or jsonb_array_length(items) = 0 or jsonb_array_length(items) > 20 then raise exception 'Your cart is empty'; end if;
  nums := coalesce(k.store_settings -> 'payment_numbers', '{}');
  if method not in ('bkash', 'nagad', 'rocket', 'cash') then raise exception 'Choose a payment method'; end if;
  if method = 'cash' and coalesce((k.store_settings ->> 'allow_cash')::boolean, true) = false then raise exception 'This club doesn''t take cash at pickup'; end if;
  if method <> 'cash' and coalesce(nums ->> method, '') = '' then raise exception 'This club doesn''t take % payments', initcap(method); end if;
  pts := coalesce(k.store_settings -> 'pickup_points', '[]');
  pick := case when jsonb_array_length(pts) = 0 then coalesce(nullif(trim(pickup), ''), 'EWU campus') when pts ? trim(coalesce(pickup, '')) then trim(pickup) else null end;
  if pick is null then raise exception 'Choose a pickup point'; end if;
  perform set_config('ewud.order', '1', true);
  for it in select * from jsonb_array_elements(items) loop
    qty := coalesce((it ->> 'qty')::int, 0);
    if qty < 1 or qty > 10 then raise exception 'Quantity must be between 1 and 10'; end if;
    select * into p from public.club_products where id = (it ->> 'product_id')::uuid and club_id = c for update;
    if p.id is null or p.status <> 'active' then raise exception 'An item in your cart is no longer for sale'; end if;
    if p.drop_at is not null and p.drop_at > now() and not p.preorder then raise exception '% isn''t available yet', p.name; end if;
    if cardinality(p.sizes) > 0 and not ((it ->> 'size') = any (p.sizes)) then raise exception 'Choose a size for %', p.name; end if;
    if jsonb_array_length(p.colors) > 0 and not exists (select 1 from jsonb_array_elements(p.colors) x where x ->> 'name' = it ->> 'color') then raise exception 'Choose a colour for %', p.name; end if;
    key := public.stock_key(case when cardinality(p.sizes) > 0 then it ->> 'size' end, case when jsonb_array_length(p.colors) > 0 then it ->> 'color' end);
    if key = '|' then key := ''; end if;
    if p.track_stock and not p.preorder then
      if coalesce((p.stock ->> key)::int, 0) < qty then raise exception 'Only % left of % %', coalesce((p.stock ->> key)::int, 0), p.name, nullif(replace(key, '|', ' '), ' '); end if;
      update public.club_products set stock = jsonb_set(stock, array[key], to_jsonb((stock ->> key)::int - qty)), sold = sold + qty where id = p.id;
    else
      update public.club_products set sold = sold + qty where id = p.id;
    end if;
    lines := lines || jsonb_build_object('product_id', p.id, 'name', p.name, 'size', coalesce(it ->> 'size', ''), 'color', coalesce(it ->> 'color', ''), 'qty', qty, 'price', p.price, 'image', coalesce(p.images[1], ''), 'category', p.category);
    sub := sub + p.price * qty;
  end loop;
  if coalesce(trim(coupon), '') <> '' then
    select * into cp from public.club_coupons where club_id = c and code = upper(trim(coupon)) for update;
    if cp.id is null or not cp.active or (cp.expires_at is not null and cp.expires_at < now()) or (cp.max_uses is not null and cp.used >= cp.max_uses) then raise exception 'That coupon code isn''t valid'; end if;
    disc := least(sub, coalesce(round(sub * cp.percent / 100.0, 2), cp.amount));
    update public.club_coupons set used = used + 1 where id = cp.id;
  end if;
  insert into public.club_orders (club_id, user_id, buyer_name, buyer_email, buyer_phone, student_id, items, subtotal, discount, total, coupon, pickup_point, payment_method, payment_ref, payment_status, status, note, confirmed_at)
  values (c, auth.uid(), me ->> 'name', me ->> 'email', ph, me ->> 'student_id', lines, sub, disc, sub - disc, coalesce(upper(trim(coupon)), ''), pick, method,
    case when method = 'cash' then '' else left(upper(trim(coalesce(ref, ''))), 40) end,
    case when method <> 'cash' and coalesce(trim(ref), '') <> '' then 'submitted' else 'unpaid' end,
    case when method = 'cash' then 'confirmed' else 'pending_payment' end, left(coalesce(note, ''), 300), case when method = 'cash' then now() end)
  returning * into o;
  perform public.order_log(o, 'placed', jsonb_array_length(lines) || ' item(s) · ৳' || o.total || ' · ' || initcap(method));
  perform public.order_alert_staff(o, 'New order ' || o.code, o.buyer_name || ' · ৳' || o.total || case when o.payment_status = 'submitted' then ' · payment to verify' else '' end);
  perform public.club_alert(auth.uid(), c, 'order', 'Order placed: ' || o.code, case when method = 'cash' then 'Pay at pickup. We''ll tell you when it''s ready.' else 'We''ll confirm once the club has checked your payment.' end, '#/club/order?id=' || o.id);
  return o;
end $$;

create or replace function public.submit_payment_ref(oid uuid, ref text) returns void
language plpgsql security definer set search_path = public as $$
declare o public.club_orders;
begin
  select * into o from public.club_orders where id = oid and user_id = auth.uid() for update;
  if o.id is null then raise exception 'Order not found'; end if;
  if o.payment_method = 'cash' or o.payment_status not in ('unpaid', 'rejected') or o.status = 'cancelled' then raise exception 'This order doesn''t need a payment reference now'; end if;
  if length(trim(coalesce(ref, ''))) < 6 then raise exception 'Enter the transaction ID from your payment message'; end if;
  update public.club_orders set payment_ref = left(upper(trim(ref)), 40), payment_status = 'submitted', updated_at = now() where id = oid returning * into o;
  perform public.order_log(o, 'payment.submitted', 'TrxID ' || o.payment_ref);
  perform public.order_alert_staff(o, 'Payment to verify: ' || o.code, initcap(o.payment_method) || ' · ' || o.payment_ref || ' · ৳' || o.total);
end $$;

create or replace function public.verify_payment(oid uuid, ok boolean, note text default '') returns void
language plpgsql security definer set search_path = public as $$
declare o public.club_orders;
begin
  select * into o from public.club_orders where id = oid for update;
  if o.id is null or not public.club_can(o.club_id, 'payments.verify') then raise exception 'You don''t have permission to verify payments'; end if;
  if o.status = 'cancelled' then raise exception 'This order was cancelled'; end if;
  update public.club_orders set payment_status = case when ok then 'verified' else 'rejected' end, paid_at = case when ok then now() end,
    status = case when ok and status = 'pending_payment' then 'confirmed' else status end, confirmed_at = case when ok and status = 'pending_payment' then now() else confirmed_at end, updated_at = now()
  where id = oid returning * into o;
  perform public.order_log(o, case when ok then 'payment.verified' else 'payment.rejected' end, note);
  perform public.club_alert(o.user_id, o.club_id, 'order', case when ok then 'Payment confirmed: ' || o.code else 'Payment not found: ' || o.code end,
    case when ok then 'Thanks! Your order is confirmed.' else coalesce(nullif(note, ''), 'We couldn''t find that transaction. Check the TrxID and send it again.') end, '#/club/order?id=' || o.id);
  perform public.club_log(o.club_id, case when ok then 'payment.verified' else 'payment.rejected' end, jsonb_build_object('order', o.code, 'ref', o.payment_ref));
end $$;

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
  update public.club_orders set status = st, updated_at = now(), eta = coalesce(eta, public.club_orders.eta),
    processing_at = case when st = 'processing' then now() else processing_at end, ready_at = case when st = 'ready' then now() else ready_at end,
    completed_at = case when st = 'completed' then now() else completed_at end, cancelled_at = case when st = 'cancelled' then now() else cancelled_at end,
    cancel_reason = case when st = 'cancelled' then left(coalesce(note, ''), 300) else cancel_reason end,
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
create or replace function public.bulk_order_status(ids uuid[], st text) returns int
language plpgsql security definer set search_path = public as $$
declare i uuid; n int := 0;
begin
  foreach i in array ids loop
    begin perform public.set_order_status(i, st); n := n + 1; exception when others then null; end;
  end loop;
  return n;
end $$;
-- The buyer may cancel before the club starts preparing it.
create or replace function public.cancel_my_order(oid uuid, reason text default '') returns void
language plpgsql security definer set search_path = public as $$
declare o public.club_orders;
begin
  select * into o from public.club_orders where id = oid and user_id = auth.uid() for update;
  if o.id is null then raise exception 'Order not found'; end if;
  if o.status not in ('pending_payment', 'confirmed') then raise exception 'The club has started on this order. Ask them for help instead.'; end if;
  update public.club_orders set status = 'cancelled', cancelled_at = now(), cancel_reason = left(coalesce(reason, 'Cancelled by buyer'), 300), updated_at = now() where id = oid returning * into o;
  perform public.order_restock(o);
  if o.payment_status = 'verified' then
    insert into public.club_returns (order_id, club_id, user_id, items, reason, details, status, refund_amount) values (o.id, o.club_id, o.user_id, o.items, 'cancelled', 'Cancelled by the buyer after payment', 'approved', o.total);
  end if;
  perform public.order_log(o, 'cancelled.by_buyer', reason);
  perform public.order_alert_staff(o, 'Order cancelled: ' || o.code, coalesce(nullif(reason, ''), 'Cancelled by the buyer'));
end $$;
-- Pickup desk: scan the buyer's QR (ewud:o:<token>). Completes a ready order. Returns what to hand over.
create or replace function public.scan_pickup(tok text) returns json
language plpgsql security definer set search_path = public as $$
declare o public.club_orders;
begin
  select * into o from public.club_orders where pickup_token = regexp_replace(trim(tok), '^ewud:o:', '');
  if o.id is null or not public.club_can(o.club_id, 'orders.manage') then raise exception 'No order with that pickup code for your club'; end if;
  if o.status = 'completed' then raise exception 'Already picked up (%).', to_char(o.completed_at at time zone 'Asia/Dhaka', 'DD Mon, HH12:MI AM'); end if;
  if o.status <> 'ready' then raise exception 'This order isn''t ready yet (%).', replace(o.status, '_', ' '); end if;
  o := public.set_order_status(o.id, 'completed', 'Picked up (QR)');
  return json_build_object('id', o.id, 'code', o.code, 'buyer', o.buyer_name, 'student_id', o.student_id, 'items', o.items, 'total', o.total, 'cash', o.payment_method = 'cash');
end $$;
create or replace function public.add_order_note(oid uuid, note text) returns void
language plpgsql security definer set search_path = public as $$
declare o public.club_orders;
begin
  select * into o from public.club_orders where id = oid;
  if o.id is null or not public.club_can(o.club_id, 'orders.manage') then raise exception 'Not allowed'; end if;
  perform public.order_log(o, 'note', note, true);
end $$;

-- ───────────────────────── Returns and refunds ─────────────────────────
create table public.club_returns (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default ('RET-' || nextval('public.club_return_seq')),
  order_id uuid not null references public.club_orders on delete cascade,
  club_id uuid not null references public.clubs on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  items jsonb not null default '[]'::jsonb check (jsonb_typeof(items) = 'array'),
  reason text not null check (reason in ('wrong_size', 'damaged', 'wrong_item', 'not_as_described', 'changed_mind', 'cancelled', 'other')),
  details text not null default '' check (length(details) <= 1000),
  evidence text[] not null default '{}' check (cardinality(evidence) <= 4), -- clubs-private/<club>/returns/<user>/…
  status text not null default 'requested' check (status in ('requested', 'approved', 'rejected', 'refunded')),
  decision_note text not null default '' check (length(decision_note) <= 500),
  refund_amount numeric(10, 2) check (refund_amount is null or refund_amount >= 0),
  refund_method text not null default '' check (refund_method in ('', 'bkash', 'nagad', 'rocket', 'cash', 'exchange')),
  refund_ref text not null default '' check (length(refund_ref) <= 40),
  decided_by uuid references auth.users (id) on delete set null, decided_at timestamptz,
  refunded_by uuid references auth.users (id) on delete set null, refunded_at timestamptz,
  created_at timestamptz not null default now()
);
create index club_returns_club on public.club_returns (club_id, status, created_at desc);
alter table public.club_returns enable row level security;
create policy "read returns" on public.club_returns for select to authenticated using (user_id = auth.uid() or public.club_can(club_id, 'orders.manage') or public.club_can(club_id, 'refunds.approve'));

create or replace function public.request_return(oid uuid, rsn text, det text default '', ev text[] default '{}', its jsonb default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare o public.club_orders; days int; rid uuid;
begin
  select * into o from public.club_orders where id = oid and user_id = auth.uid();
  if o.id is null then raise exception 'Order not found'; end if;
  if o.status <> 'completed' then raise exception 'You can ask for a return after you''ve picked the order up'; end if;
  days := coalesce((select (store_settings ->> 'return_days')::int from public.clubs where id = o.club_id), 7);
  if days = 0 or o.completed_at < now() - make_interval(days => days) then raise exception 'The % day return window for this order has passed', days; end if;
  if exists (select 1 from public.club_returns where order_id = oid and status in ('requested', 'approved')) then raise exception 'There''s already an open return for this order'; end if;
  if rsn not in ('wrong_size', 'damaged', 'wrong_item', 'not_as_described', 'changed_mind', 'other') then raise exception 'Choose a reason'; end if;
  if exists (select 1 from unnest(coalesce(ev, '{}')) e where e !~ ('^' || o.club_id || '/returns/' || auth.uid() || '/')) then raise exception 'Unexpected attachment'; end if;
  insert into public.club_returns (order_id, club_id, user_id, items, reason, details, evidence)
  values (oid, o.club_id, auth.uid(), coalesce(its, o.items), rsn, left(coalesce(det, ''), 1000), coalesce(ev[1:4], '{}')) returning id into rid;
  perform public.order_log(o, 'return.requested', replace(rsn, '_', ' '));
  perform public.order_alert_staff(o, 'Return requested: ' || o.code, replace(rsn, '_', ' ') || coalesce(' · ' || nullif(left(det, 120), ''), ''));
  return rid;
end $$;
create or replace function public.review_return(rid uuid, approve boolean, note text default '') returns void
language plpgsql security definer set search_path = public as $$
declare r public.club_returns; o public.club_orders;
begin
  select * into r from public.club_returns where id = rid for update;
  if r.id is null or not public.club_can(r.club_id, 'orders.manage') then raise exception 'You don''t have permission to review returns'; end if;
  if r.status <> 'requested' then raise exception 'This return was already reviewed'; end if;
  select * into o from public.club_orders where id = r.order_id;
  update public.club_returns set status = case when approve then 'approved' else 'rejected' end, decision_note = left(coalesce(note, ''), 500), decided_by = auth.uid(), decided_at = now(),
    refund_amount = case when approve then (select coalesce(sum((x ->> 'price')::numeric * (x ->> 'qty')::int), 0) from jsonb_array_elements(r.items) x) end where id = rid;
  perform public.order_log(o, case when approve then 'return.approved' else 'return.rejected' end, note);
  perform public.club_alert(r.user_id, r.club_id, 'order', case when approve then 'Return approved: ' || r.code else 'Return not approved: ' || r.code end, coalesce(note, ''), '#/club/order?id=' || r.order_id);
  perform public.club_log(r.club_id, case when approve then 'return.approved' else 'return.rejected' end, jsonb_build_object('return', r.code, 'order', o.code));
end $$;
-- Record a refund the treasurer has sent (outside the app). Logged in the finance book as an expense.
create or replace function public.record_refund(rid uuid, amt numeric, method text, ref text default '') returns void
language plpgsql security definer set search_path = public as $$
declare r public.club_returns; o public.club_orders; done numeric;
begin
  select * into r from public.club_returns where id = rid for update;
  if r.id is null or not public.club_can(r.club_id, 'refunds.approve') then raise exception 'Refunds need the refunds permission (Treasurer or above)'; end if;
  if r.status <> 'approved' then raise exception 'Approve the return first'; end if;
  if method not in ('bkash', 'nagad', 'rocket', 'cash', 'exchange') then raise exception 'Choose how you refunded'; end if;
  select * into o from public.club_orders where id = r.order_id;
  select coalesce(sum(refund_amount), 0) into done from public.club_returns where order_id = r.order_id and status = 'refunded';
  if amt < 0 or amt > o.total - done then raise exception 'Refund can''t be more than ৳%', o.total - done; end if;
  update public.club_returns set status = 'refunded', refund_amount = amt, refund_method = method, refund_ref = left(upper(trim(coalesce(ref, ''))), 40), refunded_by = auth.uid(), refunded_at = now() where id = rid;
  if amt > 0 then insert into public.club_finance (club_id, kind, amount, category, note) values (r.club_id, 'expense', amt, 'Refund', 'Refund ' || r.code || ' for ' || o.code); end if;
  perform public.order_log(o, 'refund.sent', '৳' || amt || ' · ' || initcap(method) || coalesce(' · ' || nullif(ref, ''), ''));
  perform public.club_alert(r.user_id, r.club_id, 'order', 'Refund sent: ৳' || amt, initcap(method) || coalesce(' · ' || nullif(ref, ''), '') || ' for ' || o.code, '#/club/order?id=' || o.id);
  perform public.club_log(r.club_id, 'refund.sent', jsonb_build_object('return', r.code, 'amount', amt));
end $$;
revoke execute on function public.place_order(uuid, jsonb, text, text, text, text, text, text), public.submit_payment_ref(uuid, text), public.verify_payment(uuid, boolean, text),
  public.set_order_status(uuid, text, text, date), public.bulk_order_status(uuid[], text), public.cancel_my_order(uuid, text), public.scan_pickup(text), public.add_order_note(uuid, text),
  public.request_return(uuid, text, text, text[], jsonb), public.review_return(uuid, boolean, text), public.record_refund(uuid, numeric, text, text) from public, anon;
grant execute on function public.place_order(uuid, jsonb, text, text, text, text, text, text), public.submit_payment_ref(uuid, text), public.verify_payment(uuid, boolean, text),
  public.set_order_status(uuid, text, text, date), public.bulk_order_status(uuid[], text), public.cancel_my_order(uuid, text), public.scan_pickup(text), public.add_order_note(uuid, text),
  public.request_return(uuid, text, text, text[], jsonb), public.review_return(uuid, boolean, text), public.record_refund(uuid, numeric, text, text) to authenticated;
-- Coupon check at checkout (doesn't use it up).
create or replace function public.check_coupon(c uuid, code text, subtotal numeric) returns numeric
language plpgsql stable security definer set search_path = public as $$
declare cp public.club_coupons;
begin
  select * into cp from public.club_coupons where club_id = c and club_coupons.code = upper(trim(check_coupon.code));
  if cp.id is null or not cp.active or (cp.expires_at is not null and cp.expires_at < now()) or (cp.max_uses is not null and cp.used >= cp.max_uses) then raise exception 'That coupon code isn''t valid'; end if;
  return least(subtotal, coalesce(round(subtotal * cp.percent / 100.0, 2), cp.amount));
end $$;
revoke execute on function public.check_coupon(uuid, text, numeric) from public, anon; grant execute on function public.check_coupon(uuid, text, numeric) to authenticated;

-- Merchandise dashboard numbers.
create or replace function public.store_stats(c uuid, months int default 6) returns json
language plpgsql stable security definer set search_path = public as $$
declare since timestamptz := date_trunc('month', now()) - make_interval(months => greatest(months, 1) - 1);
begin
  if not (public.club_can(c, 'store.manage') or public.club_can(c, 'orders.manage')) then raise exception 'Not allowed'; end if;
  return json_build_object(
    'sales', (select coalesce(sum(total), 0) from public.club_orders where club_id = c and status <> 'cancelled' and payment_status = 'verified'),
    'sales_prev', (select coalesce(sum(total), 0) from public.club_orders where club_id = c and status <> 'cancelled' and payment_status = 'verified' and created_at < now() - interval '30 days'),
    'orders', (select count(*) from public.club_orders where club_id = c),
    'orders_prev', (select count(*) from public.club_orders where club_id = c and created_at < now() - interval '30 days'),
    'units', (select coalesce(sum((x ->> 'qty')::int), 0) from public.club_orders o, jsonb_array_elements(o.items) x where o.club_id = c and o.status <> 'cancelled'),
    'units_prev', (select coalesce(sum((x ->> 'qty')::int), 0) from public.club_orders o, jsonb_array_elements(o.items) x where o.club_id = c and o.status <> 'cancelled' and o.created_at < now() - interval '30 days'),
    'products', (select count(*) from public.club_products where club_id = c and status = 'active'),
    'low_stock', (select coalesce(json_agg(t), '[]') from (select p.id, p.name, p.images[1] image, s.key, s.value::int n from public.club_products p, jsonb_each_text(p.stock) s
        where p.club_id = c and p.status = 'active' and p.track_stock and s.value::int <= coalesce((select (store_settings ->> 'low_stock')::int from public.clubs where id = c), 10) order by s.value::int limit 12) t),
    'status', (select coalesce(json_object_agg(status, n), '{}') from (select status, count(*) n from public.club_orders where club_id = c group by 1) x),
    'to_verify', (select count(*) from public.club_orders where club_id = c and payment_status = 'submitted' and status <> 'cancelled'),
    'returns_open', (select count(*) from public.club_returns where club_id = c and status in ('requested', 'approved')),
    'monthly', (select coalesce(json_agg(json_build_object('m', to_char(g, 'YYYY-MM'),
        'sales', (select coalesce(sum(total), 0) from public.club_orders o where o.club_id = c and o.status <> 'cancelled' and o.payment_status = 'verified' and o.created_at >= g and o.created_at < g + interval '1 month'),
        'orders', (select count(*) from public.club_orders o where o.club_id = c and o.created_at >= g and o.created_at < g + interval '1 month')) order by g), '[]')
      from generate_series(since, date_trunc('month', now()), interval '1 month') g),
    'top', (select coalesce(json_agg(t), '[]') from (select p.id, p.name, p.price, p.images[1] image, p.sold from public.club_products p where p.club_id = c order by p.sold desc, p.name limit 5) t),
    'by_category', (select coalesce(json_object_agg(cat, n), '{}') from (select x ->> 'category' cat, sum((x ->> 'qty')::int) n from public.club_orders o, jsonb_array_elements(o.items) x where o.club_id = c and o.status <> 'cancelled' group by 1) z));
end $$;
revoke execute on function public.store_stats(uuid, int) from public, anon; grant execute on function public.store_stats(uuid, int) to authenticated;

-- Storage: product images (store managers) and return evidence (the buyer's own folder).
create policy "club store images" on storage.objects for insert to authenticated with check (bucket_id = 'clubs-public' and (storage.foldername(name))[2] in ('products', 'sponsors', 'collabs')
  and (public.club_can(public.club_folder(name), 'store.manage') or public.club_can(public.club_folder(name), 'sponsors.manage') or public.club_can(public.club_folder(name), 'collab.manage')));
create policy "club store images delete" on storage.objects for delete to authenticated using (bucket_id = 'clubs-public' and (storage.foldername(name))[2] in ('products', 'sponsors', 'collabs')
  and (public.club_can(public.club_folder(name), 'store.manage') or public.club_can(public.club_folder(name), 'sponsors.manage') or public.club_can(public.club_folder(name), 'collab.manage')));
create policy "return evidence read" on storage.objects for select to authenticated using (bucket_id = 'clubs-private' and (storage.foldername(name))[2] = 'returns'
  and ((storage.foldername(name))[3] = auth.uid()::text or public.club_can(public.club_folder(name), 'orders.manage') or public.club_can(public.club_folder(name), 'refunds.approve')));
create policy "return evidence upload" on storage.objects for insert to authenticated with check (bucket_id = 'clubs-private' and (storage.foldername(name))[2] = 'returns' and (storage.foldername(name))[3] = auth.uid()::text);

-- ───────────────────────── Sponsors ─────────────────────────
create table public.sponsors (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 2 and 80),
  logo_url text not null default '' check (logo_url = '' or logo_url ~ '^https://'),
  industry text not null default 'Other' check (length(industry) between 2 and 40),
  kind text not null default 'sponsor' check (kind in ('sponsor', 'industry', 'media', 'supporter')),
  tagline text not null default '' check (length(tagline) <= 120),
  about text not null default '' check (length(about) <= 2000),
  website text not null default '' check (website = '' or website ~ '^https://'),
  email text not null default '' check (email = '' or email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  location text not null default '' check (length(location) <= 80),
  verified boolean not null default false,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  added_by uuid references auth.users (id) on delete set null default auth.uid(),
  added_club uuid references public.clubs on delete set null,
  created_at timestamptz not null default now()
);
alter table public.sponsors enable row level security;
create policy "read sponsors" on public.sponsors for select using (status = 'approved' or added_by = auth.uid() or public.can('clubs.manage') or (added_club is not null and public.club_can(added_club, 'sponsors.manage')));
create policy "add sponsors" on public.sponsors for insert to authenticated with check (added_by = auth.uid() and (public.can('clubs.manage') or (added_club is not null and public.club_can(added_club, 'sponsors.manage') and public.club_feature(added_club, 'sponsors'))));
create policy "edit sponsors" on public.sponsors for update to authenticated using (public.can('clubs.manage') or (added_by = auth.uid() and status = 'pending')) with check (public.can('clubs.manage') or (added_by = auth.uid() and status = 'pending'));
create policy "delete sponsors" on public.sponsors for delete to authenticated using (public.can('clubs.manage'));
create or replace function public.sponsor_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.can('clubs.manage') then
    new.verified := case when tg_op = 'UPDATE' then old.verified else false end;
    new.status := case when tg_op = 'UPDATE' then old.status else 'pending' end;
  end if;
  return new;
end $$;
revoke execute on function public.sponsor_guard() from public, anon, authenticated;
create trigger sponsor_guard before insert or update on public.sponsors for each row execute function public.sponsor_guard();

create table public.club_sponsor_packages (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs on delete cascade,
  name text not null check (length(name) between 2 and 40),
  amount numeric(12, 2) not null check (amount >= 0),
  perks text[] not null default '{}' check (cardinality(perks) <= 10),
  popular boolean not null default false,
  sort int not null default 0
);
alter table public.club_sponsor_packages enable row level security;
create policy "read packages" on public.club_sponsor_packages for select using (public.club_can(club_id, 'sponsors.manage') or (public.club_feature(club_id, 'sponsors') and exists (select 1 from public.clubs k where k.id = club_id and k.status = 'active')));
create policy "write packages" on public.club_sponsor_packages for all to authenticated using (public.club_can(club_id, 'sponsors.manage')) with check (public.club_can(club_id, 'sponsors.manage'));

create table public.club_sponsorships (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs on delete cascade,
  sponsor_id uuid not null references public.sponsors on delete cascade,
  event_id uuid references public.events on delete set null,
  package_id uuid references public.club_sponsor_packages on delete set null,
  title text not null check (length(title) between 2 and 140),
  amount numeric(12, 2) not null default 0 check (amount >= 0),
  status text not null default 'prospect' check (status in ('prospect', 'proposed', 'confirmed', 'received', 'declined')),
  notes text not null default '' check (length(notes) <= 2000),
  public boolean not null default true, -- show as a past collaboration on the sponsor's page (never the amount)
  participants int check (participants is null or participants >= 0),
  happened_on date,
  finance_id uuid references public.club_finance on delete set null,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
alter table public.club_sponsorships enable row level security;
create policy "read sponsorships" on public.club_sponsorships for select to authenticated using (public.club_can(club_id, 'sponsors.manage') or public.club_can(club_id, 'finance.view'));
create policy "write sponsorships" on public.club_sponsorships for all to authenticated using (public.club_can(club_id, 'sponsors.manage') and public.club_feature(club_id, 'sponsors')) with check (public.club_can(club_id, 'sponsors.manage') and public.club_feature(club_id, 'sponsors'));
-- Money received → one income line in the finance book.
create or replace function public.sponsorship_finance() returns trigger
language plpgsql security definer set search_path = public as $$
declare fid uuid;
begin
  if new.status = 'received' and new.amount > 0 and new.finance_id is null then
    insert into public.club_finance (club_id, kind, amount, category, note) values (new.club_id, 'income', new.amount, 'Sponsorship', left('Sponsorship: ' || (select name from public.sponsors where id = new.sponsor_id) || ' · ' || new.title, 300)) returning id into fid;
    new.finance_id := fid;
  end if;
  return new;
end $$;
revoke execute on function public.sponsorship_finance() from public, anon, authenticated;
create trigger sponsorship_finance before insert or update on public.club_sponsorships for each row execute function public.sponsorship_finance();
-- A sponsor's public page: who they worked with (no amounts).
create or replace function public.sponsor_profile(s uuid) returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'collaborations', (select coalesce(json_agg(t order by t.happened_on desc nulls last), '[]') from (select x.title, x.happened_on, x.participants, k.name club, k.slug, e.image, e.venue
        from public.club_sponsorships x join public.clubs k on k.id = x.club_id left join public.events e on e.id = x.event_id
        where x.sponsor_id = s and x.public and x.status in ('confirmed', 'received') and k.status = 'active') t),
    'clubs', (select count(distinct club_id) from public.club_sponsorships where sponsor_id = s and status in ('confirmed', 'received')),
    'events', (select count(*) from public.club_sponsorships where sponsor_id = s and status in ('confirmed', 'received')),
    'reached', (select coalesce(sum(participants), 0) from public.club_sponsorships where sponsor_id = s and status in ('confirmed', 'received')),
    'since', (select min(extract(year from coalesce(happened_on, created_at::date))) from public.club_sponsorships where sponsor_id = s and status in ('confirmed', 'received')))
  where exists (select 1 from public.sponsors where id = s and status = 'approved');
$$;
grant execute on function public.sponsor_profile(uuid) to anon, authenticated;

-- ───────────────────────── Club collaborations ─────────────────────────
create table public.club_collabs (
  id uuid primary key default gen_random_uuid(),
  lead_club uuid not null references public.clubs on delete cascade,
  title text not null check (length(title) between 3 and 120),
  description text not null default '' check (length(description) <= 4000),
  kind text not null default 'co_organized' check (kind in ('co_organized', 'event_partner', 'volunteers', 'resource_share', 'other')),
  seeking text not null default '' check (seeking in ('', 'partners', 'volunteers', 'sponsors')),
  event_type text not null default '' check (length(event_type) <= 60),
  audience text not null default 'All EWU students' check (length(audience) <= 80),
  cover_url text not null default '' check (cover_url = '' or cover_url ~ '^https://'),
  starts_at timestamptz, ends_at timestamptz,
  venue text not null default '' check (length(venue) <= 120),
  capacity int check (capacity is null or capacity between 1 and 20000),
  goals text[] not null default '{}' check (cardinality(goals) <= 8),
  tags text[] not null default '{}' check (cardinality(tags) <= 6),
  timeline jsonb not null default '[]'::jsonb check (jsonb_typeof(timeline) = 'array' and jsonb_array_length(timeline) <= 12), -- [{ title, from, to, done }]
  resources jsonb not null default '[]'::jsonb check (jsonb_typeof(resources) = 'array' and jsonb_array_length(resources) <= 12), -- [{ name, status: confirmed|in_progress|needed }]
  status text not null default 'open' check (status in ('open', 'planning', 'confirmed', 'completed', 'cancelled')),
  channel_id uuid references public.club_channels on delete set null,
  event_id uuid references public.events on delete set null,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index club_collabs_list on public.club_collabs (status, starts_at);
alter table public.club_collabs enable row level security;
alter table public.events add constraint events_collab_fk foreign key (collab_id) references public.club_collabs on delete set null;
create table public.club_collab_clubs (
  collab_id uuid not null references public.club_collabs on delete cascade,
  club_id uuid not null references public.clubs on delete cascade,
  status text not null default 'invited' check (status in ('lead', 'invited', 'requested', 'accepted', 'declined')),
  message text not null default '' check (length(message) <= 600),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  primary key (collab_id, club_id)
);
alter table public.club_collab_clubs enable row level security;
create table public.club_collab_interest (
  collab_id uuid not null references public.club_collabs on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  primary key (collab_id, user_id)
);
alter table public.club_collab_interest enable row level security;
create policy "read collabs" on public.club_collabs for select using (status <> 'cancelled' and exists (select 1 from public.clubs k where k.id = lead_club and k.status = 'active') or public.club_can(lead_club, 'collab.manage'));
create policy "add collabs" on public.club_collabs for insert to authenticated with check (created_by = auth.uid() and public.club_can(lead_club, 'collab.manage') and public.club_feature(lead_club, 'collab') and channel_id is null);
create policy "edit collabs" on public.club_collabs for update to authenticated using (public.club_can(lead_club, 'collab.manage')) with check (public.club_can(lead_club, 'collab.manage'));
create policy "delete collabs" on public.club_collabs for delete to authenticated using (public.club_can(lead_club, 'collab.manage'));
create policy "read collab clubs" on public.club_collab_clubs for select using (status in ('lead', 'accepted') or public.club_can(club_id, 'collab.manage')
  or exists (select 1 from public.club_collabs x where x.id = collab_id and public.club_can(x.lead_club, 'collab.manage')));
create policy "my interest" on public.club_collab_interest for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create or replace function public.collab_lead_row() returns trigger
language plpgsql security definer set search_path = public as $$
begin insert into public.club_collab_clubs (collab_id, club_id, status) values (new.id, new.lead_club, 'lead') on conflict do nothing; return new; end $$;
revoke execute on function public.collab_lead_row() from public, anon, authenticated;
create trigger collab_lead_row after insert on public.club_collabs for each row execute function public.collab_lead_row();
create or replace function public.collab_interested(x uuid) returns int language sql stable security definer set search_path = public as $$ select count(*)::int from public.club_collab_interest where collab_id = x $$;
grant execute on function public.collab_interested(uuid) to anon, authenticated;

-- The shared planning chat: executives (rank ≤ 4) of every club in the collaboration.
create or replace function public.collab_sync_channel(x uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare cb public.club_collabs; ch uuid;
begin
  select * into cb from public.club_collabs where id = x;
  ch := cb.channel_id;
  if ch is null then
    insert into public.club_channels (club_id, kind, name, icon, created_by) values (cb.lead_club, 'collab', left('Collab: ' || cb.title, 60), 'handshake', auth.uid()) returning id into ch;
    update public.club_collabs set channel_id = ch where id = x;
  end if;
  insert into public.club_channel_members (channel_id, user_id)
  select ch, m.user_id from public.club_collab_clubs cc join public.club_members m on m.club_id = cc.club_id join public.club_roles r on r.id = m.role_id
  where cc.collab_id = x and cc.status in ('lead', 'accepted') and m.status = 'active' and r.rank <= 4 on conflict do nothing;
  return ch;
end $$;
revoke execute on function public.collab_sync_channel(uuid) from public, anon, authenticated;
-- Lead invites a club, or a club asks to join; the other side accepts or declines.
create or replace function public.collab_invite(x uuid, c uuid, msg text default '') returns void
language plpgsql security definer set search_path = public as $$
declare cb public.club_collabs;
begin
  select * into cb from public.club_collabs where id = x;
  if cb.id is null or not public.club_can(cb.lead_club, 'collab.manage') then raise exception 'Only the lead club can invite clubs'; end if;
  if c = cb.lead_club or not exists (select 1 from public.clubs where id = c and status = 'active') then raise exception 'Choose another active club'; end if;
  insert into public.club_collab_clubs (collab_id, club_id, status, message) values (x, c, 'invited', left(coalesce(msg, ''), 600))
  on conflict (collab_id, club_id) do update set status = case when public.club_collab_clubs.status = 'accepted' then 'accepted' else 'invited' end, message = excluded.message, created_at = now();
  insert into public.club_notifications (user_id, club_id, kind, title, body, link)
  select m.user_id, c, 'other', 'Collaboration invite: ' || cb.title, (select name from public.clubs where id = cb.lead_club) || ' invited your club', '#/club/collab?id=' || x
  from public.club_members m join public.club_roles r on r.id = m.role_id where m.club_id = c and m.status = 'active' and ('*' = any (r.perms) or 'collab.manage' = any (r.perms));
end $$;
create or replace function public.collab_request(x uuid, c uuid, msg text default '') returns void
language plpgsql security definer set search_path = public as $$
declare cb public.club_collabs;
begin
  select * into cb from public.club_collabs where id = x and status in ('open', 'planning');
  if cb.id is null then raise exception 'This collaboration isn''t looking for partners'; end if;
  if not public.club_can(c, 'collab.manage') or not public.club_feature(c, 'collab') then raise exception 'You need collaboration rights in your club'; end if;
  if c = cb.lead_club then raise exception 'Your club is leading this one'; end if;
  insert into public.club_collab_clubs (collab_id, club_id, status, message) values (x, c, 'requested', left(coalesce(msg, ''), 600))
  on conflict (collab_id, club_id) do update set status = case when public.club_collab_clubs.status = 'accepted' then 'accepted' else 'requested' end, message = excluded.message, created_at = now();
  insert into public.club_notifications (user_id, club_id, kind, title, body, link)
  select m.user_id, cb.lead_club, 'other', 'Collaboration request: ' || cb.title, (select name from public.clubs where id = c) || ' wants to join', '#/club/collab?id=' || x
  from public.club_members m join public.club_roles r on r.id = m.role_id where m.club_id = cb.lead_club and m.status = 'active' and ('*' = any (r.perms) or 'collab.manage' = any (r.perms));
end $$;
create or replace function public.collab_respond(x uuid, c uuid, accept boolean) returns void
language plpgsql security definer set search_path = public as $$
declare cb public.club_collabs; cc public.club_collab_clubs;
begin
  select * into cb from public.club_collabs where id = x;
  select * into cc from public.club_collab_clubs where collab_id = x and club_id = c;
  if cc.collab_id is null then raise exception 'Nothing to answer'; end if;
  -- An invite is answered by the invited club; a request by the lead club.
  if not ((cc.status = 'invited' and public.club_can(c, 'collab.manage')) or (cc.status = 'requested' and public.club_can(cb.lead_club, 'collab.manage'))) then raise exception 'You can''t answer this for that club'; end if;
  update public.club_collab_clubs set status = case when accept then 'accepted' else 'declined' end, responded_at = now() where collab_id = x and club_id = c;
  if accept then perform public.collab_sync_channel(x); end if;
  perform public.club_log(cb.lead_club, case when accept then 'collab.accepted' else 'collab.declined' end, jsonb_build_object('collab', cb.title, 'club', (select name from public.clubs where id = c)));
end $$;
-- The lead club opens (or re-syncs) the shared planning chat.
create or replace function public.collab_open_chat(x uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare cb public.club_collabs;
begin
  select * into cb from public.club_collabs where id = x;
  if cb.id is null or not exists (select 1 from public.club_collab_clubs cc where cc.collab_id = x and cc.status in ('lead', 'accepted') and public.club_rank(cc.club_id) <= 4) then raise exception 'Only executives of the clubs involved can open the chat'; end if;
  return public.collab_sync_channel(x);
end $$;
revoke execute on function public.collab_invite(uuid, uuid, text), public.collab_request(uuid, uuid, text), public.collab_respond(uuid, uuid, boolean), public.collab_open_chat(uuid) from public, anon;
grant execute on function public.collab_invite(uuid, uuid, text), public.collab_request(uuid, uuid, text), public.collab_respond(uuid, uuid, boolean), public.collab_open_chat(uuid) to authenticated;

-- Platform: approve sponsors added by clubs.
create or replace function public.admin_review_sponsor(s uuid, approve boolean, verify boolean default false) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.can('clubs.manage') then raise exception 'Not allowed'; end if;
  update public.sponsors set status = case when approve then 'approved' else 'rejected' end, verified = approve and verify where id = s;
end $$;
revoke execute on function public.admin_review_sponsor(uuid, boolean, boolean) from public, anon; grant execute on function public.admin_review_sponsor(uuid, boolean, boolean) to authenticated;

-- My orders with the club's name (for "My orders").
create or replace function public.my_orders() returns table (id uuid, code text, club_id uuid, club_name text, club_slug text, items jsonb, total numeric, status text, payment_status text, payment_method text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select o.id, o.code, o.club_id, k.name, k.slug, o.items, o.total, o.status, o.payment_status, o.payment_method, o.created_at
  from public.club_orders o join public.clubs k on k.id = o.club_id where o.user_id = auth.uid() order by o.created_at desc limit 100;
$$;
revoke execute on function public.my_orders() from public, anon; grant execute on function public.my_orders() to authenticated;
