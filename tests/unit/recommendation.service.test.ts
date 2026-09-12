import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  getPaddleCandidates,
  getRecommendationProfile,
  recordRecommendationClick,
  recordRecommendationViewed,
  saveRecommendationProfile,
} from '../../src/features/recommendation/recommendation.service'
import type { RecommendationProfile } from '../../src/features/recommendation/recommendation.types'

interface Call {
  method: string
  args: unknown[]
}

const { recommendationMocks } = vi.hoisted(() => ({
  recommendationMocks: {
    from: vi.fn(),
    resolve: vi.fn(),
  },
}))

vi.mock('../../src/lib/supabase/client', () => ({
  supabase: {
    from: recommendationMocks.from,
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
  for (const method of ['select', 'eq', 'gt', 'order', 'insert', 'upsert', 'maybeSingle', 'single']) {
    query[method] = call(method)
  }
  query.getCalls = () => calls
  query.then = (resolve: (value: ResolveResult) => unknown) =>
    Promise.resolve(recommendationMocks.resolve(table, calls) as ResolveResult).then(resolve)
  query.catch = (reject: (reason: unknown) => unknown) =>
    Promise.resolve(recommendationMocks.resolve(table, calls) as ResolveResult).then(undefined, reject)
  query.finally = (fn: () => unknown) =>
    Promise.resolve(recommendationMocks.resolve(table, calls) as ResolveResult).finally(fn)
  return query
}

function resolveData(data: unknown) {
  return { data, error: null }
}

const PROFILE: RecommendationProfile = {
  skill_level: 'intermediate',
  playing_style: 'spin',
  preferred_weight_grams: 230,
  control_power_preference: 7,
  budget: 6000,
}

beforeEach(() => {
  vi.clearAllMocks()
  recommendationMocks.from.mockImplementation((table: string) => makeQuery(table))
})

describe('getPaddleCandidates', () => {
  it('only selects active, in-stock paddles, newest first', async () => {
    let listingCalls: Call[] = []
    recommendationMocks.resolve.mockImplementation((table: string, calls: Call[]) => {
      if (table === 'listings') {
        listingCalls = calls
        return resolveData([{ id: 'list-1', title: 'Pro Paddle', paddle_attributes: {} }])
      }
      return resolveData(null)
    })

    const result = await getPaddleCandidates()

    expect(listingCalls).toContainEqual({ method: 'eq', args: ['category.slug', 'paddles'] })
    expect(listingCalls).toContainEqual({ method: 'eq', args: ['listing_status', 'active'] })
    expect(listingCalls).toContainEqual({ method: 'gt', args: ['quantity', 0] })
    expect(listingCalls).toContainEqual({
      method: 'order',
      args: ['created_at', { ascending: false }],
    })
    expect(result.data[0].id).toBe('list-1')
    expect(result.error).toBeNull()
  })

  it('normalizes a null images collection', async () => {
    recommendationMocks.resolve.mockImplementation((table: string, _calls: Call[]) => {
      if (table === 'listings') {
        return resolveData([{ id: 'list-1', images: null }])
      }
      return resolveData(null)
    })

    const result = await getPaddleCandidates()
    expect(result.data[0].images).toEqual([])
  })
})

describe('getRecommendationProfile', () => {
  it('scopes to the user id and reads a single row', async () => {
    let calls: Call[] = []
    recommendationMocks.resolve.mockImplementation((table: string, recordedCalls: Call[]) => {
      if (table === 'recommendation_profiles') {
        calls = recordedCalls
        return resolveData({ user_id: 'user-1', ...PROFILE })
      }
      return resolveData(null)
    })

    const result = await getRecommendationProfile('user-1')

    expect(calls).toContainEqual({ method: 'eq', args: ['user_id', 'user-1'] })
    expect(calls).toContainEqual({ method: 'maybeSingle', args: [] })
    expect(result.data?.user_id).toBe('user-1')
  })
})

describe('saveRecommendationProfile', () => {
  it('upserts the profile on user_id conflict', async () => {
    let upsertArgs: unknown = null
    recommendationMocks.resolve.mockImplementation((table: string, calls: Call[]) => {
      if (table === 'recommendation_profiles') {
        upsertArgs = calls.find((call) => call.method === 'upsert')?.args[0]
        expect(calls.find((call) => call.method === 'upsert')?.args[1]).toEqual({
          onConflict: 'user_id',
        })
        expect(calls.some((call) => call.method === 'single')).toBe(true)
        return resolveData({ user_id: 'user-1' })
      }
      return resolveData(null)
    })

    const result = await saveRecommendationProfile('user-1', PROFILE)

    expect(upsertArgs).toEqual({ user_id: 'user-1', ...PROFILE })
    expect(result.error).toBeNull()
  })
})

describe('recommendation events', () => {
  it('records a recommendation_view with the result count', async () => {
    let inserted: unknown = null
    recommendationMocks.resolve.mockImplementation((table: string, calls: Call[]) => {
      if (table === 'recommendation_events') {
        inserted = calls.find((call) => call.method === 'insert')?.args[0]
        return resolveData(null)
      }
      return resolveData(null)
    })

    const result = await recordRecommendationViewed('user-1', 4)

    expect(inserted).toEqual({
      user_id: 'user-1',
      event_type: 'recommendation_view',
      payload: { count: 4 },
    })
    expect(result.error).toBeNull()
  })

  it('records a click with the listing id and source', async () => {
    let inserted: unknown = null
    recommendationMocks.resolve.mockImplementation((table: string, calls: Call[]) => {
      if (table === 'recommendation_events') {
        inserted = calls.find((call) => call.method === 'insert')?.args[0]
        return resolveData(null)
      }
      return resolveData(null)
    })

    const result = await recordRecommendationClick('user-1', 'list-9')

    expect(inserted).toEqual({
      user_id: 'user-1',
      event_type: 'click',
      listing_id: 'list-9',
      payload: { source: 'recommendation' },
    })
    expect(result.error).toBeNull()
  })
})
