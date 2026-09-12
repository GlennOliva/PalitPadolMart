import type { ActiveFilterChip } from '../../features/marketplace/search-params'

interface ActiveFilterChipsProps {
  chips: ActiveFilterChip[]
  onClear: (chip: ActiveFilterChip) => void
  onClearAll: () => void
}

/** The row of removable chips summarizing active filters. */
export default function ActiveFilterChips({ chips, onClear, onClearAll }: ActiveFilterChipsProps) {
  if (chips.length === 0) return null

  return (
    <div className="active-chips" aria-label="Active filters">
      <ul className="active-chips__list">
        {chips.map((chip) => (
          <li key={chip.id} className="active-chips__item">
            <button
              type="button"
              className="active-chip"
              aria-label={`Remove filter: ${chip.label}`}
              onClick={() => onClear(chip)}
            >
              <span className="active-chip__label">{chip.label}</span>
              <span className="active-chip__remove" aria-hidden="true">
                ×
              </span>
            </button>
          </li>
        ))}
      </ul>
      <button type="button" className="active-chips__clear-all" onClick={onClearAll}>
        Clear all
      </button>
    </div>
  )
}
