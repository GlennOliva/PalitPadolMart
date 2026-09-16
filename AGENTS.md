# AGENTS.md

## Project
PalitPaddleBai Mart — a Supabase-first pickleball equipment marketplace (React + TS + Vite).

**Read `MASTER_BUILD_SPEC.md` first.** It is the authoritative spec: user roles, phases 0–18, completion criteria, validation commands, and the OpenCode workflow. Follow its phase order; do not skip ahead or start dependent features before their foundation works.

## Stack (spec-mandated — do not substitute)
- React + TypeScript (strict) + Vite + React Router (+ TanStack Query allowed).
- Backend is Supabase only: Postgres, Auth, Storage, JS client. **No Prisma, Firebase, MongoDB, other DB, or backend framework.**
- Never expose the Supabase service-role key in frontend code; only browser-safe `VITE_*` vars.

## Commands
- `npm run dev` — Vite dev server
- `npm run build` — `tsc -b && vite build`
- `npm run lint` — **oxlint**, not ESLint (config: `.oxlintrc.json`)
- `npm run typecheck` — `tsc -b`
- `npm run test` — Vitest single run (jsdom + React Testing Library); `npm run test:watch` for watch mode
- Phase 11-12 Playwright acceptance is wired through `npm run test:e2e`. Run
  `lint → typecheck → test → build` plus `test:e2e` before declaring a phase
  complete; never report PASS when any fail.

## Setup / env
- Copy `.env.example` to `.env.local` with `VITE_SUPABASE_URL=` and `VITE_SUPABASE_ANON_KEY=`; never commit real keys. `.env*` files are gitignored (`.env.example` stays tracked).
- The Supabase client (`src/lib/supabase/client.ts`) throws at import time when env vars are missing — that is intentional.
- The Supabase CLI is available and logged in; the project is linked (see Current state). Use `npx supabase db push` for new migrations and `npx supabase gen types typescript --linked` to refresh types. No Docker is available, so local-stack commands (`supabase db reset --local`) must not be used.
- Hosted Phase 7 verification (`verify-phase7.mjs`) requires three reusable, confirmed test accounts configured via local `PHASE7_TEST_{SELLER,BUYER,STRANGER}_{EMAIL,PASSWORD}` vars (placeholders in `.env.example`). The script never signs users up and never creates Auth users; if credentials are missing it SKIPs. See `PHASE7_VERIFICATION.md`. Its favorite-snapshot check is scoped by the run listing and its cleanup soft-archives (marketplace never hard-deletes listings); do not regress those fixes.

## Structure (per spec)
- `src/features/<domain>/`, `src/components/{common,layout,...}`, `src/lib/supabase`, `src/pages`, `src/routes`, `src/services`, `src/types`, `src/utils`, `src/hooks`
- `supabase/migrations`, `supabase/functions`, `supabase/seed.sql`, `supabase/config.toml`
- `tests/{unit,integration,e2e}` — tests are mandatory: recommendation scoring, order calcs, status validation, auth, RLS-sensitive ops, and full E2E journeys.
- `src/routes/index.tsx` is the single router entrypoint; add new routes there.

## Design system
- Read `DESIGN_SYSTEM.md` before touching `src/index.css` or page markup. Tokens
  (palette, type scale, spacing, radii, shadows, glass) are CSS custom properties
  in `:root`; glass surfaces are `.glass` / `.glass--strong` / `.glass--soft`
  with `@supports` fallbacks. Selective glassmorphism, light theme only.
- Prefer the shared components in `src/components/common/` over raw markup:
  `GlassPanel`, `Badge` (variants cover `listing_status` + `seller_status`),
  `EmptyState`, `PageHeader`, `ApplicationErrorPage` (route `errorElement`).
- `Badge` variant names are a superset of the Postgres enums (e.g. `draft`,
  `active`, `sold`, `archived`, `removed`); reuse them instead of hand-rolled
  status pills.
- Layout tests query nav/header by role and single label (e.g.
  `getByRole('link', { name: /Sign in/i })`). Keep nav labels unique and avoid
  adding duplicate links to the footer so tests keep single matches.

## Current state
- Phase 0 (project initialization/foundation), Phase 1 (database foundation),
  Phase 2 (authentication and user management), Phase 3 (seller management),
  Phase 4 (marketplace catalog), Phase 5 (search and discovery), Phase 6
  (paddle recommendations), Phase 7 (favorites and inquiries), Phase 8
  (orders + cart + multi-seller checkout), Phase 9 (payment status and
  fulfillment), Phase 10 (ratings & reviews), Phase 11 (complaints, disputes &
  refunds), and Phase 12 (notifications + Google OAuth) are **COMPLETE**. The
  user manually accepted the Phase 11 browser journey and Phase 12 production
  deployment/Google OAuth journey on 2026-09-14. Phase 13 (administration) is
  current: database foundation, 51 admin RPCs, the admin shell, all 12 admin
  resource workspaces, services, unit tests, documentation
  (`ADMINISTRATION.md`, `PHASE13_VERIFICATION.md`), `verify-phase13.mjs`, and
  the Phase 13 Playwright suite are implemented; local validation passes.
  Hosted Phase 13 is **PARTIAL** until the `PHASE13_TEST_ADMIN_*` credential is
  corrected (currently `invalid_credentials`).
- Phase 14 (reporting, analytics & business insights) is also implemented:
  analytics migration + one hosted fix migration, admin (`/admin/analytics`)
  and seller (`/seller/analytics`) dashboards with date-range/bucket filters,
  previous-period compare, paginated ranking tables, CSV export, shared
  formatting/params/services in `src/features/{admin,seller}/analytics/` +
  `src/utils/{analytics-format,csv}.ts`, unit tests, `ANALYTICS.md`,
  `PHASE14_VERIFICATION.md`, `verify-phase14.mjs` (seller checks ALL PASS;
  five marketplace-positive checks SKIP on the admin credential blocker), and
  the Phase 14 Playwright suite (6 PASS / 2 SKIP).
- Phase 15 (UI/UX hardening — admin data visualization + report printing) is
  also implemented with **no database migrations**: a rewritten `/admin`
  executive dashboard (16 KPI cards with previous-period deltas, URL
  date-range + auto bucket, TanStack React Charts line/bar visualizations,
  all-time status distributions, operational queues, `Print Executive Report`),
  the `/admin/analytics` page rerendered on the same chart layer with a
  "Status & moderation" section and `Print Report`, a new `/admin/report-center`
  directory with `Print Report Directory`, shared report/chart primitives in
  `src/components/{reports,analytics}/`, print-only/print-safe CSS in
  `src/index.css` (`@media print` + `@page A4`), unit tests,
  `PHASE15_VERIFICATION.md`, `verify-phase15.mjs` (seller/public checks ALL
  PASS; admin-positive checks SKIP), and the Phase 15 Playwright suite
  (3 PASS / 3 SKIP, including the always-on public responsive matrix at
  375-1440px with overflow/console-error/raw-SQL guards). Dependencies added:
  `@tanstack/charts@0.18.0` + `@tanstack/react-charts@0.18.0` (hoisted top-level).
  Do not begin a subsequent phase until the admin test credential is corrected
  and the Phase 13/14/15 admin-hosted checks PASS; the current phase remains
  **Phase 15** until then.
- A hosted Supabase project is linked (ref `mygnxlhimbrmjwtrffbh`, name
  "PalitPaddleBai"); tracked migrations through Phase 14 are applied
  remotely; types are generated into `src/types/database.ts` via `npx supabase
  gen types typescript --linked` (never hand-edit the generated file).
- `.env.local` (gitignored) holds the real `VITE_SUPABASE_URL` and
  `VITE_SUPABASE_ANON_KEY`. The service-role key is not in the repo and must
  never be written into frontend vars.
- `tsconfig.app.json` has `strict: true` and includes `tests/`.
- `verbatimModuleSyntax` is on: type-only imports must use `import type`. `erasableSyntaxOnly` forbids TS `enum`/namespace/parameter-property constructs — model Postgres enums as union types in TS.
- Postgres enums are lowercase (e.g. `listing_status`); RLS uses `security definer` helpers `public.is_admin()` and `public.auth_seller_id()`. Column-level grants prevent self-service role/status escalation.
- Marketplace catalog: seller listing management lives in
  `src/features/marketplace/` (service, validation, utils, types,
  `listing-images.ts`, `search.service.ts`, `search-params.ts`), components in
  `src/components/marketplace/`, and pages in `src/pages/marketplace/` +
  `seller/listings*` routes. Listings are soft-removed via status
  (archived/sold), never hard-deleted. Only active sellers can manage listings;
  active listings require quantity > 0; a listing may have at most one primary
  image. Categories/brands are DB-managed and seeded in `supabase/seed.sql`.
- Search & discovery: `public.marketplace_search_listings(...)` is a
  `security invoker` RPC (keyword across title/description/category/brand with
  LIKE-wildcard escaping, category/brand/condition/price/pickup/delivery
  filters, 4 sorts, pagination). The marketplace page keeps every facet in the
  URL via `parseMarketplaceSearch`/`serializeMarketplaceSearch`. See
  `SEARCH_DISCOVERY.md`.
- Recommendations: deterministic scoring in `src/features/recommendation/`
  (max 100; budget 25 / skill 20 / style 20 / weight 15 / control-power 20;
  unset preferences are neutral; budget zeroes at 2×). Page:
  `src/pages/recommendations/RecommendationsPage.tsx` with a no-candidates and
  a no-budget-match empty state. See `PADDLE_RECOMMENDATIONS.md`.
- `git`: repo initialized; earlier phase commits exist and later phase work is
  staged or unstaged as uncommitted changes. No pushing to a remote unless
  authorized.
- Phase 8 hosted verification: `verify-phase8.mjs` covers the order/transaction
  system AND the cart + multi-seller checkout (RLS, add/update/checkout, error
  codes, concurrency). It requires the confirmed Phase 7 accounts plus
  `PHASE8_TEST_BUYER_B_*`; the multi-seller section is gated on the optional
  `PHASE8_TEST_SELLER_B_*` vars (SKIPs when absent). See `PHASE8_VERIFICATION.md`.
- Phase 9 hosted verification: `verify-phase9.mjs` covers payment status
  (submit → approve/reject → resubmit), cash pickup handoff, proof storage
  isolation (path-structure match, own-order upload, pending/cancelled/
  wrong-owner/arbitrary-order denials; seller-only reads via signed URL;
  anon/stranger denied), fulfillment (prepare/ship/ready-for-pickup/received),
  and multi-seller independence (RLS, error codes, state machine). It requires
  the confirmed Phase 7 accounts (Phase 8 cross-actor accounts optional; SKIPs
  when absent). See `PHASE9_VERIFICATION.md`. The Phase 9 payment/fulfillment
  flow is documented in `PAYMENTS_AND_FULFILLMENT.md`, and the in-browser
  journey checklist in `PHASE9_MANUAL_TESTING.md`. Payment-proof upload errors
  are always mapped to safe copy — raw Storage/RLS database messages are never
  surfaced to the UI (`uploadPaymentProof` in
  `src/features/orders/payments.service.ts`). Run hosted verifiers one at a time
  because they share accounts.
- Phase 10 hosted verification: `verify-phase10.mjs` covers verified-purchase
  reviews end-to-end: two completed orders driven through the real Phase 8/9
  workflow get reviewed; per-order-item uniqueness; `submit_review` derives
  reviewer/seller/listing from the order item (subject spoofing is impossible);
  all error codes (`AUTH_REQUIRED`, `ORDER_ITEM_NOT_FOUND`, `FORBIDDEN`,
  `ORDER_NOT_COMPLETED`, `REVIEW_ALREADY_EXISTS`, `INVALID_RATING`,
  `INVALID_SELLER_RATING`, `INVALID_REVIEW_TEXT`); server-side aggregates
  (`listing_review_summary`/`seller_review_summary`/
  `listing_review_distribution`) + paginated public lists with `listing_title`;
  INSERT lockdown and admin-only UPDATE/DELETE; cross-buyer / cross-seller
  checks; **and the seller-side visibility extension** (auth-derived
  `get_my_seller_reviews` / `get_my_seller_rating_summary` /
  `get_my_seller_rating_distribution`: seller sees only their own approved
  reviews with no private customer fields, summary/distribution match the
  public rows, filter + sort + pagination are database-side, seller
  UPDATE/DELETE/reassign is denied, and cross-seller isolation holds). It
  requires the confirmed Phase 7 accounts (Phase 8 cross-actor accounts
  optional; SKIPs when absent). See `PHASE10_VERIFICATION.md`. The
  review system is documented in `RATINGS_AND_REVIEWS.md`; the in-browser
  journey checklist is in `PHASE10_MANUAL_TESTING.md`.
- Reviews are RPC-managed: client INSERT on `public.reviews` is revoked and
  every review is created via the `security definer` `submit_review` RPC.
  New reviews are published as `approved`; buyer edit/delete is forbidden and
  moderation is deferred to Phase 13. One review per `order_item_id` (DB
  unique); ratings are 1..5; blank comments normalize to NULL; aggregates are
  always computed server-side in SQL RPCs.
- Seller review visibility (`/seller/reviews`,
  `src/pages/seller/SellerReviewsPage.tsx`): the seller dashboard reads their
  own reviews through the auth-derived, read-only `get_my_seller_*` RPCs
  (seller resolved from `auth.uid()` via `auth_seller_id()`, never a
  browser-supplied id). Only `approved` rows return, free of email/phone/
  address/payment/reviewer_id/order_id/buyer_id; sellers are read-only —
  direct UPDATE/DELETE/reassign against `reviews` matches zero rows via
  admin-only RLS. Migration
  `20260911000000_phase10_seller_review_visibility.sql` is applied remotely.
- Phase 12 notifications: migration
  `20260913000000_phase12_notifications_google_oauth.sql` is applied remotely.
  Private trigger functions derive recipient/event/actor/target data from
  trusted inquiry/order/payment/review/report/dispute/seller rows. Browser
  execution of `notify_user` and `emit_marketplace_notification` is revoked;
  RLS permits recipient-only SELECT, and read state changes use
  `mark_notification_read` / `mark_all_notifications_read`. Deliveries dedupe
  on `(recipient_id, event_key)` and are in the Supabase Realtime publication.
  Frontend code lives under `src/features/notifications/`,
  `src/components/notifications/`, and `/notifications`. See
  `NOTIFICATIONS.md` and `PHASE12_VERIFICATION.md`.
- Google OAuth augments password auth through Supabase. `/auth/callback`
  validates internal return paths, maps provider errors to safe copy, handles
  blocked accounts, and never receives provider secrets. The hosted provider
  redirects to Google, but production consent/callback/profile/account-linking
  remains manual. Required Google callback:
  `https://mygnxlhimbrmjwtrffbh.supabase.co/auth/v1/callback`. See
  `AUTHENTICATION.md` and `DEPLOYMENT.md`.
- Phase 12 hosted verification (`verify-phase12.mjs`) covers event targeting,
  deduplication, failed-transition non-emission, owner RLS, read RPCs, and
  multi-seller isolation. `PHASE12_TEST_ADMIN_*` is optional; without it the
  positive admin report-recipient and seller-status checks explicitly SKIP.
  Phase 11-12 Playwright acceptance is wired through `npm run test:e2e`.
- Phase 12 production deployment and Google OAuth were manually accepted by the
  user on 2026-09-14. Do not reclassify Phase 12 as partial.
- The home hero heading is "Buy. Sell. Play Better." and the not-found page
  links read "Return home" / "Browse the marketplace"; `tests/unit/smoke.test.tsx`
  asserts that copy. The route root uses `ApplicationErrorPage` as its
  `errorElement`.

## Rules
- Plan the next incomplete phase before implementing; identify files, migrations, RLS policies, tests, risks, and completion criteria.
- Decide minor technical questions yourself from the spec/architecture; only raise blockers that need credentials, access, or business decisions.
- No fake completion, silent `catch` blocks, `any` everywhere, or hardcoded roles/categories/brands.
- Git: no force push, no destructive cleanup, no pushing to a remote unless authorized, no committing secrets.
