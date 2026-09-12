-- ============================================================================
-- PalitPaddleBai Mart — Phase 4: Listing Safeguards
--
-- Adds the Phase 4 catalog invariants that the Phase 1 schema intentionally
-- left to the application layer:
--
--   1. Only ACTIVE sellers may create or update listings. The Phase 1 insert
--      policy `listings_insert_own` already scopes rows to the caller's own
--      seller id, but it does not check seller_status. This trigger closes
--      that gap without rewriting the applied policy.
--
--   2. A listing with listing_status = 'active' must have quantity > 0.
--      Public visibility is "active AND available"; a listing cannot be
--      advertised while out of stock.
--
--   3. At most one primary image per listing (partial unique index on
--      is_primary). "Choose primary" becomes a clear-then-set operation.
--
-- Admins are exempt so server-side/admin flows can set explicit states.
-- Applied via `supabase db push`; requires a live project to run.
-- ============================================================================

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

  -- Defense in depth: the column grant already prevents authenticated users
  -- from changing seller_id; keep the row scoped to the caller either way.
  if new.seller_id is distinct from public.auth_seller_id() then
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

drop trigger if exists listings_require_active_seller on public.listings;
create trigger listings_require_active_seller
  before insert or update on public.listings
  for each row execute function public.enforce_active_seller_listing_ops();

-- Ensure "choose primary" is unambiguous: a listing may have at most one image
-- flagged is_primary = true. Clients clear the current primary before setting
-- a new one (setPrimaryListingImage), so normal flows never violate it.
create unique index listings_images_single_primary
  on public.listing_images (listing_id)
  where is_primary;
