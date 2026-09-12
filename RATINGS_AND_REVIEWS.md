# Ratings and Reviews (Phase 10)

Verified-purchase, per-order-item ratings for both the **product** (`listing`)
and the **seller**, published immediately (`status = 'approved'`). The SQL-side
guards are proven live by `verify-phase10.mjs` against the hosted project (see
`PHASE10_VERIFICATION.md`).

## Domain model

Reviews live on the existing `reviews` table, one row per
**order item** (`order_item_id` has a DB `UNIQUE` constraint):

| Column | Meaning |
| ------ | ------- |
| `order_item_id` | which purchased item this review is about (DB-unique) |
| `order_id` | the completed order that produced the item |
| `reviewer_id` | the buyer (`auth.uid()`) — derived, not client-supplied |
| `seller_id` | the seller of the item — derived from the order item |
| `listing_id` | the listing — derived from the order item |
| `rating` (1–5) | product rating |
| `seller_rating` (1–5) | seller rating |
| `comment` | optional, ≤ 2000 chars, blank → `NULL` |
| `status` | always `'approved'` until the Phase 13 moderation UI lands |

The reviewer/seller/listing are **never accepted from the client**: the RPC
reads them from the order item that the buyer really purchased.

## Rules (enforced server-side by `submit_review`)

- The order must be **completed** (`ORDER_NOT_COMPLETED` otherwise).
- Only the **buyer** may review their own order item (`FORBIDDEN` otherwise;
  this includes every other account — strangers, other buyers, and even the
  seller of the item).
- A seller can never review their own listing
  (`SELLER_SELF_REVIEW_NOT_ALLOWED`). This branch is defense-in-depth and
  effectively **unreachable through the public API**: Phase 8 already forbids
  self-purchase (`SELF_PURCHASE_NOT_ALLOWED`), so no account with a seller
  profile for an item can ever complete a purchase of that item.
- One review per order item: the second attempt fails with
  `REVIEW_ALREADY_EXISTS` (backed by the DB unique constraint, so it holds even
  if two requests race).
- Ratings are 1–5 (`INVALID_RATING`, `INVALID_SELLER_RATING`); comments over
  2000 characters are rejected (`INVALID_REVIEW_TEXT`); signed-in users only
  (`AUTH_REQUIRED`); unknown items fail fast (`ORDER_ITEM_NOT_FOUND`).

## RPCs

All are `SECURITY DEFINER`. The public list/summary RPCs are granted to
`anon, authenticated` and return only published review data — reviewer
name/avatar and listing title — never `reviewer_id`, `order_id`, or
`buyer_id`. The seller-dashboard RPCs are granted to `authenticated` only.

| RPC | Purpose |
| --- | ------- |
| `submit_review(order_item_id, rating, seller_rating, comment)` | create the verified review (all rules above) |
| `listing_review_summary(listing_id)` | `{ review_count, average_rating }` for approved reviews |
| `seller_review_summary(seller_id)` | `{ review_count, average_rating }` (average of `seller_rating`) |
| `listing_review_distribution(listing_id)` | exact `(rating_value, review_count)` star breakdown |
| `listing_reviews(listing_id, page, page_size)` | paginated public reviews for a listing (with `listing_title`) |
| `seller_reviews(seller_id, page, page_size)` | paginated public reviews for a seller (with `listing_title`) |
| `get_my_seller_reviews(page, page_size, rating, sort)` | **seller dashboard**: the seller's own approved reviews; seller derived from `auth.uid()` |
| `get_my_seller_rating_summary()` | **seller dashboard**: `{ review_count, average_rating }` for the authenticated seller |
| `get_my_seller_rating_distribution()` | **seller dashboard**: exact 5→1 star breakdown for the authenticated seller |

Aggregates are computed entirely server-side — the UI never derives rating math
from a partially fetched page.

### Seller-side visibility (Phase 10 extension)

Seller A can read the reviews customers left for Seller A's products/orders
from `/seller/reviews` (Seller Dashboard → Customer reviews). The three
`get_my_seller_*` RPCs **derive the seller from `auth.uid()`** via
`auth_seller_id()` — the browser can never supply a seller id, so Seller B can
never query Seller A's review data through the seller dashboard path.

- Results include: reviewer safe display name (`coalesce(display_name,
  'Verified Buyer')`), reviewer avatar, `rating` + `seller_rating`, `comment`,
  `created_at`, `listing_id`, `listing_title`, and `listing_image_url`
  (primary image) — all sources the RLS-approved public rows expose.
- **Never exposed to the seller:** email, phone, delivery address, payment
  reference/proof, auth metadata, `reviewer_id`, `order_id`, `buyer_id`.
- Only `approved` reviews are returned; `pending`/`rejected`/`hidden` are
  excluded exactly like the public lists.
- Filtering (`p_rating` 1–5) and sorting (`newest`, `highest`, `lowest`) are
  applied database-side; `get_my_seller_reviews` caps each page at 20.
- Reviews are **read-only** for the seller. Direct `UPDATE`/`DELETE` on
  `reviews` via RLS silently match zero rows (admin-only), so the seller
  cannot edit the rating/text, change ownership (`reviewer_id`) or subject
  (`listing_id`), flip Verified Purchase, or reset the status. The customer
  owns the review; moderation is deferred to Phase 13.

## Security

- Client `INSERT` on `reviews` is **revoked** (`revoke insert from anon,
  authenticated`); the legacy `reviews_insert_reviewer` policy and the
  `reviews_force_pending` normalization trigger were dropped.
- `SELECT` RLS stays `status = 'approved' OR reviewer_id = auth.uid() OR
  is_admin()`: published reviews are public storefront data; non-approved rows
  remain reviewer/admin-only for Phase 13 moderation.
- `UPDATE`/`DELETE` stay admin-only (the buyer cannot edit or retract a review,
  and the seller cannot edit or remove a customer review).
- The `submit_review` signature has exactly the four arguments — there is no
  amount/price, no subject, no client-controlled field of any kind.
- New reviews are immutable by the reviewer; removal/moderation is deferred to
  the Phase 13 admin tooling.
- The seller-dashboard RPCs are `security definer` and scoped by
  `auth_seller_id()`, so cross-seller access through the new path is
  impossible even if a client mails a crafted seller id.

## Frontend

- Feature layer: `src/features/reviews/` (`reviews.service.ts`,
  `reviews.types.ts`, `reviews-validation.ts`). Errors parse like the order
  errors (`parseReviewError` → typed `ReviewRpcError` with
  `reviewErrorLabel` for display).
- Components: `src/components/reviews/` — `StarRating` (read-only stars),
  `StarRatingInput` (radio-group input, accessible name via `aria-label` +
  `role="radiogroup"`), `RatingSummary`, `RatingDistribution`,
  `ReviewCard`, `ReviewList`, `ReviewSection` (listing page),
  `SellerReviewsPanel` (public seller profile), `ReviewForm`.
- Review entry lives on the buyer order detail page: each item of a
  **completed** order gets a `Review this item` link (or a `✓ Reviewed` note
  once done) routing to `/orders/:orderId/review/:orderItemId`.
- The listing detail page shows `ReviewSection` (summary + distribution +
  paginated reviews); the public seller profile shows `SellerReviewsPanel`
  with its own aggregate header.
- Seller dashboard metrics and the public seller profile now surface the
  `seller_rating` aggregate (guarding the older `rating`-only schema).
- **Seller dashboard reviews page** (`/seller/reviews`,
  `src/pages/seller/SellerReviewsPage.tsx`): a glass summary card (`Overall
  Rating`, `RatingDistribution`, verified review count) plus flat read-only
  review cards (customer name, product title linked to the listing, stars,
  review text, Verified Purchase, date). Lightweight rating filter +
  newest/highest/lowest sort are applied database-side; "Load more" pages
  through `get_my_seller_reviews`. The empty state reads "No customer
  reviews yet"; failures show "We couldn't load your reviews right now."
- Seller navigation lives on the dashboard's action links (`Customer
  reviews` → `/seller/reviews`); the route is protected by `SellerRoute`
  like the other seller pages.