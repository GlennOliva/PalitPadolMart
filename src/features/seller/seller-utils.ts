import type { SellerProfile, SellerStatus } from './seller.types'

export function isSellerActive(profile: SellerProfile | null | undefined): boolean {
  return profile != null && profile.seller_status === 'active'
}

export function isSellerPending(profile: SellerProfile | null | undefined): boolean {
  return profile != null && profile.seller_status === 'pending'
}

export function isSellerRejected(profile: SellerProfile | null | undefined): boolean {
  return profile != null && profile.seller_status === 'rejected'
}

export function isSellerSuspended(profile: SellerProfile | null | undefined): boolean {
  return profile != null && profile.seller_status === 'suspended'
}

/**
 * Active sellers may use the seller tool routes (dashboard, profile editing).
 * Pending/rejected/suspended sellers are directed to the status page instead;
 * the database remains the source of truth regardless of this UI helper.
 */
export function canAccessSellerTools(profile: SellerProfile | null | undefined): boolean {
  return isSellerActive(profile)
}

export function formatSellerStatus(status: SellerStatus): string {
  const labels: Record<SellerStatus, string> = {
    pending: 'Pending',
    active: 'Active',
    suspended: 'Suspended',
    rejected: 'Rejected',
  }
  return labels[status]
}

export function sellerNavLabel(profile: SellerProfile | null | undefined): string {
  if (profile == null) return 'Become a Seller'
  if (profile.seller_status === 'active') return 'Seller Dashboard'
  if (profile.seller_status === 'pending') return 'Seller Application'
  return 'Seller Status'
}

export function sellerNavPath(profile: SellerProfile | null | undefined): string {
  if (profile == null) return '/seller/onboarding'
  if (profile.seller_status === 'active') return '/seller/dashboard'
  return '/seller/status'
}
