import type { PostgrestError } from '@supabase/supabase-js'
import { supabase } from '../../lib/supabase/client'
import type {
  ReviewErrorCode,
  ReviewRpcError,
  ReviewInput,
  ReviewRecord,
  ReviewSortOption,
  ReviewSummary,
  ReviewWithAuthor,
  ReviewsPage,
  SellerReviewWithListing,
  SellerReviewsPage,
} from './reviews.types'
import { REVIEW_ERROR_CODES, REVIEWS_PAGE_SIZE, SELLER_REVIEWS_PAGE_SIZE } from './reviews.types'

/**
 * Parses a structured `CODE: message` exception from the Phase 10 review
 * RPCs back into a typed error. Unmatched messages become UNKNOWN with the
 * raw text, so users always see something actionable.
 */
export function parseReviewError(error: PostgrestError | null): ReviewRpcError | null {
  if (error == null) return null
  const raw = (error.message ?? '').trim()
  const match = raw.match(/^([A-Z_]+):\s*(.+)$/)
  const code = (match?.[1] ?? null) as ReviewErrorCode | null
  const message = match?.[2]?.trim() ?? raw
  if (code != null && message.length > 0) return { code, message }
  if (error.code === '42501') return { code: 'FORBIDDEN', message: 'You are not allowed to do that.' }
  return { code: 'UNKNOWN', message: raw.length > 0 ? raw : 'Something went wrong.' }
}

/** User-facing copy for a structured review error code. */
export function reviewErrorLabel(code: string): string {
  switch (code) {
    case 'AUTH_REQUIRED':
      return 'Please sign in to review an item.'
    case 'ORDER_ITEM_NOT_FOUND':
      return 'This order item could not be found.'
    case 'FORBIDDEN':
      return 'Only the buyer who purchased this item can review it.'
    case 'ORDER_NOT_COMPLETED':
      return 'You can only review items from completed orders.'
    case 'REVIEW_ALREADY_EXISTS':
      return 'You have already reviewed this item.'
    case 'INVALID_RATING':
      return 'Please choose a product rating between 1 and 5.'
    case 'INVALID_SELLER_RATING':
      return 'Please choose a seller rating between 1 and 5.'
    case 'INVALID_REVIEW_TEXT':
      return 'Your review text must be at most 2000 characters.'
    case 'SELLER_SELF_REVIEW_NOT_ALLOWED':
      return 'You cannot review your own listing.'
    default:
      return 'Something went wrong. Please try again.'
  }
}

/**
 * The generated client types rpc() against the exact Postgres function-name
 * union, so a dynamic name needs a narrow runtime-cast wrapper. The cast must
 * NOT detach the method: calling a bare `supabase.rpc` reference drops the
 * client receiver (`this`), so the internal `this.rest` lookup throws
 * `undefined is not an object (evaluating 'this.rest')`.
 */
type RpcFn = (
  name: string,
  args: Record<string, unknown>,
) => Promise<{ data: unknown; error: PostgrestError | null }>

async function callRpc(
  rpcName: string,
  params: Record<string, unknown>,
): Promise<{ data: unknown; error: PostgrestError | null }> {
  return (supabase.rpc as unknown as RpcFn)(rpcName, params)
}

async function runReviewRpc(
  rpcName: string,
  params: Record<string, unknown>,
): Promise<{ data: unknown; error: ReviewRpcError | null }> {
  try {
    const { data, error } = await callRpc(rpcName, params)
    return { data: data ?? null, error: parseReviewError(error) }
  } catch {
    return { data: null, error: { code: 'UNKNOWN', message: 'Something went wrong.' } }
  }
}

/**
 * The Phase 10 summary RPCs (`listing_review_summary`, `seller_review_summary`,
 * `get_my_seller_rating_summary`) are declared with `returns table`, so
 * PostgREST returns a one-row JSON array (for example
 * `[{ review_count: 3, average_rating: 4.67 }]`). This reads the first row and
 * tolerates a bare single-row object for robustness, normalizing to `null`
 * when no row exists.
 *
 * Treating the array as a row object is the historical "No reviews yet" bug:
 * `row.review_count` was always `undefined`, so every summary collapsed to
 * count 0 / average null even when approved reviews existed.
 */
interface ReviewSummaryRow {
  review_count?: number | null
  average_rating?: number | null
}

function readReviewSummaryRow(data: unknown): ReviewSummaryRow | null {
  const first = Array.isArray(data) ? data[0] : data
  return first == null ? null : (first as ReviewSummaryRow)
}

function toReviewRecord(data: unknown): ReviewRecord | null {
  const row = data as {
    id?: string
    order_item_id?: string
    order_id?: string
    rating?: number
    seller_rating?: number
    comment?: string | null
  } | null
  if (row == null || row.id == null) return null
  return {
    id: row.id,
    orderItemId: row.order_item_id ?? '',
    orderId: row.order_id ?? '',
    productRating: row.rating ?? 0,
    sellerRating: row.seller_rating ?? 0,
    comment: row.comment ?? null,
  }
}

interface RawReviewWithAuthor {
  id: string
  rating: number
  seller_rating: number
  comment: string | null
  created_at: string
  reviewer_name: string
  reviewer_avatar: string | null
  listing_title: string | null
}

function toReviewWithAuthor(row: RawReviewWithAuthor): ReviewWithAuthor {
  return {
    id: row.id,
    rating: row.rating,
    sellerRating: row.seller_rating,
    comment: row.comment,
    createdAt: row.created_at,
    reviewerName: row.reviewer_name,
    reviewerAvatar: row.reviewer_avatar,
    listingTitle: row.listing_title ?? null,
  }
}

/**
 * Submits a verified-purchase review. The RPC derives the reviewer, seller,
 * and listing from the order item and publishes (status `approved`).
 */
export async function submitReview(
  input: ReviewInput,
): Promise<{ data: ReviewRecord | null; error: ReviewRpcError | null }> {
  const { data, error } = await runReviewRpc('submit_review', {
    p_order_item_id: input.orderItemId,
    p_rating: input.productRating,
    p_seller_rating: input.sellerRating,
    p_comment: input.comment,
  })
  if (error != null) return { data: null, error }
  return { data: toReviewRecord(data), error: null }
}

/** Approved-review aggregate for one listing. */
export async function getListingReviewSummary(
  listingId: string,
): Promise<{ data: ReviewSummary | null; error: ReviewRpcError | null }> {
  const { data, error } = await runReviewRpc('listing_review_summary', {
    p_listing_id: listingId,
  })
  if (error != null) return { data: null, error }
  const row = readReviewSummaryRow(data)
  return {
    data:
      row == null ? null : { reviewCount: row.review_count ?? 0, averageRating: row.average_rating ?? null },
    error: null,
  }
}

/** Approved-review aggregate (seller_rating) for one seller. */
export async function getSellerReviewSummary(
  sellerId: string,
): Promise<{ data: ReviewSummary | null; error: ReviewRpcError | null }> {
  const { data, error } = await runReviewRpc('seller_review_summary', {
    p_seller_id: sellerId,
  })
  if (error != null) return { data: null, error }
  const row = readReviewSummaryRow(data)
  return {
    data:
      row == null ? null : { reviewCount: row.review_count ?? 0, averageRating: row.average_rating ?? null },
    error: null,
  }
}

/** Exact 5…1 star distribution for a listing's approved reviews. */
export async function getListingReviewDistribution(
  listingId: string,
): Promise<{ data: Record<number, number>; error: ReviewRpcError | null }> {
  const { data, error } = await runReviewRpc('listing_review_distribution', {
    p_listing_id: listingId,
  })
  if (error != null) return { data: {}, error }
  const rows = Array.isArray(data)
    ? (data as { rating_value?: number; review_count?: number }[])
    : []
  const distribution: Record<number, number> = {}
  for (const row of rows) {
    if (row.rating_value != null) distribution[row.rating_value] = row.review_count ?? 0
  }
  return { data: distribution, error: null }
}

/**
 * Paginated approved reviews for one listing. Requests one extra row so the
 * UI can tell whether another page exists.
 */
export async function fetchListingReviews(
  listingId: string,
  page = 1,
  pageSize = REVIEWS_PAGE_SIZE,
): Promise<{ data: ReviewsPage | null; error: ReviewRpcError | null }> {
  const { data, error } = await runReviewRpc('listing_reviews', {
    p_listing_id: listingId,
    p_page: page,
    p_page_size: pageSize + 1,
  })
  if (error != null) return { data: null, error }
  const rows = Array.isArray(data) ? (data as RawReviewWithAuthor[]) : []
  return {
    data: {
      reviews: rows.slice(0, pageSize).map(toReviewWithAuthor),
      hasMore: rows.length > pageSize,
    },
    error: null,
  }
}

/** Paginated approved reviews for one seller (same shape as listing reviews). */
export async function fetchSellerReviews(
  sellerId: string,
  page = 1,
  pageSize = REVIEWS_PAGE_SIZE,
): Promise<{ data: ReviewsPage | null; error: ReviewRpcError | null }> {
  const { data, error } = await runReviewRpc('seller_reviews', {
    p_seller_id: sellerId,
    p_page: page,
    p_page_size: pageSize + 1,
  })
  if (error != null) return { data: null, error }
  const rows = Array.isArray(data) ? (data as RawReviewWithAuthor[]) : []
  return {
    data: {
      reviews: rows.slice(0, pageSize).map(toReviewWithAuthor),
      hasMore: rows.length > pageSize,
    },
    error: null,
  }
}

/**
 * The set of order items already reviewed by the current buyer, per order.
 * Used to show Review / Reviewed states on the order-detail page.
 */
export async function getMyOrderReviews(
  orderId: string,
  reviewerId: string,
): Promise<{ data: Record<string, string> | null; error: PostgrestError | null }> {
  const { data, error } = await supabase
    .from('reviews')
    .select('order_item_id, id')
    .eq('order_id', orderId)
    .eq('reviewer_id', reviewerId)
  if (error != null) return { data: null, error }
  const byItem = (data ?? []).reduce<Record<string, string>>((acc, row) => {
    acc[row.order_item_id] = row.id
    return acc
  }, {})
  return { data: byItem, error: null }
}

/** Blocks the standalone order-item insert must pass through. */
export function isReviewErrorCode(code: string): code is ReviewErrorCode {
  return (REVIEW_ERROR_CODES as readonly string[]).includes(code)
}

// ---------------------------------------------------------------------------
// Seller-side review RPCs (auth-derived, read-only)
// ---------------------------------------------------------------------------

interface RawSellerReviewWithListing {
  id: string
  rating: number
  seller_rating: number
  comment: string | null
  created_at: string
  reviewer_name: string
  reviewer_avatar: string | null
  listing_id: string | null
  listing_title: string | null
  listing_image_url: string | null
}

function toSellerReviewWithListing(row: RawSellerReviewWithListing): SellerReviewWithListing {
  return {
    id: row.id,
    rating: row.rating,
    sellerRating: row.seller_rating,
    comment: row.comment,
    createdAt: row.created_at,
    reviewerName: row.reviewer_name,
    reviewerAvatar: row.reviewer_avatar,
    listingTitle: row.listing_title ?? null,
    listingId: row.listing_id ?? null,
    listingImageUrl: row.listing_image_url ?? null,
  }
}

/**
 * Paginated approved reviews for the authenticated seller. The RPC derives the
 * seller from auth.uid() → auth_seller_id() — the browser never supplies a
 * seller id. Supports rating filter and sort.
 */
export async function getMySellerReviews(
  page = 1,
  pageSize = SELLER_REVIEWS_PAGE_SIZE,
  ratingFilter: number | null = null,
  sort: ReviewSortOption = 'newest',
): Promise<{ data: SellerReviewsPage | null; error: ReviewRpcError | null }> {
  const { data, error } = await runReviewRpc('get_my_seller_reviews', {
    p_page: page,
    p_page_size: pageSize + 1,
    p_rating: ratingFilter,
    p_sort: sort,
  })
  if (error != null) return { data: null, error }
  const rows = Array.isArray(data) ? (data as RawSellerReviewWithListing[]) : []
  return {
    data: {
      reviews: rows.slice(0, pageSize).map(toSellerReviewWithListing),
      hasMore: rows.length > pageSize,
    },
    error: null,
  }
}

/** Approved-review aggregate for the authenticated seller (auth-derived). */
export async function getMySellerRatingSummary(): Promise<{
  data: ReviewSummary | null
  error: ReviewRpcError | null
}> {
  const { data, error } = await runReviewRpc('get_my_seller_rating_summary', {})
  if (error != null) return { data: null, error }
  const row = readReviewSummaryRow(data)
  return {
    data:
      row == null
        ? null
        : { reviewCount: row.review_count ?? 0, averageRating: row.average_rating ?? null },
    error: null,
  }
}

/** Exact 5…1 star distribution for the authenticated seller's approved reviews. */
export async function getMySellerRatingDistribution(): Promise<{
  data: Record<number, number>
  error: ReviewRpcError | null
}> {
  const { data, error } = await runReviewRpc('get_my_seller_rating_distribution', {})
  if (error != null) return { data: {}, error }
  const rows = Array.isArray(data)
    ? (data as { rating_value?: number; review_count?: number }[])
    : []
  const distribution: Record<number, number> = {}
  for (const row of rows) {
    if (row.rating_value != null) distribution[row.rating_value] = row.review_count ?? 0
  }
  return { data: distribution, error: null }
}