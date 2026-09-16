-- ============================================================================
-- Phase 14 — Reporting, Analytics & Business Insights
--
-- Implements ANALYTICS.md (the metric dictionary for Phase 14):
--   * 5 admin RPCs  — marketplace KPIs, zero-filled time series, and three
--                     database-side ranking tables (categories, popular
--                     listings, top sellers).
--   * 3 seller RPCs — the caller's OWN store analytics. The seller is derived
--                     exclusively from auth.uid() via auth_seller_id() inside
--                     the function; there is NO seller_id parameter, so a
--                     browser can never read another seller's analytics.
--
-- All RPCs are SECURITY DEFINER with fixed search_path, validate their date
-- windows/sorts/pagination in Postgres, and return only binned aggregate data
-- (no buyer emails, phones, addresses, payment references, or proof paths).
--
-- Metric semantics (see ANALYTICS.md):
--   * Revenue (transacted) order states:
--       ('paid','preparing','shipped','ready_for_pickup','completed')
--   * gross_sales       = sum(orders.total)         over transacted orders
--   * products_sold     = sum(order_items.quantity) over transacted orders
--   * net_sales         = gross_sales - completed refund amounts
--   * disputed_orders   = distinct order_ids with a dispute whose order was
--                         created in the window (a dispute never rewrites
--                         orders.status)
--   * Current-state counters (registered/active/suspended users, total/active/
--     pending sellers, total/active/sold listings, open/resolved disputes,
--     open/resolved/dismissed reports) are snapshots at query time; windowed
--     counters use the attribution columns in ANALYTICS.md §2.
--   * Rating columns in the ranking tables are all-time approved averages
--     (matching the live listing/seller review summaries); the overview and
--     time series use windowed approved reviews.
--   * All ranking aggregates are pre-aggregated per dimension (CTEs) before
--     being joined, so no one-to-many join ever multiplies counts or totals.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 0. Shared validation helpers (security definer, raise-on-failure)
-- ----------------------------------------------------------------------------

create or replace function public.analytics_require_admin()
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED: sign in to view analytics';
  end if;
  if not public.is_admin() then
    raise exception 'FORBIDDEN: only an active admin can view marketplace analytics';
  end if;
end;
$$;

-- Seller identity resolution is status-agnostic (matches auth_seller_id()):
-- a suspended seller may still view their own history. RLS-owned write paths
-- still require an active seller; this only reads aggregates.
create or replace function public.analytics_require_seller()
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED: sign in to view analytics';
  end if;
  if public.auth_seller_id() is null then
    raise exception 'FORBIDDEN: only a seller can view seller analytics';
  end if;
end;
$$;

create or replace function public.analytics_require_window(
  p_start_date date,
  p_end_date date,
  p_max_days integer
)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_start_date is null or p_end_date is null then
    raise exception 'INVALID_DATE_RANGE: start and end dates are required';
  end if;
  if p_start_date > p_end_date then
    raise exception 'INVALID_DATE_RANGE: start date must be on or before end date';
  end if;
  if p_max_days is not null and (p_end_date - p_start_date) + 1 > p_max_days then
    raise exception 'INVALID_DATE_RANGE: date window cannot exceed % days', p_max_days;
  end if;
end;
$$;

create or replace function public.analytics_require_bucket(p_bucket text)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_bucket is null or p_bucket not in ('day', 'week', 'month') then
    raise exception 'INVALID_BUCKET: bucket must be day, week, or month';
  end if;
end;
$$;

create or replace function public.analytics_require_sort(
  p_sort text,
  p_allowlist text[]
)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_sort is null or p_sort <> all (coalesce(p_allowlist, array[]::text[])) then
    raise exception 'INVALID_SORT: unsupported analytics sort';
  end if;
end;
$$;

create or replace function public.analytics_require_page(p_page integer, p_page_size integer)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if coalesce(p_page, 0) not between 1 and 100000
     or coalesce(p_page_size, 0) not between 1 and 100 then
    raise exception 'INVALID_PAGINATION: page must be 1 to 100000 and page size 1 to 100';
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- 1. Admin marketplace overview
-- ----------------------------------------------------------------------------

create or replace function public.admin_analytics_overview(
  p_start_date date default null,
  p_end_date date default null
)
returns table (
  registered_users bigint,
  active_users bigint,
  suspended_users bigint,
  new_users bigint,
  total_sellers bigint,
  active_sellers bigint,
  pending_sellers bigint,
  new_sellers bigint,
  total_listings bigint,
  active_listings bigint,
  sold_listings bigint,
  new_listings bigint,
  transacted_orders bigint,
  completed_orders bigint,
  cancelled_orders bigint,
  disputed_orders bigint,
  products_sold bigint,
  gross_sales numeric,
  net_sales numeric,
  refund_count bigint,
  refund_value numeric,
  avg_order_value numeric,
  conversion_rate numeric,
  listing_views bigint,
  unique_viewers bigint,
  favorites_count bigint,
  inquiries_count bigint,
  approved_reviews bigint,
  avg_rating numeric,
  open_disputes bigint,
  resolved_disputes bigint,
  open_reports bigint,
  resolved_reports bigint,
  dismissed_reports bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_start timestamptz;
  v_end_excl timestamptz;
begin
  perform public.analytics_require_admin();
  perform public.analytics_require_window(p_start_date, p_end_date, 2190);
  v_start := p_start_date::timestamptz;
  v_end_excl := (p_end_date + 1)::timestamptz;

  return query
  select
    (select count(*)::bigint from public.profiles) as registered_users,
    (select count(*)::bigint from public.profiles p where p.account_status = 'active') as active_users,
    (select count(*)::bigint from public.profiles p where p.account_status = 'suspended') as suspended_users,
    (select count(*)::bigint from public.profiles p
       where p.created_at >= v_start and p.created_at < v_end_excl) as new_users,
    (select count(*)::bigint from public.seller_profiles) as total_sellers,
    (select count(*)::bigint from public.seller_profiles sp
       where public.seller_is_active(sp.id)) as active_sellers,
    (select count(*)::bigint from public.seller_profiles sp
       where sp.seller_status = 'pending') as pending_sellers,
    (select count(*)::bigint from public.seller_profiles sp
       where sp.created_at >= v_start and sp.created_at < v_end_excl) as new_sellers,
    (select count(*)::bigint from public.listings) as total_listings,
    (select count(*)::bigint from public.listings l
       where l.listing_status = 'active' and public.seller_is_active(l.seller_id)) as active_listings,
    (select count(*)::bigint from public.listings l where l.listing_status = 'sold') as sold_listings,
    (select count(*)::bigint from public.listings l
       where l.created_at >= v_start and l.created_at < v_end_excl) as new_listings,
    (select count(*)::bigint from public.orders o
       where o.status in ('paid', 'preparing', 'shipped', 'ready_for_pickup', 'completed')
         and o.created_at >= v_start and o.created_at < v_end_excl) as transacted_orders,
    (select count(*)::bigint from public.orders o
       where o.status = 'completed'
         and o.created_at >= v_start and o.created_at < v_end_excl) as completed_orders,
    (select count(*)::bigint from public.orders o
       where o.status = 'cancelled'
         and o.created_at >= v_start and o.created_at < v_end_excl) as cancelled_orders,
    (select count(distinct d.order_id)::bigint
       from public.disputes d
       join public.orders o on o.id = d.order_id
       where o.created_at >= v_start and o.created_at < v_end_excl) as disputed_orders,
    (select coalesce(sum(oi.quantity), 0)::bigint
       from public.order_items oi
       join public.orders o on o.id = oi.order_id
       where o.status in ('paid', 'preparing', 'shipped', 'ready_for_pickup', 'completed')
         and o.created_at >= v_start and o.created_at < v_end_excl) as products_sold,
    (select coalesce(sum(o.total), 0)::numeric
       from public.orders o
       where o.status in ('paid', 'preparing', 'shipped', 'ready_for_pickup', 'completed')
         and o.created_at >= v_start and o.created_at < v_end_excl) as gross_sales,
    (select coalesce(sum(o.total), 0)::numeric
       from public.orders o
       where o.status in ('paid', 'preparing', 'shipped', 'ready_for_pickup', 'completed')
         and o.created_at >= v_start and o.created_at < v_end_excl)
       - (select coalesce(sum(r.amount), 0)::numeric
            from public.refunds r
            where r.status = 'completed'
              and r.completed_at >= v_start and r.completed_at < v_end_excl) as net_sales,
    (select count(*)::bigint from public.refunds r
       where r.status = 'completed'
         and r.completed_at >= v_start and r.completed_at < v_end_excl) as refund_count,
    (select coalesce(sum(r.amount), 0)::numeric from public.refunds r
       where r.status = 'completed'
         and r.completed_at >= v_start and r.completed_at < v_end_excl) as refund_value,
    (select case when count(*) = 0 then 0::numeric
            else round(sum(o.total) / count(*)::numeric, 2) end
       from public.orders o
       where o.status in ('paid', 'preparing', 'shipped', 'ready_for_pickup', 'completed')
         and o.created_at >= v_start and o.created_at < v_end_excl) as avg_order_value,
    (select case
             when (select count(*) from public.listing_views
                     where viewed_at >= v_start and viewed_at < v_end_excl) = 0
             then 0::numeric
             else round(
               (select count(*) from public.orders o
                  where o.status in ('paid', 'preparing', 'shipped', 'ready_for_pickup', 'completed')
                    and o.created_at >= v_start and o.created_at < v_end_excl)
               * 100.0 / (select count(*) from public.listing_views
                            where viewed_at >= v_start and viewed_at < v_end_excl), 2)
           end
     ) as conversion_rate,
    (select count(*)::bigint from public.listing_views lv
       where lv.viewed_at >= v_start and lv.viewed_at < v_end_excl) as listing_views,
    (select count(distinct lv.viewer_id)::bigint from public.listing_views lv
       where lv.viewed_at >= v_start and lv.viewed_at < v_end_excl
         and lv.viewer_id is not null) as unique_viewers,
    (select count(*)::bigint from public.favorites f
       where f.created_at >= v_start and f.created_at < v_end_excl) as favorites_count,
    (select count(*)::bigint from public.inquiries i
       where i.created_at >= v_start and i.created_at < v_end_excl) as inquiries_count,
    (select count(*)::bigint from public.reviews r
       where r.status = 'approved'
         and r.created_at >= v_start and r.created_at < v_end_excl) as approved_reviews,
    (select round(avg(r.rating), 2)::numeric from public.reviews r
       where r.status = 'approved'
         and r.created_at >= v_start and r.created_at < v_end_excl) as avg_rating,
    (select count(*)::bigint from public.disputes d where d.status = 'open') as open_disputes,
    (select count(*)::bigint from public.disputes d where d.status = 'resolved') as resolved_disputes,
    (select count(*)::bigint from public.listing_reports lr
       where lr.status in ('pending', 'under_review')) as open_reports,
    (select count(*)::bigint from public.listing_reports lr where lr.status = 'resolved') as resolved_reports,
    (select count(*)::bigint from public.listing_reports lr where lr.status = 'dismissed') as dismissed_reports;
end;
$$;

-- ----------------------------------------------------------------------------
-- 2. Admin time series (zero-filled; day/week/month buckets)
-- ----------------------------------------------------------------------------

create or replace function public.admin_analytics_timeseries(
  p_start_date date default null,
  p_end_date date default null,
  p_bucket text default 'month'
)
returns table (
  bucket_start date,
  new_users bigint,
  new_sellers bigint,
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
  v_transacted public.order_status[];
begin
  perform public.analytics_require_admin();
  perform public.analytics_require_bucket(p_bucket);
  v_max_days := case p_bucket when 'day' then 92 when 'week' then 546 else 2190 end;
  perform public.analytics_require_window(p_start_date, p_end_date, v_max_days);
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
  orders_b as (
    select date_trunc(p_bucket::text, o.created_at)::date as b,
           count(*)::bigint as n,
           count(*) filter (where o.status = any (v_transacted))::bigint as transacted_n,
           count(*) filter (where o.status = 'completed')::bigint as completed_n,
           count(*) filter (where o.status = 'cancelled')::bigint as cancelled_n,
           coalesce(sum(o.total) filter (where o.status = any (v_transacted)), 0)::numeric as gross
    from public.orders o
    where o.created_at >= v_start and o.created_at < v_end_excl
    group by 1
  ),
  products_b as (
    select date_trunc(p_bucket::text, o.created_at)::date as b, sum(oi.quantity)::bigint as n
    from public.orders o
    join public.order_items oi on oi.order_id = o.id
    where o.status = any (v_transacted)
      and o.created_at >= v_start and o.created_at < v_end_excl
    group by 1
  ),
  users_b as (
    select date_trunc(p_bucket::text, p.created_at)::date as b, count(*)::bigint as n
    from public.profiles p
    where p.created_at >= v_start and p.created_at < v_end_excl
    group by 1
  ),
  sellers_b as (
    select date_trunc(p_bucket::text, sp.created_at)::date as b, count(*)::bigint as n
    from public.seller_profiles sp
    where sp.created_at >= v_start and sp.created_at < v_end_excl
    group by 1
  ),
  listings_b as (
    select date_trunc(p_bucket::text, l.created_at)::date as b, count(*)::bigint as n
    from public.listings l
    where l.created_at >= v_start and l.created_at < v_end_excl
    group by 1
  ),
  refunds_b as (
    select date_trunc(p_bucket::text, r.completed_at)::date as b,
           coalesce(sum(r.amount), 0)::numeric as val
    from public.refunds r
    where r.status = 'completed'
      and r.completed_at >= v_start and r.completed_at < v_end_excl
    group by 1
  ),
  views_b as (
    select date_trunc(p_bucket::text, lv.viewed_at)::date as b, count(*)::bigint as n
    from public.listing_views lv
    where lv.viewed_at >= v_start and lv.viewed_at < v_end_excl
    group by 1
  ),
  favorites_b as (
    select date_trunc(p_bucket::text, f.created_at)::date as b, count(*)::bigint as n
    from public.favorites f
    where f.created_at >= v_start and f.created_at < v_end_excl
    group by 1
  ),
  inquiries_b as (
    select date_trunc(p_bucket::text, i.created_at)::date as b, count(*)::bigint as n
    from public.inquiries i
    where i.created_at >= v_start and i.created_at < v_end_excl
    group by 1
  ),
  reviews_b as (
    select date_trunc(p_bucket::text, r.created_at)::date as b, count(*)::bigint as n
    from public.reviews r
    where r.status = 'approved'
      and r.created_at >= v_start and r.created_at < v_end_excl
    group by 1
  )
  select b.bucket_start,
    coalesce(u.n, 0) as new_users,
    coalesce(s.n, 0) as new_sellers,
    coalesce(l.n, 0) as new_listings,
    coalesce(o.n, 0) as new_orders,
    coalesce(o.transacted_n, 0) as transacted_orders,
    coalesce(o.completed_n, 0) as completed_orders,
    coalesce(o.cancelled_n, 0) as cancelled_orders,
    coalesce(p.n, 0) as products_sold,
    coalesce(o.gross, 0) as gross_sales,
    coalesce(o.gross, 0) - coalesce(r.val, 0) as net_sales,
    coalesce(r.val, 0) as refund_value,
    coalesce(v.n, 0) as listing_views,
    coalesce(f.n, 0) as favorites_count,
    coalesce(i.n, 0) as inquiries_count,
    coalesce(rv.n, 0) as approved_reviews
  from buckets b
  left join users_b u on u.b = b.bucket_start
  left join sellers_b s on s.b = b.bucket_start
  left join listings_b l on l.b = b.bucket_start
  left join orders_b o on o.b = b.bucket_start
  left join refunds_b r on r.b = b.bucket_start
  left join products_b p on p.b = b.bucket_start
  left join views_b v on v.b = b.bucket_start
  left join favorites_b f on f.b = b.bucket_start
  left join inquiries_b i on i.b = b.bucket_start
  left join reviews_b rv on rv.b = b.bucket_start
  order by b.bucket_start;
end;
$$;

-- ----------------------------------------------------------------------------
-- 3. Admin category ranking
-- ----------------------------------------------------------------------------

create or replace function public.admin_analytics_categories(
  p_start_date date default null,
  p_end_date date default null,
  p_sort text default 'gross_sales_desc',
  p_page integer default 1,
  p_page_size integer default 10
)
returns table (
  category_id uuid,
  category_name text,
  active_listings bigint,
  units_sold bigint,
  gross_sales numeric,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_start timestamptz;
  v_end_excl timestamptz;
  v_limit integer;
  v_offset integer;
  v_transacted public.order_status[];
begin
  perform public.analytics_require_admin();
  perform public.analytics_require_window(p_start_date, p_end_date, 2190);
  perform public.analytics_require_sort(p_sort, array[
    'gross_sales_desc', 'units_sold_desc', 'active_listings_desc', 'name_asc'
  ]);
  perform public.analytics_require_page(p_page, p_page_size);
  v_start := p_start_date::timestamptz;
  v_end_excl := (p_end_date + 1)::timestamptz;
  v_limit := p_page_size;
  v_offset := (p_page - 1) * p_page_size;
  v_transacted := array['paid', 'preparing', 'shipped', 'ready_for_pickup', 'completed'];

  return query
  with per_listing_sales as (
    select oi.listing_id,
           sum(oi.quantity)::bigint as units,
           sum(oi.unit_price * oi.quantity)::numeric as gross
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    where o.status = any (v_transacted)
      and o.created_at >= v_start and o.created_at < v_end_excl
    group by oi.listing_id
  ),
  category_stats as (
    select c.id,
           c.name,
           c.sort_order,
           count(distinct case
             when l.listing_status = 'active' and public.seller_is_active(l.seller_id)
             then l.id end)::bigint as active_listings,
           coalesce(sum(ps.units), 0)::bigint as units_sold,
           coalesce(sum(ps.gross), 0)::numeric as gross_sales
    from public.categories c
    left join public.listings l on l.category_id = c.id
    left join per_listing_sales ps on ps.listing_id = l.id
    group by c.id, c.name, c.sort_order
  )
  select cs.id,
         cs.name,
         cs.active_listings,
         cs.units_sold,
         cs.gross_sales,
         count(*) over()::bigint as total_count
  from category_stats cs
  order by
    case when p_sort = 'gross_sales_desc' then cs.gross_sales end desc nulls last,
    case when p_sort = 'units_sold_desc' then cs.units_sold end desc nulls last,
    case when p_sort = 'active_listings_desc' then cs.active_listings end desc nulls last,
    case when p_sort = 'name_asc' then lower(cs.name) end asc nulls last,
    cs.sort_order asc,
    cs.name asc
  limit v_limit
  offset v_offset;
end;
$$;

-- ----------------------------------------------------------------------------
-- 4. Admin popular listings ranking
-- ----------------------------------------------------------------------------

create or replace function public.admin_analytics_top_listings(
  p_start_date date default null,
  p_end_date date default null,
  p_sort text default 'views_desc',
  p_page integer default 1,
  p_page_size integer default 10
)
returns table (
  listing_id uuid,
  listing_title text,
  listing_status public.listing_status,
  store_name text,
  category_name text,
  views bigint,
  favorites bigint,
  inquiries bigint,
  units_sold bigint,
  gross_sales numeric,
  avg_rating numeric,
  review_count bigint,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_start timestamptz;
  v_end_excl timestamptz;
  v_limit integer;
  v_offset integer;
  v_transacted public.order_status[];
begin
  perform public.analytics_require_admin();
  perform public.analytics_require_window(p_start_date, p_end_date, 2190);
  perform public.analytics_require_sort(p_sort, array[
    'views_desc', 'favorites_desc', 'inquiries_desc', 'gross_sales_desc',
    'units_sold_desc', 'newest', 'title_asc'
  ]);
  perform public.analytics_require_page(p_page, p_page_size);
  v_start := p_start_date::timestamptz;
  v_end_excl := (p_end_date + 1)::timestamptz;
  v_limit := p_page_size;
  v_offset := (p_page - 1) * p_page_size;
  v_transacted := array['paid', 'preparing', 'shipped', 'ready_for_pickup', 'completed'];

  return query
  with views_b as (
    select lv.listing_id, count(*)::bigint as n
    from public.listing_views lv
    where lv.viewed_at >= v_start and lv.viewed_at < v_end_excl
    group by lv.listing_id
  ),
  favorites_b as (
    select f.listing_id, count(*)::bigint as n
    from public.favorites f
    where f.created_at >= v_start and f.created_at < v_end_excl
    group by f.listing_id
  ),
  inquiries_b as (
    select i.listing_id, count(*)::bigint as n
    from public.inquiries i
    where i.created_at >= v_start and i.created_at < v_end_excl
    group by i.listing_id
  ),
  sales_b as (
    select oi.listing_id,
           sum(oi.quantity)::bigint as units,
           sum(oi.unit_price * oi.quantity)::numeric as gross
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    where o.status = any (v_transacted)
      and o.created_at >= v_start and o.created_at < v_end_excl
    group by oi.listing_id
  ),
  reviews_b as (
    select r.listing_id,
           round(avg(r.rating), 2)::numeric as avg_rating,
           count(*)::bigint as review_count
    from public.reviews r
    where r.status = 'approved'
    group by r.listing_id
  ),
  listing_stats as (
    select l.id,
           l.title,
           l.listing_status,
           l.created_at,
           sp.store_name,
           coalesce(cl.name, '') as category_name,
           coalesce(v.n, 0) as views,
           coalesce(f.n, 0) as favorites,
           coalesce(i.n, 0) as inquiries,
           coalesce(s.units, 0) as units_sold,
           coalesce(s.gross, 0) as gross_sales,
           r.avg_rating,
           coalesce(r.review_count, 0) as review_count
    from public.listings l
    join public.seller_profiles sp on sp.id = l.seller_id
    left join public.categories cl on cl.id = l.category_id
    left join views_b v on v.listing_id = l.id
    left join favorites_b f on f.listing_id = l.id
    left join inquiries_b i on i.listing_id = l.id
    left join sales_b s on s.listing_id = l.id
    left join reviews_b r on r.listing_id = l.id
  )
  select ls.id,
         ls.title,
         ls.listing_status,
         ls.store_name,
         ls.category_name,
         ls.views,
         ls.favorites,
         ls.inquiries,
         ls.units_sold,
         ls.gross_sales,
         ls.avg_rating,
         ls.review_count,
         count(*) over()::bigint as total_count
  from listing_stats ls
  order by
    case when p_sort = 'views_desc' then ls.views end desc nulls last,
    case when p_sort = 'favorites_desc' then ls.favorites end desc nulls last,
    case when p_sort = 'inquiries_desc' then ls.inquiries end desc nulls last,
    case when p_sort = 'gross_sales_desc' then ls.gross_sales end desc nulls last,
    case when p_sort = 'units_sold_desc' then ls.units_sold end desc nulls last,
    case when p_sort = 'newest' then ls.created_at end desc nulls last,
    case when p_sort = 'title_asc' then lower(ls.title) end asc nulls last,
    ls.title asc,
    ls.id asc
  limit v_limit
  offset v_offset;
end;
$$;

-- ----------------------------------------------------------------------------
-- 5. Admin top-sellers ranking
-- ----------------------------------------------------------------------------

create or replace function public.admin_analytics_top_sellers(
  p_start_date date default null,
  p_end_date date default null,
  p_sort text default 'gross_sales_desc',
  p_page integer default 1,
  p_page_size integer default 10
)
returns table (
  seller_id uuid,
  store_name text,
  seller_status public.seller_status,
  active_listings bigint,
  units_sold bigint,
  gross_sales numeric,
  transacted_orders bigint,
  completed_orders bigint,
  avg_rating numeric,
  review_count bigint,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_start timestamptz;
  v_end_excl timestamptz;
  v_limit integer;
  v_offset integer;
  v_transacted public.order_status[];
begin
  perform public.analytics_require_admin();
  perform public.analytics_require_window(p_start_date, p_end_date, 2190);
  perform public.analytics_require_sort(p_sort, array[
    'gross_sales_desc', 'units_sold_desc', 'transacted_desc', 'completed_desc',
    'rating_desc', 'store_asc'
  ]);
  perform public.analytics_require_page(p_page, p_page_size);
  v_start := p_start_date::timestamptz;
  v_end_excl := (p_end_date + 1)::timestamptz;
  v_limit := p_page_size;
  v_offset := (p_page - 1) * p_page_size;
  v_transacted := array['paid', 'preparing', 'shipped', 'ready_for_pickup', 'completed'];

  return query
  with sales_b as (
    select o.seller_id,
           count(*) filter (where o.status = any (v_transacted))::bigint as transacted_orders,
           count(*) filter (where o.status = 'completed')::bigint as completed_orders,
           coalesce(sum(o.total) filter (where o.status = any (v_transacted)), 0)::numeric as gross_sales
    from public.orders o
    where o.created_at >= v_start and o.created_at < v_end_excl
    group by o.seller_id
  ),
  units_b as (
    select o.seller_id, sum(oi.quantity)::bigint as units
    from public.orders o
    join public.order_items oi on oi.order_id = o.id
    where o.status = any (v_transacted)
      and o.created_at >= v_start and o.created_at < v_end_excl
    group by o.seller_id
  ),
  reviews_b as (
    select r.seller_id,
           round(avg(r.seller_rating), 2)::numeric as avg_rating,
           count(*)::bigint as review_count
    from public.reviews r
    where r.status = 'approved'
    group by r.seller_id
  ),
  seller_stats as (
    select sp.id,
           sp.store_name,
           sp.seller_status,
           (select count(*)::bigint
              from public.listings sl
              where sl.seller_id = sp.id and sl.listing_status = 'active') as active_listings,
           coalesce(u.units, 0) as units_sold,
           coalesce(s.gross_sales, 0) as gross_sales,
           coalesce(s.transacted_orders, 0) as transacted_orders,
           coalesce(s.completed_orders, 0) as completed_orders,
           r.avg_rating,
           coalesce(r.review_count, 0) as review_count
    from public.seller_profiles sp
    left join sales_b s on s.seller_id = sp.id
    left join units_b u on u.seller_id = sp.id
    left join reviews_b r on r.seller_id = sp.id
  )
  select ss.id,
         ss.store_name,
         ss.seller_status,
         ss.active_listings,
         ss.units_sold,
         ss.gross_sales,
         ss.transacted_orders,
         ss.completed_orders,
         ss.avg_rating,
         ss.review_count,
         count(*) over()::bigint as total_count
  from seller_stats ss
  order by
    case when p_sort = 'gross_sales_desc' then ss.gross_sales end desc nulls last,
    case when p_sort = 'units_sold_desc' then ss.units_sold end desc nulls last,
    case when p_sort = 'transacted_desc' then ss.transacted_orders end desc nulls last,
    case when p_sort = 'completed_desc' then ss.completed_orders end desc nulls last,
    case when p_sort = 'rating_desc' then ss.avg_rating end desc nulls last,
    case when p_sort = 'store_asc' then lower(ss.store_name) end asc nulls last,
    ss.store_name asc,
    ss.id asc
  limit v_limit
  offset v_offset;
end;
$$;

-- ----------------------------------------------------------------------------
-- 6. Seller overview (auth-derived scope — no seller_id parameter)
-- ----------------------------------------------------------------------------

create or replace function public.my_seller_analytics_overview(
  p_start_date date default null,
  p_end_date date default null
)
returns table (
  total_listings bigint,
  active_listings bigint,
  draft_listings bigint,
  sold_listings bigint,
  new_listings bigint,
  listing_views bigint,
  unique_viewers bigint,
  favorites_count bigint,
  inquiries_count bigint,
  transacted_orders bigint,
  completed_orders bigint,
  cancelled_orders bigint,
  disputed_orders bigint,
  products_sold bigint,
  gross_sales numeric,
  net_sales numeric,
  refund_count bigint,
  refund_value numeric,
  avg_order_value numeric,
  approved_reviews bigint,
  avg_rating numeric,
  open_disputes bigint,
  resolved_disputes bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_start timestamptz;
  v_end_excl timestamptz;
  v_seller uuid;
  v_transacted public.order_status[];
begin
  perform public.analytics_require_seller();
  perform public.analytics_require_window(p_start_date, p_end_date, 2190);
  v_seller := public.auth_seller_id();
  if v_seller is null then
    raise exception 'FORBIDDEN: only a seller can view seller analytics';
  end if;
  v_start := p_start_date::timestamptz;
  v_end_excl := (p_end_date + 1)::timestamptz;
  v_transacted := array['paid', 'preparing', 'shipped', 'ready_for_pickup', 'completed'];

  return query
  select
    (select count(*)::bigint from public.listings l where l.seller_id = v_seller) as total_listings,
    (select count(*)::bigint from public.listings l
       where l.seller_id = v_seller and l.listing_status = 'active') as active_listings,
    (select count(*)::bigint from public.listings l
       where l.seller_id = v_seller and l.listing_status = 'draft') as draft_listings,
    (select count(*)::bigint from public.listings l
       where l.seller_id = v_seller and l.listing_status = 'sold') as sold_listings,
    (select count(*)::bigint from public.listings l
       where l.seller_id = v_seller
         and l.created_at >= v_start and l.created_at < v_end_excl) as new_listings,
    (select count(*)::bigint
       from public.listing_views lv
       join public.listings l on l.id = lv.listing_id
       where l.seller_id = v_seller
         and lv.viewed_at >= v_start and lv.viewed_at < v_end_excl) as listing_views,
    (select count(distinct lv.viewer_id)::bigint
       from public.listing_views lv
       join public.listings l on l.id = lv.listing_id
       where l.seller_id = v_seller
         and lv.viewed_at >= v_start and lv.viewed_at < v_end_excl
         and lv.viewer_id is not null) as unique_viewers,
    (select count(*)::bigint
       from public.favorites f
       join public.listings l on l.id = f.listing_id
       where l.seller_id = v_seller
         and f.created_at >= v_start and f.created_at < v_end_excl) as favorites_count,
    (select count(*)::bigint from public.inquiries i
       where i.seller_id = v_seller
         and i.created_at >= v_start and i.created_at < v_end_excl) as inquiries_count,
    (select count(*)::bigint from public.orders o
       where o.seller_id = v_seller
         and o.status = any (v_transacted)
         and o.created_at >= v_start and o.created_at < v_end_excl) as transacted_orders,
    (select count(*)::bigint from public.orders o
       where o.seller_id = v_seller and o.status = 'completed'
         and o.created_at >= v_start and o.created_at < v_end_excl) as completed_orders,
    (select count(*)::bigint from public.orders o
       where o.seller_id = v_seller and o.status = 'cancelled'
         and o.created_at >= v_start and o.created_at < v_end_excl) as cancelled_orders,
    (select count(distinct d.order_id)::bigint
       from public.disputes d
       join public.orders o on o.id = d.order_id
       where o.seller_id = v_seller
         and o.created_at >= v_start and o.created_at < v_end_excl) as disputed_orders,
    (select coalesce(sum(oi.quantity), 0)::bigint
       from public.order_items oi
       join public.orders o on o.id = oi.order_id
       where o.seller_id = v_seller
         and o.status = any (v_transacted)
         and o.created_at >= v_start and o.created_at < v_end_excl) as products_sold,
    (select coalesce(sum(o.total), 0)::numeric
       from public.orders o
       where o.seller_id = v_seller
         and o.status = any (v_transacted)
         and o.created_at >= v_start and o.created_at < v_end_excl) as gross_sales,
    (select coalesce(sum(o.total), 0)::numeric
       from public.orders o
       where o.seller_id = v_seller
         and o.status = any (v_transacted)
         and o.created_at >= v_start and o.created_at < v_end_excl)
       - (select coalesce(sum(r.amount), 0)::numeric
            from public.refunds r
            where r.seller_id = v_seller and r.status = 'completed'
              and r.completed_at >= v_start and r.completed_at < v_end_excl) as net_sales,
    (select count(*)::bigint from public.refunds r
       where r.seller_id = v_seller and r.status = 'completed'
         and r.completed_at >= v_start and r.completed_at < v_end_excl) as refund_count,
    (select coalesce(sum(r.amount), 0)::numeric from public.refunds r
       where r.seller_id = v_seller and r.status = 'completed'
         and r.completed_at >= v_start and r.completed_at < v_end_excl) as refund_value,
    (select case when count(*) = 0 then 0::numeric
            else round(sum(o.total) / count(*)::numeric, 2) end
       from public.orders o
       where o.seller_id = v_seller
         and o.status = any (v_transacted)
         and o.created_at >= v_start and o.created_at < v_end_excl) as avg_order_value,
    (select count(*)::bigint from public.reviews r
       where r.seller_id = v_seller and r.status = 'approved') as approved_reviews,
    (select round(avg(r.seller_rating), 2)::numeric from public.reviews r
       where r.seller_id = v_seller and r.status = 'approved') as avg_rating,
    (select count(*)::bigint from public.disputes d
       where d.seller_id = v_seller and d.status = 'open') as open_disputes,
    (select count(*)::bigint from public.disputes d
       where d.seller_id = v_seller and d.status = 'resolved') as resolved_disputes;
end;
$$;

-- ----------------------------------------------------------------------------
-- 7. Seller time series (auth-derived scope)
-- ----------------------------------------------------------------------------

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
    coalesce(o.units, 0) as products_sold,
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

-- ----------------------------------------------------------------------------
-- 8. Seller listing performance (auth-derived scope)
-- ----------------------------------------------------------------------------

create or replace function public.my_seller_analytics_listings(
  p_start_date date default null,
  p_end_date date default null,
  p_sort text default 'views_desc',
  p_page integer default 1,
  p_page_size integer default 10
)
returns table (
  listing_id uuid,
  listing_title text,
  listing_status public.listing_status,
  views bigint,
  favorites bigint,
  inquiries bigint,
  units_sold bigint,
  gross_sales numeric,
  avg_rating numeric,
  review_count bigint,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_start timestamptz;
  v_end_excl timestamptz;
  v_limit integer;
  v_offset integer;
  v_seller uuid;
  v_transacted public.order_status[];
begin
  perform public.analytics_require_seller();
  perform public.analytics_require_window(p_start_date, p_end_date, 2190);
  perform public.analytics_require_sort(p_sort, array[
    'views_desc', 'favorites_desc', 'inquiries_desc', 'gross_sales_desc',
    'units_sold_desc', 'newest', 'title_asc'
  ]);
  perform public.analytics_require_page(p_page, p_page_size);
  v_seller := public.auth_seller_id();
  if v_seller is null then
    raise exception 'FORBIDDEN: only a seller can view seller analytics';
  end if;
  v_start := p_start_date::timestamptz;
  v_end_excl := (p_end_date + 1)::timestamptz;
  v_limit := p_page_size;
  v_offset := (p_page - 1) * p_page_size;
  v_transacted := array['paid', 'preparing', 'shipped', 'ready_for_pickup', 'completed'];

  return query
  with views_b as (
    select lv.listing_id, count(*)::bigint as n
    from public.listing_views lv
    join public.listings l on l.id = lv.listing_id
    where l.seller_id = v_seller
      and lv.viewed_at >= v_start and lv.viewed_at < v_end_excl
    group by lv.listing_id
  ),
  favorites_b as (
    select f.listing_id, count(*)::bigint as n
    from public.favorites f
    join public.listings l on l.id = f.listing_id
    where l.seller_id = v_seller
      and f.created_at >= v_start and f.created_at < v_end_excl
    group by f.listing_id
  ),
  inquiries_b as (
    select i.listing_id, count(*)::bigint as n
    from public.inquiries i
    where i.seller_id = v_seller
      and i.created_at >= v_start and i.created_at < v_end_excl
    group by i.listing_id
  ),
  sales_b as (
    select oi.listing_id,
           sum(oi.quantity)::bigint as units,
           sum(oi.unit_price * oi.quantity)::numeric as gross
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    where o.seller_id = v_seller
      and o.status = any (v_transacted)
      and o.created_at >= v_start and o.created_at < v_end_excl
    group by oi.listing_id
  ),
  reviews_b as (
    select r.listing_id,
           round(avg(r.rating), 2)::numeric as avg_rating,
           count(*)::bigint as review_count
    from public.reviews r
    where r.status = 'approved'
    group by r.listing_id
  ),
  listing_stats as (
    select l.id,
           l.title,
           l.listing_status,
           l.created_at,
           coalesce(v.n, 0) as views,
           coalesce(f.n, 0) as favorites,
           coalesce(i.n, 0) as inquiries,
           coalesce(s.units, 0) as units_sold,
           coalesce(s.gross, 0) as gross_sales,
           r.avg_rating,
           coalesce(r.review_count, 0) as review_count
    from public.listings l
    left join views_b v on v.listing_id = l.id
    left join favorites_b f on f.listing_id = l.id
    left join inquiries_b i on i.listing_id = l.id
    left join sales_b s on s.listing_id = l.id
    left join reviews_b r on r.listing_id = l.id
    where l.seller_id = v_seller
  )
  select ls.id,
         ls.title,
         ls.listing_status,
         ls.views,
         ls.favorites,
         ls.inquiries,
         ls.units_sold,
         ls.gross_sales,
         ls.avg_rating,
         ls.review_count,
         count(*) over()::bigint as total_count
  from listing_stats ls
  order by
    case when p_sort = 'views_desc' then ls.views end desc nulls last,
    case when p_sort = 'favorites_desc' then ls.favorites end desc nulls last,
    case when p_sort = 'inquiries_desc' then ls.inquiries end desc nulls last,
    case when p_sort = 'gross_sales_desc' then ls.gross_sales end desc nulls last,
    case when p_sort = 'units_sold_desc' then ls.units_sold end desc nulls last,
    case when p_sort = 'newest' then ls.created_at end desc nulls last,
    case when p_sort = 'title_asc' then lower(ls.title) end asc nulls last,
    ls.title asc,
    ls.id asc
  limit v_limit
  offset v_offset;
end;
$$;

-- ----------------------------------------------------------------------------
-- 9. Analytic-supporting indexes (audited — none duplicate existing indexes)
-- ----------------------------------------------------------------------------

create index if not exists idx_listing_views_listing_viewed
  on public.listing_views (listing_id, viewed_at desc);

create index if not exists idx_favorites_listing_created
  on public.favorites (listing_id, created_at desc);

create index if not exists idx_inquiries_listing_created
  on public.inquiries (listing_id, created_at desc);

create index if not exists idx_inquiries_seller_created
  on public.inquiries (seller_id, created_at desc);

create index if not exists idx_orders_seller_created
  on public.orders (seller_id, created_at desc);

-- ----------------------------------------------------------------------------
-- 10. Grants — authenticated only; anonymous users never see analytics
-- ----------------------------------------------------------------------------

grant execute on function public.analytics_require_admin() to authenticated;
grant execute on function public.analytics_require_seller() to authenticated;
grant execute on function public.analytics_require_window(date, date, integer) to authenticated;
grant execute on function public.analytics_require_bucket(text) to authenticated;
grant execute on function public.analytics_require_sort(text, text[]) to authenticated;
grant execute on function public.analytics_require_page(integer, integer) to authenticated;

revoke execute on function public.admin_analytics_overview(date, date) from public, anon;
revoke execute on function public.admin_analytics_timeseries(date, date, text) from public, anon;
revoke execute on function public.admin_analytics_categories(date, date, text, integer, integer) from public, anon;
revoke execute on function public.admin_analytics_top_listings(date, date, text, integer, integer) from public, anon;
revoke execute on function public.admin_analytics_top_sellers(date, date, text, integer, integer) from public, anon;
grant execute on function public.admin_analytics_overview(date, date) to authenticated;
grant execute on function public.admin_analytics_timeseries(date, date, text) to authenticated;
grant execute on function public.admin_analytics_categories(date, date, text, integer, integer) to authenticated;
grant execute on function public.admin_analytics_top_listings(date, date, text, integer, integer) to authenticated;
grant execute on function public.admin_analytics_top_sellers(date, date, text, integer, integer) to authenticated;

revoke execute on function public.my_seller_analytics_overview(date, date) from public, anon;
revoke execute on function public.my_seller_analytics_timeseries(date, date, text) from public, anon;
revoke execute on function public.my_seller_analytics_listings(date, date, text, integer, integer) from public, anon;
grant execute on function public.my_seller_analytics_overview(date, date) to authenticated;
grant execute on function public.my_seller_analytics_timeseries(date, date, text) to authenticated;
grant execute on function public.my_seller_analytics_listings(date, date, text, integer, integer) to authenticated;

commit;