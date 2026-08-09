# PalitPaddleBai Mart — Database

## Overview

Supabase PostgreSQL database for the PalitPaddleBai Mart marketplace. The
schema is managed exclusively through tracked migrations in
`supabase/migrations/`. Do not modify the schema by hand outside migrations.

All money is stored as `numeric(12,2)` (no floating point). All timestamps are
`timestamptz` (UTC). Enum values are lowercase.

## Migration workflow

- Migrations live in `supabase/migrations/<timestamp>_<name>.sql`, applied in
  filename order by `supabase db reset` / `supabase migration up`.
- The Supabase CLI is required to apply them; it is not available in this
  environment yet (BLOCKED).
- After migrations apply, regenerate client types with
  `supabase gen types typescript --project-id <id> > src/lib/supabase/database.types.ts`.
- Seed data lives in `supabase/seed.sql` and applies automatically on
  `supabase db reset`. It contains only safe reference data (categories,
  brands). Sample listings require authenticated sellers, so they are not
  seeded.

## Enums (Postgres types, lowercase values)

| Enum | Values |
| --- | --- |
| `user_role` | `customer`, `seller`, `admin` |
| `account_status` | `active`, `suspended`, `deactivated` |
| `seller_status` | `pending`, `active`, `suspended`, `rejected` |
| `listing_condition` | `new`, `like_new`, `used`, `heavily_used` |
| `listing_status` | `draft`, `active`, `sold`, `archived`, `removed` |
| `order_status` | `pending`, `confirmed`, `paid`, `preparing`, `shipped`, `ready_for_pickup`, `completed`, `cancelled`, `disputed` |
| `payment_status` | `pending`, `paid`, `failed`, `refunded`, `partially_refunded` |
| `fulfillment_type` | `pickup`, `delivery` |
| `inquiry_status` | `open`, `answered`, `closed` |
| `dispute_status` | `open`, `under_review`, `resolved`, `closed` |
| `report_status` | `pending`, `under_review`, `resolved`, `dismissed` |
| `review_status` | `pending`, `approved`, `rejected`, `hidden` |
| `notification_type` | `order`, `inquiry`, `dispute`, `review`, `report`, `system` |

## Tables and relationships

### User domain
- `profiles` — one-to-one with `auth.users` (`profiles.id = auth.users.id`),
  created automatically by the `on_auth_user_created` trigger. Holds identity,
  contact, `role`, and `account_status`.
- `seller_profiles` — one-to-one with `profiles` (unique `user_id`). Store
  identity, seller status, location, pickup/delivery availability.

### Marketplace catalog
- `categories` — db-managed taxonomy (seed: Paddles, Balls, Bags, Shoes,
  Apparel, Grips, Nets, Accessories, Training Equipment, Other).
- `brands` — db-managed brand list (never hardcoded in app logic).
- `listings` — `seller_id -> seller_profiles`, `category_id -> categories`,
  `brand_id -> brands`. Enforces `price >= 0`, `quantity >= 0`.
- `paddle_attributes` — optional one-to-one attributes for paddle listings
  (weight, control/power scores 1–10, skill level, playing style). Documented
  decision: kept separate from generic listings.
- `listing_images` — ordered images per listing (`listing_id`, `sort_order`,
  `is_primary`).
- `listing_views` — analytics events; server-written only.

### Discovery
- `favorites` — unique `(user_id, listing_id)`; a user cannot favorite a
  listing twice.
- `recommendation_profiles` — per-user preference data (skill, style, weight,
  control/power, budget). Consolidates the spec's `user_preferences` to avoid
  redundant tables.
- `recommendation_events` — behavioral events feeding the Phase 6 recommender.

### Communication
- `inquiries` — `listing_id`, `buyer_id`, `seller_id`, status, subject, message.
- `inquiry_messages` — per-inquiry thread with read state.

### Commerce
- `orders` — `buyer_id`, `seller_id`, `order_number` (unique), status,
  fulfillment type, subtotal/total. Order placement/stock logic is Phase 8.
- `order_items` — historical snapshots (`product_title`, `unit_price`,
  `quantity`) so orders stay stable if listings change.
- `payments` — payment method/reference/status records; no gateway integration
  in Phase 1.
- `fulfillment_details` — private pickup/delivery details, one-to-one with an
  order.

### Ratings / moderation
- `reviews` — `rating` constrained 1–5, `unique (order_id, reviewer_id)`
  prevents duplicates; moderation state.
- `listing_reports`, `disputes`, `dispute_messages`, `dispute_evidence` —
  moderation and dispute lifecycle, historically retained after resolution.

### Notifications / administration
- `notifications` — per-recipient, typed, read state; server-written.
- `admin_actions`, `audit_logs` — admin audit trail; admin-read only.

## Functions and triggers

- `set_updated_at()` — keeps `updated_at` current on all timestamped tables.
- `handle_new_user()` — creates a `profiles` row on `auth.users` insert.
- `is_admin()` — security-definer helper; true when the caller is an active
  admin.
- `auth_seller_id()` — security-definer helper; the caller's
  `seller_profiles.id` or null.
- `prevent_role_escalation()` — blocks role/account-status changes by
  non-admins (defense in depth alongside column grants).
- `admin_set_role()`, `admin_set_account_status()`,
  `admin_set_seller_status()` — admin-only, security-definer state changes.
- `enforce_initial_status()` — normalizes insert states for
  `seller_profiles`, `orders`, `reviews`, `listing_reports`, `disputes`.

## Key constraints

- Money: `numeric(12,2)` with `>= 0` checks.
- `listings.title` length 3–120; `reviews.rating` 1–5;
  `paddle_attributes` scores 1–10.
- `favorites (user_id, listing_id)` unique; `reviews (order_id, reviewer_id)`
  unique; `seller_profiles.user_id` unique; `categories.slug` and
  `brands.slug` unique; `orders.order_number` unique.

## Indexes

Foreign keys and hot query paths are indexed: listing status/category/brand/
condition/price/created_at, seller/order statuses, payment status, inquiry
participants, notification recipient+read, dispute status, and analytics
(event/view) ordering. See `20260809000000_create_marketplace_schema.sql` for
the full list.

## Storage

Buckets: `avatars` (private), `marketplace-products` (public read, owner
write), `dispute-evidence` (private). Object paths are owner-scoped
(`avatars/{user_id}/...`, `marketplace-products/{seller_id}/{listing_id}/...`,
`dispute-evidence/{user_id}/{dispute_id}/...`). Created in
`20260809000001_create_storage_foundation.sql`.

## Known limitation

Migrations cannot be applied in this environment (no Supabase CLI/Docker and
no live project). The SQL is tracked and intended to apply cleanly via
`supabase db reset`; live verification is BLOCKED until tooling/credentials
are provided.
