import { beforeEach, describe, expect, it, vi } from 'vitest'

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }))

vi.mock('../../src/lib/supabase/client', () => ({ supabase: { rpc } }))

import {
  getAdminAnalyticsOverview,
  getAdminAnalyticsTimeSeries,
  getAdminCategoryRanking,
  getAdminTopListings,
  getAdminTopSellers,
} from '../../src/features/admin/analytics/admin-analytics.service'

function makePostgrestError(message: string, code = 'PGRST301') {
  return { message, details: '', hint: '', code, name: 'PostgrestError' }
}

const overviewRow = {
  registered_users: 10,
  active_users: 5,
  active_sellers: 2,
  total_listings: 8,
  active_listings: 6,
  sold_listings: 1,
  new_users: 3,
  new_sellers: 1,
  new_listings: 2,
  transacted_orders: 4,
  completed_orders: 3,
  cancelled_orders: 1,
  disputed_orders: 0,
  products_sold: 5,
  gross_sales: 4000,
  net_sales: 3900,
  refund_value: 100,
  avg_order_value: 1000,
  conversion_rate: 2.5,
  listing_views: 120,
  unique_viewers: 40,
  favorites_count: 25,
  inquiries_count: 18,
  approved_reviews: 6,
  avg_rating: 4.6,
  open_disputes: 1,
  resolved_disputes: 2,
  open_reports: 1,
}

const seriesRow = {
  bucket_start: '2026-01-01',
  new_users: 1,
  new_sellers: 0,
  new_listings: 1,
  new_orders: 2,
  transacted_orders: 2,
  completed_orders: 1,
  cancelled_orders: 0,
  products_sold: 3,
  gross_sales: 2500,
  net_sales: 2500,
  refund_value: 0,
  listing_views: 60,
  favorites_count: 10,
  inquiries_count: 6,
  approved_reviews: 2,
}

const categoryRow = { category_id: 'c1', category_name: 'Paddles', active_listings: 3, units_sold: 4, gross_sales: 3200, total_count: 1 }

const listingRow = {
  listing_id: 'l1',
  listing_title: 'Amped Paddle',
  listing_status: 'active' as const,
  store_name: 'Ace Paddles PH',
  category_name: 'Paddles',
  views: 40,
  favorites: 5,
  inquiries: 3,
  units_sold: 2,
  gross_sales: 1600,
  avg_rating: 4.5,
  review_count: 2,
  total_count: 1,
}

const sellerRow = {
  seller_id: 's1',
  store_name: 'Ace Paddles PH',
  seller_status: 'active' as const,
  active_listings: 3,
  units_sold: 2,
  gross_sales: 1600,
  transacted_orders: 2,
  completed_orders: 1,
  avg_rating: 4.5,
  review_count: 2,
  total_count: 1,
}

describe('admin analytics service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('loads the overview with the validated date range', async () => {
    rpc.mockResolvedValue({ data: [overviewRow], error: null })
    const result = await getAdminAnalyticsOverview('2026-01-01', '2026-01-31')
    expect(rpc).toHaveBeenCalledWith('admin_analytics_overview', { p_start_date: '2026-01-01', p_end_date: '2026-01-31' })
    expect(result.data).toEqual(overviewRow)
    expect(result.error).toBeNull()
  })

  it('maps a date-range error to friendly copy', async () => {
    rpc.mockResolvedValue({ data: null, error: makePostgrestError('INVALID_DATE_RANGE: date window cannot exceed 92 days') })
    const result = await getAdminAnalyticsOverview('2020-01-01', '2026-01-31')
    expect(result.data).toBeNull()
    expect(result.error?.code).toBe('INVALID_DATE_RANGE')
    expect(result.error?.message).toBe('Choose a valid date range.')
  })

  it('maps role violations to FORBIDDEN', async () => {
    rpc.mockResolvedValue({ data: null, error: makePostgrestError('FORBIDDEN: insufficient privileges') })
    const result = await getAdminAnalyticsOverview('2026-01-01', '2026-01-31')
    expect(result.error?.code).toBe('FORBIDDEN')
  })

  it('loads the time series with the chosen bucket', async () => {
    rpc.mockResolvedValue({ data: [seriesRow], error: null })
    const result = await getAdminAnalyticsTimeSeries('2026-01-01', '2026-01-31', 'month')
    expect(rpc).toHaveBeenCalledWith('admin_analytics_timeseries', { p_start_date: '2026-01-01', p_end_date: '2026-01-31', p_bucket: 'month' })
    expect(result.data).toEqual([seriesRow])
  })

  it('returns an empty list instead of null for an empty series', async () => {
    rpc.mockResolvedValue({ data: null, error: null })
    expect((await getAdminAnalyticsTimeSeries('2026-01-01', '2026-01-31', 'day')).data).toEqual([])
  })

  it('loads category ranking as a paginated page', async () => {
    rpc.mockResolvedValue({ data: [categoryRow], error: null })
    const result = await getAdminCategoryRanking({ start: '2026-01-01', end: '2026-01-31', sort: 'gross_sales_desc', page: 1, pageSize: 10 })
    expect(rpc).toHaveBeenCalledWith('admin_analytics_categories', { p_start_date: '2026-01-01', p_end_date: '2026-01-31', p_sort: 'gross_sales_desc', p_page: 1, p_page_size: 10 })
    expect(result.data).toEqual({ items: [{ category_id: 'c1', category_name: 'Paddles', active_listings: 3, units_sold: 4, gross_sales: 3200 }], page: 1, pageSize: 10, total: 1, totalPages: 1 })
  })

  it('loads top listings with sort and pagination', async () => {
    rpc.mockResolvedValue({ data: [listingRow], error: null })
    const result = await getAdminTopListings({ start: '2026-01-01', end: '2026-01-31', sort: 'views_desc', page: 1, pageSize: 10 })
    expect(rpc).toHaveBeenCalledWith('admin_analytics_top_listings', { p_start_date: '2026-01-01', p_end_date: '2026-01-31', p_sort: 'views_desc', p_page: 1, p_page_size: 10 })
    expect(result.data?.items[0].listing_title).toBe('Amped Paddle')
  })

  it('loads top sellers', async () => {
    rpc.mockResolvedValue({ data: [sellerRow], error: null })
    const result = await getAdminTopSellers({ start: '2026-01-01', end: '2026-01-31', sort: 'gross_sales_desc', page: 1, pageSize: 10 })
    expect(rpc).toHaveBeenCalledWith('admin_analytics_top_sellers', { p_start_date: '2026-01-01', p_end_date: '2026-01-31', p_sort: 'gross_sales_desc', p_page: 1, p_page_size: 10 })
    expect(result.data?.items[0].store_name).toBe('Ace Paddles PH')
  })

  it('returns UNKNOWN when the request throws', async () => {
    rpc.mockRejectedValue(new Error('network down'))
    const result = await getAdminTopSellers({ start: '2026-01-01', end: '2026-01-31', sort: 'gross_sales_desc', page: 1, pageSize: 10 })
    expect(result.error?.code).toBe('UNKNOWN')
  })
})