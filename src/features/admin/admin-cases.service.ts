import { supabase } from '../../lib/supabase/client'
import {
  DEFAULT_ADMIN_DISPUTES_SEARCH,
  DEFAULT_ADMIN_REFUNDS_SEARCH,
  DEFAULT_ADMIN_TIMELINE_SEARCH,
  normalizeAdminPage,
  normalizeAdminPageSize,
  normalizeAdminSearch,
} from './admin-params'
import { runAdminList, runAdminSingle } from './admin-service-utils'
import type {
  AdminDisputeActionInput,
  AdminDisputeClaimRow,
  AdminDisputeDetailRow,
  AdminDisputeEventRow,
  AdminDisputeEvidenceRow,
  AdminDisputeListRow,
  AdminDisputeMessageRow,
  AdminDisputeResolutionRow,
  AdminDisputesSearchState,
  AdminPage,
  AdminRefundDetailRow,
  AdminRefundEventRow,
  AdminRefundListRow,
  AdminRefundsSearchState,
  AdminResolveDisputeInput,
  AdminResult,
  AdminTimelineSearchState,
} from './admin.types'
import { trimAdminReason } from './admin-validation'

export function listAdminDisputes(
  options: Partial<AdminDisputesSearchState> = {},
): Promise<AdminResult<AdminPage<AdminDisputeListRow>>> {
  const state = { ...DEFAULT_ADMIN_DISPUTES_SEARCH, ...options }
  const page = normalizeAdminPage(state.page)
  const pageSize = normalizeAdminPageSize(state.pageSize)
  return runAdminList<AdminDisputeListRow>(() => supabase.rpc('admin_list_disputes', {
    p_page: page,
    p_page_size: pageSize,
    p_search: normalizeAdminSearch(state.search) || undefined,
    p_status: state.status ?? undefined,
    p_assigned_to_me: state.assignedToMe,
    p_sort: state.sort,
  }), page, pageSize)
}

export function getAdminDispute(disputeId: string): Promise<AdminResult<AdminDisputeDetailRow>> {
  return runAdminSingle<AdminDisputeDetailRow>(() => supabase.rpc('admin_get_dispute', {
    p_dispute_id: disputeId,
  }))
}

export function claimDispute(input: AdminDisputeActionInput): Promise<AdminResult<AdminDisputeClaimRow>> {
  return runAdminSingle<AdminDisputeClaimRow>(() => supabase.rpc('admin_claim_dispute', {
    p_dispute_id: input.disputeId,
    p_reason: trimAdminReason(input.reason),
  }))
}

export function resolveDispute(
  input: AdminResolveDisputeInput,
): Promise<AdminResult<AdminDisputeResolutionRow>> {
  return runAdminSingle<AdminDisputeResolutionRow>(() => supabase.rpc('admin_resolve_dispute', {
    p_dispute_id: input.disputeId,
    p_resolution: input.resolution.trim(),
    p_reason: trimAdminReason(input.reason),
  }))
}

function timelineState(options: Partial<AdminTimelineSearchState>): AdminTimelineSearchState {
  const state = { ...DEFAULT_ADMIN_TIMELINE_SEARCH, ...options }
  return {
    page: normalizeAdminPage(state.page),
    pageSize: normalizeAdminPageSize(state.pageSize),
    sort: state.sort,
  }
}

export function listAdminDisputeMessages(
  disputeId: string,
  options: Partial<AdminTimelineSearchState> = {},
): Promise<AdminResult<AdminPage<AdminDisputeMessageRow>>> {
  const state = timelineState(options)
  return runAdminList<AdminDisputeMessageRow>(() => supabase.rpc('admin_list_dispute_messages', {
    p_dispute_id: disputeId,
    p_page: state.page,
    p_page_size: state.pageSize,
    p_sort: state.sort,
  }), state.page, state.pageSize)
}

export function listAdminDisputeEvidence(
  disputeId: string,
  options: Partial<AdminTimelineSearchState> = {},
): Promise<AdminResult<AdminPage<AdminDisputeEvidenceRow>>> {
  const state = timelineState(options)
  return runAdminList<AdminDisputeEvidenceRow>(() => supabase.rpc('admin_list_dispute_evidence', {
    p_dispute_id: disputeId,
    p_page: state.page,
    p_page_size: state.pageSize,
    p_sort: state.sort,
  }), state.page, state.pageSize)
}

export function listAdminDisputeEvents(
  disputeId: string,
  options: Partial<AdminTimelineSearchState> = {},
): Promise<AdminResult<AdminPage<AdminDisputeEventRow>>> {
  const state = timelineState(options)
  return runAdminList<AdminDisputeEventRow>(() => supabase.rpc('admin_list_dispute_events', {
    p_dispute_id: disputeId,
    p_page: state.page,
    p_page_size: state.pageSize,
    p_sort: state.sort,
  }), state.page, state.pageSize)
}

export function listAdminRefunds(
  options: Partial<AdminRefundsSearchState> = {},
): Promise<AdminResult<AdminPage<AdminRefundListRow>>> {
  const state = { ...DEFAULT_ADMIN_REFUNDS_SEARCH, ...options }
  const page = normalizeAdminPage(state.page)
  const pageSize = normalizeAdminPageSize(state.pageSize)
  return runAdminList<AdminRefundListRow>(() => supabase.rpc('admin_list_refunds', {
    p_page: page,
    p_page_size: pageSize,
    p_search: normalizeAdminSearch(state.search) || undefined,
    p_status: state.status ?? undefined,
    p_sort: state.sort,
  }), page, pageSize)
}

export function getAdminRefund(refundId: string): Promise<AdminResult<AdminRefundDetailRow>> {
  return runAdminSingle<AdminRefundDetailRow>(() => supabase.rpc('admin_get_refund', {
    p_refund_id: refundId,
  }))
}

export function listAdminRefundEvents(
  refundId: string,
  options: Partial<AdminTimelineSearchState> = {},
): Promise<AdminResult<AdminPage<AdminRefundEventRow>>> {
  const state = timelineState(options)
  return runAdminList<AdminRefundEventRow>(() => supabase.rpc('admin_list_refund_events', {
    p_refund_id: refundId,
    p_page: state.page,
    p_page_size: state.pageSize,
    p_sort: state.sort,
  }), state.page, state.pageSize)
}
