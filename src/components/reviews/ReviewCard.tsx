import type { ReactNode } from 'react'
import StarRating from './StarRating'
import { formatDate } from '../../utils/format'

interface ReviewCardProps {
  rating: number
  reviewerName: string
  createdAt: string
  comment: string | null
  avatarUrl?: string | null
  header?: ReactNode
}

/**
 * A single published review. Guests only see the reviewer display name or a
 * "Verified Buyer" fallback — never private account fields.
 */
export default function ReviewCard({
  rating,
  reviewerName,
  createdAt,
  comment,
  avatarUrl,
  header,
}: ReviewCardProps) {
  return (
    <li className="review-card">
      <div className="review-card__header">
        <div className="review-card__author">
          {avatarUrl != null ? (
            <img
              className="review-card__avatar"
              src={avatarUrl}
              alt=""
              loading="lazy"
            />
          ) : (
            <span className="review-card__avatar review-card__avatar--fallback" aria-hidden="true">
              {reviewerName.charAt(0).toUpperCase()}
            </span>
          )}
          <div>
            <p className="review-card__name">{reviewerName}</p>
            {header != null ? <p className="review-card__meta">{header}</p> : null}
            <p className="review-card__date">Verified purchase · {formatDate(createdAt)}</p>
          </div>
        </div>
        <StarRating rating={rating} size="sm" />
      </div>
      {comment != null && comment.length > 0 ? (
        <p className="review-card__comment">{comment}</p>
      ) : null}
    </li>
  )
}