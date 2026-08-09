import {
  ALLOWED_AVATAR_TYPES,
  AVATAR_BUCKET,
  MAX_AVATAR_BYTES,
} from './auth.types'

export interface AvatarValidation {
  ok: boolean
  error?: string
}

export function validateAvatarFile(file: File): AvatarValidation {
  if (!ALLOWED_AVATAR_TYPES.some((type) => type === file.type)) {
    return {
      ok: false,
      error: 'Only JPEG, PNG, or WebP images are allowed.',
    }
  }
  if (file.size <= 0) {
    return { ok: false, error: 'The selected file appears to be empty.' }
  }
  if (file.size > MAX_AVATAR_BYTES) {
    return {
      ok: false,
      error: 'Image must be 5 MB or smaller.',
    }
  }
  return { ok: true }
}

/**
 * Owner-scoped, stable storage path under the `avatars` bucket. The Phase 1
 * storage policy only permits writes whose first path segment equals the
 * caller's user id, so this path can never collide with another user.
 */
export function buildAvatarPath(userId: string, fileName: string): string {
  const sanitized = fileName.replace(/[^\w.-]/g, '_')
  return `${userId}/${sanitized}`
}

export function avatarBucket(): string {
  return AVATAR_BUCKET
}
