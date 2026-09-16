import { describe, it, expect } from 'vitest'
import {
  formatAccountStatus,
  hasRole,
  isAccountActive,
  isAccountBlocked,
  isAccountDeactivated,
  isAccountSuspended,
  isAdmin,
  isSafeInternalPath,
  isSeller,
  resolveReturnPath,
} from '../../src/features/auth/auth-utils'
import { makeProfile } from '../utils/auth'

describe('isSafeInternalPath', () => {
  it('accepts internal absolute paths', () => {
    expect(isSafeInternalPath('/dashboard')).toBe(true)
    expect(isSafeInternalPath('/profile/2')).toBe(true)
    expect(isSafeInternalPath('/marketplace?q=paddle#results')).toBe(true)
  })

  it('rejects non-absolute and protocol-relative paths', () => {
    expect(isSafeInternalPath('dashboard')).toBe(false)
    expect(isSafeInternalPath('//evil.example')).toBe(false)
  })

  it('rejects scheme and backslash smuggling', () => {
    expect(isSafeInternalPath('/https://evil.example')).toBe(false)
    expect(isSafeInternalPath('/\\evil.example')).toBe(false)
    expect(isSafeInternalPath('/%5cevil.example')).toBe(false)
    expect(isSafeInternalPath('/%2fevil.example')).toBe(false)
    expect(isSafeInternalPath('/dashboard\n')).toBe(false)
  })
})

describe('resolveReturnPath', () => {
  it('returns the default path for missing or unsafe values', () => {
    expect(resolveReturnPath(undefined)).toBe('/dashboard')
    expect(resolveReturnPath(null)).toBe('/dashboard')
    expect(resolveReturnPath('')).toBe('/dashboard')
    expect(resolveReturnPath('https://evil.example')).toBe('/dashboard')
    expect(resolveReturnPath(42)).toBe('/dashboard')
  })

  it('accepts a safe string path', () => {
    expect(resolveReturnPath('/preferences')).toBe('/preferences')
  })

  it('accepts a safe pathname object like router state.from', () => {
    expect(resolveReturnPath({ pathname: '/profile' })).toBe('/profile')
    expect(resolveReturnPath({ pathname: '/marketplace', search: '?q=paddle', hash: '#results' }))
      .toBe('/marketplace?q=paddle#results')
  })

  it('rejects an unsafe pathname object', () => {
    expect(resolveReturnPath({ pathname: '//evil.example' })).toBe('/dashboard')
  })

  it('rejects auth entry loops', () => {
    expect(resolveReturnPath('/login')).toBe('/dashboard')
    expect(resolveReturnPath('/auth/callback?next=/profile')).toBe('/dashboard')
    expect(resolveReturnPath('/register#form')).toBe('/dashboard')
  })
})

describe('role helpers', () => {
  it('distinguishes roles', () => {
    const customer = makeProfile({}, 'customer')
    const seller = makeProfile({}, 'seller')
    const admin = makeProfile({}, 'admin')
    expect(hasRole(customer, 'customer')).toBe(true)
    expect(isSeller(seller)).toBe(true)
    expect(isSeller(customer)).toBe(false)
    expect(isAdmin(admin)).toBe(true)
    expect(isAdmin(seller)).toBe(false)
    expect(hasRole(null, 'customer')).toBe(false)
  })
})

describe('account status helpers', () => {
  it('detects active, suspended, and deactivated accounts', () => {
    const active = makeProfile({ account_status: 'active' })
    const suspended = makeProfile({ account_status: 'suspended' })
    const deactivated = makeProfile({ account_status: 'deactivated' })
    expect(isAccountActive(active)).toBe(true)
    expect(isAccountSuspended(suspended)).toBe(true)
    expect(isAccountDeactivated(deactivated)).toBe(true)
    expect(isAccountBlocked(suspended)).toBe(true)
    expect(isAccountBlocked(deactivated)).toBe(true)
    expect(isAccountBlocked(active)).toBe(false)
    expect(isAccountActive(null)).toBe(false)
  })

  it('formats status labels', () => {
    expect(formatAccountStatus('active')).toBe('Active')
    expect(formatAccountStatus('suspended')).toBe('Suspended')
    expect(formatAccountStatus('deactivated')).toBe('Deactivated')
  })
})
