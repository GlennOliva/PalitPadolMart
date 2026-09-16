import type { Database } from '../../types/database'

type Functions = Database['public']['Functions']
type Enums = Database['public']['Enums']

export type AccountStatus = Enums['account_status']
export type DisputeStatus = Enums['dispute_status']
export type ListingStatus = Enums['listing_status']
export type OrderStatus = Enums['order_status']
export type PaymentStatus = Enums['payment_status']
export type RefundStatus = Enums['refund_status']
export type ReportStatus = Enums['report_status']
export type ReviewStatus = Enums['review_status']
export type SellerStatus = Enums['seller_status']
export type UserRole = Enums['user_role']

export type AdminSummaryRow = Functions['admin_summary']['Returns'][number]

export type AdminUserListRow = Functions['admin_list_users']['Returns'][number]
export type AdminUserDetailRow = Functions['admin_get_user']['Returns'][number]
export type AdminSellerListRow = Functions['admin_list_sellers']['Returns'][number]
export type AdminSellerDetailRow = Functions['admin_get_seller']['Returns'][number]
export type AdminListingListRow = Functions['admin_list_listings']['Returns'][number]
export type AdminListingDetailRow = Functions['admin_get_listing']['Returns'][number]
export type AdminReportListRow = Functions['admin_list_listing_reports']['Returns'][number]
export type AdminReportDetailRow = Functions['admin_get_listing_report']['Returns'][number]
export type AdminReviewListRow = Functions['admin_list_reviews']['Returns'][number]
export type AdminReviewDetailRow = Functions['admin_get_review']['Returns'][number]
export type AdminOrderListRow = Functions['admin_list_orders']['Returns'][number]
export type AdminOrderDetailRow = Functions['admin_get_order']['Returns'][number]
export type AdminDisputeListRow = Functions['admin_list_disputes']['Returns'][number]
export type AdminDisputeDetailRow = Functions['admin_get_dispute']['Returns'][number]
export type AdminDisputeMessageRow = Functions['admin_list_dispute_messages']['Returns'][number]
export type AdminDisputeEvidenceRow = Functions['admin_list_dispute_evidence']['Returns'][number]
export type AdminDisputeEventRow = Functions['admin_list_dispute_events']['Returns'][number]
export type AdminRefundListRow = Functions['admin_list_refunds']['Returns'][number]
export type AdminRefundDetailRow = Functions['admin_get_refund']['Returns'][number]
export type AdminRefundEventRow = Functions['admin_list_refund_events']['Returns'][number]
export type AdminCategoryListRow = Functions['admin_list_categories']['Returns'][number]
export type AdminBrandListRow = Functions['admin_list_brands']['Returns'][number]
export type AdminActionListRow = Functions['admin_list_admin_actions']['Returns'][number]
export type AdminActionDetailRow = Functions['admin_get_admin_action']['Returns'][number]

export type AdminUserMutationRow = Functions['admin_suspend_user']['Returns'][number]
export type AdminSellerMutationRow = Functions['admin_approve_seller']['Returns'][number]
export type AdminListingMutationRow = Functions['admin_moderate_listing']['Returns'][number]
export type AdminReportMutationRow = Functions['admin_update_listing_report']['Returns'][number]
export type AdminReviewMutationRow = Functions['admin_moderate_review']['Returns'][number]
export type AdminDisputeClaimRow = Functions['admin_claim_dispute']['Returns'][number]
export type AdminDisputeResolutionRow = Functions['admin_resolve_dispute']['Returns'][number]
export type AdminCategoryMutationRow = Functions['admin_create_category']['Returns'][number]
export type AdminCategoryActivationRow = Functions['admin_deactivate_category']['Returns'][number]
export type AdminBrandMutationRow = Functions['admin_create_brand']['Returns'][number]
export type AdminBrandActivationRow = Functions['admin_deactivate_brand']['Returns'][number]

export const ADMIN_DEFAULT_PAGE_SIZE = 20
export const ADMIN_MAX_PAGE_SIZE = 25
export const ADMIN_MAX_PAGE = 100_000
export const ADMIN_MAX_SEARCH_LENGTH = 120

export type AdminPageItem<TRow extends { total_count: number }> = Omit<TRow, 'total_count'>

export interface AdminPage<TRow extends { total_count: number }> {
  items: AdminPageItem<TRow>[]
  page: number
  pageSize: number
  total: number
  totalPages: number
}

export interface AdminResult<T> {
  data: T | null
  error: AdminError | null
}

export type AdminErrorCode =
  | 'AUTH_REQUIRED'
  | 'FORBIDDEN'
  | 'ACCOUNT_UNAVAILABLE'
  | 'INVALID_REASON'
  | 'USER_NOT_FOUND'
  | 'INVALID_ROLE_TRANSITION'
  | 'SELF_ADMIN_CHANGE_FORBIDDEN'
  | 'LAST_ACTIVE_ADMIN'
  | 'INVALID_ACCOUNT_TRANSITION'
  | 'SELLER_NOT_FOUND'
  | 'INVALID_SELLER_TRANSITION'
  | 'INVALID_CATEGORY'
  | 'CATEGORY_SLUG_EXISTS'
  | 'CATEGORY_NOT_FOUND'
  | 'INVALID_CATEGORY_TRANSITION'
  | 'CATEGORY_IN_USE'
  | 'INVALID_BRAND'
  | 'BRAND_SLUG_EXISTS'
  | 'BRAND_NOT_FOUND'
  | 'INVALID_BRAND_TRANSITION'
  | 'BRAND_IN_USE'
  | 'NO_CHANGES'
  | 'INVALID_LISTING_ACTION'
  | 'LISTING_NOT_FOUND'
  | 'INVALID_LISTING_TRANSITION'
  | 'REPORT_NOT_FOUND'
  | 'INVALID_REPORT_TRANSITION'
  | 'RESOLUTION_REQUIRED'
  | 'INVALID_RESOLUTION'
  | 'INVALID_REVIEW_ACTION'
  | 'REVIEW_NOT_FOUND'
  | 'INVALID_REVIEW_TRANSITION'
  | 'DISPUTE_NOT_FOUND'
  | 'DISPUTE_NOT_CLAIMABLE'
  | 'DISPUTE_NOT_RESOLVABLE'
  | 'DISPUTE_NOT_ASSIGNED'
  | 'REFUND_NOT_FOUND'
  | 'REFUND_STILL_ACTIVE'
  | 'INVALID_PAGINATION'
  | 'INVALID_DATE_RANGE'
  | 'INVALID_BUCKET'
  | 'INVALID_SORT'
  | 'INVALID_SEARCH'
  | 'INVALID_RATING'
  | 'INVALID_FILTER'
  | 'UNKNOWN'

export interface AdminError {
  code: AdminErrorCode
  message: string
}

export type AdminUserSort = 'newest' | 'oldest' | 'name_asc' | 'name_desc' | 'last_sign_in'
export type AdminSellerSort = 'newest' | 'oldest' | 'store_asc' | 'store_desc'
export type AdminListingSort = 'newest' | 'oldest' | 'price_asc' | 'price_desc' | 'title_asc'
export type AdminChronologicalSort = 'newest' | 'oldest'
export type AdminReviewSort = 'newest' | 'oldest' | 'rating_asc' | 'rating_desc'
export type AdminOrderSort = 'newest' | 'oldest' | 'total_asc' | 'total_desc'
export type AdminRefundSort = 'newest' | 'oldest' | 'amount_asc' | 'amount_desc'
export type AdminCategorySort = 'sort_order' | 'name_asc' | 'name_desc' | 'newest'
export type AdminBrandSort = 'name_asc' | 'name_desc' | 'newest' | 'oldest'

export interface AdminSearchState<TSort extends string> {
  search: string
  page: number
  pageSize: number
  sort: TSort
}

export interface AdminTimelineSearchState {
  page: number
  pageSize: number
  sort: AdminChronologicalSort
}

export interface AdminUsersSearchState extends AdminSearchState<AdminUserSort> {
  role: UserRole | null
  accountStatus: AccountStatus | null
}

export interface AdminSellersSearchState extends AdminSearchState<AdminSellerSort> {
  status: SellerStatus | null
}

export interface AdminListingsSearchState extends AdminSearchState<AdminListingSort> {
  status: ListingStatus | null
  sellerId: string | null
}

export interface AdminReportsSearchState extends AdminSearchState<AdminChronologicalSort> {
  status: ReportStatus | null
}

export interface AdminReviewsSearchState extends AdminSearchState<AdminReviewSort> {
  status: ReviewStatus | null
  rating: number | null
}

export interface AdminOrdersSearchState extends AdminSearchState<AdminOrderSort> {
  status: OrderStatus | null
  paymentStatus: PaymentStatus | null
}

export interface AdminDisputesSearchState extends AdminSearchState<AdminChronologicalSort> {
  status: DisputeStatus | null
  assignedToMe: boolean
}

export interface AdminRefundsSearchState extends AdminSearchState<AdminRefundSort> {
  status: RefundStatus | null
}

export interface AdminCategoriesSearchState extends AdminSearchState<AdminCategorySort> {
  isActive: boolean | null
}

export interface AdminBrandsSearchState extends AdminSearchState<AdminBrandSort> {
  isActive: boolean | null
}

export interface AdminActionsSearchState extends AdminSearchState<AdminChronologicalSort> {
  actionType: string
  entityType: string
  adminId: string | null
}

export interface AdminUserActionInput {
  userId: string
  reason: string
}

export interface AdminSellerActionInput {
  sellerId: string
  reason: string
}

export interface AdminListingActionInput {
  listingId: string
  reason: string
}

export interface AdminReportActionInput {
  reportId: string
  reason: string
  resolution?: string
}

export interface AdminReviewActionInput {
  reviewId: string
  reason: string
}

export interface AdminDisputeActionInput {
  disputeId: string
  reason: string
}

export interface AdminResolveDisputeInput extends AdminDisputeActionInput {
  resolution: string
}

export interface AdminCategoryInput {
  name: string
  slug: string
  description: string
  sortOrder: number
  reason: string
}

export interface AdminUpdateCategoryInput extends AdminCategoryInput {
  categoryId: string
}

export interface AdminCategoryActionInput {
  categoryId: string
  reason: string
}

export interface AdminBrandInput {
  name: string
  slug: string
  logoUrl: string
  description: string
  reason: string
}

export interface AdminUpdateBrandInput extends AdminBrandInput {
  brandId: string
}

export interface AdminBrandActionInput {
  brandId: string
  reason: string
}
