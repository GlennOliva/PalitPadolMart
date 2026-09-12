import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { getBuyerOrder } from '../../features/orders/orders.service'
import { formatCurrency, formatDateTime } from '../../utils/format'
import LoadingState from '../../components/common/LoadingState'
import Alert from '../../components/common/Alert'
import EmptyState from '../../components/common/EmptyState'
import ReviewForm from '../../components/reviews/ReviewForm'
import type { ReviewRecord } from '../../features/reviews/reviews.types'

/**
 * Review a single order item from a completed order. The order is loaded
 * through the buyer-scoped RLS query; the matching item gates whether a
 * review is allowed (the RPC re-validates everything server-side).
 */
export default function ReviewItemPage() {
  const { orderId = '', orderItemId = '' } = useParams()
  const navigate = useNavigate()
  const [order, setOrder] = useState<Awaited<ReturnType<typeof getBuyerOrder>>['data'] | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    void getBuyerOrder(orderId).then(({ data, error: loadError }) => {
      if (loadError != null || data == null) {
        setOrder(null)
      } else {
        setOrder(data)
      }
      setLoading(false)
    })
  }, [orderId])

  if (loading) {
    return <LoadingState label="Loading review…" />
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

  const item = order.items.find((entry) => entry.id === orderItemId)
  if (item == null) {
    return (
      <div className="container page">
        <Alert variant="error" message="This item could not be found in your order." />
        <p className="page-note">
          <Link to={`/orders/${order.id}`}>Back to order</Link>
        </p>
      </div>
    )
  }

  if (order.status !== 'completed') {
    return (
      <div className="container page">
        <EmptyState
          title="Order not completed yet"
          body="You can review this item once the order is completed."
          action={
            <Link className="btn btn--primary" to={`/orders/${order.id}`}>
              Back to order
            </Link>
          }
        />
      </div>
    )
  }

  return (
    <div className="container page">
      <div className="review-page">
        <h1 className="page__title">Leave a review</h1>
        <p className="page__intro">
          Order {order.order_number} · placed {formatDateTime(order.created_at)}
        </p>

        <div className="review-page__item glass glass--soft">
          <strong>{item.product_title}</strong>
          <span>
            {item.quantity} × {formatCurrency(item.unit_price)}
          </span>
        </div>

        <ReviewForm
          orderItemId={item.id}
          productTitle={item.product_title}
          onSuccess={(review: ReviewRecord) => {
            navigate(`/orders/${order.id}#reviewed-${review.orderItemId}`)
          }}
        />
      </div>
    </div>
  )
}