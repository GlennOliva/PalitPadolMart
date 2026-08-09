export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
export const MIN_PASSWORD_LENGTH = 8
export const MAX_NAME_LENGTH = 120
export const MAX_EMAIL_LENGTH = 254
export const MAX_TEXT_LENGTH = 255

export type FieldErrors<T extends string> = Partial<Record<T, string>>

export function validateEmail(value: string): string | null {
  const trimmed = value.trim()
  if (trimmed.length === 0) return 'Email is required.'
  if (trimmed.length > MAX_EMAIL_LENGTH) return 'Email is too long.'
  if (!EMAIL_PATTERN.test(trimmed)) return 'Enter a valid email address.'
  return null
}

export function validatePassword(value: string): string | null {
  if (value.length === 0) return 'Password is required.'
  if (value.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`
  }
  return null
}

export function validatePasswordConfirm(password: string, confirm: string): string | null {
  if (confirm.length === 0) return 'Please confirm your password.'
  if (password !== confirm) return 'Passwords do not match.'
  return null
}

export function validateName(value: string, label: string): string | null {
  const trimmed = value.trim()
  if (trimmed.length === 0) return `${label} is required.`
  if (trimmed.length > MAX_NAME_LENGTH) return `${label} must be ${MAX_NAME_LENGTH} characters or fewer.`
  return null
}

export function validateOptionalText(value: string, label: string): string | null {
  const trimmed = value.trim()
  if (trimmed.length > MAX_TEXT_LENGTH) return `${label} must be ${MAX_TEXT_LENGTH} characters or fewer.`
  return null
}

export function hasErrors<T extends string>(errors: FieldErrors<T>): boolean {
  return Object.values(errors).some((value) => value != null)
}
