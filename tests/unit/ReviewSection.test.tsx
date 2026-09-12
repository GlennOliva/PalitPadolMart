import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import ReviewSection from '../../src/components/reviews/ReviewSection'
import type { ReviewWithAuthor } from '../../src/features/reviews/reviews.types'

const mocks = vi.hoisted(() => ({
  getListingReviewSummary: vi.fn(),
  getListingReviewDistribution: vi.fn(),
  fetchListingReviews: vi.fn(),
  fetchSellerReviews: vi.fn(),
  getSellerReviewSummary: vi.fn(),
}))

vi.mock('../../src/features/reviews/reviews.service', () => ({
  getListingReviewSummary: mocks.getListingReviewSummary,
  getListingReviewDistribution: mocks.getListingReviewDistribution,
  fetchListingReviews: mocks.fetchListingReviews,
  fetchSellerReviews: mocks.fetchSellerReviews,
  getSellerReviewSummary: mocks.getSellerReviewSummary,
  reviewErrorLabel: (code: string) => `ERR:${code}`,
  submitReview: vi.fn(),
}))

const review: ReviewWithAuthor = {
  id: 'rev-1',
  rating: 5,
  sellerRating: 4,
  comment: 'Love it',
  createdAt: '2026-09-01T00:00:00.000Z',
  reviewerName: 'Ana Test',
  reviewerAvatar: null,
  listingTitle: null,
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getListingReviewSummary.mockResolvedValue({
    data: { reviewCount: 1, averageRating: 5 },
    error: null,
  })
  mocks.getListingReviewDistribution.mockResolvedValue({ data: { 5: 1 }, error: null })
  mocks.fetchListingReviews.mockResolvedValue({
    data: { reviews: [review], hasMore: false },
    error: null,
  })
})

describe('ReviewSection', () => {
  it('renders the aggregate, distribution, and review cards', async () => {
    render(<ReviewSection listingId="list-1" />)
    expect(await screen.findByText('5.0 / 5 · 1 review')).toBeInTheDocument()
    expect(screen.getByText('Ana Test')).toBeInTheDocument()
    expect(screen.getByText('Love it')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: '1 review gave 5 stars' })).toBeInTheDocument()
  })

  it('shows an empty state when there are no reviews', async () => {
    mocks.getListingReviewSummary.mockResolvedValue({
      data: { reviewCount: 0, averageRating: null },
      error: null,
    })
    mocks.getListingReviewDistribution.mockResolvedValue({ data: {}, error: null })
    mocks.fetchListingReviews.mockResolvedValue({ data: { reviews: [], hasMore: false }, error: null })

    render(<ReviewSection listingId="list-1" />)

    expect((await screen.findAllByText('No reviews yet')).length).toBeGreaterThanOrEqual(1)
  })

  it('shows an error with retry when the load fails', async () => {
    mocks.getListingReviewSummary.mockResolvedValue({ data: null, error: { code: 'UNKNOWN', message: 'no' } })

    render(<ReviewSection listingId="list-1" />)

    expect(await screen.findByText('We could not load the reviews. Please try again.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })

  it('loads the next page and appends reviews', async () => {
    mocks.fetchListingReviews
      .mockResolvedValueOnce({
        data: { reviews: [review], hasMore: true },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          reviews: [{ ...review, id: 'rev-2', reviewerName: 'Berto Test', comment: 'Solid' }],
          hasMore: false,
        },
        error: null,
      })

    render(<ReviewSection listingId="list-1" />)
    await screen.findByText('Ana Test')

    fireEvent.click(screen.getByRole('button', { name: 'Load more reviews' }))

    await waitFor(() => expect(screen.getByText('Berto Test')).toBeInTheDocument())
    expect(mocks.fetchListingReviews).toHaveBeenLastCalledWith('list-1', 2, 5)
    expect(screen.queryByRole('button', { name: 'Load more reviews' })).not.toBeInTheDocument()
  })
})