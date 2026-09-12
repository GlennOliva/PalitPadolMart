-- ============================================================================
-- PHASE 8 — CART AND MULTI-SELLER CHECKOUT
-- ============================================================================
-- Builds the persistent shopping cart and the atomic multi-seller checkout on
-- top of the Phase 8 order layer:
--
--   1. carts / cart_items          — one cart per buyer; a cart holds listings
--      from any number of sellers. Cart rows are buyer-scoped through RLS, so
--      no seller (or other buyer) can ever read or write them.
--   2. my_cart()                   — get-or-create the caller's cart (race-safe
--      via the unique buyer_id and ON CONFLICT DO NOTHING).
--   3. add_to_cart()               — validates the listing is active and the
--      seller is active, blocks self-purchase, clamps the requested quantity
--      to available stock (and 1000), and increments an existing cart line
--      instead of inserting a duplicate. Cart time does NOT reserve stock.
--   4. update_cart_item_quantity() — ownership-checked quantity change, clamped
--      to current stock (stock can drop between add and checkout).
--   5. checkout_cart()             — the multi-seller checkout. Accepts the
--      selected cart_item ids, a per-seller fulfillment map, and optional
--      expected prices. Locks every involved listing row (deterministic
--      order, FOR UPDATE) so concurrent checkouts serialize on inventory,
--      re-validates everything, then creates ONE order per seller with its
--      own snapshot order_items, decrements inventory, emits notifications +
--      recommendation events, and removes the checked-out lines — all in a
--      single transaction (all-or-nothing). Anything invalid raises a
--      structured `CODE: message` exception and nothing is persisted.
--
-- Model decision: no checkout_batches table. The orders already share an
-- atomic transaction and created_at timestamp; a separate grouping table
-- (and a column on orders) would duplicate that for little UX gain. The
-- buyer history can group "placed together" orders by timestamp if needed.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Carts + cart items
-- ----------------------------------------------------------------------------
create table if not exists public.carts (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null unique references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.cart_items (
  id uuid primary key default gen_random_uuid(),
  cart_id uuid not null references public.carts(id) on delete cascade,
  listing_id uuid not null references public.listings(id) on delete cascade,
  quantity integer not null default 1 check (quantity between 1 and 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cart_id, listing_id)
);

create index if not exists idx_cart_items_listing on public.cart_items (listing_id);

alter table public.carts enable row level security;
alter table public.cart_items enable row level security;

create trigger carts_set_updated_at
  before update on public.carts
  for each row execute function public.set_updated_at();

create trigger cart_items_set_updated_at
  before update on public.cart_items
  for each row execute function public.set_updated_at();

-- RLS: a cart (and its lines) belongs to exactly one buyer.
create policy "carts_select_own_or_admin" on public.carts
  for select using (buyer_id = auth.uid() or public.is_admin());

create policy "carts_insert_own" on public.carts
  for insert with check (buyer_id = auth.uid());

create policy "carts_update_own" on public.carts
  for update using (buyer_id = auth.uid()) with check (buyer_id = auth.uid());

create policy "carts_delete_own" on public.carts
  for delete using (buyer_id = auth.uid());

create policy "cart_items_select_own_or_admin" on public.cart_items
  for select using (
    exists (
      select 1 from public.carts c
      where c.id = cart_items.cart_id
        and (c.buyer_id = auth.uid() or public.is_admin())
    )
  );

create policy "cart_items_insert_own" on public.cart_items
  for insert with check (
    exists (
      select 1 from public.carts c
      where c.id = cart_items.cart_id
        and c.buyer_id = auth.uid()
    )
  );

create policy "cart_items_update_own" on public.cart_items
  for update using (
    exists (
      select 1 from public.carts c
      where c.id = cart_items.cart_id
        and c.buyer_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.carts c
      where c.id = cart_items.cart_id
        and c.buyer_id = auth.uid()
    )
  );

create policy "cart_items_delete_own" on public.cart_items
  for delete using (
    exists (
      select 1 from public.carts c
      where c.id = cart_items.cart_id
        and c.buyer_id = auth.uid()
    )
  );

-- ----------------------------------------------------------------------------
-- 2. my_cart() — race-safe get-or-create
-- ----------------------------------------------------------------------------
create or replace function public.my_cart()
returns public.carts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cart public.carts;
begin
  if auth.uid() is null then
    return null;
  end if;

  insert into public.carts (buyer_id) values (auth.uid())
  on conflict (buyer_id) do nothing;

  select * into v_cart
  from public.carts
  where buyer_id = auth.uid();

  return v_cart;
end;
$$;

-- ----------------------------------------------------------------------------
-- 3. add_to_cart() — validate + clamp + increment
-- ----------------------------------------------------------------------------
create or replace function public.add_to_cart(
  p_listing_id uuid,
  p_quantity integer default 1
)
returns public.cart_items
language plpgsql
security definer
set search_path = public
as $$
declare
  v_buyer uuid := auth.uid();
  v_account_status public.account_status;
  v_listing public.listings%rowtype;
  v_cart public.carts%rowtype;
  v_quantity integer;
  v_item public.cart_items;
begin
  if v_buyer is null then
    raise exception 'AUTH_REQUIRED: sign in to use the cart';
  end if;

  select account_status into v_account_status
  from public.profiles
  where id = v_buyer;

  if v_account_status is distinct from 'active' then
    raise exception 'ACCOUNT_UNAVAILABLE: your account must be active to shop';
  end if;

  if p_quantity < 1 or p_quantity > 1000 then
    raise exception 'INVALID_QUANTITY: quantity must be between 1 and 1000';
  end if;

  select * into v_listing
  from public.listings
  where id = p_listing_id
  for update;

  if not found then
    raise exception 'LISTING_NOT_FOUND: listing does not exist';
  end if;

  if v_listing.listing_status is distinct from 'active' then
    raise exception 'LISTING_UNAVAILABLE: this listing is no longer available';
  end if;

  if v_listing.seller_id = public.auth_seller_id() then
    raise exception 'SELF_PURCHASE_NOT_ALLOWED: you cannot buy your own listing';
  end if;

  if v_listing.quantity < 1 then
    raise exception 'INSUFFICIENT_STOCK: this listing is out of stock';
  end if;

  -- Clamp to available stock (and the hard 1000 cap). Cart time never
  -- reserves stock; checkout re-validates against a locked inventory row.
  v_quantity := least(p_quantity, v_listing.quantity, 1000);

  select * into v_cart from public.carts where buyer_id = v_buyer;
  if v_cart.id is null then
    insert into public.carts (buyer_id) values (v_buyer) returning * into v_cart;
  end if;

  -- Increment the existing line when the same listing is added again.
  insert into public.cart_items (cart_id, listing_id, quantity)
  values (v_cart.id, p_listing_id, v_quantity)
  on conflict (cart_id, listing_id)
  do update set quantity = least(cart_items.quantity + excluded.quantity, v_listing.quantity, 1000)
  returning * into v_item;

  return v_item;
end;
$$;

-- ----------------------------------------------------------------------------
-- 4. update_cart_item_quantity() — ownership + live-stock clamp
-- ----------------------------------------------------------------------------
create or replace function public.update_cart_item_quantity(
  p_cart_item_id uuid,
  p_quantity integer
)
returns public.cart_items
language plpgsql
security definer
set search_path = public
as $$
declare
  v_buyer uuid := auth.uid();
  v_item public.cart_items;
  v_listing public.listings%rowtype;
  v_new_quantity integer;
begin
  if v_buyer is null then
    raise exception 'AUTH_REQUIRED: sign in to use the cart';
  end if;

  if p_quantity < 1 or p_quantity > 1000 then
    raise exception 'INVALID_QUANTITY: quantity must be between 1 and 1000';
  end if;

  -- Only the owner may touch a line (cart scope enforced by the join).
  select ci.* into v_item
  from public.cart_items ci
  join public.carts c on c.id = ci.cart_id
  where ci.id = p_cart_item_id
    and c.buyer_id = v_buyer
  for update of ci;

  if not found then
    raise exception 'CART_ITEM_NOT_FOUND: that item is not in your cart';
  end if;

  select * into v_listing
  from public.listings
  where id = v_item.listing_id
  for update;

  if not found or v_listing.listing_status is distinct from 'active' then
    raise exception 'LISTING_UNAVAILABLE: this item is no longer available';
  end if;

  if v_listing.quantity < 1 then
    raise exception 'INSUFFICIENT_STOCK: this listing is out of stock';
  end if;

  v_new_quantity := least(p_quantity, v_listing.quantity, 1000);

  update public.cart_items
  set quantity = v_new_quantity
  where id = p_cart_item_id
  returning * into v_item;

  return v_item;
end;
$$;

-- ----------------------------------------------------------------------------
-- 5. checkout_cart() — atomic multi-seller checkout
-- ----------------------------------------------------------------------------
create or replace function public.checkout_cart(
  p_cart_item_ids uuid[],
  p_fulfillments jsonb default null,
  p_expected_prices jsonb default null
)
returns table (
  order_id uuid,
  order_number text,
  seller_id uuid,
  status public.order_status,
  fulfillment_type public.fulfillment_type,
  subtotal numeric(12,2),
  total numeric(12,2),
  item_count integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_buyer uuid := auth.uid();
  v_account_status public.account_status;
  v_cart_id uuid;
  v_selected integer := cardinality(p_cart_item_ids);
  v_item record;
  v_order public.orders%rowtype;
  v_seller record;
  v_fulfillment public.fulfillment_type;
  v_expected numeric;
  v_item_count integer := 0;
begin
  if v_buyer is null then
    raise exception 'AUTH_REQUIRED: sign in to check out';
  end if;

  select account_status into v_account_status
  from public.profiles
  where id = v_buyer;

  if v_account_status is distinct from 'active' then
    raise exception 'ACCOUNT_UNAVAILABLE: your account must be active to check out';
  end if;

  if p_cart_item_ids is null or v_selected < 1 then
    raise exception 'NO_ITEMS_SELECTED: choose at least one item to check out';
  end if;

  if v_selected > 100 then
    raise exception 'TOO_MANY_ITEMS: you can check out 100 items at a time';
  end if;

  -- Get-or-create the buyer's cart.
  insert into public.carts (buyer_id) values (v_buyer)
  on conflict (buyer_id) do nothing;

  select id into v_cart_id
  from public.carts
  where buyer_id = v_buyer;

  if v_cart_id is null then
    raise exception 'CART_EMPTY: your cart is empty';
  end if;

  -- Stage the selected lines joined to trusted listing + seller rows, locking
  -- every involved listing row in one deterministic statement so concurrent
  -- checkouts serialize on inventory instead of deadlocking.
  create temp table _cart_checkout (
    cart_item_id uuid,
    listing_id uuid,
    quantity integer,
    title text,
    unit_price numeric(12,2),
    listing_status public.listing_status,
    stock integer,
    pickup_available boolean,
    delivery_available boolean,
    seller_id uuid,
    seller_status public.seller_status,
    seller_user_id uuid,
    fulfillment public.fulfillment_type
  ) on commit drop;

  insert into _cart_checkout (
    cart_item_id, listing_id, quantity, title, unit_price, listing_status,
    stock, pickup_available, delivery_available, seller_id, seller_status, seller_user_id
  )
  select ci.id, ci.listing_id, ci.quantity, l.title, l.price, l.listing_status,
         l.quantity, l.pickup_available, l.delivery_available, l.seller_id,
         sp.seller_status, sp.user_id
  from public.cart_items ci
  join public.listings l on l.id = ci.listing_id
  join public.seller_profiles sp on sp.id = l.seller_id
  where ci.cart_id = v_cart_id
    and ci.id = any(p_cart_item_ids)
  order by l.id
  for update of l;

  select count(*) into v_item_count from _cart_checkout;
  if v_item_count is distinct from v_selected then
    raise exception 'FORBIDDEN: some of those items are not in your cart';
  end if;

  -- Validate every staged line against trusted rows.
  for v_item in select * from _cart_checkout order by listing_id loop
    if v_item.listing_status is distinct from 'active' then
      raise exception 'LISTING_UNAVAILABLE: % is no longer available', v_item.title;
    end if;

    if v_item.seller_status is distinct from 'active' then
      raise exception 'SELLER_UNAVAILABLE: the seller of % is not accepting orders', v_item.title;
    end if;

    if v_item.seller_id = public.auth_seller_id() then
      raise exception 'SELF_PURCHASE_NOT_ALLOWED: you cannot buy your own listing (%)', v_item.title;
    end if;

    if v_item.quantity < 1 or v_item.quantity > 1000 then
      raise exception 'INVALID_QUANTITY: quantity must be between 1 and 1000';
    end if;

    if v_item.stock < v_item.quantity then
      raise exception 'INSUFFICIENT_STOCK: only % in stock for %', v_item.stock, v_item.title;
    end if;

    -- The price the buyer saw is a comparison, never trusted.
    if p_expected_prices is not null and p_expected_prices ? v_item.cart_item_id::text then
      v_expected := (p_expected_prices ->> v_item.cart_item_id::text)::numeric;
      if v_expected is distinct from v_item.unit_price then
        raise exception 'PRICE_CHANGED: the price of % changed since you viewed it', v_item.title;
      end if;
    end if;

    -- Per-seller fulfillment choice (one choice applies to a seller's order).
    if p_fulfillments is null or not p_fulfillments ? v_item.seller_id::text then
      raise exception 'INVALID_FULFILLMENT: choose a fulfillment option for every seller';
    end if;

    v_fulfillment := (p_fulfillments ->> v_item.seller_id::text)::public.fulfillment_type;

    update _cart_checkout
    set fulfillment = v_fulfillment
    where cart_item_id = v_item.cart_item_id;
  end loop;

  -- The chosen fulfillment must be offered by EVERY selected item of its
  -- seller (all items of a seller ship in the same order).
  if exists (
    select 1 from _cart_checkout c
    where (c.fulfillment = 'pickup' and not c.pickup_available)
       or (c.fulfillment = 'delivery' and not c.delivery_available)
  ) then
    raise exception 'INVALID_FULFILLMENT: one of the selected items does not support the chosen fulfillment';
  end if;

  -- Create one order per seller with its own snapshot items. Every write is
  -- inside this single function, so the whole checkout is atomic.
  for v_seller in
    select c.seller_id, c.seller_user_id, c.fulfillment,
           count(*)::int as items,
           sum(c.unit_price * c.quantity)::numeric(12,2) as seller_subtotal
    from _cart_checkout c
    group by c.seller_id, c.seller_user_id, c.fulfillment
  loop
    insert into public.orders (
      order_number, buyer_id, seller_id, status, fulfillment_type, subtotal, total, notes
    ) values (
      'PP-' || to_char(now(), 'YYYYMMDD') || '-' || lpad(nextval('public.order_number_seq')::text, 5, '0'),
      v_buyer, v_seller.seller_id, 'pending', v_seller.fulfillment,
      v_seller.seller_subtotal, v_seller.seller_subtotal, null
    )
    returning * into v_order;

    for v_item in
      select * from _cart_checkout c
      where c.seller_id = v_seller.seller_id
      order by c.listing_id
    loop
      insert into public.order_items (
        order_id, listing_id, seller_id, product_title, unit_price, quantity
      ) values (
        v_order.id, v_item.listing_id, v_item.seller_id, v_item.title, v_item.unit_price, v_item.quantity
      );

      update public.listings
      set quantity = listings.quantity - v_item.quantity,
          listing_status = case when listings.quantity - v_item.quantity <= 0 then 'sold' else listing_status end
      where id = v_item.listing_id;

      insert into public.recommendation_events (user_id, listing_id, event_type, payload)
      values (v_buyer, v_item.listing_id, 'order', jsonb_build_object('order_id', v_order.id));
    end loop;

    perform public.notify_user(
      v_seller.seller_user_id,
      'order',
      'New order',
      'Order ' || v_order.order_number || ' is awaiting your confirmation.',
      'order',
      v_order.id
    );

    -- Remove only the checked-out lines; unselected items stay in the cart.
    delete from public.cart_items
    where cart_id = v_cart_id
      and id in (select c.cart_item_id from _cart_checkout c where c.seller_id = v_seller.seller_id);

    order_id := v_order.id;
    order_number := v_order.order_number;
    seller_id := v_order.seller_id;
    status := v_order.status;
    fulfillment_type := v_order.fulfillment_type;
    subtotal := v_order.subtotal;
    total := v_order.total;
    item_count := v_seller.items;
    return next;
  end loop;

  return;
end;
$$;

-- ----------------------------------------------------------------------------
-- 6. RPC execution grants
-- ----------------------------------------------------------------------------
grant execute on function public.my_cart() to authenticated;
grant execute on function public.add_to_cart(uuid, integer) to authenticated;
grant execute on function public.update_cart_item_quantity(uuid, integer) to authenticated;
grant execute on function public.checkout_cart(uuid[], jsonb, jsonb) to authenticated;
