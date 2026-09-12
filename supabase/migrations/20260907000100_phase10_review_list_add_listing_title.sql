-- Add `listing_title` to the listing_reviews / seller_reviews return shapes
-- so the UI can show the product name inside each review card (useful on the
-- seller profile page where reviews come from multiple listings).
--
-- Postgres requires DROP + CREATE to change a function's return type; no
-- callers exist yet so this is safe.

begin;

-- listing_reviews
drop function if exists public.listing_reviews(uuid, integer, integer);
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
  reviewer_avatar text,
  listing_title text
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
         nullif(p.avatar_url, '') as reviewer_avatar,
         l.title as listing_title
  from public.reviews r
  left join public.profiles p on p.id = r.reviewer_id
  left join public.listings l on l.id = r.listing_id
  where r.listing_id = p_listing_id and r.status = 'approved'
  order by r.created_at desc, r.id desc
  limit least(greatest(coalesce(p_page_size, 10), 1), 20)
  offset greatest((greatest(coalesce(p_page, 1), 1) - 1) * least(greatest(coalesce(p_page_size, 10), 1), 20), 0);
$$;

grant execute on function public.listing_reviews(uuid, integer, integer) to anon, authenticated;

-- seller_reviews
drop function if exists public.seller_reviews(uuid, integer, integer);
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
  reviewer_avatar text,
  listing_title text
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
         nullif(p.avatar_url, '') as reviewer_avatar,
         l.title as listing_title
  from public.reviews r
  left join public.profiles p on p.id = r.reviewer_id
  left join public.listings l on l.id = r.listing_id
  where r.seller_id = p_seller_id and r.status = 'approved'
  order by r.created_at desc, r.id desc
  limit least(greatest(coalesce(p_page_size, 10), 1), 20)
  offset greatest((greatest(coalesce(p_page, 1), 1) - 1) * least(greatest(coalesce(p_page_size, 10), 1), 20), 0);
$$;

grant execute on function public.seller_reviews(uuid, integer, integer) to anon, authenticated;

commit;