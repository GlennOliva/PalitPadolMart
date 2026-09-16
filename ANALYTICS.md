# Analytics & Reporting (Phase 14)

PalitPaddleBai Mart's reporting and business-insights system. Every metric in
this document is **derived** at query time from the trusted transactional
tables (`orders`, `order_items`, `payments`, `fulfillment_details`, `refunds`,
`disputes`, `reviews`, `listing_views`, `favorites`, `inquiries`, `listings`,
`seller_profiles`, `profiles`, `categories`, `brands`, `listing_reports`). No
parallel counters, no client-side authoritative aggregation, and no fabricated
sample data: an empty period reports zeros / "No data".

This metric dictionary is the contract implemented by the Phase 14 migration
and the admin/seller analytics pages.

---

## 1. Scope

- **Admin analytics** (`/admin/analytics`) — marketplace-wide KPIs, trends,
  categories, popular listings, and top sellers. Requires
  `auth.uid() → profiles.role = 'admin'` (`is_admin()`), same as every Phase 13
  admin RPC.
- **Seller analytics** (`/seller/analytics`) — the caller's own store
  performance. The seller is resolved exclusively from
  `auth.uid() → auth_seller_id()` **inside the RPC**; the browser can never
  pass a seller id, so another seller's data is unreachable on this path.
- Both are read-only. Nothing in Phase 14 writes to analytics tables, and only
  binned, aggregated data is returned (no buyer emails, phones, addresses,
  payment references, proof paths, or dispute/report evidence content).

## 2. Time semantics

- All timestamps are `timestamptz` (UTC). A metric is attributed by the
  following event timestamp:

| Metric group | Attribution column |
| --- | --- |
| New users / new sellers / new listings | `created_at` |
| Orders / GMV / units sold | `orders.created_at` |
| Views | `listing_views.viewed_at` |
| Favorites | `favorites.created_at` |
| Inquiries | `inquiries.created_at` |
| Reviews | `reviews.created_at` |
| Refund value / net sales reduction | `refunds.completed_at` (completed refunds only) |
| Disputes | `disputes.created_at` |
| Listing reports | `listing_reports.created_at` |

- The date window is inclusive on both ends (`p_start_date` … `p_end_date`;
  internally `[start 00:00:00, end 23:59:59.999]`).
- Windows are validated: `p_start_date ≤ p_end_date`, and the span is bounded
  (documented maximums below) to keep result sets predictable.

### Window and bucket limits

| Bucket | Max span |
| --- | --- |
| `day` | 92 days |
| `week` | 546 days |
| `month` | 2190 days (6 years) |
| Overview / ranking RPCs | 2190 days |

Exceeding any limit raises `INVALID_DATE_RANGE`.

## 3. Core metric definitions

### Users and sellers

| Metric | Definition |
| --- | --- |
| Registered users | `count(profiles)` |
| Active users | `profiles.account_status = 'active'` |
| Suspended users | `profiles.account_status = 'suspended'` |
| New users (window) | profiles with `created_at` in window |
| Sellers | `count(seller_profiles)` |
| Active sellers | `public.seller_is_active(sp.id)` (seller active + owning account active) |
| Pending sellers | `seller_status = 'pending'` |
| New sellers (window) | seller_profiles with `created_at` in window |

### Catalog

| Metric | Definition |
| --- | --- |
| Active listings | `listing_status = 'active'` |
| Sold listings | `listing_status = 'sold'` |
| New listings (window) | listings with `created_at` in window |

### Transactions and revenue

`orders.subtotal = orders.total` everywhere (the marketplace charges no fees),
so order-level GMV and item-level sums are always equal.

| Metric | Definition |
| --- | --- |
| Orders (window) | `count(orders)` with `created_at` in window |
| **Transacted orders** | `status IN ('paid','preparing','shipped','ready_for_pickup','completed')` — money settled, not cancelled |
| Completed orders | `status = 'completed'` |
| Cancelled orders | `status = 'cancelled'` |
| Disputed orders | distinct `order_id` in `disputes` whose order `created_at` is in window (a dispute does not change `orders.status`) |
| **Gross sales (GMV)** | `Σ orders.total` over transacted orders in window |
| Units sold | `Σ order_items.quantity` over transacted orders in window |
| **Refund value** | `Σ refunds.amount` where `refund_status = 'completed'` and `completed_at` is in window |
| Refund count | number of those completed refunds |
| **Net sales** | `Gross sales − Refund value` (never negative beyond gross) |
| Average order value (AOV) | `Gross sales / transacted orders` (0 when none) |
| Conversion rate | `transacted orders / listing views` (0 when no views) |

A cancelled/failed/unpaid order is **never** a sale. A refund reduces the net
figure only once its workflow reaches `completed` (Phase 11 semantics). An order
with a dispute still contributes to gross sales; dispute volume is reported
separately so the two can never be conflated.

### Engagement

| Metric | Definition |
| --- | --- |
| Listing views | `count(listing_views)` with `viewed_at` in window |
| Unique viewers | distinct non-null `viewer_id` in that set |
| Favorites | `count(favorites)` with `created_at` in window |
| Inquiries | `count(inquiries)` with `created_at` in window |

### Reviews, disputes, reports

| Metric | Definition |
| --- | --- |
| Approved reviews | `reviews.status = 'approved'` |
| Average rating | `avg(reviews.rating)` over approved reviews for the window (seller overview uses `seller_rating`, matching Phase 10) |
| Open disputes | `dispute_status IN ('open','under_review')` |
| Resolved disputes | `dispute_status = 'resolved'` |
| Open reports | `listing_reports.status IN ('pending','under_review')` |
| Resolved reports | `listing_reports.status = 'resolved'` |
| Dismissed reports | `listing_reports.status = 'dismissed'` |

## 4. Ranking tables (admin)

All ranking RPCs paginate database-side (`p_page ≥ 1`, `p_page_size` 1–100,
`total_count` on every row) and validate sort keys against an allowlist
(`INVALID_SORT`).

- **Categories** (`admin_analytics_categories`) — per category: active
  listings, units sold, and item-level GMV. Sort: `gross_sales_desc`,
  `units_sold_desc`, `active_listings_desc`, `name_asc`.
- **Popular listings** (`admin_analytics_top_listings`) — per listing: status,
  store, category, views, favorites, inquiries, units sold, item-level GMV,
  average approved rating. Sort: `views_desc`, `favorites_desc`,
  `gross_sales_desc`, `units_sold_desc`, `newest`.
- **Top sellers** (`admin_analytics_top_sellers`) — per seller: status, active
  listings, units sold, GMV, completed orders, average seller rating. Sort:
  `gross_sales_desc`, `units_sold_desc`, `completed_orders_desc`,
  `rating_desc`, `store_asc`.

Item-level GMV for categories/listings uses `Σ order_items.unit_price ×
quantity` over the transacted order set; because there are no fees it equals
the order-level `orders.subtotal` sums used by the overview.

## 5. Time series

Both admin and seller RPCs return zero-filled series for `p_bucket` in
`day | week | month` across the requested window. Each bucket carries: new
users, new sellers, new listings, orders, transacted orders, completed orders,
cancelled orders, gross sales, net sales, units sold, views, favorites,
inquiries (seller series scopes these to the caller's own listings/orders).
Missing buckets render as zeros — never as gaps.

## 6. Authorization and hardening

- All RPCs are `security definer`, `set search_path = public`, stable, and
  raise `AUTH_REQUIRED` when `auth.uid()` is null, then the role check
  (`FORBIDDEN`) for non-admins (admin RPCs) or callers without a seller
  profile (seller RPCs).
- Seller scope is **always** `auth_seller_id()` inside the function body. There
  is no `p_seller_id` parameter anywhere, so a forged seller id is impossible.
- Executive grants mirror Phase 13: `revoke ... from public, anon` and
  `grant execute ... to authenticated` (verified by `verify-phase14.mjs`).
- Date-window, bucket, sort, and pagination bounds are enforced in Postgres;
  raised codes (`INVALID_DATE_RANGE`, `INVALID_BUCKET`, `INVALID_SORT`,
  `INVALID_PAGINATION`) map to safe copy in the UI and are covered in the
  hosted verifier.

## 7. Frontend

- `src/features/admin/analytics` — admin analytics service/types/params and
  error mapping (reusing the Phase 13 admin error surface).
- `src/features/seller/analytics` — seller analytics service/types; the seller
  analytics service performs **no** seller-id lookup client-side.
- Pages: `src/pages/admin/AdminAnalyticsPage.tsx` and
  `src/pages/seller/SellerAnalyticsPage.tsx`. Both keep filters in the URL via
  the `parseAnalyticsSearch` / `serializeAnalyticsSearch` helpers, use
  `useDebouncedValue`, and render loading/error/empty states.
- Charts are dependency-free, accessible CSS/SVG bars (`AnalyticsBarChart`,
  `AnalyticsHBarList`) with `role="img"` + `aria-label` and the exact values in
  the markup (no color-only signals).
- CSV exports are client-side and sanitized against spreadsheet formula
  injection (cells beginning with `=`, `+`, `-`, `@`, tab, or CR are prefixed
  with `'`) — `src/utils/csv.ts`.

## 8. Status

- Migration `20260915000000_phase14_analytics.sql` defines the 8 RPCs
  (3 admin analytics + 3 admin rankings + 2 seller analytics series are
  combined; exact list below) and is applied remotely.
  `20260915010000_phase14_seller_timeseries_fix.sql` corrects a typo
  (`o.units` → `p.units`) that broke `my_seller_analytics_timeseries`.
  `20260916000000_phase14_timeseries_bucket_fix.sql` fixes the
  time-series bucket generator (previously `generate_series` started at the
  exact window start, so a month bucket spanning a month boundary dropped the
  trailing month's sales even though the overview counted them; the series is
  now anchored at `date_trunc(p_bucket, v_start)`, matching the overview's
  window semantics). All three are applied remotely.
- Hosted verification: `verify-phase14.mjs`. Seller-side and denial checks run
  against the confirmed Phase 7 accounts. The positive **admin** analytics
  checks require the Phase 13 admin test credential; while that credential
  returns `invalid_credentials` the admin-positive section explicitly SKIPs
  rather than faking a PASS (see `PHASE14_VERIFICATION.md`). The verifier also
  asserts `10a` — month-bucket totals equal the overview across a
  boundary-spanning window — to keep this regression out.

### RPC inventory (Phase 14)

| RPC | Scope | Returns |
| --- | --- | --- |
| `admin_analytics_overview(start, end)` | admin | single row of all §3 admin metrics + AOV + conversion rate |
| `admin_analytics_timeseries(start, end, bucket)` | admin | zero-filled §5 series |
| `admin_analytics_categories(start, end, sort, page, page_size)` | admin | §4 category table |
| `admin_analytics_top_listings(start, end, sort, page, page_size)` | admin | §4 popular listings |
| `admin_analytics_top_sellers(start, end, sort, page, page_size)` | admin | §4 top sellers |
| `my_seller_analytics_overview(start, end)` | seller (auth-derived) | single row of seller-scoped §3 metrics |
| `my_seller_analytics_timeseries(start, end, bucket)` | seller (auth-derived) | zero-filled seller §5 series |
| `my_seller_analytics_listings(start, end, sort, page, page_size)` | seller (auth-derived) | seller §4 listing table |