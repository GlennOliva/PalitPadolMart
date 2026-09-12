import { formatDateTime } from '../../utils/format'
import type { OrderSummary } from '../../features/orders/orders.types'

interface Milestone {
  key: string
  label: string
  at: string | null
  reached: boolean
}

function buildMilestones(order: OrderSummary): Milestone[] {
  const milestones: Milestone[] = [
    { key: 'placed', label: 'Placed', at: order.created_at, reached: true },
    { key: 'confirmed', label: 'Confirmed', at: order.confirmed_at, reached: order.confirmed_at != null },
    {
      key: 'paid',
      label: 'Paid',
      at: order.payment?.status === 'paid' ? order.payment.paid_at ?? order.paid_at : null,
      reached: order.payment?.status === 'paid',
    },
    {
      key: 'preparing',
      label: 'Preparing',
      at: order.preparing_at,
      reached: order.preparing_at != null,
    },
    {
      key: 'handoff',
      label: order.fulfillment_type === 'delivery' ? 'Shipped' : 'Ready for pickup',
      at: order.fulfillment_type === 'delivery' ? order.shipped_at : order.ready_for_pickup_at,
      reached:
        order.fulfillment_type === 'delivery'
          ? order.shipped_at != null
          : order.ready_for_pickup_at != null,
    },
    {
      key: 'completed',
      label: 'Completed',
      at: order.completed_at,
      reached: order.completed_at != null,
    },
  ]
  if (order.status === 'cancelled') {
    milestones.push({
      key: 'cancelled',
      label: 'Cancelled',
      at: order.cancelled_at,
      reached: true,
    })
  }
  return milestones
}

/** Horizontal milestone stepper driven by the trusted server timestamps. */
export default function OrderTimeline({ order }: { order: OrderSummary }) {
  const milestones = buildMilestones(order)

  return (
    <ol className="order-timeline" aria-label="Order progress">
      {milestones.map((milestone) => (
        <li
          key={milestone.key}
          className={`order-timeline__step${milestone.reached ? ' order-timeline__step--done' : ''}`}
        >
          <span className="order-timeline__dot" aria-hidden="true" />
          <div className="order-timeline__body">
            <strong className="order-timeline__label">{milestone.label}</strong>
            {milestone.at != null ? (
              <time className="order-timeline__time" dateTime={milestone.at}>
                {formatDateTime(milestone.at)}
              </time>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  )
}
