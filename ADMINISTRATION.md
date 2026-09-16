# Administration

PalitPaddleBai Mart's Phase 13 administration, moderation, and platform
oversight system. All administrative writes flow through typed, validated,
`security definer` RPCs that derive the acting admin from `auth.uid()`, enforce
business rules in the database, and append every successful mutation to the
append-only `admin_actions` ledger.

## Authorization

- An administrator is resolved exclusively from `auth.uid()` →
  `profiles.role = 'admin'` via `public.is_admin()`. The browser never supplies
  an admin id or role.
- `AdminRoute` guards the UI; the database is the real security boundary. Every
  admin RPC re-checks `is_admin()` server-side and raises `FORBIDDEN` otherwise.
- Column-level grants prevent clients from self-promoting their `profiles.role`
  or changing status columns. No service-role key ever touches frontend code.
- Active-account enforcement: administrative mutations require the acting admin
  account to be active and (where relevant) the target user to be active.
- Denial semantics are tested in `verify-phase13.mjs`: buyers, sellers, and
  strangers receive server errors for every `admin_*` RPC, direct role/status
  updates, and audit-ledger writes.

## Audit ledger

`admin_actions` is a canonical, append-only record of administrative work.

- Every successful mutation appends one row through the private
  `record_admin_action` helper (not executable by the browser).
- Rows capture: action type, entity type/id, acting admin (from
  `auth.uid()`), reason (5–1000 characters, trimmed), previous/new JSON data
  (≤ 8 KB objects), and a database timestamp.
- `prevent_admin_action_changes()` blocks UPDATE and DELETE on the ledger for
  all roles; INSERT outside the private helper is denied by RLS.
- `audit_logs` remains reserved for broader future system events.

## Operational areas

| Area | Path | Writes |
| --- | --- | --- |
| Dashboard | `/admin` | — (summary only) |
| Users | `/admin/users` | suspend, reactivate, deactivate, promote, demote |
| Sellers | `/admin/sellers` | approve, reject, suspend, reactivate |
| Listings | `/admin/listings` | remove (moderation), restore |
| Reports | `/admin/reports` | under review, resolve, dismiss |
| Reviews | `/admin/reviews` | hide, restore |
| Orders | `/admin/orders` | — (oversight) |
| Payments | `/admin/payments` | — (oversight) |
| Disputes | `/admin/disputes` | claim, resolve |
| Refunds | `/admin/refunds` | — (oversight) |
| Audit logs | `/admin/audit-logs` | — (ledger read) |
| Categories | `/admin/categories` | create, update, deactivate, reactivate |
| Brands | `/admin/brands` | create, update, deactivate, reactivate |

## Domain rules enforced in the database

### Users

`admin_promote_user_to_admin`, `admin_demote_admin`, `admin_suspend_user`,
`admin_deactivate_user`, `admin_reactivate_user`.

- Self-service role or status changes are always denied.
- At least one active administrator must remain (`LAST_ACTIVE_ADMIN`).
- Suspension stops sign-in enforcement; deactivation is a terminal account
  state (no reactivation).
- Seller capability derives from `seller_profiles.seller_status`, not
  `profiles.role`, so promoting a customer to admin does not grant selling.

### Sellers

`admin_approve_seller`, `admin_reject_seller`, `admin_suspend_seller`,
`admin_reactivate_seller`.

- Status transitions are validated (`INVALID_SELLER_TRANSITION`).
- Approving requires the owning user account to be active.
- The generic `admin_change_seller_status` (expected + new status + action
  type) is revoked from the browser and reserved for trusted tooling.

### Listings moderation

`admin_moderate_listing` with actions `remove` / `restore`.

- Removal is a soft moderation status applied through the trusted path; it
  never hard-deletes the row.
- A listing with open active reports can be evidenced via the reports list.

### Listing reports

`admin_update_listing_report` with statuses `under_review`, `resolved`,
`dismissed`.

- Resolving requires a non-empty resolution (≤ 2000 chars).
- Report creation never notifies or leaks its id to the reported seller.

### Reviews moderation

`admin_moderate_review` with actions `hide` / `restore`.

- Original review content and the verified-purchase relationship are preserved
  in place; hiding never deletes the row.

### Disputes

`admin_claim_dispute`, `admin_resolve_dispute`.

- Only an open, unassigned dispute can be claimed
  (`DISPUTE_NOT_CLAIMABLE`), and only a claimed dispute under review can be
  resolved (`DISPUTE_NOT_RESOLVABLE`, `DISPUTE_NOT_ASSIGNED`).
- Resolution requires a resolution text and a reason.
- A dispute with an active refund cannot be resolved until that refund is
  handled (`REFUND_STILL_ACTIVE`).
- Event history is readable through `admin_list_dispute_events`; participant
  notifications are emitted by database triggers.

### Refunds

Read-only oversight through `admin_list_refunds`, `admin_get_refund`, and
`admin_list_refund_events`. No admin refund mutation exists; refund creation
and status flow stay with the Phase 8/9 buyer–seller RPCs.

### Categories and brands

`admin_create_category`, `admin_update_category`, `admin_deactivate_category`,
`admin_reactivate_category` (and the brand equivalents).

- Name (2–100), slug (2–80 lowercase `^[a-z0-9]+(-[a-z0-9]+)*$`), description
  (≤ 1000), sort order (0–10000), logo URL (≤ 500).
- Slug uniqueness (`CATEGORY_SLUG_EXISTS` / `BRAND_SLUG_EXISTS`).
- Deactivation is blocked while active listings reference the item
  (`CATEGORY_IN_USE` / `BRAND_IN_USE`).
- The generic `admin_set_category_active` / `admin_set_brand_active` setters
  are revoked from the browser.

## Read RPCs

Every list RPC paginates database-side (`p_page`, `p_page_size` ≤ 25) and
returns a `total_count` on each row:

- `admin_summary` — operational totals for the dashboard.
- `admin_list_users` / `admin_get_user`
- `admin_list_sellers` / `admin_get_seller`
- `admin_list_listings` / `admin_get_listing`
- `admin_list_listing_reports` / `admin_get_listing_report`
- `admin_list_reviews` / `admin_get_review`
- `admin_list_orders` / `admin_get_order`
- `admin_list_disputes` / `admin_get_dispute`
- `admin_list_dispute_messages` / `admin_list_dispute_evidence` /
  `admin_list_dispute_events`
- `admin_list_refunds` / `admin_get_refund` / `admin_list_refund_events`
- `admin_list_categories` / `admin_list_brands`
- `admin_list_admin_actions` / `admin_get_admin_action`

## Frontend structure

- Services and types: `src/features/admin/` (RPC wrappers, URL param
  parse/serialize, validation, safe error mapping). Indicator errors map to
  allowlisted codes; raw database/RLS details are never surfaced.
- Components: `src/components/admin/` (`AdminRoute`, `AdminLayout`, `AdminNav`,
  `AdminActionDialog`, search/filter/pagination/table primitives, detail
  drawer, stat card).
- Pages: `src/pages/admin/` (dashboard plus the 12 operational workspaces).
- Routes: `/admin` under `ProtectedRoute` + `AdminRoute` in
  `src/routes/index.tsx`, lazy-loaded per section.
- Admin env vars: `PHASE13_TEST_ADMIN_EMAIL`, `PHASE13_TEST_ADMIN_PASSWORD`
  (placeholders only in `.env.example`; real values stay in `.env.local`).

## Safety rules

- Never disable RLS, revoke grants, or expose the service-role key.
- Never placeholder-fake a hosted PASS: positive admin checks require a
  confirmed admin account whose `profiles.role` is `admin`.
- Orders, payments, refunds, and audit logs are oversight views; mutation should
  be added only when a genuinely needed admin RPC is defined in a migration.