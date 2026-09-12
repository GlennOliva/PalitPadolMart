import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getOrderDispute } from '../../features/disputes/disputes.service'
import { isOrderDisputable } from '../../features/disputes/disputes.types'
import type { DisputeSummary } from '../../features/disputes/disputes.types'
import type { OrderDetail } from '../../features/orders/orders.types'
import Alert from '../common/Alert'
import Badge from '../common/Badge'
import GlassPanel from '../common/GlassPanel'

interface OrderDisputePanelProps {
  order: OrderDetail
  view: 'buyer' | 'seller'
}

function statusLabel(status: DisputeSummary['status']): string {
  return status.replaceAll('_', ' ').replace(/^./, (letter) => letter.toUpperCase())
}

export default function OrderDisputePanel({ order, view }: OrderDisputePanelProps) {
  const [dispute, setDispute] = useState<DisputeSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    setLoading(true)
    setError(null)
    void getOrderDispute(order.id).then(({ data, error }) => {
      if (!active) return
      setDispute(data)
      setError(error?.message ?? null)
      setLoading(false)
    })
    return () => {
      active = false
    }
  }, [order.id])

  if (loading) {
    return <p className="dispute-order-panel__loading" role="status">Checking for a dispute...</p>
  }

  if (error != null) {
    return <Alert variant="error" message="We could not check this order's dispute status." />
  }

  if (dispute == null && view === 'seller') return null
  if (dispute == null && !isOrderDisputable(order.status)) return null

  const detailPath = view === 'seller'
    ? `/seller/disputes/${dispute?.id ?? ''}`
    : `/disputes/${dispute?.id ?? ''}`

  return (
    <GlassPanel intensity="soft" className="dispute-order-panel">
      <div>
        <p className="dispute-order-panel__eyebrow">Order support</p>
        <h2>{dispute == null ? 'Need help with this order?' : 'Order dispute'}</h2>
        <p>
          {dispute == null
            ? 'If something went wrong, you can report the problem and contact the seller.'
            : `A dispute for this order is ${statusLabel(dispute.status).toLowerCase()}.`}
        </p>
      </div>
      {dispute != null ? (
        <div className="dispute-order-panel__action">
          <Badge variant={dispute.status}>{statusLabel(dispute.status)}</Badge>
          <Link className="btn btn--secondary" to={detailPath}>View dispute</Link>
        </div>
      ) : (
        <Link className="btn btn--ghost" to={`/orders/${order.id}/dispute`}>
          Report a problem
        </Link>
      )}
    </GlassPanel>
  )
}
