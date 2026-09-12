# Phase 7 Hosted Verification (Favorites + Inquiries)

`verify-phase7.mjs` runs the Phase 7 favorites and inquiries scenarios against
the hosted Supabase project.

Hosted verification uses three **reusable confirmed test accounts**.

The verification script **does not create Auth users automatically** — it only
signs in with credentials you provide. This prevents email-confirmation
blockers and hosted email-rate-limit issues.

## Credentials

Configure three local environment variables per account (placeholders are in
`.env.example`; real values live only in the gitignored `.env.local`):

| Role     | Email var                    | Password var                        |
| -------- | ---------------------------- | ----------------------------------- |
| Seller   | `PHASE7_TEST_SELLER_EMAIL`   | `PHASE7_TEST_SELLER_PASSWORD`       |
| Buyer    | `PHASE7_TEST_BUYER_EMAIL`    | `PHASE7_TEST_BUYER_PASSWORD`        |
| Stranger | `PHASE7_TEST_STRANGER_EMAIL` | `PHASE7_TEST_STRANGER_PASSWORD`     |

The accounts must already exist in Supabase Auth and be **confirmed** (email
confirmation stays enabled; production auth behavior is never modified to make
verification pass).

## Run

```bash
node verify-phase7.mjs
```

If any credential is missing the script exits cleanly with a `SKIPPED` message
and the list of variables to configure — it never falls back to `auth.signUp()`.

When credentials are present it signs in all three accounts and verifies:

- Buyer favorites → snapshots `listing_title` → removes the favorite.
- Buyer opens an inquiry; duplicate open inquiries are rejected (partial unique
  index); the inquiry snapshots `listing_title`.
- Seller reads the inquiry for their own listing and replies via
  `send_inquiry_reply` (status → `answered`).
- Buyer replies (status stays `open`), marks inbound messages read, and cannot
  mark their own messages read.
- Stranger cannot read the inquiry or its messages, cannot insert messages,
  cannot reply via the RPC, cannot delete the buyer's favorite, and cannot
  impersonate the buyer or spoof a sender id.
- Cross-seller: a different seller (Seller B) cannot reply to Seller A's
  listing inquiry via the RPC.
- Seller cannot inquire about their own listing.
- Close flow: buyer and seller replies are rejected after close (the stranger
  is rejected too); a new inquiry is allowed.

## Test data isolation and cleanup

Each run uses a unique id in the listing title and inquiry subject so reruns
never collide. At the end the script deletes the listing it created (cascades
to the favorites, inquiries, and messages for that run) and signs out the local
sessions.

**Auth accounts are never created or deleted** — they remain intact for future
verification runs.

## Rules

- Never disable email confirmation to make verification pass.
- Never weaken RLS. The verification proves the existing security works.
- Never print or commit credentials or the service-role key.
