-- ============================================================================
-- PalitPaddleBai Mart — Phase 1: Storage Foundation
-- Creates the storage buckets and secure object policies.
--
-- Buckets:
--   avatars               private  -> avatars/{user_id}/...
--   marketplace-products  public   -> marketplace-products/{seller_id}/{listing_id}/...
--   dispute-evidence      private  -> dispute-evidence/{user_id}/{dispute_id}/...
--
-- Write access is owner-restricted by path prefix; no open write policies.
-- Applied automatically on `supabase db reset`; requires a live project to run.
-- ============================================================================

insert into storage.buckets (id, name, public)
values
  ('avatars', 'avatars', false),
  ('marketplace-products', 'marketplace-products', true),
  ('dispute-evidence', 'dispute-evidence', false)
on conflict (id) do nothing;

-- ------------------------------------------------ avatars
drop policy if exists "avatars_select_own" on storage.objects;
create policy "avatars_select_own" on storage.objects
  for select using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatars_insert_own" on storage.objects;
create policy "avatars_insert_own" on storage.objects
  for insert with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatars_update_own" on storage.objects;
create policy "avatars_update_own" on storage.objects
  for update using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  ) with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatars_delete_own" on storage.objects;
create policy "avatars_delete_own" on storage.objects
  for delete using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ------------------------------------------------ marketplace-products
drop policy if exists "marketplace_products_select_public" on storage.objects;
create policy "marketplace_products_select_public" on storage.objects
  for select using (bucket_id = 'marketplace-products');

drop policy if exists "marketplace_products_insert_seller" on storage.objects;
create policy "marketplace_products_insert_seller" on storage.objects
  for insert with check (
    bucket_id = 'marketplace-products'
    and (storage.foldername(name))[1] = public.auth_seller_id()::text
  );

drop policy if exists "marketplace_products_update_seller" on storage.objects;
create policy "marketplace_products_update_seller" on storage.objects
  for update using (
    bucket_id = 'marketplace-products'
    and (storage.foldername(name))[1] = public.auth_seller_id()::text
  ) with check (
    bucket_id = 'marketplace-products'
    and (storage.foldername(name))[1] = public.auth_seller_id()::text
  );

drop policy if exists "marketplace_products_delete_seller" on storage.objects;
create policy "marketplace_products_delete_seller" on storage.objects
  for delete using (
    bucket_id = 'marketplace-products'
    and (storage.foldername(name))[1] = public.auth_seller_id()::text
  );

-- ------------------------------------------------ dispute-evidence
drop policy if exists "dispute_evidence_select_participant" on storage.objects;
create policy "dispute_evidence_select_participant" on storage.objects
  for select using (
    bucket_id = 'dispute-evidence'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_admin()
    )
  );

drop policy if exists "dispute_evidence_insert_participant" on storage.objects;
create policy "dispute_evidence_insert_participant" on storage.objects
  for insert with check (
    bucket_id = 'dispute-evidence'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "dispute_evidence_update_participant" on storage.objects;
create policy "dispute_evidence_update_participant" on storage.objects
  for update using (
    bucket_id = 'dispute-evidence'
    and (storage.foldername(name))[1] = auth.uid()::text
  ) with check (
    bucket_id = 'dispute-evidence'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "dispute_evidence_delete_participant" on storage.objects;
create policy "dispute_evidence_delete_participant" on storage.objects
  for delete using (
    bucket_id = 'dispute-evidence'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
