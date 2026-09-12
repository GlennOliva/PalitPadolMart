import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useAuth } from '../auth/useAuth'
import { addToCart, getCart, removeCartItem, updateCartItemQuantity } from './cart.service'
import type { CartRpcError } from './cart.types'

export interface CartContextValue {
  /** Total units in the cart (drives the nav badge). */
  itemCount: number
  cartLoading: boolean
  cartError: string | null
  addToCart: (listingId: string, quantity?: number) => Promise<{ error: CartRpcError | null }>
  updateQuantity: (cartItemId: string, quantity: number) => Promise<{ error: CartRpcError | null }>
  removeItem: (cartItemId: string) => Promise<{ error: CartRpcError | null }>
  refreshCart: () => Promise<void>
}

export const CartContext = createContext<CartContextValue | null>(null)

export function CartProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [itemCount, setItemCount] = useState(0)
  const [cartLoading, setCartLoading] = useState(false)
  const [cartError, setCartError] = useState<string | null>(null)
  const userIdRef = useRef<string | null>(null)

  const refreshCart = useCallback(async (targetUserId?: string) => {
    const userId = targetUserId ?? userIdRef.current
    if (userId == null) {
      setItemCount(0)
      return
    }
    setCartLoading(true)
    setCartError(null)
    const { data, error } = await getCart(userId)
    if (error != null) {
      setCartError('We could not load your cart. Please try again.')
    } else {
      setItemCount(data.total_quantity)
    }
    setCartLoading(false)
  }, [])

  useEffect(() => {
    userIdRef.current = user?.id ?? null
    void refreshCart(user?.id ?? undefined)
  }, [user?.id, refreshCart])

  const addToCartAction = useCallback(
    async (listingId: string, quantity?: number) => {
      const result = await addToCart(listingId, quantity ?? 1)
      if (result.error == null) {
        await refreshCart()
      }
      return { error: result.error }
    },
    [refreshCart],
  )

  const updateQuantityAction = useCallback(
    async (cartItemId: string, quantity: number) => {
      const result = await updateCartItemQuantity(cartItemId, quantity)
      if (result.error == null) {
        await refreshCart()
      }
      return { error: result.error }
    },
    [refreshCart],
  )

  const removeItemAction = useCallback(
    async (cartItemId: string) => {
      const result = await removeCartItem(cartItemId)
      if (result.error == null) {
        await refreshCart()
      }
      return { error: result.error }
    },
    [refreshCart],
  )

  return (
    <CartContext.Provider
      value={{
        itemCount,
        cartLoading,
        cartError,
        addToCart: addToCartAction,
        updateQuantity: updateQuantityAction,
        removeItem: removeItemAction,
        refreshCart,
      }}
    >
      {children}
    </CartContext.Provider>
  )
}

export function useCart() {
  const context = useContext(CartContext)
  if (context == null) {
    throw new Error('useCart must be used within a CartProvider')
  }
  return context
}
