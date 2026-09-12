-- Phase 5 — Marketplace search & discovery.
--
-- Single search RPC used by the marketplace page. PostgREST embedded-resource
-- filtering was evaluated and proven too complex/error-prone for fuzzy text +
-- combined filters + sort + pagination, so search is a security-invoker RPC.
-- RLS on `listings` still gates visibility: `listing_status = 'active'` and
-- quantity > 0 are enforced here AND by the base select policy, so anonymous
-- callers can only ever see published inventory. `security invoker` keeps the
-- caller's privileges (no privileged path).

create or replace function public.marketplace_search_listings(
  search text default null,
  category_slug text default null,
  brand_slug text default null,
  listing_condition text default null,
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
  v_page integer;
  v_page_size integer;
  v_sort text;
  v_offset integer;
  v_result jsonb;
begin
  v_page := greatest(coalesce(page, 1), 1);
  v_page_size := least(greatest(coalesce(page_size, 12), 1), 100);
  v_offset := (v_page - 1) * v_page_size;

  if sort not in ('newest', 'oldest', 'price_asc', 'price_desc') then
    v_sort := 'newest';
  else
    v_sort := sort;
  end if;

  with f as (
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
        'category', case
          when c.id is null then null
          else jsonb_build_object('id', c.id, 'name', c.name, 'slug', c.slug)
        end,
        'brand', case
          when b.id is null then null
          else jsonb_build_object('id', b.id, 'name', b.name, 'slug', b.slug)
        end,
        'seller', case
          when sp.id is null then null
          else jsonb_build_object('id', sp.id, 'store_name', sp.store_name)
        end,
        'images', coalesce(img.images, '[]'::jsonb)
      ) as item,
      l.created_at as created_at,
      l.price as price
    from public.listings l
    left join public.categories c on c.id = l.category_id
    left join public.brands b on b.id = l.brand_id
    left join public.public_seller_profiles sp on sp.id = l.seller_id
    left join lateral (
      select jsonb_agg(
        jsonb_build_object(
          'id', i.id,
          'url', i.url,
          'storage_path', i.storage_path,
          'is_primary', i.is_primary,
          'sort_order', i.sort_order
        ) order by i.is_primary desc, i.sort_order asc, i.created_at asc
      ) as images
      from public.listing_images i
      where i.listing_id = l.id
    ) img on true
    where l.listing_status = 'active'
      and l.quantity > 0
      and (
        search is null
        or trim(search) = ''
        or l.title ilike '%' || trim(search) || '%'
        or l.description ilike '%' || trim(search) || '%'
        or c.name ilike '%' || trim(search) || '%'
        or b.name ilike '%' || trim(search) || '%'
      )
      and (category_slug is null or c.slug = category_slug)
      and (brand_slug is null or b.slug = brand_slug)
      and (listing_condition is null or l.listing_condition::text = listing_condition)
      and (min_price is null or l.price >= min_price)
      and (max_price is null or l.price <= max_price)
      and (pickup is null or pickup = l.pickup_available)
      and (delivery is null or delivery = l.delivery_available)
  )
  select jsonb_build_object(
    'items', coalesce((
      select jsonb_agg(item order by
        case v_sort
          when 'oldest' then (extract(epoch from f.created_at))::numeric
          when 'newest' then (extract(epoch from f.created_at) * -1)::numeric
          when 'price_asc' then f.price
          when 'price_desc' then f.price * -1
        end asc,
        f.created_at desc
      )
      from f
      limit v_page_size offset v_offset
    ), '[]'::jsonb),
    'total', (select count(*) from f),
    'page', v_page,
    'pageSize', v_page_size
  ) into v_result;

  return v_result;
end;
$$;
