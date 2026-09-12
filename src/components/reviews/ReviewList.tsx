import type { ReactNode } from 'react'
import ReviewCard from './ReviewCard'
import EmptyState from '../common/EmptyState'
import type { ReviewWithAuthor } from '../../features/reviews/reviews.types'

interface ReviewListProps {
  reviews: ReviewWithAuthor[]
  loading?: boolean
  error?: string | null
  header?: ReactNode
  onRetry?: () => void
  emptyTitle: string
  emptyBody?: string
}

/**
 * Ordered list of review cards with an optional empty state. Used on both the
 * listing-detail and seller-profile pages.
 */
export default function ReviewList({
  reviews,
  loading = false,
  error = null,
  header,
  onRetry,
  emptyTitle,
  emptyBody,
}: ReviewListProps) {
  if (loading) {
    return <p className="review-list__status">Loading reviews…</p>
  }

  if (error != null) {
    return (
      <div className="review-list__status" role="alert">
        <p>{error}</p>
        {onRetry != null ? (
          <button type="button" className="btn btn--secondary btn--sm" onClick={onRetry}>
            Try again
          </button>
        ) : null}
      </div>
    )
  }

  if (reviews.length === 0) {
    return <EmptyState title={emptyTitle} body={emptyBody} />
  }

  return (
    <ul className="review-list">
      {header != null ? <li className="review-list__header">{header}</li> : null}
      {reviews.map((review) => (
        <ReviewCard
          key={review.id}
          rating={review.rating}
          reviewerName={review.reviewerName}
          createdAt={review.createdAt}
          comment={review.comment}
          avatarUrl={review.reviewerAvatar}
          header={
            review.listingTitle != null ? (
              <span className="review-card__listing">{review.listingTitle}</span>
            ) : undefined
          }
        />
      ))}
    </ul>
  )
}