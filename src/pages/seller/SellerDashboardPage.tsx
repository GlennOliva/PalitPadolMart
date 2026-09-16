import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useSeller } from '../../features/seller/useSeller'
import { formatSellerStatus } from '../../features/seller/seller-utils'
import {
  addDaysISO,
  parseAnalyticsBucket,
} from '../../features/admin/analytics/admin-analytics-params'
import type {
  SellerAnalyticsOverviewRow,
  SellerAnalyticsTimeSeriesRow,
} from '../../features/admin/analytics/admin-analytics.types'
import {
  getMySellerAnalyticsOverview,
  getMySellerAnalyticsTimeSeries,
  getMySellerAnalyticsListings,
} from '../../features/seller/analytics/seller-analytics.service'
import {
  SellerKpiGrid,
  SellerReviewSummary,
  SellerActionItems,
  sellerFulfillmentRows,
  sellerInterestRows,
  buildSellerKpiSections,
} from '../../components/seller/SellerAnalyticsViews'
import { getMySellerRatingDistribution } from '../../features/reviews/reviews.service'
import { AdminLineChart, type AdminTrendDatum } from '../../components/analytics/AdminLineChart'
import { AdminHBarChart } from '../../components/analytics/AdminHBarChart'
import { AdminChartLegend, chartColorFor } from '../../components/analytics/chart-theme'
import AnalyticsHBarList from '../../components/analytics/AnalyticsHBarList'
import AnalyticsRangeFilter from '../../components/analytics/AnalyticsRangeFilter'
import LoadingState from '../../components/common/LoadingState'
import Alert from '../../components/common/Alert'
import { formatReportPeriod } from '../../features/admin/reports/report-utils'
import { bucketLabel, fmtCount, fmtMoney } from '../../utils/analytics-format'

function today(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function bucketForSpan(start: string, end: string): string {
  const days = (new Date(end).getTime() - new Date(start).getTime()) / 86_400_000 + 1
  if (days <= 31) return 'day'
  if (days <= 180) return 'week'
  return 'month'
}

const salesSeries = [
  { key: 'gross_sales', label: 'Gross sales', accessor: (r: AdminTrendDatum) => Number(r.gross_sales ?? 0) },
  { key: 'net_sales', label: 'Net sales', accessor: (r: AdminTrendDatum) => Number(r.net_sales ?? 0) },
] as const

const orderSeries = [
  { key: 'transacted_orders', label: 'Transacted', accessor: (r: AdminTrendDatum) => Number(r.transacted_orders ?? 0) },
  { key: 'completed_orders', label: 'Completed', accessor: (r: AdminTrendDatum) => Number(r.completed_orders ?? 0) },
] as const

export default function SellerDashboardPage() {
  const { sellerProfile } = useSeller()
  const [searchParams, setSearchParams] = useSearchParams()
  const selectedEnd = searchParams.get('end') ?? today()
  const selectedStart = searchParams.get('start') ?? addDaysISO(selectedEnd, -29)
  const bucket = searchParams.has('bucket') ? parseAnalyticsBucket(searchParams) : bucketForSpan(selectedStart, selectedEnd)
  const compare = searchParams.get('compare') === '1'

  const [overview, setOverview] = useState<SellerAnalyticsOverviewRow | null>(null)
  const [previous, setPrevious] = useState<SellerAnalyticsOverviewRow | null>(null)
  const [series, setSeries] = useState<SellerAnalyticsTimeSeriesRow[]>([])
  const [listings, setListings] = useState<Awaited<ReturnType<typeof getMySellerAnalyticsListings>>['data']>(null)
  const [distribution, setDistribution] = useState<Record<number, number>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [loadKey, setLoadKey] = useState(0)

  const previousEnd = useMemo(() => addDaysISO(selectedStart, -1), [selectedStart])
  const previousStart = useMemo(() => {
    const span = (new Date(selectedEnd).getTime() - new Date(selectedStart).getTime()) / 86_400_000
    return addDaysISO(previousEnd, -Math.round(span))
  }, [selectedEnd, selectedStart, previousEnd])

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    void (async () => {
      const [overviewResult, prevResult, seriesResult, listingResult, distResult] = await Promise.all([
        getMySellerAnalyticsOverview(selectedStart, selectedEnd),
        compare ? getMySellerAnalyticsOverview(previousStart, previousEnd) : Promise.resolve({ data: null, error: null }),
        getMySellerAnalyticsTimeSeries(selectedStart, selectedEnd, bucket),
        getMySellerAnalyticsListings({ start: selectedStart, end: selectedEnd, sort: 'units_sold_desc', page: 1, pageSize: 5 }),
        getMySellerRatingDistribution(),
      ])
      const firstError = [overviewResult, prevResult, seriesResult, listingResult, distResult]
        .map((r) => r.error)
        .find((e) => e != null)
      if (firstError != null) {
        setError('We could not load your dashboard. Please try again.')
        setLoading(false)
        return
      }
      setOverview(overviewResult.data)
      setPrevious(prevResult.data)
      setSeries(seriesResult.data ?? [])
      setListings(listingResult.data)
      setDistribution(distResult.data ?? {})
      setLoading(false)
    })()
  }, [selectedStart, selectedEnd, bucket, compare, previousStart, previousEnd])

  useEffect(() => {
    void load()
  }, [load, loadKey])

  function updateQuery(patch: { start?: string; end?: string; bucket?: string; compare?: boolean }) {
    const next = new URLSearchParams(searchParams.toString())
    if (patch.start != null) next.set('start', patch.start)
    if (patch.end != null) next.set('end', patch.end)
    if (patch.bucket != null) next.set('bucket', patch.bucket)
    if (patch.compare != null) next.set('compare', patch.compare ? '1' : '0')
    if (!next.has('start')) next.set('start', selectedStart)
    if (!next.has('end')) next.set('end', selectedEnd)
    setSearchParams(next)
  }

  const retry = () => setLoadKey((key) => key + 1)

  if (sellerProfile == null) {
    return <LoadingState label="Loading your seller account…" />
  }

  const location = [sellerProfile.city, sellerProfile.province]
    .filter(Boolean)
    .join(', ')
  const availability = [
    sellerProfile.pickup_available ? 'Pickup' : null,
    sellerProfile.delivery_available ? 'Delivery' : null,
  ]
    .filter(Boolean)
    .join(', ')

  const reviewStatus: 'loading' | 'error' | 'empty' | 'data' =
    loading ? 'loading' : error != null ? 'error' : (overview?.approved_reviews ?? 0) > 0 ? 'data' : 'empty'

  const topProducts = (listings?.items ?? []).slice(0, 5)

  return (
    <div className="container page seller-dashboard-page">
      <h1 className="page__title">Seller Dashboard</h1>
      <p className="page__intro">
        Welcome to your store, {sellerProfile.store_name}.
      </p>

      <section className="seller-dashboard">
        <div className="seller-summary-card" aria-label="Your store">
          <div className="seller-summary-card__row">
            <span className="seller-summary-card__label">Store</span>
            <strong className="seller-summary-card__name">
              {sellerProfile.store_name}
            </strong>
            <span className="seller-summary-card__status">
              {formatSellerStatus(sellerProfile.seller_status)}
            </span>
          </div>
          <dl className="seller-summary-card__list">
            <div className="seller-summary-card__row">
              <dt>Location</dt>
              <dd>{location || 'Not provided'}</dd>
            </div>
            <div className="seller-summary-card__row">
              <dt>Availability</dt>
              <dd>{availability || 'Not specified'}</dd>
            </div>
          </dl>
          <nav className="seller-summary-card__actions" aria-label="Seller actions">
            <Link className="btn btn--primary btn--sm" to="/seller/listings/new">
              Add listing
            </Link>
            <Link className="btn btn--secondary btn--sm" to="/seller/listings">
              Manage listings
            </Link>
            <Link className="btn btn--ghost btn--sm" to="/seller/profile">
              Edit seller profile
            </Link>
            <Link className="btn btn--ghost btn--sm" to="/seller/payment-methods">
              Payment methods
            </Link>
            <Link className="btn btn--ghost btn--sm" to="/seller/orders">
              Incoming orders
            </Link>
            <Link className="btn btn--ghost btn--sm" to="/seller/reviews">
              Customer reviews
            </Link>
            <Link className="btn btn--ghost btn--sm" to="/seller/analytics">
              Analytics
            </Link>
            <Link className="btn btn--ghost btn--sm" to="/seller/disputes">
              Disputes
            </Link>
            <Link className="btn btn--ghost btn--sm" to="/inquiries">
              Buyer inquiries
            </Link>
            <Link
              className="btn btn--ghost btn--sm"
              to={`/sellers/${sellerProfile.id}`}
            >
              View public profile
            </Link>
          </nav>
        </div>

        <div className="admin-resource-toolbar seller-toolbar">
          <AnalyticsRangeFilter
            start={selectedStart}
            end={selectedEnd}
            bucket={bucket}
            onRangeChange={(start, end) => updateQuery({ start, end })}
            onBucketChange={(bucket) => updateQuery({ bucket })}
            label="Dashboard period"
          />
          <label className="analytics-compare">
            <input
              type="checkbox"
              checked={compare}
              onChange={(e) => updateQuery({ compare: e.target.checked })}
            />
            <span>Compare with previous period</span>
          </label>
        </div>

        {loading ? (
          <div className="analytics-skeleton" aria-label="Loading dashboard summary" aria-busy="true">
            <LoadingState label="Loading your store summary…" />
          </div>
        ) : error != null ? (
          <div className="analytics-error-panel">
            <Alert variant="error" message={error} />
            <button type="button" className="btn btn--secondary btn--sm" onClick={retry}>
              Retry
            </button>
          </div>
        ) : overview != null ? (
          <>
            <section className="analytics-section">
              <div className="analytics-section__heading">
                <h2 className="analytics-section__title">Action items</h2>
                <span className="analytics-section__note">
                  From your trusted store overview
                </span>
              </div>
              <SellerActionItems overview={overview} />
            </section>

            <SellerKpiGrid
              sections={buildSellerKpiSections()}
              overview={overview}
              previous={previous}
              compare={compare}
            />

            <section className="analytics-section">
              <div className="analytics-section__heading">
                <h2 className="analytics-section__title">Performance</h2>
                <span className="analytics-section__note">
                  {formatReportPeriod(selectedStart, selectedEnd)}
                </span>
              </div>
              <div className="admin-dashboard-charts">
                <div className="analytics-chart-card">
                  <h3>Sales trend</h3>
                  <AdminChartLegend items={salesSeries.map((s) => ({ label: s.label, color: chartColorFor(salesSeries.indexOf(s)) }))} />
                  <AdminLineChart
                    rows={series as AdminTrendDatum[]}
                    xKey="bucket_start"
                    xFormat={(value) => bucketLabel(value, bucket)}
                    series={salesSeries}
                    formatValue={fmtMoney}
                    ariaLabel={`Gross and net sales by ${bucket} from ${selectedStart} to ${selectedEnd}`}
                    ariaDescription="Gross and net sales across the selected period."
                  />
                </div>
                <div className="analytics-chart-card">
                  <h3>Order trend</h3>
                  <AdminChartLegend items={orderSeries.map((s) => ({ label: s.label, color: chartColorFor(orderSeries.indexOf(s)) }))} />
                  <AdminLineChart
                    rows={series as AdminTrendDatum[]}
                    xKey="bucket_start"
                    xFormat={(value) => bucketLabel(value, bucket)}
                    series={orderSeries}
                    formatValue={fmtCount}
                    ariaLabel={`Transacted and completed orders by ${bucket} from ${selectedStart} to ${selectedEnd}`}
                    ariaDescription="Order volumes across the selected period."
                  />
                </div>
                <div className="analytics-chart-card">
                  <h3>Top products</h3>
                  <AdminChartLegend items={[{ label: 'Gross sales', color: chartColorFor(0) }]} className="visually-hidden" />
                  <AdminHBarChart
                    rows={topProducts.map((row) => ({
                      label: row.listing_title,
                      value: row.gross_sales,
                    }))}
                    formatValue={fmtMoney}
                    height={220}
                    ariaLabel={`Top products by gross sales from ${selectedStart} to ${selectedEnd}`}
                    ariaDescription="Products with the highest gross sales in the selected period."
                  />
                </div>
                <div className="analytics-chart-card">
                  <h3>Order status</h3>
                  <AnalyticsHBarList
                    data={sellerFulfillmentRows(overview)}
                    ariaLabel={`Order status: transacted, completed, cancelled, and disputed for ${formatReportPeriod(selectedStart, selectedEnd)}`}
                  />
                </div>
                <div className="analytics-chart-card">
                  <h3>Customer interest</h3>
                  <AnalyticsHBarList
                    data={sellerInterestRows(overview)}
                    ariaLabel={`Customer interest: views, unique viewers, favorites, and inquiries for ${formatReportPeriod(selectedStart, selectedEnd)}`}
                  />
                </div>
                <div className="analytics-chart-card">
                  <h3>Customer feedback</h3>
                  <SellerReviewSummary
                    count={overview.approved_reviews}
                    average={overview.avg_rating}
                    distribution={distribution}
                    status={reviewStatus}
                    onRetry={retry}
                  />
                </div>
              </div>
              {series.length === 0 ? (
                <p className="analytics-chart__empty">No activity in this period.</p>
              ) : null}
            </section>
          </>
        ) : null}
      </section>

      <nav className="page-actions" aria-label="Related actions">
        <Link className="btn" to="/dashboard">
          Back to dashboard
        </Link>
      </nav>
    </div>
  )
}