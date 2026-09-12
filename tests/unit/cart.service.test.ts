import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { PostgrestError } from '@supabase/supabase-js'
import {
  addToCart,
  checkoutCart,
  removeCartItem,
  updateCartItemQuantity,
  orderErrorLabel,
} from '../../src/features/cart/cart.service'

/**
 * PHASE 8 REGRESSION — trusted cart/checkout path.
 *
 * The hosted bug was: checkout_cart (a SECURITY DEFINER RPC) hit the Phase 4
 * listing-management trigger and aborted with "not authorized to manage this
 * listing" because — unlike create_marketplace_order / cancel_marketplace_order —
 * it never set the transaction-local trusted-inventory marker
 * (`app.trusted_inventory_update`) before decrementing listings.
 *
 * These tests pin the APP-SIDE invariants around that trusted path:
 *   * every cart mutation goes through the atomic RPCs, never through a direct
 *     listings UPDATE/INSERT;
 *   * the removeCartItem path is the ONLY direct write, and it is a plain RLS
 *     DELETE scoped to the owner's own cart_items row;
 *   * a buyer's listing-management surface stays empty (the seller's alone);
 *   * the zero-stock add contract is LISTING_UNAVAILABLE (a listing with zero
 *     stock is automatically `sold`, so INSUFFICIENT_STOCK is unreachable from
 *     add_to_cart).
 *
 * The real RLS/trigger/atomicity behavior is proven by the hosted verifier
 * (verify-phase8.mjs) against the deployed database.
 */
const { cartMocks } = vi.hoisted(() => ({
  cartMocks: {
    rpc: vi.fn(),
    from: vi.fn(),
    // Resolve a query chain's awaited value. Implementations are set per test.
    resolve: vi.fn(),
  },
}))

vi.mock('../../src/lib/supabase/client', () => ({
  supabase: {
    rpc: cartMocks.rpc,
    from: cartMocks.from,
  },
}))

type ResolveResult = { data: unknown; error: unknown }

interface Call {
  method: string
  args: unknown[]
}

function makeQuery(table: string) {
  const calls: Call[] = []
  const query: Record<string, unknown> = {}
  const call = (method: string) => (...args: unknown[]) => {
    calls.push({ method, args })
    return query
  }
  for (const method of ['select', 'eq', 'in', 'delete', 'order']) {
    query[method] = call(method)
  }
  query.getCalls = () => calls
  query.then = (resolve: (value: ResolveResult) => unknown) =>
    Promise.resolve(cartMocks.resolve(table, calls) as ResolveResult).then(resolve)
  query.catch = (reject: (reason: unknown) => unknown) =>
    Promise.resolve(cartMocks.resolve(table, calls) as ResolveResult).then(
      () => undefined,
      reject,
    )
  return query
}

beforeEach(() => {
  cartMocks.rpc.mockReset()
  cartMocks.from.mockReset()
  cartMocks.resolve.mockReset()
  cartMocks.from.mockImplementation((table: string) => makeQuery(table))
})

describe('checkoutCart (buyer multi-seller checkout path)', () => {
  it('checkouts exclusively through the checkout_cart RPC with client-derived args', async () => {
    const orders = [
      { order_id: 'o-main', seller_id: 's-1', total: 1000, item_count: 1 },
      { order_id: 'o-b', seller_id: 's-2', total: 1300, item_count: 2 },
    ]
    cartMocks.rpc.mockResolvedValueOnce({ data: orders, error: null })

    const { data, error } = await checkoutCart({
      cart_item_ids: ['ci-1', 'ci-2', 'ci-3'],
      fulfillments: { 's-1': 'pickup', 's-2': 'delivery' },
      expected_prices: { 'ci-1': 1100, 'ci-2': 500, 'ci-3': 800 },
    })

    expect(error).toBeNull()
    expect(data).toEqual(orders)
    expect(cartMocks.rpc).toHaveBeenCalledTimes(1)
    expect(cartMocks.rpc).toHaveBeenCalledWith('checkout_cart', {
      p_cart_item_ids: ['ci-1', 'ci-2', 'ci-3'],
      p_fulfillments: { 's-1': 'pickup', 's-2': 'delivery' },
      p_expected_prices: { 'ci-1': 1100, 'ci-2': 500, 'ci-3': 800 },
    })
    // The trusted inventory mutation must never become a direct listings write
    // from the browser. The checkout page cannot touch listings at all.
    expect(cartMocks.from).not.toHaveBeenCalled()
  })

  it('omits expected prices when absent (trusted server re-read)', async () => {
    cartMocks.rpc.mockResolvedValueOnce({ data: [], error: null })

    await checkoutCart({
      cart_item_ids: ['ci-1'],
      fulfillments: { 's-1': 'pickup' },
    })

    expect(cartMocks.rpc).toHaveBeenCalledWith('checkout_cart', {
      p_cart_item_ids: ['ci-1'],
      p_fulfillments: { 's-1': 'pickup' },
      p_expected_prices: null,
    })
    expect(cartMocks.from).not.toHaveBeenCalled()
  })

  it('returns a parsed structured error when checkout_cart rejects', async () => {
    cartMocks.rpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'PRICE_CHANGED: the price of X changed since you viewed it' },
    })

    const { data, error } = await checkoutCart({
      cart_item_ids: ['ci-1'],
      fulfillments: { 's-1': 'pickup' },
    })

    expect(data).toBeNull()
    expect(error).toEqual({
      code: 'PRICE_CHANGED',
      message: 'the price of X changed since you viewed it',
    })
  })
})

describe('addToCart / updateCartItemQuantity (RPC-only mutations)', () => {
  it('adds to cart exclusively through the add_to_cart RPC', async () => {
    cartMocks.rpc.mockResolvedValueOnce({ data: { id: 'ci-1', quantity: 2 }, error: null })

    const { data, error } = await addToCart('listing-1', 2)

    expect(error).toBeNull()
    expect(data).toEqual({ id: 'ci-1', quantity: 2 })
    expect(cartMocks.rpc).toHaveBeenCalledTimes(1)
    expect(cartMocks.rpc).toHaveBeenCalledWith('add_to_cart', {
      p_listing_id: 'listing-1',
      p_quantity: 2,
    })
    expect(cartMocks.from).not.toHaveBeenCalled()
  })

  it('updates a line exclusively through the update_cart_item_quantity RPC', async () => {
    cartMocks.rpc.mockResolvedValueOnce({ data: { id: 'ci-1', quantity: 5 }, error: null })

    const { data, error } = await updateCartItemQuantity('ci-1', 5)

    expect(error).toBeNull()
    expect(data).toEqual({ id: 'ci-1', quantity: 5 })
    expect(cartMocks.rpc).toHaveBeenCalledTimes(1)
    expect(cartMocks.rpc).toHaveBeenCalledWith('update_cart_item_quantity', {
      p_cart_item_id: 'ci-1',
      p_quantity: 5,
    })
    expect(cartMocks.from).not.toHaveBeenCalled()
  })

  it('never reaches the listings table from any cart mutation', async () => {
    cartMocks.rpc.mockResolvedValue({ data: null, error: null })
    await addToCart('listing-1', 1)
    await updateCartItemQuantity('ci-1', 1)
    expect(cartMocks.from).not.toHaveBeenCalled()
  })
})

describe('removeCartItem (RLS-scoped owner delete)', () => {
  it('removes a line via a plain cart_items DELETE eq id — no listings write', async () => {
    cartMocks.resolve.mockImplementation((table: string, calls: Call[]) => {
      expect(table).toBe('cart_items')
      const methods = calls.map((c) => c.method)
      expect(methods).toEqual(['delete', 'eq'])
      return { data: [{ id: 'ci-1' }], error: null }
    })

    const { error } = await removeCartItem('ci-1')

    expect(error).toBeNull()
    expect(cartMocks.from).toHaveBeenCalledWith('cart_items')
    expect(cartMocks.resolve).toHaveBeenCalledTimes(1)
    // Direct DELETE is RLS-scoped to the owner's own cart; never to listings.
    expect(cartMocks.from).not.toHaveBeenCalledWith('listings')
    expect(cartMocks.rpc).not.toHaveBeenCalled()
  })

  it('surfaces a PostgrestError when RLS denies the delete', async () => {
    cartMocks.resolve.mockImplementation(() => ({
      data: null,
      error: { message: 'denied' } as PostgrestError,
    }))

    const { error } = await removeCartItem('ci-1')

    expect(error?.message).toBe('denied')
  })
})

describe('zero-stock add contract', () => {
  it('reports LISTING_UNAVAILABLE — the canonical code for sold/out-of-stock listings', async () => {
    cartMocks.rpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'LISTING_UNAVAILABLE: this listing is no longer available' },
    })

    const { data, error } = await addToCart('listing-1', 1)

    expect(data).toBeNull()
    expect(error).toEqual({
      code: 'LISTING_UNAVAILABLE',
      message: 'this listing is no longer available',
    })
  })

  it('maps RLS permission denials to FORBIDDEN', async () => {
    cartMocks.rpc.mockResolvedValueOnce({
      data: null,
      error: { code: '42501', message: 'permission denied for table listings' },
    })

    const { error } = await addToCart('listing-1', 1)

    expect(error).toEqual({ code: 'FORBIDDEN', message: 'You are not allowed to do that.' })
  })
})

describe('orderErrorLabel (cart codes share the order error copy)', () => {
  it('shows actionable copy for checkout-critical codes', () => {
    expect(orderErrorLabel('LISTING_UNAVAILABLE')).toMatch(/no longer available/i)
    expect(orderErrorLabel('PRICE_CHANGED')).toMatch(/price changed/i)
    expect(orderErrorLabel('INSUFFICIENT_STOCK')).toMatch(/stock/i)
    expect(orderErrorLabel('SELF_PURCHASE_NOT_ALLOWED')).toMatch(/your own listing/i)
    expect(orderErrorLabel('UNKNOWN')).toMatch(/Something went wrong/i)
  })
})
