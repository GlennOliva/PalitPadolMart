-- Add an exact 5…1 star distribution for a listing's approved reviews so the
-- UI never derives rating math from a partial fetched page (server-trusted
-- aggregates only).

begin;

create or replace function public.listing_review_distribution(p_listing_id uuid)
returns table (rating_value smallint, review_count bigint)
language sql
security definer
set search_path = public
stable
as $$
  select r.rating as rating_value, count(*)::bigint as review_count
  from public.reviews r
  where r.listing_id = p_listing_id and r.status = 'approved'
  group by r.rating
  order by r.rating desc;
$$;

grant execute on function public.listing_review_distribution(uuid) to anon, authenticated;

commit;