import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import CheckoutPage from '../../src/pages/cart/CheckoutPage'

const user = { id: 'user-1', email: 'buyer@example.com' }
const navigate = vi.fn()
const locationState = { state: { cartItemIds: ['ci-1'] } }

const serviceMocks = vi.hoisted(() => ({
  getCartSelection: vi.fn(),
  checkoutCart: vi.fn(),
  orderErrorLabel: vi.fn((code: string) => `label:${code}`),
}))

vi.mock('../../src/features/auth/useAuth', () => ({
  useAuth: () => ({ user, isAuthenticated: true }),
}))

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useLocation: () => locationState, useNavigate: () => navigate }
})

vi.mock('../../src/features/cart/cart.service', () => ({
  getCartSelection: serviceMocks.getCartSelection,
  checkoutCart: serviceMocks.checkoutCart,
  orderErrorLabel: serviceMocks.orderErrorLabel,
}))

function listing(overrides: Record<string, unknown> = {}) {
  return {
    id: 'list-1',
    title: 'Selkirk Amped Epic',
    description: 'A great paddle',
    price: 6500,
    listing_condition: 'like_new',
    quantity: 3,
    city: 'Manila',
    province: 'NCR',
    pickup_available: true,
    delivery_available: true,
    created_at: '2026-01-01T00:00:00Z',
    category: { id: 'c1', name: 'Paddles', slug: 'paddles' },
    brand: { id: 'b1', name: 'Selkirk' },
    seller: { id: 's1', store_name: 'Ace Paddles' },
    images: [],
    ...overrides,
  }
}

function item(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ci-1',
    cart_id: 'cart-1',
    listing_id: 'list-1',
    quantity: 1,
    line_total: 6500,
    listing: listing(),
    unavailable: false,
    ...overrides,
  }
}

function selectionWith(items: ReturnType<typeof item>[]) {
  return {
    cart_id: 'cart-1',
    groups: [
      {
        seller_id: 's1',
        store_name: 'Ace Paddles',
        items,
        subtotal: items.reduce((sum, entry) => sum + entry.line_total, 0),
      },
    ],
    unavailable: [] as ReturnType<typeof item>[],
    total: items.reduce((sum, entry) => sum + entry.line_total, 0),
    total_quantity: items.reduce((sum, entry) => sum + entry.quantity, 0),
    line_count: items.length,
  }
}

function renderPage() {
  return render(
    <MemoryRouter>
      <CheckoutPage />
    </MemoryRouter>,
  )
}

afterEach(() => {
  navigate.mockClear()
  vi.clearAllMocks()
})

describe('CheckoutPage', () => {
  it('shows an empty state when there is no selection', () => {
    locationState.state = { cartItemIds: [] }

    renderPage()

    expect(screen.getByRole('heading', { name: 'Nothing to check out' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to cart' })).toBeInTheDocument()
  })

  it('shows each seller group with its fulfillment options', async () => {
    locationState.state = { cartItemIds: ['ci-1'] }
    serviceMocks.getCartSelection.mockResolvedValue({
      data: selectionWith([item()]),
      error: null,
    })

    renderPage()

    expect(await screen.findAllByText('Ace Paddles')).not.toHaveLength(0)
    expect(screen.getByText('Selkirk Amped Epic')).toBeInTheDocument()
    const pickup = screen.getByRole('radio', { name: /Pickup/i })
    expect(pickup).toBeChecked()
  })

  it('submits the fulfillment + expected prices and navigates to orders on success', async () => {
    locationState.state = { cartItemIds: ['ci-1'] }
    serviceMocks.getCartSelection.mockResolvedValue({
      data: selectionWith([item()]),
      error: null,
    })
    const placedOrders = [
      { order_id: 'o1', order_number: 'PPB-0001', seller_id: 's1', status: 'pending', fulfillment_type: 'pickup', subtotal: 6500, total: 6500, item_count: 1 },
    ]
    serviceMocks.checkoutCart.mockResolvedValue({ data: placedOrders, error: null })

    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: 'Place orders' }))

    await waitFor(() => {
      expect(serviceMocks.checkoutCart).toHaveBeenCalledWith({
        cart_item_ids: ['ci-1'],
        fulfillments: { s1: 'pickup' },
        expected_prices: { 'ci-1': 6500 },
      })
    })
    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith('/orders', { state: { placedOrders } })
    })
  })

  it('blocks checkout when an item is no longer available', async () => {
    locationState.state = { cartItemIds: ['ci-gone'] }
    const gone = item({ id: 'ci-gone', listing_id: 'list-gone', listing: null, unavailable: true })
    const selection = selectionWith([gone])
    selection.unavailable = [gone]
    serviceMocks.getCartSelection.mockResolvedValue({ data: selection, error: null })

    renderPage()

    expect(
      await screen.findByText('1 item is no longer available. Go back to your cart to remove it before checking out.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Place orders' })).toBeDisabled()
  })

  it('blocks a seller group whose items need different fulfillment options', async () => {
    locationState.state = { cartItemIds: ['ci-1', 'ci-2'] }
    const first = item({ listing: listing({ pickup_available: true, delivery_available: false }) })
    const second = item({
      id: 'ci-2',
      listing_id: 'list-2',
      listing: listing({ id: 'list-2', pickup_available: false, delivery_available: true }),
    })
    serviceMocks.getCartSelection.mockResolvedValue({
      data: selectionWith([first, second]),
      error: null,
    })

    renderPage()

    expect(
      await screen.findByText(
        'These items need different fulfillment options — remove one from your cart to continue.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Place orders' })).toBeDisabled()
  })

  it('shows an order error label when checkout fails', async () => {
    locationState.state = { cartItemIds: ['ci-1'] }
    serviceMocks.getCartSelection.mockResolvedValue({
      data: selectionWith([item()]),
      error: null,
    })
    serviceMocks.checkoutCart.mockResolvedValue({
      data: null,
      error: { code: 'PRICE_CHANGED', message: 'The price changed since you viewed it.' },
    })

    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: 'Place orders' }))

    expect(
      await screen.findByText('label:PRICE_CHANGED'),
    ).toBeInTheDocument()
  })

  it('surfaces a load error with a back link', async () => {
    locationState.state = { cartItemIds: ['ci-1'] }
    serviceMocks.getCartSelection.mockResolvedValue({
      data: null,
      error: { message: 'boom' },
    })

    renderPage()

    expect(
      await screen.findByText('We could not load your selection. Please try again.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to cart' })).toBeInTheDocument()
  })
})
