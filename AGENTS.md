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
- Playwright `test:e2e` is not wired yet. Run `lint → typecheck → test → build` (plus `test:e2e` once E2E exists) before declaring a phase complete; never report PASS when any fail.

## Setup / env
- Copy `.env.example` to `.env.local` with `VITE_SUPABASE_URL=` and `VITE_SUPABASE_ANON_KEY=`; never commit real keys. `.env*` files are gitignored (`.env.example` stays tracked).
- The Supabase client (`src/lib/supabase/client.ts`) throws at import time when env vars are missing — that is intentional.
- No Supabase CLI/Docker/credentials are available in this environment: a live connection, migration application, and `supabase gen types` are BLOCKED until provided. Do not fabricate a connected state.

## Structure (per spec)
- `src/features/<domain>/`, `src/components/{common,layout,...}`, `src/lib/supabase`, `src/pages`, `src/routes`, `src/services`, `src/types`, `src/utils`, `src/hooks`
- `supabase/migrations`, `supabase/functions`, `supabase/seed.sql`, `supabase/config.toml`
- `tests/{unit,integration,e2e}` — tests are mandatory: recommendation scoring, order calcs, status validation, auth, RLS-sensitive ops, and full E2E journeys.
- `src/routes/index.tsx` is the single router entrypoint; add new routes there.

## Current state
- Phase 0 (project initialization/foundation) and Phase 1 (database foundation) are complete and committed. **Phase 2 — Authentication and User Management is next.**
- `tsconfig.app.json` has `strict: true` and includes `tests/`.
- `verbatimModuleSyntax` is on: type-only imports must use `import type`. `erasableSyntaxOnly` forbids TS `enum`/namespace/parameter-property constructs — model Postgres enums as union types in TS.
- Postgres enums are lowercase (e.g. `listing_status`); RLS uses `security definer` helpers `public.is_admin()` and `public.auth_seller_id()`. Column-level grants prevent self-service role/status escalation.
- `git`: repo initialized; Phase 0 and Phase 1 commits exist. No pushing to a remote unless authorized.

## Rules
- Plan the next incomplete phase before implementing; identify files, migrations, RLS policies, tests, risks, and completion criteria.
- Decide minor technical questions yourself from the spec/architecture; only raise blockers that need credentials, access, or business decisions.
- No fake completion, silent `catch` blocks, `any` everywhere, or hardcoded roles/categories/brands.
- Git: no force push, no destructive cleanup, no pushing to a remote unless authorized, no committing secrets.
