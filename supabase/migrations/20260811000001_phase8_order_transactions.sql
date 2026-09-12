-- ============================================================================
-- PHASE 8 — ORDER AND TRANSACTION SYSTEM
-- ============================================================================
-- Builds the trusted order layer on top of the Phase 1 commerce schema:
--
--   1. create_marketplace_order()     — atomic Buy Now. Locks the listing row
--      (SELECT ... FOR UPDATE), re-validates availability, snapshots the price
--      into order_items, decrements inventory, and emits an order notification
--      + recommendation event in one transaction. All money/stock decisions are
--      made in SQL from trusted rows; the client never sends buyer_id,
--      seller_id, unit price, subtotal, or total.
--   2. confirm_marketplace_order()    — seller-only, pending → confirmed.
--   3. cancel_marketplace_order()     — buyer OR owning seller, pending →
--      cancelled. Restores inventory exactly once; a second cancel is rejected
--      so stock can never be restored twice.
--   4. delete_my_cancelled_order()    — buyer-only, cancelled-only. Lets buyers
--      clear finished cancelled orders from their history (and lets the hosted
--      verification script clean up its rows). Active/confirmed orders can
--      never be deleted, preserving the transaction record.
--   5. Hardening — clients can no longer INSERT into orders directly (the
--      insert RLS policy is dropped) and can no longer UPDATE the status
--      column (column grant revoked; only `notes` stays client-writable). All
--      order status transitions now flow exclusively through the RPCs above.
--
-- All order RPCs are SECURITY DEFINER (secure search_path) because the
-- order_items / payments / fulfillment_details tables have no client write
-- policies and orders must be written atomically. Every function re-validates
-- the caller (auth.uid() / auth_seller_id()) with NULL-safe predicates and
-- raises structured `CODE: message` exceptions that the client parses.
--
-- Model decision: single-listing Buy Now. One order has exactly one
-- order_item. A purchase sets listing_status = 'sold' when the quantity drops
-- to zero; cancelling a pending order restores the stock and returns a sold
-- listing to 'active' (only when it has stock again). Payment records and
-- fulfillment details remain out of scope until Phase 9.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Order number sequence (human-friendly, unique, never reused)
-- ----------------------------------------------------------------------------
create sequence if not exists public.order_number_seq;

-- ----------------------------------------------------------------------------
-- 2. Notification helper
-- ----------------------------------------------------------------------------
-- Security definer (secure search_path) so any server-side flow can write a
-- notification; the notifications table has no client insert policy.
create or replace function public.notify_user(
  p_recipient_id uuid,
  p_type public.notification_type,
  p_title text,
  p_message text,
  p_related_entity_type text default null,
  p_related_entity_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_recipient_id is null then
    return;
  end if;
  insert into public.notifications (
    recipient_id, type, title, message, related_entity_type, related_entity_id
  ) values (
    p_recipient_id, p_type, p_title, p_message, p_related_entity_type, p_related_entity_id
  );
end;
$$;

-- ----------------------------------------------------------------------------
-- 3. Atomic order creation
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
-- 4. Seller confirmation (pending → confirmed)
-- ----------------------------------------------------------------------------
create or replace function public.confirm_marketplace_order(
  p_order_id uuid
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seller uuid := public.auth_seller_id();
  v_order public.orders;
  v_buyer_user uuid;
begin
  if v_seller is null then
    raise exception 'FORBIDDEN: only the seller can confirm this order';
  end if;

  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'ORDER_NOT_FOUND: order does not exist';
  end if;

  if v_order.seller_id is distinct from v_seller then
    raise exception 'FORBIDDEN: only the seller can confirm this order';
  end if;

  if v_order.status is distinct from 'pending' then
    raise exception 'ORDER_NOT_CONFIRMABLE: only pending orders can be confirmed';
  end if;

  update public.orders
  set status = 'confirmed'
  where id = p_order_id
  returning * into v_order;

  select user_id into v_buyer_user
  from public.seller_profiles
  where id = v_order.seller_id;

  perform public.notify_user(
    v_order.buyer_id,
    'order',
    'Order confirmed',
    'The seller confirmed order ' || v_order.order_number || '.',
    'order',
    v_order.id
  );

  return v_order;
end;
$$;

-- ----------------------------------------------------------------------------
-- 5. Cancellation (pending → cancelled) with exactly-once inventory restore
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

  if v_listing_id is not null then
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

-- ----------------------------------------------------------------------------
-- 6. Buyer-only deletion of finished cancelled orders
-- ----------------------------------------------------------------------------
-- Lets a buyer remove a cancelled order from their own history. Only the buyer
-- who owns a CANCELLED order may delete it — active/confirmed orders must keep
-- their transaction record. This also lets hosted verification clean up after
-- itself instead of accumulating test rows.
create or replace function public.delete_my_cancelled_order(
  p_order_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_order public.orders%rowtype;
begin
  if v_caller is null then
    raise exception 'AUTH_REQUIRED: sign in to delete an order';
  end if;

  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'ORDER_NOT_FOUND: order does not exist';
  end if;

  if v_order.buyer_id is distinct from v_caller then
    raise exception 'FORBIDDEN: only the buyer can delete this order';
  end if;

  if v_order.status is distinct from 'cancelled' then
    raise exception 'ORDER_NOT_DELETABLE: only cancelled orders can be deleted';
  end if;

  delete from public.orders where id = p_order_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- 7. Hardening: orders are created and transitioned via RPCs only
-- ----------------------------------------------------------------------------
-- Direct client INSERT is removed entirely: an order (and its snapshots) can
-- only come into being through create_marketplace_order(), which derives
-- seller, price, and totals from trusted rows.
drop policy if exists "orders_insert_buyer" on public.orders;

-- The status column is no longer client-writable; transitions go through
-- confirm/cancel RPCs. `notes` stays writable so participants can annotate.
revoke update (status) on public.orders from authenticated;

-- ----------------------------------------------------------------------------
-- 8. Pagination indexes for the buyer/seller order history lists
-- ----------------------------------------------------------------------------
create index if not exists idx_orders_buyer_created
  on public.orders (buyer_id, created_at desc);

create index if not exists idx_orders_seller_created
  on public.orders (seller_id, created_at desc);

-- ----------------------------------------------------------------------------
-- 9. RPC execution grants (authenticated browsers)
-- ----------------------------------------------------------------------------
grant execute on function public.notify_user(uuid, public.notification_type, text, text, text, uuid) to authenticated;
grant execute on function public.create_marketplace_order(uuid, integer, public.fulfillment_type, text, numeric) to authenticated;
grant execute on function public.confirm_marketplace_order(uuid) to authenticated;
grant execute on function public.cancel_marketplace_order(uuid) to authenticated;
grant execute on function public.delete_my_cancelled_order(uuid) to authenticated;
