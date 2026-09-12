import type { Database, Tables } from '../../types/database'
import type { PublicListing } from '../marketplace/marketplace.types'

export type Cart = Tables<'carts'>
export type CartItem = Tables<'cart_items'>

export type FulfillmentType = Database['public']['Enums']['fulfillment_type']

export const MAX_CART_QUANTITY = 1000
export const MAX_CHECKOUT_ITEMS = 100

/** A structured error from the cart/checkout RPCs (CODE: message prefix). */
export interface CartRpcError {
  code: string
  message: string
}

/** One cart line with its joined listing data (null when RLS hides it). */
export interface CartItemDisplay {
  id: string
  cart_id: string
  listing_id: string
  quantity: number
  /** Line total using the listing's current price (authoritative at checkout). */
  line_total: number
  listing: PublicListing | null
  /** True when the listing is no longer visible/buyable (sold/archived/etc.). */
  unavailable: boolean
}

/** Items in the cart that belong to one seller, with their subtotal. */
export interface CartSellerGroup {
  seller_id: string
  store_name: string
  items: CartItemDisplay[]
  subtotal: number
}

/** The full cart: seller groups, totals, and the total unit count. */
export interface CartSummary {
  cart_id: string
  groups: CartSellerGroup[]
  /** Lines whose listing is no longer visible (sold/archived/removed). */
  unavailable: CartItemDisplay[]
  total: number
  /** Sum of line quantities (drives the nav badge). */
  total_quantity: number
  /** Number of distinct lines. */
  line_count: number
}

/** Per-seller fulfillment choices for checkout. */
export type FulfillmentMap = Record<string, FulfillmentType>

/** Expected prices keyed by cart_item id (stale-price detection). */
export type ExpectedPriceMap = Record<string, number>

/** The payload the browser sends to checkout_cart(). */
export interface CheckoutInput {
  cart_item_ids: string[]
  fulfillments: FulfillmentMap
  expected_prices?: ExpectedPriceMap
}

/** One order created by a multi-seller checkout. */
export interface CheckoutOrder {
  order_id: string
  order_number: string
  seller_id: string
  status: Database['public']['Enums']['order_status']
  fulfillment_type: FulfillmentType
  subtotal: number
  total: number
  item_count: number
}
