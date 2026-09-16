interface BarDatum {
  label: string
  value: number
  formatted: string
}

interface AnalyticsBarChartProps {
  data: BarDatum[]
  height?: number
  ariaLabel: string
}

function formatAxis(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`
  return String(Math.trunc(value))
}

/**
 * Dependency-free, accessible vertical bar chart. Values are rendered as text
 * in the markup (never color-only signals); the surrounding list carries a
 * descriptive `aria-label`.
 */
export default function AnalyticsBarChart({ data, height = 180, ariaLabel }: AnalyticsBarChartProps) {
  const chartHeight = Math.max(120, height)
  const max = Math.max(0, ...data.map((d) => d.value))
  const baseline = max > 0 ? Math.pow(10, Math.floor(Math.log10(max))) : 1
  const niceMax = ((Math.floor(max / baseline) + 1) * baseline) || 1

  return (
    <div className="analytics-chart" aria-label={ariaLabel} role="img">
      <div className="analytics-chart__bars" style={{ height: `${chartHeight}px` }}>
        {data.map((d) => {
          const frac = niceMax > 0 ? d.value / niceMax : 0
          const barHeight = Math.max(frac > 0 ? Math.round(frac * (chartHeight - 52)) : 2, frac > 0 ? 6 : 2)
          return (
            <div className="analytics-chart__column" key={d.label}>
              <div
                className="analytics-chart__bar"
                style={{ height: `${barHeight}px` }}
                title={`${d.label}: ${d.formatted}`}
              >
                <span className="analytics-chart__bar-value">{formatAxis(d.value)}</span>
              </div>
              <span className="analytics-chart__label">{d.label}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}