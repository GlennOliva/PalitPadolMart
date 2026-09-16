import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import AdminStatCard from '../../components/admin/AdminStatCard'
import AnalyticsRangeFilter from '../../components/analytics/AnalyticsRangeFilter'
import { AdminChartLegend, chartColorFor } from '../../components/analytics/chart-theme'
import {
  AdminLineChart,
  type AdminLineSeries,
  type AdminTrendDatum,
} from '../../components/analytics/AdminLineChart'
import { AdminHBarChart, type AdminHBarRow } from '../../components/analytics/AdminHBarChart'
import Alert from '../../components/common/Alert'
import LoadingState from '../../components/common/LoadingState'
import PageHeader from '../../components/common/PageHeader'
import { PrintReportButton } from '../../components/reports/PrintReportButton'
import { PrintReportTable } from '../../components/reports/PrintReportTable'
import { ReportHeader } from '../../components/reports/ReportHeader'
import {
  getAdminSummary,
} from '../../features/admin/admin-dashboard.service'
import {
  addDaysISO,
  parseAnalyticsBucket,
} from '../../features/admin/analytics/admin-analytics-params'
import {
  getAdminAnalyticsOverview,
  getAdminAnalyticsTimeSeries,
  getAdminCategoryRanking,
  getAdminTopListings,
  getAdminTopSellers,
} from '../../features/admin/analytics/admin-analytics.service'
import type {
  AdminAnalyticsOverviewRow,
  AdminAnalyticsTimeSeriesRow,
  AdminCategoryRankRow,
  AdminTopListingRow,
  AdminTopSellerRow,
} from '../../features/admin/analytics/admin-analytics.types'
import {
  getAdminDistributionSnapshots,
  type AdminDistributionSnapshots,
  type DistributionSlice,
} from '../../features/admin/analytics/admin-distributions.service'
import {
  DEFAULT_ADMIN_DISPUTES_SEARCH,
  DEFAULT_ADMIN_LISTINGS_SEARCH,
  DEFAULT_ADMIN_ORDERS_SEARCH,
  DEFAULT_ADMIN_REPORTS_SEARCH,
  DEFAULT_ADMIN_REVIEWS_SEARCH,
  DEFAULT_ADMIN_SELLERS_SEARCH,
  DEFAULT_ADMIN_USERS_SEARCH,
  serializeAdminDisputesSearch,
  serializeAdminListingsSearch,
  serializeAdminOrdersSearch,
  serializeAdminReportsSearch,
  serializeAdminReviewsSearch,
  serializeAdminSellersSearch,
  serializeAdminUsersSearch,
} from '../../features/admin/admin-params'
import type { AdminError, AdminSummaryRow } from '../../features/admin/admin.types'
import type { AdminPage, AdminPageItem } from '../../features/admin/admin.types'
import { formatRating } from '../../utils/format'
import {
  bucketLabel,
  fmtCount,
  fmtMoney,
  formatMetric,
} from '../../utils/analytics-format'
import type { AnalyticsFormat } from '../../utils/analytics-format'
import {
  PRINT_MAX_ROWS,
  formatReportPeriod,
  formatReportTimestamp,
} from '../../features/admin/reports/report-utils'

interface DashboardStat {
  label: string
  value: (row: AdminSummaryRow) => number
  href?: string
  accent?: boolean
}

interface KpiCard {
  label: string
  value: (row: AdminAnalyticsOverviewRow) => number
  format: AnalyticsFormat
  windowed?: boolean
}

function filtersLink(path: string, query: URLSearchParams): string {
  const qs = query.toString()
  return qs === '' ? path : `${path}?${qs}`
}

function buildDashboardStats(): DashboardStat[] {
  return [
    { label: 'Total users', value: (r) => r.total_users, href: '/admin/users' },
    {
      label: 'Active users',
      value: (r) => r.active_users,
      href: filtersLink(
        '/admin/users',
        serializeAdminUsersSearch({ ...DEFAULT_ADMIN_USERS_SEARCH, accountStatus: 'active' }),
      ),
    },
    {
      label: 'Suspended users',
      value: (r) => r.suspended_users,
      href: filtersLink(
        '/admin/users',
        serializeAdminUsersSearch({ ...DEFAULT_ADMIN_USERS_SEARCH, accountStatus: 'suspended' }),
      ),
    },
    {
      label: 'Active sellers',
      value: (r) => r.active_sellers,
      href: filtersLink(
        '/admin/sellers',
        serializeAdminSellersSearch({ ...DEFAULT_ADMIN_SELLERS_SEARCH, status: 'active' }),
      ),
    },
    {
      label: 'Pending sellers',
      value: (r) => r.pending_sellers,
      href: filtersLink(
        '/admin/sellers',
        serializeAdminSellersSearch({ ...DEFAULT_ADMIN_SELLERS_SEARCH, status: 'pending' }),
      ),
      accent: true,
    },
    {
      label: 'Active listings',
      value: (r) => r.active_listings,
      href: filtersLink(
        '/admin/listings',
        serializeAdminListingsSearch({ ...DEFAULT_ADMIN_LISTINGS_SEARCH, status: 'active' }),
      ),
    },
    {
      label: 'Removed listings',
      value: (r) => r.removed_listings,
      href: filtersLink(
        '/admin/listings',
        serializeAdminListingsSearch({ ...DEFAULT_ADMIN_LISTINGS_SEARCH, status: 'removed' }),
      ),
    },
    { label: 'Open orders', value: (r) => r.open_orders, href: '/admin/orders' },
    {
      label: 'Completed orders',
      value: (r) => r.completed_orders,
      href: filtersLink(
        '/admin/orders',
        serializeAdminOrdersSearch({ ...DEFAULT_ADMIN_ORDERS_SEARCH, status: 'completed' }),
      ),
    },
    {
      label: 'Disputed orders',
      value: (r) => r.disputed_orders,
      href: filtersLink(
        '/admin/orders',
        serializeAdminOrdersSearch({ ...DEFAULT_ADMIN_ORDERS_SEARCH, status: 'disputed' }),
      ),
    },
    { label: 'Payments awaiting review', value: (r) => r.payments_awaiting_review, href: '/admin/payments', accent: true },
    {
      label: 'Pending reports',
      value: (r) => r.pending_reports,
      href: filtersLink(
        '/admin/reports',
        serializeAdminReportsSearch({ ...DEFAULT_ADMIN_REPORTS_SEARCH, status: 'pending' }),
      ),
      accent: true,
    },
    {
      label: 'Reports under review',
      value: (r) => r.reports_under_review,
      href: filtersLink(
        '/admin/reports',
        serializeAdminReportsSearch({ ...DEFAULT_ADMIN_REPORTS_SEARCH, status: 'under_review' }),
      ),
    },
    {
      label: 'Approved reviews',
      value: (r) => r.approved_reviews,
      href: filtersLink(
        '/admin/reviews',
        serializeAdminReviewsSearch({ ...DEFAULT_ADMIN_REVIEWS_SEARCH, status: 'approved' }),
      ),
    },
    {
      label: 'Hidden reviews',
      value: (r) => r.hidden_reviews,
      href: filtersLink(
        '/admin/reviews',
        serializeAdminReviewsSearch({ ...DEFAULT_ADMIN_REVIEWS_SEARCH, status: 'hidden' }),
      ),
    },
    {
      label: 'Open disputes',
      value: (r) => r.open_disputes,
      href: filtersLink(
        '/admin/disputes',
        serializeAdminDisputesSearch({ ...DEFAULT_ADMIN_DISPUTES_SEARCH, status: 'open' }),
      ),
      accent: true,
    },
    {
      label: 'Disputes under review',
      value: (r) => r.disputes_under_review,
      href: filtersLink(
        '/admin/disputes',
        serializeAdminDisputesSearch({ ...DEFAULT_ADMIN_DISPUTES_SEARCH, status: 'under_review' }),
      ),
    },
    { label: 'Active refund requests', value: (r) => r.active_refund_requests, href: '/admin/refunds', accent: true },
  ]
}

function buildKpis(): KpiCard[] {
  return [
    { label: 'Gross sales', value: (r) => r.gross_sales, format: 'money', windowed: true },
    { label: 'Net sales', value: (r) => r.net_sales, format: 'money', windowed: true },
    { label: 'Refunds', value: (r) => r.refund_value, format: 'money', windowed: true },
    { label: 'Avg order value', value: (r) => r.avg_order_value, format: 'money', windowed: true },
    { label: 'Conversion rate', value: (r) => r.conversion_rate, format: 'percent', windowed: true },
    { label: 'Transacted orders', value: (r) => r.transacted_orders, format: 'count', windowed: true },
    { label: 'Completed orders', value: (r) => r.completed_orders, format: 'count', windowed: true },
    { label: 'Products sold', value: (r) => r.products_sold, format: 'count', windowed: true },
    { label: 'New users', value: (r) => r.new_users, format: 'count', windowed: true },
    { label: 'New sellers', value: (r) => r.new_sellers, format: 'count', windowed: true },
    { label: 'New listings', value: (r) => r.new_listings, format: 'count', windowed: true },
    { label: 'Active sellers', value: (r) => r.active_sellers, format: 'count' },
    { label: 'Active listings', value: (r) => r.active_listings, format: 'count' },
    { label: 'Listing views', value: (r) => r.listing_views, format: 'count', windowed: true },
    { label: 'Approved reviews', value: (r) => r.approved_reviews, format: 'count', windowed: true },
    { label: 'Average rating', value: (r) => r.avg_rating, format: 'rating', windowed: true },
  ]
}

interface DeltaProps {
  current: number
  previous: number | null
}

function Delta({ current, previous }: DeltaProps) {
  if (previous == null || previous === 0) return <span className="analytics-delta" aria-hidden="true">—</span>
  const diff = current - previous
  const pct = (diff / Math.abs(previous)) * 100
  const improving = diff > 0
  const label = `${improving ? 'up' : 'down'} ${Math.abs(pct).toFixed(0)}%`
  return (
    <span className={`analytics-delta analytics-delta--${improving ? 'up' : 'down'}`} title={`${fmtCount(previous)} in previous period`}>
      {improving ? '▲' : '▼'} {label}
    </span>
  )
}

interface PrintRows {
  sellers: Array<AdminPageItem<AdminTopSellerRow>>
  listings: Array<AdminPageItem<AdminTopListingRow>>
  categories: Array<AdminPageItem<AdminCategoryRankRow>>
}

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

export default function AdminDashboardPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const searchKey = useMemo(() => searchParams.toString(), [searchParams])
  const end = searchParams.get('end') ?? today()
  const start = searchParams.get('start') ?? addDaysISO(end, -29)
  const compare = searchParams.get('compare') === '1'
  const bucket = searchParams.has('bucket') ? parseAnalyticsBucket(searchParams) : bucketForSpan(start, end)

  const [summary, setSummary] = useState<AdminSummaryRow | null>(null)
  const [overview, setOverview] = useState<AdminAnalyticsOverviewRow | null>(null)
  const [previous, setPrevious] = useState<AdminAnalyticsOverviewRow | null>(null)
  const [series, setSeries] = useState<AdminAnalyticsTimeSeriesRow[]>([])
  const [categories, setCategories] = useState<AdminPage<AdminCategoryRankRow> | null>(null)
  const [topSellers, setTopSellers] = useState<AdminPage<AdminTopSellerRow> | null>(null)
  const [distributions, setDistributions] = useState<AdminDistributionSnapshots | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<AdminError | null>(null)
  const [printRows, setPrintRows] = useState<PrintRows | null>(null)
  const [printGeneratedAt, setPrintGeneratedAt] = useState<string | null>(null)
  const distributionsLoaded = useRef(false)

  const previousEnd = useMemo(() => addDaysISO(start, -1), [start])
  const previousStart = useMemo(() => {
    const span = (new Date(end).getTime() - new Date(start).getTime()) / 86_400_000
    return addDaysISO(previousEnd, -Math.round(span))
  }, [end, start, previousEnd])

  useEffect(() => {
    if (distributionsLoaded.current) return
    distributionsLoaded.current = true
    let active = true
    void getAdminDistributionSnapshots().then((snapshots) => {
      if (active) setDistributions(snapshots)
    })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    let active = true
    setLoading(true)
    setError(null)
    void (async () => {
      const [summaryResult, overviewResult, prevResult, seriesResult, catResult, sellerResult] = await Promise.all([
        getAdminSummary(),
        getAdminAnalyticsOverview(start, end),
        compare ? getAdminAnalyticsOverview(previousStart, previousEnd) : Promise.resolve({ data: null, error: null }),
        getAdminAnalyticsTimeSeries(start, end, bucket),
        getAdminCategoryRanking({ start, end, sort: 'gross_sales_desc', page: 1, pageSize: 5 }),
        getAdminTopSellers({ start, end, sort: 'gross_sales_desc', page: 1, pageSize: 5 }),
      ])
      if (!active) return
      const firstError = [summaryResult, overviewResult, prevResult, seriesResult, catResult, sellerResult]
        .map((r) => r.error)
        .find((e) => e != null)
      if (firstError != null) {
        setError(firstError)
        setLoading(false)
        return
      }
      setSummary(summaryResult.data)
      setOverview(overviewResult.data)
      setPrevious(prevResult.data)
      setSeries(seriesResult.data ?? [])
      setCategories(catResult.data)
      setTopSellers(sellerResult.data)
      setLoading(false)
    })()
    return () => {
      active = false
    }
  }, [start, end, bucket, compare, previousStart, previousEnd])

  function updateQuery(patch: { start?: string; end?: string; compare?: boolean }) {
    const next = new URLSearchParams(searchKey)
    if (patch.start != null) next.set('start', patch.start)
    if (patch.end != null) next.set('end', patch.end)
    if (patch.compare != null) next.set('compare', patch.compare ? '1' : '0')
    if (!next.has('start')) next.set('start', start)
    if (!next.has('end')) next.set('end', end)
    setSearchParams(next)
  }

  async function preparePrintReport() {
    setPrintGeneratedAt(formatReportTimestamp())
    if (start === '' || end === '') return
    const pageSize = 50
    const [sellersPage1, sellersPage2, listingsPage1, listingsPage2, categoriesPage1, categoriesPage2] = await Promise.all([
      getAdminTopSellers({ start, end, sort: 'gross_sales_desc', page: 1, pageSize }),
      getAdminTopSellers({ start, end, sort: 'gross_sales_desc', page: 2, pageSize }),
      getAdminTopListings({ start, end, sort: 'gross_sales_desc', page: 1, pageSize }),
      getAdminTopListings({ start, end, sort: 'gross_sales_desc', page: 2, pageSize }),
      getAdminCategoryRanking({ start, end, sort: 'gross_sales_desc', page: 1, pageSize }),
      getAdminCategoryRanking({ start, end, sort: 'gross_sales_desc', page: 2, pageSize }),
    ])
    const sellers = [...(sellersPage1.data?.items ?? []), ...(sellersPage2.data?.items ?? [])].slice(0, PRINT_MAX_ROWS)
    const listings = [...(listingsPage1.data?.items ?? []), ...(listingsPage2.data?.items ?? [])].slice(0, PRINT_MAX_ROWS)
    const categories = [...(categoriesPage1.data?.items ?? []), ...(categoriesPage2.data?.items ?? [])].slice(0, PRINT_MAX_ROWS)
    setPrintRows({ sellers, listings, categories })
  }

  const salesSeries: AdminLineSeries[] = [
    { key: 'gross_sales', label: 'Gross sales', accessor: (row) => Number(row.gross_sales ?? 0) },
    { key: 'net_sales', label: 'Net sales', accessor: (row) => Number(row.net_sales ?? 0) },
  ]
  const orderSeries: AdminLineSeries[] = [
    { key: 'new_orders', label: 'New orders', accessor: (row) => Number(row.new_orders ?? 0) },
    { key: 'completed', label: 'Completed', accessor: (row) => Number(row.completed_orders ?? 0) },
    { key: 'cancelled', label: 'Cancelled', accessor: (row) => Number(row.cancelled_orders ?? 0) },
  ]
  const growthSeries: AdminLineSeries[] = [
    { key: 'new_users', label: 'New users', accessor: (row) => Number(row.new_users ?? 0) },
    { key: 'new_sellers', label: 'New sellers', accessor: (row) => Number(row.new_sellers ?? 0) },
    { key: 'new_listings', label: 'New listings', accessor: (row) => Number(row.new_listings ?? 0) },
  ]

  const sellerBars: AdminHBarRow[] = (topSellers?.items ?? []).map((row) => ({
    label: row.store_name,
    value: row.gross_sales,
  }))
  const categoryBars: AdminHBarRow[] = (categories?.items ?? []).map((row) => ({
    label: row.category_name || 'Uncategorized',
    value: row.gross_sales,
  }))
  const orderStatusBars: AdminHBarRow[] = (distributions?.orders ?? []).map((row) => ({
    label: row.label,
    value: row.count,
  }))
  const paymentStatusBars: AdminHBarRow[] = (distributions?.payments ?? []).map((row) => ({
    label: row.label,
    value: row.count,
  }))
  const ratingBars: AdminHBarRow[] = (distributions?.reviews ?? []).map((row) => ({
    label: row.label,
    value: row.count,
  }))
  const disputeRefundBars: AdminHBarRow[] = [
    ...(distributions?.disputes ?? []).map((row) => ({ label: `Dispute — ${row.label}`, value: row.count })),
    ...(distributions?.refunds ?? []).map((row) => ({ label: `Refund — ${row.label}`, value: row.count })),
  ]

  const kpis = buildKpis()
  const queues = buildDashboardStats()

  return (
    <div className="page admin-dashboard print-variant--dashboard">
      <PageHeader
        title="Administration"
        intro="Marketplace performance, charts, and live operational queues across the selected date range."
      />

      <div className="admin-resource-toolbar no-print">
        <AnalyticsRangeFilter
          start={start}
          end={end}
          bucket={bucket}
          onRangeChange={(nextStart, nextEnd) => updateQuery({ start: nextStart, end: nextEnd })}
          onBucketChange={() => undefined}
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

      <div className="analytics-actions no-print">
        <PrintReportButton onPrepare={preparePrintReport} label="Print Executive Report" />
      </div>

      {loading ? (
        <LoadingState label="Loading marketplace summary..." />
      ) : error != null || overview == null ? (
        <Alert
          variant="error"
          message={error?.message ?? 'We could not load the administration summary. Please try again.'}
        />
      ) : (
        <>
          <section className="analytics-section">
            <div className="analytics-section__heading">
              <h2 className="analytics-section__title">Performance</h2>
              {compare && previous != null ? <span className="analytics-section__note">vs previous period</span> : null}
            </div>
            <div className="admin-dashboard-stats">
              {kpis.map((card) => {
                const value = card.value(overview)
                const prev = card.windowed && compare && previous != null ? card.value(previous) : null
                return (
                  <div className="admin-stat-card analytics-kpi" key={card.label}>
                    <strong className="admin-stat-card__value">{formatMetric(card.format, value)}</strong>
                    <span className="admin-stat-card__label">{card.label}</span>
                    {card.windowed ? <Delta current={value} previous={prev} /> : null}
                    <span className="visually-hidden">{card.label}: {formatMetric(card.format, value)}</span>
                  </div>
                )
              })}
            </div>
          </section>

          <section className="analytics-section">
            <div className="analytics-section__heading">
              <h2 className="analytics-section__title">Performance trends</h2>
              <span className="analytics-section__note">{bucket}ly buckets from {start} to {end}</span>
            </div>
            <div className="admin-dashboard-charts">
              <div className="analytics-chart-card">
                <h3>Sales performance</h3>
                <AdminChartLegend items={salesSeries.map((s, i) => ({ label: s.label, color: chartColorFor(i) }))} className="visually-hidden" />
                <AdminLineChart
                  rows={series.map(toTrendDatum) as AdminTrendDatum[]}
                  xKey="bucket_start"
                  xFormat={(value) => bucketLabel(value, bucket)}
                  series={salesSeries}
                  formatValue={fmtMoney}
                  ariaLabel={`Gross and net sales by ${bucket} from ${start} to ${end}`}
                  ariaDescription="Gross and net sales trend across the selected period."
                />
              </div>
              <div className="analytics-chart-card">
                <h3>Order performance</h3>
                <AdminChartLegend items={orderSeries.map((s, i) => ({ label: s.label, color: chartColorFor(i) }))} />
                <AdminLineChart
                  rows={series.map(toTrendDatum) as AdminTrendDatum[]}
                  xKey="bucket_start"
                  xFormat={(value) => bucketLabel(value, bucket)}
                  series={orderSeries}
                  formatValue={fmtCount}
                  ariaLabel={`New, completed, and cancelled orders by ${bucket} from ${start} to ${end}`}
                  ariaDescription="Order volume trend across the selected period."
                />
              </div>
              <div className="analytics-chart-card">
                <h3>Growth & engagement</h3>
                <AdminChartLegend items={growthSeries.map((s, i) => ({ label: s.label, color: chartColorFor(i) }))} />
                <AdminLineChart
                  rows={series.map(toTrendDatum) as AdminTrendDatum[]}
                  xKey="bucket_start"
                  xFormat={(value) => bucketLabel(value, bucket)}
                  series={growthSeries}
                  formatValue={fmtCount}
                  ariaLabel={`New users, sellers, and listings by ${bucket} from ${start} to ${end}`}
                  ariaDescription="Growth trend across the selected period."
                />
              </div>
            </div>
            {series.length === 0 ? <p className="analytics-chart__empty">No activity in this period.</p> : null}
          </section>

          <section className="analytics-section">
            <div className="analytics-section__heading">
              <h2 className="analytics-section__title">Top sellers & categories</h2>
              <span className="analytics-section__note">by gross sales</span>
            </div>
            <div className="admin-dashboard-charts">
              <div className="analytics-chart-card">
                <h3>Top sellers</h3>
                {sellerBars.length > 0 ? (
                  <AdminHBarChart
                    rows={sellerBars}
                    formatValue={fmtMoney}
                    ariaLabel="Top sellers by gross sales"
                    ariaDescription="Ranking of sellers by gross sales in the selected period."
                    height={Math.max(200, sellerBars.length * 44)}
                  />
                ) : (
                  <p className="analytics-chart__empty">No seller data in this period.</p>
                )}
              </div>
              <div className="analytics-chart-card">
                <h3>Top categories</h3>
                {categoryBars.length > 0 ? (
                  <AdminHBarChart
                    rows={categoryBars}
                    formatValue={fmtMoney}
                    ariaLabel="Top categories by gross sales"
                    ariaDescription="Ranking of categories by gross sales in the selected period."
                    height={Math.max(200, categoryBars.length * 44)}
                  />
                ) : (
                  <p className="analytics-chart__empty">No category data in this period.</p>
                )}
              </div>
            </div>
          </section>

          <section className="analytics-section">
            <div className="analytics-section__heading">
              <h2 className="analytics-section__title">Marketplace status</h2>
              <span className="analytics-section__note">All-time totals across order, payment, review, dispute, and refund records</span>
            </div>
            <div className="admin-dashboard-charts">
              <div className="analytics-chart-card">
                <h3>Order status</h3>
                {orderStatusBars.length > 0 ? (
                  <AdminHBarChart rows={orderStatusBars} formatValue={fmtCount} ariaLabel="Order status distribution" height={Math.max(200, orderStatusBars.length * 36)} />
                ) : (
                  <p className="analytics-chart__empty">No order data available.</p>
                )}
              </div>
              <div className="analytics-chart-card">
                <h3>Payment status</h3>
                {paymentStatusBars.length > 0 ? (
                  <AdminHBarChart rows={paymentStatusBars} formatValue={fmtCount} ariaLabel="Payment status distribution" height={Math.max(200, paymentStatusBars.length * 36)} />
                ) : (
                  <p className="analytics-chart__empty">No payment data available.</p>
                )}
              </div>
              <div className="analytics-chart-card">
                <h3>Review ratings</h3>
                {ratingBars.length > 0 ? (
                  <AdminHBarChart rows={ratingBars} formatValue={fmtCount} ariaLabel="Approved review rating distribution" height={Math.max(200, ratingBars.length * 40)} />
                ) : (
                  <p className="analytics-chart__empty">No approved reviews yet.</p>
                )}
              </div>
              <div className="analytics-chart-card">
                <h3>Disputes & refunds</h3>
                {disputeRefundBars.length > 0 ? (
                  <AdminHBarChart rows={disputeRefundBars} formatValue={fmtCount} ariaLabel="Dispute and refund status distribution" height={Math.max(200, disputeRefundBars.length * 30)} />
                ) : (
                  <p className="analytics-chart__empty">No disputes or refund requests yet.</p>
                )}
              </div>
            </div>
          </section>

          <section className="analytics-section">
            <div className="analytics-section__heading">
              <h2 className="analytics-section__title">Operational queues</h2>
              <span className="analytics-section__note">live moderation and fulfillment totals</span>
            </div>
            <div className="admin-dashboard-stats">
              {queues.map((stat) => (
                <AdminStatCard
                  key={stat.label}
                  label={stat.label}
                  value={stat.value(summary!)}
                  href={stat.href}
                  accent={stat.accent}
                />
              ))}
            </div>
          </section>

          <div className="print-report print-only">
            <ReportHeader
              title="Executive Marketplace Report"
              subtitle="PalitPaddleBai Mart"
              dateRange={formatReportPeriod(start, end)}
              generatedAt={printGeneratedAt ?? undefined}
              generatedBy="Marketplace administrator"
              filters={[`Period windows: ${bucket}ly buckets`, compare ? 'Compared with previous period' : undefined].filter((f) => f != null) as string[]}
            />

            <div className="print-block">
              <div className="print-block__heading">
                <h2>Performance KPIs</h2>
                <span>{kpis.length} metrics</span>
              </div>
              <table className="print-table print-table--kpis">
                <caption className="visually-hidden">Performance KPIs</caption>
                <thead>
                  <tr>
                    <th>Metric</th>
                    <th className="r">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {kpis.map((card) => (
                    <tr key={card.label}>
                      <td>{card.label}</td>
                      <td className="r">{formatMetric(card.format, card.value(overview!))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <PrintReportTable
              caption="Activity by period"
              columns={[
                { key: 'bucket_start', label: 'Period' },
                { key: 'new_orders', label: 'New orders', numeric: true },
                { key: 'transacted', label: 'Transacted', numeric: true },
                { key: 'completed', label: 'Completed', numeric: true },
                { key: 'gross_sales', label: 'Gross sales', numeric: true },
                { key: 'net_sales', label: 'Net sales', numeric: true },
                { key: 'products_sold', label: 'Units sold', numeric: true },
                { key: 'new_users', label: 'New users', numeric: true },
              ]}
              rows={series.slice(0, PRINT_MAX_ROWS).map((row) => ({
                bucket_start: bucketLabel(row.bucket_start, bucket),
                new_orders: fmtCount(row.new_orders),
                transacted: fmtCount(row.transacted_orders),
                completed: fmtCount(row.completed_orders),
                gross_sales: fmtMoney(row.gross_sales),
                net_sales: fmtMoney(row.net_sales),
                products_sold: fmtCount(row.products_sold),
                new_users: fmtCount(row.new_users),
              }))}
              note="Trend uses the selected period and bucket size."
            />

            <PrintReportTable
              caption="Top sellers"
              columns={[
                { key: 'store_name', label: 'Store' },
                { key: 'seller_status', label: 'Status' },
                { key: 'active_listings', label: 'Active listings', numeric: true },
                { key: 'units_sold', label: 'Units sold', numeric: true },
                { key: 'gross_sales', label: 'Gross sales', numeric: true },
                { key: 'avg_rating', label: 'Rating' },
              ]}
              rows={(printRows?.sellers ?? []).map((row) => ({
                store_name: row.store_name,
                seller_status: row.seller_status,
                active_listings: fmtCount(row.active_listings),
                units_sold: fmtCount(row.units_sold),
                gross_sales: fmtMoney(row.gross_sales),
                avg_rating: formatRating(row.avg_rating),
              }))}
            />

            <PrintReportTable
              caption="Popular listings"
              columns={[
                { key: 'listing_title', label: 'Listing' },
                { key: 'store_name', label: 'Store' },
                { key: 'category_name', label: 'Category' },
                { key: 'views', label: 'Views', numeric: true },
                { key: 'units_sold', label: 'Units sold', numeric: true },
                { key: 'gross_sales', label: 'Gross sales', numeric: true },
              ]}
              rows={(printRows?.listings ?? []).map((row) => ({
                listing_title: row.listing_title,
                store_name: row.store_name,
                category_name: row.category_name || '—',
                views: fmtCount(row.views),
                units_sold: fmtCount(row.units_sold),
                gross_sales: fmtMoney(row.gross_sales),
              }))}
            />

            <PrintReportTable
              caption="Top categories"
              columns={[
                { key: 'category_name', label: 'Category' },
                { key: 'active_listings', label: 'Active listings', numeric: true },
                { key: 'units_sold', label: 'Units sold', numeric: true },
                { key: 'gross_sales', label: 'Gross sales', numeric: true },
              ]}
              rows={(printRows?.categories ?? []).map((row) => ({
                category_name: row.category_name || '—',
                active_listings: fmtCount(row.active_listings),
                units_sold: fmtCount(row.units_sold),
                gross_sales: fmtMoney(row.gross_sales),
              }))}
            />

            <PrintReportTable
              caption="Order status totals"
              columns={[
                { key: 'label', label: 'Status' },
                { key: 'count', label: 'Orders', numeric: true },
              ]}
              rows={(distributions?.orders ?? []).map((row) => ({ label: row.label, count: fmtCount(row.count) }))}
              note="All-time totals across all order records."
            />

            <PrintReportTable
              caption="Payment status totals"
              columns={[
                { key: 'label', label: 'Status' },
                { key: 'count', label: 'Orders', numeric: true },
              ]}
              rows={(distributions?.payments ?? []).map((row) => ({ label: row.label, count: fmtCount(row.count) }))}
              note="All-time totals across all order records."
            />

            <PrintReportTable
              caption="Approved review ratings"
              columns={[
                { key: 'label', label: 'Rating' },
                { key: 'count', label: 'Reviews', numeric: true },
              ]}
              rows={(distributions?.reviews ?? []).map((row) => ({ label: row.label, count: fmtCount(row.count) }))}
              note="Approved reviews only."
            />

            <PrintReportTable
              caption="Disputes & refunds"
              columns={[
                { key: 'label', label: 'Area' },
                { key: 'count', label: 'Records', numeric: true },
              ]}
              rows={[
                ...(distributions?.disputes ?? []).map((row: DistributionSlice) => ({ label: `Dispute — ${row.label}`, count: fmtCount(row.count) })),
                ...(distributions?.refunds ?? []).map((row: DistributionSlice) => ({ label: `Refund — ${row.label}`, count: fmtCount(row.count) })),
              ]}
              note="All-time totals."
            />

            <footer className="print-report__footer">
              <p>PalitPaddleBai Mart — Executive Report</p>
              <p>Generated {printGeneratedAt ?? 'on demand'}</p>
            </footer>
          </div>
        </>
      )}
    </div>
  )
}

function toTrendDatum(row: AdminAnalyticsTimeSeriesRow): AdminTrendDatum {
  return {
    ...row,
    gross_sales: row.gross_sales,
    net_sales: row.net_sales,
    new_orders: row.new_orders,
    completed_orders: row.completed_orders,
    cancelled_orders: row.cancelled_orders,
    new_users: row.new_users,
    new_sellers: row.new_sellers,
    new_listings: row.new_listings,
  }
}