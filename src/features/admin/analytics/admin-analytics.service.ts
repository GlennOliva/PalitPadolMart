import { supabase } from '../../../lib/supabase/client'
import type { AdminPage, AdminResult } from '../admin.types'
import { runAdminList, runAdminSingle } from '../admin-service-utils'
import { mapAdminError, unknownAdminError } from '../admin-errors'
import type { AnalyticsListState } from './admin-analytics-params'
import type {
  AdminAnalyticsOverviewRow,
  AdminAnalyticsTimeSeriesRow,
  AdminCategoryRankRow,
  AdminTopListingRow,
  AdminTopSellerRow,
} from './admin-analytics.types'

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

export function getAdminAnalyticsOverview(
  start: string,
  end: string,
): Promise<AdminResult<AdminAnalyticsOverviewRow>> {
  return runAdminSingle<AdminAnalyticsOverviewRow>(() =>
    supabase.rpc('admin_analytics_overview', { p_start_date: start, p_end_date: end }),
  )
}

export function getAdminAnalyticsTimeSeries(
  start: string,
  end: string,
  bucket: string,
): Promise<AdminResult<AdminAnalyticsTimeSeriesRow[]>> {
  return runAnalyticsRows<AdminAnalyticsTimeSeriesRow>(() =>
    supabase.rpc('admin_analytics_timeseries', { p_start_date: start, p_end_date: end, p_bucket: bucket }),
  )
}

export function getAdminCategoryRanking(
  state: AnalyticsListState<string>,
): Promise<AdminResult<AdminPage<AdminCategoryRankRow>>> {
  return runAdminList<AdminCategoryRankRow>(
    () =>
      supabase.rpc('admin_analytics_categories', {
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

export function getAdminTopListings(
  state: AnalyticsListState<string>,
): Promise<AdminResult<AdminPage<AdminTopListingRow>>> {
  return runAdminList<AdminTopListingRow>(
    () =>
      supabase.rpc('admin_analytics_top_listings', {
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

export function getAdminTopSellers(
  state: AnalyticsListState<string>,
): Promise<AdminResult<AdminPage<AdminTopSellerRow>>> {
  return runAdminList<AdminTopSellerRow>(
    () =>
      supabase.rpc('admin_analytics_top_sellers', {
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