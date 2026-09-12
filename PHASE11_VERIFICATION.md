# Phase 11 Hosted Verification (Reports, Disputes + Refunds)

`verify-phase11.mjs` exercises Phase 11 against the linked hosted Supabase
project using only browser-safe anon-key clients and reusable confirmed users.
It never uses the service-role key, creates Auth users, or weakens RLS.

## Status

Automated status: **ALL PASS** on 2026-09-13 against project
`mygnxlhimbrmjwtrffbh`.

Overall Phase 11 status: **PARTIAL**. The migration, application, automated
tests, hosted verifier, earlier-phase hosted regressions, typecheck, and build
all pass. The manual browser acceptance journey remains pending, so Phase 11
must not be represented as fully accepted yet.

## Credentials

The verifier reuses the confirmed Phase 7 accounts. Real values belong only in
the gitignored `.env.local` or the shell environment.

| Role | Email variable | Password variable |
| --- | --- | --- |
| Seller | `PHASE7_TEST_SELLER_EMAIL` | `PHASE7_TEST_SELLER_PASSWORD` |
| Buyer | `PHASE7_TEST_BUYER_EMAIL` | `PHASE7_TEST_BUYER_PASSWORD` |
| Stranger | `PHASE7_TEST_STRANGER_EMAIL` | `PHASE7_TEST_STRANGER_PASSWORD` |

All three accounts are required and must already be confirmed. The seller must
have an active seller profile. Missing credentials produce a safe `SKIPPED`
exit; the script never falls back to `auth.signUp()`.

## Run

```bash
node verify-phase11.mjs
```

Run the hosted suites one at a time because they share accounts:

```bash
node verify-phase7.mjs
node verify-phase8.mjs
node verify-phase9.mjs
node verify-phase10.mjs
node verify-phase11.mjs
```

## Verified Behavior

### Listing reports

- A signed-in non-owner can report an active listing.
- Reporter, listing seller, and initial `pending` status are server-derived.
- Active duplicate reports are rejected atomically.
- Self-reporting, unsupported reasons, anonymous execution, direct INSERT, and
  direct status UPDATE are denied.
- Reports are private to the reporter and admins. The reported seller and an
  unrelated user read zero rows.
- Non-admin callers cannot use the report moderation RPC.

### Disputes

- Only the buyer can open a dispute for their seller-specific order.
- Pending orders are ineligible; confirmed and later supported transaction
  states are eligible.
- Buyer, seller, opener, order, and initial `open` status are server-derived.
- Only one `open`/`under_review` dispute can exist per order.
- Opening a dispute does not rewrite order status, totals, or inventory.
- Buyer and owning seller can read the dispute; unrelated users read no rows.
- Direct status mutation/deletion and non-admin resolution are denied.
- Either participant can escalate an open dispute; only the buyer can close an
  active dispute without an outstanding refund.

### Messages and evidence

- Buyer and owning seller can message while the dispute is active; sender id is
  derived from the session and text is trimmed.
- Empty messages, stranger messages, and direct message INSERT are denied.
- Evidence uploads require the exact private path
  `{auth.uid()}/{dispute_id}/{generated_uuid}.{allowed_extension}`.
- MIME/size/path checks, metadata registration, duplicate registration, and
  uploader derivation are enforced server-side.
- The other participant can read evidence; anonymous and unrelated users
  cannot read the object or metadata.
- Registered evidence objects are immutable. Storage-policy errors are not
  exposed by the application service.

### Full-order refunds

- Only the buyer can request a refund for an active dispute with a paid order.
- Partial and overpayment amounts are rejected. The persisted amount, order,
  payment, buyer, and seller derive from trusted rows.
- Only the owning seller can approve/reject and manually complete a refund.
- Rejection requires a reason; requested/approved states cannot be skipped or
  replayed.
- An active refund prevents buyer closure of the dispute.
- Manual completion records method/reference/notes, changes payment status to
  `refunded`, and resolves the dispute.
- Refund completion does not change order status, order total, inventory, or
  historical order items.
- Refund and dispute event rows record the trusted actor and exact transition;
  unrelated users cannot read those histories.

## Regression Results

The hosted suites were run sequentially after Phase 11 deployment:

| Command | Result |
| --- | --- |
| `node verify-phase7.mjs` | ALL PASS |
| `node verify-phase8.mjs` | ALL PASS |
| `node verify-phase9.mjs` | ALL PASS |
| `node verify-phase10.mjs` | ALL PASS |
| `node verify-phase11.mjs` | ALL PASS |

Phase 11 was also run once before the complete regression sequence and passed.

## Local Results

Run in the required order after the hosted regressions:

| Command | Result |
| --- | --- |
| `npm run lint` | PASS with eight pre-existing Fast Refresh warnings |
| `npm run typecheck` | PASS |
| `npm run test` | PASS: 69 files, 632 tests |
| `npm run build` | PASS |
| `git diff --check` | PASS |

The Phase 11-focused work adds 35 automated tests across validation, service/RPC
payloads, Storage handling, participant UI, refunds, and order-page integration.

## Data Retention

Each verifier run uses unique listing titles. Its pending negative order is
cancelled and deleted, and its unreferenced listing is removed. Confirmed
orders, their listings, report/dispute/refund history, and registered evidence
are intentionally retained because the production model has no participant
hard-delete path for transaction or moderation history.

## Manual Acceptance Pending

Before changing the overall status to `PASS`, verify in a real browser:

1. A buyer reports a listing, opens a dispute from an eligible order, sends a
   message, and uploads each supported evidence type.
2. The owning seller sees the dispute, opens evidence through a signed URL,
   replies, escalates, and reviews a full-refund request.
3. The seller records a manual refund completion and both roles see the updated
   immutable timeline.
4. Guest, unrelated-user, loading, empty, validation, and failure states render
   correctly on mobile, tablet, and desktop.
5. Keyboard focus, dialog close/focus restoration, labels, alerts, and route
   navigation behave correctly.

## Rules

- Never commit real credentials or a service-role key.
- Never disable email confirmation or RLS to make verification pass.
- Do not begin Phase 12 until Phase 11 manual acceptance is completed or the
  user explicitly accepts the remaining limitation.
