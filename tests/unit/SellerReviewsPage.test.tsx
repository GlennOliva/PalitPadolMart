import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { SellerContext, type SellerContextValue } from '../../src/features/seller/SellerProvider'
import SellerReviewsPage from '../../src/pages/seller/SellerReviewsPage'
import type { SellerReviewWithListing } from '../../src/features/reviews/reviews.types'
import { createSellerValue, makeSellerProfile } from '../utils/seller'

const mocks = vi.hoisted(() => ({
  getMySellerReviews: vi.fn(),
  getMySellerRatingSummary: vi.fn(),
  getMySellerRatingDistribution: vi.fn(),
}))

vi.mock('../../src/features/reviews/reviews.service', () => ({
  getMySellerReviews: mocks.getMySellerReviews,
  getMySellerRatingSummary: mocks.getMySellerRatingSummary,
  getMySellerRatingDistribution: mocks.getMySellerRatingDistribution,
  getListingReviewSummary: vi.fn(),
  getListingReviewDistribution: vi.fn(),
  fetchListingReviews: vi.fn(),
  fetchSellerReviews: vi.fn(),
  getSellerReviewSummary: vi.fn(),
  submitReview: vi.fn(),
  reviewErrorLabel: (code: string) => `ERR:${code}`,
}))

const review: SellerReviewWithListing = {
  id: 'rev-1',
  rating: 5,
  sellerRating: 4,
  comment: 'Great paddle. Very good condition and fast transaction.',
  createdAt: '2026-09-07T00:00:00.000Z',
  reviewerName: 'Juan Dela Cruz',
  reviewerAvatar: null,
  listingTitle: 'Selkirk Vanguard Power Air',
  listingId: 'list-1',
  listingImageUrl: null,
}

const review2: SellerReviewWithListing = {
  id: 'rev-2',
  rating: 4,
  sellerRating: 5,
  comment: 'Good quality and fast preparation.',
  createdAt: '2026-09-05T00:00:00.000Z',
  reviewerName: 'Maria Santos',
  reviewerAvatar: 'https://example.com/avatar.png',
  listingTitle: 'Franklin Pickleball Balls',
  listingId: 'list-2',
  listingImageUrl: 'https://example.com/product.png',
}

const activeSeller = createSellerValue({
  sellerProfile: makeSellerProfile({ seller_status: 'active' }),
})

function renderPage(value: SellerContextValue) {
  return render(
    <SellerContext.Provider value={value}>
      <MemoryRouter initialEntries={['/seller/reviews']}>
        <Routes>
          <Route path="/seller/reviews" element={<SellerReviewsPage />} />
          <Route path="/seller/dashboard" element={<div>DASHBOARD</div>} />
          <Route path="/marketplace/:listingId" element={<div>MARKETPLACE</div>} />
        </Routes>
      </MemoryRouter>
    </SellerContext.Provider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getMySellerRatingSummary.mockResolvedValue({
    data: { reviewCount: 2, averageRating: 4.5 },
    error: null,
  })
  mocks.getMySellerRatingDistribution.mockResolvedValue({
    data: { 5: 1, 4: 1, 3: 0, 2: 0, 1: 0 },
    error: null,
  })
  mocks.getMySellerReviews.mockResolvedValue({
    data: { reviews: [review, review2], hasMore: false },
    error: null,
  })
})

describe('SellerReviewsPage', () => {
  it('shows a loading state while reviews are being fetched', () => {
    mocks.getMySellerReviews.mockReturnValue(new Promise(() => undefined))
    mocks.getMySellerRatingSummary.mockReturnValue(new Promise(() => undefined))
    mocks.getMySellerRatingDistribution.mockReturnValue(new Promise(() => undefined))
    renderPage(activeSeller)
    expect(screen.getByText('Loading your reviews…')).toBeInTheDocument()
  })

  it('renders the rating summary with average and count', async () => {
    renderPage(activeSeller)
    expect(await screen.findByText('4.5')).toBeInTheDocument()
    expect(screen.getByText('2 verified reviews')).toBeInTheDocument()
    expect(screen.getByText('Overall Rating')).toBeInTheDocument()
  })

  it('renders customer reviews with name, product, rating, comment, and date', async () => {
    renderPage(activeSeller)
    expect(await screen.findByText('Juan Dela Cruz')).toBeInTheDocument()
    expect(screen.getByText('Selkirk Vanguard Power Air')).toBeInTheDocument()
    expect(screen.getByText(/Great paddle/)).toBeInTheDocument()
    expect(screen.getByText('Maria Santos')).toBeInTheDocument()
    expect(screen.getByText('Franklin Pickleball Balls')).toBeInTheDocument()
    expect(screen.getByText(/Good quality/)).toBeInTheDocument()
  })

  it('displays verified purchase for each review', async () => {
    renderPage(activeSeller)
    await screen.findByText('Juan Dela Cruz')
    const verifiedBadges = screen.getAllByText(/Verified purchase/)
    expect(verifiedBadges.length).toBeGreaterThanOrEqual(2)
  })

  it('displays the rating distribution breakdown', async () => {
    renderPage(activeSeller)
    expect(await screen.findByText('Rating Distribution')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: '1 review gave 5 stars' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: '1 review gave 4 stars' })).toBeInTheDocument()
  })

  it('does not display customer email', async () => {
    renderPage(activeSeller)
    await screen.findByText('Juan Dela Cruz')
    expect(screen.queryByText(/@/)).not.toBeInTheDocument()
  })

  it('does not display customer phone', async () => {
    renderPage(activeSeller)
    await screen.findByText('Juan Dela Cruz')
    expect(screen.queryByText(/\d{10,}/)).not.toBeInTheDocument()
  })

  it('links the product title to the marketplace listing', async () => {
    renderPage(activeSeller)
    const link = await screen.findByRole('link', { name: 'Selkirk Vanguard Power Air' })
    expect(link).toHaveAttribute('href', '/marketplace/list-1')
  })

  it('shows empty state when there are no reviews', async () => {
    mocks.getMySellerRatingSummary.mockResolvedValue({
      data: { reviewCount: 0, averageRating: null },
      error: null,
    })
    mocks.getMySellerRatingDistribution.mockResolvedValue({ data: {}, error: null })
    mocks.getMySellerReviews.mockResolvedValue({
      data: { reviews: [], hasMore: false },
      error: null,
    })
    renderPage(activeSeller)
    expect(await screen.findByText('No customer reviews yet')).toBeInTheDocument()
    expect(
      screen.getByText('Reviews from completed customer purchases will appear here.'),
    ).toBeInTheDocument()
  })

  it('shows an error state when the load fails', async () => {
    mocks.getMySellerRatingSummary.mockResolvedValue({
      data: null,
      error: { code: 'UNKNOWN', message: 'fail' },
    })
    renderPage(activeSeller)
    expect(await screen.findByText("We couldn't load your reviews right now.")).toBeInTheDocument()
  })

  it('shows a back to dashboard link', async () => {
    renderPage(activeSeller)
    const backLink = await screen.findByRole('link', { name: /Back to dashboard/i })
    expect(backLink).toHaveAttribute('href', '/seller/dashboard')
  })

  it('loads the next page when load more is clicked', async () => {
    mocks.getMySellerReviews
      .mockResolvedValueOnce({
        data: { reviews: [review], hasMore: true },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { reviews: [review2], hasMore: false },
        error: null,
      })

    renderPage(activeSeller)
    await screen.findByText('Juan Dela Cruz')

    fireEvent.click(screen.getByRole('button', { name: 'Load more reviews' }))

    await waitFor(() => expect(screen.getByText('Maria Santos')).toBeInTheDocument())
    expect(mocks.getMySellerReviews).toHaveBeenLastCalledWith(2, 10, null, 'newest')
  })

  it('sends rating filter to the service when filter changes', async () => {
    renderPage(activeSeller)
    await screen.findByText('Juan Dela Cruz')

    fireEvent.change(screen.getByLabelText('Filter'), { target: { value: '5' } })

    await waitFor(() =>
      expect(mocks.getMySellerReviews).toHaveBeenCalledWith(1, 10, 5, 'newest'),
    )
  })

  it('sends sort option to the service when sort changes', async () => {
    renderPage(activeSeller)
    await screen.findByText('Juan Dela Cruz')

    fireEvent.change(screen.getByLabelText('Sort'), { target: { value: 'highest' } })

    await waitFor(() =>
      expect(mocks.getMySellerReviews).toHaveBeenCalledWith(1, 10, null, 'highest'),
    )
  })

  it('does not render seller edit or delete controls', async () => {
    renderPage(activeSeller)
    await screen.findByText('Juan Dela Cruz')
    expect(screen.queryByRole('button', { name: /edit/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /delete/i })).not.toBeInTheDocument()
  })

  it('shows the seller review page heading', async () => {
    renderPage(activeSeller)
    expect(await screen.findByRole('heading', { name: 'Customer Reviews' })).toBeInTheDocument()
  })

  it('renders seller avatar fallback initial', async () => {
    renderPage(activeSeller)
    await screen.findByText('Juan Dela Cruz')
    const fallbacks = screen.getAllByText('J')
    expect(fallbacks.length).toBeGreaterThanOrEqual(1)
  })

  it('renders the reviewer avatar image when one exists', async () => {
    renderPage(activeSeller)
    await screen.findByText('Maria Santos')
    expect(screen.getByAltText('')).toHaveAttribute('src', 'https://example.com/avatar.png')
  })
})
