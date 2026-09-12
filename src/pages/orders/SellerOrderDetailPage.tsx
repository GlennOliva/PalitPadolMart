import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useSeller } from '../../features/seller/useSeller'
import {
  cancelMarketplaceOrder,
  confirmMarketplaceOrder,
  getSellerOrder,
  orderErrorLabel,
} from '../../features/orders/orders.service'
import { formatOrderStatus, orderStatusBadgeVariant } from '../../features/orders/order-status'
import { isOrderCancellable } from '../../features/orders/orders-validation'
import type { OrderDetail } from '../../features/orders/orders.types'
import { formatCurrency, formatDateTime } from '../../utils/format'
import LoadingState from '../../components/common/LoadingState'
import Alert from '../../components/common/Alert'
import EmptyState from '../../components/common/EmptyState'
import Badge from '../../components/common/Badge'
import GlassPanel from '../../components/common/GlassPanel'
import SubmitButton from '../../components/common/SubmitButton'
import OrderTimeline from '../../components/orders/OrderTimeline'
import SellerPaymentPanel from '../../components/orders/SellerPaymentPanel'
import SellerFulfillmentActions from '../../components/orders/SellerFulfillmentActions'
import OrderDisputePanel from '../../components/disputes/OrderDisputePanel'

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="order-detail__row">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}

export default function SellerOrderDetailPage() {
  const { orderId = '' } = useParams()
  const { sellerProfile } = useSeller()
  const [order, setOrder] = useState<OrderDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [confirmConfirm, setConfirmConfirm] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [working, setWorking] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    if (sellerProfile == null) {
      setLoading(false)
      return
    }
    void getSellerOrder(sellerProfile.id, orderId).then(({ data, error: loadError }) => {
      if (loadError != null) {
        setError('We could not load this order. Please try again.')
        setOrder(null)
      } else {
        setOrder(data)
      }
      setLoading(false)
    })
  }, [sellerProfile, orderId])

  useEffect(() => {
    load()
  }, [load])

  if (loading) {
    return <LoadingState label="Loading order…" />
  }

  if (error != null) {
    return (
      <div className="container page">
        <Alert variant="error" message={error} />
        <p className="page-note">
          <Link to="/seller/orders">Back to incoming orders</Link>
        </p>
      </div>
    )
  }

  if (order == null) {
    return (
      <div className="container page">
        <EmptyState
          title="Order not found"
          body="This order is unavailable or does not belong to your store."
          action={
            <Link className="btn btn--primary" to="/seller/orders">
              Back to incoming orders
            </Link>
          }
        />
      </div>
    )
  }

  const isPending = isOrderCancellable(order.status)
  const isCancelled = order.status === 'cancelled'

  const handleConfirm = () => {
    if (!confirmConfirm) {
      setConfirmConfirm(true)
      setActionError(null)
      return
    }
    setWorking(true)
    setActionError(null)
    void confirmMarketplaceOrder(order.id).then(({ data, error: actionError }) => {
      setWorking(false)
      if (actionError != null || data == null) {
        setActionError(orderErrorLabel(actionError?.code ?? 'UNKNOWN'))
        setConfirmConfirm(false)
        return
      }
      setOrder((current) => (current == null ? current : { ...current, status: data.status }))
      setConfirmConfirm(false)
    })
  }

  const handleCancel = () => {
    if (!confirmCancel) {
      setConfirmCancel(true)
      setActionError(null)
      return
    }
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

  return (
    <div className="container page order-page">
      <div className="order-detail__head">
        <div>
          <h1 className="page__title">{order.order_number}</h1>
          <p className="page__intro">
            Placed {formatDateTime(order.created_at)} · {order.buyer_name ?? 'Buyer'}
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
            {order.items.map((item) => (
              <li key={item.listing_id} className="order-detail__item">
                <div>
                  <strong>{item.product_title}</strong>
                  <span>
                    {item.quantity} × {formatCurrency(item.unit_price)}
                  </span>
                </div>
                <strong>{formatCurrency(item.unit_price * item.quantity)}</strong>
              </li>
            ))}
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
            {order.paid_at != null ? (
              <DetailRow label="Paid">{formatDateTime(order.paid_at)}</DetailRow>
            ) : null}
            <DetailRow label="Last updated">{formatDateTime(order.updated_at)}</DetailRow>
            {order.notes != null ? (
              <DetailRow label="Buyer notes">{order.notes}</DetailRow>
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
                ) : null}
              </>
            ) : null}
          </dl>
        </GlassPanel>
      </div>

      <SellerPaymentPanel order={order} onUpdated={load} />
      <SellerFulfillmentActions order={order} onUpdated={load} />
      <OrderDisputePanel order={order} view="seller" />

      {actionError != null ? <Alert variant="error" message={actionError} /> : null}

      {isPending ? (
        <div className="order-detail__actions">
          {confirmConfirm ? (
            <GlassPanel intensity="soft" className="order-detail__confirm">
              <p>
                Confirm order {order.order_number}? This notifies the buyer that you
                accept it.
              </p>
              <div className="order-detail__confirm-actions">
                <SubmitButton loading={working} loadingLabel="Confirming…" onClick={handleConfirm}>
                  Yes, confirm order
                </SubmitButton>
                <button
                  type="button"
                  className="btn btn--ghost"
                  disabled={working}
                  onClick={() => setConfirmConfirm(false)}
                >
                  Not yet
                </button>
              </div>
            </GlassPanel>
          ) : (
            <button type="button" className="btn btn--primary" onClick={handleConfirm}>
              Confirm order
            </button>
          )}

          {confirmCancel ? (
            <GlassPanel intensity="soft" className="order-detail__confirm">
              <p>
                Cancel order {order.order_number}? The items will be returned to
                stock and the buyer will be notified.
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
      ) : null}

      <p className="page-note">
        <Link to="/seller/orders">Back to incoming orders</Link>
      </p>
    </div>
  )
}
