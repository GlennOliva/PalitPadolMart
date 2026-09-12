import type { PostgrestError } from '@supabase/supabase-js'
import { supabase } from '../../lib/supabase/client'
import { LISTING_DISPLAY_COLUMNS } from '../marketplace/marketplace.service'
import type { PublicListing } from '../marketplace/marketplace.types'
import { parseOrderError, orderErrorLabel } from '../orders/orders.service'
import type { CheckoutInput, CheckoutOrder, CartRpcError, CartSummary } from './cart.types'
import type { CartItemDisplay } from './cart.types'

/** The sentinel group key for lines whose listing is no longer visible. */
const UNAVAILABLE_SELLER_ID = '__unavailable'

interface CartItemRow {
  id: string
  cart_id: string
  listing_id: string
  quantity: number
  listing: PublicListing | null
}

function toDisplay(item: CartItemRow): CartItemDisplay {
  const listing = item.listing ?? null
  return {
    id: item.id,
    cart_id: item.cart_id,
    listing_id: item.listing_id,
    quantity: item.quantity,
    line_total: listing == null ? 0 : listing.price * item.quantity,
    listing,
    unavailable: listing == null,
  }
}

function groupCart(items: CartItemRow[], cartId: string | null): CartSummary {
  const groups = new Map<string, { store_name: string; items: CartItemDisplay[] }>()
  const unavailable: CartItemDisplay[] = []
  let total = 0
  let totalQuantity = 0

  for (const row of items) {
    const display = toDisplay(row)
    if (display.unavailable) {
      unavailable.push(display)
      continue
    }
    const sellerId = row.listing?.seller?.id ?? UNAVAILABLE_SELLER_ID
    const storeName = row.listing?.seller?.store_name ?? 'Seller'
    if (!groups.has(sellerId)) {
      groups.set(sellerId, { store_name: storeName, items: [] })
    }
    groups.get(sellerId)?.items.push(display)
    total += display.line_total
    totalQuantity += display.quantity
  }

  return {
    cart_id: cartId ?? '',
    groups: [...groups.entries()].map(([seller_id, group]) => ({
      seller_id,
      store_name: group.store_name,
      items: group.items,
      subtotal: group.items.reduce((sum, item) => sum + item.line_total, 0),
    })),
    unavailable,
    total,
    total_quantity: totalQuantity,
    line_count: items.length,
  }
}

async function fetchCartRows(
  cartId: string,
  itemIds?: string[],
): Promise<{ data: CartItemRow[]; error: PostgrestError | null }> {
  let query = supabase
    .from('cart_items')
    .select(`id, cart_id, listing_id, quantity, listing:listings(${LISTING_DISPLAY_COLUMNS})`)
    .eq('cart_id', cartId)
    .order('created_at')
  if (itemIds != null && itemIds.length > 0) {
    query = query.in('id', itemIds)
  }
  return query as unknown as Promise<{ data: CartItemRow[]; error: PostgrestError | null }>
}

/**
 * The caller's full cart (buyer-scoped by RLS), grouped by seller, plus any
 * lines whose listing is no longer visible. Unavailable lines are separated
 * so they can be flagged and never checked out.
 */
export async function getCart(
  userId: string,
): Promise<{ data: CartSummary; error: PostgrestError | null }> {
  const { data: cart } = await supabase
    .from('carts')
    .select('id')
    .eq('buyer_id', userId)
    .maybeSingle()
  const cartId = cart?.id ?? null
  if (cartId == null) {
    return { data: { cart_id: '', groups: [], unavailable: [], total: 0, total_quantity: 0, line_count: 0 }, error: null }
  }
  const { data, error } = await fetchCartRows(cartId)
  return { data: groupCart(data ?? [], cartId), error }
}

/**
 * Fresh data for a specific set of cart lines (used by the checkout page so
 * prices, stock, and availability are re-read right before ordering).
 */
export async function getCartSelection(
  userId: string,
  itemIds: string[],
): Promise<{ data: CartSummary; error: PostgrestError | null }> {
  if (itemIds.length === 0) {
    return { data: { cart_id: '', groups: [], unavailable: [], total: 0, total_quantity: 0, line_count: 0 }, error: null }
  }
  const { data: cart } = await supabase
    .from('carts')
    .select('id')
    .eq('buyer_id', userId)
    .maybeSingle()
  const cartId = cart?.id ?? null
  if (cartId == null) {
    return { data: { cart_id: '', groups: [], unavailable: [], total: 0, total_quantity: 0, line_count: 0 }, error: null }
  }
  const { data, error } = await fetchCartRows(cartId, itemIds)
  return { data: groupCart(data ?? [], cartId), error }
}

/**
 * Adds a listing to the cart (incrementing an existing line). The server
 * validates availability, blocks self-purchase, and clamps to stock.
 */
export async function addToCart(
  listingId: string,
  quantity = 1,
): Promise<{ data: { id: string } | null; error: CartRpcError | null }> {
  const { data, error } = await supabase.rpc('add_to_cart', {
    p_listing_id: listingId,
    p_quantity: quantity,
  })
  return { data: (data ?? null) as { id: string } | null, error: parseOrderError(error) }
}

/**
 * Updates one cart line's quantity (ownership + live-stock clamp server-side).
 */
export async function updateCartItemQuantity(
  cartItemId: string,
  quantity: number,
): Promise<{ data: { id: string; quantity: number } | null; error: CartRpcError | null }> {
  const { data, error } = await supabase.rpc('update_cart_item_quantity', {
    p_cart_item_id: cartItemId,
    p_quantity: quantity,
  })
  return { data: (data ?? null) as { id: string; quantity: number } | null, error: parseOrderError(error) }
}

/** Removes a line from the caller's cart (RLS-scoped, safe for anyone's line). */
export async function removeCartItem(
  cartItemId: string,
): Promise<{ error: PostgrestError | null }> {
  const { error } = await supabase.from('cart_items').delete().eq('id', cartItemId)
  return { error }
}

/**
 * Runs the atomic multi-seller checkout. The server derives sellers, prices,
 * and totals from locked, trusted rows; the client only supplies which lines
 * to buy, per-seller fulfillment, and the prices it saw for comparison.
 */
export async function checkoutCart(
  input: CheckoutInput,
): Promise<{ data: CheckoutOrder[] | null; error: CartRpcError | null }> {
  const { data, error } = await supabase.rpc('checkout_cart', {
    p_cart_item_ids: input.cart_item_ids,
    p_fulfillments: input.fulfillments,
    p_expected_prices: input.expected_prices ?? null,
  })
  return { data: (data ?? null) as CheckoutOrder[] | null, error: parseOrderError(error) }
}

export { orderErrorLabel }
export type { CheckoutOrder }
