import { describe, it, expect } from 'vitest'
import {
  hasPaymentErrors,
  validateCourier,
  validateDeliveryAddress,
  validateProofFile,
  validateReference,
  validateRejectionReason,
  validateTrackingNumber,
  type PaymentFormErrors,
} from '../../src/features/orders/payments-validation'
import {
  MAX_COURIER_LENGTH,
  MAX_PAYMENT_REFERENCE_LENGTH,
  MAX_REJECTION_REASON_LENGTH,
  MAX_TRACKING_NUMBER_LENGTH,
} from '../../src/features/orders/payments.types'
import {
  isPaymentMethod,
  PAYMENT_METHOD_LABELS,
} from '../../src/features/orders/payments.types'

describe('validateReference', () => {
  it('accepts an empty or absent reference', () => {
    expect(validateReference('')).toBeNull()
    expect(validateReference('   ')).toBeNull()
  })

  it('accepts a reference within the limit', () => {
    expect(validateReference('GCash ref 1234')).toBeNull()
  })

  it('rejects an over-long reference', () => {
    expect(validateReference('a'.repeat(MAX_PAYMENT_REFERENCE_LENGTH + 1))).toContain(
      `${MAX_PAYMENT_REFERENCE_LENGTH} characters or fewer`,
    )
  })
})

describe('validateProofFile', () => {
  it('requires a file', () => {
    expect(validateProofFile(null)).toBe('Payment proof is required.')
  })

  it('accepts allowed image and PDF types', () => {
    for (const type of ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']) {
      expect(validateProofFile({ type } as File)).toBeNull()
    }
  })

  it('rejects other file types', () => {
    expect(validateProofFile({ type: 'text/plain' } as File)).toContain('JPG, PNG, WebP, or PDF')
  })
})

describe('validateRejectionReason', () => {
  it('requires a reason', () => {
    expect(validateRejectionReason('')).toBe('A reason is required when rejecting a payment.')
  })

  it('rejects an over-long reason', () => {
    expect(validateRejectionReason('r'.repeat(MAX_REJECTION_REASON_LENGTH + 1))).toContain(
      `${MAX_REJECTION_REASON_LENGTH} characters or fewer`,
    )
  })
})

describe('validateTrackingNumber / validateCourier', () => {
  it('requires both values', () => {
    expect(validateTrackingNumber('')).toBe('Tracking number is required.')
    expect(validateCourier('')).toBe('Courier is required.')
  })

  it('rejects over-long values', () => {
    expect(validateTrackingNumber('t'.repeat(MAX_TRACKING_NUMBER_LENGTH + 1))).toContain(
      `${MAX_TRACKING_NUMBER_LENGTH} characters or fewer`,
    )
    expect(validateCourier('c'.repeat(MAX_COURIER_LENGTH + 1))).toContain(
      `${MAX_COURIER_LENGTH} characters or fewer`,
    )
  })
})

describe('validateDeliveryAddress', () => {
  const valid = {
    recipient_name: 'Ana',
    phone: '09171234567',
    address: '123 Street',
    city: 'Cebu City',
    province: 'Cebu',
    postal_code: '6000',
    delivery_notes: '',
  }

  it('accepts a null input', () => {
    expect(validateDeliveryAddress(null)).toBeNull()
  })

  it('accepts a complete delivery address', () => {
    expect(validateDeliveryAddress(valid)).toBeNull()
  })

  it('requires the six destination fields', () => {
    const errors = validateDeliveryAddress({
      ...valid,
      recipient_name: '  ',
      phone: '',
    })
    expect(errors).not.toBeNull()
    expect(errors?.recipient_name).toContain('required')
    expect(errors?.phone).toContain('required')
  })

  it('rejects over-long fields', () => {
    const errors = validateDeliveryAddress({ ...valid, address: 'a'.repeat(201) })
    expect(errors?.address).toContain('200 characters or fewer')
  })
})

describe('hasPaymentErrors', () => {
  it('is false for a clean form', () => {
    expect(hasPaymentErrors({} as PaymentFormErrors)).toBe(false)
  })

  it('is true when a delivery field is set', () => {
    expect(hasPaymentErrors({ delivery: { city: 'required' } })).toBe(true)
  })

  it('is true for proof or reference errors', () => {
    expect(hasPaymentErrors({ proof: 'required' })).toBe(true)
    expect(hasPaymentErrors({ reference: 'too long' })).toBe(true)
  })
})

describe('isPaymentMethod / PAYMENT_METHOD_LABELS', () => {
  it('narrows known methods only', () => {
    expect(isPaymentMethod('manual_transfer')).toBe(true)
    expect(isPaymentMethod('cash_on_pickup')).toBe(true)
    expect(isPaymentMethod('cash_on_delivery')).toBe(true)
    expect(isPaymentMethod('bank_transfer')).toBe(false)
    expect(isPaymentMethod('')).toBe(false)
  })

  it('labels every known method', () => {
    expect(PAYMENT_METHOD_LABELS.manual_transfer).toBe('Manual transfer')
    expect(PAYMENT_METHOD_LABELS.cash_on_pickup).toBe('Cash on pickup')
    expect(PAYMENT_METHOD_LABELS.cash_on_delivery).toBe('Cash on delivery')
  })
})
