# Complaints, Disputes, and Refunds

Phase 11 adds listing reports, seller-specific order disputes, participant
messages, private evidence, immutable event history, and full-order manual
refund tracking.

## Trust Boundary

All sensitive writes use `security definer` RPCs with a pinned `search_path`.
The browser never chooses reporter, buyer, seller, sender, uploader, admin,
payment, order, status, or audit actor fields. Direct client INSERT/UPDATE/
DELETE privileges are revoked from the Phase 11 tables.

## Listing Reports

Authenticated active accounts can report active listings they do not own using
`submit_listing_report`. One active (`pending` or `under_review`) report is
allowed per reporter/listing pair. Reports are private to the reporter and
admins; the reported seller does not receive the report row.

Admin report transitions are provided by `admin_update_listing_report` for
future Phase 13 tooling. Non-admin execution is denied.

## Order Disputes

A dispute belongs to exactly one seller-specific order. Only that order's buyer
can call `open_order_dispute`. Supported order states are:

`confirmed`, `paid`, `preparing`, `shipped`, `ready_for_pickup`, `completed`.

`pending`, `cancelled`, and `disputed` are not eligible. The dispute does not
rewrite the order status because order and dispute lifecycles are independent.
Only one active (`open` or `under_review`) dispute is permitted per order.

Participants can call `send_dispute_message` while active. Either participant
can call `escalate_dispute`; only the buyer can call `close_my_dispute`, and an
active refund blocks closure. `admin_resolve_dispute` exists for later admin
tooling and writes an auditable resolution.

## Evidence

`dispute-evidence` is private. Upload paths must be:

```text
{auth.uid()}/{dispute_id}/{generated_uuid}.{jpg|jpeg|png|webp|pdf}
```

Files are limited to 5 MB and JPEG, PNG, WebP, or PDF. Upload requires an active
dispute and participant membership. `register_dispute_evidence` validates the
existing object, exact actor path, MIME, size, and safe original filename before
creating immutable metadata. Participants and authorized admins can read via
short-lived signed URLs; anonymous and unrelated users cannot.

Registered objects cannot be overwritten or deleted by participants. A user
may remove only their own unregistered orphan while the dispute is active.

## Refunds

Refunds are full-order only. `request_refund` requires an active dispute and a
`paid` payment, then derives the trusted payment amount and all relationship
fields. Partial amounts and amounts above the paid value are rejected.

The owning seller reviews a request through `review_refund` (`approve` or
`reject`; rejection requires a reason). Approved refunds are completed with
`complete_refund` only after the seller has manually returned funds outside the
marketplace. Completion records method, optional reference/notes, sets payment
status to `refunded`, and resolves the dispute.

No payment gateway call, stock restoration, order-status rewrite, or automatic
money movement occurs. Those behaviors are intentionally outside Phase 11.

## Audit History

`dispute_events` and `refund_events` are append-only from the browser's
perspective. RPCs write actor, event type, old/new status, timestamp, and safe
details in the same transaction as the state change. Transaction, moderation,
and evidence history is retained rather than hard-deleted.

## Application Routes

- `/disputes` and `/disputes/:disputeId`: buyer list and detail.
- `/orders/:orderId/dispute`: buyer dispute creation.
- `/seller/disputes` and `/seller/disputes/:disputeId`: seller list and detail.
- Buyer/seller order detail pages link to the existing dispute or offer the
  eligible buyer creation flow.

See `PHASE11_VERIFICATION.md` for hosted checks and the remaining manual
acceptance checklist.
