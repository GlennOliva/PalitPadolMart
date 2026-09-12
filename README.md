# PalitPaddleBai Mart

A web-based pickleball equipment marketplace where players can buy and sell
paddles, balls, bags, shoes, apparel, grips, nets, training equipment, and
more.

**Current project phase:** Phase 11 — Complaints, Disputes & Refunds
**PARTIAL** (implementation and automated/hosted verification complete; manual
browser acceptance pending). Do not begin Phase 12 until that acceptance is
completed or explicitly waived.

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
- Playwright reserved for future E2E tests (`test:e2e` is not wired yet)

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
npm run build      # typecheck + production build
npm run preview    # preview the production build
```

Validation order before declaring a phase complete:
`lint → typecheck → test → build`.

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
full-order manual refunds:

```
src/
├── components/
│   ├── auth/                       # AuthCard, PasswordField, ProtectedRoute, GuestRoute
│   ├── common/                     # FormField, GlassPanel, Badge, EmptyState, PageHeader, Alert, ...
│   ├── layout/AppLayout.tsx        # header / main / footer shell
│   ├── marketplace/                # ListingCard, gallery, image manager, staged picker
│   ├── orders/                     # OrderTimeline, BuyerPaymentPanel, SellerPaymentPanel, SellerFulfillmentActions, ProofView
│   ├── disputes/                   # Order dispute panels, list/detail, evidence, refunds
│   ├── recommendations/            # QuestionnaireForm, RecommendationCard
│   ├── reviews/                    # StarRating, StarRatingInput, RatingSummary, RatingDistribution, ReviewCard, ReviewList, ReviewSection, SellerReviewsPanel, ReviewForm
│   └── seller/                     # seller onboarding/dashboard/status components
├── features/
│   ├── auth/                       # AuthProvider, useAuth, auth.service, errors, utils, validation, avatar
│   ├── cart/                       # CartProvider, cart.service, validation, types
│   ├── marketplace/                # listing service, validation, utils, types, search.service, search-params
│   ├── orders/                     # orders/cart/payment/fulfillment services, validation, order-status, types
│   ├── disputes/                   # dispute/refund reads, RPC actions, evidence, validation, types
│   ├── reports/                    # listing-report RPC service and validation
│   ├── recommendation/             # scoring engine, service, types
│   ├── reviews/                    # reviews/review list/summary services, validation, types
│   └── seller/                     # seller service, validation, provider
├── pages/
│   ├── auth/                       # LoginPage, RegisterPage, ForgotPasswordPage, ResetPasswordPage
│   ├── account/                    # ProfilePage, PreferencesPage
│   ├── marketplace/                # MarketplacePage, ListingDetailPage, seller listing pages
│   ├── orders/                     # BuyerOrdersPage, BuyerOrderDetailPage, SellerOrdersPage, SellerOrderDetailPage, ReviewOrderPage, CheckoutPage, ReviewItemPage
│   ├── recommendations/            # RecommendationsPage
│   ├── seller/                     # onboarding, dashboard, listings, profile, payment-methods, reviews pages
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
├── migrations/                     # SQL migrations (Phase 1/4/5/6/7/8/9/10)
├── functions/
└── seed.sql                        # seed data

tests/
├── unit/                           # unit/integration tests (auth, seller, marketplace, search, recommendations, orders, payments, fulfillment, reviews)
├── integration/
└── e2e/
```

Routing uses React Router with a layout route (`AppLayout`) and nested
`HomePage` / `NotFoundPage` routes. Auth routes are wrapped in `GuestRoute`;
protected account routes in `ProtectedRoute`. See `AUTHENTICATION.md` for the
auth flow details, `SEARCH_DISCOVERY.md` for the Phase 5 search/filter/sort/
pagination design, `PADDLE_RECOMMENDATIONS.md` for the Phase 6 scoring
model, `PAYMENTS_AND_FULFILLMENT.md` for the Phase 9 payment-review and
fulfillment state flow, and `RATINGS_AND_REVIEWS.md` for the Phase 10
verified-purchase review system. Manual, in-browser checklists live in
`PHASE9_MANUAL_TESTING.md` and `PHASE10_MANUAL_TESTING.md`.

## Supabase setup status

- Client scaffold: created (`src/lib/supabase/client.ts`); fails loudly if
  env vars are missing.
- Local configuration: `supabase/config.toml` scaffolded.
- Database foundation: complete and committed — schema, enums, RLS, storage
  buckets, and seed data are tracked under `supabase/migrations/` and
  `supabase/seed.sql`. See `DATABASE.md` and `SECURITY.md`.
- Live project: **connected** — linked to the hosted "PalitPaddleBai" project
  (ref `mygnxlhimbrmjwtrffbh`); Phases 1, 4, 5, 6, 7, 8, 9, and 10 migrations
  applied remotely.
- Database types: generated from the live project
  (`supabase gen types typescript --linked`) into `src/types/database.ts`.
- `.env.local` holds the real `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`
  (gitignored — never commit).
- Hosted verification: `verify-phase7.mjs`, `verify-phase8.mjs`,
  `verify-phase9.mjs`, and `verify-phase10.mjs` all pass sequentially
  against reusable confirmed test accounts (see `PHASE7_VERIFICATION.md`,
  `PHASE8_VERIFICATION.md`, `PHASE9_VERIFICATION.md`,
  `PHASE10_VERIFICATION.md`).

## Known blockers

- Supabase Auth dashboard configuration (Site URL, Redirect URLs, email
  confirmation, auth email templates) must be set manually in the Supabase
  dashboard.
- Password-recovery / confirmation email delivery and live end-to-end auth
  flows require a running UI and a real user; they are not verifiable from the
  command line here.
