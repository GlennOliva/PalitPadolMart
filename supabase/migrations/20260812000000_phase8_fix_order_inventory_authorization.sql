-- ============================================================================
-- PHASE 8 FIX — ORDER INVENTORY AUTHORIZATION
-- ============================================================================
-- ROOT CAUSE
-- ---------
-- The Phase 4 trigger `enforce_active_seller_listing_ops()` blocks a trusted
-- order transaction. create_marketplace_order() / cancel_marketplace_order()
-- are SECURITY DEFINER (so RLS is bypassed and the SELECT ... FOR UPDATE /
-- inventory mutations run as the table owner), but BEFORE UPDATE triggers still
-- fire. That trigger's ownership guard assumes ANY listings UPDATE is a direct
-- seller-management operation:
--
--     if new.seller_id is distinct from public.auth_seller_id() then
--       raise exception 'not authorized to manage this listing';
--     end if;
--
-- When a normal buyer places an order, auth_seller_id() (resolved from
-- auth.uid()) is NULL, so `new.seller_id IS DISTINCT FROM NULL` is true and the
-- legitimate inventory decrement raises "not authorized to manage this
-- listing" — aborting the whole purchase.
--
-- FIX (safe database-side distinction)
-- ------------------------------------
-- The trusted definer RPCs set a TRANSACTION-LOCAL marker immediately before
-- the inventory mutation, and only AFTER every authorization check:
--
--     perform set_config('app.trusted_inventory_update', 'on', true);
--
-- `true` makes the value LOCAL to the current transaction. The trigger honors
-- that marker ONLY to skip the ownership (identity) check. The active-seller
-- guard and the active-listing-quantity guard still run for every mutation, so
-- even the trusted path cannot manage a listing whose seller is not active or
-- leave an active listing at zero stock.
--
-- WHY THIS IS NOT SPOOFABLE
-- -------------------------
-- * Direct clients cannot set the marker: PostgREST never maps request headers
--   to arbitrary GUC names (only the server-managed `request.*` namespace), and
--   a transaction-local value set via set_config cannot survive across the
--   request/transaction boundary. Each PostgREST request is its own transaction.
-- * Even if the marker were somehow set, direct non-owner UPDATEs are still
--   blocked at the RLS layer (`listings_update_own_or_admin` requires
--   seller_id = auth_seller_id(), which is NULL for a buyer) — the marker only
--   relaxes the trigger's redundant identity guard, never RLS.
-- * The marker is set only by the two trusted order RPCs, after they have
--   verified auth.uid(), listing eligibility, active seller, active buyer,
--   self-purchase, stock, and fulfillment — all from trusted DB rows.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Trigger: skip ONLY the ownership guard for the trusted inventory marker
-- ----------------------------------------------------------------------------
create or replace function public.enforce_active_seller_listing_ops()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  seller_status_val public.seller_status;
begin
  if public.is_admin() then
    return new;
  end if;

  -- Trusted transaction-local inventory mutation (order create/cancel RPCs).
  -- Skips ONLY the ownership check. The seller-status and quantity guards
  -- below still apply, so the trusted path cannot manage a listing for a
  -- non-active seller or leave an active listing with zero stock.
  if not (current_setting('app.trusted_inventory_update', true) = 'on')
     and new.seller_id is distinct from public.auth_seller_id() then
    raise exception 'not authorized to manage this listing';
  end if;

  select sp.seller_status into seller_status_val
  from public.seller_profiles sp
  where sp.id = new.seller_id;

  if seller_status_val is null then
    raise exception 'seller profile not found';
  end if;

  if seller_status_val <> 'active' then
    raise exception 'only active sellers can manage listings';
  end if;

  -- A listing may only be advertised when it has stock to sell.
  if new.listing_status = 'active' and coalesce(new.quantity, 0) <= 0 then
    raise exception 'a listing must have quantity greater than zero to be active';
  end if;

  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- 2. create_marketplace_order: mark the inventory decrement as trusted
-- ----------------------------------------------------------------------------
create or replace function public.create_marketplace_order(
  p_listing_id uuid,
  p_quantity integer,
  p_fulfillment_type public.fulfillment_type,
  p_notes text default null,
  p_expected_unit_price numeric default null
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_buyer uuid := auth.uid();
  v_account_status public.account_status;
  v_listing public.listings%rowtype;
  v_seller_status public.seller_status;
  v_seller_user uuid;
  v_notes text := nullif(trim(coalesce(p_notes, '')), '');
  v_unit_price numeric(12, 2);
  v_subtotal numeric(12, 2);
  v_order public.orders;
begin
  if v_buyer is null then
    raise exception 'AUTH_REQUIRED: sign in to place an order';
  end if;

  select account_status into v_account_status
  from public.profiles
  where id = v_buyer;

  if v_account_status is distinct from 'active' then
    raise exception 'ACCOUNT_UNAVAILABLE: your account must be active to place an order';
  end if;

  if p_quantity < 1 or p_quantity > 1000 then
    raise exception 'INVALID_QUANTITY: quantity must be between 1 and 1000';
  end if;

  -- Lock the listing row so concurrent purchases serialize on inventory.
  select * into v_listing
  from public.listings
  where id = p_listing_id
  for update;

  if not found then
    raise exception 'LISTING_NOT_FOUND: listing does not exist';
  end if;

  if v_listing.listing_status <> 'active' then
    raise exception 'LISTING_UNAVAILABLE: this listing is no longer available';
  end if;

  -- Seller must be an active seller.
  select seller_status into v_seller_status
  from public.seller_profiles
  where id = v_listing.seller_id;

  if v_seller_status is distinct from 'active' then
    raise exception 'SELLER_UNAVAILABLE: this seller cannot receive orders';
  end if;

  -- A seller cannot purchase their own listing. auth_seller_id() is NULL for
  -- non-sellers, and `NULL = NULL` is NULL (falsy), so buyers are unaffected.
  if v_listing.seller_id = public.auth_seller_id() then
    raise exception 'SELF_PURCHASE_NOT_ALLOWED: you cannot buy your own listing';
  end if;

  -- Fulfillment must be something the listing actually offers.
  if p_fulfillment_type = 'pickup' and not coalesce(v_listing.pickup_available, false) then
    raise exception 'INVALID_FULFILLMENT: this listing does not offer pickup';
  end if;
  if p_fulfillment_type = 'delivery' and not coalesce(v_listing.delivery_available, false) then
    raise exception 'INVALID_FULFILLMENT: this listing does not offer delivery';
  end if;

  -- The buyer may pass the price they saw; it is a comparison, never trusted.
  if p_expected_unit_price is not null and p_expected_unit_price <> v_listing.price then
    raise exception 'PRICE_CHANGED: the price changed since you viewed it';
  end if;

  if v_listing.quantity < p_quantity then
    raise exception 'INSUFFICIENT_STOCK: only % in stock', v_listing.quantity;
  end if;

  if v_notes is not null and length(v_notes) > 2000 then
    raise exception 'INVALID_NOTES: notes must be 2000 characters or fewer';
  end if;

  v_unit_price := v_listing.price;
  v_subtotal := v_unit_price * p_quantity;

  insert into public.orders (
    order_number,
    buyer_id,
    seller_id,
    status,
    fulfillment_type,
    subtotal,
    total,
    notes
  ) values (
    'PP-' || to_char(now(), 'YYYYMMDD') || '-' || lpad(nextval('public.order_number_seq')::text, 5, '0'),
    v_buyer,
    v_listing.seller_id,
    'pending',
    p_fulfillment_type,
    v_subtotal,
    v_subtotal,
    v_notes
  )
  returning * into v_order;

  -- Historical snapshot: title, unit price, quantity stay stable forever.
  insert into public.order_items (order_id, listing_id, seller_id, product_title, unit_price, quantity)
  values (v_order.id, v_listing.id, v_listing.seller_id, v_listing.title, v_unit_price, p_quantity);

  -- Decrement inventory; zero stock takes the listing off the marketplace.
  -- This is a trusted inventory mutation on behalf of a (non-owner) buyer, so
  -- it is marked with the transaction-local trusted-inventory marker that the
  -- listing trigger consults before enforcing its ownership guard.
  perform set_config('app.trusted_inventory_update', 'on', true);
  update public.listings
  set quantity = listings.quantity - p_quantity,
      listing_status = case when listings.quantity - p_quantity <= 0 then 'sold' else listing_status end
  where id = v_listing.id;

  -- Order event for the Phase 14 analytics/recommendation pipeline.
  insert into public.recommendation_events (user_id, listing_id, event_type, payload)
  values (v_buyer, p_listing_id, 'order', jsonb_build_object('order_id', v_order.id));

  -- Notify the seller that a new order arrived.
  select user_id into v_seller_user
  from public.seller_profiles
  where id = v_listing.seller_id;

  perform public.notify_user(
    v_seller_user,
    'order',
    'New order',
    'Order ' || v_order.order_number || ' is awaiting your confirmation.',
    'order',
    v_order.id
  );

  return v_order;
end;
$$;

-- ----------------------------------------------------------------------------
-- 3. cancel_marketplace_order: mark the inventory restore as trusted
-- ----------------------------------------------------------------------------
create or replace function public.cancel_marketplace_order(
  p_order_id uuid
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_seller uuid := public.auth_seller_id();
  v_order public.orders;
  v_quantity integer;
  v_listing_id uuid;
  v_recipient uuid;
begin
  if v_caller is null then
    raise exception 'AUTH_REQUIRED: sign in to cancel an order';
  end if;

  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'ORDER_NOT_FOUND: order does not exist';
  end if;

  -- The buyer or the owning seller may cancel. NULL-safe: a non-participant's
  -- ids never match either arm.
  if v_order.buyer_id is distinct from v_caller
     and v_order.seller_id is distinct from v_seller then
    raise exception 'FORBIDDEN: you are not a participant of this order';
  end if;

  -- A second cancel on the same order is rejected, so the inventory restore
  -- below can never run twice.
  if v_order.status is distinct from 'pending' then
    raise exception 'ORDER_NOT_CANCELLABLE: only pending orders can be cancelled';
  end if;

  -- Return the ordered quantity to the listing. Single-listing model, but sum
  -- defensively so future multi-item orders still restore correctly.
  select coalesce(sum(quantity), 0), min(listing_id)
  into v_quantity, v_listing_id
  from public.order_items
  where order_id = p_order_id;

  -- Trusted inventory restore: a buyer (or the seller) cancelling must be able
  -- to return stock even though the buyer is not the listing owner. Marked with
  -- the transaction-local trusted-inventory marker for the listing trigger.
  if v_listing_id is not null then
    perform set_config('app.trusted_inventory_update', 'on', true);
    update public.listings
    set quantity = listings.quantity + v_quantity,
        listing_status = case
          when listing_status = 'sold' and listings.quantity + v_quantity > 0 then 'active'
          else listing_status
        end
    where id = v_listing_id;
  end if;

  update public.orders
  set status = 'cancelled'
  where id = p_order_id
  returning * into v_order;

  -- Notify the other participant.
  if v_order.buyer_id = v_caller then
    select user_id into v_recipient
    from public.seller_profiles
    where id = v_order.seller_id;
  else
    v_recipient := v_order.buyer_id;
  end if;

  perform public.notify_user(
    v_recipient,
    'order',
    'Order cancelled',
    'Order ' || v_order.order_number || ' was cancelled.',
    'order',
    v_order.id
  );

  return v_order;
end;
$$;
