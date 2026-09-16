# Phase 12 Verification (Notifications + Google OAuth)

`verify-phase12.mjs` exercises notification emission, recipient isolation,
controlled read mutations, deduplication, and the hosted Google provider probe
against the linked Supabase project. It uses only the public anon key and
reusable confirmed accounts; it never creates Auth users or uses a service-role
key.

## Status

Automated hosted status: **ALL PASS** on 2026-09-14 against project
`mygnxlhimbrmjwtrffbh`, with two explicit admin-only skips because
`PHASE12_TEST_ADMIN_*` is not configured.

Automated browser status: **ALL PASS**. The complete Playwright suite passes 21
tests: 11 Phase 11 journeys and 10 Phase 12 journeys.

Overall Phase 12 status: **COMPLETE**. The migration, application, hosted
verification, and automated browser acceptance pass. The user manually accepted
the production deployment and Google consent/callback/account-linking journey on
2026-09-14. Phase 13 may proceed.

## Credentials

Real values belong only in `.env.local` or the shell environment.

| Role | Variables | Required |
| --- | --- | --- |
| Seller | `PHASE7_TEST_SELLER_EMAIL`, `PHASE7_TEST_SELLER_PASSWORD` | Yes |
| Buyer | `PHASE7_TEST_BUYER_EMAIL`, `PHASE7_TEST_BUYER_PASSWORD` | Yes |
| Stranger | `PHASE7_TEST_STRANGER_EMAIL`, `PHASE7_TEST_STRANGER_PASSWORD` | Yes |
| Seller B | `PHASE8_TEST_SELLER_B_EMAIL`, `PHASE8_TEST_SELLER_B_PASSWORD` | Optional |
| Admin | `PHASE12_TEST_ADMIN_EMAIL`, `PHASE12_TEST_ADMIN_PASSWORD` | Optional |

Required accounts must already exist and be confirmed. The primary seller must
have an active seller profile. Missing required credentials produce a safe
`SKIPPED` exit; the verifier never falls back to `auth.signUp()`.

Seller B enables positive multi-seller isolation. The admin account enables
positive report-recipient and seller-status checks. Missing optional accounts
are printed as explicit skips rather than silently treated as passes.

## Commands

```bash
node verify-phase12.mjs
npm run test:e2e:phase12
```

Run hosted suites one at a time because they share accounts:

```bash
node verify-phase7.mjs
node verify-phase8.mjs
node verify-phase9.mjs
node verify-phase10.mjs
node verify-phase11.mjs
node verify-phase12.mjs
```

The complete local validation order is:

```bash
npm run lint
npm run typecheck
npm run test
npm run test:e2e
npm run build
git diff --check
```

## Hosted Coverage

- Retained email/password users can still sign in.
- Hosted Supabase starts Google OAuth and redirects to `accounts.google.com`.
- Browsers cannot execute either notification emitter or insert/update rows.
- New inquiries and replies notify only the owning seller or counterparty.
- Order create/confirm/reject/cancel/preparing/shipped/ready/completed events
  target the correct buyer or seller route.
- Cash selection/receipt and manual payment submit/reject/resubmit/approve
  events target the correct participant.
- A failed or duplicate transition emits no duplicate notification.
- Verified reviews notify the reviewed seller.
- Report creation does not notify or leak its id to the reported seller.
- Dispute open/message and refund request/approve/reject/complete events target
  only the appropriate participant.
- Recipient-only SELECT, non-disclosing cross-user mark-one, persisted own
  mark-one, exact-count mark-all, and direct mutation denial all hold.
- Seller B receives only Seller B order events when the optional account exists.
- An active admin receives report creation and the seller receives status
  changes when the optional admin account exists.

Each run uses unique listing data. Deletable cancelled orders are removed and
test listings are archived through normal user paths. Completed orders,
reviews, disputes, refunds, and notifications are intentionally retained where
the production model has no participant hard-delete path.

## Browser Coverage

The Phase 12 Playwright suite verifies:

- Login and registration retain password controls and initiate only Supabase's
  Google authorization route.
- OAuth cancellation shows safe copy and removes provider details from the URL.
- Unsafe callback return paths fall back to `/dashboard`.
- The bell displays an exact accessible unread count and a five-row preview.
- Role-correct links, mark-one persistence, mark-all persistence, URL filters,
  database-side pagination, guest protection, and safe retry states work.
- Notification layouts do not overflow and remain touch-friendly at 375, 390,
  430, 768, 1024, and 1440 pixel widths.

## Final Local Results

Validated on 2026-09-14:

| Command | Result |
| --- | --- |
| `npm run lint` | PASS with eight pre-existing Fast Refresh warnings |
| `npm run typecheck` | PASS |
| `npm run test` | PASS: 79 files, 685 tests |
| `npm run test:e2e` | PASS: 21 tests |
| `npm run build` | PASS |
| `npx supabase migration list` | PASS: local/remote parity through `20260913000000` |
| Generated type comparison | PASS: `src/types/database.ts` matches the linked project |
| `node --check verify-phase12.mjs` | PASS |
| `git diff --check` | PASS |

## Manual Acceptance

The user confirmed completion and acceptance on 2026-09-14 of the production
deployment, Google consent/callback, profile provisioning, returning sign-in,
account-linking, blocked/cancelled/error handling, and SPA direct-route checks.
These remain regression requirements for future releases.

## Rules

- Never commit credentials, Google client secrets, tokens, or service-role keys.
- Never disable confirmation or RLS to make verification pass.
- A redirect to Google verifies provider configuration only; it does not prove
  consent, callback exchange, profile provisioning, or account linking.
