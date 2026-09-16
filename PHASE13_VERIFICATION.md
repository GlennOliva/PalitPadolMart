# Phase 13 Verification (Administration)

`verify-phase13.mjs` exercises administrator authorization, user/seller
management, listing/report/review moderation, order/payment/dispute/refund
oversight, the audit ledger, and direct-attack denial against the linked
Supabase project. It uses only the public anon key and reusable confirmed
accounts; it never creates Auth users, never uses a service-role key, and never
promotes accounts.

## Status

Automated hosted status: **PARTIAL / BLOCKED** — the configured
`PHASE13_TEST_ADMIN_*` account currently rejects `signInWithPassword`
(`invalid_credentials`). The user is correcting the Phase 13 admin test
credential. All implementation work is complete and validated locally; positive
admin checks cannot be reported as PASS until a valid admin credential exists.

Automated browser status: **PLAYWRIGHT SUITE WRITTEN** — `phase13-acceptance.spec.ts`
implements the 10 acceptance journeys but cannot pass until the admin
credential is corrected. Buyer/seller denial tests and the authenticated
dashboard route have been verified live against the dev server and hosted
Supabase.

Overall Phase 13 status: **PARTIAL** — implementation complete; hosted PASS
blocked on the admin test credential.

## Credentials

Real values belong only in `.env.local` or the shell environment.

| Role | Variables | Required |
| --- | --- | --- |
| Admin | `PHASE13_TEST_ADMIN_EMAIL`, `PHASE13_TEST_ADMIN_PASSWORD` | Yes |
| Seller | `PHASE7_TEST_SELLER_EMAIL`, `PHASE7_TEST_SELLER_PASSWORD` | Yes |
| Buyer | `PHASE7_TEST_BUYER_EMAIL`, `PHASE7_TEST_BUYER_PASSWORD` | Yes |
| Stranger | `PHASE7_TEST_STRANGER_EMAIL`, `PHASE7_TEST_STRANGER_PASSWORD` | Yes |
| Seller B | `PHASE8_TEST_SELLER_B_EMAIL`, `PHASE8_TEST_SELLER_B_PASSWORD` | Optional |

Required accounts must already exist and be confirmed. The admin account's
`profiles.role` must be `admin`. Missing required credentials produce a safe
`SKIPPED` exit; the verifier never falls back to `auth.signUp()` or promotes.

Seller B enables the positive multi-seller isolation check and SKIPs when
absent. The phase 12 admin account is separate from the phase 13 admin account.

## Commands

```bash
node verify-phase13.mjs
npx playwright test tests/e2e/phase13
```

Run hosted suites one at a time because they share accounts:

```bash
node verify-phase7.mjs
node verify-phase8.mjs
node verify-phase9.mjs
node verify-phase10.mjs
node verify-phase11.mjs
node verify-phase12.mjs
node verify-phase13.mjs
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

- Admin signs in; admin role is derived from the database, never from email,
  localStorage, React state, or provider metadata.
- Buyer/seller/stranger are not admins and are denied every `admin_*` RPC.
- User suspension and reactivation succeed for an active admin and append the
  expected audit row; the actor is `auth.uid()`.
- Seller approval, invalid transitions, suspension, and reactivation behave per
  the database state machine.
- Listing removal and restore succeed through moderation; non-admins are denied;
  the audit ledger records the change.
- Reports are readable by admins; resolution requires a resolution; auditors can
  review the lifecycle.
- Review hiding preserves the original row and verified-purchase relationship.
- Orders/payments, disputes, and refunds are readable only by admins.
- Category/brand listing, creation, updates, and activation are admin-only.
- The audit ledger lists actions with the acting admin id; direct INSERT /
  UPDATE / DELETE on `admin_actions` is denied for non-admins.
- Summary counts load through `admin_summary` for admins only.
- Direct attacks: browser (buyer/seller) cannot run admin RPCs, update roles or
  statuses, moderate listings, resolve reports/disputes, or forge audit rows.

## Browser Coverage

The Phase 13 Playwright suite verifies:

- Admin loads the dashboard with real operational counts (not placeholder).
- Admin navigates to Users, Sellers, Listings, Reports, Reviews, Orders, and
  Audit Logs, each rendering its real workspace.
- Buyer and seller are denied `/admin` (403 guard).
- Sales, payments, disputes, refunds, categories, and brands render their
  workspaces without errors.

## Final Local Results

Validated on 2026-09-14:

| Command | Result |
| --- | --- |
| `npm run lint` | PASS with eight pre-existing Fast Refresh warnings |
| `npm run typecheck` | PASS |
| `npm run test` | PASS: 83 files, 702 tests |
| `npm run build` | PASS |
| `npx supabase migration list` | PASS: local/remote parity through `20260914000000` |
| Generated type comparison | PASS: `src/types/database.ts` matches the linked project |
| `node --check verify-phase13.mjs` | PASS |

## Blockers

- **Admin test credential**: `PHASE13_TEST_ADMIN_EMAIL` /
  `PHASE13_TEST_ADMIN_PASSWORD` currently yields `invalid_credentials` (HTTP
  400) with `signInWithPassword`. Buyers/sellers authenticate fine, so this is
  not a connectivity issue. Pending the corrected credential, positive hosted
  admin checks and the Playwright admin journeys cannot be reported PASS.

## Rules

- Never commit credentials, tokens, or service-role keys.
- Never disable confirmation, RLS, or grants to make verification pass.
- Never auto-promote an account inside the verifier or Playwright suite.
- A successful sign-in alone does not prove administrator authorization; role
  must come from the trusted `profiles.role` read.