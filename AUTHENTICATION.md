# PalitPaddleBai Mart — Authentication & User Management

Phase 2 of the build. Supabase Auth (GoTrue, email/password) drives all
authentication; the marketplace UI adds sign-in, registration, password
recovery, profile management, avatar uploads, and recommendation preferences.

## What exists

| Area | Where |
| --- | --- |
| Auth state provider | `src/features/auth/AuthProvider.tsx` |
| `useAuth()` hook | `src/features/auth/useAuth.ts` |
| API layer | `src/features/auth/auth.service.ts` |
| Friendly error mapping | `src/features/auth/auth-errors.ts` |
| Guard helpers | `src/features/auth/auth-utils.ts` |
| Form/avatar validation | `src/features/auth/validation.ts`, `avatar.ts` |
| Route guards | `src/components/auth/ProtectedRoute.tsx`, `GuestRoute.tsx` |
| Pages | `src/pages/auth/*`, `src/pages/account/*`, `DashboardPage`, `AccountSuspendedPage` |
| Tests | `tests/unit/*` (auth-errors, auth-utils, validation, avatar, AuthProvider, ProtectedRoute, LoginPage, AppLayout) |

## Auth flow summary

- `AuthProvider` listens to `onAuthStateChange` (skipping `INITIAL_SESSION`,
  which is covered by `getSession()`) and exposes `user`, `session`,
  `profile`, `status` (`initializing | authenticated | unauthenticated`),
  `profileLoading`, `profileError`, `isPasswordRecovery`, `signOut`,
  `refreshProfile`, and `clearPasswordRecovery`.
- Registration calls `signUp()` with first/last/display name in
  `user_metadata`. The `profiles` row is **not** created by the client — the
  Phase 1 `handle_new_user()` trigger creates it. If email confirmation is
  enabled, the UI shows a "check your email" confirmation state and only
  redirects when a session is returned.
- Sign-in supports a `location.state.from` return path, validated by
  `resolveReturnPath()` so a crafted value can never redirect off-site.
- Password recovery (`/forgot-password`) calls
  `resetPasswordForEmail(email, { redirectTo: origin + "/reset-password" })`.
  The `PASSWORD_RECOVERY` auth event sets `isPasswordRecovery`; the
  `/reset-password` page then accepts a new password, calls
  `updateUser({ password })`, clears the flag, signs out, and shows an inline
  success screen.
- Sign-out resets all local state even if the remote call fails, so the UI can
  never appear signed in after an explicit sign-out.

## Route guards

- `GuestRoute` wraps `/login`, `/register`, `/forgot-password`. Authenticated
  users are redirected to `resolveReturnPath(state.from)` (default
  `/dashboard`).
- `ProtectedRoute` wraps `/dashboard`, `/profile`, `/preferences`. It blocks:
  guests (→ `/login` with `from`), profiles that failed to load (actionable
  "profile unavailable" screen with retry — there is no insecure
  self-recovery insert), and `suspended`/`deactivated` accounts (→
  `/account-suspended`).
- `/reset-password` and `/account-suspended` are public by design.

## Server-side enforcement

UI guards are convenience, not security:

- Roles and account status live only in `profiles`; users cannot change
  `role`/`account_status` (column grants + `prevent_role_escalation`).
- `profiles` has **no** insert policy for clients — rows are trigger-created.
- Profile updates are limited to the columns in `PROFILE_SELF_UPDATE_COLUMNS`
  (`first_name`, `last_name`, `display_name`, `phone`, `avatar_url`, `city`,
  `province`).
- `recommendation_profiles` allows select/insert/update of the caller's own
  row (used via upsert); delete is admin-only by design.
- Avatars live in the **private** `avatars` bucket at
  `{user_id}/{sanitized-filename}` (matching the storage write policy). They
  are displayed via short-lived signed URLs (`createSignedUrl`, 3600s); the
  public anon key cannot read private objects directly.

## Required Supabase Auth dashboard configuration

Manual (cannot be done from code):

1. **Site URL** — set to the deployed origin (and/or `http://localhost:5173`
   for local dev) so auth emails and redirects resolve correctly.
2. **Redirect URLs** — add `http://localhost:5173/reset-password` (local) and
   the production `/reset-password` URL.
3. **Email confirmation** — decide whether new sign-ups must confirm email
   before signing in. The UI supports both paths (redirect when a session is
   returned, "check your email" otherwise).
4. **Auth email templates** — customize the password recovery / confirmation
   messages if desired.

## Verification

Automated: `npm run lint`, `npm run typecheck`, `npm run test` (63 tests),
`npm run build` all pass. Tests mock the Supabase client; no live credentials
are used in the suite.

Manual/live items not verifiable from this environment:

- Delivery of confirmation / password-recovery emails.
- Dashboard redirect/site URL behavior.
- End-to-end sign-in against the live project (requires interacting with the
  real UI and a real user). See Phase 2 build report for the live verification
  status of RLS and storage policies.
