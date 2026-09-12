import { useId } from 'react'
import { SORT_LABELS } from '../../features/marketplace/search-params'
import type { MarketplaceSort } from '../../features/marketplace/search-params'

interface SearchToolbarProps {
  query: string
  onQueryChange: (value: string) => void
  sort: MarketplaceSort
  onSortChange: (value: MarketplaceSort) => void
  activeFilterCount: number
  filtersOpen: boolean
  onOpenFilters: () => void
}

export default function SearchToolbar({
  query,
  onQueryChange,
  sort,
  onSortChange,
  activeFilterCount,
  filtersOpen,
  onOpenFilters,
}: SearchToolbarProps) {
  const sortId = useId()

  return (
    <div className="discovery-toolbar glass" role="search" aria-label="Search marketplace">
      <div className="discovery-search">
        <span className="discovery-search__icon" aria-hidden="true">
          ⌕
        </span>
        <input
          className="discovery-search__input"
          type="search"
          name="search"
          placeholder="Search paddles, brands, gear…"
          aria-label="Search listings"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
        />
        {query !== '' ? (
          <button
            type="button"
            className="discovery-search__clear"
            aria-label="Clear search"
            onClick={() => onQueryChange('')}
          >
            ×
          </button>
        ) : null}
      </div>

      <div className="discovery-toolbar__sort">
        <label className="visually-hidden" htmlFor={sortId}>
          Sort by
        </label>
        <select
          id={sortId}
          className="form-field__input discovery-toolbar__select"
          value={sort}
          onChange={(event) => onSortChange(event.target.value as MarketplaceSort)}
        >
          {Object.entries(SORT_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <button
        id="marketplace-filter-trigger"
        type="button"
        className="btn btn--ghost discovery-toolbar__filters"
        aria-controls="filter-drawer"
        aria-expanded={filtersOpen}
        onClick={onOpenFilters}
      >
        Filters
        {activeFilterCount > 0 ? (
          <span className="btn__badge" aria-hidden="true">
            {activeFilterCount}
          </span>
        ) : null}
      </button>
    </div>
  )
}
