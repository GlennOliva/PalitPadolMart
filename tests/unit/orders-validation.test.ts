import { describe, it, expect } from 'vitest'
import {
  validateOrderQuantity,
  validateOrderNotes,
  validateOrderFulfillment,
  isOrderCancellable,
  isOrderConfirmable,
} from '../../src/features/orders/orders-validation'
import { MAX_ORDER_NOTES_LENGTH, MAX_ORDER_QUANTITY } from '../../src/features/orders/orders.types'

describe('validateOrderQuantity', () => {
  it('rejects non-whole numbers', () => {
    expect(validateOrderQuantity(1.5, 10)).toBe('Quantity must be a whole number')
  })

  it('rejects quantities below 1', () => {
    expect(validateOrderQuantity(0, 10)).toBe('Quantity must be at least 1')
    expect(validateOrderQuantity(-2, 10)).toBe('Quantity must be at least 1')
  })

  it('rejects quantities above the marketplace cap', () => {
    expect(validateOrderQuantity(MAX_ORDER_QUANTITY + 1, MAX_ORDER_QUANTITY + 5)).toBe(
      `Quantity cannot exceed ${MAX_ORDER_QUANTITY}`,
    )
  })

  it('rejects quantities beyond the available stock', () => {
    expect(validateOrderQuantity(11, 10)).toBe('Only 10 in stock')
  })

  it('accepts a valid in-stock quantity', () => {
    expect(validateOrderQuantity(10, 10)).toBeNull()
    expect(validateOrderQuantity(1, 0)).toBe('Only 0 in stock')
  })
})

describe('validateOrderNotes', () => {
  it('rejects notes longer than the cap even when padded with whitespace', () => {
    const notes = ` ${'x'.repeat(MAX_ORDER_NOTES_LENGTH + 1)} `
    expect(validateOrderNotes(notes)).toBe(`Notes must be ${MAX_ORDER_NOTES_LENGTH} characters or fewer`)
  })

  it('accepts notes at the cap or empty', () => {
    expect(validateOrderNotes('')).toBeNull()
    expect(validateOrderNotes('  ')).toBeNull()
    expect(validateOrderNotes('x'.repeat(MAX_ORDER_NOTES_LENGTH))).toBeNull()
  })
})

describe('validateOrderFulfillment', () => {
  it('rejects pickup when the listing does not offer it', () => {
    expect(
      validateOrderFulfillment('pickup', { pickup_available: false, delivery_available: true }),
    ).toBe('This listing does not offer pickup')
  })

  it('rejects delivery when the listing does not offer it', () => {
    expect(
      validateOrderFulfillment('delivery', { pickup_available: true, delivery_available: false }),
    ).toBe('This listing does not offer delivery')
  })

  it('accepts options the listing actually offers', () => {
    expect(
      validateOrderFulfillment('pickup', { pickup_available: true, delivery_available: false }),
    ).toBeNull()
    expect(
      validateOrderFulfillment('delivery', { pickup_available: false, delivery_available: true }),
    ).toBeNull()
  })
})

describe('state guards', () => {
  it('isOrderCancellable only for pending orders', () => {
    expect(isOrderCancellable('pending')).toBe(true)
    for (const status of ['confirmed', 'preparing', 'shipped', 'completed', 'cancelled']) {
      expect(isOrderCancellable(status as never)).toBe(false)
    }
  })

  it('isOrderConfirmable only for pending orders', () => {
    expect(isOrderConfirmable('pending')).toBe(true)
    for (const status of ['confirmed', 'preparing', 'shipped', 'completed', 'cancelled']) {
      expect(isOrderConfirmable(status as never)).toBe(false)
    }
  })
})