import type { PostgrestError } from '@supabase/supabase-js'
import { supabase } from '../../lib/supabase/client'
import { parseOrderError } from './orders.service'
import type { Order, OrderRpcError } from './orders.types'
import type { PaymentRecord, SellerPaymentMethod, SubmitPaymentInput } from './payments.types'
import { MAX_PAYMENT_PROOF_BYTES, PAYMENT_PROOF_BUCKET } from './payments.types'

export type PaymentRpc = { data: PaymentRecord | null; error: OrderRpcError | null }

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

async function runPaymentRpc(
  rpcName: string,
  params: Record<string, unknown>,
): Promise<PaymentRpc> {
  try {
    const { data, error } = await callRpc(rpcName, params)
    return { data: (data ?? null) as PaymentRecord | null, error: parseOrderError(error) }
  } catch {
    return { data: null, error: { code: 'UNKNOWN', message: 'Something went wrong.' } }
  }
}

/**
 * Buyer submits payment details for an order (proof + reference + method, and
 * the delivery snapshot for delivery orders). The RPC derives buyer/seller/
 * amount from trusted rows and moves the payment to `submitted` (manual) or
 * `pending` (cash).
 */
export async function submitOrderPayment(
  input: SubmitPaymentInput,
): Promise<PaymentRpc> {
  const delivery = input.delivery ?? null
  return runPaymentRpc('submit_payment', {
    p_order_id: input.order_id,
    p_payment_method: input.payment_method,
    p_proof_path: input.proof_path ?? undefined,
    p_reference: input.reference?.trim() || undefined,
    p_recipient_name: delivery?.recipient_name.trim() || undefined,
    p_phone: delivery?.phone.trim() || undefined,
    p_address: delivery?.address.trim() || undefined,
    p_city: delivery?.city.trim() || undefined,
    p_province: delivery?.province.trim() || undefined,
    p_postal_code: delivery?.postal_code.trim() || undefined,
    p_delivery_notes: delivery?.delivery_notes.trim() || undefined,
  })
}

/** Seller approves a submitted payment → marks paid and starts the order flow. */
export async function approveOrderPayment(
  paymentId: string,
): Promise<PaymentRpc> {
  return runPaymentRpc('review_payment', {
    p_payment_id: paymentId,
    p_decision: 'approve',
  })
}

/** Seller rejects a submitted payment; buyer can correct and resubmit. */
export async function rejectOrderPayment(
  paymentId: string,
  reason: string,
): Promise<PaymentRpc> {
  return runPaymentRpc('review_payment', {
    p_payment_id: paymentId,
    p_decision: 'reject',
    p_rejection_reason: reason.trim() || undefined,
  })
}

/** Seller records cash collected at the handoff (cash orders). */
export async function markCashReceived(
  paymentId: string,
): Promise<PaymentRpc> {
  return runPaymentRpc('mark_cash_received', { p_payment_id: paymentId })
}

export interface SellerPaymentMethodsRpc {
  data: SellerPaymentMethod[] | null
  error: OrderRpcError | null
}

/** The seller's current payment-method settings, one row per method. */
export async function getSellerPaymentMethods(
  sellerId: string,
): Promise<SellerPaymentMethodsRpc> {
  const { data, error } = await supabase
    .from('seller_payment_methods')
    .select('*')
    .eq('seller_id', sellerId)
    .order('method', { ascending: true })
  if (error != null) return { data: null, error: parseOrderError(error) }
  return { data: (data ?? []) as SellerPaymentMethod[], error: null }
}

/** Upserts one method's availability + seller instructions. */
export async function setSellerPaymentMethod(
  sellerId: string,
  method: string,
  isEnabled: boolean,
  instructions: string,
): Promise<{ error: OrderRpcError | null }> {
  const { error } = await supabase.from('seller_payment_methods').upsert(
    {
      seller_id: sellerId,
      method,
      is_enabled: isEnabled,
      instructions: instructions.trim() || null,
    },
    { onConflict: 'seller_id,method' },
  )
  return { error: parseOrderError(error) }
}

/**
 * Storage errors can carry raw database/RLS internals (e.g. "new row violates
 * row-level security policy" when the order is not yet in a payable state).
 * Those internals are never surfaced to an end user — a denied upload becomes
 * the same safe, friendly copy.
 */
function friendlyProofUploadError(message: string): string {
  const msg = message.toLowerCase()
  if (msg.includes('the resource already exists')) return 'Try uploading again.'
  return 'Please check the order and try again.'
}

/**
 * Uploads a payment proof to the private payment-proofs bucket. Path convention
 * is {buyer}/{order}/{file} — the storage RLS checks the first segment against
 * auth.uid() and the second against the buyer's confirmed order. Returns the
 * storage path to pass to submit_payment.
 */
export async function uploadPaymentProof(
  file: File,
  orderId: string,
  buyerId: string,
): Promise<{ path: string | null; error: string | null }> {
  if (file.size > MAX_PAYMENT_PROOF_BYTES) {
    return { path: null, error: 'Payment proof must be 5 MB or smaller.' }
  }
  const extension = file.name.split('.').pop()?.toLowerCase() ?? 'bin'
  const path = `${buyerId}/${orderId}/proof-${Date.now()}.${extension}`
  try {
    const { error } = await supabase.storage
      .from(PAYMENT_PROOF_BUCKET)
      .upload(path, file, { upsert: true })
    if (error != null) {
      return { path: null, error: friendlyProofUploadError(error.message ?? '') }
    }
    return { path, error: null }
  } catch {
    return { path: null, error: 'Please check the order and try again.' }
  }
}

/** Builds a short-lived URL for a proof object when one exists. */
export async function paymentProofUrl(
  path: string | null | undefined,
): Promise<string | null> {
  if (path == null || path.length === 0) return null
  const { data } = await supabase.storage.from(PAYMENT_PROOF_BUCKET).createSignedUrl(path, 60 * 5)
  return data?.signedUrl ?? null
}

export type { Order }
