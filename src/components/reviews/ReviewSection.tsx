import { useCallback, useEffect, useState } from 'react'
import RatingSummary from './RatingSummary'
import RatingDistribution from './RatingDistribution'
import ReviewList from './ReviewList'
import LoadingState from '../common/LoadingState'
import type { ReviewWithAuthor } from '../../features/reviews/reviews.types'
import { REVIEWS_PAGE_SIZE } from '../../features/reviews/reviews.types'
import {
  fetchListingReviews,
  getListingReviewDistribution,
  getListingReviewSummary,
} from '../../features/reviews/reviews.service'

interface ReviewSectionProps {
  listingId: string
}

/**
 * Community rating block for a listing: server-trusted aggregate summary,
 * an exact 5…1 distribution, and a paginated list of verified-purchase
 * reviews. No rating math is derived on the client.
 */
export default function ReviewSection({ listingId }: ReviewSectionProps) {
  const [summary, setSummary] = useState<{ count: number; average: number | null } | null>(null)
  const [distribution, setDistribution] = useState<Record<number, number>>({})
  const [reviews, setReviews] = useState<ReviewWithAuthor[]>([])
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    void Promise.all([
      getListingReviewSummary(listingId),
      getListingReviewDistribution(listingId),
      fetchListingReviews(listingId, 1, REVIEWS_PAGE_SIZE),
    ]).then(([summaryResult, distResult, listResult]) => {
      setLoading(false)
      if (summaryResult.error != null || distResult.error != null || listResult.error != null) {
        setError('We could not load the reviews. Please try again.')
        return
      }
      const sum = summaryResult.data
      setSummary({
        count: sum?.reviewCount ?? 0,
        average: sum?.averageRating ?? null,
      })
      setDistribution(distResult.data ?? {})
      setReviews(listResult.data?.reviews ?? [])
      setPage(1)
      setHasMore(listResult.data?.hasMore ?? false)
    })
  }, [listingId])

  useEffect(() => {
    load()
  }, [load])

  const loadMore = () => {
    const next = page + 1
    setLoadingMore(true)
    void fetchListingReviews(listingId, next, REVIEWS_PAGE_SIZE).then((result) => {
      setLoadingMore(false)
      if (result.error != null) return
      setReviews((prev) => [...prev, ...(result.data?.reviews ?? [])])
      setPage(next)
      setHasMore(result.data?.hasMore ?? false)
    })
  }

  if (loading) {
    return (
      <section className="review-section" aria-label="Ratings and reviews">
        <h2>Ratings &amp; reviews</h2>
        <LoadingState label="Loading reviews…" />
      </section>
    )
  }

  return (
    <section className="review-section glass glass--soft" aria-label="Ratings and reviews">
      <h2>Ratings &amp; reviews</h2>
      {error != null ? (
        <div className="review-section__error" role="alert">
          <p>{error}</p>
          <button type="button" className="btn btn--secondary btn--sm" onClick={load}>
            Try again
          </button>
        </div>
      ) : (
        <>
          <RatingSummary label="Product" rating={summary?.average ?? null} count={summary?.count ?? 0} />
          <div className="review-section__distribution">
            <RatingDistribution counts={distribution} total={summary?.count ?? 0} />
          </div>
          <ReviewList
            reviews={reviews}
            emptyTitle="No reviews yet"
            emptyBody="Be the first to review this item after your order is completed."
          />
          {hasMore ? (
            <div className="review-section__more">
              <button
                type="button"
                className="btn btn--secondary"
                disabled={loadingMore}
                onClick={loadMore}
              >
                {loadingMore ? 'Loading…' : 'Load more reviews'}
              </button>
            </div>
          ) : null}
        </>
      )}
    </section>
  )
}