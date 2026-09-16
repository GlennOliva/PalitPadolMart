import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import AdminDashboardPage from '../../src/pages/admin/AdminDashboardPage'
import type { AdminSummaryRow } from '../../src/features/admin/admin.types'
import type {
  AdminAnalyticsOverviewRow,
  AdminAnalyticsTimeSeriesRow,
  AdminCategoryRankRow,
  AdminTopListingRow,
  AdminTopSellerRow,
} from '../../src/features/admin/analytics/admin-analytics.types'
import type { AdminPage } from '../../src/features/admin/admin.types'

const { dashboardMocks } = vi.hoisted(() => ({
  dashboardMocks: {
    getAdminSummary: vi.fn(),
    getAdminAnalyticsOverview: vi.fn(),
    getAdminAnalyticsTimeSeries: vi.fn(),
    getAdminCategoryRanking: vi.fn(),
    getAdminTopListings: vi.fn(),
    getAdminTopSellers: vi.fn(),
    getAdminDistributionSnapshots: vi.fn(),
  },
}))

vi.mock('../../src/features/admin/admin-dashboard.service', () => ({
  getAdminSummary: dashboardMocks.getAdminSummary,
}))

vi.mock('../../src/features/admin/analytics/admin-analytics.service', () => ({
  getAdminAnalyticsOverview: dashboardMocks.getAdminAnalyticsOverview,
  getAdminAnalyticsTimeSeries: dashboardMocks.getAdminAnalyticsTimeSeries,
  getAdminCategoryRanking: dashboardMocks.getAdminCategoryRanking,
  getAdminTopListings: dashboardMocks.getAdminTopListings,
  getAdminTopSellers: dashboardMocks.getAdminTopSellers,
}))

vi.mock('../../src/features/admin/analytics/admin-distributions.service', () => ({
  getAdminDistributionSnapshots: dashboardMocks.getAdminDistributionSnapshots,
}))

const summaryRow: AdminSummaryRow = {
  total_users: 10,
  active_users: 5,
  suspended_users: 1,
  active_sellers: 2,
  pending_sellers: 1,
  active_listings: 6,
  removed_listings: 0,
  open_orders: 3,
  completed_orders: 3,
  disputed_orders: 0,
  payments_awaiting_review: 2,
  pending_reports: 1,
  reports_under_review: 0,
  approved_reviews: 6,
  hidden_reviews: 0,
  open_disputes: 1,
  disputes_under_review: 0,
  active_refund_requests: 1,
}

const overviewRow: AdminAnalyticsOverviewRow = {
  registered_users: 10,
  active_users: 5,
  active_sellers: 2,
  total_listings: 8,
  active_listings: 6,
  sold_listings: 1,
  pending_sellers: 1,
  suspended_users: 1,
  total_sellers: 3,
  new_users: 3,
  new_sellers: 1,
  new_listings: 2,
  transacted_orders: 4,
  completed_orders: 3,
  cancelled_orders: 1,
  disputed_orders: 0,
  products_sold: 5,
  gross_sales: 4000,
  net_sales: 3900,
  refund_value: 100,
  refund_count: 1,
  avg_order_value: 1000,
  conversion_rate: 2.5,
  listing_views: 120,
  unique_viewers: 40,
  favorites_count: 25,
  inquiries_count: 18,
  approved_reviews: 6,
  avg_rating: 4.6,
  open_disputes: 1,
  resolved_disputes: 2,
  open_reports: 1,
  resolved_reports: 2,
  dismissed_reports: 1,
}

const seriesRows: AdminAnalyticsTimeSeriesRow[] = [
  {
    bucket_start: '2026-01-01',
    new_users: 1,
    new_sellers: 0,
    new_listings: 1,
    new_orders: 2,
    transacted_orders: 2,
    completed_orders: 1,
    cancelled_orders: 0,
    products_sold: 3,
    gross_sales: 2500,
    net_sales: 2500,
    refund_value: 0,
    listing_views: 60,
    favorites_count: 10,
    inquiries_count: 6,
    approved_reviews: 2,
  },
]

const categoryPage: AdminPage<AdminCategoryRankRow> = {
  items: [{ category_id: 'c1', category_name: 'Paddles', active_listings: 3, units_sold: 4, gross_sales: 3200 }],
  page: 1,
  pageSize: 5,
  total: 1,
  totalPages: 1,
}

const listingPage: AdminPage<AdminTopListingRow> = {
  items: [
    {
      listing_id: 'l1',
      listing_title: 'Amped Paddle',
      listing_status: 'active',
      store_name: 'Ace Paddles PH',
      category_name: 'Paddles',
      views: 40,
      favorites: 5,
      inquiries: 3,
      units_sold: 2,
      gross_sales: 1600,
      avg_rating: 4.5,
      review_count: 2,
    },
  ],
  page: 1,
  pageSize: 5,
  total: 1,
  totalPages: 1,
}

const sellerPage: AdminPage<AdminTopSellerRow> = {
  items: [
    {
      seller_id: 's1',
      store_name: 'Ace Paddles PH',
      seller_status: 'active',
      active_listings: 3,
      units_sold: 2,
      gross_sales: 1600,
      transacted_orders: 2,
      completed_orders: 1,
      avg_rating: 4.5,
      review_count: 2,
    },
  ],
  page: 1,
  pageSize: 5,
  total: 1,
  totalPages: 1,
}

function renderPage(query = '') {
  return render(
    <MemoryRouter initialEntries={[`/admin?${query}`]}>
      <Routes>
        <Route path="/admin" element={<AdminDashboardPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  dashboardMocks.getAdminSummary.mockResolvedValue({ data: summaryRow, error: null })
  dashboardMocks.getAdminAnalyticsOverview.mockResolvedValue({ data: overviewRow, error: null })
  dashboardMocks.getAdminAnalyticsTimeSeries.mockResolvedValue({ data: seriesRows, error: null })
  dashboardMocks.getAdminCategoryRanking.mockResolvedValue({ data: categoryPage, error: null })
  dashboardMocks.getAdminTopListings.mockResolvedValue({ data: listingPage, error: null })
  dashboardMocks.getAdminTopSellers.mockResolvedValue({ data: sellerPage, error: null })
  dashboardMocks.getAdminDistributionSnapshots.mockResolvedValue({
    orders: [{ label: 'Completed', key: 'completed', count: 3 }],
    payments: [{ label: 'Paid', key: 'paid', count: 3 }],
    disputes: [{ label: 'Open', key: 'open', count: 1 }],
    refunds: [{ label: 'Requested', key: 'requested', count: 1 }],
    reviews: [{ label: '5 stars', key: '5', count: 4 }],
    totals: { orders: 3, payments: 3, disputes: 1, refunds: 1, reviews: 4 },
  })
})

describe('AdminDashboardPage', () => {
  it('renders KPIs, data-viz sections, distribution charts, and operational queues', async () => {
    renderPage()
    expect(await screen.findByRole('heading', { name: 'Administration' })).toBeInTheDocument()
    expect((await screen.findAllByText('₱4,000.00')).length).toBeGreaterThan(0)
    expect(screen.getByRole('heading', { name: 'Performance' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Performance trends' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Top sellers & categories' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Marketplace status' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Operational queues' })).toBeInTheDocument()
    await screen.findByText('Payments awaiting review')
    expect(dashboardMocks.getAdminSummary).toHaveBeenCalledTimes(1)
  })

  it('loads every RPC with the selected date range', async () => {
    renderPage('start=2026-01-01&end=2026-01-31')
    await screen.findByRole('heading', { name: 'Performance' })
    expect(dashboardMocks.getAdminAnalyticsOverview).toHaveBeenCalledWith('2026-01-01', '2026-01-31')
    expect(dashboardMocks.getAdminAnalyticsTimeSeries).toHaveBeenCalledWith('2026-01-01', '2026-01-31', 'day')
  })

  it('prepares and prints the executive report with the full filtered dataset', async () => {
    const printSpy = vi.fn()
    Object.defineProperty(window, 'print', { value: printSpy, configurable: true, writable: true })
    renderPage('start=2026-01-01&end=2026-01-31')
    await screen.findByRole('heading', { name: 'Performance' })
    const button = screen.getByRole('button', { name: 'Print Executive Report' })
    button.click()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(printSpy).toHaveBeenCalledTimes(1)
  })

  it('shows an error alert when the summary query fails', async () => {
    dashboardMocks.getAdminSummary.mockResolvedValue({
      data: null,
      error: { code: 'FORBIDDEN', message: 'You do not have permission to perform this administrative action.' },
    })
    renderPage()
    expect(await screen.findByRole('alert')).toHaveTextContent('permission')
  })
})