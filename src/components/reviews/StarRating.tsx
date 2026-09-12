interface StarRatingProps {
  rating: number
  size?: 'sm' | 'md' | 'lg'
  label?: string
}

const STAR_GLYPH = '★'
const EMPTY_GLYPH = '☆'

/** Read-only star display. Accessible as an image with a rating label. */
export default function StarRating({
  rating,
  size = 'md',
  label,
}: StarRatingProps) {
  const filled = Math.round(Math.max(0, Math.min(5, rating)))
  return (
    <span
      className={`stars stars--${size}`}
      role="img"
      aria-label={label ?? `Rated ${rating.toFixed(1)} out of 5 stars`}
    >
      {[1, 2, 3, 4, 5].map((star) => (
        <span
          key={star}
          className={star <= filled ? 'stars__star stars__star--on' : 'stars__star'}
          aria-hidden="true"
        >
          {star <= filled ? STAR_GLYPH : EMPTY_GLYPH}
        </span>
      ))}
    </span>
  )
}