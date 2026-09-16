# PalitPaddleBai Mart — Design System

Source of truth for the UI layer. The tokens and component classes below live in
`src/index.css`. Reusable markup is provided by the shared components in
`src/components/common/`.

## Principles

- **Selective glassmorphism** — glass surfaces are used for emphasis: the sticky
  header, the home hero, auth cards, stat/summary cards, section panels, listing
  cards, and empty/error states. Content surfaces (forms, tables, detail rows)
  stay near-solid so text stays readable.
- **Pickleball identity** — editorial ink + pickleball lime palette, rounded
  "paddle" radii, soft gradient ambient background, near-solid (non-teal)
  surfaces. Tokens in this file are the source of truth and match `src/index.css`.
- **Readable first** — text contrast always wins over transparency. Never layer
  glass directly over high-contrast imagery without a solid/strong surface.
- **No dark mode** — light theme only. The ink footer is a deliberate accent,
  not a dark theme.
- **Progressive** — every glass rule has a `@supports` fallback and respects
  `prefers-reduced-transparency` (blur removed) and `prefers-reduced-motion`
  (transitions/scroll disabled).

## Tokens (`:root` in `src/index.css`)

### Brand palette
| Token | Value | Use |
|---|---|---|
| `--color-primary` | `#111111` | ink — links, primary buttons, focus |
| `--color-primary-strong` | `#000000` | ink hover/pressed |
| `--color-primary-soft` | `rgba(17,17,17,0.06)` | ink tint backgrounds |
| `--color-accent` | `#c4ff54` | pickleball lime — hero glow, highlights |
| `--color-accent-strong` | `#84cc16` | lime foreground on light bg |
| `--color-accent-soft` | `rgba(196,255,84,0.16)` | lime tint backgrounds |
| `--color-navy` | `#111111` | ink — footer, dark text |
| `--color-navy-soft` | `#1c1c1c` | ink panels/text on light |

### Neutrals, status, typography, spacing
- Neutrals: `--color-bg #ffffff`, `--color-surface #ffffff`, `--color-surface-2
  #f5f5f5`, text `--color-text #111111`, `--color-text-muted #525252`,
  `--color-text-faint #737373`, borders `#e5e5e5` / strong `#d4d4d4`.
- Status tokens: `--color-success`, `--color-warning`, `--color-danger`,
  `--color-info`, each with a `-bg` and `-border` pair.
- Type scale: `--text-xs` `0.75rem` → `--text-5xl` `3rem`.
- Spacing: `--space-1` `0.25rem` → `--space-20` `5rem` (multiples of 4/8).
- Radius: `--radius-sm` `0.375rem` → `--radius-2xl` `1.25rem`, `--radius-pill`
  `999px`.
- Shadows: `--shadow-sm/md/lg` and `--shadow-focus` (ink 3px ring).
- Focus: `--color-focus #111111`, `--color-focus-ring rgba(17,17,17,0.16)`.

### Glass tokens
| Token | Value |
|---|---|
| `--glass-blur` / `--glass-blur-lg` | `14px` / `24px` |
| `--glass-bg` | `rgba(255,255,255,0.62)` |
| `--glass-bg-strong` | `rgba(255,255,255,0.82)` |
| `--glass-bg-soft` | `rgba(255,255,255,0.45)` |
| `--glass-border` | `rgba(255,255,255,0.6)` |
| `--glass-highlight` | inset top highlight |
| `--glass-shadow-sm/md/lg` | depth shadows |

### Layout & motion
- `--container-max: 74rem`, `--header-height: 4rem`.
- `--ease-out: cubic-bezier(0.22, 1, 0.36, 1)`; durations `--duration-fast 150ms`,
  `--duration 240ms`, `--duration-slow 400ms`.

## Glass surfaces

| Class | Intensity | Use |
|---|---|---|
| `.glass` | default (`bg 0.62`, `blur 14px`) | listing cards, panels, empty states |
| `.glass--strong` | strong (`bg 0.82`, `blur 24px`) | header, hero, auth card, error panel |
| `.glass--soft` | soft (`bg 0.45`, `blur 10px`) | subtle secondary cards/features |

Use the React wrapper `GlassPanel` (`intensity="default" | "soft" | "strong"`,
merges `className`) instead of raw classes in new code.

## Shared components (`src/components/common/`)

- `GlassPanel` — glass surface wrapper (intensity + className).
- `Badge` — status pill. `variant` ∈ `draft | active | sold | archived | removed |
  pending | suspended | confirmed | paid | preparing | shipped | ready_for_pickup |
  completed | cancelled | disputed | neutral`, maps to `badge badge--{variant}`. Covers
  the Postgres `listing_status`, `seller_status`, and `order_status` enums.
- `EmptyState` — `title`, `body`, optional `action`, renders `.empty-state`.
- `PageHeader` — `title`, `intro`, optional `actions`, renders `.page__heading`
  + `.page__heading-actions`.
- `ApplicationErrorPage` — route `errorElement`; renders `404 — Not Found`,
  `Something went wrong`, or the thrown message with "Return home" and
  "Try again".

## Page/feature patterns

- **Header/footer**: sticky glass `.site-header`, gradient brand mark, mobile
  `.site-nav-toggle` hamburger (≤52rem), ink gradient `.site-footer` with no
  links.
- **Home**: `.home-hero` glass panel, `.home-features` (3 glass cards),
  `.home-cta` panel.
- **Auth**: `.auth-page` + `.auth-card` (strong glass with top gradient bar) +
  `.auth-form`.
- **Dashboard/seller**: `.dashboard-links__item`, `.stat-card`,
  `.seller-summary-card`, `.seller-form`, `.status-banner`, `.seller-logo`.
- **Marketplace**: `.listing-grid`, `.listing-card`, `.listing-detail`,
  `.gallery` (main glass frame + thumbs), `.image-manager`/`.image-picker`.
- **State surfaces**: `.empty-state`, `.not-found` (404 glass panel),
  `.error-page` (route-error glass panel).
- **Buttons**: `.btn` base with variants `.btn--primary` (ink gradient),
  `.btn--secondary` (white translucent glass), `.btn--ghost`, sizes `.btn--sm`
  and `.btn--lg`, block `.btn--block`.

## Admin analytics charts (Phase 15)

Charts use `@tanstack/charts` + `@tanstack/react-charts` through the wrappers in
`src/components/analytics/`:

- `chart-theme.tsx` — `ADMIN_CHART_COLORS` (ink-first categorical palette for a
  print-safe light theme), `chartColorFor(index)`, and the HTML
  `AdminChartLegend` (survives `@media print`).
- `AdminLineChart` / `AdminHBarChart` / `AdminBarChart` — thin wrappers over
  `defineChart` (bar/line marks, `scalePoint`/`scaleBand`/`scaleLinear`,
  tooltip). Each exposes `ariaLabel` + `ariaDescription`; zero-valued series
  render nothing instead of an empty SVG.
- Dashboards: `.admin-dashboard-charts` grid and `.analytics-chart-card` glass
  panels hold charts; legends live outside the SVG so print output remains HTML.

## Seller analytics visualization standard (Post-Phase-15)

The seller dashboard (`/seller`) and seller analytics (`/seller/analytics`) use
the exact same chart stack as the admin UI (`@tanstack/charts` +
`@tanstack/react-charts` through `src/components/analytics/`). No second chart
library may be added to the app.

- **Trusted server-side source only**: every seller chart reads Phase 14
  auth-derived RPCs (`my_seller_analytics_overview`,
  `my_seller_analytics_timeseries`, `my_seller_analytics_listings`) and Phase 10
  review RPCs (`get_my_seller_rating_summary`,
  `get_my_seller_rating_distribution`). The seller is always resolved from
  `auth.uid()` → `auth_seller_id()`; no chart accepts or trusts a browser
  `seller_id`, and no revenue/net/refund math is recomputed on the client.
- **Shared seller primitives** (`src/components/seller/SellerAnalyticsViews.tsx`):
  `SellerKpiGrid` (grouped KPI cards from `buildSellerKpiSections()` — the same
  definition drives the CSV export and the printed report), `SellerReviewSummary`
  (loading / empty / error / data states that are mutually exclusive),
  `SellerActionItems` (data-backed dashboard action list), and the
  `sellerFulfillmentRows` / `sellerInterestRows` horizontal-bar sources.
- **Review semantics**: count/average/distribution all describe **approved**
  reviews for the authenticated seller. "No reviews yet" renders only when the
  trusted approved-review count is 0; loading and error states never short-circuit
  into the empty state.
- **KPI presentation**: `.seller-kpi-card` glass cards (4-up desktop, 2-up
  tablet, 1-up or compact 2-up mobile), tabular numbers, uppercase micro-labels,
  and a `—` delta (never `Infinity%`) when the previous period is missing/0.
- **Charts**: line charts for trends, horizontal bars for rankings and the
  5→1 rating distribution, all with a heading + `ariaDescription` + visible
  values; color is never the only signal. Listing labels use titles with
  truncated overflow (never UUIDs).
- **Action items**: `.seller-actions` grid; attention items are primary-ink,
  healthy state is success-green, and each item links to its seller screen.
- **Print**: the seller report reuses `ReportHeader` / `PrintReportTable` /
  `PrintReportButton` and must contain only the authenticated seller's data.

## Print system (Phase 15)

Admins print reports via the shared components in `src/components/reports/`:

- `ReportHeader` — platform lockup (`/logo.png` + "PALITPADDLEBAI MART"), title,
  period, generated-at timestamp, "Generated by Marketplace administrator"
  attribution, and applied filters.
- `PrintReportButton` — labeled (never icon-only) button that runs an async
  `onPrepare` fetching the bounded print dataset before `window.print()`;
  exposes "Preparing report…" + `aria-busy` while working.
- `PrintReportTable` — `<caption>` heading, `thead { display: table-header-group }`,
  per-column numeric alignment, `.print-table__footer` "N rows" row.
- `.no-print` hides app chrome (nav/sidebar/header/toolbars/buttons) for screen
  readers/users; `.print-only` blocks are hidden on screen and shown only under
  `@media print`.
- `@media print`: `@page { size: A4 portrait; margin: 12mm }`, print-only blocks
  unhide, `.print-report__trigger` and app chrome hide, tables keep headers on
  every page and `break-inside: avoid` on rows/tables.
- Print datasets are bounded (`PRINT_MAX_ROWS = 200`, `PRINT_MAX_PAGES = 20`,
  `PRINT_DEFAULT_PAGE_SIZE = 25`) in `src/features/admin/reports/report-utils.ts`.

## Responsive

- **≤52rem**: nav collapses to hamburger, `--header-height` shrinks, listing
  detail and admin rows stack, hero title scales down.
- **≤40rem**: `form-grid` single column, `.page__heading` stacks actions below
  title, auth-card padding reduces, avatar/header column.
- **375–1440px acceptance**: Phase 15 Playwright asserts no horizontal page
  overflow, no `console.error`/`pageerror`, and no raw SQL in the body across
  home, marketplace, login, and the 404 page at 375/390/430/768/1024/1440.

## Accessibility & reduced-motion

- `:focus-visible` uses a 3px ink ring; the glass surfaces have `@supports`
  fallbacks and `prefers-reduced-transparency` overrides.
- Buttons/links that toggle state (mobile nav) expose `aria-expanded` +
  `aria-controls`; icon-only controls include `visually-hidden` labels.
- The mobile nav and desktop nav share the same link labels so tests query roles
  (e.g. `getByRole('link', { name: /Sign in/i })`) with single matches.
- Print actions are labeled buttons with busy state; charts carry accessible
  names and descriptions; print CSS never removes content that is announced to
  assistive technology.
