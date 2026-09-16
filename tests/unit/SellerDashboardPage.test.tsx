import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import SellerDashboardPage from '../../src/pages/seller/SellerDashboardPage'
import {
  getMySellerAnalyticsListings,
  getMySellerAnalyticsOverview,
  getMySellerAnalyticsTimeSeries,
} from '../../src/features/seller/analytics/seller-analytics.service'
import { getMySellerRatingDistribution } from '../../src/features/reviews/reviews.service'
import type { SellerAnalyticsOverviewRow } from '../../src/features/admin/analytics/admin-analytics.types'
import type { AdminError } from '../../src/features/admin/admin.types'
import { createSellerValue, makeSellerProfile, renderWithSeller } from '../utils/seller'

vi.mock('../../src/features/seller/analytics/seller-analytics.service', () => ({
  getMySellerAnalyticsOverview: vi.fn(),
  getMySellerAnalyticsTimeSeries: vi.fn(),
  getMySellerAnalyticsListings: vi.fn(),
}))

vi.mock('../../src/features/reviews/reviews.service', () => ({
  getMySellerRatingDistribution: vi.fn(),
  getMySellerRatingSummary: vi.fn(),
  getMySellerReviews: vi.fn(),
}))

const mockedOverview = vi.mocked(getMySellerAnalyticsOverview)
const mockedSeries = vi.mocked(getMySellerAnalyticsTimeSeries)
const mockedListings = vi.mocked(getMySellerAnalyticsListings)
const mockedDistribution = vi.mocked(getMySellerRatingDistribution)

const activeSeller = createSellerValue({
  sellerProfile: makeSellerProfile({ seller_status: 'active' }),
})

function makeOverview(overrides: Partial<SellerAnalyticsOverviewRow> = {}): SellerAnalyticsOverviewRow {
  return {
    total_listings: 10,
    active_listings: 5,
    draft_listings: 2,
    sold_listings: 3,
    new_listings: 1,
    listing_views: 100,
    unique_viewers: 40,
    favorites_count: 12,
    inquiries_count: 8,
    transacted_orders: 20,
    completed_orders: 15,
    cancelled_orders: 2,
    disputed_orders: 1,
    products_sold: 30,
    gross_sales: 15000,
    net_sales: 14000,
    refund_count: 2,
    refund_value: 1000,
    avg_order_value: 750,
    approved_reviews: 3,
    avg_rating: 4.6666666667,
    open_disputes: 1,
    resolved_disputes: 2,
    ...overrides,
  }
}

function renderDashboard() {
  return render(
    renderWithSeller(
      <MemoryRouter initialEntries={['/seller/dashboard']}>
        <Routes>
          <Route path="/seller/dashboard" element={<SellerDashboardPage />} />
          <Route path="/seller/reviews" element={<div>REVIEWS PAGE</div>} />
          <Route path="/seller/profile" element={<div>PROFILE PAGE</div>} />
          <Route path="/sellers/:sellerId" element={<div>PUBLIC PROFILE PAGE</div>} />
          <Route path="/dashboard" element={<div>MAIN DASHBOARD</div>} />
        </Routes>
      </MemoryRouter>,
      activeSeller,
    ),
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedOverview.mockResolvedValue({ data: makeOverview(), error: null })
  mockedSeries.mockResolvedValue({ data: [], error: null })
  mockedListings.mockResolvedValue({ data: { items: [], page: 1, pageSize: 5, total: 0, totalPages: 0 }, error: null })
  mockedDistribution.mockResolvedValue({ data: { 5: 2, 4: 1 }, error: null })
})

describe('SellerDashboardPage', () => {
  it('shows a loading state while analytics are being fetched', async () => {
    mockedOverview.mockReturnValue(new Promise(() => undefined))
    renderDashboard()
    expect(screen.getByText('Loading your store summary…')).toBeInTheDocument()
    expect(screen.queryByText('No reviews yet.')).not.toBeInTheDocument()
  })

  it('shows the review summary with the real count and average rating', async () => {
    renderDashboard()
    expect(await screen.findByText('3 verified reviews · all time')).toBeInTheDocument()
    expect(screen.getAllByText('4.7').length).toBeGreaterThan(0)
    expect(screen.queryByText('No reviews yet.')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /View all reviews/i })).toHaveAttribute('href', '/seller/reviews')
  })

  it('does not flash empty copy while the rating average is absent but reviews exist', async () => {
    mockedOverview.mockResolvedValue({
      data: makeOverview({ approved_reviews: 3, avg_rating: 0 }),
      error: null,
    })
    renderDashboard()
    expect(await screen.findByText('3 verified reviews · all time')).toBeInTheDocument()
    expect(screen.queryByText('No reviews yet.')).not.toBeInTheDocument()
  })

  it('shows the empty state only when the trusted review count is zero', async () => {
    mockedOverview.mockResolvedValue({ data: makeOverview({ approved_reviews: 0, avg_rating: 0 }), error: null })
    renderDashboard()
    expect(await screen.findByText('No reviews yet.')).toBeInTheDocument()
    expect(screen.queryByText('4.7')).not.toBeInTheDocument()
  })

  it('renders KPI cards and currency from the overview', async () => {
    renderDashboard()
    expect((await screen.findAllByText('Gross sales')).length).toBeGreaterThan(0)
    expect(screen.getByText('₱15,000.00')).toBeInTheDocument()
    expect(screen.getByText('₱14,000.00')).toBeInTheDocument()
    expect(screen.getByText('Active listings · All time')).toBeInTheDocument()
  })

  it('shows a friendly error with a retry action and never empty copy', async () => {
    mockedOverview.mockResolvedValue({ data: null, error: { code: 'FORBIDDEN', message: 'Forbidden' } as AdminError })
    renderDashboard()
    expect(await screen.findByText(/We could not load your dashboard/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Retry/i })).toBeInTheDocument()
    expect(screen.queryByText('No reviews yet.')).not.toBeInTheDocument()
  })

  it('links to the customer reviews page', async () => {
    renderDashboard()
    expect(
      await screen.findByRole('link', { name: /Customer reviews/i }),
    ).toHaveAttribute('href', '/seller/reviews')
  })

  it('shows order status and customer interest distributions', async () => {
    renderDashboard()
    expect(await screen.findByRole('heading', { name: 'Order status' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Customer interest' })).toBeInTheDocument()
    expect(screen.getAllByText('Transacted orders').length).toBeGreaterThan(0)
  })

  it('shows data-backed action items for drafts, disputes, and inquiries', async () => {
    renderDashboard()
    expect(await screen.findByRole('heading', { name: 'Action items' })).toBeInTheDocument()
    expect(screen.getByText('2 draft listings')).toBeInTheDocument()
    expect(screen.getByText('1 open dispute')).toBeInTheDocument()
    expect(screen.getByText('8 new inquiries')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /draft listings/i })).toHaveAttribute('href', '/seller/listings?status=draft')
    expect(screen.getByRole('link', { name: /open dispute/i })).toHaveAttribute('href', '/seller/disputes')
  })

  it('shows a positive store-health summary when there are no action items', async () => {
    mockedOverview.mockResolvedValue({
      data: makeOverview({ draft_listings: 0, open_disputes: 0, inquiries_count: 0, active_listings: 5 }),
      error: null,
    })
    renderDashboard()
    expect(await screen.findByRole('heading', { name: 'Action items' })).toBeInTheDocument()
    expect(screen.getByText('Store is in good shape')).toBeInTheDocument()
    expect(screen.queryByText('2 draft listings')).not.toBeInTheDocument()
  })
})