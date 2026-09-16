-- ============================================================================
-- Phase 13: Administration database foundation
--
-- Administrative writes are explicit, validated SECURITY DEFINER RPCs. Every
-- successful mutation appends exactly one row to admin_actions through a
-- private helper. audit_logs remains reserved for broader future system events.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. Canonical append-only administrative action ledger
-- ----------------------------------------------------------------------------

alter table public.admin_actions
  add column if not exists reason text,
  add column if not exists previous_data jsonb,
  add column if not exists new_data jsonb;

alter table public.admin_actions
  drop constraint if exists admin_actions_admin_id_fkey;

alter table public.admin_actions
  add constraint admin_actions_admin_id_fkey
  foreign key (admin_id) references auth.users(id) on delete restrict;

alter table public.admin_actions
  drop constraint if exists admin_actions_action_type_check,
  drop constraint if exists admin_actions_entity_type_check,
  drop constraint if exists admin_actions_reason_check,
  drop constraint if exists admin_actions_previous_data_check,
  drop constraint if exists admin_actions_new_data_check;

alter table public.admin_actions
  add constraint admin_actions_action_type_check check (
    action_type = btrim(action_type)
    and char_length(action_type) between 3 and 80
    and action_type ~ '^[a-z][a-z0-9_]*$'
  ) not valid,
  add constraint admin_actions_entity_type_check check (
    entity_type = btrim(entity_type)
    and char_length(entity_type) between 3 and 80
    and entity_type ~ '^[a-z][a-z0-9_]*$'
  ) not valid,
  add constraint admin_actions_reason_check check (
    reason is null
    or (reason = btrim(reason) and char_length(reason) between 5 and 1000)
  ) not valid,
  add constraint admin_actions_previous_data_check check (
    previous_data is null
    or (
      jsonb_typeof(previous_data) = 'object'
      and octet_length(previous_data::text) <= 8192
    )
  ) not valid,
  add constraint admin_actions_new_data_check check (
    new_data is null
    or (
      jsonb_typeof(new_data) = 'object'
      and octet_length(new_data::text) <= 8192
    )
  ) not valid;

create index if not exists idx_admin_actions_created_id
  on public.admin_actions (created_at desc, id desc);

create or replace function public.prevent_admin_action_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'ADMIN_ACTIONS_APPEND_ONLY: administrative actions cannot be changed or deleted';
end;
$$;

drop trigger if exists admin_actions_append_only on public.admin_actions;
create trigger admin_actions_append_only
  before update or delete on public.admin_actions
  for each row execute function public.prevent_admin_action_changes();

create or replace function public.record_admin_action(
  p_action_type text,
  p_entity_type text,
  p_entity_id uuid,
  p_reason text,
  p_previous_data jsonb,
  p_new_data jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_action_type text := btrim(coalesce(p_action_type, ''));
  v_entity_type text := btrim(coalesce(p_entity_type, ''));
  v_reason text := btrim(coalesce(p_reason, ''));
  v_id uuid;
begin
  if v_actor is null then
    raise exception 'AUTH_REQUIRED: sign in to perform an administrative action';
  end if;
  if not public.is_admin() then
    raise exception 'FORBIDDEN: only an active admin can perform this action';
  end if;
  if v_action_type !~ '^[a-z][a-z0-9_]*$'
     or char_length(v_action_type) not between 3 and 80 then
    raise exception 'INVALID_ADMIN_ACTION: action type is invalid';
  end if;
  if v_entity_type !~ '^[a-z][a-z0-9_]*$'
     or char_length(v_entity_type) not between 3 and 80 then
    raise exception 'INVALID_ADMIN_ACTION: entity type is invalid';
  end if;
  if char_length(v_reason) not between 5 and 1000 then
    raise exception 'INVALID_REASON: reason must contain 5 to 1000 characters';
  end if;
  if p_previous_data is not null and (
    jsonb_typeof(p_previous_data) is distinct from 'object'
    or octet_length(p_previous_data::text) > 8192
  ) then
    raise exception 'INVALID_ADMIN_METADATA: previous metadata must be a bounded object';
  end if;
  if p_new_data is not null and (
    jsonb_typeof(p_new_data) is distinct from 'object'
    or octet_length(p_new_data::text) > 8192
  ) then
    raise exception 'INVALID_ADMIN_METADATA: new metadata must be a bounded object';
  end if;

  insert into public.admin_actions (
    admin_id,
    action_type,
    entity_type,
    entity_id,
    details,
    reason,
    previous_data,
    new_data,
    created_at
  )
  values (
    v_actor,
    v_action_type,
    v_entity_type,
    p_entity_id,
    null,
    v_reason,
    jsonb_strip_nulls(p_previous_data),
    jsonb_strip_nulls(p_new_data),
    now()
  )
  returning id into v_id;

  return v_id;
end;
$$;

drop policy if exists "admin_actions_insert_admin" on public.admin_actions;
drop policy if exists "admin_actions_select_admin" on public.admin_actions;
create policy "admin_actions_select_admin"
  on public.admin_actions
  for select
  to authenticated
  using (public.is_admin());

revoke all on table public.admin_actions from public, anon, authenticated;
grant select on table public.admin_actions to authenticated;
revoke execute on function public.prevent_admin_action_changes() from public, anon, authenticated;
revoke execute on function public.record_admin_action(text, text, uuid, text, jsonb, jsonb)
  from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 2. Remove obsolete broad admin mutation functions and direct write bypasses
-- ----------------------------------------------------------------------------

create or replace function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
    and exists (
      select 1
      from public.profiles p
      where p.id is not distinct from auth.uid()
        and p.account_status = 'active'
    );
$$;

create or replace function public.auth_active_seller_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select sp.id
  from public.seller_profiles sp
  where sp.user_id is not distinct from auth.uid()
    and public.seller_is_active(sp.id);
$$;

-- Row triggers cover direct writes and SECURITY DEFINER RPC side effects. A
-- null auth identity is reserved for trusted database/system work; RLS remains
-- responsible for deciding which anonymous operations are intentionally open.
create or replace function public.enforce_active_account_mutation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and not public.is_active_user() then
    raise exception 'ACCOUNT_UNAVAILABLE: your account must be active to make changes';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop function if exists public.admin_set_role(uuid, public.user_role);
drop function if exists public.admin_set_account_status(uuid, public.account_status);
drop function if exists public.admin_set_seller_status(uuid, public.seller_status);
drop function if exists public.admin_update_listing_report(uuid, public.report_status, text);
drop function if exists public.admin_resolve_dispute(uuid, text);

drop policy if exists "profiles_delete_admin" on public.profiles;
drop policy if exists "seller_profiles_delete_admin" on public.seller_profiles;
drop policy if exists "categories_insert_admin" on public.categories;
drop policy if exists "categories_update_admin" on public.categories;
drop policy if exists "categories_delete_admin" on public.categories;
drop policy if exists "brands_insert_admin" on public.brands;
drop policy if exists "brands_update_admin" on public.brands;
drop policy if exists "brands_delete_admin" on public.brands;
drop policy if exists "listings_update_own_or_admin" on public.listings;
drop policy if exists "listings_delete_own_or_admin" on public.listings;
drop policy if exists "orders_update_participant_or_admin" on public.orders;
drop policy if exists "orders_update_participant_notes" on public.orders;
drop policy if exists "orders_delete_admin" on public.orders;
drop policy if exists "reviews_update_admin" on public.reviews;
drop policy if exists "reviews_delete_admin" on public.reviews;
drop policy if exists "recommendation_profiles_delete_admin" on public.recommendation_profiles;
drop policy if exists "inquiries_update_participant_or_admin" on public.inquiries;
drop policy if exists "inquiries_delete_admin" on public.inquiries;
drop policy if exists "inquiry_messages_delete_admin" on public.inquiry_messages;
drop policy if exists "fulfillment_details_update_participant_or_admin" on public.fulfillment_details;
drop policy if exists "listing_reports_update_admin" on public.listing_reports;
drop policy if exists "listing_reports_delete_admin" on public.listing_reports;
drop policy if exists "disputes_update_participant_or_admin" on public.disputes;
drop policy if exists "disputes_delete_admin" on public.disputes;
drop policy if exists "dispute_messages_delete_admin" on public.dispute_messages;
drop policy if exists "dispute_evidence_delete_admin" on public.dispute_evidence;
drop policy if exists "seller_payment_methods_insert_own" on public.seller_payment_methods;
drop policy if exists "seller_payment_methods_update_own" on public.seller_payment_methods;
drop policy if exists "seller_payment_methods_delete_own" on public.seller_payment_methods;

create policy "inquiries_update_participant"
  on public.inquiries
  for update
  to authenticated
  using (
    buyer_id is not distinct from auth.uid()
    or seller_id is not distinct from public.auth_seller_id()
  )
  with check (
    buyer_id is not distinct from auth.uid()
    or seller_id is not distinct from public.auth_seller_id()
  );

create policy "seller_payment_methods_insert_active_owner"
  on public.seller_payment_methods
  for insert
  to authenticated
  with check (seller_id is not distinct from public.auth_active_seller_id());

create policy "seller_payment_methods_update_active_owner"
  on public.seller_payment_methods
  for update
  to authenticated
  using (seller_id is not distinct from public.auth_active_seller_id())
  with check (seller_id is not distinct from public.auth_active_seller_id());

create policy "seller_payment_methods_delete_active_owner"
  on public.seller_payment_methods
  for delete
  to authenticated
  using (seller_id is not distinct from public.auth_active_seller_id());

create policy "listings_update_own"
  on public.listings
  for update
  to authenticated
  using (
    seller_id is not distinct from public.auth_seller_id()
    and public.seller_is_active(seller_id)
  )
  with check (
    seller_id is not distinct from public.auth_seller_id()
    and public.seller_is_active(seller_id)
  );

drop policy if exists "paddle_attributes_update_own_or_admin" on public.paddle_attributes;
create policy "paddle_attributes_update_own"
  on public.paddle_attributes
  for update
  to authenticated
  using (
    exists (
      select 1 from public.listings l
      where l.id is not distinct from paddle_attributes.listing_id
        and l.seller_id is not distinct from public.auth_seller_id()
        and public.seller_is_active(l.seller_id)
        and l.listing_status <> 'removed'
    )
  )
  with check (
    exists (
      select 1 from public.listings l
      where l.id is not distinct from paddle_attributes.listing_id
        and l.seller_id is not distinct from public.auth_seller_id()
        and public.seller_is_active(l.seller_id)
        and l.listing_status <> 'removed'
    )
  );

drop policy if exists "paddle_attributes_delete_own_or_admin" on public.paddle_attributes;
create policy "paddle_attributes_delete_own"
  on public.paddle_attributes
  for delete
  to authenticated
  using (
    exists (
      select 1 from public.listings l
      where l.id is not distinct from paddle_attributes.listing_id
        and l.seller_id is not distinct from public.auth_seller_id()
        and public.seller_is_active(l.seller_id)
        and l.listing_status <> 'removed'
    )
  );

drop policy if exists "listing_images_update_own_or_admin" on public.listing_images;
create policy "listing_images_update_own"
  on public.listing_images
  for update
  to authenticated
  using (
    exists (
      select 1 from public.listings l
      where l.id is not distinct from listing_images.listing_id
        and l.seller_id is not distinct from public.auth_seller_id()
        and public.seller_is_active(l.seller_id)
        and l.listing_status <> 'removed'
    )
  )
  with check (
    exists (
      select 1 from public.listings l
      where l.id is not distinct from listing_images.listing_id
        and l.seller_id is not distinct from public.auth_seller_id()
        and public.seller_is_active(l.seller_id)
        and l.listing_status <> 'removed'
    )
  );

drop policy if exists "listing_images_delete_own_or_admin" on public.listing_images;
create policy "listing_images_delete_own"
  on public.listing_images
  for delete
  to authenticated
  using (
    exists (
      select 1 from public.listings l
      where l.id is not distinct from listing_images.listing_id
        and l.seller_id is not distinct from public.auth_seller_id()
        and public.seller_is_active(l.seller_id)
        and l.listing_status <> 'removed'
    )
  );

revoke insert, delete on public.profiles from public, anon, authenticated;
revoke delete on public.seller_profiles from public, anon, authenticated;
revoke insert, update, delete on public.categories from public, anon, authenticated;
revoke insert, update, delete on public.brands from public, anon, authenticated;
revoke delete on public.listings from public, anon, authenticated;
revoke delete on public.orders from public, anon, authenticated;
revoke update, delete on public.reviews from public, anon, authenticated;
revoke delete on public.recommendation_profiles from public, anon, authenticated;
revoke delete on public.inquiries from public, anon, authenticated;
revoke delete on public.inquiry_messages from public, anon, authenticated;
revoke insert, update, delete on public.fulfillment_details from public, anon, authenticated;

-- Preserve legitimate self/participant columns while excluding all state and
-- identity fields from direct browser updates.
revoke update on public.profiles from public, anon, authenticated;
grant update (first_name, last_name, display_name, phone, avatar_url, city, province)
  on public.profiles to authenticated;

revoke update on public.seller_profiles from public, anon, authenticated;
grant update (
  store_name, description, logo_url, city, province,
  pickup_available, delivery_available, pickup_location, pickup_instructions
) on public.seller_profiles to authenticated;

revoke update on public.listings from public, anon, authenticated;
grant update (
  category_id, brand_id, title, description, listing_condition, price,
  quantity, listing_status, city, province, pickup_available, delivery_available
) on public.listings to authenticated;

revoke update on public.orders from public, anon, authenticated;
revoke update (notes) on public.orders from public, anon, authenticated;

drop trigger if exists account_must_be_active on public.profiles;
create trigger account_must_be_active before insert or update or delete on public.profiles
  for each row execute function public.enforce_active_account_mutation();
drop trigger if exists account_must_be_active on public.seller_profiles;
create trigger account_must_be_active before insert or update or delete on public.seller_profiles
  for each row execute function public.enforce_active_account_mutation();
drop trigger if exists account_must_be_active on public.categories;
create trigger account_must_be_active before insert or update or delete on public.categories
  for each row execute function public.enforce_active_account_mutation();
drop trigger if exists account_must_be_active on public.brands;
create trigger account_must_be_active before insert or update or delete on public.brands
  for each row execute function public.enforce_active_account_mutation();
drop trigger if exists account_must_be_active on public.listings;
create trigger account_must_be_active before insert or update or delete on public.listings
  for each row execute function public.enforce_active_account_mutation();
drop trigger if exists account_must_be_active on public.paddle_attributes;
create trigger account_must_be_active before insert or update or delete on public.paddle_attributes
  for each row execute function public.enforce_active_account_mutation();
drop trigger if exists account_must_be_active on public.listing_images;
create trigger account_must_be_active before insert or update or delete on public.listing_images
  for each row execute function public.enforce_active_account_mutation();
drop trigger if exists account_must_be_active on public.listing_views;
create trigger account_must_be_active before insert or update or delete on public.listing_views
  for each row execute function public.enforce_active_account_mutation();
drop trigger if exists account_must_be_active on public.favorites;
create trigger account_must_be_active before insert or update or delete on public.favorites
  for each row execute function public.enforce_active_account_mutation();
drop trigger if exists account_must_be_active on public.recommendation_profiles;
create trigger account_must_be_active before insert or update or delete on public.recommendation_profiles
  for each row execute function public.enforce_active_account_mutation();
drop trigger if exists account_must_be_active on public.recommendation_events;
create trigger account_must_be_active before insert or update or delete on public.recommendation_events
  for each row execute function public.enforce_active_account_mutation();
drop trigger if exists account_must_be_active on public.inquiries;
create trigger account_must_be_active before insert or update or delete on public.inquiries
  for each row execute function public.enforce_active_account_mutation();
drop trigger if exists account_must_be_active on public.inquiry_messages;
create trigger account_must_be_active before insert or update or delete on public.inquiry_messages
  for each row execute function public.enforce_active_account_mutation();
drop trigger if exists account_must_be_active on public.carts;
create trigger account_must_be_active before insert or update or delete on public.carts
  for each row execute function public.enforce_active_account_mutation();
drop trigger if exists account_must_be_active on public.cart_items;
create trigger account_must_be_active before insert or update or delete on public.cart_items
  for each row execute function public.enforce_active_account_mutation();
drop trigger if exists account_must_be_active on public.orders;
create trigger account_must_be_active before insert or update or delete on public.orders
  for each row execute function public.enforce_active_account_mutation();
drop trigger if exists account_must_be_active on public.order_items;
create trigger account_must_be_active before insert or update or delete on public.order_items
  for each row execute function public.enforce_active_account_mutation();
drop trigger if exists account_must_be_active on public.payments;
create trigger account_must_be_active before insert or update or delete on public.payments
  for each row execute function public.enforce_active_account_mutation();
drop trigger if exists account_must_be_active on public.fulfillment_details;
create trigger account_must_be_active before insert or update or delete on public.fulfillment_details
  for each row execute function public.enforce_active_account_mutation();
drop trigger if exists account_must_be_active on public.seller_payment_methods;
create trigger account_must_be_active before insert or update or delete on public.seller_payment_methods
  for each row execute function public.enforce_active_account_mutation();
drop trigger if exists account_must_be_active on public.reviews;
create trigger account_must_be_active before insert or update or delete on public.reviews
  for each row execute function public.enforce_active_account_mutation();
drop trigger if exists account_must_be_active on public.listing_reports;
create trigger account_must_be_active before insert or update or delete on public.listing_reports
  for each row execute function public.enforce_active_account_mutation();
drop trigger if exists account_must_be_active on public.disputes;
create trigger account_must_be_active before insert or update or delete on public.disputes
  for each row execute function public.enforce_active_account_mutation();
drop trigger if exists account_must_be_active on public.dispute_messages;
create trigger account_must_be_active before insert or update or delete on public.dispute_messages
  for each row execute function public.enforce_active_account_mutation();
drop trigger if exists account_must_be_active on public.dispute_evidence;
create trigger account_must_be_active before insert or update or delete on public.dispute_evidence
  for each row execute function public.enforce_active_account_mutation();
drop trigger if exists account_must_be_active on public.refunds;
create trigger account_must_be_active before insert or update or delete on public.refunds
  for each row execute function public.enforce_active_account_mutation();
drop trigger if exists account_must_be_active on public.refund_events;
create trigger account_must_be_active before insert or update or delete on public.refund_events
  for each row execute function public.enforce_active_account_mutation();
drop trigger if exists account_must_be_active on public.dispute_events;
create trigger account_must_be_active before insert or update or delete on public.dispute_events
  for each row execute function public.enforce_active_account_mutation();
drop trigger if exists account_must_be_active on public.notifications;
create trigger account_must_be_active before insert or update or delete on public.notifications
  for each row execute function public.enforce_active_account_mutation();
drop trigger if exists account_must_be_active on public.admin_actions;
create trigger account_must_be_active before insert or update or delete on public.admin_actions
  for each row execute function public.enforce_active_account_mutation();
drop trigger if exists account_must_be_active on public.audit_logs;
create trigger account_must_be_active before insert or update or delete on public.audit_logs
  for each row execute function public.enforce_active_account_mutation();

create or replace function public.mark_notification_read(p_notification_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated integer;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED: sign in to update notifications';
  end if;
  if not public.is_active_user() then
    raise exception 'ACCOUNT_UNAVAILABLE: your account must be active to update notifications';
  end if;

  update public.notifications
  set is_read = true
  where id is not distinct from p_notification_id
    and recipient_id is not distinct from auth.uid()
    and is_read = false;

  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$;

create or replace function public.mark_all_notifications_read()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated integer;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED: sign in to update notifications';
  end if;
  if not public.is_active_user() then
    raise exception 'ACCOUNT_UNAVAILABLE: your account must be active to update notifications';
  end if;

  update public.notifications
  set is_read = true
  where recipient_id is not distinct from auth.uid()
    and is_read = false;

  get diagnostics v_updated = row_count;
  return v_updated;
end;
$$;

drop policy if exists "listings_insert_own" on public.listings;
create policy "listings_insert_active_owner"
  on public.listings
  for insert
  to authenticated
  with check (seller_id is not distinct from public.auth_active_seller_id());

drop policy if exists "paddle_attributes_insert_own" on public.paddle_attributes;
create policy "paddle_attributes_insert_active_owner"
  on public.paddle_attributes
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.listings l
      where l.id is not distinct from paddle_attributes.listing_id
        and l.seller_id is not distinct from public.auth_seller_id()
        and public.seller_is_active(l.seller_id)
        and l.listing_status <> 'removed'
    )
  );

drop policy if exists "listing_images_insert_own" on public.listing_images;
create policy "listing_images_insert_active_owner"
  on public.listing_images
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.listings l
      where l.id is not distinct from listing_images.listing_id
        and l.seller_id is not distinct from public.auth_seller_id()
        and public.seller_is_active(l.seller_id)
        and l.listing_status <> 'removed'
    )
  );

create or replace function public.can_manage_marketplace_product(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_active_user()
    and public.auth_active_seller_id() is not null
    and cardinality(storage.foldername(p_name)) = 2
    and (storage.foldername(p_name))[1] is not distinct from public.auth_active_seller_id()::text
    and split_part(p_name, '/', 3) ~* '^[^/]+\.(jpg|jpeg|png|webp)$'
    and (
      (storage.foldername(p_name))[2] = 'logo'
      or case
        when (storage.foldername(p_name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then exists (
          select 1
          from public.listings l
          where l.id is not distinct from (storage.foldername(p_name))[2]::uuid
            and l.seller_id is not distinct from public.auth_active_seller_id()
            and l.listing_status <> 'removed'
        )
        else false
      end
    );
$$;

insert into storage.buckets (
  id, name, public, file_size_limit, allowed_mime_types
)
values (
  'marketplace-products',
  'marketplace-products',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update
set name = excluded.name,
    public = true,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "avatars_insert_own" on storage.objects;
create policy "avatars_insert_active_owner"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and public.is_active_user()
    and (storage.foldername(name))[1] is not distinct from auth.uid()::text
  );

drop policy if exists "avatars_update_own" on storage.objects;
create policy "avatars_update_active_owner"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'avatars'
    and public.is_active_user()
    and (storage.foldername(name))[1] is not distinct from auth.uid()::text
  )
  with check (
    bucket_id = 'avatars'
    and public.is_active_user()
    and (storage.foldername(name))[1] is not distinct from auth.uid()::text
  );

drop policy if exists "avatars_delete_own" on storage.objects;
create policy "avatars_delete_active_owner"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'avatars'
    and public.is_active_user()
    and (storage.foldername(name))[1] is not distinct from auth.uid()::text
  );

drop policy if exists "payment_proofs_insert_buyer" on storage.objects;
create policy "payment_proofs_insert_active_buyer"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'payment-proofs'
    and public.is_active_user()
    and cardinality(storage.foldername(name)) = 2
    and (storage.foldername(name))[1] is not distinct from auth.uid()::text
    and case
      when (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then public.can_upload_payment_proof((storage.foldername(name))[2]::uuid)
      else false
    end
  );

drop policy if exists "payment_proofs_update_buyer" on storage.objects;
create policy "payment_proofs_update_active_buyer"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'payment-proofs'
    and public.is_active_user()
    and cardinality(storage.foldername(name)) = 2
    and (storage.foldername(name))[1] is not distinct from auth.uid()::text
    and case
      when (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then public.can_upload_payment_proof((storage.foldername(name))[2]::uuid)
      else false
    end
  )
  with check (
    bucket_id = 'payment-proofs'
    and public.is_active_user()
    and cardinality(storage.foldername(name)) = 2
    and (storage.foldername(name))[1] is not distinct from auth.uid()::text
    and case
      when (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then public.can_upload_payment_proof((storage.foldername(name))[2]::uuid)
      else false
    end
  );

drop policy if exists "payment_proofs_delete_buyer" on storage.objects;
create policy "payment_proofs_delete_active_buyer"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'payment-proofs'
    and public.is_active_user()
    and cardinality(storage.foldername(name)) = 2
    and (storage.foldername(name))[1] is not distinct from auth.uid()::text
    and case
      when (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then public.payment_is_open((storage.foldername(name))[2]::uuid)
      else false
    end
  );

drop policy if exists "marketplace_products_insert_seller" on storage.objects;
create policy "marketplace_products_insert_active_seller"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'marketplace-products'
    and public.can_manage_marketplace_product(name)
  );

drop policy if exists "marketplace_products_update_seller" on storage.objects;
create policy "marketplace_products_update_active_seller"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'marketplace-products'
    and public.can_manage_marketplace_product(name)
  )
  with check (
    bucket_id = 'marketplace-products'
    and public.can_manage_marketplace_product(name)
  );

drop policy if exists "marketplace_products_delete_seller" on storage.objects;
create policy "marketplace_products_delete_active_seller"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'marketplace-products'
    and public.can_manage_marketplace_product(name)
  );

-- ----------------------------------------------------------------------------
-- 3. Listing ownership and public visibility hardening
-- ----------------------------------------------------------------------------

create or replace function public.seller_is_active(p_seller_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.seller_profiles sp
    join public.profiles p on p.id = sp.user_id
    where sp.id is not distinct from p_seller_id
      and sp.seller_status = 'active'
      and p.account_status = 'active'
  );
$$;

-- Identity resolution is deliberately status-agnostic. Existing order,
-- payment, fulfillment, dispute, and refund ownership must survive a seller
-- suspension; active seller capabilities use auth_active_seller_id() instead.
create or replace function public.auth_seller_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select sp.id
  from public.seller_profiles sp
  where sp.user_id is not distinct from auth.uid();
$$;

-- Initial workflow state is never caller-controlled, including when an admin
-- also has a seller profile. Administrative transitions happen only via the
-- explicit audited RPCs below.
create or replace function public.enforce_initial_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_table_name = 'seller_profiles' then
    new.seller_status := 'pending';
  elsif tg_table_name = 'orders' then
    new.status := 'pending';
  elsif tg_table_name = 'reviews' then
    new.status := 'pending';
  elsif tg_table_name = 'listing_reports' then
    new.status := 'pending';
  elsif tg_table_name = 'disputes' then
    new.status := 'open';
    new.assigned_admin_id := null;
  end if;
  return new;
end;
$$;

create or replace view public.public_seller_profiles as
select
  sp.id,
  sp.store_name,
  sp.description,
  sp.logo_url,
  sp.city,
  sp.province,
  sp.pickup_available,
  sp.delivery_available
from public.seller_profiles sp
join public.profiles p on p.id = sp.user_id
where sp.seller_status = 'active'
  and p.account_status = 'active';

create or replace function public.enforce_active_seller_listing_ops()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seller_status public.seller_status;
  v_category_active boolean;
  v_brand_active boolean;
  v_trusted_inventory boolean := current_setting('app.trusted_inventory_update', true) = 'on';
  v_trusted_moderation boolean := current_setting('app.admin_listing_moderation', true) = 'on';
begin
  if tg_op = 'UPDATE' and new.seller_id is distinct from old.seller_id then
    raise exception 'LISTING_SELLER_IMMUTABLE: listing ownership cannot be changed';
  end if;

  if new.listing_status = 'active' and coalesce(new.quantity, 0) <= 0 then
    raise exception 'INVALID_LISTING_STATE: an active listing must have available stock';
  end if;

  -- Trusted order inventory updates must continue after a seller suspension.
  -- A cancellation may restore a sold listing after its taxonomy was disabled;
  -- retain the stock but return that listing to draft rather than publishing it.
  if v_trusted_inventory then
    if new.listing_status = 'active' then
      select c.is_active into v_category_active
      from public.categories c
      where c.id is not distinct from new.category_id
      for key share;

      if new.brand_id is not null then
        select b.is_active into v_brand_active
        from public.brands b
        where b.id is not distinct from new.brand_id
        for key share;
      end if;

      if v_category_active is distinct from true
         or (new.brand_id is not null and v_brand_active is distinct from true) then
        new.listing_status := 'draft';
      end if;
    end if;
    return new;
  end if;

  if v_trusted_moderation and public.is_admin() then
    return new;
  end if;

  select c.is_active into v_category_active
  from public.categories c
  where c.id is not distinct from new.category_id
  for key share;

  if v_category_active is distinct from true then
    raise exception 'CATEGORY_UNAVAILABLE: listings require an active category';
  end if;

  if new.brand_id is not null then
    select b.is_active into v_brand_active
    from public.brands b
    where b.id is not distinct from new.brand_id
    for key share;

    if v_brand_active is distinct from true then
      raise exception 'BRAND_UNAVAILABLE: listings require an active brand';
    end if;
  end if;

  if new.seller_id is distinct from public.auth_seller_id() then
    raise exception 'FORBIDDEN: only the owning seller can manage this listing';
  end if;

  select sp.seller_status into v_seller_status
  from public.seller_profiles sp
  where sp.id is not distinct from new.seller_id;

  if v_seller_status is distinct from 'active'
     or not public.seller_is_active(new.seller_id) then
    raise exception 'SELLER_UNAVAILABLE: only an active seller can manage listings';
  end if;

  if tg_op = 'UPDATE' and (
    new.listing_status = 'removed'
    or old.listing_status = 'removed'
  ) then
    raise exception 'LISTING_MODERATION_REQUIRED: sellers cannot enter or leave removed status';
  end if;

  if tg_op = 'INSERT' and new.listing_status = 'removed' then
    raise exception 'LISTING_MODERATION_REQUIRED: sellers cannot create removed listings';
  end if;

  return new;
end;
$$;

drop policy if exists "listings_select_active_or_own_or_admin" on public.listings;
create policy "listings_select_active_seller_or_own_or_admin"
  on public.listings
  for select
  using (
    (
      listing_status = 'active'
      and public.seller_is_active(seller_id)
    )
    or seller_id is not distinct from public.auth_seller_id()
    or public.is_admin()
  );

drop policy if exists "paddle_attributes_select_visible_listings" on public.paddle_attributes;
create policy "paddle_attributes_select_visible_listings"
  on public.paddle_attributes
  for select
  using (
    exists (
      select 1
      from public.listings l
      where l.id is not distinct from paddle_attributes.listing_id
        and (
          (l.listing_status = 'active' and public.seller_is_active(l.seller_id))
          or l.seller_id is not distinct from public.auth_seller_id()
          or public.is_admin()
        )
    )
  );

drop policy if exists "listing_images_select_visible_listings" on public.listing_images;
create policy "listing_images_select_visible_listings"
  on public.listing_images
  for select
  using (
    exists (
      select 1
      from public.listings l
      where l.id is not distinct from listing_images.listing_id
        and (
          (l.listing_status = 'active' and public.seller_is_active(l.seller_id))
          or l.seller_id is not distinct from public.auth_seller_id()
          or public.is_admin()
        )
    )
  );

-- The invoker RPC keeps RLS as a second boundary, and explicitly excludes an
-- inactive seller so an active listing can never be emitted with a null seller.
create or replace function public.marketplace_search_listings(
  search text default null,
  category_slug text default null,
  brand_slug text default null,
  p_listing_condition text default null,
  min_price numeric default null,
  max_price numeric default null,
  pickup boolean default null,
  delivery boolean default null,
  sort text default 'newest',
  page integer default 1,
  page_size integer default 12
) returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_page integer := least(greatest(coalesce(page, 1), 1), 100000);
  v_page_size integer := least(greatest(coalesce(page_size, 12), 1), 100);
  v_sort text;
  v_offset integer;
  v_search text;
  v_result jsonb;
begin
  v_offset := (v_page - 1) * v_page_size;
  v_sort := case when sort in ('newest', 'oldest', 'price_asc', 'price_desc') then sort else 'newest' end;
  v_search := case
    when search is null or btrim(search) = '' then null
    else '%' || replace(replace(replace(btrim(search), '\', '\\'), '%', '\%'), '_', '\_') || '%'
  end;

  with filtered as (
    select
      jsonb_build_object(
        'id', l.id,
        'title', l.title,
        'description', l.description,
        'price', l.price,
        'listing_condition', l.listing_condition,
        'quantity', l.quantity,
        'city', l.city,
        'province', l.province,
        'pickup_available', l.pickup_available,
        'delivery_available', l.delivery_available,
        'created_at', l.created_at,
        'category', jsonb_build_object('id', c.id, 'name', c.name, 'slug', c.slug),
        'brand', case when b.id is null then null else jsonb_build_object('id', b.id, 'name', b.name, 'slug', b.slug) end,
        'seller', jsonb_build_object('id', sp.id, 'store_name', sp.store_name),
        'images', coalesce(img.images, '[]'::jsonb)
      ) as item,
      l.created_at,
      l.price,
      l.id
    from public.listings l
    join public.public_seller_profiles sp on sp.id = l.seller_id
    join public.categories c on c.id = l.category_id
    left join public.brands b on b.id = l.brand_id
    left join lateral (
      select jsonb_agg(
        jsonb_build_object(
          'id', i.id,
          'url', i.url,
          'storage_path', i.storage_path,
          'is_primary', i.is_primary,
          'sort_order', i.sort_order
        ) order by i.is_primary desc, i.sort_order, i.created_at, i.id
      ) as images
      from public.listing_images i
      where i.listing_id is not distinct from l.id
    ) img on true
    where l.listing_status = 'active'
      and l.quantity > 0
      and (
        v_search is null
        or l.title ilike v_search
        or l.description ilike v_search
        or c.name ilike v_search
        or b.name ilike v_search
      )
      and (category_slug is null or c.slug is not distinct from category_slug)
      and (brand_slug is null or b.slug is not distinct from brand_slug)
      and (p_listing_condition is null or l.listing_condition::text is not distinct from p_listing_condition)
      and (min_price is null or l.price >= min_price)
      and (max_price is null or l.price <= max_price)
      and (pickup is null or l.pickup_available is not distinct from pickup)
      and (delivery is null or l.delivery_available is not distinct from delivery)
  ), paged as (
    select
      f.item,
      row_number() over (
        order by
          case when v_sort = 'oldest' then f.created_at end asc,
          case when v_sort = 'newest' then f.created_at end desc,
          case when v_sort = 'price_asc' then f.price end asc,
          case when v_sort = 'price_desc' then f.price end desc,
          f.created_at desc,
          f.id desc
      ) as position
    from filtered f
    order by
      case when v_sort = 'oldest' then f.created_at end asc,
      case when v_sort = 'newest' then f.created_at end desc,
      case when v_sort = 'price_asc' then f.price end asc,
      case when v_sort = 'price_desc' then f.price end desc,
      f.created_at desc,
      f.id desc
    limit v_page_size offset v_offset
  )
  select jsonb_build_object(
    'items', coalesce((select jsonb_agg(p.item order by p.position) from paged p), '[]'::jsonb),
    'total', (select count(*) from filtered),
    'page', v_page,
    'pageSize', v_page_size
  ) into v_result;

  return v_result;
end;
$$;

create or replace function public.enforce_available_seller_order_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.seller_is_active(new.seller_id) then
    raise exception 'SELLER_UNAVAILABLE: this seller cannot receive new orders';
  end if;
  return new;
end;
$$;

drop trigger if exists orders_require_available_seller on public.orders;
create trigger orders_require_available_seller
  before insert on public.orders
  for each row execute function public.enforce_available_seller_order_insert();

revoke execute on function public.enforce_active_seller_listing_ops() from public, anon, authenticated;
revoke execute on function public.enforce_available_seller_order_insert() from public, anon, authenticated;
revoke execute on function public.enforce_initial_status() from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 4. Assigned-admin access requires current active-admin authority
-- ----------------------------------------------------------------------------

drop policy if exists "disputes_select_participant_or_admin" on public.disputes;
create policy "disputes_select_participant_or_active_admin"
  on public.disputes
  for select
  to authenticated
  using (public.is_dispute_participant(id) or public.is_admin());

drop policy if exists "dispute_messages_select_participant_or_admin" on public.dispute_messages;
create policy "dispute_messages_select_participant_or_active_admin"
  on public.dispute_messages
  for select
  to authenticated
  using (public.is_dispute_participant(dispute_id) or public.is_admin());

drop policy if exists "dispute_evidence_select_participant_or_admin" on public.dispute_evidence;
create policy "dispute_evidence_select_participant_or_active_admin"
  on public.dispute_evidence
  for select
  to authenticated
  using (public.is_dispute_participant(dispute_id) or public.is_admin());

drop policy if exists "refunds_select_participant_or_admin" on public.refunds;
create policy "refunds_select_participant_or_active_admin"
  on public.refunds
  for select
  to authenticated
  using (
    buyer_id is not distinct from auth.uid()
    or seller_id is not distinct from public.auth_seller_id()
    or public.is_admin()
  );

drop policy if exists "refund_events_select_participant_or_admin" on public.refund_events;
create policy "refund_events_select_participant_or_active_admin"
  on public.refund_events
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.refunds r
      where r.id is not distinct from refund_events.refund_id
        and (
          r.buyer_id is not distinct from auth.uid()
          or r.seller_id is not distinct from public.auth_seller_id()
          or public.is_admin()
        )
    )
  );

drop policy if exists "dispute_events_select_participant_or_admin" on public.dispute_events;
create policy "dispute_events_select_participant_or_active_admin"
  on public.dispute_events
  for select
  to authenticated
  using (public.is_dispute_participant(dispute_id) or public.is_admin());

drop policy if exists "dispute_evidence_select_participant_or_admin" on storage.objects;
create policy "dispute_evidence_select_participant_or_active_admin"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'dispute-evidence'
    and cardinality(storage.foldername(name)) = 2
    and split_part(name, '/', 3) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|webp|pdf)$'
    and (
      case
        when (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then public.is_dispute_participant((storage.foldername(name))[2]::uuid)
        else false
      end
      or public.is_admin()
    )
  );

-- ----------------------------------------------------------------------------
-- 5. Narrow user and seller administration RPCs
-- ----------------------------------------------------------------------------

create or replace function public.admin_promote_user_to_admin(p_user_id uuid, p_reason text)
returns table (user_id uuid, role public.user_role, account_status public.account_status)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN: only an active admin can promote users'; end if;
  perform pg_advisory_xact_lock(1313001);
  select * into v_profile from public.profiles p where p.id is not distinct from p_user_id for update;
  if not found then raise exception 'USER_NOT_FOUND: user does not exist'; end if;
  if v_profile.role = 'admin' then raise exception 'INVALID_ROLE_TRANSITION: user is already an admin'; end if;
  if v_profile.account_status <> 'active' then raise exception 'ACCOUNT_UNAVAILABLE: only active users can become admins'; end if;

  update public.profiles p set role = 'admin' where p.id is not distinct from p_user_id;
  perform public.record_admin_action(
    'user_promoted_to_admin', 'user', p_user_id, p_reason,
    jsonb_build_object('role', v_profile.role, 'account_status', v_profile.account_status),
    jsonb_build_object('role', 'admin', 'account_status', v_profile.account_status)
  );
  return query select p.id, p.role, p.account_status from public.profiles p where p.id is not distinct from p_user_id;
end;
$$;

create or replace function public.admin_demote_admin(p_user_id uuid, p_reason text)
returns table (user_id uuid, role public.user_role, account_status public.account_status)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
  v_new_role public.user_role;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN: only an active admin can demote admins'; end if;
  if p_user_id is not distinct from auth.uid() then raise exception 'SELF_ADMIN_CHANGE_FORBIDDEN: admins cannot demote themselves'; end if;
  perform pg_advisory_xact_lock(1313001);
  select * into v_profile from public.profiles p where p.id is not distinct from p_user_id for update;
  if not found then raise exception 'USER_NOT_FOUND: user does not exist'; end if;
  if v_profile.role <> 'admin' then raise exception 'INVALID_ROLE_TRANSITION: user is not an admin'; end if;
  if v_profile.account_status = 'active' and (
    select count(*) from public.profiles p where p.role = 'admin' and p.account_status = 'active'
  ) <= 1 then
    raise exception 'LAST_ACTIVE_ADMIN: at least one active admin must remain';
  end if;

  v_new_role := case
    when exists (
      select 1
      from public.seller_profiles sp
      where sp.user_id is not distinct from p_user_id
        and sp.seller_status in ('active', 'suspended')
    )
      then 'seller'::public.user_role
    else 'customer'::public.user_role
  end;
  update public.profiles p set role = v_new_role where p.id is not distinct from p_user_id;
  perform public.record_admin_action(
    'admin_demoted', 'user', p_user_id, p_reason,
    jsonb_build_object('role', v_profile.role, 'account_status', v_profile.account_status),
    jsonb_build_object('role', v_new_role, 'account_status', v_profile.account_status)
  );
  return query select p.id, p.role, p.account_status from public.profiles p where p.id is not distinct from p_user_id;
end;
$$;

create or replace function public.admin_suspend_user(p_user_id uuid, p_reason text)
returns table (user_id uuid, role public.user_role, account_status public.account_status)
language plpgsql
security definer
set search_path = public
as $$
declare v_profile public.profiles%rowtype; v_action uuid;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN: only an active admin can suspend users'; end if;
  if p_user_id is not distinct from auth.uid() then raise exception 'SELF_ADMIN_CHANGE_FORBIDDEN: admins cannot suspend themselves'; end if;
  perform pg_advisory_xact_lock(1313001);
  select * into v_profile from public.profiles p where p.id is not distinct from p_user_id for update;
  if not found then raise exception 'USER_NOT_FOUND: user does not exist'; end if;
  if v_profile.account_status <> 'active' then raise exception 'INVALID_ACCOUNT_TRANSITION: only active users can be suspended'; end if;
  if v_profile.role = 'admin' and (
    select count(*) from public.profiles p where p.role = 'admin' and p.account_status = 'active'
  ) <= 1 then raise exception 'LAST_ACTIVE_ADMIN: at least one active admin must remain'; end if;

  update public.profiles p set account_status = 'suspended' where p.id is not distinct from p_user_id;
  v_action := public.record_admin_action(
    'user_suspended', 'user', p_user_id, p_reason,
    jsonb_build_object('role', v_profile.role, 'account_status', v_profile.account_status),
    jsonb_build_object('role', v_profile.role, 'account_status', 'suspended')
  );
  perform public.emit_marketplace_notification(
    p_user_id, 'account.suspended', 'account.suspended:' || v_action::text, 'system',
    'Account suspended', 'Your marketplace account has been suspended.', 'account', p_user_id, auth.uid()
  );
  return query select p.id, p.role, p.account_status from public.profiles p where p.id is not distinct from p_user_id;
end;
$$;

create or replace function public.admin_deactivate_user(p_user_id uuid, p_reason text)
returns table (user_id uuid, role public.user_role, account_status public.account_status)
language plpgsql
security definer
set search_path = public
as $$
declare v_profile public.profiles%rowtype; v_action uuid;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN: only an active admin can deactivate users'; end if;
  if p_user_id is not distinct from auth.uid() then raise exception 'SELF_ADMIN_CHANGE_FORBIDDEN: admins cannot deactivate themselves'; end if;
  perform pg_advisory_xact_lock(1313001);
  select * into v_profile from public.profiles p where p.id is not distinct from p_user_id for update;
  if not found then raise exception 'USER_NOT_FOUND: user does not exist'; end if;
  if v_profile.account_status not in ('active', 'suspended') then raise exception 'INVALID_ACCOUNT_TRANSITION: user is already deactivated'; end if;
  if v_profile.role = 'admin' and v_profile.account_status = 'active' and (
    select count(*) from public.profiles p where p.role = 'admin' and p.account_status = 'active'
  ) <= 1 then raise exception 'LAST_ACTIVE_ADMIN: at least one active admin must remain'; end if;

  update public.profiles p set account_status = 'deactivated' where p.id is not distinct from p_user_id;
  v_action := public.record_admin_action(
    'user_deactivated', 'user', p_user_id, p_reason,
    jsonb_build_object('role', v_profile.role, 'account_status', v_profile.account_status),
    jsonb_build_object('role', v_profile.role, 'account_status', 'deactivated')
  );
  perform public.emit_marketplace_notification(
    p_user_id, 'account.deactivated', 'account.deactivated:' || v_action::text, 'system',
    'Account deactivated', 'Your marketplace account has been deactivated.', 'account', p_user_id, auth.uid()
  );
  return query select p.id, p.role, p.account_status from public.profiles p where p.id is not distinct from p_user_id;
end;
$$;

create or replace function public.admin_reactivate_user(p_user_id uuid, p_reason text)
returns table (user_id uuid, role public.user_role, account_status public.account_status)
language plpgsql
security definer
set search_path = public
as $$
declare v_profile public.profiles%rowtype; v_action uuid;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN: only an active admin can reactivate users'; end if;
  select * into v_profile from public.profiles p where p.id is not distinct from p_user_id for update;
  if not found then raise exception 'USER_NOT_FOUND: user does not exist'; end if;
  if v_profile.account_status not in ('suspended', 'deactivated') then raise exception 'INVALID_ACCOUNT_TRANSITION: only unavailable users can be reactivated'; end if;

  update public.profiles p set account_status = 'active' where p.id is not distinct from p_user_id;
  v_action := public.record_admin_action(
    'user_reactivated', 'user', p_user_id, p_reason,
    jsonb_build_object('role', v_profile.role, 'account_status', v_profile.account_status),
    jsonb_build_object('role', v_profile.role, 'account_status', 'active')
  );
  perform public.emit_marketplace_notification(
    p_user_id, 'account.reactivated', 'account.reactivated:' || v_action::text, 'system',
    'Account reactivated', 'Your marketplace account is active again.', 'account', p_user_id, auth.uid()
  );
  return query select p.id, p.role, p.account_status from public.profiles p where p.id is not distinct from p_user_id;
end;
$$;

create or replace function public.admin_change_seller_status(
  p_seller_id uuid,
  p_expected_status public.seller_status,
  p_new_status public.seller_status,
  p_action_type text,
  p_reason text
)
returns table (seller_id uuid, user_id uuid, seller_status public.seller_status)
language plpgsql
security definer
set search_path = public
as $$
declare v_seller public.seller_profiles%rowtype;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN: only an active admin can moderate sellers'; end if;
  select * into v_seller from public.seller_profiles sp where sp.id is not distinct from p_seller_id for update;
  if not found then raise exception 'SELLER_NOT_FOUND: seller profile does not exist'; end if;
  if v_seller.seller_status is distinct from p_expected_status then
    raise exception 'INVALID_SELLER_TRANSITION: seller is not in the required current status';
  end if;
  if p_new_status = 'active' and not exists (
    select 1
    from public.profiles p
    where p.id is not distinct from v_seller.user_id
      and p.account_status = 'active'
  ) then
    raise exception 'ACCOUNT_UNAVAILABLE: reactivate the user account before activating seller access';
  end if;

  update public.seller_profiles sp set seller_status = p_new_status where sp.id is not distinct from p_seller_id;
  perform public.record_admin_action(
    p_action_type, 'seller', p_seller_id, p_reason,
    jsonb_build_object('seller_status', v_seller.seller_status),
    jsonb_build_object('seller_status', p_new_status)
  );
  return query
    select sp.id, sp.user_id, sp.seller_status
    from public.seller_profiles sp where sp.id is not distinct from p_seller_id;
end;
$$;

create or replace function public.admin_approve_seller(p_seller_id uuid, p_reason text)
returns table (seller_id uuid, user_id uuid, seller_status public.seller_status)
language sql security definer set search_path = public
as $$ select * from public.admin_change_seller_status(p_seller_id, 'pending', 'active', 'seller_approved', p_reason); $$;

create or replace function public.admin_reject_seller(p_seller_id uuid, p_reason text)
returns table (seller_id uuid, user_id uuid, seller_status public.seller_status)
language sql security definer set search_path = public
as $$ select * from public.admin_change_seller_status(p_seller_id, 'pending', 'rejected', 'seller_rejected', p_reason); $$;

create or replace function public.admin_suspend_seller(p_seller_id uuid, p_reason text)
returns table (seller_id uuid, user_id uuid, seller_status public.seller_status)
language sql security definer set search_path = public
as $$ select * from public.admin_change_seller_status(p_seller_id, 'active', 'suspended', 'seller_suspended', p_reason); $$;

create or replace function public.admin_reactivate_seller(p_seller_id uuid, p_reason text)
returns table (seller_id uuid, user_id uuid, seller_status public.seller_status)
language sql security definer set search_path = public
as $$ select * from public.admin_change_seller_status(p_seller_id, 'suspended', 'active', 'seller_reactivated', p_reason); $$;

create or replace function public.notify_seller_status_changed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_title text;
  v_message text;
begin
  if new.seller_status is not distinct from old.seller_status then
    return new;
  end if;

  v_title := case new.seller_status
    when 'active' then 'Seller account active'
    when 'suspended' then 'Seller account suspended'
    when 'rejected' then 'Seller application update'
    else 'Seller application pending'
  end;
  v_message := case new.seller_status
    when 'active' then 'Your seller access is active while your marketplace user account remains active.'
    when 'suspended' then 'New seller activity is suspended. Your existing transaction history remains available.'
    when 'rejected' then 'Your seller application was not approved.'
    else 'Your seller application is pending review.'
  end;

  perform public.emit_marketplace_notification(
    new.user_id,
    'seller.status_changed',
    'seller.status_changed:' || new.id::text || ':' || new.updated_at::text,
    'system',
    v_title,
    v_message,
    'seller_status',
    new.id,
    auth.uid()
  );
  return new;
end;
$$;

revoke execute on function public.admin_change_seller_status(uuid, public.seller_status, public.seller_status, text, text)
  from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 6. Audited category and brand configuration RPCs (never hard-delete)
-- ----------------------------------------------------------------------------

create or replace function public.admin_create_category(
  p_name text, p_slug text, p_description text, p_sort_order integer, p_reason text
)
returns table (id uuid, name text, slug text, description text, is_active boolean, sort_order integer, created_at timestamptz, updated_at timestamptz)
language plpgsql security definer set search_path = public
as $$
declare v_row public.categories%rowtype; v_name text := btrim(coalesce(p_name, '')); v_slug text := lower(btrim(coalesce(p_slug, ''))); v_description text := nullif(btrim(coalesce(p_description, '')), '');
begin
  if not public.is_admin() then raise exception 'FORBIDDEN: only an active admin can create categories'; end if;
  if char_length(v_name) not between 2 and 100 then raise exception 'INVALID_CATEGORY: name must contain 2 to 100 characters'; end if;
  if v_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' or char_length(v_slug) not between 2 and 80 then raise exception 'INVALID_CATEGORY: slug is invalid'; end if;
  if v_description is not null and char_length(v_description) > 1000 then raise exception 'INVALID_CATEGORY: description is too long'; end if;
  if coalesce(p_sort_order, 0) not between 0 and 10000 then raise exception 'INVALID_CATEGORY: sort order must be between 0 and 10000'; end if;
  insert into public.categories (name, slug, description, is_active, sort_order)
  values (v_name, v_slug, v_description, true, coalesce(p_sort_order, 0)) returning * into v_row;
  perform public.record_admin_action('category_created', 'category', v_row.id, p_reason, null,
    jsonb_build_object(
      'name', v_row.name, 'slug', v_row.slug, 'description', v_row.description,
      'is_active', v_row.is_active, 'sort_order', v_row.sort_order
    ));
  return query select c.id, c.name, c.slug, c.description, c.is_active, c.sort_order, c.created_at, c.updated_at from public.categories c where c.id = v_row.id;
exception when unique_violation then raise exception 'CATEGORY_SLUG_EXISTS: category slug already exists';
end;
$$;

create or replace function public.admin_update_category(
  p_category_id uuid, p_name text, p_slug text, p_description text, p_sort_order integer, p_reason text
)
returns table (id uuid, name text, slug text, description text, is_active boolean, sort_order integer, created_at timestamptz, updated_at timestamptz)
language plpgsql security definer set search_path = public
as $$
declare v_old public.categories%rowtype; v_name text := btrim(coalesce(p_name, '')); v_slug text := lower(btrim(coalesce(p_slug, ''))); v_description text := nullif(btrim(coalesce(p_description, '')), '');
begin
  if not public.is_admin() then raise exception 'FORBIDDEN: only an active admin can update categories'; end if;
  if char_length(v_name) not between 2 and 100 then raise exception 'INVALID_CATEGORY: name must contain 2 to 100 characters'; end if;
  if v_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' or char_length(v_slug) not between 2 and 80 then raise exception 'INVALID_CATEGORY: slug is invalid'; end if;
  if v_description is not null and char_length(v_description) > 1000 then raise exception 'INVALID_CATEGORY: description is too long'; end if;
  if p_sort_order is null or p_sort_order not between 0 and 10000 then raise exception 'INVALID_CATEGORY: sort order must be between 0 and 10000'; end if;
  select * into v_old from public.categories c where c.id is not distinct from p_category_id for update;
  if not found then raise exception 'CATEGORY_NOT_FOUND: category does not exist'; end if;
  if (v_old.name, v_old.slug, v_old.description, v_old.sort_order) is not distinct from (v_name, v_slug, v_description, p_sort_order) then raise exception 'NO_CHANGES: category values are unchanged'; end if;
  update public.categories c set name = v_name, slug = v_slug, description = v_description, sort_order = p_sort_order where c.id is not distinct from p_category_id;
  perform public.record_admin_action('category_updated', 'category', p_category_id, p_reason,
    jsonb_build_object(
      'name', v_old.name, 'slug', v_old.slug, 'description', v_old.description,
      'is_active', v_old.is_active, 'sort_order', v_old.sort_order
    ),
    jsonb_build_object(
      'name', v_name, 'slug', v_slug, 'description', v_description,
      'is_active', v_old.is_active, 'sort_order', p_sort_order
    ));
  return query select c.id, c.name, c.slug, c.description, c.is_active, c.sort_order, c.created_at, c.updated_at from public.categories c where c.id is not distinct from p_category_id;
exception when unique_violation then raise exception 'CATEGORY_SLUG_EXISTS: category slug already exists';
end;
$$;

create or replace function public.admin_set_category_active(p_category_id uuid, p_expected boolean, p_new boolean, p_action text, p_reason text)
returns table (id uuid, name text, slug text, is_active boolean, updated_at timestamptz)
language plpgsql security definer set search_path = public
as $$
declare v_old public.categories%rowtype;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN: only an active admin can moderate categories'; end if;
  select * into v_old from public.categories c where c.id is not distinct from p_category_id for update;
  if not found then raise exception 'CATEGORY_NOT_FOUND: category does not exist'; end if;
  if v_old.is_active is distinct from p_expected then raise exception 'INVALID_CATEGORY_TRANSITION: category is not in the required state'; end if;
  if not p_new and exists (
    select 1 from public.listings l
    where l.category_id is not distinct from p_category_id
      and l.listing_status = 'active'
  ) then
    raise exception 'CATEGORY_IN_USE: active listings still reference this category';
  end if;
  update public.categories c set is_active = p_new where c.id is not distinct from p_category_id;
  perform public.record_admin_action(p_action, 'category', p_category_id, p_reason,
    jsonb_build_object(
      'name', v_old.name, 'slug', v_old.slug, 'description', v_old.description,
      'is_active', v_old.is_active, 'sort_order', v_old.sort_order
    ),
    jsonb_build_object(
      'name', v_old.name, 'slug', v_old.slug, 'description', v_old.description,
      'is_active', p_new, 'sort_order', v_old.sort_order
    ));
  return query select c.id, c.name, c.slug, c.is_active, c.updated_at from public.categories c where c.id is not distinct from p_category_id;
end;
$$;

create or replace function public.admin_deactivate_category(p_category_id uuid, p_reason text)
returns table (id uuid, name text, slug text, is_active boolean, updated_at timestamptz)
language sql security definer set search_path = public
as $$ select * from public.admin_set_category_active(p_category_id, true, false, 'category_deactivated', p_reason); $$;

create or replace function public.admin_reactivate_category(p_category_id uuid, p_reason text)
returns table (id uuid, name text, slug text, is_active boolean, updated_at timestamptz)
language sql security definer set search_path = public
as $$ select * from public.admin_set_category_active(p_category_id, false, true, 'category_reactivated', p_reason); $$;

create or replace function public.admin_create_brand(
  p_name text, p_slug text, p_logo_url text, p_description text, p_reason text
)
returns table (id uuid, name text, slug text, logo_url text, description text, is_active boolean, created_at timestamptz, updated_at timestamptz)
language plpgsql security definer set search_path = public
as $$
declare v_row public.brands%rowtype; v_name text := btrim(coalesce(p_name, '')); v_slug text := lower(btrim(coalesce(p_slug, ''))); v_logo text := nullif(btrim(coalesce(p_logo_url, '')), ''); v_description text := nullif(btrim(coalesce(p_description, '')), '');
begin
  if not public.is_admin() then raise exception 'FORBIDDEN: only an active admin can create brands'; end if;
  if char_length(v_name) not between 2 and 100 then raise exception 'INVALID_BRAND: name must contain 2 to 100 characters'; end if;
  if v_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' or char_length(v_slug) not between 2 and 80 then raise exception 'INVALID_BRAND: slug is invalid'; end if;
  if v_logo is not null and char_length(v_logo) > 500 then raise exception 'INVALID_BRAND: logo URL is too long'; end if;
  if v_description is not null and char_length(v_description) > 1000 then raise exception 'INVALID_BRAND: description is too long'; end if;
  insert into public.brands (name, slug, logo_url, description, is_active) values (v_name, v_slug, v_logo, v_description, true) returning * into v_row;
  perform public.record_admin_action('brand_created', 'brand', v_row.id, p_reason, null,
    jsonb_build_object(
      'name', v_row.name, 'slug', v_row.slug, 'logo_url', v_row.logo_url,
      'description', v_row.description, 'is_active', v_row.is_active
    ));
  return query select b.id, b.name, b.slug, b.logo_url, b.description, b.is_active, b.created_at, b.updated_at from public.brands b where b.id = v_row.id;
exception when unique_violation then raise exception 'BRAND_SLUG_EXISTS: brand slug already exists';
end;
$$;

create or replace function public.admin_update_brand(
  p_brand_id uuid, p_name text, p_slug text, p_logo_url text, p_description text, p_reason text
)
returns table (id uuid, name text, slug text, logo_url text, description text, is_active boolean, created_at timestamptz, updated_at timestamptz)
language plpgsql security definer set search_path = public
as $$
declare v_old public.brands%rowtype; v_name text := btrim(coalesce(p_name, '')); v_slug text := lower(btrim(coalesce(p_slug, ''))); v_logo text := nullif(btrim(coalesce(p_logo_url, '')), ''); v_description text := nullif(btrim(coalesce(p_description, '')), '');
begin
  if not public.is_admin() then raise exception 'FORBIDDEN: only an active admin can update brands'; end if;
  if char_length(v_name) not between 2 and 100 then raise exception 'INVALID_BRAND: name must contain 2 to 100 characters'; end if;
  if v_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' or char_length(v_slug) not between 2 and 80 then raise exception 'INVALID_BRAND: slug is invalid'; end if;
  if v_logo is not null and char_length(v_logo) > 500 then raise exception 'INVALID_BRAND: logo URL is too long'; end if;
  if v_description is not null and char_length(v_description) > 1000 then raise exception 'INVALID_BRAND: description is too long'; end if;
  select * into v_old from public.brands b where b.id is not distinct from p_brand_id for update;
  if not found then raise exception 'BRAND_NOT_FOUND: brand does not exist'; end if;
  if (v_old.name, v_old.slug, v_old.logo_url, v_old.description) is not distinct from (v_name, v_slug, v_logo, v_description) then raise exception 'NO_CHANGES: brand values are unchanged'; end if;
  update public.brands b set name = v_name, slug = v_slug, logo_url = v_logo, description = v_description where b.id is not distinct from p_brand_id;
  perform public.record_admin_action('brand_updated', 'brand', p_brand_id, p_reason,
    jsonb_build_object(
      'name', v_old.name, 'slug', v_old.slug, 'logo_url', v_old.logo_url,
      'description', v_old.description, 'is_active', v_old.is_active
    ),
    jsonb_build_object(
      'name', v_name, 'slug', v_slug, 'logo_url', v_logo,
      'description', v_description, 'is_active', v_old.is_active
    ));
  return query select b.id, b.name, b.slug, b.logo_url, b.description, b.is_active, b.created_at, b.updated_at from public.brands b where b.id is not distinct from p_brand_id;
exception when unique_violation then raise exception 'BRAND_SLUG_EXISTS: brand slug already exists';
end;
$$;

create or replace function public.admin_set_brand_active(p_brand_id uuid, p_expected boolean, p_new boolean, p_action text, p_reason text)
returns table (id uuid, name text, slug text, is_active boolean, updated_at timestamptz)
language plpgsql security definer set search_path = public
as $$
declare v_old public.brands%rowtype;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN: only an active admin can moderate brands'; end if;
  select * into v_old from public.brands b where b.id is not distinct from p_brand_id for update;
  if not found then raise exception 'BRAND_NOT_FOUND: brand does not exist'; end if;
  if v_old.is_active is distinct from p_expected then raise exception 'INVALID_BRAND_TRANSITION: brand is not in the required state'; end if;
  if not p_new and exists (
    select 1 from public.listings l
    where l.brand_id is not distinct from p_brand_id
      and l.listing_status = 'active'
  ) then
    raise exception 'BRAND_IN_USE: active listings still reference this brand';
  end if;
  update public.brands b set is_active = p_new where b.id is not distinct from p_brand_id;
  perform public.record_admin_action(p_action, 'brand', p_brand_id, p_reason,
    jsonb_build_object(
      'name', v_old.name, 'slug', v_old.slug, 'logo_url', v_old.logo_url,
      'description', v_old.description, 'is_active', v_old.is_active
    ),
    jsonb_build_object(
      'name', v_old.name, 'slug', v_old.slug, 'logo_url', v_old.logo_url,
      'description', v_old.description, 'is_active', p_new
    ));
  return query select b.id, b.name, b.slug, b.is_active, b.updated_at from public.brands b where b.id is not distinct from p_brand_id;
end;
$$;

create or replace function public.admin_deactivate_brand(p_brand_id uuid, p_reason text)
returns table (id uuid, name text, slug text, is_active boolean, updated_at timestamptz)
language sql security definer set search_path = public
as $$ select * from public.admin_set_brand_active(p_brand_id, true, false, 'brand_deactivated', p_reason); $$;

create or replace function public.admin_reactivate_brand(p_brand_id uuid, p_reason text)
returns table (id uuid, name text, slug text, is_active boolean, updated_at timestamptz)
language sql security definer set search_path = public
as $$ select * from public.admin_set_brand_active(p_brand_id, false, true, 'brand_reactivated', p_reason); $$;

revoke execute on function public.admin_set_category_active(uuid, boolean, boolean, text, text) from public, anon, authenticated;
revoke execute on function public.admin_set_brand_active(uuid, boolean, boolean, text, text) from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 7. Listing, report, review, and dispute moderation RPCs
-- ----------------------------------------------------------------------------

create or replace function public.admin_moderate_listing(p_listing_id uuid, p_action text, p_reason text)
returns table (listing_id uuid, listing_status public.listing_status, updated_at timestamptz)
language plpgsql security definer set search_path = public
as $$
declare v_listing public.listings%rowtype; v_new public.listing_status; v_seller_user uuid; v_action_id uuid; v_action text := lower(btrim(coalesce(p_action, '')));
begin
  if not public.is_admin() then raise exception 'FORBIDDEN: only an active admin can moderate listings'; end if;
  if v_action not in ('remove', 'restore') then raise exception 'INVALID_LISTING_ACTION: action must be remove or restore'; end if;
  select * into v_listing from public.listings l where l.id is not distinct from p_listing_id for update;
  if not found then raise exception 'LISTING_NOT_FOUND: listing does not exist'; end if;
  if v_action = 'remove' and v_listing.listing_status not in ('active', 'draft', 'archived', 'sold') then raise exception 'INVALID_LISTING_TRANSITION: listing cannot be removed from its current status'; end if;
  if v_action = 'restore' and v_listing.listing_status <> 'removed' then raise exception 'INVALID_LISTING_TRANSITION: only removed listings can be restored'; end if;
  v_new := case when v_action = 'remove' then 'removed'::public.listing_status else 'draft'::public.listing_status end;
  perform set_config('app.admin_listing_moderation', 'on', true);
  update public.listings l set listing_status = v_new where l.id is not distinct from p_listing_id;
  v_action_id := public.record_admin_action(
    case when v_action = 'remove' then 'listing_removed' else 'listing_restored' end,
    'listing', p_listing_id, p_reason,
    jsonb_build_object('listing_status', v_listing.listing_status),
    jsonb_build_object('listing_status', v_new)
  );
  select sp.user_id into v_seller_user from public.seller_profiles sp where sp.id is not distinct from v_listing.seller_id;
  perform public.emit_marketplace_notification(
    v_seller_user,
    case when v_action = 'remove' then 'listing.removed' else 'listing.restored' end,
    'listing.moderated:' || v_action_id::text,
    'system',
    case when v_action = 'remove' then 'Listing removed' else 'Listing restored to draft' end,
    case when v_action = 'remove' then 'A marketplace moderator removed one of your listings.' else 'A marketplace moderator restored one of your listings to draft.' end,
    'seller_listing', p_listing_id, auth.uid()
  );
  return query select l.id, l.listing_status, l.updated_at from public.listings l where l.id is not distinct from p_listing_id;
end;
$$;

create or replace function public.admin_update_listing_report(
  p_report_id uuid, p_status public.report_status, p_reason text, p_resolution text default null
)
returns table (report_id uuid, status public.report_status, assigned_admin_id uuid, resolution text, resolved_at timestamptz, updated_at timestamptz)
language plpgsql security definer set search_path = public
as $$
declare v_report public.listing_reports%rowtype; v_resolution text := nullif(btrim(coalesce(p_resolution, '')), '');
begin
  if not public.is_admin() then raise exception 'FORBIDDEN: only an active admin can update listing reports'; end if;
  if p_status is null then raise exception 'INVALID_REPORT_TRANSITION: choose a report status'; end if;
  if v_resolution is not null and char_length(v_resolution) > 2000 then raise exception 'INVALID_RESOLUTION: resolution must be 2000 characters or fewer'; end if;
  select * into v_report from public.listing_reports lr where lr.id is not distinct from p_report_id for update;
  if not found then raise exception 'REPORT_NOT_FOUND: listing report does not exist'; end if;
  if not (
    (v_report.status = 'pending' and p_status = 'under_review')
    or (v_report.status = 'pending' and p_status in ('resolved', 'dismissed'))
    or (v_report.status = 'under_review' and p_status in ('resolved', 'dismissed'))
  ) then raise exception 'INVALID_REPORT_TRANSITION: that report status transition is not allowed'; end if;
  if p_status in ('resolved', 'dismissed') and v_resolution is null then raise exception 'RESOLUTION_REQUIRED: terminal reports require a resolution'; end if;
  if p_status = 'under_review' and v_resolution is not null then raise exception 'INVALID_RESOLUTION: non-terminal reports cannot have a resolution'; end if;

  update public.listing_reports lr
  set status = p_status,
      assigned_admin_id = auth.uid(),
      resolution = case when p_status in ('resolved', 'dismissed') then v_resolution else null end,
      resolved_at = case when p_status in ('resolved', 'dismissed') then now() else null end
  where lr.id is not distinct from p_report_id;
  perform public.record_admin_action(
    'listing_report_status_updated', 'listing_report', p_report_id, p_reason,
    jsonb_build_object('status', v_report.status, 'assigned_admin_id', v_report.assigned_admin_id),
    jsonb_build_object('status', p_status, 'assigned_admin_id', auth.uid(), 'resolution', v_resolution)
  );
  return query select lr.id, lr.status, lr.assigned_admin_id, lr.resolution, lr.resolved_at, lr.updated_at from public.listing_reports lr where lr.id is not distinct from p_report_id;
end;
$$;

create or replace function public.admin_moderate_review(p_review_id uuid, p_action text, p_reason text)
returns table (review_id uuid, status public.review_status, updated_at timestamptz)
language plpgsql security definer set search_path = public
as $$
declare v_review public.reviews%rowtype; v_new public.review_status; v_action text := lower(btrim(coalesce(p_action, ''))); v_seller_user uuid; v_action_id uuid;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN: only an active admin can moderate reviews'; end if;
  if v_action not in ('hide', 'restore') then raise exception 'INVALID_REVIEW_ACTION: action must be hide or restore'; end if;
  select * into v_review from public.reviews r where r.id is not distinct from p_review_id for update;
  if not found then raise exception 'REVIEW_NOT_FOUND: review does not exist'; end if;
  if v_action = 'hide' and v_review.status <> 'approved' then raise exception 'INVALID_REVIEW_TRANSITION: only approved reviews can be hidden'; end if;
  if v_action = 'restore' and v_review.status <> 'hidden' then raise exception 'INVALID_REVIEW_TRANSITION: only hidden reviews can be restored'; end if;
  v_new := case when v_action = 'hide' then 'hidden'::public.review_status else 'approved'::public.review_status end;
  update public.reviews r set status = v_new where r.id is not distinct from p_review_id;
  v_action_id := public.record_admin_action(
    case when v_action = 'hide' then 'review_hidden' else 'review_restored' end,
    'review', p_review_id, p_reason,
    jsonb_build_object('status', v_review.status), jsonb_build_object('status', v_new)
  );
  select sp.user_id into v_seller_user from public.seller_profiles sp where sp.id is not distinct from v_review.seller_id;
  perform public.emit_marketplace_notification(
    v_review.reviewer_id,
    case when v_action = 'hide' then 'review.hidden' else 'review.restored' end,
    'review.moderated:reviewer:' || v_action_id::text,
    'review',
    case when v_action = 'hide' then 'Review hidden' else 'Review restored' end,
    case when v_action = 'hide' then 'A marketplace moderator hid one of your reviews.' else 'A marketplace moderator restored one of your reviews.' end,
    'buyer_order', v_review.order_id, auth.uid()
  );
  perform public.emit_marketplace_notification(
    v_seller_user,
    case when v_action = 'hide' then 'review.hidden' else 'review.restored' end,
    'review.moderated:seller:' || v_action_id::text,
    'review',
    case when v_action = 'hide' then 'Review hidden' else 'Review restored' end,
    case when v_action = 'hide' then 'A marketplace moderator hid a review on your store.' else 'A marketplace moderator restored a review on your store.' end,
    'seller_reviews', p_review_id, auth.uid()
  );
  return query select r.id, r.status, r.updated_at from public.reviews r where r.id is not distinct from p_review_id;
end;
$$;

alter table public.dispute_events drop constraint if exists dispute_events_event_type_check;
alter table public.dispute_events add constraint dispute_events_event_type_check check (
  event_type in (
    'opened', 'escalated', 'claimed', 'closed', 'resolved',
    'refund_requested', 'refund_approved', 'refund_rejected', 'refund_completed'
  )
);

create or replace function public.admin_claim_dispute(p_dispute_id uuid, p_reason text)
returns table (dispute_id uuid, status public.dispute_status, assigned_admin_id uuid, updated_at timestamptz)
language plpgsql security definer set search_path = public
as $$
declare v_dispute public.disputes%rowtype; v_assigned_active boolean;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN: only an active admin can claim disputes'; end if;
  select * into v_dispute from public.disputes d where d.id is not distinct from p_dispute_id for update;
  if not found then raise exception 'DISPUTE_NOT_FOUND: dispute does not exist'; end if;
  select exists (
    select 1 from public.profiles p
    where p.id is not distinct from v_dispute.assigned_admin_id
      and p.role = 'admin' and p.account_status = 'active'
  ) into v_assigned_active;
  if v_dispute.status = 'open' then null;
  elsif v_dispute.status = 'under_review' and not v_assigned_active then null;
  else raise exception 'DISPUTE_NOT_CLAIMABLE: dispute is terminal or already claimed by an active admin';
  end if;
  update public.disputes d set status = 'under_review', assigned_admin_id = auth.uid() where d.id is not distinct from p_dispute_id;
  insert into public.dispute_events (dispute_id, actor_id, event_type, from_status, to_status, details)
  values (p_dispute_id, auth.uid(), 'claimed', v_dispute.status, 'under_review', jsonb_build_object('assigned_admin_id', auth.uid()));
  perform public.record_admin_action(
    'dispute_claimed', 'dispute', p_dispute_id, p_reason,
    jsonb_build_object('status', v_dispute.status, 'assigned_admin_id', v_dispute.assigned_admin_id),
    jsonb_build_object('status', 'under_review', 'assigned_admin_id', auth.uid())
  );
  return query select d.id, d.status, d.assigned_admin_id, d.updated_at from public.disputes d where d.id is not distinct from p_dispute_id;
end;
$$;

create or replace function public.admin_resolve_dispute(p_dispute_id uuid, p_resolution text, p_reason text)
returns table (dispute_id uuid, status public.dispute_status, assigned_admin_id uuid, resolution text, resolved_at timestamptz, updated_at timestamptz)
language plpgsql security definer set search_path = public
as $$
declare v_dispute public.disputes%rowtype; v_resolution text := nullif(btrim(coalesce(p_resolution, '')), '');
begin
  if not public.is_admin() then raise exception 'FORBIDDEN: only an active admin can resolve disputes'; end if;
  if v_resolution is null or char_length(v_resolution) > 2000 then raise exception 'INVALID_RESOLUTION: resolution must contain 1 to 2000 characters'; end if;
  select * into v_dispute from public.disputes d where d.id is not distinct from p_dispute_id for update;
  if not found then raise exception 'DISPUTE_NOT_FOUND: dispute does not exist'; end if;
  if v_dispute.status <> 'under_review' then raise exception 'DISPUTE_NOT_RESOLVABLE: only a claimed dispute under review can be resolved'; end if;
  if v_dispute.assigned_admin_id is distinct from auth.uid() then raise exception 'DISPUTE_NOT_ASSIGNED: claim this dispute before resolving it'; end if;
  if exists (select 1 from public.refunds r where r.dispute_id is not distinct from p_dispute_id and r.status in ('requested', 'approved')) then
    raise exception 'REFUND_STILL_ACTIVE: resolve the active refund before resolving this dispute';
  end if;
  update public.disputes d set status = 'resolved', resolution = v_resolution, resolved_at = now() where d.id is not distinct from p_dispute_id;
  insert into public.dispute_events (dispute_id, actor_id, event_type, from_status, to_status, details)
  values (p_dispute_id, auth.uid(), 'resolved', 'under_review', 'resolved', jsonb_build_object('resolution', v_resolution));
  perform public.record_admin_action(
    'dispute_resolved', 'dispute', p_dispute_id, p_reason,
    jsonb_build_object('status', v_dispute.status, 'assigned_admin_id', v_dispute.assigned_admin_id),
    jsonb_build_object('status', 'resolved', 'assigned_admin_id', auth.uid(), 'resolution', v_resolution)
  );
  return query select d.id, d.status, d.assigned_admin_id, d.resolution, d.resolved_at, d.updated_at from public.disputes d where d.id is not distinct from p_dispute_id;
end;
$$;

-- Safe participant notifications for dispute claims; no participant message is
-- inserted and no admin impersonates a buyer or seller.
create or replace function public.notify_dispute_event_created()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare v_dispute public.disputes%rowtype; v_seller_user uuid; v_recipient uuid; v_event_name text := 'dispute.' || new.event_type; v_title text; v_message text; v_target text;
begin
  select * into v_dispute from public.disputes d where d.id is not distinct from new.dispute_id;
  select sp.user_id into v_seller_user from public.seller_profiles sp where sp.id is not distinct from v_dispute.seller_id;
  v_title := case new.event_type
    when 'opened' then 'New order dispute' when 'escalated' then 'Dispute escalated'
    when 'claimed' then 'Dispute under review' when 'closed' then 'Dispute closed'
    when 'resolved' then 'Dispute resolved' when 'refund_requested' then 'Refund requested'
    when 'refund_approved' then 'Refund approved' when 'refund_rejected' then 'Refund rejected'
    when 'refund_completed' then 'Refund completed' else 'Dispute updated' end;
  v_message := case new.event_type
    when 'opened' then 'A buyer opened a dispute for an order.'
    when 'escalated' then 'A dispute was escalated for moderator review.'
    when 'claimed' then 'A marketplace moderator is reviewing this dispute.'
    when 'closed' then 'An order dispute was closed.'
    when 'resolved' then 'A moderator resolved an order dispute.'
    when 'refund_requested' then 'The buyer requested a refund for a disputed order.'
    when 'refund_approved' then 'The seller approved your refund request.'
    when 'refund_rejected' then 'The seller rejected your refund request.'
    when 'refund_completed' then 'The seller recorded your refund as completed.'
    else 'An order dispute was updated.' end;
  for v_recipient in
    select distinct recipient from (
      select v_dispute.buyer_id as recipient where new.event_type in ('opened', 'escalated', 'claimed', 'closed', 'resolved')
      union all select v_seller_user where new.event_type in ('opened', 'escalated', 'claimed', 'closed', 'resolved', 'refund_requested')
      union all select v_dispute.buyer_id where new.event_type in ('refund_approved', 'refund_rejected', 'refund_completed')
      union all select p.id from public.profiles p where new.event_type = 'escalated' and p.role = 'admin' and p.account_status = 'active'
    ) recipients where recipient is not null and recipient is distinct from new.actor_id
  loop
    v_target := case when v_recipient is not distinct from v_dispute.buyer_id then 'buyer_dispute' when v_recipient is not distinct from v_seller_user then 'seller_dispute' else 'admin_dispute' end;
    perform public.emit_marketplace_notification(v_recipient, v_event_name, v_event_name || ':' || new.id::text, 'dispute', v_title, v_message, v_target, new.dispute_id, new.actor_id);
  end loop;
  return new;
end;
$$;

-- New seller applications notify every currently active admin. Recipient and
-- target identities are derived solely from persisted rows.
create or replace function public.notify_seller_application_created()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare v_admin uuid;
begin
  for v_admin in select p.id from public.profiles p where p.role = 'admin' and p.account_status = 'active'
  loop
    perform public.emit_marketplace_notification(
      v_admin, 'seller.application_created', 'seller.application_created:' || new.id::text,
      'system', 'New seller application', 'A seller application is ready for review.',
      'admin_seller', new.id, new.user_id
    );
  end loop;
  return new;
end;
$$;

drop trigger if exists seller_profiles_notify_application_created on public.seller_profiles;
create trigger seller_profiles_notify_application_created
  after insert on public.seller_profiles
  for each row execute function public.notify_seller_application_created();

revoke execute on function public.notify_dispute_event_created() from public, anon, authenticated;
revoke execute on function public.notify_seller_application_created() from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 8. Operational admin read RPCs (bounded, stable, allowlisted, no dynamic SQL)
-- ----------------------------------------------------------------------------

create index if not exists idx_listings_status_created_id on public.listings (listing_status, created_at desc, id desc);
create index if not exists idx_listing_reports_status_created_id on public.listing_reports (status, created_at desc, id desc);
create index if not exists idx_reviews_status_created_id on public.reviews (status, created_at desc, id desc);
create index if not exists idx_orders_status_created_id on public.orders (status, created_at desc, id desc);
create index if not exists idx_disputes_status_created_id on public.disputes (status, created_at desc, id desc);
create index if not exists idx_refunds_status_created_id on public.refunds (status, created_at desc, id desc);

create or replace function public.admin_summary()
returns table (
  total_users bigint, active_users bigint, suspended_users bigint,
  pending_sellers bigint, active_sellers bigint,
  active_listings bigint, removed_listings bigint,
  pending_reports bigint, reports_under_review bigint,
  approved_reviews bigint, hidden_reviews bigint,
  open_orders bigint, completed_orders bigint, disputed_orders bigint,
  payments_awaiting_review bigint,
  open_disputes bigint, disputes_under_review bigint,
  active_refund_requests bigint
)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'FORBIDDEN: only an active admin can view administration data'; end if;
  return query select
    (select count(*) from public.profiles),
    (select count(*) from public.profiles p where p.account_status = 'active'),
    (select count(*) from public.profiles p where p.account_status = 'suspended'),
    (select count(*) from public.seller_profiles sp where sp.seller_status = 'pending'),
    (select count(*) from public.seller_profiles sp where public.seller_is_active(sp.id)),
    (select count(*) from public.listings l where l.listing_status = 'active' and public.seller_is_active(l.seller_id)),
    (select count(*) from public.listings l where l.listing_status = 'removed'),
    (select count(*) from public.listing_reports lr where lr.status = 'pending'),
    (select count(*) from public.listing_reports lr where lr.status = 'under_review'),
    (select count(*) from public.reviews r where r.status = 'approved'),
    (select count(*) from public.reviews r where r.status = 'hidden'),
    (select count(*) from public.orders o where o.status in ('pending', 'confirmed', 'paid', 'preparing', 'shipped', 'ready_for_pickup')),
    (select count(*) from public.orders o where o.status = 'completed'),
    (select count(distinct d.order_id) from public.disputes d),
    (select count(*) from public.payments p where p.status = 'submitted'),
    (select count(*) from public.disputes d where d.status = 'open'),
    (select count(*) from public.disputes d where d.status = 'under_review'),
    (select count(*) from public.refunds r where r.status in ('requested', 'approved'));
end;
$$;

create or replace function public.admin_list_users(
  p_page integer default 1, p_page_size integer default 20, p_search text default null,
  p_role public.user_role default null, p_account_status public.account_status default null,
  p_sort text default 'newest'
)
returns table (
  user_id uuid, email text, auth_created_at timestamptz, last_sign_in_at timestamptz,
  display_name text, first_name text, last_name text, avatar_url text, city text, province text,
  role public.user_role, account_status public.account_status,
  seller_id uuid, seller_status public.seller_status, profile_created_at timestamptz, total_count bigint
)
language plpgsql stable security definer set search_path = public
as $$
declare v_search text; v_limit integer; v_offset integer;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN: only an active admin can view users'; end if;
  if coalesce(p_page, 0) not between 1 and 100000 or coalesce(p_page_size, 0) not between 1 and 25 then raise exception 'INVALID_PAGINATION: page must be 1 to 100000 and page size 1 to 25'; end if;
  if p_sort is null or p_sort not in ('newest', 'oldest', 'name_asc', 'name_desc', 'last_sign_in') then raise exception 'INVALID_SORT: unsupported user sort'; end if;
  if p_search is not null and char_length(btrim(p_search)) > 120 then raise exception 'INVALID_SEARCH: search must be 120 characters or fewer'; end if;
  v_search := case when p_search is null or btrim(p_search) = '' then null else '%' || replace(replace(replace(btrim(p_search), '\', '\\'), '%', '\%'), '_', '\_') || '%' end;
  v_limit := p_page_size; v_offset := (p_page - 1) * p_page_size;
  return query
    select p.id, u.email::text, u.created_at, u.last_sign_in_at, p.display_name, p.first_name, p.last_name, p.avatar_url, p.city, p.province,
           p.role, p.account_status, sp.id, sp.seller_status, p.created_at, count(*) over()
    from public.profiles p
    join auth.users u on u.id = p.id
    left join public.seller_profiles sp on sp.user_id = p.id
    where (p_role is null or p.role = p_role)
      and (p_account_status is null or p.account_status = p_account_status)
      and (v_search is null or u.email ilike v_search or p.display_name ilike v_search or p.first_name ilike v_search or p.last_name ilike v_search)
    order by
      case when p_sort = 'newest' then p.created_at end desc,
      case when p_sort = 'oldest' then p.created_at end asc,
      case when p_sort = 'name_asc' then lower(coalesce(p.display_name, p.first_name, u.email)) end asc,
      case when p_sort = 'name_desc' then lower(coalesce(p.display_name, p.first_name, u.email)) end desc,
      case when p_sort = 'last_sign_in' then u.last_sign_in_at end desc nulls last,
      p.id desc limit v_limit offset v_offset;
end;
$$;

create or replace function public.admin_get_user(p_user_id uuid)
returns table (
  user_id uuid, email text, auth_created_at timestamptz, last_sign_in_at timestamptz,
  first_name text, last_name text, display_name text, phone text, avatar_url text, city text, province text,
  role public.user_role, account_status public.account_status, profile_created_at timestamptz, profile_updated_at timestamptz,
  seller_id uuid, store_name text, seller_status public.seller_status, seller_created_at timestamptz
)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'FORBIDDEN: only an active admin can view users'; end if;
  return query select p.id, u.email::text, u.created_at, u.last_sign_in_at, p.first_name, p.last_name, p.display_name, p.phone, p.avatar_url, p.city, p.province,
    p.role, p.account_status, p.created_at, p.updated_at, sp.id, sp.store_name, sp.seller_status, sp.created_at
  from public.profiles p join auth.users u on u.id = p.id left join public.seller_profiles sp on sp.user_id = p.id
  where p.id is not distinct from p_user_id;
end;
$$;

create or replace function public.admin_list_sellers(
  p_page integer default 1, p_page_size integer default 20, p_search text default null,
  p_status public.seller_status default null, p_sort text default 'newest'
)
returns table (
  seller_id uuid, user_id uuid, email text, display_name text, store_name text, logo_url text,
  city text, province text, seller_status public.seller_status, account_status public.account_status,
  listing_count bigint, order_count bigint, created_at timestamptz, updated_at timestamptz, total_count bigint
)
language plpgsql stable security definer set search_path = public
as $$
declare v_search text; v_limit integer; v_offset integer;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN: only an active admin can view sellers'; end if;
  if coalesce(p_page, 0) not between 1 and 100000 or coalesce(p_page_size, 0) not between 1 and 25 then raise exception 'INVALID_PAGINATION: page must be 1 to 100000 and page size 1 to 25'; end if;
  if p_sort is null or p_sort not in ('newest', 'oldest', 'store_asc', 'store_desc') then raise exception 'INVALID_SORT: unsupported seller sort'; end if;
  if p_search is not null and char_length(btrim(p_search)) > 120 then raise exception 'INVALID_SEARCH: search must be 120 characters or fewer'; end if;
  v_search := case when p_search is null or btrim(p_search) = '' then null else '%' || replace(replace(replace(btrim(p_search), '\', '\\'), '%', '\%'), '_', '\_') || '%' end;
  v_limit := p_page_size; v_offset := (p_page - 1) * p_page_size;
  return query select sp.id, sp.user_id, u.email::text, p.display_name, sp.store_name, sp.logo_url, sp.city, sp.province, sp.seller_status, p.account_status,
    (select count(*) from public.listings l where l.seller_id = sp.id),
    (select count(*) from public.orders o where o.seller_id = sp.id), sp.created_at, sp.updated_at, count(*) over()
  from public.seller_profiles sp join public.profiles p on p.id = sp.user_id join auth.users u on u.id = sp.user_id
  where (p_status is null or sp.seller_status = p_status)
    and (v_search is null or sp.store_name ilike v_search or u.email ilike v_search or p.display_name ilike v_search)
  order by case when p_sort = 'newest' then sp.created_at end desc, case when p_sort = 'oldest' then sp.created_at end asc,
    case when p_sort = 'store_asc' then lower(sp.store_name) end asc, case when p_sort = 'store_desc' then lower(sp.store_name) end desc,
    sp.id desc limit v_limit offset v_offset;
end;
$$;

create or replace function public.admin_get_seller(p_seller_id uuid)
returns table (
  seller_id uuid, user_id uuid, email text, display_name text, account_status public.account_status,
  store_name text, description text, logo_url text, seller_status public.seller_status,
  city text, province text, pickup_available boolean, delivery_available boolean,
  pickup_location text, pickup_instructions text, created_at timestamptz, updated_at timestamptz,
  active_listing_count bigint, total_listing_count bigint, total_order_count bigint
)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'FORBIDDEN: only an active admin can view sellers'; end if;
  return query select sp.id, sp.user_id, u.email::text, p.display_name, p.account_status, sp.store_name, sp.description, sp.logo_url, sp.seller_status,
    sp.city, sp.province, sp.pickup_available, sp.delivery_available, sp.pickup_location, sp.pickup_instructions, sp.created_at, sp.updated_at,
    (select count(*) from public.listings l where l.seller_id = sp.id and l.listing_status = 'active'),
    (select count(*) from public.listings l where l.seller_id = sp.id),
    (select count(*) from public.orders o where o.seller_id = sp.id)
  from public.seller_profiles sp join public.profiles p on p.id = sp.user_id join auth.users u on u.id = sp.user_id
  where sp.id is not distinct from p_seller_id;
end;
$$;

create or replace function public.admin_list_listings(
  p_page integer default 1, p_page_size integer default 20, p_search text default null,
  p_status public.listing_status default null, p_seller_id uuid default null,
  p_sort text default 'newest'
)
returns table (
  listing_id uuid, title text, listing_status public.listing_status, listing_condition public.listing_condition,
  price numeric, quantity integer, seller_id uuid, store_name text, seller_status public.seller_status,
  category_name text, brand_name text, active_report_count bigint,
  created_at timestamptz, updated_at timestamptz, total_count bigint
)
language plpgsql stable security definer set search_path = public
as $$
declare v_search text; v_limit integer; v_offset integer;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN: only an active admin can view listings'; end if;
  if coalesce(p_page, 0) not between 1 and 100000 or coalesce(p_page_size, 0) not between 1 and 25 then raise exception 'INVALID_PAGINATION: page must be 1 to 100000 and page size 1 to 25'; end if;
  if p_sort is null or p_sort not in ('newest', 'oldest', 'price_asc', 'price_desc', 'title_asc') then raise exception 'INVALID_SORT: unsupported listing sort'; end if;
  if p_search is not null and char_length(btrim(p_search)) > 120 then raise exception 'INVALID_SEARCH: search must be 120 characters or fewer'; end if;
  v_search := case when p_search is null or btrim(p_search) = '' then null else '%' || replace(replace(replace(btrim(p_search), '\', '\\'), '%', '\%'), '_', '\_') || '%' end;
  v_limit := p_page_size; v_offset := (p_page - 1) * p_page_size;
  return query select l.id, l.title, l.listing_status, l.listing_condition, l.price, l.quantity, sp.id, sp.store_name, sp.seller_status, c.name, b.name,
    (select count(*) from public.listing_reports lr where lr.listing_id = l.id and lr.status in ('pending', 'under_review')),
    l.created_at, l.updated_at, count(*) over()
  from public.listings l join public.seller_profiles sp on sp.id = l.seller_id join public.categories c on c.id = l.category_id left join public.brands b on b.id = l.brand_id
  where (p_status is null or l.listing_status = p_status) and (p_seller_id is null or l.seller_id = p_seller_id)
    and (v_search is null or l.title ilike v_search or sp.store_name ilike v_search or c.name ilike v_search or b.name ilike v_search)
  order by case when p_sort = 'newest' then l.created_at end desc, case when p_sort = 'oldest' then l.created_at end asc,
    case when p_sort = 'price_asc' then l.price end asc, case when p_sort = 'price_desc' then l.price end desc,
    case when p_sort = 'title_asc' then lower(l.title) end asc, l.id desc limit v_limit offset v_offset;
end;
$$;

create or replace function public.admin_get_listing(p_listing_id uuid)
returns table (
  listing_id uuid, seller_id uuid, store_name text, seller_status public.seller_status,
  category_id uuid, category_name text, brand_id uuid, brand_name text,
  title text, description text, listing_condition public.listing_condition, price numeric, quantity integer,
  listing_status public.listing_status, city text, province text, pickup_available boolean, delivery_available boolean,
  images jsonb, report_count bigint, created_at timestamptz, updated_at timestamptz
)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'FORBIDDEN: only an active admin can view listings'; end if;
  return query select l.id, sp.id, sp.store_name, sp.seller_status, c.id, c.name, b.id, b.name, l.title, l.description, l.listing_condition, l.price, l.quantity,
    l.listing_status, l.city, l.province, l.pickup_available, l.delivery_available,
    coalesce((select jsonb_agg(jsonb_build_object('id', li.id, 'url', li.url, 'storage_path', li.storage_path, 'is_primary', li.is_primary, 'sort_order', li.sort_order) order by li.is_primary desc, li.sort_order, li.id) from public.listing_images li where li.listing_id = l.id), '[]'::jsonb),
    (select count(*) from public.listing_reports lr where lr.listing_id = l.id), l.created_at, l.updated_at
  from public.listings l join public.seller_profiles sp on sp.id = l.seller_id join public.categories c on c.id = l.category_id left join public.brands b on b.id = l.brand_id
  where l.id is not distinct from p_listing_id;
end;
$$;

create or replace function public.admin_list_listing_reports(
  p_page integer default 1, p_page_size integer default 20, p_search text default null,
  p_status public.report_status default null, p_sort text default 'oldest'
)
returns table (
  report_id uuid, listing_id uuid, listing_title text, seller_id uuid, store_name text,
  reason text, description text, status public.report_status, assigned_admin_id uuid,
  resolution text, resolved_at timestamptz, created_at timestamptz, updated_at timestamptz, total_count bigint
)
language plpgsql stable security definer set search_path = public
as $$
declare v_search text; v_limit integer; v_offset integer;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN: only an active admin can view listing reports'; end if;
  if coalesce(p_page, 0) not between 1 and 100000 or coalesce(p_page_size, 0) not between 1 and 25 then raise exception 'INVALID_PAGINATION: page must be 1 to 100000 and page size 1 to 25'; end if;
  if p_sort is null or p_sort not in ('newest', 'oldest') then raise exception 'INVALID_SORT: unsupported report sort'; end if;
  if p_search is not null and char_length(btrim(p_search)) > 120 then raise exception 'INVALID_SEARCH: search must be 120 characters or fewer'; end if;
  v_search := case when p_search is null or btrim(p_search) = '' then null else '%' || replace(replace(replace(btrim(p_search), '\', '\\'), '%', '\%'), '_', '\_') || '%' end;
  v_limit := p_page_size; v_offset := (p_page - 1) * p_page_size;
  return query select lr.id, lr.listing_id, l.title, lr.seller_id, sp.store_name, lr.reason, lr.description, lr.status, lr.assigned_admin_id,
    lr.resolution, lr.resolved_at, lr.created_at, lr.updated_at, count(*) over()
  from public.listing_reports lr join public.listings l on l.id = lr.listing_id join public.seller_profiles sp on sp.id = lr.seller_id
  where (p_status is null or lr.status = p_status) and (v_search is null or l.title ilike v_search or sp.store_name ilike v_search or lr.reason ilike v_search)
  order by case when p_sort = 'newest' then lr.created_at end desc, case when p_sort = 'oldest' then lr.created_at end asc, lr.id desc
  limit v_limit offset v_offset;
end;
$$;

create or replace function public.admin_get_listing_report(p_report_id uuid)
returns table (
  report_id uuid, listing_id uuid, listing_title text, listing_status public.listing_status,
  seller_id uuid, store_name text, seller_status public.seller_status,
  reason text, description text, status public.report_status, assigned_admin_id uuid,
  assigned_admin_email text, resolution text, resolved_at timestamptz, created_at timestamptz, updated_at timestamptz
)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'FORBIDDEN: only an active admin can view listing reports'; end if;
  return query select lr.id, l.id, l.title, l.listing_status, sp.id, sp.store_name, sp.seller_status, lr.reason, lr.description, lr.status,
    lr.assigned_admin_id, u.email::text, lr.resolution, lr.resolved_at, lr.created_at, lr.updated_at
  from public.listing_reports lr join public.listings l on l.id = lr.listing_id join public.seller_profiles sp on sp.id = lr.seller_id
  left join auth.users u on u.id = lr.assigned_admin_id where lr.id is not distinct from p_report_id;
end;
$$;

create or replace function public.admin_list_reviews(
  p_page integer default 1, p_page_size integer default 20, p_search text default null,
  p_status public.review_status default null, p_rating smallint default null, p_sort text default 'newest'
)
returns table (
  review_id uuid, rating smallint, seller_rating smallint, comment text, status public.review_status,
  reviewer_name text, listing_id uuid, listing_title text, seller_id uuid, store_name text,
  order_id uuid, order_number text, created_at timestamptz, updated_at timestamptz, total_count bigint
)
language plpgsql stable security definer set search_path = public
as $$
declare v_search text; v_limit integer; v_offset integer;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN: only an active admin can view reviews'; end if;
  if coalesce(p_page, 0) not between 1 and 100000 or coalesce(p_page_size, 0) not between 1 and 25 then raise exception 'INVALID_PAGINATION: page must be 1 to 100000 and page size 1 to 25'; end if;
  if p_rating is not null and p_rating not between 1 and 5 then raise exception 'INVALID_RATING: rating must be 1 to 5'; end if;
  if p_sort is null or p_sort not in ('newest', 'oldest', 'rating_asc', 'rating_desc') then raise exception 'INVALID_SORT: unsupported review sort'; end if;
  if p_search is not null and char_length(btrim(p_search)) > 120 then raise exception 'INVALID_SEARCH: search must be 120 characters or fewer'; end if;
  v_search := case when p_search is null or btrim(p_search) = '' then null else '%' || replace(replace(replace(btrim(p_search), '\', '\\'), '%', '\%'), '_', '\_') || '%' end;
  v_limit := p_page_size; v_offset := (p_page - 1) * p_page_size;
  return query select r.id, r.rating, r.seller_rating, r.comment, r.status, coalesce(nullif(btrim(p.display_name), ''), 'Verified Buyer'), r.listing_id, l.title,
    r.seller_id, sp.store_name, r.order_id, o.order_number, r.created_at, r.updated_at, count(*) over()
  from public.reviews r left join public.profiles p on p.id = r.reviewer_id left join public.listings l on l.id = r.listing_id
  join public.seller_profiles sp on sp.id = r.seller_id join public.orders o on o.id = r.order_id
  where (p_status is null or r.status = p_status) and (p_rating is null or r.rating = p_rating)
    and (v_search is null or l.title ilike v_search or sp.store_name ilike v_search or r.comment ilike v_search or o.order_number ilike v_search)
  order by case when p_sort = 'newest' then r.created_at end desc, case when p_sort = 'oldest' then r.created_at end asc,
    case when p_sort = 'rating_asc' then r.rating end asc, case when p_sort = 'rating_desc' then r.rating end desc,
    r.id desc limit v_limit offset v_offset;
end;
$$;

create or replace function public.admin_get_review(p_review_id uuid)
returns table (
  review_id uuid, rating smallint, seller_rating smallint, comment text, status public.review_status,
  reviewer_id uuid, reviewer_name text, listing_id uuid, listing_title text,
  seller_id uuid, store_name text, order_id uuid, order_item_id uuid, order_number text,
  created_at timestamptz, updated_at timestamptz
)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'FORBIDDEN: only an active admin can view reviews'; end if;
  return query select r.id, r.rating, r.seller_rating, r.comment, r.status, r.reviewer_id,
    coalesce(nullif(btrim(p.display_name), ''), 'Verified Buyer'), r.listing_id, l.title, r.seller_id, sp.store_name,
    r.order_id, r.order_item_id, o.order_number, r.created_at, r.updated_at
  from public.reviews r left join public.profiles p on p.id = r.reviewer_id left join public.listings l on l.id = r.listing_id
  join public.seller_profiles sp on sp.id = r.seller_id join public.orders o on o.id = r.order_id
  where r.id is not distinct from p_review_id;
end;
$$;

create or replace function public.admin_list_orders(
  p_page integer default 1, p_page_size integer default 20, p_search text default null,
  p_status public.order_status default null, p_payment_status public.payment_status default null,
  p_sort text default 'newest'
)
returns table (
  order_id uuid, order_number text, buyer_id uuid, buyer_name text, buyer_email text,
  seller_id uuid, store_name text, status public.order_status, fulfillment_type public.fulfillment_type,
  subtotal numeric, total numeric, payment_id uuid, payment_status public.payment_status,
  payment_method text, payment_amount numeric, created_at timestamptz, updated_at timestamptz, total_count bigint
)
language plpgsql stable security definer set search_path = public
as $$
declare v_search text; v_limit integer; v_offset integer;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN: only an active admin can view orders'; end if;
  if coalesce(p_page, 0) not between 1 and 100000 or coalesce(p_page_size, 0) not between 1 and 25 then raise exception 'INVALID_PAGINATION: page must be 1 to 100000 and page size 1 to 25'; end if;
  if p_sort is null or p_sort not in ('newest', 'oldest', 'total_asc', 'total_desc') then raise exception 'INVALID_SORT: unsupported order sort'; end if;
  if p_search is not null and char_length(btrim(p_search)) > 120 then raise exception 'INVALID_SEARCH: search must be 120 characters or fewer'; end if;
  v_search := case when p_search is null or btrim(p_search) = '' then null else '%' || replace(replace(replace(btrim(p_search), '\', '\\'), '%', '\%'), '_', '\_') || '%' end;
  v_limit := p_page_size; v_offset := (p_page - 1) * p_page_size;
  return query select o.id, o.order_number, o.buyer_id, bp.display_name, bu.email::text, o.seller_id, sp.store_name, o.status, o.fulfillment_type,
    o.subtotal, o.total, pay.id, pay.status, pay.payment_method, pay.amount, o.created_at, o.updated_at, count(*) over()
  from public.orders o join public.profiles bp on bp.id = o.buyer_id join auth.users bu on bu.id = o.buyer_id
  join public.seller_profiles sp on sp.id = o.seller_id left join public.payments pay on pay.order_id = o.id
  where (p_status is null or o.status = p_status) and (p_payment_status is null or pay.status = p_payment_status)
    and (v_search is null or o.order_number ilike v_search or bp.display_name ilike v_search or bu.email ilike v_search or sp.store_name ilike v_search)
  order by case when p_sort = 'newest' then o.created_at end desc, case when p_sort = 'oldest' then o.created_at end asc,
    case when p_sort = 'total_asc' then o.total end asc, case when p_sort = 'total_desc' then o.total end desc,
    o.id desc limit v_limit offset v_offset;
end;
$$;

create or replace function public.admin_get_order(p_order_id uuid)
returns table (
  order_id uuid, order_number text, buyer_id uuid, buyer_name text, buyer_email text,
  seller_id uuid, store_name text, seller_user_id uuid, status public.order_status,
  fulfillment_type public.fulfillment_type, subtotal numeric, total numeric, notes text, order_items jsonb,
  payment_id uuid, payment_status public.payment_status, payment_method text, payment_reference text,
  payment_amount numeric, proof_path text, rejection_reason text, paid_at timestamptz,
  recipient_name text, phone text, address text, city text, province text, postal_code text,
  delivery_notes text, pickup_location text, pickup_instructions text, scheduled_date timestamptz,
  courier text, tracking_number text,
  confirmed_at timestamptz, preparing_at timestamptz, shipped_at timestamptz,
  ready_for_pickup_at timestamptz, completed_at timestamptz, cancelled_at timestamptz,
  created_at timestamptz, updated_at timestamptz
)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'FORBIDDEN: only an active admin can view orders'; end if;
  return query select o.id, o.order_number, o.buyer_id, bp.display_name, bu.email::text, o.seller_id, sp.store_name, sp.user_id, o.status,
    o.fulfillment_type, o.subtotal, o.total, o.notes,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', oi.id, 'listing_id', oi.listing_id, 'product_title', oi.product_title,
        'unit_price', oi.unit_price, 'quantity', oi.quantity
      ) order by oi.created_at, oi.id)
      from public.order_items oi where oi.order_id = o.id
    ), '[]'::jsonb),
    pay.id, pay.status, pay.payment_method, pay.payment_reference,
    pay.amount, pay.proof_path, pay.rejection_reason, pay.paid_at, fd.recipient_name, fd.phone, fd.address, fd.city, fd.province, fd.postal_code,
    fd.notes, fd.pickup_location, fd.pickup_instructions, fd.scheduled_date, fd.courier, fd.tracking_number,
    o.confirmed_at, o.preparing_at, o.shipped_at, o.ready_for_pickup_at, o.completed_at, o.cancelled_at, o.created_at, o.updated_at
  from public.orders o join public.profiles bp on bp.id = o.buyer_id join auth.users bu on bu.id = o.buyer_id
  join public.seller_profiles sp on sp.id = o.seller_id left join public.payments pay on pay.order_id = o.id
  left join public.fulfillment_details fd on fd.order_id = o.id where o.id is not distinct from p_order_id;
end;
$$;

create or replace function public.admin_list_disputes(
  p_page integer default 1, p_page_size integer default 20, p_search text default null,
  p_status public.dispute_status default null, p_assigned_to_me boolean default false,
  p_sort text default 'oldest'
)
returns table (
  dispute_id uuid, order_id uuid, order_number text, reason text, status public.dispute_status,
  buyer_id uuid, buyer_name text, seller_id uuid, store_name text,
  assigned_admin_id uuid, assigned_admin_email text, refund_status public.refund_status,
  refund_amount numeric, created_at timestamptz, updated_at timestamptz, total_count bigint
)
language plpgsql stable security definer set search_path = public
as $$
declare v_search text; v_limit integer; v_offset integer;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN: only an active admin can view disputes'; end if;
  if coalesce(p_page, 0) not between 1 and 100000 or coalesce(p_page_size, 0) not between 1 and 25 then raise exception 'INVALID_PAGINATION: page must be 1 to 100000 and page size 1 to 25'; end if;
  if p_sort is null or p_sort not in ('newest', 'oldest') then raise exception 'INVALID_SORT: unsupported dispute sort'; end if;
  if p_search is not null and char_length(btrim(p_search)) > 120 then raise exception 'INVALID_SEARCH: search must be 120 characters or fewer'; end if;
  v_search := case when p_search is null or btrim(p_search) = '' then null else '%' || replace(replace(replace(btrim(p_search), '\', '\\'), '%', '\%'), '_', '\_') || '%' end;
  v_limit := p_page_size; v_offset := (p_page - 1) * p_page_size;
  return query select d.id, d.order_id, o.order_number, d.reason, d.status, d.buyer_id, bp.display_name, d.seller_id, sp.store_name,
    d.assigned_admin_id, au.email::text, r.status, r.amount, d.created_at, d.updated_at, count(*) over()
  from public.disputes d join public.orders o on o.id = d.order_id join public.profiles bp on bp.id = d.buyer_id
  join public.seller_profiles sp on sp.id = d.seller_id left join auth.users au on au.id = d.assigned_admin_id left join public.refunds r on r.dispute_id = d.id
  where (p_status is null or d.status = p_status) and (not coalesce(p_assigned_to_me, false) or d.assigned_admin_id is not distinct from auth.uid())
    and (v_search is null or o.order_number ilike v_search or d.reason ilike v_search or bp.display_name ilike v_search or sp.store_name ilike v_search)
  order by case when p_sort = 'newest' then d.created_at end desc, case when p_sort = 'oldest' then d.created_at end asc, d.id desc
  limit v_limit offset v_offset;
end;
$$;

create or replace function public.admin_get_dispute(p_dispute_id uuid)
returns table (
  dispute_id uuid, order_id uuid, order_number text, opened_by uuid, buyer_id uuid, buyer_name text, buyer_email text,
  seller_id uuid, store_name text, seller_user_id uuid, seller_email text,
  reason text, description text, status public.dispute_status, assigned_admin_id uuid, assigned_admin_email text,
  resolution text, resolved_at timestamptz, evidence_count bigint, message_count bigint,
  refund_id uuid, refund_status public.refund_status, refund_amount numeric,
  created_at timestamptz, updated_at timestamptz
)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'FORBIDDEN: only an active admin can view disputes'; end if;
  return query select d.id, d.order_id, o.order_number, d.opened_by, d.buyer_id, bp.display_name, bu.email::text,
    d.seller_id, sp.store_name, sp.user_id, su.email::text, d.reason, d.description, d.status, d.assigned_admin_id, au.email::text,
    d.resolution, d.resolved_at,
    (select count(*) from public.dispute_evidence de where de.dispute_id = d.id),
    (select count(*) from public.dispute_messages dm where dm.dispute_id = d.id),
    r.id, r.status, r.amount, d.created_at, d.updated_at
  from public.disputes d join public.orders o on o.id = d.order_id join public.profiles bp on bp.id = d.buyer_id join auth.users bu on bu.id = d.buyer_id
  join public.seller_profiles sp on sp.id = d.seller_id join auth.users su on su.id = sp.user_id
  left join auth.users au on au.id = d.assigned_admin_id left join public.refunds r on r.dispute_id = d.id
  where d.id is not distinct from p_dispute_id;
end;
$$;

create or replace function public.admin_list_dispute_messages(
  p_dispute_id uuid, p_page integer default 1, p_page_size integer default 20, p_sort text default 'oldest'
)
returns table (
  message_id uuid, dispute_id uuid, sender_id uuid, sender_name text,
  sender_kind text, message text, created_at timestamptz, total_count bigint
)
language plpgsql stable security definer set search_path = public
as $$
declare v_limit integer; v_offset integer;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN: only an active admin can view dispute messages'; end if;
  if coalesce(p_page, 0) not between 1 and 100000 or coalesce(p_page_size, 0) not between 1 and 25 then raise exception 'INVALID_PAGINATION: page must be 1 to 100000 and page size 1 to 25'; end if;
  if p_sort is null or p_sort not in ('newest', 'oldest') then raise exception 'INVALID_SORT: unsupported dispute message sort'; end if;
  if not exists (select 1 from public.disputes d where d.id is not distinct from p_dispute_id) then raise exception 'DISPUTE_NOT_FOUND: dispute does not exist'; end if;
  v_limit := p_page_size; v_offset := (p_page - 1) * p_page_size;
  return query
  select dm.id, dm.dispute_id, dm.sender_id,
    coalesce(nullif(btrim(p.display_name), ''), case when dm.sender_id = d.buyer_id then 'Buyer' else 'Seller' end),
    case when dm.sender_id = d.buyer_id then 'buyer' else 'seller' end,
    dm.message, dm.created_at, count(*) over()
  from public.dispute_messages dm join public.disputes d on d.id = dm.dispute_id left join public.profiles p on p.id = dm.sender_id
  where dm.dispute_id is not distinct from p_dispute_id
  order by case when p_sort = 'newest' then dm.created_at end desc, case when p_sort = 'oldest' then dm.created_at end asc, dm.id asc
  limit v_limit offset v_offset;
end;
$$;

create or replace function public.admin_list_dispute_evidence(
  p_dispute_id uuid, p_page integer default 1, p_page_size integer default 20, p_sort text default 'oldest'
)
returns table (
  evidence_id uuid, dispute_id uuid, uploader_id uuid, uploader_name text,
  original_filename text, mime_type text, size_bytes bigint, storage_path text,
  legacy_url text, created_at timestamptz, total_count bigint
)
language plpgsql stable security definer set search_path = public
as $$
declare v_limit integer; v_offset integer;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN: only an active admin can view dispute evidence'; end if;
  if coalesce(p_page, 0) not between 1 and 100000 or coalesce(p_page_size, 0) not between 1 and 25 then raise exception 'INVALID_PAGINATION: page must be 1 to 100000 and page size 1 to 25'; end if;
  if p_sort is null or p_sort not in ('newest', 'oldest') then raise exception 'INVALID_SORT: unsupported dispute evidence sort'; end if;
  if not exists (select 1 from public.disputes d where d.id is not distinct from p_dispute_id) then raise exception 'DISPUTE_NOT_FOUND: dispute does not exist'; end if;
  v_limit := p_page_size; v_offset := (p_page - 1) * p_page_size;
  return query
  select de.id, de.dispute_id, de.uploader_id, coalesce(nullif(btrim(p.display_name), ''), 'Participant'),
    de.original_filename, de.mime_type, de.size_bytes, de.storage_path, de.url, de.created_at, count(*) over()
  from public.dispute_evidence de left join public.profiles p on p.id = de.uploader_id
  where de.dispute_id is not distinct from p_dispute_id
  order by case when p_sort = 'newest' then de.created_at end desc, case when p_sort = 'oldest' then de.created_at end asc, de.id asc
  limit v_limit offset v_offset;
end;
$$;

create or replace function public.admin_list_dispute_events(
  p_dispute_id uuid, p_page integer default 1, p_page_size integer default 20, p_sort text default 'oldest'
)
returns table (
  event_id uuid, dispute_id uuid, actor_id uuid, event_type text,
  from_status public.dispute_status, to_status public.dispute_status,
  details jsonb, created_at timestamptz, total_count bigint
)
language plpgsql stable security definer set search_path = public
as $$
declare v_limit integer; v_offset integer;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN: only an active admin can view dispute events'; end if;
  if coalesce(p_page, 0) not between 1 and 100000 or coalesce(p_page_size, 0) not between 1 and 25 then raise exception 'INVALID_PAGINATION: page must be 1 to 100000 and page size 1 to 25'; end if;
  if p_sort is null or p_sort not in ('newest', 'oldest') then raise exception 'INVALID_SORT: unsupported dispute event sort'; end if;
  if not exists (select 1 from public.disputes d where d.id is not distinct from p_dispute_id) then raise exception 'DISPUTE_NOT_FOUND: dispute does not exist'; end if;
  v_limit := p_page_size; v_offset := (p_page - 1) * p_page_size;
  return query select de.id, de.dispute_id, de.actor_id, de.event_type, de.from_status, de.to_status, de.details, de.created_at, count(*) over()
  from public.dispute_events de where de.dispute_id is not distinct from p_dispute_id
  order by case when p_sort = 'newest' then de.created_at end desc, case when p_sort = 'oldest' then de.created_at end asc, de.id asc
  limit v_limit offset v_offset;
end;
$$;

create or replace function public.admin_list_refunds(
  p_page integer default 1, p_page_size integer default 20, p_search text default null,
  p_status public.refund_status default null, p_sort text default 'newest'
)
returns table (
  refund_id uuid, dispute_id uuid, order_id uuid, order_number text, buyer_id uuid, buyer_name text,
  seller_id uuid, store_name text, amount numeric, status public.refund_status,
  requested_at timestamptz, reviewed_at timestamptz, completed_at timestamptz, total_count bigint
)
language plpgsql stable security definer set search_path = public
as $$
declare v_search text; v_limit integer; v_offset integer;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN: only an active admin can view refunds'; end if;
  if coalesce(p_page, 0) not between 1 and 100000 or coalesce(p_page_size, 0) not between 1 and 25 then raise exception 'INVALID_PAGINATION: page must be 1 to 100000 and page size 1 to 25'; end if;
  if p_sort is null or p_sort not in ('newest', 'oldest', 'amount_asc', 'amount_desc') then raise exception 'INVALID_SORT: unsupported refund sort'; end if;
  if p_search is not null and char_length(btrim(p_search)) > 120 then raise exception 'INVALID_SEARCH: search must be 120 characters or fewer'; end if;
  v_search := case when p_search is null or btrim(p_search) = '' then null else '%' || replace(replace(replace(btrim(p_search), '\', '\\'), '%', '\%'), '_', '\_') || '%' end;
  v_limit := p_page_size; v_offset := (p_page - 1) * p_page_size;
  return query select r.id, r.dispute_id, r.order_id, o.order_number, r.buyer_id, bp.display_name, r.seller_id, sp.store_name,
    r.amount, r.status, r.requested_at, r.reviewed_at, r.completed_at, count(*) over()
  from public.refunds r join public.orders o on o.id = r.order_id join public.profiles bp on bp.id = r.buyer_id join public.seller_profiles sp on sp.id = r.seller_id
  where (p_status is null or r.status = p_status)
    and (v_search is null or o.order_number ilike v_search or bp.display_name ilike v_search or sp.store_name ilike v_search or r.reason ilike v_search)
  order by case when p_sort = 'newest' then r.requested_at end desc, case when p_sort = 'oldest' then r.requested_at end asc,
    case when p_sort = 'amount_asc' then r.amount end asc, case when p_sort = 'amount_desc' then r.amount end desc,
    r.id desc limit v_limit offset v_offset;
end;
$$;

create or replace function public.admin_get_refund(p_refund_id uuid)
returns table (
  refund_id uuid, dispute_id uuid, order_id uuid, order_number text, payment_id uuid,
  buyer_id uuid, buyer_name text, buyer_email text, seller_id uuid, store_name text, seller_user_id uuid,
  amount numeric, status public.refund_status, reason text, review_reason text,
  method public.refund_method, reference text, notes text,
  requested_at timestamptz, reviewed_at timestamptz, completed_at timestamptz, created_at timestamptz, updated_at timestamptz
)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'FORBIDDEN: only an active admin can view refunds'; end if;
  return query select r.id, r.dispute_id, r.order_id, o.order_number, r.payment_id, r.buyer_id, bp.display_name, bu.email::text,
    r.seller_id, sp.store_name, sp.user_id, r.amount, r.status, r.reason, r.review_reason, r.method, r.reference, r.notes,
    r.requested_at, r.reviewed_at, r.completed_at, r.created_at, r.updated_at
  from public.refunds r join public.orders o on o.id = r.order_id join public.profiles bp on bp.id = r.buyer_id
  join auth.users bu on bu.id = r.buyer_id join public.seller_profiles sp on sp.id = r.seller_id
  where r.id is not distinct from p_refund_id;
end;
$$;

create or replace function public.admin_list_refund_events(
  p_refund_id uuid, p_page integer default 1, p_page_size integer default 20, p_sort text default 'oldest'
)
returns table (
  event_id uuid, refund_id uuid, actor_id uuid, event_type text,
  from_status public.refund_status, to_status public.refund_status,
  details jsonb, created_at timestamptz, total_count bigint
)
language plpgsql stable security definer set search_path = public
as $$
declare v_limit integer; v_offset integer;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN: only an active admin can view refund events'; end if;
  if coalesce(p_page, 0) not between 1 and 100000 or coalesce(p_page_size, 0) not between 1 and 25 then raise exception 'INVALID_PAGINATION: page must be 1 to 100000 and page size 1 to 25'; end if;
  if p_sort is null or p_sort not in ('newest', 'oldest') then raise exception 'INVALID_SORT: unsupported refund event sort'; end if;
  if not exists (select 1 from public.refunds r where r.id is not distinct from p_refund_id) then raise exception 'REFUND_NOT_FOUND: refund does not exist'; end if;
  v_limit := p_page_size; v_offset := (p_page - 1) * p_page_size;
  return query select re.id, re.refund_id, re.actor_id, re.event_type, re.from_status, re.to_status, re.details, re.created_at, count(*) over()
  from public.refund_events re where re.refund_id is not distinct from p_refund_id
  order by case when p_sort = 'newest' then re.created_at end desc, case when p_sort = 'oldest' then re.created_at end asc, re.id asc
  limit v_limit offset v_offset;
end;
$$;

create or replace function public.admin_list_categories(
  p_page integer default 1, p_page_size integer default 20, p_search text default null,
  p_is_active boolean default null, p_sort text default 'sort_order'
)
returns table (id uuid, name text, slug text, description text, is_active boolean, sort_order integer, listing_count bigint, created_at timestamptz, updated_at timestamptz, total_count bigint)
language plpgsql stable security definer set search_path = public
as $$
declare v_search text; v_limit integer; v_offset integer;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN: only an active admin can view categories'; end if;
  if coalesce(p_page, 0) not between 1 and 100000 or coalesce(p_page_size, 0) not between 1 and 25 then raise exception 'INVALID_PAGINATION: page must be 1 to 100000 and page size 1 to 25'; end if;
  if p_sort is null or p_sort not in ('sort_order', 'name_asc', 'name_desc', 'newest') then raise exception 'INVALID_SORT: unsupported category sort'; end if;
  if p_search is not null and char_length(btrim(p_search)) > 120 then raise exception 'INVALID_SEARCH: search must be 120 characters or fewer'; end if;
  v_search := case when p_search is null or btrim(p_search) = '' then null else '%' || replace(replace(replace(btrim(p_search), '\', '\\'), '%', '\%'), '_', '\_') || '%' end;
  v_limit := p_page_size; v_offset := (p_page - 1) * p_page_size;
  return query select c.id, c.name, c.slug, c.description, c.is_active, c.sort_order,
    (select count(*) from public.listings l where l.category_id = c.id), c.created_at, c.updated_at, count(*) over()
  from public.categories c where (p_is_active is null or c.is_active = p_is_active) and (v_search is null or c.name ilike v_search or c.slug ilike v_search)
  order by case when p_sort = 'sort_order' then c.sort_order end asc, case when p_sort = 'name_asc' then lower(c.name) end asc,
    case when p_sort = 'name_desc' then lower(c.name) end desc, case when p_sort = 'newest' then c.created_at end desc, c.id desc
  limit v_limit offset v_offset;
end;
$$;

create or replace function public.admin_list_brands(
  p_page integer default 1, p_page_size integer default 20, p_search text default null,
  p_is_active boolean default null, p_sort text default 'name_asc'
)
returns table (id uuid, name text, slug text, logo_url text, description text, is_active boolean, listing_count bigint, created_at timestamptz, updated_at timestamptz, total_count bigint)
language plpgsql stable security definer set search_path = public
as $$
declare v_search text; v_limit integer; v_offset integer;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN: only an active admin can view brands'; end if;
  if coalesce(p_page, 0) not between 1 and 100000 or coalesce(p_page_size, 0) not between 1 and 25 then raise exception 'INVALID_PAGINATION: page must be 1 to 100000 and page size 1 to 25'; end if;
  if p_sort is null or p_sort not in ('name_asc', 'name_desc', 'newest', 'oldest') then raise exception 'INVALID_SORT: unsupported brand sort'; end if;
  if p_search is not null and char_length(btrim(p_search)) > 120 then raise exception 'INVALID_SEARCH: search must be 120 characters or fewer'; end if;
  v_search := case when p_search is null or btrim(p_search) = '' then null else '%' || replace(replace(replace(btrim(p_search), '\', '\\'), '%', '\%'), '_', '\_') || '%' end;
  v_limit := p_page_size; v_offset := (p_page - 1) * p_page_size;
  return query select b.id, b.name, b.slug, b.logo_url, b.description, b.is_active,
    (select count(*) from public.listings l where l.brand_id = b.id), b.created_at, b.updated_at, count(*) over()
  from public.brands b where (p_is_active is null or b.is_active = p_is_active) and (v_search is null or b.name ilike v_search or b.slug ilike v_search)
  order by case when p_sort = 'name_asc' then lower(b.name) end asc, case when p_sort = 'name_desc' then lower(b.name) end desc,
    case when p_sort = 'newest' then b.created_at end desc, case when p_sort = 'oldest' then b.created_at end asc, b.id desc
  limit v_limit offset v_offset;
end;
$$;

create or replace function public.admin_list_admin_actions(
  p_page integer default 1, p_page_size integer default 20, p_search text default null,
  p_action_type text default null, p_entity_type text default null, p_admin_id uuid default null,
  p_sort text default 'newest'
)
returns table (
  action_id uuid, admin_id uuid, admin_email text, action_type text, entity_type text,
  entity_id uuid, reason text, previous_data jsonb, new_data jsonb, created_at timestamptz, total_count bigint
)
language plpgsql stable security definer set search_path = public
as $$
declare v_search text; v_limit integer; v_offset integer;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN: only an active admin can view administrative actions'; end if;
  if coalesce(p_page, 0) not between 1 and 100000 or coalesce(p_page_size, 0) not between 1 and 25 then raise exception 'INVALID_PAGINATION: page must be 1 to 100000 and page size 1 to 25'; end if;
  if p_sort is null or p_sort not in ('newest', 'oldest') then raise exception 'INVALID_SORT: unsupported administrative action sort'; end if;
  if p_search is not null and char_length(btrim(p_search)) > 120 then raise exception 'INVALID_SEARCH: search must be 120 characters or fewer'; end if;
  if p_action_type is not null and (char_length(p_action_type) > 80 or p_action_type !~ '^[a-z][a-z0-9_]*$') then raise exception 'INVALID_FILTER: action type is invalid'; end if;
  if p_entity_type is not null and (char_length(p_entity_type) > 80 or p_entity_type !~ '^[a-z][a-z0-9_]*$') then raise exception 'INVALID_FILTER: entity type is invalid'; end if;
  v_search := case when p_search is null or btrim(p_search) = '' then null else '%' || replace(replace(replace(btrim(p_search), '\', '\\'), '%', '\%'), '_', '\_') || '%' end;
  v_limit := p_page_size; v_offset := (p_page - 1) * p_page_size;
  return query select aa.id, aa.admin_id, u.email::text, aa.action_type, aa.entity_type, aa.entity_id, aa.reason,
    coalesce(aa.previous_data, aa.details), aa.new_data, aa.created_at, count(*) over()
  from public.admin_actions aa join auth.users u on u.id = aa.admin_id
  where (p_action_type is null or aa.action_type = p_action_type) and (p_entity_type is null or aa.entity_type = p_entity_type)
    and (p_admin_id is null or aa.admin_id = p_admin_id)
    and (v_search is null or aa.action_type ilike v_search or aa.entity_type ilike v_search or aa.reason ilike v_search or u.email ilike v_search)
  order by case when p_sort = 'newest' then aa.created_at end desc, case when p_sort = 'oldest' then aa.created_at end asc, aa.id desc
  limit v_limit offset v_offset;
end;
$$;

create or replace function public.admin_get_admin_action(p_action_id uuid)
returns table (
  action_id uuid, admin_id uuid, admin_email text, action_type text, entity_type text,
  entity_id uuid, reason text, previous_data jsonb, new_data jsonb, created_at timestamptz
)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'FORBIDDEN: only an active admin can view administrative actions'; end if;
  return query select aa.id, aa.admin_id, u.email::text, aa.action_type, aa.entity_type, aa.entity_id, aa.reason,
    coalesce(aa.previous_data, aa.details), aa.new_data, aa.created_at
  from public.admin_actions aa join auth.users u on u.id = aa.admin_id where aa.id is not distinct from p_action_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- 9. Exact function execution grants
-- ----------------------------------------------------------------------------

revoke execute on function public.is_active_user() from public, anon;
revoke execute on function public.auth_active_seller_id() from public, anon;
revoke execute on function public.can_manage_marketplace_product(text) from public, anon;
grant execute on function public.is_active_user() to authenticated;
grant execute on function public.auth_active_seller_id() to authenticated;
grant execute on function public.can_manage_marketplace_product(text) to authenticated;
revoke execute on function public.enforce_active_account_mutation() from public, anon, authenticated;
revoke execute on function public.notify_seller_status_changed() from public, anon, authenticated;
revoke execute on function public.mark_notification_read(uuid) from public, anon;
revoke execute on function public.mark_all_notifications_read() from public, anon;
grant execute on function public.mark_notification_read(uuid) to authenticated;
grant execute on function public.mark_all_notifications_read() to authenticated;

revoke execute on function public.admin_promote_user_to_admin(uuid, text) from public, anon;
revoke execute on function public.admin_demote_admin(uuid, text) from public, anon;
revoke execute on function public.admin_suspend_user(uuid, text) from public, anon;
revoke execute on function public.admin_deactivate_user(uuid, text) from public, anon;
revoke execute on function public.admin_reactivate_user(uuid, text) from public, anon;
revoke execute on function public.admin_approve_seller(uuid, text) from public, anon;
revoke execute on function public.admin_reject_seller(uuid, text) from public, anon;
revoke execute on function public.admin_suspend_seller(uuid, text) from public, anon;
revoke execute on function public.admin_reactivate_seller(uuid, text) from public, anon;
revoke execute on function public.admin_create_category(text, text, text, integer, text) from public, anon;
revoke execute on function public.admin_update_category(uuid, text, text, text, integer, text) from public, anon;
revoke execute on function public.admin_deactivate_category(uuid, text) from public, anon;
revoke execute on function public.admin_reactivate_category(uuid, text) from public, anon;
revoke execute on function public.admin_create_brand(text, text, text, text, text) from public, anon;
revoke execute on function public.admin_update_brand(uuid, text, text, text, text, text) from public, anon;
revoke execute on function public.admin_deactivate_brand(uuid, text) from public, anon;
revoke execute on function public.admin_reactivate_brand(uuid, text) from public, anon;
revoke execute on function public.admin_moderate_listing(uuid, text, text) from public, anon;
revoke execute on function public.admin_update_listing_report(uuid, public.report_status, text, text) from public, anon;
revoke execute on function public.admin_moderate_review(uuid, text, text) from public, anon;
revoke execute on function public.admin_claim_dispute(uuid, text) from public, anon;
revoke execute on function public.admin_resolve_dispute(uuid, text, text) from public, anon;

grant execute on function public.admin_promote_user_to_admin(uuid, text) to authenticated;
grant execute on function public.admin_demote_admin(uuid, text) to authenticated;
grant execute on function public.admin_suspend_user(uuid, text) to authenticated;
grant execute on function public.admin_deactivate_user(uuid, text) to authenticated;
grant execute on function public.admin_reactivate_user(uuid, text) to authenticated;
grant execute on function public.admin_approve_seller(uuid, text) to authenticated;
grant execute on function public.admin_reject_seller(uuid, text) to authenticated;
grant execute on function public.admin_suspend_seller(uuid, text) to authenticated;
grant execute on function public.admin_reactivate_seller(uuid, text) to authenticated;
grant execute on function public.admin_create_category(text, text, text, integer, text) to authenticated;
grant execute on function public.admin_update_category(uuid, text, text, text, integer, text) to authenticated;
grant execute on function public.admin_deactivate_category(uuid, text) to authenticated;
grant execute on function public.admin_reactivate_category(uuid, text) to authenticated;
grant execute on function public.admin_create_brand(text, text, text, text, text) to authenticated;
grant execute on function public.admin_update_brand(uuid, text, text, text, text, text) to authenticated;
grant execute on function public.admin_deactivate_brand(uuid, text) to authenticated;
grant execute on function public.admin_reactivate_brand(uuid, text) to authenticated;
grant execute on function public.admin_moderate_listing(uuid, text, text) to authenticated;
grant execute on function public.admin_update_listing_report(uuid, public.report_status, text, text) to authenticated;
grant execute on function public.admin_moderate_review(uuid, text, text) to authenticated;
grant execute on function public.admin_claim_dispute(uuid, text) to authenticated;
grant execute on function public.admin_resolve_dispute(uuid, text, text) to authenticated;

revoke execute on function public.admin_summary() from public, anon;
revoke execute on function public.admin_list_users(integer, integer, text, public.user_role, public.account_status, text) from public, anon;
revoke execute on function public.admin_get_user(uuid) from public, anon;
revoke execute on function public.admin_list_sellers(integer, integer, text, public.seller_status, text) from public, anon;
revoke execute on function public.admin_get_seller(uuid) from public, anon;
revoke execute on function public.admin_list_listings(integer, integer, text, public.listing_status, uuid, text) from public, anon;
revoke execute on function public.admin_get_listing(uuid) from public, anon;
revoke execute on function public.admin_list_listing_reports(integer, integer, text, public.report_status, text) from public, anon;
revoke execute on function public.admin_get_listing_report(uuid) from public, anon;
revoke execute on function public.admin_list_reviews(integer, integer, text, public.review_status, smallint, text) from public, anon;
revoke execute on function public.admin_get_review(uuid) from public, anon;
revoke execute on function public.admin_list_orders(integer, integer, text, public.order_status, public.payment_status, text) from public, anon;
revoke execute on function public.admin_get_order(uuid) from public, anon;
revoke execute on function public.admin_list_disputes(integer, integer, text, public.dispute_status, boolean, text) from public, anon;
revoke execute on function public.admin_get_dispute(uuid) from public, anon;
revoke execute on function public.admin_list_dispute_messages(uuid, integer, integer, text) from public, anon;
revoke execute on function public.admin_list_dispute_evidence(uuid, integer, integer, text) from public, anon;
revoke execute on function public.admin_list_dispute_events(uuid, integer, integer, text) from public, anon;
revoke execute on function public.admin_list_refunds(integer, integer, text, public.refund_status, text) from public, anon;
revoke execute on function public.admin_get_refund(uuid) from public, anon;
revoke execute on function public.admin_list_refund_events(uuid, integer, integer, text) from public, anon;
revoke execute on function public.admin_list_categories(integer, integer, text, boolean, text) from public, anon;
revoke execute on function public.admin_list_brands(integer, integer, text, boolean, text) from public, anon;
revoke execute on function public.admin_list_admin_actions(integer, integer, text, text, text, uuid, text) from public, anon;
revoke execute on function public.admin_get_admin_action(uuid) from public, anon;

grant execute on function public.admin_summary() to authenticated;
grant execute on function public.admin_list_users(integer, integer, text, public.user_role, public.account_status, text) to authenticated;
grant execute on function public.admin_get_user(uuid) to authenticated;
grant execute on function public.admin_list_sellers(integer, integer, text, public.seller_status, text) to authenticated;
grant execute on function public.admin_get_seller(uuid) to authenticated;
grant execute on function public.admin_list_listings(integer, integer, text, public.listing_status, uuid, text) to authenticated;
grant execute on function public.admin_get_listing(uuid) to authenticated;
grant execute on function public.admin_list_listing_reports(integer, integer, text, public.report_status, text) to authenticated;
grant execute on function public.admin_get_listing_report(uuid) to authenticated;
grant execute on function public.admin_list_reviews(integer, integer, text, public.review_status, smallint, text) to authenticated;
grant execute on function public.admin_get_review(uuid) to authenticated;
grant execute on function public.admin_list_orders(integer, integer, text, public.order_status, public.payment_status, text) to authenticated;
grant execute on function public.admin_get_order(uuid) to authenticated;
grant execute on function public.admin_list_disputes(integer, integer, text, public.dispute_status, boolean, text) to authenticated;
grant execute on function public.admin_get_dispute(uuid) to authenticated;
grant execute on function public.admin_list_dispute_messages(uuid, integer, integer, text) to authenticated;
grant execute on function public.admin_list_dispute_evidence(uuid, integer, integer, text) to authenticated;
grant execute on function public.admin_list_dispute_events(uuid, integer, integer, text) to authenticated;
grant execute on function public.admin_list_refunds(integer, integer, text, public.refund_status, text) to authenticated;
grant execute on function public.admin_get_refund(uuid) to authenticated;
grant execute on function public.admin_list_refund_events(uuid, integer, integer, text) to authenticated;
grant execute on function public.admin_list_categories(integer, integer, text, boolean, text) to authenticated;
grant execute on function public.admin_list_brands(integer, integer, text, boolean, text) to authenticated;
grant execute on function public.admin_list_admin_actions(integer, integer, text, text, text, uuid, text) to authenticated;
grant execute on function public.admin_get_admin_action(uuid) to authenticated;

commit;
