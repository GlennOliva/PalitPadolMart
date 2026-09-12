-- ============================================================================
-- PHASE 7 HARDENING — INQUIRY REPLY AUTHORIZATION
--
-- Fixes a NULL three-valued-logic bypass in send_inquiry_reply().
--
-- The original participant check was:
--
--     if not (
--       v_inquiry.buyer_id = v_sender
--       or v_inquiry.seller_id = public.auth_seller_id()
--     ) then raise exception 'not a participant of this inquiry';
--
-- `public.auth_seller_id()` returns NULL when the caller has no seller
-- profile. In that case `v_inquiry.seller_id = NULL` evaluates to NULL (not
-- false), so the whole disjunction is NULL and `IF NOT NULL` is treated as
-- "don't raise". Any authenticated user without a seller profile could reply
-- to any inquiry, bypassing the RLS that correctly denies the same user on a
-- direct inquiry_messages insert (RLS treats NULL as "no match").
--
-- The check is rewritten NULL-safe: participation is the inquiry buyer, or
-- the authenticated user who owns the seller profile associated with the
-- inquiry's listing (derived from the listing, not from client input). An
-- `EXISTS` predicate always yields a boolean, never NULL.
--
-- RLS is unchanged and remains enabled; the direct-insert/read paths were
-- already correct. The function keeps its SECURITY DEFINER mode because it is
-- an atomic RPC that writes the message and flips the inquiry status in one
-- step; the authorization bug was in the check, not the security mode.
-- ============================================================================

create or replace function public.send_inquiry_reply(
  p_inquiry_id uuid,
  p_message text
)
returns public.inquiry_messages
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inquiry public.inquiries%rowtype;
  v_trimmed text := trim(p_message);
  v_sender uuid := auth.uid();
  v_message public.inquiry_messages;
begin
  if v_sender is null then
    raise exception 'not authenticated';
  end if;

  if v_trimmed = '' or length(v_trimmed) > 2000 then
    raise exception 'message must be between 1 and 2000 characters';
  end if;

  select * into v_inquiry
  from public.inquiries
  where id = p_inquiry_id
  for update;

  if not found then
    raise exception 'inquiry not found';
  end if;

  -- NULL-safe participant check (EXISTS never returns NULL):
  --   * the inquiry buyer, or
  --   * the authenticated user who owns the seller profile that owns the
  --     inquiry's listing.
  -- The seller id is derived from the listing row (trusted DB data); the
  -- caller's identity always comes from auth.uid(), never from the request.
  if not (
    v_inquiry.buyer_id = v_sender
    or exists (
      select 1
      from public.seller_profiles sp
      join public.listings l on l.seller_id = sp.id
      where l.id = v_inquiry.listing_id
        and sp.user_id = v_sender
    )
  ) then
    raise exception 'not a participant of this inquiry';
  end if;

  if v_inquiry.status = 'closed' then
    raise exception 'inquiry is closed';
  end if;

  insert into public.inquiry_messages (inquiry_id, sender_id, message)
  values (p_inquiry_id, v_sender, v_trimmed)
  returning * into v_message;

  if v_inquiry.buyer_id = v_sender then
    update public.inquiries set status = 'open' where id = p_inquiry_id;
  else
    update public.inquiries set status = 'answered' where id = p_inquiry_id;
  end if;

  return v_message;
end;
$$;

grant execute on function public.send_inquiry_reply(uuid, text) to authenticated;
