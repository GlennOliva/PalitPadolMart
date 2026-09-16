import { supabase } from '../../lib/supabase/client'
import {
  DEFAULT_ADMIN_SELLERS_SEARCH,
  DEFAULT_ADMIN_USERS_SEARCH,
  normalizeAdminPage,
  normalizeAdminPageSize,
  normalizeAdminSearch,
} from './admin-params'
import { runAdminList, runAdminSingle } from './admin-service-utils'
import type {
  AdminPage,
  AdminResult,
  AdminSellerActionInput,
  AdminSellerDetailRow,
  AdminSellerListRow,
  AdminSellerMutationRow,
  AdminSellersSearchState,
  AdminUserActionInput,
  AdminUserDetailRow,
  AdminUserListRow,
  AdminUserMutationRow,
  AdminUsersSearchState,
} from './admin.types'
import { trimAdminReason } from './admin-validation'

export function listAdminUsers(
  options: Partial<AdminUsersSearchState> = {},
): Promise<AdminResult<AdminPage<AdminUserListRow>>> {
  const state = { ...DEFAULT_ADMIN_USERS_SEARCH, ...options }
  const page = normalizeAdminPage(state.page)
  const pageSize = normalizeAdminPageSize(state.pageSize)
  return runAdminList<AdminUserListRow>(() => supabase.rpc('admin_list_users', {
    p_page: page,
    p_page_size: pageSize,
    p_search: normalizeAdminSearch(state.search) || undefined,
    p_role: state.role ?? undefined,
    p_account_status: state.accountStatus ?? undefined,
    p_sort: state.sort,
  }), page, pageSize)
}

export function getAdminUser(userId: string): Promise<AdminResult<AdminUserDetailRow>> {
  return runAdminSingle<AdminUserDetailRow>(() => supabase.rpc('admin_get_user', { p_user_id: userId }))
}

export function suspendUser(input: AdminUserActionInput): Promise<AdminResult<AdminUserMutationRow>> {
  return runAdminSingle<AdminUserMutationRow>(() => supabase.rpc('admin_suspend_user', {
    p_user_id: input.userId,
    p_reason: trimAdminReason(input.reason),
  }))
}

export function reactivateUser(input: AdminUserActionInput): Promise<AdminResult<AdminUserMutationRow>> {
  return runAdminSingle<AdminUserMutationRow>(() => supabase.rpc('admin_reactivate_user', {
    p_user_id: input.userId,
    p_reason: trimAdminReason(input.reason),
  }))
}

export function deactivateUser(input: AdminUserActionInput): Promise<AdminResult<AdminUserMutationRow>> {
  return runAdminSingle<AdminUserMutationRow>(() => supabase.rpc('admin_deactivate_user', {
    p_user_id: input.userId,
    p_reason: trimAdminReason(input.reason),
  }))
}

export function promoteUserToAdmin(input: AdminUserActionInput): Promise<AdminResult<AdminUserMutationRow>> {
  return runAdminSingle<AdminUserMutationRow>(() => supabase.rpc('admin_promote_user_to_admin', {
    p_user_id: input.userId,
    p_reason: trimAdminReason(input.reason),
  }))
}

export function demoteAdmin(input: AdminUserActionInput): Promise<AdminResult<AdminUserMutationRow>> {
  return runAdminSingle<AdminUserMutationRow>(() => supabase.rpc('admin_demote_admin', {
    p_user_id: input.userId,
    p_reason: trimAdminReason(input.reason),
  }))
}

export function listAdminSellers(
  options: Partial<AdminSellersSearchState> = {},
): Promise<AdminResult<AdminPage<AdminSellerListRow>>> {
  const state = { ...DEFAULT_ADMIN_SELLERS_SEARCH, ...options }
  const page = normalizeAdminPage(state.page)
  const pageSize = normalizeAdminPageSize(state.pageSize)
  return runAdminList<AdminSellerListRow>(() => supabase.rpc('admin_list_sellers', {
    p_page: page,
    p_page_size: pageSize,
    p_search: normalizeAdminSearch(state.search) || undefined,
    p_status: state.status ?? undefined,
    p_sort: state.sort,
  }), page, pageSize)
}

export function getAdminSeller(sellerId: string): Promise<AdminResult<AdminSellerDetailRow>> {
  return runAdminSingle<AdminSellerDetailRow>(() => supabase.rpc('admin_get_seller', {
    p_seller_id: sellerId,
  }))
}

function sellerMutation(
  rpc: 'admin_approve_seller' | 'admin_reject_seller' | 'admin_suspend_seller' | 'admin_reactivate_seller',
  input: AdminSellerActionInput,
): Promise<AdminResult<AdminSellerMutationRow>> {
  return runAdminSingle<AdminSellerMutationRow>(() => supabase.rpc(rpc, {
    p_seller_id: input.sellerId,
    p_reason: trimAdminReason(input.reason),
  }))
}

export function approveSeller(input: AdminSellerActionInput): Promise<AdminResult<AdminSellerMutationRow>> {
  return sellerMutation('admin_approve_seller', input)
}

export function rejectSeller(input: AdminSellerActionInput): Promise<AdminResult<AdminSellerMutationRow>> {
  return sellerMutation('admin_reject_seller', input)
}

export function suspendSeller(input: AdminSellerActionInput): Promise<AdminResult<AdminSellerMutationRow>> {
  return sellerMutation('admin_suspend_seller', input)
}

export function reactivateSeller(input: AdminSellerActionInput): Promise<AdminResult<AdminSellerMutationRow>> {
  return sellerMutation('admin_reactivate_seller', input)
}
