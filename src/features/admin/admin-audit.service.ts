import { supabase } from '../../lib/supabase/client'
import {
  DEFAULT_ADMIN_ACTIONS_SEARCH,
  normalizeAdminPage,
  normalizeAdminPageSize,
  normalizeAdminSearch,
} from './admin-params'
import { runAdminList, runAdminSingle } from './admin-service-utils'
import type {
  AdminActionDetailRow,
  AdminActionListRow,
  AdminActionsSearchState,
  AdminPage,
  AdminResult,
} from './admin.types'

export function listAdminActions(
  options: Partial<AdminActionsSearchState> = {},
): Promise<AdminResult<AdminPage<AdminActionListRow>>> {
  const state = { ...DEFAULT_ADMIN_ACTIONS_SEARCH, ...options }
  const page = normalizeAdminPage(state.page)
  const pageSize = normalizeAdminPageSize(state.pageSize)
  return runAdminList<AdminActionListRow>(() => supabase.rpc('admin_list_admin_actions', {
    p_page: page,
    p_page_size: pageSize,
    p_search: normalizeAdminSearch(state.search) || undefined,
    p_action_type: state.actionType.trim() || undefined,
    p_entity_type: state.entityType.trim() || undefined,
    p_admin_id: state.adminId ?? undefined,
    p_sort: state.sort,
  }), page, pageSize)
}

export function getAdminAction(actionId: string): Promise<AdminResult<AdminActionDetailRow>> {
  return runAdminSingle<AdminActionDetailRow>(() => supabase.rpc('admin_get_admin_action', {
    p_action_id: actionId,
  }))
}
