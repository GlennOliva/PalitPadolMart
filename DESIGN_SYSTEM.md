# PalitPaddleBai Mart — Design System

Source of truth for the UI layer. The tokens and component classes below live in
`src/index.css`. Reusable markup is provided by the shared components in
`src/components/common/`.

## Principles

- **Selective glassmorphism** — glass surfaces are used for emphasis: the sticky
  header, the home hero, auth cards, stat/summary cards, section panels, listing
  cards, and empty/error states. Content surfaces (forms, tables, detail rows)
  stay near-solid so text stays readable.
- **Pickleball identity** — teal court + lime ball + navy court-line palette,
  rounded "paddle" radii, soft gradient ambient background.
- **Readable first** — text contrast always wins over transparency. Never layer
  glass directly over high-contrast imagery without a solid/strong surface.
- **No dark mode** — light theme only. The navy footer is a deliberate accent,
  not a dark theme.
- **Progressive** — every glass rule has a `@supports` fallback and respects
  `prefers-reduced-transparency` (blur removed) and `prefers-reduced-motion`
  (transitions/scroll disabled).

## Tokens (`:root` in `src/index.css`)

### Brand palette
| Token | Value | Use |
|---|---|---|
| `--color-primary` | `#0f766e` | teal — links, primary buttons, focus |
| `--color-primary-strong` | `#115e59` | teal hover/pressed |
| `--color-primary-soft` | `#ccfbf1` | teal tint backgrounds |
| `--color-accent` | `#a3e635` | lime — hero glow, highlights |
| `--color-accent-strong` | `#65a30d` | lime foreground on light bg |
| `--color-accent-soft` | `#f7fee7` | lime tint backgrounds |
| `--color-navy` | `#0f172a` | court navy — footer, dark text |
| `--color-navy-soft` | `#1e293b` | navy panels/text on light |

### Neutrals, status, typography, spacing
- Neutrals: `--color-bg #f4f7fb`, `--color-surface #ffffff`, `--color-surface-2
  #f1f5f9`, text `--color-text #0f172a`, `--color-text-muted #475569`,
  `--color-text-faint #64748b`, borders `#e2e8f0` / strong `#cbd5e1`.
- Status tokens: `--color-success`, `--color-warning`, `--color-danger`,
  `--color-info`, each with a `-bg` and `-border` pair.
- Type scale: `--text-xs` `0.75rem` → `--text-5xl` `3rem`.
- Spacing: `--space-1` `0.25rem` → `--space-20` `5rem` (multiples of 4/8).
- Radius: `--radius-sm` `0.375rem` → `--radius-2xl` `1.25rem`, `--radius-pill`
  `999px`.
- Shadows: `--shadow-sm/md/lg` and `--shadow-focus` (3px teal ring).

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
  `.site-nav-toggle` hamburger (≤52rem), navy gradient `.site-footer` with no
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
- **Buttons**: `.btn` base with variants `.btn--primary` (teal gradient),
  `.btn--secondary` (white translucent glass), `.btn--ghost`, sizes `.btn--sm`
  and `.btn--lg`, block `.btn--block`.

## Responsive

- **≤52rem**: nav collapses to hamburger, `--header-height` shrinks, listing
  detail and admin rows stack, hero title scales down.
- **≤40rem**: `form-grid` single column, `.page__heading` stacks actions below
  title, auth-card padding reduces, avatar/header column.

## Accessibility & reduced-motion

- `:focus-visible` uses a 3px teal ring; the glass surfaces have `@supports`
  fallbacks and `prefers-reduced-transparency` overrides.
- Buttons/links that toggle state (mobile nav) expose `aria-expanded` +
  `aria-controls`; icon-only controls include `visually-hidden` labels.
- The mobile nav and desktop nav share the same link labels so tests query roles
  (e.g. `getByRole('link', { name: /Sign in/i })`) with single matches.
