import { Link } from 'react-router-dom'
import { formatCurrency } from '../../utils/format'
import { formatListingCondition } from '../../features/marketplace/marketplace-utils'
import type { ScoredPaddle } from '../../features/recommendation/recommendation.types'
import ScoreBreakdown from './ScoreBreakdown'

interface RecommendationCardProps {
  rank: number
  result: ScoredPaddle
  onSelect?: (listingId: string) => void
}

/** One ranked paddle recommendation: score, price, condition, seller, reasons. */
export default function RecommendationCard({ rank, result, onSelect }: RecommendationCardProps) {
  const { listing, breakdown, reasons } = result
  const primary = listing.images[0] ?? null

  return (
    <article className="rec-card">
      <header className="rec-card__header">
        <div className="rec-card__identity">
          <span className="rec-card__rank" aria-label={`Rank ${rank}`}>
            {rank}
          </span>
          <div>
            <h3 className="rec-card__title">{listing.title}</h3>
            <p className="rec-card__meta">
              {listing.brand != null ? <span>{listing.brand.name}</span> : null}
              <span> · {formatListingCondition(listing.listing_condition)}</span>
            </p>
          </div>
        </div>
        <div className="rec-card__score" aria-label={`Recommendation score ${breakdown.total} out of 100`}>
          <span className="rec-card__score-value">{breakdown.total}</span>
          <span className="rec-card__score-label">/ 100</span>
        </div>
      </header>

      <div className="rec-card__body">
        <div className="rec-card__media">
          {primary != null && primary.url != null ? (
            <img className="rec-card__image" src={primary.url} alt="" loading="lazy" />
          ) : (
            <span className="listing-card__placeholder" aria-hidden="true">
              🏓
            </span>
          )}
        </div>

        <div className="rec-card__details">
          <p className="rec-card__price">{formatCurrency(listing.price)}</p>
          {listing.seller != null ? (
            <p className="rec-card__seller">
              Sold by {listing.seller.store_name ?? 'an active seller'}
            </p>
          ) : null}

          {reasons.length > 0 ? (
            <div className="rec-card__reasons">
              <h4 className="rec-card__reasons-title">Why it matches</h4>
              <ul className="rec-card__reasons-list">
                {reasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <ScoreBreakdown breakdown={breakdown} />

          <Link
            className="btn btn--primary btn--sm"
            to={`/marketplace/${listing.id}`}
            onClick={onSelect != null ? () => onSelect(listing.id) : undefined}
          >
            View listing
          </Link>
        </div>
      </div>
    </article>
  )
}
