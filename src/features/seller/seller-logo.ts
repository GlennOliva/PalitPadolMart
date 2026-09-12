import {
  ALLOWED_LOGO_TYPES,
  MAX_LOGO_BYTES,
  SELLER_LOGO_BUCKET,
} from './seller.types'

export interface SellerLogoValidation {
  ok: boolean
  error?: string
}

export function validateSellerLogoFile(file: File): SellerLogoValidation {
  if (!ALLOWED_LOGO_TYPES.some((type) => type === file.type)) {
    return {
      ok: false,
      error: 'Only JPEG, PNG, or WebP images are allowed.',
    }
  }
  if (file.size <= 0) {
    return { ok: false, error: 'The selected file appears to be empty.' }
  }
  if (file.size > MAX_LOGO_BYTES) {
    return {
      ok: false,
      error: 'Logo must be 5 MB or smaller.',
    }
  }
  return { ok: true }
}

/**
 * Owner-scoped storage path under the `marketplace-products` bucket. The
 * Phase 1 storage policy only permits writes whose first path segment equals
 * the caller's seller id, so this path can never collide with another seller.
 */
export function buildSellerLogoPath(sellerId: string, fileName: string): string {
  const sanitized = fileName.replace(/[^\w.-]/g, '_')
  return `${sellerId}/logo/${sanitized}`
}

export function sellerLogoBucket(): string {
  return SELLER_LOGO_BUCKET
}
