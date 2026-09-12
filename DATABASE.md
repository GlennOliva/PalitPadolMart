# PalitPaddleBai Mart — Database

## Overview

Supabase PostgreSQL database for the PalitPaddleBai Mart marketplace. The
schema is managed exclusively through tracked migrations in
`supabase/migrations/`. Do not modify the schema by hand outside migrations.

All money is stored as `numeric(12,2)` (no floating point). All timestamps are
`timestamptz` (UTC). Enum values are lowercase.

## Migration workflow

- Migrations live in `supabase/migrations/<timestamp>_<name>.sql`, applied in
  filename order by `supabase db push` (remote) / `supabase db reset` (local).
- The Supabase CLI is available and linked to the hosted "PalitPaddleBai"
  project (ref `mygnxlhimbrmjwtrffbh`); tracked migrations through Phase 11
  have been applied remotely.
- Regenerate client types with
  `supabase gen types typescript --linked > src/types/database.ts`. The
  generated file is committed and must not be hand-edited.
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
| `payment_status` | `pending`, `submitted`, `paid`, `failed`, `refunded`, `partially_refunded`, `rejected` |
| `fulfillment_type` | `pickup`, `delivery` |
| `inquiry_status` | `open`, `answered`, `closed` |
| `dispute_status` | `open`, `under_review`, `resolved`, `closed` |
| `report_status` | `pending`, `under_review`, `resolved`, `dismissed` |
| `refund_status` | `requested`, `approved`, `rejected`, `completed` |
| `refund_method` | `original_method`, `manual_transfer`, `cash_return`, `other` |
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
- `recommendation_events` — behavioral events feeding the Phase 6 recommender
  (view/click logging in `20260809000005_phase6_recommendation_events.sql`).

### Communication
- `inquiries` — `listing_id`, `buyer_id`, `seller_id`, status, subject, message.
- `inquiry_messages` — per-inquiry thread with read state.

### Commerce
- `orders` — `buyer_id`, `seller_id`, `order_number` (unique), status,
  fulfillment type, subtotal/total. Status transitions are gated by the Phase 8
  RPCs (`create_marketplace_order`, `confirm_marketplace_order`,
  `cancel_marketplace_order`, `delete_my_cancelled_order`) which re-validate
  inventory and authorization under `security definer`. Timestamps track each
  transition (`confirmed_at`, `paid_at`, `preparing_at`, `shipped_at`,
  `ready_for_pickup_at`, `completed_at`, `cancelled_at`).
- `order_items` — historical snapshots (`product_title`, `unit_price`,
  `quantity`) so orders stay stable if listings change.
- `payments` — payment method/reference/status records; no gateway integration.
  Phase 9 adds `submitted`/`rejected` and the review flow: the buyer submits a
  method + optional proof/reference/delivery snapshot through `submit_payment`;
  the seller approves or rejects via `review_payment` (with a rejection reason);
  cash methods record as `pending` until the seller calls `mark_cash_received`
  at the handoff. The amount is always derived server-side from the order.
- `seller_payment_methods` — per-seller enable/disable of the three methods
  (`manual_transfer`, `cash_on_pickup`, `cash_on_delivery`) with transfer
  instructions. Buyers read only enabled methods of active sellers.
- `fulfillment_details` — private pickup/delivery details, one-to-one with an
  order. Delivery destinations are snapshotted at payment time; pickup orders
  copy the seller's pickup location/instructions. `courier`/`tracking_number`
  are written by `mark_order_shipped`, and the Phase 9 state machine
  (`start_order_preparation` → `mark_order_shipped` /
  `mark_order_ready_for_pickup` → `confirm_order_received`) by the
  corresponding RPCs.

### Ratings / moderation
- `reviews` — Phase 10 hardened the legacy scaffold into a verified-purchase
  system: one review per **order item** (`order_item_id` unique FK to
  `order_items`), `rating` + `seller_rating` constrained 1–5. The
  reviewer/seller/listing are derived from the order item by the
  `submit_review` RPC; client INSERT is revoked and new reviews publish
  immediately (`status = 'approved'`). Moderation state stays available to
  Phase 13.
- `listing_reports` — private reporter/admin complaints against active listings;
  reporter and listing seller are RPC-derived. Active duplicates are prevented.
- `disputes` — one seller-specific order issue. Buyer/seller/opening identities
  derive from the order; one `open`/`under_review` dispute per order.
- `dispute_messages`, `dispute_evidence` — participant-only conversation and
  private evidence metadata. Evidence objects live in the private
  `dispute-evidence` bucket.
- `refunds` — one full-order manual refund per order/dispute/payment. Amount and
  relationships derive from trusted paid-order rows.
- `dispute_events`, `refund_events` — immutable transition history with trusted
  actor, old/new status, timestamp, and details.

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
- `marketplace_search_listings(...)` — Phase 5 search RPC. `security invoker`,
  single round trip for keyword (title/description/category/brand, LIKE
  wildcards escaped) + category/brand/condition/price/pickup/delivery filters
  + sort + pagination. Only `active`, in-stock listings are returned. See
  `SEARCH_DISCOVERY.md`. Migrations `20260809000003`, `.00004`
  (param rename), `.00006` (wildcard escaping).

### Phase 8/9 order, cart, payment, and fulfillment RPCs

All are `security definer` with `search_path` pinned; they re-derive the
effective buyer/seller from the session and raise structured `CODE: message`
exceptions that `parseOrderError` maps back to typed `OrderErrorCode`s:

- Orders: `create_marketplace_order`, `confirm_marketplace_order`,
  `cancel_marketplace_order`, `delete_my_cancelled_order`,
  `get_my_orders` / `get_seller_orders` (paged), `get_buyer_order` /
  `get_seller_order`.
- Cart + multi-seller checkout: `cart_add_item`, `cart_update_item`,
  `cart_remove_item`, `cart_checkout` (locks inventory rows per seller so
  concurrent checkouts fail cleanly).
- Payments: `submit_payment`, `review_payment` (`approve`/`reject`),
  `mark_cash_received`, plus the steering helpers `payment_is_open`,
  `can_upload_payment_proof`.
- Fulfillment: `start_order_preparation`, `mark_order_shipped` (courier +
  tracking required for delivery), `mark_order_ready_for_pickup`,
  `confirm_order_received` (buyer-only).

### Phase 10 review RPCs

All are `security definer` and raise structured `CODE: message` exceptions
mapped by `parseReviewError`:

- `submit_review(order_item_id, rating, seller_rating, comment)` — the **only**
  way to create a review. Requires a signed-in reviewer who is the buyer of the
  item's **completed** order and not its seller; one review per item (DB
  unique); ratings 1–5; blank comments → `NULL`; new reviews `approved`.
- Aggregates are computed entirely server-side: `listing_review_summary`,
  `seller_review_summary` (averages `seller_rating`), and
  `listing_review_distribution` (exact star counts). These public RPCs are
  granted to `anon, authenticated`.
- Public lists: `listing_reviews(listing_id, page, page_size)` and
  `seller_reviews(seller_id, page, page_size)` return published reviews with
  reviewer name/avatar and `listing_title` — never raw `reviewer_id`,
  `order_id`, or `buyer_id`.

### Phase 10 seller-dashboard RPCs (visibility extension)

Read-only, `security definer`, granted to `authenticated` only. The seller is
**derived from `auth.uid()` via `auth_seller_id()`** — a browser-supplied
seller id is never trusted, so cross-seller access is impossible through this
path (`20260911000000_phase10_seller_review_visibility.sql`):

- `get_my_seller_reviews(page, page_size, rating, sort)` — the caller's own
  `approved` reviews with `reviewer_name`, `reviewer_avatar`, `rating`,
  `seller_rating`, `comment`, `created_at`, `listing_id`, `listing_title`,
  and `listing_image_url` (primary image). Filtering (`p_rating` 1–5) and
  sorting (`newest`/`highest`/`lowest`) are database-side; page size capped at
  20. No email/phone/address/payment/reviewer_id/order_id/buyer_id.
- `get_my_seller_rating_summary()` — `{ review_count, average_rating }` of
  `seller_rating`.
- `get_my_seller_rating_distribution()` — exact `(rating_value,
  review_count)` star breakdown.

### Phase 11 report, dispute, evidence, and refund RPCs

All sensitive Phase 11 writes are RPC-only and derive actor/relationship/status
fields from `auth.uid()` and trusted rows:

- Reports: `submit_listing_report`; future admin tooling uses
  `admin_update_listing_report`.
- Disputes: `open_order_dispute`, `send_dispute_message`,
  `escalate_dispute`, `close_my_dispute`; future admin tooling uses
  `admin_resolve_dispute`.
- Evidence: `register_dispute_evidence` validates an existing private Storage
  object under `{auth.uid()}/{dispute_id}/{generated_uuid}.{extension}`.
- Refunds: `request_refund`, `review_refund`, `complete_refund`. Only full paid
  order amounts are supported; completion marks payment `refunded` and dispute
  `resolved` without changing the order lifecycle or inventory.

See `DISPUTES_AND_REFUNDS.md` and `PHASE11_VERIFICATION.md`.

`seller_payment_methods` is self-service via PostgREST (upsert on
`seller_id`+`method`, column grants restrict which columns the seller may
write); visibility for buyers is restricted by RLS to enabled methods of
active sellers.

## Key constraints

- Money: `numeric(12,2)` with `>= 0` checks.
- `listings.title` length 3–120; `reviews.rating` and `reviews.seller_rating`
  1–5; `paddle_attributes` scores 1–10.
- `favorites (user_id, listing_id)` unique; `reviews.order_item_id` unique;
  `seller_profiles.user_id` unique; `categories.slug` and
  `brands.slug` unique; `orders.order_number` unique.

## Indexes

Foreign keys and hot query paths are indexed: listing status/category/brand/
condition/price/created_at, seller/order statuses, payment status, inquiry
participants, notification recipient+read, dispute status, and analytics
(event/view) ordering. See `20260809000000_create_marketplace_schema.sql` for
the full list.

## Storage

Buckets: `avatars` (private), `marketplace-products` (public read, owner
write), `dispute-evidence` (private), `payment-proofs` (private, Phase 9).
Object paths are owner-scoped
(`avatars/{user_id}/...`, `marketplace-products/{seller_id}/{listing_id}/...`,
`dispute-evidence/{user_id}/{dispute_id}/...`, `payment-proofs/{buyer_id}/{order_id}/...`).
Created in `20260809000001_create_storage_foundation.sql` and
`20260815000100_phase9_payment_and_fulfillment.sql`.

## Known limitation

Migrations have been applied to the hosted project and types generated; Phases
7, 8, 9, and 10 have live security passes (`verify-phase7.mjs`,
`verify-phase8.mjs`, `verify-phase9.mjs`, `verify-phase10.mjs`) that exercise
each RPC and RLS policy per role — see the phase verification docs. Phase 9/10
completed orders and their retained listings are intentionally kept (no client
delete path exists for confirmed/completed transactions).
