-- ============================================================================
-- PHASE 8 FIX — ORDER CANCELLATION INVENTORY RESTORE
-- ============================================================================
-- Second bug surfaced by hosted verification (after the inventory-authorization
-- fix unblocked cancellation):
--
--     FAIL first cancellation succeeds — function min(uuid) does not exist
--
-- cancel_marketplace_order() picks the affected listing with
--
--     select coalesce(sum(quantity), 0), min(listing_id)
--
-- but PostgreSQL has no min()/max() aggregate for uuid. The whole cancellation
-- transaction then aborted, so stock was never restored, the order never
-- reached 'cancelled', and buyers could not delete it.
--
-- Fix: pick the (single) listing deterministically with array_agg(... ORDER BY
-- listing_id)[1], which uuid supports. The single-listing Phase 8 model always
-- has exactly one order_item per order, but the aggregation stays defensive so
-- a future multi-item order still resolves one listing correctly.
-- ============================================================================

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
  -- Note: uuid has no min()/max() aggregate; array_agg(... ORDER BY listing_id)
  -- resolves the listing deterministically instead.
  select coalesce(sum(quantity), 0),
         (array_agg(listing_id order by listing_id))[1]
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
