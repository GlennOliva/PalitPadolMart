-- ============================================================================
-- Phase 10 — Verified Purchase Reviews
--
-- Converts the legacy `reviews` scaffold (one review per ORDER) into a
-- verified-purchase, per-ORDER-ITEM review system:
--   * a review is tied to exactly one `order_items` row (DB unique);
--   * the buyer/seller/listing are DERIVED from the order item, never
--     client-supplied (RPC-only insert);
--   * an item can only be reviewed once the order is `completed`;
--   * a seller can never review their own listing;
--   * new reviews are published immediately (`status = 'approved'`) so the
--     community-facing rating system works before the Phase 13 admin
--     moderation UI lands. The `review_status` enum and admin RLS policies
--     are preserved for that phase.
--
-- The reviews feature never shipped; pre-existing rows are scaffold remnants
-- without an `order_item_id` and are removed by this migration.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. Schema: per-order-item binding + seller rating
-- ----------------------------------------------------------------------------

alter table public.reviews add column order_item_id uuid references public.order_items(id) on delete cascade;
alter table public.reviews add column seller_rating smallint check (seller_rating between 1 and 5);

-- Drop legacy COUNT(*) = 1 per order+reviewer; replaced by per-item unique.
alter table public.reviews drop constraint reviews_order_id_reviewer_id_key;

-- Remove scaffold rows that cannot be attributed to a real order item.
delete from public.reviews r
where r.order_item_id is null
   or not exists (
        select 1 from public.order_items oi
        where oi.id = r.order_item_id
      );

alter table public.reviews alter column order_item_id set not null;
alter table public.reviews alter column seller_rating set not null;

alter table public.reviews add constraint reviews_order_item_id_key unique (order_item_id);

-- Review state is enforced by `submit_review`; client inserts are no longer
-- allowed, so the normalization trigger has nothing to normalize.
drop trigger if exists reviews_force_pending on public.reviews;

-- Maps one item/product to one seller: keep `seller_id` an aggregate-friendly
-- FK while the item uniquely determines review subject.
create index idx_reviews_listing_status on public.reviews (listing_id, status);
create index idx_reviews_order_reviewer on public.reviews (order_id, reviewer_id);

-- ----------------------------------------------------------------------------
-- 2. Lock down INSERT — reviews are created ONLY via `submit_review`
--    (security definer derives reviewer/seller/listing from the order item).
-- ----------------------------------------------------------------------------

drop policy if exists reviews_insert_reviewer on public.reviews;
revoke insert on public.reviews from anon, authenticated;

-- ----------------------------------------------------------------------------
-- 3. RPC: submit_review
-- ----------------------------------------------------------------------------

create or replace function public.submit_review(
  p_order_item_id uuid,
  p_rating smallint,
  p_seller_rating smallint,
  p_comment text
)
returns public.reviews
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order  public.orders%rowtype;
  v_item   public.order_items%rowtype;
  v_review public.reviews%rowtype;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED: You must be signed in to review an item.'
      using errcode = 'P0001';
  end if;

  select oi.order_id, oi.listing_id, oi.seller_id, oi.product_title, oi.quantity, oi.unit_price
    into v_item
    from public.order_items oi
    where oi.id = p_order_item_id;

  if not found then
    raise exception 'ORDER_ITEM_NOT_FOUND: This order item does not exist.'
      using errcode = 'P0001';
  end if;

  select o.id, o.buyer_id, o.seller_id, o.status
    into v_order
    from public.orders o
    where o.id = v_item.order_id;

  if not found then
    raise exception 'ORDER_ITEM_NOT_FOUND: This order item does not exist.'
      using errcode = 'P0001';
  end if;

  if v_order.status <> 'completed' then
    raise exception 'ORDER_NOT_COMPLETED: You can only review items from completed orders.'
      using errcode = 'P0001';
  end if;

  if v_order.buyer_id <> auth.uid() then
    raise exception 'FORBIDDEN: Only the buyer who purchased this item can review it.'
      using errcode = 'P0001';
  end if;

  if public.auth_seller_id() is not distinct from v_item.seller_id then
    raise exception 'SELLER_SELF_REVIEW_NOT_ALLOWED: You cannot review your own listing.'
      using errcode = 'P0001';
  end if;

  if p_rating is null or p_rating < 1 or p_rating > 5 then
    raise exception 'INVALID_RATING: Product rating must be between 1 and 5.'
      using errcode = 'P0001';
  end if;

  if p_seller_rating is null or p_seller_rating < 1 or p_seller_rating > 5 then
    raise exception 'INVALID_SELLER_RATING: Seller rating must be between 1 and 5.'
      using errcode = 'P0001';
  end if;

  if p_comment is not null and length(p_comment) > 2000 then
    raise exception 'INVALID_REVIEW_TEXT: Review text must be at most 2000 characters.'
      using errcode = 'P0001';
  end if;

  if exists (select 1 from public.reviews where order_item_id = p_order_item_id) then
    raise exception 'REVIEW_ALREADY_EXISTS: You have already reviewed this item.'
      using errcode = 'P0001';
  end if;

  insert into public.reviews (
    order_item_id, order_id, reviewer_id, seller_id, listing_id,
    rating, seller_rating, comment, status
  )
  values (
    p_order_item_id, v_item.order_id, auth.uid(), v_item.seller_id, v_item.listing_id,
    p_rating, p_seller_rating,
    case when btrim(p_comment) = '' then null else p_comment end,
    'approved'
  )
  returning * into v_review;

  return v_review;
end;
$$;

-- ----------------------------------------------------------------------------
-- 4. RPCs: aggregates + public review lists (approved only, no private data)
-- ----------------------------------------------------------------------------

create or replace function public.listing_review_summary(p_listing_id uuid)
returns table (review_count bigint, average_rating numeric)
language sql
security definer
set search_path = public
stable
as $$
  select count(*)::bigint,
         round(avg(r.rating)::numeric, 2)
  from public.reviews r
  where r.listing_id = p_listing_id and r.status = 'approved';
$$;

create or replace function public.seller_review_summary(p_seller_id uuid)
returns table (review_count bigint, average_rating numeric)
language sql
security definer
set search_path = public
stable
as $$
  select count(*)::bigint,
         round(avg(r.seller_rating)::numeric, 2)
  from public.reviews r
  where r.seller_id = p_seller_id and r.status = 'approved';
$$;

create or replace function public.listing_reviews(
  p_listing_id uuid,
  p_page integer default 1,
  p_page_size integer default null
)
returns table (
  id uuid,
  rating smallint,
  seller_rating smallint,
  comment text,
  created_at timestamptz,
  reviewer_name text,
  reviewer_avatar text
)
language sql
security definer
set search_path = public
stable
as $$
  select r.id,
         r.rating,
         r.seller_rating,
         r.comment,
         r.created_at,
         coalesce(nullif(btrim(p.display_name), ''), 'Verified Buyer') as reviewer_name,
         nullif(p.avatar_url, '') as reviewer_avatar
  from public.reviews r
  left join public.profiles p on p.id = r.reviewer_id
  where r.listing_id = p_listing_id and r.status = 'approved'
  order by r.created_at desc, r.id desc
  limit least(greatest(coalesce(p_page_size, 10), 1), 20)
  offset greatest((greatest(coalesce(p_page, 1), 1) - 1) * least(greatest(coalesce(p_page_size, 10), 1), 20), 0);
$$;

create or replace function public.seller_reviews(
  p_seller_id uuid,
  p_page integer default 1,
  p_page_size integer default null
)
returns table (
  id uuid,
  rating smallint,
  seller_rating smallint,
  comment text,
  created_at timestamptz,
  reviewer_name text,
  reviewer_avatar text
)
language sql
security definer
set search_path = public
stable
as $$
  select r.id,
         r.rating,
         r.seller_rating,
         r.comment,
         r.created_at,
         coalesce(nullif(btrim(p.display_name), ''), 'Verified Buyer') as reviewer_name,
         nullif(p.avatar_url, '') as reviewer_avatar
  from public.reviews r
  left join public.profiles p on p.id = r.reviewer_id
  where r.seller_id = p_seller_id and r.status = 'approved'
  order by r.created_at desc, r.id desc
  limit least(greatest(coalesce(p_page_size, 10), 1), 20)
  offset greatest((greatest(coalesce(p_page, 1), 1) - 1) * least(greatest(coalesce(p_page_size, 10), 1), 20), 0);
$$;

-- ----------------------------------------------------------------------------
-- 5. Grants
-- ----------------------------------------------------------------------------

grant execute on function public.submit_review(uuid, smallint, smallint, text) to anon, authenticated;
grant execute on function public.listing_review_summary(uuid) to anon, authenticated;
grant execute on function public.seller_review_summary(uuid) to anon, authenticated;
grant execute on function public.listing_reviews(uuid, integer, integer) to anon, authenticated;
grant execute on function public.seller_reviews(uuid, integer, integer) to anon, authenticated;

commit;