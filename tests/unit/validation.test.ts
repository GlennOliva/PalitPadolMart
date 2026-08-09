import { describe, it, expect } from 'vitest'
import {
  EMAIL_PATTERN,
  MAX_NAME_LENGTH,
  MIN_PASSWORD_LENGTH,
  hasErrors,
  validateEmail,
  validateName,
  validateOptionalText,
  validatePassword,
  validatePasswordConfirm,
} from '../../src/features/auth/validation'

describe('validateEmail', () => {
  it('rejects empty and whitespace-only values', () => {
    expect(validateEmail('')).toBe('Email is required.')
    expect(validateEmail('   ')).toBe('Email is required.')
  })

  it('rejects malformed addresses', () => {
    expect(validateEmail('nobody')).toBe('Enter a valid email address.')
    expect(validateEmail('a@b')).toBe('Enter a valid email address.')
    expect(validateEmail('a b@example.com')).toBe('Enter a valid email address.')
  })

  it('accepts well-formed addresses', () => {
    expect(validateEmail('player@example.com')).toBeNull()
    expect(validateEmail('  player@example.com ')).toBeNull()
  })

  it('rejects overlong addresses', () => {
    const long = `${'a'.repeat(250)}@example.com`
    expect(validateEmail(long)).toBe('Email is too long.')
  })
})

describe('validatePassword', () => {
  it('requires a value', () => {
    expect(validatePassword('')).toBe('Password is required.')
  })

  it('enforces the minimum length', () => {
    expect(validatePassword('short')).toBe(
      `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
    )
  })

  it('accepts passwords at or above the minimum length', () => {
    expect(validatePassword('longenough')).toBeNull()
  })
})

describe('validatePasswordConfirm', () => {
  it('requires a confirmation value', () => {
    expect(validatePasswordConfirm('abcdefgh', '')).toBe(
      'Please confirm your password.',
    )
  })

  it('rejects mismatched values', () => {
    expect(validatePasswordConfirm('abcdefgh', 'different')).toBe(
      'Passwords do not match.',
    )
  })

  it('accepts matching values', () => {
    expect(validatePasswordConfirm('abcdefgh', 'abcdefgh')).toBeNull()
  })
})

describe('validateName', () => {
  it('requires a value', () => {
    expect(validateName('', 'First name')).toBe('First name is required.')
  })

  it('enforces the maximum length', () => {
    const long = 'x'.repeat(MAX_NAME_LENGTH + 1)
    expect(validateName(long, 'Last name')).toBe(
      `Last name must be ${MAX_NAME_LENGTH} characters or fewer.`,
    )
  })

  it('accepts valid names', () => {
    expect(validateName('  Glenn  ', 'First name')).toBeNull()
  })
})

describe('validateOptionalText', () => {
  it('allows empty values', () => {
    expect(validateOptionalText('', 'Display name')).toBeNull()
  })

  it('enforces the maximum length when provided', () => {
    expect(validateOptionalText('x'.repeat(256), 'Display name')).toBe(
      'Display name must be 255 characters or fewer.',
    )
  })
})

describe('hasErrors', () => {
  it('reports whether any field has an error', () => {
    expect(hasErrors({ email: undefined, password: 'required' })).toBe(true)
    expect(hasErrors({ email: undefined, password: undefined })).toBe(false)
    expect(hasErrors({})).toBe(false)
  })
})

describe('EMAIL_PATTERN', () => {
  it('matches only plausible email addresses', () => {
    expect(EMAIL_PATTERN.test('a@b.co')).toBe(true)
    expect(EMAIL_PATTERN.test('not-an-email')).toBe(false)
    expect(EMAIL_PATTERN.test('has space@b.co')).toBe(false)
  })
})
