import { formatCurrency, formatRating } from './format'

export function fmtCount(value: number): string {
  return new Intl.NumberFormat('en-PH').format(value)
}

export function fmtCompact(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`
  return fmtCount(value)
}

export function fmtMoney(value: number): string {
  return formatCurrency(value)
}

export function fmtPercent(value: number): string {
  return `${value.toFixed(1)}%`
}

export function bucketLabel(value: string, bucket: string): string {
  const date = new Date(`${value}T00:00:00`)
  if (bucket === 'month') {
    return date.toLocaleDateString('en-PH', { month: 'short', year: '2-digit' })
  }
  if (bucket === 'week') {
    return `Wk ${date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}`
  }
  return date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
}

export type AnalyticsFormat = 'count' | 'money' | 'percent' | 'rating'

export function formatMetric(format: AnalyticsFormat, value: number): string {
  switch (format) {
    case 'money':
      return fmtMoney(value)
    case 'percent':
      return fmtPercent(value)
    case 'rating':
      return formatRating(value)
    default:
      return fmtCount(value)
  }
}

export function formatTrendDelta(current: number, previous: number | null, invert = false): string | null {
  if (previous == null || previous === 0) return null
  const diff = current - previous
  const pct = (diff / Math.abs(previous)) * 100
  const improving = invert ? diff < 0 : diff > 0
  return `${improving ? '▲ up' : '▼ down'} ${Math.abs(pct).toFixed(0)}%`
}