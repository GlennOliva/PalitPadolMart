import { describe, it, expect } from 'vitest'
import {
  MAX_INQUIRY_MESSAGE_LENGTH,
  MAX_INQUIRY_SUBJECT_LENGTH,
  validateInquiryForm,
  validateInquiryMessage,
} from '../../src/features/inquiries/inquiry-validation'

describe('validateInquiryForm', () => {
  it('accepts valid subject and message', () => {
    expect(validateInquiryForm({ subject: 'Is this available?', message: 'Hi, is this still for sale?' })).toEqual({})
  })

  it('trims surrounding whitespace before validating', () => {
    expect(
      validateInquiryForm({ subject: '  Is this available?  ', message: '  yes hello  ' }),
    ).toEqual({})
  })

  it('rejects a missing subject', () => {
    const errors = validateInquiryForm({ subject: '  ', message: 'hello there' })
    expect(errors.subject).toBe('Subject is required.')
  })

  it('rejects a too-short subject', () => {
    const errors = validateInquiryForm({ subject: 'ab', message: 'hello there' })
    expect(errors.subject).toBe('Subject must be at least 3 characters.')
  })

  it('rejects an over-long subject', () => {
    const subject = 'a'.repeat(MAX_INQUIRY_SUBJECT_LENGTH + 1)
    const errors = validateInquiryForm({ subject, message: 'hello there' })
    expect(errors.subject).toContain(`${MAX_INQUIRY_SUBJECT_LENGTH} characters`)
  })

  it('rejects a missing message', () => {
    const errors = validateInquiryForm({ subject: 'Question', message: '  ' })
    expect(errors.message).toBe('Message is required.')
  })

  it('rejects an over-long message', () => {
    const message = 'a'.repeat(MAX_INQUIRY_MESSAGE_LENGTH + 1)
    const errors = validateInquiryForm({ subject: 'Question', message })
    expect(errors.message).toContain(`${MAX_INQUIRY_MESSAGE_LENGTH} characters`)
  })

  it('reports both subject and message errors at once', () => {
    const errors = validateInquiryForm({ subject: '', message: '' })
    expect(errors.subject).toBeDefined()
    expect(errors.message).toBeDefined()
  })
})

describe('validateInquiryMessage', () => {
  it('accepts a non-empty trimmed message', () => {
    expect(validateInquiryMessage('  Sure, meet me at the courts  ')).toBeNull()
  })

  it('rejects an empty message', () => {
    expect(validateInquiryMessage('   ')).toBe('Message is required.')
  })

  it('rejects an over-long message', () => {
    const message = 'a'.repeat(MAX_INQUIRY_MESSAGE_LENGTH + 1)
    expect(validateInquiryMessage(message)).toContain(`${MAX_INQUIRY_MESSAGE_LENGTH} characters`)
  })
})
