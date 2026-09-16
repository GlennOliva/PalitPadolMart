import {
  ADMIN_MAX_PAGE,
  ADMIN_MAX_PAGE_SIZE,
} from '../admin.types'

export const ANALYTICS_BUCKETS = ['day', 'week', 'month'] as const
export type AnalyticsBucket = (typeof ANALYTICS_BUCKETS)[number]
export const DEFAULT_ANALYTICS_BUCKET: AnalyticsBucket = 'month'

export const ADMIN_CATEGORY_SORTS = [
  'gross_sales_desc',
  'units_sold_desc',
  'active_listings_desc',
  'name_asc',
] as const
export type AdminCategorySort = (typeof ADMIN_CATEGORY_SORTS)[number]

export const ADMIN_TOP_LISTING_SORTS = [
  'views_desc',
  'favorites_desc',
  'inquiries_desc',
  'gross_sales_desc',
  'units_sold_desc',
  'newest',
  'title_asc',
] as const
export type AdminTopListingSort = (typeof ADMIN_TOP_LISTING_SORTS)[number]

export const ADMIN_TOP_SELLER_SORTS = [
  'gross_sales_desc',
  'units_sold_desc',
  'transacted_desc',
  'completed_desc',
  'rating_desc',
  'store_asc',
] as const
export type AdminTopSellerSort = (typeof ADMIN_TOP_SELLER_SORTS)[number]

export const SELLER_LISTING_SORTS = ADMIN_TOP_LISTING_SORTS
export type SellerListingSort = AdminTopListingSort

export const DEFAULT_ANALYTICS_PAGE_SIZE = 10

export const ANALYTICS_MAX_RANGE_DAYS = 2190
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

export function toISODate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function addDaysISO(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00`)
  date.setDate(date.getDate() + days)
  return toISODate(date)
}

export function todayISO(): string {
  return toISODate(new Date())
}

function isValidISODate(value: string | null): value is string {
  if (value == null || !DATE_PATTERN.test(value)) return false
  const date = new Date(`${value}T00:00:00`)
  return !Number.isNaN(date.getTime()) && toISODate(date) === value
}

export function normalizeAnalyticsRange(start: string, end: string): { start: string; end: string } {
  const safeStart = isValidISODate(start) ? start : todayISO()
  const safeEnd = isValidISODate(end) ? end : todayISO()
  return safeStart <= safeEnd
    ? { start: safeStart, end: safeEnd }
    : { start: safeEnd, end: safeStart }
}

export function parseInteger(value: string | null, fallback: number, min: number, max: number): number {
  if (value == null || value.trim() === '') return fallback
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback
}

export function isAllowed<TSort extends string>(value: string | null, allowed: readonly TSort[]): value is TSort {
  return value != null && (allowed as readonly string[]).includes(value)
}

export function parseAnalyticsRange(
  params: URLSearchParams,
  fallbackStart: string,
  fallbackEnd: string,
): { start: string; end: string } {
  return normalizeAnalyticsRange(params.get('start') ?? fallbackStart, params.get('end') ?? fallbackEnd)
}

export function serializeAnalyticsRange(start: string, end: string): URLSearchParams {
  const { start: safeStart, end: safeEnd } = normalizeAnalyticsRange(start, end)
  const params = new URLSearchParams()
  params.set('start', safeStart)
  params.set('end', safeEnd)
  return params
}

export function parseAnalyticsBucket(params: URLSearchParams): AnalyticsBucket {
  const value = params.get('bucket')
  return isAllowed(value, ANALYTICS_BUCKETS) ? (value as AnalyticsBucket) : DEFAULT_ANALYTICS_BUCKET
}

export function parseAnalyticsSort<TSort extends string>(
  params: URLSearchParams,
  sorts: readonly TSort[],
  fallback: TSort,
): TSort {
  const value = params.get('sort')
  return isAllowed(value, sorts) ? (value as TSort) : fallback
}

export function parseAnalyticsPage(params: URLSearchParams): number {
  return parseInteger(params.get('page'), 1, 1, ADMIN_MAX_PAGE)
}

export function parseAnalyticsPageSize(params: URLSearchParams): number {
  return parseInteger(params.get('pageSize'), DEFAULT_ANALYTICS_PAGE_SIZE, 1, ADMIN_MAX_PAGE_SIZE)
}

export interface AnalyticsListState<TSort extends string> {
  start: string
  end: string
  sort: TSort
  page: number
  pageSize: number
}

export function defaultAnalyticsListState<TSort extends string>(
  sort: TSort,
  start: string,
  end: string,
): AnalyticsListState<TSort> {
  return { start, end, sort, page: 1, pageSize: DEFAULT_ANALYTICS_PAGE_SIZE }
}

export function serializeAnalyticsPageState<TSort extends string>(
  state: AnalyticsListState<TSort>,
  defaultSort: TSort,
): URLSearchParams {
  const params = serializeAnalyticsRange(state.start, state.end)
  if (state.sort !== defaultSort) params.set('sort', state.sort)
  if (state.page > 1) params.set('page', String(state.page))
  if (state.pageSize !== DEFAULT_ANALYTICS_PAGE_SIZE) params.set('pageSize', String(state.pageSize))
  return params
}

export function parseAnalyticsTableState<TSort extends string>(
  params: URLSearchParams,
  prefix: string,
  sorts: readonly TSort[],
  fallbackSort: TSort,
): AnalyticsListState<TSort> {
  const sortRaw = params.get(`${prefix}Sort`)
  return {
    start: params.get('start') ?? '',
    end: params.get('end') ?? '',
    sort: isAllowed(sortRaw, sorts) ? (sortRaw as TSort) : fallbackSort,
    page: parseInteger(params.get(`${prefix}Page`), 1, 1, ADMIN_MAX_PAGE),
    pageSize: parseInteger(params.get(`${prefix}PageSize`), DEFAULT_ANALYTICS_PAGE_SIZE, 1, ADMIN_MAX_PAGE_SIZE),
  }
}

export function serializeAnalyticsTableState<TSort extends string>(
  state: AnalyticsListState<TSort>,
  prefix: string,
  defaultSort: TSort,
): URLSearchParams {
  const params = serializeAnalyticsRange(state.start, state.end)
  if (state.sort !== defaultSort) params.set(`${prefix}Sort`, state.sort)
  if (state.page > 1) params.set(`${prefix}Page`, String(state.page))
  if (state.pageSize !== DEFAULT_ANALYTICS_PAGE_SIZE) params.set(`${prefix}PageSize`, String(state.pageSize))
  return params
}