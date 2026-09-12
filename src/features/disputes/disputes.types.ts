import type { Database, Json, Tables } from '../../types/database'

export type DisputeStatus = Database['public']['Enums']['dispute_status']
export type RefundStatus = Database['public']['Enums']['refund_status']
export type RefundMethod = Database['public']['Enums']['refund_method']
export type OrderStatus = Database['public']['Enums']['order_status']
export type PaymentStatus = Database['public']['Enums']['payment_status']

export type Dispute = Tables<'disputes'>
export type DisputeMessage = Tables<'dispute_messages'>
export type DisputeEvidence = Tables<'dispute_evidence'>
export type Refund = Tables<'refunds'>
export type DisputeEvent = Tables<'dispute_events'>
export type RefundEvent = Tables<'refund_events'>

export const DISPUTE_REASONS = [
  'item_not_received',
  'item_not_as_described',
  'damaged_item',
  'wrong_item',
  'missing_item',
  'payment_issue',
  'seller_issue',
  'pickup_issue',
  'delivery_issue',
  'other',
] as const

export type DisputeReason = (typeof DISPUTE_REASONS)[number]

export const DISPUTE_REASON_LABELS: Record<DisputeReason, string> = {
  item_not_received: 'Item not received',
  item_not_as_described: 'Item not as described',
  damaged_item: 'Damaged item',
  wrong_item: 'Wrong item',
  missing_item: 'Missing item',
  payment_issue: 'Payment issue',
  seller_issue: 'Seller issue',
  pickup_issue: 'Pickup issue',
  delivery_issue: 'Delivery issue',
  other: 'Other',
}

export const DISPUTABLE_ORDER_STATUSES = [
  'confirmed',
  'paid',
  'preparing',
  'shipped',
  'ready_for_pickup',
  'completed',
] as const satisfies readonly OrderStatus[]

export function isDisputeReason(value: string): value is DisputeReason {
  return (DISPUTE_REASONS as readonly string[]).includes(value)
}

export function isOrderDisputable(status: OrderStatus): boolean {
  return (DISPUTABLE_ORDER_STATUSES as readonly OrderStatus[]).includes(status)
}

export interface OpenOrderDisputeInput {
  orderId: string
  reason: DisputeReason
  description: string
}

export interface RequestRefundInput {
  disputeId: string
  requestedAmount: number
  reason: string
}

export interface CompleteRefundInput {
  refundId: string
  method: RefundMethod
  reference?: string | null
  notes?: string | null
}

export interface DisputeOrderItem {
  id: string
  listing_id: string
  product_title: string
  unit_price: number
  quantity: number
}

export interface DisputeOrderSnapshot {
  id: string
  order_number: string
  status: OrderStatus
  total: number
  payment_status: PaymentStatus | null
  items: DisputeOrderItem[]
}

export interface PublicDisputeParticipant {
  id: string | null
  display_name: string | null
}

export interface DisputeSummary {
  id: string
  order_id: string
  reason: DisputeReason
  description: string | null
  status: DisputeStatus
  resolution: string | null
  resolved_at: string | null
  created_at: string
  updated_at: string
  seller: { store_name: string | null }
  buyer_name: string | null
  order: DisputeOrderSnapshot
  refund: Pick<Refund, 'id' | 'status' | 'amount'> | null
}

export interface DisputeMessageDisplay {
  id: string
  message: string
  created_at: string
  sender: PublicDisputeParticipant
}

export interface DisputeEvidenceDisplay {
  id: string
  storage_path: string | null
  original_filename: string | null
  mime_type: string | null
  size_bytes: number | null
  created_at: string
  uploader: PublicDisputeParticipant
}

export interface DisputeEventDisplay {
  id: string
  event_type: string
  from_status: DisputeStatus | null
  to_status: DisputeStatus
  details: Json | null
  created_at: string
  actor: PublicDisputeParticipant
}

export interface RefundEventDisplay {
  id: string
  event_type: string
  from_status: RefundStatus | null
  to_status: RefundStatus
  details: Json | null
  created_at: string
  actor: PublicDisputeParticipant
}

export interface RefundDisplay {
  id: string
  amount: number
  status: RefundStatus
  reason: string
  review_reason: string | null
  method: RefundMethod | null
  reference: string | null
  notes: string | null
  requested_at: string
  reviewed_at: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
  events: RefundEventDisplay[]
}

export interface DisputeDetail extends DisputeSummary {
  messages: DisputeMessageDisplay[]
  evidence: DisputeEvidenceDisplay[]
  refund: RefundDisplay | null
  events: DisputeEventDisplay[]
}

export const DISPUTE_ERROR_CODES = [
  'PHASE11_BACKFILL_FAILED',
  'AUTH_REQUIRED',
  'ACCOUNT_UNAVAILABLE',
  'INVALID_REPORT_REASON',
  'INVALID_DESCRIPTION',
  'LISTING_NOT_FOUND',
  'LISTING_UNAVAILABLE',
  'SELF_REPORT_NOT_ALLOWED',
  'LISTING_REPORT_ALREADY_EXISTS',
  'INVALID_DISPUTE_REASON',
  'DESCRIPTION_REQUIRED',
  'ORDER_NOT_FOUND',
  'FORBIDDEN',
  'ORDER_NOT_DISPUTABLE',
  'ACTIVE_DISPUTE_EXISTS',
  'INVALID_MESSAGE',
  'DISPUTE_NOT_FOUND',
  'DISPUTE_NOT_OPEN',
  'INVALID_EVIDENCE_PATH',
  'INVALID_EVIDENCE_FILENAME',
  'INVALID_EVIDENCE_TYPE',
  'INVALID_EVIDENCE_SIZE',
  'EVIDENCE_OBJECT_NOT_FOUND',
  'EVIDENCE_ALREADY_REGISTERED',
  'INVALID_REFUND_AMOUNT',
  'INVALID_REFUND_REASON',
  'PAYMENT_NOT_PAID',
  'REFUND_EXCEEDS_AVAILABLE',
  'REFUND_NOT_ALLOWED',
  'REFUND_ALREADY_EXISTS',
  'REFUND_NOT_FOUND',
  'REFUND_NOT_REVIEWABLE',
  'INVALID_REVIEW_REASON',
  'REJECTION_REASON_REQUIRED',
  'INVALID_DECISION',
  'INVALID_REFUND_METHOD',
  'INVALID_REFERENCE',
  'INVALID_NOTES',
  'REFUND_NOT_APPROVED',
  'INVALID_ESCALATION_REASON',
  'DISPUTE_NOT_ESCALATABLE',
  'DISPUTE_NOT_CLOSABLE',
  'REFUND_STILL_ACTIVE',
  'REPORT_NOT_FOUND',
  'INVALID_REPORT_TRANSITION',
  'RESOLUTION_REQUIRED',
  'INVALID_RESOLUTION',
  'DISPUTE_NOT_RESOLVABLE',
  'UNKNOWN',
] as const

export type DisputeErrorCode = (typeof DISPUTE_ERROR_CODES)[number]

export interface DisputeRpcError {
  code: DisputeErrorCode
  message: string
}
