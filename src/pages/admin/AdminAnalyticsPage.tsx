import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import AnalyticsHBarList from '../../components/analytics/AnalyticsHBarList'
import AnalyticsRangeFilter from '../../components/analytics/AnalyticsRangeFilter'
import { AdminChartLegend, chartColorFor } from '../../components/analytics/chart-theme'
import {
  AdminLineChart,
  type AdminLineSeries,
  type AdminTrendDatum,
} from '../../components/analytics/AdminLineChart'
import { AdminHBarChart, type AdminHBarRow } from '../../components/analytics/AdminHBarChart'
import PageHeader from '../../components/common/PageHeader'
import Alert from '../../components/common/Alert'
import LoadingState from '../../components/common/LoadingState'
import Badge from '../../components/common/Badge'
import Pagination from '../../components/marketplace/Pagination'
import { PrintReportButton } from '../../components/reports/PrintReportButton'
import { PrintReportTable } from '../../components/reports/PrintReportTable'
import { ReportHeader } from '../../components/reports/ReportHeader'
import {
  addDaysISO,
  parseAnalyticsTableState,
  parseInteger,
  parseAnalyticsBucket,
} from '../../features/admin/analytics/admin-analytics-params'
import {
  getAdminAnalyticsOverview,
  getAdminAnalyticsTimeSeries,
  getAdminCategoryRanking,
  getAdminTopListings,
  getAdminTopSellers,
} from '../../features/admin/analytics/admin-analytics.service'
import {
  getAdminDistributionSnapshots,
  type AdminDistributionSnapshots,
  type DistributionSlice,
} from '../../features/admin/analytics/admin-distributions.service'
import type {
  AdminAnalyticsOverviewRow,
  AdminAnalyticsTimeSeriesRow,
  AdminCategoryRankRow,
  AdminTopListingRow,
  AdminTopSellerRow,
} from '../../features/admin/analytics/admin-analytics.types'
import type { AdminPage, AdminPageItem } from '../../features/admin/admin.types'
import { formatRating } from '../../utils/format'
import { buildCsv, downloadCsv } from '../../utils/csv'
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

interface UrlState {
  start: string
  end: string
  bucket: string
  compare: boolean
  cats: { sort: string; page: number; pageSize: number }
  tops: { sort: string; page: number; pageSize: number }
  sellers: { sort: string; page: number; pageSize: number }
}

function today(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function parseUrlState(params: URLSearchParams): UrlState {
  const end = params.get('end') && !Number.isNaN(new Date(`${params.get('end')}T00:00:00`).getTime()) ? params.get('end')! : today()
  const startRaw = params.get('start')
  const start = startRaw && startRaw <= end && !Number.isNaN(new Date(`${startRaw}T00:00:00`).getTime()) ? startRaw : addDaysISO(end, -29)
  return {
    start,
    end,
    bucket: parseAnalyticsBucket(params),
    compare: params.get('compare') === '1',
    cats: {
      sort: parseAnalyticsTableState(params, 'cat', ['gross_sales_desc', 'units_sold_desc', 'active_listings_desc', 'name_asc'], 'gross_sales_desc').sort,
      page: parseInteger(params.get('catPage'), 1, 1, 100_000),
      pageSize: parseInteger(params.get('catPageSize'), 10, 1, 100),
    },
    tops: {
      sort: parseAnalyticsTableState(params, 'ls', ['views_desc', 'favorites_desc', 'inquiries_desc', 'gross_sales_desc', 'units_sold_desc', 'newest', 'title_asc'], 'views_desc').sort,
      page: parseInteger(params.get('lsPage'), 1, 1, 100_000),
      pageSize: parseInteger(params.get('lsPageSize'), 10, 1, 100),
    },
    sellers: {
      sort: parseAnalyticsTableState(params, 'sp', ['gross_sales_desc', 'units_sold_desc', 'transacted_desc', 'completed_desc', 'rating_desc', 'store_asc'], 'gross_sales_desc').sort,
      page: parseInteger(params.get('spPage'), 1, 1, 100_000),
      pageSize: parseInteger(params.get('spPageSize'), 10, 1, 100),
    },
  }
}

function serializeUrlState(state: UrlState): URLSearchParams {
  const params = new URLSearchParams()
  params.set('start', state.start)
  params.set('end', state.end)
  if (state.bucket !== 'month') params.set('bucket', state.bucket)
  if (state.compare) params.set('compare', '1')
  if (state.cats.sort !== 'gross_sales_desc') params.set('catSort', state.cats.sort)
  if (state.cats.page > 1) params.set('catPage', String(state.cats.page))
  if (state.cats.pageSize !== 10) params.set('catPageSize', String(state.cats.pageSize))
  if (state.tops.sort !== 'views_desc') params.set('lsSort', state.tops.sort)
  if (state.tops.page > 1) params.set('lsPage', String(state.tops.page))
  if (state.tops.pageSize !== 10) params.set('lsPageSize', String(state.tops.pageSize))
  if (state.sellers.sort !== 'gross_sales_desc') params.set('spSort', state.sellers.sort)
  if (state.sellers.page > 1) params.set('spPage', String(state.sellers.page))
  if (state.sellers.pageSize !== 10) params.set('spPageSize', String(state.sellers.pageSize))
  return params
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

interface KpiSection {
  title: string
  cards: {
    label: string
    value: (row: AdminAnalyticsOverviewRow) => number
    format: AnalyticsFormat
    windowed?: boolean
  }[]
}

function buildSections(): KpiSection[] {
  return [
    {
      title: 'Marketplace',
      cards: [
        { label: 'Registered users', value: (r) => r.registered_users, format: 'count' },
        { label: 'Active users', value: (r) => r.active_users, format: 'count' },
        { label: 'Active sellers', value: (r) => r.active_sellers, format: 'count' },
        { label: 'Total listings', value: (r) => r.total_listings, format: 'count' },
        { label: 'Active listings', value: (r) => r.active_listings, format: 'count' },
        { label: 'Sold listings', value: (r) => r.sold_listings, format: 'count' },
      ],
    },
    {
      title: `Growth ${'in period'}`,
      cards: [
        { label: 'New users', value: (r) => r.new_users, format: 'count', windowed: true },
        { label: 'New sellers', value: (r) => r.new_sellers, format: 'count', windowed: true },
        { label: 'New listings', value: (r) => r.new_listings, format: 'count', windowed: true },
      ],
    },
    {
      title: 'Transactions',
      cards: [
        { label: 'Transacted orders', value: (r) => r.transacted_orders, format: 'count', windowed: true },
        { label: 'Completed orders', value: (r) => r.completed_orders, format: 'count', windowed: true },
        { label: 'Cancelled orders', value: (r) => r.cancelled_orders, format: 'count', windowed: true },
        { label: 'Disputed orders', value: (r) => r.disputed_orders, format: 'count', windowed: true },
        { label: 'Products sold', value: (r) => r.products_sold, format: 'count', windowed: true },
      ],
    },
    {
      title: 'Revenue',
      cards: [
        { label: 'Gross sales', value: (r) => r.gross_sales, format: 'money', windowed: true },
        { label: 'Net sales', value: (r) => r.net_sales, format: 'money', windowed: true },
        { label: 'Refunds', value: (r) => r.refund_value, format: 'money', windowed: true },
        { label: 'Avg order value', value: (r) => r.avg_order_value, format: 'money', windowed: true },
        { label: 'Conversion rate', value: (r) => r.conversion_rate, format: 'percent', windowed: true },
      ],
    },
    {
      title: 'Engagement',
      cards: [
        { label: 'Listing views', value: (r) => r.listing_views, format: 'count', windowed: true },
        { label: 'Unique viewers', value: (r) => r.unique_viewers, format: 'count', windowed: true },
        { label: 'Favorites', value: (r) => r.favorites_count, format: 'count', windowed: true },
        { label: 'Inquiries', value: (r) => r.inquiries_count, format: 'count', windowed: true },
      ],
    },
    {
      title: 'Community & moderation',
      cards: [
        { label: 'Approved reviews', value: (r) => r.approved_reviews, format: 'count', windowed: true },
        { label: 'Average rating', value: (r) => r.avg_rating, format: 'rating', windowed: true },
        { label: 'Open disputes', value: (r) => r.open_disputes, format: 'count' },
        { label: 'Resolved disputes', value: (r) => r.resolved_disputes, format: 'count' },
        { label: 'Open reports', value: (r) => r.open_reports, format: 'count' },
      ],
    },
  ]
}

function formatKpi(card: { format: AnalyticsFormat }, value: number): string {
  return formatMetric(card.format, value)
}

export default function AdminAnalyticsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const searchKey = useMemo(() => searchParams.toString(), [searchParams])
  const state = useMemo(() => parseUrlState(new URLSearchParams(searchKey)), [searchKey])

  const [overview, setOverview] = useState<AdminAnalyticsOverviewRow | null>(null)
  const [previous, setPrevious] = useState<AdminAnalyticsOverviewRow | null>(null)
  const [series, setSeries] = useState<AdminAnalyticsTimeSeriesRow[]>([])
  const [categories, setCategories] = useState<AdminPage<AdminCategoryRankRow> | null>(null)
  const [topListings, setTopListings] = useState<AdminPage<AdminTopListingRow> | null>(null)
  const [topSellers, setTopSellers] = useState<AdminPage<AdminTopSellerRow> | null>(null)
  const [distributions, setDistributions] = useState<AdminDistributionSnapshots | null>(null)
  const [printRows, setPrintRows] = useState<{
    sellers: Array<AdminPageItem<AdminTopSellerRow>>
    listings: Array<AdminPageItem<AdminTopListingRow>>
    categories: Array<AdminPageItem<AdminCategoryRankRow>>
  } | null>(null)
  const [printGeneratedAt, setPrintGeneratedAt] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    void getAdminDistributionSnapshots().then((snapshots) => {
      if (active) setDistributions(snapshots)
    })
    return () => {
      active = false
    }
  }, [])

  const previousEnd = useMemo(() => addDaysISO(state.start, -1), [state.start])
  const previousStart = useMemo(() => {
    const span = (new Date(state.end).getTime() - new Date(state.start).getTime()) / 86_400_000
    return addDaysISO(previousEnd, -Math.round(span))
  }, [state.end, state.start, previousEnd])

  useEffect(() => {
    let active = true
    setLoading(true)
    setError(null)
    void (async () => {
      const [overviewResult, prevResult, seriesResult, catResult, topResult, sellerResult] = await Promise.all([
        getAdminAnalyticsOverview(state.start, state.end),
        state.compare ? getAdminAnalyticsOverview(previousStart, previousEnd) : Promise.resolve({ data: null, error: null }),
        getAdminAnalyticsTimeSeries(state.start, state.end, state.bucket),
        getAdminCategoryRanking({ start: state.start, end: state.end, sort: state.cats.sort, page: state.cats.page, pageSize: state.cats.pageSize }),
        getAdminTopListings({ start: state.start, end: state.end, sort: state.tops.sort, page: state.tops.page, pageSize: state.tops.pageSize }),
        getAdminTopSellers({ start: state.start, end: state.end, sort: state.sellers.sort, page: state.sellers.page, pageSize: state.sellers.pageSize }),
      ])
      if (!active) return
      const firstError = [overviewResult, prevResult, seriesResult, catResult, topResult, sellerResult]
        .map((r) => r.error)
        .find((e) => e != null)
      if (firstError != null) {
        setError('We could not load marketplace analytics. Please try again.')
        setLoading(false)
        return
      }
      setOverview(overviewResult.data)
      setPrevious(prevResult.data)
      setSeries(seriesResult.data ?? [])
      setCategories(catResult.data)
      setTopListings(topResult.data)
      setTopSellers(sellerResult.data)
      setLoading(false)
    })()
    return () => { active = false }
  }, [state, setSearchParams, previousStart, previousEnd])

  function update(patch: Partial<UrlState>) {
    setSearchParams(serializeUrlState({ ...state, ...patch }))
  }

  function exportOverviewCsv() {
    if (overview == null) return
    const sections = buildSections()
    const header = ['Metric', 'Value']
    const rows: (string | number)[][] = []
    for (const section of sections) {
      for (const card of section.cards) {
        rows.push([`${section.title} — ${card.label}`, formatKpi(card, card.value(overview))])
      }
    }
    downloadCsv(`palitpaddlebai-analytics-${state.start}-to-${state.end}.csv`, buildCsv(header, rows))
  }

  function exportSeriesCsv() {
    const header = ['Period', 'New users', 'New sellers', 'New listings', 'New orders', 'Transacted orders', 'Completed orders', 'Cancelled orders', 'Products sold', 'Gross sales', 'Net sales', 'Refunds', 'Listing views', 'Favorites', 'Inquiries', 'Approved reviews']
    const rows = series.map((row) => [
      row.bucket_start,
      row.new_users,
      row.new_sellers,
      row.new_listings,
      row.new_orders,
      row.transacted_orders,
      row.completed_orders,
      row.cancelled_orders,
      row.products_sold,
      row.gross_sales,
      row.net_sales,
      row.refund_value,
      row.listing_views,
      row.favorites_count,
      row.inquiries_count,
      row.approved_reviews,
    ])
    downloadCsv(`palitpaddlebai-timeseries-${state.start}-to-${state.end}.csv`, buildCsv(header, rows))
  }

  function exportCategoriesCsv() {
    if (categories == null) return
    const header = ['Category', 'Active listings', 'Units sold', 'Gross sales']
    const rows = categories.items.map((row) => [row.category_name, row.active_listings, row.units_sold, row.gross_sales])
    downloadCsv(`palitpaddlebai-categories-${state.start}-to-${state.end}.csv`, buildCsv(header, rows))
  }

  function exportTopListingsCsv() {
    if (topListings == null) return
    const header = ['Listing', 'Store', 'Category', 'Views', 'Favorites', 'Inquiries', 'Units sold', 'Gross sales', 'Avg rating', 'Reviews']
    const rows = topListings.items.map((row) => [
      row.listing_title, row.store_name, row.category_name, row.views, row.favorites, row.inquiries,
      row.units_sold, row.gross_sales, row.avg_rating ?? '', row.review_count,
    ])
    downloadCsv(`palitpaddlebai-popular-listings-${state.start}-to-${state.end}.csv`, buildCsv(header, rows))
  }

  function exportTopSellersCsv() {
    if (topSellers == null) return
    const header = ['Store', 'Status', 'Active listings', 'Units sold', 'Gross sales', 'Transacted orders', 'Completed orders', 'Avg rating', 'Reviews']
    const rows = topSellers.items.map((row) => [
      row.store_name, row.seller_status, row.active_listings, row.units_sold, row.gross_sales,
      row.transacted_orders, row.completed_orders, row.avg_rating ?? '', row.review_count,
    ])
    downloadCsv(`palitpaddlebai-top-sellers-${state.start}-to-${state.end}.csv`, buildCsv(header, rows))
  }


  async function preparePrintReport() {
    setPrintGeneratedAt(formatReportTimestamp())
    const pageSize = 50
    const [cat1, cat2, ls1, ls2, sp1, sp2] = await Promise.all([
      getAdminCategoryRanking({ start: state.start, end: state.end, sort: state.cats.sort, page: 1, pageSize }),
      getAdminCategoryRanking({ start: state.start, end: state.end, sort: state.cats.sort, page: 2, pageSize }),
      getAdminTopListings({ start: state.start, end: state.end, sort: state.tops.sort, page: 1, pageSize }),
      getAdminTopListings({ start: state.start, end: state.end, sort: state.tops.sort, page: 2, pageSize }),
      getAdminTopSellers({ start: state.start, end: state.end, sort: state.sellers.sort, page: 1, pageSize }),
      getAdminTopSellers({ start: state.start, end: state.end, sort: state.sellers.sort, page: 2, pageSize }),
    ])
    const categories = [...(cat1.data?.items ?? []), ...(cat2.data?.items ?? [])].slice(0, PRINT_MAX_ROWS)
    const listings = [...(ls1.data?.items ?? []), ...(ls2.data?.items ?? [])].slice(0, PRINT_MAX_ROWS)
    const sellers = [...(sp1.data?.items ?? []), ...(sp2.data?.items ?? [])].slice(0, PRINT_MAX_ROWS)
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

  const sortedCategories = useMemo(() => {
    if (categories == null) return []
    return relationsToHBarData(categories.items)
  }, [categories])

  return (
    <div className="page admin-resource-page admin-analytics">
      <PageHeader
        title="Analytics"
        intro="Marketplace KPIs, trends, and ranking tables across the selected date range."
      />

      <div className="admin-resource-toolbar">
        <AnalyticsRangeFilter
          start={state.start}
          end={state.end}
          bucket={state.bucket}
          onRangeChange={(start, end) => update({ start, end, cats: { ...state.cats, page: 1 }, tops: { ...state.tops, page: 1 }, sellers: { ...state.sellers, page: 1 } })}
          onBucketChange={(bucket) => update({ bucket })}
        />
        <label className="analytics-compare">
          <input
            type="checkbox"
            checked={state.compare}
            onChange={(e) => update({ compare: e.target.checked })}
          />
          <span>Compare with previous period</span>
        </label>
      </div>

      <div className="analytics-actions no-print">
        <PrintReportButton onPrepare={preparePrintReport} label="Print Report" />
        <button type="button" className="btn btn--ghost btn--sm" onClick={exportOverviewCsv} disabled={overview == null}>
          Export KPIs (CSV)
        </button>
        <button type="button" className="btn btn--ghost btn--sm" onClick={exportSeriesCsv} disabled={series.length === 0}>
          Export trend (CSV)
        </button>
      </div>

      {loading ? (
        <LoadingState label="Loading marketplace analytics…" />
      ) : error != null ? (
        <Alert variant="error" message={error} />
      ) : overview == null ? (
        <Alert variant="error" message="We could not load marketplace analytics. Please try again." />
      ) : (
        <>
          {buildSections().map((section) => (
            <section className="analytics-section" key={section.title}>
              <div className="analytics-section__heading">
                <h2 className="analytics-section__title">{section.title}</h2>
                {state.compare && previous != null ? <span className="analytics-section__note">vs previous period</span> : null}
              </div>
              <div className="admin-dashboard-stats">
                {section.cards.map((card) => {
                  const value = card.value(overview)
                  const prev = card.windowed && state.compare && previous != null ? card.value(previous) : null
                  return (
                    <div className="admin-stat-card analytics-kpi" key={card.label}>
                      <strong className="admin-stat-card__value">{formatKpi(card, value)}</strong>
                      <span className="admin-stat-card__label">{card.label}</span>
                      {card.windowed ? <Delta current={value} previous={prev} /> : null}
                      <span className="visually-hidden">{card.label}: {formatKpi(card, value)}</span>
                    </div>
                  )
                })}
              </div>
            </section>
          ))}

          <section className="analytics-section">
            <div className="analytics-section__heading">
              <h2 className="analytics-section__title">Marketplace activity</h2>
              <span className="analytics-section__note">{state.bucket}ly trend of revenue and orders</span>
            </div>
            <div className="admin-dashboard-charts">
              <div className="analytics-chart-card">
                <h3>Sales performance</h3>
                <AdminChartLegend items={salesSeries.map((s, i) => ({ label: s.label, color: chartColorFor(i) }))} />
                <AdminLineChart
                  rows={series.map(toTrendDatum)}
                  xKey="bucket_start"
                  xFormat={(value) => bucketLabel(value, state.bucket)}
                  series={salesSeries}
                  formatValue={fmtMoney}
                  ariaLabel={`Gross and net sales by ${state.bucket} from ${state.start} to ${state.end}`}
                  ariaDescription="Gross and net sales trend across the selected period."
                />
              </div>
              <div className="analytics-chart-card">
                <h3>Order volume</h3>
                <AdminChartLegend items={orderSeries.map((s, i) => ({ label: s.label, color: chartColorFor(i) }))} />
                <AdminLineChart
                  rows={series.map(toTrendDatum)}
                  xKey="bucket_start"
                  xFormat={(value) => bucketLabel(value, state.bucket)}
                  series={orderSeries}
                  formatValue={fmtCount}
                  ariaLabel={`New, completed, and cancelled orders by ${state.bucket} from ${state.start} to ${state.end}`}
                  ariaDescription="Order volume trend across the selected period."
                />
              </div>
            </div>
            {series.length === 0 ? <p className="analytics-chart__empty">No activity in this period.</p> : null}
          </section>

          <section className="analytics-section">
            <div className="analytics-section__heading">
              <h2 className="analytics-section__title">Categories</h2>
              <div className="analytics-section__heading-actions">
                <label className="analytics-sort">
                  <span>Sort</span>
                  <select value={state.cats.sort} onChange={(e) => update({ cats: { ...state.cats, sort: e.target.value, page: 1 } })}>
                    <option value="gross_sales_desc">Gross sales</option>
                    <option value="units_sold_desc">Units sold</option>
                    <option value="active_listings_desc">Active listings</option>
                    <option value="name_asc">Name</option>
                  </select>
                </label>
                <button type="button" className="btn btn--ghost btn--sm" onClick={exportCategoriesCsv} disabled={categories == null || categories.items.length === 0}>
                  CSV
                </button>
              </div>
            </div>
            {categories != null && categories.items.length > 0 ? (
              <>
                <AnalyticsHBarList
                  ariaLabel="Category gross sales ranking"
                  data={sortedCategories}
                />
                <Pagination
                  page={categories.page}
                  totalPages={categories.totalPages}
                  onPageChange={(page) => update({ cats: { ...state.cats, page } })}
                />
              </>
            ) : (
              <p className="analytics-chart__empty">No category data in this period.</p>
            )}
          </section>

          <section className="analytics-section">
            <div className="analytics-section__heading">
              <h2 className="analytics-section__title">Popular listings</h2>
              <div className="analytics-section__heading-actions">
                <label className="analytics-sort">
                  <span>Sort</span>
                  <select value={state.tops.sort} onChange={(e) => update({ tops: { ...state.tops, sort: e.target.value, page: 1 } })}>
                    <option value="views_desc">Most viewed</option>
                    <option value="favorites_desc">Most favorited</option>
                    <option value="inquiries_desc">Most inquired</option>
                    <option value="gross_sales_desc">Gross sales</option>
                    <option value="units_sold_desc">Units sold</option>
                    <option value="newest">Newest</option>
                    <option value="title_asc">Name</option>
                  </select>
                </label>
                <button type="button" className="btn btn--ghost btn--sm" onClick={exportTopListingsCsv} disabled={topListings == null || topListings.items.length === 0}>
                  CSV
                </button>
              </div>
            </div>
            {topListings != null && topListings.items.length > 0 ? (
              <>
                <div className="admin-resource-table">
                  <table>
                    <caption className="visually-hidden">Popular listings ranking</caption>
                    <thead>
                      <tr>
                        <th>Listing</th>
                        <th>Store</th>
                        <th>Category</th>
                        <th>Views</th>
                        <th>Favs</th>
                        <th>Inq.</th>
                        <th>Units</th>
                        <th>Sales</th>
                        <th>Rating</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topListings.items.map((row) => (
                        <tr key={row.listing_id}>
                          <td>{row.listing_title}</td>
                          <td>{row.store_name}</td>
                          <td>{row.category_name || '—'}</td>
                          <td>{fmtCount(row.views)}</td>
                          <td>{fmtCount(row.favorites)}</td>
                          <td>{fmtCount(row.inquiries)}</td>
                          <td>{fmtCount(row.units_sold)}</td>
                          <td>{fmtMoney(row.gross_sales)}</td>
                          <td>
                            <Badge variant={row.listing_status}>{row.listing_status}</Badge>
                            {' '}
                            <span className="analytics-rating">{formatRating(row.avg_rating)} <span className="analytics-rating__count">({row.review_count})</span></span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Pagination
                  page={topListings.page}
                  totalPages={topListings.totalPages}
                  onPageChange={(page) => update({ tops: { ...state.tops, page } })}
                />
              </>
            ) : (
              <p className="analytics-chart__empty">No listing activity in this period.</p>
            )}
          </section>

          <section className="analytics-section">
            <div className="analytics-section__heading">
              <h2 className="analytics-section__title">Top sellers</h2>
              <div className="analytics-section__heading-actions">
                <label className="analytics-sort">
                  <span>Sort</span>
                  <select value={state.sellers.sort} onChange={(e) => update({ sellers: { ...state.sellers, sort: e.target.value, page: 1 } })}>
                    <option value="gross_sales_desc">Gross sales</option>
                    <option value="units_sold_desc">Units sold</option>
                    <option value="transacted_desc">Transacted orders</option>
                    <option value="completed_desc">Completed orders</option>
                    <option value="rating_desc">Rating</option>
                    <option value="store_asc">Store</option>
                  </select>
                </label>
                <button type="button" className="btn btn--ghost btn--sm" onClick={exportTopSellersCsv} disabled={topSellers == null || topSellers.items.length === 0}>
                  CSV
                </button>
              </div>
            </div>
            {topSellers != null && topSellers.items.length > 0 ? (
              <>
                <div className="admin-resource-table">
                  <table>
                    <caption className="visually-hidden">Top sellers ranking</caption>
                    <thead>
                      <tr>
                        <th>Store</th>
                        <th>Status</th>
                        <th>Active listings</th>
                        <th>Units sold</th>
                        <th>Gross sales</th>
                        <th>Transacted</th>
                        <th>Completed</th>
                        <th>Rating</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topSellers.items.map((row) => (
                        <tr key={row.seller_id}>
                          <td>{row.store_name}</td>
                          <td className="admin-resource-table__badge-cell"><Badge variant={row.seller_status}>{row.seller_status}</Badge></td>
                          <td>{fmtCount(row.active_listings)}</td>
                          <td>{fmtCount(row.units_sold)}</td>
                          <td>{fmtMoney(row.gross_sales)}</td>
                          <td>{fmtCount(row.transacted_orders)}</td>
                          <td>{fmtCount(row.completed_orders)}</td>
                          <td>{formatRating(row.avg_rating)} <span className="analytics-rating__count">({row.review_count})</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Pagination
                  page={topSellers.page}
                  totalPages={topSellers.totalPages}
                  onPageChange={(page) => update({ sellers: { ...state.sellers, page } })}
                />
              </>
            ) : (
              <p className="analytics-chart__empty">No seller data in this period.</p>
            )}
          </section>

          <section className="analytics-section">
            <div className="analytics-section__heading">
              <h2 className="analytics-section__title">Status & moderation</h2>
              <span className="analytics-section__note">All-time totals across order, payment, review, dispute, and refund records</span>
            </div>
            <div className="admin-dashboard-charts">
              <div className="analytics-chart-card">
                <h3>Order status</h3>
                {distributionRows(distributions?.orders).length > 0 ? (
                  <AdminHBarChart rows={distributionRows(distributions?.orders)} formatValue={fmtCount} ariaLabel="Order status distribution" height={240} />
                ) : (
                  <p className="analytics-chart__empty">No order data available.</p>
                )}
              </div>
              <div className="analytics-chart-card">
                <h3>Payment status</h3>
                {distributionRows(distributions?.payments).length > 0 ? (
                  <AdminHBarChart rows={distributionRows(distributions?.payments)} formatValue={fmtCount} ariaLabel="Payment status distribution" height={240} />
                ) : (
                  <p className="analytics-chart__empty">No payment data available.</p>
                )}
              </div>
              <div className="analytics-chart-card">
                <h3>Review ratings</h3>
                {distributionRows(distributions?.reviews).length > 0 ? (
                  <AdminHBarChart rows={distributionRows(distributions?.reviews)} formatValue={fmtCount} ariaLabel="Approved review rating distribution" height={240} />
                ) : (
                  <p className="analytics-chart__empty">No approved reviews yet.</p>
                )}
              </div>
              <div className="analytics-chart-card">
                <h3>Disputes & refunds</h3>
                {distributionRows(distributions?.disputes, distributions?.refunds).length > 0 ? (
                  <AdminHBarChart rows={distributionRows(distributions?.disputes, distributions?.refunds)} formatValue={fmtCount} ariaLabel="Dispute and refund status distribution" height={240} />
                ) : (
                  <p className="analytics-chart__empty">No disputes or refund requests yet.</p>
                )}
              </div>
            </div>
          </section>

          <div className="print-report print-only">
            <ReportHeader
              title="Marketplace Analytics Report"
              subtitle="PalitPaddleBai Mart"
              dateRange={formatReportPeriod(state.start, state.end)}
              generatedAt={printGeneratedAt ?? undefined}
              generatedBy="Marketplace administrator"
              filters={[`Buckets: ${state.bucket}ly`, state.compare ? 'Compared with previous period' : undefined].filter((f) => f != null) as string[]}
            />

            <div className="print-block">
              <div className="print-block__heading">
                <h2>Period KPIs</h2>
                <span>{buildSections().reduce((sum, s) => sum + s.cards.length, 0)} metrics</span>
              </div>
              <table className="print-table print-table--kpis">
                <caption className="visually-hidden">Period KPIs</caption>
                <thead>
                  <tr>
                    <th>Metric</th>
                    <th className="r">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {buildSections().flatMap((section) =>
                    section.cards.map((card) => (
                      <tr key={card.label}>
                        <td>{card.label}</td>
                        <td className="r">{formatKpi(card, card.value(overview!))}</td>
                      </tr>
                    )),
                  )}
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
                { key: 'cancelled', label: 'Cancelled', numeric: true },
                { key: 'gross_sales', label: 'Gross sales', numeric: true },
                { key: 'net_sales', label: 'Net sales', numeric: true },
                { key: 'products_sold', label: 'Units sold', numeric: true },
                { key: 'listing_views', label: 'Listing views', numeric: true },
                { key: 'new_users', label: 'New users', numeric: true },
              ]}
              rows={series.slice(0, PRINT_MAX_ROWS).map((row) => ({
                bucket_start: bucketLabel(row.bucket_start, state.bucket),
                new_orders: fmtCount(row.new_orders),
                transacted: fmtCount(row.transacted_orders),
                completed: fmtCount(row.completed_orders),
                cancelled: fmtCount(row.cancelled_orders),
                gross_sales: fmtMoney(row.gross_sales),
                net_sales: fmtMoney(row.net_sales),
                products_sold: fmtCount(row.products_sold),
                listing_views: fmtCount(row.listing_views),
                new_users: fmtCount(row.new_users),
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
              caption="Popular listings"
              columns={[
                { key: 'listing_title', label: 'Listing' },
                { key: 'store_name', label: 'Store' },
                { key: 'category_name', label: 'Category' },
                { key: 'views', label: 'Views', numeric: true },
                { key: 'favorites', label: 'Favorites', numeric: true },
                { key: 'inquiries', label: 'Inquiries', numeric: true },
                { key: 'units_sold', label: 'Units sold', numeric: true },
                { key: 'gross_sales', label: 'Gross sales', numeric: true },
              ]}
              rows={(printRows?.listings ?? []).map((row) => ({
                listing_title: row.listing_title,
                store_name: row.store_name,
                category_name: row.category_name || '—',
                views: fmtCount(row.views),
                favorites: fmtCount(row.favorites),
                inquiries: fmtCount(row.inquiries),
                units_sold: fmtCount(row.units_sold),
                gross_sales: fmtMoney(row.gross_sales),
              }))}
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
              caption="Order status totals"
              columns={[
                { key: 'label', label: 'Status' },
                { key: 'count', label: 'Orders', numeric: true },
              ]}
              rows={(distributions?.orders ?? []).map((row) => ({ label: row.label, count: fmtCount(row.count) }))}
              note="All-time totals."
            />

            <PrintReportTable
              caption="Payment status totals"
              columns={[
                { key: 'label', label: 'Status' },
                { key: 'count', label: 'Orders', numeric: true },
              ]}
              rows={(distributions?.payments ?? []).map((row) => ({ label: row.label, count: fmtCount(row.count) }))}
              note="All-time totals."
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
              rows={[...disputeRefundPrintRows(distributions)]}
              note="All-time totals."
            />

            <footer className="print-report__footer">
              <p>PalitPaddleBai Mart — Marketplace Analytics Report</p>
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

function distributionRows(...groups: (DistributionSlice[] | undefined)[]): AdminHBarRow[] {
  return groups.flatMap((group) => (group ?? []).map((row) => ({ label: row.label, value: row.count })))
}

function disputeRefundPrintRows(distributions: AdminDistributionSnapshots | null): { label: string; count: string }[] {
  return [
    ...(distributions?.disputes ?? []).map((row: DistributionSlice) => ({ label: `Dispute — ${row.label}`, count: fmtCount(row.count) })),
    ...(distributions?.refunds ?? []).map((row: DistributionSlice) => ({ label: `Refund — ${row.label}`, count: fmtCount(row.count) })),
  ]
}

function relationsToHBarData(
  items: Array<{ category_name: string; active_listings: number; units_sold: number; gross_sales: number }>,
) {
  return items.map((row) => ({
    label: row.category_name,
    sublabel: `${fmtCount(row.active_listings)} active listing${row.active_listings === 1 ? '' : 's'} · ${fmtCount(row.units_sold)} sold`,
    value: fmtMoney(row.gross_sales),
    amount: row.gross_sales,
  }))
}