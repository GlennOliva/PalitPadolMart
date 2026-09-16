interface RankDatum {
  label: string
  sublabel?: string
  value: string
  amount: number
}

interface AnalyticsHBarListProps {
  data: RankDatum[]
  ariaLabel: string
  emptyLabel?: string
}

/**
 * Dependency-free horizontal bar list, used by the ranking tables to make
 * value magnitudes comparable at a glance. The exact textual value is always
 * shown next to the bar, so the chart is never color/magnitude-only.
 */
export default function AnalyticsHBarList({ data, ariaLabel, emptyLabel = 'No data yet.' }: AnalyticsHBarListProps) {
  const max = Math.max(0, ...data.map((d) => d.amount))

  if (data.length === 0) {
    return <p className="analytics-hlist__empty">{emptyLabel}</p>
  }

  return (
    <ul className="analytics-hlist" aria-label={ariaLabel}>
      {data.map((d) => {
        const width = max > 0 ? Math.max(2, Math.round((d.amount / max) * 100)) : 2
        return (
          <li className="analytics-hlist__row" key={`${d.label}-${d.value}`}>
            <span className="analytics-hlist__meta">
              <strong className="analytics-hlist__label">{d.label}</strong>
              {d.sublabel != null && <span className="analytics-hlist__sublabel">{d.sublabel}</span>}
            </span>
            <span className="analytics-hlist__track" aria-hidden="true">
              <span className="analytics-hlist__fill" style={{ width: `${width}%` }} />
            </span>
            <strong className="analytics-hlist__value">{d.value}</strong>
          </li>
        )
      })}
    </ul>
  )
}