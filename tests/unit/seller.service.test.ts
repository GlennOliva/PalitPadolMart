import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  createSellerApplication,
  getMySellerProfile,
  getPublicLogoUrl,
  getPublicSellerProfile,
  removeSellerLogo,
  updateMySellerProfile,
  uploadSellerLogo,
} from '../../src/features/seller/seller.service'

interface Call {
  method: string
  args: unknown[]
}

const { sellerMocks } = vi.hoisted(() => ({
  sellerMocks: {
    from: vi.fn(),
    storageFrom: vi.fn(),
    // Resolve a query chain's awaited value. Implementations are set per test.
    resolve: vi.fn(),
  },
}))

vi.mock('../../src/lib/supabase/client', () => ({
  supabase: {
    from: sellerMocks.from,
    storage: {
      from: sellerMocks.storageFrom,
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
    'in',
    'insert',
    'update',
    'maybeSingle',
    'single',
  ]) {
    query[method] = call(method)
  }
  query.getCalls = () => calls
  query.then = (resolve: (value: ResolveResult) => unknown) =>
    Promise.resolve(sellerMocks.resolve(table, calls) as ResolveResult).then(resolve)
  query.catch = (reject: (reason: unknown) => unknown) =>
    Promise.resolve(sellerMocks.resolve(table, calls) as ResolveResult).then(
      undefined,
      reject,
    )
  query.finally = (fn: () => unknown) =>
    Promise.resolve(sellerMocks.resolve(table, calls) as ResolveResult).finally(fn)
  return query
}

function resolveData(data: unknown) {
  return { data, error: null }
}

beforeEach(() => {
  vi.clearAllMocks()
  sellerMocks.from.mockImplementation((table: string) => makeQuery(table))
})

describe('seller.service', () => {
  describe('getMySellerProfile', () => {
    it('selects the caller profile by user id', async () => {
      const seller = { id: 'seller-1', user_id: 'user-1' }
      sellerMocks.resolve.mockImplementation((table: string, calls: Call[]) => {
        if (table === 'seller_profiles') {
          expect(calls).toContainEqual({ method: 'eq', args: ['user_id', 'user-1'] })
          return resolveData(seller)
        }
        return resolveData(null)
      })

      const result = await getMySellerProfile('user-1')
      expect(result.data).toEqual(seller)
      expect(result.error).toBeNull()
    })
  })

  describe('createSellerApplication', () => {
    it('sends only the user id and safe editable fields', async () => {
      let inserted: unknown = null
      sellerMocks.resolve.mockImplementation((table: string, calls: Call[]) => {
        if (table === 'seller_profiles') {
          inserted = calls.find((call) => call.method === 'insert')?.args[0]
          return resolveData({ id: 'seller-1', ...(inserted as object) })
        }
        return resolveData(null)
      })

      const result = await createSellerApplication('user-1', {
        store_name: '  Ace Paddles PH  ',
        description: '  Fresh paddles.  ',
        city: '  ',
        province: 'Cebu',
        pickup_available: true,
        delivery_available: false,
        pickup_location: '  Metro Park, Dumanjug  ',
        pickup_instructions: '  ',
      })

      expect(inserted).toEqual({
        user_id: 'user-1',
        store_name: 'Ace Paddles PH',
        description: 'Fresh paddles.',
        city: null,
        province: 'Cebu',
        pickup_available: true,
        delivery_available: false,
        pickup_location: 'Metro Park, Dumanjug',
        pickup_instructions: null,
      })
      // seller_status must never be sent by the client.
      expect(inserted as object).not.toHaveProperty('seller_status')
      expect(result.data?.id).toBe('seller-1')
      expect(result.error).toBeNull()
    })
  })

  describe('updateMySellerProfile', () => {
    it('scopes the update by user id and never touches seller_status', async () => {
      let updateArgs: unknown = null
      let eqArgs: unknown = null
      sellerMocks.resolve.mockImplementation((table: string, calls: Call[]) => {
        if (table === 'seller_profiles') {
          updateArgs = calls.find((call) => call.method === 'update')?.args[0]
          eqArgs = calls.filter((call) => call.method === 'eq').map((call) => call.args)
          return resolveData({ id: 'seller-1' })
        }
        return resolveData(null)
      })

      const result = await updateMySellerProfile('user-1', {
        store_name: 'Ace Paddles PH',
        description: '',
        city: 'Cebu City',
        province: 'Cebu',
        pickup_available: true,
        delivery_available: true,
        pickup_location: 'Metro Park, Dumanjug',
        pickup_instructions: '',
      })

      expect(updateArgs).toEqual({
        store_name: 'Ace Paddles PH',
        description: null,
        city: 'Cebu City',
        province: 'Cebu',
        pickup_available: true,
        delivery_available: true,
        pickup_location: 'Metro Park, Dumanjug',
        pickup_instructions: null,
      })
      expect(updateArgs as object).not.toHaveProperty('seller_status')
      expect(updateArgs as object).not.toHaveProperty('id')
      expect(eqArgs).toContainEqual(['user_id', 'user-1'])
      expect(result.error).toBeNull()
    })
  })

  describe('logo upload', () => {
    it('uploads to the public marketplace-products bucket under the seller path', async () => {
      const upload = vi.fn(async () => ({ data: { path: 'seller-1/logo/logo.png' }, error: null }))
      const remove = vi.fn(async () => ({ data: null, error: null }))
      const getPublicUrl = vi.fn(() => ({
        data: { publicUrl: 'https://example.com/public/seller-1/logo/logo.png' },
      }))
      sellerMocks.storageFrom.mockReturnValue({ upload, remove, getPublicUrl })
      sellerMocks.resolve.mockImplementation((table: string) =>
        table === 'seller_profiles' ? resolveData({ id: 'seller-1' }) : resolveData(null),
      )

      const file = new File([new ArrayBuffer(8)], 'logo.png', { type: 'image/png' })
      const result = await uploadSellerLogo('seller-1', 'user-1', file)

      expect(upload).toHaveBeenCalledWith(
        'seller-1/logo/logo.png',
        file,
        expect.objectContaining({ upsert: true, contentType: 'image/png' }),
      )
      expect(result.path).toBe('seller-1/logo/logo.png')
      expect(result.error).toBeNull()
    })

    it('does not update the profile when the object upload fails', async () => {
      sellerMocks.storageFrom.mockReturnValue({
        upload: vi.fn(async () => ({ data: null, error: { message: 'upload failed' } })),
      })
      const result = await uploadSellerLogo('seller-1', 'user-1', new File([], 'x.png'))

      expect(result.path).toBeNull()
      expect(result.error?.message).toBe('upload failed')
    })

    it('removes the object then clears the stored logo path', async () => {
      const remove = vi.fn(async () => ({ data: null, error: null }))
      sellerMocks.storageFrom.mockReturnValue({ remove })
      sellerMocks.resolve.mockImplementation((table: string) =>
        table === 'seller_profiles' ? resolveData({ id: 'seller-1' }) : resolveData(null),
      )

      const result = await removeSellerLogo('seller-1', 'user-1', 'seller-1/logo/logo.png')

      expect(remove).toHaveBeenCalledWith(['seller-1/logo/logo.png'])
      expect(result.error).toBeNull()
    })
  })

  describe('getPublicLogoUrl', () => {
    it('builds a public URL from the stored path', () => {
      sellerMocks.storageFrom.mockReturnValue({
        getPublicUrl: (path: string) => ({
          data: { publicUrl: `https://example.com/public/${path}` },
        }),
      })
      expect(getPublicLogoUrl('seller-1/logo/logo.png')).toBe(
        'https://example.com/public/seller-1/logo/logo.png',
      )
      expect(getPublicLogoUrl(null)).toBeNull()
    })
  })

  describe('getPublicSellerProfile', () => {
    it('returns the seller with an approved-review rating', async () => {
      sellerMocks.resolve.mockImplementation((table: string) => {
        if (table === 'public_seller_profiles') {
          return resolveData({ id: 'seller-1', store_name: 'Ace Paddles PH' })
        }
        if (table === 'reviews') return resolveData([{ rating: 5 }, { rating: 3 }])
        return resolveData(null)
      })

      const result = await getPublicSellerProfile('seller-1')

      expect(result.seller?.store_name).toBe('Ace Paddles PH')
      expect(result.rating).toBe(4)
      expect(result.reviewCount).toBe(2)
      expect(result.error).toBeNull()
    })

    it('reports not found when the seller view has no row', async () => {
      sellerMocks.resolve.mockImplementation((table: string) =>
        table === 'reviews' ? resolveData([]) : resolveData(null),
      )

      const result = await getPublicSellerProfile('seller-1')
      expect(result.seller).toBeNull()
      expect(result.rating).toBeNull()
      expect(result.error).toBeNull()
    })
  })
})
