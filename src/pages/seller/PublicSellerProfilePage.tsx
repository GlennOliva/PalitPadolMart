import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getPublicLogoUrl, getPublicSellerProfile } from '../../features/seller/seller.service'
import type { PublicSellerProfile } from '../../features/seller/seller.types'
import { formatRating } from '../../utils/format'
import LoadingState from '../../components/common/LoadingState'
import SellerReviewsPanel from '../../components/reviews/SellerReviewsPanel'

interface PublicSellerState {
  seller: PublicSellerProfile | null
  rating: number | null
  reviewCount: number
}

export default function PublicSellerProfilePage() {
  const { sellerId } = useParams<{ sellerId: string }>()
  const [result, setResult] = useState<PublicSellerState | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadSeller = useCallback(async (id: string) => {
    setLoading(true)
    setError(null)
    const { seller, rating, reviewCount, error } = await getPublicSellerProfile(id)
    if (error != null) {
      setError('We could not load this seller. Please try again.')
      setResult(null)
    } else {
      setResult({ seller, rating, reviewCount })
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    if (sellerId == null) return
    void loadSeller(sellerId)
  }, [sellerId, loadSeller])

  if (loading) {
    return <LoadingState label="Loading seller profile…" />
  }

  if (error != null) {
    return (
      <div className="container page">
        <div className="empty-state" role="alert">
          <h1 className="empty-state__title">Seller not available</h1>
          <p className="empty-state__body">{error}</p>
          <button type="button" className="btn" onClick={() => sellerId != null && void loadSeller(sellerId)}>
            Try again
          </button>
        </div>
      </div>
    )
  }

  if (result == null || result.seller == null) {
    return (
      <div className="container page">
        <div className="empty-state">
          <h1 className="empty-state__title">Seller not found</h1>
          <p className="empty-state__body">
            We could not find this seller. It may not exist, or its store is
            not active yet.
          </p>
          <Link className="btn" to="/">
            Back to home
          </Link>
        </div>
      </div>
    )
  }

  const seller = result.seller
  const logoUrl = getPublicLogoUrl(seller.logo_url)
  const location = [seller.city, seller.province].filter(Boolean).join(', ')
  const availability = [
    seller.pickup_available ? 'Pickup' : null,
    seller.delivery_available ? 'Delivery' : null,
  ]
    .filter(Boolean)
    .join(', ')
  const ratingText =
    result.rating == null
      ? 'No ratings yet'
      : `${formatRating(result.rating)} / 5 · ${result.reviewCount} review${result.reviewCount === 1 ? '' : 's'}`

  return (
    <div className="container page">
      <article className="public-seller" aria-label={`Store: ${seller.store_name}`}>
        <div className="public-seller__header">
          <div className="seller-logo seller-logo--lg">
            {logoUrl != null ? (
              <img className="seller-logo__image" src={logoUrl} alt={`${seller.store_name} logo`} />
            ) : (
              <span className="seller-logo__fallback" aria-hidden="true">
                {(seller.store_name ?? '?').charAt(0).toUpperCase()}
              </span>
            )}
          </div>
          <div className="public-seller__heading">
            <h1 className="page__title">{seller.store_name}</h1>
            <p className="public-seller__rating" role="status">
              {ratingText}
            </p>
          </div>
        </div>

        {seller.description != null ? (
          <p className="public-seller__description">{seller.description}</p>
        ) : null}

        <dl className="public-seller__details">
          <div className="public-seller__row">
            <dt>Location</dt>
            <dd>{location || 'Not provided'}</dd>
          </div>
          <div className="public-seller__row">
            <dt>Availability</dt>
            <dd>{availability || 'Not specified'}</dd>
          </div>
        </dl>

        <nav className="page-actions" aria-label="Related actions">
          <Link className="btn" to="/">
            Back to home
          </Link>
        </nav>
      </article>

      {seller.id != null ? <SellerReviewsPanel sellerId={seller.id} /> : null}
    </div>
  )
}
