# PalitPaddleBai Mart

A web-based pickleball equipment marketplace where players can buy and sell
paddles, balls, bags, shoes, apparel, grips, nets, training equipment, and
more.

**Current project phase:** Phase 1 — Database Foundation (Phase 0 foundation
complete).

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

Phase 0 established the application shell and Supabase foundation:

```
src/
├── components/layout/AppLayout.tsx   # header / main / footer shell
├── pages/
│   ├── HomePage.tsx                  # root route placeholder
│   └── NotFoundPage.tsx              # catch-all route
├── routes/index.tsx                  # createBrowserRouter setup
├── lib/supabase/client.ts            # Supabase client (env-guarded)
├── types/                            # generated DB types land in Phase 1+
└── main.tsx                          # entrypoint wiring the router

supabase/
├── config.toml                       # local Supabase scaffold
├── migrations/                       # SQL migrations (Phase 1)
├── functions/
└── seed.sql                          # seed data (Phase 1)

tests/
├── unit/                             # unit tests (e.g. smoke.test.tsx)
├── integration/
└── e2e/
```

Routing uses React Router with a layout route (`AppLayout`) and nested
`HomePage` / `NotFoundPage` routes. Future marketplace, seller, and admin
routes will be added to `src/routes/index.tsx`.

## Supabase setup status

- Client scaffold: created (`src/lib/supabase/client.ts`); fails loudly if
  env vars are missing.
- Local configuration: `supabase/config.toml` scaffolded.
- Live project connection: **BLOCKED** — no Supabase CLI, Docker, project
  URL, or credentials available. Migrations and seed are tracked and ready to
  apply once a project can be linked.
- Database types: generation deferred until migrations can be applied
  (`supabase gen types`).

## Known blockers

- No Supabase credentials / project reference — live connection, migration
  application, and type generation cannot be verified locally.
- Supabase CLI and Docker not installed — required to run `supabase db
  reset`, apply migrations, and run a local stack.
