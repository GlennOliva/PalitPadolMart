import { describe, it, expect } from 'vitest'
import {
  isFulfillmentSupported,
  sellerFulfillmentOptions,
  validateCartQuantity,
} from '../../src/features/cart/cart-validation'
import { MAX_CART_QUANTITY } from '../../src/features/cart/cart.types'

describe('validateCartQuantity', () => {
  it('accepts a valid whole quantity within stock', () => {
    expect(validateCartQuantity(3, 10)).toBeNull()
  })

  it('accepts exactly the available stock', () => {
    expect(validateCartQuantity(10, 10)).toBeNull()
  })

  it('rejects a non-integer quantity', () => {
    expect(validateCartQuantity(1.5, 10)).toBe('Quantity must be a whole number')
  })

  it('rejects a quantity below 1', () => {
    expect(validateCartQuantity(0, 10)).toBe('Quantity must be at least 1')
  })

  it('rejects a quantity above the cart cap', () => {
    expect(validateCartQuantity(MAX_CART_QUANTITY + 1, MAX_CART_QUANTITY * 2)).toContain(
      `exceed ${MAX_CART_QUANTITY}`,
    )
  })

  it('rejects a quantity above available stock', () => {
    expect(validateCartQuantity(11, 10)).toBe('Only 10 in stock')
  })
})

describe('sellerFulfillmentOptions', () => {
  it('offers both options when every item supports both', () => {
    expect(sellerFulfillmentOptions({ pickup: true, delivery: true })).toEqual([
      'pickup',
      'delivery',
    ])
  })

  it('offers only the supported option when items differ', () => {
    expect(sellerFulfillmentOptions({ pickup: true, delivery: false })).toEqual(['pickup'])
    expect(sellerFulfillmentOptions({ pickup: false, delivery: true })).toEqual(['delivery'])
  })

  it('offers nothing when no option is shared', () => {
    expect(sellerFulfillmentOptions({ pickup: false, delivery: false })).toEqual([])
  })
})

describe('isFulfillmentSupported', () => {
  it('matches pickup/delivery availability', () => {
    expect(isFulfillmentSupported('pickup', { pickup: true, delivery: false })).toBe(true)
    expect(isFulfillmentSupported('pickup', { pickup: false, delivery: true })).toBe(false)
    expect(isFulfillmentSupported('delivery', { pickup: false, delivery: true })).toBe(true)
    expect(isFulfillmentSupported('delivery', { pickup: true, delivery: false })).toBe(false)
  })
})
