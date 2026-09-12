import { useEffect, useState, type ReactNode } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { getPublicListing } from '../../features/marketplace/marketplace.service'
import {
  formatListingCondition,
  isPaddleCategorySlug,
} from '../../features/marketplace/marketplace-utils'
import type { PublicListingDetail } from '../../features/marketplace/marketplace.types'
import { useAuth } from '../../features/auth/useAuth'
import { useSeller } from '../../features/seller/useSeller'
import {
  findActiveInquiry,
  startInquiry,
} from '../../features/inquiries/inquiries.service'
import { validateInquiryForm } from '../../features/inquiries/inquiry-validation'
import { useCart } from '../../features/cart/CartProvider'
import { orderErrorLabel } from '../../features/cart/cart.service'
import { formatCurrency } from '../../utils/format'
import ListingImageGallery from '../../components/marketplace/ListingImageGallery'
import FavoriteButton from '../../components/marketplace/FavoriteButton'
import ReviewSection from '../../components/reviews/ReviewSection'
import LoadingState from '../../components/common/LoadingState'
import Alert from '../../components/common/Alert'
import EmptyState from '../../components/common/EmptyState'
import FormField from '../../components/common/FormField'
import SubmitButton from '../../components/common/SubmitButton'
import ListingReportDialog from '../../components/marketplace/ListingReportDialog'

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="listing-detail__row">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}

export default function ListingDetailPage() {
  const { listingId = '' } = useParams()
  const { user, isAuthenticated } = useAuth()
  const { sellerProfile, sellerLoading, sellerError } = useSeller()
  const { addToCart } = useCart()
  const navigate = useNavigate()
  const currentLocation = useLocation()
  const [listing, setListing] = useState<PublicListingDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [askOpen, setAskOpen] = useState(false)
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [fieldErrors, setFieldErrors] = useState<{ subject?: string; message?: string }>({})
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [addingToCart, setAddingToCart] = useState(false)
  const [cartNotice, setCartNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(
    null,
  )

  useEffect(() => {
    let active = true
    setLoading(true)
    setError(null)
    void getPublicListing(listingId).then(({ data, error }) => {
      if (!active) return
      if (error != null) {
        setError('We could not load this listing. Please try again.')
        setListing(null)
      } else {
        setListing(data)
      }
      setLoading(false)
    })
    return () => {
      active = false
    }
  }, [listingId])

  if (loading) {
    return <LoadingState label="Loading listing…" />
  }

  if (error != null) {
    return (
      <div className="container page">
        <Alert variant="error" message={error} />
        <p className="page-note">
          <Link to="/marketplace">Back to marketplace</Link>
        </p>
      </div>
    )
  }

  if (listing == null) {
    return (
      <div className="container page">
        <EmptyState
          title="Listing not found"
          body="This listing is unavailable — it may have been sold, archived, or removed by the seller."
          action={
            <Link className="btn btn--primary" to="/marketplace">
              Back to marketplace
            </Link>
          }
        />
      </div>
    )
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

          <div className="listing-detail__actions">
            {listing.seller != null && sellerProfile?.id !== listing.seller.id ? (
              <>
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={() => {
                    if (!isAuthenticated) {
                      navigate('/login', { state: { from: currentLocation } })
                      return
                    }
                    navigate(`/order/review/${listing.id}`)
                  }}
                >
                  Buy now
                </button>
                <button
                  type="button"
                  className="btn btn--secondary"
                  disabled={addingToCart}
                  onClick={() => {
                    if (!isAuthenticated) {
                      navigate('/login', { state: { from: currentLocation } })
                      return
                    }
                    setAddingToCart(true)
                    setCartNotice(null)
                    void addToCart(listing.id).then(({ error }) => {
                      setAddingToCart(false)
                      if (error != null) {
                        setCartNotice({ tone: 'error', text: orderErrorLabel(error.code) })
                        if (error.code === 'PRICE_CHANGED' || error.code === 'INSUFFICIENT_STOCK') {
                          window.location.reload()
                        }
                        return
                      }
                      setCartNotice({
                        tone: 'success',
                        text: 'Added to your cart.',
                      })
                    })
                  }}
                >
                  {addingToCart ? 'Adding…' : 'Add to cart'}
                </button>
                <button
                  type="button"
                  className="btn btn--secondary"
                  onClick={() => {
                    if (!isAuthenticated) {
                      navigate('/login', { state: { from: currentLocation } })
                      return
                    }
                    setAskOpen((open) => !open)
                    setSubmitError(null)
                  }}
                >
                  Ask a seller
                </button>
              </>
            ) : null}
            <FavoriteButton listingId={listing.id} showLabel />
          </div>

          {cartNotice != null ? (
            <div
              className="listing-detail__cart-notice"
              role="status"
            >
              <Alert variant={cartNotice.tone} message={cartNotice.text} />
              {cartNotice.tone === 'success' ? (
                <Link className="btn btn--ghost btn--sm" to="/cart">
                  View cart
                </Link>
              ) : null}
            </div>
          ) : null}

          {askOpen && listing.seller != null ? (
            <form
              className="listing-detail__inquiry"
              onSubmit={(event) => {
                event.preventDefault()
                if (user == null) {
                  navigate('/login', { state: { from: currentLocation } })
                  return
                }
                const errors = validateInquiryForm({ subject, message })
                setFieldErrors(errors)
                if (errors.subject != null || errors.message != null) return
                setSubmitting(true)
                setSubmitError(null)
                void findActiveInquiry(user.id, listing.id).then(
                  async ({ data: existing, error: existingError }) => {
                    if (existingError != null) {
                      setSubmitError('We could not open an inquiry. Please try again.')
                      setSubmitting(false)
                      return
                    }
                    if (existing != null) {
                      navigate(`/inquiries/${existing.id}`)
                      return
                    }
                    const result = await startInquiry(user.id, {
                      listing_id: listing.id,
                      seller_id: listing.seller?.id ?? '',
                      subject,
                      message,
                    })
                    setSubmitting(false)
                    if (result.error != null || result.data == null) {
                      setSubmitError('We could not send your inquiry. Please try again.')
                      return
                    }
                    navigate(`/inquiries/${result.data.id}`)
                  },
                )
              }}
            >
              <h2 className="listing-detail__inquiry-title">Ask a seller</h2>
              <FormField
                id="inquiry-subject"
                label="Subject"
                required
                value={subject}
                onChange={setSubject}
                error={fieldErrors.subject}
                maxLength={120}
                placeholder="e.g. Is this still available?"
              />
              <div className="form-field">
                <label className="form-field__label" htmlFor="inquiry-message">
                  Message
                  <span className="form-field__required"> *</span>
                </label>
                <textarea
                  className="form-field__textarea"
                  id="inquiry-message"
                  rows={4}
                  maxLength={2000}
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  aria-invalid={fieldErrors.message != null ? true : undefined}
                />
                {fieldErrors.message != null ? (
                  <p className="form-field__error">{fieldErrors.message}</p>
                ) : null}
              </div>
              {submitError != null ? <Alert variant="error" message={submitError} /> : null}
              <div className="listing-detail__inquiry-actions">
                <SubmitButton loading={submitting} loadingLabel="Sending…">
                  Send inquiry
                </SubmitButton>
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() => setAskOpen(false)}
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : null}

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

          {listing.seller != null ? (
            <div className="listing-detail__seller glass glass--soft">
              <div>
                <span className="listing-detail__seller-label">Seller</span>
                <strong className="listing-detail__seller-name">
                  {listing.seller.store_name ?? 'Active seller'}
                </strong>
              </div>
              <Link
                className="btn btn--secondary btn--sm"
                to={`/sellers/${listing.seller.id}`}
              >
                View seller
              </Link>
            </div>
          ) : null}

          <div className="listing-detail__description">
            <h2>Description</h2>
            <p>{listing.description}</p>
          </div>

          {!sellerLoading && sellerError == null && sellerProfile?.id !== listing.seller?.id ? (
            <div className="report-listing-action">
              <ListingReportDialog listingId={listing.id} listingTitle={listing.title} />
            </div>
          ) : null}

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

      <ReviewSection listingId={listing.id} />

      <p className="page-note">
        <Link to="/marketplace">Back to marketplace</Link>
      </p>
    </div>
  )
}
