import type { ReactNode } from 'react'

interface FilterSidebarProps {
  children: ReactNode
  title?: string
}

/** Desktop-only filter rail (hidden below the sidebar breakpoint). */
export default function FilterSidebar({ children, title = 'Filters' }: FilterSidebarProps) {
  return (
    <aside className="filter-sidebar glass" aria-label={title}>
      <h2 className="filter-sidebar__title">{title}</h2>
      {children}
    </aside>
  )
}
