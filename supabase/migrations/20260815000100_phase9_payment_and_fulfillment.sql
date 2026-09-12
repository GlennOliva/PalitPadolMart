-- ============================================================================
-- PHASE 9 — PAYMENT STATUS AND FULFILLMENT
-- ============================================================================
-- Extends the Phase 8 seller-specific order layer into a secure post-order
-- lifecycle. The Phase 8 model (one order per seller, trusted totals, RPC-only
-- transitions, RLS isolation) is preserved; Phase 9 adds:
--
--   1. payment_status gains `submitted` and `rejected` (manual proof review).
--   2. orders carry trusted milestone timestamps (confirmed_at ... completed_at).
--   3. seller_profiles gain pickup_location / pickup_instructions (snapshotted
--      into fulfillment_details at payment time).
--   4. seller_payment_methods — per-seller enabled methods + safe instructions.
--   5. A private `payment-proofs` storage bucket with participant-only access.
--   6. Payments and fulfillment_details become strictly RPC-managed (the
--      fulfillment update policy is dropped; client writes are revoked).
--   7. Controlled transition RPCs, all SECURITY DEFINER with secure search_path,
--      FOR UPDATE row locks, NULL-safe authorization, and trusted derivation
--      of buyer/seller/amount from the order row.
--
-- Lifecycle (actual enum values):
--
--   pending        seller confirm                    -> confirmed   (Phase 8)
--   pending        buyer|seller cancel               -> cancelled   (Phase 8)
--   confirmed      buyer submit_payment              -> confirmed   (payment row)
--   confirmed      seller review_payment approve     -> paid        (manual transfer)
--   confirmed      seller start_order_preparation    -> preparing   (cash methods)
--   paid           seller start_order_preparation    -> preparing   (manual transfer)
--   preparing      seller mark_order_shipped         -> shipped     (delivery only)
--   preparing      seller mark_order_ready_for_pickup-> ready_for_pickup (pickup only)
--   preparing|shipped|ready_for_pickup
--                  seller mark_cash_received         -> payment paid (cash)
--   shipped        buyer confirm_order_received      -> completed
--   ready_for_pickup buyer confirm_order_received    -> completed
--
--   Payment sub-lifecycle: none -> pending (cash) | submitted (manual)
--     -> paid (approve / cash received)  or  rejected (resubmittable).
--
-- Inventory is ONLY ever decremented by the Phase 8 checkout RPCs. No Phase 9
-- transition touches listings.quantity; payment/fulfillment never re-decrement.
--
-- Cancellation stays Phase 8-scoped (pending only). Once an order is confirmed
-- or paid there is no Phase 9 cancel path — refunds/disputes belong to later
-- phases and are documented as such.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Order milestone timestamps (trusted, server-set; never client-writable)
-- ----------------------------------------------------------------------------
alter table public.orders
  add column if not exists confirmed_at timestamptz,
  add column if not exists paid_at timestamptz,
  add column if not exists preparing_at timestamptz,
  add column if not exists shipped_at timestamptz,
  add column if not exists ready_for_pickup_at timestamptz,
  add column if not exists completed_at timestamptz,
  add column if not exists cancelled_at timestamptz;

-- ----------------------------------------------------------------------------
-- 3. Seller pickup information (snapshotted into fulfillment_details)
-- ----------------------------------------------------------------------------
alter table public.seller_profiles
  add column if not exists pickup_location text,
  add column if not exists pickup_instructions text;

revoke update on public.seller_profiles from authenticated;
grant update (store_name, description, logo_url, city, province, pickup_available, delivery_available, pickup_location, pickup_instructions)
  on public.seller_profiles to authenticated;

-- ----------------------------------------------------------------------------
-- 4. Payment record additions
-- ----------------------------------------------------------------------------
alter table public.payments
  add column if not exists proof_path text,
  add column if not exists rejection_reason text;

-- One active payment record per order (Phase 9 model).
create unique index if not exists payments_order_id_key on public.payments (order_id);

-- ----------------------------------------------------------------------------
-- 5. Seller payment methods (per-seller, multi-seller aware)
-- ----------------------------------------------------------------------------
create table if not exists public.seller_payment_methods (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.seller_profiles(id) on delete cascade,
  method text not null check (method in ('manual_transfer', 'cash_on_pickup', 'cash_on_delivery')),
  is_enabled boolean not null default true,
  instructions text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (seller_id, method)
);

create index if not exists idx_seller_payment_methods_seller
  on public.seller_payment_methods (seller_id);

alter table public.seller_payment_methods enable row level security;

-- Seed every current and future seller with the three default methods; sellers
-- can then enable/disable and add instructions. Security definer because the
-- trigger runs on a client insert into seller_profiles and the methods table
-- has no client insert policy.
create or replace function public.seed_seller_payment_methods()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.seller_payment_methods (seller_id, method)
  select new.id, m.method
  from (values ('manual_transfer'), ('cash_on_pickup'), ('cash_on_delivery')) as m(method)
  on conflict (seller_id, method) do nothing;
  return new;
end;
$$;

drop trigger if exists seller_profiles_seed_payment_methods on public.seller_profiles;
create trigger seller_profiles_seed_payment_methods
  after insert on public.seller_profiles
  for each row execute function public.seed_seller_payment_methods();

-- Backfill existing sellers (migration runs as the privileged migration role).
insert into public.seller_payment_methods (seller_id, method)
select sp.id, m.method
from public.seller_profiles sp
cross join (values ('manual_transfer'), ('cash_on_pickup'), ('cash_on_delivery')) as m(method)
on conflict (seller_id, method) do nothing;

-- RLS: buyers see enabled methods of active sellers; a seller always sees
-- their own (including disabled rows) so they can manage them.
create policy "seller_payment_methods_select_enabled_active"
  on public.seller_payment_methods
  for select using (
    is_enabled
    and exists (
      select 1 from public.seller_profiles sp
      where sp.id = seller_id and sp.seller_status = 'active'
    )
  );

create policy "seller_payment_methods_select_own"
  on public.seller_payment_methods
  for select using (seller_id = public.auth_seller_id() or public.is_admin());

create policy "seller_payment_methods_insert_own"
  on public.seller_payment_methods
  for insert with check (seller_id = public.auth_seller_id());

create policy "seller_payment_methods_update_own"
  on public.seller_payment_methods
  for update using (seller_id = public.auth_seller_id())
  with check (seller_id = public.auth_seller_id());

create policy "seller_payment_methods_delete_own"
  on public.seller_payment_methods
  for delete using (seller_id = public.auth_seller_id() or public.is_admin());

-- ----------------------------------------------------------------------------
-- 6. Hardening: payments / fulfillment are RPC-managed only
-- ----------------------------------------------------------------------------
-- The base Phase 1 update policy let any participant rewrite fulfillment
-- details directly. Phase 9 drops it: every mutation flows through the RPCs.
drop policy if exists "fulfillment_details_update_participant_or_admin"
  on public.fulfillment_details;

revoke insert, update, delete on public.payments from authenticated;
revoke insert, update, delete on public.fulfillment_details from authenticated;

-- ----------------------------------------------------------------------------
-- 7. Private payment-proofs storage bucket
-- ----------------------------------------------------------------------------
-- Storage policies run under the caller's RLS, so cross-table checks must use
-- SECURITY DEFINER helpers (RLS on the referenced tables would otherwise
-- block even the legitimate owner).
create or replace function public.can_upload_payment_proof(p_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.orders
    where id = p_order_id
      and buyer_id = auth.uid()
      and status = 'confirmed'
  );
$$;

create or replace function public.payment_is_open(p_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.payments
    where order_id = p_order_id
      and status in ('pending', 'submitted', 'rejected')
  );
$$;

grant execute on function public.can_upload_payment_proof(uuid) to authenticated;
grant execute on function public.payment_is_open(uuid) to authenticated;

insert into storage.buckets (id, name, public)
values ('payment-proofs', 'payment-proofs', false)
on conflict (id) do nothing;

-- Path convention: {buyer_user_id}/{order_id}/{random}.{ext}. The first path
-- segment is the owning buyer; the second is the order id (used for the
-- seller-read and buyer-delete checks below). Files are never world-readable.

drop policy if exists "payment_proofs_insert_buyer" on storage.objects;
create policy "payment_proofs_insert_buyer" on storage.objects
  for insert with check (
    bucket_id = 'payment-proofs'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.can_upload_payment_proof((storage.foldername(name))[2]::uuid)
  );

drop policy if exists "payment_proofs_select_participant" on storage.objects;
create policy "payment_proofs_select_participant" on storage.objects
  for select using (
    bucket_id = 'payment-proofs'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (
        select 1
        from public.orders o
        join public.seller_profiles sp on sp.id = o.seller_id
        where sp.user_id = auth.uid()
          and o.id = (storage.foldername(name))[2]::uuid
      )
      or public.is_admin()
    )
  );

drop policy if exists "payment_proofs_update_buyer" on storage.objects;
create policy "payment_proofs_update_buyer" on storage.objects
  for update using (
    bucket_id = 'payment-proofs'
    and (storage.foldername(name))[1] = auth.uid()::text
  ) with check (
    bucket_id = 'payment-proofs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- The buyer may remove/replace their proof only while the payment is still
-- open (pending/submitted/rejected). Once verified (paid), the proof is part
-- of the transaction record and stays put.
drop policy if exists "payment_proofs_delete_buyer" on storage.objects;
create policy "payment_proofs_delete_buyer" on storage.objects
  for delete using (
    bucket_id = 'payment-proofs'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.payment_is_open((storage.foldername(name))[2]::uuid)
  );

-- ----------------------------------------------------------------------------
-- 8. Phase 8 lifecycle functions gain milestone timestamps
-- ----------------------------------------------------------------------------
-- Replaces confirm_marketplace_order so the confirmed milestone is trusted
-- server time. Behavior is otherwise identical to the Phase 8 version.
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
  set status = 'confirmed',
      confirmed_at = now()
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

-- Replaces cancel_marketplace_order so the cancelled milestone is trusted
-- server time. Behavior is otherwise identical to the Phase 8 fixed version.
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

  if v_order.buyer_id is distinct from v_caller
     and v_order.seller_id is distinct from v_seller then
    raise exception 'FORBIDDEN: you are not a participant of this order';
  end if;

  if v_order.status is distinct from 'pending' then
    raise exception 'ORDER_NOT_CANCELLABLE: only pending orders can be cancelled';
  end if;

  select coalesce(sum(quantity), 0),
         (array_agg(listing_id order by listing_id))[1]
  into v_quantity, v_listing_id
  from public.order_items
  where order_id = p_order_id;

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
  set status = 'cancelled',
      cancelled_at = now()
  where id = p_order_id
  returning * into v_order;

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
-- 9. submit_payment() — buyer registers the payment method / proof
-- ----------------------------------------------------------------------------
-- The payment amount is ALWAYS orders.total (trusted). buyer_id/seller_id are
-- derived from the order row, never from the client. For manual transfer a
-- private proof path is required; the path's first segment must equal the
-- caller's uid (cross-order proof spoof is impossible). For cash methods no
-- proof is uploaded and the payment stays 'pending' until the handoff.
-- The delivery address snapshot (recipient, phone, full address, city,
-- province, postal code, notes) is persisted here so later profile edits can
-- never rewrite a confirmed order's historical destination.
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

  -- Lock any existing payment row so concurrent submits serialize. The
  -- `found` flag would be clobbered by later selects, so we branch on the
  -- row's id instead.
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

  -- Fulfillment compatibility is enforced database-side, never via the UI.
  if (p_payment_method = 'cash_on_pickup' and v_order.fulfillment_type is distinct from 'pickup')
     or (p_payment_method = 'cash_on_delivery' and v_order.fulfillment_type is distinct from 'delivery') then
    raise exception 'INVALID_PAYMENT_METHOD: that payment method does not match this order fulfillment';
  end if;

  -- The owning seller must have enabled the method.
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

  -- The proof path must live under the buyer's own folder: {buyer}/{order}/{file}.
  if v_proof is not null and split_part(v_proof, '/', 1) <> v_buyer::text then
    raise exception 'INVALID_PAYMENT_PROOF: proof path does not belong to you';
  end if;

  if v_reference is not null and length(v_reference) > 120 then
    raise exception 'INVALID_REFERENCE: reference must be 120 characters or fewer';
  end if;

  -- Delivery requires a complete destination snapshot now (immutable later).
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

  -- One payment row per order. Amount is ALWAYS the trusted order total.
  if v_existing.id is not null then
    update public.payments
    set amount = v_order.total,
        payment_method = p_payment_method,
        payment_reference = v_reference,
        proof_path = v_proof,
        status = case
          when p_payment_method = 'manual_transfer' then 'submitted'
          else 'pending'
        end,
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
      case when p_payment_method = 'manual_transfer' then 'submitted' else 'pending' end,
      null
    )
    returning * into v_payment;
  end if;

  -- Fulfillment snapshot: delivery address from the buyer, pickup info from
  -- the seller profile. One row per order (unique order_id), upserted.
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

-- ----------------------------------------------------------------------------
-- 10. review_payment() — owning seller approves / rejects submitted proof
-- ----------------------------------------------------------------------------
-- Approve: payment -> paid (paid_at) and order -> paid atomically.
-- Reject:   payment -> rejected (with a required reason); order stays
--           confirmed so the buyer may resubmit.
create or replace function public.review_payment(
  p_payment_id uuid,
  p_decision text,
  p_rejection_reason text default null
)
returns public.payments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seller uuid := public.auth_seller_id();
  v_payment public.payments%rowtype;
  v_order public.orders%rowtype;
  v_reason text := nullif(trim(coalesce(p_rejection_reason, '')), '');
begin
  if v_seller is null then
    raise exception 'FORBIDDEN: only the seller can review payments';
  end if;

  select * into v_payment
  from public.payments
  where id = p_payment_id
  for update;

  if not found then
    raise exception 'PAYMENT_NOT_FOUND: payment does not exist';
  end if;

  select * into v_order
  from public.orders
  where id = v_payment.order_id
  for update;

  if not found then
    raise exception 'ORDER_NOT_FOUND: order does not exist';
  end if;

  if v_order.seller_id is distinct from v_seller then
    raise exception 'FORBIDDEN: you cannot review this payment';
  end if;

  if v_payment.status is distinct from 'submitted' then
    raise exception 'PAYMENT_NOT_SUBMITTED: only submitted payments can be reviewed';
  end if;

  if p_decision = 'approve' then
    update public.payments
    set status = 'paid',
        paid_at = now(),
        rejection_reason = null,
        updated_at = now()
    where id = p_payment_id
    returning * into v_payment;

    update public.orders
    set status = 'paid',
        paid_at = now()
    where id = v_order.id;
  elsif p_decision = 'reject' then
    if v_reason is null then
      raise exception 'REJECTION_REASON_REQUIRED: provide a reason for the rejection';
    end if;
    if length(v_reason) > 500 then
      raise exception 'INVALID_REJECTION_REASON: reason must be 500 characters or fewer';
    end if;

    update public.payments
    set status = 'rejected',
        rejection_reason = v_reason,
        updated_at = now()
    where id = p_payment_id
    returning * into v_payment;
  else
    raise exception 'INVALID_DECISION: decision must be approve or reject';
  end if;

  return v_payment;
end;
$$;

-- ----------------------------------------------------------------------------
-- 11. mark_cash_received() — seller records cash collected at handoff
-- ----------------------------------------------------------------------------
-- Cash methods stay 'pending' until the physical handoff. The owning seller
-- records the cash received; the buyer then confirms receipt to complete.
create or replace function public.mark_cash_received(
  p_payment_id uuid
)
returns public.payments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seller uuid := public.auth_seller_id();
  v_payment public.payments%rowtype;
  v_order public.orders%rowtype;
begin
  if v_seller is null then
    raise exception 'FORBIDDEN: only the seller can mark cash received';
  end if;

  select * into v_payment
  from public.payments
  where id = p_payment_id
  for update;

  if not found then
    raise exception 'PAYMENT_NOT_FOUND: payment does not exist';
  end if;

  select * into v_order
  from public.orders
  where id = v_payment.order_id
  for update;

  if not found then
    raise exception 'ORDER_NOT_FOUND: order does not exist';
  end if;

  if v_order.seller_id is distinct from v_seller then
    raise exception 'FORBIDDEN: you cannot collect this payment';
  end if;

  if v_payment.payment_method not in ('cash_on_pickup', 'cash_on_delivery') then
    raise exception 'INVALID_PAYMENT_METHOD: only cash payments are collected at handoff';
  end if;

  if v_payment.status is distinct from 'pending' then
    raise exception 'PAYMENT_NOT_COLLECTABLE: only pending cash payments can be collected';
  end if;

  if v_order.status not in ('preparing', 'shipped', 'ready_for_pickup') then
    raise exception 'CASH_NOT_READY: cash is collected at the handoff';
  end if;

  update public.payments
  set status = 'paid',
      paid_at = now(),
      updated_at = now()
  where id = p_payment_id
  returning * into v_payment;

  return v_payment;
end;
$$;

-- ----------------------------------------------------------------------------
-- 12. start_order_preparation() — owning seller
-- ----------------------------------------------------------------------------
-- Manual transfer: only after the payment is verified (order = paid).
-- Cash: after the buyer selects the cash method (payment pending) — the cash
-- itself is collected at the handoff.
create or replace function public.start_order_preparation(
  p_order_id uuid
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seller uuid := public.auth_seller_id();
  v_order public.orders%rowtype;
  v_payment public.payments%rowtype;
begin
  if v_seller is null then
    raise exception 'FORBIDDEN: only the seller can start preparation';
  end if;

  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'ORDER_NOT_FOUND: order does not exist';
  end if;

  if v_order.seller_id is distinct from v_seller then
    raise exception 'FORBIDDEN: you cannot prepare this order';
  end if;

  if v_order.status = 'paid' then
    -- manual transfer verified
    null;
  elsif v_order.status = 'confirmed' then
    select * into v_payment
    from public.payments
    where order_id = v_order.id
    for update;

    if not found or v_payment.payment_method not in ('cash_on_pickup', 'cash_on_delivery') then
      raise exception 'PAYMENT_NOT_PAID: verify the payment before preparing';
    end if;

    if v_payment.status is distinct from 'pending' then
      raise exception 'PAYMENT_NOT_READY: payment is not ready for preparation';
    end if;
  else
    raise exception 'ORDER_NOT_PREPARABLE: this order cannot be prepared yet';
  end if;

  update public.orders
  set status = 'preparing',
      preparing_at = now()
  where id = p_order_id
  returning * into v_order;

  return v_order;
end;
$$;

-- ----------------------------------------------------------------------------
-- 13. mark_order_shipped() — owning seller, delivery orders only
-- ----------------------------------------------------------------------------
create or replace function public.mark_order_shipped(
  p_order_id uuid,
  p_courier text,
  p_tracking_number text
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seller uuid := public.auth_seller_id();
  v_order public.orders%rowtype;
  v_courier text := nullif(trim(coalesce(p_courier, '')), '');
  v_tracking text := nullif(trim(coalesce(p_tracking_number, '')), '');
begin
  if v_seller is null then
    raise exception 'FORBIDDEN: only the seller can mark an order shipped';
  end if;

  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'ORDER_NOT_FOUND: order does not exist';
  end if;

  if v_order.seller_id is distinct from v_seller then
    raise exception 'FORBIDDEN: you cannot ship this order';
  end if;

  if v_order.fulfillment_type is distinct from 'delivery' then
    raise exception 'WRONG_FULFILLMENT_TYPE: only delivery orders can be shipped';
  end if;

  if v_order.status is distinct from 'preparing' then
    raise exception 'ORDER_NOT_SHIPPABLE: only preparing orders can be shipped';
  end if;

  if v_courier is null or v_tracking is null then
    raise exception 'TRACKING_REQUIRED: provide the courier and tracking number';
  end if;

  if length(v_courier) > 80 or length(v_tracking) > 100 then
    raise exception 'INVALID_TRACKING: courier and tracking number are too long';
  end if;

  update public.orders
  set status = 'shipped',
      shipped_at = now()
  where id = p_order_id
  returning * into v_order;

  update public.fulfillment_details
  set courier = v_courier,
      tracking_number = v_tracking,
      updated_at = now()
  where order_id = p_order_id;

  return v_order;
end;
$$;

-- ----------------------------------------------------------------------------
-- 14. mark_order_ready_for_pickup() — owning seller, pickup orders only
-- ----------------------------------------------------------------------------
create or replace function public.mark_order_ready_for_pickup(
  p_order_id uuid
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seller uuid := public.auth_seller_id();
  v_order public.orders%rowtype;
begin
  if v_seller is null then
    raise exception 'FORBIDDEN: only the seller can mark an order ready';
  end if;

  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'ORDER_NOT_FOUND: order does not exist';
  end if;

  if v_order.seller_id is distinct from v_seller then
    raise exception 'FORBIDDEN: you cannot prepare this order';
  end if;

  if v_order.fulfillment_type is distinct from 'pickup' then
    raise exception 'WRONG_FULFILLMENT_TYPE: only pickup orders can be marked ready';
  end if;

  if v_order.status is distinct from 'preparing' then
    raise exception 'ORDER_NOT_READYABLE: only preparing orders can be marked ready';
  end if;

  update public.orders
  set status = 'ready_for_pickup',
      ready_for_pickup_at = now()
  where id = p_order_id
  returning * into v_order;

  return v_order;
end;
$$;

-- ----------------------------------------------------------------------------
-- 15. confirm_order_received() — buyer confirms the handoff
-- ----------------------------------------------------------------------------
-- Requires the payment to be verified (paid) so an order can never complete
-- while its payment is pending. Delivery: from 'shipped'. Pickup: from
-- 'ready_for_pickup'. Duplicate completion is impossible (status check).
create or replace function public.confirm_order_received(
  p_order_id uuid
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_buyer uuid := auth.uid();
  v_order public.orders%rowtype;
  v_paid boolean;
begin
  if v_buyer is null then
    raise exception 'AUTH_REQUIRED: sign in to confirm receipt';
  end if;

  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'ORDER_NOT_FOUND: order does not exist';
  end if;

  if v_order.buyer_id is distinct from v_buyer then
    raise exception 'FORBIDDEN: only the buyer can confirm receipt';
  end if;

  if v_order.status not in ('shipped', 'ready_for_pickup') then
    raise exception 'ORDER_NOT_COMPLETABLE: this order cannot be completed yet';
  end if;

  select exists (
    select 1 from public.payments
    where order_id = v_order.id and status = 'paid'
  ) into v_paid;

  if not v_paid then
    raise exception 'PAYMENT_NOT_PAID: the payment must be verified before completion';
  end if;

  update public.orders
  set status = 'completed',
      completed_at = now()
  where id = p_order_id
  returning * into v_order;

  return v_order;
end;
$$;

-- ----------------------------------------------------------------------------
-- 16. RPC execution grants
-- ----------------------------------------------------------------------------
grant execute on function public.submit_payment(
  uuid, text, text, text, text, text, text, text, text, text, text
) to authenticated;
grant execute on function public.review_payment(uuid, text, text) to authenticated;
grant execute on function public.mark_cash_received(uuid) to authenticated;
grant execute on function public.start_order_preparation(uuid) to authenticated;
grant execute on function public.mark_order_shipped(uuid, text, text) to authenticated;
grant execute on function public.mark_order_ready_for_pickup(uuid) to authenticated;
grant execute on function public.confirm_order_received(uuid) to authenticated;
