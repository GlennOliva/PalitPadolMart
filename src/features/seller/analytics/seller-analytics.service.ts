import { supabase } from '../../../lib/supabase/client'
import type { AdminPage, AdminResult } from '../../admin/admin.types'
import { runAdminList, runAdminSingle } from '../../admin/admin-service-utils'
import { mapAdminError, unknownAdminError } from '../../admin/admin-errors'
import type { AnalyticsListState } from '../../admin/analytics/admin-analytics-params'
import type {
  SellerAnalyticsOverviewRow,
  SellerAnalyticsTimeSeriesRow,
  SellerListingRankRow,
} from '../../admin/analytics/admin-analytics.types'

type RowsResponse<TRow> = {
  data: TRow[] | null
  error: Awaited<ReturnType<typeof supabase.rpc>>['error']
}

async function runAnalyticsRows<TRow>(
  operation: () => PromiseLike<RowsResponse<TRow>>,
): Promise<AdminResult<TRow[]>> {
  try {
    const { data, error } = await operation()
    if (error != null) return { data: null, error: mapAdminError(error) }
    return { data: data ?? [], error: null }
  } catch {
    return { data: null, error: unknownAdminError() }
  }
}

export function getMySellerAnalyticsOverview(
  start: string,
  end: string,
): Promise<AdminResult<SellerAnalyticsOverviewRow>> {
  return runAdminSingle<SellerAnalyticsOverviewRow>(() =>
    supabase.rpc('my_seller_analytics_overview', { p_start_date: start, p_end_date: end }),
  )
}

export function getMySellerAnalyticsTimeSeries(
  start: string,
  end: string,
  bucket: string,
): Promise<AdminResult<SellerAnalyticsTimeSeriesRow[]>> {
  return runAnalyticsRows<SellerAnalyticsTimeSeriesRow>(() =>
    supabase.rpc('my_seller_analytics_timeseries', { p_start_date: start, p_end_date: end, p_bucket: bucket }),
  )
}

export function getMySellerAnalyticsListings(
  state: AnalyticsListState<string>,
): Promise<AdminResult<AdminPage<SellerListingRankRow>>> {
  return runAdminList<SellerListingRankRow>(
    () =>
      supabase.rpc('my_seller_analytics_listings', {
        p_start_date: state.start,
        p_end_date: state.end,
        p_sort: state.sort,
        p_page: state.page,
        p_page_size: state.pageSize,
      }),
    state.page,
    state.pageSize,
  )
}