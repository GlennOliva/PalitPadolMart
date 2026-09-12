# Phase 9 Hosted Verification (Payment Status + Fulfillment)

`verify-phase9.mjs` runs the Phase 9 payment and fulfillment scenarios against
the hosted Supabase project.

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
| Buyer    | `PHASE7_TEST_BUYER_EMAIL`    | `PHASE7_TEST_BUYER_PASSWORD`        | Yes      |
| Stranger | `PHASE7_TEST_STRANGER_EMAIL` | `PHASE7_TEST_STRANGER_PASSWORD`     | Yes      |
| Buyer B  | `PHASE8_TEST_BUYER_B_EMAIL`  | `PHASE8_TEST_BUYER_B_PASSWORD`      | Optional |
| Seller B | `PHASE8_TEST_SELLER_B_EMAIL` | `PHASE8_TEST_SELLER_B_PASSWORD`     | Optional |

The accounts must already exist in Supabase Auth and be **confirmed** (email
confirmation stays enabled; production auth behavior is never modified to make
verification pass). The seller account must already be an **active seller**.

**Buyer B and Seller B are optional** cross-actor accounts. When they are not
configured, the cross-buyer/cross-seller denial checks and the multi-seller
independence section `SKIP`; the rest of the suite still runs against the three
required accounts.

## Run

```bash
node verify-phase9.mjs
```

If any **required** credential is missing the script exits cleanly with a
`SKIPPED` message and the list of variables to configure — it never falls back
to `auth.signUp()`.

## Status

Last full run against the hosted project (ref `mygnxlhimbrmjwtrffbh`):
**ALL PASS** — every section including the cross-seller denials and the
multi-seller independence checks (all Phase 7/8 accounts configured). The
Phase 8 and Phase 7 scripts also pass (`node verify-phase8.mjs`,
`node verify-phase7.mjs`). The Phase 9 fix migration
(`20260816000000_phase9_fix_payment_enum_and_method_visibility.sql`) is applied
remotely and `src/types/database.ts` was regenerated, so the types
(`payment_status` `submitted`/`rejected`, `seller_is_active`) match the live
schema.

## What it verifies

### Pending-order guards

- `submit_payment` and `start_order_preparation` reject orders that are not yet
  confirmed (`INVALID_ORDER_STATUS`, `ORDER_NOT_PREPARABLE`).
- `can_upload_payment_proof` / `payment_is_open` are `false` for pending orders.

### Manual transfer happy path (delivery)

- `submit_payment` requires a confirmed order, a buyer-owned proof path
  (`INVALID_PAYMENT_PROOF` for foreign paths), proof for manual transfers
  (`PAYMENT_PROOF_REQUIRED`), and a complete delivery destination
  (`DELIVERY_ADDRESS_REQUIRED`). Disabled seller methods are unavailable
  (`PAYMENT_METHOD_UNAVAILABLE`) and cash methods must match the order
  fulfillment (`INVALID_PAYMENT_METHOD`).
- A valid submit records the payment as `submitted` with the trusted order
  amount and snapshots the delivery destination into `fulfillment_details`.
- `review_payment` guards: invalid decision (`INVALID_DECISION`), buyer review
  (`FORBIDDEN`), rejection without a reason (`REJECTION_REASON_REQUIRED`).
  A rejection leaves the order `confirmed` so the buyer can resubmit.
- Approval moves payment → `paid` and order → `paid` (with `paid_at`);
  `payment_is_open` flips to `false`.
- `start_order_preparation` is blocked before verification (`PAYMENT_NOT_PAID`
  for a manual payment still in review) and then moves the order to
  `preparing`.
- `mark_order_shipped` guards: `TRACKING_REQUIRED` (no courier/tracking),
  `ORDER_NOT_SHIPPABLE` (not preparing), `WRONG_FULFILLMENT_TYPE` on pickup
  orders — and stores courier + tracking number on success.
- `confirm_order_received` is buyer-only (`FORBIDDEN` for strangers) and
  completes the order with `completed_at`.

### Cash pickup happy path

- `submit_payment` rejects `cash_on_delivery` for pickup orders and proof
  uploads on cash methods (`INVALID_PAYMENT_PROOF`).
- A valid cash submit records the payment as `pending` (no proof) and copies
  the seller's pickup location/instructions into `fulfillment_details`.
- `mark_cash_received` is blocked before the handoff (`CASH_NOT_READY`), while
  `mark_order_ready_for_pickup` is blocked before preparing
  (`ORDER_NOT_READYABLE`) and on delivery orders (`WRONG_FULFILLMENT_TYPE`).
- Completion is blocked while the payment is still pending
  (`PAYMENT_NOT_PAID`); after the seller records the collected cash, a second
  collection fails (`PAYMENT_NOT_COLLECTABLE`) and the buyer completes the order.

### RLS hardening

- Payments, fulfillment details, and orders are readable only by participants;
  strangers read none of them.
- `seller_payment_methods` is self-service: the seller sees all three of their
  methods; buyers see only enabled methods of active sellers; disabling a method
  makes it unavailable at submit time and is restored by the script.
- Proof storage is buyer-owned: uploads succeed only in `{buyer}/{order}/...`
  for a confirmed order; wrong-folder, pending-order, and stranger uploads are
  rejected. The generated upload path is asserted to follow the exact
  `{buyer}/{order}/{file}` RLS contract. The owning seller can open a signed
  URL; strangers cannot. The buyer can delete/replace their proof while the
  payment is open.
- Proof uploads to a **cancelled** order are denied (a cancelled order is no
  longer payable), matching the pending-order denial.

## Test data isolation and cleanup

Each run uses a unique id in listing titles so reruns never collide. At the end
the script cancels+deletes the pending order it created (restoring stock),
deletes the listing that only backed that order, removes any deletable proof
objects, re-enables any seller methods it disabled, and signs out the local
sessions.

**Auth accounts are never created or deleted** — they remain intact for future
verification runs.

The two happy-path orders end **completed** and are intentionally **retained**
because Phase 9 has no client-side delete path for confirmed/completed
transactions (the listing row must survive to satisfy the `order_item` FK, and
`payments`/`fulfillment_details` are RPC-managed with no client deletes); the
script prints the retained order and listing ids.

## Rules

- Never disable email confirmation to make verification pass.
- Never weaken RLS. The verification proves the existing security works.
- Never print or commit credentials or the service-role key.
