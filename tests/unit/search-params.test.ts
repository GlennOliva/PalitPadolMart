import { describe, it, expect } from 'vitest'
import {
  EMPTY_SEARCH_STATE,
  activeFilterCount,
  buildActiveFilterChips,
  hasActiveFilters,
  parseMarketplaceSearch,
  serializeMarketplaceSearch,
} from '../../src/features/marketplace/search-params'

const categories = [
  { id: 'c1', name: 'Paddles', slug: 'paddles' },
  { id: 'c2', name: 'Balls', slug: 'balls' },
]
const brands = [
  { id: 'b1', name: 'Selkirk', slug: 'selkirk' },
  { id: 'b2', name: 'Joola', slug: 'joola' },
]

function url(query: string): URLSearchParams {
  return new URLSearchParams(query)
}

describe('parseMarketplaceSearch', () => {
  it('returns defaults for an empty query', () => {
    expect(parseMarketplaceSearch(new URLSearchParams(''))).toEqual(EMPTY_SEARCH_STATE)
  })

  it('parses every supported filter', () => {
    const params = url(
      'q=amped&category=paddles&brand=selkirk&condition=like_new&minPrice=1000&maxPrice=5000&pickup=1&delivery=1&sort=price_asc&page=3',
    )
    expect(parseMarketplaceSearch(params)).toEqual({
      q: 'amped',
      category: 'paddles',
      brand: 'selkirk',
      condition: 'like_new',
      minPrice: 1000,
      maxPrice: 5000,
      pickup: true,
      delivery: true,
      sort: 'price_asc',
      page: 3,
    })
  })

  it('accepts true for flag params', () => {
    expect(parseMarketplaceSearch(url('pickup=true&delivery=true')).pickup).toBe(true)
    expect(parseMarketplaceSearch(url('pickup=true&delivery=true')).delivery).toBe(true)
  })

  it('falls back to defaults for malformed values', () => {
    const parsed = parseMarketplaceSearch(
      url('condition=pristine&sort=random&page=abc&page=0&minPrice=-5&maxPrice=oops'),
    )
    expect(parsed.condition).toBe('')
    expect(parsed.sort).toBe('newest')
    expect(parsed.page).toBe(1)
    expect(parsed.minPrice).toBeNull()
    expect(parsed.maxPrice).toBeNull()
  })

  it('drops an inverted price range instead of returning impossible results', () => {
    const parsed = parseMarketplaceSearch(url('minPrice=5000&maxPrice=1000'))
    expect(parsed.minPrice).toBeNull()
    expect(parsed.maxPrice).toBeNull()
  })

  it('trims the search term', () => {
    expect(parseMarketplaceSearch(url('q=%20%20hello%20%20')).q).toBe('hello')
  })
})

describe('serializeMarketplaceSearch', () => {
  it('omits defaults so the URL stays clean', () => {
    expect(serializeMarketplaceSearch(EMPTY_SEARCH_STATE).toString()).toBe('')
  })

  it('round-trips a populated state', () => {
    const state = {
      ...EMPTY_SEARCH_STATE,
      q: 'amped',
      category: 'paddles',
      brand: 'selkirk',
      condition: 'used' as const,
      minPrice: 500,
      maxPrice: 8000,
      pickup: true,
      sort: 'price_desc' as const,
      page: 2,
    }
    const roundTrip = parseMarketplaceSearch(serializeMarketplaceSearch(state))
    expect(roundTrip).toEqual(state)
  })
})

describe('hasActiveFilters / activeFilterCount', () => {
  it('reports zero for the empty state', () => {
    expect(hasActiveFilters(EMPTY_SEARCH_STATE)).toBe(false)
    expect(activeFilterCount(EMPTY_SEARCH_STATE)).toBe(0)
  })

  it('counts each distinct active filter', () => {
    const state = {
      ...EMPTY_SEARCH_STATE,
      q: 'pad',
      pickup: true,
      minPrice: 100,
    }
    expect(hasActiveFilters(state)).toBe(true)
    expect(activeFilterCount(state)).toBe(3)
  })
})

describe('buildActiveFilterChips', () => {
  it('returns no chips when nothing is filtered', () => {
    expect(buildActiveFilterChips(EMPTY_SEARCH_STATE, categories, brands)).toEqual([])
  })

  it('resolves category and brand slugs to display names', () => {
    const chips = buildActiveFilterChips(
      { ...EMPTY_SEARCH_STATE, category: 'paddles', brand: 'selkirk' },
      categories,
      brands,
    )
    expect(chips.map((chip) => chip.label)).toContain('Paddles')
    expect(chips.map((chip) => chip.label)).toContain('Selkirk')
  })

  it('falls back to the slug when reference data is missing', () => {
    const chips = buildActiveFilterChips(
      { ...EMPTY_SEARCH_STATE, category: 'ghost' },
      categories,
      brands,
    )
    expect(chips[0].label).toBe('ghost')
  })

  it('labels the search, condition, price, availability, and sort chips', () => {
    const chips = buildActiveFilterChips(
      {
        ...EMPTY_SEARCH_STATE,
        q: 'amped',
        condition: 'like_new',
        minPrice: 1000,
        pickup: true,
        sort: 'price_asc',
      },
      categories,
      brands,
    )
    expect(chips.map((chip) => chip.label)).toEqual([
      'Search: “amped”',
      'Like new',
      '≥ ₱1,000.00',
      'Pickup available',
      'Sort: Price: low to high',
    ])
  })

  it('formats an exact price band as a single chip', () => {
    const chips = buildActiveFilterChips(
      { ...EMPTY_SEARCH_STATE, minPrice: 1000, maxPrice: 5000 },
      categories,
      brands,
    )
    expect(chips.map((chip) => chip.label)).toContain('₱1,000.00 – ₱5,000.00')
  })

  it('clears the right state per chip', () => {
    const chips = buildActiveFilterChips(
      {
        ...EMPTY_SEARCH_STATE,
        category: 'paddles',
        brand: 'selkirk',
        delivery: true,
        sort: 'oldest',
      },
      categories,
      brands,
    )
    const byId = Object.fromEntries(chips.map((chip) => [chip.id, chip.clear]))
    expect(byId.category).toEqual({ category: '' })
    expect(byId.brand).toEqual({ brand: '' })
    expect(byId.delivery).toEqual({ delivery: false })
    expect(byId.sort).toEqual({ sort: 'newest' })
  })
})
