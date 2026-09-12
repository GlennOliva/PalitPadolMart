import { formatCurrency } from '../../utils/format'
import { formatListingCondition } from './marketplace-utils'
import type { Brand, Category, ListingCondition } from './marketplace.types'

export const SEARCH_PAGE_SIZE = 12

export const MARKETPLACE_SORTS = [
  'newest',
  'oldest',
  'price_asc',
  'price_desc',
] as const
export type MarketplaceSort = (typeof MARKETPLACE_SORTS)[number]

export const LISTING_CONDITION_FILTERS: ListingCondition[] = [
  'new',
  'like_new',
  'used',
  'heavily_used',
]

export const SORT_LABELS: Record<MarketplaceSort, string> = {
  newest: 'Newest first',
  oldest: 'Oldest first',
  price_asc: 'Price: low to high',
  price_desc: 'Price: high to low',
}

/**
 * The search/discovery state of the marketplace page. Every field is
 * round-tripped through the URL search params so filters, sorting, and
 * pagination are shareable and survive reloads.
 */
export interface MarketplaceSearchState {
  q: string
  category: string
  brand: string
  condition: ListingCondition | ''
  minPrice: number | null
  maxPrice: number | null
  pickup: boolean
  delivery: boolean
  sort: MarketplaceSort
  page: number
}

export const EMPTY_SEARCH_STATE: MarketplaceSearchState = {
  q: '',
  category: '',
  brand: '',
  condition: '',
  minPrice: null,
  maxPrice: null,
  pickup: false,
  delivery: false,
  sort: 'newest',
  page: 1,
}

function toPage(value: string | null): number {
  if (value == null) return 1
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed >= 1 ? parsed : 1
}

function toPrice(value: string | null): number | null {
  if (value == null || value.trim() === '') return null
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) return null
  return parsed
}

function toCondition(value: string | null): ListingCondition | '' {
  if (value == null) return ''
  return (LISTING_CONDITION_FILTERS as readonly string[]).includes(value)
    ? (value as ListingCondition)
    : ''
}

function isSort(value: string | null): value is MarketplaceSort {
  return value != null && (MARKETPLACE_SORTS as readonly string[]).includes(value)
}

function toFlag(value: string | null): boolean {
  return value === '1' || value === 'true'
}

/**
 * Reads the marketplace filters from URL search params. Unknown or malformed
 * values fall back to defaults; an inverted price range (min > max) is treated
 * as invalid and ignored rather than returning an impossible empty result set.
 */
export function parseMarketplaceSearch(searchParams: URLSearchParams): MarketplaceSearchState {
  const minPrice = toPrice(searchParams.get('minPrice'))
  const maxPrice = toPrice(searchParams.get('maxPrice'))

  let safeMin = minPrice
  let safeMax = maxPrice
  if (safeMin != null && safeMax != null && safeMin > safeMax) {
    safeMin = null
    safeMax = null
  }

  return {
    q: searchParams.get('q')?.trim() ?? '',
    category: searchParams.get('category')?.trim() ?? '',
    brand: searchParams.get('brand')?.trim() ?? '',
    condition: toCondition(searchParams.get('condition')),
    minPrice: safeMin,
    maxPrice: safeMax,
    pickup: toFlag(searchParams.get('pickup')),
    delivery: toFlag(searchParams.get('delivery')),
    sort: isSort(searchParams.get('sort')) ? (searchParams.get('sort') as MarketplaceSort) : 'newest',
    page: toPage(searchParams.get('page')),
  }
}

/** Writes the search state back to URL search params (defaults omitted). */
export function serializeMarketplaceSearch(state: MarketplaceSearchState): URLSearchParams {
  const params = new URLSearchParams()
  if (state.q !== '') params.set('q', state.q)
  if (state.category !== '') params.set('category', state.category)
  if (state.brand !== '') params.set('brand', state.brand)
  if (state.condition !== '') params.set('condition', state.condition)
  if (state.minPrice != null) params.set('minPrice', String(state.minPrice))
  if (state.maxPrice != null) params.set('maxPrice', String(state.maxPrice))
  if (state.pickup) params.set('pickup', '1')
  if (state.delivery) params.set('delivery', '1')
  if (state.sort !== 'newest') params.set('sort', state.sort)
  if (state.page > 1) params.set('page', String(state.page))
  return params
}

export function hasActiveFilters(state: MarketplaceSearchState): boolean {
  return (
    state.q !== '' ||
    state.category !== '' ||
    state.brand !== '' ||
    state.condition !== '' ||
    state.minPrice != null ||
    state.maxPrice != null ||
    state.pickup ||
    state.delivery ||
    state.sort !== 'newest'
  )
}

export function activeFilterCount(state: MarketplaceSearchState): number {
  let count = 0
  if (state.q !== '') count += 1
  if (state.category !== '') count += 1
  if (state.brand !== '') count += 1
  if (state.condition !== '') count += 1
  if (state.minPrice != null || state.maxPrice != null) count += 1
  if (state.pickup) count += 1
  if (state.delivery) count += 1
  if (state.sort !== 'newest') count += 1
  return count
}

export interface ActiveFilterChip {
  id: string
  label: string
  /** State change applied when the chip is dismissed (page resets to page 1). */
  clear: Partial<MarketplaceSearchState>
}

function labelForLookup(
  slug: string,
  options: Array<{ slug: string; name: string }>,
  fallback: string,
): string {
  return options.find((option) => option.slug === slug)?.name ?? fallback
}

/**
 * Builds the removable filter chips for the current state. Slugs are resolved
 * to display names via the active reference data so chips read naturally.
 */
export function buildActiveFilterChips(
  state: MarketplaceSearchState,
  categories: Pick<Category, 'id' | 'name' | 'slug'>[],
  brands: Pick<Brand, 'id' | 'name' | 'slug'>[],
): ActiveFilterChip[] {
  const chips: ActiveFilterChip[] = []

  if (state.q !== '') {
    chips.push({ id: 'q', label: `Search: “${state.q}”`, clear: { q: '' } })
  }
  if (state.category !== '') {
    chips.push({
      id: 'category',
      label: labelForLookup(state.category, categories, state.category),
      clear: { category: '' },
    })
  }
  if (state.brand !== '') {
    chips.push({
      id: 'brand',
      label: labelForLookup(state.brand, brands, state.brand),
      clear: { brand: '' },
    })
  }
  if (state.condition !== '') {
    chips.push({
      id: 'condition',
      label: formatListingCondition(state.condition),
      clear: { condition: '' },
    })
  }
  if (state.minPrice != null && state.maxPrice != null) {
    chips.push({
      id: 'price',
      label: `${formatCurrency(state.minPrice)} – ${formatCurrency(state.maxPrice)}`,
      clear: { minPrice: null, maxPrice: null },
    })
  } else if (state.minPrice != null) {
    chips.push({
      id: 'price',
      label: `≥ ${formatCurrency(state.minPrice)}`,
      clear: { minPrice: null },
    })
  } else if (state.maxPrice != null) {
    chips.push({
      id: 'price',
      label: `≤ ${formatCurrency(state.maxPrice)}`,
      clear: { maxPrice: null },
    })
  }
  if (state.pickup) {
    chips.push({ id: 'pickup', label: 'Pickup available', clear: { pickup: false } })
  }
  if (state.delivery) {
    chips.push({ id: 'delivery', label: 'Delivery available', clear: { delivery: false } })
  }
  if (state.sort !== 'newest') {
    chips.push({ id: 'sort', label: `Sort: ${SORT_LABELS[state.sort]}`, clear: { sort: 'newest' } })
  }

  return chips
}
