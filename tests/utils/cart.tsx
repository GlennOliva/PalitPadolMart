import type { ReactNode } from 'react'
import { CartContext, type CartContextValue } from '../../src/features/cart/CartProvider'

export function createCartValue(overrides: Partial<CartContextValue> = {}): CartContextValue {
  return {
    itemCount: 0,
    cartLoading: false,
    cartError: null,
    addToCart: async () => ({ error: null }),
    updateQuantity: async () => ({ error: null }),
    removeItem: async () => ({ error: null }),
    refreshCart: async () => undefined,
    ...overrides,
  }
}

export function renderWithCart(children: ReactNode, value: CartContextValue) {
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}
