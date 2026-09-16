# Phase 14 Verification (Reporting + Analytics)

`verify-phase14.mjs` exercises the Marketplace (admin) and seller reporting and
analytics against the linked Supabase project: aggregate overviews, time
series, category/listing/seller ranking, window/bucket/sort/page validation,
admin-vs-seller denial, and multi-seller isolation. It uses only the public
anon key and reusable confirmed accounts; it never creates Auth users, never
uses a service-role key, and never promotes accounts. Seller identity is always
derived from `auth.uid()` server-side (`auth_seller_id()`), never passed by the
caller.

## Status

Automated hosted status: **ALL PASS** for seller analytics, denial, and
validation; **PARTIAL** for marketplace (admin) analytics.

The configured Phase 13 admin test credential still rejects
`signInWithPassword` (`invalid_credentials`). `verify-phase14.mjs` treats the
admin credential as optional: when it is absent or invalid the five marketplace
positive checks SKIP (without fabricating PASS) and the seller/denial/validation
checks still run. The Phase 14 admin journeys in the Playwright suite likewise
SKIP until a valid admin credential exists.

Automated browser status: **PLAYWRIGHT SUITE WRITTEN — 6 PASS / 2 SKIP.**
Seller analytics journeys (real KPIs, listing links, previous-period compare,
weekly bucket, buyer redirect) pass against the dev server and hosted Supabase.
The two admin journeys skip on the credential blocker. Buyer denial of
`/admin/analytics` passes.

Overall Phase 14 status: **IMPLEMENTATION COMPLETE; PROJECT-SIDE HOSTED PASS
BLOCKED ONLY ON THE ADMIN TEST CREDENTIAL.** Fixing that credential unlocks the
admin RPC and admin browser checks with no code changes.

A hosted-only SQL fix was discovered and shipped during verification:
`20260915010000_phase14_seller_timeseries_fix.sql` corrects a typo in
`my_seller_analytics_timeseries` (`o.units` → `p.units`) that previously caused
a `42703 column does not exist` error on the seller trend query.

## Credentials

Real values belong only in `.env.local` or the shell environment.

| Role | Variables | Required |
| --- | --- | --- |
| Admin | `PHASE14_TEST_ADMIN_*` (falls back to `PHASE13_TEST_ADMIN_*`) | Recommended |
| Seller | `PHASE7_TEST_SELLER_EMAIL`, `PHASE7_TEST_SELLER_PASSWORD` | Yes |
| Buyer | `PHASE7_TEST_BUYER_EMAIL`, `PHASE7_TEST_BUYER_PASSWORD` | Yes |
| Stranger | `PHASE7_TEST_STRANGER_EMAIL`, `PHASE7_TEST_STRANGER_PASSWORD` | Yes |
| Seller B | `PHASE8_TEST_SELLER_B_EMAIL`, `PHASE8_TEST_SELLER_B_PASSWORD` | Optional |

Missing required credentials produce a safe `SKIPPED` exit. The admin
credential is attempted, and on failure the five marketplace-positive checks
SKIP while seller checks continue.

## Commands

```bash
node verify-phase14.mjs
npx playwright test tests/e2e/phase14
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
node verify-phase14.mjs
```

The complete local validation order is:

```bash
npm run lint
npm run typecheck
npm run test
npm run test:e2e:phase14
npm run build
git diff --check
```

## Hosted Coverage

- Seller signs in; buyer and stranger sign in and are verifiably non-seller or
  seller as configured (the Phase 7 "stranger" account is itself an active
  seller in this project, so buyer is used for the non-seller denial checks).
- A run-scoped active listing is created each run and archived in cleanup (the
  marketplace never hard-deletes listings, matching Phase 9+ cleanup).
- Marketplace analytics: `admin_analytics_overview`, `_timeseries`,
  `_categories`, `_top_listings`, `_top_sellers` succeed for an active admin
  (currently SKIP on the credential blocker); buyer and anonymous are denied,
  and a seller is denied from the admin timeseries.
- Seller analytics: `my_seller_analytics_overview`, `_timeseries`, and
  `_listings` succeed for the authenticated seller and include the run listing;
  a non-seller buyer is denied from both overview and listings.
- Validation: reversed range and over-max day-bucket span raise
  `INVALID_DATE_RANGE`; unknown bucket raises `INVALID_BUCKET`; unknown sort
  raises `INVALID_SORT`; page < 1 raises `INVALID_PAGINATION`.
- Multi-seller isolation: each seller sees only their own listings in
  `my_seller_analytics_listings`, and buyer cannot read any seller's listing
  analytics on behalf of a seller.

## Browser Coverage

The Phase 14 Playwright suite verifies:

- Seller loads `/seller/analytics` with real KPI sections (not placeholder),
  a gross-sales chart, and CSV export buttons.
- Listing performance rows link to the per-listing detail page.
- The previous-period compare toggle updates the URL and renders deltas.
- The chart bucket select switches to weekly and reflects in the URL/copy.
- Buyer is redirected away from `/seller/analytics`.
- Admin loads `/admin/analytics` with all marketplace sections (SKIP while the
  admin credential is invalid) and reaches it through the admin nav.
- Buyer sees the 403 `Administrator access required` guard on `/admin/analytics`.

## Final Local Results

Validated on 2026-09-15:

| Command | Result |
| --- | --- |
| `npm run lint` | PASS with eight pre-existing Fast Refresh warnings |
| `npm run typecheck` | PASS |
| `npm run test` | PASS: 90 files, 760 tests |
| `npm run build` | PASS |
| `npx supabase db push` | PASS: `20260915000000` + `20260915010000` applied |
| `node verify-phase14.mjs` | PASS: seller checks; 5 admin SKIPs on credential blocker |
| Playwright `tests/e2e/phase14` | 6 PASS / 2 SKIP (admin journeys) |
| Regressions `verify-phase7..12` | ALL PASS (Phase 13 SKIPs at admin sign-in) |
| `git diff --check` | PASS |

## Remediation Notes

- `verify-phase7.mjs` was fixed during the Phase 14 regression pass: its
  favorite-snapshot check now scopes by the run listing and its cleanup
  soft-archives instead of hard-deleting (RLS forbids DELETE on listings). The
  Phase 7 verifier now reports ALL PASS, and stale run favorites/listings from
  earlier runs were archived out of the hosted data.
- Do not re-edit `20260915000000_phase14_analytics.sql`: it is applied remotely.
  Any further schema corrections belong in new migrations.

## Rules

- Never commit credentials, tokens, or service-role keys.
- Never disable confirmation, RLS, or grants to make verification pass.
- Never auto-promote an account inside the verifier or Playwright suite.
- A successful sign-in alone does not prove authorization; seller scope must
  come from the trusted `auth_seller_id()` derivation.