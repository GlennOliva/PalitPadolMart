export const REVIEW_ERROR_CODES = [
  'AUTH_REQUIRED',
  'ORDER_ITEM_NOT_FOUND',
  'FORBIDDEN',
  'ORDER_NOT_COMPLETED',
  'REVIEW_ALREADY_EXISTS',
  'INVALID_RATING',
  'INVALID_SELLER_RATING',
  'INVALID_REVIEW_TEXT',
  'SELLER_SELF_REVIEW_NOT_ALLOWED',
] as const

export type ReviewErrorCode = (typeof REVIEW_ERROR_CODES)[number]

export type ReviewErrorLike = ReviewErrorCode | 'UNKNOWN'

export interface ReviewRpcError {
  code: ReviewErrorLike
  message: string
}

export interface ReviewInput {
  orderItemId: string
  productRating: number
  sellerRating: number
  comment: string
}

export interface ReviewRecord {
  id: string
  orderItemId: string
  orderId: string
  productRating: number
  sellerRating: number
  comment: string | null
}

export interface ReviewWithAuthor {
  id: string
  rating: number
  sellerRating: number
  comment: string | null
  createdAt: string
  reviewerName: string
  reviewerAvatar: string | null
  listingTitle: string | null
}

export interface ReviewSummary {
  reviewCount: number
  averageRating: number | null
}

export interface ReviewsPage {
  reviews: ReviewWithAuthor[]
  hasMore: boolean
}

export interface SellerReviewWithListing extends ReviewWithAuthor {
  listingId: string | null
  listingImageUrl: string | null
}

export interface SellerReviewsPage {
  reviews: SellerReviewWithListing[]
  hasMore: boolean
}

export type ReviewSortOption = 'newest' | 'highest' | 'lowest'

export const REVIEW_COMMENT_MAX_LENGTH = 2000
export const REVIEWS_PAGE_SIZE = 5
export const SELLER_REVIEWS_PAGE_SIZE = 10