-- ============================================================================
-- PHASE 8 FIX — CART CHECKOUT INVENTORY AUTHORIZATION
-- ============================================================================
-- ROOT CAUSE
-- ---------
-- checkout_cart() (created in 20260814000000_phase8_cart_and_checkout.sql)
-- decrements listings inventory inside a SECURITY DEFINER RPC, exactly like
-- create_marketplace_order(). But unlike the order RPC it never set the
-- transaction-local trusted-inventory marker, so the Phase 4 trigger
-- `enforce_active_seller_listing_ops()` applied its ownership guard and aborted
-- the legitimate buyer checkout with "not authorized to manage this listing".
--
-- The single-product flow was already fixed in
-- 20260812000000_phase8_fix_order_inventory_authorization.sql; this migration
-- extends the SAME mechanism to the multi-seller checkout path.
--
-- FIX (safe database-side distinction)
-- ------------------------------------
-- checkout_cart() now performs:
--
--     perform set_config('app.trusted_inventory_update', 'on', true);
--
-- immediately before the per-seller order/inventory loop — and ONLY after
-- every authorization check has passed: auth.uid() validated, buyer account
-- active, selected line ownership proven (FORBIDDEN otherwise), every listing
-- loaded and locked (deterministic ORDER BY l.id ... FOR UPDATE), listing +
-- seller eligibility validated, self-purchase rejected, fulfillment choices
-- validated, expected prices validated, and stock validated. No client input
-- can set the marker (see the 20260812000000 header for the full spoofing
-- analysis): it is transaction-local, set by the trusted definer RPC alone, and
-- even when set, ordinary non-owner browser UPDATEs are still denied by RLS
-- (`listings_update_own_or_admin`).
--
-- Because every write in checkout_cart() lives inside this single function
-- (single transaction), the marker covers ALL selected listings for ALL sellers
-- at once: any failure anywhere rolls back the whole checkout — no partial
-- seller orders, no partial inventory mutations.
--
-- ZERO-STOCK ADD CONTRACT (documented, not changed)
-- ------------------------------------------------
-- The Phase 4 invariant is "an active listing always has quantity > 0", and
-- both order RPCs flip a listing to `sold` the moment stock hits zero. So a
-- listing that is out of stock is by definition not `active`, and add_to_cart()
-- checks listing_status BEFORE quantity: it returns
--
--     LISTING_UNAVAILABLE: this listing is no longer available
--
-- for sold/out-of-stock listings (matching create_marketplace_order()). The
-- INSUFFICIENT_STOCK branch in add_to_cart() is defensive dead code — an active
-- listing can never have quantity < 1. This is the canonical, intended error
-- contract and the hosted verifier asserts exactly that.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. checkout_cart: mark the trusted inventory mutation
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

  -- Every authorization check has passed and every listing row is locked.
  -- From here on the only writes are trusted inventory mutations (listing
  -- decrements, order + order_item inserts, notification/recommendation rows,
  -- checked-out cart line removal) that all roll back together on any failure.
  -- Mark the transaction so the listing trigger skips ONLY its ownership guard
  -- (the active-seller and quantity guards still apply to every mutation).
  perform set_config('app.trusted_inventory_update', 'on', true);

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
-- 2. RPC execution grant (unchanged — re-asserted for the recreated function)
-- ----------------------------------------------------------------------------
grant execute on function public.checkout_cart(uuid[], jsonb, jsonb) to authenticated;
