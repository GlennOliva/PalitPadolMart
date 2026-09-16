import type { AccountStatus, Profile, UserRole } from './auth.types'

/**
 * Returns true only for internal application paths (e.g. `/dashboard`).
 * Rejects absolute URLs, protocol-relative URLs, and any path containing a
 * scheme separator, which prevents open-redirect via a crafted `from` value.
 */
export function isSafeInternalPath(path: string): boolean {
  if (path.length === 0 || path.length > 2048) return false
  if (path !== path.trim()) return false
  if (!path.startsWith('/')) return false
  if (path.startsWith('//')) return false
  if (/[%](?:2f|5c)/i.test(path)) return false
  if (Array.from(path).some((character) => {
    const code = character.charCodeAt(0)
    return code < 32 || code === 127
  })) return false
  const candidate = path.slice(1)
  if (candidate.includes('://')) return false
  if (candidate.includes('\\')) return false
  return true
}

const DEFAULT_AUTHENTICATED_PATH = '/dashboard'
const AUTH_ENTRY_PATHS = new Set([
  '/auth/callback',
  '/forgot-password',
  '/login',
  '/register',
  '/reset-password',
])

function normalizeReturnPath(path: string): string | null {
  if (!isSafeInternalPath(path)) return null
  const pathname = path.split(/[?#]/, 1)[0].replace(/\/+$/, '') || '/'
  if (AUTH_ENTRY_PATHS.has(pathname)) return null
  return path
}

/**
 * Resolves a return destination supplied by a router `location.state.from`
 * value into a safe internal path. Falls back to the default authenticated
 * path when the value is missing or unsafe.
 */
export function resolveReturnPath(from: unknown): string {
  if (typeof from === 'string') {
    return normalizeReturnPath(from) ?? DEFAULT_AUTHENTICATED_PATH
  }
  if (
    from != null &&
    typeof from === 'object' &&
    'pathname' in from &&
    typeof from.pathname === 'string'
  ) {
    const search = 'search' in from && typeof from.search === 'string' ? from.search : ''
    const hash = 'hash' in from && typeof from.hash === 'string' ? from.hash : ''
    return normalizeReturnPath(`${from.pathname}${search}${hash}`) ?? DEFAULT_AUTHENTICATED_PATH
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
