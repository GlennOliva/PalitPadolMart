import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import SellerDashboardPage from '../../src/pages/seller/SellerDashboardPage'
import { getSellerDashboardSummary } from '../../src/features/seller/seller.service'
import type { SellerContextValue } from '../../src/features/seller/SellerProvider'
import type { SellerDashboardSummary } from '../../src/features/seller/seller.types'
import { createSellerValue, makePostgrestError, makeSellerProfile, renderWithSeller } from '../utils/seller'

vi.mock('../../src/features/seller/seller.service', () => ({
  getSellerDashboardSummary: vi.fn(),
  getMySellerProfile: vi.fn(),
}))

const mockedSummary = vi.mocked(getSellerDashboardSummary)

function renderDashboard(value: SellerContextValue) {
  return render(
    renderWithSeller(
      <MemoryRouter initialEntries={['/seller/dashboard']}>
        <Routes>
          <Route path="/seller/dashboard" element={<SellerDashboardPage />} />
          <Route path="/seller/profile" element={<div>PROFILE PAGE</div>} />
          <Route path="/sellers/:sellerId" element={<div>PUBLIC PROFILE PAGE</div>} />
          <Route path="/dashboard" element={<div>MAIN DASHBOARD</div>} />
        </Routes>
      </MemoryRouter>,
      value,
    ),
  )
}

const activeSeller = createSellerValue({
  sellerProfile: makeSellerProfile({ seller_status: 'active' }),
})

const zeroSummary: SellerDashboardSummary = {
  activeListings: 0,
  draftListings: 0,
  soldListings: 0,
  pendingOrders: 0,
  completedOrders: 0,
  completedSalesValue: 0,
  approvedReviews: 0,
  averageRating: null,
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('SellerDashboardPage', () => {
  it('shows a loading state while the summary is being fetched', () => {
    mockedSummary.mockReturnValue(new Promise(() => undefined))
    renderDashboard(activeSeller)
    expect(screen.getByText('Loading your store summary…')).toBeInTheDocument()
  })

  it('renders the store summary with the seller profile', async () => {
    mockedSummary.mockResolvedValue({ data: zeroSummary, error: null })
    renderDashboard(activeSeller)

    expect(
      await screen.findByRole('heading', { name: /Seller Dashboard/i }),
    ).toBeInTheDocument()
    expect(screen.getByText('Ace Paddles PH')).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: /Edit seller profile/i }),
    ).toBeInTheDocument()
  })

  it('links to the customer reviews page', async () => {
    mockedSummary.mockResolvedValue({ data: zeroSummary, error: null })
    renderDashboard(activeSeller)

    expect(
      await screen.findByRole('link', { name: /Customer reviews/i }),
    ).toHaveAttribute('href', '/seller/reviews')
  })

  it('shows zero-state copy when there is nothing to report', async () => {
    mockedSummary.mockResolvedValue({ data: zeroSummary, error: null })
    renderDashboard(activeSeller)

    expect(await screen.findByText(/No active listings yet/)).toBeInTheDocument()
    expect(screen.getByText('No reviews yet.')).toBeInTheDocument()
    expect(screen.getByText('No ratings yet.')).toBeInTheDocument()
    expect(screen.getByText('₱0.00')).toBeInTheDocument()
  })

  it('renders real counts and currency when data exists', async () => {
    mockedSummary.mockResolvedValue({
      data: {
        activeListings: 3,
        draftListings: 1,
        soldListings: 2,
        pendingOrders: 4,
        completedOrders: 5,
        completedSalesValue: 1500,
        approvedReviews: 7,
        averageRating: 4.5,
      },
      error: null,
    })
    renderDashboard(activeSeller)

    expect(await screen.findByText('3')).toBeInTheDocument()
    expect(screen.getByText('4.5')).toBeInTheDocument()
    expect(screen.getByText('₱1,500.00')).toBeInTheDocument()
  })

  it('shows an error banner when the summary fetch fails', async () => {
    mockedSummary.mockResolvedValue({ data: null, error: makePostgrestError('boom') })
    renderDashboard(activeSeller)

    expect(
      await screen.findByText(/We could not load your seller dashboard/),
    ).toBeInTheDocument()
  })
})
