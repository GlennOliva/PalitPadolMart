import { Link } from 'react-router-dom'
import { formatListingCondition } from '../../features/marketplace/marketplace-utils'
import { formatCurrency } from '../../utils/format'
import type { PublicListing } from '../../features/marketplace/marketplace.types'
import FavoriteButton from './FavoriteButton'

export default function ListingCard({ listing }: { listing: PublicListing }) {
  const primary = (listing.images ?? [])[0] ?? null

  return (
    <article className="listing-card">
      <div className="listing-card__favorite">
        <FavoriteButton listingId={listing.id} />
      </div>
      <Link
        className="listing-card__link"
        to={`/marketplace/${listing.id}`}
        aria-label={listing.title}
      >
        <div className="listing-card__media">
          {primary != null && primary.url != null ? (
            <img
              className="listing-card__image"
              src={primary.url}
              alt=""
              loading="lazy"
            />
          ) : (
            <span className="listing-card__placeholder" aria-hidden="true">
              🏓
            </span>
          )}
        </div>
        <div className="listing-card__body">
          <h3 className="listing-card__title">{listing.title}</h3>
          <p className="listing-card__price">{formatCurrency(listing.price)}</p>
          <p className="listing-card__meta">
            <span>{formatListingCondition(listing.listing_condition)}</span>
            {listing.category != null ? <span> · {listing.category.name}</span> : null}
            {listing.brand != null ? <span> · {listing.brand.name}</span> : null}
          </p>
          {listing.seller != null ? (
            <p className="listing-card__seller">
              Sold by {listing.seller.store_name ?? 'an active seller'}
            </p>
          ) : null}
        </div>
      </Link>
    </article>
  )
}
