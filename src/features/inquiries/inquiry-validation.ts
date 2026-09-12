export const MAX_INQUIRY_SUBJECT_LENGTH = 120
export const MIN_INQUIRY_SUBJECT_LENGTH = 3
export const MAX_INQUIRY_MESSAGE_LENGTH = 2000
export const MIN_INQUIRY_MESSAGE_LENGTH = 3

export interface InquiryFormValues {
  subject: string
  message: string
}

export interface InquiryFormErrors {
  subject?: string
  message?: string
}

/** Validates the "start an inquiry" form against the DB CHECK bounds. */
export function validateInquiryForm(values: InquiryFormValues): InquiryFormErrors {
  const subject = values.subject.trim()
  const message = values.message.trim()
  const errors: InquiryFormErrors = {}

  if (subject.length === 0) {
    errors.subject = 'Subject is required.'
  } else if (subject.length < MIN_INQUIRY_SUBJECT_LENGTH) {
    errors.subject = `Subject must be at least ${MIN_INQUIRY_SUBJECT_LENGTH} characters.`
  } else if (subject.length > MAX_INQUIRY_SUBJECT_LENGTH) {
    errors.subject = `Subject must be ${MAX_INQUIRY_SUBJECT_LENGTH} characters or fewer.`
  }

  if (message.length === 0) {
    errors.message = 'Message is required.'
  } else if (message.length < MIN_INQUIRY_MESSAGE_LENGTH) {
    errors.message = `Message must be at least ${MIN_INQUIRY_MESSAGE_LENGTH} characters.`
  } else if (message.length > MAX_INQUIRY_MESSAGE_LENGTH) {
    errors.message = `Message must be ${MAX_INQUIRY_MESSAGE_LENGTH} characters or fewer.`
  }

  return errors
}

/** Validates a single thread reply (1–2000 trimmed characters). */
export function validateInquiryMessage(message: string): string | null {
  const trimmed = message.trim()
  if (trimmed.length === 0) return 'Message is required.'
  if (trimmed.length > MAX_INQUIRY_MESSAGE_LENGTH) {
    return `Message must be ${MAX_INQUIRY_MESSAGE_LENGTH} characters or fewer.`
  }
  return null
}
