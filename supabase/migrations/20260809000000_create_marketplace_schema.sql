-- ============================================================================
-- PalitPaddleBai Mart — Phase 1: Database Foundation
-- Marketplace schema. Statement order is dependency-safe so a single runnable
-- migration never references an object before it exists:
--
--   A. Extensions
--   B. Enums / custom types
--   C. Application tables (base tables, then public views)
--   D. Constraints / indexes
--   E. Helper and authorization functions
--   F. Triggers
--   G. Enable row level security
--   H. RLS policies
--   I. Grants (public views + column-level revoke/grant)
--
-- Conventions:
--   * All money stored as numeric(12,2) — never floating point.
--   * Timestamps are timestamptz (UTC).
--   * Enum values are lowercase.
--   * RLS is enabled on every table; public read is limited to dedicated
--     views / active-listing policies. Private data is never broadly readable.
--   * Admin authorization: profiles.role + security definer helper
--     is_admin(); users cannot self-escalate (column-level grants).
--   * user_preferences (spec 1.x) is intentionally NOT created — its fields
--     are consolidated into recommendation_profiles to avoid redundancy.
-- ============================================================================

-- ============================================================================
-- A. Extensions
-- ============================================================================
create extension if not exists pgcrypto;

-- ============================================================================
-- B. Enums / custom types
-- ============================================================================
do $$ begin
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace where t.typname = 'user_role' and n.nspname = 'public') then
    create type public.user_role as enum ('customer', 'seller', 'admin');
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace where t.typname = 'account_status' and n.nspname = 'public') then
    create type public.account_status as enum ('active', 'suspended', 'deactivated');
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace where t.typname = 'seller_status' and n.nspname = 'public') then
    create type public.seller_status as enum ('pending', 'active', 'suspended', 'rejected');
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace where t.typname = 'listing_condition' and n.nspname = 'public') then
    create type public.listing_condition as enum ('new', 'like_new', 'used', 'heavily_used');
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace where t.typname = 'listing_status' and n.nspname = 'public') then
    create type public.listing_status as enum ('draft', 'active', 'sold', 'archived', 'removed');
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace where t.typname = 'order_status' and n.nspname = 'public') then
    create type public.order_status as enum ('pending', 'confirmed', 'paid', 'preparing', 'shipped', 'ready_for_pickup', 'completed', 'cancelled', 'disputed');
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace where t.typname = 'payment_status' and n.nspname = 'public') then
    create type public.payment_status as enum ('pending', 'paid', 'failed', 'refunded', 'partially_refunded');
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace where t.typname = 'fulfillment_type' and n.nspname = 'public') then
    create type public.fulfillment_type as enum ('pickup', 'delivery');
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace where t.typname = 'inquiry_status' and n.nspname = 'public') then
    create type public.inquiry_status as enum ('open', 'answered', 'closed');
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace where t.typname = 'dispute_status' and n.nspname = 'public') then
    create type public.dispute_status as enum ('open', 'under_review', 'resolved', 'closed');
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace where t.typname = 'report_status' and n.nspname = 'public') then
    create type public.report_status as enum ('pending', 'under_review', 'resolved', 'dismissed');
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace where t.typname = 'review_status' and n.nspname = 'public') then
    create type public.review_status as enum ('pending', 'approved', 'rejected', 'hidden');
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace where t.typname = 'notification_type' and n.nspname = 'public') then
    create type public.notification_type as enum ('order', 'inquiry', 'dispute', 'review', 'report', 'system');
  end if;
end $$;

-- ============================================================================
-- C. Application tables
-- ============================================================================

-- ----------------------------------------------------------------------------
-- USER DOMAIN
-- ----------------------------------------------------------------------------

-- One profile row per auth user, created by the on_auth_user_created trigger.
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  first_name text,
  last_name text,
  display_name text,
  phone text,
  avatar_url text,
  city text,
  province text,
  role public.user_role not null default 'customer',
  account_status public.account_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.seller_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  store_name text not null,
  description text,
  logo_url text,
  seller_status public.seller_status not null default 'pending',
  city text,
  province text,
  pickup_available boolean not null default false,
  delivery_available boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Public-facing subset of profiles (no role/status/contact). Definer view:
-- exposes only explicitly chosen public columns; private columns stay locked
-- by the base table's RLS (self/admin only).
create or replace view public.public_profiles as
select id, display_name, city, province, avatar_url
from public.profiles;

-- Public-facing subset of seller profiles (active sellers only).
create or replace view public.public_seller_profiles as
select id, store_name, description, logo_url, city, province,
       pickup_available, delivery_available
from public.seller_profiles
where seller_status = 'active';

-- ----------------------------------------------------------------------------
-- MARKETPLACE CATALOG
-- ----------------------------------------------------------------------------

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.brands (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  logo_url text,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.listings (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.seller_profiles(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete restrict,
  brand_id uuid references public.brands(id) on delete set null,
  title text not null check (length(trim(title)) between 3 and 120),
  description text not null,
  listing_condition public.listing_condition not null,
  price numeric(12,2) not null check (price >= 0),
  quantity integer not null default 1 check (quantity >= 0),
  listing_status public.listing_status not null default 'draft',
  city text,
  province text,
  pickup_available boolean not null default false,
  delivery_available boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Paddle-specific recommendation attributes (one-to-one with a paddle listing).
-- Documented decision: kept separate so generic listings are not polluted.
create table public.paddle_attributes (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null unique references public.listings(id) on delete cascade,
  weight_grams integer check (weight_grams between 150 and 400),
  weight_class text,
  control_score integer check (control_score between 1 and 10),
  power_score integer check (power_score between 1 and 10),
  skill_level text check (skill_level in ('beginner', 'intermediate', 'advanced', 'all')),
  playing_style text check (playing_style in ('control', 'power', 'all_court', 'balanced', 'spin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.listing_images (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  storage_path text,
  url text,
  sort_order integer not null default 0,
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.listing_views (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  viewer_id uuid references auth.users(id) on delete set null,
  viewed_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- DISCOVERY
-- ----------------------------------------------------------------------------

create table public.favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  listing_id uuid not null references public.listings(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, listing_id)
);

-- Consolidates user_preferences (spec USER DOMAIN) — no duplicate tables.
create table public.recommendation_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  skill_level text check (skill_level in ('beginner', 'intermediate', 'advanced', 'all')),
  playing_style text check (playing_style in ('control', 'power', 'all_court', 'balanced', 'spin')),
  preferred_weight_grams integer check (preferred_weight_grams between 150 and 400),
  control_power_preference smallint check (control_power_preference between 1 and 10),
  budget numeric(12,2) check (budget >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.recommendation_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  listing_id uuid references public.listings(id) on delete set null,
  event_type text not null check (event_type in ('view', 'click', 'favorite', 'inquiry', 'order')),
  payload jsonb,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- COMMUNICATION
-- ----------------------------------------------------------------------------

create table public.inquiries (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  buyer_id uuid not null references auth.users(id) on delete cascade,
  seller_id uuid not null references public.seller_profiles(id) on delete cascade,
  subject text not null,
  message text not null,
  status public.inquiry_status not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.inquiry_messages (
  id uuid primary key default gen_random_uuid(),
  inquiry_id uuid not null references public.inquiries(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  message text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- COMMERCE
-- ----------------------------------------------------------------------------

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  buyer_id uuid not null references auth.users(id) on delete restrict,
  seller_id uuid not null references public.seller_profiles(id) on delete restrict,
  status public.order_status not null default 'pending',
  fulfillment_type public.fulfillment_type not null,
  subtotal numeric(12,2) not null check (subtotal >= 0),
  total numeric(12,2) not null check (total >= 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Historical snapshots; stable even if the original listing changes later.
create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  listing_id uuid not null references public.listings(id) on delete restrict,
  seller_id uuid not null references public.seller_profiles(id) on delete restrict,
  product_title text not null,
  unit_price numeric(12,2) not null check (unit_price >= 0),
  quantity integer not null check (quantity > 0),
  created_at timestamptz not null default now()
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  amount numeric(12,2) not null check (amount >= 0),
  payment_method text not null,
  payment_reference text,
  status public.payment_status not null default 'pending',
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.fulfillment_details (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id) on delete cascade,
  fulfillment_type public.fulfillment_type not null,
  recipient_name text,
  phone text,
  address text,
  city text,
  province text,
  postal_code text,
  notes text,
  pickup_location text,
  pickup_instructions text,
  scheduled_date timestamptz,
  courier text,
  tracking_number text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- RATINGS
-- ----------------------------------------------------------------------------

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  reviewer_id uuid not null references auth.users(id) on delete cascade,
  seller_id uuid not null references public.seller_profiles(id) on delete restrict,
  listing_id uuid references public.listings(id) on delete set null,
  rating smallint not null check (rating between 1 and 5),
  comment text,
  status public.review_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (order_id, reviewer_id)
);

-- ----------------------------------------------------------------------------
-- MODERATION
-- ----------------------------------------------------------------------------

create table public.listing_reports (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  reporter_id uuid references auth.users(id) on delete set null,
  reason text not null,
  description text,
  status public.report_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.disputes (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  opened_by uuid not null references auth.users(id) on delete cascade,
  buyer_id uuid not null references auth.users(id) on delete cascade,
  seller_id uuid not null references public.seller_profiles(id) on delete cascade,
  reason text not null,
  description text,
  status public.dispute_status not null default 'open',
  assigned_admin_id uuid references auth.users(id) on delete set null,
  resolution text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.dispute_messages (
  id uuid primary key default gen_random_uuid(),
  dispute_id uuid not null references public.disputes(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  message text not null,
  created_at timestamptz not null default now()
);

create table public.dispute_evidence (
  id uuid primary key default gen_random_uuid(),
  dispute_id uuid not null references public.disputes(id) on delete cascade,
  uploader_id uuid not null references auth.users(id) on delete cascade,
  storage_path text,
  url text,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- NOTIFICATIONS
-- ----------------------------------------------------------------------------

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references auth.users(id) on delete cascade,
  type public.notification_type not null,
  title text not null,
  message text,
  related_entity_type text,
  related_entity_id uuid,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- ADMINISTRATION
-- ----------------------------------------------------------------------------

create table public.admin_actions (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references auth.users(id) on delete cascade,
  action_type text not null,
  entity_type text not null,
  entity_id uuid,
  details jsonb,
  created_at timestamptz not null default now()
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  details jsonb,
  ip_address inet,
  created_at timestamptz not null default now()
);

-- ============================================================================
-- D. Constraints / indexes
-- ============================================================================
-- Table-level constraints (PK/FK/CHECK/UNIQUE) are declared inline in section C.
-- Secondary indexes for query paths used by the marketplace.

-- profiles
create index idx_profiles_role_status on public.profiles (role, account_status);

-- seller_profiles
create index idx_seller_profiles_status on public.seller_profiles (seller_status);

-- categories / brands
create index idx_categories_active_sort on public.categories (is_active, sort_order);
create index idx_brands_active on public.brands (is_active);

-- listings
create index idx_listings_seller on public.listings (seller_id);
create index idx_listings_category on public.listings (category_id);
create index idx_listings_brand on public.listings (brand_id);
create index idx_listings_status on public.listings (listing_status);
create index idx_listings_condition on public.listings (listing_condition);
create index idx_listings_price on public.listings (price);
create index idx_listings_created_at on public.listings (created_at desc);

-- paddle_attributes
create index idx_paddle_attributes_listing on public.paddle_attributes (listing_id);

-- listing_images
create index idx_listing_images_listing on public.listing_images (listing_id, sort_order);

-- listing_views
create index idx_listing_views_listing on public.listing_views (listing_id);
create index idx_listing_views_viewed_at on public.listing_views (viewed_at desc);

-- favorites
create index idx_favorites_listing on public.favorites (listing_id);

-- recommendation_events
create index idx_recommendation_events_user on public.recommendation_events (user_id, created_at desc);

-- inquiries / messages
create index idx_inquiries_buyer on public.inquiries (buyer_id);
create index idx_inquiries_seller on public.inquiries (seller_id);
create index idx_inquiries_listing on public.inquiries (listing_id);
create index idx_inquiry_messages_inquiry on public.inquiry_messages (inquiry_id, created_at);

-- orders
create index idx_orders_buyer on public.orders (buyer_id);
create index idx_orders_seller on public.orders (seller_id);
create index idx_orders_status on public.orders (status);
create index idx_orders_created_at on public.orders (created_at desc);

-- order_items
create index idx_order_items_order on public.order_items (order_id);
create index idx_order_items_listing on public.order_items (listing_id);

-- payments
create index idx_payments_order on public.payments (order_id);
create index idx_payments_status on public.payments (status);

-- fulfillment_details
create index idx_fulfillment_details_order on public.fulfillment_details (order_id);

-- reviews
create index idx_reviews_seller on public.reviews (seller_id);
create index idx_reviews_listing on public.reviews (listing_id);
create index idx_reviews_seller_status on public.reviews (seller_id, status);

-- listing_reports
create index idx_listing_reports_status on public.listing_reports (status);
create index idx_listing_reports_listing on public.listing_reports (listing_id);

-- disputes
create index idx_disputes_order on public.disputes (order_id);
create index idx_disputes_status on public.disputes (status);
create index idx_disputes_seller on public.disputes (seller_id);

-- dispute messages / evidence
create index idx_dispute_messages_dispute on public.dispute_messages (dispute_id, created_at);
create index idx_dispute_evidence_dispute on public.dispute_evidence (dispute_id);

-- notifications
create index idx_notifications_recipient on public.notifications (recipient_id, is_read);
create index idx_notifications_recipient_created on public.notifications (recipient_id, created_at desc);

-- admin / audit
create index idx_admin_actions_admin on public.admin_actions (admin_id, created_at desc);
create index idx_audit_logs_actor on public.audit_logs (actor_id, created_at desc);

-- ============================================================================
-- E. Helper and authorization functions
-- ============================================================================

-- Keeps updated_at consistent across tables.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- True when the current user is an active admin. Security definer so RLS
-- policies can call it without recursion; it only returns a boolean.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
      and p.account_status = 'active'
  );
$$;

-- Returns the seller_profiles.id for the current user (null when not a seller).
create or replace function public.auth_seller_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select sp.id
  from public.seller_profiles sp
  where sp.user_id = auth.uid();
$$;

-- Creates a profile row when a user signs up via Supabase Auth.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, role, account_status)
  values (new.id, 'customer', 'active')
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Defense-in-depth: role/account_status may only change for active admins.
-- Works alongside column-level grants that exclude these columns from the
-- `authenticated` role.
create or replace function public.prevent_role_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'not authorized to change role or account status';
  end if;
  return new;
end;
$$;

-- Admin-authorized role management. Security definer so it can update any
-- profile; it refuses callers who are not active admins.
create or replace function public.admin_set_role(target_user uuid, new_role public.user_role)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'not authorized';
  end if;
  update public.profiles
  set role = new_role
  where id = target_user;
end;
$$;

create or replace function public.admin_set_account_status(target_user uuid, new_status public.account_status)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'not authorized';
  end if;
  update public.profiles
  set account_status = new_status
  where id = target_user;
end;
$$;

create or replace function public.admin_set_seller_status(seller uuid, new_status public.seller_status)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'not authorized';
  end if;
  update public.seller_profiles
  set seller_status = new_status
  where id = seller;
end;
$$;

-- Forces safe initial states on client insert (column grants cannot restrict
-- INSERT columns, so statuses are normalized here instead of trusting input).
-- Admins are exempt so server-side flows can set explicit states.
create or replace function public.enforce_initial_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_admin() then
    return new;
  end if;
  if TG_TABLE_NAME = 'seller_profiles' then
    new.seller_status := 'pending';
  elsif TG_TABLE_NAME = 'orders' then
    new.status := 'pending';
  elsif TG_TABLE_NAME = 'reviews' then
    new.status := 'pending';
  elsif TG_TABLE_NAME = 'listing_reports' then
    new.status := 'pending';
  elsif TG_TABLE_NAME = 'disputes' then
    new.status := 'open';
    new.assigned_admin_id := null;
  end if;
  return new;
end;
$$;

-- ============================================================================
-- F. Triggers
-- ============================================================================

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger seller_profiles_set_updated_at
  before update on public.seller_profiles
  for each row execute function public.set_updated_at();

create trigger categories_set_updated_at
  before update on public.categories
  for each row execute function public.set_updated_at();

create trigger brands_set_updated_at
  before update on public.brands
  for each row execute function public.set_updated_at();

create trigger listings_set_updated_at
  before update on public.listings
  for each row execute function public.set_updated_at();

create trigger paddle_attributes_set_updated_at
  before update on public.paddle_attributes
  for each row execute function public.set_updated_at();

create trigger recommendation_profiles_set_updated_at
  before update on public.recommendation_profiles
  for each row execute function public.set_updated_at();

create trigger inquiries_set_updated_at
  before update on public.inquiries
  for each row execute function public.set_updated_at();

create trigger orders_set_updated_at
  before update on public.orders
  for each row execute function public.set_updated_at();

create trigger payments_set_updated_at
  before update on public.payments
  for each row execute function public.set_updated_at();

create trigger fulfillment_details_set_updated_at
  before update on public.fulfillment_details
  for each row execute function public.set_updated_at();

create trigger reviews_set_updated_at
  before update on public.reviews
  for each row execute function public.set_updated_at();

create trigger listing_reports_set_updated_at
  before update on public.listing_reports
  for each row execute function public.set_updated_at();

create trigger disputes_set_updated_at
  before update on public.disputes
  for each row execute function public.set_updated_at();

-- Profile auto-creation on signup.
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Role/account-status changes require an active admin.
create trigger prevent_role_escalation
  before update of role, account_status on public.profiles
  for each row execute function public.prevent_role_escalation();

-- Normalize initial states on client insert (see enforce_initial_status).
create trigger seller_profiles_force_pending
  before insert on public.seller_profiles
  for each row execute function public.enforce_initial_status();

create trigger orders_force_pending
  before insert on public.orders
  for each row execute function public.enforce_initial_status();

create trigger reviews_force_pending
  before insert on public.reviews
  for each row execute function public.enforce_initial_status();

create trigger listing_reports_force_pending
  before insert on public.listing_reports
  for each row execute function public.enforce_initial_status();

create trigger disputes_force_open
  before insert on public.disputes
  for each row execute function public.enforce_initial_status();

-- ============================================================================
-- G. Enable row level security
-- ============================================================================

alter table public.profiles enable row level security;
alter table public.seller_profiles enable row level security;
alter table public.categories enable row level security;
alter table public.brands enable row level security;
alter table public.listings enable row level security;
alter table public.paddle_attributes enable row level security;
alter table public.listing_images enable row level security;
alter table public.listing_views enable row level security;
alter table public.favorites enable row level security;
alter table public.recommendation_profiles enable row level security;
alter table public.recommendation_events enable row level security;
alter table public.inquiries enable row level security;
alter table public.inquiry_messages enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.payments enable row level security;
alter table public.fulfillment_details enable row level security;
alter table public.reviews enable row level security;
alter table public.listing_reports enable row level security;
alter table public.disputes enable row level security;
alter table public.dispute_messages enable row level security;
alter table public.dispute_evidence enable row level security;
alter table public.notifications enable row level security;
alter table public.admin_actions enable row level security;
alter table public.audit_logs enable row level security;

-- ============================================================================
-- H. RLS policies
-- ============================================================================

-- ------------------------------------------------ PROFILES
create policy "profiles_select_self_or_admin" on public.profiles
  for select using (id = auth.uid() or public.is_admin());

-- Profile rows are created by the auth.users trigger; clients cannot insert
-- (inserting with a privileged role would otherwise be possible).
create policy "profiles_update_self" on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

create policy "profiles_delete_admin" on public.profiles
  for delete using (public.is_admin());

-- ------------------------------------------------ SELLER PROFILES
create policy "seller_profiles_select_self_or_admin" on public.seller_profiles
  for select using (user_id = auth.uid() or public.is_admin());

create policy "seller_profiles_insert_self" on public.seller_profiles
  for insert with check (user_id = auth.uid());

create policy "seller_profiles_update_self" on public.seller_profiles
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "seller_profiles_delete_admin" on public.seller_profiles
  for delete using (public.is_admin());

-- ------------------------------------------------ CATEGORIES
create policy "categories_select_public" on public.categories
  for select using (true);

create policy "categories_insert_admin" on public.categories
  for insert with check (public.is_admin());

create policy "categories_update_admin" on public.categories
  for update using (public.is_admin()) with check (public.is_admin());

create policy "categories_delete_admin" on public.categories
  for delete using (public.is_admin());

-- ------------------------------------------------ BRANDS
create policy "brands_select_public" on public.brands
  for select using (true);

create policy "brands_insert_admin" on public.brands
  for insert with check (public.is_admin());

create policy "brands_update_admin" on public.brands
  for update using (public.is_admin()) with check (public.is_admin());

create policy "brands_delete_admin" on public.brands
  for delete using (public.is_admin());

-- ------------------------------------------------ LISTINGS
-- Guests/anon: only active listings. Sellers: own listings in any status. Admins: all.
create policy "listings_select_active_or_own_or_admin" on public.listings
  for select using (
    listing_status = 'active'
    or seller_id = public.auth_seller_id()
    or public.is_admin()
  );

create policy "listings_insert_own" on public.listings
  for insert with check (seller_id = public.auth_seller_id());

create policy "listings_update_own_or_admin" on public.listings
  for update using (
    seller_id = public.auth_seller_id()
    or public.is_admin()
  ) with check (
    seller_id = public.auth_seller_id()
    or public.is_admin()
  );

create policy "listings_delete_own_or_admin" on public.listings
  for delete using (
    seller_id = public.auth_seller_id()
    or public.is_admin()
  );

-- ------------------------------------------------ PADDLE ATTRIBUTES
create policy "paddle_attributes_select_visible_listings" on public.paddle_attributes
  for select using (
    exists (
      select 1 from public.listings l
      where l.id = paddle_attributes.listing_id
        and (l.listing_status = 'active' or l.seller_id = public.auth_seller_id() or public.is_admin())
    )
  );

create policy "paddle_attributes_insert_own" on public.paddle_attributes
  for insert with check (
    exists (
      select 1 from public.listings l
      where l.id = paddle_attributes.listing_id
        and l.seller_id = public.auth_seller_id()
    )
  );

create policy "paddle_attributes_update_own_or_admin" on public.paddle_attributes
  for update using (
    exists (
      select 1 from public.listings l
      where l.id = paddle_attributes.listing_id
        and (l.seller_id = public.auth_seller_id() or public.is_admin())
    )
  ) with check (
    exists (
      select 1 from public.listings l
      where l.id = paddle_attributes.listing_id
        and (l.seller_id = public.auth_seller_id() or public.is_admin())
    )
  );

create policy "paddle_attributes_delete_own_or_admin" on public.paddle_attributes
  for delete using (
    exists (
      select 1 from public.listings l
      where l.id = paddle_attributes.listing_id
        and (l.seller_id = public.auth_seller_id() or public.is_admin())
    )
  );

-- ------------------------------------------------ LISTING IMAGES
create policy "listing_images_select_visible_listings" on public.listing_images
  for select using (
    exists (
      select 1 from public.listings l
      where l.id = listing_images.listing_id
        and (l.listing_status = 'active' or l.seller_id = public.auth_seller_id() or public.is_admin())
    )
  );

create policy "listing_images_insert_own" on public.listing_images
  for insert with check (
    exists (
      select 1 from public.listings l
      where l.id = listing_images.listing_id
        and l.seller_id = public.auth_seller_id()
    )
  );

create policy "listing_images_update_own_or_admin" on public.listing_images
  for update using (
    exists (
      select 1 from public.listings l
      where l.id = listing_images.listing_id
        and (l.seller_id = public.auth_seller_id() or public.is_admin())
    )
  ) with check (
    exists (
      select 1 from public.listings l
      where l.id = listing_images.listing_id
        and (l.seller_id = public.auth_seller_id() or public.is_admin())
    )
  );

create policy "listing_images_delete_own_or_admin" on public.listing_images
  for delete using (
    exists (
      select 1 from public.listings l
      where l.id = listing_images.listing_id
        and (l.seller_id = public.auth_seller_id() or public.is_admin())
    )
  );

-- ------------------------------------------------ LISTING VIEWS
-- Analytics-only table; no client policies (service-role/admin access only).
-- Listing view insertions are recorded server-side in later phases.

-- ------------------------------------------------ FAVORITES
create policy "favorites_select_own" on public.favorites
  for select using (user_id = auth.uid());

create policy "favorites_insert_own" on public.favorites
  for insert with check (user_id = auth.uid());

create policy "favorites_delete_own" on public.favorites
  for delete using (user_id = auth.uid());

-- ------------------------------------------------ RECOMMENDATION PROFILES
create policy "recommendation_profiles_select_own" on public.recommendation_profiles
  for select using (user_id = auth.uid());

create policy "recommendation_profiles_insert_own" on public.recommendation_profiles
  for insert with check (user_id = auth.uid());

create policy "recommendation_profiles_update_own" on public.recommendation_profiles
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "recommendation_profiles_delete_admin" on public.recommendation_profiles
  for delete using (public.is_admin());

-- ------------------------------------------------ RECOMMENDATION EVENTS
create policy "recommendation_events_insert_self" on public.recommendation_events
  for insert with check (
    (user_id = auth.uid())
    or (user_id is null and auth.uid() is null)
  );

create policy "recommendation_events_select_admin" on public.recommendation_events
  for select using (public.is_admin());

-- ------------------------------------------------ INQUIRIES
create policy "inquiries_select_participant_or_admin" on public.inquiries
  for select using (
    buyer_id = auth.uid()
    or seller_id = public.auth_seller_id()
    or public.is_admin()
  );

create policy "inquiries_insert_buyer" on public.inquiries
  for insert with check (
    buyer_id = auth.uid()
    and seller_id = (
      select l.seller_id from public.listings l
      where l.id = inquiries.listing_id
    )
  );

create policy "inquiries_update_participant_or_admin" on public.inquiries
  for update using (
    buyer_id = auth.uid()
    or seller_id = public.auth_seller_id()
    or public.is_admin()
  ) with check (
    buyer_id = auth.uid()
    or seller_id = public.auth_seller_id()
    or public.is_admin()
  );

create policy "inquiries_delete_admin" on public.inquiries
  for delete using (public.is_admin());

-- ------------------------------------------------ INQUIRY MESSAGES
create policy "inquiry_messages_select_participant_or_admin" on public.inquiry_messages
  for select using (
    exists (
      select 1 from public.inquiries i
      where i.id = inquiry_messages.inquiry_id
        and (i.buyer_id = auth.uid() or i.seller_id = public.auth_seller_id() or public.is_admin())
    )
  );

create policy "inquiry_messages_insert_participant" on public.inquiry_messages
  for insert with check (
    exists (
      select 1 from public.inquiries i
      where i.id = inquiry_messages.inquiry_id
        and (i.buyer_id = auth.uid() or i.seller_id = public.auth_seller_id())
    )
    and sender_id = auth.uid()
  );

create policy "inquiry_messages_delete_admin" on public.inquiry_messages
  for delete using (public.is_admin());

-- ------------------------------------------------ ORDERS
create policy "orders_select_participant_or_admin" on public.orders
  for select using (
    buyer_id = auth.uid()
    or seller_id = public.auth_seller_id()
    or public.is_admin()
  );

create policy "orders_insert_buyer" on public.orders
  for insert with check (buyer_id = auth.uid());

create policy "orders_update_participant_or_admin" on public.orders
  for update using (
    buyer_id = auth.uid()
    or seller_id = public.auth_seller_id()
    or public.is_admin()
  ) with check (
    buyer_id = auth.uid()
    or seller_id = public.auth_seller_id()
    or public.is_admin()
  );

create policy "orders_delete_admin" on public.orders
  for delete using (public.is_admin());

-- ------------------------------------------------ ORDER ITEMS
create policy "order_items_select_participant_or_admin" on public.order_items
  for select using (
    exists (
      select 1 from public.orders o
      where o.id = order_items.order_id
        and (o.buyer_id = auth.uid() or o.seller_id = public.auth_seller_id() or public.is_admin())
    )
  );

-- No client insert/update/delete: order items are written server-side (Phase 8).

-- ------------------------------------------------ PAYMENTS
create policy "payments_select_participant_or_admin" on public.payments
  for select using (
    exists (
      select 1 from public.orders o
      where o.id = payments.order_id
        and (o.buyer_id = auth.uid() or o.seller_id = public.auth_seller_id() or public.is_admin())
    )
  );

-- No client writes: payment records are created server-side (Phase 9).

-- ------------------------------------------------ FULFILLMENT DETAILS
create policy "fulfillment_details_select_participant_or_admin" on public.fulfillment_details
  for select using (
    exists (
      select 1 from public.orders o
      where o.id = fulfillment_details.order_id
        and (o.buyer_id = auth.uid() or o.seller_id = public.auth_seller_id() or public.is_admin())
    )
  );

create policy "fulfillment_details_update_participant_or_admin" on public.fulfillment_details
  for update using (
    exists (
      select 1 from public.orders o
      where o.id = fulfillment_details.order_id
        and (o.buyer_id = auth.uid() or o.seller_id = public.auth_seller_id() or public.is_admin())
    )
  ) with check (
    exists (
      select 1 from public.orders o
      where o.id = fulfillment_details.order_id
        and (o.buyer_id = auth.uid() or o.seller_id = public.auth_seller_id() or public.is_admin())
    )
  );

-- No client insert: fulfillment rows are created server-side with the order.

-- ------------------------------------------------ REVIEWS
-- Approved reviews are public; otherwise only the reviewer/admin can see them.
create policy "reviews_select_public_or_self_or_admin" on public.reviews
  for select using (
    status = 'approved'
    or reviewer_id = auth.uid()
    or public.is_admin()
  );

create policy "reviews_insert_reviewer" on public.reviews
  for insert with check (reviewer_id = auth.uid());

create policy "reviews_update_admin" on public.reviews
  for update using (public.is_admin()) with check (public.is_admin());

create policy "reviews_delete_admin" on public.reviews
  for delete using (public.is_admin());

-- ------------------------------------------------ LISTING REPORTS
create policy "listing_reports_select_own_or_admin" on public.listing_reports
  for select using (reporter_id = auth.uid() or public.is_admin());

create policy "listing_reports_insert_reporter" on public.listing_reports
  for insert with check (reporter_id = auth.uid());

create policy "listing_reports_update_admin" on public.listing_reports
  for update using (public.is_admin()) with check (public.is_admin());

create policy "listing_reports_delete_admin" on public.listing_reports
  for delete using (public.is_admin());

-- ------------------------------------------------ DISPUTES
create policy "disputes_select_participant_or_admin" on public.disputes
  for select using (
    buyer_id = auth.uid()
    or seller_id = public.auth_seller_id()
    or assigned_admin_id = auth.uid()
    or public.is_admin()
  );

create policy "disputes_insert_participant" on public.disputes
  for insert with check (
    (opened_by = auth.uid() and buyer_id = auth.uid())
    or seller_id = public.auth_seller_id()
  );

create policy "disputes_update_participant_or_admin" on public.disputes
  for update using (
    buyer_id = auth.uid()
    or seller_id = public.auth_seller_id()
    or assigned_admin_id = auth.uid()
    or public.is_admin()
  ) with check (
    buyer_id = auth.uid()
    or seller_id = public.auth_seller_id()
    or assigned_admin_id = auth.uid()
    or public.is_admin()
  );

create policy "disputes_delete_admin" on public.disputes
  for delete using (public.is_admin());

-- ------------------------------------------------ DISPUTE MESSAGES
create policy "dispute_messages_select_participant_or_admin" on public.dispute_messages
  for select using (
    exists (
      select 1 from public.disputes d
      where d.id = dispute_messages.dispute_id
        and (d.buyer_id = auth.uid() or d.seller_id = public.auth_seller_id() or d.assigned_admin_id = auth.uid() or public.is_admin())
    )
  );

create policy "dispute_messages_insert_participant" on public.dispute_messages
  for insert with check (
    exists (
      select 1 from public.disputes d
      where d.id = dispute_messages.dispute_id
        and (d.buyer_id = auth.uid() or d.seller_id = public.auth_seller_id() or d.assigned_admin_id = auth.uid())
    )
    and sender_id = auth.uid()
  );

create policy "dispute_messages_delete_admin" on public.dispute_messages
  for delete using (public.is_admin());

-- ------------------------------------------------ DISPUTE EVIDENCE
create policy "dispute_evidence_select_participant_or_admin" on public.dispute_evidence
  for select using (
    exists (
      select 1 from public.disputes d
      where d.id = dispute_evidence.dispute_id
        and (d.buyer_id = auth.uid() or d.seller_id = public.auth_seller_id() or d.assigned_admin_id = auth.uid() or public.is_admin())
    )
  );

create policy "dispute_evidence_insert_participant" on public.dispute_evidence
  for insert with check (
    exists (
      select 1 from public.disputes d
      where d.id = dispute_evidence.dispute_id
        and (d.buyer_id = auth.uid() or d.seller_id = public.auth_seller_id() or d.assigned_admin_id = auth.uid())
    )
    and uploader_id = auth.uid()
  );

create policy "dispute_evidence_delete_admin" on public.dispute_evidence
  for delete using (public.is_admin());

-- ------------------------------------------------ NOTIFICATIONS
create policy "notifications_select_own" on public.notifications
  for select using (recipient_id = auth.uid());

create policy "notifications_update_own" on public.notifications
  for update using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());

create policy "notifications_delete_own" on public.notifications
  for delete using (recipient_id = auth.uid());

-- No client insert: notifications are created server-side.

-- ------------------------------------------------ ADMIN TABLES
create policy "admin_actions_select_admin" on public.admin_actions
  for select using (public.is_admin());

create policy "admin_actions_insert_admin" on public.admin_actions
  for insert with check (public.is_admin());

create policy "audit_logs_select_admin" on public.audit_logs
  for select using (public.is_admin());

-- Admin tables have no public write/delete policies; writes happen server-side.

-- ============================================================================
-- I. Grants
-- ============================================================================
-- Public views: exposed read-only to anon + authenticated.
grant select on public.public_profiles to anon, authenticated;
grant select on public.public_seller_profiles to anon, authenticated;

-- Column-level grants restrict which columns `authenticated` may UPDATE.
-- Users must not be able to change role/account_status (self-service escalation).
revoke update on public.profiles from authenticated;
grant update (first_name, last_name, display_name, phone, avatar_url, city, province)
  on public.profiles to authenticated;

revoke update on public.seller_profiles from authenticated;
grant update (store_name, description, logo_url, city, province, pickup_available, delivery_available)
  on public.seller_profiles to authenticated;

revoke update on public.listings from authenticated;
grant update (category_id, brand_id, title, description, listing_condition, price, quantity, listing_status, city, province, pickup_available, delivery_available)
  on public.listings to authenticated;

revoke update on public.inquiries from authenticated;
grant update (status) on public.inquiries to authenticated;

revoke update on public.orders from authenticated;
grant update (status, notes) on public.orders to authenticated;

revoke update on public.disputes from authenticated;
grant update (status, resolution) on public.disputes to authenticated;
-- assigned_admin_id is NOT client-granted; admins assign via server-side flows.

revoke update on public.notifications from authenticated;
grant update (is_read) on public.notifications to authenticated;
