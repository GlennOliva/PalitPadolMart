import { describe, it, expect } from 'vitest'
import {
  addDaysISO,
  normalizeAnalyticsRange,
  parseAnalyticsBucket,
  parseAnalyticsPageSize,
  parseAnalyticsPage,
  parseAnalyticsSort,
  parseAnalyticsRange,
  parseAnalyticsTableState,
  serializeAnalyticsRange,
  serializeAnalyticsTableState,
  toISODate,
  todayISO,
} from '../../src/features/admin/analytics/admin-analytics-params'

describe('date helpers', () => {
  it('toISODate pads month and day', () => {
    expect(toISODate(new Date('2026-01-05T00:00:00'))).toBe('2026-01-05')
    expect(toISODate(new Date('2026-11-15T00:00:00'))).toBe('2026-11-15')
  })

  it('addDaysISO crosses month boundaries', () => {
    expect(addDaysISO('2026-01-31', 1)).toBe('2026-02-01')
    expect(addDaysISO('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('todayISO returns a valid YYYY-MM-DD', () => {
    expect(todayISO()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('normalizeAnalyticsRange', () => {
  it('returns the input when order is correct', () => {
    expect(normalizeAnalyticsRange('2026-01-01', '2026-01-31')).toEqual({ start: '2026-01-01', end: '2026-01-31' })
  })

  it('swaps when start is after end', () => {
    expect(normalizeAnalyticsRange('2026-01-31', '2026-01-01')).toEqual({ start: '2026-01-01', end: '2026-01-31' })
  })

  it('falls back to today for garbage', () => {
    const today = todayISO()
    expect(normalizeAnalyticsRange('not-a-date', today)).toEqual({ start: today, end: today })
  })
})

describe('parseAnalyticsRange / serializeAnalyticsRange', () => {
  it('round-trips a valid range', () => {
    const params = serializeAnalyticsRange('2026-02-01', '2026-02-28')
    expect(parseAnalyticsRange(params, todayISO(), todayISO())).toEqual({ start: '2026-02-01', end: '2026-02-28' })
  })

  it('falls back when param is missing', () => {
    expect(parseAnalyticsRange(new URLSearchParams(''), '2026-01-01', '2026-01-31')).toEqual({ start: '2026-01-01', end: '2026-01-31' })
  })
})

describe('parseAnalyticsBucket', () => {
  it('defaults to month', () => {
    expect(parseAnalyticsBucket(new URLSearchParams(''))).toBe('month')
  })

  it('accepts day and week', () => {
    expect(parseAnalyticsBucket(new URLSearchParams('bucket=day'))).toBe('day')
    expect(parseAnalyticsBucket(new URLSearchParams('bucket=week'))).toBe('week')
  })

  it('rejects unknown buckets', () => {
    expect(parseAnalyticsBucket(new URLSearchParams('bucket=year'))).toBe('month')
  })
})

describe('parseAnalyticsSort', () => {
  const sorts = ['views_desc', 'gross_sales_desc', 'title_asc'] as const

  it('returns an allowed value', () => {
    expect(parseAnalyticsSort(new URLSearchParams('sort=gross_sales_desc'), sorts, 'views_desc')).toBe('gross_sales_desc')
  })

  it('falls back for unknown or missing', () => {
    expect(parseAnalyticsSort(new URLSearchParams('sort=zzz'), sorts, 'views_desc')).toBe('views_desc')
    expect(parseAnalyticsSort(new URLSearchParams(''), sorts, 'views_desc')).toBe('views_desc')
  })
})

describe('page / pageSize parsing', () => {
  it('clamps pages to safe bounds', () => {
    expect(parseAnalyticsPage(new URLSearchParams('page=2'))).toBe(2)
    expect(parseAnalyticsPage(new URLSearchParams('page=0'))).toBe(1)
    expect(parseAnalyticsPage(new URLSearchParams('page=abc'))).toBe(1)
    expect(parseAnalyticsPageSize(new URLSearchParams('pageSize=20'))).toBe(20)
    expect(parseAnalyticsPageSize(new URLSearchParams('pageSize=9999'))).toBe(10)
  })
})

describe('parseAnalyticsTableState / serializeAnalyticsTableState', () => {
  const sorts = ['views_desc', 'gross_sales_desc'] as const

  it('reads prefixed table state from the URL', () => {
    const params = new URLSearchParams('start=2026-01-01&end=2026-02-01&lsSort=gross_sales_desc&lsPage=3&lsPageSize=25')
    const state = parseAnalyticsTableState(params, 'ls', sorts, 'views_desc')
    expect(state.start).toBe('2026-01-01')
    expect(state.end).toBe('2026-02-01')
    expect(state.sort).toBe('gross_sales_desc')
    expect(state.page).toBe(3)
    expect(state.pageSize).toBe(25)
  })

  it('applies fallback sort/page for missing/unknown values', () => {
    const state = parseAnalyticsTableState(new URLSearchParams(''), 'ls', sorts, 'views_desc')
    expect(state.sort).toBe('views_desc')
    expect(state.page).toBe(1)
    expect(state.pageSize).toBe(10)
  })

  it('round-trips a table state through the URL', () => {
    const state = { start: '2026-01-01', end: '2026-02-01', sort: 'gross_sales_desc' as const, page: 2, pageSize: 25 }
    const params = serializeAnalyticsTableState(state, 'ls', 'views_desc')
    expect(params.get('start')).toBe('2026-01-01')
    expect(params.get('lsSort')).toBe('gross_sales_desc')
    expect(params.get('lsPage')).toBe('2')
    expect(params.get('lsPageSize')).toBe('25')
    const reparsed = parseAnalyticsTableState(params, 'ls', sorts, 'views_desc')
    expect(reparsed).toEqual(state)
  })

  it('omits defaults when serializing', () => {
    const params = serializeAnalyticsTableState({ start: '2026-01-01', end: '2026-02-01', sort: 'views_desc', page: 1, pageSize: 10 }, 'ls', 'views_desc')
    expect(params.get('lsSort')).toBeNull()
    expect(params.get('lsPage')).toBeNull()
    expect(params.get('lsPageSize')).toBeNull()
  })

  it('ignores another table’s prefix', () => {
    const params = new URLSearchParams('spSort=gross_sales_desc&spPage=9')
    const state = parseAnalyticsTableState(params, 'ls', sorts, 'views_desc')
    expect(state.sort).toBe('views_desc')
    expect(state.page).toBe(1)
  })
})