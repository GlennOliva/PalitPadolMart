import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../../features/auth/useAuth'
import {
  cancelMarketplaceOrder,
  deleteMyCancelledOrder,
  getBuyerOrder,
  orderErrorLabel,
} from '../../features/orders/orders.service'
import { confirmOrderReceived } from '../../features/orders/fulfillment.service'
import { getSellerPaymentMethods } from '../../features/orders/payments.service'
import { getMyOrderReviews } from '../../features/reviews/reviews.service'
import { formatOrderStatus, orderStatusBadgeVariant } from '../../features/orders/order-status'
import { isOrderCancellable } from '../../features/orders/orders-validation'
import type { OrderDetail } from '../../features/orders/orders.types'
import type { SellerPaymentMethod } from '../../features/orders/payments.types'
import { formatCurrency, formatDateTime } from '../../utils/format'
import LoadingState from '../../components/common/LoadingState'
import Alert from '../../components/common/Alert'
import EmptyState from '../../components/common/EmptyState'
import Badge from '../../components/common/Badge'
import GlassPanel from '../../components/common/GlassPanel'
import SubmitButton from '../../components/common/SubmitButton'
import OrderTimeline from '../../components/orders/OrderTimeline'
import BuyerPaymentPanel from '../../components/orders/BuyerPaymentPanel'
import OrderDisputePanel from '../../components/disputes/OrderDisputePanel'

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="order-detail__row">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}

export default function BuyerOrderDetailPage() {
  const { orderId = '' } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [order, setOrder] = useState<OrderDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [confirmReceived, setConfirmReceived] = useState(false)
  const [working, setWorking] = useState(false)
  const [methods, setMethods] = useState<SellerPaymentMethod[]>([])
  const [paymentMethodsLoaded, setPaymentMethodsLoaded] = useState(false)
  const [reviewedItems, setReviewedItems] = useState<Record<string, string>>({})

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    void getBuyerOrder(orderId).then(({ data, error: loadError }) => {
      if (loadError != null) {
        setError('We could not load this order. Please try again.')
        setOrder(null)
      } else {
        setOrder(data)
      }
      setLoading(false)
    })
  }, [orderId])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (order == null || user == null) {
      setPaymentMethodsLoaded(false)
      return
    }
    const payable =
      order.status === 'confirmed' &&
      (order.payment == null || order.payment.status === 'rejected')
    if (!payable) {
      setMethods([])
      setPaymentMethodsLoaded(false)
      return
    }
    void getSellerPaymentMethods(order.seller?.id ?? '').then(({ data }) => {
      setMethods(data ?? [])
      setPaymentMethodsLoaded(true)
    })
  }, [order, user])

  useEffect(() => {
    if (order?.status !== 'completed' || user == null) {
      setReviewedItems({})
      return
    }
    void getMyOrderReviews(order.id, user.id).then(({ data }) => {
      setReviewedItems(data ?? {})
    })
  }, [order, user])

  if (loading) {
    return <LoadingState label="Loading order…" />
  }

  if (error != null) {
    return (
      <div className="container page">
        <Alert variant="error" message={error} />
        <p className="page-note">
          <Link to="/orders">Back to my orders</Link>
        </p>
      </div>
    )
  }

  if (order == null) {
    return (
      <div className="container page">
        <EmptyState
          title="Order not found"
          body="This order is unavailable or does not belong to your account."
          action={
            <Link className="btn btn--primary" to="/orders">
              Back to my orders
            </Link>
          }
        />
      </div>
    )
  }

  const isPending = isOrderCancellable(order.status)
  const isCancelled = order.status === 'cancelled'
  const payment = order.payment
  const awaitingSellerReview =
    order.status === 'confirmed' &&
    (payment?.status === 'submitted' || payment?.status === 'pending')
  const needsPayment =
    order.status === 'confirmed' && (payment == null || payment.status === 'rejected')
  const canConfirmReceived =
    (order.status === 'shipped' || order.status === 'ready_for_pickup') &&
    payment?.status === 'paid'

  const handleConfirmReceived = () => {
    if (!confirmReceived) {
      setConfirmReceived(true)
      setActionError(null)
      return
    }
    setWorking(true)
    setActionError(null)
    void confirmOrderReceived(order.id).then(({ data, error: actionError }) => {
      setWorking(false)
      if (actionError != null || data == null) {
        setActionError(orderErrorLabel(actionError?.code ?? 'UNKNOWN'))
        setConfirmReceived(false)
        return
      }
      setOrder((current) => (current == null ? current : { ...current, status: data.status }))
      setConfirmReceived(false)
    })
  }

  const handleCancel = () => {
    if (!confirmCancel) {
      setConfirmCancel(true)
      setActionError(null)
      return
    }
    if (user == null) return
    setWorking(true)
    setActionError(null)
    void cancelMarketplaceOrder(order.id).then(({ data, error: actionError }) => {
      setWorking(false)
      if (actionError != null || data == null) {
        setActionError(orderErrorLabel(actionError?.code ?? 'UNKNOWN'))
        setConfirmCancel(false)
        return
      }
      setOrder((current) => (current == null ? current : { ...current, status: data.status }))
      setConfirmCancel(false)
    })
  }

  const handleDelete = () => {
    if (!confirmDelete) {
      setConfirmDelete(true)
      setActionError(null)
      return
    }
    if (user == null) return
    setWorking(true)
    setActionError(null)
    void deleteMyCancelledOrder(order.id).then(({ error: actionError }) => {
      setWorking(false)
      if (actionError != null) {
        setActionError(orderErrorLabel(actionError?.code ?? 'UNKNOWN'))
        setConfirmDelete(false)
        return
      }
      navigate('/orders')
    })
  }

  return (
    <div className="container page order-page">
      <div className="order-detail__head">
        <div>
          <h1 className="page__title">{order.order_number}</h1>
          <p className="page__intro">
            Placed {formatDateTime(order.created_at)} ·{' '}
            {order.seller?.store_name ?? 'Seller'}
          </p>
        </div>
        <Badge variant={orderStatusBadgeVariant(order.status)}>
          {formatOrderStatus(order.status)}
        </Badge>
      </div>

      {isCancelled ? (
        <Alert
          variant="info"
          message="This order was cancelled and its items returned to stock."
        />
      ) : null}

      {!isCancelled ? <OrderTimeline order={order} /> : null}

      <div className="order-detail">
        <GlassPanel className="order-detail__panel">
          <h2 className="order-detail__section-title">Items</h2>
          <ul className="order-detail__items">
            {order.items.map((item) => {
              const reviewed = reviewedItems[item.id]
              return (
                <li key={item.id} className="order-detail__item">
                  <div>
                    <strong>{item.product_title}</strong>
                    <span>
                      {item.quantity} × {formatCurrency(item.unit_price)}
                    </span>
                    {order.status === 'completed'
                      ? reviewed != null ? (
                          <span className="order-detail__reviewed" role="status">
                            ✓ Reviewed
                          </span>
                        ) : (
                          <Link
                            className="btn btn--secondary btn--sm"
                            to={`/orders/${order.id}/review/${item.id}`}
                          >
                            Review this item
                          </Link>
                        )
                      : null}
                  </div>
                  <strong>{formatCurrency(item.unit_price * item.quantity)}</strong>
                </li>
              )
            })}
          </ul>

          <dl className="order-detail__totals">
            <DetailRow label="Subtotal">{formatCurrency(order.subtotal)}</DetailRow>
            <DetailRow label="Total">{formatCurrency(order.total)}</DetailRow>
          </dl>
        </GlassPanel>

        <GlassPanel className="order-detail__panel">
          <h2 className="order-detail__section-title">Order details</h2>
          <dl className="order-detail__list">
            <DetailRow label="Status">{formatOrderStatus(order.status)}</DetailRow>
            <DetailRow label="Fulfillment">
              {order.fulfillment_type === 'pickup' ? 'Pickup' : 'Delivery'}
            </DetailRow>
            <DetailRow label="Placed">{formatDateTime(order.created_at)}</DetailRow>
            {order.confirmed_at != null ? (
              <DetailRow label="Confirmed">{formatDateTime(order.confirmed_at)}</DetailRow>
            ) : null}
            {order.paid_at != null || payment?.status === 'paid' ? (
              <DetailRow label="Paid">
                {formatDateTime(payment?.paid_at ?? order.paid_at ?? order.created_at)}
              </DetailRow>
            ) : null}
            <DetailRow label="Last updated">{formatDateTime(order.updated_at)}</DetailRow>
            {order.notes != null ? (
              <DetailRow label="Notes to seller">{order.notes}</DetailRow>
            ) : null}
            {order.fulfillment != null ? (
              <>
                {order.fulfillment_type === 'delivery' ? (
                  <>
                    <DetailRow label="Deliver to">
                      {[order.fulfillment.recipient_name, order.fulfillment.phone]
                        .filter(Boolean)
                        .join(' · ')}
                    </DetailRow>
                    <DetailRow label="Address">
                      {[
                        order.fulfillment.address,
                        order.fulfillment.city,
                        order.fulfillment.province,
                        order.fulfillment.postal_code,
                      ]
                        .filter(Boolean)
                        .join(', ')}
                    </DetailRow>
                  </>
                ) : (
                  <>
                    {order.fulfillment.pickup_location != null ? (
                      <DetailRow label="Pickup location">{order.fulfillment.pickup_location}</DetailRow>
                    ) : null}
                    {order.fulfillment.pickup_instructions != null ? (
                      <DetailRow label="Pickup instructions">
                        {order.fulfillment.pickup_instructions}
                      </DetailRow>
                    ) : null}
                  </>
                )}
                {order.fulfillment.courier != null ? (
                  <DetailRow label="Courier">{order.fulfillment.courier}</DetailRow>
                ) : null}
                {order.fulfillment.tracking_number != null ? (
                  <DetailRow label="Tracking number">{order.fulfillment.tracking_number}</DetailRow>
                ) : null}
              </>
            ) : null}
          </dl>
        </GlassPanel>
      </div>

      {needsPayment && paymentMethodsLoaded ? (
        <BuyerPaymentPanel
          order={order}
          buyerId={user?.id ?? ''}
          methods={methods}
          onUpdated={load}
        />
      ) : null}

      {awaitingSellerReview ? (
        <Alert
          variant="info"
          message={
            payment?.status === 'submitted'
              ? 'Your payment details were submitted and are awaiting the seller’s verification.'
              : 'Your payment will be collected at the handoff. The seller has been notified.'
          }
        />
      ) : null}

      <OrderDisputePanel order={order} view="buyer" />

      {actionError != null ? <Alert variant="error" message={actionError} /> : null}

      {isPending ? (
        <div className="order-detail__actions">
          {confirmCancel ? (
            <GlassPanel intensity="soft" className="order-detail__confirm">
              <p>
                Cancel order {order.order_number}? The items will be returned to
                stock and the seller will be notified.
              </p>
              <div className="order-detail__confirm-actions">
                <SubmitButton loading={working} loadingLabel="Cancelling…" onClick={handleCancel}>
                  Yes, cancel order
                </SubmitButton>
                <button
                  type="button"
                  className="btn btn--ghost"
                  disabled={working}
                  onClick={() => setConfirmCancel(false)}
                >
                  Keep order
                </button>
              </div>
            </GlassPanel>
          ) : (
            <button type="button" className="btn btn--secondary" onClick={handleCancel}>
              Cancel order
            </button>
          )}
        </div>
      ) : isCancelled ? (
        <div className="order-detail__actions">
          {confirmDelete ? (
            <GlassPanel intensity="soft" className="order-detail__confirm">
              <p>Remove this cancelled order from your history? This cannot be undone.</p>
              <div className="order-detail__confirm-actions">
                <SubmitButton loading={working} loadingLabel="Removing…" onClick={handleDelete}>
                  Yes, remove order
                </SubmitButton>
                <button
                  type="button"
                  className="btn btn--ghost"
                  disabled={working}
                  onClick={() => setConfirmDelete(false)}
                >
                  Keep it
                </button>
              </div>
            </GlassPanel>
          ) : (
            <button type="button" className="btn btn--secondary" onClick={handleDelete}>
              Remove from history
            </button>
          )}
        </div>
      ) : canConfirmReceived ? (
        <div className="order-detail__actions">
          {confirmReceived ? (
            <GlassPanel intensity="soft" className="order-detail__confirm">
              <p>
                Confirm you received your items for {order.order_number}? This completes
                the order.
              </p>
              <div className="order-detail__confirm-actions">
                <SubmitButton
                  loading={working}
                  loadingLabel="Confirming…"
                  onClick={handleConfirmReceived}
                >
                  Yes, I received my items
                </SubmitButton>
                <button
                  type="button"
                  className="btn btn--ghost"
                  disabled={working}
                  onClick={() => setConfirmReceived(false)}
                >
                  Not yet
                </button>
              </div>
            </GlassPanel>
          ) : (
            <button type="button" className="btn btn--primary" onClick={handleConfirmReceived}>
              Confirm received
            </button>
          )}
        </div>
      ) : null}

      <p className="page-note">
        <Link to="/orders">Back to my orders</Link>
      </p>
    </div>
  )
}
