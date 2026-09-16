import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  parseReviewError,
  reviewErrorLabel,
  submitReview,
  getListingReviewSummary,
  getSellerReviewSummary,
  getListingReviewDistribution,
  fetchListingReviews,
  fetchSellerReviews,
  getMyOrderReviews,
  isReviewErrorCode,
  getMySellerReviews,
  getMySellerRatingSummary,
  getMySellerRatingDistribution,
} from '../../src/features/reviews/reviews.service'

/**
 * PHASE 10 SERVICE INVARIANTS.
 *
 * `submit_review` is the ONLY writer. The app service must request the order
 * item id and the two ratings + comment — never a seller/listing/reviewer id
 * — because the security-definer RPC derives those from the order item.
 */
const reviewMocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
}))

vi.mock('../../src/lib/supabase/client', () => ({
  supabase: {
    rpc: reviewMocks.rpc,
    from: reviewMocks.from,
  },
}))

/**
 * The Phase 10 summary RPCs are `returns table` functions, so PostgREST always
 * returns a one-row JSON ARRAY (e.g. `[{ review_count: 3, average_rating: 4.33 }]`).
 * The mocks below mirror that wire shape so the service regression tests prove
 * the real "No reviews yet despite 3 reviews" bug stays fixed.
 */
const rawReview = {
  id: 'rev-1',
  rating: 4,
  seller_rating: 5,
  comment: 'Smooth paddle',
  created_at: '2026-09-01T00:00:00.000Z',
  reviewer_name: 'Ana Test',
  reviewer_avatar: null,
  listing_title: 'Selkirk Amped Epic',
  listing_id: 'list-1',
  listing_image_url: null,
}

const rawSummaryRows = [{ review_count: 3, average_rating: 4.33 }]

import { makePostgrestError } from '../utils/seller'

beforeEach(() => {
  reviewMocks.rpc.mockReset()
  reviewMocks.from.mockReset()
})

describe('parseReviewError', () => {
  it('maps structured CODE: message exceptions', () => {
    const error = parseReviewError(
      makePostgrestError('REVIEW_ALREADY_EXISTS: You have already reviewed this item.', 'P0001'),
    )
    expect(error).toEqual({
      code: 'REVIEW_ALREADY_EXISTS',
      message: 'You have already reviewed this item.',
    })
  })

  it('maps a denied insert to FORBIDDEN', () => {
    const error = parseReviewError(makePostgrestError('permission denied for table reviews', '42501'))
    expect(error?.code).toBe('FORBIDDEN')
  })

  it('falls back to UNKNOWN with the raw message', () => {
    const error = parseReviewError(makePostgrestError('invalid input syntax for type smallint', '22P02'))
    expect(error).toEqual({ code: 'UNKNOWN', message: 'invalid input syntax for type smallint' })
  })

  it('returns null when there is no error', () => {
    expect(parseReviewError(null)).toBeNull()
  })
})

describe('reviewErrorLabel', () => {
  it('labels every structured review error code with user copy', () => {
    for (const code of [
      'AUTH_REQUIRED',
      'ORDER_ITEM_NOT_FOUND',
      'FORBIDDEN',
      'ORDER_NOT_COMPLETED',
      'REVIEW_ALREADY_EXISTS',
      'INVALID_RATING',
      'INVALID_SELLER_RATING',
      'INVALID_REVIEW_TEXT',
      'SELLER_SELF_REVIEW_NOT_ALLOWED',
    ]) {
      expect(reviewErrorLabel(code).length).toBeGreaterThan(0)
    }
  })

  it('falls back to a generic message for unknown codes', () => {
    expect(reviewErrorLabel('BOGUS')).toContain('try again')
  })
})

describe('isReviewErrorCode', () => {
  it('recognizes only the structured review codes', () => {
    expect(isReviewErrorCode('FORBIDDEN')).toBe(true)
    expect(isReviewErrorCode('BOGUS')).toBe(false)
  })
})

describe('submitReview', () => {
  it('sends only the order-item id and ratings/comments — never a seller or reviewer id', async () => {
    reviewMocks.rpc.mockResolvedValueOnce({ data: rawReview, error: null })

    const { data, error } = await submitReview({
      orderItemId: 'item-1',
      productRating: 4,
      sellerRating: 5,
      comment: '  Smooth paddle  ',
    })

    expect(error).toBeNull()
    expect(data).toEqual({
      id: 'rev-1',
      orderItemId: '',
      orderId: '',
      productRating: 4,
      sellerRating: 5,
      comment: 'Smooth paddle',
    })
    expect(reviewMocks.rpc).toHaveBeenCalledTimes(1)
    expect(reviewMocks.rpc).toHaveBeenCalledWith('submit_review', {
      p_order_item_id: 'item-1',
      p_rating: 4,
      p_seller_rating: 5,
      p_comment: '  Smooth paddle  ',
    })
    const args = reviewMocks.rpc.mock.calls[0][1]
    expect(args).not.toHaveProperty('p_seller_id')
    expect(args).not.toHaveProperty('p_reviewer_id')
    expect(args).not.toHaveProperty('p_listing_id')
  })

  it('maps a duplicate-review exception back to the buyer', async () => {
    reviewMocks.rpc.mockResolvedValueOnce({
      data: null,
      error: makePostgrestError('REVIEW_ALREADY_EXISTS: You have already reviewed this item.', 'P0001'),
    })

    const { data, error } = await submitReview({
      orderItemId: 'item-1',
      productRating: 4,
      sellerRating: 5,
      comment: '',
    })

    expect(data).toBeNull()
    expect(error?.code).toBe('REVIEW_ALREADY_EXISTS')
  })

  it('surfaces a thrown RPC failure as a clean UNKNOWN error', async () => {
    reviewMocks.rpc.mockRejectedValueOnce(new TypeError("undefined is not an object (evaluating 'this.rest')"))

    const { data, error } = await submitReview({
      orderItemId: 'item-1',
      productRating: 4,
      sellerRating: 5,
      comment: '',
    })

    expect(data).toBeNull()
    expect(error?.code).toBe('UNKNOWN')
  })
})

describe('review summaries', () => {
  it('normalizes the listing aggregate from the real table-returning wire shape', async () => {
    reviewMocks.rpc.mockResolvedValueOnce({ data: rawSummaryRows, error: null })
    const { data, error } = await getListingReviewSummary('list-1')
    expect(error).toBeNull()
    expect(data).toEqual({ reviewCount: 3, averageRating: 4.33 })
    expect(reviewMocks.rpc).toHaveBeenCalledWith('listing_review_summary', { p_listing_id: 'list-1' })
  })

  it('normalizes the seller aggregate from the table-returning wire shape', async () => {
    reviewMocks.rpc.mockResolvedValueOnce({ data: rawSummaryRows, error: null })
    const { data, error } = await getSellerReviewSummary('seller-1')
    expect(error).toBeNull()
    expect(data).toEqual({ reviewCount: 3, averageRating: 4.33 })
    expect(reviewMocks.rpc).toHaveBeenCalledWith('seller_review_summary', { p_seller_id: 'seller-1' })
  })

  it('keeps tolerating a bare single-row object response', async () => {
    reviewMocks.rpc.mockResolvedValueOnce({ data: rawSummaryRows[0], error: null })
    const { data, error } = await getSellerReviewSummary('seller-1')
    expect(error).toBeNull()
    expect(data).toEqual({ reviewCount: 3, averageRating: 4.33 })
  })

  it('returns null (not a fake zero) when the summary RPC returns zero rows', async () => {
    reviewMocks.rpc.mockResolvedValueOnce({ data: [], error: null })
    const { data, error } = await getListingReviewSummary('list-1')
    expect(error).toBeNull()
    expect(data).toBeNull()
  })

  it('surfaces an RPC failure instead of pretending there are zero reviews', async () => {
    reviewMocks.rpc.mockResolvedValueOnce({
      data: null,
      error: makePostgrestError('FORBIDDEN: no access', '42501'),
    })
    const { data, error } = await getSellerReviewSummary('seller-1')
    expect(data).toBeNull()
    expect(error?.code).toBe('FORBIDDEN')
  })

  it('normalizes the listing distribution', async () => {
    reviewMocks.rpc.mockResolvedValueOnce({
      data: [
        { rating_value: 5, review_count: 2 },
        { rating_value: 4, review_count: 1 },
      ],
      error: null,
    })
    const { data, error } = await getListingReviewDistribution('list-1')
    expect(error).toBeNull()
    expect(data).toEqual({ 5: 2, 4: 1 })
  })
})

describe('review lists', () => {
  it('fetches a page plus one sentinel to expose hasMore', async () => {
    reviewMocks.rpc.mockResolvedValueOnce({
      data: [rawReview, { ...rawReview, id: 'rev-2' }],
      error: null,
    })
    const { data, error } = await fetchListingReviews('list-1', 1, 1)
    expect(error).toBeNull()
    expect(data?.reviews).toHaveLength(1)
    expect(data?.reviews[0]?.reviewerName).toBe('Ana Test')
    expect(data?.reviews[0]?.listingTitle).toBe('Selkirk Amped Epic')
    expect(data?.hasMore).toBe(true)
    expect(reviewMocks.rpc).toHaveBeenCalledWith('listing_reviews', {
      p_listing_id: 'list-1',
      p_page: 1,
      p_page_size: 2,
    })
  })

  it('normalizes the seller review list', async () => {
    reviewMocks.rpc.mockResolvedValueOnce({ data: [rawReview], error: null })
    const { data, error } = await fetchSellerReviews('seller-1', 1, 5)
    expect(error).toBeNull()
    expect(data?.reviews[0]?.comment).toBe('Smooth paddle')
    expect(data?.hasMore).toBe(false)
    expect(reviewMocks.rpc).toHaveBeenCalledWith('seller_reviews', {
      p_seller_id: 'seller-1',
      p_page: 1,
      p_page_size: 6,
    })
  })
})

describe('getMyOrderReviews', () => {
  it('indexes reviewed items by order-item id for the current buyer', async () => {
    const node = {
      select: vi.fn(),
      eq: vi.fn(),
      then: undefined as unknown,
    }
    node.select.mockReturnValue(node)
    node.eq.mockReturnValue(node)
    node.then = (onFulfilled: (value: unknown) => unknown) =>
      Promise.resolve({
        data: [
          { order_item_id: 'item-1', id: 'rev-1' },
          { order_item_id: 'item-2', id: 'rev-2' },
        ],
        error: null,
      }).then(onFulfilled)

    reviewMocks.from.mockReturnValue(node)

    const result = await getMyOrderReviews('order-1', 'user-1')
    expect(result.error).toBeNull()
    expect(result.data).toEqual({ 'item-1': 'rev-1', 'item-2': 'rev-2' })
    expect(node.select).toHaveBeenCalledWith('order_item_id, id')
    expect(node.eq).toHaveBeenCalledWith('order_id', 'order-1')
    expect(node.eq).toHaveBeenCalledWith('reviewer_id', 'user-1')
  })
})

describe('seller-side review RPCs (auth-derived)', () => {
  it('getMySellerReviews calls the RPC with no seller_id param (auth-derived)', async () => {
    reviewMocks.rpc.mockResolvedValueOnce({ data: [rawReview], error: null })
    const { data, error } = await getMySellerReviews(1, 10, null, 'newest')
    expect(error).toBeNull()
    expect(data?.reviews).toHaveLength(1)
    expect(data?.reviews[0]?.listingId).toBe('list-1')
    expect(data?.reviews[0]?.listingImageUrl).toBeNull()
    expect(data?.hasMore).toBe(false)
    const args = reviewMocks.rpc.mock.calls[0]
    expect(args[0]).toBe('get_my_seller_reviews')
    expect(args[1]).not.toHaveProperty('p_seller_id')
    expect(args[1].p_page).toBe(1)
    expect(args[1].p_page_size).toBe(11)
    expect(args[1].p_rating).toBeNull()
    expect(args[1].p_sort).toBe('newest')
  })

  it('getMySellerReviews passes rating filter and sort', async () => {
    reviewMocks.rpc.mockResolvedValueOnce({ data: [], error: null })
    await getMySellerReviews(2, 5, 5, 'highest')
    const args = reviewMocks.rpc.mock.calls[0][1]
    expect(args.p_page).toBe(2)
    expect(args.p_page_size).toBe(6)
    expect(args.p_rating).toBe(5)
    expect(args.p_sort).toBe('highest')
  })

  it('getMySellerReviews detects hasMore via the +1 sentinel', async () => {
    reviewMocks.rpc.mockResolvedValueOnce({
      data: [rawReview, { ...rawReview, id: 'rev-2' }],
      error: null,
    })
    const { data } = await getMySellerReviews(1, 1)
    expect(data?.reviews).toHaveLength(1)
    expect(data?.hasMore).toBe(true)
  })

  it('getMySellerRatingSummary normalizes the table-returning wire shape', async () => {
    reviewMocks.rpc.mockResolvedValueOnce({ data: rawSummaryRows, error: null })
    const { data, error } = await getMySellerRatingSummary()
    expect(error).toBeNull()
    expect(data).toEqual({ reviewCount: 3, averageRating: 4.33 })
    expect(reviewMocks.rpc).toHaveBeenCalledWith('get_my_seller_rating_summary', {})
  })

  it('getMySellerRatingSummary returns null for a zero-row summary (truly no reviews)', async () => {
    reviewMocks.rpc.mockResolvedValueOnce({ data: [], error: null })
    const { data, error } = await getMySellerRatingSummary()
    expect(error).toBeNull()
    expect(data).toBeNull()
  })

  it('getMySellerRatingDistribution calls the RPC with no params', async () => {
    reviewMocks.rpc.mockResolvedValueOnce({
      data: [
        { rating_value: 5, review_count: 2 },
        { rating_value: 4, review_count: 1 },
      ],
      error: null,
    })
    const { data, error } = await getMySellerRatingDistribution()
    expect(error).toBeNull()
    expect(data).toEqual({ 5: 2, 4: 1 })
    expect(reviewMocks.rpc).toHaveBeenCalledWith('get_my_seller_rating_distribution', {})
  })
})

describe('CUSTOMER REVIEWS SUMMARY BUG REGRESSION — "No reviews yet" despite existing reviews', () => {
  it('BUG: 3 qualifying seller reviews are counted (not 0) because the wire shape is an array', async () => {
    reviewMocks.rpc.mockResolvedValueOnce({ data: [{ review_count: 3, average_rating: 4.7 }], error: null })
    const { data, error } = await getMySellerRatingSummary()
    expect(error).toBeNull()
    expect(data?.reviewCount).toBe(3)
    expect(data?.reviewCount).not.toBe(0)
  })

  it('BUG: ratings 5, 4, 5 produce an average of approximately 4.67', async () => {
    reviewMocks.rpc.mockResolvedValueOnce({ data: [{ review_count: 3, average_rating: 4.6666666667 }], error: null })
    const { data } = await getMySellerRatingSummary()
    expect(data?.reviewCount).toBe(3)
    expect((data?.averageRating ?? 0)).toBeGreaterThan(4.6)
    expect((data?.averageRating ?? 0)).toBeLessThan(4.7)
  })

  it('BUG: the distribution total matches the qualifying review count', async () => {
    reviewMocks.rpc.mockResolvedValueOnce({
      data: [
        { rating_value: 5, review_count: 2 },
        { rating_value: 4, review_count: 1 },
      ],
      error: null,
    })
    const distribution = await getMySellerRatingDistribution()
    const total = Object.values(distribution.data ?? {}).reduce((sum, n) => sum + n, 0)
    expect(total).toBe(3)
    expect(distribution.data).toEqual({ 5: 2, 4: 1 })
  })

  it('BUG: a failed summary RPC is an error, never proof of zero reviews', async () => {
    reviewMocks.rpc.mockResolvedValueOnce({
      data: null,
      error: makePostgrestError('UNKNOWN: upstream failure', 'P0001'),
    })
    const { data, error } = await getMySellerRatingSummary()
    expect(data).toBeNull()
    expect(error?.code).toBe('UNKNOWN')
  })

  it('BUG: seller review counts stay isolated across sellers', async () => {
    reviewMocks.rpc.mockResolvedValueOnce({ data: [{ review_count: 3, average_rating: 4.7 }], error: null })
    const sellerA = await getMySellerRatingSummary()
    reviewMocks.rpc.mockResolvedValueOnce({ data: [{ review_count: 1, average_rating: 5 }], error: null })
    const sellerB = await getMySellerRatingSummary()
    expect(sellerA.data?.reviewCount).toBe(3)
    expect(sellerB.data?.reviewCount).toBe(1)
    expect(sellerB.data?.reviewCount).not.toBe(3)
  })

  it('BUG: the summary count is the trusted total, not the current page length', async () => {
    reviewMocks.rpc.mockResolvedValueOnce({ data: [{ review_count: 20, average_rating: 4.6 }], error: null })
    const { data } = await getMySellerRatingSummary()
    expect(data?.reviewCount).toBe(20)
    expect(data?.reviewCount).not.toBe(10)
  })
})