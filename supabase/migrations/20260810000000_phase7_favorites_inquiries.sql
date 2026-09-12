-- ============================================================================
-- PHASE 7 — FAVORITES AND INQUIRIES
-- ============================================================================
-- Adds favorites/inquiries hardening on top of the Phase 1 base schema:
--   * listing_title snapshots so favorites/inquiries stay meaningful after a
--     listing is archived, sold, or removed (RLS hides inactive listings).
--   * Length bounds on inquiry subject/messages.
--   * One active (open/answered) inquiry per buyer per listing.
--   * Sellers cannot inquire about their own listings.
--   * Participants can mark inbound messages as read.
--   * Atomic seller/buyer reply via send_inquiry_reply() (definer RPC).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Favorites listing_title snapshot
-- ----------------------------------------------------------------------------
alter table public.favorites add column listing_title text;

create or replace function public.favorites_snapshot_listing()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_title text;
begin
  select l.title into v_title from public.listings l where l.id = new.listing_id;
  if v_title is null then
    raise exception 'listing does not exist';
  end if;
  new.listing_title := v_title;
  return new;
end;
$$;

create trigger favorites_snapshot_listing
  before insert on public.favorites
  for each row execute function public.favorites_snapshot_listing();

-- ----------------------------------------------------------------------------
-- 2. Inquiries listing_title snapshot + message bounds
-- ----------------------------------------------------------------------------
alter table public.inquiries add column listing_title text;

create or replace function public.inquiries_snapshot_listing()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_title text;
begin
  select l.title into v_title from public.listings l where l.id = new.listing_id;
  if v_title is null then
    raise exception 'listing does not exist';
  end if;
  new.listing_title := v_title;
  return new;
end;
$$;

create trigger inquiries_snapshot_listing
  before insert on public.inquiries
  for each row execute function public.inquiries_snapshot_listing();

-- Subject and message bounds (trimmed) on inquiries.
alter table public.inquiries
  add constraint inquiries_subject_length check (length(trim(subject)) between 3 and 120),
  add constraint inquiries_message_length check (length(trim(message)) between 3 and 2000);

-- Message bounds on thread messages.
alter table public.inquiry_messages
  add constraint inquiry_messages_message_length check (length(trim(message)) between 1 and 2000);

-- ----------------------------------------------------------------------------
-- 3. One active conversation per buyer per listing
-- ----------------------------------------------------------------------------
-- A buyer may only have one ongoing (open or answered) inquiry for the same
-- listing. Once it is closed, a new inquiry is allowed.
create unique index inquiries_one_open_per_buyer_listing
  on public.inquiries (buyer_id, listing_id)
  where status in ('open', 'answered');

-- ----------------------------------------------------------------------------
-- 4. Self-inquiry prevention
-- ----------------------------------------------------------------------------
-- The Phase 1 policy let any authenticated buyer inquire about a listing,
-- including their own. Recreate it to also require the caller's seller
-- account (if any) not to own the listing. For non-sellers auth_seller_id()
-- is null and `is distinct from null` is true, so buying is unaffected.
drop policy "inquiries_insert_buyer" on public.inquiries;

create policy "inquiries_insert_buyer" on public.inquiries
  for insert with check (
    buyer_id = auth.uid()
    and seller_id = (
      select l.seller_id from public.listings l
      where l.id = inquiries.listing_id
    )
    and seller_id is distinct from public.auth_seller_id()
  );

-- ----------------------------------------------------------------------------
-- 5. Mark inbound messages as read
-- ----------------------------------------------------------------------------
-- Participants may mark messages they did not author as read. The with-check
-- additionally forbids flipping messages back to unread or marking their own
-- messages, which would let a participant game unread counts.
create policy "inquiry_messages_update_read_participant" on public.inquiry_messages
  for update using (
    exists (
      select 1 from public.inquiries i
      where i.id = inquiry_messages.inquiry_id
        and (i.buyer_id = auth.uid() or i.seller_id = public.auth_seller_id())
    )
  ) with check (
    exists (
      select 1 from public.inquiries i
      where i.id = inquiry_messages.inquiry_id
        and (i.buyer_id = auth.uid() or i.seller_id = public.auth_seller_id())
    )
    and sender_id <> auth.uid()
    and is_read = true
  );

grant update (is_read) on public.inquiry_messages to authenticated;

-- ----------------------------------------------------------------------------
-- 6. Atomic reply RPC
-- ----------------------------------------------------------------------------
-- Security definer (with secure search_path) so it can write the message and
-- flip the inquiry status in one atomic step. It re-validates participation
-- and the open/answered state; a closed inquiry cannot be revived. Seller
-- replies mark the inquiry answered; buyer replies reopen it (still awaiting
-- the seller).
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

  if not (
    v_inquiry.buyer_id = v_sender
    or v_inquiry.seller_id = public.auth_seller_id()
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
