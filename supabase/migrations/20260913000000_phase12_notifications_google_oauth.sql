-- ============================================================================
-- PHASE 12 - NOTIFICATIONS + GOOGLE OAUTH PROFILE PROVISIONING
-- ============================================================================
-- Notification rows are durable per-recipient deliveries. Business tables and
-- their immutable event rows remain the source of truth; private trigger
-- functions translate committed marketplace events into deduplicated
-- deliveries in the same transaction. A later email channel can consume this
-- boundary without changing the business RPCs that produce the events.

begin;

-- ----------------------------------------------------------------------------
-- 1. Notification event identity and stable pagination
-- ----------------------------------------------------------------------------

alter table public.notifications
  add column if not exists event_name text,
  add column if not exists event_key text,
  add column if not exists actor_id uuid references auth.users(id) on delete set null;

update public.notifications
set event_name = case
      when type = 'order' and title = 'New order' then 'order.created'
      when type = 'order' and title = 'Order confirmed' then 'order.confirmed'
      when type = 'order' and title = 'Order cancelled' then 'order.cancelled'
      else 'system.legacy'
    end,
    event_key = 'legacy:' || id::text
where event_name is null or event_key is null;

alter table public.notifications
  alter column event_name set not null,
  alter column event_key set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.notifications'::regclass
      and conname = 'notifications_event_name_check'
  ) then
    alter table public.notifications
      add constraint notifications_event_name_check
      check (
        event_name = btrim(event_name)
        and char_length(event_name) between 3 and 80
        and event_name ~ '^[a-z][a-z0-9_.]*$'
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.notifications'::regclass
      and conname = 'notifications_event_key_check'
  ) then
    alter table public.notifications
      add constraint notifications_event_key_check
      check (event_key = btrim(event_key) and char_length(event_key) between 3 and 250);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.notifications'::regclass
      and conname = 'notifications_title_check'
  ) then
    alter table public.notifications
      add constraint notifications_title_check
      check (title = btrim(title) and char_length(title) between 1 and 160);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.notifications'::regclass
      and conname = 'notifications_message_check'
  ) then
    alter table public.notifications
      add constraint notifications_message_check
      check (message is null or char_length(message) between 1 and 500);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.notifications'::regclass
      and conname = 'notifications_related_entity_type_check'
  ) then
    alter table public.notifications
      add constraint notifications_related_entity_type_check
      check (
        related_entity_type is null
        or (
          related_entity_type = btrim(related_entity_type)
          and char_length(related_entity_type) between 1 and 80
          and related_entity_type ~ '^[a-z][a-z0-9_]*$'
        )
      );
  end if;
end;
$$;

create unique index if not exists notifications_recipient_event_key_key
  on public.notifications (recipient_id, event_key);

create index if not exists idx_notifications_recipient_created_id
  on public.notifications (recipient_id, created_at desc, id desc);

create index if not exists idx_notifications_recipient_unread_created_id
  on public.notifications (recipient_id, created_at desc, id desc)
  where is_read = false;

-- Existing order notifications predate role-specific routes. Backfill only
-- rows whose trusted order relationship can still be resolved.
update public.notifications n
set related_entity_type = case
  when o.buyer_id is not distinct from n.recipient_id then 'buyer_order'
  when sp.user_id is not distinct from n.recipient_id then 'seller_order'
  else n.related_entity_type
end
from public.orders o
join public.seller_profiles sp on sp.id = o.seller_id
where n.related_entity_id is not distinct from o.id
  and n.related_entity_type = 'order';

-- ----------------------------------------------------------------------------
-- 2. One private notification write boundary
-- ----------------------------------------------------------------------------

create or replace function public.emit_marketplace_notification(
  p_recipient_id uuid,
  p_event_name text,
  p_event_key text,
  p_type public.notification_type,
  p_title text,
  p_message text default null,
  p_related_entity_type text default null,
  p_related_entity_id uuid default null,
  p_actor_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_event_name text := btrim(coalesce(p_event_name, ''));
  v_event_key text := btrim(coalesce(p_event_key, ''));
  v_title text := btrim(coalesce(p_title, ''));
  v_message text := nullif(btrim(coalesce(p_message, '')), '');
  v_entity_type text := nullif(btrim(coalesce(p_related_entity_type, '')), '');
begin
  if p_recipient_id is null then
    return null;
  end if;

  if v_event_name !~ '^[a-z][a-z0-9_.]*$'
     or char_length(v_event_name) not between 3 and 80 then
    raise exception 'INVALID_NOTIFICATION_EVENT: event name is invalid';
  end if;
  if char_length(v_event_key) not between 3 and 250 then
    raise exception 'INVALID_NOTIFICATION_EVENT: event key is invalid';
  end if;
  if char_length(v_title) not between 1 and 160 then
    raise exception 'INVALID_NOTIFICATION_CONTENT: title is invalid';
  end if;
  if v_message is not null and char_length(v_message) > 500 then
    raise exception 'INVALID_NOTIFICATION_CONTENT: message is too long';
  end if;
  if v_entity_type is not null and (
    v_entity_type !~ '^[a-z][a-z0-9_]*$'
    or char_length(v_entity_type) > 80
  ) then
    raise exception 'INVALID_NOTIFICATION_TARGET: entity type is invalid';
  end if;

  insert into public.notifications (
    recipient_id,
    actor_id,
    event_name,
    event_key,
    type,
    title,
    message,
    related_entity_type,
    related_entity_id
  )
  values (
    p_recipient_id,
    p_actor_id,
    v_event_name,
    v_event_key,
    p_type,
    v_title,
    v_message,
    v_entity_type,
    p_related_entity_id
  )
  on conflict (recipient_id, event_key) do nothing
  returning id into v_id;

  if v_id is null then
    select id into v_id
    from public.notifications
    where recipient_id is not distinct from p_recipient_id
      and event_key is not distinct from v_event_key;
  end if;

  return v_id;
end;
$$;

revoke execute on function public.emit_marketplace_notification(
  uuid, text, text, public.notification_type, text, text, text, uuid, uuid
) from public, anon, authenticated;

-- Compatibility for the four Phase 8/9 order calls. Browser execution is
-- revoked below; role-specific targets and event identity are derived from the
-- persisted order rather than trusted from the caller's display strings.
create or replace function public.notify_user(
  p_recipient_id uuid,
  p_type public.notification_type,
  p_title text,
  p_message text,
  p_related_entity_type text default null,
  p_related_entity_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_name text := 'system.legacy';
  v_event_key text;
  v_entity_type text := p_related_entity_type;
  v_title text := p_title;
  v_order public.orders%rowtype;
  v_seller_user uuid;
begin
  if p_recipient_id is null then
    return;
  end if;

  if p_type = 'order' and p_related_entity_id is not null then
    select * into v_order
    from public.orders
    where id is not distinct from p_related_entity_id;

    if found then
      select user_id into v_seller_user
      from public.seller_profiles
      where id is not distinct from v_order.seller_id;

      v_entity_type := case
        when p_recipient_id is not distinct from v_order.buyer_id then 'buyer_order'
        when p_recipient_id is not distinct from v_seller_user then 'seller_order'
        else null
      end;

      if p_title = 'New order' then
        v_event_name := 'order.created';
      elsif p_title = 'Order confirmed' then
        v_event_name := 'order.confirmed';
      elsif p_title = 'Order cancelled' and p_recipient_id is not distinct from v_order.buyer_id then
        v_event_name := 'order.rejected';
        v_title := 'Order rejected';
      elsif p_title = 'Order cancelled' then
        v_event_name := 'order.cancelled';
      end if;
    end if;
  end if;

  v_event_key := case
    when p_related_entity_id is not null
      then v_event_name || ':' || p_related_entity_id::text
    else v_event_name || ':' || md5(concat_ws('|', p_recipient_id::text, p_title, p_message))
  end;

  perform public.emit_marketplace_notification(
    p_recipient_id => p_recipient_id,
    p_event_name => v_event_name,
    p_event_key => v_event_key,
    p_type => p_type,
    p_title => v_title,
    p_message => p_message,
    p_related_entity_type => v_entity_type,
    p_related_entity_id => p_related_entity_id,
    p_actor_id => auth.uid()
  );
end;
$$;

revoke execute on function public.notify_user(
  uuid, public.notification_type, text, text, text, uuid
) from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 3. Owner-only read contract and controlled one-way read mutations
-- ----------------------------------------------------------------------------

drop policy if exists "notifications_select_own" on public.notifications;
drop policy if exists "notifications_update_own" on public.notifications;
drop policy if exists "notifications_delete_own" on public.notifications;

create policy "notifications_select_own"
  on public.notifications
  for select
  to authenticated
  using (recipient_id is not distinct from auth.uid());

revoke all on public.notifications from public, anon, authenticated;
grant select on public.notifications to authenticated;

create or replace function public.mark_notification_read(p_notification_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated integer;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED: sign in to update notifications';
  end if;

  update public.notifications
  set is_read = true
  where id is not distinct from p_notification_id
    and recipient_id is not distinct from auth.uid()
    and is_read = false;

  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$;

create or replace function public.mark_all_notifications_read()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated integer;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED: sign in to update notifications';
  end if;

  update public.notifications
  set is_read = true
  where recipient_id is not distinct from auth.uid()
    and is_read = false;

  get diagnostics v_updated = row_count;
  return v_updated;
end;
$$;

revoke execute on function public.mark_notification_read(uuid) from public, anon;
revoke execute on function public.mark_all_notifications_read() from public, anon;
grant execute on function public.mark_notification_read(uuid) to authenticated;
grant execute on function public.mark_all_notifications_read() to authenticated;

-- ----------------------------------------------------------------------------
-- 4. Profile provisioning shared by password and OAuth registrations
-- ----------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (
    id,
    first_name,
    last_name,
    display_name,
    role,
    account_status
  )
  values (
    new.id,
    nullif(left(btrim(coalesce(
      new.raw_user_meta_data ->> 'given_name',
      new.raw_user_meta_data ->> 'first_name',
      ''
    )), 120), ''),
    nullif(left(btrim(coalesce(
      new.raw_user_meta_data ->> 'family_name',
      new.raw_user_meta_data ->> 'last_name',
      ''
    )), 120), ''),
    nullif(left(btrim(coalesce(
      new.raw_user_meta_data ->> 'display_name',
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      ''
    )), 120), ''),
    'customer',
    'active'
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- 5. Inquiry events
-- ----------------------------------------------------------------------------

create or replace function public.notify_inquiry_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seller_user uuid;
begin
  select user_id into v_seller_user
  from public.seller_profiles
  where id is not distinct from new.seller_id;

  perform public.emit_marketplace_notification(
    v_seller_user,
    'inquiry.created',
    'inquiry.created:' || new.id::text,
    'inquiry',
    'New inquiry',
    'A buyer asked about one of your listings.',
    'inquiry',
    new.id,
    new.buyer_id
  );

  return new;
end;
$$;

create or replace function public.notify_inquiry_message_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inquiry public.inquiries%rowtype;
  v_seller_user uuid;
  v_recipient uuid;
begin
  select * into v_inquiry
  from public.inquiries
  where id is not distinct from new.inquiry_id;

  select user_id into v_seller_user
  from public.seller_profiles
  where id is not distinct from v_inquiry.seller_id;

  v_recipient := case
    when new.sender_id is not distinct from v_inquiry.buyer_id then v_seller_user
    else v_inquiry.buyer_id
  end;

  perform public.emit_marketplace_notification(
    v_recipient,
    'inquiry.reply',
    'inquiry.reply:' || new.id::text,
    'inquiry',
    'New inquiry reply',
    'You received a reply in a listing inquiry.',
    'inquiry',
    new.inquiry_id,
    new.sender_id
  );

  return new;
end;
$$;

drop trigger if exists inquiries_notify_created on public.inquiries;
create trigger inquiries_notify_created
  after insert on public.inquiries
  for each row execute function public.notify_inquiry_created();

drop trigger if exists inquiry_messages_notify_created on public.inquiry_messages;
create trigger inquiry_messages_notify_created
  after insert on public.inquiry_messages
  for each row execute function public.notify_inquiry_message_created();

-- ----------------------------------------------------------------------------
-- 6. Payment and fulfillment events
-- ----------------------------------------------------------------------------

create or replace function public.notify_payment_changed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_seller_user uuid;
  v_recipient uuid;
  v_event_name text;
  v_title text;
  v_message text;
  v_target text;
  v_occurrence text;
begin
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    return new;
  end if;

  select * into v_order
  from public.orders
  where id is not distinct from new.order_id;

  select user_id into v_seller_user
  from public.seller_profiles
  where id is not distinct from v_order.seller_id;

  if new.status = 'submitted' then
    v_recipient := v_seller_user;
    v_event_name := 'payment.submitted';
    v_title := 'Payment submitted';
    v_message := 'Payment for order ' || v_order.order_number || ' is ready for review.';
    v_target := 'seller_order';
  elsif new.status = 'pending' and tg_op = 'INSERT' then
    v_recipient := v_seller_user;
    v_event_name := 'payment.cash_selected';
    v_title := 'Cash payment selected';
    v_message := 'The buyer selected cash payment for order ' || v_order.order_number || '.';
    v_target := 'seller_order';
  elsif new.status = 'paid' then
    v_recipient := v_order.buyer_id;
    v_event_name := case
      when new.payment_method = 'manual_transfer' then 'payment.approved'
      else 'payment.received'
    end;
    v_title := case
      when new.payment_method = 'manual_transfer' then 'Payment approved'
      else 'Cash payment received'
    end;
    v_message := 'Payment for order ' || v_order.order_number || ' was confirmed.';
    v_target := 'buyer_order';
  elsif new.status = 'rejected' then
    v_recipient := v_order.buyer_id;
    v_event_name := 'payment.rejected';
    v_title := 'Payment needs attention';
    v_message := 'Payment for order ' || v_order.order_number || ' was rejected. Review the order to resubmit.';
    v_target := 'buyer_order';
  elsif new.status = 'failed' then
    v_recipient := v_order.buyer_id;
    v_event_name := 'payment.failed';
    v_title := 'Payment failed';
    v_message := 'Payment for order ' || v_order.order_number || ' could not be completed.';
    v_target := 'buyer_order';
  else
    return new;
  end if;

  v_occurrence := coalesce(new.updated_at, new.created_at)::text;

  perform public.emit_marketplace_notification(
    v_recipient,
    v_event_name,
    v_event_name || ':' || new.id::text || ':' || v_occurrence,
    'order',
    v_title,
    v_message,
    v_target,
    new.order_id,
    auth.uid()
  );

  return new;
end;
$$;

create or replace function public.notify_order_status_changed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seller_user uuid;
  v_recipient uuid;
  v_event_name text;
  v_title text;
  v_message text;
  v_target text;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  if new.status = 'preparing' then
    v_recipient := new.buyer_id;
    v_event_name := 'order.preparing';
    v_title := 'Order is being prepared';
    v_message := 'The seller is preparing order ' || new.order_number || '.';
    v_target := 'buyer_order';
  elsif new.status = 'shipped' then
    v_recipient := new.buyer_id;
    v_event_name := 'order.shipped';
    v_title := 'Order shipped';
    v_message := 'Order ' || new.order_number || ' is on the way.';
    v_target := 'buyer_order';
  elsif new.status = 'ready_for_pickup' then
    v_recipient := new.buyer_id;
    v_event_name := 'order.ready_for_pickup';
    v_title := 'Order ready for pickup';
    v_message := 'Order ' || new.order_number || ' is ready for pickup.';
    v_target := 'buyer_order';
  elsif new.status = 'completed' then
    select user_id into v_seller_user
    from public.seller_profiles
    where id is not distinct from new.seller_id;
    v_recipient := v_seller_user;
    v_event_name := 'order.completed';
    v_title := 'Order completed';
    v_message := 'The buyer confirmed receipt of order ' || new.order_number || '.';
    v_target := 'seller_order';
  else
    return new;
  end if;

  perform public.emit_marketplace_notification(
    v_recipient,
    v_event_name,
    v_event_name || ':' || new.id::text,
    'order',
    v_title,
    v_message,
    v_target,
    new.id,
    auth.uid()
  );

  return new;
end;
$$;

drop trigger if exists payments_notify_changed on public.payments;
create trigger payments_notify_changed
  after insert or update of status on public.payments
  for each row execute function public.notify_payment_changed();

drop trigger if exists orders_notify_status_changed on public.orders;
create trigger orders_notify_status_changed
  after update of status on public.orders
  for each row execute function public.notify_order_status_changed();

-- ----------------------------------------------------------------------------
-- 7. Review and report events
-- ----------------------------------------------------------------------------

create or replace function public.notify_review_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seller_user uuid;
begin
  select user_id into v_seller_user
  from public.seller_profiles
  where id is not distinct from new.seller_id;

  perform public.emit_marketplace_notification(
    v_seller_user,
    'review.received',
    'review.received:' || new.id::text,
    'review',
    'New review received',
    'A buyer reviewed an item from your store.',
    'seller_reviews',
    new.id,
    new.reviewer_id
  );

  return new;
end;
$$;

create or replace function public.notify_listing_report_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin uuid;
begin
  for v_admin in
    select id
    from public.profiles
    where role = 'admin'
      and account_status = 'active'
  loop
    perform public.emit_marketplace_notification(
      v_admin,
      'report.created',
      'report.created:' || new.id::text,
      'report',
      'Listing reported',
      'A listing report is ready for moderator review.',
      'listing_report',
      new.id,
      new.reporter_id
    );
  end loop;

  return new;
end;
$$;

create or replace function public.notify_listing_report_status_changed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_title text;
begin
  if new.status is not distinct from old.status or new.reporter_id is null then
    return new;
  end if;

  v_title := case new.status
    when 'under_review' then 'Report under review'
    when 'resolved' then 'Report resolved'
    when 'dismissed' then 'Report closed'
    else 'Report updated'
  end;

  perform public.emit_marketplace_notification(
    new.reporter_id,
    'report.' || new.status::text,
    'report.' || new.status::text || ':' || new.id::text,
    'report',
    v_title,
    'The status of your listing report changed.',
    'listing',
    new.listing_id,
    auth.uid()
  );

  return new;
end;
$$;

drop trigger if exists reviews_notify_created on public.reviews;
create trigger reviews_notify_created
  after insert on public.reviews
  for each row execute function public.notify_review_created();

drop trigger if exists listing_reports_notify_created on public.listing_reports;
create trigger listing_reports_notify_created
  after insert on public.listing_reports
  for each row execute function public.notify_listing_report_created();

drop trigger if exists listing_reports_notify_status_changed on public.listing_reports;
create trigger listing_reports_notify_status_changed
  after update of status on public.listing_reports
  for each row execute function public.notify_listing_report_status_changed();

-- ----------------------------------------------------------------------------
-- 8. Dispute, evidence, message, and refund events
-- ----------------------------------------------------------------------------

create or replace function public.notify_dispute_message_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dispute public.disputes%rowtype;
  v_seller_user uuid;
  v_recipient uuid;
  v_target text;
begin
  select * into v_dispute
  from public.disputes
  where id is not distinct from new.dispute_id;

  select user_id into v_seller_user
  from public.seller_profiles
  where id is not distinct from v_dispute.seller_id;

  for v_recipient in
    select recipient
    from (
      values (v_dispute.buyer_id), (v_seller_user)
    ) as recipients(recipient)
    where recipient is not null
      and recipient is distinct from new.sender_id
  loop
    v_target := case
      when v_recipient is not distinct from v_dispute.buyer_id then 'buyer_dispute'
      else 'seller_dispute'
    end;

    perform public.emit_marketplace_notification(
      v_recipient,
      'dispute.message',
      'dispute.message:' || new.id::text,
      'dispute',
      'New dispute message',
      'A participant replied to an active dispute.',
      v_target,
      new.dispute_id,
      new.sender_id
    );
  end loop;

  return new;
end;
$$;

create or replace function public.notify_dispute_evidence_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dispute public.disputes%rowtype;
  v_seller_user uuid;
  v_recipient uuid;
  v_target text;
begin
  select * into v_dispute
  from public.disputes
  where id is not distinct from new.dispute_id;

  select user_id into v_seller_user
  from public.seller_profiles
  where id is not distinct from v_dispute.seller_id;

  for v_recipient in
    select recipient
    from (
      values (v_dispute.buyer_id), (v_seller_user)
    ) as recipients(recipient)
    where recipient is not null
      and recipient is distinct from new.uploader_id
  loop
    v_target := case
      when v_recipient is not distinct from v_dispute.buyer_id then 'buyer_dispute'
      else 'seller_dispute'
    end;

    perform public.emit_marketplace_notification(
      v_recipient,
      'dispute.evidence',
      'dispute.evidence:' || new.id::text,
      'dispute',
      'New dispute evidence',
      'A participant added evidence to an active dispute.',
      v_target,
      new.dispute_id,
      new.uploader_id
    );
  end loop;

  return new;
end;
$$;

create or replace function public.notify_dispute_event_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dispute public.disputes%rowtype;
  v_seller_user uuid;
  v_recipient uuid;
  v_event_name text := 'dispute.' || new.event_type;
  v_title text;
  v_message text;
  v_target text;
begin
  select * into v_dispute
  from public.disputes
  where id is not distinct from new.dispute_id;

  select user_id into v_seller_user
  from public.seller_profiles
  where id is not distinct from v_dispute.seller_id;

  v_title := case new.event_type
    when 'opened' then 'New order dispute'
    when 'escalated' then 'Dispute escalated'
    when 'closed' then 'Dispute closed'
    when 'resolved' then 'Dispute resolved'
    when 'refund_requested' then 'Refund requested'
    when 'refund_approved' then 'Refund approved'
    when 'refund_rejected' then 'Refund rejected'
    when 'refund_completed' then 'Refund completed'
    else 'Dispute updated'
  end;

  v_message := case new.event_type
    when 'opened' then 'A buyer opened a dispute for an order.'
    when 'escalated' then 'A dispute was escalated for moderator review.'
    when 'closed' then 'An order dispute was closed.'
    when 'resolved' then 'A moderator resolved an order dispute.'
    when 'refund_requested' then 'The buyer requested a refund for a disputed order.'
    when 'refund_approved' then 'The seller approved your refund request.'
    when 'refund_rejected' then 'The seller rejected your refund request.'
    when 'refund_completed' then 'The seller recorded your refund as completed.'
    else 'An order dispute was updated.'
  end;

  for v_recipient in
    select distinct recipient
    from (
      select v_dispute.buyer_id as recipient
      where new.event_type in ('opened', 'escalated', 'closed', 'resolved')
      union all
      select v_seller_user
      where new.event_type in ('opened', 'escalated', 'closed', 'resolved', 'refund_requested')
      union all
      select v_dispute.buyer_id
      where new.event_type in ('refund_approved', 'refund_rejected', 'refund_completed')
      union all
      select p.id
      from public.profiles p
      where new.event_type = 'escalated'
        and p.role = 'admin'
        and p.account_status = 'active'
    ) recipients
    where recipient is not null
      and recipient is distinct from new.actor_id
  loop
    v_target := case
      when v_recipient is not distinct from v_dispute.buyer_id then 'buyer_dispute'
      when v_recipient is not distinct from v_seller_user then 'seller_dispute'
      else 'admin_dispute'
    end;

    perform public.emit_marketplace_notification(
      v_recipient,
      v_event_name,
      v_event_name || ':' || new.id::text,
      'dispute',
      v_title,
      v_message,
      v_target,
      new.dispute_id,
      new.actor_id
    );
  end loop;

  return new;
end;
$$;

drop trigger if exists dispute_messages_notify_created on public.dispute_messages;
create trigger dispute_messages_notify_created
  after insert on public.dispute_messages
  for each row execute function public.notify_dispute_message_created();

drop trigger if exists dispute_evidence_notify_created on public.dispute_evidence;
create trigger dispute_evidence_notify_created
  after insert on public.dispute_evidence
  for each row execute function public.notify_dispute_evidence_created();

drop trigger if exists dispute_events_notify_created on public.dispute_events;
create trigger dispute_events_notify_created
  after insert on public.dispute_events
  for each row execute function public.notify_dispute_event_created();

-- ----------------------------------------------------------------------------
-- 9. Seller-status event
-- ----------------------------------------------------------------------------

create or replace function public.notify_seller_status_changed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_title text;
  v_message text;
begin
  if new.seller_status is not distinct from old.seller_status then
    return new;
  end if;

  v_title := case new.seller_status
    when 'active' then 'Seller account approved'
    when 'suspended' then 'Seller account suspended'
    when 'rejected' then 'Seller application update'
    else 'Seller application pending'
  end;

  v_message := case new.seller_status
    when 'active' then 'Your seller account is active. You can now manage listings and orders.'
    when 'suspended' then 'Your seller account is suspended. Review your seller status for details.'
    when 'rejected' then 'Your seller application was not approved.'
    else 'Your seller application is pending review.'
  end;

  perform public.emit_marketplace_notification(
    new.user_id,
    'seller.status_changed',
    'seller.status_changed:' || new.id::text || ':' || new.updated_at::text,
    'system',
    v_title,
    v_message,
    'seller_status',
    new.id,
    auth.uid()
  );

  return new;
end;
$$;

drop trigger if exists seller_profiles_notify_status_changed on public.seller_profiles;
create trigger seller_profiles_notify_status_changed
  after update of seller_status on public.seller_profiles
  for each row execute function public.notify_seller_status_changed();

-- Trigger functions are invoked by PostgreSQL only, never by browser roles.
revoke execute on function public.notify_inquiry_created() from public, anon, authenticated;
revoke execute on function public.notify_inquiry_message_created() from public, anon, authenticated;
revoke execute on function public.notify_payment_changed() from public, anon, authenticated;
revoke execute on function public.notify_order_status_changed() from public, anon, authenticated;
revoke execute on function public.notify_review_created() from public, anon, authenticated;
revoke execute on function public.notify_listing_report_created() from public, anon, authenticated;
revoke execute on function public.notify_listing_report_status_changed() from public, anon, authenticated;
revoke execute on function public.notify_dispute_message_created() from public, anon, authenticated;
revoke execute on function public.notify_dispute_evidence_created() from public, anon, authenticated;
revoke execute on function public.notify_dispute_event_created() from public, anon, authenticated;
revoke execute on function public.notify_seller_status_changed() from public, anon, authenticated;

-- Enable RLS-aware live refresh when the hosted Realtime publication exists.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1
       from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'notifications'
     ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end;
$$;

commit;
