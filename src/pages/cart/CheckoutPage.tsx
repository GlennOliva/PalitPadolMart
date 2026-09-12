import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../features/auth/useAuth'
import {
  checkoutCart,
  getCartSelection,
  orderErrorLabel,
} from '../../features/cart/cart.service'
import type {
  CartSellerGroup,
  CheckoutOrder,
  FulfillmentMap,
  FulfillmentType,
} from '../../features/cart/cart.types'
import { sellerFulfillmentOptions } from '../../features/cart/cart-validation'
import { formatCurrency } from '../../utils/format'
import LoadingState from '../../components/common/LoadingState'
import Alert from '../../components/common/Alert'
import EmptyState from '../../components/common/EmptyState'
import GlassPanel from '../../components/common/GlassPanel'
import SubmitButton from '../../components/common/SubmitButton'

interface CheckoutState {
  cartItemIds: string[]
}

interface FulfillmentOption {
  value: FulfillmentType
  label: string
  hint: string
}

function sellerOptions(group: CartSellerGroup): FulfillmentOption[] {
  const options: FulfillmentOption[] = []
  for (const value of sellerFulfillmentOptions({
    pickup: group.items.every((item) => item.listing?.pickup_available === true),
    delivery: group.items.every((item) => item.listing?.delivery_available === true),
  })) {
    if (value === 'pickup') {
      options.push({ value, label: 'Pickup', hint: 'You will arrange a pickup with the seller.' })
    } else {
      options.push({ value, label: 'Delivery', hint: 'The seller will arrange delivery.' })
    }
  }
  return options
}

export default function CheckoutPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const { user } = useAuth()
  const state = (location.state ?? {}) as CheckoutState
  const cartItemIds = useMemo(() => state.cartItemIds ?? [], [state.cartItemIds])

  const [groups, setGroups] = useState<CartSellerGroup[]>([])
  const [unavailableCount, setUnavailableCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [fulfillments, setFulfillments] = useState<FulfillmentMap>({})
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    let active = true
    setLoading(true)
    setLoadError(null)
    if (user == null || cartItemIds.length === 0) {
      setLoading(false)
      return () => {
        active = false
      }
    }
    void getCartSelection(user.id, cartItemIds).then(({ data, error }) => {
      if (!active) return
      if (error != null) {
        setLoadError('We could not load your selection. Please try again.')
      } else {
        setGroups(data.groups)
        setUnavailableCount(data.unavailable.length)
        setFulfillments((current) => {
          const next: FulfillmentMap = { ...current }
          for (const group of data.groups) {
            if (next[group.seller_id] != null) continue
            const options = sellerOptions(group)
            if (options.length > 0) next[group.seller_id] = options[0].value
          }
          return next
        })
      }
      setLoading(false)
    })
    return () => {
      active = false
    }
  }, [user, cartItemIds])

  const total = useMemo(() => groups.reduce((sum, group) => sum + group.subtotal, 0), [groups])

  const hasBlockingIssue = unavailableCount > 0 || groups.some((group) => sellerOptions(group).length === 0)

  if (cartItemIds.length === 0) {
    return (
      <div className="container page">
        <EmptyState
          title="Nothing to check out"
          body="Choose items in your cart before checking out."
          action={
            <Link className="btn btn--primary" to="/cart">
              Back to cart
            </Link>
          }
        />
      </div>
    )
  }

  if (loading) {
    return <LoadingState label="Preparing checkout…" />
  }

  if (loadError != null) {
    return (
      <div className="container page">
        <Alert variant="error" message={loadError} />
        <p className="page-note">
          <Link to="/cart">Back to cart</Link>
        </p>
      </div>
    )
  }

  if (groups.length === 0) {
    return (
      <div className="container page">
        <EmptyState
          title="Your selection is no longer available"
          body="One or more items were removed from your cart. Review your cart and try again."
          action={
            <Link className="btn btn--primary" to="/cart">
              Back to cart
            </Link>
          }
        />
      </div>
    )
  }

  const placeOrders = () => {
    setSubmitError(null)

    const fulfillmentMap: FulfillmentMap = {}
    const missing = groups.some((group) => {
      const value = fulfillments[group.seller_id]
      if (value == null) return true
      fulfillmentMap[group.seller_id] = value
      return false
    })
    if (missing) {
      setSubmitError('Choose a fulfillment option for every seller.')
      return
    }

    const expectedPrices: Record<string, number> = {}
    for (const group of groups) {
      for (const item of group.items) {
        if (item.listing != null) expectedPrices[item.id] = item.listing.price
      }
    }

    setSubmitting(true)
    void checkoutCart({
      cart_item_ids: cartItemIds,
      fulfillments: fulfillmentMap,
      expected_prices: expectedPrices,
    }).then(({ data, error }) => {
      setSubmitting(false)
      if (error != null || data == null) {
        setSubmitError(orderErrorLabel(error?.code ?? 'UNKNOWN'))
        if (error?.code === 'PRICE_CHANGED' || error?.code === 'INSUFFICIENT_STOCK') {
          window.location.reload()
        }
        return
      }
      navigate('/orders', { state: { placedOrders: data } })
    })
  }

  return (
    <div className="container page">
      <h1 className="page__title">Checkout</h1>
      <p className="page__intro">
        Review each seller's order and choose how you want to receive your items.
      </p>

      {unavailableCount > 0 ? (
        <Alert
          variant="error"
          message={`${unavailableCount} item${unavailableCount === 1 ? ' is' : 's are'} no longer available. Go back to your cart to remove ${unavailableCount === 1 ? 'it' : 'them'} before checking out.`}
        />
      ) : null}

      <div className="checkout">
        <div className="checkout__main">
          {groups.map((group) => {
            const options = sellerOptions(group)
            return (
              <GlassPanel key={group.seller_id} className="checkout-group">
                <div className="checkout-group__head">
                  <strong className="checkout-group__store">{group.store_name}</strong>
                  <span className="checkout-group__subtotal">
                    {formatCurrency(group.subtotal)}
                  </span>
                </div>

                <ul className="checkout-group__items">
                  {group.items.map((item) => {
                    const primary = (item.listing?.images ?? [])[0] ?? null
                    return (
                      <li key={item.id} className="checkout-item">
                        <div className="checkout-item__media">
                          {primary != null && primary.url != null ? (
                            <img className="checkout-item__image" src={primary.url} alt="" />
                          ) : (
                            <span className="checkout-item__placeholder" aria-hidden="true">
                              🏓
                            </span>
                          )}
                        </div>
                        <div className="checkout-item__body">
                          <strong>{item.listing?.title}</strong>
                          <span>
                            {item.quantity} × {formatCurrency(item.listing?.price ?? 0)}
                          </span>
                        </div>
                        <strong className="checkout-item__total">
                          {formatCurrency(item.line_total)}
                        </strong>
                      </li>
                    )
                  })}
                </ul>

                <fieldset className="form-field">
                  <legend className="form-field__label">
                    How will you get it?
                    <span className="form-field__required"> *</span>
                  </legend>
                  {options.length === 0 ? (
                    <p className="form-field__error">
                      These items need different fulfillment options — remove one from
                      your cart to continue.
                    </p>
                  ) : (
                    options.map((option) => (
                      <label key={option.value} className="radio-option">
                        <input
                          type="radio"
                          name={`checkout-fulfillment-${group.seller_id}`}
                          value={option.value}
                          checked={fulfillments[group.seller_id] === option.value}
                          onChange={() =>
                            setFulfillments((current) => ({
                              ...current,
                              [group.seller_id]: option.value,
                            }))
                          }
                        />
                        <span>
                          <strong>{option.label}</strong>
                          <small>{option.hint}</small>
                        </span>
                      </label>
                    ))
                  )}
                </fieldset>
              </GlassPanel>
            )
          })}
        </div>

        <aside className="checkout__summary" aria-label="Checkout summary">
          <GlassPanel>
            <h2 className="checkout__summary-title">Summary</h2>
            <dl className="checkout__summary-list">
              {groups.map((group) => (
                <div key={group.seller_id}>
                  <dt>{group.store_name}</dt>
                  <dd>{formatCurrency(group.subtotal)}</dd>
                </div>
              ))}
              <div className="checkout__summary-total">
                <dt>Total</dt>
                <dd>{formatCurrency(total)}</dd>
              </div>
            </dl>
            <SubmitButton
              loading={submitting}
              loadingLabel="Placing orders…"
              disabled={hasBlockingIssue}
              onClick={placeOrders}
            >
              Place orders
            </SubmitButton>
            {submitError != null ? <Alert variant="error" message={submitError} /> : null}
            <p className="checkout__summary-note">
              No fees are added yet. Payment and fulfillment details arrive in a
              later phase.
            </p>
          </GlassPanel>
        </aside>
      </div>

      <p className="page-note">
        <Link to="/cart">Back to cart</Link>
      </p>
    </div>
  )
}

export type { CheckoutOrder }
