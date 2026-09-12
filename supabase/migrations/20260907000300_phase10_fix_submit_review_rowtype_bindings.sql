-- Fix submit_review's variable binding.
--
-- The original implementation loaded rows into `%rowtype` variables with
-- `select <subset of columns> into v_item`, which PL/pgSQL assigns BY
-- POSITION. The subset did not match the physical column order of the tables,
-- so fields were silently misbound (e.g. order_items.product_title landed in
-- reviews.seller_id and the INSERT failed with a uuid cast error).
--
-- Rewritten with explicit scalar variables per attribute — no rowtype
-- positional binding anywhere — while preserving the exact RPC signature,
-- error codes, and behavior.

begin;

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
  v_order_id uuid;
  v_order_status public.order_status;
  v_buyer_id uuid;
  v_item_seller_id uuid;
  v_item_listing_id uuid;
  v_review public.reviews%rowtype;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED: You must be signed in to review an item.'
      using errcode = 'P0001';
  end if;

  select oi.order_id, oi.seller_id, oi.listing_id
    into v_order_id, v_item_seller_id, v_item_listing_id
    from public.order_items oi
    where oi.id = p_order_item_id;

  if not found then
    raise exception 'ORDER_ITEM_NOT_FOUND: This order item does not exist.'
      using errcode = 'P0001';
  end if;

  select o.buyer_id, o.status
    into v_buyer_id, v_order_status
    from public.orders o
    where o.id = v_order_id;

  if not found then
    raise exception 'ORDER_ITEM_NOT_FOUND: This order item does not exist.'
      using errcode = 'P0001';
  end if;

  if v_order_status <> 'completed' then
    raise exception 'ORDER_NOT_COMPLETED: You can only review items from completed orders.'
      using errcode = 'P0001';
  end if;

  if v_buyer_id <> auth.uid() then
    raise exception 'FORBIDDEN: Only the buyer who purchased this item can review it.'
      using errcode = 'P0001';
  end if;

  if public.auth_seller_id() is not distinct from v_item_seller_id then
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
    p_order_item_id, v_order_id, auth.uid(), v_item_seller_id, v_item_listing_id,
    p_rating, p_seller_rating,
    case when btrim(p_comment) = '' then null else p_comment end,
    'approved'
  )
  returning * into v_review;

  return v_review;
end;
$$;

commit;