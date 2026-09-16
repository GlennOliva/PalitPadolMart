import { supabase } from '../../lib/supabase/client'
import {
  DEFAULT_ADMIN_ORDERS_SEARCH,
  normalizeAdminPage,
  normalizeAdminPageSize,
  normalizeAdminSearch,
} from './admin-params'
import { runAdminList, runAdminSingle } from './admin-service-utils'
import type {
  AdminOrderDetailRow,
  AdminOrderListRow,
  AdminOrdersSearchState,
  AdminPage,
  AdminResult,
} from './admin.types'

export function listAdminOrders(
  options: Partial<AdminOrdersSearchState> = {},
): Promise<AdminResult<AdminPage<AdminOrderListRow>>> {
  const state = { ...DEFAULT_ADMIN_ORDERS_SEARCH, ...options }
  const page = normalizeAdminPage(state.page)
  const pageSize = normalizeAdminPageSize(state.pageSize)
  return runAdminList<AdminOrderListRow>(() => supabase.rpc('admin_list_orders', {
    p_page: page,
    p_page_size: pageSize,
    p_search: normalizeAdminSearch(state.search) || undefined,
    p_status: state.status ?? undefined,
    p_payment_status: state.paymentStatus ?? undefined,
    p_sort: state.sort,
  }), page, pageSize)
}

export function getAdminOrder(orderId: string): Promise<AdminResult<AdminOrderDetailRow>> {
  return runAdminSingle<AdminOrderDetailRow>(() => supabase.rpc('admin_get_order', {
    p_order_id: orderId,
  }))
}
