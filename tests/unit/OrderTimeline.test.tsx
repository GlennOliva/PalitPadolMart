import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import OrderTimeline from '../../src/components/orders/OrderTimeline'
import type { OrderSummary } from '../../src/features/orders/orders.types'

function makeOrder(overrides: Partial<OrderSummary> = {}): OrderSummary {
  return {
    id: 'order-1',
    order_number: 'ORD-0001',
    status: 'pending',
    fulfillment_type: 'delivery',
    subtotal: 2000,
    total: 2000,
    notes: null,
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z',
    confirmed_at: null,
    paid_at: null,
    preparing_at: null,
    shipped_at: null,
    ready_for_pickup_at: null,
    completed_at: null,
    cancelled_at: null,
    seller: { id: 'seller-1', store_name: 'Ace Paddles PH' },
    items: [],
    payment: null,
    fulfillment: null,
    buyer_name: null,
    ...overrides,
  }
}

describe('OrderTimeline', () => {
  it('marks only the placed step as reached for a fresh order', () => {
    render(<OrderTimeline order={makeOrder()} />)

    const steps = screen.getAllByRole('listitem')
    expect(steps).toHaveLength(6)
    expect(steps[0]).toHaveClass('order-timeline__step--done')
    expect(steps[1]).not.toHaveClass('order-timeline__step--done')
  })

  it('labels the handoff step Shipped for delivery orders', () => {
    render(<OrderTimeline order={makeOrder()} />)
    expect(screen.getByText('Shipped')).toBeInTheDocument()
  })

  it('labels the handoff step Ready for pickup for pickup orders', () => {
    render(<OrderTimeline order={makeOrder({ fulfillment_type: 'pickup' })} />)
    expect(screen.getByText('Ready for pickup')).toBeInTheDocument()
  })

  it('marks paid when the payment row is paid and shows the paid timestamp', () => {
    render(
      <OrderTimeline
        order={makeOrder({
          status: 'shipped',
          confirmed_at: '2026-08-02T00:00:00.000Z',
          preparing_at: '2026-08-03T00:00:00.000Z',
          shipped_at: '2026-08-04T00:00:00.000Z',
          payment: {
            id: 'pay-1',
            order_id: 'order-1',
            amount: 2000,
            payment_method: 'manual_transfer',
            payment_reference: 'ref',
            proof_path: 'user-1/order-1/proof.png',
            rejection_reason: null,
            status: 'paid',
            paid_at: '2026-08-02T10:00:00.000Z',
            created_at: '2026-08-02T00:00:00.000Z',
            updated_at: '2026-08-02T10:00:00.000Z',
          },
        })}
      />,
    )

    const steps = screen.getAllByRole('listitem')
    expect(steps[2]).toHaveClass('order-timeline__step--done')
    expect(screen.getByText('Paid')).toBeInTheDocument()
  })

  it('appends a Cancelled step for cancelled orders', () => {
    render(
      <OrderTimeline
        order={makeOrder({ status: 'cancelled', cancelled_at: '2026-08-02T00:00:00.000Z' })}
      />,
    )
    const steps = screen.getAllByRole('listitem')
    expect(steps).toHaveLength(7)
    expect(screen.getByText('Cancelled')).toBeInTheDocument()
  })
})
