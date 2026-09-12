import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  getActiveBrands,
  getActiveCategories,
} from '../../features/marketplace/marketplace.service'
import { searchMarketplaceListings } from '../../features/marketplace/search.service'
import type { MarketplaceSearchResult } from '../../features/marketplace/search.service'
import type { Brand, Category } from '../../features/marketplace/marketplace.types'
import {
  activeFilterCount,
  buildActiveFilterChips,
  parseMarketplaceSearch,
  serializeMarketplaceSearch,
} from '../../features/marketplace/search-params'
import type { MarketplaceSearchState } from '../../features/marketplace/search-params'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'
import PageHeader from '../../components/common/PageHeader'
import Alert from '../../components/common/Alert'
import EmptyState from '../../components/common/EmptyState'
import ListingCard from '../../components/marketplace/ListingCard'
import SearchToolbar from '../../components/marketplace/SearchToolbar'
import ActiveFilterChips from '../../components/marketplace/ActiveFilterChips'
import CategoryRail from '../../components/marketplace/CategoryRail'
import FilterSidebar from '../../components/marketplace/FilterSidebar'
import FilterDrawer from '../../components/marketplace/FilterDrawer'
import FilterControls from '../../components/marketplace/FilterControls'
import Pagination from '../../components/marketplace/Pagination'
import ListingSkeleton from '../../components/marketplace/ListingSkeleton'

const CLEAR_ALL: Partial<MarketplaceSearchState> = {
  q: '',
  category: '',
  brand: '',
  condition: '',
  minPrice: null,
  maxPrice: null,
  pickup: false,
  delivery: false,
  sort: 'newest',
}

export default function MarketplacePage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const searchParamsKey = useMemo(() => searchParams.toString(), [searchParams])
  const state = useMemo(
    () => parseMarketplaceSearch(new URLSearchParams(searchParamsKey)),
    [searchParamsKey],
  )

  const [queryInput, setQueryInput] = useState(state.q)
  const debouncedQuery = useDebouncedValue(queryInput)

  // The last `q` value the input and the URL agreed on. Guards the debounced
  // writer from re-publishing a stale value after the URL changed externally
  // (chip removal, clear-all, back/forward) but the input has not yet reset.
  const ackedQuery = useRef(state.q)

  const [categories, setCategories] = useState<Category[]>([])
  const [brands, setBrands] = useState<Brand[]>([])
  const [result, setResult] = useState<MarketplaceSearchResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const closeDrawer = useCallback(() => setDrawerOpen(false), [])

  // Debounced search box → URL q param. Runs before the external-resync effect
  // below so an in-flight debounced value never overwrites a URL change that
  // came from elsewhere (the acked guard skips values already in agreement).
  useEffect(() => {
    if (debouncedQuery !== queryInput) return
    if (debouncedQuery === state.q) return
    if (debouncedQuery === ackedQuery.current) return
    ackedQuery.current = debouncedQuery
    setSearchParams(
      serializeMarketplaceSearch({ ...state, q: debouncedQuery, page: 1 }),
      { replace: true },
    )
  }, [debouncedQuery, queryInput, state, setSearchParams])

  // Keep the search box in sync when the URL changes (back/forward, chips).
  useEffect(() => {
    if (state.q === ackedQuery.current) return
    setQueryInput(state.q)
    ackedQuery.current = state.q
  }, [state.q])

  // Reference data for filters and chips.
  useEffect(() => {
    let active = true
    void Promise.all([getActiveCategories(), getActiveBrands()]).then(([categories, brands]) => {
      if (!active) return
      setCategories(categories.data ?? [])
      setBrands(brands.data ?? [])
    })
    return () => {
      active = false
    }
  }, [])

  // Search execution (one call per URL change).
  useEffect(() => {
    let active = true
    setLoading(true)
    setError(null)
    void searchMarketplaceListings(state).then(({ data, error }) => {
      if (!active) return
      if (error != null) {
        setError('We could not load the marketplace. Please try again.')
        setResult(null)
      } else {
        if (data != null && data.totalPages > 0 && state.page > data.totalPages && state.page !== 1) {
          setSearchParams(serializeMarketplaceSearch({ ...state, page: 1 }), { replace: true })
        } else {
          setResult(data)
        }
      }
      setLoading(false)
    })
    return () => {
      active = false
    }
  }, [state, setSearchParams])

  const applyPatch = (patch: Partial<MarketplaceSearchState>) => {
    setSearchParams(serializeMarketplaceSearch({ ...state, ...patch, page: 1 }))
  }

  const goToPage = (page: number) => {
    setSearchParams(serializeMarketplaceSearch({ ...state, page }))
  }

  const onPriceChange = (key: 'minPrice' | 'maxPrice') => (value: string) => {
    const trimmed = value.trim()
    if (trimmed === '') {
      applyPatch({ [key]: null })
      return
    }
    const parsed = Number(trimmed)
    if (!Number.isFinite(parsed) || parsed < 0) return
    applyPatch({ [key]: parsed })
  }

  const chips = buildActiveFilterChips(state, categories, brands)
  const filterCount = activeFilterCount(state)
  const hasActiveSearch = filterCount > 0

  return (
    <div className="container page">
      <PageHeader
        title="Marketplace"
        intro="Search, filter, and sort new and pre-loved pickleball gear from the seller community."
      />

      <SearchToolbar
        query={queryInput}
        onQueryChange={setQueryInput}
        sort={state.sort}
        onSortChange={(sort) => applyPatch({ sort })}
        activeFilterCount={filterCount}
        filtersOpen={drawerOpen}
        onOpenFilters={() => setDrawerOpen(true)}
      />

      <ActiveFilterChips chips={chips} onClear={(chip) => applyPatch(chip.clear)} onClearAll={() => applyPatch(CLEAR_ALL)} />

      <CategoryRail categories={categories} selected={state.category} onSelect={(slug) => applyPatch({ category: slug })} />

      <div className="marketplace-layout">
        <FilterSidebar>
          <FilterControls
            brands={brands}
            brand={state.brand}
            onBrandChange={(brand) => applyPatch({ brand })}
            condition={state.condition}
            onConditionChange={(condition) => applyPatch({ condition })}
            minPrice={state.minPrice}
            maxPrice={state.maxPrice}
            onMinPriceChange={onPriceChange('minPrice')}
            onMaxPriceChange={onPriceChange('maxPrice')}
            pickup={state.pickup}
            onPickupChange={(pickup) => applyPatch({ pickup })}
            delivery={state.delivery}
            onDeliveryChange={(delivery) => applyPatch({ delivery })}
          />
        </FilterSidebar>

        <div className="marketplace-results">
          {loading ? (
            <ListingSkeleton />
          ) : error != null ? (
            <Alert variant="error" message={error} />
          ) : result != null && result.items.length > 0 ? (
            <>
              <p className="search-result-count" aria-live="polite">
                {hasActiveSearch ? 'Results' : 'Showing'} {result.items.length} of {result.total}{' '}
                {result.total === 1 ? 'listing' : 'listings'}
              </p>
              <div className="listing-grid" aria-label="Marketplace listings">
                {result.items.map((listing) => (
                  <ListingCard key={listing.id} listing={listing} />
                ))}
              </div>
              <Pagination page={result.page} totalPages={result.totalPages} onPageChange={goToPage} />
            </>
          ) : (
            <EmptyState
              title={hasActiveSearch ? 'No matching listings' : 'No listings yet'}
              body={
                hasActiveSearch
                  ? 'Try a different search term, or remove a filter to see more gear.'
                  : 'There are no active listings right now. Check back soon — sellers are adding new equipment all the time.'
              }
              action={
                hasActiveSearch ? (
                  <button type="button" className="btn btn--primary" onClick={() => applyPatch(CLEAR_ALL)}>
                    Clear all filters
                  </button>
                ) : undefined
              }
            />
          )}
        </div>
      </div>

      <FilterDrawer
        open={drawerOpen}
        onClose={closeDrawer}
        onClearAll={() => applyPatch(CLEAR_ALL)}
        activeFilterCount={filterCount}
      >
        <FilterControls
          brands={brands}
          brand={state.brand}
          onBrandChange={(brand) => applyPatch({ brand })}
          condition={state.condition}
          onConditionChange={(condition) => applyPatch({ condition })}
          minPrice={state.minPrice}
          maxPrice={state.maxPrice}
          onMinPriceChange={onPriceChange('minPrice')}
          onMaxPriceChange={onPriceChange('maxPrice')}
          pickup={state.pickup}
          onPickupChange={(pickup) => applyPatch({ pickup })}
          delivery={state.delivery}
          onDeliveryChange={(delivery) => applyPatch({ delivery })}
        />
      </FilterDrawer>
    </div>
  )
}
