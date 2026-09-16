import { supabase } from '../../lib/supabase/client'
import {
  DEFAULT_ADMIN_BRANDS_SEARCH,
  DEFAULT_ADMIN_CATEGORIES_SEARCH,
  DEFAULT_ADMIN_LISTINGS_SEARCH,
  DEFAULT_ADMIN_REPORTS_SEARCH,
  DEFAULT_ADMIN_REVIEWS_SEARCH,
  normalizeAdminPage,
  normalizeAdminPageSize,
  normalizeAdminSearch,
} from './admin-params'
import { runAdminList, runAdminSingle } from './admin-service-utils'
import type {
  AdminBrandActionInput,
  AdminBrandActivationRow,
  AdminBrandInput,
  AdminBrandListRow,
  AdminBrandMutationRow,
  AdminBrandsSearchState,
  AdminCategoriesSearchState,
  AdminCategoryActionInput,
  AdminCategoryActivationRow,
  AdminCategoryInput,
  AdminCategoryListRow,
  AdminCategoryMutationRow,
  AdminListingActionInput,
  AdminListingDetailRow,
  AdminListingListRow,
  AdminListingMutationRow,
  AdminListingsSearchState,
  AdminPage,
  AdminReportActionInput,
  AdminReportDetailRow,
  AdminReportListRow,
  AdminReportMutationRow,
  AdminReportsSearchState,
  AdminResult,
  AdminReviewActionInput,
  AdminReviewDetailRow,
  AdminReviewListRow,
  AdminReviewMutationRow,
  AdminReviewsSearchState,
  AdminUpdateBrandInput,
  AdminUpdateCategoryInput,
} from './admin.types'
import { normalizeTaxonomySlug, trimAdminReason } from './admin-validation'

export function listAdminListings(
  options: Partial<AdminListingsSearchState> = {},
): Promise<AdminResult<AdminPage<AdminListingListRow>>> {
  const state = { ...DEFAULT_ADMIN_LISTINGS_SEARCH, ...options }
  const page = normalizeAdminPage(state.page)
  const pageSize = normalizeAdminPageSize(state.pageSize)
  return runAdminList<AdminListingListRow>(() => supabase.rpc('admin_list_listings', {
    p_page: page,
    p_page_size: pageSize,
    p_search: normalizeAdminSearch(state.search) || undefined,
    p_status: state.status ?? undefined,
    p_seller_id: state.sellerId ?? undefined,
    p_sort: state.sort,
  }), page, pageSize)
}

export function getAdminListing(listingId: string): Promise<AdminResult<AdminListingDetailRow>> {
  return runAdminSingle<AdminListingDetailRow>(() => supabase.rpc('admin_get_listing', {
    p_listing_id: listingId,
  }))
}

function moderateListing(
  input: AdminListingActionInput,
  action: 'remove' | 'restore',
): Promise<AdminResult<AdminListingMutationRow>> {
  return runAdminSingle<AdminListingMutationRow>(() => supabase.rpc('admin_moderate_listing', {
    p_listing_id: input.listingId,
    p_action: action,
    p_reason: trimAdminReason(input.reason),
  }))
}

export function removeListing(input: AdminListingActionInput): Promise<AdminResult<AdminListingMutationRow>> {
  return moderateListing(input, 'remove')
}

export function restoreListing(input: AdminListingActionInput): Promise<AdminResult<AdminListingMutationRow>> {
  return moderateListing(input, 'restore')
}

export function listAdminReports(
  options: Partial<AdminReportsSearchState> = {},
): Promise<AdminResult<AdminPage<AdminReportListRow>>> {
  const state = { ...DEFAULT_ADMIN_REPORTS_SEARCH, ...options }
  const page = normalizeAdminPage(state.page)
  const pageSize = normalizeAdminPageSize(state.pageSize)
  return runAdminList<AdminReportListRow>(() => supabase.rpc('admin_list_listing_reports', {
    p_page: page,
    p_page_size: pageSize,
    p_search: normalizeAdminSearch(state.search) || undefined,
    p_status: state.status ?? undefined,
    p_sort: state.sort,
  }), page, pageSize)
}

export function getAdminReport(reportId: string): Promise<AdminResult<AdminReportDetailRow>> {
  return runAdminSingle<AdminReportDetailRow>(() => supabase.rpc('admin_get_listing_report', {
    p_report_id: reportId,
  }))
}

function updateReport(
  input: AdminReportActionInput,
  status: 'under_review' | 'resolved' | 'dismissed',
): Promise<AdminResult<AdminReportMutationRow>> {
  return runAdminSingle<AdminReportMutationRow>(() => supabase.rpc('admin_update_listing_report', {
    p_report_id: input.reportId,
    p_status: status,
    p_reason: trimAdminReason(input.reason),
    p_resolution: input.resolution?.trim() || undefined,
  }))
}

export function markReportUnderReview(input: AdminReportActionInput): Promise<AdminResult<AdminReportMutationRow>> {
  return updateReport(input, 'under_review')
}

export function resolveReport(input: AdminReportActionInput): Promise<AdminResult<AdminReportMutationRow>> {
  return updateReport(input, 'resolved')
}

export function dismissReport(input: AdminReportActionInput): Promise<AdminResult<AdminReportMutationRow>> {
  return updateReport(input, 'dismissed')
}

export function listAdminReviews(
  options: Partial<AdminReviewsSearchState> = {},
): Promise<AdminResult<AdminPage<AdminReviewListRow>>> {
  const state = { ...DEFAULT_ADMIN_REVIEWS_SEARCH, ...options }
  const page = normalizeAdminPage(state.page)
  const pageSize = normalizeAdminPageSize(state.pageSize)
  return runAdminList<AdminReviewListRow>(() => supabase.rpc('admin_list_reviews', {
    p_page: page,
    p_page_size: pageSize,
    p_search: normalizeAdminSearch(state.search) || undefined,
    p_status: state.status ?? undefined,
    p_rating: state.rating ?? undefined,
    p_sort: state.sort,
  }), page, pageSize)
}

export function getAdminReview(reviewId: string): Promise<AdminResult<AdminReviewDetailRow>> {
  return runAdminSingle<AdminReviewDetailRow>(() => supabase.rpc('admin_get_review', {
    p_review_id: reviewId,
  }))
}

function moderateReview(
  input: AdminReviewActionInput,
  action: 'hide' | 'restore',
): Promise<AdminResult<AdminReviewMutationRow>> {
  return runAdminSingle<AdminReviewMutationRow>(() => supabase.rpc('admin_moderate_review', {
    p_review_id: input.reviewId,
    p_action: action,
    p_reason: trimAdminReason(input.reason),
  }))
}

export function hideReview(input: AdminReviewActionInput): Promise<AdminResult<AdminReviewMutationRow>> {
  return moderateReview(input, 'hide')
}

export function restoreReview(input: AdminReviewActionInput): Promise<AdminResult<AdminReviewMutationRow>> {
  return moderateReview(input, 'restore')
}

export function listAdminCategories(
  options: Partial<AdminCategoriesSearchState> = {},
): Promise<AdminResult<AdminPage<AdminCategoryListRow>>> {
  const state = { ...DEFAULT_ADMIN_CATEGORIES_SEARCH, ...options }
  const page = normalizeAdminPage(state.page)
  const pageSize = normalizeAdminPageSize(state.pageSize)
  return runAdminList<AdminCategoryListRow>(() => supabase.rpc('admin_list_categories', {
    p_page: page,
    p_page_size: pageSize,
    p_search: normalizeAdminSearch(state.search) || undefined,
    p_is_active: state.isActive ?? undefined,
    p_sort: state.sort,
  }), page, pageSize)
}

export function createCategory(input: AdminCategoryInput): Promise<AdminResult<AdminCategoryMutationRow>> {
  return runAdminSingle<AdminCategoryMutationRow>(() => supabase.rpc('admin_create_category', {
    p_name: input.name.trim(),
    p_slug: normalizeTaxonomySlug(input.slug),
    p_description: input.description.trim(),
    p_sort_order: input.sortOrder,
    p_reason: trimAdminReason(input.reason),
  }))
}

export function updateCategory(input: AdminUpdateCategoryInput): Promise<AdminResult<AdminCategoryMutationRow>> {
  return runAdminSingle<AdminCategoryMutationRow>(() => supabase.rpc('admin_update_category', {
    p_category_id: input.categoryId,
    p_name: input.name.trim(),
    p_slug: normalizeTaxonomySlug(input.slug),
    p_description: input.description.trim(),
    p_sort_order: input.sortOrder,
    p_reason: trimAdminReason(input.reason),
  }))
}

function setCategoryActive(
  rpc: 'admin_deactivate_category' | 'admin_reactivate_category',
  input: AdminCategoryActionInput,
): Promise<AdminResult<AdminCategoryActivationRow>> {
  return runAdminSingle<AdminCategoryActivationRow>(() => supabase.rpc(rpc, {
    p_category_id: input.categoryId,
    p_reason: trimAdminReason(input.reason),
  }))
}

export function deactivateCategory(input: AdminCategoryActionInput): Promise<AdminResult<AdminCategoryActivationRow>> {
  return setCategoryActive('admin_deactivate_category', input)
}

export function reactivateCategory(input: AdminCategoryActionInput): Promise<AdminResult<AdminCategoryActivationRow>> {
  return setCategoryActive('admin_reactivate_category', input)
}

export function listAdminBrands(
  options: Partial<AdminBrandsSearchState> = {},
): Promise<AdminResult<AdminPage<AdminBrandListRow>>> {
  const state = { ...DEFAULT_ADMIN_BRANDS_SEARCH, ...options }
  const page = normalizeAdminPage(state.page)
  const pageSize = normalizeAdminPageSize(state.pageSize)
  return runAdminList<AdminBrandListRow>(() => supabase.rpc('admin_list_brands', {
    p_page: page,
    p_page_size: pageSize,
    p_search: normalizeAdminSearch(state.search) || undefined,
    p_is_active: state.isActive ?? undefined,
    p_sort: state.sort,
  }), page, pageSize)
}

export function createBrand(input: AdminBrandInput): Promise<AdminResult<AdminBrandMutationRow>> {
  return runAdminSingle<AdminBrandMutationRow>(() => supabase.rpc('admin_create_brand', {
    p_name: input.name.trim(),
    p_slug: normalizeTaxonomySlug(input.slug),
    p_logo_url: input.logoUrl.trim(),
    p_description: input.description.trim(),
    p_reason: trimAdminReason(input.reason),
  }))
}

export function updateBrand(input: AdminUpdateBrandInput): Promise<AdminResult<AdminBrandMutationRow>> {
  return runAdminSingle<AdminBrandMutationRow>(() => supabase.rpc('admin_update_brand', {
    p_brand_id: input.brandId,
    p_name: input.name.trim(),
    p_slug: normalizeTaxonomySlug(input.slug),
    p_logo_url: input.logoUrl.trim(),
    p_description: input.description.trim(),
    p_reason: trimAdminReason(input.reason),
  }))
}

function setBrandActive(
  rpc: 'admin_deactivate_brand' | 'admin_reactivate_brand',
  input: AdminBrandActionInput,
): Promise<AdminResult<AdminBrandActivationRow>> {
  return runAdminSingle<AdminBrandActivationRow>(() => supabase.rpc(rpc, {
    p_brand_id: input.brandId,
    p_reason: trimAdminReason(input.reason),
  }))
}

export function deactivateBrand(input: AdminBrandActionInput): Promise<AdminResult<AdminBrandActivationRow>> {
  return setBrandActive('admin_deactivate_brand', input)
}

export function reactivateBrand(input: AdminBrandActionInput): Promise<AdminResult<AdminBrandActivationRow>> {
  return setBrandActive('admin_reactivate_brand', input)
}
