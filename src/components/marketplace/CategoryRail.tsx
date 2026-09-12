import type { Category } from '../../features/marketplace/marketplace.types'

interface CategoryRailProps {
  categories: Category[]
  selected: string
  onSelect: (slug: string) => void
}

/**
 * Quick-jump category pills. Selecting a pill sets the category filter;
 * selecting "All" clears it. This is the only category selector (the sidebar
 * intentionally omits category to keep one accessible control per concept).
 */
export default function CategoryRail({ categories, selected, onSelect }: CategoryRailProps) {
  const items = categories.length === 0 ? [] : [{ id: 'all', slug: '', name: 'All' }, ...categories.map((c) => ({ id: c.id, slug: c.slug, name: c.name }))]

  return (
    <nav className="category-rail" aria-label="Browse by category">
      {items.map((item) => {
        const active = item.slug === selected
        return (
          <button
            key={item.id}
            type="button"
            className={active ? 'filter-chip filter-chip--active' : 'filter-chip'}
            aria-pressed={active}
            onClick={() => onSelect(item.slug)}
          >
            {item.name}
          </button>
        )
      })}
    </nav>
  )
}
