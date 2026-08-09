# PalitPaddleBai Mart — Security

## Threat model summary

The application is Supabase-first: Postgres (RLS), Auth, and Storage are the
security boundary. The browser client uses only the publishable anon key; all
authorization decisions are enforced in the database, never merely in the UI.

## Roles and identities

- `anon` — guests (browsing, no session).
- `authenticated` — signed-in users.
- `service_role` — server-side flows only; never exposed to the browser.
- Application roles live in `profiles.role` (`customer`, `seller`, `admin`)
  and `profiles.account_status`.

## Row Level Security (RLS)

RLS is enabled on every table. Highlights:

- **Profiles**: users read/update only their own row; full rows require
  admin. Public data is exposed through `public_profiles` and
  `public_seller_profiles` definer views that select only public columns.
- **Listings**: guests read only `active` listings; sellers manage their own;
  admins see all. Column grants block changing `seller_id`.
- **Favorites / recommendation profiles / notifications**: owner-only.
- **Inquiries / messages, orders / items, payments, fulfillment**:
  participants (buyer, seller) plus admins; unrelated users see nothing.
- **Reviews**: approved reviews are public; other states are reviewer/admin
  only. `unique (order_id, reviewer_id)` prevents duplicate reviews.
- **Disputes / evidence**: participants and assigned admins only.
- **Admin/audit tables**: admin-only (`is_admin()` policy).
- **listing_views / notifications / payments / order_items**: no client write
  policies; written server-side in later phases.

## Admin authorization model

Authorization does **not** depend on mutable user metadata (e.g. `app_metadata`
a JWT can claim) or on client-supplied values.

- `profiles.role` + `profiles.account_status` are the source of truth.
- Users cannot self-escalate: column-level grants exclude `role`/
  `account_status` from `authenticated` UPDATE, and the
  `prevent_role_escalation` trigger refuses non-admin changes.
- Clients cannot insert `profiles` rows (no insert policy; rows are created by
  the auth trigger).
- Admin state changes go through security-definer functions
  (`admin_set_role`, `admin_set_account_status`, `admin_set_seller_status`)
  that re-check `is_admin()`.
- `is_admin()` is security-definer and only returns a boolean.

## Storage security

Buckets and object policies in `20260809000001_create_storage_foundation.sql`:

- `avatars` (private) — only `avatars/{user_id}/...` owned by the caller.
- `marketplace-products` (public read) — writes restricted to paths under the
  caller's `seller_id`; no open write policy.
- `dispute-evidence` (private) — only the owner and admins.

## Secret handling

- Only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are used in browser
  code. Never place the service-role key, database password, or third-party
  secrets in `VITE_*` variables.
- `.env` / `.env.*` are gitignored; `.env.example` is tracked with placeholders
  only.
- No real credentials exist in this environment; a live connection is BLOCKED.

## Known limitations

- Order status transitions are not yet gated by a state machine (Phase 8).
- Review eligibility and dispute resolution workflows are Phase 10/11.
- Migrations and storage setup could not be applied/verified locally (no
  Supabase CLI/Docker/project) — application must be followed by a live
  security verification pass.
