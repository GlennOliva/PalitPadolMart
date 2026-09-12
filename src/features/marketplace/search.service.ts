import type { PostgrestError } from '@supabase/supabase-js'
import { supabase } from '../../lib/supabase/client'
import type { PublicListing } from './marketplace.types'
import { SEARCH_PAGE_SIZE } from './search-params'
import type { MarketplaceSearchState } from './search-params'

/** The shape `marketplace_search_listings` returns (a jsonb object). */
interface MarketplaceSearchRpcResult {
  items: PublicListing[]
  total: number
  page: number
  pageSize: number
}

export interface MarketplaceSearchResult {
  items: PublicListing[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

/**
 * Runs a marketplace search through the Phase 5 RPC. Text, category/brand
 * slugs, condition, price range, availability flags, sort, and pagination are
 * all applied server-side so the client only transfers one page of results.
 * Server-side validation keeps this safe from hand-crafted URLs.
 */
export async function searchMarketplaceListings(
  state: MarketplaceSearchState,
): Promise<{ data: MarketplaceSearchResult | null; error: PostgrestError | null }> {
  const query = state.q.trim()

  const { data, error } = await supabase.rpc('marketplace_search_listings', {
    search: query === '' ? undefined : query,
    category_slug: state.category === '' ? undefined : state.category,
    brand_slug: state.brand === '' ? undefined : state.brand,
    p_listing_condition: state.condition === '' ? undefined : state.condition,
    min_price: state.minPrice ?? undefined,
    max_price: state.maxPrice ?? undefined,
    pickup: state.pickup ? true : undefined,
    delivery: state.delivery ? true : undefined,
    sort: state.sort,
    page: state.page,
    page_size: SEARCH_PAGE_SIZE,
  })

  if (error != null) return { data: null, error }

  const result = (data ?? null) as MarketplaceSearchRpcResult | null
  if (result == null) {
    return {
      data: { items: [], total: 0, page: 1, pageSize: SEARCH_PAGE_SIZE, totalPages: 0 },
      error: null,
    }
  }

  const total = Number.isFinite(result.total) ? result.total : 0
  const pageSize = Number.isFinite(result.pageSize) && result.pageSize > 0 ? result.pageSize : SEARCH_PAGE_SIZE
  const page = Number.isFinite(result.page) && result.page >= 1 ? result.page : 1
  const items = Array.isArray(result.items) ? result.items : []

  return {
    data: {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    },
    error: null,
  }
}
