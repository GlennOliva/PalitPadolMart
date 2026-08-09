export interface FriendlyAuthError {
  message: string
  code?: string
}

const AUTH_ERROR_MESSAGES: Record<string, string> = {
  invalid_credentials: 'Invalid email or password.',
  'Invalid login credentials': 'Invalid email or password.',
  email_not_confirmed:
    'Please confirm your email address before signing in. Check your inbox for a confirmation link.',
  user_already_exists:
    'An account with this email already exists. Try signing in instead.',
  'User already registered': 'An account with this email already exists. Try signing in instead.',
  weak_password:
    'Password is too weak. Use at least 8 characters with a mix of letters and numbers.',
  'Password should be at least 6 characters.':
    'Password must be at least 8 characters long.',
  same_password:
    'New password must be different from the current password.',
  'New password should be different from the old password.':
    'New password must be different from the current password.',
  otp_expired:
    'This password reset link is invalid or has expired. Please request a new one.',
  'Email not confirmed':
    'Please confirm your email address before signing in. Check your inbox for a confirmation link.',
  'Email link is invalid or has expired':
    'This password reset link is invalid or has expired. Please request a new one.',
  over_email_send_rate_limit:
    'Too many requests. Please wait a moment before trying again.',
  over_request_rate_limit:
    'Too many requests. Please wait a moment before trying again.',
}

const FALLBACK_AUTH_ERROR =
  'Something went wrong with your request. Check your connection and try again.'

export function mapAuthError(error: unknown): FriendlyAuthError {
  if (error == null) return { message: FALLBACK_AUTH_ERROR }

  const err = error as {
    code?: string
    message?: string
    status?: number
    name?: string
  }

  if (err.message != null) {
    const direct = AUTH_ERROR_MESSAGES[err.message]
    if (direct != null) return { message: direct, code: err.code }
  }

  if (err.code != null) {
    const byCode = AUTH_ERROR_MESSAGES[err.code]
    if (byCode != null) return { message: byCode, code: err.code }
  }

  return { message: FALLBACK_AUTH_ERROR, code: err.code }
}

export function describeSupabaseError(error: unknown): string {
  const err = error as { message?: string }
  return err?.message ?? 'Unknown error'
}
