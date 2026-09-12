const SCALE = [5, 4, 3, 2, 1]

interface RatingDistributionProps {
  counts: Record<number, number>
  total: number
}

/**
 * Breakdown of review counts by star value (5…1). Each bar's width is the
 * proportion of total reviews; the bar is empty when there are no reviews.
 */
export default function RatingDistribution({ counts, total }: RatingDistributionProps) {
  if (total <= 0) {
    return (
      <ul className="rating-distribution" aria-label="Ratings breakdown">
        {SCALE.map((star) => (
          <li key={star} className="rating-distribution__row">
            <span className="rating-distribution__label">{star} star</span>
            <span className="rating-distribution__track">
              <span className="rating-distribution__fill" style={{ width: '0%' }} />
            </span>
            <span className="rating-distribution__count">0</span>
          </li>
        ))}
      </ul>
    )
  }

  return (
    <ul className="rating-distribution" aria-label="Ratings breakdown">
      {SCALE.map((star) => {
        const count = counts[star] ?? 0
        const percent = (count / total) * 100
        return (
          <li key={star} className="rating-distribution__row">
            <span className="rating-distribution__label">{star} star</span>
            <span className="rating-distribution__track">
              <span
                className="rating-distribution__fill"
                style={{ width: `${percent}%` }}
                role="img"
                aria-label={`${count} ${count === 1 ? 'review' : 'reviews'} gave ${star} ${star === 1 ? 'star' : 'stars'}`}
              />
            </span>
            <span className="rating-distribution__count">{count}</span>
          </li>
        )
      })}
    </ul>
  )
}