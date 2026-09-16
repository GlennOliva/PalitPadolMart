import type { Database } from '../../../types/database'

type Functions = Database['public']['Functions']

export type AdminAnalyticsOverviewRow = Functions['admin_analytics_overview']['Returns'][number]
export type AdminAnalyticsTimeSeriesRow = Functions['admin_analytics_timeseries']['Returns'][number]
export type AdminCategoryRankRow = Functions['admin_analytics_categories']['Returns'][number]
export type AdminTopListingRow = Functions['admin_analytics_top_listings']['Returns'][number]
export type AdminTopSellerRow = Functions['admin_analytics_top_sellers']['Returns'][number]

export type SellerAnalyticsOverviewRow = Functions['my_seller_analytics_overview']['Returns'][number]
export type SellerAnalyticsTimeSeriesRow = Functions['my_seller_analytics_timeseries']['Returns'][number]
export type SellerListingRankRow = Functions['my_seller_analytics_listings']['Returns'][number]