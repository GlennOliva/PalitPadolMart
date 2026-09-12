import type { Database, Tables } from '../../types/database'

export const LISTING_REPORT_REASONS = [
  'misleading_information',
  'counterfeit_or_suspicious',
  'prohibited_item',
  'scam_or_fraud',
  'abusive_content',
  'duplicate_listing',
  'wrong_category',
  'other',
] as const

export type ListingReportReason = (typeof LISTING_REPORT_REASONS)[number]
export type ReportStatus = Database['public']['Enums']['report_status']
export type ListingReport = Tables<'listing_reports'>

export const LISTING_REPORT_REASON_LABELS: Record<ListingReportReason, string> = {
  misleading_information: 'Misleading information',
  counterfeit_or_suspicious: 'Counterfeit or suspicious',
  prohibited_item: 'Prohibited item',
  scam_or_fraud: 'Scam or fraud',
  abusive_content: 'Abusive content',
  duplicate_listing: 'Duplicate listing',
  wrong_category: 'Wrong category',
  other: 'Other',
}

export const MAX_REPORT_DESCRIPTION_LENGTH = 2000

export interface SubmitListingReportInput {
  listingId: string
  reason: ListingReportReason
  description?: string | null
}

export interface ListingReportFieldErrors {
  reason?: string
  description?: string
}

export function isListingReportReason(value: string): value is ListingReportReason {
  return (LISTING_REPORT_REASONS as readonly string[]).includes(value)
}

/** Client pre-check; submit_listing_report remains authoritative. */
export function validateListingReportInput(input: {
  reason: string
  description: string
}): ListingReportFieldErrors {
  const errors: ListingReportFieldErrors = {}
  if (!isListingReportReason(input.reason)) errors.reason = 'Choose a report reason.'
  if (input.description.trim().length > MAX_REPORT_DESCRIPTION_LENGTH) {
    errors.description = `Description must be ${MAX_REPORT_DESCRIPTION_LENGTH} characters or fewer.`
  }
  return errors
}

export function hasListingReportErrors(errors: ListingReportFieldErrors): boolean {
  return errors.reason != null || errors.description != null
}
