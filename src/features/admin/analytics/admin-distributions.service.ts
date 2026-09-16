import { listAdminDisputes, listAdminRefunds } from '../admin-cases.service'
import { listAdminOrders } from '../admin-commerce.service'
import { listAdminReviews } from '../admin-marketplace.service'
import type { AdminDisputesSearchState, AdminOrdersSearchState, AdminRefundsSearchState, AdminReviewsSearchState } from '../admin.types'

export interface DistributionSlice {
  label: string
  key: string
  count: number
}

export interface AdminDistributionSnapshots {
  orders: DistributionSlice[]
  payments: DistributionSlice[]
  disputes: DistributionSlice[]
  refunds: DistributionSlice[]
  reviews: DistributionSlice[]
  totals: {
    orders: number
    payments: number
    disputes: number
    refunds: number
    reviews: number
  }
}

export const ORDER_STATUS_LABELS: Record<string, string> = {
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

export const PAYMENT_STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  paid: 'Paid',
  failed: 'Failed',
  refunded: 'Refunded',
  partially_refunded: 'Partially refunded',
  submitted: 'Submitted for review',
  rejected: 'Payment rejected',
}

export const DISPUTE_STATUS_LABELS: Record<string, string> = {
  open: 'Open',
  under_review: 'Under review',
  resolved: 'Resolved',
  closed: 'Closed',
}

export const REFUND_STATUS_LABELS: Record<string, string> = {
  requested: 'Requested',
  approved: 'Approved',
  rejected: 'Rejected',
  completed: 'Completed',
}

const ORDER_STATUSES = Object.keys(ORDER_STATUS_LABELS)
const PAYMENT_STATUSES = Object.keys(PAYMENT_STATUS_LABELS)
const DISPUTE_STATUSES = Object.keys(DISPUTE_STATUS_LABELS)
const REFUND_STATUSES = Object.keys(REFUND_STATUS_LABELS)
const REVIEW_RATINGS = [5, 4, 3, 2, 1]

async function countByStatus(
  fetcher: (status: string) => Promise<{ total: number } | null>,
  statuses: readonly string[],
  labels: Record<string, string>,
): Promise<{ slices: DistributionSlice[]; total: number }> {
  const results = await Promise.all(
    statuses.map(async (status) => {
      const page = await fetcher(status)
      return { status, count: page?.total ?? 0 }
    }),
  )
  return {
    slices: results
      .filter((entry) => entry.count > 0)
      .map((entry) => ({ label: labels[entry.status] ?? entry.status, key: entry.status, count: entry.count })),
    total: results.reduce((sum, entry) => sum + entry.count, 0),
  }
}

export async function getAdminDistributionSnapshots(): Promise<AdminDistributionSnapshots | null> {
  try {
    const orderStatuses = await countByStatus(
      (status) => listAdminOrders({ status: status as AdminOrdersSearchState['status'], pageSize: 1 }).then((result) => (result.data == null ? null : { total: result.data.total })),
      ORDER_STATUSES,
      ORDER_STATUS_LABELS,
    )
    const paymentStatuses = await countByStatus(
      (status) => listAdminOrders({ paymentStatus: status as AdminOrdersSearchState['paymentStatus'], pageSize: 1 }).then((result) => (result.data == null ? null : { total: result.data.total })),
      PAYMENT_STATUSES,
      PAYMENT_STATUS_LABELS,
    )
    const disputes = await countByStatus(
      (status) => listAdminDisputes({ status: status as AdminDisputesSearchState['status'], pageSize: 1 }).then((result) => (result.data == null ? null : { total: result.data.total })),
      DISPUTE_STATUSES,
      DISPUTE_STATUS_LABELS,
    )
    const refunds = await countByStatus(
      (status) => listAdminRefunds({ status: status as AdminRefundsSearchState['status'], pageSize: 1 }).then((result) => (result.data == null ? null : { total: result.data.total })),
      REFUND_STATUSES,
      REFUND_STATUS_LABELS,
    )
    const ratings = await countByStatus(
      (rating) =>
        listAdminReviews({ rating: Number(rating) as AdminReviewsSearchState['rating'], status: 'approved', pageSize: 1 }).then((result) => (result.data == null ? null : { total: result.data.total })),
      REVIEW_RATINGS.map(String),
      Object.fromEntries(REVIEW_RATINGS.map((rating) => [String(rating), `${rating} stars`])),
    )

    return {
      orders: orderStatuses.slices,
      payments: paymentStatuses.slices,
      disputes: disputes.slices,
      refunds: refunds.slices,
      reviews: ratings.slices,
      totals: {
        orders: orderStatuses.total,
        payments: paymentStatuses.total,
        disputes: disputes.total,
        refunds: refunds.total,
        reviews: ratings.total,
      },
    }
  } catch {
    return null
  }
}