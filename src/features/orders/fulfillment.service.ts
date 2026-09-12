import type { PostgrestError } from '@supabase/supabase-js'
import { supabase } from '../../lib/supabase/client'
import { parseOrderError } from './orders.service'
import type { Order, OrderRpcError } from './orders.types'

type FulfillmentRpc = { data: Order | null; error: OrderRpcError | null }

/**
 * The generated client types rpc() against the exact Postgres function-name
 * union, so a dynamic name needs a narrow runtime-cast wrapper. Server-side
 * validation (the raised exception codes) remains authoritative.
 *
 * IMPORTANT: the cast must NOT detach the method. Calling a bare `supabase.rpc`
 * reference would drop the client receiver (`this`), so the internal
 * `this.rest` lookup throws `undefined is not an object (evaluating
 * 'this.rest')`. Invoke through the member expression so the receiver is kept.
 */
type RpcFn = (
  name: string,
  args: Record<string, unknown>,
) => Promise<{ data: unknown; error: PostgrestError | null }>

async function callRpc(
  rpcName: string,
  params: Record<string, unknown>,
): Promise<{ data: unknown; error: PostgrestError | null }> {
  return (supabase.rpc as unknown as RpcFn)(rpcName, params)
}

async function runFulfillmentRpc(
  rpcName: string,
  params: Record<string, unknown>,
): Promise<FulfillmentRpc> {
  try {
    const { data, error } = await callRpc(rpcName, params)
    return { data: (data ?? null) as Order | null, error: parseOrderError(error) }
  } catch {
    return { data: null, error: { code: 'UNKNOWN', message: 'Something went wrong.' } }
  }
}

/** Confirmed → preparing (seller begins working the order). */
export async function startOrderPreparation(
  orderId: string,
): Promise<FulfillmentRpc> {
  return runFulfillmentRpc('start_order_preparation', { p_order_id: orderId })
}

/** preparing → shipped with tracking details (delivery orders). */
export async function markOrderShipped(
  orderId: string,
  trackingNumber: string,
  courier: string,
): Promise<FulfillmentRpc> {
  return runFulfillmentRpc('mark_order_shipped', {
    p_order_id: orderId,
    p_tracking_number: trackingNumber.trim() || undefined,
    p_courier: courier.trim() || undefined,
  })
}

/** preparing → ready_for_pickup (pickup orders, incl. cash-on-pickup). */
export async function markOrderReadyForPickup(
  orderId: string,
): Promise<FulfillmentRpc> {
  return runFulfillmentRpc('mark_order_ready_for_pickup', { p_order_id: orderId })
}

/** Buyer confirms receipt (shipped → completed; ready_for_pickup → completed). */
export async function confirmOrderReceived(
  orderId: string,
): Promise<FulfillmentRpc> {
  return runFulfillmentRpc('confirm_order_received', { p_order_id: orderId })
}

/** Whether a cash order is ready to be collected by the seller. */
export function cashIsCollectable(order: {
  status: string
  payment: { status: string; payment_method: string | null } | null
}): boolean {
  const method = order.payment?.payment_method
  if (method !== 'cash_on_pickup' && method !== 'cash_on_delivery') return false
  if (order.payment?.status === 'paid') return false
  if (order.status !== 'ready_for_pickup' && order.status !== 'shipped') return false
  return order.payment?.status === 'pending'
}
