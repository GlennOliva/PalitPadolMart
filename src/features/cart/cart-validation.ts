import type { FulfillmentType } from './cart.types'
import { MAX_CART_QUANTITY } from './cart.types'

/**
 * Validates a requested cart quantity against a listing's available stock.
 * A pure client-side pre-check: the add/update RPCs and the checkout RPC
 * re-validate and clamp against the locked inventory row authoritatively.
 */
export function validateCartQuantity(value: number, available: number): string | null {
  if (!Number.isInteger(value)) return 'Quantity must be a whole number'
  if (value < 1) return 'Quantity must be at least 1'
  if (value > MAX_CART_QUANTITY) return `Quantity cannot exceed ${MAX_CART_QUANTITY}`
  if (value > available) return `Only ${available} in stock`
  return null
}

/**
 * The fulfillment options a seller group can use. Because one order per
 * seller shares a single fulfillment type, an option is offered only when
 * EVERY selected item of that seller supports it.
 */
export interface FulfillmentAvailability {
  pickup: boolean
  delivery: boolean
}

export function sellerFulfillmentOptions(
  availability: FulfillmentAvailability,
): FulfillmentType[] {
  const options: FulfillmentType[] = []
  if (availability.pickup) options.push('pickup')
  if (availability.delivery) options.push('delivery')
  return options
}

/** True when every selected item of a seller supports the chosen option. */
export function isFulfillmentSupported(
  fulfillment: FulfillmentType,
  availability: FulfillmentAvailability,
): boolean {
  if (fulfillment === 'pickup') return availability.pickup
  if (fulfillment === 'delivery') return availability.delivery
  return false
}
