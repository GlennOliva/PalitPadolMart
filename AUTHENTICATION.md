# PalitPaddleBai Mart — Authentication & User Management

Supabase Auth (GoTrue) drives email/password and Google OAuth authentication.
The marketplace UI adds sign-in, registration, password recovery, a safe OAuth
callback, profile management, avatar uploads, and recommendation preferences.

## What exists

| Area | Where |
| --- | --- |
| Auth state provider | `src/features/auth/AuthProvider.tsx` |
| `useAuth()` hook | `src/features/auth/useAuth.ts` |
| API layer | `src/features/auth/auth.service.ts` |
| Friendly error mapping | `src/features/auth/auth-errors.ts` |
| Guard helpers | `src/features/auth/auth-utils.ts` |
| Google OAuth control | `src/components/auth/GoogleOAuthButton.tsx` |
| Form/avatar validation | `src/features/auth/validation.ts`, `avatar.ts` |
| Route guards | `src/components/auth/ProtectedRoute.tsx`, `GuestRoute.tsx` |
| OAuth callback | `src/pages/auth/OAuthCallbackPage.tsx` |
| Pages | `src/pages/auth/*`, `src/pages/account/*`, `DashboardPage`, `AccountSuspendedPage` |
| Tests | `tests/unit/*` and `tests/e2e/phase12/phase12-acceptance.spec.ts` |

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
- Login and registration retain their password forms and offer Google through
  `signInWithOAuth({ provider: 'google' })`. The redirect target is the current
  origin's `/auth/callback`, with a validated internal `next` path.
- `/auth/callback` maps provider errors to safe copy, removes provider details
  from the visible URL, waits for the authenticated profile, offers profile
  retry instead of client insertion, redirects blocked accounts to
  `/account-suspended`, and otherwise uses the safe `next` path.
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
- `/reset-password`, `/auth/callback`, and `/account-suspended` are public by
  design. The callback itself grants no data access; Supabase establishes the
  session and protected routes still enforce profile/account state.

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

## Required Auth Provider Configuration

Manual (cannot be done from code):

1. **Site URL** — set to the deployed origin (and/or `http://localhost:5173`
   for local dev) so auth emails and redirects resolve correctly.
2. **Redirect URLs** - add local and production `/reset-password` and
   `/auth/callback` URLs.
3. **Email confirmation** — decide whether new sign-ups must confirm email
   before signing in. The UI supports both paths (redirect when a session is
   returned, "check your email" otherwise).
4. **Auth email templates** — customize the password recovery / confirmation
   messages if desired.
5. **Google provider** - create a Google OAuth web client, configure
   `https://mygnxlhimbrmjwtrffbh.supabase.co/auth/v1/callback` as its authorized
   redirect URI, and store the client id/secret only in Supabase Auth provider
   settings. See `DEPLOYMENT.md`.

## Verification

Automated verification uses `npm run lint`, `npm run typecheck`, `npm run test`,
`npm run test:e2e`, and `npm run build`. Unit tests mock OAuth responses; the
Phase 12 browser suite verifies authorization request construction and callback
error/redirect behavior without automating personal Google credentials.

The hosted Phase 12 probe confirms Supabase redirects Google authorization to
`accounts.google.com`. This proves provider initiation, not the full consent and
callback exchange.

Manual/live status:

- Phase 12 production Site URL, SPA fallback, Google consent, profile
  provisioning, returning sign-in, account linking, and blocked-account
  behavior were manually accepted by the user on 2026-09-14.
- Confirmation/password-recovery email delivery remains an operational
  deployment check for future releases.
