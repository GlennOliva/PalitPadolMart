import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import PublicSellerProfilePage from '../../src/pages/seller/PublicSellerProfilePage'
import { getPublicLogoUrl, getPublicSellerProfile } from '../../src/features/seller/seller.service'
import {
  getSellerReviewSummary,
  fetchSellerReviews,
} from '../../src/features/reviews/reviews.service'
import { makePostgrestError } from '../utils/seller'

vi.mock('../../src/features/seller/seller.service', () => ({
  getMySellerProfile: vi.fn(),
  getPublicLogoUrl: vi.fn(),
  getPublicSellerProfile: vi.fn(),
}))

vi.mock('../../src/features/reviews/reviews.service', () => ({
  getSellerReviewSummary: vi.fn(),
  fetchSellerReviews: vi.fn(),
  submitReview: vi.fn(),
  reviewErrorLabel: (code: string) => `ERR:${code}`,
}))

const mockedGet = vi.mocked(getPublicSellerProfile)
const mockedPublicUrl = vi.mocked(getPublicLogoUrl)
const mockedSellerSummary = vi.mocked(getSellerReviewSummary)
const mockedSellerReviews = vi.mocked(fetchSellerReviews)

function renderPublic() {
  return render(
    <MemoryRouter initialEntries={['/sellers/seller-1']}>
      <Routes>
        <Route path="/sellers/:sellerId" element={<PublicSellerProfilePage />} />
        <Route path="/" element={<div>HOME PAGE</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedPublicUrl.mockReturnValue('https://example.com/logo.png')
  mockedSellerSummary.mockResolvedValue({
    data: { reviewCount: 0, averageRating: null },
    error: null,
  })
  mockedSellerReviews.mockResolvedValue({ data: { reviews: [], hasMore: false }, error: null })
})

describe('PublicSellerProfilePage', () => {
  it('renders the seller store with rating when reviews exist', async () => {
    mockedGet.mockResolvedValue({
      seller: {
        id: 'seller-1',
        store_name: 'Ace Paddles PH',
        description: 'Quality paddles.',
        logo_url: 'seller-1/logo/logo.png',
        city: 'Cebu City',
        province: 'Cebu',
        pickup_available: true,
        delivery_available: null,
      },
      rating: 4.5,
      reviewCount: 8,
      error: null,
    })
    renderPublic()

    expect(
      await screen.findByRole('heading', { name: 'Ace Paddles PH' }),
    ).toBeInTheDocument()
    expect(screen.getByText('4.5 / 5 · 8 reviews')).toBeInTheDocument()
    expect(screen.getByText('Cebu City, Cebu')).toBeInTheDocument()
    expect(screen.getByText('Pickup')).toBeInTheDocument()
    expect(mockedPublicUrl).toHaveBeenCalledWith('seller-1/logo/logo.png')
  })

  it('shows a no-ratings message when there are no reviews', async () => {
    mockedGet.mockResolvedValue({
      seller: {
        id: 'seller-1',
        store_name: 'Ace Paddles PH',
        description: null,
        logo_url: null,
        city: null,
        province: null,
        pickup_available: false,
        delivery_available: false,
      },
      rating: null,
      reviewCount: 0,
      error: null,
    })
    renderPublic()

    expect(await screen.findByText('No ratings yet')).toBeInTheDocument()
    expect(screen.getByText('Not provided')).toBeInTheDocument()
  })

  it('shows a not-found state for unknown or inactive sellers', async () => {
    mockedGet.mockResolvedValue({
      seller: null,
      rating: null,
      reviewCount: 0,
      error: null,
    })
    renderPublic()

    expect(
      await screen.findByRole('heading', { name: 'Seller not found' }),
    ).toBeInTheDocument()
  })

  it('shows an error state with a retry when the fetch fails', async () => {
    mockedGet.mockResolvedValue({
      seller: null,
      rating: null,
      reviewCount: 0,
      error: makePostgrestError('boom'),
    })
    renderPublic()

    expect(
      await screen.findByRole('heading', { name: 'Seller not available' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /Try again/i }),
    ).toBeInTheDocument()
  })

  it('renders the seller reviews panel with published reviews', async () => {
    mockedGet.mockResolvedValue({
      seller: {
        id: 'seller-1',
        store_name: 'Ace Paddles PH',
        description: null,
        logo_url: null,
        city: null,
        province: null,
        pickup_available: false,
        delivery_available: false,
      },
      rating: 4.8,
      reviewCount: 5,
      error: null,
    })
    mockedSellerSummary.mockResolvedValue({
      data: { reviewCount: 5, averageRating: 4.8 },
      error: null,
    })
    mockedSellerReviews.mockResolvedValue({
      data: {
        reviews: [
          {
            id: 'rev-1',
            rating: 5,
            sellerRating: 5,
            comment: 'Fast and friendly!',
            createdAt: '2026-09-01T00:00:00.000Z',
            reviewerName: 'Ana Test',
            reviewerAvatar: null,
            listingTitle: 'Selkirk Amped Epic',
          },
        ],
        hasMore: false,
      },
      error: null,
    })
    renderPublic()

    expect(
      await screen.findByRole('heading', { name: 'Seller reviews' }),
    ).toBeInTheDocument()
    expect(await screen.findByText('Fast and friendly!')).toBeInTheDocument()
    expect(await screen.findByText('Selkirk Amped Epic')).toBeInTheDocument()
    expect(screen.getAllByText('4.8 / 5 · 5 reviews').length).toBeGreaterThanOrEqual(1)
    expect(mockedSellerSummary).toHaveBeenCalledWith('seller-1')
  })
})
