import { Link } from 'react-router-dom'
import type { SellerAnalyticsOverviewRow } from '../../features/admin/analytics/admin-analytics.types'
import type { AnalyticsFormat } from '../../utils/analytics-format'
import { fmtCount, formatMetric } from '../../utils/analytics-format'
import { formatRating } from '../../utils/format'
import { AdminChartLegend, chartColorFor } from '../analytics/chart-theme'
import { AdminHBarChart } from '../analytics/AdminHBarChart'

export interface SellerKpiCardConfig {
  label: string
  valueKey: keyof SellerAnalyticsOverviewRow
  format: AnalyticsFormat
  windowed?: boolean
  allTimeNote?: string
}

export interface SellerKpiSectionConfig {
  title: string
  cards: SellerKpiCardConfig[]
}

/**
 * Shared KPI definition used by the seller dashboard, the seller analytics
 * page, the CSV export, and the printed seller report. Every card maps to a
 * column of `my_seller_analytics_overview`, which is scoped in the database to
 * the authenticated seller (`auth.uid()` → `auth_seller_id()`); the frontend
 * never supplies a seller id.
 *
 * `windowed: true` cards follow the selected date range and show a
 * previous-period delta. Cards without a window (review aggregates, listing
 * counts, dispute counts) are all-time totals exactly as the RPC computes
 * them, so they are never displayed with deltas.
 */
export function buildSellerKpiSections(): SellerKpiSectionConfig[] {
  return [
    {
      title: 'Revenue',
      cards: [
        { label: 'Gross sales', valueKey: 'gross_sales', format: 'money', windowed: true },
        { label: 'Net sales', valueKey: 'net_sales', format: 'money', windowed: true },
        { label: 'Refunds', valueKey: 'refund_value', format: 'money', windowed: true },
        { label: 'Avg order value', valueKey: 'avg_order_value', format: 'money', windowed: true },
      ],
    },
    {
      title: 'Orders & products',
      cards: [
        { label: 'Transacted orders', valueKey: 'transacted_orders', format: 'count', windowed: true },
        { label: 'Completed orders', valueKey: 'completed_orders', format: 'count', windowed: true },
        { label: 'Cancelled orders', valueKey: 'cancelled_orders', format: 'count', windowed: true },
        { label: 'Units sold', valueKey: 'products_sold', format: 'count', windowed: true },
      ],
    },
    {
      title: 'Store',
      cards: [
        { label: 'Active listings', valueKey: 'active_listings', format: 'count', allTimeNote: 'All time' },
        { label: 'New listings', valueKey: 'new_listings', format: 'count', windowed: true },
        { label: 'Total listings', valueKey: 'total_listings', format: 'count', allTimeNote: 'All time' },
        { label: 'Sold listings', valueKey: 'sold_listings', format: 'count', allTimeNote: 'All time' },
      ],
    },
    {
      title: 'Engagement',
      cards: [
        { label: 'Listing views', valueKey: 'listing_views', format: 'count', windowed: true },
        { label: 'Unique viewers', valueKey: 'unique_viewers', format: 'count', windowed: true },
        { label: 'Favorites', valueKey: 'favorites_count', format: 'count', windowed: true },
        { label: 'Inquiries', valueKey: 'inquiries_count', format: 'count', windowed: true },
      ],
    },
    {
      title: 'Reviews',
      cards: [
        { label: 'Approved reviews', valueKey: 'approved_reviews', format: 'count', allTimeNote: 'All time' },
        { label: 'Average rating', valueKey: 'avg_rating', format: 'rating', allTimeNote: 'All time' },
      ],
    },
    {
      title: 'Disputes',
      cards: [
        { label: 'Open disputes', valueKey: 'open_disputes', format: 'count', allTimeNote: 'All time' },
        { label: 'Resolved disputes', valueKey: 'resolved_disputes', format: 'count', allTimeNote: 'All time' },
      ],
    },
  ]
}

interface DeltaProps {
  current: number
  previous: number | null
}

export function SellerDelta({ current, previous }: DeltaProps) {
  if (previous == null || previous === 0) return <span className="analytics-delta" aria-hidden="true">—</span>
  const diff = current - previous
  const pct = (diff / Math.abs(previous)) * 100
  const improving = diff > 0
  const label = `${improving ? 'up' : 'down'} ${Math.abs(pct).toFixed(0)}%`
  return (
    <span
      className={`analytics-delta analytics-delta--${improving ? 'up' : 'down'}`}
      title={`${fmtCount(previous)} in previous period`}
    >
      {improving ? '▲' : '▼'} {label}
    </span>
  )
}

interface SellerKpiGridProps {
  sections: readonly SellerKpiSectionConfig[]
  overview: SellerAnalyticsOverviewRow
  previous: SellerAnalyticsOverviewRow | null
  compare: boolean
}

function sellerKpiValue(row: SellerAnalyticsOverviewRow, key: keyof SellerAnalyticsOverviewRow): number {
  return Number(row[key] ?? 0)
}

export function SellerKpiGrid({ sections, overview, previous, compare }: SellerKpiGridProps) {
  return (
    <>
      {sections.map((section) => (
        <section className="analytics-section" key={section.title}>
          <div className="analytics-section__heading">
            <h2 className="analytics-section__title">{section.title}</h2>
            {compare && previous != null ? (
              <span className="analytics-section__note">vs previous period</span>
            ) : null}
          </div>
          <div className="admin-dashboard-stats seller-kpi-grid">
            {section.cards.map((card) => {
              const value = sellerKpiValue(overview, card.valueKey)
              const prev = card.windowed && compare && previous != null ? sellerKpiValue(previous, card.valueKey) : null
              const label = card.allTimeNote != null ? `${card.label} · ${card.allTimeNote}` : card.label
              return (
                <div className="seller-kpi-card" key={card.label}>
                  <strong className="seller-kpi-card__value">{formatMetric(card.format, value)}</strong>
                  <span className="seller-kpi-card__label">{label}</span>
                  {card.windowed ? <SellerDelta current={value} previous={prev} /> : null}
                  <span className="visually-hidden">
                    {label}: {formatMetric(card.format, value)}
                  </span>
                </div>
              )
            })}
          </div>
        </section>
      ))}
    </>
  )
}

export interface SellerReviewSummaryProps {
  count: number
  average: number | null
  distribution: Record<number, number>
  status: 'loading' | 'error' | 'empty' | 'data'
  onRetry?: () => void
}

/**
 * Single trusted review summary. `count` and `average` come from the same
 * qualification used everywhere on the seller side: approved reviews for the
 * authenticated seller (the database derives the seller via `auth_seller_id()`
 * — never from the browser). Loading, empty, error, and data states are
 * distinct, so the empty copy never flashes while loading and a missing
 * aggregate never reads as "no reviews".
 */
export function SellerReviewSummary({
  count,
  average,
  distribution,
  status,
  onRetry,
}: SellerReviewSummaryProps) {
  if (status === 'loading') {
    return (
      <div className="seller-review-summary" aria-busy="true">
        <p className="seller-review-summary__loading">Loading review summary…</p>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="seller-review-summary seller-review-summary--error">
        <p className="seller-review-summary__error">Unable to load review information.</p>
        {onRetry != null ? (
          <button type="button" className="btn btn--secondary btn--sm" onClick={onRetry}>
            Retry
          </button>
        ) : null}
      </div>
    )
  }

  if (status === 'empty' || count === 0) {
    return (
      <div className="seller-review-summary seller-review-summary--empty">
        <p className="seller-review-summary__empty">No reviews yet.</p>
        <p className="seller-review-summary__hint">
          Reviews from completed customer purchases will appear here.
        </p>
      </div>
    )
  }

  const distributionRows = [5, 4, 3, 2, 1].map((stars) => ({
    label: `${stars}★`,
    value: distribution[stars] ?? 0,
  }))

  return (
    <div className="seller-review-summary">
      <div className="seller-review-summary__rating">
        <strong className="seller-review-summary__average">{formatRating(average)}</strong>
        <span className="seller-review-summary__count">
          {count} verified review{count === 1 ? '' : 's'} · all time
        </span>
      </div>
      <div className="seller-review-summary__chart">
        <h4 className="seller-review-summary__chart-title">Rating distribution</h4>
        <AdminChartLegend
          items={[{ label: 'Reviews per star', color: chartColorFor(0) }]}
          className="visually-hidden"
        />
        <AdminHBarChart
          rows={distributionRows}
          formatValue={fmtCount}
          height={180}
          ariaLabel={`Rating distribution: ${count} reviews`}
          ariaDescription="Number of reviews per star level from 5 to 1."
        />
      </div>
      <div className="seller-review-summary__actions">
        <Link className="btn btn--ghost btn--sm" to="/seller/reviews">
          View all reviews
        </Link>
      </div>
    </div>
  )
}

/** Fulfillment/order-status snapshot derived from the seller analytics overview. */
export function sellerFulfillmentRows(overview: SellerAnalyticsOverviewRow) {
  return [
    { label: 'Transacted orders', value: fmtCount(overview.transacted_orders), amount: overview.transacted_orders },
    { label: 'Completed orders', value: fmtCount(overview.completed_orders), amount: overview.completed_orders },
    { label: 'Cancelled orders', value: fmtCount(overview.cancelled_orders), amount: overview.cancelled_orders },
    { label: 'Disputed orders', value: fmtCount(overview.disputed_orders), amount: overview.disputed_orders },
  ]
}

export function sellerInterestRows(overview: SellerAnalyticsOverviewRow) {
  return [
    { label: 'Listing views', value: fmtCount(overview.listing_views), amount: overview.listing_views },
    { label: 'Unique viewers', value: fmtCount(overview.unique_viewers), amount: overview.unique_viewers },
    { label: 'Favorites', value: fmtCount(overview.favorites_count), amount: overview.favorites_count },
    { label: 'Inquiries', value: fmtCount(overview.inquiries_count), amount: overview.inquiries_count },
  ]
}

export interface SellerActionItem {
  label: string
  detail: string
  to?: string
  tone: 'action' | 'good'
}

/**
 * Data-backed dashboard action items for the authenticated seller. Derived only
 * from `my_seller_analytics_overview`, so the seller identity is still resolved
 * server-side via `auth.uid()` → `auth_seller_id()` and no financial formula is
 * invented here. Items that need attention render as actions; a healthy store
 * renders a positive summary. Never fabricates from raw transactional rows.
 */
export function buildSellerActionItems(overview: SellerAnalyticsOverviewRow): SellerActionItem[] {
  const items: SellerActionItem[] = []
  if (overview.draft_listings > 0) {
    items.push({
      label: `${fmtCount(overview.draft_listings)} draft listing${overview.draft_listings === 1 ? '' : 's'}`,
      detail: 'Draft listings are not visible to shoppers.',
      to: '/seller/listings?status=draft',
      tone: 'action',
    })
  }
  if (overview.open_disputes > 0) {
    items.push({
      label: `${fmtCount(overview.open_disputes)} open dispute${overview.open_disputes === 1 ? '' : 's'}`,
      detail: 'Attend to unresolved disputes to protect your rating.',
      to: '/seller/disputes',
      tone: 'action',
    })
  }
  if (overview.inquiries_count > 0) {
    items.push({
      label: `${fmtCount(overview.inquiries_count)} new inquir${overview.inquiries_count === 1 ? 'y' : 'ies'}`,
      detail: 'Buyers asked about your products in this period.',
      to: '/inquiries',
      tone: 'action',
    })
  }
  if (overview.active_listings === 0) {
    items.push({
      label: 'No active listings',
      detail: 'Add a listing so shoppers can find your store.',
      to: '/seller/listings/new',
      tone: 'action',
    })
  }
  if (items.length === 0) {
    items.push({
      label: 'Store is in good shape',
      detail: `${fmtCount(overview.active_listings)} active listing${overview.active_listings === 1 ? '' : 's'} · ${fmtCount(overview.completed_orders)} completed order${overview.completed_orders === 1 ? '' : 's'} this period.`,
      tone: 'good',
    })
  }
  return items
}

export function SellerActionItems({ overview }: { overview: SellerAnalyticsOverviewRow }) {
  const items = buildSellerActionItems(overview)
  return (
    <div className="seller-actions" aria-label="Action items">
      {items.map((item) => {
        const content = (
          <>
            <strong className="seller-actions__label">{item.label}</strong>
            <span className="seller-actions__detail">{item.detail}</span>
          </>
        )
        const className = `seller-actions__item seller-actions__item--${item.tone}`
        return item.to != null ? (
          <Link className={className} to={item.to} key={item.label}>
            {content}
          </Link>
        ) : (
          <div className={className} key={item.label}>
            {content}
          </div>
        )
      })}
    </div>
  )
}