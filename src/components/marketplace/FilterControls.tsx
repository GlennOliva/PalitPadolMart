import { useId } from 'react'
import { LISTING_CONDITION_FILTERS } from '../../features/marketplace/search-params'
import { formatListingCondition } from '../../features/marketplace/marketplace-utils'
import type { Brand, ListingCondition } from '../../features/marketplace/marketplace.types'

interface FilterControlsProps {
  brands: Brand[]
  brand: string
  onBrandChange: (slug: string) => void
  condition: ListingCondition | ''
  onConditionChange: (condition: ListingCondition | '') => void
  minPrice: number | null
  maxPrice: number | null
  onMinPriceChange: (value: string) => void
  onMaxPriceChange: (value: string) => void
  pickup: boolean
  onPickupChange: (value: boolean) => void
  delivery: boolean
  onDeliveryChange: (value: boolean) => void
}

/**
 * The filter form shared by the desktop sidebar and the mobile drawer. Each
 * control commits immediately to the shared marketplace search state.
 */
export default function FilterControls({
  brands,
  brand,
  onBrandChange,
  condition,
  onConditionChange,
  minPrice,
  maxPrice,
  onMinPriceChange,
  onMaxPriceChange,
  pickup,
  onPickupChange,
  delivery,
  onDeliveryChange,
}: FilterControlsProps) {
  const brandId = useId()
  const minPriceId = useId()
  const maxPriceId = useId()
  const conditionGroupId = useId()

  return (
    <div className="filter-controls">
      <fieldset className="filter-group">
        <legend className="filter-group__title">Condition</legend>
        <div className="filter-pills">
          <input
            type="radio"
            id={`${conditionGroupId}-any`}
            name="condition"
            className="filter-pill__input"
            checked={condition === ''}
            onChange={() => onConditionChange('')}
          />
          <label className="filter-pill" htmlFor={`${conditionGroupId}-any`}>
            Any
          </label>
          {LISTING_CONDITION_FILTERS.map((value) => (
            <span key={value}>
              <input
                type="radio"
                id={`${conditionGroupId}-${value}`}
                name="condition"
                className="filter-pill__input"
                checked={condition === value}
                onChange={() => onConditionChange(condition === value ? '' : value)}
              />
              <label className="filter-pill" htmlFor={`${conditionGroupId}-${value}`}>
                {formatListingCondition(value)}
              </label>
            </span>
          ))}
        </div>
      </fieldset>

      <div className="filter-group">
        <div className="filter-group__title" id={`${brandId}-label`}>
          Brand
        </div>
        <select
          id={brandId}
          className="form-field__input"
          aria-labelledby={`${brandId}-label`}
          value={brand}
          onChange={(event) => onBrandChange(event.target.value)}
        >
          <option value="">All brands</option>
          {brands.map((item) => (
            <option key={item.id} value={item.slug}>
              {item.name}
            </option>
          ))}
        </select>
      </div>

      <div className="filter-group">
        <div className="filter-group__title" id={`${minPriceId}-label`}>
          Price range (₱)
        </div>
        <div className="filter-price-row">
          <div className="form-field">
            <label className="visually-hidden" htmlFor={minPriceId}>
              Minimum price
            </label>
            <input
              id={minPriceId}
              className="form-field__input"
              type="number"
              inputMode="numeric"
              min={0}
              placeholder="Min"
              value={minPrice == null ? '' : String(minPrice)}
              onChange={(event) => onMinPriceChange(event.target.value)}
            />
          </div>
          <span className="filter-price-row__sep" aria-hidden="true">
            –
          </span>
          <div className="form-field">
            <label className="visually-hidden" htmlFor={maxPriceId}>
              Maximum price
            </label>
            <input
              id={maxPriceId}
              className="form-field__input"
              type="number"
              inputMode="numeric"
              min={0}
              placeholder="Max"
              value={maxPrice == null ? '' : String(maxPrice)}
              onChange={(event) => onMaxPriceChange(event.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="filter-group">
        <div className="filter-group__title">Availability</div>
        <label className="toggle-field filter-toggle">
          <input
            type="checkbox"
            className="toggle-field__input"
            checked={pickup}
            onChange={(event) => onPickupChange(event.target.checked)}
          />
          <span className="toggle-field__body">
            <span className="toggle-field__label">Pickup available</span>
          </span>
        </label>
        <label className="toggle-field filter-toggle">
          <input
            type="checkbox"
            className="toggle-field__input"
            checked={delivery}
            onChange={(event) => onDeliveryChange(event.target.checked)}
          />
          <span className="toggle-field__body">
            <span className="toggle-field__label">Delivery available</span>
          </span>
        </label>
      </div>
    </div>
  )
}
