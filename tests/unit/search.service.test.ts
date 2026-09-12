import { describe, it, expect, beforeEach, vi } from 'vitest'
import { searchMarketplaceListings } from '../../src/features/marketplace/search.service'
import { EMPTY_SEARCH_STATE } from '../../src/features/marketplace/search-params'
import { SEARCH_PAGE_SIZE } from '../../src/features/marketplace/search-params'

const rpc = vi.fn()

vi.mock('../../src/lib/supabase/client', () => ({
  supabase: {
    rpc: (name: string, args: unknown) => rpc(name, args),
  },
}))

function listing(overrides: Record<string, unknown> = {}) {
  return {
    id: 'list-1',
    title: 'Selkirk Amped Epic',
    description: 'Great paddle',
    price: 6500,
    listing_condition: 'like_new',
    quantity: 1,
    city: null,
    province: null,
    pickup_available: true,
    delivery_available: false,
    created_at: '2026-01-01T00:00:00.000Z',
    category: { id: 'c1', name: 'Paddles', slug: 'paddles' },
    brand: { id: 'b1', name: 'Selkirk' },
    seller: { id: 's1', store_name: 'Ace Paddles' },
    images: [],
    ...overrides,
  }
}

describe('searchMarketplaceListings', () => {
  beforeEach(() => {
    rpc.mockReset()
  })

  it('calls the RPC with server-ready arguments', async () => {
    rpc.mockResolvedValue({
      data: { items: [listing()], total: 1, page: 1, pageSize: SEARCH_PAGE_SIZE },
      error: null,
    })

    const { data } = await searchMarketplaceListings({
      ...EMPTY_SEARCH_STATE,
      q: '  amped  ',
      category: 'paddles',
      brand: 'selkirk',
      condition: 'like_new',
      minPrice: 1000,
      maxPrice: 8000,
      pickup: true,
      sort: 'price_asc',
      page: 2,
    })

    expect(rpc).toHaveBeenCalledWith('marketplace_search_listings', {
      search: 'amped',
      category_slug: 'paddles',
      brand_slug: 'selkirk',
      p_listing_condition: 'like_new',
      min_price: 1000,
      max_price: 8000,
      pickup: true,
      delivery: undefined,
      sort: 'price_asc',
      page: 2,
      page_size: SEARCH_PAGE_SIZE,
    })
    expect(data).toEqual({
      items: [listing()],
      total: 1,
      page: 1,
      pageSize: SEARCH_PAGE_SIZE,
      totalPages: 1,
    })
  })

  it('sends undefined for empty filters', async () => {
    rpc.mockResolvedValue({
      data: { items: [], total: 0, page: 1, pageSize: SEARCH_PAGE_SIZE },
      error: null,
    })

    await searchMarketplaceListings(EMPTY_SEARCH_STATE)

    expect(rpc).toHaveBeenCalledWith('marketplace_search_listings', {
      search: undefined,
      category_slug: undefined,
      brand_slug: undefined,
      p_listing_condition: undefined,
      min_price: undefined,
      max_price: undefined,
      pickup: undefined,
      delivery: undefined,
      sort: 'newest',
      page: 1,
      page_size: SEARCH_PAGE_SIZE,
    })
  })

  it('derives totalPages from the server total', async () => {
    rpc.mockResolvedValue({
      data: { items: [listing()], total: 25, page: 3, pageSize: SEARCH_PAGE_SIZE },
      error: null,
    })

    const { data } = await searchMarketplaceListings(EMPTY_SEARCH_STATE)

    expect(data?.totalPages).toBe(3)
    expect(data?.page).toBe(3)
  })

  it('guards against malformed server payloads', async () => {
    rpc.mockResolvedValue({
      data: { items: 'nope', total: 'many', page: -4, pageSize: 0 },
      error: null,
    })

    const { data } = await searchMarketplaceListings(EMPTY_SEARCH_STATE)

    expect(data?.items).toEqual([])
    expect(data?.total).toBe(0)
    expect(data?.page).toBe(1)
    expect(data?.pageSize).toBe(SEARCH_PAGE_SIZE)
    expect(data?.totalPages).toBe(0)
  })

  it('treats a null payload as an empty result', async () => {
    rpc.mockResolvedValue({ data: null, error: null })

    const { data } = await searchMarketplaceListings(EMPTY_SEARCH_STATE)

    expect(data?.items).toEqual([])
    expect(data?.total).toBe(0)
  })

  it('surfaces RPC errors', async () => {
    const rpcError = { message: 'boom', details: '', hint: '', code: 'PGRST000' }
    rpc.mockResolvedValue({ data: null, error: rpcError })

    const { data, error } = await searchMarketplaceListings(EMPTY_SEARCH_STATE)

    expect(data).toBeNull()
    expect(error).toBe(rpcError)
  })
})
