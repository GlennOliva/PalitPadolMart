# PalitPaddleBai Mart - Deployment

The frontend is a Vite single-page application backed directly by Supabase.
The repository does not contain a privileged application server, and no
service-role key is required or permitted in the frontend deployment.

## Build

Use Node.js 20.19 or later and run:

```bash
npm install
npm run lint
npm run typecheck
npm run test
npm run test:e2e
npm run build
```

Deploy the generated `dist/` directory. The production build command is
`npm run build`.

## Environment

Configure only these browser-safe production variables:

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

Never configure the Supabase service-role key, database password, Google client
secret, OAuth token, or another private credential with a `VITE_*` prefix.
Hosted verification account variables are for local verification scripts and
must not be added to the frontend deployment.

## SPA Routing

The host must rewrite unknown application paths to `/index.html` with HTTP 200.
Static assets should still be served normally. Verify direct navigation and
browser refresh for at least:

- `/marketplace`
- `/login`
- `/auth/callback`
- `/notifications`
- `/orders/:orderId`
- `/seller/orders/:orderId`

This rewrite is mandatory for `createBrowserRouter`. A platform deployment that
serves the root page but returns 404 for these paths is not ready for OAuth or
protected-route acceptance.

For Vercel, configure an equivalent rewrite in the project or a tracked
`vercel.json` before the next production deployment:

```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

## Supabase URL Configuration

In Supabase Auth URL Configuration:

1. Set **Site URL** to the canonical deployed HTTPS origin.
2. Add the production `/auth/callback` and `/reset-password` URLs to the allowed
   redirect list.
3. Retain `http://localhost:5173/auth/callback` and
   `http://localhost:5173/reset-password` when local authentication testing is
   required.
4. Add intentional preview origins only; do not use a broad redirect wildcard
   without reviewing the redirect risk.

## Google OAuth

Google OAuth uses Supabase Auth; the browser never receives the Google client
secret.

1. In Google Cloud, create/configure an OAuth 2.0 web client and consent screen.
2. Set the authorized redirect URI to:
   `https://mygnxlhimbrmjwtrffbh.supabase.co/auth/v1/callback`.
3. Store the Google client id and client secret only in the Supabase Google
   provider settings.
4. Enable the Google provider in Supabase Auth.
5. Ensure the deployed app's `/auth/callback` URL is allowed by Supabase.
6. Complete the manual new-user, returning-user, account-linking, cancellation,
   and blocked-account checks in `PHASE12_VERIFICATION.md`.

The application requests `openid email profile`. Its callback validates `next`
as an internal path, maps provider errors to safe copy, waits for the profile,
and routes suspended/deactivated users to `/account-suspended`.

## Current Evidence

- The linked Supabase project is `mygnxlhimbrmjwtrffbh`.
- Migrations through Phase 12 are applied remotely.
- The hosted Google provider probe redirects to `accounts.google.com`.
- Hosted Phase 7-12 verification passes; two optional Phase 12 admin checks
  skip because admin test credentials are not configured.
- Local Phase 11-12 Playwright acceptance passes 21 tests.
- Phase 12 production deployment, SPA routing, and the human Google OAuth
  consent/callback/account-linking journey were accepted by the user on
  2026-09-14.

## Post-Deployment Checklist

1. Open the canonical HTTPS origin and inspect browser/network errors.
2. Direct-load and refresh every route listed under SPA Routing.
3. Complete password login, password recovery, and Google OAuth callback flows.
4. Confirm a new marketplace event updates the recipient bell through Realtime.
5. Confirm another signed-in user cannot read or mutate that notification.
6. Exercise notification loading, empty, retry, read, mark-all, filters, and
   pagination on mobile and desktop.
7. Re-run hosted verifiers against the same Supabase project one at a time.
