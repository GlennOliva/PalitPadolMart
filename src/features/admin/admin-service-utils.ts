import type { PostgrestError } from '@supabase/supabase-js'
import { mapAdminError, unknownAdminError } from './admin-errors'
import { normalizeAdminPage, normalizeAdminPageSize } from './admin-params'
import type { AdminPage, AdminResult } from './admin.types'

type AdminRowsResponse<TRow> = {
  data: TRow[] | null
  error: PostgrestError | null
}

type AdminRowsOperation<TRow> = () => PromiseLike<AdminRowsResponse<TRow>>

export function normalizeAdminList<TRow extends { total_count: number }>(
  rows: TRow[] | null,
  requestedPage: number,
  requestedPageSize: number,
): AdminPage<TRow> {
  const page = normalizeAdminPage(requestedPage)
  const pageSize = normalizeAdminPageSize(requestedPageSize)
  const rawTotal = rows?.[0]?.total_count ?? 0
  const total = Number.isFinite(rawTotal) ? Math.max(0, Math.trunc(rawTotal)) : 0
  const items = (rows ?? []).map((row) => {
    const item: Partial<TRow> = { ...row }
    delete item.total_count
    return item as Omit<TRow, 'total_count'>
  })
  return {
    items,
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  }
}

export async function runAdminList<TRow extends { total_count: number }>(
  operation: AdminRowsOperation<TRow>,
  page: number,
  pageSize: number,
): Promise<AdminResult<AdminPage<TRow>>> {
  try {
    const { data, error } = await operation()
    if (error != null) return { data: null, error: mapAdminError(error) }
    return { data: normalizeAdminList(data, page, pageSize), error: null }
  } catch {
    return { data: null, error: unknownAdminError() }
  }
}

export async function runAdminSingle<TRow>(
  operation: AdminRowsOperation<TRow>,
): Promise<AdminResult<TRow>> {
  try {
    const { data, error } = await operation()
    if (error != null) return { data: null, error: mapAdminError(error) }
    return { data: data?.[0] ?? null, error: null }
  } catch {
    return { data: null, error: unknownAdminError() }
  }
}
