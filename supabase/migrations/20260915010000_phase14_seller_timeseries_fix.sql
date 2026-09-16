-- Fix: my_seller_analytics_timeseries referenced o.units (no such column in the
-- orders_b CTE). products_sold must come from products_b (aliased p), matching
-- the admin_analytics_timeseries implementation. Discovered by the hosted
-- Phase 14 verifier (column 42703 on the seller timeseries).

create or replace function public.my_seller_analytics_timeseries(
  p_start_date date default null,
  p_end_date date default null,
  p_bucket text default 'month'
)
returns table (
  bucket_start date,
  new_listings bigint,
  new_orders bigint,
  transacted_orders bigint,
  completed_orders bigint,
  cancelled_orders bigint,
  products_sold bigint,
  gross_sales numeric,
  net_sales numeric,
  refund_value numeric,
  listing_views bigint,
  favorites_count bigint,
  inquiries_count bigint,
  approved_reviews bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_start timestamptz;
  v_end_excl timestamptz;
  v_step interval;
  v_max_days integer;
  v_seller uuid;
  v_transacted public.order_status[];
begin
  perform public.analytics_require_seller();
  perform public.analytics_require_bucket(p_bucket);
  v_max_days := case p_bucket when 'day' then 92 when 'week' then 546 else 2190 end;
  perform public.analytics_require_window(p_start_date, p_end_date, v_max_days);
  v_seller := public.auth_seller_id();
  if v_seller is null then
    raise exception 'FORBIDDEN: only a seller can view seller analytics';
  end if;
  v_start := p_start_date::timestamptz;
  v_end_excl := (p_end_date + 1)::timestamptz;
  v_step := case p_bucket when 'day' then interval '1 day'
                          when 'week' then interval '1 week'
                          else interval '1 month' end;
  v_transacted := array['paid', 'preparing', 'shipped', 'ready_for_pickup', 'completed'];

  return query
  with buckets as (
    select date_trunc(p_bucket::text, gs.ts)::date as bucket_start
    from generate_series(v_start, v_end_excl - interval '1 microsecond', v_step) as gs(ts)
  ),
  listings_b as (
    select date_trunc(p_bucket::text, l.created_at)::date as b, count(*)::bigint as n
    from public.listings l
    where l.seller_id = v_seller
      and l.created_at >= v_start and l.created_at < v_end_excl
    group by 1
  ),
  orders_b as (
    select date_trunc(p_bucket::text, o.created_at)::date as b,
           count(*)::bigint as n,
           count(*) filter (where o.status = any (v_transacted))::bigint as transacted_n,
           count(*) filter (where o.status = 'completed')::bigint as completed_n,
           count(*) filter (where o.status = 'cancelled')::bigint as cancelled_n,
           coalesce(sum(o.total) filter (where o.status = any (v_transacted)), 0)::numeric as gross
    from public.orders o
    where o.seller_id = v_seller
      and o.created_at >= v_start and o.created_at < v_end_excl
    group by 1
  ),
  products_b as (
    select date_trunc(p_bucket::text, o.created_at)::date as b,
           coalesce(sum(oi.quantity), 0)::bigint as units
    from public.orders o
    join public.order_items oi on oi.order_id = o.id
    where o.seller_id = v_seller
      and o.status = any (v_transacted)
      and o.created_at >= v_start and o.created_at < v_end_excl
    group by 1
  ),
  refunds_b as (
    select date_trunc(p_bucket::text, r.completed_at)::date as b,
           coalesce(sum(r.amount), 0)::numeric as val
    from public.refunds r
    where r.seller_id = v_seller and r.status = 'completed'
      and r.completed_at >= v_start and r.completed_at < v_end_excl
    group by 1
  ),
  views_b as (
    select date_trunc(p_bucket::text, lv.viewed_at)::date as b, count(*)::bigint as n
    from public.listing_views lv
    join public.listings l on l.id = lv.listing_id
    where l.seller_id = v_seller
      and lv.viewed_at >= v_start and lv.viewed_at < v_end_excl
    group by 1
  ),
  favorites_b as (
    select date_trunc(p_bucket::text, f.created_at)::date as b, count(*)::bigint as n
    from public.favorites f
    join public.listings l on l.id = f.listing_id
    where l.seller_id = v_seller
      and f.created_at >= v_start and f.created_at < v_end_excl
    group by 1
  ),
  inquiries_b as (
    select date_trunc(p_bucket::text, i.created_at)::date as b, count(*)::bigint as n
    from public.inquiries i
    where i.seller_id = v_seller
      and i.created_at >= v_start and i.created_at < v_end_excl
    group by 1
  ),
  reviews_b as (
    select date_trunc(p_bucket::text, r.created_at)::date as b, count(*)::bigint as n
    from public.reviews r
    where r.seller_id = v_seller and r.status = 'approved'
      and r.created_at >= v_start and r.created_at < v_end_excl
    group by 1
  )
  select b.bucket_start,
    coalesce(l.n, 0) as new_listings,
    coalesce(o.n, 0) as new_orders,
    coalesce(o.transacted_n, 0) as transacted_orders,
    coalesce(o.completed_n, 0) as completed_orders,
    coalesce(o.cancelled_n, 0) as cancelled_orders,
    coalesce(p.units, 0) as products_sold,
    coalesce(o.gross, 0) as gross_sales,
    coalesce(o.gross, 0) - coalesce(r.val, 0) as net_sales,
    coalesce(r.val, 0) as refund_value,
    coalesce(v.n, 0) as listing_views,
    coalesce(f.n, 0) as favorites_count,
    coalesce(i.n, 0) as inquiries_count,
    coalesce(rv.n, 0) as approved_reviews
  from buckets b
  left join listings_b l on l.b = b.bucket_start
  left join orders_b o on o.b = b.bucket_start
  left join products_b p on p.b = b.bucket_start
  left join refunds_b r on r.b = b.bucket_start
  left join views_b v on v.b = b.bucket_start
  left join favorites_b f on f.b = b.bucket_start
  left join inquiries_b i on i.b = b.bucket_start
  left join reviews_b rv on rv.b = b.bucket_start
  order by b.bucket_start;
end;
$$;