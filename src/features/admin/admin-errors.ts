import type { PostgrestError } from '@supabase/supabase-js'
import type { AdminError, AdminErrorCode } from './admin.types'

const ADMIN_ERROR_MESSAGES: Record<AdminErrorCode, string> = {
  AUTH_REQUIRED: 'Please sign in to continue.',
  FORBIDDEN: 'You do not have permission to perform this administrative action.',
  ACCOUNT_UNAVAILABLE: 'The account must be active before this action can be completed.',
  INVALID_REASON: 'Reason must contain 5 to 1000 characters.',
  USER_NOT_FOUND: 'This user could not be found.',
  INVALID_ROLE_TRANSITION: 'That user role change is not allowed.',
  SELF_ADMIN_CHANGE_FORBIDDEN: 'You cannot change your own administrator access.',
  LAST_ACTIVE_ADMIN: 'At least one active administrator must remain.',
  INVALID_ACCOUNT_TRANSITION: 'That account status change is not allowed.',
  SELLER_NOT_FOUND: 'This seller could not be found.',
  INVALID_SELLER_TRANSITION: 'That seller status change is not allowed.',
  INVALID_CATEGORY: 'Check the category name, slug, description, and sort order.',
  CATEGORY_SLUG_EXISTS: 'A category with this slug already exists.',
  CATEGORY_NOT_FOUND: 'This category could not be found.',
  INVALID_CATEGORY_TRANSITION: 'That category status change is not allowed.',
  CATEGORY_IN_USE: 'Remove or reassign active listings before deactivating this category.',
  INVALID_BRAND: 'Check the brand name, slug, logo URL, and description.',
  BRAND_SLUG_EXISTS: 'A brand with this slug already exists.',
  BRAND_NOT_FOUND: 'This brand could not be found.',
  INVALID_BRAND_TRANSITION: 'That brand status change is not allowed.',
  BRAND_IN_USE: 'Remove or reassign active listings before deactivating this brand.',
  NO_CHANGES: 'Make at least one change before saving.',
  INVALID_LISTING_ACTION: 'Choose a valid listing moderation action.',
  LISTING_NOT_FOUND: 'This listing could not be found.',
  INVALID_LISTING_TRANSITION: 'This listing cannot be moderated from its current status.',
  REPORT_NOT_FOUND: 'This report could not be found.',
  INVALID_REPORT_TRANSITION: 'That report status change is not allowed.',
  RESOLUTION_REQUIRED: 'Enter a resolution before closing this report.',
  INVALID_RESOLUTION: 'Enter a valid resolution of 2000 characters or fewer.',
  INVALID_REVIEW_ACTION: 'Choose a valid review moderation action.',
  REVIEW_NOT_FOUND: 'This review could not be found.',
  INVALID_REVIEW_TRANSITION: 'This review cannot be moderated from its current status.',
  DISPUTE_NOT_FOUND: 'This dispute could not be found.',
  DISPUTE_NOT_CLAIMABLE: 'This dispute is terminal or is already assigned to an active administrator.',
  DISPUTE_NOT_RESOLVABLE: 'Only a claimed dispute under review can be resolved.',
  DISPUTE_NOT_ASSIGNED: 'Claim this dispute before resolving it.',
  REFUND_NOT_FOUND: 'This refund could not be found.',
  REFUND_STILL_ACTIVE: 'Resolve the active refund before resolving this dispute.',
  INVALID_DATE_RANGE: 'Choose a valid date range.',
  INVALID_BUCKET: 'Choose the daily, weekly, or monthly view.',
  INVALID_PAGINATION: 'The requested page is not available.',
  INVALID_SORT: 'Choose a supported sort option.',
  INVALID_SEARCH: 'Search must be 120 characters or fewer.',
  INVALID_RATING: 'Rating must be between 1 and 5.',
  INVALID_FILTER: 'Choose a supported filter.',
  UNKNOWN: 'Something went wrong. Please try again.',
}

function isAdminErrorCode(value: string): value is AdminErrorCode {
  return Object.hasOwn(ADMIN_ERROR_MESSAGES, value)
}

export function adminErrorMessage(code: AdminErrorCode | string): string {
  return isAdminErrorCode(code) ? ADMIN_ERROR_MESSAGES[code] : ADMIN_ERROR_MESSAGES.UNKNOWN
}

/** Maps only allowlisted structured codes. Database, SQL, and RLS details are discarded. */
export function mapAdminError(error: Pick<PostgrestError, 'code' | 'message'> | null): AdminError | null {
  if (error == null) return null
  const code = error.message.trim().match(/^([A-Z][A-Z0-9_]+):/)?.[1]
  if (code != null && isAdminErrorCode(code)) {
    return { code, message: adminErrorMessage(code) }
  }
  if (error.code === '42501') {
    return { code: 'FORBIDDEN', message: adminErrorMessage('FORBIDDEN') }
  }
  return { code: 'UNKNOWN', message: adminErrorMessage('UNKNOWN') }
}

export function unknownAdminError(): AdminError {
  return { code: 'UNKNOWN', message: adminErrorMessage('UNKNOWN') }
}
