import type { Database, Tables } from '../../types/database'

export type PaymentStatus = Database['public']['Enums']['payment_status']
export type PaymentMethod = 'manual_transfer' | 'cash_on_pickup' | 'cash_on_delivery'

export type PaymentRecord = Tables<'payments'>
export type FulfillmentDetails = Tables<'fulfillment_details'>
export type SellerPaymentMethod = Tables<'seller_payment_methods'>

export const PAYMENT_PROOF_BUCKET = 'payment-proofs'
export const MAX_PAYMENT_PROOF_BYTES = 5 * 1024 * 1024
export const MAX_PAYMENT_REFERENCE_LENGTH = 120
export const MAX_REJECTION_REASON_LENGTH = 500
export const MAX_TRACKING_NUMBER_LENGTH = 100
export const MAX_COURIER_LENGTH = 80

export const ALLOWED_PAYMENT_PROOF_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
] as const

export const PAYMENT_METHODS: PaymentMethod[] = [
  'manual_transfer',
  'cash_on_pickup',
  'cash_on_delivery',
]

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  manual_transfer: 'Manual transfer',
  cash_on_pickup: 'Cash on pickup',
  cash_on_delivery: 'Cash on delivery',
}

/** Narrows a DB text column (seller_payment_methods.method, payments.payment_method) to a PaymentMethod. */
export function isPaymentMethod(method: string): method is PaymentMethod {
  return (PAYMENT_METHODS as string[]).includes(method)
}

/**
 * The delivery destination snapshot a buyer supplies when submitting payment
 * on a delivery order. Persisted into fulfillment_details so later profile
 * edits never rewrite a confirmed order's historical destination.
 */
export interface DeliveryAddressInput {
  recipient_name: string
  phone: string
  address: string
  city: string
  province: string
  postal_code: string
  delivery_notes: string
}

/** Minimal payload for submit_payment — buyer/seller/amount are server-derived. */
export interface SubmitPaymentInput {
  order_id: string
  payment_method: PaymentMethod
  proof_path?: string | null
  reference?: string | null
  delivery?: DeliveryAddressInput | null
}

/** Seller-managed payment method row merged with its display label. */
export interface SellerPaymentMethodDisplay {
  method: PaymentMethod
  label: string
  is_enabled: boolean
  instructions: string | null
}
