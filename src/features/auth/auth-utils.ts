import type { AccountStatus, Profile, UserRole } from './auth.types'

/**
 * Returns true only for internal application paths (e.g. `/dashboard`).
 * Rejects absolute URLs, protocol-relative URLs, and any path containing a
 * scheme separator, which prevents open-redirect via a crafted `from` value.
 */
export function isSafeInternalPath(path: string): boolean {
  if (!path.startsWith('/')) return false
  if (path.startsWith('//')) return false
  const candidate = path.slice(1)
  if (candidate.includes('://')) return false
  if (candidate.includes('\\')) return false
  return true
}

const DEFAULT_AUTHENTICATED_PATH = '/dashboard'

/**
 * Resolves a return destination supplied by a router `location.state.from`
 * value into a safe internal path. Falls back to the default authenticated
 * path when the value is missing or unsafe.
 */
export function resolveReturnPath(from: unknown): string {
  if (typeof from === 'string' && from.length > 0 && isSafeInternalPath(from)) {
    return from
  }
  if (
    from != null &&
    typeof from === 'object' &&
    'pathname' in from &&
    typeof from.pathname === 'string'
  ) {
    const pathname = from.pathname
    if (pathname.length > 0 && isSafeInternalPath(pathname)) return pathname
  }
  return DEFAULT_AUTHENTICATED_PATH
}

export function hasRole(profile: Profile | null | undefined, role: UserRole): boolean {
  return profile != null && profile.role === role
}

export function isAdmin(profile: Profile | null | undefined): boolean {
  return hasRole(profile, 'admin')
}

export function isSeller(profile: Profile | null | undefined): boolean {
  return hasRole(profile, 'seller')
}

export function isAccountActive(profile: Profile | null | undefined): boolean {
  return profile != null && profile.account_status === 'active'
}

export function isAccountSuspended(profile: Profile | null | undefined): boolean {
  return profile != null && profile.account_status === 'suspended'
}

export function isAccountDeactivated(profile: Profile | null | undefined): boolean {
  return profile != null && profile.account_status === 'deactivated'
}

export function isAccountBlocked(profile: Profile | null | undefined): boolean {
  return profile != null && profile.account_status !== 'active'
}

export function formatAccountStatus(status: AccountStatus): string {
  const labels: Record<AccountStatus, string> = {
    active: 'Active',
    suspended: 'Suspended',
    deactivated: 'Deactivated',
  }
  return labels[status]
}
