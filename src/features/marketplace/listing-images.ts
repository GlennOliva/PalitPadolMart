import {
  ALLOWED_IMAGE_TYPES,
  MAX_IMAGE_BYTES,
  PRODUCT_IMAGES_BUCKET,
} from './marketplace.types'

export interface ListingImageValidation {
  ok: boolean
  error?: string
}

export function validateListingImageFile(file: File): ListingImageValidation {
  if (!ALLOWED_IMAGE_TYPES.some((type) => type === file.type)) {
    return {
      ok: false,
      error: 'Only JPEG, PNG, or WebP images are allowed.',
    }
  }
  if (file.size <= 0) {
    return { ok: false, error: 'The selected file appears to be empty.' }
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return {
      ok: false,
      error: 'Each photo must be 5 MB or smaller.',
    }
  }
  return { ok: true }
}

/**
 * Owner-scoped storage path for a listing photo. The Phase 1 storage policy
 * requires the first path segment to equal the caller's seller id, so the
 * `{sellerId}/{listingId}/{filename}` layout is safe by construction. A random
 * suffix avoids collisions when the same file is uploaded twice.
 */
export function buildListingImagePath(
  sellerId: string,
  listingId: string,
  fileName: string,
  suffix: string,
): string {
  const sanitized = fileName.replace(/[^\w.-]/g, '_')
  return `${sellerId}/${listingId}/${suffix}-${sanitized}`
}

export function listingImagesBucket(): string {
  return PRODUCT_IMAGES_BUCKET
}
