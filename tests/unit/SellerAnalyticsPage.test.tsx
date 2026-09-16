import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import SellerAnalyticsPage from '../../src/pages/seller/SellerAnalyticsPage'
import { createSellerValue, makeSellerProfile, renderWithSeller } from '../utils/seller'
import type {
  SellerAnalyticsOverviewRow,
  SellerAnalyticsTimeSeriesRow,
  SellerListingRankRow,
} from '../../src/features/admin/analytics/admin-analytics.types'
import type { AdminPage } from '../../src/features/admin/admin.types'

const { sellerAnalyticsMocks, reviewMocks } = vi.hoisted(() => ({
  sellerAnalyticsMocks: {
    getMySellerAnalyticsOverview: vi.fn(),
    getMySellerAnalyticsTimeSeries: vi.fn(),
    getMySellerAnalyticsListings: vi.fn(),
  },
  reviewMocks: {
    getMySellerRatingDistribution: vi.fn(),
  },
}))

vi.mock('../../src/features/seller/analytics/seller-analytics.service', () => ({
  getMySellerAnalyticsOverview: sellerAnalyticsMocks.getMySellerAnalyticsOverview,
  getMySellerAnalyticsTimeSeries: sellerAnalyticsMocks.getMySellerAnalyticsTimeSeries,
  getMySellerAnalyticsListings: sellerAnalyticsMocks.getMySellerAnalyticsListings,
}))

vi.mock('../../src/features/reviews/reviews.service', () => ({
  getMySellerRatingDistribution: reviewMocks.getMySellerRatingDistribution,
}))

const overviewRow: SellerAnalyticsOverviewRow = {
  total_listings: 5,
  active_listings: 3,
  draft_listings: 1,
  sold_listings: 1,
  new_listings: 1,
  transacted_orders: 2,
  completed_orders: 1,
  cancelled_orders: 0,
  disputed_orders: 0,
  products_sold: 3,
  gross_sales: 2400,
  net_sales: 2400,
  refund_count: 0,
  refund_value: 0,
  avg_order_value: 1200,
  listing_views: 80,
  unique_viewers: 25,
  favorites_count: 12,
  inquiries_count: 8,
  approved_reviews: 2,
  avg_rating: 4.5,
  open_disputes: 0,
  resolved_disputes: 0,
}

const seriesRows: SellerAnalyticsTimeSeriesRow[] = [
  {
    bucket_start: '2026-01-01',
    new_listings: 1,
    new_orders: 1,
    transacted_orders: 1,
    completed_orders: 1,
    cancelled_orders: 0,
    products_sold: 2,
    gross_sales: 2000,
    net_sales: 2000,
    refund_value: 0,
    listing_views: 40,
    favorites_count: 6,
    inquiries_count: 4,
    approved_reviews: 1,
  },
]

const listingPage: AdminPage<SellerListingRankRow> = {
  items: [
    {
      listing_id: 'l1',
      listing_title: 'Amped Paddle',
      listing_status: 'active',
      views: 40,
      favorites: 6,
      inquiries: 4,
      units_sold: 2,
      gross_sales: 2000,
      avg_rating: 4.5,
      review_count: 1,
    },
  ],
  page: 1,
  pageSize: 10,
  total: 1,
  totalPages: 1,
}

function renderPage(query = '') {
  const sellerProfile = makeSellerProfile({ seller_status: 'active' })
  return render(
    renderWithSeller(
      <MemoryRouter initialEntries={[`/seller/analytics?${query}`]}>
        <Routes>
          <Route path="/seller/analytics" element={<SellerAnalyticsPage />} />
          <Route path="/seller/listings/:listingId" element={<div>LISTING</div>} />
        </Routes>
      </MemoryRouter>,
      createSellerValue({ sellerProfile }),
    ),
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  sellerAnalyticsMocks.getMySellerAnalyticsOverview.mockResolvedValue({ data: overviewRow, error: null })
  sellerAnalyticsMocks.getMySellerAnalyticsTimeSeries.mockResolvedValue({ data: seriesRows, error: null })
  sellerAnalyticsMocks.getMySellerAnalyticsListings.mockResolvedValue({ data: listingPage, error: null })
  reviewMocks.getMySellerRatingDistribution.mockResolvedValue({ data: { 5: 1, 4: 1 }, error: null })
})

describe('SellerAnalyticsPage', () => {
  it('renders seller KPIs, trend, and listing performance', async () => {
    renderPage()
    expect(await screen.findByRole('heading', { name: 'Your analytics' })).toBeInTheDocument()
    expect(await screen.findAllByText('₱2,400.00')).not.toHaveLength(0)
    expect(screen.getByRole('heading', { name: 'Performance trends' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Listing performance' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Customer feedback' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Order status' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Top products' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Fulfillment & money' })).toBeInTheDocument()
    expect((await screen.findAllByText('Amped Paddle')).length).toBeGreaterThan(0)
  })

  it('calls only auth-derived seller RPCs with the selected range', async () => {
    renderPage('start=2026-01-01&end=2026-01-31')
    await screen.findByRole('heading', { name: 'Your analytics' })
    await screen.findAllByText('Amped Paddle')
    expect(sellerAnalyticsMocks.getMySellerAnalyticsOverview).toHaveBeenCalledWith('2026-01-01', '2026-01-31')
    expect(sellerAnalyticsMocks.getMySellerAnalyticsTimeSeries).toHaveBeenCalledWith('2026-01-01', '2026-01-31', 'month')
    const listingCall = sellerAnalyticsMocks.getMySellerAnalyticsListings.mock.calls[0][0]
    expect(listingCall.start).toBe('2026-01-01')
    expect(listingCall.end).toBe('2026-01-31')
    expect(listingCall.sort).toBe('views_desc')
  })

  it('shows an error alert when the overview fails', async () => {
    sellerAnalyticsMocks.getMySellerAnalyticsOverview.mockResolvedValue({
      data: null,
      error: { code: 'UNKNOWN', message: 'Something went wrong. Please try again.' },
    })
    renderPage()
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'We could not load your analytics. Please try again.',
    )
  })

  it('renders loading state when there is no seller profile', () => {
    render(
      renderWithSeller(
        <MemoryRouter>
          <SellerAnalyticsPage />
        </MemoryRouter>,
        createSellerValue({ sellerProfile: null }),
      ),
    )
    expect(screen.getByRole('status')).toBeInTheDocument()
  })
})