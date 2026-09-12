import type {
  CompleteRefundInput,
  DisputeReason,
  OpenOrderDisputeInput,
  RequestRefundInput,
} from './disputes.types'
import { isDisputeReason } from './disputes.types'

export const MAX_DISPUTE_DESCRIPTION_LENGTH = 2000
export const MAX_DISPUTE_MESSAGE_LENGTH = 5000
export const MAX_REFUND_REASON_LENGTH = 2000
export const MAX_REFUND_REJECTION_REASON_LENGTH = 2000
export const MAX_REFUND_REFERENCE_LENGTH = 120
export const MAX_REFUND_NOTES_LENGTH = 2000
export const MAX_DISPUTE_EVIDENCE_BYTES = 5 * 1024 * 1024

export const DISPUTE_EVIDENCE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
] as const

export type DisputeEvidenceMimeType = (typeof DISPUTE_EVIDENCE_MIME_TYPES)[number]
export type DisputeEvidenceExtension = 'jpg' | 'png' | 'webp' | 'pdf'

const EVIDENCE_EXTENSIONS: Record<DisputeEvidenceMimeType, DisputeEvidenceExtension> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
}

export interface OpenDisputeFieldErrors {
  reason?: string
  description?: string
}

export interface DisputeMessageFieldErrors {
  message?: string
}

export interface RefundRequestFieldErrors {
  reason?: string
}

export interface RefundRejectionFieldErrors {
  reason?: string
}

export interface RefundCompletionFieldErrors {
  reference?: string
  notes?: string
}

export interface DisputeEvidenceFieldErrors {
  file?: string
}

export function validateOpenDisputeInput(input: {
  reason: DisputeReason | string
  description: string
}): OpenDisputeFieldErrors {
  const errors: OpenDisputeFieldErrors = {}
  if (!isDisputeReason(input.reason)) errors.reason = 'Choose a dispute reason.'
  const description = input.description.trim()
  if (description.length === 0) errors.description = 'Description is required.'
  else if (description.length > MAX_DISPUTE_DESCRIPTION_LENGTH) {
    errors.description = `Description must be ${MAX_DISPUTE_DESCRIPTION_LENGTH} characters or fewer.`
  }
  return errors
}

export function validateDisputeMessage(message: string): DisputeMessageFieldErrors {
  const errors: DisputeMessageFieldErrors = {}
  const trimmed = message.trim()
  if (trimmed.length === 0) errors.message = 'Message is required.'
  else if (trimmed.length > MAX_DISPUTE_MESSAGE_LENGTH) {
    errors.message = `Message must be ${MAX_DISPUTE_MESSAGE_LENGTH} characters or fewer.`
  }
  return errors
}

export function validateRefundRequest(
  input: Pick<RequestRefundInput, 'reason'>,
): RefundRequestFieldErrors {
  const errors: RefundRequestFieldErrors = {}
  const reason = input.reason.trim()
  if (reason.length === 0) errors.reason = 'Refund reason is required.'
  else if (reason.length > MAX_REFUND_REASON_LENGTH) {
    errors.reason = `Refund reason must be ${MAX_REFUND_REASON_LENGTH} characters or fewer.`
  }
  return errors
}

export function validateRefundRejection(reason: string): RefundRejectionFieldErrors {
  const errors: RefundRejectionFieldErrors = {}
  const trimmed = reason.trim()
  if (trimmed.length === 0) errors.reason = 'Rejection reason is required.'
  else if (trimmed.length > MAX_REFUND_REJECTION_REASON_LENGTH) {
    errors.reason = `Rejection reason must be ${MAX_REFUND_REJECTION_REASON_LENGTH} characters or fewer.`
  }
  return errors
}

export function validateRefundCompletion(
  input: Pick<CompleteRefundInput, 'reference' | 'notes'>,
): RefundCompletionFieldErrors {
  const errors: RefundCompletionFieldErrors = {}
  if ((input.reference?.trim().length ?? 0) > MAX_REFUND_REFERENCE_LENGTH) {
    errors.reference = `Reference must be ${MAX_REFUND_REFERENCE_LENGTH} characters or fewer.`
  }
  if ((input.notes?.trim().length ?? 0) > MAX_REFUND_NOTES_LENGTH) {
    errors.notes = `Notes must be ${MAX_REFUND_NOTES_LENGTH} characters or fewer.`
  }
  return errors
}

export function isDisputeEvidenceMimeType(value: string): value is DisputeEvidenceMimeType {
  return (DISPUTE_EVIDENCE_MIME_TYPES as readonly string[]).includes(value)
}

export function evidenceExtensionForMimeType(mimeType: string): DisputeEvidenceExtension | null {
  return isDisputeEvidenceMimeType(mimeType) ? EVIDENCE_EXTENSIONS[mimeType] : null
}

export function createDisputeEvidenceFilename(mimeType: string): string | null {
  const extension = evidenceExtensionForMimeType(mimeType)
  return extension == null ? null : `${crypto.randomUUID()}.${extension}`
}

export function validateDisputeEvidence(file: File | null): DisputeEvidenceFieldErrors {
  const errors: DisputeEvidenceFieldErrors = {}
  if (file == null) {
    errors.file = 'Choose an evidence file.'
  } else if (!isDisputeEvidenceMimeType(file.type)) {
    errors.file = 'Evidence must be a JPG, JPEG, PNG, WebP, or PDF.'
  } else if (file.size <= 0) {
    errors.file = 'Evidence file cannot be empty.'
  } else if (file.size > MAX_DISPUTE_EVIDENCE_BYTES) {
    errors.file = 'Evidence must be 5 MB or smaller.'
  }
  return errors
}

export function hasDisputeFieldErrors(errors: Record<string, string | undefined>): boolean {
  return Object.values(errors).some((value) => value != null)
}

export type { OpenOrderDisputeInput }
