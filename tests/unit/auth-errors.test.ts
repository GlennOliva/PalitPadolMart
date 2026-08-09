import { describe, it, expect } from 'vitest'
import {
  describeSupabaseError,
  mapAuthError,
} from '../../src/features/auth/auth-errors'

describe('mapAuthError', () => {
  it('returns the fallback message for null input', () => {
    expect(mapAuthError(null).message).toContain('Something went wrong')
  })

  it('maps known error codes', () => {
    expect(mapAuthError({ code: 'invalid_credentials', message: 'x' }).message).toBe(
      'Invalid email or password.',
    )
    expect(mapAuthError({ code: 'email_not_confirmed', message: 'x' }).message).toBe(
      'Please confirm your email address before signing in. Check your inbox for a confirmation link.',
    )
    expect(mapAuthError({ code: 'user_already_exists', message: 'x' }).message).toContain(
      'already exists',
    )
    expect(mapAuthError({ code: 'same_password', message: 'x' }).message).toBe(
      'New password must be different from the current password.',
    )
  })

  it('maps known server messages even without a code', () => {
    expect(mapAuthError({ message: 'Invalid login credentials' }).message).toBe(
      'Invalid email or password.',
    )
    expect(mapAuthError({ message: 'User already registered' }).message).toContain(
      'already exists',
    )
  })

  it('maps rate-limit messages', () => {
    expect(mapAuthError({ code: 'over_request_rate_limit' }).message).toContain(
      'Too many requests',
    )
    expect(mapAuthError({ message: 'over_email_send_rate_limit' }).message).toContain(
      'Too many requests',
    )
  })

  it('preserves the code on the friendly error when known', () => {
    const friendly = mapAuthError({ code: 'weak_password', message: 'x' })
    expect(friendly.code).toBe('weak_password')
  })

  it('falls back for unknown errors', () => {
    const friendly = mapAuthError({ code: 'some_unknown_code', message: 'raw message' })
    expect(friendly.message).toContain('Something went wrong')
    expect(friendly.code).toBe('some_unknown_code')
  })

  it('falls back for non-object values', () => {
    expect(mapAuthError('just a string').message).toContain('Something went wrong')
  })
})

describe('describeSupabaseError', () => {
  it('extracts a message from a supabase-shaped error', () => {
    expect(describeSupabaseError({ message: 'boom' })).toBe('boom')
  })

  it('returns a generic message for empty input', () => {
    expect(describeSupabaseError(null)).toBe('Unknown error')
  })
})
