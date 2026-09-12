import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import ReviewItemPage from '../../src/pages/orders/ReviewItemPage'
import { getBuyerOrder } from '../../src/features/orders/orders.service'
import { makeUser, createAuthValue, renderWithAuth } from '../utils/auth'
import type { PostgrestError } from '@supabase/supabase-js'
import type { OrderDetail } from '../../src/features/orders/orders.types'

vi.mock('../../src/features/orders/orders.service', () => ({
  getBuyerOrder: vi.fn(),
}))

vi.mock('../../src/features/reviews/reviews.service', () => ({
  submitReview: vi.fn(),
  reviewErrorLabel: (code: string) => `ERR:${code}`,
}))

const mockedGet = vi.mocked(getBuyerOrder)

function makeOrder(overrides: Partial<OrderDetail> = {}): OrderDetail {
  return {
    id: 'order-1',
    order_number: 'PPB-0001',
    status: 'completed',
    fulfillment_type: 'pickup',
    subtotal: 2000,
    total: 2000,
    notes: null,
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z',
    confirmed_at: '2026-08-01T00:00:00.000Z',
    paid_at: '2026-08-02T00:00:00.000Z',
    preparing_at: null,
    shipped_at: null,
    ready_for_pickup_at: null,
    completed_at: '2026-08-04T00:00:00.000Z',
    cancelled_at: null,
    seller: { id: 'seller-1', store_name: 'Ace Paddles PH' },
    items: [
      { id: 'item-1', listing_id: 'list-1', product_title: 'Pro Pickle Paddle', unit_price: 2000, quantity: 1 },
      { id: 'item-2', listing_id: 'list-2', product_title: 'Court Stringer', unit_price: 500, quantity: 1 },
    ],
    payment: null,
    fulfillment: null,
    buyer_name: null,
    ...overrides,
  }
}

function renderPage(order: OrderDetail | null = makeOrder()) {
  mockedGet.mockResolvedValue({ data: order, error: null as PostgrestError | null })
  return render(
    renderWithAuth(
      <MemoryRouter initialEntries={['/orders/order-1/review/item-1']}>
        <Routes>
          <Route path="/orders/:orderId/review/:orderItemId" element={<ReviewItemPage />} />
          <Route path="/orders/:orderId" element={<div>ORDER DETAIL PAGE</div>} />
        </Routes>
      </MemoryRouter>,
      createAuthValue({ user: makeUser() }),
    ),
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('ReviewItemPage', () => {
  it('shows a loading state while fetching the order', () => {
    mockedGet.mockReturnValue(new Promise(() => undefined))
    renderPage()
    expect(screen.getByText('Loading review…')).toBeInTheDocument()
  })

  it('shows an empty state when the order is not found', async () => {
    mockedGet.mockResolvedValue({ data: null, error: null })
    renderPage(null)
    expect(await screen.findByText('Order not found')).toBeInTheDocument()
  })

  it('gates access to completed orders only', async () => {
    renderPage(makeOrder({ status: 'confirmed' }))
    expect(await screen.findByText('Order not completed yet')).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: /Back to order/ }),
    ).toBeInTheDocument()
  })

  it('shows an error when the order item does not belong to the order', async () => {
    renderPage(makeOrder({ items: [{ id: 'other-item', listing_id: 'x', product_title: 'X', unit_price: 1, quantity: 1 }] }))
    expect(
      await screen.findByText('This item could not be found in your order.'),
    ).toBeInTheDocument()
  })

  it('renders the review form for a completed order item', async () => {
    renderPage()
    expect(await screen.findByRole('heading', { name: 'Leave a review' })).toBeInTheDocument()
    expect(screen.getByText('Pro Pickle Paddle')).toBeInTheDocument()
    const productGroup = screen.getByRole('radiogroup', { name: 'Product rating' })
    expect(within(productGroup).getByRole('radio', { name: '4 stars' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Submit review' })).toBeInTheDocument()
  })
})