import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { PostgrestError } from '@supabase/supabase-js'
import {
  createMarketplaceOrder,
  orderErrorLabel,
  parseOrderError,
} from '../../src/features/orders/orders.service'

/**
 * PHASE 8 REGRESSION — trusted purchase path.
 *
 * The hosted bug was: create_marketplace_order (a SECURITY DEFINER RPC) hit the
 * Phase 4 listing-management trigger and aborted with "not authorized to manage
 * this listing" because a normal buyer's auth_seller_id() is NULL.
 *
 * These tests pin the APP-SIDE invariant: placing an order goes ONLY through
 * the atomic RPC and NEVER through a direct listings UPDATE (or a direct
 * orders INSERT). Direct listing-management stays the seller's path alone; the
 * hosted verifier (verify-phase8.mjs) additionally proves the real RLS/trigger
 * behavior against the deployed database.
 */
const { ordersMocks } = vi.hoisted(() => ({
  ordersMocks: { rpc: vi.fn(), from: vi.fn() },
}))

vi.mock('../../src/lib/supabase/client', () => ({
  supabase: {
    rpc: ordersMocks.rpc,
    from: ordersMocks.from,
  },
}))

describe('createMarketplaceOrder (buyer purchase path)', () => {
  beforeEach(() => {
    ordersMocks.rpc.mockReset()
    ordersMocks.from.mockReset()
  })

  it('places an order exclusively through the create_marketplace_order RPC', async () => {
    const orderRow = { id: 'order-1', status: 'pending' }
    ordersMocks.rpc.mockResolvedValueOnce({ data: orderRow, error: null })

    const { data, error } = await createMarketplaceOrder({
      listing_id: 'listing-1',
      quantity: 2,
      fulfillment_type: 'pickup',
      notes: '  please gift wrap  ',
      expected_unit_price: 3000,
    })

    expect(error).toBeNull()
    expect(data).toEqual(orderRow)
    // The trusted inventory mutation must go through the RPC...
    expect(ordersMocks.rpc).toHaveBeenCalledTimes(1)
    expect(ordersMocks.rpc).toHaveBeenCalledWith('create_marketplace_order', {
      p_listing_id: 'listing-1',
      p_quantity: 2,
      p_fulfillment_type: 'pickup',
      p_notes: 'please gift wrap',
      p_expected_unit_price: 3000,
    })
    // ...and never through a direct listings UPDATE or orders INSERT. The buyer
    // must not have any client-side listing-management path.
    expect(ordersMocks.from).not.toHaveBeenCalled()
  })

  it('omits empty notes and absent expected price (trusted server defaults)', async () => {
    ordersMocks.rpc.mockResolvedValueOnce({ data: { id: 'order-2' }, error: null })

    await createMarketplaceOrder({
      listing_id: 'listing-1',
      quantity: 1,
      fulfillment_type: 'delivery',
      notes: '   ',
    })

    expect(ordersMocks.rpc).toHaveBeenCalledWith('create_marketplace_order', {
      p_listing_id: 'listing-1',
      p_quantity: 1,
      p_fulfillment_type: 'delivery',
      p_notes: undefined,
      p_expected_unit_price: undefined,
    })
    expect(ordersMocks.from).not.toHaveBeenCalled()
  })

  it('returns a parsed structured error when the RPC rejects', async () => {
    ordersMocks.rpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'PRICE_CHANGED: the price changed since you viewed it' },
    })

    const { data, error } = await createMarketplaceOrder({
      listing_id: 'listing-1',
      quantity: 1,
      fulfillment_type: 'pickup',
      expected_unit_price: 1,
    })

    expect(data).toBeNull()
    expect(error).toEqual({
      code: 'PRICE_CHANGED',
      message: 'the price changed since you viewed it',
    })
  })
})

describe('parseOrderError', () => {
  it('parses structured CODE: message exceptions', () => {
    expect(
      parseOrderError({ message: 'INSUFFICIENT_STOCK: only 2 in stock' } as PostgrestError),
    ).toEqual({ code: 'INSUFFICIENT_STOCK', message: 'only 2 in stock' })
  })

  it('maps RLS permission denials to FORBIDDEN', () => {
    expect(
      parseOrderError({ code: '42501', message: 'permission denied' } as PostgrestError),
    ).toEqual({
      code: 'FORBIDDEN',
      message: 'You are not allowed to do that.',
    })
  })

  it('falls back to UNKNOWN for unmatched messages and null input', () => {
    expect(parseOrderError({ message: 'boom' } as PostgrestError)).toEqual({
      code: 'UNKNOWN',
      message: 'boom',
    })
    expect(parseOrderError(null)).toBeNull()
  })
})

describe('orderErrorLabel', () => {
  it('shows actionable copy for transaction-critical codes', () => {
    expect(orderErrorLabel('PRICE_CHANGED')).toMatch(/price changed/i)
    expect(orderErrorLabel('INSUFFICIENT_STOCK')).toMatch(/stock/i)
    expect(orderErrorLabel('SELF_PURCHASE_NOT_ALLOWED')).toMatch(/your own listing/i)
    expect(orderErrorLabel('ORDER_NOT_CANCELLABLE')).toMatch(/no longer be cancelled/i)
    expect(orderErrorLabel('UNKNOWN')).toMatch(/Something went wrong/i)
  })
})
