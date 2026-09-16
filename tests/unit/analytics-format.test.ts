import { describe, it, expect } from 'vitest'
import {
  bucketLabel,
  fmtCompact,
  fmtCount,
  fmtMoney,
  fmtPercent,
  formatMetric,
  formatTrendDelta,
} from '../../src/utils/analytics-format'

describe('analytics formatters', () => {
  it('fmtCount uses en-PH grouping', () => {
    expect(fmtCount(1234567)).toBe('1,234,567')
    expect(fmtCount(0)).toBe('0')
  })

  it('fmtCompact shortens large numbers', () => {
    expect(fmtCompact(1_200_000)).toBe('1.2M')
    expect(fmtCompact(2500)).toBe('2.5k')
    expect(fmtCompact(42)).toBe('42')
  })

  it('fmtMoney renders PHP', () => {
    expect(fmtMoney(1500)).toBe('₱1,500.00')
  })

  it('fmtPercent renders one decimal', () => {
    expect(fmtPercent(12.345)).toBe('12.3%')
    expect(fmtPercent(0)).toBe('0.0%')
  })

  it('bucketLabel formats month/week/day labels', () => {
    expect(bucketLabel('2026-03-01', 'month')).toMatch(/Mar/)
    expect(bucketLabel('2026-03-05', 'week')).toMatch(/^Wk /)
    expect(bucketLabel('2026-03-05', 'day')).toMatch(/Mar 5/)
  })

  it('formatMetric dispatches by format', () => {
    expect(formatMetric('money', 100)).toBe('₱100.00')
    expect(formatMetric('percent', 50)).toBe('50.0%')
    expect(formatMetric('rating', 4.5)).toBe('4.5')
    expect(formatMetric('count', 100)).toBe('100')
  })

  it('formatTrendDelta returns null when there is no baseline', () => {
    expect(formatTrendDelta(10, null)).toBeNull()
    expect(formatTrendDelta(10, 0)).toBeNull()
  })

  it('formatTrendDelta reports up/down percentages', () => {
    expect(formatTrendDelta(15, 10)).toBe('▲ up 50%')
    expect(formatTrendDelta(5, 10)).toBe('▼ down 50%')
  })
})