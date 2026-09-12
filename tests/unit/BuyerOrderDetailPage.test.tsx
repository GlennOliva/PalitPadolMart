import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import BuyerOrderDetailPage from '../../src/pages/orders/BuyerOrderDetailPage'
import {
  getBuyerOrder,
  cancelMarketplaceOrder,
  deleteMyCancelledOrder,
} from '../../src/features/orders/orders.service'
import { confirmOrderReceived } from '../../src/features/orders/fulfillment.service'
import { getSellerPaymentMethods } from '../../src/features/orders/payments.service'
import { getMyOrderReviews } from '../../src/features/reviews/reviews.service'
import type { PostgrestError } from '@supabase/supabase-js'
import type { Order, OrderDetail } from '../../src/features/orders/orders.types'
import { makeUser, createAuthValue, renderWithAuth } from '../utils/auth'

vi.mock('../../src/features/orders/orders.service', () => ({
  getBuyerOrder: vi.fn(),
  cancelMarketplaceOrder: vi.fn(),
  deleteMyCancelledOrder: vi.fn(),
  orderErrorLabel: (code: string) => `ERR:${code}`,
}))

vi.mock('../../src/features/orders/fulfillment.service', () => ({
  confirmOrderReceived: vi.fn(),
}))

vi.mock('../../src/features/orders/payments.service', () => ({
  getSellerPaymentMethods: vi.fn(),
  submitOrderPayment: vi.fn(),
  uploadPaymentProof: vi.fn(),
  approveOrderPayment: vi.fn(),
  rejectOrderPayment: vi.fn(),
  markCashReceived: vi.fn(),
  paymentProofUrl: vi.fn(),
  setSellerPaymentMethod: vi.fn(),
}))

vi.mock('../../src/features/reviews/reviews.service', () => ({
  getMyOrderReviews: vi.fn(),
}))

vi.mock('../../src/components/disputes/OrderDisputePanel', () => ({
  default: ({ order, view }: { order: { id: string; status: string }; view: string }) => (
    <div data-testid="order-dispute-panel">{`${view}:${order.id}:${order.status}`}</div>
  ),
}))

const mockedGet = vi.mocked(getBuyerOrder)
const mockedCancel = vi.mocked(cancelMarketplaceOrder)
const mockedDelete = vi.mocked(deleteMyCancelledOrder)
const mockedReceived = vi.mocked(confirmOrderReceived)
const mockedMethods = vi.mocked(getSellerPaymentMethods)
const mockedMyReviews = vi.mocked(getMyOrderReviews)

function makeOrder(overrides: Partial<OrderDetail> & { paymentStatus?: 'submitted' | null } = {}): OrderDetail {
  const { paymentStatus, ...rest } = overrides
  return {
    id: 'order-1',
    order_number: 'PPB-0001',
    status: 'pending',
    fulfillment_type: 'pickup',
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
          paid_at: null,
          created_at: '2026-08-02T00:00:00.000Z',
          updated_at: '2026-08-02T00:00:00.000Z',
        }
      : null,
    fulfillment: null,
    buyer_name: null,
    ...rest,
  }
}

function renderPage(
  order: OrderDetail | null = makeOrder(),
  loadError: { code: string; message: string } | null = null,
) {
  mockedGet.mockResolvedValue({ data: order, error: loadError as PostgrestError | null })
  return render(
    renderWithAuth(
      <MemoryRouter initialEntries={['/orders/order-1']}>
        <Routes>
          <Route path="/orders/:orderId" element={<BuyerOrderDetailPage />} />
          <Route path="/orders" element={<div>ORDERS PAGE</div>} />
        </Routes>
      </MemoryRouter>,
      createAuthValue({ user: makeUser() }),
    ),
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedMethods.mockResolvedValue({ data: [], error: null })
  mockedMyReviews.mockResolvedValue({ data: {}, error: null })
})

describe('BuyerOrderDetailPage', () => {
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
    expect(screen.getByRole('link', { name: /Back to my orders/ })).toBeInTheDocument()
  })

  it('shows an empty state when the order does not exist', async () => {
    renderPage(null)
    expect(await screen.findByText('Order not found')).toBeInTheDocument()
  })

  it('integrates the buyer dispute panel with the authoritative order', async () => {
    renderPage(makeOrder({ status: 'shipped' }))
    expect(await screen.findByTestId('order-dispute-panel')).toHaveTextContent('buyer:order-1:shipped')
  })

  it('cancels a pending order only after confirmation', async () => {
    mockedCancel.mockResolvedValue({ data: { status: 'cancelled' } as unknown as Order, error: null })
    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: 'Cancel order' }))
    expect(mockedCancel).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Yes, cancel order' }))
    await waitFor(() => expect(mockedCancel).toHaveBeenCalledWith('order-1'))
    expect(await screen.findByText(/was cancelled and its items returned/)).toBeInTheDocument()
  })

  it('removes a cancelled order and navigates back to the orders list', async () => {
    mockedDelete.mockResolvedValue({ error: null })
    renderPage(makeOrder({ status: 'cancelled' }))

    fireEvent.click(await screen.findByRole('button', { name: 'Remove from history' }))
    fireEvent.click(screen.getByRole('button', { name: 'Yes, remove order' }))

    await waitFor(() => expect(mockedDelete).toHaveBeenCalledWith('order-1'))
    expect(await screen.findByText('ORDERS PAGE')).toBeInTheDocument()
  })

  it('lets the buyer confirm receipt of a shipped, paid order', async () => {
    mockedReceived.mockResolvedValue({ data: { status: 'completed' } as unknown as Order, error: null })
    renderPage(
      makeOrder({
        status: 'shipped',
        shipped_at: '2026-08-04T00:00:00.000Z',
        paymentStatus: 'submitted',
        payment: {
          id: 'pay-1',
          order_id: 'order-1',
          amount: 2000,
          payment_method: 'cash_on_delivery',
          payment_reference: null,
          proof_path: null,
          rejection_reason: null,
          status: 'paid',
          paid_at: '2026-08-03T00:00:00.000Z',
          created_at: '2026-08-02T00:00:00.000Z',
          updated_at: '2026-08-03T00:00:00.000Z',
        },
      }),
    )

    fireEvent.click(await screen.findByRole('button', { name: 'Confirm received' }))
    fireEvent.click(screen.getByRole('button', { name: 'Yes, I received my items' }))

    await waitFor(() => expect(mockedReceived).toHaveBeenCalledWith('order-1'))
    expect((await screen.findAllByText('Completed')).length).toBeGreaterThan(0)
  })

  it('loads seller payment methods and renders the payment panel for an unpaid confirmed order', async () => {
    mockedMethods.mockResolvedValue({
      data: [
        {
          id: 'spm-1',
          seller_id: 'seller-1',
          method: 'manual_transfer',
          is_enabled: true,
          instructions: 'GCash 09171234567',
          created_at: '2026-08-01T00:00:00.000Z',
          updated_at: '2026-08-01T00:00:00.000Z',
        },
      ],
      error: null,
    })
    renderPage(makeOrder({ status: 'confirmed', payment: null }))

    expect(await screen.findByRole('button', { name: 'Submit payment details' })).toBeInTheDocument()
    expect(mockedMethods).toHaveBeenCalledWith('seller-1')
  })

  it('shows the awaiting-review notice and no payment form for a submitted payment', async () => {
    renderPage(makeOrder({ status: 'confirmed', paymentStatus: 'submitted' }))

    expect(await screen.findByText(/awaiting the seller/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Submit payment details' })).not.toBeInTheDocument()
  })

  it('maps a confirm-received failure through orderErrorLabel', async () => {
    mockedReceived.mockResolvedValue({ data: null, error: { code: 'FORBIDDEN', message: 'no' } })
    renderPage(
      makeOrder({
        status: 'shipped',
        payment: {
          id: 'pay-1',
          order_id: 'order-1',
          amount: 2000,
          payment_method: 'cash_on_delivery',
          payment_reference: null,
          proof_path: null,
          rejection_reason: null,
          status: 'paid',
          paid_at: '2026-08-03T00:00:00.000Z',
          created_at: '2026-08-02T00:00:00.000Z',
          updated_at: '2026-08-03T00:00:00.000Z',
        },
      }),
    )

    fireEvent.click(await screen.findByRole('button', { name: 'Confirm received' }))
    fireEvent.click(screen.getByRole('button', { name: 'Yes, I received my items' }))

    expect(await screen.findByText('ERR:FORBIDDEN')).toBeInTheDocument()
  })

  it('shows a Review this item link for each item on a completed order', async () => {
    renderPage(makeOrder({ status: 'completed', completed_at: '2026-08-04T00:00:00.000Z' }))

    const links = await screen.findAllByRole('link', { name: 'Review this item' })
    expect(links).toHaveLength(1)
    expect(links[0]).toHaveAttribute('href', '/orders/order-1/review/item-1')
    expect(mockedMyReviews).toHaveBeenCalledWith('order-1', 'user-1')
  })

  it('does not show review links before the order is completed', async () => {
    renderPage(makeOrder({ status: 'paid' }))

    expect(
      await screen.findByRole('heading', { level: 1, name: 'PPB-0001' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Review this item' })).not.toBeInTheDocument()
    expect(mockedMyReviews).not.toHaveBeenCalled()
  })

  it('switches an item to Reviewed once a review exists for it', async () => {
    mockedMyReviews.mockResolvedValue({ data: { 'item-1': 'rev-1' }, error: null })
    renderPage(makeOrder({ status: 'completed', completed_at: '2026-08-04T00:00:00.000Z' }))

    expect(await screen.findByText('✓ Reviewed')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Review this item' })).not.toBeInTheDocument()
  })
})

afterEach(() => {
  vi.clearAllMocks()
})
