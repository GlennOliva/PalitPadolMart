import {
  ALLOWED_PAYMENT_PROOF_TYPES,
  MAX_PAYMENT_REFERENCE_LENGTH,
  MAX_REJECTION_REASON_LENGTH,
  MAX_TRACKING_NUMBER_LENGTH,
  MAX_COURIER_LENGTH,
} from './payments.types'
import type { DeliveryAddressInput } from './payments.types'

export interface PaymentFormErrors {
  proof?: string | null
  reference?: string | null
  delivery?: Partial<Record<keyof DeliveryAddressInput, string>>
}

export function validateReference(value: string): string | null {
  const trimmed = value.trim()
  if (trimmed.length === 0) return null
  if (trimmed.length > MAX_PAYMENT_REFERENCE_LENGTH) {
    return `Reference must be ${MAX_PAYMENT_REFERENCE_LENGTH} characters or fewer.`
  }
  return null
}

export function validateProofFile(file: File | null): string | null {
  if (file == null) return 'Payment proof is required.'
  if (!ALLOWED_PAYMENT_PROOF_TYPES.includes(file.type as (typeof ALLOWED_PAYMENT_PROOF_TYPES)[number])) {
    return 'Payment proof must be a JPG, PNG, WebP, or PDF.'
  }
  return null
}

export function validateRejectionReason(value: string): string | null {
  const trimmed = value.trim()
  if (trimmed.length === 0) return 'A reason is required when rejecting a payment.'
  if (trimmed.length > MAX_REJECTION_REASON_LENGTH) {
    return `Reason must be ${MAX_REJECTION_REASON_LENGTH} characters or fewer.`
  }
  return null
}

export function validateTrackingNumber(value: string): string | null {
  const trimmed = value.trim()
  if (trimmed.length === 0) return 'Tracking number is required.'
  if (trimmed.length > MAX_TRACKING_NUMBER_LENGTH) {
    return `Tracking number must be ${MAX_TRACKING_NUMBER_LENGTH} characters or fewer.`
  }
  return null
}

export function validateCourier(value: string): string | null {
  const trimmed = value.trim()
  if (trimmed.length === 0) return 'Courier is required.'
  if (trimmed.length > MAX_COURIER_LENGTH) {
    return `Courier must be ${MAX_COURIER_LENGTH} characters or fewer.`
  }
  return null
}

const DELIVERY_MAX_LENGTHS: Record<keyof DeliveryAddressInput, number> = {
  recipient_name: 80,
  phone: 30,
  address: 200,
  city: 80,
  province: 80,
  postal_code: 20,
  delivery_notes: 500,
}

const DELIVERY_LABELS: Record<keyof DeliveryAddressInput, string> = {
  recipient_name: 'Recipient name',
  phone: 'Phone number',
  address: 'Street address',
  city: 'City',
  province: 'Province / region',
  postal_code: 'Postal code',
  delivery_notes: 'Delivery notes',
}

export function validateDeliveryAddress(
  input: DeliveryAddressInput | null | undefined,
): Partial<Record<keyof DeliveryAddressInput, string>> | null {
  if (input == null) return null
  const errors: Partial<Record<keyof DeliveryAddressInput, string>> = {}
  const required: (keyof DeliveryAddressInput)[] = [
    'recipient_name',
    'phone',
    'address',
    'city',
    'province',
    'postal_code',
  ]
  for (const field of required) {
    const value = input[field]?.trim() ?? ''
    if (value.length === 0) {
      errors[field] = `${DELIVERY_LABELS[field]} is required.`
      continue
    }
    if (value.length > DELIVERY_MAX_LENGTHS[field]) {
      errors[field] = `${DELIVERY_LABELS[field]} must be ${DELIVERY_MAX_LENGTHS[field]} characters or fewer.`
    }
  }
  const notes = input.delivery_notes?.trim() ?? ''
  if (notes.length > DELIVERY_MAX_LENGTHS.delivery_notes) {
    errors.delivery_notes = `Delivery notes must be ${DELIVERY_MAX_LENGTHS.delivery_notes} characters or fewer.`
  }
  return Object.keys(errors).length > 0 ? errors : null
}

export function hasPaymentErrors(errors: PaymentFormErrors): boolean {
  if (errors.proof != null || errors.reference != null) return true
  if (errors.delivery != null) {
    return Object.values(errors.delivery).some((value) => value != null)
  }
  return false
}
