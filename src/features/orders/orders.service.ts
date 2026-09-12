import type { PostgrestError } from '@supabase/supabase-js'
import { supabase } from '../../lib/supabase/client'
import type { PaymentRecord } from './payments.types'
import type {
  Order,
  OrderDetail,
  OrderErrorCode,
  OrderInput,
  OrderRpcError,
  OrdersPage,
  OrderSummary,
} from './orders.types'
import { ORDER_PAGE_SIZE } from './orders.types'

const ORDER_DISPLAY_COLUMNS = `
  id,
  order_number,
  status,
  fulfillment_type,
  subtotal,
  total,
  notes,
  created_at,
  updated_at,
  confirmed_at,
  paid_at,
  preparing_at,
  shipped_at,
  ready_for_pickup_at,
  completed_at,
  cancelled_at,
  seller:public_seller_profiles ( id, store_name ),
  items:order_items ( id, listing_id, product_title, unit_price, quantity ),
  payment:payments (
    id,
    order_id,
    amount,
    payment_method,
    payment_reference,
    proof_path,
    rejection_reason,
    status,
    paid_at,
    created_at,
    updated_at
  ),
  fulfillment:fulfillment_details (
    id,
    order_id,
    fulfillment_type,
    recipient_name,
    phone,
    address,
    city,
    province,
    postal_code,
    notes,
    courier,
    tracking_number,
    pickup_location,
    pickup_instructions,
    updated_at
  )
`

/**
 * Parses a structured `CODE: message` exception from the Phase 8 order RPCs
 * back into a typed error. Unmatched messages become UNKNOWN with the raw
 * text, so users always see something actionable.
 */
export function parseOrderError(error: PostgrestError | null): OrderRpcError | null {
  if (error == null) return null
  const raw = (error.message ?? '').trim()
  const match = raw.match(/^([A-Z_]+):\s*(.+)$/)
  const code = (match?.[1] ?? null) as OrderErrorCode | null
  const message = match?.[2]?.trim() ?? raw
  if (code != null && message.length > 0) return { code, message }
  if (error.code === '42501') return { code: 'FORBIDDEN', message: 'You are not allowed to do that.' }
  return { code: 'UNKNOWN', message: raw.length > 0 ? raw : 'Something went wrong.' }
}

/** User-facing copy for a structured order/cart error code. */
export function orderErrorLabel(code: string): string {
  switch (code) {
    case 'PRICE_CHANGED':
      return 'The price changed since you viewed it. Please review and try again.'
    case 'INSUFFICIENT_STOCK':
      return 'There is not enough stock for the quantity you selected.'
    case 'LISTING_UNAVAILABLE':
    case 'LISTING_NOT_FOUND':
      return 'This listing is no longer available for purchase.'
    case 'SELLER_UNAVAILABLE':
      return 'This seller is not accepting orders right now.'
    case 'SELF_PURCHASE_NOT_ALLOWED':
      return 'You cannot buy your own listing.'
    case 'ACCOUNT_UNAVAILABLE':
      return 'Your account must be active to place an order.'
    case 'INVALID_FULFILLMENT':
      return 'The selected fulfillment option is not available for this listing.'
    case 'ORDER_NOT_FOUND':
      return 'This order could not be found.'
    case 'ORDER_NOT_CONFIRMABLE':
      return 'This order can no longer be confirmed.'
    case 'ORDER_NOT_CANCELLABLE':
      return 'This order can no longer be cancelled.'
    case 'ORDER_NOT_DELETABLE':
      return 'Only cancelled orders can be deleted.'
    case 'NO_ITEMS_SELECTED':
      return 'Choose at least one item to check out.'
    case 'TOO_MANY_ITEMS':
      return 'You can check out 100 items at a time.'
    case 'CART_EMPTY':
      return 'Your cart is empty.'
    case 'CART_ITEM_NOT_FOUND':
      return 'That item is no longer in your cart.'
    case 'FORBIDDEN':
      return 'You are not allowed to do that.'
    case 'INVALID_ORDER_STATUS':
      return 'This order is not in the right state for that action.'
    case 'ORDER_NOT_PREPARABLE':
      return 'This order cannot be prepared yet.'
    case 'ORDER_NOT_SHIPPABLE':
      return 'Only preparing orders can be marked shipped.'
    case 'ORDER_NOT_READYABLE':
      return 'Only preparing pickup orders can be marked ready for pickup.'
    case 'ORDER_NOT_COMPLETABLE':
      return 'This order cannot be completed yet.'
    case 'PAYMENT_NOT_FOUND':
      return 'This payment could not be found.'
    case 'PAYMENT_NOT_SUBMITTED':
      return 'Only submitted payments can be reviewed.'
    case 'PAYMENT_NOT_COLLECTABLE':
      return 'This cash payment is not ready to be collected.'
    case 'PAYMENT_NOT_PAID':
      return 'The payment must be verified before preparing the order.'
    case 'PAYMENT_NOT_READY':
      return 'The payment is not ready for preparation yet.'
    case 'PAYMENT_ALREADY_PAID':
      return 'This order has already been paid.'
    case 'PAYMENT_METHOD_UNAVAILABLE':
      return 'That payment method is not available for this order.'
    case 'INVALID_PAYMENT_METHOD':
      return 'That payment method does not match this order.'
    case 'PAYMENT_PROOF_REQUIRED':
      return 'Upload your payment proof to submit.'
    case 'INVALID_PAYMENT_PROOF':
      return 'The payment proof could not be accepted.'
    case 'INVALID_REFERENCE':
      return 'The payment reference is not valid.'
    case 'DELIVERY_ADDRESS_REQUIRED':
      return 'Fill in the delivery recipient and address.'
    case 'INVALID_DELIVERY_ADDRESS':
      return 'One of the delivery fields is too long.'
    case 'REJECTION_REASON_REQUIRED':
      return 'A reason is required when rejecting a payment.'
    case 'INVALID_REJECTION_REASON':
      return 'The rejection reason is too long.'
    case 'INVALID_DECISION':
      return 'That decision is not valid.'
    case 'WRONG_FULFILLMENT_TYPE':
      return 'That action does not match this order\u2019s fulfillment type.'
    case 'TRACKING_REQUIRED':
      return 'Tracking number is required for delivery orders.'
    case 'INVALID_TRACKING':
      return 'The tracking details are not valid.'
    case 'CASH_NOT_READY':
      return 'The cash payment is not ready to be collected.'
    case 'INVALID_QUANTITY':
    case 'INVALID_NOTES':
    case 'AUTH_REQUIRED':
    case 'UNKNOWN':
    default:
      return 'Something went wrong. Please try again.'
  }
}

type OrderRow = Omit<OrderSummary, 'seller' | 'buyer_name' | 'payment'> & {
  buyer_id: string
  seller: { id: string; store_name: string | null } | null
  payment: PaymentRecord[] | null
}

function toSummary(row: OrderRow, buyerName: string | null): OrderSummary {
  return {
    id: row.id,
    order_number: row.order_number,
    status: row.status,
    fulfillment_type: row.fulfillment_type,
    subtotal: row.subtotal,
    total: row.total,
    notes: row.notes,
    created_at: row.created_at,
    updated_at: row.updated_at,
    confirmed_at: row.confirmed_at,
    paid_at: row.paid_at,
    preparing_at: row.preparing_at,
    shipped_at: row.shipped_at,
    ready_for_pickup_at: row.ready_for_pickup_at,
    completed_at: row.completed_at,
    cancelled_at: row.cancelled_at,
    seller: row.seller ?? null,
    payment: row.payment?.[0] ?? null,
    fulfillment: row.fulfillment ?? null,
    buyer_name: buyerName,
    items: (row.items ?? []).map((item) => ({
      id: item.id,
      listing_id: item.listing_id,
      product_title: item.product_title,
      unit_price: item.unit_price,
      quantity: item.quantity,
    })),
  }
}

function normalizeOrderRows(rows: OrderRow[] | null): OrderSummary[] {
  return (rows ?? []).map((row) => toSummary(row, null))
}

function withBuyerNames(rows: OrderRow[], names: Map<string, string | null>): OrderSummary[] {
  return rows.map((row) => toSummary(row, names.get(row.buyer_id) ?? null))
}

/**
 * Places an order through the atomic create_marketplace_order RPC. The server
 * derives the seller, price, and totals from trusted rows and locks inventory;
 * nothing the client sends for those values is authoritative.
 */
export async function createMarketplaceOrder(
  input: OrderInput,
): Promise<{ data: Order | null; error: OrderRpcError | null }> {
  const { data, error } = await supabase.rpc('create_marketplace_order', {
    p_listing_id: input.listing_id,
    p_quantity: input.quantity,
    p_fulfillment_type: input.fulfillment_type,
    p_notes: input.notes?.trim() || undefined,
    p_expected_unit_price: input.expected_unit_price ?? undefined,
  })
  return { data: (data ?? null) as Order | null, error: parseOrderError(error) }
}

/** Seller confirmation through confirm_marketplace_order (pending → confirmed). */
export async function confirmMarketplaceOrder(
  orderId: string,
): Promise<{ data: Order | null; error: OrderRpcError | null }> {
  const { data, error } = await supabase.rpc('confirm_marketplace_order', {
    p_order_id: orderId,
  })
  return { data: (data ?? null) as Order | null, error: parseOrderError(error) }
}

/** Buyer-or-seller cancellation; restores inventory exactly once. */
export async function cancelMarketplaceOrder(
  orderId: string,
): Promise<{ data: Order | null; error: OrderRpcError | null }> {
  const { data, error } = await supabase.rpc('cancel_marketplace_order', {
    p_order_id: orderId,
  })
  return { data: (data ?? null) as Order | null, error: parseOrderError(error) }
}

/** Buyer-only removal of a finished cancelled order (cleanup / history tidy). */
export async function deleteMyCancelledOrder(
  orderId: string,
): Promise<{ error: OrderRpcError | null }> {
  const { error } = await supabase.rpc('delete_my_cancelled_order', { p_order_id: orderId })
  return { error: parseOrderError(error) }
}

/**
 * Resolves public display names for buyer user ids through the
 * public_profiles view (no PostgREST relationship to it, so fetched
 * separately). Unknown buyers render as null.
 */
async function resolveBuyerNames(
  buyerIds: string[],
): Promise<Map<string, string | null>> {
  const names = new Map<string, string | null>()
  const uniqueIds = [...new Set(buyerIds)].filter((id) => id != null)
  if (uniqueIds.length === 0) return names
  const { data } = await supabase
    .from('public_profiles')
    .select('id, display_name')
    .in('id', uniqueIds)
  for (const row of data ?? []) {
    if (row.id == null) continue
    names.set(row.id, row.display_name)
  }
  return names
}

/**
 * The buyer's own order history, newest first, paginated. RLS scopes every row
 * to auth.uid(), so unrelated orders can never appear here.
 */
export async function getBuyerOrders(
  buyerId: string,
  page = 1,
): Promise<{ data: OrdersPage | null; error: PostgrestError | null }> {
  const currentPage = Math.max(1, page)
  const from = (currentPage - 1) * ORDER_PAGE_SIZE
  const to = from + ORDER_PAGE_SIZE - 1

  const { data, count, error } = await supabase
    .from('orders')
    .select(ORDER_DISPLAY_COLUMNS, { count: 'exact' })
    .eq('buyer_id', buyerId)
    .order('created_at', { ascending: false })
    .range(from, to)

  if (error != null) return { data: null, error }
  const total = count ?? 0
  return {
    data: {
      data: normalizeOrderRows(data as OrderRow[]),
      total,
      page: currentPage,
      pageSize: ORDER_PAGE_SIZE,
      totalPages: Math.max(1, Math.ceil(total / ORDER_PAGE_SIZE)),
    },
    error: null,
  }
}

/** The seller's incoming orders, newest first, paginated. */
export async function getSellerOrders(
  sellerId: string,
  page = 1,
): Promise<{ data: OrdersPage | null; error: PostgrestError | null }> {
  const currentPage = Math.max(1, page)
  const from = (currentPage - 1) * ORDER_PAGE_SIZE
  const to = from + ORDER_PAGE_SIZE - 1

  const { data, count, error } = await supabase
    .from('orders')
    .select(ORDER_DISPLAY_COLUMNS, { count: 'exact' })
    .eq('seller_id', sellerId)
    .order('created_at', { ascending: false })
    .range(from, to)

  if (error != null) return { data: null, error }
  const total = count ?? 0
  const rawRows = (data ?? []) as OrderRow[]
  const names = await resolveBuyerNames(rawRows.map((row) => row.buyer_id))
  return {
    data: {
      data: withBuyerNames(rawRows, names),
      total,
      page: currentPage,
      pageSize: ORDER_PAGE_SIZE,
      totalPages: Math.max(1, Math.ceil(total / ORDER_PAGE_SIZE)),
    },
    error: null,
  }
}

/** One of the buyer's own orders with its snapshot items. */
export async function getBuyerOrder(
  orderId: string,
): Promise<{ data: OrderDetail | null; error: PostgrestError | null }> {
  const { data, error } = await supabase
    .from('orders')
    .select(ORDER_DISPLAY_COLUMNS)
    .eq('id', orderId)
    .maybeSingle()

  const row = (data ?? null) as OrderRow | null
  if (error != null || row == null) return { data: null, error }
  const [summary] = normalizeOrderRows([row])
  return { data: (summary ?? null) as OrderDetail | null, error }
}

/** One of the seller's orders (scoped to their store) with buyer display name. */
export async function getSellerOrder(
  sellerId: string,
  orderId: string,
): Promise<{ data: OrderDetail | null; error: PostgrestError | null }> {
  const { data, error } = await supabase
    .from('orders')
    .select(ORDER_DISPLAY_COLUMNS)
    .eq('id', orderId)
    .eq('seller_id', sellerId)
    .maybeSingle()

  const row = (data ?? null) as OrderRow | null
  if (error != null || row == null) return { data: null, error }
  const [summary] = normalizeOrderRows([row])
  const names = await resolveBuyerNames([row.buyer_id])
  const detail: OrderDetail | null =
    summary == null ? null : { ...summary, buyer_name: names.get(row.buyer_id) ?? null }
  return { data: detail, error }
}

export type { Order }
