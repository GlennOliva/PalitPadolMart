import type { PostgrestError } from '@supabase/supabase-js'
import { supabase } from '../../lib/supabase/client'
import type { Json } from '../../types/database'
import type {
  Inquiry,
  InquiryAttachmentInput,
  InquiryInput,
  InquiryListItem,
  InquiryMessage,
} from './inquiries.types'

const INQUIRY_DISPLAY_COLUMNS = `
  id,
  listing_id,
  listing_title,
  buyer_id,
  seller_id,
  subject,
  message,
  status,
  created_at,
  updated_at,
  seller:public_seller_profiles ( id, store_name )
`

const UNIQUE_VIOLATION = '23505'

type InquiryRow = Omit<InquiryListItem, 'buyer_name'>

/**
 * Resolves public display names for a set of buyer user ids through the
 * public_profiles view. There is no PostgREST relationship from inquiries to
 * that view, so names are fetched separately and merged into the rows.
 */
async function resolveBuyerNames(
  buyerIds: string[],
): Promise<Map<string, string | null>> {
  const names = new Map<string, string | null>()
  const uniqueIds = [...new Set(buyerIds)]
  if (uniqueIds.length === 0) return names
  const { data } = await supabase
    .from('public_profiles')
    .select('id, display_name')
    .in('id', uniqueIds)
  for (const row of data ?? []) {
    if (row.id == null) continue
    names.set(row.id, row.display_name)
  }
  return names
}

function withBuyerNames(
  rows: InquiryRow[],
  names: Map<string, string | null>,
): InquiryListItem[] {
  return rows.map((row) => ({ ...row, buyer_name: names.get(row.buyer_id) ?? null }))
}

/**
 * Every inquiry the caller participates in (as buyer or seller), most recently
 * updated first. RLS enforces participation, so this can never return another
 * user's conversation.
 */
export async function getMyInquiries(
  userId: string,
  sellerId: string | null,
): Promise<{ data: InquiryListItem[]; error: PostgrestError | null }> {
  let query = supabase
    .from('inquiries')
    .select(INQUIRY_DISPLAY_COLUMNS)
    .order('updated_at', { ascending: false })

  if (sellerId != null) {
    query = query.or(`buyer_id.eq.${userId},seller_id.eq.${sellerId}`)
  } else {
    query = query.eq('buyer_id', userId)
  }

  const { data, error } = await query
  const rows = (data ?? []) as InquiryRow[]
  if (error != null) return { data: [], error }
  const names = await resolveBuyerNames(rows.map((row) => row.buyer_id))
  return { data: withBuyerNames(rows, names), error }
}

/** A single inquiry, visible only to its participants (and admins). */
export async function getInquiry(
  inquiryId: string,
): Promise<{ data: InquiryListItem | null; error: PostgrestError | null }> {
  const { data, error } = await supabase
    .from('inquiries')
    .select(INQUIRY_DISPLAY_COLUMNS)
    .eq('id', inquiryId)
    .maybeSingle()

  const row = (data ?? null) as InquiryRow | null
  if (error != null || row == null) return { data: null, error }
  const names = await resolveBuyerNames([row.buyer_id])
  return { data: withBuyerNames([row], names)[0] ?? null, error }
}

/** Thread messages for one inquiry, oldest first (participant-only via RLS). */
export async function getInquiryMessages(
  inquiryId: string,
): Promise<{ data: InquiryMessage[]; error: PostgrestError | null }> {
  const { data, error } = await supabase
    .from('inquiry_messages')
    .select('*')
    .eq('inquiry_id', inquiryId)
    .order('created_at', { ascending: true })
  return { data: (data ?? []) as InquiryMessage[], error }
}

/**
 * Unread (inbound) message counts per inquiry: messages sent by the other
 * participant that have not been read yet.
 */
export async function getUnreadCounts(
  userId: string,
  inquiryIds: string[],
): Promise<{ data: Map<string, number>; error: PostgrestError | null }> {
  const counts = new Map<string, number>()
  if (inquiryIds.length === 0) return { data: counts, error: null }

  const { data, error } = await supabase
    .from('inquiry_messages')
    .select('id, inquiry_id')
    .in('inquiry_id', inquiryIds)
    .eq('is_read', false)
    .neq('sender_id', userId)

  for (const row of data ?? []) {
    counts.set(row.inquiry_id, (counts.get(row.inquiry_id) ?? 0) + 1)
  }
  return { data: counts, error }
}

/** Marks all inbound messages of an inquiry as read. */
export async function markInquiryRead(
  inquiryId: string,
  userId: string,
): Promise<{ error: PostgrestError | null }> {
  const { error } = await supabase
    .from('inquiry_messages')
    .update({ is_read: true })
    .eq('inquiry_id', inquiryId)
    .eq('is_read', false)
    .neq('sender_id', userId)
  return { error }
}

/** The buyer's currently active (open/answered) inquiry for a listing, if any. */
export async function findActiveInquiry(
  userId: string,
  listingId: string,
): Promise<{ data: InquiryListItem | null; error: PostgrestError | null }> {
  const { data, error } = await supabase
    .from('inquiries')
    .select(INQUIRY_DISPLAY_COLUMNS)
    .eq('buyer_id', userId)
    .eq('listing_id', listingId)
    .in('status', ['open', 'answered'])
    .maybeSingle()

  const row = (data ?? null) as InquiryRow | null
  if (error != null || row == null) return { data: null, error }
  const names = await resolveBuyerNames([row.buyer_id])
  return { data: withBuyerNames([row], names)[0] ?? null, error }
}

/**
 * Opens a new inquiry. The DB enforces the seller id matches the listing, that
 * the caller is not inquiring about their own listing, and (via the partial
 * unique index) that no active inquiry already exists. The unique-violation
 * path simply returns the existing active inquiry, so a double-tap on "Ask a
 * seller" can never create a duplicate conversation.
 */
export async function startInquiry(
  userId: string,
  input: InquiryInput,
): Promise<{ data: InquiryListItem | null; error: PostgrestError | null }> {
  const { data, error } = await supabase
    .from('inquiries')
    .insert({
      listing_id: input.listing_id,
      buyer_id: userId,
      seller_id: input.seller_id,
      subject: input.subject.trim(),
      message: input.message.trim(),
    })
    .select(INQUIRY_DISPLAY_COLUMNS)
    .single()

  const row = (data ?? null) as InquiryRow | null
  if (row != null && error == null) {
    const names = await resolveBuyerNames([row.buyer_id])
    return { data: withBuyerNames([row], names)[0] ?? null, error }
  }

  if (error != null && error.code === UNIQUE_VIOLATION) {
    const existing = await findActiveInquiry(userId, input.listing_id)
    if (existing.error == null && existing.data != null) {
      return { data: existing.data, error: null }
    }
  }

  return { data: null, error }
}

/**
 * Sends a reply through the atomic send_inquiry_reply RPC: it validates
 * participation and open/answered state, writes the message (and any image
 * attachments), and flips the inquiry status (seller → answered, buyer → open)
 * in one step. Text-only messages pass an empty attachment list, preserving the
 * original behavior.
 */
export async function sendInquiryReply(
  inquiryId: string,
  message: string,
  attachments: InquiryAttachmentInput[] = [],
): Promise<{ data: InquiryMessage | null; error: PostgrestError | null }> {
  const { data, error } = await supabase.rpc('send_inquiry_reply', {
    p_inquiry_id: inquiryId,
    p_message: message,
    p_attachments: attachments as unknown as Json,
  })
  return { data: (data ?? null) as InquiryMessage | null, error }
}

/** Closes an inquiry (participant-only; a closed inquiry cannot be revived). */
export async function closeInquiry(
  inquiryId: string,
): Promise<{ data: Inquiry | null; error: PostgrestError | null }> {
  const { data, error } = await supabase
    .from('inquiries')
    .update({ status: 'closed' })
    .eq('id', inquiryId)
    .select('*')
    .single()
  return { data: (data ?? null) as Inquiry | null, error }
}
