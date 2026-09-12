# Payments and Fulfillment (Phase 9)

How payment submission, seller review, proof storage, and order fulfillment
work end-to-end. Describes the **Phase 9** payment-status and fulfillment layer
on top of the Phase 8 order/transaction system; the SQL-side guards are proven
live by `verify-phase9.mjs` against the hosted project (see
`PHASE9_VERIFICATION.md`).

## Domain model

- `payments` — one row per order (`payment_status`, `payment_method`,
  `payment_reference`, `proof_path`, `rejection_reason`, `paid_at`). The
  **amount is always derived from the order row**; the client never sends a
  price.
- `seller_payment_methods` — per-seller enable/disable of `manual_transfer`,
  `cash_on_pickup`, `cash_on_delivery` plus transfer instructions. Buyers only
  ever see enabled methods of active sellers.
- `fulfillment_details` — one-to-one with an order: the delivery destination
  snapshot (captured at payment time) or the seller's pickup location /
  instructions, plus `courier` / `tracking_number`.

### Payment statuses

`pending` (cash, awaiting collection) · `submitted` (manual transfer, awaiting
seller review) · `paid` · `rejected` (buyer may resubmit) · `failed` ·
`refunded` · `partially_refunded`.

### Order statuses with the Phase 9 transitions

```
pending --confirm--> confirmed
confirmed --submit_payment--> {manual: payment submitted; cash: payment pending}
confirmed + paid --> preparing        (seller: start_order_preparation)
preparing --delivery--> shipped       (seller: mark_order_shipped w/ courier+tracking)
preparing --pickup --> ready_for_pickup
shipped | ready_for_pickup --confirm_order_received--> completed  (buyer)
pending --cancel--> cancelled         (buyer or seller; restores stock)
```

`submitted` / `pending` payments may be `rejected` (submission) or `paid`
(collection/approval) by the seller before the order moves to `preparing`.

## Buyer flow

Pages: `BuyerOrderDetailPage` + `BuyerPaymentPanel`. Service:
`src/features/orders/payments.service.ts` (`submit_payment`,
`uploadPaymentProof`, `paymentProofUrl`).

1. A confirmed order opens the payment panel with the seller's **enabled**
   methods. Pickup orders prefer `cash_on_pickup`, delivery orders prefer
   `cash_on_delivery`, then `manual_transfer`.
2. **Manual transfer**: upload a proof (JPG/PNG/WebP/PDF, ≤ 5 MB) into the
   private `payment-proofs` bucket at `{buyer}/{order}/{proof-<ts>}` via
   `can_upload_payment_proof`; optionally add a reference. Submitting records
   the payment as `submitted`.
3. **Cash**: no proof/reference. For pickup the seller's pickup
   location/instructions are copied into `fulfillment_details`; the payment is
   recorded as `pending`.
4. **Delivery**: the buyer fills the delivery destination, which is snapshotted
   into `fulfillment_details` on submit.
5. If rejected, the buyer sees the rejection reason and can correct and
   resubmit (`Submit corrected payment`). Proof replacement while the payment
   is open is allowed.

Client-side validation lives in `payments-validation.ts`; the RPC re-validates
everything and raises typed `OrderErrorCode`s such as `PAYMENT_PROOF_REQUIRED`,
`INVALID_PAYMENT_PROOF`, `DELIVERY_ADDRESS_REQUIRED`, and
`PAYMENT_METHOD_UNAVAILABLE`.

## Seller flow

Pages: `SellerOrderDetailPage` + `SellerPaymentPanel` + `SellerFulfillmentActions`.
Services: `payments.service.ts` (`review_payment`, `mark_cash_received`),
`fulfillment.service.ts` (preparation/ship/ready/pickup RPCs).

- While the buyer has not submitted: the panel shows a notice.
- `submitted` (manual transfer): **Approve** (`review_payment approve`) or
  **Reject** with a required reason (`review_payment reject`,
  `REJECTION_REASON_REQUIRED`). Approval sets payment + order to `paid`.
- Cash handoff: when `cashIsCollectable` (a pending `cash_on_pickup` /
  `cash_on_delivery` order that is `ready_for_pickup` / `shipped`), the panel
  offers **Mark cash received** (`mark_cash_received`,
  `CASH_NOT_READY` until then).
- Fulfillment actions appear by state:
  - `confirmed`/`paid` → **Start preparation** (`start_order_preparation`).
  - `preparing` + pickup → **Mark ready for pickup**
    (`mark_order_ready_for_pickup`).
  - `preparing` + delivery → **Mark as shipped** with courier + tracking
    number (`mark_order_shipped`; `TRACKING_REQUIRED` if either is blank,
    `WRONG_FULFILLMENT_TYPE` if used on the wrong fulfillment type).
- The buyer confirms receipt on a `paid` `shipped` / `ready_for_pickup` order
  (`confirm_order_received`, buyer-only) to complete it.

## Multi-seller independence

Every order RPC re-derives the effective participant from the session; Seller A
can never prepare/ship/review Seller B's order (`FORBIDDEN`), and Buyer A can
never confirm or resubmit Buyer B's order. This is proven by the verification
script's cross-seller/cross-buyer denials and the multi-seller independence
section, and pinned at the UI layer by
`tests/unit/MultiSellerOrderSafety.test.tsx` (per-order/payment wiring) plus
`tests/unit/fulfillment.service.test.ts` (RPC assembly).

## Errors and mapping

The phase 8/9 RPCs `raise exception 'CODE: message'`; `parseOrderError`
(`orders.service.ts`) turns them into typed `OrderRpcError`s and
`orderErrorLabel` provides user-facing copy. Phase 9-specific codes include:
`PAYMENT_NOT_FOUND`, `PAYMENT_NOT_SUBMITTED`, `PAYMENT_NOT_COLLECTABLE`,
`PAYMENT_NOT_PAID`, `PAYMENT_NOT_READY`, `PAYMENT_ALREADY_PAID`,
`PAYMENT_METHOD_UNAVAILABLE`, `INVALID_PAYMENT_METHOD`,
`PAYMENT_PROOF_REQUIRED`, `INVALID_PAYMENT_PROOF`, `INVALID_REFERENCE`,
`DELIVERY_ADDRESS_REQUIRED`, `INVALID_DELIVERY_ADDRESS`,
`REJECTION_REASON_REQUIRED`, `INVALID_REJECTION_REASON`, `INVALID_DECISION`,
`WRONG_FULFILLMENT_TYPE`, `TRACKING_REQUIRED`, `INVALID_TRACKING`,
`CASH_NOT_READY`, plus the fulfillment states `ORDER_NOT_PREPARABLE`,
`ORDER_NOT_SHIPPABLE`, `ORDER_NOT_READYABLE`, `ORDER_NOT_COMPLETABLE`.

## Storage and RLS

- `payment-proofs` bucket is private; paths are buyer-scoped
  (`{buyer_id}/{order_id}/...`). Uploads require a confirmed order that is open
  for payment. The owning seller may open a signed URL; strangers cannot. The
  buyer may replace/delete their proof while the payment is open.
- `orders`, `payments`, `fulfillment_details`, `order_items` have **no client
  write policies**; all writes go through the `security definer` RPCs.

## Test coverage

- Service/validation: `tests/unit/fulfillment.service.test.ts`,
  `tests/unit/orders-validation.test.ts`, `tests/unit/payments.service.test.ts`,
  `tests/unit/payments-validation.test.ts`.
- Components/pages: `tests/unit/BuyerPaymentPanel.test.tsx`,
  `tests/unit/SellerPaymentPanel.test.tsx`,
  `tests/unit/SellerFulfillmentActions.test.tsx`,
  `tests/unit/BuyerOrderDetailPage.test.tsx`,
  `tests/unit/SellerOrderDetailPage.test.tsx`,
  `tests/unit/OrderTimeline.test.tsx`.
- Cross-actor safety: `tests/unit/MultiSellerOrderSafety.test.tsx`.
- Hosted DB proof: `verify-phase9.mjs` (see `PHASE9_VERIFICATION.md`).