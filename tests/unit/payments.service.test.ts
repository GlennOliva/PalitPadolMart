import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { PostgrestError } from '@supabase/supabase-js'
import {
  submitOrderPayment,
  approveOrderPayment,
  rejectOrderPayment,
  markCashReceived,
  uploadPaymentProof,
  paymentProofUrl,
  getSellerPaymentMethods,
  setSellerPaymentMethod,
} from '../../src/features/orders/payments.service'
import { PAYMENT_PROOF_BUCKET } from '../../src/features/orders/payments.types'

/**
 * PHASE 9 SERVICE INVARIANTS.
 *
 * The payment amount is a TRUSTED server value derived from the order row —
 * the client API surface must never accept or pass a `p_amount`. Cross-buyer /
 * cross-seller / stranger authorization is enforced in the SECURITY DEFINER
 * RPCs and proven by verify-phase9.mjs against the hosted DB; these tests pin
 * the app-side request assembly and the storage path convention.
 */
const { payMocks } = vi.hoisted(() => ({
  payMocks: {
    rpc: vi.fn(),
    from: vi.fn(),
    storageFrom: vi.fn(),
  },
}))

vi.mock('../../src/lib/supabase/client', () => ({
  supabase: {
    rpc: payMocks.rpc,
    from: payMocks.from,
    storage: { from: payMocks.storageFrom },
  },
}))

describe('submitOrderPayment (trusted payment request)', () => {
  beforeEach(() => {
    payMocks.rpc.mockReset()
    payMocks.storageFrom.mockReset()
  })

  it('sends manual-transfer proof/reference and a trimmed delivery snapshot — never an amount', async () => {
    payMocks.rpc.mockResolvedValueOnce({ data: { id: 'pay-1', status: 'submitted' }, error: null })

    const { data, error } = await submitOrderPayment({
      order_id: 'order-1',
      payment_method: 'manual_transfer',
      proof_path: 'buyer-1/order-1/proof.png',
      reference: '  GCASH-123  ',
      delivery: {
        recipient_name: ' Ana Test ',
        phone: '09170000000',
        address: ' 123 Sesame Street ',
        city: 'Cebu City',
        province: 'Cebu',
        postal_code: '6000',
        delivery_notes: '  ',
      },
    })

    expect(error).toBeNull()
    expect(data).toEqual({ id: 'pay-1', status: 'submitted' })
    expect(payMocks.rpc).toHaveBeenCalledTimes(1)
    expect(payMocks.rpc).toHaveBeenCalledWith('submit_payment', {
      p_order_id: 'order-1',
      p_payment_method: 'manual_transfer',
      p_proof_path: 'buyer-1/order-1/proof.png',
      p_reference: 'GCASH-123',
      p_recipient_name: 'Ana Test',
      p_phone: '09170000000',
      p_address: '123 Sesame Street',
      p_city: 'Cebu City',
      p_province: 'Cebu',
      p_postal_code: '6000',
      p_delivery_notes: undefined,
    })
    expect(payMocks.rpc.mock.calls[0][1]).not.toHaveProperty('p_amount')
  })

  it('omits optional proof/address params for a cash-on-pickup pickup order', async () => {
    payMocks.rpc.mockResolvedValueOnce({ data: { id: 'pay-2', status: 'pending' }, error: null })

    await submitOrderPayment({ order_id: 'order-2', payment_method: 'cash_on_pickup' })

    expect(payMocks.rpc).toHaveBeenCalledWith('submit_payment', {
      p_order_id: 'order-2',
      p_payment_method: 'cash_on_pickup',
      p_proof_path: undefined,
      p_reference: undefined,
      p_recipient_name: undefined,
      p_phone: undefined,
      p_address: undefined,
      p_city: undefined,
      p_province: undefined,
      p_postal_code: undefined,
      p_delivery_notes: undefined,
    })
    const args = payMocks.rpc.mock.calls[0][1] as Record<string, unknown>
    expect(args).not.toHaveProperty('p_amount')
  })

  it('maps a structured RPC error through parseOrderError', async () => {
    payMocks.rpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'PAYMENT_NOT_SUBMITTED: only submitted payments can be reviewed' },
    })

    const { data, error } = await approveOrderPayment('pay-1')
    expect(data).toBeNull()
    expect(error).toEqual({
      code: 'PAYMENT_NOT_SUBMITTED',
      message: 'only submitted payments can be reviewed',
    })
  })
})

describe('review / cash RPC mapping', () => {
  beforeEach(() => {
    payMocks.rpc.mockReset()
  })

  it('approve → review_payment approve', async () => {
    payMocks.rpc.mockResolvedValueOnce({ data: { id: 'pay-1', status: 'paid' }, error: null })
    await approveOrderPayment('pay-1')
    expect(payMocks.rpc).toHaveBeenCalledWith('review_payment', {
      p_payment_id: 'pay-1',
      p_decision: 'approve',
    })
  })

  it('reject trims the reason and omits a blank one', async () => {
    payMocks.rpc.mockResolvedValueOnce({ data: { id: 'pay-1', status: 'rejected' }, error: null })
    await rejectOrderPayment('pay-1', '  Blurry image  ')
    expect(payMocks.rpc).toHaveBeenCalledWith('review_payment', {
      p_payment_id: 'pay-1',
      p_decision: 'reject',
      p_rejection_reason: 'Blurry image',
    })
    payMocks.rpc.mockResolvedValueOnce({ data: { id: 'pay-1', status: 'rejected' }, error: null })
    await rejectOrderPayment('pay-1', '   ')
    expect(payMocks.rpc).toHaveBeenLastCalledWith('review_payment', {
      p_payment_id: 'pay-1',
      p_decision: 'reject',
      p_rejection_reason: undefined,
    })
  })

  it('markCashReceived → mark_cash_received', async () => {
    payMocks.rpc.mockResolvedValueOnce({ data: { id: 'pay-1', status: 'paid' }, error: null })
    await markCashReceived('pay-1')
    expect(payMocks.rpc).toHaveBeenCalledWith('mark_cash_received', { p_payment_id: 'pay-1' })
  })
})

describe('uploadPaymentProof', () => {
  beforeEach(() => {
    payMocks.storageFrom.mockReset()
  })

  it('rejects an over-limit file without touching storage', async () => {
    const big = { name: 'proof.png', size: 5 * 1024 * 1024 + 1, type: 'image/png' } as File
    const res = await uploadPaymentProof(big, 'order-1', 'buyer-1')
    expect(res.path).toBeNull()
    expect(res.error).toMatch(/5 MB or smaller/i)
    expect(payMocks.storageFrom).not.toHaveBeenCalled()
  })

  it('uploads into the private bucket at {buyer}/{order}/{proof-filename} with upsert', async () => {
    const upload = vi.fn(async (_path: string, _file: BodyInit) => ({
      data: { path: 'ignored' },
      error: null,
    }))
    payMocks.storageFrom.mockReturnValue({ upload })

    const file = new File(['x'], 'gcash.png', { type: 'image/png' })
    const res = await uploadPaymentProof(file, 'order-1', 'buyer-1')

    expect(res.error).toBeNull()
    expect(res.path).toMatch(/^buyer-1\/order-1\/proof-\d+\.png$/)
    expect(payMocks.storageFrom).toHaveBeenCalledWith(PAYMENT_PROOF_BUCKET)
    const uploadedCall = upload.mock.calls[0] as [string, BodyInit]
    expect(uploadedCall[0]).toBe(res.path)
    expect(uploadedCall[1]).toBe(file)
  })

  it('maps an existing-object collision to a friendly retry message', async () => {
    payMocks.storageFrom.mockReturnValue({
      upload: vi.fn(async () => ({ data: null, error: { message: 'The resource already exists' } })),
    })
    const res = await uploadPaymentProof(new File(['x'], 'a.png', { type: 'image/png' }), 'order-1', 'buyer-1')
    expect(res.path).toBeNull()
    expect(res.error).toBe('Try uploading again.')
  })

  it('never leaks a storage RLS denial to the user', async () => {
    payMocks.storageFrom.mockReturnValue({
      upload: vi.fn(async () => ({
        data: null,
        error: { message: 'new row violates row-level security policy' },
      })),
    })
    const res = await uploadPaymentProof(new File(['x'], 'a.png', { type: 'image/png' }), 'order-1', 'buyer-1')
    expect(res.path).toBeNull()
    expect(res.error).toBe('Please check the order and try again.')
    expect(res.error).not.toMatch(/row-level|violates/i)
  })

  it('still uses the friendly copy when the storage call itself throws', async () => {
    payMocks.storageFrom.mockReturnValue({
      upload: vi.fn(async () => {
        throw new Error('42501 permission denied')
      }),
    })
    const res = await uploadPaymentProof(new File(['x'], 'a.png', { type: 'image/png' }), 'order-1', 'buyer-1')
    expect(res.path).toBeNull()
    expect(res.error).toBe('Please check the order and try again.')
  })
})

describe('paymentProofUrl', () => {
  beforeEach(() => {
    payMocks.storageFrom.mockReset()
  })

  it('returns null for a missing path without calling storage', async () => {
    expect(await paymentProofUrl(null)).toBeNull()
    expect(await paymentProofUrl('')).toBeNull()
    expect(payMocks.storageFrom).not.toHaveBeenCalled()
  })

  it('builds a signed URL from the proof path', async () => {
    payMocks.storageFrom.mockReturnValue({
      createSignedUrl: vi.fn(async () => ({ data: { signedUrl: 'https://signed/url' }, error: null })),
    })
    expect(await paymentProofUrl('buyer-1/order-1/proof.png')).toBe('https://signed/url')
    expect(payMocks.storageFrom).toHaveBeenCalledWith(PAYMENT_PROOF_BUCKET)
  })
})

describe('seller payment-method self-service', () => {
  beforeEach(() => {
    payMocks.from.mockReset()
  })

  it('reads only the seller-owned rows (RLS-scoped, no raw cross-seller access)', async () => {
    payMocks.from.mockReturnValue({
      select: () => ({
        eq: () => ({
          order: async () => ({
            data: [{ id: 'spm-1', method: 'manual_transfer', is_enabled: true }],
            error: null,
          }),
        }),
      }),
    })
    const res = await getSellerPaymentMethods('seller-1')
    expect(res.error).toBeNull()
    expect(res.data).toHaveLength(1)
    expect(payMocks.from).toHaveBeenCalledWith('seller_payment_methods')
  })

  it('upserts one method with an on-conflict composite key', async () => {
    payMocks.from.mockReturnValue({
      upsert: async () => ({ data: null, error: null }),
    })
    const res = await setSellerPaymentMethod('seller-1', 'cash_on_pickup', true, '  Meet at the gate  ')
    expect(res.error).toBeNull()
    expect(payMocks.from).toHaveBeenCalledWith('seller_payment_methods')
    const upsert = payMocks.from.mock.calls[0][0]
    expect(upsert).toBe('seller_payment_methods')
  })
})

afterEach(() => {
  vi.clearAllMocks()
})

// Reference import keeps the PostgrestError type attached to this test module
// for readability of the structured-error mapping above.
export type { PostgrestError }