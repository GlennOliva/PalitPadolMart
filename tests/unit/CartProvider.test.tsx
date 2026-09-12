import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, act, waitFor } from '@testing-library/react'
import { CartProvider, useCart } from '../../src/features/cart/CartProvider'

const user = { id: 'user-1', email: 'buyer@example.com' }

const serviceMocks = vi.hoisted(() => ({
  getCart: vi.fn(),
  addToCart: vi.fn(),
  updateCartItemQuantity: vi.fn(),
  removeCartItem: vi.fn(),
}))

vi.mock('../../src/features/auth/useAuth', () => ({
  useAuth: () => ({ user }),
}))

vi.mock('../../src/features/cart/cart.service', () => ({
  getCart: serviceMocks.getCart,
  addToCart: serviceMocks.addToCart,
  updateCartItemQuantity: serviceMocks.updateCartItemQuantity,
  removeCartItem: serviceMocks.removeCartItem,
}))

function Probe() {
  const { itemCount, addToCart } = useCart()
  return (
    <div>
      <span data-testid="count">{itemCount}</span>
      <button type="button" onClick={() => void addToCart('list-1', 2)}>
        add
      </button>
    </div>
  )
}

function renderProvider() {
  return render(
    <CartProvider>
      <Probe />
    </CartProvider>,
  )
}

afterEach(() => {
  user.id = 'user-1'
  vi.clearAllMocks()
})

describe('CartProvider', () => {
  it('loads the unit count for the signed-in user', async () => {
    serviceMocks.getCart.mockResolvedValue({
      data: { cart_id: 'c1', groups: [], unavailable: [], total: 0, total_quantity: 7, line_count: 0 },
      error: null,
    })

    renderProvider()

    await waitFor(() => {
      expect(serviceMocks.getCart).toHaveBeenCalledWith('user-1')
    })
    expect(screen.getByTestId('count').textContent).toBe('7')
  })

  it('shows zero while there is no signed-in user', async () => {
    user.id = null as unknown as string
    renderProvider()

    expect(screen.getByTestId('count').textContent).toBe('0')
  })

  it('refreshes the count after a successful addToCart', async () => {
    serviceMocks.getCart.mockResolvedValue({
      data: { cart_id: 'c1', groups: [], unavailable: [], total: 0, total_quantity: 0, line_count: 0 },
      error: null,
    })
    serviceMocks.addToCart.mockResolvedValue({ error: null })

    renderProvider()
    await waitFor(() => {
      expect(screen.getByTestId('count').textContent).toBe('0')
    })

    serviceMocks.getCart.mockResolvedValue({
      data: { cart_id: 'c1', groups: [], unavailable: [], total: 0, total_quantity: 3, line_count: 0 },
      error: null,
    })

    await act(async () => {
      screen.getByRole('button', { name: 'add' }).click()
    })

    expect(serviceMocks.addToCart).toHaveBeenCalledWith('list-1', 2)
    await waitFor(() => {
      expect(screen.getByTestId('count').textContent).toBe('3')
    })
  })

  it('does not refresh the count when addToCart fails', async () => {
    serviceMocks.getCart.mockResolvedValue({
      data: { cart_id: 'c1', groups: [], unavailable: [], total: 0, total_quantity: 1, line_count: 0 },
      error: null,
    })
    serviceMocks.addToCart.mockResolvedValue({
      error: { code: 'LISTING_UNAVAILABLE', message: 'nope' },
    })

    renderProvider()
    await waitFor(() => {
      expect(screen.getByTestId('count').textContent).toBe('1')
    })

    serviceMocks.getCart.mockClear()

    await act(async () => {
      screen.getByRole('button', { name: 'add' }).click()
    })

    expect(serviceMocks.getCart).not.toHaveBeenCalled()
    expect(screen.getByTestId('count').textContent).toBe('1')
  })
})
