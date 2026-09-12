-- ============================================================================
-- Phase 10 Extension — Seller-Side Customer Review Visibility
--
-- Adds three security-definer RPCs that derive the seller from auth.uid()
-- (via auth_seller_id()) so the browser can never supply a spoofed seller id.
--
-- get_my_seller_reviews            — paginated review list with rating filter + sort
-- get_my_seller_rating_summary     — average rating + review count
-- get_my_seller_rating_distribution — 5-to-1 star breakdown
--
-- These are READ-ONLY. The seller may not update or delete reviews through
-- any path other than admin moderation (deferred to Phase 13).
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. get_my_seller_reviews
-- ----------------------------------------------------------------------------

create or replace function public.get_my_seller_reviews(
  p_page integer default 1,
  p_page_size integer default 10,
  p_rating smallint default null,
  p_sort text default 'newest'
)
returns table (
  id uuid,
  rating smallint,
  seller_rating smallint,
  comment text,
  created_at timestamptz,
  reviewer_name text,
  reviewer_avatar text,
  listing_id uuid,
  listing_title text,
  listing_image_url text
)
language sql
security definer
set search_path = public
stable
as $$
  with base as (
    select r.id,
           r.rating,
           r.seller_rating,
           r.comment,
           r.created_at,
           r.reviewer_id,
           r.listing_id,
           l.title as listing_title,
           li.url as listing_image_url
    from public.reviews r
    left join public.listings l on l.id = r.listing_id
    left join public.listing_images li on li.listing_id = r.listing_id and li.is_primary = true
    where r.seller_id = public.auth_seller_id()
      and r.status = 'approved'
      and (p_rating is null or r.rating = p_rating)
  )
  select b.id,
         b.rating,
         b.seller_rating,
         b.comment,
         b.created_at,
         coalesce(nullif(btrim(p.display_name), ''), 'Verified Buyer') as reviewer_name,
         nullif(p.avatar_url, '') as reviewer_avatar,
         b.listing_id,
         b.listing_title,
         b.listing_image_url
  from base b
  left join public.profiles p on p.id = b.reviewer_id
  order by
    case when p_sort = 'highest' then b.rating end desc nulls last,
    case when p_sort = 'lowest'  then b.rating end asc  nulls last,
    b.created_at desc,
    b.id desc
  limit least(greatest(coalesce(p_page_size, 10), 1), 20)
  offset greatest((greatest(coalesce(p_page, 1), 1) - 1) * least(greatest(coalesce(p_page_size, 10), 1), 20), 0);
$$;

-- ----------------------------------------------------------------------------
-- 2. get_my_seller_rating_summary
-- ----------------------------------------------------------------------------

create or replace function public.get_my_seller_rating_summary()
returns table (review_count bigint, average_rating numeric)
language sql
security definer
set search_path = public
stable
as $$
  select count(*)::bigint,
         round(avg(r.seller_rating)::numeric, 2)
  from public.reviews r
  where r.seller_id = public.auth_seller_id()
    and r.status = 'approved';
$$;

-- ----------------------------------------------------------------------------
-- 3. get_my_seller_rating_distribution
-- ----------------------------------------------------------------------------

create or replace function public.get_my_seller_rating_distribution()
returns table (rating_value smallint, review_count bigint)
language sql
security definer
set search_path = public
stable
as $$
  select r.rating as rating_value,
         count(*)::bigint as review_count
  from public.reviews r
  where r.seller_id = public.auth_seller_id()
    and r.status = 'approved'
  group by r.rating
  order by r.rating desc;
$$;

-- ----------------------------------------------------------------------------
-- 4. Grants (authenticated only — anonymous sellers do not exist)
-- ----------------------------------------------------------------------------

grant execute on function public.get_my_seller_reviews(integer, integer, smallint, text) to authenticated;
grant execute on function public.get_my_seller_rating_summary() to authenticated;
grant execute on function public.get_my_seller_rating_distribution() to authenticated;

commit;
