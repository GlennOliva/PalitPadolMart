import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { getPublicListing } from '../../features/marketplace/marketplace.service'
import { formatListingCondition } from '../../features/marketplace/marketplace-utils'
import type { PublicListingDetail } from '../../features/marketplace/marketplace.types'
import { useSeller } from '../../features/seller/useSeller'
import {
  createMarketplaceOrder,
  orderErrorLabel,
} from '../../features/orders/orders.service'
import {
  validateOrderFulfillment,
  validateOrderNotes,
  validateOrderQuantity,
} from '../../features/orders/orders-validation'
import type { FulfillmentType } from '../../features/orders/orders.types'
import { MAX_ORDER_NOTES_LENGTH, MAX_ORDER_QUANTITY } from '../../features/orders/orders.types'
import { formatCurrency } from '../../utils/format'
import LoadingState from '../../components/common/LoadingState'
import Alert from '../../components/common/Alert'
import EmptyState from '../../components/common/EmptyState'
import SubmitButton from '../../components/common/SubmitButton'
import GlassPanel from '../../components/common/GlassPanel'

interface FulfillmentOption {
  value: FulfillmentType
  label: string
  hint: string
}

export default function ReviewOrderPage() {
  const { listingId = '' } = useParams()
  const navigate = useNavigate()
  const { sellerProfile } = useSeller()

  const [listing, setListing] = useState<PublicListingDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [quantity, setQuantity] = useState(1)
  const [fulfillment, setFulfillment] = useState<FulfillmentType | ''>('')
  const [notes, setNotes] = useState('')
  const [fieldErrors, setFieldErrors] = useState<{
    quantity?: string
    fulfillment?: string
    notes?: string
  }>({})
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    let active = true
    setLoading(true)
    setLoadError(null)
    void getPublicListing(listingId).then(({ data, error }) => {
      if (!active) return
      if (error != null) {
        setLoadError('We could not load this listing. Please try again.')
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

  const fulfillmentOptions = useMemo<FulfillmentOption[]>(() => {
    if (listing == null) return []
    const options: FulfillmentOption[] = []
    if (listing.pickup_available) {
      options.push({ value: 'pickup', label: 'Pickup', hint: 'You will arrange a pickup with the seller.' })
    }
    if (listing.delivery_available) {
      options.push({ value: 'delivery', label: 'Delivery', hint: 'The seller will arrange delivery.' })
    }
    return options
  }, [listing])

  useEffect(() => {
    if (fulfillment === '' && fulfillmentOptions.length > 0) {
      setFulfillment(fulfillmentOptions[0].value)
    }
  }, [fulfillment, fulfillmentOptions])

  if (loading) {
    return <LoadingState label="Preparing your order…" />
  }

  if (loadError != null) {
    return (
      <div className="container page">
        <Alert variant="error" message={loadError} />
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
          title="Listing not available"
          body="This listing is unavailable — it may have been sold, archived, or removed."
          action={
            <Link className="btn btn--primary" to="/marketplace">
              Back to marketplace
            </Link>
          }
        />
      </div>
    )
  }

  if (sellerProfile?.id === listing.seller?.id) {
    return (
      <div className="container page">
        <EmptyState
          title="This is your listing"
          body="You cannot purchase your own listing."
          action={
            <Link className="btn btn--primary" to={`/marketplace/${listing.id}`}>
              Back to listing
            </Link>
          }
        />
      </div>
    )
  }

  const maxQuantity = Math.min(listing.quantity, MAX_ORDER_QUANTITY)
  const quantityOptions = Array.from({ length: maxQuantity }, (_, index) => index + 1)
  const subtotal = listing.price * quantity
  const total = subtotal

  const placeOrder = () => {
    setSubmitError(null)
    const quantityError = validateOrderQuantity(quantity, listing.quantity)
    const fulfillmentError =
      fulfillment === ''
        ? 'Please choose a fulfillment option'
        : validateOrderFulfillment(fulfillment, listing)
    const notesError = validateOrderNotes(notes)
    setFieldErrors({
      quantity: quantityError ?? undefined,
      fulfillment: fulfillmentError ?? undefined,
      notes: notesError ?? undefined,
    })
    if (quantityError != null || fulfillmentError != null || notesError != null) return

    setSubmitting(true)
    void createMarketplaceOrder({
      listing_id: listing.id,
      quantity,
      fulfillment_type: fulfillment as FulfillmentType,
      notes,
      expected_unit_price: listing.price,
    }).then(({ data, error }) => {
      setSubmitting(false)
      if (error != null || data == null) {
        setSubmitError(orderErrorLabel(error?.code ?? 'UNKNOWN'))
        if (error?.code === 'PRICE_CHANGED' || error?.code === 'INSUFFICIENT_STOCK') {
          window.location.reload()
        }
        return
      }
      navigate(`/orders/${data.id}`)
    })
  }

  return (
    <div className="container page">
      <h1 className="page__title">Review order</h1>
      <p className="page__intro">
        Confirm the details below before placing your order.
      </p>

      <div className="review-order">
        <div className="review-order__form">
          <GlassPanel className="review-order__panel">
            <div className="review-order__product">
              <div className="review-order__product-media">
                {listing.images[0]?.url != null ? (
                  <img
                    className="review-order__product-image"
                    src={listing.images[0].url}
                    alt=""
                  />
                ) : (
                  <span className="review-order__product-placeholder" aria-hidden="true">
                    🏓
                  </span>
                )}
              </div>
              <div className="review-order__product-body">
                <span className="review-order__product-category">
                  {listing.category?.name ?? 'Uncategorized'}
                  {listing.brand != null ? ` · ${listing.brand.name}` : ''}
                </span>
                <h2 className="review-order__product-title">{listing.title}</h2>
                <p className="review-order__product-condition">
                  {formatListingCondition(listing.listing_condition)} ·{' '}
                  {formatCurrency(listing.price)} each
                </p>
                <p className="review-order__product-stock">{listing.quantity} in stock</p>
              </div>
              <Link className="btn btn--ghost btn--sm" to={`/marketplace/${listing.id}`}>
                View listing
              </Link>
            </div>
          </GlassPanel>

          <GlassPanel className="review-order__panel">
            <form
              className="review-order__fields"
              onSubmit={(event) => {
                event.preventDefault()
                placeOrder()
              }}
            >
              <div className="form-field">
                <label className="form-field__label" htmlFor="order-quantity">
                  Quantity
                  <span className="form-field__required"> *</span>
                </label>
                <select
                  className="form-field__input"
                  id="order-quantity"
                  value={quantity}
                  onChange={(event) => setQuantity(Number(event.target.value))}
                  aria-invalid={fieldErrors.quantity != null ? true : undefined}
                >
                  {quantityOptions.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
                {fieldErrors.quantity != null ? (
                  <p className="form-field__error">{fieldErrors.quantity}</p>
                ) : null}
              </div>

              <fieldset className="form-field">
                <legend className="form-field__label">
                  How will you get it?
                  <span className="form-field__required"> *</span>
                </legend>
                {fulfillmentOptions.map((option) => (
                  <label key={option.value} className="radio-option">
                    <input
                      type="radio"
                      name="order-fulfillment"
                      value={option.value}
                      checked={fulfillment === option.value}
                      onChange={() => setFulfillment(option.value)}
                    />
                    <span>
                      <strong>{option.label}</strong>
                      <small>{option.hint}</small>
                    </span>
                  </label>
                ))}
                {fieldErrors.fulfillment != null ? (
                  <p className="form-field__error">{fieldErrors.fulfillment}</p>
                ) : null}
              </fieldset>

              <div className="form-field">
                <label className="form-field__label" htmlFor="order-notes">
                  Notes to seller
                  <span className="form-field__optional"> (optional)</span>
                </label>
                <textarea
                  className="form-field__textarea"
                  id="order-notes"
                  rows={3}
                  maxLength={MAX_ORDER_NOTES_LENGTH}
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  aria-invalid={fieldErrors.notes != null ? true : undefined}
                  placeholder="e.g. Please wrap it carefully."
                />
                {fieldErrors.notes != null ? (
                  <p className="form-field__error">{fieldErrors.notes}</p>
                ) : null}
              </div>

              {submitError != null ? <Alert variant="error" message={submitError} /> : null}

              <div className="review-order__actions">
                <SubmitButton loading={submitting} loadingLabel="Placing order…">
                  Place order
                </SubmitButton>
                <Link className="btn btn--ghost" to={`/marketplace/${listing.id}`}>
                  Cancel
                </Link>
              </div>
            </form>
          </GlassPanel>
        </div>

        <aside className="review-order__summary" aria-label="Order summary">
          <GlassPanel>
            <h2 className="review-order__summary-title">Order summary</h2>
            <dl className="review-order__summary-list">
              <div>
                <dt>{listing.title}</dt>
                <dd>
                  {quantity} × {formatCurrency(listing.price)}
                </dd>
              </div>
              <div>
                <dt>Subtotal</dt>
                <dd>{formatCurrency(subtotal)}</dd>
              </div>
              <div className="review-order__summary-total">
                <dt>Total</dt>
                <dd>{formatCurrency(total)}</dd>
              </div>
            </dl>
            <p className="review-order__summary-note">
              No platform fees are added. Payment is settled with the seller at
              pickup, at delivery, or via manual transfer.
            </p>
          </GlassPanel>
        </aside>
      </div>

      <p className="page-note">
        <Link to={`/marketplace/${listing.id}`}>Back to listing</Link>
      </p>
    </div>
  )
}
