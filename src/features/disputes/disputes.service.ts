import type { PostgrestError } from '@supabase/supabase-js'
import { supabase } from '../../lib/supabase/client'
import type {
  CompleteRefundInput,
  Dispute,
  DisputeDetail,
  DisputeErrorCode,
  DisputeEvent,
  DisputeEventDisplay,
  DisputeEvidence,
  DisputeEvidenceDisplay,
  DisputeMessage,
  DisputeMessageDisplay,
  DisputeOrderItem,
  DisputeRpcError,
  DisputeSummary,
  OpenOrderDisputeInput,
  OrderStatus,
  PaymentStatus,
  PublicDisputeParticipant,
  Refund,
  RefundDisplay,
  RefundEvent,
  RefundEventDisplay,
  RequestRefundInput,
} from './disputes.types'
import { DISPUTE_ERROR_CODES, isDisputeReason } from './disputes.types'
import {
  createDisputeEvidenceFilename,
  evidenceExtensionForMimeType,
  MAX_DISPUTE_EVIDENCE_BYTES,
  validateDisputeEvidence,
} from './disputes-validation'

export const DISPUTE_EVIDENCE_BUCKET = 'dispute-evidence'

const DISPUTE_SUMMARY_COLUMNS = `
  id,
  order_id,
  buyer_id,
  reason,
  description,
  status,
  resolution,
  resolved_at,
  created_at,
  updated_at,
  seller:public_seller_profiles ( store_name ),
  refund:refunds ( id, status, amount ),
  order:orders (
    id,
    order_number,
    status,
    total,
    items:order_items ( id, listing_id, product_title, unit_price, quantity ),
    payment:payments ( status )
  )
`

type Relation<T> = T | T[] | null

interface RawDisputeOrder {
  id: string
  order_number: string
  status: OrderStatus
  total: number
  items: DisputeOrderItem[] | null
  payment: Relation<{ status: PaymentStatus }>
}

interface RawDisputeSummary {
  id: string
  order_id: string
  buyer_id: string
  reason: string
  description: string | null
  status: Dispute['status']
  resolution: string | null
  resolved_at: string | null
  created_at: string
  updated_at: string
  seller: Relation<{ store_name: string | null }>
  refund: Relation<Pick<Refund, 'id' | 'status' | 'amount'>>
  order: Relation<RawDisputeOrder>
}

function firstRelation<T>(value: Relation<T>): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value
}

function relationArray<T>(value: T[] | T | null | undefined): T[] {
  if (value == null) return []
  return Array.isArray(value) ? value : [value]
}

function unknownError(message = 'Something went wrong. Please try again.'): DisputeRpcError {
  return { code: 'UNKNOWN', message }
}

function isDisputeErrorCode(value: string): value is DisputeErrorCode {
  return (DISPUTE_ERROR_CODES as readonly string[]).includes(value)
}

/** Parses only known structured codes; raw SQL/RLS text is never returned. */
export function parseDisputeError(error: PostgrestError | null): DisputeRpcError | null {
  if (error == null) return null
  const match = (error.message ?? '').trim().match(/^([A-Z0-9_]+):/)
  const code = match?.[1]
  if (code != null && isDisputeErrorCode(code)) {
    return { code, message: disputeErrorLabel(code) }
  }
  if (error.code === '42501') {
    return { code: 'FORBIDDEN', message: disputeErrorLabel('FORBIDDEN') }
  }
  return unknownError()
}

/** Safe user-facing copy for Phase 11 RPC and read errors. */
export function disputeErrorLabel(code: DisputeErrorCode | string): string {
  switch (code) {
    case 'AUTH_REQUIRED': return 'Please sign in to continue.'
    case 'ACCOUNT_UNAVAILABLE': return 'Your account must be active to do that.'
    case 'INVALID_REPORT_REASON': return 'Choose a valid listing report reason.'
    case 'LISTING_NOT_FOUND': return 'This listing could not be found.'
    case 'LISTING_UNAVAILABLE': return 'Only active listings can be reported.'
    case 'SELF_REPORT_NOT_ALLOWED': return 'You cannot report your own listing.'
    case 'LISTING_REPORT_ALREADY_EXISTS': return 'You already have an active report for this listing.'
    case 'INVALID_DISPUTE_REASON': return 'Choose a valid dispute reason.'
    case 'DESCRIPTION_REQUIRED': return 'Provide a description of the dispute.'
    case 'INVALID_DESCRIPTION': return 'Description must be 2000 characters or fewer.'
    case 'ORDER_NOT_FOUND': return 'This order could not be found.'
    case 'FORBIDDEN': return 'You are not allowed to do that.'
    case 'ORDER_NOT_DISPUTABLE': return 'This order is not eligible for a dispute.'
    case 'ACTIVE_DISPUTE_EXISTS': return 'This order already has an active dispute.'
    case 'INVALID_MESSAGE': return 'Message must contain 1 to 5000 characters.'
    case 'DISPUTE_NOT_FOUND': return 'This dispute could not be found.'
    case 'DISPUTE_NOT_OPEN': return 'This action is only available on an active dispute.'
    case 'INVALID_EVIDENCE_PATH':
    case 'INVALID_EVIDENCE_FILENAME':
    case 'EVIDENCE_OBJECT_NOT_FOUND': return 'The evidence file could not be registered. Please try again.'
    case 'INVALID_EVIDENCE_TYPE': return 'Evidence must be a JPG, JPEG, PNG, WebP, or PDF.'
    case 'INVALID_EVIDENCE_SIZE': return 'Evidence must be larger than 0 bytes and no more than 5 MB.'
    case 'EVIDENCE_ALREADY_REGISTERED': return 'This evidence file has already been added.'
    case 'INVALID_REFUND_AMOUNT': return 'Refund amount must be greater than zero.'
    case 'INVALID_REFUND_REASON': return 'Refund reason must contain 1 to 2000 characters.'
    case 'PAYMENT_NOT_PAID': return 'Only a paid order can be refunded.'
    case 'REFUND_EXCEEDS_AVAILABLE': return 'The refund cannot exceed the paid amount.'
    case 'REFUND_NOT_ALLOWED': return 'Only a full-order refund is supported.'
    case 'REFUND_ALREADY_EXISTS': return 'This order already has a refund.'
    case 'REFUND_NOT_FOUND': return 'This refund could not be found.'
    case 'REFUND_NOT_REVIEWABLE': return 'Only requested refunds can be reviewed.'
    case 'INVALID_REVIEW_REASON': return 'Review reason must be 2000 characters or fewer.'
    case 'REJECTION_REASON_REQUIRED': return 'Provide a reason for rejecting the refund.'
    case 'INVALID_DECISION': return 'Choose a valid refund decision.'
    case 'INVALID_REFUND_METHOD': return 'Choose how the refund was returned.'
    case 'INVALID_REFERENCE': return 'Reference must be 120 characters or fewer.'
    case 'INVALID_NOTES': return 'Notes must be 2000 characters or fewer.'
    case 'REFUND_NOT_APPROVED': return 'Only an approved refund can be completed.'
    case 'INVALID_ESCALATION_REASON': return 'Escalation reason must be 2000 characters or fewer.'
    case 'DISPUTE_NOT_ESCALATABLE': return 'Only an open dispute can be escalated.'
    case 'DISPUTE_NOT_CLOSABLE': return 'Only an active dispute can be closed.'
    case 'REFUND_STILL_ACTIVE': return 'Resolve the active refund before closing this dispute.'
    case 'REPORT_NOT_FOUND': return 'This report could not be found.'
    case 'INVALID_REPORT_TRANSITION': return 'That report status change is not allowed.'
    case 'RESOLUTION_REQUIRED': return 'A resolution is required.'
    case 'INVALID_RESOLUTION': return 'Resolution must be 2000 characters or fewer.'
    case 'DISPUTE_NOT_RESOLVABLE': return 'This dispute cannot be resolved in its current state.'
    case 'PHASE11_BACKFILL_FAILED':
    case 'UNKNOWN':
    default: return 'Something went wrong. Please try again.'
  }
}

export async function openOrderDispute(
  input: OpenOrderDisputeInput,
): Promise<{ data: Dispute | null; error: DisputeRpcError | null }> {
  const { data, error } = await supabase.rpc('open_order_dispute', {
    p_order_id: input.orderId,
    p_reason: input.reason,
    p_description: input.description.trim(),
  })
  return { data: (data ?? null) as Dispute | null, error: parseDisputeError(error) }
}

export async function sendDisputeMessage(
  disputeId: string,
  message: string,
): Promise<{ data: DisputeMessage | null; error: DisputeRpcError | null }> {
  const { data, error } = await supabase.rpc('send_dispute_message', {
    p_dispute_id: disputeId,
    p_message: message.trim(),
  })
  return { data: (data ?? null) as DisputeMessage | null, error: parseDisputeError(error) }
}

export async function requestRefund(
  input: RequestRefundInput,
): Promise<{ data: Refund | null; error: DisputeRpcError | null }> {
  const { data, error } = await supabase.rpc('request_refund', {
    p_dispute_id: input.disputeId,
    p_requested_amount: input.requestedAmount,
    p_reason: input.reason.trim(),
  })
  return { data: (data ?? null) as Refund | null, error: parseDisputeError(error) }
}

export async function approveRefund(
  refundId: string,
  reason?: string | null,
): Promise<{ data: Refund | null; error: DisputeRpcError | null }> {
  const { data, error } = await supabase.rpc('review_refund', {
    p_refund_id: refundId,
    p_decision: 'approve',
    p_reason: reason?.trim() || undefined,
  })
  return { data: (data ?? null) as Refund | null, error: parseDisputeError(error) }
}

export async function rejectRefund(
  refundId: string,
  reason: string,
): Promise<{ data: Refund | null; error: DisputeRpcError | null }> {
  const { data, error } = await supabase.rpc('review_refund', {
    p_refund_id: refundId,
    p_decision: 'reject',
    p_reason: reason.trim(),
  })
  return { data: (data ?? null) as Refund | null, error: parseDisputeError(error) }
}

export async function completeRefund(
  input: CompleteRefundInput,
): Promise<{ data: Refund | null; error: DisputeRpcError | null }> {
  const { data, error } = await supabase.rpc('complete_refund', {
    p_refund_id: input.refundId,
    p_method: input.method,
    p_reference: input.reference?.trim() || undefined,
    p_notes: input.notes?.trim() || undefined,
  })
  return { data: (data ?? null) as Refund | null, error: parseDisputeError(error) }
}

export async function escalateDispute(
  disputeId: string,
  reason?: string | null,
): Promise<{ data: Dispute | null; error: DisputeRpcError | null }> {
  const { data, error } = await supabase.rpc('escalate_dispute', {
    p_dispute_id: disputeId,
    p_reason: reason?.trim() || undefined,
  })
  return { data: (data ?? null) as Dispute | null, error: parseDisputeError(error) }
}

export async function closeMyDispute(
  disputeId: string,
): Promise<{ data: Dispute | null; error: DisputeRpcError | null }> {
  const { data, error } = await supabase.rpc('close_my_dispute', { p_dispute_id: disputeId })
  return { data: (data ?? null) as Dispute | null, error: parseDisputeError(error) }
}

async function resolvePublicParticipants(
  userIds: string[],
): Promise<{ data: Map<string, PublicDisputeParticipant>; error: DisputeRpcError | null }> {
  const participants = new Map<string, PublicDisputeParticipant>()
  const ids = [...new Set(userIds)].filter((id) => id.length > 0)
  if (ids.length === 0) return { data: participants, error: null }
  const { data, error } = await supabase
    .from('public_profiles')
    .select('id, display_name')
    .in('id', ids)
  if (error != null) return { data: participants, error: parseDisputeError(error) }
  for (const row of data ?? []) {
    if (row.id != null) participants.set(row.id, { id: row.id, display_name: row.display_name })
  }
  return { data: participants, error: null }
}

function participant(
  userId: string,
  participants: Map<string, PublicDisputeParticipant>,
): PublicDisputeParticipant {
  return participants.get(userId) ?? { id: userId, display_name: null }
}

function normalizeSummary(
  row: RawDisputeSummary,
  participants: Map<string, PublicDisputeParticipant>,
): DisputeSummary | null {
  const order = firstRelation(row.order)
  if (order == null) return null
  const seller = firstRelation(row.seller)
  const payment = firstRelation(order.payment)
  return {
    id: row.id,
    order_id: row.order_id,
    reason: isDisputeReason(row.reason) ? row.reason : 'other',
    description: row.description,
    status: row.status,
    resolution: row.resolution,
    resolved_at: row.resolved_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    seller: { store_name: seller?.store_name ?? null },
    buyer_name: participant(row.buyer_id, participants).display_name,
    refund: firstRelation(row.refund),
    order: {
      id: order.id,
      order_number: order.order_number,
      status: order.status,
      total: order.total,
      payment_status: payment?.status ?? null,
      items: relationArray(order.items),
    },
  }
}

async function normalizeSummaries(
  rows: RawDisputeSummary[],
): Promise<{ data: DisputeSummary[]; error: DisputeRpcError | null }> {
  const resolved = await resolvePublicParticipants(rows.map((row) => row.buyer_id))
  if (resolved.error != null) return { data: [], error: resolved.error }
  return {
    data: rows.flatMap((row) => {
      const summary = normalizeSummary(row, resolved.data)
      return summary == null ? [] : [summary]
    }),
    error: null,
  }
}

export async function getOrderDispute(
  orderId: string,
): Promise<{ data: DisputeSummary | null; error: DisputeRpcError | null }> {
  const { data, error } = await supabase
    .from('disputes')
    .select(DISPUTE_SUMMARY_COLUMNS)
    .eq('order_id', orderId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error != null) return { data: null, error: parseDisputeError(error) }
  if (data == null) return { data: null, error: null }
  const normalized = await normalizeSummaries([data as unknown as RawDisputeSummary])
  return { data: normalized.data[0] ?? null, error: normalized.error }
}

export async function getBuyerDisputes(): Promise<{
  data: DisputeSummary[] | null
  error: DisputeRpcError | null
}> {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
  if (sessionError != null) return { data: null, error: unknownError() }
  const buyerId = sessionData.session?.user.id
  if (buyerId == null) {
    return { data: null, error: { code: 'AUTH_REQUIRED', message: disputeErrorLabel('AUTH_REQUIRED') } }
  }
  const { data, error } = await supabase
    .from('disputes')
    .select(DISPUTE_SUMMARY_COLUMNS)
    .eq('buyer_id', buyerId)
    .order('updated_at', { ascending: false })
  if (error != null) return { data: null, error: parseDisputeError(error) }
  const normalized = await normalizeSummaries((data ?? []) as unknown as RawDisputeSummary[])
  return { data: normalized.error == null ? normalized.data : null, error: normalized.error }
}

export async function getSellerDisputes(): Promise<{
  data: DisputeSummary[] | null
  error: DisputeRpcError | null
}> {
  const sellerResult = await supabase.rpc('auth_seller_id')
  if (sellerResult.error != null) return { data: null, error: parseDisputeError(sellerResult.error) }
  if (sellerResult.data == null) return { data: [], error: null }
  const { data, error } = await supabase
    .from('disputes')
    .select(DISPUTE_SUMMARY_COLUMNS)
    .eq('seller_id', sellerResult.data)
    .order('updated_at', { ascending: false })
  if (error != null) return { data: null, error: parseDisputeError(error) }
  const normalized = await normalizeSummaries((data ?? []) as unknown as RawDisputeSummary[])
  return { data: normalized.error == null ? normalized.data : null, error: normalized.error }
}

export async function getDisputeDetail(
  disputeId: string,
): Promise<{ data: DisputeDetail | null; error: DisputeRpcError | null }> {
  const [summaryResult, messagesResult, evidenceResult, eventsResult, refundResult] = await Promise.all([
    supabase.from('disputes').select(DISPUTE_SUMMARY_COLUMNS).eq('id', disputeId).maybeSingle(),
    supabase.from('dispute_messages').select('*').eq('dispute_id', disputeId).order('created_at'),
    supabase.from('dispute_evidence').select('*').eq('dispute_id', disputeId).order('created_at'),
    supabase.from('dispute_events').select('*').eq('dispute_id', disputeId).order('created_at'),
    supabase.from('refunds').select('*').eq('dispute_id', disputeId).maybeSingle(),
  ])
  const queryError = summaryResult.error ?? messagesResult.error ?? evidenceResult.error
    ?? eventsResult.error ?? refundResult.error
  if (queryError != null) return { data: null, error: parseDisputeError(queryError) }
  if (summaryResult.data == null) return { data: null, error: null }

  const messages = (messagesResult.data ?? []) as DisputeMessage[]
  const evidence = (evidenceResult.data ?? []) as DisputeEvidence[]
  const events = (eventsResult.data ?? []) as DisputeEvent[]
  const refund = (refundResult.data ?? null) as Refund | null
  const refundEventsResult = refund == null
    ? { data: [] as RefundEvent[], error: null }
    : await supabase.from('refund_events').select('*').eq('refund_id', refund.id).order('created_at')
  if (refundEventsResult.error != null) {
    return { data: null, error: parseDisputeError(refundEventsResult.error) }
  }

  const rawSummary = summaryResult.data as unknown as RawDisputeSummary
  const actorIds = [
    rawSummary.buyer_id,
    ...messages.map((row) => row.sender_id),
    ...evidence.map((row) => row.uploader_id),
    ...events.map((row) => row.actor_id),
    ...(refundEventsResult.data ?? []).map((row) => row.actor_id),
  ]
  const resolved = await resolvePublicParticipants(actorIds)
  if (resolved.error != null) return { data: null, error: resolved.error }
  const summary = normalizeSummary(rawSummary, resolved.data)
  if (summary == null) return { data: null, error: unknownError() }

  const messageDisplays: DisputeMessageDisplay[] = messages.map((row) => ({
    id: row.id,
    message: row.message,
    created_at: row.created_at,
    sender: participant(row.sender_id, resolved.data),
  }))
  const evidenceDisplays: DisputeEvidenceDisplay[] = evidence.map((row) => ({
    id: row.id,
    storage_path: row.storage_path,
    original_filename: row.original_filename,
    mime_type: row.mime_type,
    size_bytes: row.size_bytes,
    created_at: row.created_at,
    uploader: participant(row.uploader_id, resolved.data),
  }))
  const eventDisplays: DisputeEventDisplay[] = events.map((row) => ({
    id: row.id,
    event_type: row.event_type,
    from_status: row.from_status,
    to_status: row.to_status,
    details: row.details,
    created_at: row.created_at,
    actor: participant(row.actor_id, resolved.data),
  }))
  const refundEventDisplays: RefundEventDisplay[] = (refundEventsResult.data ?? []).map((row) => ({
    id: row.id,
    event_type: row.event_type,
    from_status: row.from_status,
    to_status: row.to_status,
    details: row.details,
    created_at: row.created_at,
    actor: participant(row.actor_id, resolved.data),
  }))
  const refundDisplay: RefundDisplay | null = refund == null ? null : {
    id: refund.id,
    amount: refund.amount,
    status: refund.status,
    reason: refund.reason,
    review_reason: refund.review_reason,
    method: refund.method,
    reference: refund.reference,
    notes: refund.notes,
    requested_at: refund.requested_at,
    reviewed_at: refund.reviewed_at,
    completed_at: refund.completed_at,
    created_at: refund.created_at,
    updated_at: refund.updated_at,
    events: refundEventDisplays,
  }
  return {
    data: {
      ...summary,
      messages: messageDisplays,
      evidence: evidenceDisplays,
      refund: refundDisplay,
      events: eventDisplays,
    },
    error: null,
  }
}

function safeOriginalFilename(file: File): string {
  const extension = evidenceExtensionForMimeType(file.type) ?? 'file'
  const sanitized = file.name.trim().replaceAll('/', '_').replaceAll('\\', '_')
  return (sanitized.length > 0 ? sanitized : `evidence.${extension}`).slice(0, 255)
}

/** Uploads private evidence, then atomically registers its trusted metadata. */
export async function uploadDisputeEvidence(
  userId: string,
  disputeId: string,
  file: File,
): Promise<{ data: DisputeEvidence | null; error: DisputeRpcError | null }> {
  const validation = validateDisputeEvidence(file)
  if (validation.file != null) {
    const code: DisputeErrorCode = file.size > MAX_DISPUTE_EVIDENCE_BYTES || file.size <= 0
      ? 'INVALID_EVIDENCE_SIZE'
      : 'INVALID_EVIDENCE_TYPE'
    return { data: null, error: { code, message: validation.file } }
  }
  const filename = createDisputeEvidenceFilename(file.type)
  if (filename == null) {
    return { data: null, error: { code: 'INVALID_EVIDENCE_TYPE', message: disputeErrorLabel('INVALID_EVIDENCE_TYPE') } }
  }
  const path = `${userId}/${disputeId}/${filename}`

  try {
    const upload = await supabase.storage
      .from(DISPUTE_EVIDENCE_BUCKET)
      .upload(path, file, { contentType: file.type, upsert: false })
    if (upload.error != null) {
      return { data: null, error: unknownError('Evidence could not be uploaded. Please try again.') }
    }

    const registration = await supabase.rpc('register_dispute_evidence', {
      p_dispute_id: disputeId,
      p_storage_path: path,
      p_original_filename: safeOriginalFilename(file),
      p_mime_type: file.type,
      p_size_bytes: file.size,
    })
    if (registration.error == null) {
      return { data: (registration.data ?? null) as DisputeEvidence | null, error: null }
    }

    try {
      const cleanup = await supabase.storage.from(DISPUTE_EVIDENCE_BUCKET).remove([path])
      if (cleanup.error != null) {
        return { data: null, error: unknownError('Evidence could not be saved or cleaned up. Please try again.') }
      }
    } catch {
      return { data: null, error: unknownError('Evidence could not be saved or cleaned up. Please try again.') }
    }
    return { data: null, error: parseDisputeError(registration.error) }
  } catch {
    return { data: null, error: unknownError('Evidence could not be uploaded. Please try again.') }
  }
}

/** Creates a private five-minute URL; no public URL is ever generated. */
export async function disputeEvidenceUrl(
  path: string | null | undefined,
): Promise<{ data: string | null; error: DisputeRpcError | null }> {
  if (path == null || path.trim().length === 0) {
    return { data: null, error: { code: 'INVALID_EVIDENCE_PATH', message: disputeErrorLabel('INVALID_EVIDENCE_PATH') } }
  }
  try {
    const { data, error } = await supabase.storage
      .from(DISPUTE_EVIDENCE_BUCKET)
      .createSignedUrl(path, 60 * 5)
    if (error != null || data?.signedUrl == null) {
      return { data: null, error: unknownError('Evidence could not be opened. Please try again.') }
    }
    return { data: data.signedUrl, error: null }
  } catch {
    return { data: null, error: unknownError('Evidence could not be opened. Please try again.') }
  }
}
