import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import SellerOrderDetailPage from '../../src/pages/orders/SellerOrderDetailPage'
import {
  getSellerOrder,
  confirmMarketplaceOrder,
  cancelMarketplaceOrder,
} from '../../src/features/orders/orders.service'
import type { PostgrestError } from '@supabase/supabase-js'
import type { Order, OrderDetail } from '../../src/features/orders/orders.types'
import { createSellerValue, makeSellerProfile, renderWithSeller } from '../utils/seller'

vi.mock('../../src/features/orders/orders.service', () => ({
  getSellerOrder: vi.fn(),
  confirmMarketplaceOrder: vi.fn(),
  cancelMarketplaceOrder: vi.fn(),
  orderErrorLabel: (code: string) => `ERR:${code}`,
}))

vi.mock('../../src/features/orders/payments.service', () => ({
  approveOrderPayment: vi.fn(),
  rejectOrderPayment: vi.fn(),
  markCashReceived: vi.fn(),
  submitOrderPayment: vi.fn(),
  uploadPaymentProof: vi.fn(),
  paymentProofUrl: vi.fn(),
  getSellerPaymentMethods: vi.fn(),
  setSellerPaymentMethod: vi.fn(),
}))

vi.mock('../../src/features/orders/fulfillment.service', () => ({
  startOrderPreparation: vi.fn(),
  markOrderShipped: vi.fn(),
  markOrderReadyForPickup: vi.fn(),
  confirmOrderReceived: vi.fn(),
  cashIsCollectable: vi.fn(() => false),
}))

vi.mock('../../src/components/disputes/OrderDisputePanel', () => ({
  default: ({ order, view }: { order: { id: string; status: string }; view: string }) => (
    <div data-testid="order-dispute-panel">{`${view}:${order.id}:${order.status}`}</div>
  ),
}))

const mockedGet = vi.mocked(getSellerOrder)
const mockedConfirm = vi.mocked(confirmMarketplaceOrder)
const mockedCancel = vi.mocked(cancelMarketplaceOrder)

function makeOrder(overrides: Partial<OrderDetail> & { paymentStatus?: 'submitted' | 'paid' } = {}): OrderDetail {
  const { paymentStatus, ...rest } = overrides
  return {
    id: 'order-1',
    order_number: 'PPB-0001',
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
    items: [{ id: 'item-1', listing_id: 'list-1', product_title: 'Pro Pickle Paddle', unit_price: 2000, quantity: 1 }],
    payment: paymentStatus != null
      ? {
          id: 'pay-1',
          order_id: 'order-1',
          amount: 2000,
          payment_method: 'manual_transfer',
          payment_reference: 'GCASH-1',
          proof_path: null,
          rejection_reason: null,
          status: paymentStatus,
          paid_at: paymentStatus === 'paid' ? '2026-08-03T00:00:00.000Z' : null,
          created_at: '2026-08-02T00:00:00.000Z',
          updated_at: '2026-08-02T00:00:00.000Z',
        }
      : null,
    fulfillment: null,
    buyer_name: 'Ana Test',
    ...rest,
  }
}

function renderPage(
  order: OrderDetail | null = makeOrder(),
  loadError: { code: string; message: string } | null = null,
  sellerId: string | null = 'seller-1',
) {
  mockedGet.mockResolvedValue({ data: order, error: loadError as PostgrestError | null })
  return render(
    renderWithSeller(
      <MemoryRouter initialEntries={['/seller/orders/order-1']}>
        <Routes>
          <Route path="/seller/orders/:orderId" element={<SellerOrderDetailPage />} />
          <Route path="/seller/orders" element={<div>ORDERS PAGE</div>} />
        </Routes>
      </MemoryRouter>,
      createSellerValue({
        sellerProfile: sellerId == null ? null : makeSellerProfile({ id: sellerId, seller_status: 'active' }),
      }),
    ),
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedConfirm.mockResolvedValue({ data: { status: 'confirmed' } as unknown as Order, error: null })
  mockedCancel.mockResolvedValue({ data: { status: 'cancelled' } as unknown as Order, error: null })
})

describe('SellerOrderDetailPage', () => {
  it('shows a loading state while the order is fetched', () => {
    mockedGet.mockReturnValue(new Promise(() => undefined))
    renderPage()
    expect(screen.getByText('Loading order…')).toBeInTheDocument()
  })

  it('shows an error alert with a way back when the order fails to load', async () => {
    renderPage(null, { code: 'ORDER_NOT_FOUND', message: 'no' })
    expect(
      await screen.findByText('We could not load this order. Please try again.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Back to incoming orders/ })).toBeInTheDocument()
  })

  it('shows an empty state when the order does not belong to the store', async () => {
    renderPage(null)
    expect(await screen.findByText('Order not found')).toBeInTheDocument()
  })

  it('integrates the seller dispute panel with the authoritative order', async () => {
    renderPage(makeOrder({ status: 'disputed' }))
    expect(await screen.findByTestId('order-dispute-panel')).toHaveTextContent('seller:order-1:disputed')
  })

  it('renders an empty state before a seller profile is loaded', async () => {
    renderPage(null, null, null)
    expect(await screen.findByText('Order not found')).toBeInTheDocument()
    expect(mockedGet).not.toHaveBeenCalled()
  })

  it('confirms a pending order only after confirmation', async () => {
    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: 'Confirm order' }))
    expect(mockedConfirm).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Yes, confirm order' }))
    await waitFor(() => expect(mockedConfirm).toHaveBeenCalledWith('order-1'))
    expect((await screen.findAllByText('Confirmed')).length).toBeGreaterThan(0)
  })

  it('cancels a pending order only after confirmation', async () => {
    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: 'Cancel order' }))
    expect(mockedCancel).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Yes, cancel order' }))
    await waitFor(() => expect(mockedCancel).toHaveBeenCalledWith('order-1'))
    expect(await screen.findByText(/was cancelled and its items returned/)).toBeInTheDocument()
  })

  it('shows the buyer name in the order header', async () => {
    renderPage(makeOrder({ buyer_name: 'Ana Test' }))
    expect(await screen.findByText(/· Ana Test/)).toBeInTheDocument()
  })

  it('renders the payment summary and fulfillment panel for a paid confirmed order', async () => {
    renderPage(makeOrder({ status: 'confirmed', paymentStatus: 'paid' }))
    expect((await screen.findAllByText('Paid')).length).toBeGreaterThan(0)
    expect(screen.getByText('GCASH-1')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Start preparation' })).toBeInTheDocument()
  })
})

afterEach(() => {
  vi.clearAllMocks()
})
