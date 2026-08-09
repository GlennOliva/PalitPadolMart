# PalitPaddleBai Mart

A web-based pickleball equipment marketplace where players can buy and sell
paddles, balls, bags, shoes, apparel, grips, nets, training equipment, and
more.

**Current project phase:** Phase 2 — Authentication and User Management
complete (Phases 0–2 committed). Next: Phase 3 — Seller Onboarding.

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
built the database schema; Phase 2 added authentication and user management:

```
src/
├── components/
│   ├── auth/                       # AuthCard, PasswordField, ProtectedRoute, GuestRoute
│   ├── common/                     # FormField, SubmitButton, FormError, Alert, LoadingState, ProfileUnavailable
│   └── layout/AppLayout.tsx        # header / main / footer shell
├── features/auth/                  # AuthProvider, useAuth, auth.service, errors, utils, validation, avatar
├── pages/
│   ├── auth/                       # LoginPage, RegisterPage, ForgotPasswordPage, ResetPasswordPage
│   ├── account/                    # ProfilePage, PreferencesPage
│   ├── HomePage.tsx                # root route
│   ├── DashboardPage.tsx           # post-login landing
│   ├── AccountSuspendedPage.tsx    # inactive-account screen
│   └── NotFoundPage.tsx            # catch-all route
├── routes/index.tsx                # createBrowserRouter setup + route guards
├── lib/supabase/client.ts          # Supabase client (typed, env-guarded)
├── types/database.ts               # generated DB types
└── main.tsx                        # entrypoint wiring AuthProvider + router

supabase/
├── config.toml                     # local Supabase scaffold
├── migrations/                     # SQL migrations (Phase 1/2)
├── functions/
└── seed.sql                        # seed data

tests/
├── unit/                           # unit/integration tests (smoke + auth suite)
├── integration/
└── e2e/
```

Routing uses React Router with a layout route (`AppLayout`) and nested
`HomePage` / `NotFoundPage` routes. Auth routes are wrapped in `GuestRoute`;
protected account routes in `ProtectedRoute`. See `AUTHENTICATION.md` for the
auth flow details and required Supabase Auth dashboard configuration.

## Supabase setup status

- Client scaffold: created (`src/lib/supabase/client.ts`); fails loudly if
  env vars are missing.
- Local configuration: `supabase/config.toml` scaffolded.
- Database foundation: complete and committed — schema, enums, RLS, storage
  buckets, and seed data are tracked under `supabase/migrations/` and
  `supabase/seed.sql`. See `DATABASE.md` and `SECURITY.md`.
- Live project: **connected** — linked to the hosted "PalitPaddleBai" project
  (ref `mygnxlhimbrmjwtrffbh`); both migrations applied remotely.
- Database types: generated from the live project
  (`supabase gen types typescript --linked`) into `src/types/database.ts`.
- `.env.local` holds the real `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`
  (gitignored — never commit).

## Known blockers

- Supabase Auth dashboard configuration (Site URL, Redirect URLs, email
  confirmation, auth email templates) must be set manually in the Supabase
  dashboard.
- Password-recovery / confirmation email delivery and live end-to-end auth
  flows require a running UI and a real user; they are not verifiable from the
  command line here.
