import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useSeller } from '../../features/seller/useSeller'
import { getSellerOrders } from '../../features/orders/orders.service'
import { formatOrderStatus, orderStatusBadgeVariant } from '../../features/orders/order-status'
import type { OrderSummary, OrdersPage } from '../../features/orders/orders.types'
import { formatCurrency, formatDateTime } from '../../utils/format'
import PageHeader from '../../components/common/PageHeader'
import Badge from '../../components/common/Badge'
import Alert from '../../components/common/Alert'
import EmptyState from '../../components/common/EmptyState'
import LoadingState from '../../components/common/LoadingState'
import Pagination from '../../components/marketplace/Pagination'

function OrderCard({ order }: { order: OrderSummary }) {
  const item = order.items[0]
  return (
    <li key={order.id}>
      <Link className="order-list__item" to={`/seller/orders/${order.id}`}>
        <div className="order-list__head">
          <strong className="order-list__number">{order.order_number}</strong>
          <Badge variant={orderStatusBadgeVariant(order.status)}>
            {formatOrderStatus(order.status)}
          </Badge>
        </div>
        <p className="order-list__product">
          {item != null ? item.product_title : 'Listing'} ·{' '}
          {item != null ? `${item.quantity} × ${formatCurrency(item.unit_price)}` : '—'}
        </p>
        <p className="order-list__seller">{order.buyer_name ?? 'Buyer'} · {order.fulfillment_type}</p>
        <div className="order-list__meta">
          <span>{formatDateTime(order.created_at)}</span>
          <strong className="order-list__total">{formatCurrency(order.total)}</strong>
        </div>
      </Link>
    </li>
  )
}

export default function SellerOrdersPage() {
  const { sellerProfile } = useSeller()
  const [result, setResult] = useState<OrdersPage | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)

  const load = useCallback(
    (targetPage: number) => {
      if (sellerProfile == null) return
      setLoading(true)
      setError(null)
      void getSellerOrders(sellerProfile.id, targetPage).then(({ data, error: loadError }) => {
        if (loadError != null || data == null) {
          setError('We could not load your orders. Please try again.')
          setResult(null)
        } else {
          setResult(data)
          setPage(data.page)
        }
        setLoading(false)
      })
    },
    [sellerProfile],
  )

  useEffect(() => {
    load(1)
  }, [load])

  const goToPage = (targetPage: number) => {
    if (targetPage === page || targetPage < 1) return
    load(targetPage)
  }

  if (loading && result == null) {
    return <LoadingState label="Loading orders…" />
  }

  if (error != null) {
    return (
      <div className="container page">
        <Alert variant="error" message={error} />
        <button type="button" className="btn btn--primary" onClick={() => load(1)}>
          Try again
        </button>
      </div>
    )
  }

  if (result == null || result.data.length === 0) {
    return (
      <div className="container page">
        <PageHeader
          title="Incoming orders"
          intro="Orders buyers place on your listings, newest first."
        />
        <EmptyState
          title="No orders yet"
          body="When a buyer places an order on one of your listings, it will appear here."
          action={
            <Link className="btn btn--primary" to="/seller/listings">
              Manage your listings
            </Link>
          }
        />
      </div>
    )
  }

  return (
    <div className="container page">
      <PageHeader
        title="Incoming orders"
        intro="Orders buyers place on your listings, newest first."
      />

      <ul className="order-list">
        {result.data.map((order) => (
          <OrderCard key={order.id} order={order} />
        ))}
      </ul>

      <Pagination page={result.page} totalPages={result.totalPages} onPageChange={goToPage} />

      <p className="page-note">
        <Link to="/seller">Back to seller dashboard</Link>
      </p>
    </div>
  )
}
