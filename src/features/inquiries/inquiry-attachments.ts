export const MAX_INQUIRY_IMAGE_COUNT = 4
export const MAX_INQUIRY_IMAGE_BYTES = 5 * 1024 * 1024

export const INQUIRY_IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
] as const

export type InquiryImageMimeType = (typeof INQUIRY_IMAGE_MIME_TYPES)[number]
export type InquiryImageExtension = 'jpg' | 'png' | 'webp'

export const INQUIRY_IMAGE_EXTENSIONS: Record<InquiryImageMimeType, InquiryImageExtension> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

export function isInquiryImageMimeType(value: string): value is InquiryImageMimeType {
  return (INQUIRY_IMAGE_MIME_TYPES as readonly string[]).includes(value)
}

export function inquiryImageExtensionForMimeType(
  mimeType: string,
): InquiryImageExtension | null {
  return isInquiryImageMimeType(mimeType) ? INQUIRY_IMAGE_EXTENSIONS[mimeType] : null
}

/** UUID-derived filename so collisions and unsafe names are impossible. */
export function createInquiryImageFilename(mimeType: string): string | null {
  const extension = inquiryImageExtensionForMimeType(mimeType)
  return extension == null ? null : `${crypto.randomUUID()}.${extension}`
}

/**
 * Validates a set of selected image files against the inquiry-attachment
 * policy. Returns the accepted files plus a single, friendly, first-error
 * message. Client validation is only for UX — the server (storage RLS + the
 * send_inquiry_reply RPC) enforces the same rules authoritatively.
 */
export function validateInquiryImageFiles(files: File[]): {
  files: File[]
  error: string | null
} {
  const accepted: File[] = []
  for (const file of files) {
    if (!isInquiryImageMimeType(file.type)) {
      return {
        files: accepted,
        error: 'Only JPG, PNG, and WebP images are supported.',
      }
    }
    if (file.size <= 0) {
      return { files: accepted, error: 'An image cannot be empty.' }
    }
    if (file.size > MAX_INQUIRY_IMAGE_BYTES) {
      return { files: accepted, error: 'Each image must be 5 MB or smaller.' }
    }
    if (accepted.length + 1 > MAX_INQUIRY_IMAGE_COUNT) {
      return { files: accepted, error: 'You can attach up to 4 images per message.' }
    }
    accepted.push(file)
  }
  return { files: accepted, error: null }
}

/** Human label for the file input accept attribute. */
export const INQUIRY_IMAGE_ACCEPT =
  'image/jpeg,image/jpg,image/png,image/webp'