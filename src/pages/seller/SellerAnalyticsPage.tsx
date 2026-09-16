import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Link } from 'react-router-dom'
import AnalyticsRangeFilter from '../../components/analytics/AnalyticsRangeFilter'
import { AdminLineChart, type AdminTrendDatum } from '../../components/analytics/AdminLineChart'
import { AdminHBarChart } from '../../components/analytics/AdminHBarChart'
import { AdminChartLegend, chartColorFor } from '../../components/analytics/chart-theme'
import AnalyticsHBarList from '../../components/analytics/AnalyticsHBarList'
import PageHeader from '../../components/common/PageHeader'
import Alert from '../../components/common/Alert'
import LoadingState from '../../components/common/LoadingState'
import Badge from '../../components/common/Badge'
import Pagination from '../../components/marketplace/Pagination'
import { PrintReportButton } from '../../components/reports/PrintReportButton'
import { ReportHeader } from '../../components/reports/ReportHeader'
import { PrintReportTable } from '../../components/reports/PrintReportTable'
import {
  SellerKpiGrid,
  SellerReviewSummary,
  sellerFulfillmentRows,
  sellerInterestRows,
  buildSellerKpiSections,
} from '../../components/seller/SellerAnalyticsViews'
import { useSeller } from '../../features/seller/useSeller'
import {
  addDaysISO,
  parseAnalyticsTableState,
  parseAnalyticsBucket,
} from '../../features/admin/analytics/admin-analytics-params'
import {
  getMySellerAnalyticsOverview,
  getMySellerAnalyticsTimeSeries,
  getMySellerAnalyticsListings,
} from '../../features/seller/analytics/seller-analytics.service'
import type {
  SellerAnalyticsOverviewRow,
  SellerAnalyticsTimeSeriesRow,
  SellerListingRankRow,
} from '../../features/admin/analytics/admin-analytics.types'
import type { AdminPage, AdminPageItem } from '../../features/admin/admin.types'
import type { SellerKpiSectionConfig } from '../../components/seller/SellerAnalyticsViews'
import { getMySellerRatingDistribution } from '../../features/reviews/reviews.service'
import { formatRating } from '../../utils/format'
import { buildCsv, downloadCsv } from '../../utils/csv'
import {
  bucketLabel,
  fmtCount,
  fmtMoney,
  formatMetric,
} from '../../utils/analytics-format'
import {
  formatReportPeriod,
  formatReportTimestamp,
} from '../../features/admin/reports/report-utils'

interface UrlState {
  start: string
  end: string
  bucket: string
  compare: boolean
  listings: { sort: string; page: number; pageSize: number }
}

function today(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const LISTING_SORTS = ['views_desc', 'favorites_desc', 'inquiries_desc', 'gross_sales_desc', 'units_sold_desc', 'newest', 'title_asc'] as const

function parseUrlState(params: URLSearchParams): UrlState {
  const end = params.get('end') && !Number.isNaN(new Date(`${params.get('end')}T00:00:00`).getTime()) ? params.get('end')! : today()
  const startRaw = params.get('start')
  const start = startRaw && startRaw <= end && !Number.isNaN(new Date(`${startRaw}T00:00:00`).getTime()) ? startRaw : addDaysISO(end, -29)
  const table = parseAnalyticsTableState(params, 'ls', LISTING_SORTS, 'views_desc')
  return {
    start,
    end,
    bucket: parseAnalyticsBucket(params),
    compare: params.get('compare') === '1',
    listings: { sort: table.sort, page: table.page, pageSize: table.pageSize },
  }
}

function serializeUrlState(state: UrlState): URLSearchParams {
  const params = new URLSearchParams()
  params.set('start', state.start)
  params.set('end', state.end)
  if (state.bucket !== 'month') params.set('bucket', state.bucket)
  if (state.compare) params.set('compare', '1')
  if (state.listings.sort !== 'views_desc') params.set('lsSort', state.listings.sort)
  if (state.listings.page > 1) params.set('lsPage', String(state.listings.page))
  if (state.listings.pageSize !== 10) params.set('lsPageSize', String(state.listings.pageSize))
  return params
}

const salesSeries = [
  { key: 'gross_sales', label: 'Gross sales', accessor: (r: AdminTrendDatum) => Number(r.gross_sales ?? 0) },
  { key: 'net_sales', label: 'Net sales', accessor: (r: AdminTrendDatum) => Number(r.net_sales ?? 0) },
] as const

const orderSeries = [
  { key: 'transacted_orders', label: 'Transacted', accessor: (r: AdminTrendDatum) => Number(r.transacted_orders ?? 0) },
  { key: 'completed_orders', label: 'Completed', accessor: (r: AdminTrendDatum) => Number(r.completed_orders ?? 0) },
  { key: 'cancelled_orders', label: 'Cancelled', accessor: (r: AdminTrendDatum) => Number(r.cancelled_orders ?? 0) },
] as const

interface PrintSnapshot {
  overview: SellerAnalyticsOverviewRow | null
  series: SellerAnalyticsTimeSeriesRow[]
  listings: AdminPage<SellerListingRankRow> | null
  topListings: AdminPageItem<SellerListingRankRow>[]
  distribution: Record<number, number>
}

export default function SellerAnalyticsPage() {
  const { sellerProfile } = useSeller()
  const [searchParams, setSearchParams] = useSearchParams()
  const searchKey = useMemo(() => searchParams.toString(), [searchParams])
  const state = useMemo(() => parseUrlState(new URLSearchParams(searchKey)), [searchKey])

  const [overview, setOverview] = useState<SellerAnalyticsOverviewRow | null>(null)
  const [previous, setPrevious] = useState<SellerAnalyticsOverviewRow | null>(null)
  const [series, setSeries] = useState<SellerAnalyticsTimeSeriesRow[]>([])
  const [listings, setListings] = useState<AdminPage<SellerListingRankRow> | null>(null)
  const [topListings, setTopListings] = useState<AdminPageItem<SellerListingRankRow>[]>([])
  const [distribution, setDistribution] = useState<Record<number, number>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [printSnapshot, setPrintSnapshot] = useState<PrintSnapshot | null>(null)
  const [printGeneratedAt, setPrintGeneratedAt] = useState<string | null>(null)

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
      const [overviewResult, prevResult, seriesResult, listingResult, topResult, distResult] =
        await Promise.all([
          getMySellerAnalyticsOverview(state.start, state.end),
          state.compare ? getMySellerAnalyticsOverview(previousStart, previousEnd) : Promise.resolve({ data: null, error: null }),
          getMySellerAnalyticsTimeSeries(state.start, state.end, state.bucket),
          getMySellerAnalyticsListings({ start: state.start, end: state.end, sort: state.listings.sort, page: state.listings.page, pageSize: state.listings.pageSize }),
          getMySellerAnalyticsListings({ start: state.start, end: state.end, sort: 'gross_sales_desc', page: 1, pageSize: 5 }),
          getMySellerRatingDistribution(),
        ])
      if (!active) return
      const firstError = [overviewResult, prevResult, seriesResult, listingResult, topResult, distResult]
        .map((r) => r.error)
        .find((e) => e != null)
      if (firstError != null) {
        setError('We could not load your analytics. Please try again.')
        setLoading(false)
        return
      }
      setOverview(overviewResult.data)
      setPrevious(prevResult.data)
      setSeries(seriesResult.data ?? [])
      setListings(listingResult.data)
      setTopListings(topResult.data?.items ?? [])
      setDistribution(distResult.data ?? {})
      setLoading(false)
    })()
    return () => { active = false }
  }, [state, previousStart, previousEnd])

  function update(patch: Partial<UrlState>) {
    setSearchParams(serializeUrlState({ ...state, ...patch }))
  }

  function exportOverviewCsv() {
    if (overview == null) return
    const rows: (string | number)[][] = []
    for (const section of buildSellerKpiSections()) {
      for (const card of section.cards) {
        rows.push([`${section.title} — ${card.label}`, formatMetric(card.format, Number(overview[card.valueKey] ?? 0))])
      }
    }
    const header = ['Metric', 'Value']
    downloadCsv(`my-store-analytics-${state.start}-to-${state.end}.csv`, buildCsv(header, rows))
  }

  function exportSeriesCsv() {
    const header = ['Period', 'New listings', 'New orders', 'Transacted orders', 'Completed orders', 'Cancelled orders', 'Products sold', 'Gross sales', 'Net sales', 'Refunds', 'Listing views', 'Favorites', 'Inquiries', 'Approved reviews']
    const rows = series.map((row) => [
      row.bucket_start,
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
    downloadCsv(`my-store-timeseries-${state.start}-to-${state.end}.csv`, buildCsv(header, rows))
  }

  function exportListingsCsv() {
    if (listings == null) return
    const header = ['Listing', 'Status', 'Views', 'Favorites', 'Inquiries', 'Units sold', 'Gross sales', 'Avg rating', 'Reviews']
    const rows = listings.items.map((row) => [
      row.listing_title, row.listing_status, row.views, row.favorites, row.inquiries,
      row.units_sold, row.gross_sales, row.avg_rating ?? '', row.review_count,
    ])
    downloadCsv(`my-store-listings-${state.start}-to-${state.end}.csv`, buildCsv(header, rows))
  }

  async function preparePrintReport() {
    setPrintGeneratedAt(formatReportTimestamp())
    setPrintSnapshot({ overview, series, listings, topListings, distribution })
  }

  if (sellerProfile == null) {
    return <LoadingState label="Loading your seller account…" />
  }

  const reviewStatus: 'loading' | 'error' | 'empty' | 'data' =
    loading ? 'loading' : error != null ? 'error' : (overview?.approved_reviews ?? 0) > 0 ? 'data' : 'empty'

  const kpiSections = buildSellerKpiSections()

  return (
    <div className="container page seller-analytics seller-analytics-page">
      <PageHeader
        title="Your analytics"
        intro={`${sellerProfile.store_name} — KPIs, trends, and listing performance across the selected date range.`}
      />

      <div className="admin-resource-toolbar">
        <AnalyticsRangeFilter
          start={state.start}
          end={state.end}
          bucket={state.bucket}
          onRangeChange={(start, end) => update({ start, end, listings: { ...state.listings, page: 1 } })}
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

      <div className="analytics-actions">
        <button type="button" className="btn btn--ghost btn--sm" onClick={exportOverviewCsv} disabled={overview == null}>
          Export KPIs (CSV)
        </button>
        <button type="button" className="btn btn--ghost btn--sm" onClick={exportSeriesCsv} disabled={series.length === 0}>
          Export trend (CSV)
        </button>
        <PrintReportButton
          label="Print Seller Report"
          disabled={overview == null}
          onPrepare={preparePrintReport}
        />
      </div>

      {loading ? (
        <LoadingState label="Loading your analytics…" />
      ) : error != null ? (
        <Alert variant="error" message={error} />
      ) : overview == null ? (
        <Alert variant="error" message="We could not load your analytics. Please try again." />
      ) : (
        <>
          <SellerKpiGrid
            sections={kpiSections}
            overview={overview}
            previous={previous}
            compare={state.compare}
          />

          <section className="analytics-section">
            <div className="analytics-section__heading">
              <h2 className="analytics-section__title">Performance trends</h2>
              <span className="analytics-section__note">{state.bucket}ly buckets from {state.start} to {state.end}</span>
            </div>
            <div className="admin-dashboard-charts">
              <div className="analytics-chart-card">
                <h3>Sales trend</h3>
                <AdminChartLegend items={salesSeries.map((s) => ({ label: s.label, color: chartColorFor(salesSeries.indexOf(s)) }))} />
                <AdminLineChart
                  rows={series as AdminTrendDatum[]}
                  xKey="bucket_start"
                  xFormat={(value) => bucketLabel(value, state.bucket)}
                  series={salesSeries}
                  formatValue={fmtMoney}
                  ariaLabel={`Gross and net sales by ${state.bucket} from ${state.start} to ${state.end}`}
                  ariaDescription="Gross and net sales across the selected period."
                />
              </div>
              <div className="analytics-chart-card">
                <h3>Order trend</h3>
                <AdminChartLegend items={orderSeries.map((s) => ({ label: s.label, color: chartColorFor(orderSeries.indexOf(s)) }))} />
                <AdminLineChart
                  rows={series as AdminTrendDatum[]}
                  xKey="bucket_start"
                  xFormat={(value) => bucketLabel(value, state.bucket)}
                  series={orderSeries}
                  formatValue={fmtCount}
                  ariaLabel={`Transacted, completed, and cancelled orders by ${state.bucket} from ${state.start} to ${state.end}`}
                  ariaDescription="Order volumes across the selected period."
                />
              </div>
              <div className="analytics-chart-card">
                <h3>Order status</h3>
                <AnalyticsHBarList
                  data={sellerFulfillmentRows(overview)}
                  ariaLabel={`Order status snapshot for ${formatReportPeriod(state.start, state.end)}`}
                />
              </div>
              <div className="analytics-chart-card">
                <h3>Customer interest</h3>
                <AnalyticsHBarList
                  data={sellerInterestRows(overview)}
                  ariaLabel={`Customer interest for ${formatReportPeriod(state.start, state.end)}`}
                />
              </div>
              <div className="analytics-chart-card">
                <h3>Customer feedback</h3>
                <SellerReviewSummary
                  count={overview.approved_reviews}
                  average={overview.avg_rating}
                  distribution={distribution}
                  status={reviewStatus}
                />
              </div>
            </div>
            {series.length === 0 ? <p className="analytics-chart__empty">No activity in this period.</p> : null}
          </section>

          <section className="analytics-section">
            <div className="analytics-section__heading">
              <h2 className="analytics-section__title">Fulfillment & money</h2>
              <span className="analytics-section__note">Net sales = gross sales − completed refunds (Phase 14 rule)</span>
            </div>
            <div className="admin-dashboard-charts">
              <div className="analytics-chart-card">
                <h3>Completed rate</h3>
                <p className="analytics-panel-figure">
                  {overview.transacted_orders > 0
                    ? `${((overview.completed_orders / overview.transacted_orders) * 100).toFixed(1)}%`
                    : '—'}
                </p>
                <p className="analytics-panel-note">
                  {fmtCount(overview.completed_orders)} completed out of {fmtCount(overview.transacted_orders)} transacted
                  {overview.cancelled_orders > 0 ? ` · ${fmtCount(overview.cancelled_orders)} cancelled` : ''}
                </p>
              </div>
              <div className="analytics-chart-card">
                <h3>Refunds this period</h3>
                <p className="analytics-panel-figure">{fmtMoney(overview.refund_value)}</p>
                <p className="analytics-panel-note">
                  {fmtCount(overview.refund_count)} completed refund{overview.refund_count === 1 ? '' : 's'}
                </p>
              </div>
              <div className="analytics-chart-card">
                <h3>Disputes</h3>
                <p className="analytics-panel-figure">{fmtCount(overview.open_disputes)} open</p>
                <p className="analytics-panel-note">
                  {fmtCount(overview.resolved_disputes)} resolved · all time
                </p>
              </div>
            </div>
          </section>

          <section className="analytics-section">
            <div className="analytics-section__heading">
              <h2 className="analytics-section__title">Top products</h2>
              <span className="analytics-section__note">by gross sales</span>
            </div>
            <div className="admin-dashboard-charts">
              <div className="analytics-chart-card">
                <AdminChartLegend items={[{ label: 'Gross sales', color: chartColorFor(0) }]} className="visually-hidden" />
                <AdminHBarChart
                  rows={topListings.map((row) => ({ label: row.listing_title, value: row.gross_sales }))}
                  formatValue={fmtMoney}
                  height={240}
                  ariaLabel={`Top products by gross sales for ${formatReportPeriod(state.start, state.end)}`}
                  ariaDescription="Products with the highest gross sales in the selected period."
                />
              </div>
            </div>
            {topListings.length === 0 ? <p className="analytics-chart__empty">No product sales in this period.</p> : null}
          </section>

          <section className="analytics-section">
            <div className="analytics-section__heading">
              <h2 className="analytics-section__title">Listing performance</h2>
              <div className="analytics-section__heading-actions">
                <label className="analytics-sort">
                  <span>Sort</span>
                  <select value={state.listings.sort} onChange={(e) => update({ listings: { ...state.listings, sort: e.target.value, page: 1 } })}>
                    <option value="views_desc">Most viewed</option>
                    <option value="favorites_desc">Most favorited</option>
                    <option value="inquiries_desc">Most inquired</option>
                    <option value="gross_sales_desc">Gross sales</option>
                    <option value="units_sold_desc">Units sold</option>
                    <option value="newest">Newest</option>
                    <option value="title_asc">Name</option>
                  </select>
                </label>
                <button type="button" className="btn btn--ghost btn--sm" onClick={exportListingsCsv} disabled={listings == null || listings.items.length === 0}>
                  CSV
                </button>
              </div>
            </div>
            {listings != null && listings.items.length > 0 ? (
              <>
                <div className="admin-resource-table">
                  <table>
                    <thead>
                      <tr>
                        <th>Listing</th>
                        <th>Status</th>
                        <th>Views</th>
                        <th>Favs</th>
                        <th>Inq.</th>
                        <th>Units</th>
                        <th>Sales</th>
                        <th>Rating</th>
                      </tr>
                    </thead>
                    <tbody>
                      {listings.items.map((row) => (
                        <tr key={row.listing_id}>
                          <td>
                            <Link to={`/seller/listings/${row.listing_id}`}>{row.listing_title}</Link>
                          </td>
                          <td className="admin-resource-table__badge-cell"><Badge variant={row.listing_status}>{row.listing_status}</Badge></td>
                          <td>{fmtCount(row.views)}</td>
                          <td>{fmtCount(row.favorites)}</td>
                          <td>{fmtCount(row.inquiries)}</td>
                          <td>{fmtCount(row.units_sold)}</td>
                          <td>{fmtMoney(row.gross_sales)}</td>
                          <td>{formatRating(row.avg_rating)} <span className="analytics-rating__count">({row.review_count})</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Pagination
                  page={listings.page}
                  totalPages={listings.totalPages}
                  onPageChange={(page) => update({ listings: { ...state.listings, page } })}
                />
              </>
            ) : (
              <p className="analytics-chart__empty">No listing activity in this period.</p>
            )}
          </section>
        </>
      )}

      {printSnapshot != null ? (
        <div className="print-only report-print">
          <ReportHeader
            title="Seller Performance Report"
            subtitle={`${sellerProfile.store_name}`}
            dateRange={formatReportPeriod(state.start, state.end)}
            generatedAt={printGeneratedAt ?? undefined}
            generatedBy={sellerProfile.store_name}
            filters={[`Bucket: ${state.bucket}`, state.compare ? 'Previous-period comparison on' : 'Previous-period comparison off']}
          />
          {kpiSections.map((section: SellerKpiSectionConfig) => (
            <PrintReportTable
              key={section.title}
              caption={section.title}
              columns={[{ key: 'label', label: 'Metric' }, { key: 'value', label: 'Value', numeric: true }]}
              rows={
                printSnapshot.overview != null
                  ? section.cards.map((card) => ({
                      label: card.label,
                      value: formatMetric(card.format, Number(printSnapshot.overview![card.valueKey] ?? 0)),
                    }))
                  : []
              }
            />
          ))}
          <PrintReportTable
            caption="Period activity"
            columns={[
              { key: 'period', label: 'Period' },
              { key: 'orders', label: 'Transacted orders', numeric: true },
              { key: 'units', label: 'Units sold', numeric: true },
              { key: 'gross', label: 'Gross sales', numeric: true },
              { key: 'net', label: 'Net sales', numeric: true },
              { key: 'reviews', label: 'Approved reviews', numeric: true },
            ]}
            rows={printSnapshot.series.map((row) => ({
              period: row.bucket_start,
              orders: row.transacted_orders,
              units: row.products_sold,
              gross: fmtMoney(row.gross_sales),
              net: fmtMoney(row.net_sales),
              reviews: row.approved_reviews,
            }))}
          />
          <PrintReportTable
            caption="Product performance"
            columns={[
              { key: 'listing', label: 'Listing' },
              { key: 'status', label: 'Status' },
              { key: 'views', label: 'Views', numeric: true },
              { key: 'units', label: 'Units sold', numeric: true },
              { key: 'gross', label: 'Gross sales', numeric: true },
            ]}
            rows={(printSnapshot.listings?.items ?? []).map((row) => ({
              listing: row.listing_title,
              status: row.listing_status,
              views: fmtCount(row.views),
              units: fmtCount(row.units_sold),
              gross: fmtMoney(row.gross_sales),
            }))}
            note={printSnapshot.topListings.length > 0 ? `Top products: ${printSnapshot.topListings.map((row) => row.listing_title).join(', ')}` : undefined}
          />
          <PrintReportTable
            caption="Rating distribution"
            columns={[{ key: 'stars', label: 'Stars' }, { key: 'count', label: 'Reviews', numeric: true }]}
            rows={[5, 4, 3, 2, 1]
              .map((stars) => ({ stars: `${stars} ★`, count: printSnapshot.distribution[stars] ?? 0 }))
              .filter((row) => row.count > 0)}
            note={`${printSnapshot.overview?.approved_reviews ?? 0} verified reviews · average ${formatRating(printSnapshot.overview?.avg_rating ?? null)}`}
          />
        </div>
      ) : null}
    </div>
  )
}