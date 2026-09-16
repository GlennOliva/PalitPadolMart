import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import DashboardPage from '../../src/pages/DashboardPage'
import AdminDashboardPage from '../../src/pages/admin/AdminDashboardPage'
import AdminPageState from '../../src/components/admin/AdminPageState'
import type { AdminSummaryRow } from '../../src/features/admin/admin.types'
import { createAuthValue, makeProfile, makeUser, renderWithAuth } from '../utils/auth'
import { createSellerValue, renderWithSeller } from '../utils/seller'

const { dashboardMocks } = vi.hoisted(() => ({
  dashboardMocks: {
    getAdminSummary: vi.fn(),
    getAdminAnalyticsOverview: vi.fn(),
    getAdminAnalyticsTimeSeries: vi.fn(),
    getAdminCategoryRanking: vi.fn(),
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
  getAdminTopListings: () => Promise.resolve({ data: { items: [], page: 1, pageSize: 5, total: 0, totalPages: 0 }, error: null }),
  getAdminTopSellers: dashboardMocks.getAdminTopSellers,
}))

vi.mock('../../src/features/admin/analytics/admin-distributions.service', () => ({
  getAdminDistributionSnapshots: dashboardMocks.getAdminDistributionSnapshots,
}))

function renderAccountDashboard(role: 'admin' | 'customer') {
  render(
    renderWithAuth(
      renderWithSeller(
        <MemoryRouter>
          <DashboardPage />
        </MemoryRouter>,
        createSellerValue(),
      ),
      createAuthValue({
        status: 'authenticated',
        isAuthenticated: true,
        user: makeUser(),
        profile: makeProfile({}, role),
      }),
    ),
  )
}

const zeroSummary: AdminSummaryRow = {
  total_users: 0,
  active_users: 0,
  suspended_users: 0,
  pending_sellers: 0,
  active_sellers: 0,
  active_listings: 0,
  removed_listings: 0,
  pending_reports: 0,
  reports_under_review: 0,
  approved_reviews: 0,
  hidden_reviews: 0,
  open_orders: 0,
  completed_orders: 0,
  disputed_orders: 0,
  payments_awaiting_review: 0,
  open_disputes: 0,
  disputes_under_review: 0,
  active_refund_requests: 0,
}

beforeEach(() => {
  vi.clearAllMocks()
  dashboardMocks.getAdminAnalyticsOverview.mockResolvedValue({
    data: {
      registered_users: 0, active_users: 0, active_sellers: 0, total_listings: 0, active_listings: 0,
      sold_listings: 0, pending_sellers: 0, suspended_users: 0, total_sellers: 0, new_users: 0,
      new_sellers: 0, new_listings: 0, transacted_orders: 0, completed_orders: 0, cancelled_orders: 0,
      disputed_orders: 0, products_sold: 0, gross_sales: 0, net_sales: 0, refund_value: 0, refund_count: 0,
      avg_order_value: 0, conversion_rate: 0, listing_views: 0, unique_viewers: 0, favorites_count: 0,
      inquiries_count: 0, approved_reviews: 0, avg_rating: 0, open_disputes: 0, resolved_disputes: 0,
      open_reports: 0, resolved_reports: 0, dismissed_reports: 0,
    },
    error: null,
  })
  dashboardMocks.getAdminAnalyticsTimeSeries.mockResolvedValue({ data: [], error: null })
  dashboardMocks.getAdminCategoryRanking.mockResolvedValue({ data: { items: [], page: 1, pageSize: 5, total: 0, totalPages: 0 }, error: null })
  dashboardMocks.getAdminTopSellers.mockResolvedValue({ data: { items: [], page: 1, pageSize: 5, total: 0, totalPages: 0 }, error: null })
  dashboardMocks.getAdminDistributionSnapshots.mockResolvedValue(null)
})

describe('admin dashboard shell links', () => {
  it('links admins from their account dashboard to the administration shell', () => {
    renderAccountDashboard('admin')

    expect(screen.getByRole('link', { name: /Admin tools/i })).toHaveAttribute('href', '/admin')
  })

  it('does not expose the account dashboard admin link to customers', () => {
    renderAccountDashboard('customer')

    expect(screen.queryByRole('link', { name: /Admin tools/i })).not.toBeInTheDocument()
  })

  it('shows a loading state while the summary is being fetched', () => {
    dashboardMocks.getAdminSummary.mockReturnValue(new Promise(() => undefined))
    render(
      <MemoryRouter>
        <AdminDashboardPage />
      </MemoryRouter>,
    )

    expect(screen.getByRole('status', { name: 'Loading marketplace summary...' })).toBeInTheDocument()
  })

  it('renders the live summary into linked stat cards', async () => {
    dashboardMocks.getAdminSummary.mockResolvedValue({
      data: { ...zeroSummary, total_users: 42, active_sellers: 7, pending_sellers: 3 },
      error: null,
    })
    render(
      <MemoryRouter>
        <AdminDashboardPage />
      </MemoryRouter>,
    )

    expect(screen.getByRole('heading', { name: 'Administration' })).toBeInTheDocument()
    expect(await screen.findByText('42')).toBeInTheDocument()
    expect(screen.getByText('7')).toBeInTheDocument()
    expect(screen.getByText('Total users')).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: /Total users/i }),
    ).toHaveAttribute('href', '/admin/users')
    expect(
      screen.getByRole('link', { name: /Active sellers/i }),
    ).toHaveAttribute('href', '/admin/sellers?status=active')
    expect(
      screen.getByRole('link', { name: /Pending sellers/i }),
    ).toHaveAttribute('href', '/admin/sellers?status=pending')
  })

  it('shows an error banner when the summary fetch fails', async () => {
    dashboardMocks.getAdminSummary.mockResolvedValue({
      data: null,
      error: { code: 'FORBIDDEN', message: 'You do not have permission to perform this administrative action.' },
    })
    render(
      <MemoryRouter>
        <AdminDashboardPage />
      </MemoryRouter>,
    )

    expect(
      await screen.findByText(
        'You do not have permission to perform this administrative action.',
      ),
    ).toBeInTheDocument()
  })

  it('renders a shared data-free state for reserved resource routes', () => {
    render(<AdminPageState title="Users" />)

    expect(screen.getByRole('heading', { name: 'Users' })).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'No administrative actions are connected yet' }),
    ).toBeInTheDocument()
  })
})