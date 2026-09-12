import type { Database, Tables } from '../../types/database'
import type { FulfillmentDetails, PaymentRecord } from './payments.types'

export type OrderStatus = Database['public']['Enums']['order_status']
export type FulfillmentType = Database['public']['Enums']['fulfillment_type']

export type Order = Tables<'orders'>
export type OrderItem = Tables<'order_items'>

export const ORDER_PAGE_SIZE = 12
export const MAX_ORDER_QUANTITY = 1000
export const MAX_ORDER_NOTES_LENGTH = 2000

/**
 * Application error codes raised by the Phase 8 order RPCs. The SQL functions
 * `raise exception` with a `CODE: message` prefix; the service parses the
 * prefix back into these codes so pages can show precise, actionable errors.
 */
export type OrderErrorCode =
  | 'AUTH_REQUIRED'
  | 'ACCOUNT_UNAVAILABLE'
  | 'LISTING_NOT_FOUND'
  | 'LISTING_UNAVAILABLE'
  | 'SELLER_UNAVAILABLE'
  | 'SELF_PURCHASE_NOT_ALLOWED'
  | 'INVALID_QUANTITY'
  | 'INVALID_NOTES'
  | 'INSUFFICIENT_STOCK'
  | 'PRICE_CHANGED'
  | 'INVALID_FULFILLMENT'
  | 'ORDER_NOT_FOUND'
  | 'ORDER_NOT_CONFIRMABLE'
  | 'ORDER_NOT_CANCELLABLE'
  | 'ORDER_NOT_DELETABLE'
  | 'NO_ITEMS_SELECTED'
  | 'TOO_MANY_ITEMS'
  | 'CART_EMPTY'
  | 'CART_ITEM_NOT_FOUND'
  | 'FORBIDDEN'
  | 'INVALID_ORDER_STATUS'
  | 'ORDER_NOT_PREPARABLE'
  | 'ORDER_NOT_SHIPPABLE'
  | 'ORDER_NOT_READYABLE'
  | 'ORDER_NOT_COMPLETABLE'
  | 'PAYMENT_NOT_FOUND'
  | 'PAYMENT_NOT_SUBMITTED'
  | 'PAYMENT_NOT_COLLECTABLE'
  | 'PAYMENT_NOT_PAID'
  | 'PAYMENT_NOT_READY'
  | 'PAYMENT_ALREADY_PAID'
  | 'PAYMENT_METHOD_UNAVAILABLE'
  | 'INVALID_PAYMENT_METHOD'
  | 'PAYMENT_PROOF_REQUIRED'
  | 'INVALID_PAYMENT_PROOF'
  | 'INVALID_REFERENCE'
  | 'DELIVERY_ADDRESS_REQUIRED'
  | 'INVALID_DELIVERY_ADDRESS'
  | 'REJECTION_REASON_REQUIRED'
  | 'INVALID_REJECTION_REASON'
  | 'INVALID_DECISION'
  | 'WRONG_FULFILLMENT_TYPE'
  | 'TRACKING_REQUIRED'
  | 'INVALID_TRACKING'
  | 'CASH_NOT_READY'

export interface OrderRpcError {
  code: OrderErrorCode | 'UNKNOWN'
  message: string
}

/** The trusted payload the browser sends to create_marketplace_order(). */
export interface OrderInput {
  listing_id: string
  quantity: number
  fulfillment_type: FulfillmentType
  notes?: string
  expected_unit_price?: number
}

/** A single order_item snapshot as embedded in an order query. */
export interface OrderItemDisplay {
  id: string
  listing_id: string
  product_title: string
  unit_price: number
  quantity: number
}

/** A summarized order row with its snapshot item(s) and seller display info. */
export interface OrderSummary {
  id: string
  order_number: string
  status: OrderStatus
  fulfillment_type: FulfillmentType
  subtotal: number
  total: number
  notes: string | null
  created_at: string
  updated_at: string
  confirmed_at: string | null
  paid_at: string | null
  preparing_at: string | null
  shipped_at: string | null
  ready_for_pickup_at: string | null
  completed_at: string | null
  cancelled_at: string | null
  seller: { id: string; store_name: string | null } | null
  items: OrderItemDisplay[]
  payment: PaymentRecord | null
  fulfillment: FulfillmentDetails | null
  /** Buyer display name — populated for seller-facing views only. */
  buyer_name: string | null
}

/** An order detail page view (adds the buyer display name for seller views). */
export interface OrderDetail extends OrderSummary {
  buyer_name: string | null
}

/** A paginated order list result. */
export interface OrdersPage {
  data: OrderSummary[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}
