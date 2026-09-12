# Phase 8 Hosted Verification (Orders + Cart + Checkout)

`verify-phase8.mjs` runs the Phase 8 order/transaction and cart/checkout
scenarios against the hosted Supabase project.

Hosted verification uses **reusable confirmed test accounts**. The verification
script **does not create Auth users automatically** — it only signs in with
credentials you provide. This prevents email-confirmation blockers and hosted
email-rate-limit issues.

## Credentials

Configure the following local environment variables per account (placeholders
are in `.env.example`; real values live only in the gitignored `.env.local`):

| Role     | Email var                    | Password var                        | Required |
| -------- | ---------------------------- | ----------------------------------- | -------- |
| Seller   | `PHASE7_TEST_SELLER_EMAIL`   | `PHASE7_TEST_SELLER_PASSWORD`       | Yes      |
| Buyer A  | `PHASE7_TEST_BUYER_EMAIL`    | `PHASE7_TEST_BUYER_PASSWORD`        | Yes      |
| Stranger | `PHASE7_TEST_STRANGER_EMAIL` | `PHASE7_TEST_STRANGER_PASSWORD`     | Yes      |
| Buyer B  | `PHASE8_TEST_BUYER_B_EMAIL`  | `PHASE8_TEST_BUYER_B_PASSWORD`      | Yes      |
| Seller B | `PHASE8_TEST_SELLER_B_EMAIL` | `PHASE8_TEST_SELLER_B_PASSWORD`     | Optional |

The accounts must already exist in Supabase Auth and be **confirmed** (email
confirmation stays enabled; production auth behavior is never modified to make
verification pass).

## Run

```bash
node verify-phase8.mjs
```

If any **required** credential is missing the script exits cleanly with a
`SKIPPED` message and the list of variables to configure — it never falls back
to `auth.signUp()`.

**Seller B is optional.** When `PHASE8_TEST_SELLER_B_EMAIL`/`PASSWORD` are not
set (or sign-in fails), only the multi-seller checkout section is skipped; every
other check still runs.

## What it verifies

### Orders and transactions

- A buyer places a valid order; the buyer/seller are derived from `auth.uid()`
  and the trusted listing row; `order_items` snapshot the unit price.
- Inventory decrements atomically; zero-stock listings flip to `sold`; a sold
  listing rejects further purchases; inventory never goes negative.
- Buyers/sellers/strangers read only rows they are allowed to; direct forged
  inserts and status forgery are rejected; the seller confirms pending orders;
  cancellation restores inventory exactly once; the buyer-only delete removes
  cancelled orders without re-restoring stock.
- Concurrent purchases of one unit allow exactly one success.

### Cart and checkout

- Cart RLS: a cart and its lines are buyer-scoped; other buyers and strangers
  cannot read, update, delete, or insert into them; only the owner's direct
  delete is allowed.
- `add_to_cart` validates (missing/draft/zero-stock listings, self-purchase,
  anonymous callers, quantity bounds), clamps to live stock, and increments an
  existing line instead of duplicating it.
- `update_cart_item_quantity` is ownership-checked, clamps to live stock, and
  re-validates availability (archived listings are rejected).
- `checkout_cart` rejects empty selections, >100 items, unknown lines, missing
  or unoffered fulfillment choices, price spoofing (`PRICE_CHANGED`), and stock
  drops between add and checkout — leaving inventory and the cart untouched.
- A successful checkout creates one order per seller with snapshot items,
  decrements stock, removes only the checked-out lines, and keeps unselected
  lines in the cart.
- With Seller B configured, one checkout across two sellers produces two orders
  (one per seller), each with its own fulfillment and totals.

## Test data isolation and cleanup

Each run uses a unique id in listing titles so reruns never collide. At the end
the script cancels+deletes every pending order it created (restoring stock),
deletes the leftover cart lines through the owner's RLS delete path, deletes
every listing it created (cascading to their cart lines), and signs out the
local sessions.

**Auth accounts are never created or deleted** — they remain intact for future
verification runs.

One confirmed order and its listing are intentionally **retained** because Phase
8 has no client-side delete path for confirmed transactions (the listing row
must survive to satisfy the `order_item` FK); the script prints their ids.

## Rules

- Never disable email confirmation to make verification pass.
- Never weaken RLS. The verification proves the existing security works.
- Never print or commit credentials or the service-role key.
