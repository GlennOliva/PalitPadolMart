import { Constants } from '../../types/database'
import type {
  AdminActionsSearchState,
  AdminBrandSort,
  AdminBrandsSearchState,
  AdminCategoriesSearchState,
  AdminCategorySort,
  AdminChronologicalSort,
  AdminDisputesSearchState,
  AdminListingSort,
  AdminListingsSearchState,
  AdminOrderSort,
  AdminOrdersSearchState,
  AdminRefundSort,
  AdminRefundsSearchState,
  AdminReportsSearchState,
  AdminReviewSort,
  AdminReviewsSearchState,
  AdminSearchState,
  AdminSellerSort,
  AdminSellersSearchState,
  AdminTimelineSearchState,
  AdminUserSort,
  AdminUsersSearchState,
} from './admin.types'
import {
  ADMIN_DEFAULT_PAGE_SIZE,
  ADMIN_MAX_PAGE,
  ADMIN_MAX_PAGE_SIZE,
  ADMIN_MAX_SEARCH_LENGTH,
} from './admin.types'

export const ADMIN_USER_SORTS = ['newest', 'oldest', 'name_asc', 'name_desc', 'last_sign_in'] as const
export const ADMIN_SELLER_SORTS = ['newest', 'oldest', 'store_asc', 'store_desc'] as const
export const ADMIN_LISTING_SORTS = ['newest', 'oldest', 'price_asc', 'price_desc', 'title_asc'] as const
export const ADMIN_CHRONOLOGICAL_SORTS = ['newest', 'oldest'] as const
export const ADMIN_REVIEW_SORTS = ['newest', 'oldest', 'rating_asc', 'rating_desc'] as const
export const ADMIN_ORDER_SORTS = ['newest', 'oldest', 'total_asc', 'total_desc'] as const
export const ADMIN_REFUND_SORTS = ['newest', 'oldest', 'amount_asc', 'amount_desc'] as const
export const ADMIN_CATEGORY_SORTS = ['sort_order', 'name_asc', 'name_desc', 'newest'] as const
export const ADMIN_BRAND_SORTS = ['name_asc', 'name_desc', 'newest', 'oldest'] as const

export const DEFAULT_ADMIN_USERS_SEARCH: AdminUsersSearchState = {
  search: '', page: 1, pageSize: ADMIN_DEFAULT_PAGE_SIZE, sort: 'newest', role: null, accountStatus: null,
}
export const DEFAULT_ADMIN_SELLERS_SEARCH: AdminSellersSearchState = {
  search: '', page: 1, pageSize: ADMIN_DEFAULT_PAGE_SIZE, sort: 'newest', status: null,
}
export const DEFAULT_ADMIN_LISTINGS_SEARCH: AdminListingsSearchState = {
  search: '', page: 1, pageSize: ADMIN_DEFAULT_PAGE_SIZE, sort: 'newest', status: null, sellerId: null,
}
export const DEFAULT_ADMIN_REPORTS_SEARCH: AdminReportsSearchState = {
  search: '', page: 1, pageSize: ADMIN_DEFAULT_PAGE_SIZE, sort: 'oldest', status: null,
}
export const DEFAULT_ADMIN_REVIEWS_SEARCH: AdminReviewsSearchState = {
  search: '', page: 1, pageSize: ADMIN_DEFAULT_PAGE_SIZE, sort: 'newest', status: null, rating: null,
}
export const DEFAULT_ADMIN_ORDERS_SEARCH: AdminOrdersSearchState = {
  search: '', page: 1, pageSize: ADMIN_DEFAULT_PAGE_SIZE, sort: 'newest', status: null, paymentStatus: null,
}
export const DEFAULT_ADMIN_DISPUTES_SEARCH: AdminDisputesSearchState = {
  search: '', page: 1, pageSize: ADMIN_DEFAULT_PAGE_SIZE, sort: 'oldest', status: null, assignedToMe: false,
}
export const DEFAULT_ADMIN_REFUNDS_SEARCH: AdminRefundsSearchState = {
  search: '', page: 1, pageSize: ADMIN_DEFAULT_PAGE_SIZE, sort: 'newest', status: null,
}
export const DEFAULT_ADMIN_CATEGORIES_SEARCH: AdminCategoriesSearchState = {
  search: '', page: 1, pageSize: ADMIN_DEFAULT_PAGE_SIZE, sort: 'sort_order', isActive: null,
}
export const DEFAULT_ADMIN_BRANDS_SEARCH: AdminBrandsSearchState = {
  search: '', page: 1, pageSize: ADMIN_DEFAULT_PAGE_SIZE, sort: 'name_asc', isActive: null,
}
export const DEFAULT_ADMIN_ACTIONS_SEARCH: AdminActionsSearchState = {
  search: '', page: 1, pageSize: ADMIN_DEFAULT_PAGE_SIZE, sort: 'newest',
  actionType: '', entityType: '', adminId: null,
}
export const DEFAULT_ADMIN_TIMELINE_SEARCH: AdminTimelineSearchState = {
  page: 1, pageSize: ADMIN_DEFAULT_PAGE_SIZE, sort: 'oldest',
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const ACTION_FILTER_PATTERN = /^[a-z][a-z0-9_]*$/

function parseInteger(value: string | null, fallback: number, min: number, max: number): number {
  if (value == null || value.trim() === '') return fallback
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback
}

function isAllowed<T extends string>(value: string | null, allowed: readonly T[]): value is T {
  return value != null && (allowed as readonly string[]).includes(value)
}

function parseEnum<T extends string>(value: string | null, allowed: readonly T[]): T | null {
  return isAllowed(value, allowed) ? value : null
}

function parseOptionalUuid(value: string | null): string | null {
  const normalized = value?.trim() ?? ''
  return UUID_PATTERN.test(normalized) ? normalized : null
}

function parseActionFilter(value: string | null): string {
  const normalized = value?.trim() ?? ''
  return normalized.length <= 80 && ACTION_FILTER_PATTERN.test(normalized) ? normalized : ''
}

function parseTriState(value: string | null): boolean | null {
  if (value === '1' || value === 'true') return true
  if (value === '0' || value === 'false') return false
  return null
}

export function normalizeAdminPage(value: number | undefined): number {
  return Number.isSafeInteger(value) && value != null
    ? Math.min(Math.max(value, 1), ADMIN_MAX_PAGE)
    : 1
}

export function normalizeAdminPageSize(value: number | undefined): number {
  return Number.isSafeInteger(value) && value != null
    ? Math.min(Math.max(value, 1), ADMIN_MAX_PAGE_SIZE)
    : ADMIN_DEFAULT_PAGE_SIZE
}

export function normalizeAdminSearch(value: string | undefined): string {
  return (value ?? '').trim().slice(0, ADMIN_MAX_SEARCH_LENGTH)
}

export function parseAdminSearch<TSort extends string>(
  params: URLSearchParams,
  sorts: readonly TSort[],
  defaultSort: TSort,
): AdminSearchState<TSort> {
  const sort = params.get('sort')
  return {
    search: normalizeAdminSearch(params.get('q') ?? ''),
    page: parseInteger(params.get('page'), 1, 1, ADMIN_MAX_PAGE),
    pageSize: parseInteger(params.get('pageSize'), ADMIN_DEFAULT_PAGE_SIZE, 1, ADMIN_MAX_PAGE_SIZE),
    sort: isAllowed(sort, sorts) ? sort : defaultSort,
  }
}

export function serializeAdminSearch<TSort extends string>(
  state: AdminSearchState<TSort>,
  defaultSort: TSort,
): URLSearchParams {
  const params = new URLSearchParams()
  const search = normalizeAdminSearch(state.search)
  const page = normalizeAdminPage(state.page)
  const pageSize = normalizeAdminPageSize(state.pageSize)
  if (search !== '') params.set('q', search)
  if (state.sort !== defaultSort) params.set('sort', state.sort)
  if (page > 1) params.set('page', String(page))
  if (pageSize !== ADMIN_DEFAULT_PAGE_SIZE) params.set('pageSize', String(pageSize))
  return params
}

function parseTimeline(params: URLSearchParams): AdminTimelineSearchState {
  const base = parseAdminSearch(params, ADMIN_CHRONOLOGICAL_SORTS, 'oldest')
  return { page: base.page, pageSize: base.pageSize, sort: base.sort }
}

function serializeTimeline(state: AdminTimelineSearchState): URLSearchParams {
  return serializeAdminSearch({ ...state, search: '' }, 'oldest')
}

export function parseAdminUsersSearch(params: URLSearchParams): AdminUsersSearchState {
  return {
    ...parseAdminSearch(params, ADMIN_USER_SORTS, 'newest'),
    role: parseEnum(params.get('role'), Constants.public.Enums.user_role),
    accountStatus: parseEnum(params.get('account'), Constants.public.Enums.account_status),
  }
}

export function serializeAdminUsersSearch(state: AdminUsersSearchState): URLSearchParams {
  const params = serializeAdminSearch(state, 'newest')
  if (state.role != null) params.set('role', state.role)
  if (state.accountStatus != null) params.set('account', state.accountStatus)
  return params
}

export function parseAdminSellersSearch(params: URLSearchParams): AdminSellersSearchState {
  return {
    ...parseAdminSearch(params, ADMIN_SELLER_SORTS, 'newest'),
    status: parseEnum(params.get('status'), Constants.public.Enums.seller_status),
  }
}

export function serializeAdminSellersSearch(state: AdminSellersSearchState): URLSearchParams {
  const params = serializeAdminSearch(state, 'newest')
  if (state.status != null) params.set('status', state.status)
  return params
}

export function parseAdminListingsSearch(params: URLSearchParams): AdminListingsSearchState {
  return {
    ...parseAdminSearch(params, ADMIN_LISTING_SORTS, 'newest'),
    status: parseEnum(params.get('status'), Constants.public.Enums.listing_status),
    sellerId: parseOptionalUuid(params.get('seller')),
  }
}

export function serializeAdminListingsSearch(state: AdminListingsSearchState): URLSearchParams {
  const params = serializeAdminSearch(state, 'newest')
  if (state.status != null) params.set('status', state.status)
  if (state.sellerId != null && parseOptionalUuid(state.sellerId) != null) params.set('seller', state.sellerId)
  return params
}

export function parseAdminReportsSearch(params: URLSearchParams): AdminReportsSearchState {
  return {
    ...parseAdminSearch(params, ADMIN_CHRONOLOGICAL_SORTS, 'oldest'),
    status: parseEnum(params.get('status'), Constants.public.Enums.report_status),
  }
}

export function serializeAdminReportsSearch(state: AdminReportsSearchState): URLSearchParams {
  const params = serializeAdminSearch(state, 'oldest')
  if (state.status != null) params.set('status', state.status)
  return params
}

export function parseAdminReviewsSearch(params: URLSearchParams): AdminReviewsSearchState {
  const rating = parseInteger(params.get('rating'), 0, 1, 5)
  return {
    ...parseAdminSearch(params, ADMIN_REVIEW_SORTS, 'newest'),
    status: parseEnum(params.get('status'), Constants.public.Enums.review_status),
    rating: rating === 0 ? null : rating,
  }
}

export function serializeAdminReviewsSearch(state: AdminReviewsSearchState): URLSearchParams {
  const params = serializeAdminSearch(state, 'newest')
  if (state.status != null) params.set('status', state.status)
  if (state.rating != null && Number.isInteger(state.rating) && state.rating >= 1 && state.rating <= 5) {
    params.set('rating', String(state.rating))
  }
  return params
}

export function parseAdminOrdersSearch(params: URLSearchParams): AdminOrdersSearchState {
  return {
    ...parseAdminSearch(params, ADMIN_ORDER_SORTS, 'newest'),
    status: parseEnum(params.get('status'), Constants.public.Enums.order_status),
    paymentStatus: parseEnum(params.get('payment'), Constants.public.Enums.payment_status),
  }
}

export function serializeAdminOrdersSearch(state: AdminOrdersSearchState): URLSearchParams {
  const params = serializeAdminSearch(state, 'newest')
  if (state.status != null) params.set('status', state.status)
  if (state.paymentStatus != null) params.set('payment', state.paymentStatus)
  return params
}

export function parseAdminDisputesSearch(params: URLSearchParams): AdminDisputesSearchState {
  return {
    ...parseAdminSearch(params, ADMIN_CHRONOLOGICAL_SORTS, 'oldest'),
    status: parseEnum(params.get('status'), Constants.public.Enums.dispute_status),
    assignedToMe: parseTriState(params.get('assigned')) === true,
  }
}

export function serializeAdminDisputesSearch(state: AdminDisputesSearchState): URLSearchParams {
  const params = serializeAdminSearch(state, 'oldest')
  if (state.status != null) params.set('status', state.status)
  if (state.assignedToMe) params.set('assigned', '1')
  return params
}

export function parseAdminRefundsSearch(params: URLSearchParams): AdminRefundsSearchState {
  return {
    ...parseAdminSearch(params, ADMIN_REFUND_SORTS, 'newest'),
    status: parseEnum(params.get('status'), Constants.public.Enums.refund_status),
  }
}

export function serializeAdminRefundsSearch(state: AdminRefundsSearchState): URLSearchParams {
  const params = serializeAdminSearch(state, 'newest')
  if (state.status != null) params.set('status', state.status)
  return params
}

export function parseAdminCategoriesSearch(params: URLSearchParams): AdminCategoriesSearchState {
  return {
    ...parseAdminSearch(params, ADMIN_CATEGORY_SORTS, 'sort_order'),
    isActive: parseTriState(params.get('active')),
  }
}

export function serializeAdminCategoriesSearch(state: AdminCategoriesSearchState): URLSearchParams {
  const params = serializeAdminSearch(state, 'sort_order')
  if (state.isActive != null) params.set('active', state.isActive ? '1' : '0')
  return params
}

export function parseAdminBrandsSearch(params: URLSearchParams): AdminBrandsSearchState {
  return {
    ...parseAdminSearch(params, ADMIN_BRAND_SORTS, 'name_asc'),
    isActive: parseTriState(params.get('active')),
  }
}

export function serializeAdminBrandsSearch(state: AdminBrandsSearchState): URLSearchParams {
  const params = serializeAdminSearch(state, 'name_asc')
  if (state.isActive != null) params.set('active', state.isActive ? '1' : '0')
  return params
}

export function parseAdminActionsSearch(params: URLSearchParams): AdminActionsSearchState {
  return {
    ...parseAdminSearch(params, ADMIN_CHRONOLOGICAL_SORTS, 'newest'),
    actionType: parseActionFilter(params.get('action')),
    entityType: parseActionFilter(params.get('entity')),
    adminId: parseOptionalUuid(params.get('admin')),
  }
}

export function serializeAdminActionsSearch(state: AdminActionsSearchState): URLSearchParams {
  const params = serializeAdminSearch(state, 'newest')
  const actionType = parseActionFilter(state.actionType)
  const entityType = parseActionFilter(state.entityType)
  if (actionType !== '') params.set('action', actionType)
  if (entityType !== '') params.set('entity', entityType)
  if (state.adminId != null && parseOptionalUuid(state.adminId) != null) params.set('admin', state.adminId)
  return params
}

export function parseAdminTimelineSearch(params: URLSearchParams): AdminTimelineSearchState {
  return parseTimeline(params)
}

export function serializeAdminTimelineSearch(state: AdminTimelineSearchState): URLSearchParams {
  return serializeTimeline(state)
}

export type {
  AdminBrandSort,
  AdminCategorySort,
  AdminChronologicalSort,
  AdminListingSort,
  AdminOrderSort,
  AdminRefundSort,
  AdminReviewSort,
  AdminSellerSort,
  AdminUserSort,
}
