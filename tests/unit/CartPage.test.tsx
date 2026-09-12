import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import CartPage from '../../src/pages/cart/CartPage'

const user = { id: 'user-1', email: 'buyer@example.com' }
const navigate = vi.fn()

const serviceMocks = vi.hoisted(() => ({
  getCart: vi.fn(),
  updateCartItemQuantity: vi.fn(),
  removeCartItem: vi.fn(),
  orderErrorLabel: vi.fn((code: string) => `label:${code}`),
}))

vi.mock('../../src/features/auth/useAuth', () => ({
  useAuth: () => ({ user, isAuthenticated: true }),
}))

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => navigate }
})

vi.mock('../../src/features/cart/cart.service', () => ({
  getCart: serviceMocks.getCart,
  updateCartItemQuantity: serviceMocks.updateCartItemQuantity,
  removeCartItem: serviceMocks.removeCartItem,
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
    images: [{ id: 'img-1', listing_id: 'list-1', url: 'https://example.com/paddle.jpg', sort_order: 0 }],
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

type Item = ReturnType<typeof item>

function emptyCart() {
  return {
    cart_id: 'cart-1',
    groups: [],
    unavailable: [] as Item[],
    total: 0,
    total_quantity: 0,
    line_count: 0,
  }
}

function cartWithItem(itemValue: Item) {
  return {
    cart_id: 'cart-1',
    groups: [
      {
        seller_id: 's1',
        store_name: 'Ace Paddles',
        items: [itemValue],
        subtotal: itemValue.line_total,
      },
    ],
    unavailable: [] as Item[],
    total: itemValue.line_total,
    total_quantity: itemValue.quantity,
    line_count: 1,
  }
}

function renderPage() {
  return render(
    <MemoryRouter>
      <CartPage />
    </MemoryRouter>,
  )
}

afterEach(() => {
  navigate.mockClear()
  vi.clearAllMocks()
})

describe('CartPage', () => {
  it('shows a loading state then the seller-grouped cart', async () => {
    serviceMocks.getCart.mockResolvedValue({ data: cartWithItem(item()), error: null })

    renderPage()

    expect(screen.getByRole('status', { name: 'Loading your cart…' })).toBeInTheDocument()

    expect(await screen.findByText('Selkirk Amped Epic')).toBeInTheDocument()
    expect(screen.getByText('Ace Paddles')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Selkirk Amped Epic' })).toHaveAttribute(
      'href',
      '/marketplace/list-1',
    )
  })

  it('shows an empty state when the cart has no lines', async () => {
    serviceMocks.getCart.mockResolvedValue({ data: emptyCart(), error: null })

    renderPage()

    expect(
      await screen.findByRole('heading', { name: 'Your cart is empty' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Browse the marketplace' })).toBeInTheDocument()
  })

  it('flags unavailable lines and excludes them from checkout', async () => {
    const gone = item({
      id: 'ci-gone',
      listing_id: 'list-gone',
      listing: null,
      unavailable: true,
    })
    const cart = cartWithItem(item())
    cart.unavailable = [gone]
    serviceMocks.getCart.mockResolvedValue({ data: cart, error: null })

    renderPage()

    const section = await screen.findByRole('region', { name: 'Unavailable items' })
    expect(within(section).getByText(/no longer available/i)).toBeInTheDocument()
  })

  it('navigates to checkout with only the selected line ids', async () => {
    const first = item({ id: 'ci-1' })
    const second = item({
      id: 'ci-2',
      listing_id: 'list-2',
      quantity: 2,
      line_total: 13000,
      listing: listing({ id: 'list-2', title: 'CRBN 1X', price: 6500 }),
    })
    const cart = {
      cart_id: 'cart-1',
      groups: [
        { seller_id: 's1', store_name: 'Ace Paddles', items: [first, second], subtotal: 19500 },
      ],
      unavailable: [],
      total: 19500,
      total_quantity: 3,
      line_count: 2,
    }
    serviceMocks.getCart.mockResolvedValue({ data: cart, error: null })

    renderPage()

    fireEvent.click(await screen.findByRole('checkbox', { name: 'Select all items' }))
    fireEvent.click(screen.getByRole('button', { name: 'Checkout' }))

    expect(navigate).toHaveBeenCalledWith('/checkout', {
      state: { cartItemIds: ['ci-1', 'ci-2'] },
    })
  })

  it('surfaces a load error with a retry button', async () => {
    serviceMocks.getCart.mockResolvedValueOnce({
      data: null,
      error: { message: 'boom' },
    })

    renderPage()

    expect(
      await screen.findByText('We could not load your cart. Please try again.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })

  it('reloads the cart after a successful quantity update', async () => {
    serviceMocks.getCart.mockResolvedValue({
      data: cartWithItem(item()),
      error: null,
    })
    serviceMocks.updateCartItemQuantity.mockResolvedValue({ error: null })

    renderPage()

    const select = await screen.findByRole('combobox', {
      name: /Quantity of Selkirk Amped Epic/i,
    })
    fireEvent.change(select, { target: { value: '2' } })

    await waitFor(() => {
      expect(serviceMocks.updateCartItemQuantity).toHaveBeenCalledWith('ci-1', 2)
    })
    await waitFor(() => {
      expect(serviceMocks.getCart).toHaveBeenCalledTimes(2)
    })
  })

  it('removes an item and reloads the cart', async () => {
    serviceMocks.getCart
      .mockResolvedValueOnce({ data: cartWithItem(item()), error: null })
      .mockResolvedValueOnce({ data: emptyCart(), error: null })
    serviceMocks.removeCartItem.mockResolvedValue({ error: null })

    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: 'Remove Selkirk Amped Epic' }))

    await waitFor(() => {
      expect(serviceMocks.removeCartItem).toHaveBeenCalledWith('ci-1')
    })
    expect(
      await screen.findByRole('heading', { name: 'Your cart is empty' }),
    ).toBeInTheDocument()
  })
})
