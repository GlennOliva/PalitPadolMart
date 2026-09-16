export const ADMIN_CHART_COLORS = [
  '#111111',
  '#4f46e5',
  '#0e7490',
  '#b45309',
  '#7c3aed',
  '#be123c',
  '#15803d',
  '#a21caf',
]

export function chartColorFor(index: number): string {
  return ADMIN_CHART_COLORS[index % ADMIN_CHART_COLORS.length] ?? ADMIN_CHART_COLORS[0]
}

interface AdminChartLegendItem {
  label: string
  color: string
}

export function AdminChartLegend({ items, className = '' }: { items: readonly AdminChartLegendItem[]; className?: string }) {
  if (items.length === 0) return null
  return (
    <ul className={`chart-legend ${className}`}>
      {items.map((item) => (
        <li key={item.label} className="chart-legend__item">
          <span className="chart-legend__swatch" style={{ backgroundColor: item.color }} aria-hidden="true" />
          {item.label}
        </li>
      ))}
    </ul>
  )
}