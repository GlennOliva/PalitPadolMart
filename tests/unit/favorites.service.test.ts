import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  addFavorite,
  getFavoriteListingIds,
  getMyFavorites,
  removeFavorite,
} from '../../src/features/favorites/favorites.service'

interface Call {
  method: string
  args: unknown[]
}

const { favoritesMocks } = vi.hoisted(() => ({
  favoritesMocks: {
    from: vi.fn(),
    resolve: vi.fn(),
  },
}))

vi.mock('../../src/lib/supabase/client', () => ({
  supabase: {
    from: favoritesMocks.from,
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
  for (const method of ['select', 'eq', 'order', 'insert', 'delete', 'single']) {
    query[method] = call(method)
  }
  query.getCalls = () => calls
  query.table = table
  query.then = (resolve: (value: ResolveResult) => unknown) =>
    Promise.resolve(favoritesMocks.resolve(table, calls) as ResolveResult).then(resolve)
  query.catch = (reject: (reason: unknown) => unknown) =>
    Promise.resolve(favoritesMocks.resolve(table, calls) as ResolveResult).then(
      undefined,
      reject,
    )
  query.finally = (fn: () => unknown) =>
    Promise.resolve(favoritesMocks.resolve(table, calls) as ResolveResult).finally(fn)
  return query
}

function resolveData(data: unknown) {
  return { data, error: null }
}

function resolveError(error: Record<string, unknown>) {
  return { data: null, error }
}

function queryCalls(table: string): Call[] {
  const entry = favoritesMocks.from.mock.results.find(
    (result) => (result.value as { table?: string }).table === table,
  )
  if (entry == null) return []
  const query = entry.value as unknown as { getCalls(): Call[] }
  return query.getCalls()
}

beforeEach(() => {
  vi.clearAllMocks()
  favoritesMocks.from.mockImplementation((table: string) => makeQuery(table))
})

describe('getMyFavorites', () => {
  it('returns the caller favorites with listing embeds, newest first', async () => {
    favoritesMocks.resolve.mockReturnValue(
      resolveData([
        {
          id: 'fav-1',
          listing_id: 'list-1',
          listing_title: 'Selkirk Amped Epic',
          created_at: '2026-01-02T00:00:00.000Z',
          listing: { id: 'list-1', title: 'Selkirk Amped Epic' },
        },
        {
          id: 'fav-2',
          listing_id: 'list-2',
          listing_title: 'Vatic Pro Prism',
          created_at: '2026-01-01T00:00:00.000Z',
          listing: null,
        },
      ]),
    )

    const { data, error } = await getMyFavorites('user-1')

    expect(error).toBeNull()
    expect(data).toHaveLength(2)
    expect(data?.[0].listing_title).toBe('Selkirk Amped Epic')
    expect(data?.[0].listing).not.toBeNull()
    expect(data?.[1].listing).toBeNull()

    const calls = favoritesMocks.from.mock.calls[0] as [string]
    expect(calls[0]).toBe('favorites')
  })

  it('returns an empty array when there are no favorites', async () => {
    favoritesMocks.resolve.mockReturnValue(resolveData([]))

    const { data, error } = await getMyFavorites('user-1')

    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  it('surfaces a query error', async () => {
    favoritesMocks.resolve.mockReturnValue(resolveError({ message: 'boom' }))

    const { data, error } = await getMyFavorites('user-1')

    expect(data).toEqual([])
    expect(error?.message).toBe('boom')
  })
})

describe('getFavoriteListingIds', () => {
  it('maps favorite rows to listing ids', async () => {
    favoritesMocks.resolve.mockReturnValue(
      resolveData([{ listing_id: 'a' }, { listing_id: 'b' }, { listing_id: 'c' }]),
    )

    const { data } = await getFavoriteListingIds('user-1')

    expect(data).toEqual(['a', 'b', 'c'])
  })
})

describe('addFavorite', () => {
  it('inserts the favorite scoped to the user and listing', async () => {
    favoritesMocks.resolve.mockReturnValue(resolveData(null))

    const { error } = await addFavorite('user-1', 'list-1')

    expect(error).toBeNull()
    expect(favoritesMocks.from).toHaveBeenCalledWith('favorites')
    const calls = queryCalls('favorites')
    const insertCall = calls.find((call) => call.method === 'insert')
    expect(insertCall?.args[0]).toEqual({ user_id: 'user-1', listing_id: 'list-1' })
  })

  it('treats a duplicate (unique violation) as success', async () => {
    favoritesMocks.resolve.mockReturnValue(resolveError({ code: '23505' }))

    const { error } = await addFavorite('user-1', 'list-1')

    expect(error).toBeNull()
  })

  it('surfaces other insert errors', async () => {
    favoritesMocks.resolve.mockReturnValue(resolveError({ code: 'PGRST116', message: 'nope' }))

    const { error } = await addFavorite('user-1', 'list-1')

    expect(error?.code).toBe('PGRST116')
  })
})

describe('removeFavorite', () => {
  it('deletes the favorite scoped by user and listing', async () => {
    favoritesMocks.resolve.mockReturnValue(resolveData(null))

    const { error } = await removeFavorite('user-1', 'list-1')

    expect(error).toBeNull()
    const calls = queryCalls('favorites')
    const deleteCall = calls.find((call) => call.method === 'delete')
    expect(deleteCall).toBeDefined()
    const eqCalls = calls.filter((call) => call.method === 'eq')
    expect(eqCalls.map((call) => call.args)).toEqual([['user_id', 'user-1'], ['listing_id', 'list-1']])
  })
})
