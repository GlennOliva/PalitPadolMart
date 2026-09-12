-- ============================================================================
-- Phase 11: Complaints, disputes, and full-order refunds
--
-- This migration hardens the Phase 1 moderation scaffold and adds an auditable
-- manual refund workflow. All sensitive writes are RPC-only. Disputes remain
-- attached to one seller-specific order and never mutate order status,
-- inventory, or notifications.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. Refund enums
-- ----------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'refund_status'
      and n.nspname = 'public'
  ) then
    create type public.refund_status as enum (
      'requested',
      'approved',
      'rejected',
      'completed'
    );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'refund_method'
      and n.nspname = 'public'
  ) then
    create type public.refund_method as enum (
      'original_method',
      'manual_transfer',
      'cash_return',
      'other'
    );
  end if;
end
$$;

-- ----------------------------------------------------------------------------
-- 2. Listing report hardening
-- ----------------------------------------------------------------------------

alter table public.listing_reports
  add column if not exists seller_id uuid,
  add column if not exists assigned_admin_id uuid,
  add column if not exists resolution text,
  add column if not exists resolved_at timestamptz;

update public.listing_reports lr
set seller_id = l.seller_id
from public.listings l
where l.id = lr.listing_id
  and lr.seller_id is null;

do $$
begin
  if exists (select 1 from public.listing_reports where seller_id is null) then
    raise exception 'PHASE11_BACKFILL_FAILED: a listing report has no listing seller';
  end if;
end
$$;

alter table public.listing_reports alter column seller_id set not null;

alter table public.listing_reports
  drop constraint if exists listing_reports_listing_id_fkey,
  drop constraint if exists listing_reports_seller_id_fkey,
  drop constraint if exists listing_reports_assigned_admin_id_fkey;

alter table public.listing_reports
  add constraint listing_reports_listing_id_fkey
    foreign key (listing_id) references public.listings(id) on delete restrict,
  add constraint listing_reports_seller_id_fkey
    foreign key (seller_id) references public.seller_profiles(id) on delete restrict,
  add constraint listing_reports_assigned_admin_id_fkey
    foreign key (assigned_admin_id) references auth.users(id) on delete set null;

alter table public.listing_reports
  drop constraint if exists listing_reports_reason_check,
  drop constraint if exists listing_reports_description_check,
  drop constraint if exists listing_reports_resolution_check,
  drop constraint if exists listing_reports_terminal_check;

-- Normalize any legacy duplicate active reports before enforcing the active
-- uniqueness boundary. Historical rows remain available as dismissed reports.
with ranked as (
  select id,
         row_number() over (
           partition by reporter_id, listing_id
           order by created_at, id
         ) as position
  from public.listing_reports
  where reporter_id is not null
    and status in ('pending', 'under_review')
)
update public.listing_reports lr
set status = 'dismissed',
    resolution = coalesce(
      nullif(btrim(lr.resolution), ''),
      'Closed during migration because another active report already exists.'
    ),
    resolved_at = coalesce(lr.resolved_at, now())
from ranked r
where r.id = lr.id
  and r.position > 1;

alter table public.listing_reports
  add constraint listing_reports_reason_check check (
    reason = btrim(reason)
    and reason in (
      'misleading_information',
      'counterfeit_or_suspicious',
      'prohibited_item',
      'scam_or_fraud',
      'abusive_content',
      'duplicate_listing',
      'wrong_category',
      'other'
    )
  ) not valid,
  add constraint listing_reports_description_check check (
    description is null
    or (description = btrim(description) and char_length(description) between 1 and 2000)
  ) not valid,
  add constraint listing_reports_resolution_check check (
    resolution is null
    or (resolution = btrim(resolution) and char_length(resolution) between 1 and 2000)
  ) not valid,
  add constraint listing_reports_terminal_check check (
    status not in ('resolved', 'dismissed')
    or (resolution is not null and resolved_at is not null)
  ) not valid;

create unique index if not exists listing_reports_active_reporter_listing_key
  on public.listing_reports (reporter_id, listing_id)
  where status in ('pending', 'under_review');

create index if not exists idx_listing_reports_seller_status
  on public.listing_reports (seller_id, status);

create index if not exists idx_listing_reports_assigned_admin
  on public.listing_reports (assigned_admin_id)
  where assigned_admin_id is not null;

-- ----------------------------------------------------------------------------
-- 3. Dispute and evidence hardening
-- ----------------------------------------------------------------------------

alter table public.disputes
  add column if not exists resolved_at timestamptz;

alter table public.disputes
  drop constraint if exists disputes_order_id_fkey,
  drop constraint if exists disputes_opened_by_fkey,
  drop constraint if exists disputes_buyer_id_fkey,
  drop constraint if exists disputes_seller_id_fkey,
  drop constraint if exists disputes_assigned_admin_id_fkey;

alter table public.disputes
  add constraint disputes_order_id_fkey
    foreign key (order_id) references public.orders(id) on delete restrict,
  add constraint disputes_opened_by_fkey
    foreign key (opened_by) references auth.users(id) on delete restrict,
  add constraint disputes_buyer_id_fkey
    foreign key (buyer_id) references auth.users(id) on delete restrict,
  add constraint disputes_seller_id_fkey
    foreign key (seller_id) references public.seller_profiles(id) on delete restrict,
  add constraint disputes_assigned_admin_id_fkey
    foreign key (assigned_admin_id) references auth.users(id) on delete set null;

alter table public.disputes
  drop constraint if exists disputes_reason_check,
  drop constraint if exists disputes_description_check,
  drop constraint if exists disputes_resolution_check,
  drop constraint if exists disputes_resolved_check;

-- Keep the oldest active dispute for each order and close any legacy duplicate.
with ranked as (
  select id,
         row_number() over (
           partition by order_id
           order by created_at, id
         ) as position
  from public.disputes
  where status in ('open', 'under_review')
)
update public.disputes d
set status = 'closed',
    resolution = coalesce(
      nullif(btrim(d.resolution), ''),
      'Closed during migration because another active dispute already exists.'
    ),
    resolved_at = coalesce(d.resolved_at, now())
from ranked r
where r.id = d.id
  and r.position > 1;

alter table public.disputes
  add constraint disputes_reason_check check (
    reason = btrim(reason)
    and reason in (
      'item_not_received',
      'item_not_as_described',
      'damaged_item',
      'wrong_item',
      'missing_item',
      'payment_issue',
      'seller_issue',
      'pickup_issue',
      'delivery_issue',
      'other'
    )
  ) not valid,
  add constraint disputes_description_check check (
    description is null
    or (description = btrim(description) and char_length(description) between 1 and 2000)
  ) not valid,
  add constraint disputes_resolution_check check (
    resolution is null
    or (resolution = btrim(resolution) and char_length(resolution) between 1 and 2000)
  ) not valid,
  add constraint disputes_resolved_check check (
    status is distinct from 'resolved'
    or (resolution is not null and resolved_at is not null)
  ) not valid;

create unique index if not exists disputes_active_order_key
  on public.disputes (order_id)
  where status in ('open', 'under_review');

create index if not exists idx_disputes_buyer_status
  on public.disputes (buyer_id, status);

create index if not exists idx_disputes_assigned_admin
  on public.disputes (assigned_admin_id)
  where assigned_admin_id is not null;

alter table public.dispute_messages
  drop constraint if exists dispute_messages_dispute_id_fkey,
  drop constraint if exists dispute_messages_sender_id_fkey,
  drop constraint if exists dispute_messages_message_check;

alter table public.dispute_messages
  add constraint dispute_messages_dispute_id_fkey
    foreign key (dispute_id) references public.disputes(id) on delete restrict,
  add constraint dispute_messages_sender_id_fkey
    foreign key (sender_id) references auth.users(id) on delete restrict,
  add constraint dispute_messages_message_check check (
    message = btrim(message)
    and char_length(message) between 1 and 5000
  ) not valid;

alter table public.dispute_evidence
  add column if not exists original_filename text,
  add column if not exists mime_type text,
  add column if not exists size_bytes bigint;

alter table public.dispute_evidence
  drop constraint if exists dispute_evidence_dispute_id_fkey,
  drop constraint if exists dispute_evidence_uploader_id_fkey,
  drop constraint if exists dispute_evidence_storage_path_check,
  drop constraint if exists dispute_evidence_original_filename_check,
  drop constraint if exists dispute_evidence_mime_type_check,
  drop constraint if exists dispute_evidence_size_bytes_check,
  drop constraint if exists dispute_evidence_metadata_complete_check;

alter table public.dispute_evidence
  add constraint dispute_evidence_dispute_id_fkey
    foreign key (dispute_id) references public.disputes(id) on delete restrict,
  add constraint dispute_evidence_uploader_id_fkey
    foreign key (uploader_id) references auth.users(id) on delete restrict,
  add constraint dispute_evidence_storage_path_check check (
    storage_path is null
    or (
      storage_path = btrim(storage_path)
      and char_length(storage_path) between 1 and 1024
    )
  ) not valid,
  add constraint dispute_evidence_original_filename_check check (
    original_filename is null
    or (
      original_filename = btrim(original_filename)
      and char_length(original_filename) between 1 and 255
      and original_filename !~ '[/\\]'
    )
  ) not valid,
  add constraint dispute_evidence_mime_type_check check (
    mime_type is null
    or mime_type in (
      'image/jpeg',
      'image/png',
      'image/webp',
      'application/pdf'
    )
  ) not valid,
  add constraint dispute_evidence_size_bytes_check check (
    size_bytes is null or size_bytes between 1 and 5242880
  ) not valid,
  add constraint dispute_evidence_metadata_complete_check check (
    (storage_path is null and original_filename is null and mime_type is null and size_bytes is null)
    or
    (storage_path is not null and original_filename is not null and mime_type is not null and size_bytes is not null)
  ) not valid;

-- Legacy scaffold rows may have reused a path. Keep the first registration and
-- retain later rows as URL-only legacy history before enforcing path uniqueness.
with ranked as (
  select id,
         row_number() over (
           partition by storage_path
           order by created_at, id
         ) as position
  from public.dispute_evidence
  where storage_path is not null
)
update public.dispute_evidence de
set storage_path = null,
    original_filename = null,
    mime_type = null,
    size_bytes = null
from ranked r
where r.id = de.id
  and r.position > 1;

create unique index if not exists dispute_evidence_storage_path_key
  on public.dispute_evidence (storage_path)
  where storage_path is not null;

-- ----------------------------------------------------------------------------
-- 4. Refunds and immutable history
-- ----------------------------------------------------------------------------

-- These unique indexes allow composite foreign keys to enforce that the
-- trusted participant and payment identifiers belong to the same order.
create unique index if not exists orders_refund_identity_key
  on public.orders (id, buyer_id, seller_id);

create unique index if not exists payments_refund_identity_key
  on public.payments (id, order_id);

create table public.refunds (
  id uuid primary key default gen_random_uuid(),
  dispute_id uuid not null,
  order_id uuid not null,
  payment_id uuid not null,
  buyer_id uuid not null references auth.users(id) on delete restrict,
  seller_id uuid not null references public.seller_profiles(id) on delete restrict,
  amount numeric(12,2) not null check (amount > 0),
  status public.refund_status not null default 'requested',
  reason text not null check (
    reason = btrim(reason) and char_length(reason) between 1 and 2000
  ),
  review_reason text check (
    review_reason is null
    or (review_reason = btrim(review_reason) and char_length(review_reason) between 1 and 2000)
  ),
  method public.refund_method,
  reference text check (
    reference is null
    or (reference = btrim(reference) and char_length(reference) between 1 and 120)
  ),
  notes text check (
    notes is null
    or (notes = btrim(notes) and char_length(notes) between 1 and 2000)
  ),
  requested_at timestamptz not null default now(),
  reviewed_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint refunds_dispute_id_key unique (dispute_id),
  constraint refunds_order_id_key unique (order_id),
  constraint refunds_payment_id_key unique (payment_id),
  constraint refunds_dispute_id_fkey
    foreign key (dispute_id) references public.disputes(id) on delete restrict,
  constraint refunds_order_participants_fkey
    foreign key (order_id, buyer_id, seller_id)
    references public.orders(id, buyer_id, seller_id) on delete restrict,
  constraint refunds_payment_order_fkey
    foreign key (payment_id, order_id)
    references public.payments(id, order_id) on delete restrict,
  constraint refunds_lifecycle_check check (
    (status = 'requested' and reviewed_at is null and completed_at is null and method is null)
    or (status = 'approved' and reviewed_at is not null and completed_at is null and method is null)
    or (
      status = 'rejected'
      and reviewed_at is not null
      and completed_at is null
      and method is null
      and review_reason is not null
    )
    or (
      status = 'completed'
      and reviewed_at is not null
      and completed_at is not null
      and method is not null
    )
  )
);

create table public.refund_events (
  id uuid primary key default gen_random_uuid(),
  refund_id uuid not null references public.refunds(id) on delete restrict,
  actor_id uuid not null references auth.users(id) on delete restrict,
  event_type text not null check (
    event_type in ('requested', 'approved', 'rejected', 'completed')
  ),
  from_status public.refund_status,
  to_status public.refund_status not null,
  details jsonb,
  created_at timestamptz not null default now()
);

create table public.dispute_events (
  id uuid primary key default gen_random_uuid(),
  dispute_id uuid not null references public.disputes(id) on delete restrict,
  actor_id uuid not null references auth.users(id) on delete restrict,
  event_type text not null check (
    event_type in (
      'opened',
      'escalated',
      'closed',
      'resolved',
      'refund_requested',
      'refund_approved',
      'refund_rejected',
      'refund_completed'
    )
  ),
  from_status public.dispute_status,
  to_status public.dispute_status not null,
  details jsonb,
  created_at timestamptz not null default now()
);

create index idx_refunds_buyer_created
  on public.refunds (buyer_id, created_at desc);

create index idx_refunds_seller_status
  on public.refunds (seller_id, status);

create index idx_refund_events_refund_created
  on public.refund_events (refund_id, created_at, id);

create index idx_dispute_events_dispute_created
  on public.dispute_events (dispute_id, created_at, id);

drop trigger if exists refunds_set_updated_at on public.refunds;
create trigger refunds_set_updated_at
  before update on public.refunds
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 5. RLS-safe authorization helpers
-- ----------------------------------------------------------------------------

create or replace function public.is_dispute_participant(p_dispute_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
    and exists (
      select 1
      from public.disputes d
      left join public.seller_profiles sp on sp.id = d.seller_id
      where d.id is not distinct from p_dispute_id
        and (
          d.buyer_id is not distinct from auth.uid()
          or sp.user_id is not distinct from auth.uid()
        )
    );
$$;

create or replace function public.can_upload_dispute_evidence(p_dispute_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
    and exists (
      select 1
      from public.profiles p
      where p.id is not distinct from auth.uid()
        and p.account_status = 'active'
    )
    and exists (
      select 1
      from public.disputes d
      left join public.seller_profiles sp on sp.id = d.seller_id
      where d.id is not distinct from p_dispute_id
        and d.status in ('open', 'under_review')
        and (
          d.buyer_id is not distinct from auth.uid()
          or sp.user_id is not distinct from auth.uid()
        )
    );
$$;

revoke execute on function public.is_dispute_participant(uuid) from public, anon;
revoke execute on function public.can_upload_dispute_evidence(uuid) from public, anon;
grant execute on function public.is_dispute_participant(uuid) to authenticated;
grant execute on function public.can_upload_dispute_evidence(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 6. Row level security and explicit table privileges
-- ----------------------------------------------------------------------------

alter table public.refunds enable row level security;
alter table public.refund_events enable row level security;
alter table public.dispute_events enable row level security;

-- Remove every legacy client-write policy. Security definer RPCs below are the
-- only write boundary for reports, disputes, messages, evidence, and refunds.
drop policy if exists "listing_reports_insert_reporter" on public.listing_reports;
drop policy if exists "listing_reports_update_admin" on public.listing_reports;
drop policy if exists "listing_reports_delete_admin" on public.listing_reports;

drop policy if exists "disputes_insert_participant" on public.disputes;
drop policy if exists "disputes_update_participant_or_admin" on public.disputes;
drop policy if exists "disputes_delete_admin" on public.disputes;

drop policy if exists "dispute_messages_insert_participant" on public.dispute_messages;
drop policy if exists "dispute_messages_delete_admin" on public.dispute_messages;

drop policy if exists "dispute_evidence_insert_participant" on public.dispute_evidence;
drop policy if exists "dispute_evidence_delete_admin" on public.dispute_evidence;

-- Recreate read policies with no public or listing-seller access to reports.
drop policy if exists "listing_reports_select_own_or_admin" on public.listing_reports;
create policy "listing_reports_select_own_or_admin"
  on public.listing_reports
  for select
  to authenticated
  using (
    reporter_id is not distinct from auth.uid()
    or public.is_admin()
  );

drop policy if exists "disputes_select_participant_or_admin" on public.disputes;
create policy "disputes_select_participant_or_admin"
  on public.disputes
  for select
  to authenticated
  using (
    public.is_dispute_participant(id)
    or assigned_admin_id is not distinct from auth.uid()
    or public.is_admin()
  );

drop policy if exists "dispute_messages_select_participant_or_admin" on public.dispute_messages;
create policy "dispute_messages_select_participant_or_admin"
  on public.dispute_messages
  for select
  to authenticated
  using (
    public.is_dispute_participant(dispute_id)
    or exists (
      select 1
      from public.disputes d
      where d.id is not distinct from dispute_messages.dispute_id
        and d.assigned_admin_id is not distinct from auth.uid()
    )
    or public.is_admin()
  );

drop policy if exists "dispute_evidence_select_participant_or_admin" on public.dispute_evidence;
create policy "dispute_evidence_select_participant_or_admin"
  on public.dispute_evidence
  for select
  to authenticated
  using (
    public.is_dispute_participant(dispute_id)
    or exists (
      select 1
      from public.disputes d
      where d.id is not distinct from dispute_evidence.dispute_id
        and d.assigned_admin_id is not distinct from auth.uid()
    )
    or public.is_admin()
  );

drop policy if exists "refunds_select_participant_or_admin" on public.refunds;
create policy "refunds_select_participant_or_admin"
  on public.refunds
  for select
  to authenticated
  using (
    buyer_id is not distinct from auth.uid()
    or seller_id is not distinct from public.auth_seller_id()
    or exists (
      select 1
      from public.disputes d
      where d.id is not distinct from refunds.dispute_id
        and d.assigned_admin_id is not distinct from auth.uid()
    )
    or public.is_admin()
  );

drop policy if exists "refund_events_select_participant_or_admin" on public.refund_events;
create policy "refund_events_select_participant_or_admin"
  on public.refund_events
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.refunds r
      where r.id is not distinct from refund_events.refund_id
        and (
          r.buyer_id is not distinct from auth.uid()
          or r.seller_id is not distinct from public.auth_seller_id()
          or exists (
            select 1
            from public.disputes d
            where d.id is not distinct from r.dispute_id
              and d.assigned_admin_id is not distinct from auth.uid()
          )
          or public.is_admin()
        )
    )
  );

drop policy if exists "dispute_events_select_participant_or_admin" on public.dispute_events;
create policy "dispute_events_select_participant_or_admin"
  on public.dispute_events
  for select
  to authenticated
  using (
    public.is_dispute_participant(dispute_id)
    or exists (
      select 1
      from public.disputes d
      where d.id is not distinct from dispute_events.dispute_id
        and d.assigned_admin_id is not distinct from auth.uid()
    )
    or public.is_admin()
  );

revoke all on table public.listing_reports from public, anon, authenticated;
revoke all on table public.disputes from public, anon, authenticated;
revoke all on table public.dispute_messages from public, anon, authenticated;
revoke all on table public.dispute_evidence from public, anon, authenticated;
revoke all on table public.refunds from public, anon, authenticated;
revoke all on table public.refund_events from public, anon, authenticated;
revoke all on table public.dispute_events from public, anon, authenticated;

grant select on table public.listing_reports to authenticated;
grant select on table public.disputes to authenticated;
grant select on table public.dispute_messages to authenticated;
grant select on table public.dispute_evidence to authenticated;
grant select on table public.refunds to authenticated;
grant select on table public.refund_events to authenticated;
grant select on table public.dispute_events to authenticated;

-- ----------------------------------------------------------------------------
-- 7. Private dispute evidence storage
-- ----------------------------------------------------------------------------

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'dispute-evidence',
  'dispute-evidence',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']::text[]
)
on conflict (id) do update
set name = excluded.name,
    public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "dispute_evidence_select_participant" on storage.objects;
drop policy if exists "dispute_evidence_insert_participant" on storage.objects;
drop policy if exists "dispute_evidence_update_participant" on storage.objects;
drop policy if exists "dispute_evidence_delete_participant" on storage.objects;
drop policy if exists "dispute_evidence_select_participant_or_admin" on storage.objects;
drop policy if exists "dispute_evidence_insert_open_participant" on storage.objects;
drop policy if exists "dispute_evidence_delete_own_orphan" on storage.objects;

-- Exact path: {auth.uid()}/{dispute_id}/{generated_uuid}.{allowed_extension}.
-- CASE guards every UUID cast so malformed object paths return false.
create policy "dispute_evidence_select_participant_or_admin"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'dispute-evidence'
    and cardinality(storage.foldername(name)) = 2
    and split_part(name, '/', 3) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|webp|pdf)$'
    and (
      case
        when (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then public.is_dispute_participant((storage.foldername(name))[2]::uuid)
        else false
      end
      or case
        when (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then exists (
          select 1
          from public.disputes d
          where d.id is not distinct from (storage.foldername(name))[2]::uuid
            and d.assigned_admin_id is not distinct from auth.uid()
        )
        else false
      end
      or public.is_admin()
    )
  );

create policy "dispute_evidence_insert_open_participant"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'dispute-evidence'
    and cardinality(storage.foldername(name)) = 2
    and (storage.foldername(name))[1] is not distinct from auth.uid()::text
    and split_part(name, '/', 3) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|webp|pdf)$'
    and case
      when (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then public.can_upload_dispute_evidence((storage.foldername(name))[2]::uuid)
      else false
    end
  );

-- Registered evidence is immutable. A participant may only remove their own
-- unregistered upload while the dispute remains open or under review.
create policy "dispute_evidence_delete_own_orphan"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'dispute-evidence'
    and cardinality(storage.foldername(name)) = 2
    and (storage.foldername(name))[1] is not distinct from auth.uid()::text
    and split_part(name, '/', 3) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|webp|pdf)$'
    and case
      when (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then public.can_upload_dispute_evidence((storage.foldername(name))[2]::uuid)
      else false
    end
    and not exists (
      select 1
      from public.dispute_evidence de
      where de.storage_path is not distinct from name
    )
  );

-- No UPDATE storage policy is created. Uploaded objects cannot be overwritten.

-- ----------------------------------------------------------------------------
-- 8. RPC-only writes
-- ----------------------------------------------------------------------------

create or replace function public.submit_listing_report(
  p_listing_id uuid,
  p_reason text,
  p_description text default null
)
returns public.listing_reports
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_reason text := lower(btrim(coalesce(p_reason, '')));
  v_description text := nullif(btrim(coalesce(p_description, '')), '');
  v_listing public.listings%rowtype;
  v_report public.listing_reports%rowtype;
begin
  if v_actor is null then
    raise exception 'AUTH_REQUIRED: sign in to report a listing';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id is not distinct from v_actor
      and p.account_status = 'active'
  ) then
    raise exception 'ACCOUNT_UNAVAILABLE: your account must be active to report a listing';
  end if;

  if v_reason not in (
    'misleading_information',
    'counterfeit_or_suspicious',
    'prohibited_item',
    'scam_or_fraud',
    'abusive_content',
    'duplicate_listing',
    'wrong_category',
    'other'
  ) then
    raise exception 'INVALID_REPORT_REASON: choose a supported report reason';
  end if;

  if v_description is not null and char_length(v_description) > 2000 then
    raise exception 'INVALID_DESCRIPTION: description must be 2000 characters or fewer';
  end if;

  -- The listing lock serializes duplicate checks for this report target.
  select * into v_listing
  from public.listings
  where id is not distinct from p_listing_id
  for update;

  if not found then
    raise exception 'LISTING_NOT_FOUND: listing does not exist';
  end if;

  if v_listing.listing_status is distinct from 'active' then
    raise exception 'LISTING_UNAVAILABLE: only active listings can be reported';
  end if;

  if v_listing.seller_id is not distinct from public.auth_seller_id() then
    raise exception 'SELF_REPORT_NOT_ALLOWED: you cannot report your own listing';
  end if;

  if exists (
    select 1
    from public.listing_reports lr
    where lr.reporter_id is not distinct from v_actor
      and lr.listing_id is not distinct from v_listing.id
      and lr.status in ('pending', 'under_review')
  ) then
    raise exception 'LISTING_REPORT_ALREADY_EXISTS: you already have an active report for this listing';
  end if;

  insert into public.listing_reports (
    listing_id,
    reporter_id,
    seller_id,
    reason,
    description,
    status
  )
  values (
    v_listing.id,
    v_actor,
    v_listing.seller_id,
    v_reason,
    v_description,
    'pending'
  )
  returning * into v_report;

  return v_report;
exception
  when unique_violation then
    raise exception 'LISTING_REPORT_ALREADY_EXISTS: you already have an active report for this listing';
end;
$$;

create or replace function public.open_order_dispute(
  p_order_id uuid,
  p_reason text,
  p_description text default null
)
returns public.disputes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_reason text := lower(btrim(coalesce(p_reason, '')));
  v_description text := nullif(btrim(coalesce(p_description, '')), '');
  v_order public.orders%rowtype;
  v_dispute public.disputes%rowtype;
begin
  if v_actor is null then
    raise exception 'AUTH_REQUIRED: sign in to open a dispute';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id is not distinct from v_actor
      and p.account_status = 'active'
  ) then
    raise exception 'ACCOUNT_UNAVAILABLE: your account must be active to open a dispute';
  end if;

  if v_reason not in (
    'item_not_received',
    'item_not_as_described',
    'damaged_item',
    'wrong_item',
    'missing_item',
    'payment_issue',
    'seller_issue',
    'pickup_issue',
    'delivery_issue',
    'other'
  ) then
    raise exception 'INVALID_DISPUTE_REASON: choose a supported dispute reason';
  end if;

  if v_description is null then
    raise exception 'DESCRIPTION_REQUIRED: provide a dispute description';
  end if;

  if char_length(v_description) > 2000 then
    raise exception 'INVALID_DESCRIPTION: description must be 2000 characters or fewer';
  end if;

  -- One seller-specific order is the complete dispute boundary. Locking it
  -- serializes concurrent attempts without touching order status.
  select * into v_order
  from public.orders
  where id is not distinct from p_order_id
  for update;

  if not found then
    raise exception 'ORDER_NOT_FOUND: order does not exist';
  end if;

  if v_order.buyer_id is distinct from v_actor then
    raise exception 'FORBIDDEN: only the buyer can dispute this order';
  end if;

  if v_order.status not in (
    'confirmed',
    'paid',
    'preparing',
    'shipped',
    'ready_for_pickup',
    'completed'
  ) then
    raise exception 'ORDER_NOT_DISPUTABLE: this order status is not eligible for a dispute';
  end if;

  if exists (
    select 1
    from public.disputes d
    where d.order_id is not distinct from v_order.id
      and d.status in ('open', 'under_review')
  ) then
    raise exception 'ACTIVE_DISPUTE_EXISTS: this order already has an active dispute';
  end if;

  insert into public.disputes (
    order_id,
    opened_by,
    buyer_id,
    seller_id,
    reason,
    description,
    status
  )
  values (
    v_order.id,
    v_actor,
    v_order.buyer_id,
    v_order.seller_id,
    v_reason,
    v_description,
    'open'
  )
  returning * into v_dispute;

  insert into public.dispute_events (
    dispute_id, actor_id, event_type, from_status, to_status, details
  )
  values (
    v_dispute.id,
    v_actor,
    'opened',
    null,
    'open',
    jsonb_build_object('reason', v_reason)
  );

  return v_dispute;
exception
  when unique_violation then
    raise exception 'ACTIVE_DISPUTE_EXISTS: this order already has an active dispute';
end;
$$;

create or replace function public.send_dispute_message(
  p_dispute_id uuid,
  p_message text
)
returns public.dispute_messages
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_message text := nullif(btrim(coalesce(p_message, '')), '');
  v_dispute public.disputes%rowtype;
  v_result public.dispute_messages%rowtype;
begin
  if v_actor is null then
    raise exception 'AUTH_REQUIRED: sign in to send a dispute message';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id is not distinct from v_actor
      and p.account_status = 'active'
  ) then
    raise exception 'ACCOUNT_UNAVAILABLE: your account must be active to send a message';
  end if;

  if v_message is null or char_length(v_message) > 5000 then
    raise exception 'INVALID_MESSAGE: message must contain 1 to 5000 characters';
  end if;

  select * into v_dispute
  from public.disputes
  where id is not distinct from p_dispute_id
  for update;

  if not found then
    raise exception 'DISPUTE_NOT_FOUND: dispute does not exist';
  end if;

  if not public.is_dispute_participant(v_dispute.id) then
    raise exception 'FORBIDDEN: only dispute participants can send messages';
  end if;

  if v_dispute.status not in ('open', 'under_review') then
    raise exception 'DISPUTE_NOT_OPEN: messages are only allowed on active disputes';
  end if;

  insert into public.dispute_messages (dispute_id, sender_id, message)
  values (v_dispute.id, v_actor, v_message)
  returning * into v_result;

  return v_result;
end;
$$;

create or replace function public.register_dispute_evidence(
  p_dispute_id uuid,
  p_storage_path text,
  p_original_filename text,
  p_mime_type text,
  p_size_bytes bigint
)
returns public.dispute_evidence
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_path text := btrim(coalesce(p_storage_path, ''));
  v_filename text := btrim(coalesce(p_original_filename, ''));
  v_mime text := lower(btrim(coalesce(p_mime_type, '')));
  v_dispute public.disputes%rowtype;
  v_evidence public.dispute_evidence%rowtype;
begin
  if v_actor is null then
    raise exception 'AUTH_REQUIRED: sign in to register dispute evidence';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id is not distinct from v_actor
      and p.account_status = 'active'
  ) then
    raise exception 'ACCOUNT_UNAVAILABLE: your account must be active to register evidence';
  end if;

  select * into v_dispute
  from public.disputes
  where id is not distinct from p_dispute_id
  for update;

  if not found then
    raise exception 'DISPUTE_NOT_FOUND: dispute does not exist';
  end if;

  if not public.is_dispute_participant(v_dispute.id) then
    raise exception 'FORBIDDEN: only dispute participants can register evidence';
  end if;

  if v_dispute.status not in ('open', 'under_review') then
    raise exception 'DISPUTE_NOT_OPEN: evidence is only allowed on active disputes';
  end if;

  if cardinality(string_to_array(v_path, '/')) is distinct from 3
     or split_part(v_path, '/', 1) is distinct from v_actor::text
     or split_part(v_path, '/', 2) is distinct from v_dispute.id::text
     or split_part(v_path, '/', 3) !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|webp|pdf)$'
     or char_length(v_path) > 1024 then
    raise exception 'INVALID_EVIDENCE_PATH: evidence path must use your dispute folder and a generated filename';
  end if;

  if v_filename = ''
     or char_length(v_filename) > 255
     or v_filename ~ '[/\\]' then
    raise exception 'INVALID_EVIDENCE_FILENAME: filename must contain 1 to 255 safe characters';
  end if;

  if v_mime not in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf') then
    raise exception 'INVALID_EVIDENCE_TYPE: evidence must be JPEG, PNG, WebP, or PDF';
  end if;

  if p_size_bytes is null or p_size_bytes <= 0 or p_size_bytes > 5242880 then
    raise exception 'INVALID_EVIDENCE_SIZE: evidence must be larger than 0 bytes and no more than 5 MB';
  end if;

  -- Lock the object through transaction end. This prevents a concurrent
  -- orphan delete from racing registration after the existence check.
  perform 1
  from storage.objects so
  where so.bucket_id = 'dispute-evidence'
    and so.name is not distinct from v_path
  for key share;

  if not found then
    raise exception 'EVIDENCE_OBJECT_NOT_FOUND: upload the evidence object before registering it';
  end if;

  insert into public.dispute_evidence (
    dispute_id,
    uploader_id,
    storage_path,
    original_filename,
    mime_type,
    size_bytes
  )
  values (
    v_dispute.id,
    v_actor,
    v_path,
    v_filename,
    v_mime,
    p_size_bytes
  )
  returning * into v_evidence;

  return v_evidence;
exception
  when unique_violation then
    raise exception 'EVIDENCE_ALREADY_REGISTERED: this evidence object is already registered';
end;
$$;

create or replace function public.request_refund(
  p_dispute_id uuid,
  p_requested_amount numeric,
  p_reason text
)
returns public.refunds
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_dispute public.disputes%rowtype;
  v_order public.orders%rowtype;
  v_payment public.payments%rowtype;
  v_refund public.refunds%rowtype;
begin
  if v_actor is null then
    raise exception 'AUTH_REQUIRED: sign in to request a refund';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id is not distinct from v_actor
      and p.account_status = 'active'
  ) then
    raise exception 'ACCOUNT_UNAVAILABLE: your account must be active to request a refund';
  end if;

  if p_requested_amount is null or p_requested_amount <= 0 then
    raise exception 'INVALID_REFUND_AMOUNT: refund amount must be greater than zero';
  end if;

  if v_reason is null or char_length(v_reason) > 2000 then
    raise exception 'INVALID_REFUND_REASON: reason must contain 1 to 2000 characters';
  end if;

  select * into v_dispute
  from public.disputes
  where id is not distinct from p_dispute_id
  for update;

  if not found then
    raise exception 'DISPUTE_NOT_FOUND: dispute does not exist';
  end if;

  if v_dispute.buyer_id is distinct from v_actor then
    raise exception 'FORBIDDEN: only the buyer can request this refund';
  end if;

  if v_dispute.status not in ('open', 'under_review') then
    raise exception 'DISPUTE_NOT_OPEN: refunds require an active dispute';
  end if;

  select * into v_order
  from public.orders
  where id is not distinct from v_dispute.order_id
  for update;

  if not found
     or v_order.buyer_id is distinct from v_dispute.buyer_id
     or v_order.seller_id is distinct from v_dispute.seller_id then
    raise exception 'ORDER_NOT_FOUND: dispute order relationship is invalid';
  end if;

  select * into v_payment
  from public.payments
  where order_id is not distinct from v_order.id
  for update;

  if not found or v_payment.status is distinct from 'paid' then
    raise exception 'PAYMENT_NOT_PAID: only a paid order can be refunded';
  end if;

  if p_requested_amount > v_payment.amount then
    raise exception 'REFUND_EXCEEDS_AVAILABLE: requested amount exceeds the paid amount';
  end if;

  if p_requested_amount < v_payment.amount then
    raise exception 'REFUND_NOT_ALLOWED: only a full-order refund is supported';
  end if;

  if exists (
    select 1
    from public.refunds r
    where r.dispute_id is not distinct from v_dispute.id
       or r.order_id is not distinct from v_order.id
  ) then
    raise exception 'REFUND_ALREADY_EXISTS: this order already has a refund';
  end if;

  insert into public.refunds (
    dispute_id,
    order_id,
    payment_id,
    buyer_id,
    seller_id,
    amount,
    status,
    reason
  )
  values (
    v_dispute.id,
    v_order.id,
    v_payment.id,
    v_order.buyer_id,
    v_order.seller_id,
    v_payment.amount,
    'requested',
    v_reason
  )
  returning * into v_refund;

  insert into public.refund_events (
    refund_id, actor_id, event_type, from_status, to_status, details
  )
  values (
    v_refund.id,
    v_actor,
    'requested',
    null,
    'requested',
    jsonb_build_object('amount', v_refund.amount)
  );

  insert into public.dispute_events (
    dispute_id, actor_id, event_type, from_status, to_status, details
  )
  values (
    v_dispute.id,
    v_actor,
    'refund_requested',
    v_dispute.status,
    v_dispute.status,
    jsonb_build_object('refund_id', v_refund.id)
  );

  return v_refund;
exception
  when unique_violation then
    raise exception 'REFUND_ALREADY_EXISTS: this order already has a refund';
end;
$$;

create or replace function public.review_refund(
  p_refund_id uuid,
  p_decision text,
  p_reason text default null
)
returns public.refunds
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_seller uuid := public.auth_seller_id();
  v_decision text := lower(btrim(coalesce(p_decision, '')));
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_refund public.refunds%rowtype;
  v_dispute public.disputes%rowtype;
  v_new_status public.refund_status;
begin
  if v_actor is null then
    raise exception 'AUTH_REQUIRED: sign in to review a refund';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id is not distinct from v_actor
      and p.account_status = 'active'
  ) then
    raise exception 'ACCOUNT_UNAVAILABLE: your account must be active to review a refund';
  end if;

  select * into v_refund
  from public.refunds
  where id is not distinct from p_refund_id
  for update;

  if not found then
    raise exception 'REFUND_NOT_FOUND: refund does not exist';
  end if;

  if v_seller is null or v_refund.seller_id is distinct from v_seller then
    raise exception 'FORBIDDEN: only the owning seller can review this refund';
  end if;

  if v_refund.status is distinct from 'requested' then
    raise exception 'REFUND_NOT_REVIEWABLE: only requested refunds can be reviewed';
  end if;

  if v_reason is not null and char_length(v_reason) > 2000 then
    raise exception 'INVALID_REVIEW_REASON: review reason must be 2000 characters or fewer';
  end if;

  if v_decision = 'approve' then
    v_new_status := 'approved';
  elsif v_decision = 'reject' then
    if v_reason is null then
      raise exception 'REJECTION_REASON_REQUIRED: provide a reason for rejecting the refund';
    end if;
    v_new_status := 'rejected';
  else
    raise exception 'INVALID_DECISION: decision must be approve or reject';
  end if;

  update public.refunds
  set status = v_new_status,
      review_reason = v_reason,
      reviewed_at = now()
  where id is not distinct from v_refund.id
  returning * into v_refund;

  select * into v_dispute
  from public.disputes
  where id is not distinct from v_refund.dispute_id;

  insert into public.refund_events (
    refund_id, actor_id, event_type, from_status, to_status, details
  )
  values (
    v_refund.id,
    v_actor,
    case v_decision when 'approve' then 'approved' else 'rejected' end,
    'requested',
    v_new_status,
    case when v_reason is null then null else jsonb_build_object('reason', v_reason) end
  );

  insert into public.dispute_events (
    dispute_id, actor_id, event_type, from_status, to_status, details
  )
  values (
    v_refund.dispute_id,
    v_actor,
    case v_decision when 'approve' then 'refund_approved' else 'refund_rejected' end,
    v_dispute.status,
    v_dispute.status,
    jsonb_build_object('refund_id', v_refund.id)
  );

  return v_refund;
end;
$$;

create or replace function public.complete_refund(
  p_refund_id uuid,
  p_method public.refund_method,
  p_reference text default null,
  p_notes text default null
)
returns public.refunds
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_seller uuid := public.auth_seller_id();
  v_reference text := nullif(btrim(coalesce(p_reference, '')), '');
  v_notes text := nullif(btrim(coalesce(p_notes, '')), '');
  v_refund public.refunds%rowtype;
  v_payment public.payments%rowtype;
  v_dispute public.disputes%rowtype;
  v_previous_dispute_status public.dispute_status;
begin
  if v_actor is null then
    raise exception 'AUTH_REQUIRED: sign in to complete a refund';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id is not distinct from v_actor
      and p.account_status = 'active'
  ) then
    raise exception 'ACCOUNT_UNAVAILABLE: your account must be active to complete a refund';
  end if;

  if p_method is null then
    raise exception 'INVALID_REFUND_METHOD: choose how the refund was returned';
  end if;

  if v_reference is not null and char_length(v_reference) > 120 then
    raise exception 'INVALID_REFERENCE: reference must be 120 characters or fewer';
  end if;

  if v_notes is not null and char_length(v_notes) > 2000 then
    raise exception 'INVALID_NOTES: notes must be 2000 characters or fewer';
  end if;

  select * into v_refund
  from public.refunds
  where id is not distinct from p_refund_id
  for update;

  if not found then
    raise exception 'REFUND_NOT_FOUND: refund does not exist';
  end if;

  if v_seller is null or v_refund.seller_id is distinct from v_seller then
    raise exception 'FORBIDDEN: only the owning seller can complete this refund';
  end if;

  if v_refund.status is distinct from 'approved' then
    raise exception 'REFUND_NOT_APPROVED: only approved refunds can be completed';
  end if;

  select * into v_payment
  from public.payments
  where id is not distinct from v_refund.payment_id
    and order_id is not distinct from v_refund.order_id
  for update;

  if not found or v_payment.status is distinct from 'paid' then
    raise exception 'PAYMENT_NOT_PAID: the payment is no longer refundable';
  end if;

  select * into v_dispute
  from public.disputes
  where id is not distinct from v_refund.dispute_id
  for update;

  if not found then
    raise exception 'DISPUTE_NOT_FOUND: refund dispute does not exist';
  end if;

  v_previous_dispute_status := v_dispute.status;

  update public.refunds
  set status = 'completed',
      method = p_method,
      reference = v_reference,
      notes = v_notes,
      completed_at = now()
  where id is not distinct from v_refund.id
  returning * into v_refund;

  update public.payments
  set status = 'refunded',
      updated_at = now()
  where id is not distinct from v_payment.id;

  update public.disputes
  set status = 'resolved',
      resolution = 'Refund completed manually by the seller.',
      resolved_at = now()
  where id is not distinct from v_dispute.id
  returning * into v_dispute;

  insert into public.refund_events (
    refund_id, actor_id, event_type, from_status, to_status, details
  )
  values (
    v_refund.id,
    v_actor,
    'completed',
    'approved',
    'completed',
    jsonb_build_object('method', p_method, 'reference', v_reference)
  );

  insert into public.dispute_events (
    dispute_id, actor_id, event_type, from_status, to_status, details
  )
  values (
    v_dispute.id,
    v_actor,
    'refund_completed',
    v_previous_dispute_status,
    'resolved',
    jsonb_build_object('refund_id', v_refund.id)
  );

  return v_refund;
end;
$$;

create or replace function public.escalate_dispute(
  p_dispute_id uuid,
  p_reason text default null
)
returns public.disputes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_dispute public.disputes%rowtype;
begin
  if v_actor is null then
    raise exception 'AUTH_REQUIRED: sign in to escalate a dispute';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id is not distinct from v_actor
      and p.account_status = 'active'
  ) then
    raise exception 'ACCOUNT_UNAVAILABLE: your account must be active to escalate a dispute';
  end if;

  if v_reason is not null and char_length(v_reason) > 2000 then
    raise exception 'INVALID_ESCALATION_REASON: reason must be 2000 characters or fewer';
  end if;

  select * into v_dispute
  from public.disputes
  where id is not distinct from p_dispute_id
  for update;

  if not found then
    raise exception 'DISPUTE_NOT_FOUND: dispute does not exist';
  end if;

  if not public.is_dispute_participant(v_dispute.id) then
    raise exception 'FORBIDDEN: only dispute participants can escalate';
  end if;

  if v_dispute.status is distinct from 'open' then
    raise exception 'DISPUTE_NOT_ESCALATABLE: only an open dispute can be escalated';
  end if;

  update public.disputes
  set status = 'under_review'
  where id is not distinct from v_dispute.id
  returning * into v_dispute;

  insert into public.dispute_events (
    dispute_id, actor_id, event_type, from_status, to_status, details
  )
  values (
    v_dispute.id,
    v_actor,
    'escalated',
    'open',
    'under_review',
    case when v_reason is null then null else jsonb_build_object('reason', v_reason) end
  );

  return v_dispute;
end;
$$;

create or replace function public.close_my_dispute(p_dispute_id uuid)
returns public.disputes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_dispute public.disputes%rowtype;
  v_previous_status public.dispute_status;
begin
  if v_actor is null then
    raise exception 'AUTH_REQUIRED: sign in to close a dispute';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id is not distinct from v_actor
      and p.account_status = 'active'
  ) then
    raise exception 'ACCOUNT_UNAVAILABLE: your account must be active to close a dispute';
  end if;

  select * into v_dispute
  from public.disputes
  where id is not distinct from p_dispute_id
  for update;

  if not found then
    raise exception 'DISPUTE_NOT_FOUND: dispute does not exist';
  end if;

  if v_dispute.buyer_id is distinct from v_actor then
    raise exception 'FORBIDDEN: only the buyer can close this dispute';
  end if;

  if v_dispute.status not in ('open', 'under_review') then
    raise exception 'DISPUTE_NOT_CLOSABLE: only an active dispute can be closed';
  end if;

  if exists (
    select 1
    from public.refunds r
    where r.dispute_id is not distinct from v_dispute.id
      and r.status in ('requested', 'approved')
  ) then
    raise exception 'REFUND_STILL_ACTIVE: resolve the active refund before closing this dispute';
  end if;

  v_previous_status := v_dispute.status;

  update public.disputes
  set status = 'closed',
      resolved_at = now()
  where id is not distinct from v_dispute.id
  returning * into v_dispute;

  insert into public.dispute_events (
    dispute_id, actor_id, event_type, from_status, to_status
  )
  values (
    v_dispute.id,
    v_actor,
    'closed',
    v_previous_status,
    'closed'
  );

  return v_dispute;
end;
$$;

create or replace function public.admin_update_listing_report(
  p_report_id uuid,
  p_status public.report_status,
  p_resolution text default null
)
returns public.listing_reports
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin uuid := auth.uid();
  v_resolution text := nullif(btrim(coalesce(p_resolution, '')), '');
  v_report public.listing_reports%rowtype;
  v_previous_status public.report_status;
begin
  if v_admin is null then
    raise exception 'AUTH_REQUIRED: sign in to update a listing report';
  end if;

  if not public.is_admin() then
    raise exception 'FORBIDDEN: only an active admin can update listing reports';
  end if;

  if p_status is null then
    raise exception 'INVALID_REPORT_TRANSITION: choose a report status';
  end if;

  if v_resolution is not null and char_length(v_resolution) > 2000 then
    raise exception 'INVALID_RESOLUTION: resolution must be 2000 characters or fewer';
  end if;

  select * into v_report
  from public.listing_reports
  where id is not distinct from p_report_id
  for update;

  if not found then
    raise exception 'REPORT_NOT_FOUND: listing report does not exist';
  end if;

  v_previous_status := v_report.status;

  if not (
    (v_previous_status = 'pending' and p_status in ('under_review', 'resolved', 'dismissed'))
    or (v_previous_status = 'under_review' and p_status in ('resolved', 'dismissed'))
  ) then
    raise exception 'INVALID_REPORT_TRANSITION: that report status transition is not allowed';
  end if;

  if p_status in ('resolved', 'dismissed') and v_resolution is null then
    raise exception 'RESOLUTION_REQUIRED: terminal reports require a resolution';
  end if;

  update public.listing_reports
  set status = p_status,
      assigned_admin_id = v_admin,
      resolution = case
        when p_status in ('resolved', 'dismissed') then v_resolution
        else null
      end,
      resolved_at = case
        when p_status in ('resolved', 'dismissed') then now()
        else null
      end
  where id is not distinct from v_report.id
  returning * into v_report;

  insert into public.admin_actions (
    admin_id, action_type, entity_type, entity_id, details
  )
  values (
    v_admin,
    'listing_report_status_updated',
    'listing_report',
    v_report.id,
    jsonb_build_object(
      'from_status', v_previous_status,
      'to_status', p_status,
      'resolution', v_resolution
    )
  );

  return v_report;
end;
$$;

create or replace function public.admin_resolve_dispute(
  p_dispute_id uuid,
  p_resolution text
)
returns public.disputes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin uuid := auth.uid();
  v_resolution text := nullif(btrim(coalesce(p_resolution, '')), '');
  v_dispute public.disputes%rowtype;
  v_previous_status public.dispute_status;
begin
  if v_admin is null then
    raise exception 'AUTH_REQUIRED: sign in to resolve a dispute';
  end if;

  if not public.is_admin() then
    raise exception 'FORBIDDEN: only an active admin can resolve disputes';
  end if;

  if v_resolution is null or char_length(v_resolution) > 2000 then
    raise exception 'INVALID_RESOLUTION: resolution must contain 1 to 2000 characters';
  end if;

  select * into v_dispute
  from public.disputes
  where id is not distinct from p_dispute_id
  for update;

  if not found then
    raise exception 'DISPUTE_NOT_FOUND: dispute does not exist';
  end if;

  if v_dispute.status not in ('open', 'under_review') then
    raise exception 'DISPUTE_NOT_RESOLVABLE: only an active dispute can be resolved';
  end if;

  v_previous_status := v_dispute.status;

  update public.disputes
  set status = 'resolved',
      assigned_admin_id = v_admin,
      resolution = v_resolution,
      resolved_at = now()
  where id is not distinct from v_dispute.id
  returning * into v_dispute;

  insert into public.dispute_events (
    dispute_id, actor_id, event_type, from_status, to_status, details
  )
  values (
    v_dispute.id,
    v_admin,
    'resolved',
    v_previous_status,
    'resolved',
    jsonb_build_object('resolution', v_resolution)
  );

  insert into public.admin_actions (
    admin_id, action_type, entity_type, entity_id, details
  )
  values (
    v_admin,
    'dispute_resolved',
    'dispute',
    v_dispute.id,
    jsonb_build_object(
      'from_status', v_previous_status,
      'to_status', 'resolved',
      'resolution', v_resolution
    )
  );

  return v_dispute;
end;
$$;

-- ----------------------------------------------------------------------------
-- 9. Exact RPC execution grants
-- ----------------------------------------------------------------------------

revoke execute on function public.submit_listing_report(uuid, text, text) from public, anon;
revoke execute on function public.open_order_dispute(uuid, text, text) from public, anon;
revoke execute on function public.send_dispute_message(uuid, text) from public, anon;
revoke execute on function public.register_dispute_evidence(uuid, text, text, text, bigint) from public, anon;
revoke execute on function public.request_refund(uuid, numeric, text) from public, anon;
revoke execute on function public.review_refund(uuid, text, text) from public, anon;
revoke execute on function public.complete_refund(uuid, public.refund_method, text, text) from public, anon;
revoke execute on function public.escalate_dispute(uuid, text) from public, anon;
revoke execute on function public.close_my_dispute(uuid) from public, anon;
revoke execute on function public.admin_update_listing_report(uuid, public.report_status, text) from public, anon;
revoke execute on function public.admin_resolve_dispute(uuid, text) from public, anon;

grant execute on function public.submit_listing_report(uuid, text, text) to authenticated;
grant execute on function public.open_order_dispute(uuid, text, text) to authenticated;
grant execute on function public.send_dispute_message(uuid, text) to authenticated;
grant execute on function public.register_dispute_evidence(uuid, text, text, text, bigint) to authenticated;
grant execute on function public.request_refund(uuid, numeric, text) to authenticated;
grant execute on function public.review_refund(uuid, text, text) to authenticated;
grant execute on function public.complete_refund(uuid, public.refund_method, text, text) to authenticated;
grant execute on function public.escalate_dispute(uuid, text) to authenticated;
grant execute on function public.close_my_dispute(uuid) to authenticated;
grant execute on function public.admin_update_listing_report(uuid, public.report_status, text) to authenticated;
grant execute on function public.admin_resolve_dispute(uuid, text) to authenticated;

commit;
