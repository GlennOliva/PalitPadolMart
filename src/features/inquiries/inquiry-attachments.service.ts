import type { PostgrestError } from '@supabase/supabase-js'
import { supabase } from '../../lib/supabase/client'
import type { Json } from '../../types/database'
import {
  createInquiryImageFilename,
  MAX_INQUIRY_IMAGE_BYTES,
  validateInquiryImageFiles,
} from './inquiry-attachments'
import type {
  InquiryAttachmentInput,
  InquiryMessageAttachment,
  InquiryMessage,
} from './inquiries.types'

/** Private bucket; public = FALSE. Images are participant-only in Storage RLS. */
export const INQUIRY_ATTACHMENTS_BUCKET = 'inquiry-attachments'

/**
 * Storage path convention: {inquiry_id}/{uploader_user_id}/{uuid}.{ext}.
 * The RPC re-derives `uploader_user_id` from auth.uid() and re-validates the
 * inquiry id, so a client can never point at another inquiry or uploader.
 */
export function inquiryAttachmentStoragePath(
  inquiryId: string,
  userId: string,
  file: File,
): string | null {
  const filename = createInquiryImageFilename(file.type)
  if (filename == null) return null
  return `${inquiryId}/${userId}/${filename}`
}

/**
 * Uploads one private image to the pending path. Storage RLS only permits a
 * participant to write under their own inquiry + user id, so any mis-directed
 * attempt fails here with a friendly error (raw Storage/RLS internals are
 * never surfaced).
 */
export async function uploadInquiryImage(
  file: File,
  inquiryId: string,
  userId: string,
): Promise<{ path: string | null; error: string | null }> {
  const validation = validateInquiryImageFiles([file])
  if (validation.error != null) {
    return { path: null, error: validation.error }
  }
  const path = inquiryAttachmentStoragePath(inquiryId, userId, file)
  if (path == null) {
    return { path: null, error: 'Only JPG, PNG, and WebP images are supported.' }
  }
  try {
    const { error } = await supabase.storage
      .from(INQUIRY_ATTACHMENTS_BUCKET)
      .upload(path, file, { contentType: file.type, upsert: false })
    if (error != null) {
      return {
        path: null,
        error: 'Upload failed. Please try again.',
      }
    }
    return { path, error: null }
  } catch {
    return { path: null, error: 'Upload failed. Please try again.' }
  }
}

/**
 * Sends a thread message with optional image attachments through the trusted
 * security-definer RPC. The database derives the sender from auth.uid(),
 * validates participation + closed state, re-validates every storage path
 * against this inquiry + uploader, and inserts message + attachment rows
 * atomically. A text-only message passes an empty attachment array, so the
 * existing behavior is unchanged.
 */
export async function sendInquiryMessage(
  inquiryId: string,
  message: string,
  attachments: InquiryAttachmentInput[],
): Promise<{ data: InquiryMessage | null; error: PostgrestError | null }> {
  const { data, error } = await supabase.rpc('send_inquiry_reply', {
    p_inquiry_id: inquiryId,
    p_message: message,
    p_attachments: attachments as unknown as Json,
  })
  return { data: (data ?? null) as InquiryMessage | null, error }
}

/**
 * All attachment metadata for one conversation (participant-only via RLS).
 * Only trusted metadata (storage path, mime, size, filename) is stored; signed
 * URLs are generated on demand and never persisted.
 */
export async function getInquiryAttachments(
  inquiryId: string,
): Promise<{ data: InquiryMessageAttachment[]; error: PostgrestError | null }> {
  const { data, error } = await supabase
    .from('inquiry_message_attachments')
    .select('*')
    .eq('inquiry_id', inquiryId)
    .order('created_at', { ascending: true })
  return { data: (data ?? []) as InquiryMessageAttachment[], error }
}

/**
 * Short-lived signed URL (5 minutes) for an authorized participant or admin.
 * Selection is gated by the Storage RLS policy; a stranger or anonymous caller
 * cannot obtain a URL.
 */
export async function inquiryAttachmentUrl(
  path: string,
): Promise<{ data: string | null; error: string | null }> {
  if (path.trim().length === 0) return { data: null, error: 'Image cannot be opened.' }
  try {
    const { data, error } = await supabase.storage
      .from(INQUIRY_ATTACHMENTS_BUCKET)
      .createSignedUrl(path, 60 * 5)
    if (error != null || data?.signedUrl == null) {
      return { data: null, error: 'Image cannot be opened.' }
    }
    return { data: data.signedUrl, error: null }
  } catch {
    return { data: null, error: 'Image cannot be opened.' }
  }
}

/**
 * Safely removes ONLY the paths uploaded during the current send attempt, used
 * when the message RPC fails so orphaned objects do not accumulate. Paths are
 * tracked by the caller; unrelated objects are never touched. Uploader-scoped
 * Storage RLS keeps the delete limited to the caller's own pending files.
 */
export async function removeInquiryUploads(paths: string[]): Promise<void> {
  const unique = [...new Set(paths)].filter((path) => path.length > 0)
  if (unique.length === 0) return
  try {
    await supabase.storage.from(INQUIRY_ATTACHMENTS_BUCKET).remove(unique)
  } catch {
    // Cleanup is best-effort; a stray orphan object is harmless and invisible.
  }
}

export { MAX_INQUIRY_IMAGE_BYTES }