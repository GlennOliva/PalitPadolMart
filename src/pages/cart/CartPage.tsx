import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../features/auth/useAuth'
import {
  getCart,
  orderErrorLabel,
  removeCartItem,
  updateCartItemQuantity,
} from '../../features/cart/cart.service'
import type { CartItemDisplay, CartSellerGroup, CartSummary } from '../../features/cart/cart.types'
import { validateCartQuantity } from '../../features/cart/cart-validation'
import { formatCurrency } from '../../utils/format'
import LoadingState from '../../components/common/LoadingState'
import Alert from '../../components/common/Alert'
import EmptyState from '../../components/common/EmptyState'
import GlassPanel from '../../components/common/GlassPanel'
import PageHeader from '../../components/common/PageHeader'

function QuantitySelect({
  item,
  busy,
  onChange,
}: {
  item: CartItemDisplay
  busy: boolean
  onChange: (quantity: number) => void
}) {
  const stock = item.listing?.quantity ?? 0
  const max = Math.min(stock, 1000)
  return (
    <label className="cart-item__quantity">
      <span className="visually-hidden">Quantity of {item.listing?.title}</span>
      <select
        className="form-field__input form-field__input--sm"
        value={item.quantity}
        disabled={busy}
        onChange={(event) => onChange(Number(event.target.value))}
      >
        {Array.from({ length: max }, (_, index) => index + 1).map((value) => (
          <option key={value} value={value}>
            {value}
          </option>
        ))}
      </select>
    </label>
  )
}

function CartItemRow({
  item,
  selected,
  busy,
  onToggle,
  onQuantityChange,
  onRemove,
}: {
  item: CartItemDisplay
  selected: boolean
  busy: boolean
  onToggle: () => void
  onQuantityChange: (quantity: number) => void
  onRemove: () => void
}) {
  const listing = item.listing
  const primary = (listing?.images ?? [])[0] ?? null
  const maxQuantity = Math.min(listing?.quantity ?? 0, 1000)

  return (
    <li className="cart-item" key={item.id}>
      <label className="cart-item__check">
        <input
          type="checkbox"
          checked={selected}
          disabled={busy || item.unavailable || maxQuantity < 1}
          onChange={onToggle}
          aria-label={`Select ${listing?.title ?? 'this item'}`}
        />
      </label>
      <div className="cart-item__media">
        {primary != null && primary.url != null ? (
          <img className="cart-item__image" src={primary.url} alt="" />
        ) : (
          <span className="cart-item__placeholder" aria-hidden="true">
            🏓
          </span>
        )}
      </div>
      <div className="cart-item__body">
        {listing != null ? (
          <>
            <Link className="cart-item__title" to={`/marketplace/${item.listing_id}`}>
              {listing.title}
            </Link>
            <p className="cart-item__meta">
              {listing.category?.name ?? 'Uncategorized'} · {formatCurrency(listing.price)} each
              {listing.seller != null ? ` · ${listing.seller.store_name ?? 'Seller'}` : ''}
            </p>
          </>
        ) : (
          <>
            <span className="cart-item__title cart-item__title--unavailable">
              This item is no longer available
            </span>
            <p className="cart-item__meta">
              It may have been sold, archived, or removed by the seller.
            </p>
          </>
        )}
      </div>
      <QuantitySelect item={item} busy={busy} onChange={onQuantityChange} />
      <strong className="cart-item__total">{formatCurrency(item.line_total)}</strong>
      <button
        type="button"
        className="btn btn--ghost btn--sm"
        disabled={busy}
        onClick={onRemove}
        aria-label={`Remove ${listing?.title ?? 'item'}`}
      >
        Remove
      </button>
    </li>
  )
}

function SellerGroup({
  group,
  selected,
  busyIds,
  onToggleItem,
  onToggleSeller,
  onQuantityChange,
  onRemove,
}: {
  group: CartSellerGroup
  selected: Set<string>
  busyIds: Set<string>
  onToggleItem: (id: string) => void
  onToggleSeller: (sellerId: string) => void
  onQuantityChange: (id: string, quantity: number) => void
  onRemove: (id: string) => void
}) {
  const allSelected = group.items.length > 0 && group.items.every((item) => selected.has(item.id))
  const groupBusy = group.items.some((item) => busyIds.has(item.id))

  return (
    <GlassPanel className="cart-group">
      <div className="cart-group__head">
        <label className="cart-group__check">
          <input
            type="checkbox"
            checked={allSelected}
            disabled={groupBusy || group.items.length === 0}
            onChange={() => onToggleSeller(group.seller_id)}
            aria-label={`Select all items from ${group.store_name}`}
          />
          <strong className="cart-group__store">{group.store_name}</strong>
        </label>
        <span className="cart-group__subtotal">{formatCurrency(group.subtotal)}</span>
      </div>
      <ul className="cart-group__items">
        {group.items.map((item) => (
          <CartItemRow
            key={item.id}
            item={item}
            selected={selected.has(item.id)}
            busy={busyIds.has(item.id)}
            onToggle={() => onToggleItem(item.id)}
            onQuantityChange={(quantity) => onQuantityChange(item.id, quantity)}
            onRemove={() => onRemove(item.id)}
          />
        ))}
      </ul>
    </GlassPanel>
  )
}

export default function CartPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [summary, setSummary] = useState<CartSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set())
  const [actionError, setActionError] = useState<string | null>(null)

  const load = useCallback(() => {
    if (user == null) return
    setLoading(true)
    setError(null)
    void getCart(user.id).then(({ data, error: loadError }) => {
      if (loadError != null) {
        setError('We could not load your cart. Please try again.')
        setSummary(null)
      } else {
        setSummary(data)
        const available = new Set(
          data.groups.flatMap((group) => group.items.filter((item) => !item.unavailable).map((item) => item.id)),
        )
        setSelected((current) => new Set([...current].filter((id) => available.has(id))))
      }
      setLoading(false)
    })
  }, [user])

  useEffect(() => {
    load()
  }, [load])

  const availableIds = useMemo(() => {
    if (summary == null) return new Set<string>()
    return new Set(
      summary.groups.flatMap((group) => group.items.filter((item) => !item.unavailable).map((item) => item.id)),
    )
  }, [summary])

  const allSelected = availableIds.size > 0 && availableIds.size === selected.size

  const setBusy = (id: string, busy: boolean) => {
    setBusyIds((current) => {
      const next = new Set(current)
      if (busy) next.add(id)
      else next.delete(id)
      return next
    })
  }

  const handleQuantityChange = (id: string, quantity: number) => {
    if (summary == null) return
    const item = summary.groups.flatMap((group) => group.items).find((entry) => entry.id === id)
    const stock = item?.listing?.quantity ?? 0
    const validationError = validateCartQuantity(quantity, stock)
    if (validationError != null) {
      setActionError(validationError)
      return
    }
    setActionError(null)
    setBusy(id, true)
    void updateCartItemQuantity(id, quantity).then(({ error: updateError }) => {
      setBusy(id, false)
      if (updateError != null) {
        setActionError(orderErrorLabel(updateError.code as never))
        return
      }
      load()
    })
  }

  const handleRemove = (id: string) => {
    setActionError(null)
    setBusy(id, true)
    void removeCartItem(id).then(({ error: removeError }) => {
      setBusy(id, false)
      if (removeError != null) {
        setActionError('We could not remove that item. Please try again.')
        return
      }
      setSelected((current) => {
        const next = new Set(current)
        next.delete(id)
        return next
      })
      load()
    })
  }

  const toggleItem = (id: string) => {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSeller = (sellerId: string) => {
    if (summary == null) return
    const group = summary.groups.find((entry) => entry.seller_id === sellerId)
    if (group == null) return
    const ids = group.items.filter((item) => !item.unavailable).map((item) => item.id)
    const allOn = ids.every((id) => selected.has(id))
    setSelected((current) => {
      const next = new Set(current)
      for (const id of ids) {
        if (allOn) next.delete(id)
        else next.add(id)
      }
      return next
    })
  }

  const toggleAll = () => {
    setSelected((current) => {
      if (availableIds.size === current.size) {
        return new Set([...current].filter((id) => !availableIds.has(id)))
      }
      const next = new Set(current)
      for (const id of availableIds) next.add(id)
      return next
    })
  }

  const selectedSubtotal = useMemo(() => {
    if (summary == null) return 0
    return summary.groups
      .flatMap((group) => group.items)
      .filter((item) => selected.has(item.id))
      .reduce((sum, item) => sum + item.line_total, 0)
  }, [summary, selected])

  const selectedUnits = useMemo(() => {
    if (summary == null) return 0
    return summary.groups
      .flatMap((group) => group.items)
      .filter((item) => selected.has(item.id))
      .reduce((sum, item) => sum + item.quantity, 0)
  }, [summary, selected])

  const goToCheckout = () => {
    if (selected.size === 0) return
    navigate('/checkout', { state: { cartItemIds: [...selected] } })
  }

  if (loading && summary == null) {
    return <LoadingState label="Loading your cart…" />
  }

  if (error != null) {
    return (
      <div className="container page">
        <Alert variant="error" message={error} />
        <button type="button" className="btn btn--primary" onClick={load}>
          Try again
        </button>
      </div>
    )
  }

  if (summary == null || (summary.groups.length === 0 && summary.unavailable.length === 0)) {
    return (
      <div className="container page">
        <PageHeader title="Your cart" intro="Review your items before checking out." />
        <EmptyState
          title="Your cart is empty"
          body="Add paddle gear you like and it will show up here, ready to check out."
          action={
            <Link className="btn btn--primary" to="/marketplace">
              Browse the marketplace
            </Link>
          }
        />
      </div>
    )
  }

  return (
    <div className="container page">
      <PageHeader
        title="Your cart"
        intro="Review your items before checking out. Prices and stock are re-checked at checkout."
      />

      {actionError != null ? <Alert variant="error" message={actionError} /> : null}

      <div className="cart">
        <div className="cart__main">
          <div className="cart__toolbar">
            <label className="cart__select-all">
              <input
                type="checkbox"
                checked={allSelected}
                disabled={availableIds.size === 0}
                onChange={toggleAll}
              />
              <span>Select all items</span>
            </label>
          </div>

          {summary.groups.map((group) => (
            <SellerGroup
              key={group.seller_id}
              group={group}
              selected={selected}
              busyIds={busyIds}
              onToggleItem={toggleItem}
              onToggleSeller={toggleSeller}
              onQuantityChange={handleQuantityChange}
              onRemove={handleRemove}
            />
          ))}

          {summary.unavailable.length > 0 ? (
            <section className="cart__unavailable" aria-label="Unavailable items">
              <h2 className="cart__section-title">Unavailable items</h2>
              <p className="cart__section-note">
                These items could not be checked out — they may have been sold or
                removed by the seller.
              </p>
              <ul className="cart-group__items">
                {summary.unavailable.map((item) => (
                  <CartItemRow
                    key={item.id}
                    item={item}
                    selected={false}
                    busy={busyIds.has(item.id)}
                    onToggle={() => undefined}
                    onQuantityChange={() => undefined}
                    onRemove={() => handleRemove(item.id)}
                  />
                ))}
              </ul>
            </section>
          ) : null}
        </div>

        <aside className="cart__summary" aria-label="Cart summary">
          <GlassPanel>
            <h2 className="cart__summary-title">Order summary</h2>
            <dl className="cart__summary-list">
              <div>
                <dt>Items selected</dt>
                <dd>
                  {selected.size} {selected.size === 1 ? 'item' : 'items'} ({selectedUnits} units)
                </dd>
              </div>
              <div className="cart__summary-total">
                <dt>Subtotal</dt>
                <dd>{formatCurrency(selectedSubtotal)}</dd>
              </div>
            </dl>
            <button
              type="button"
              className="btn btn--primary btn--block"
              disabled={selected.size === 0}
              onClick={goToCheckout}
            >
              Checkout
            </button>
            <p className="cart__summary-note">
              {selected.size > 0
                ? 'Orders are split per seller. You will choose pickup or delivery for each one next.'
                : 'Select at least one item to continue.'}
            </p>
          </GlassPanel>
        </aside>
      </div>

      <p className="page-note">
        <Link to="/marketplace">Continue shopping</Link>
      </p>
    </div>
  )
}
