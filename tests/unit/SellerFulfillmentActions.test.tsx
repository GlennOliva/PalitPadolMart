import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import SellerFulfillmentActions from '../../src/components/orders/SellerFulfillmentActions'
import {
  startOrderPreparation,
  markOrderShipped,
  markOrderReadyForPickup,
} from '../../src/features/orders/fulfillment.service'
import type { Order, OrderDetail } from '../../src/features/orders/orders.types'

vi.mock('../../src/features/orders/orders.service', () => ({
  orderErrorLabel: (code: string) => `ERR:${code}`,
}))

vi.mock('../../src/features/orders/fulfillment.service', () => ({
  startOrderPreparation: vi.fn(),
  markOrderShipped: vi.fn(),
  markOrderReadyForPickup: vi.fn(),
}))

const mockedPrepare = vi.mocked(startOrderPreparation)
const mockedShip = vi.mocked(markOrderShipped)
const mockedReady = vi.mocked(markOrderReadyForPickup)

function makeOrder(overrides: Partial<OrderDetail> = {}): OrderDetail {
  return {
    id: 'order-1',
    order_number: 'PPB-0001',
    status: 'confirmed',
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
    buyer_name: 'Ana Test',
    ...overrides,
  }
}

function renderActions(
  order: OrderDetail = makeOrder(),
  onUpdated: () => void = vi.fn(),
) {
  return render(<SellerFulfillmentActions order={order} onUpdated={onUpdated} />)
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedPrepare.mockResolvedValue({ data: { status: 'preparing' } as unknown as Order, error: null })
  mockedReady.mockResolvedValue({ data: { status: 'ready_for_pickup' } as unknown as Order, error: null })
  mockedShip.mockResolvedValue({ data: { status: 'shipped' } as unknown as Order, error: null })
})

describe('SellerFulfillmentActions', () => {
  it('renders nothing for an order that cannot be fulfilled yet', () => {
    const { container } = renderActions(makeOrder({ status: 'pending' }))
    expect(container).toBeEmptyDOMElement()
  })

  it('starts preparation from a confirmed order', async () => {
    const onUpdated = vi.fn()
    renderActions(makeOrder(), onUpdated)

    fireEvent.click(screen.getByRole('button', { name: 'Start preparation' }))
    await waitFor(() => expect(mockedPrepare).toHaveBeenCalledWith('order-1'))
    expect(onUpdated).toHaveBeenCalled()
  })

  it('starts preparation from a paid order with the payment-verified hint', () => {
    renderActions(makeOrder({ status: 'paid' }))
    expect(screen.getByText(/Payment verified — start working this order/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Start preparation' })).toBeInTheDocument()
  })

  it('marks a pickup order ready for pickup while preparing', async () => {
    const onUpdated = vi.fn()
    renderActions(makeOrder({ status: 'preparing', fulfillment_type: 'pickup' }), onUpdated)

    fireEvent.click(screen.getByRole('button', { name: 'Mark ready for pickup' }))
    await waitFor(() => expect(mockedReady).toHaveBeenCalledWith('order-1'))
    expect(onUpdated).toHaveBeenCalled()
  })

  it('does not offer ready-for-pickup for a delivery order', () => {
    renderActions(makeOrder({ status: 'preparing', fulfillment_type: 'delivery' }))
    expect(screen.queryByRole('button', { name: 'Mark ready for pickup' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mark as shipped' })).toBeInTheDocument()
  })

  it('requires courier and tracking before shipping', async () => {
    renderActions(makeOrder({ status: 'preparing', fulfillment_type: 'delivery' }))

    fireEvent.click(screen.getByRole('button', { name: 'Mark as shipped' }))
    fireEvent.click(screen.getByRole('button', { name: 'Mark as shipped' }))

    expect(await screen.findByText('Courier is required.')).toBeInTheDocument()
    expect(screen.getByText('Tracking number is required.')).toBeInTheDocument()
    expect(mockedShip).not.toHaveBeenCalled()
  })

  it('ships a delivery order with the entered tracking details', async () => {
    const onUpdated = vi.fn()
    renderActions(makeOrder({ status: 'preparing', fulfillment_type: 'delivery' }), onUpdated)

    fireEvent.click(screen.getByRole('button', { name: 'Mark as shipped' }))
    fireEvent.change(screen.getByLabelText(/Courier/), { target: { value: 'J&T Express' } })
    fireEvent.change(screen.getByLabelText(/Tracking number/), { target: { value: 'JNT-2026-001' } })
    fireEvent.click(screen.getByRole('button', { name: 'Mark as shipped' }))

    await waitFor(() =>
      expect(mockedShip).toHaveBeenCalledWith('order-1', 'JNT-2026-001', 'J&T Express'),
    )
    expect(onUpdated).toHaveBeenCalled()
  })

  it('lets the seller cancel out of the shipping form', () => {
    renderActions(makeOrder({ status: 'preparing', fulfillment_type: 'delivery' }))

    fireEvent.click(screen.getByRole('button', { name: 'Mark as shipped' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.getByRole('button', { name: 'Mark as shipped' })).toBeInTheDocument()
    expect(screen.queryByLabelText(/Courier/)).not.toBeInTheDocument()
  })

  it('maps a ship failure through orderErrorLabel', async () => {
    mockedShip.mockResolvedValue({ data: null, error: { code: 'TRACKING_REQUIRED', message: 'no' } })
    renderActions(makeOrder({ status: 'preparing', fulfillment_type: 'delivery' }))

    fireEvent.click(screen.getByRole('button', { name: 'Mark as shipped' }))
    fireEvent.change(screen.getByLabelText(/Courier/), { target: { value: 'J&T' } })
    fireEvent.change(screen.getByLabelText(/Tracking number/), { target: { value: 'T1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Mark as shipped' }))

    expect(await screen.findByText('ERR:TRACKING_REQUIRED')).toBeInTheDocument()
  })
})

afterEach(() => {
  vi.clearAllMocks()
})