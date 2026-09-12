import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PostgrestError } from '@supabase/supabase-js'
import {
  approveRefund,
  closeMyDispute,
  completeRefund,
  disputeEvidenceUrl,
  escalateDispute,
  openOrderDispute,
  parseDisputeError,
  rejectRefund,
  requestRefund,
  sendDisputeMessage,
  uploadDisputeEvidence,
} from '../../src/features/disputes/disputes.service'
import { submitListingReport } from '../../src/features/reports/reports.service'
import { makePostgrestError } from '../utils/seller'

const phase11Mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  getSession: vi.fn(),
  storageFrom: vi.fn(),
}))

vi.mock('../../src/lib/supabase/client', () => ({
  supabase: {
    rpc: phase11Mocks.rpc,
    from: phase11Mocks.from,
    auth: { getSession: phase11Mocks.getSession },
    storage: { from: phase11Mocks.storageFrom },
  },
}))

beforeEach(() => {
  vi.clearAllMocks()
  phase11Mocks.rpc.mockResolvedValue({ data: { id: 'result-1' }, error: null })
})

describe('Phase 11 safe error mapping', () => {
  it('maps known structured and permission errors to safe copy', () => {
    expect(parseDisputeError(makePostgrestError('ACTIVE_DISPUTE_EXISTS: internal text', 'P0001'))).toEqual({
      code: 'ACTIVE_DISPUTE_EXISTS',
      message: 'This order already has an active dispute.',
    })
    expect(parseDisputeError(makePostgrestError('permission denied for table refunds', '42501'))?.code).toBe(
      'FORBIDDEN',
    )
  })

  it('never exposes unknown SQL or RLS details', () => {
    const error = parseDisputeError(
      makePostgrestError('new row violates row-level security policy for table refunds', 'XX000'),
    )
    expect(error).toEqual({ code: 'UNKNOWN', message: 'Something went wrong. Please try again.' })
    expect(error?.message).not.toMatch(/row-level|refunds/i)
    expect(parseDisputeError(null)).toBeNull()
  })
})

describe('Phase 11 trusted RPC request assembly', () => {
  it('submits a listing report without reporter, seller, or status fields', async () => {
    await submitListingReport({
      listingId: 'listing-1',
      reason: 'scam_or_fraud',
      description: '  Suspicious payment request.  ',
    })
    expect(phase11Mocks.rpc).toHaveBeenCalledWith('submit_listing_report', {
      p_listing_id: 'listing-1',
      p_reason: 'scam_or_fraud',
      p_description: 'Suspicious payment request.',
    })
    const params = phase11Mocks.rpc.mock.calls[0][1] as Record<string, unknown>
    expect(params).not.toHaveProperty('reporter_id')
    expect(params).not.toHaveProperty('seller_id')
    expect(params).not.toHaveProperty('status')
  })

  it('opens a dispute using only the order and issue fields', async () => {
    await openOrderDispute({
      orderId: 'order-a',
      reason: 'item_not_received',
      description: '  Package did not arrive.  ',
    })
    expect(phase11Mocks.rpc).toHaveBeenCalledWith('open_order_dispute', {
      p_order_id: 'order-a',
      p_reason: 'item_not_received',
      p_description: 'Package did not arrive.',
    })
    const params = phase11Mocks.rpc.mock.calls[0][1] as Record<string, unknown>
    expect(params).not.toHaveProperty('buyer_id')
    expect(params).not.toHaveProperty('seller_id')
    expect(params).not.toHaveProperty('opened_by')
    expect(params).not.toHaveProperty('status')
  })

  it('derives message sender and scopes controlled dispute actions by dispute id', async () => {
    await sendDisputeMessage('dispute-a', '  Please check the tracking.  ')
    await escalateDispute('dispute-a', '  Seller stopped responding.  ')
    await closeMyDispute('dispute-a')
    expect(phase11Mocks.rpc).toHaveBeenNthCalledWith(1, 'send_dispute_message', {
      p_dispute_id: 'dispute-a',
      p_message: 'Please check the tracking.',
    })
    expect(phase11Mocks.rpc).toHaveBeenNthCalledWith(2, 'escalate_dispute', {
      p_dispute_id: 'dispute-a',
      p_reason: 'Seller stopped responding.',
    })
    expect(phase11Mocks.rpc).toHaveBeenNthCalledWith(3, 'close_my_dispute', {
      p_dispute_id: 'dispute-a',
    })
    expect(phase11Mocks.rpc.mock.calls[0][1]).not.toHaveProperty('sender_id')
  })

  it('requests a full refund without identity, order, payment, or status fields', async () => {
    await requestRefund({ disputeId: 'dispute-a', requestedAmount: 4500, reason: '  Never delivered  ' })
    expect(phase11Mocks.rpc).toHaveBeenCalledWith('request_refund', {
      p_dispute_id: 'dispute-a',
      p_requested_amount: 4500,
      p_reason: 'Never delivered',
    })
    const params = phase11Mocks.rpc.mock.calls[0][1] as Record<string, unknown>
    for (const forbidden of ['buyer_id', 'seller_id', 'order_id', 'payment_id', 'status']) {
      expect(params).not.toHaveProperty(forbidden)
    }
  })

  it('uses controlled seller review and manual completion RPCs without amount mutation', async () => {
    await approveRefund('refund-a')
    await rejectRefund('refund-b', '  Evidence does not match.  ')
    await completeRefund({
      refundId: 'refund-a',
      method: 'manual_transfer',
      reference: '  REF-100  ',
      notes: '  Sent through GCash.  ',
    })
    expect(phase11Mocks.rpc).toHaveBeenNthCalledWith(1, 'review_refund', {
      p_refund_id: 'refund-a',
      p_decision: 'approve',
      p_reason: undefined,
    })
    expect(phase11Mocks.rpc).toHaveBeenNthCalledWith(2, 'review_refund', {
      p_refund_id: 'refund-b',
      p_decision: 'reject',
      p_reason: 'Evidence does not match.',
    })
    expect(phase11Mocks.rpc).toHaveBeenNthCalledWith(3, 'complete_refund', {
      p_refund_id: 'refund-a',
      p_method: 'manual_transfer',
      p_reference: 'REF-100',
      p_notes: 'Sent through GCash.',
    })
    expect(phase11Mocks.rpc.mock.calls[2][1]).not.toHaveProperty('p_amount')
  })
})

describe('Phase 11 private evidence service', () => {
  it('uploads to the actor/dispute path and registers trusted metadata', async () => {
    const upload = vi.fn().mockResolvedValue({ data: { path: 'stored' }, error: null })
    const remove = vi.fn().mockResolvedValue({ data: [], error: null })
    phase11Mocks.storageFrom.mockReturnValue({ upload, remove })
    phase11Mocks.rpc.mockResolvedValueOnce({ data: { id: 'evidence-1' }, error: null })
    vi.spyOn(crypto, 'randomUUID').mockReturnValueOnce('123e4567-e89b-12d3-a456-426614174000')
    const file = new File(['png'], '../../receipt.png', { type: 'image/png' })

    const result = await uploadDisputeEvidence('buyer-a', 'dispute-a', file)

    const expectedPath = 'buyer-a/dispute-a/123e4567-e89b-12d3-a456-426614174000.png'
    expect(result.error).toBeNull()
    expect(upload).toHaveBeenCalledWith(expectedPath, file, { contentType: 'image/png', upsert: false })
    expect(phase11Mocks.rpc).toHaveBeenCalledWith('register_dispute_evidence', {
      p_dispute_id: 'dispute-a',
      p_storage_path: expectedPath,
      p_original_filename: '.._.._receipt.png',
      p_mime_type: 'image/png',
      p_size_bytes: file.size,
    })
    expect(remove).not.toHaveBeenCalled()
  })

  it('removes an orphan when metadata registration fails', async () => {
    const upload = vi.fn().mockResolvedValue({ data: { path: 'stored' }, error: null })
    const remove = vi.fn().mockResolvedValue({ data: [], error: null })
    phase11Mocks.storageFrom.mockReturnValue({ upload, remove })
    phase11Mocks.rpc.mockResolvedValueOnce({
      data: null,
      error: makePostgrestError('FORBIDDEN: not a participant', 'P0001'),
    })

    const result = await uploadDisputeEvidence(
      'stranger',
      'dispute-a',
      new File(['png'], 'receipt.png', { type: 'image/png' }),
    )
    expect(result.error?.code).toBe('FORBIDDEN')
    expect(remove).toHaveBeenCalledOnce()
  })

  it('rejects invalid or oversized files before touching Storage', async () => {
    const invalid = await uploadDisputeEvidence(
      'buyer-a',
      'dispute-a',
      new File(['html'], 'proof.html', { type: 'text/html' }),
    )
    expect(invalid.error?.code).toBe('INVALID_EVIDENCE_TYPE')
    const oversized = { name: 'large.png', type: 'image/png', size: 5 * 1024 * 1024 + 1 } as File
    const large = await uploadDisputeEvidence('buyer-a', 'dispute-a', oversized)
    expect(large.error?.code).toBe('INVALID_EVIDENCE_SIZE')
    expect(phase11Mocks.storageFrom).not.toHaveBeenCalled()
  })

  it('never leaks Storage RLS errors and uses private signed URLs', async () => {
    phase11Mocks.storageFrom.mockReturnValueOnce({
      upload: vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'new row violates row-level security policy' },
      }),
    })
    const denied = await uploadDisputeEvidence(
      'buyer-b',
      'dispute-a',
      new File(['png'], 'proof.png', { type: 'image/png' }),
    )
    expect(denied.error?.message).not.toMatch(/row-level|policy/i)

    const createSignedUrl = vi.fn().mockResolvedValue({
      data: { signedUrl: 'https://private.example/signed' },
      error: null,
    })
    phase11Mocks.storageFrom.mockReturnValueOnce({ createSignedUrl })
    expect(await disputeEvidenceUrl('buyer-a/dispute-a/file.png')).toEqual({
      data: 'https://private.example/signed',
      error: null,
    })
    expect(createSignedUrl).toHaveBeenCalledWith('buyer-a/dispute-a/file.png', 300)
  })
})

export type { PostgrestError }
