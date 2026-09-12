import { useCallback, useEffect, useState } from 'react'
import RatingSummary from './RatingSummary'
import ReviewList from './ReviewList'
import LoadingState from '../common/LoadingState'
import type { ReviewWithAuthor } from '../../features/reviews/reviews.types'
import { REVIEWS_PAGE_SIZE } from '../../features/reviews/reviews.types'
import {
  fetchSellerReviews,
  getSellerReviewSummary,
} from '../../features/reviews/reviews.service'

interface SellerReviewsPanelProps {
  sellerId: string
}

/**
 * Public seller rating: aggregate seller_rating summary plus a paginated list
 * of approved reviews. Guests never see private buyer data.
 */
export default function SellerReviewsPanel({ sellerId }: SellerReviewsPanelProps) {
  const [summary, setSummary] = useState<{ count: number; average: number | null } | null>(null)
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
      getSellerReviewSummary(sellerId),
      fetchSellerReviews(sellerId, 1, REVIEWS_PAGE_SIZE),
    ]).then(([summaryResult, listResult]) => {
      setLoading(false)
      if (summaryResult.error != null || listResult.error != null) {
        setError('We could not load the seller reviews. Please try again.')
        return
      }
      const sum = summaryResult.data
      setSummary({ count: sum?.reviewCount ?? 0, average: sum?.averageRating ?? null })
      setReviews(listResult.data?.reviews ?? [])
      setPage(1)
      setHasMore(listResult.data?.hasMore ?? false)
    })
  }, [sellerId])

  useEffect(() => {
    load()
  }, [load])

  const loadMore = () => {
    const next = page + 1
    setLoadingMore(true)
    void fetchSellerReviews(sellerId, next, REVIEWS_PAGE_SIZE).then((result) => {
      setLoadingMore(false)
      if (result.error != null) return
      setReviews((prev) => [...prev, ...(result.data?.reviews ?? [])])
      setPage(next)
      setHasMore(result.data?.hasMore ?? false)
    })
  }

  if (loading) {
    return (
      <section className="seller-reviews" aria-label="Seller ratings and reviews">
        <h2>Seller reviews</h2>
        <LoadingState label="Loading seller reviews…" />
      </section>
    )
  }

  return (
    <section className="seller-reviews glass glass--soft" aria-label="Seller ratings and reviews">
      <h2>Seller reviews</h2>
      {error != null ? (
        <div className="review-section__error" role="alert">
          <p>{error}</p>
          <button type="button" className="btn btn--secondary btn--sm" onClick={load}>
            Try again
          </button>
        </div>
      ) : (
        <>
          <RatingSummary label="Seller" rating={summary?.average ?? null} count={summary?.count ?? 0} />
          <ReviewList
            reviews={reviews}
            emptyTitle="No reviews yet"
            emptyBody="This seller does not have any reviews yet."
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