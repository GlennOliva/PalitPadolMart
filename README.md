# PalitPaddleBai Mart

A web-based pickleball equipment marketplace where players can buy and sell
paddles, balls, bags, shoes, apparel, grips, nets, training equipment, and
more.

**Current project phase:** Phase 15 - UI/UX Hardening (admin data visualization + report printing).
Phases 0-14 are complete or implemented; the user manually accepted the Phase
11 browser journey and the Phase 12 production Google OAuth/deployment journey
on 2026-09-14. Phase 14 added admin + seller analytics dashboards with
date-range/bucket filters, previous-period compare, paginated rankings, and CSV
export. Phase 15 adds the professional admin dashboard (`/admin`) with KPI
cards and previous-period deltas, TanStack React Charts performance/status
visualizations on the dashboard and analytics pages, printable reports with
print-specific stylesheets (`Print Executive Report`, `Print Report`, `Print
Report Directory`, and a `/admin/report-center` directory), and the Playwright
responsive/print/console-error acceptance matrix. Hosted Phase 13 and the
admin-positive sections of Phases 14-15 remain blocked on a corrected admin
test credential (see `PHASE13_VERIFICATION.md` / `PHASE14_VERIFICATION.md` /
`PHASE15_VERIFICATION.md`).

## Purpose

PalitPaddleBai Mart connects pickleball buyers and sellers in one platform. It
supports browsing, searching, personalized paddle recommendations, orders,
reviews, disputes, moderation, and marketplace analytics. New and used
equipment is supported. The authoritative build specification lives in
`MASTER_BUILD_SPEC.md`.

## Technology stack

- React 19 + TypeScript (strict) + Vite 8
- React Router 7 for client-side routing
- Supabase (Postgres, Auth, Storage) via `@supabase/supabase-js`
- Vitest + React Testing Library + jsdom for unit/integration tests
- oxlint for linting (not ESLint — see `.oxlintrc.json`)
- Playwright for hosted Phase 11-12 browser acceptance

## Installation

```bash
npm install
```

Requires Node.js 20.19+ (developed with Node 24).

## Environment setup

Copy `.env.example` to `.env.local` and fill in your Supabase values:

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

Only browser-safe `VITE_*` variables belong in frontend code. Never place the
Supabase service-role key or any other secret in frontend-prefixed
environment variables. Real values must never be committed.

## Development commands

```bash
npm run dev        # start the Vite dev server
npm run lint       # oxlint
npm run typecheck  # TypeScript project build (tsc -b)
npm run test       # Vitest (single run)
npm run test:watch # Vitest (watch mode)
npm run test:e2e   # Playwright browser acceptance
npm run build      # typecheck + production build
npm run preview    # preview the production build
```

Validation order before declaring a phase complete:
`lint -> typecheck -> test -> test:e2e -> build`.

## Current architecture

Phase 0 established the application shell and Supabase foundation; Phase 1
built the database schema; Phase 2 added authentication and user management;
Phases 3–4 added seller onboarding/management and the marketplace catalog;
Phase 5 added search, filters, sorting, and pagination; Phase 6 added the
paddle recommendation system; Phase 7 added favorites and inquiries; Phase 8
added orders, the cart, and multi-seller checkout; Phase 9 added payment
status and fulfillment; Phase 10 added verified-purchase ratings & reviews
**plus the seller-side review visibility extension** (the seller dashboard
reads the customer reviews for their own products/orders — read-only, no
private customer data); Phase 11 adds listing reports, seller-specific order
disputes, participant messages, private evidence, immutable event history, and
full-order manual refunds. Phase 12 adds Google OAuth and recipient-private,
deduplicated, Realtime-aware in-app notifications. Phase 13 adds a secure
administration console — typed `security definer` admin RPCs resolving the act
from `auth.uid()`, an append-only `admin_actions` audit ledger, dashboard,
user/seller management, listing/report/review moderation, and read-only
order/payment/dispute/refund oversight. Phase 14 adds admin (`/admin/analytics`)
and seller (`/seller/analytics`) reporting and analytics — date-range and
bucket filters, previous-period compare, timeseries charts, paginated ranking
tables, and sanitized CSV export over `security definer` RPCs whose seller
scope is always derived from `auth.uid()`. Phase 15 hardens administration
UI/UX — an executive dashboard with 16 animated KPI cards and deltas, TanStack
React Charts line/bar visualizations, all-time status distributions, a printable
report center (`/admin/report-center`), browser-print stylesheets (`@page` A4,
`print-only`/`no-print` surfaces), and a 375-1440px responsive/console-error
Playwright matrix:

```
src/
├── components/
│   ├── auth/                       # AuthCard, PasswordField, ProtectedRoute, GuestRoute
│   ├── common/                     # FormField, GlassPanel, Badge, EmptyState, PageHeader, Alert, ...
│   ├── analytics/                  # chart wrappers + themes + analytics range filter
│   ├── reports/                    # ReportHeader, PrintReportButton, PrintReportTable
│   ├── layout/AppLayout.tsx        # header / main / footer shell
│   ├── admin/                      # ApplicationErrorPage errorElement, AdminNav, page states
│   ├── marketplace/                # ListingCard, gallery, image manager, staged picker
│   ├── notifications/              # bell, five-row preview, list/items
│   ├── orders/                     # OrderTimeline, BuyerPaymentPanel, SellerPaymentPanel, SellerFulfillmentActions, ProofView
│   ├── disputes/                   # Order dispute panels, list/detail, evidence, refunds
│   ├── recommendations/            # QuestionnaireForm, RecommendationCard
│   ├── reviews/                    # StarRating, StarRatingInput, RatingSummary, RatingDistribution, ReviewCard, ReviewList, ReviewSection, SellerReviewsPanel, ReviewForm
│   └── seller/                     # seller onboarding/dashboard/status components
├── features/
│   ├── auth/                       # AuthProvider, useAuth, auth.service, errors, utils, validation, avatar
│   ├── cart/                       # CartProvider, cart.service, validation, types
│   ├── marketplace/                # listing service, validation, utils, types, search.service, search-params
│   ├── notifications/              # provider, service, URL state, role-aware destinations
│   ├── orders/                     # orders/cart/payment/fulfillment services, validation, order-status, types
│   ├── disputes/                   # dispute/refund reads, RPC actions, evidence, validation, types
│   ├── reports/                    # listing-report RPC service and validation
│   ├── recommendation/             # scoring engine, service, types
│   ├── reviews/                    # reviews/review list/summary services, validation, types
│   ├── seller/                     # seller service, validation, provider, analytics
│   └── admin/                      # admin service, workspaces, analytics (params, service, format), report utils
├── pages/
│   ├── auth/                       # login/register/recovery/reset/OAuth callback
│   ├── account/                    # profile, preferences, favorites, inquiries, notifications
│   ├── marketplace/                # MarketplacePage, ListingDetailPage, seller listing pages
│   ├── orders/                     # BuyerOrdersPage, BuyerOrderDetailPage, SellerOrdersPage, SellerOrderDetailPage, ReviewOrderPage, CheckoutPage, ReviewItemPage
│   ├── recommendations/            # RecommendationsPage
│   ├── seller/                     # onboarding, dashboard, listings, profile, payment-methods, reviews, analytics pages
│   ├── admin/                      # AdminDashboardPage + resource workspaces + analytics + report-center pages
│   ├── HomePage.tsx                # root route
│   ├── DashboardPage.tsx           # post-login landing
│   ├── AccountSuspendedPage.tsx    # inactive-account screen
│   └── NotFoundPage.tsx            # catch-all route
├── routes/index.tsx                # createBrowserRouter setup + route guards
├── lib/supabase/client.ts          # Supabase client (typed, env-guarded)
├── types/database.ts               # generated DB types
└── main.tsx                        # entrypoint wiring providers + router

supabase/
├── config.toml                     # local Supabase scaffold
├── migrations/                     # tracked SQL migrations through Phase 14
├── functions/
└── seed.sql                        # seed data

tests/
├── unit/                           # unit/component/service tests across implemented phases
├── integration/
└── e2e/                            # hosted Phase 11-15 Playwright acceptance
```

Routing uses React Router with a layout route (`AppLayout`) and nested
`HomePage` / `NotFoundPage` routes. Auth routes are wrapped in `GuestRoute`;
protected account routes in `ProtectedRoute`. See `AUTHENTICATION.md` for the
auth flow details, `SEARCH_DISCOVERY.md` for the Phase 5 search/filter/sort/
pagination design, `PADDLE_RECOMMENDATIONS.md` for the Phase 6 scoring
model, `PAYMENTS_AND_FULFILLMENT.md` for the Phase 9 payment-review and
fulfillment state flow, and `RATINGS_AND_REVIEWS.md` for the Phase 10
verified-purchase review system, `DISPUTES_AND_REFUNDS.md` for Phase 11, and
`NOTIFICATIONS.md` for Phase 12. The Phase 13 administration system is
documented in `ADMINISTRATION.md`; the Phase 14 analytics contract lives in
`ANALYTICS.md`; the Phase 15 dashboard, charts, and printable-report
architecture are covered by `PHASE15_VERIFICATION.md` and the
`DESIGN_SYSTEM.md` chart/print sections. Hosted verification is documented in
the corresponding `PHASE*_VERIFICATION.md` files; deployment and Google
provider configuration live in `DEPLOYMENT.md`.

## Supabase setup status

- Client scaffold: created (`src/lib/supabase/client.ts`); fails loudly if
  env vars are missing.
- Local configuration: `supabase/config.toml` scaffolded.
- Database foundation: complete and committed — schema, enums, RLS, storage
  buckets, and seed data are tracked under `supabase/migrations/` and
  `supabase/seed.sql`. See `DATABASE.md` and `SECURITY.md`.
- Live project: **connected** - linked to the hosted "PalitPaddleBai" project
  (ref `mygnxlhimbrmjwtrffbh`); tracked migrations through Phase 14 are applied
  remotely.
- Database types: generated from the live project
  (`supabase gen types typescript --linked`) into `src/types/database.ts`.
- `.env.local` holds the real `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`
  (gitignored — never commit).
- Hosted verification: `verify-phase7.mjs` through `verify-phase15.mjs` pass
  sequentially
  against reusable confirmed test accounts (see `PHASE7_VERIFICATION.md`,
  `PHASE8_VERIFICATION.md`, `PHASE9_VERIFICATION.md`,
  `PHASE10_VERIFICATION.md`, `PHASE11_VERIFICATION.md`,
  `PHASE12_VERIFICATION.md`, `PHASE13_VERIFICATION.md`,
  `PHASE14_VERIFICATION.md`, and `PHASE15_VERIFICATION.md`). Phase 12 reports
  two explicit optional admin skips when `PHASE12_TEST_ADMIN_*` is absent;
  Phase 13 is **PARTIAL** until the `PHASE13_TEST_ADMIN_*` test credential is
  corrected (`invalid_credentials`); Phases 14-15 seller-side/public checks are
  **ALL PASS** and their admin-positive checks SKIP on the same credential
  blocker. Phase 15 Playwright: public responsive matrix, print-stylesheet and
  report-center journeys (admin-gated), and console-error guards all follow the
  same skip-at-absence convention.

## External configuration

- Supabase Auth URL/email settings and Google Cloud/Supabase provider secrets
  require manual dashboard configuration; see `DEPLOYMENT.md`.
- Phase 12 production Google OAuth and deployment behavior were manually
  accepted by the user on 2026-09-14. Automated checks continue to cover safe
  redirects, callback errors, notification isolation, and SPA-sensitive routes.
