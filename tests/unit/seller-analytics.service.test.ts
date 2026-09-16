import { beforeEach, describe, expect, it, vi } from 'vitest'

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }))

vi.mock('../../src/lib/supabase/client', () => ({ supabase: { rpc } }))

import {
  getMySellerAnalyticsOverview,
  getMySellerAnalyticsTimeSeries,
  getMySellerAnalyticsListings,
} from '../../src/features/seller/analytics/seller-analytics.service'

function makePostgrestError(message: string) {
  return { message, details: '', hint: '', code: 'PGRST301', name: 'PostgrestError' }
}

const overviewRow = {
  total_listings: 5,
  active_listings: 3,
  draft_listings: 1,
  sold_listings: 1,
  new_listings: 1,
  transacted_orders: 2,
  completed_orders: 1,
  cancelled_orders: 0,
  disputed_orders: 0,
  products_sold: 3,
  gross_sales: 2400,
  net_sales: 2400,
  refund_count: 0,
  refund_value: 0,
  avg_order_value: 1200,
  listing_views: 80,
  unique_viewers: 25,
  favorites_count: 12,
  inquiries_count: 8,
  approved_reviews: 2,
  avg_rating: 4.5,
  open_disputes: 0,
  resolved_disputes: 0,
}

const seriesRow = {
  bucket_start: '2026-01-01',
  new_listings: 1,
  new_orders: 1,
  transacted_orders: 1,
  completed_orders: 1,
  cancelled_orders: 0,
  products_sold: 2,
  gross_sales: 2000,
  net_sales: 2000,
  refund_value: 0,
  listing_views: 40,
  favorites_count: 6,
  inquiries_count: 4,
  approved_reviews: 1,
}

const listingRow = {
  listing_id: 'l1',
  listing_title: 'Amped Paddle',
  listing_status: 'active' as const,
  views: 40,
  favorites: 6,
  inquiries: 4,
  units_sold: 2,
  gross_sales: 2000,
  avg_rating: 4.5,
  review_count: 1,
  total_count: 1,
}

describe('seller analytics service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('loads the overview without accepting a seller id (auth-derived)', async () => {
    rpc.mockResolvedValue({ data: [overviewRow], error: null })
    const result = await getMySellerAnalyticsOverview('2026-01-01', '2026-01-31')
    expect(rpc).toHaveBeenCalledWith('my_seller_analytics_overview', { p_start_date: '2026-01-01', p_end_date: '2026-01-31' })
    expect(result.data).toEqual(overviewRow)
    expect(result.error).toBeNull()
  })

  it('maps the date-range error to friendly, non-leaking copy', async () => {
    rpc.mockResolvedValue({ data: null, error: makePostgrestError('INVALID_DATE_RANGE: date window cannot exceed 92 days') })
    const result = await getMySellerAnalyticsOverview('2020-01-01', '2026-01-31')
    expect(result.error?.code).toBe('INVALID_DATE_RANGE')
    expect(result.error?.message).toBe('Choose a valid date range.')
    expect(result.data).toBeNull()
  })

  it('loads the time series with the requested bucket', async () => {
    rpc.mockResolvedValue({ data: [seriesRow], error: null })
    const result = await getMySellerAnalyticsTimeSeries('2026-01-01', '2026-01-31', 'week')
    expect(rpc).toHaveBeenCalledWith('my_seller_analytics_timeseries', { p_start_date: '2026-01-01', p_end_date: '2026-01-31', p_bucket: 'week' })
    expect(result.data).toEqual([seriesRow])
  })

  it('returns an empty list for a null series result', async () => {
    rpc.mockResolvedValue({ data: null, error: null })
    expect((await getMySellerAnalyticsTimeSeries('2026-01-01', '2026-01-31', 'day')).data).toEqual([])
  })

  it('loads listing performance as a paginated page', async () => {
    rpc.mockResolvedValue({ data: [listingRow], error: null })
    const result = await getMySellerAnalyticsListings({ start: '2026-01-01', end: '2026-01-31', sort: 'views_desc', page: 1, pageSize: 10 })
    expect(rpc).toHaveBeenCalledWith('my_seller_analytics_listings', { p_start_date: '2026-01-01', p_end_date: '2026-01-31', p_sort: 'views_desc', p_page: 1, p_page_size: 10 })
    expect(result.data?.items[0].listing_title).toBe('Amped Paddle')
    expect(result.data?.total).toBe(1)
  })

  it('returns UNKNOWN when the request throws', async () => {
    rpc.mockRejectedValue(new Error('network down'))
    const result = await getMySellerAnalyticsListings({ start: '2026-01-01', end: '2026-01-31', sort: 'views_desc', page: 1, pageSize: 10 })
    expect(result.error?.code).toBe('UNKNOWN')
  })
})