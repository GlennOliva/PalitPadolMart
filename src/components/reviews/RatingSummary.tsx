import StarRating from './StarRating'

interface RatingSummaryProps {
  label: string
  rating: number | null
  count: number
}

/** Compact headline for an aggregate rating block (listing or seller). */
export default function RatingSummary({ label, rating, count }: RatingSummaryProps) {
  if (count === 0 || rating == null) {
    return (
      <p className="review-summary" role="status">
        <span className="review-summary__stars">
          <StarRating rating={0} size="sm" label={`${label}: no ratings yet`} />
        </span>
        <span className="review-summary__meta">No reviews yet</span>
      </p>
    )
  }

  return (
    <p className="review-summary" role="status">
      <span className="review-summary__stars">
        <StarRating rating={rating} size="sm" label={`${label}: ${rating.toFixed(1)} out of 5`} />
      </span>
      <span className="review-summary__meta">
        {rating.toFixed(1)} / 5 · {count} review{count === 1 ? '' : 's'}
      </span>
    </p>
  )
}