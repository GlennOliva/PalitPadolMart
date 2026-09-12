import type { FulfillmentType, OrderStatus } from './orders.types'
import { MAX_ORDER_NOTES_LENGTH, MAX_ORDER_QUANTITY } from './orders.types'

/**
 * Validates a requested quantity for a listing. Pure client-side pre-check:
 * the create RPC re-validates against the locked inventory row, so this never
 * guards the transaction — it only catches obvious mistakes early.
 */
export function validateOrderQuantity(value: number, available: number): string | null {
  if (!Number.isInteger(value)) return 'Quantity must be a whole number'
  if (value < 1) return 'Quantity must be at least 1'
  if (value > MAX_ORDER_QUANTITY) return `Quantity cannot exceed ${MAX_ORDER_QUANTITY}`
  if (value > available) return `Only ${available} in stock`
  return null
}

/** Validates the optional order notes (trimmed, bounded). */
export function validateOrderNotes(notes: string): string | null {
  const trimmed = notes.trim()
  if (trimmed.length > MAX_ORDER_NOTES_LENGTH) {
    return `Notes must be ${MAX_ORDER_NOTES_LENGTH} characters or fewer`
  }
  return null
}

export interface OrderFulfillmentOptions {
  pickup_available: boolean
  delivery_available: boolean
}

/**
 * A fulfillment type is valid when the listing actually offers it. The review
 * page only offers these choices, so an invalid one here is a guard for
 * missing data — the RPC enforces the same rule authoritatively.
 */
export function validateOrderFulfillment(
  fulfillment: FulfillmentType,
  options: OrderFulfillmentOptions,
): string | null {
  if (fulfillment === 'pickup' && !options.pickup_available) {
    return 'This listing does not offer pickup'
  }
  if (fulfillment === 'delivery' && !options.delivery_available) {
    return 'This listing does not offer delivery'
  }
  return null
}

/** True when the order can still be cancelled (pending only). */
export function isOrderCancellable(status: OrderStatus): boolean {
  return status === 'pending'
}

/** True when the seller can still confirm the order (pending only). */
export function isOrderConfirmable(status: OrderStatus): boolean {
  return status === 'pending'
}
