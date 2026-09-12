import { describe, expect, it, vi } from 'vitest'
import {
  createDisputeEvidenceFilename,
  evidenceExtensionForMimeType,
  validateDisputeEvidence,
  validateDisputeMessage,
  validateOpenDisputeInput,
  validateRefundCompletion,
  validateRefundRejection,
  validateRefundRequest,
} from '../../src/features/disputes/disputes-validation'
import {
  DISPUTABLE_ORDER_STATUSES,
  DISPUTE_REASONS,
  isOrderDisputable,
} from '../../src/features/disputes/disputes.types'
import {
  LISTING_REPORT_REASONS,
  validateListingReportInput,
} from '../../src/features/reports/reports.types'
import type { OrderStatus } from '../../src/features/disputes/disputes.types'

describe('Phase 11 listing report validation', () => {
  it('accepts every server-supported reason', () => {
    for (const reason of LISTING_REPORT_REASONS) {
      expect(validateListingReportInput({ reason, description: '' })).toEqual({})
    }
  })

  it('rejects an unknown reason and an overlong description', () => {
    const errors = validateListingReportInput({
      reason: 'forged_reason',
      description: 'x'.repeat(2001),
    })
    expect(errors.reason).toMatch(/choose/i)
    expect(errors.description).toMatch(/2000/)
  })
})

describe('Phase 11 dispute eligibility', () => {
  const expected: Record<OrderStatus, boolean> = {
    pending: false,
    confirmed: true,
    paid: true,
    preparing: true,
    shipped: true,
    ready_for_pickup: true,
    completed: true,
    cancelled: false,
    disputed: false,
  }

  it('documents every actual order status as eligible or ineligible', () => {
    for (const [status, eligible] of Object.entries(expected) as [OrderStatus, boolean][]) {
      expect(isOrderDisputable(status), status).toBe(eligible)
    }
    expect(DISPUTABLE_ORDER_STATUSES).toEqual([
      'confirmed',
      'paid',
      'preparing',
      'shipped',
      'ready_for_pickup',
      'completed',
    ])
  })

  it('accepts each dispute reason with a meaningful description', () => {
    for (const reason of DISPUTE_REASONS) {
      expect(validateOpenDisputeInput({ reason, description: 'The order has a problem.' })).toEqual({})
    }
  })

  it('requires a valid reason and nonblank bounded description', () => {
    expect(validateOpenDisputeInput({ reason: 'forged', description: '   ' })).toEqual({
      reason: 'Choose a dispute reason.',
      description: 'Description is required.',
    })
    expect(
      validateOpenDisputeInput({ reason: 'other', description: 'x'.repeat(2001) }).description,
    ).toMatch(/2000/)
  })
})

describe('Phase 11 message and refund validation', () => {
  it('rejects empty, whitespace-only, and oversized messages', () => {
    expect(validateDisputeMessage('').message).toMatch(/required/i)
    expect(validateDisputeMessage('   ').message).toMatch(/required/i)
    expect(validateDisputeMessage('x'.repeat(5001)).message).toMatch(/5000/)
    expect(validateDisputeMessage('A concise reply.')).toEqual({})
  })

  it('requires bounded refund and rejection reasons', () => {
    expect(validateRefundRequest({ reason: ' ' }).reason).toMatch(/required/i)
    expect(validateRefundRequest({ reason: 'x'.repeat(2001) }).reason).toMatch(/2000/)
    expect(validateRefundRejection('').reason).toMatch(/required/i)
    expect(validateRefundRejection('Not eligible')).toEqual({})
  })

  it('bounds manual refund references and notes', () => {
    expect(validateRefundCompletion({ reference: 'r'.repeat(121), notes: 'n'.repeat(2001) })).toEqual({
      reference: 'Reference must be 120 characters or fewer.',
      notes: 'Notes must be 2000 characters or fewer.',
    })
  })
})

describe('Phase 11 private evidence validation', () => {
  it('accepts only the configured image and PDF MIME types', () => {
    for (const [mime, extension] of [
      ['image/jpeg', 'jpg'],
      ['image/png', 'png'],
      ['image/webp', 'webp'],
      ['application/pdf', 'pdf'],
    ] as const) {
      expect(evidenceExtensionForMimeType(mime)).toBe(extension)
      expect(validateDisputeEvidence(new File(['x'], `evidence.${extension}`, { type: mime }))).toEqual({})
    }
    expect(validateDisputeEvidence(new File(['x'], 'script.html', { type: 'text/html' })).file).toMatch(
      /JPG, JPEG, PNG, WebP, or PDF/,
    )
  })

  it('rejects missing, empty, and oversized files', () => {
    expect(validateDisputeEvidence(null).file).toMatch(/choose/i)
    expect(validateDisputeEvidence(new File([], 'empty.png', { type: 'image/png' })).file).toMatch(/empty/i)
    const oversized = { name: 'large.png', type: 'image/png', size: 5 * 1024 * 1024 + 1 } as File
    expect(validateDisputeEvidence(oversized).file).toMatch(/5 MB/)
  })

  it('generates a UUID filename rather than trusting the source filename', () => {
    vi.spyOn(crypto, 'randomUUID').mockReturnValueOnce('123e4567-e89b-12d3-a456-426614174000')
    expect(createDisputeEvidenceFilename('image/png')).toBe(
      '123e4567-e89b-12d3-a456-426614174000.png',
    )
    expect(createDisputeEvidenceFilename('text/plain')).toBeNull()
  })
})
