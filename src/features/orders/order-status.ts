import type { BadgeVariant } from '../../components/common/Badge'
import type { OrderStatus } from './orders.types'
import type { PaymentMethod, PaymentStatus } from './payments.types'

const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  paid: 'Paid',
  preparing: 'Preparing',
  shipped: 'Shipped',
  ready_for_pickup: 'Ready for pickup',
  completed: 'Completed',
  cancelled: 'Cancelled',
  disputed: 'Disputed',
}

const ORDER_STATUS_BADGE_VARIANTS: Record<OrderStatus, BadgeVariant> = {
  pending: 'pending',
  confirmed: 'confirmed',
  paid: 'paid',
  preparing: 'preparing',
  shipped: 'shipped',
  ready_for_pickup: 'ready_for_pickup',
  completed: 'completed',
  cancelled: 'cancelled',
  disputed: 'disputed',
}

const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  pending: 'Pending',
  submitted: 'Submitted',
  paid: 'Paid',
  failed: 'Failed',
  refunded: 'Refunded',
  partially_refunded: 'Partially refunded',
  rejected: 'Rejected',
}

const PAYMENT_STATUS_BADGE_VARIANTS: Record<PaymentStatus, BadgeVariant> = {
  pending: 'pending',
  submitted: 'submitted',
  paid: 'paid',
  failed: 'failed',
  refunded: 'refunded',
  partially_refunded: 'partially_refunded',
  rejected: 'rejected',
}

const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  manual_transfer: 'Manual transfer',
  cash_on_pickup: 'Cash on pickup',
  cash_on_delivery: 'Cash on delivery',
}

export function formatOrderStatus(status: OrderStatus): string {
  return ORDER_STATUS_LABELS[status]
}

export function orderStatusBadgeVariant(status: OrderStatus): BadgeVariant {
  return ORDER_STATUS_BADGE_VARIANTS[status]
}

export function formatPaymentStatus(status: PaymentStatus): string {
  return PAYMENT_STATUS_LABELS[status]
}

export function paymentStatusBadgeVariant(status: PaymentStatus): BadgeVariant {
  return PAYMENT_STATUS_BADGE_VARIANTS[status]
}

export function formatPaymentMethod(method: PaymentMethod | null | undefined): string {
  if (method == null) return '—'
  return PAYMENT_METHOD_LABELS[method]
}
