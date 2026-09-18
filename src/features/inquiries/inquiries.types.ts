import type { Database, Tables } from '../../types/database'

export type InquiryStatus = Database['public']['Enums']['inquiry_status']

export type Inquiry = Tables<'inquiries'>
export type InquiryMessage = Tables<'inquiry_messages'>
export type InquiryMessageAttachment = Tables<'inquiry_message_attachments'>

/**
 * An inquiry row with joined display data. The seller embed comes from the
 * public_seller_profiles view (a valid PostgREST relation via the FK);
 * buyer_name is resolved through a separate public_profiles query because
 * there is no FK relationship from inquiries to that view. Either display
 * value may be null when the counterparty's public profile is not visible.
 */
export interface InquiryListItem {
  id: string
  listing_id: string
  listing_title: string | null
  buyer_id: string
  seller_id: string
  subject: string
  message: string
  status: InquiryStatus
  created_at: string
  updated_at: string
  seller: { store_name: string | null } | null
  buyer_name: string | null
}

/** The fields a buyer provides when opening a new inquiry. */
export interface InquiryInput {
  listing_id: string
  seller_id: string
  subject: string
  message: string
}

/**
 * A selected-but-unsent image in the composer. `previewUrl` is a temporary
 * object URL that must be revoked once the attachment is sent or removed.
 */
export interface PendingInquiryImage {
  id: string
  file: File
  previewUrl: string
}

/** Trusted metadata sent to send_inquiry_reply for one attachment. */
export interface InquiryAttachmentInput {
  storage_path: string
  file_name: string | null
  mime_type: string
  file_size: number
}