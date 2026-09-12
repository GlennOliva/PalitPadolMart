import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import StarRating from '../../src/components/reviews/StarRating'
import StarRatingInput from '../../src/components/reviews/StarRatingInput'
import RatingSummary from '../../src/components/reviews/RatingSummary'
import RatingDistribution from '../../src/components/reviews/RatingDistribution'
import ReviewList from '../../src/components/reviews/ReviewList'
import ReviewCard from '../../src/components/reviews/ReviewCard'

describe('StarRating (read-only)', () => {
  it('announces the rating and fills the right number of stars', () => {
    render(<StarRating rating={4} size="sm" />)
    expect(screen.getByRole('img', { name: 'Rated 4.0 out of 5 stars' })).toBeInTheDocument()
    const on = screen
      .getAllByText('★')
      .filter((node) => node.className.includes('stars__star--on'))
    expect(on).toHaveLength(4)
  })

  it('supports a label override', () => {
    render(<StarRating rating={3} label="Seller: 3.0 out of 5" />)
    expect(screen.getByRole('img', { name: 'Seller: 3.0 out of 5' })).toBeInTheDocument()
  })
})

describe('StarRatingInput', () => {
  it('lets the user pick a star with a keyboard-accessible radio group', () => {
    const onChange = vi.fn()
    render(
      <StarRatingInput
        id="test-rating"
        label="Product rating"
        value={undefined}
        onChange={onChange}
      />,
    )

    const group = screen.getByRole('radiogroup', { name: 'Product rating' })
    expect(group).toBeInTheDocument()
    const radio = screen.getByRole('radio', { name: '4 stars' })
    fireEvent.click(radio)
    expect(onChange).toHaveBeenCalledWith(4)
  })

  it('reflects the selected value and shows a field error', () => {
    render(
      <StarRatingInput
        id="test-rating"
        label="Product rating"
        value={3}
        onChange={vi.fn()}
        error="Choose a rating"
      />,
    )
    expect(screen.getByRole('radio', { name: '3 stars' })).toBeChecked()
    expect(screen.getByText('Choose a rating')).toBeInTheDocument()
    fireEvent.focus(screen.getByRole('radio', { name: '3 stars' }))
  })
})

describe('RatingSummary', () => {
  it('shows the headline aggregate', () => {
    render(<RatingSummary label="Product" rating={4.5} count={8} />)
    expect(screen.getByText('4.5 / 5 · 8 reviews')).toBeInTheDocument()
  })

  it('shows a no-reviews message when there are none', () => {
    render(<RatingSummary label="Seller" rating={null} count={0} />)
    expect(screen.getByText('No reviews yet')).toBeInTheDocument()
  })
})

describe('RatingDistribution', () => {
  it('renders a bar per star with counts', () => {
    render(<RatingDistribution counts={{ 5: 2, 4: 1, 3: 0, 2: 0, 1: 0 }} total={3} />)
    expect(screen.getByText('5 star')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: '2 reviews gave 5 stars' })).toBeInTheDocument()
  })

  it('renders empty bars when there are no reviews', () => {
    render(<RatingDistribution counts={{}} total={0} />)
    expect(screen.getAllByText('0')).toHaveLength(5)
  })
})

describe('ReviewCard', () => {
  it('renders a verified purchase review with author and comment', () => {
    render(
      <ReviewCard
        rating={5}
        reviewerName="Ana Test"
        createdAt="2026-09-01T00:00:00.000Z"
        comment="Excellent paddle"
      />,
    )
    expect(screen.getByText('Ana Test')).toBeInTheDocument()
    expect(screen.getByText(/Verified purchase ·/)).toBeInTheDocument()
    expect(screen.getByText('Excellent paddle')).toBeInTheDocument()
    expect(screen.getByText('A')).toBeInTheDocument()
  })

  it('shows a listing title when provided', () => {
    render(
      <ReviewCard
        rating={4}
        reviewerName="Ana Test"
        createdAt="2026-09-01T00:00:00.000Z"
        comment={null}
        header={<span className="review-card__listing">Selkirk Amped Epic</span>}
      />,
    )
    expect(screen.getByText('Selkirk Amped Epic')).toBeInTheDocument()
  })

  it('renders the reviewer avatar image when one exists', () => {
    render(
      <ReviewCard
        rating={4}
        reviewerName="Ana Test"
        createdAt="2026-09-01T00:00:00.000Z"
        comment="Ok"
        avatarUrl="https://example.com/a.png"
      />,
    )
    expect(screen.getByAltText('')).toHaveAttribute('src', 'https://example.com/a.png')
  })
})

describe('ReviewList', () => {
  const review = {
    id: 'rev-1',
    rating: 4,
    sellerRating: 5,
    comment: 'Nice paddle',
    createdAt: '2026-09-01T00:00:00.000Z',
    reviewerName: 'Ana Test',
    reviewerAvatar: null,
    listingTitle: null,
  }

  it('shows a loading status while loading', () => {
    render(<ReviewList reviews={[]} loading emptyTitle="No reviews yet" />)
    expect(screen.getByText('Loading reviews…')).toBeInTheDocument()
  })

  it('shows an empty state when there are no reviews', () => {
    render(<ReviewList reviews={[]} emptyTitle="No reviews yet" emptyBody="Be the first." />)
    expect(screen.getByText('No reviews yet')).toBeInTheDocument()
    expect(screen.getByText('Be the first.')).toBeInTheDocument()
  })

  it('returns an error alert with a retry when a load fails', () => {
    render(
      <ReviewList
        reviews={[]}
        error="Could not load"
        onRetry={vi.fn()}
        emptyTitle="No reviews yet"
      />,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load')
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })

  it('renders review cards for each review', () => {
    render(<ReviewList reviews={[review]} emptyTitle="No reviews yet" />)
    expect(screen.getByText('Ana Test')).toBeInTheDocument()
    expect(screen.getByText('Nice paddle')).toBeInTheDocument()
  })
})