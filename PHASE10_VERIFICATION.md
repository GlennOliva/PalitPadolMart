# Phase 10 Hosted Verification (Ratings + Reviews)

`verify-phase10.mjs` runs the Phase 10 verified-purchase review scenarios
against the hosted Supabase project.

Hosted verification uses **reusable confirmed test accounts**. The verification
script **does not create Auth users automatically** — it only signs in with
credentials you provide. This prevents email-confirmation blockers and hosted
email-rate-limit issues.

## Credentials

Same reusable accounts as Phases 7–9 (placeholders are in `.env.example`; real
values live only in the gitignored `.env.local`):

| Role     | Email var                    | Password var                        | Required |
| -------- | ---------------------------- | ----------------------------------- | -------- |
| Seller   | `PHASE7_TEST_SELLER_EMAIL`   | `PHASE7_TEST_SELLER_PASSWORD`       | Yes      |
| Buyer    | `PHASE7_TEST_BUYER_EMAIL`    | `PHASE7_TEST_BUYER_PASSWORD`        | Yes      |
| Stranger | `PHASE7_TEST_STRANGER_EMAIL` | `PHASE7_TEST_STRANGER_PASSWORD`     | Yes      |
| Buyer B  | `PHASE8_TEST_BUYER_B_EMAIL`  | `PHASE8_TEST_BUYER_B_PASSWORD`      | Optional |
| Seller B | `PHASE8_TEST_SELLER_B_EMAIL` | `PHASE8_TEST_SELLER_B_PASSWORD`     | Optional |

Accounts must already exist and be **confirmed** (email confirmation stays
enabled; production auth behavior is never modified to make verification pass).
The seller account must already be an **active seller**.

**Buyer B and Seller B are optional** cross-actor accounts. Without them the
cross-buyer / cross-seller checks `SKIP`; the rest of the suite still runs
against the three required accounts.

## Run

```bash
node verify-phase10.mjs
```

Run the hosted verifiers **one at a time** because they share accounts:

```bash
node verify-phase7.mjs && node verify-phase8.mjs && node verify-phase9.mjs && node verify-phase10.mjs
```

If any **required** credential is missing the script exits cleanly with a
`SKIPPED` message and the list of variables to configure — it never falls back
to `auth.signUp()`.

## Status

Last full run against the hosted project (ref `mygnxlhimbrmjwtrffbh`):
**ALL PASS** — every section including the cross-buyer / cross-seller checks
and the Phase 10 extension **seller-side review visibility** section (all
Phase 7/8 accounts configured). Phases 7, 8, and 9 also pass sequentially.

The `20260907000300_phase10_fix_submit_review_rowtype_bindings.sql` fix
migration is applied remotely. The original `submit_review` used
`SELECT ... INTO %rowtype` with a column subset, which PL/pgSQL assigns
**by position**; the mismatch silently misbound `order_items` columns (e.g.
`product_title` into the `reviews.seller_id` slot) and every insert failed with
a uuid cast error. The fix rewrites the function with explicit scalar variables
per attribute — no rowtype positional binding — preserving the exact signature,
error codes, and behavior. `src/types/database.ts` was regenerated (review
schema + RPCs).

The Phase 10 extension migration
`20260911000000_phase10_seller_review_visibility.sql` is applied remotely. It
adds the auth-derived, read-only seller-dashboard RPCs
(`get_my_seller_reviews`, `get_my_seller_rating_summary`,
`get_my_seller_rating_distribution`); `src/types/database.ts` was regenerated.

## What it verifies

### Completed orders through the real Phase 8/9 workflow

- Two orders (delivery + manual-transfer proof; pickup + cash) are driven to
  `completed` using `create_marketplace_order`, `confirm_marketplace_order`,
  `submit_payment`, `review_payment`, `start_order_preparation`,
  `mark_order_shipped` / `mark_order_ready_for_pickup`,
  `mark_cash_received`, `confirm_order_received` — never via service role or a
  direct status update.

### Verified review happy path

- `submit_review` creates a published (`approved`) review whose
  reviewer/seller/listing **derive from the order item** — a spoofed
  `reviewer_id`/`seller_id` cannot change the subject.
- One review per order item: duplicates fail with `REVIEW_ALREADY_EXISTS`
  (concurrent-safe via the DB unique constraint).
- Published reviews are readable by the buyer, strangers, and anonymous
  visitors (public storefront data).

### Second item + comment normalization

- A different item of the same buyer is independently reviewable.
- A blank comment is stored as `NULL`; the second review still satisfies
  one-review-per-item.

### Validation and authorization guards

`AUTH_REQUIRED` (anonymous), `ORDER_ITEM_NOT_FOUND` (unknown item),
`ORDER_NOT_COMPLETED` (pending order item), `FORBIDDEN` (stranger **and** the
item's own seller), `INVALID_RATING` / `INVALID_SELLER_RATING` (0, 6, null),
`INVALID_REVIEW_TEXT` (> 2000 chars). The seller self-review census branch
(`SELLER_SELF_REVIEW_NOT_ALLOWED`) is documented rather than exercised:
Phase 8 already forbids self-purchase, so it is unreachable through the public
API.

### Server-side aggregates

- `listing_review_summary` counts only approved reviews and averages `rating`;
  `seller_review_summary` averages `seller_rating`.
- `listing_review_distribution` returns the exact star breakdown.
- `listing_reviews` / `seller_reviews` return published reviews with a reviewer
  name/avatar and `listing_title` — and **no** `reviewer_id`, `order_id`, or
  `buyer_id` columns. Pagination returns pages without overlap or loss.
- Seller aggregates are cumulative across verifier runs (shared seller
  account), so the expected counts are derived from the underlying public
  approved rows and compared to the RPC output.

### Direct-attack / RLS hardening

- Direct `reviews` INSERT is denied for the buyer, a stranger, and anonymous
  (revoked), while `.update()` / `.delete()` by the buyer silently match zero
  rows — the review row's rating and presence are unchanged afterwards.
- A completed order's status/total are untouched by the review submit.
- The order item that backs a review cannot be changed through the API
  (`submit_review` binds by `order_item_id`).

### Seller-side review visibility (Phase 10 extension)

- The auth-derived `get_my_seller_*` RPCs are callable by the seller and the
  seller **sees exactly their own approved reviews** (count + which rows match
  the run's listing).
- The seller list exposes **no private customer fields** — no email, phone,
  address, payment reference/proof, `reviewer_id`, `order_id`, or `buyer_id`;
  only safe identity (`reviewer_name`/avatar), product info, ratings, comment,
  and date.
- `get_my_seller_rating_summary` matches the public approved rows exactly
  (count + `seller_rating` average).
- `get_my_seller_rating_distribution` matches the public approved rows per star
  exactly.
- Rating filter (5-star only) and sort (`highest` rating) are applied
  database-side; pagination returns pages without overlap or loss.
- **Seller read-only:** direct `UPDATE` (rating), `DELETE`, and reassignment
  (`reviewer_id`/`listing_id`) attempts against a review silently match zero
  rows via RLS — the row, its rating, ownership, and listing are unchanged.
  The seller can never edit/remove/de-own a customer review.
- **Multi-seller isolation:** when Seller B is configured, Seller B's
  `get_my_seller_reviews` contains no Seller A review ids, and Seller B's
  summary + list match Seller B's own public approved rows.

## Test data isolation and cleanup

Each run uses a unique id in listing titles so reruns never collide. At the end
the script cancels + deletes the pending order it created (restoring stock),
deletes the listing that only backed that order, removes the deletable proof
object, and signs out the local sessions.

**Auth accounts are never created or deleted** — they remain intact for future
verification runs.

The two happy-path orders end **completed** and are intentionally **retained**
(Phase 9 has no client-side delete path for confirmed/completed transactions;
the retained listing must survive for the `order_items` FK and reviews). The
script prints the retained listing id.

## Rules

- Never disable email confirmation to make verification pass.
- Never weaken RLS. The verification proves the existing security works.
- Never print or commit credentials or the service-role key.