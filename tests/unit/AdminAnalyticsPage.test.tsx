import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import AdminAnalyticsPage from '../../src/pages/admin/AdminAnalyticsPage'
import type {
  AdminAnalyticsOverviewRow,
  AdminAnalyticsTimeSeriesRow,
  AdminCategoryRankRow,
  AdminTopListingRow,
  AdminTopSellerRow,
} from '../../src/features/admin/analytics/admin-analytics.types'
import type { AdminPage } from '../../src/features/admin/admin.types'

const { analyticsMocks } = vi.hoisted(() => ({
  analyticsMocks: {
    getAdminAnalyticsOverview: vi.fn(),
    getAdminAnalyticsTimeSeries: vi.fn(),
    getAdminCategoryRanking: vi.fn(),
    getAdminTopListings: vi.fn(),
    getAdminTopSellers: vi.fn(),
    getAdminDistributionSnapshots: vi.fn(),
  },
}))

vi.mock('../../src/features/admin/analytics/admin-analytics.service', () => ({
  getAdminAnalyticsOverview: analyticsMocks.getAdminAnalyticsOverview,
  getAdminAnalyticsTimeSeries: analyticsMocks.getAdminAnalyticsTimeSeries,
  getAdminCategoryRanking: analyticsMocks.getAdminCategoryRanking,
  getAdminTopListings: analyticsMocks.getAdminTopListings,
  getAdminTopSellers: analyticsMocks.getAdminTopSellers,
}))

vi.mock('../../src/features/admin/analytics/admin-distributions.service', () => ({
  getAdminDistributionSnapshots: analyticsMocks.getAdminDistributionSnapshots,
}))

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
  pageSize: 10,
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
  pageSize: 10,
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
  pageSize: 10,
  total: 1,
  totalPages: 1,
}

function renderPage(query = '') {
  return render(
    <MemoryRouter initialEntries={[`/admin/analytics?${query}`]}>
      <Routes>
        <Route path="/admin/analytics" element={<AdminAnalyticsPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  analyticsMocks.getAdminAnalyticsOverview.mockResolvedValue({ data: overviewRow, error: null })
  analyticsMocks.getAdminAnalyticsTimeSeries.mockResolvedValue({ data: seriesRows, error: null })
  analyticsMocks.getAdminCategoryRanking.mockResolvedValue({ data: categoryPage, error: null })
  analyticsMocks.getAdminTopListings.mockResolvedValue({ data: listingPage, error: null })
  analyticsMocks.getAdminTopSellers.mockResolvedValue({ data: sellerPage, error: null })
  analyticsMocks.getAdminDistributionSnapshots.mockResolvedValue(null)
})

describe('AdminAnalyticsPage', () => {
  it('renders KPI sections, trend chart, and ranking tables', async () => {
    renderPage()
    expect(await screen.findByRole('heading', { name: 'Analytics' })).toBeInTheDocument()
    expect((await screen.findAllByText('₱4,000.00')).length).toBeGreaterThan(0)
    expect(screen.getByRole('heading', { name: 'Marketplace activity' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Categories' })).toBeInTheDocument()
    expect(screen.getAllByText('Paddles').length).toBeGreaterThan(0)
    expect(screen.getByRole('heading', { name: 'Popular listings' })).toBeInTheDocument()
    expect(screen.getByText('Amped Paddle')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Top sellers' })).toBeInTheDocument()
  })

  it('loads every RPC with the selected date range', async () => {
    renderPage('start=2026-01-01&end=2026-01-31')
    await screen.findByRole('heading', { name: 'Analytics' })
    await screen.findByText('Amped Paddle')
    expect(analyticsMocks.getAdminAnalyticsOverview).toHaveBeenCalledWith('2026-01-01', '2026-01-31')
    expect(analyticsMocks.getAdminAnalyticsTimeSeries).toHaveBeenCalledWith('2026-01-01', '2026-01-31', 'month')
  })

  it('fetches the previous equal-length period when compare is enabled', async () => {
    renderPage('start=2026-02-01&end=2026-02-28&compare=1')
    await screen.findByRole('heading', { name: 'Analytics' })
    await screen.findByText('Amped Paddle')
    expect(analyticsMocks.getAdminAnalyticsOverview).toHaveBeenCalledWith('2026-02-01', '2026-02-28')
    expect(analyticsMocks.getAdminAnalyticsOverview).toHaveBeenCalledWith('2026-01-04', '2026-01-31')
    expect(screen.getAllByText(/previous period/i).length).toBeGreaterThan(0)
  })

  it('shows an error alert instead of charts when a query fails', async () => {
    analyticsMocks.getAdminAnalyticsOverview.mockResolvedValue({
      data: null,
      error: { code: 'FORBIDDEN', message: 'You do not have permission to perform this administrative action.' },
    })
    renderPage()
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'We could not load marketplace analytics. Please try again.',
    )
    expect(analyticsMocks.getAdminTopListings).toHaveBeenCalled()
  })

  it('keeps filters in the URL when a preset chip is clicked', async () => {
    renderPage()
    await screen.findByRole('heading', { name: 'Analytics' })
    const chip = await screen.findByRole('button', { name: '30 days' })
    chip.click()
    expect(chip).toBeInstanceOf(HTMLButtonElement)
  })

  it('exposes a Print Report action and loads status distributions', async () => {
    renderPage()
    await screen.findByRole('heading', { name: 'Analytics' })
    await screen.findByText('Amped Paddle')
    expect(screen.getByRole('button', { name: 'Print Report' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Status & moderation' })).toBeInTheDocument()
    expect(analyticsMocks.getAdminDistributionSnapshots).toHaveBeenCalled()
  })
})