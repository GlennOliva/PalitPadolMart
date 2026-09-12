import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  createListing,
  getActiveBrands,
  getActiveCategories,
  getPublicListing,
  getPublicListings,
  getSellerListing,
  getSellerListings,
  reorderListingImages,
  removeListingImage,
  savePaddleAttributes,
  setPrimaryListingImage,
  toNullableText,
  updateListing,
  uploadListingImage,
} from '../../src/features/marketplace/marketplace.service'

interface Call {
  method: string
  args: unknown[]
}

const { marketplaceMocks } = vi.hoisted(() => ({
  marketplaceMocks: {
    from: vi.fn(),
    storageFrom: vi.fn(),
    resolve: vi.fn(),
  },
}))

vi.mock('../../src/lib/supabase/client', () => ({
  supabase: {
    from: marketplaceMocks.from,
    storage: {
      from: marketplaceMocks.storageFrom,
    },
  },
}))

type ResolveResult = { data: unknown; error: unknown }

function makeQuery(table: string) {
  const calls: Call[] = []
  const query: Record<string, unknown> = {}
  const call = (method: string) => (...args: unknown[]) => {
    calls.push({ method, args })
    return query
  }
  for (const method of [
    'select',
    'eq',
    'gt',
    'in',
    'order',
    'insert',
    'update',
    'upsert',
    'delete',
    'maybeSingle',
    'single',
  ]) {
    query[method] = call(method)
  }
  query.getCalls = () => calls
  query.then = (resolve: (value: ResolveResult) => unknown) =>
    Promise.resolve(marketplaceMocks.resolve(table, calls) as ResolveResult).then(resolve)
  query.catch = (reject: (reason: unknown) => unknown) =>
    Promise.resolve(marketplaceMocks.resolve(table, calls) as ResolveResult).then(
      undefined,
      reject,
    )
  query.finally = (fn: () => unknown) =>
    Promise.resolve(marketplaceMocks.resolve(table, calls) as ResolveResult).finally(fn)
  return query
}

function resolveData(data: unknown) {
  return { data, error: null }
}

const EDITABLE_INPUT = {
  category_id: 'cat-1',
  brand_id: '  ',
  title: '  Selkirk Vanguard  ',
  description: '  Great paddle.  ',
  listing_condition: 'used' as const,
  price: '8500.50',
  quantity: '2',
  listing_status: 'draft' as const,
  city: '  ',
  province: 'Cebu',
  pickup_available: true,
  delivery_available: false,
}

beforeEach(() => {
  vi.clearAllMocks()
  marketplaceMocks.from.mockImplementation((table: string) => makeQuery(table))
})

describe('toNullableText', () => {
  it('collapses blank strings to null and trims the rest', () => {
    expect(toNullableText('  ')).toBeNull()
    expect(toNullableText(null)).toBeNull()
    expect(toNullableText('  Cebu  ')).toBe('Cebu')
  })
})

describe('reference data', () => {
  it('loads only active categories in sort order', async () => {
    marketplaceMocks.resolve.mockImplementation((table: string, calls: Call[]) => {
      if (table === 'categories') {
        expect(calls).toContainEqual({ method: 'eq', args: ['is_active', true] })
        expect(calls).toContainEqual({ method: 'order', args: ['sort_order'] })
        return resolveData([{ id: 'cat-1', name: 'Paddles' }])
      }
      return resolveData(null)
    })

    const result = await getActiveCategories()
    expect(result.data).toHaveLength(1)
    expect(result.error).toBeNull()
  })

  it('loads only active brands by name', async () => {
    marketplaceMocks.resolve.mockImplementation((table: string, calls: Call[]) => {
      if (table === 'brands') {
        expect(calls).toContainEqual({ method: 'order', args: ['name'] })
        return resolveData([{ id: 'brand-1', name: 'Selkirk' }])
      }
      return resolveData(null)
    })

    const result = await getActiveBrands()
    expect(result.data).toHaveLength(1)
    expect(result.error).toBeNull()
  })
})

describe('getPublicListings', () => {
  it('filters to active and in-stock listings, newest first', async () => {
    let listingCalls: Call[] = []
    marketplaceMocks.resolve.mockImplementation((table: string, calls: Call[]) => {
      if (table === 'listings') {
        listingCalls = calls
        return resolveData([{ id: 'listing-1', title: 'Paddle' }])
      }
      return resolveData(null)
    })

    const result = await getPublicListings()

    expect(listingCalls).toContainEqual({ method: 'eq', args: ['listing_status', 'active'] })
    expect(listingCalls).toContainEqual({ method: 'gt', args: ['quantity', 0] })
    expect(listingCalls).toContainEqual({
      method: 'order',
      args: ['created_at', { ascending: false }],
    })
    expect(result.data?.[0].id).toBe('listing-1')
    expect(result.error).toBeNull()
  })
})

describe('getPublicListing', () => {
  it('scopes by listing id and visibility', async () => {
    let listingCalls: Call[] = []
    marketplaceMocks.resolve.mockImplementation((table: string, calls: Call[]) => {
      if (table === 'listings') {
        listingCalls = calls
        return resolveData({ id: 'listing-1' })
      }
      return resolveData(null)
    })

    const result = await getPublicListing('listing-1')

    expect(listingCalls).toContainEqual({ method: 'eq', args: ['id', 'listing-1'] })
    expect(listingCalls).toContainEqual({ method: 'eq', args: ['listing_status', 'active'] })
    expect(listingCalls).toContainEqual({ method: 'maybeSingle', args: [] })
    expect(result.data?.id).toBe('listing-1')
  })
})

describe('createListing', () => {
  it('maps editable fields to the insert payload', async () => {
    let inserted: unknown = null
    marketplaceMocks.resolve.mockImplementation((table: string, calls: Call[]) => {
      if (table === 'listings') {
        inserted = calls.find((call) => call.method === 'insert')?.args[0]
        return resolveData({ id: 'listing-1' })
      }
      return resolveData(null)
    })

    const result = await createListing('seller-1', EDITABLE_INPUT)

    expect(inserted).toEqual({
      seller_id: 'seller-1',
      category_id: 'cat-1',
      brand_id: null,
      title: 'Selkirk Vanguard',
      description: 'Great paddle.',
      listing_condition: 'used',
      price: 8500.5,
      quantity: 2,
      listing_status: 'draft',
      city: null,
      province: 'Cebu',
      pickup_available: true,
      delivery_available: false,
    })
    expect(result.data?.id).toBe('listing-1')
    expect(result.error).toBeNull()
  })
})

describe('updateListing', () => {
  it('scopes the update by both id and seller id', async () => {
    let listingCalls: Call[] = []
    marketplaceMocks.resolve.mockImplementation((table: string, calls: Call[]) => {
      if (table === 'listings') {
        listingCalls = calls
        return resolveData({ id: 'listing-1' })
      }
      return resolveData(null)
    })

    const result = await updateListing('seller-1', 'listing-1', EDITABLE_INPUT)

    expect(listingCalls).toContainEqual({ method: 'eq', args: ['id', 'listing-1'] })
    expect(listingCalls).toContainEqual({ method: 'eq', args: ['seller_id', 'seller-1'] })
    expect(result.error).toBeNull()
  })
})

describe('savePaddleAttributes', () => {
  it('upserts on listing_id and converts empty strings to null', async () => {
    let upsertArgs: unknown = null
    marketplaceMocks.resolve.mockImplementation((table: string, calls: Call[]) => {
      if (table === 'paddle_attributes') {
        upsertArgs = calls.find((call) => call.method === 'upsert')?.args[0]
        expect(calls.find((call) => call.method === 'upsert')?.args[1]).toEqual({
          onConflict: 'listing_id',
        })
        return resolveData({ listing_id: 'listing-1' })
      }
      return resolveData(null)
    })

    const result = await savePaddleAttributes('listing-1', {
      weight_grams: '220',
      weight_class: '  Lightweight  ',
      control_score: '',
      power_score: '9',
      skill_level: 'intermediate',
      playing_style: '',
    })

    expect(upsertArgs).toEqual({
      listing_id: 'listing-1',
      weight_grams: 220,
      weight_class: 'Lightweight',
      control_score: null,
      power_score: 9,
      skill_level: 'intermediate',
      playing_style: null,
    })
    expect(result.error).toBeNull()
  })
})

describe('uploadListingImage', () => {
  const upload = vi.fn(async () => ({ data: { path: 'p' }, error: null }))
  const getPublicUrl = vi.fn((path: string) => ({
    data: { publicUrl: `https://example.com/public/${path}` },
  }))

  beforeEach(() => {
    marketplaceMocks.storageFrom.mockReturnValue({ upload, getPublicUrl })
  })

  it('makes the first image primary', async () => {
    let inserted: unknown = null
    marketplaceMocks.resolve.mockImplementation((table: string, calls: Call[]) => {
      if (table === 'listing_images' && calls.some((call) => call.method === 'insert')) {
        inserted = calls.find((call) => call.method === 'insert')?.args[0]
        return resolveData({ id: 'img-1' })
      }
      if (table === 'listing_images') return resolveData([])
      return resolveData(null)
    })

    const file = new File([new ArrayBuffer(8)], 'paddle.png', { type: 'image/png' })
    const result = await uploadListingImage('seller-1', 'listing-1', file, 'suffix')

    expect(upload).toHaveBeenCalledWith(
      'seller-1/listing-1/suffix-paddle.png',
      file,
      expect.objectContaining({ upsert: false, contentType: 'image/png' }),
    )
    expect(inserted).toMatchObject({ is_primary: true, sort_order: 0 })
    expect(result.data?.id).toBe('img-1')
  })

  it('numbers later images by the existing count', async () => {
    let inserted: unknown = null
    marketplaceMocks.resolve.mockImplementation((table: string, calls: Call[]) => {
      if (table === 'listing_images' && calls.some((call) => call.method === 'insert')) {
        inserted = calls.find((call) => call.method === 'insert')?.args[0]
        return resolveData({ id: 'img-3' })
      }
      if (table === 'listing_images') return resolveData([{ id: 'a' }, { id: 'b' }])
      return resolveData(null)
    })

    const file = new File([new ArrayBuffer(8)], 'paddle.png', { type: 'image/png' })
    const result = await uploadListingImage('seller-1', 'listing-1', file, 'suffix')

    expect(inserted).toMatchObject({ is_primary: false, sort_order: 2 })
    expect(result.error).toBeNull()
  })

  it('reports the storage error without inserting a row', async () => {
    marketplaceMocks.storageFrom.mockReturnValue({
      upload: vi.fn(async () => ({ data: null, error: { message: 'upload failed' } })),
      getPublicUrl,
    })
    let insertCalled = false
    marketplaceMocks.resolve.mockImplementation((table: string, calls: Call[]) => {
      if (table === 'listing_images' && calls.some((call) => call.method === 'insert')) {
        insertCalled = true
      }
      return resolveData(null)
    })

    const file = new File([new ArrayBuffer(8)], 'paddle.png', { type: 'image/png' })
    const result = await uploadListingImage('seller-1', 'listing-1', file, 'suffix')

    expect(insertCalled).toBe(false)
    expect(result.error?.message).toBe('upload failed')
  })
})

describe('setPrimaryListingImage', () => {
  it('clears the current primary before setting the new one', async () => {
    const updates: unknown[] = []
    marketplaceMocks.resolve.mockImplementation((_table: string, calls: Call[]) => {
      if (calls.some((call) => call.method === 'update')) {
        updates.push(calls.find((call) => call.method === 'update')?.args[0])
        return resolveData({ id: 'img-2' })
      }
      return resolveData(null)
    })

    const result = await setPrimaryListingImage('listing-1', 'img-2')

    expect(updates).toEqual([{ is_primary: false }, { is_primary: true }])
    expect(result.error).toBeNull()
  })
})

describe('removeListingImage', () => {
  const remove = vi.fn(async () => ({ data: null, error: null }))

  beforeEach(() => {
    marketplaceMocks.storageFrom.mockReturnValue({ remove })
  })

  it('deletes the object and row, then promotes a remaining image', async () => {
    const callsByBatch: Call[][] = []
    marketplaceMocks.resolve.mockImplementation((_table: string, calls: Call[]) => {
      callsByBatch.push(calls)
      if (calls.some((call) => call.method === 'delete')) return resolveData(null)
      if (calls.some((call) => call.method === 'update')) return resolveData(null)
      if (calls.some((call) => call.method === 'select')) {
        return resolveData([
          { id: 'img-2', is_primary: false },
          { id: 'img-3', is_primary: false },
        ])
      }
      return resolveData(null)
    })

    const result = await removeListingImage(
      'listing-1',
      'img-1',
      'seller-1/listing-1/x.png',
    )

    expect(remove).toHaveBeenCalledWith(['seller-1/listing-1/x.png'])
    const promoteBatch = callsByBatch.find((batch) =>
      batch.some(
        (call) =>
          call.method === 'update' &&
          (call.args[0] as { is_primary?: boolean } | undefined)?.is_primary === true,
      ),
    )
    expect(promoteBatch).toBeDefined()
    expect(promoteBatch).toContainEqual({ method: 'eq', args: ['id', 'img-2'] })
    expect(result.error).toBeNull()
  })
})

describe('reorderListingImages', () => {
  it('persists sequential sort orders for the given ids', async () => {
    const ordered: unknown[] = []
    marketplaceMocks.resolve.mockImplementation((_table: string, calls: Call[]) => {
      const update = calls.find((call) => call.method === 'update')
      if (update != null) ordered.push(update.args[0])
      return resolveData(null)
    })

    const result = await reorderListingImages('listing-1', ['c', 'a'])

    expect(ordered).toEqual([{ sort_order: 0 }, { sort_order: 1 }])
    expect(result.error).toBeNull()
  })
})

describe('nullable collection normalization', () => {
  it('returns an empty array when getPublicListings gets null data with no error', async () => {
    marketplaceMocks.resolve.mockReturnValue({ data: null, error: null })
    const result = await getPublicListings()
    expect(result.data).toEqual([])
    expect(result.error).toBeNull()
  })

  it('returns an empty array when getSellerListings gets null data with no error', async () => {
    marketplaceMocks.resolve.mockReturnValue({ data: null, error: null })
    const result = await getSellerListings('seller-1')
    expect(result.data).toEqual([])
    expect(result.error).toBeNull()
  })

  it('normalizes a null embedded images collection in public listings', async () => {
    marketplaceMocks.resolve.mockImplementation((table: string, calls: Call[]) => {
      if (table === 'listings') {
        expect(calls).toContainEqual({ method: 'eq', args: ['listing_status', 'active'] })
        return resolveData([{ id: 'listing-1', title: 'Paddle', images: null }])
      }
      return resolveData(null)
    })

    const result = await getPublicListings()
    expect(result.data?.[0].images).toEqual([])
  })

  it('normalizes a null embedded images collection in a seller listing', async () => {
    marketplaceMocks.resolve.mockImplementation((table: string, calls: Call[]) => {
      if (table === 'listings') {
        expect(calls).toContainEqual({ method: 'eq', args: ['seller_id', 'seller-1'] })
        return resolveData({ id: 'listing-1', title: 'Paddle', images: null })
      }
      return resolveData(null)
    })

    const result = await getSellerListing('seller-1', 'listing-1')
    expect(result.data?.images).toEqual([])
  })

  it('normalizes a null embedded images collection in a public listing detail', async () => {
    marketplaceMocks.resolve.mockImplementation((table: string, calls: Call[]) => {
      if (table === 'listings') {
        expect(calls).toContainEqual({ method: 'eq', args: ['listing_status', 'active'] })
        return resolveData({ id: 'listing-1', title: 'Paddle', images: null })
      }
      return resolveData(null)
    })

    const result = await getPublicListing('listing-1')
    expect(result.data?.images).toEqual([])
  })
})
