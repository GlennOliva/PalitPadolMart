# PalitPaddleBai Mart — Search & Discovery

Phase 5 of the build. The marketplace catalog gained keyword search, combined
filters, sorting, and pagination — all driven from the URL so any browse state
is shareable and bookmarkable.

## What exists

| Area | Where |
| --- | --- |
| Search RPC | `public.marketplace_search_listings(...)` (security invoker) |
| API layer | `src/features/marketplace/search.service.ts` |
| URL state (parse/serialize) | `src/features/marketplace/search-params.ts` |
| Marketplace page | `src/pages/marketplace/MarketplacePage.tsx` |
| Listing card / gallery | `src/components/marketplace/ListingCard.tsx`, `ListingImageGallery.tsx` |
| Tests | `tests/unit/search.service.test.ts`, `search-params.test.ts`, `MarketplacePage.test.tsx`, `marketplace-utils.test.ts` |

## Search RPC

`marketplace_search_listings` is a single `security invoker` function that
handles keyword search + all filters + sort + pagination in one round trip:

- Keyword matches title, description, category name, and brand name
  (`ilike`). `%`, `_`, and `\` in the query are escaped (migration
  `20260809000006_phase5_search_escape_wildcards.sql`), so a literal `%`
  never matches "everything".
- Filters: category slug, brand slug, listing condition, min/max price,
  pickup-only, delivery-only.
- Sorts: `newest` (default), `oldest`, `price_asc`, `price_desc`.
- Pagination: `page`/`page_size` (default 12, capped at 100), returning
  `{ items, total, page, pageSize }`.
- Only `listing_status = 'active'` and `quantity > 0` rows are returned —
  enforced in the RPC **and** by the base `listings` select policy, so
  anonymous callers can only ever see published inventory.

`security invoker` (not definer) means the function runs with the caller's own
privileges — there is no elevated search path.

## URL state

The marketplace page keeps every facet in the query string:

- `q` keyword, `category`, `brand`, `condition`, `minPrice`, `maxPrice`,
  `pickup`, `delivery`, `sort`, `page`.
- `parseMarketplaceSearch` / `serializeMarketplaceSearch` keep the URL and the
  form in sync; back/forward and shareable links work naturally.
- Active-filter chips and the active filter count come from
  `buildActiveFilterChips` / `activeFilterCount`.
- Category navigation links (`/marketplace?category=paddles`) pre-filter the
  catalog; the recommendation pages reuse this URL for "Browse all paddles".

## Performance notes

- Sort orders that reference `price`/`created_at` are backed by existing
  indexes (see `DATABASE.md → Indexes`).
- Keyword search cannot use a btree index because of the leading wildcard; a
  `pg_trgm` GIN index is the documented future upgrade and is intentionally not
  added while the catalog is small.

## Migrations

| Migration | Purpose |
| --- | --- |
| `20260809000003_phase5_marketplace_search.sql` | Initial search RPC + pagination |
| `20260809000004_phase5_search_rpc_param_fix.sql` | Rename reserved-word param (`condition` → `listing_condition`) |
| `20260809000006_phase5_search_escape_wildcards.sql` | Escape LIKE wildcards in the keyword term |

## Verification

Automated: `npm run lint`, `npm run typecheck`, `npm run test` (292 tests),
`npm run build` all pass. The search RPC has been applied to the hosted
project and verified live (keyword/brand match, literal `%`/`_` handling, all
filters, all sorts, pagination, out-of-range page).
