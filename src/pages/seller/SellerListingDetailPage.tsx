import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useSeller } from '../../features/seller/useSeller'
import {
  archiveListing,
  getSellerListing,
  markListingSold,
  publishListing,
} from '../../features/marketplace/marketplace.service'
import {
  formatListingCondition,
  formatListingStatus,
  isPaddleCategorySlug,
  isPubliclyVisible,
} from '../../features/marketplace/marketplace-utils'
import type { SellerListing } from '../../features/marketplace/marketplace.types'
import { formatCurrency } from '../../utils/format'
import ListingImageGallery from '../../components/marketplace/ListingImageGallery'
import LoadingState from '../../components/common/LoadingState'
import Alert from '../../components/common/Alert'
import Badge from '../../components/common/Badge'
import EmptyState from '../../components/common/EmptyState'

type BusyAction = 'publish' | 'archive' | 'sold' | null

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="listing-detail__row">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}

export default function SellerListingDetailPage() {
  const { listingId = '' } = useParams()
  const { sellerProfile } = useSeller()
  const [listing, setListing] = useState<SellerListing | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<BusyAction>(null)

  const load = useCallback(async () => {
    if (sellerProfile == null) return
    setLoading(true)
    setError(null)
    const { data, error } = await getSellerListing(sellerProfile.id, listingId)
    if (error != null) {
      setError('We could not load this listing. Please try again.')
      setListing(null)
    } else {
      setListing(data)
    }
    setLoading(false)
  }, [sellerProfile, listingId])

  useEffect(() => {
    void load()
  }, [load])

  if (sellerProfile == null || loading) {
    return <LoadingState label="Loading listing…" />
  }

  if (error != null) {
    return (
      <div className="container page">
        <Alert variant="error" message={error} />
        <p className="page-note">
          <Link to="/seller/listings">Back to your listings</Link>
        </p>
      </div>
    )
  }

  if (listing == null) {
    return (
      <div className="container page">
        <EmptyState
          title="Listing not found"
          body="This listing could not be found in your store."
          action={
            <Link className="btn btn--primary" to="/seller/listings">
              Back to your listings
            </Link>
          }
        />
      </div>
    )
  }

  const runAction = async (action: Exclude<BusyAction, null>) => {
    setBusy(action)
    setError(null)
    const call =
      action === 'publish'
        ? publishListing(sellerProfile.id, listing.id)
        : action === 'archive'
          ? archiveListing(sellerProfile.id, listing.id)
          : markListingSold(sellerProfile.id, listing.id)
    const { error } = await call
    if (error != null) {
      setError('We could not update this listing. Please try again.')
    } else {
      await load()
    }
    setBusy(null)
  }

  const location = [listing.city, listing.province].filter(Boolean).join(', ')
  const availability = [
    listing.pickup_available ? 'Pickup' : null,
    listing.delivery_available ? 'Delivery' : null,
  ]
    .filter(Boolean)
    .join(', ')

  return (
    <div className="container page">
      <div className="listing-detail">
        <ListingImageGallery images={listing.images} />

        <section className="listing-detail__info" aria-label="Listing details">
          <p className="listing-detail__category">
            {listing.category?.name ?? 'Uncategorized'}
            {listing.brand != null ? ` · ${listing.brand.name}` : ''}
          </p>
          <h1 className="listing-detail__title">{listing.title}</h1>
          <p className="listing-detail__price">{formatCurrency(listing.price)}</p>

          <p className="listing-detail__status">
            <Badge variant={listing.listing_status}>
              {formatListingStatus(listing.listing_status)}
            </Badge>
            {!isPubliclyVisible(listing) ? (
              <span className="listing-detail__visibility">
                This listing is not shown publicly.
              </span>
            ) : null}
          </p>

          <dl className="listing-detail__list">
            <DetailRow label="Condition">
              {formatListingCondition(listing.listing_condition)}
            </DetailRow>
            <DetailRow label="Available">{listing.quantity} in stock</DetailRow>
            <DetailRow label="Fulfillment">{availability || 'Not specified'}</DetailRow>
            {location.length > 0 ? (
              <DetailRow label="Location">{location}</DetailRow>
            ) : null}
          </dl>

          <div className="listing-detail__description">
            <h2>Description</h2>
            <p>{listing.description}</p>
          </div>

          {listing.paddle_attributes != null &&
          listing.category != null &&
          isPaddleCategorySlug(listing.category.slug) ? (
            <div className="listing-detail__paddle">
              <h2>Paddle details</h2>
              <dl className="listing-detail__list">
                {listing.paddle_attributes.weight_grams != null ? (
                  <DetailRow label="Weight">{listing.paddle_attributes.weight_grams} g</DetailRow>
                ) : null}
                {listing.paddle_attributes.weight_class != null ? (
                  <DetailRow label="Weight class">
                    {listing.paddle_attributes.weight_class}
                  </DetailRow>
                ) : null}
                {listing.paddle_attributes.control_score != null ? (
                  <DetailRow label="Control score">
                    {listing.paddle_attributes.control_score}/10
                  </DetailRow>
                ) : null}
                {listing.paddle_attributes.power_score != null ? (
                  <DetailRow label="Power score">
                    {listing.paddle_attributes.power_score}/10
                  </DetailRow>
                ) : null}
                {listing.paddle_attributes.skill_level != null ? (
                  <DetailRow label="Skill level">
                    {listing.paddle_attributes.skill_level}
                  </DetailRow>
                ) : null}
                {listing.paddle_attributes.playing_style != null ? (
                  <DetailRow label="Playing style">
                    {listing.paddle_attributes.playing_style}
                  </DetailRow>
                ) : null}
              </dl>
            </div>
          ) : null}
        </section>
      </div>

      <nav className="page-actions" aria-label="Listing actions">
        <Link className="btn btn--primary" to={`/seller/listings/${listing.id}/edit`}>
          Edit listing
        </Link>
        {listing.listing_status === 'draft' ? (
          <button
            type="button"
            className="btn btn--secondary"
            disabled={busy != null}
            onClick={() => void runAction('publish')}
          >
            Publish
          </button>
        ) : null}
        {listing.listing_status === 'active' ? (
          <button
            type="button"
            className="btn btn--secondary"
            disabled={busy != null}
            onClick={() => void runAction('sold')}
          >
            Mark as sold
          </button>
        ) : null}
        {!['archived', 'sold', 'removed'].includes(listing.listing_status) ? (
          <button
            type="button"
            className="btn btn--ghost"
            disabled={busy != null}
            onClick={() => void runAction('archive')}
          >
            Archive
          </button>
        ) : null}
        <Link className="btn btn--ghost" to="/seller/listings">
          Back to your listings
        </Link>
      </nav>
    </div>
  )
}
