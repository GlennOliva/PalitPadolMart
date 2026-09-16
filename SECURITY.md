# PalitPaddleBai Mart — Security

## Threat model summary

The application is Supabase-first: Postgres (RLS), Auth, and Storage are the
security boundary. The browser client uses only the publishable anon key; all
authorization decisions are enforced in the database, never merely in the UI.

## Roles and identities

- `anon` — guests (browsing, no session).
- `authenticated` — signed-in users.
- `service_role` — server-side flows only; never exposed to the browser.
- Application roles live in `profiles.role` (`customer`, `seller`, `admin`)
  and `profiles.account_status`.

## Row Level Security (RLS)

RLS is enabled on every table. Highlights:

- **Profiles**: users read/update only their own row; full rows require
  admin. Public data is exposed through `public_profiles` and
  `public_seller_profiles` definer views that select only public columns.
- **Listings**: guests read only `active` listings; sellers manage their own;
  admins see all. Column grants block changing `seller_id`.
- **Favorites / recommendation profiles / notifications**: owner-only reads.
  Notification creation and direct mutation are revoked; recipient-scoped
  mark-read RPCs are the only browser write path.
- **Inquiries / messages, orders / items, payments, fulfillment**:
  participants (buyer, seller) plus admins; unrelated users see nothing.
- **seller_payment_methods**: self-service — the owning seller can manage
  their own methods; buyers can only read enabled methods of active sellers
  (never the disabled ones, never other sellers' rows). Column grants prevent
  a seller from editing aside from their self-assigned flags/instructions.
- **Proof uploads**: payment proofs are buyer-owned and storage-path-scoped
  (`payment-proofs/{buyer_id}/{order_id}/...`); uploads require a confirmed,
  to-be-paid order and are written only via the server-side
  `can_upload_payment_proof` gate. Signed URLs are available only to the
  participants.
- **Reviews**: client INSERT on `reviews` is revoked — every review is created
  through the `security definer` `submit_review` RPC, which derives
  reviewer/seller/listing from the order item (client can never choose the
  subject), requires the item's order to be `completed`, and rejects
  non-buyers (`FORBIDDEN`) and the item's own seller
  (`SELLER_SELF_REVIEW_NOT_ALLOWED`, defense-in-depth behind Phase 8's
  `SELF_PURCHASE_NOT_ALLOWED`). One review per order item (`order_item_id`
  unique) makes duplicate races fail atomically. SELECT RLS stays approved →
  public, other states reviewer/admin only; UPDATE/DELETE remain admin-only so
  buyers cannot edit or retract ratings. Aggregates/list RPCs are
  server-computed and never expose `reviewer_id`/`order_id`/`buyer_id`.
- **Seller review visibility**: the seller dashboard reads their own reviews
  via auth-derived RPCs (`get_my_seller_reviews`,
  `get_my_seller_rating_summary`, `get_my_seller_rating_distribution`). The
  seller comes from `auth.uid() → auth_seller_id()` server-side — a
  browser-supplied seller id is never trusted. Only `approved` rows are
  returned, filtering/sorting/pagination are database-side, and the result
  rows carry no email, phone, address, payment, `reviewer_id`, `order_id`,
  or `buyer_id`. Sellers are **read-only**: direct UPDATE/DELETE/reassignment
  attempts against `reviews` silently match zero rows via admin-only RLS, so a
  seller can never edit, remove, or de-own a customer review.
- **Reports**: private to the reporter and admins; even the reported seller
  cannot read the complaint row. Writes and moderation transitions are RPC-only.
- **Disputes / refunds / event history**: buyer, owning seller, assigned admin,
  or active admin only. All writes are RPC-only; actor, participants, order,
  payment, amount, status, and history fields are server-derived.
- **Dispute evidence**: participant/admin reads; active participants upload only
  under their own exact `{auth.uid()}/{dispute_id}/{generated_uuid}.{ext}` path.
  Registered evidence is immutable.
- **Admin/audit tables**: admin-only (`is_admin()` policy).
- **listing_views / notifications / payments / order_items**: no direct client
  write policies; trusted RPCs/triggers own writes where implemented.

## Admin authorization model

Authorization does **not** depend on mutable user metadata (e.g. `app_metadata`
a JWT can claim) or on client-supplied values.

- `profiles.role` + `profiles.account_status` are the source of truth.
- Users cannot self-escalate: column-level grants exclude `role`/
  `account_status` from `authenticated` UPDATE, and the
  `prevent_role_escalation` trigger refuses non-admin changes.
- Clients cannot insert `profiles` rows (no insert policy; rows are created by
  the auth trigger).
- Admin state changes go through security-definer functions
  (`admin_set_role`, `admin_set_account_status`, `admin_set_seller_status`)
  that re-check `is_admin()`.
- `is_admin()` is security-definer and only returns a boolean.

## Search RPC (Phase 5)

`public.marketplace_search_listings(...)` is `security invoker`, so it runs
with the caller's own privileges — there is no elevated path. RLS on
`listings` still gates visibility: the RPC AND the base select policy both
restrict to `listing_status = 'active'` and `quantity > 0`, so anonymous
callers can only ever see published, in-stock inventory.

## Authentication flows (Phases 2 and 12)

- Session state is owned by `AuthProvider` (`src/features/auth/`); guests are
  kept out of account routes by `ProtectedRoute`, signed-in users are kept out
  of guest routes by `GuestRoute`.
- Sign-in/post-login redirects go through `resolveReturnPath()`, which only
  accepts safe internal paths — a crafted `from` value cannot cause an
  open redirect.
- `profiles` is never inserted by clients (no insert policy); rows are created
  by the `handle_new_user()` auth trigger. A missing profile shows an
  actionable error rather than allowing self-insert.
- `suspended`/`deactivated` accounts are blocked at the route level and cannot
  reach account pages; authorization is still enforced server-side by RLS.
- Password recovery uses `resetPasswordForEmail` with a `redirectTo` of the
  app's `/reset-password` route; the recovery flag is cleared after a
  successful password change.
- Google sign-in starts only through Supabase Auth. `/auth/callback` accepts
  only safe internal `next` paths, maps provider failures to safe copy, and
  never receives or stores the Google client secret.
- `handle_new_user()` provisions password and OAuth users with the same
  server-side trigger. Provider names are bounded before storage; role and
  account status are fixed to `customer`/`active`, never accepted from metadata.
- An authenticated callback with an unavailable profile shows a retry state;
  the browser cannot self-insert a replacement profile.

## Storage security

Buckets and object policies in `20260809000001_create_storage_foundation.sql`:

- `avatars` (private) — only `avatars/{user_id}/...` owned by the caller.
  Displayed via short-lived signed URLs; the browser never holds a public URL
  for a private object.
- `marketplace-products` (public read) — writes restricted to paths under the
  caller's `seller_id`; no open write policy.
- `dispute-evidence` (private, Phase 11) — participants and authorized admins
  can read. Only active participants upload to their own exact actor/dispute
  folder, with generated UUID filenames, allowlisted MIME types, and a 5 MB
  limit. Registered objects cannot be overwritten or deleted by participants.
- `payment-proofs` (private, Phase 9) — buys write only under
  `payment-proofs/{buyer_id}/{order_id}/...` for a confirmed order that is
  open for payment (`can_upload_payment_proof`); the order's seller can open a
  signed URL; strangers cannot. The buyer may replace/delete their proof while
  the payment is open.

## Order and payment authorization (Phases 8–9)

Order, payment, and fulfillment writes are **RPC-only** — there are no client
insert/update policies on `orders`, `payments`, `fulfillment_details`, or
`order_items`. The Phase 8/9 `security definer` RPCs make every authorization
decision from trusted rows (the session's `profiles.id`, the order's
`buyer_id`/`seller_id`, the listing's locked inventory row):

- The seller can only act on their own orders; the buyer only on their own.
  Strangers are rejected at the SQL boundary (`FORBIDDEN`).
- Status transitions follow the Phase 9 state machine:
  `pending → confirmed/paid → preparing → shipped | ready_for_pickup →
  completed` (plus `cancelled` and `rejected` resubmission) — every RPC
  re-validates the current state instead of trusting the client.
- The payment amount is always derived from the order row; the client never
  passes a price to `submit_payment`.
- Cash orders require the seller to record collection (`mark_cash_received`)
  before the buyer can complete; manual-transfer orders require seller
  approval (`review_payment`).
- Reviews are RPC-only and subject-exact: `submit_review` takes only the order
  item id + ratings/comment, derives the subject from the item, and requires a
  completed order. The reviewer cannot edit or delete once published.
- Sellers view their own reviews through auth-derived, read-only RPCs
  (`get_my_seller_*`); the seller identity is resolved server-side from
  `auth.uid()`, results exclude private buyer data, and UPDATE/DELETE against
  `reviews` is denied to sellers by admin-only RLS.

## Report, dispute, and refund authorization (Phase 11)

Client INSERT/UPDATE/DELETE privileges are revoked for `listing_reports`,
`disputes`, `dispute_messages`, `dispute_evidence`, `refunds`,
`dispute_events`, and `refund_events`. Pinned-search-path security-definer RPCs
are the only mutation boundary.

- Listing reports derive reporter and seller, reject self-reports/duplicates,
  and are invisible to unrelated users and the reported seller.
- Only the order buyer opens a dispute. Buyer/seller identities derive from the
  locked order, and a partial unique index permits one active dispute per order.
- Messages derive sender from the session. Escalation is participant-only;
  participant closure is buyer-only and blocked by an active refund.
- Evidence registration requires a matching existing private Storage object;
  path, participant, active state, MIME, size, and filename are revalidated in
  Postgres.
- Refund requests are buyer-only and full-order only. The paid payment amount
  is authoritative. Only the owning seller reviews/completes; completion writes
  immutable events and changes payment to `refunded` without changing order
  status, total, stock, or order items.

## Notification authorization (Phase 12)

- Notification recipients, actors, event identity, related entities, and safe
  display copy derive from trusted marketplace rows in private trigger
  functions. Browsers cannot forge a notification.
- `(recipient_id, event_key)` is unique, so duplicate/replayed business
  transitions cannot create duplicate deliveries for the same recipient.
- Authenticated users select only `recipient_id = auth.uid()` rows. Anonymous
  and unrelated users receive no rows through RLS or Realtime.
- Direct table INSERT/UPDATE/DELETE and execution of
  `emit_marketplace_notification(...)`, `notify_user(...)`, and all trigger
  functions are revoked from browser roles.
- `mark_notification_read(uuid)` includes the caller recipient predicate and
  returns `false` for a foreign/unknown id. `mark_all_notifications_read()`
  affects only the caller and returns the exact updated count.
- Reports notify active admins but not the reported seller. Participant events
  exclude the actor and use buyer/seller-specific destinations.

## Secret handling

- Only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are used in browser
  code. Never place the service-role key, database password, or third-party
  secrets in `VITE_*` variables.
- `.env` / `.env.*` are gitignored; `.env.example` is tracked with placeholders
  only. The live anon key lives only in the local, untracked `.env.local`.
- The Supabase service-role key is used **only** for admin/CLI operations and
  must never be written into the repo or frontend environment.

## Known limitations

- Phase 11 includes secure admin report/dispute RPCs, but their dashboard UI and
  review **moderation** remain deferred to Phase 13. Refunds are manually
  recorded; there is no payment-gateway transfer or automatic stock restoration.
- Auth email delivery, Supabase Auth URLs, Google consent/callback/account
  linking, and production SPA routing must be verified manually. Live
  data-integrity passes now exist for Phases 5-14
  (`verify-phase7.mjs` through `verify-phase14.mjs`). Positive admin checks in
  Phases 12-14 explicitly skip without configured/valid admin test credentials
  (`PHASE12_TEST_ADMIN_*`, `PHASE13_TEST_ADMIN_*` / `PHASE14_TEST_ADMIN_*`);
  the Phase 14 seller-side analytics checks are all-pass. See
  `PHASE12_VERIFICATION.md` and `PHASE14_VERIFICATION.md` for the exact
  boundaries.
