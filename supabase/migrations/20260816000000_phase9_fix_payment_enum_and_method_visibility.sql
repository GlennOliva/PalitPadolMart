-- ============================================================================
-- PHASE 9 — FIX: PAYMENT SUBMISSION ENUM CAST + BUYER METHOD VISIBILITY
-- ============================================================================
-- Fixes two defects in the deployed Phase 9 layer (20260815000100) found by
-- the live hosted verification:
--
--   1. submit_payment() raised SQLSTATE 42804
--      ("column \"status\" is of type payment_status but expression is of type
--      text"): the `case ... 'submitted' ... 'pending'` expressions produce
--      bare text that Postgres will not implicitly coerce to the enum when the
--      assignment comes from an expression (not a literal). Recreated with
--      explicit `::public.payment_status` casts in both the insert and the
--      update branches.
--
--   2. Buyers could not see a seller's enabled payment methods: the
--      `seller_payment_methods_select_enabled_active` policy validated the
--      seller's active status with `exists(select 1 from seller_profiles ...)`,
--      but seller_profiles RLS blocks that subquery for the buyer (they can
--      read only their own profile row). Replaced with a SECURITY DEFINER
--      helper `seller_is_active()` that checks only the public seller status —
--      the same pattern as is_admin()/auth_seller_id().
--
-- No schema shape changes: no new tables/columns/enums. Only a new helper
-- function (for the policy), a recreated policy, and a recreated RPC.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. seller_is_active() — RLS-safe seller status check for policies
-- ----------------------------------------------------------------------------
-- SECURITY DEFINER so the caller's RLS on seller_profiles cannot hide a public
-- seller-status fact from another policy. Returns a boolean only; it exposes
-- nothing beyond what public_seller_profiles already publishes.
create or replace function public.seller_is_active(p_seller_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.seller_profiles
    where id = p_seller_id
      and seller_status = 'active'
  );
$$;

grant execute on function public.seller_is_active(uuid) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- 2. Buyer-facing select policy uses the RLS-safe helper
-- ----------------------------------------------------------------------------
drop policy if exists "seller_payment_methods_select_enabled_active"
  on public.seller_payment_methods;

create policy "seller_payment_methods_select_enabled_active"
  on public.seller_payment_methods
  for select using (is_enabled and public.seller_is_active(seller_id));

-- ----------------------------------------------------------------------------
-- 3. submit_payment() — identical contract, enum-safe status assignment
-- ----------------------------------------------------------------------------
create or replace function public.submit_payment(
  p_order_id uuid,
  p_payment_method text,
  p_proof_path text default null,
  p_reference text default null,
  p_recipient_name text default null,
  p_phone text default null,
  p_address text default null,
  p_city text default null,
  p_province text default null,
  p_postal_code text default null,
  p_delivery_notes text default null
)
returns public.payments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_buyer uuid := auth.uid();
  v_order public.orders;
  v_existing public.payments%rowtype;
  v_seller public.seller_profiles%rowtype;
  v_payment public.payments;
  v_proof text := nullif(trim(coalesce(p_proof_path, '')), '');
  v_reference text := nullif(trim(coalesce(p_reference, '')), '');
  v_recipient text := nullif(trim(coalesce(p_recipient_name, '')), '');
  v_phone text := nullif(trim(coalesce(p_phone, '')), '');
  v_address text := nullif(trim(coalesce(p_address, '')), '');
  v_city text := nullif(trim(coalesce(p_city, '')), '');
  v_province text := nullif(trim(coalesce(p_province, '')), '');
  v_postal text := nullif(trim(coalesce(p_postal_code, '')), '');
  v_notes text := nullif(trim(coalesce(p_delivery_notes, '')), '');
  v_enabled boolean;
  v_status public.payment_status;
begin
  if v_buyer is null then
    raise exception 'AUTH_REQUIRED: sign in to pay';
  end if;

  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'ORDER_NOT_FOUND: order does not exist';
  end if;

  if v_order.buyer_id is distinct from v_buyer then
    raise exception 'FORBIDDEN: this order does not belong to you';
  end if;

  if v_order.status is distinct from 'confirmed' then
    raise exception 'INVALID_ORDER_STATUS: the seller must confirm the order before payment';
  end if;

  select * into v_existing
  from public.payments
  where order_id = p_order_id
  for update;

  if v_existing.id is not null and v_existing.status = 'paid' then
    raise exception 'PAYMENT_ALREADY_PAID: this order is already paid';
  end if;

  if p_payment_method not in ('manual_transfer', 'cash_on_pickup', 'cash_on_delivery') then
    raise exception 'PAYMENT_METHOD_UNAVAILABLE: that payment method is not supported';
  end if;

  if (p_payment_method = 'cash_on_pickup' and v_order.fulfillment_type is distinct from 'pickup')
     or (p_payment_method = 'cash_on_delivery' and v_order.fulfillment_type is distinct from 'delivery') then
    raise exception 'INVALID_PAYMENT_METHOD: that payment method does not match this order fulfillment';
  end if;

  select is_enabled into v_enabled
  from public.seller_payment_methods
  where seller_id = v_order.seller_id
    and method = p_payment_method;

  if not coalesce(v_enabled, false) then
    raise exception 'PAYMENT_METHOD_UNAVAILABLE: this seller does not accept that payment method';
  end if;

  if p_payment_method = 'manual_transfer' and v_proof is null then
    raise exception 'PAYMENT_PROOF_REQUIRED: upload your payment proof to submit';
  end if;

  if p_payment_method <> 'manual_transfer' and v_proof is not null then
    raise exception 'INVALID_PAYMENT_PROOF: cash payments do not use proof upload';
  end if;

  if v_proof is not null and split_part(v_proof, '/', 1) <> v_buyer::text then
    raise exception 'INVALID_PAYMENT_PROOF: proof path does not belong to you';
  end if;

  if v_reference is not null and length(v_reference) > 120 then
    raise exception 'INVALID_REFERENCE: reference must be 120 characters or fewer';
  end if;

  if v_order.fulfillment_type = 'delivery' then
    if v_recipient is null or v_phone is null or v_address is null or v_city is null or v_province is null then
      raise exception 'DELIVERY_ADDRESS_REQUIRED: fill in the delivery recipient and address';
    end if;
    if length(coalesce(p_recipient_name, '')) > 120
       or length(coalesce(p_phone, '')) > 30
       or length(coalesce(p_address, '')) > 300
       or length(coalesce(p_city, '')) > 80
       or length(coalesce(p_province, '')) > 80
       or length(coalesce(p_postal_code, '')) > 20
       or length(coalesce(p_delivery_notes, '')) > 500 then
      raise exception 'INVALID_DELIVERY_ADDRESS: one of the delivery fields is too long';
    end if;
  end if;

  select * into v_seller
  from public.seller_profiles
  where id = v_order.seller_id;

  -- The derived payment status must be cast to the enum explicitly: Postgres
  -- does not implicitly coerce a CASE expression (type text) to payment_status.
  if p_payment_method = 'manual_transfer' then
    v_status := 'submitted'::public.payment_status;
  else
    v_status := 'pending'::public.payment_status;
  end if;

  if v_existing.id is not null then
    update public.payments
    set amount = v_order.total,
        payment_method = p_payment_method,
        payment_reference = v_reference,
        proof_path = v_proof,
        status = v_status,
        rejection_reason = null,
        paid_at = null,
        updated_at = now()
    where id = v_existing.id
    returning * into v_payment;
  else
    insert into public.payments (
      order_id, amount, payment_method, payment_reference, proof_path,
      status, rejection_reason
    ) values (
      v_order.id, v_order.total, p_payment_method, v_reference, v_proof,
      v_status, null
    )
    returning * into v_payment;
  end if;

  insert into public.fulfillment_details (
    order_id, fulfillment_type, recipient_name, phone, address, city, province,
    postal_code, notes, pickup_location, pickup_instructions
  ) values (
    v_order.id, v_order.fulfillment_type,
    case when v_order.fulfillment_type = 'delivery' then v_recipient else null end,
    case when v_order.fulfillment_type = 'delivery' then v_phone else null end,
    case when v_order.fulfillment_type = 'delivery' then v_address else null end,
    case when v_order.fulfillment_type = 'delivery' then v_city else null end,
    case when v_order.fulfillment_type = 'delivery' then v_province else null end,
    case when v_order.fulfillment_type = 'delivery' then v_postal else null end,
    case when v_order.fulfillment_type = 'delivery' then v_notes else null end,
    case when v_order.fulfillment_type = 'pickup' then v_seller.pickup_location else null end,
    case when v_order.fulfillment_type = 'pickup' then v_seller.pickup_instructions else null end
  )
  on conflict (order_id) do update
  set recipient_name = excluded.recipient_name,
      phone = excluded.phone,
      address = excluded.address,
      city = excluded.city,
      province = excluded.province,
      postal_code = excluded.postal_code,
      notes = excluded.notes,
      pickup_location = excluded.pickup_location,
      pickup_instructions = excluded.pickup_instructions,
      updated_at = now();

  return v_payment;
end;
$$;

grant execute on function public.submit_payment(
  uuid, text, text, text, text, text, text, text, text, text, text
) to authenticated;